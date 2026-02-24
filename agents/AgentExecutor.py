import asyncio
import logging
from typing import Any, Dict, Optional, List
import uuid
import re
import json
from fastapi import WebSocket
from agents.MainAgent import MainAgent
from llm.base import LLMClient, TextResult, ToolDescriptor,ToolAction, ToolCall,AgentThinkingBlock, ToolArgsChunk,MetadataBlock
from llm.context_manager.base import ContextManager
from llm.message_history import MessageHistory
from lab.base import AgentImplOutput, AgentPlugin
from lab.tool_manager import AgentToolManager
from utilss.constants import COMPLETE_MESSAGE
from lab.impotantutils import encode_image
from utilss.workspace_manager import WorkspaceManager
from EvenInfo.event import RealtimeEvent, EventType
from Mongodb.db import DatabaseManager
from enum import Enum
import os
from agents.TodoTrackingSystem import TodoListManager
from agents.TokenTracker import LocalTokenizer
from agents.helper import _scavenge_json_objects
class LogLevel(Enum):
    """Enum for different log separation types."""
    USER_INPUT = "USER_INPUT"
    NEW_TURN = "NEW_TURN"

# Constants for better maintainability
TOOL_RESULT_INTERRUPT_MESSAGE = "Tool execution interrupted by user."
AGENT_INTERRUPT_MESSAGE = "Agent interrupted by user."
TOOL_CALL_INTERRUPT_FAKE_MODEL_RSP = (
    "Tool execution interrupted by user. You can resume by providing a new instruction."
)
AGENT_INTERRUPT_FAKE_MODEL_RSP = (
    "Agent interrupted by user. You can resume by providing a new instruction."
)


class AgentExecutor(MainAgent):
    """
    A general agent that can accomplish tasks and answer questions with full streaming support.
    """
    
    name = "general_agent"
    description = """\
    A general agent that can accomplish tasks and answer questions.
    If you are faced with a task that involves more than a few steps, or
    if the task is complex, break it down into smaller manageable steps.
    """
    
    input_schema = {
        "type": "object",
        "properties": {
            "instruction": {
                "type": "string",
                "description": "The instruction to the agent.",
            },
        },
        "required": ["instruction"],
    }
    
    def __init__(
        self,
        system_prompt: str,
        client: LLMClient,
        tools: List[AgentPlugin],
        message_queue: asyncio.Queue,
        logger_for_agent_logs: logging.Logger,
        context_manager: ContextManager,
        workspace_manager: WorkspaceManager,
        agent_mode: str,
        max_output_tokens_per_turn: int = 8192,
        max_turns: int = 20,
        websocket: Optional[WebSocket] = None,
        session_id: Optional[uuid.UUID] = None,
        user_id: Optional[uuid.UUID] = None,
        last_model_token_info = None,
        db_manager: Optional[DatabaseManager] = None,
        embedding_provider: Optional['EmbeddingProvider'] = None,
    ):
        super().__init__()
        
        # Core components
        self.system_prompt = system_prompt
        self.client = client
        self.context_manager = context_manager
        self.workspace_manager = workspace_manager
        self.partial_tool_calls: Dict[str, Dict[str, Any]] = {}
        self.seen_stream_ids = set()
        self.agent_mode = agent_mode
        # Tool management
        self.tool_manager = AgentToolManager(
            tools=tools,
            logger_for_agent_logs=logger_for_agent_logs,
        )
        
        # Configuration
        self.max_output_tokens = max_output_tokens_per_turn
        self.max_turns = max_turns
        
        # State management
        self.user_id = user_id
        self.session_id = session_id
        self.interrupted = False
        self.history = MessageHistory()
        
        # Communication
        self.message_queue = message_queue
        self.websocket = websocket
        self.logger_for_agent_logs = logger_for_agent_logs
        self.last_model_token_info = last_model_token_info

        # Cumulative token tracking
        self.cumulative_input_tokens = 0
        self.cumulative_output_tokens = 0
        self.cumulative_total_tokens = 0
                
        self.cumulative_embedding_tokens = 0
        self.cumulative_embedding_cost = 0.0
        self.embedding_provider = embedding_provider
    
        self.todo_manager = TodoListManager(
            workspace_path_fn=self.workspace_manager.workspace_path,
            logger=self.logger_for_agent_logs
        )

        self.tokenizer = LocalTokenizer(model_name="gpt-4")
        self.local_input_tokens = 0
        self.local_output_tokens = 0


        self.todo_tracking_enabled = False
        self.tools_since_last_check = 0
        
        # Initialize with default checkpoint turn tracking
        self.last_checkpoint_turn = 0  # ✅ ADD THIS LINE
        
        self.todo_tracking_enabled = False
        self.tools_since_last_check = 0

        self.is_task_paused = False  # Track if we paused for budget
        self.paused_task_context = None  # Store context of paused task
        
        # Database
        if db_manager is None:
            raise ValueError("DatabaseManager instance is required")
        self.mongodb_manager = db_manager
        
        # Message processing task
        self.message_processing_task = None
        self._processing_lock = asyncio.Lock()

        self.tool_budget = self._calculate_tool_budget(system_prompt)
        self.checkpoint_interval = 4  # Force checkpoint every 4 tools
        self.warning_thresholds = [0.5, 0.75, 0.9]  # 50%, 75%, 90%
        self.warnings_sent = set()

        self.plan_enforced = False
        self.last_plan_check_turn = 0
        self.plan_drift_warnings = 0

    def _has_active_todo(self) -> bool:
        """Check if there's an active TODO file with incomplete tasks"""
        todo_path = self.workspace_manager.workspace_path("todo.md")
        if not os.path.exists(todo_path):
            return False
        
        try:
            with open(todo_path, 'r') as f:
                content = f.read()
            
            total_tasks = content.count('- [')
            completed_tasks = content.count('- [x]') + content.count('- [X]')
            
            # If there are uncompleted tasks, consider it active
            return total_tasks > 0 and completed_tasks < total_tasks
        except Exception as e:
            self.logger_for_agent_logs.warning(f"Failed to check TODO status: {e}")
            return False

    def _accumulate_tool_args_chunk(self, chunk: ToolArgsChunk):
        """Accumulate tool argument chunks for reconstruction"""
        tool_call_id = chunk.tool_call_id
        
        if tool_call_id not in self.partial_tool_calls:
            self.partial_tool_calls[tool_call_id] = {
                'tool_name': chunk.tool_name,
                'tool_call_id': tool_call_id,
                'args_buffer': '',
                'complete': False
            }
        
        self.partial_tool_calls[tool_call_id]['args_buffer'] += chunk.content
    
    def _finalize_partial_tool_calls(self) -> List[ToolCall]:

        finalized_calls = []
        
        self.logger_for_agent_logs.info(
            f"🔧 Attempting to finalize {len(self.partial_tool_calls)} partial tool calls"
        )
        
        for tool_call_id, data in self.partial_tool_calls.items():
            if data.get('complete'):
                continue
            
            args_buffer = data['args_buffer'].strip()
            tool_name = data['tool_name']
            
            if not args_buffer:
                continue
            
            self.logger_for_agent_logs.info(
                f"🔍 Scavenging {tool_name}: buffer length {len(args_buffer)}"
            )
            
            try:
                found_objects = _scavenge_json_objects(args_buffer)
                
                if found_objects:
                    self.logger_for_agent_logs.info(f"✅ Scavenged {len(found_objects)} objects for {tool_name}")
                    
                    for i, tool_input in enumerate(found_objects):
                        # Handle IDs for multiple objects found in one stream
                        current_id = tool_call_id if i == 0 else f"{tool_call_id}_rescued_{i}"
                        
                        finalized_calls.append(ToolCall(
                            tool_call_id=current_id,
                            tool_name=tool_name,
                            tool_input=tool_input
                        ))
                    
                    # Mark as complete so we don't trigger error later
                    data['complete'] = True
                    continue
            except Exception as e:
                self.logger_for_agent_logs.error(f"Scavenger failed for {tool_name}: {e}")
            
            # Strategy 2: JSON repair
            try:
                repaired = self._repair_json(args_buffer)
                if repaired:
                    tool_input = json.loads(repaired)
                    
                    finalized_call = ToolCall(
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        tool_input=tool_input
                    )
                    finalized_calls.append(finalized_call)
                    data['complete'] = True
                    
                    self.logger_for_agent_logs.info(
                        f"✅ Strategy 2 SUCCESS (repair): {tool_name}"
                    )
                    continue
            except json.JSONDecodeError as e:
                self.logger_for_agent_logs.warning(
                    f"Strategy 2 failed for {tool_name}: {e}"
                )
            
            # Strategy 3: Manual extraction
            try:
                extracted = self._extract_params_manually(args_buffer)
                if extracted:
                    finalized_call = ToolCall(
                        tool_call_id=tool_call_id,
                        tool_name=tool_name,
                        tool_input=extracted
                    )
                    finalized_calls.append(finalized_call)
                    data['complete'] = True
                    
                    self.logger_for_agent_logs.info(
                        f"✅ Strategy 3 SUCCESS (manual): {tool_name} with {len(extracted)} params"
                    )
                    continue
            except Exception as e:
                self.logger_for_agent_logs.error(
                    f"Strategy 3 failed for {tool_name}: {e}"
                )
            
            # All strategies failed
            self.logger_for_agent_logs.error(
                f"❌ ALL STRATEGIES FAILED for {tool_name}\n"
                f"Buffer preview: {args_buffer[:200]}..."
            )
        
        return finalized_calls
    
    
    def _repair_json(self, json_str: str) -> Optional[str]:
        """
        Attempt to repair malformed JSON from streaming
        """
        original = json_str
        
        # Remove markdown code blocks
        json_str = re.sub(r'```(?:json)?\s*', '', json_str)
        json_str = json_str.strip()
        
        # Close unclosed braces/brackets
        open_braces = json_str.count('{') - json_str.count('}')
        open_brackets = json_str.count('[') - json_str.count(']')
        
        if open_braces > 0:
            json_str += '}' * open_braces
        if open_brackets > 0:
            json_str += ']' * open_brackets
        
        # Remove trailing commas
        json_str = re.sub(r',\s*}', '}', json_str)
        json_str = re.sub(r',\s*]', ']', json_str)
        
        # Fix incomplete strings (common in streaming)
        # If we have an odd number of quotes, add one at the end
        quote_count = json_str.count('"') - json_str.count('\\"')
        if quote_count % 2 != 0:
            # Find the last quote and see if it's part of a key or value
            last_quote_pos = json_str.rfind('"')
            if last_quote_pos > 0:
                # Check what comes after
                after = json_str[last_quote_pos + 1:].strip()
                if after and after[0] in ':,}]':
                    # Quote was properly closed
                    pass
                else:
                    # Need to close the string
                    json_str += '"'
        
        # Try to parse
        try:
            json.loads(json_str)
            return json_str
        except json.JSONDecodeError:
            return None
     
    def _extract_params_manually(self, buffer: str) -> Optional[Dict[str, Any]]:
        """
        Manually extract key-value pairs when JSON parsing fails
        """
        params = {}
        
        # Pattern: "key": "value" or "key": value or "key":value
        patterns = [
            r'"([^"]+)"\s*:\s*"([^"]*)"',  # "key": "value"
            r'"([^"]+)"\s*:\s*(\d+\.?\d*)',  # "key": 123
            r'"([^"]+)"\s*:\s*(true|false|null)',  # "key": true/false/null
            r'"([^"]+)"\s*:\s*\[(.*?)\]',  # "key": [array]
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, buffer, re.IGNORECASE)
            for match in matches:
                if len(match) == 2:
                    key, value = match
                    
                    # Type conversion
                    if value.lower() == 'true':
                        params[key] = True
                    elif value.lower() == 'false':
                        params[key] = False
                    elif value.lower() == 'null':
                        params[key] = None
                    elif value.replace('.', '').replace('-', '').isdigit():
                        params[key] = float(value) if '.' in value else int(value)
                    else:
                        params[key] = value
        
        return params if params else None
    
    def _extract_from_metadata(self, metadata: Optional[dict]) -> List[ToolCall]:
        """
        Enhanced metadata extraction with better error handling
        """
        if not metadata:
            return []
        
        reconstructed = []
        
        try:
            # OpenAI-style response
            if 'raw_response' in metadata:
                raw = metadata['raw_response']
                
                if hasattr(raw, 'choices') and raw.choices:
                    msg = raw.choices[0].message
                    
                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                        self.logger_for_agent_logs.info(
                            f"🔧 Found {len(msg.tool_calls)} tool calls in metadata"
                        )
                        
                        for tc in msg.tool_calls:
                            try:
                                # Parse arguments
                                args_str = tc.function.arguments
                                if isinstance(args_str, str):
                                    args = json.loads(args_str)
                                else:
                                    args = args_str
                                
                                tool_call = ToolCall(
                                    tool_call_id=tc.id,
                                    tool_name=tc.function.name,
                                    tool_input=args
                                )
                                reconstructed.append(tool_call)
                                
                                self.logger_for_agent_logs.info(
                                    f"✅ Extracted from metadata: {tc.function.name}"
                                )
                                
                            except Exception as e:
                                self.logger_for_agent_logs.error(
                                    f"Failed to parse tool call from metadata: {e}"
                                )
            
            # Alternative: direct tool_calls in metadata
            elif 'tool_calls' in metadata:
                for tc_dict in metadata['tool_calls']:
                    try:
                        tool_call = ToolCall(
                            tool_call_id=tc_dict.get('id', f"meta-{uuid.uuid4()}"),
                            tool_name=tc_dict['function']['name'],
                            tool_input=json.loads(tc_dict['function']['arguments'])
                        )
                        reconstructed.append(tool_call)
                    except Exception as e:
                        self.logger_for_agent_logs.error(
                            f"Failed to extract from metadata dict: {e}"
                        )
        
        except Exception as e:
            self.logger_for_agent_logs.error(
                f"Metadata extraction error: {e}", exc_info=True
            )
        
        return reconstructed

    def _is_resume_keyword(self, instruction: str) -> bool:
        """Detect if user is trying to resume with common keywords."""
        instruction_lower = instruction.lower().strip()
        
        # Explicit resume keywords
        resume_keywords = [
            'continue', 'resume', 'keep going', 'go ahead', 
            'proceed', 'carry on', 'go on', 'next', 'yes','continue please', 'please continue','resume please','please resume'
        ]
        
        # Short affirmative responses
        if instruction_lower in resume_keywords:
            return True
        
        # Phrases that indicate continuation
        continuation_patterns = [
            'continue with', 'keep working on', 'proceed with',
            'go ahead with', 'carry on with', 'continue working',
            'please continue', 'please proceed','keep working on', 'finish the'
        ]
        
        return any(instruction_lower.startswith(phrase) for phrase in continuation_patterns)
    
    def _is_task_modification(self, instruction: str) -> bool:
        """Detect if user is modifying the existing task."""
        instruction_lower = instruction.lower()
        
        modification_keywords = [
            'also', 'additionally', 'add', 'include',
            'but', 'however', 'with', 'and', 'plus',
            'change', 'modify', 'update', 'adjust'
        ]
        
        return any(kw in instruction_lower for kw in modification_keywords)
    
    def _should_resume_task(self, instruction: str, resume_flag: bool) -> tuple[bool, str]:
        """
        SMART DETECTION: Only resume if user EXPLICITLY signals continuation.
        Default to NEW TASK unless clear resume intent detected.
        """
        has_active_todo = self._has_active_todo()
        instruction_lower = instruction.lower().strip()
        word_count = len(instruction.split())
        
        # RULE 1: EXPLICIT RESUME KEYWORDS (highest priority)
        if self._is_resume_keyword(instruction):
            if has_active_todo:
                if self.todo_manager.initialize():
                    self.todo_tracking_enabled = True
                    self.plan_enforced = True
                    self.logger_for_agent_logs.info("✅ Resuming from existing TODO")
                return True, "explicit_resume_with_todo"
            elif self.is_task_paused:
                return True, "resume_from_pause"
            else:
                self.logger_for_agent_logs.warning("User said 'continue' but no active task found")
                return False, "invalid_resume_request"
        
        # RULE 2: TASK MODIFICATION (add/change to existing task)
        if self._is_task_modification(instruction) and has_active_todo:
            if self.todo_manager.initialize():
                self.todo_tracking_enabled = True
                self.plan_enforced = True
            return False, "new_task_detected"
        
        # RULE 3: NEW TASK DETECTION (default behavior)
        new_task_indicators = [
            'create', 'build', 'make', 'generate', 'write', 'develop',
            instruction_lower.startswith(('what', 'how', 'why', 'when', 'who', 'where')),
            word_count > 10,
        ]
        
        if any(new_task_indicators):
            self.logger_for_agent_logs.info(f"🆕 New task detected: '{instruction[:50]}...'")
            return False, "new_task_detected"
        
        # RULE 4: SHORT AMBIGUOUS INPUTS
        if word_count <= 3 and has_active_todo and not instruction.endswith('?'):
            if self.todo_manager.initialize():
                self.todo_tracking_enabled = True
                self.plan_enforced = True
            return True, "short_continuation"
        
        # DEFAULT: NEW TASK
        return False, "default_new_task"
    
    async def _process_messages(self):
        """
        Process messages from the message queue for DB and WebSocket.
        This loop now waits for a `None` sentinel to exit gracefully.
        """
        self.logger_for_agent_logs.info("Message processing background task started.")
        while True:
            try:
                message: Optional[RealtimeEvent] = await self.message_queue.get()
                if message is None:
                    self.logger_for_agent_logs.info("Shutdown signal received, exiting message processor.")
                    self.message_queue.task_done()
                    break

                try:
                    if message.type == EventType.STREAMING_TOKEN or message.type == EventType.TOOL_ARGS_STREAM or message.type == EventType.AGENT_THINKING:
                        await self._send_to_websocket(message)
                    else:
                        await self._save_event_to_database(message)
                        await self._send_to_websocket(message)
                except Exception as e:
                    self.logger_for_agent_logs.error(f"Error processing message: {str(e)}", exc_info=True)
                finally:
                    # ✅ ALWAYS call task_done(), even if processing fails
                    self.message_queue.task_done()
                
            except asyncio.CancelledError:
                self.logger_for_agent_logs.info("Message processing was cancelled.")
                break
            except Exception as e:
                self.logger_for_agent_logs.error(f"Error processing message: {str(e)}", exc_info=True)
                if not self.message_queue.empty():
                    self.message_queue.task_done()

    def _reset_todo_tracking(self):
        """Reset TODO tracking state and optionally remove old todo file."""
        self.todo_tracking_enabled = False
        self.tools_since_last_check = 0
        self.last_checkpoint_turn = 0
        self.plan_enforced = False
        self.last_plan_check_turn = 0
        self.plan_drift_warnings = 0
        
        # Clear saved state
        todo_path = self.workspace_manager.workspace_path("todo.md")
        if os.path.exists(todo_path):
            try:                
                os.remove(todo_path)
                self.logger_for_agent_logs.info("📋 Removed completed TODO file")
            except Exception as e:
                self.logger_for_agent_logs.warning(f"Failed to handle TODO file: {e}")
                 
    async def _save_event_to_database(self, message: RealtimeEvent):
        """Save event to database."""
        if self.session_id and self.user_id:
            try:
                await self.mongodb_manager.save_event(self.session_id, self.user_id, message)
            except Exception as e:
                self.logger_for_agent_logs.error(f"Failed to save event to database: {str(e)}")
        else:
            self.logger_for_agent_logs.debug(f"No session/user ID, skipping event save: {message.type}")

    async def _send_to_websocket(self, message: RealtimeEvent):
        """Send non-streaming events to WebSocket."""
        if message.type != EventType.USER_MESSAGE and self.websocket is not None:
            try:
                await self.websocket.send_json(message.model_dump())
            except Exception as e:
                self.logger_for_agent_logs.warning(f"WebSocket send failed, disabling: {str(e)}")
                self.websocket = None

    def _validate_tool_parameters(self) -> List[ToolDescriptor]:
        """Validate tool parameters and check for duplicates."""
        tool_params = [tool.get_tool_param() for tool in self.tool_manager.get_tools()]
        tool_names = [tool.name for tool in tool_params]
        if len(set(tool_names)) != len(tool_names):
            raise ValueError(f"Duplicate tool names found: {tool_names}")
        return tool_params

    def _should_inject_checkpoint(self, consecutive_tools: int) -> bool:
        """Check if we should inject a checkpoint."""
        return consecutive_tools > 0 and consecutive_tools % self.checkpoint_interval == 0
    
    def _should_send_warning(self, consecutive_tools: int) -> Optional[str]:
        """Check if we should send a tool usage warning."""
        usage_ratio = consecutive_tools / self.tool_budget
        
        for threshold in self.warning_thresholds:
            if usage_ratio >= threshold and threshold not in self.warnings_sent:
                self.warnings_sent.add(threshold)
                remaining = self.tool_budget - consecutive_tools
                return f"Tool usage warning: {consecutive_tools}/{self.tool_budget} tools used. {remaining} remaining. Please prioritize completing the current task."
        return None
    
    def _inject_checkpoint_message(self, consecutive_tools: int) -> str:
        """Create checkpoint message for agent."""
        return f"""
        CHECKPOINT ({consecutive_tools} tools used): 
        Please provide a brief summary of what you've accomplished so far and your next 2-3 planned steps. 
        This helps ensure we're making progress toward the final goal.
        After you've done that, please proceed with the next action to continue making progress towards the final goal.
        """
    
    async def _handle_smart_recovery(self, consecutive_tools: int) -> tuple[AgentImplOutput, Any]:

        """Handle smart recovery when tool limit is reached."""
        recovery_prompt = f"""
        You've used {consecutive_tools} tools and reached the limit. Please provide:
        1. Summary of what you've accomplished
        2. Current state of the application/task
        3. Any files created or modified
        4. Next steps if the user wants to continue
        
        Deliver what you have completed so far, even if the task isn't 100% finished.
        """
        
        # Add recovery prompt as user message
        self.history.add_user_prompt(recovery_prompt)
        
        # Send recovery event
        await self._send_message_to_queue(
            RealtimeEvent(
                type=EventType.AGENT_RESPONSE, 
                content={"text": "Reached tool limit. Summarizing progress and delivering current state..."}
            )
        )
        # Return None to continue the loop with recovery prompt
        return None, None
    
    def _is_complex_task(self,instruction: str, return_level: bool = False):
        """
        Detect task complexity for research, learning, business, or marketing instructions.
        
        Returns:
            - bool: True if task is complex (requires TODO / planning)
            - optional int level: 0 = simple, 1 = mid, 2 = advanced
        """
        if self.agent_mode == "normal":
            return 0
        elif self.agent_mode == "general":
            return 1
        else:
            return 0
    
        
    def _extract_user_request(self, instruction: str) -> str:
        user_request_pattern = r'User request:\s*(.+?)(?:\n|$)'
        match = re.search(user_request_pattern, instruction, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            self.logger_for_agent_logs.info(f"📝 Extracted user request: '{extracted}'")
            return extracted
        
        request_pattern = r'Request:\s*(.+?)(?:\n|$)'
        match = re.search(request_pattern, instruction, re.IGNORECASE)
        if match:
            extracted = match.group(1).strip()
            self.logger_for_agent_logs.info(f"📝 Extracted request: '{extracted}'")
            return extracted

        if '{' in instruction and '}' in instruction:
            lines = instruction.split('\n')
            # Find last line that doesn't look like JSON
            for line in reversed(lines):
                cleaned = line.strip()
                if cleaned and not cleaned.startswith('{') and not cleaned.startswith('}'):
                    if not any(keyword in cleaned.lower() for keyword in ['context:', 'whiteboard content:', 'shapes:', 'viewport:']):
                        self.logger_for_agent_logs.info(f"📝 Extracted from JSON context: '{cleaned}'")
                        return cleaned
        
        fallback = instruction[:200].strip()
        self.logger_for_agent_logs.info(f"📝 Using fallback extraction: '{fallback[:50]}...'")
        return fallback

    def _safe_inject_user_message(self, message: str, force: bool = False) -> bool:
        """
        ⭐ NEW: Safely inject user message only when state allows it.
        Returns True if injected, False if skipped.
        """
        # Check if we can add a user message
        if not self.history.is_next_turn_user():
            if force:
                # Add empty assistant turn to fix state
                self.logger_for_agent_logs.warning(
                    "Forcing user message injection by adding empty assistant turn"
                )
                self.history.add_assistant_turn([TextResult(text="")])
            else:
                self.logger_for_agent_logs.warning(
                    f"Skipping user message injection - wrong state. Message: {message[:100]}"
                )
                return False
        
        self.history.add_user_prompt(message)
        self.local_input_tokens += self.tokenizer.count_tokens(message)
        return True
    
    def _estimate_task_complexity(self, instruction: str, files: List[str]) -> str:
        """Classify for research/business/learning contexts."""
        
        instruction_lower = instruction.lower()
        word_count = len(instruction.split())
        
        # SIMPLE: Quick factual queries
        if word_count < 15 and len(files) == 0:
            simple_indicators = ['what', 'who', 'when', 'define', 'explain']
            if any(ind in instruction_lower[:20] for ind in simple_indicators):
                return 'simple'
        
        # COMPLEX: Multi-phase research/campaigns
        complex_indicators = [
            'complete', 'thorough',
            'end-to-end', 'entire', 'all aspects',
            'market research', 'competitive landscape',
            'complete strategy', 'full campaign'
        ]
        if any(ind in instruction_lower for ind in complex_indicators):
            return 'complex'
        
        # COMPLEX: Multiple data sources
        if len(files) > 3:
            return 'complex'
        
        # MEDIUM: Standard research/analysis tasks
        return 'medium'

    def _enforce_plan_creation(self, instruction: str) -> str:
        """SIMPLIFIED plan enforcement with TODO tracking initialization."""
        todo_path = self.workspace_manager.workspace_path("todo.md")
        
        if os.path.exists(todo_path):
                # Get current task
                current_task = self.todo_manager.get_strict_guidance_message()
                if current_task:
                    return current_task
            
                 # Fallback: plan exists but couldn't parse
                return f"Resume working on the task plan in {todo_path}"
        
        # Create new plan
        return f"""🎯 TASK PLANNING REQUIRED
        NOW CREATE YOUR PLAN FOR: {instruction}
        """

    async def _auto_update_todo_progress(self, tool_name: str, tool_input: dict, tool_result: str) -> None:  
        if not self.todo_tracking_enabled:
            return
        
        # ✅ Version 1 does real-time verification INSIDE this call
        self.todo_manager.record_tool_execution(tool_name, tool_input, tool_result)
        
        current_item = self.todo_manager.get_current_item()
        if not current_item:
            return
        
        # ✅ CHECK: Did Version 1 detect task completion?
        if current_item.all_deliverables_satisfied():
            self.logger_for_agent_logs.info(
                f"🎉 Task {current_item.index} auto-detected as complete by real-time verification!"
            )
            
  
            # ✅ Mark complete and move to next task
            self.todo_manager.mark_current_complete()
            self.tools_since_last_check = 0
            
            # ✅ Check if more tasks exist
            next_item = self.todo_manager.get_current_item()

        else:
            # ✅ Task not complete yet - increment counter for periodic guidance
            self.tools_since_last_check += 1
            
            # Optional: Provide progress update every 3 tools
            if self.tools_since_last_check % 3 == 0:
                progress_msg = current_item.get_deliverable_status()
                self.logger_for_agent_logs.info(f"📊 Progress update:\n{progress_msg}")
                      
           
    async def _wait_for_file_sync(self, file_path: str, max_retries: int = 3):
        """Wait for file system to sync after write operations"""
        if not file_path:
            await asyncio.sleep(0.1)
            return
        
        full_path = self.workspace_manager.workspace_path(file_path)
        
        for i in range(max_retries):
            if os.path.exists(full_path):
                await asyncio.sleep(0.05)  # Small delay for final flush
                return
            await asyncio.sleep(0.1 * (i + 1))  # Progressive backoff
      
        self.logger_for_agent_logs.warning(f"File {file_path} not found after {max_retries} retries")

    def _calculate_tool_budget(self, instruction: str, complexity: str = None) -> int:
        """Adaptive budget based on task complexity."""
        if complexity is None:
            complexity = self._estimate_task_complexity(instruction, [])
        
        base_budgets = {
            'simple': 10,
            'medium': 25,
            'complex': 30
        }
        
        budget = base_budgets.get(complexity, 15)
        
        # Bonus for specific patterns
        high_effort_keywords = [
            'comprehensive', 'complete', 'full campaign',
            'end-to-end', 'entire', 'thorough'
        ]
        if any(kw in instruction.lower() for kw in high_effort_keywords):
            budget += 5
            self.logger_for_agent_logs.info(f"Budget bonus for high-effort task: +5")
        
        self.logger_for_agent_logs.info(f"Tool budget: {budget} ({complexity} task)")
        return budget

    
    async def start_message_processing(self) -> asyncio.Task:
        """Start the message processing task with proper state management."""
        async with self._processing_lock:
            # Always stop existing task first
            await self._stop_message_processing_internal()
            
            # Clear any remaining messages in queue
            while not self.message_queue.empty():
                try:
                    self.message_queue.get_nowait()
                    self.message_queue.task_done()
                except asyncio.QueueEmpty:
                    break
            
            # Start new task
            self.message_processing_task = asyncio.create_task(self._process_messages())
            self.logger_for_agent_logs.info("Started new message processing task")
            return self.message_processing_task

    async def _stop_message_processing_internal(self):
        """Internal method to stop message processing task."""
        if self.message_processing_task and not self.message_processing_task.done():
            try:
                # Send sentinel to gracefully shut down
                self.message_queue.put_nowait(None)
                # Wait for the task to complete
                await asyncio.wait_for(self.message_processing_task, timeout=2.0)
            except asyncio.TimeoutError:
                self.logger_for_agent_logs.warning("Message processing task didn't stop gracefully, cancelling")
                self.message_processing_task.cancel()
                try:
                    await self.message_processing_task
                except asyncio.CancelledError:
                    pass
            except Exception as e:
                self.logger_for_agent_logs.error(f"Error stopping message processing task: {e}")
            finally:
                self.message_processing_task = None

    async def stop_message_processing(self):
        """Gracefully stop the message processing task."""
        async with self._processing_lock:
            await self._stop_message_processing_internal()

    async def run_impl(self, tool_input: dict[str, Any], message_history: Optional[MessageHistory] = None) -> AgentImplOutput:
        """Main execution entry point for the agent."""
        self.cumulative_input_tokens = 0
        self.cumulative_output_tokens = 0
        self.cumulative_total_tokens = 0
        self.cumulative_embedding_tokens = 0
        self.cumulative_embedding_cost = 0.0

        if self.embedding_provider:
            self.embedding_provider.reset_stats()
            
        await self.start_message_processing()
        
        try:
            instruction, image_blocks = self._setup_initial_context(tool_input)
            self.history.add_user_prompt(instruction, image_blocks)
            self.interrupted = False
            result, model_token_info = await self._execute_conversation_loop()
            self.last_model_token_info = model_token_info

            # ✅ WAIT for all pending messages to process before stopping
            self.logger_for_agent_logs.info("Waiting for message queue to drain...")
            try:
                await asyncio.wait_for(self.message_queue.join(), timeout=10.0)
            except asyncio.TimeoutError:
                self.logger_for_agent_logs.warning("Message queue drain timeout")

            return result
            
        except Exception as e:
            error_msg = f"Critical error in agent execution: {str(e)}"
            self.logger_for_agent_logs.error(error_msg, exc_info=True)
            self.last_model_token_info = self.last_model_token_info or {}
            return AgentImplOutput(tool_output=error_msg, tool_result_message=error_msg)
        finally:
            await self.stop_message_processing()

    def _setup_initial_context(self, tool_input: dict[str, Any]) -> tuple[str, List[dict]]:
        instruction = tool_input["instruction"]
        files = tool_input.get("files", [])

        self.local_input_tokens += self.tokenizer.count_tokens(instruction)

        self._log_visual_separation(LogLevel.USER_INPUT)
        image_blocks = self._create_image_blocks(files)
        
        if files:
            instruction += self._build_file_list(files)
            # self.local_input_tokens += self.tokenizer.count_tokens(files)
            
        actual_user_request = self._extract_user_request(instruction)
        if self._is_complex_task(actual_user_request):
            self.plan_enforced = True
            self.logger_for_agent_logs.info("🎯 Complex task → Enforcing plan creation")
            
            todo_path = self.workspace_manager.workspace_path("todo.md")
            if os.path.exists(todo_path):
                self.todo_tracking_enabled = self.todo_manager.initialize()
                
                # ✅ Capture baselines immediately for existing plan
                if self.todo_tracking_enabled:
                    current_item = self.todo_manager.get_current_item()
                    if current_item and current_item.is_pending():
                        for deliverable in current_item.deliverables:
                            self.todo_manager.verification_engine.capture_baseline(deliverable)
                        self.logger_for_agent_logs.info("📸 Captured baselines for all deliverables")
            
            enhanced_instruction = self._enforce_plan_creation(instruction)
            return enhanced_instruction, image_blocks
        
                        
        
        return instruction, image_blocks
    
    def update_token_info(self, model_token_info: Optional[dict]):
        """Safely update cumulative token counts."""
        if model_token_info is None:
            return

        input_tokens = model_token_info.get("prompt_tokens", 0) or 0
        output_tokens = model_token_info.get("completion_tokens", 0) or 0
        total_tokens = model_token_info.get("total_tokens", 0) or 0
        self.cumulative_input_tokens += input_tokens
        self.cumulative_output_tokens += output_tokens
        self.cumulative_total_tokens += total_tokens
                
        self.logger_for_agent_logs.info(
            f"Turn Tokens - Input: {input_tokens}, Output: {output_tokens}, Total: {total_tokens}"
        )
        self.logger_for_agent_logs.info(
            f"Cumulative Tokens - Input: {self.cumulative_input_tokens}, Output: {self.cumulative_output_tokens}, Total: {self.cumulative_total_tokens}"
        )
    
    def _get_path_for_tool_stream(self, tool_call_id: str) -> str | None:
        return None
    
    def reset_for_new_turn(self):
        """Call this at the start of handling a new user query."""
        # ... reset other turn-specific state ...
        self.seen_stream_ids.clear()
        self.partial_tool_calls.clear()
        
    def _enforce_tool_against_plan(self, tool_name: str, tool_input: dict) -> tuple[bool, str]:
        """Minimal validation - just prevent infinite loops"""
        
        if not self.plan_enforced or not self.todo_tracking_enabled:
            return True, ""
        
        current_item = self.todo_manager.get_current_item()
        if not current_item:
            return True, ""
        
        # Only check for infinite loops
        if len(current_item.tools_used) >= 7:
            last_6 = current_item.tools_used[-7:]
            if all(t == tool_name for t in last_6):
                return False, f"⚠️ Try a different approach - you've used '{tool_name}' 6 times in a row"
        
        # Budget check
        if len(current_item.tools_used) >= 15:
            return False, f"⚠️ Complete this task - {len(current_item.tools_used)} tools used"
        
        return True, ""
    
    async def _execute_conversation_loop(self) -> tuple[AgentImplOutput, Any]:
        """Execute the main conversation loop with real-time streaming and TODO tracking."""
        self.reset_for_new_turn()
        turn_count = 0
        consecutive_tool_calls = 0
        noContentCount = 0
        expecting_checkpoint_response = False  
        errorTimes = 0
        MAX_CONSECUTIVE_ERROR = 3
        last_checkpoint_turn = 0 
    
        # ✅ Initialize TODO tracking if plan exists
        if self.plan_enforced and not self.todo_tracking_enabled:
            todo_path = self.workspace_manager.workspace_path("todo.md")
            if os.path.exists(todo_path):
                self.todo_tracking_enabled = self.todo_manager.initialize()
    
        while turn_count < self.max_turns:
            turn_count += 1
            self._log_visual_separation(LogLevel.NEW_TURN)
    
            try:
                all_tool_params = self._validate_tool_parameters()
                truncated_messages = self.context_manager.apply_truncation_if_needed(
                    self.history.get_messages_for_llm()
                )
                self.history.set_message_list(truncated_messages)
                prompt_tokens = self.tokenizer.count_tokens(self.system_prompt)
                self.local_input_tokens += prompt_tokens
                tools_str = str(all_tool_params)
                tool_def_tokens = self.tokenizer.count_tokens(tools_str)
                self.local_input_tokens += tool_def_tokens
                response_generator = self.client.generate(
                    messages=self.history.get_messages_for_llm(),
                    max_tokens=self.max_output_tokens,
                    tools=all_tool_params,
                    system_prompt=self.system_prompt,
                )
                self.partial_tool_calls.clear()
                full_text_content = ""
                valid_tool_calls = []
                current_turn_token_info = None
                chunk_count = 0
    
                await self._send_message_to_queue(
                    RealtimeEvent(type=EventType.STREAMING_TOKEN, content={"type": "start"})
                )
                async for chunk in response_generator:
                    chunk_count += 1
                    
                    if self.interrupted:
                        self.logger_for_agent_logs.info("Agent interrupted during streaming")
                        if full_text_content or valid_tool_calls:
                            partial_response = []
                            if full_text_content:
                                partial_response.append(TextResult(text=full_text_content))
                            if valid_tool_calls:
                                partial_response.extend(valid_tool_calls)
                            self.history.add_assistant_turn(partial_response)
                        break
    
                    if isinstance(chunk, TextResult):
                        full_text_content += chunk.text

                        chunk_tokens = self.tokenizer.count_tokens(chunk.text)
                        self.local_output_tokens += chunk_tokens

                        self.logger_for_agent_logs.debug(f"Added text content: {chunk.text[:50]}...")
                        if self.message_queue is not None:
                            await self._send_message_to_queue(
                                RealtimeEvent(
                                    type=EventType.STREAMING_TOKEN,
                                    content={"type": "token", "token": chunk.text}
                                )
                            )
                            
                    elif isinstance(chunk, AgentThinkingBlock):
                        await self._send_message_to_queue(
                            RealtimeEvent(
                                type=EventType.AGENT_THINKING,
                                content={"thought": chunk.content}
                            )
                        )
    
                    elif isinstance(chunk, ToolArgsChunk):
                        self._accumulate_tool_args_chunk(chunk)
                        await self._send_message_to_queue(
                            RealtimeEvent(
                                type=EventType.TOOL_ARGS_STREAM,
                                content={
                                    "token": chunk.content,
                                    "tool_name": chunk.tool_name,
                                    "tool_call_id": chunk.tool_call_id,
                                    "path": self._get_path_for_tool_stream(chunk.tool_call_id),
                                }
                            )
                        )
                        
                    elif isinstance(chunk, ToolCall):
                        self.logger_for_agent_logs.debug(f"Received tool call: {chunk.tool_name}")
                        if self._is_valid_tool_call(chunk):
                            valid_tool_calls.append(chunk)
                            if chunk.tool_call_id in self.partial_tool_calls:
                                self.partial_tool_calls[chunk.tool_call_id]['complete'] = True
                        else:
                            self.logger_for_agent_logs.warning(
                                f"Ignoring invalid tool call: {chunk.tool_name} with input: {chunk.tool_input}"
                            )
                            
                    elif isinstance(chunk, MetadataBlock):
                        current_turn_token_info = chunk.metadata
                        
                        # Extract tool calls from metadata if streaming didn't provide them
                        if chunk.metadata and 'raw_response' in chunk.metadata:
                            raw = chunk.metadata['raw_response']
                            
                            try:
                                if hasattr(raw, 'choices') and raw.choices:
                                    msg = raw.choices[0].message
                                    if hasattr(msg, 'tool_calls') and msg.tool_calls:
                                        self.logger_for_agent_logs.info(
                                            f"🔧 FOUND {len(msg.tool_calls)} TOOL CALLS IN METADATA!"
                                        )
                                        
                                        import json
                                        for tc in msg.tool_calls:
                                            args = json.loads(tc.function.arguments)
                                            
                                            tool_call = ToolCall(
                                                tool_call_id=tc.id,
                                                tool_name=tc.function.name,
                                                tool_input=args
                                            )
                                            
                                            self.logger_for_agent_logs.info(
                                                f"✅ Extracted: {tool_call.tool_name} with {len(args)} params"
                                            )
                                            
                                            if self._is_valid_tool_call(tool_call):
                                                valid_tool_calls.append(tool_call)
                            
                            except Exception as e:
                                self.logger_for_agent_logs.error(f"Tool extraction failed: {e}")
    
                    else:
                        self.logger_for_agent_logs.warning(
                            f"Received unexpected chunk type: {type(chunk)}"
                        )
                
                self.logger_for_agent_logs.info(
                    f"Streaming complete. Text: {len(full_text_content)} chars, "
                    f"Tool calls: {len(valid_tool_calls)}, Chunks: {chunk_count}"
                )
    
                if self.partial_tool_calls:
                    self.logger_for_agent_logs.warning(
                        f"⚠️ TOOL RECONSTRUCTION NEEDED: "
                        f"{len(self.partial_tool_calls)} partial calls, 0 complete calls"
                    )
                    
                    finalized = self._finalize_partial_tool_calls()
                    if finalized:
                        valid_tool_calls.extend(finalized)
                        self.logger_for_agent_logs.info(
                            f"✅ Finalized {len(finalized)} tool calls from chunks"
                        )
                failed_tools = [
                    data['tool_name'] for data in self.partial_tool_calls.values() 
                    if not data.get('complete')
                ]
                if failed_tools:
                    self.logger_for_agent_logs.error(f"❌ CRITICAL: Failed to execute tools: {failed_tools}")
                    
                    system_error_msg = (
                        f"\n\n[SYSTEM ERROR]: You attempted to use the tool(s) {failed_tools}, "
                        "but the connection was interrupted or the arguments were malformed. "
                        "THE ACTION WAS NOT EXECUTED. "
                        "You must retry the action immediately."
                    )
                    
                    # Append to full_text_content so it gets saved to history
                    full_text_content += system_error_msg
                    
                    # Send text update to UI so user sees the error
                    await self._send_message_to_queue(
                        RealtimeEvent(
                            type=EventType.AGENT_RESPONSE, 
                            content={"text": system_error_msg}
                        )
                    )   
                # Clear partial calls after successful processing
                self.partial_tool_calls.clear()

                if self.interrupted:
                    if full_text_content or valid_tool_calls:
                        if full_text_content:
                            partial_response = [TextResult(text=full_text_content)]
                            if valid_tool_calls:
                                partial_response.extend(valid_tool_calls)
                            if self.history.is_next_turn_assistant():
                                self.history.add_assistant_turn(partial_response)
                    
                    self.add_fake_assistant_turn(TOOL_CALL_INTERRUPT_FAKE_MODEL_RSP)
                    return AgentImplOutput(
                        tool_output=TOOL_RESULT_INTERRUPT_MESSAGE,
                        tool_result_message=TOOL_RESULT_INTERRUPT_MESSAGE,
                    ), None
                
                self.update_token_info(current_turn_token_info)
    
                model_response_for_history = []
                if full_text_content:
                    model_response_for_history.append(TextResult(text=full_text_content))
                
                if valid_tool_calls:
                    model_response_for_history.extend(valid_tool_calls)
                
                if model_response_for_history:
                    if self.history.is_next_turn_assistant():
                        try:
                            self.history.add_assistant_turn(model_response_for_history)
                        except ValueError as e:
                            self.logger_for_agent_logs.error(
                                f"Failed to add assistant turn: {e}. "
                                f"State: last_turn={self.history.get_last_turn_type()}, "
                                f"turn_count={self.history.get_turn_count()}"
                            )
                            
                            clarification_message = (
                                "I seem to have gotten into a confused state. "
                                "Could you please clarify what you'd like me to do next? "
                                "You can tell me to 'continue' or 'start a new task'."
                            )
                            
                            await self._send_message_to_queue(
                                RealtimeEvent(
                                    type=EventType.AGENT_RESPONSE,
                                    content={"text": clarification_message}
                                )
                            )
                            
                            await asyncio.sleep(0.2)
                            
                            return AgentImplOutput(
                                tool_output=clarification_message,
                                tool_result_message="Agent state error - awaiting clarification"
                            ), current_turn_token_info
                    else:
                        # Response to injected checkpoint/warning - don't add to history
                        self.logger_for_agent_logs.warning(
                            f"Skipping assistant turn - response to injected prompt. "
                            f"Last turn: {self.history.get_last_turn_type()}, "
                            f"Text: {len(full_text_content)}, Tools: {len(valid_tool_calls)}"
                        )
                        expecting_checkpoint_response = False
    
    
                if valid_tool_calls:
                    expecting_checkpoint_response = False
                    consecutive_tool_calls += 1
                    
                    tool_call_to_execute = valid_tool_calls[0]
                    

                    # ✅ Check plan drift (only after first tool which creates the plan)
                    if self.plan_enforced and self.todo_tracking_enabled and consecutive_tool_calls > 1:
                        aligned, warning_msg = self._enforce_tool_against_plan(
                            tool_call_to_execute.tool_name, 
                            tool_call_to_execute.tool_input
                        )
                        
                        if not aligned and warning_msg:
                            self.logger_for_agent_logs.warning(f"Plan drift: {warning_msg}")
                            
                            if self._safe_inject_user_message(warning_msg, force=True):
                                self.plan_drift_warnings += 1
                                
                                # Hard reset after 3 drift warnings
                                if self.plan_drift_warnings >= 3:
                                    hard_reset = self.todo_manager.get_strict_guidance_message()
                                    if hard_reset:
                                        self._safe_inject_user_message(hard_reset, force=True)
                                        self.plan_drift_warnings = 0
                                
                                expecting_checkpoint_response = True
                                continue
                    
                    
                    if self.todo_tracking_enabled and consecutive_tool_calls > 1:
                        current_item = self.todo_manager.get_current_item()
                        checkpoint_interval = 3 if (current_item and current_item.estimated_complexity >= 4) else 4
                        
                        should_check = (
                            consecutive_tool_calls % checkpoint_interval == 0 and 
                            turn_count - last_checkpoint_turn > 2
                        )
                        
                        if should_check:
                            plan_check = self.todo_manager.get_strict_guidance_message()
                            if plan_check:
                                self.logger_for_agent_logs.info("📋 TODO checkpoint")
                                
                                if self._safe_inject_user_message(plan_check, force=True):
                                    last_checkpoint_turn = turn_count
                                    expecting_checkpoint_response = True
                                    continue
    
                    # ✅ Tool budget warnings
                    warning_msg = self._should_send_warning(consecutive_tool_calls + 1)
                    if warning_msg:
                        if self._safe_inject_user_message(warning_msg, force=False):
                            expecting_checkpoint_response = True
                            continue
                    
                    # ✅ Tool budget limit
                    if consecutive_tool_calls > self.tool_budget:
                        return await self._handle_budget_limit_and_pause_for_human(consecutive_tool_calls)
                    
                    
                    if full_text_content:
                        await self._log_planning_step(full_text_content)
                    
                    # Mark task in progress on first tool
                    if self.todo_tracking_enabled and consecutive_tool_calls == 1:
                        self.todo_manager.mark_current_in_progress()
                    
                    await self._send_message_to_queue(
                        RealtimeEvent(
                            type=EventType.TOOL_CALL,
                            content={
                                "tool_call_id": tool_call_to_execute.tool_call_id,
                                "tool_name": tool_call_to_execute.tool_name,
                                "tool_input": tool_call_to_execute.tool_input,
                            },
                        )
                    )
    
                    try:
                        tool_result = await self._execute_tool_call(tool_call_to_execute)
                        self.logger_for_agent_logs.info(
                            f"🔧 Tool executed: {consecutive_tool_calls} total"
                        )
                        
                        # ✅ REAL-TIME TODO PROGRESS UPDATE (Version 1)
                        if self.todo_tracking_enabled and tool_result is not None:
                            await self._auto_update_todo_progress(
                                tool_call_to_execute.tool_name,
                                tool_call_to_execute.tool_input,
                                tool_result if isinstance(tool_result, str) else str(tool_result)
                            )
                        
                        # Check if tool indicated completion
                        if self.tool_manager.should_stop():
                            return await self._handle_tool_completion(), current_turn_token_info
                        
                        # Check for early return from tool
                        if tool_result is not None:
                            if isinstance(tool_result, tuple) and len(tool_result) == 2:
                                return tool_result, current_turn_token_info
                        
                        continue
                        
                    except Exception as tool_error:
                        error_message = f"Tool execution failed: {str(tool_error)}"
                        tool_action = ToolAction(
                            tool_call_id=tool_call_to_execute.tool_call_id,
                            tool_name=tool_call_to_execute.tool_name,
                            tool_input=tool_call_to_execute.tool_input
                        )
                        self.history.add_tool_call_results([tool_action], [error_message])
                        continue
                            
                else:
                    if expecting_checkpoint_response:
                        # Response to checkpoint/warning
                        expecting_checkpoint_response = False
                        if full_text_content:
                            self.logger_for_agent_logs.info(
                                f"Agent checkpoint response: {full_text_content[:100]}..."
                            )
                            continue
                        else:
                            self.logger_for_agent_logs.warning(
                                "Agent provided no response to checkpoint/warning"
                            )
                            noContentCount += 1
                            if noContentCount >= 3:
                                return await self._handle_max_turns_reached(
                                    "Agent stopped responding to prompts"
                                ), current_turn_token_info
                            continue
                    
                    # Reset tool counter when agent provides text instead of tools
                    consecutive_tool_calls = 0
                    
                    if self.todo_tracking_enabled and full_text_content:
                        current_item = self.todo_manager.get_current_item()
                        
                        if current_item and not current_item.is_complete():
                            self.logger_for_agent_logs.warning(
                                f"⚠️ Agent gave text response with incomplete task: {current_item.text[:50]}"
                            )
                            
                            # Detect if agent is planning vs completing
                            planning_keywords = [
                                'now let me', 'i will', 'next i', 'let me continue', 
                                "i'll", 'first i', 'then i', 'i can', 'i should'
                            ]
                            is_just_planning = any(
                                kw in full_text_content.lower() for kw in planning_keywords
                            )
                            
                            if is_just_planning:
                                # Redirect to action
                                self.logger_for_agent_logs.info(
                                    "📋 Agent is planning - redirecting to execution"
                                )
                                guidance = self.todo_manager.get_strict_guidance_message()
                                if guidance:
                                    action_prompt = (
                                        f"{guidance}\n\n"
                                        "⚠️ Stop planning and START EXECUTING. Use tools NOW."
                                    )
                                    if self._safe_inject_user_message(action_prompt, force=True):
                                        expecting_checkpoint_response = True
                                        continue
                            else:
                                # ✅ Check if task actually complete via deliverables
                                if current_item.all_deliverables_satisfied():
                                    # Task is complete!
                                    self.logger_for_agent_logs.info(
                                        f"✅ Task complete via deliverables"
                                    )
                                    self.todo_manager.mark_current_complete()
                                    
                                    # Check for next task
                                    next_item = self.todo_manager.get_current_item()
                                    if next_item:
                                        guidance = self.todo_manager.get_strict_guidance_message()
                                        if guidance:
                                            next_task_prompt = (
                                                f"✅ Previous task complete!\n\n{guidance}\n\n"
                                                f"**START IMMEDIATELY** - Use tools to begin this task NOW."
                                            )
                                            # ✅ Force injection and verify it succeeded
                                            injected = self._safe_inject_user_message(next_task_prompt, force=True)
                                            if injected:
                                                expecting_checkpoint_response = True
                                                self.logger_for_agent_logs.info("📋 Injected next task guidance")
                                                continue
                                            else:
                                                # ✅ FALLBACK: If injection failed, add as assistant thought
                                                self.logger_for_agent_logs.warning("Injection failed, using assistant message")
                                                self.history.add_assistant_turn([TextResult(text=next_task_prompt)])
                                                continue
                                    else:
                                        # All tasks complete!
                                        self.logger_for_agent_logs.info(
                                            "🎉 All TODO tasks complete"
                                        )
                                        completion_summary = self.todo_manager.get_completion_summary()
                                        final_message = f"{full_text_content}\n\n{completion_summary}"
                                        
                                        return await self._handle_task_completion(final_message), current_turn_token_info
                                else:
                                    # Task NOT complete
                                    status = current_item.get_deliverable_status()
                                    self.logger_for_agent_logs.warning(
                                        f"⚠️ Task incomplete:\n{status}"
                                    )
                                    
                                    # ✅ Extract specific missing sections
                                    missing_sections = []
                                    for deliverable in current_item.deliverables:
                                        for section in deliverable.required_sections:
                                            if section not in deliverable.sections_added:
                                                missing_sections.append((deliverable.filename, section))
                                    
                                    # ✅ Build actionable guidance
                                    if missing_sections:
                                        missing_details = "\n".join([
                                            f"  • Add '{section}' section to {filename}"
                                            for filename, section in missing_sections
                                        ])
                                        
                                        warning = (
                                            f"⚠️ Current task NOT complete: {current_item.text}\n\n"
                                            f"**Missing Required Sections:**\n{missing_details}\n\n"
                                            f"**Current Status:**\n{status}\n\n"
                                            f"**Next Action Required:**\n"
                                            f"Use str_replace_editor to add the missing section(s) to {missing_sections[0][0]}"
                                        )
                                    else:
                                        warning = (
                                            f"⚠️ Current task NOT complete: {current_item.text}\n\n"
                                            f"**Status:**\n{status}\n\n"
                                            "You provided text but didn't complete required deliverables. "
                                            "Use the appropriate tools to complete this task."
                                        )
                                    
                                    if self._safe_inject_user_message(warning, force=True):
                                        expecting_checkpoint_response = True
                                        continue
                    
                    if full_text_content:
                        if self.todo_tracking_enabled:
                            # Final check before exit
                            if self.todo_manager.is_all_complete():
                                self.logger_for_agent_logs.info(
                                    "✅ All TODO tasks complete, exiting"
                                )
                                
                                completion_summary = self.todo_manager.get_completion_summary()
                                final_message = f"{full_text_content}\n\n{completion_summary}"
                                
                                return await self._handle_task_completion(final_message), current_turn_token_info
                            else:
                                # Incomplete tasks remain
                                self.logger_for_agent_logs.error(
                                    "⚠️ Attempting to exit with incomplete tasks!"
                                )
                                
                                current_item = self.todo_manager.get_current_item()
                                if current_item:
                                    guidance = self.todo_manager.get_strict_guidance_message()
                                    if guidance:
                                        force_continue_prompt = (
                                            f"⚠️ Tasks remain incomplete.\n\n{guidance}"
                                        )
                                        if self._safe_inject_user_message(force_continue_prompt, force=True):
                                            expecting_checkpoint_response = True
                                            continue
                                
                                continue
                        else:
                            # No TODO tracking - normal exit
                            return await self._handle_task_completion(full_text_content), current_turn_token_info
                    else:
                        self.logger_for_agent_logs.warning(
                            f"No content from LLM (turn {turn_count}). "
                            f"Chunks: {chunk_count}, "
                            f"Messages: {len(self.history.get_messages_for_llm())}"
                        )

                        if not self.history.is_next_turn_user():
                            self.logger_for_agent_logs.warning("Fixing state: adding empty assistant turn")
                            self.history.add_assistant_turn([TextResult(text="")])
                        
                        noContentCount += 1

                        if noContentCount >= 2:
                            if self._diagnose_context_issues():
                                self.logger_for_agent_logs.info(
                                    "Context issues detected, attempting recovery"
                                )
                                if self._attempt_context_recovery():
                                    noContentCount = 0
                                    continue
                            
                            recovery_prompt = (
                                "I notice you haven't provided a response. Please either:\n"
                                "1. Continue with the next step using an appropriate tool, or\n"
                                "2. Provide a summary of what has been completed so far\n"
                                "3. If the task is complete, provide a final summary"
                            )
                            self.logger_for_agent_logs.info(
                                "Adding recovery prompt due to repeated empty responses"
                            )
                            if self._safe_inject_user_message(recovery_prompt, force=False):
                                noContentCount = 0
                                continue
                        
                        noContentCount += 1
                        if noContentCount >= 3:
                            return await self._handle_max_turns_reached(
                                "Agent stopped providing responses because LLM responses were empty type ###Continue###"
                            ), current_turn_token_info
                        continue
    
            except KeyboardInterrupt:
                self.logger_for_agent_logs.info("Keyboard interrupt received")
                return await self._handle_interruption(AGENT_INTERRUPT_MESSAGE), None
                
            except Exception as e:
                self.logger_for_agent_logs.error(
                    f"Error in conversation loop turn {turn_count}: {str(e)}", 
                    exc_info=True
                )
                errorTimes += 1
                
                if errorTimes > MAX_CONSECUTIVE_ERROR:
                    self.logger_for_agent_logs.critical(
                        f"Agent failed {errorTimes} consecutive times. Terminating."
                    )
                    return await self._handle_max_turns_reached(
                        "Agent is stuck on a critical error and cannot recover."
                    ), None
            
                self.logger_for_agent_logs.warning(
                    f"Attempting recovery (Attempt {errorTimes}/{MAX_CONSECUTIVE_ERROR})"
                )
                await self._handle_generation_error(e, turn_count)
                continue
                
        return await self._handle_max_turns_reached(), None
    
    async def _handle_generation_error(self, e: Exception, turn_count: int):
        """
        Handles any generation error by intelligently inspecting the conversation
        history and injecting the error message in a way that preserves the
        turn-based integrity, preventing state-related crashes.
        """
        if self.interrupted:
            # If the user interrupted, we add a specific message and stop.
            self.add_fake_assistant_turn(AGENT_INTERRUPT_FAKE_MODEL_RSP)
            return     

        self.logger_for_agent_logs.error(
            f"LLM generation failed on turn {turn_count}: {str(e)}", exc_info=True
        )     

        error_feedback = (
            "Observation: A critical system error occurred. "
            f"The error was: '{str(e)}'.\n\n"
            "This prevented the last action from completing. You MUST NOT repeat the "
            "previous action. Formulate a new plan to achieve the original goal."
        )     

        if self.history.is_next_turn_assistant():

            self.logger_for_agent_logs.info("Error occurred while expecting an assistant turn. Injecting as a failed tool call.")     
            fake_tool_call = ToolCall(
                tool_call_id=f"generation_error-{uuid.uuid4()}",
                tool_name="system_error_handler",
                tool_input={"error_message": str(e)}
            )
            self.history.add_assistant_turn([fake_tool_call])
            
            tool_action = ToolAction(
                tool_call_id=fake_tool_call.tool_call_id,
                tool_name=fake_tool_call.tool_name,
                tool_input=fake_tool_call.tool_input
            )
            self.history.add_tool_call_results([tool_action], [error_feedback])     

        elif self.history.is_next_turn_user():

            self.logger_for_agent_logs.info("Error occurred while expecting a user turn. Injecting as a user prompt.")
            self.history.add_user_prompt(error_feedback)     
    
        # Notify the frontend/user that the agent is attempting to recover.
        await self._send_message_to_queue(
            RealtimeEvent(
                type=EventType.AGENT_RESPONSE,
                content={
                    "status": "error_recovery",
                    "message": "Agent encountered a system error and is attempting to recover.",
                },
            )
        )

    async def _handle_budget_limit_and_pause_for_human(self, consecutive_tools: int) -> tuple[AgentImplOutput, Any]:
        """
        Pauses the agent's execution at a checkpoint and requests user input to continue.
        This is a terminal action for the current run.
        """
        # Craft the message to the user, providing context.
        clarification_message = (
            f"💬 **Quick Reflection Moment**\n\n"
            f"I’ve been working through {consecutive_tools} actions and want to pause for a quick alignment. "
            f"Does my current approach feel right to you? Type **continue** when you're ready for me to proceed."
        )

        self.is_task_paused = True
        self.logger_for_agent_logs.info(
            f"Pausing at checkpoint after {consecutive_tools} tools. Awaiting user input."
        )
    
        return await self._handle_task_completion(clarification_message), None

    async def _log_planning_step(self, planning_text: str):
        """Log the planning step (the text part before a tool call)."""
        await self._send_message_to_queue(
            RealtimeEvent(
                type=EventType.AGENT_THINKING,  # Or AGENT_RESPONSE depending on your frontend
                content={"thought": planning_text}
            )
        )

        if planning_text.strip():
            self.logger_for_agent_logs.info(f"Agent planning next step: {planning_text.strip()}\n")

    def _diagnose_context_issues(self) -> bool:
        """Diagnose potential context issues that might cause empty responses."""
        messages = self.history.get_messages_for_llm()
    
        # Helper function to safely determine the role of a message group.
        def get_role(msg_group):
            if isinstance(msg_group, dict):
                # It's a simple message dict
                return msg_group.get('role')
            if isinstance(msg_group, list) and msg_group:
                first_item = msg_group[0]
                if isinstance(first_item, dict):
                    return first_item.get('role')
            return None
    
        # Check for repeated patterns
        if len(messages) >= 4:
            last_few = messages[-4:]
            
            user_messages = [msg for msg in last_few if get_role(msg) == 'user']
            assistant_messages = [msg for msg in last_few if get_role(msg) == 'assistant']
            
            # Check if we have too many user messages in a row
            if len(user_messages) > len(assistant_messages) + 1:
                self.logger_for_agent_logs.warning(
                    f"Context issue detected: {len(user_messages)} user messages vs {len(assistant_messages)} assistant messages in last 4 turns"
                )
                return True
    
        total_chars = sum(len(str(msg)) for msg in messages)
        if total_chars > 40000:  # Rough threshold for long context
            self.logger_for_agent_logs.warning(f"Very long context detected: {total_chars} characters")
            return True
            
        return False

    def _attempt_context_recovery(self) -> bool:
        """Attempt to recover from context issues."""
        messages = self.history.get_messages_for_llm()
        
        # If we have too many messages, try to clean up
        if len(messages) > 25:
            self.logger_for_agent_logs.info("Attempting context recovery due to long history")
            return True
            
        return False

    async def _send_message_to_queue(self, message: RealtimeEvent):
        """Send message to queue with proper error handling."""
        try:
            self.message_queue.put_nowait(message)
            # Give the event loop a chance to process the message
            await asyncio.sleep(0.001)  # Small delay to ensure message is processed
        except Exception as e:
            self.logger_for_agent_logs.error(f"Failed to send message to queue: {e}")
    
    def _is_valid_tool_call(self, tool_call: ToolCall) -> bool:
        """Validate that a tool call has the required components."""
        if not tool_call.tool_name:
            self.logger_for_agent_logs.warning(f"Tool call missing name: {tool_call}")
            return False
        
        if not tool_call.tool_call_id:
            self.logger_for_agent_logs.warning(f"Tool call missing ID: {tool_call}")
            return False
        
        # Check if tool_input is meaningful (not empty dict, None, or empty string)
        if tool_call.tool_input is None:
            self.logger_for_agent_logs.warning(f"Tool call has None input: {tool_call}")
            return False
        
        # If tool_input is a dict, check if it's empty
        if isinstance(tool_call.tool_input, dict) and not tool_call.tool_input:
            self.logger_for_agent_logs.warning(f"Tool call has empty dict input: {tool_call}")
            return False
        
        # If tool_input is a string, check if it's empty
        if isinstance(tool_call.tool_input, str) and not tool_call.tool_input.strip():
            self.logger_for_agent_logs.warning(f"Tool call has empty string input: {tool_call}")
            return False
        
        return True

    async def _execute_tool_call(self, tool_call: ToolCall) -> Optional[AgentImplOutput]:
        """Execute a tool call and handle the outcome."""
        try:
            tool_resultoutput = await self.tool_manager.run_tool(tool_call, self.history)
            
            self.history.add_tool_call_result(tool_call, tool_resultoutput.tool_output)
            if hasattr(tool_resultoutput, 'auxiliary_data') and tool_resultoutput.auxiliary_data:
                embedding_tokens = tool_resultoutput.auxiliary_data.get("embedding_tokens_used", 0)
                embedding_cost = tool_resultoutput.auxiliary_data.get("embedding_cost", 0.0)
                
                if embedding_tokens > 0:
                    self.cumulative_embedding_tokens += embedding_tokens
                    self.cumulative_embedding_cost += embedding_cost
                    self.logger_for_agent_logs.info(
                        f"🔢 Embedding tokens this tool: {embedding_tokens:,} "
                        f"(Total: {self.cumulative_embedding_tokens:,})"
                    )
            tool_result = tool_resultoutput.tool_output
            if (self.todo_tracking_enabled and 
                tool_call.tool_name == 'str_replace_editor' and
                'todo.md' in str(tool_call.tool_input.get('path', '')).lower()):
                
                old_str = tool_call.tool_input.get('old_str', '')
                new_str = tool_call.tool_input.get('new_str', '')
                
                valid, message = self.todo_manager.verify_todo_edit_validity(old_str, new_str)
                if not valid:
                    self.logger_for_agent_logs.warning(f"Invalid TODO edit: {message}")
                    self._safe_inject_user_message(message, force=True)
                    return None
            
            result_str = str(tool_result) if tool_result else ""
            self.local_input_tokens += self.tokenizer.count_tokens(result_str)

            if not self.todo_tracking_enabled and self.plan_enforced:
                todo_path = self.workspace_manager.workspace_path("todo.md")
                if os.path.exists(todo_path):
                    init_success = self.todo_manager.initialize()
                    if init_success:
                        self.todo_tracking_enabled = True
                        self.logger_for_agent_logs.info(f"📋 TODO tracking NOW ENABLED after tool execution")
                        
                        current_item = self.todo_manager.get_current_item()
                        if current_item and current_item.is_pending():
                            for deliverable in current_item.deliverables:
                                self.todo_manager.verification_engine.capture_baseline(deliverable)
                            self.logger_for_agent_logs.info("📸 Captured baselines for newly planned task")

                    else:
                        self.logger_for_agent_logs.warning(f"📋 TODO file exists but failed to parse")

            await self._send_message_to_queue(
                RealtimeEvent(
                    type=EventType.TOOL_RESULT,
                    content={
                        "tool_call_id": tool_call.tool_call_id,
                        "tool_name": tool_call.tool_name,
                        "result": tool_result
                    }
                )
            )
            if self.todo_tracking_enabled and tool_result is not None:
                await self._auto_update_todo_progress(
                    tool_call.tool_name,
                    tool_call.tool_input,
                    tool_result if isinstance(tool_result, str) else str(tool_result)
                )

            if self.tool_manager.should_stop():
                return await self._handle_tool_completion()
                
        except KeyboardInterrupt:
            return await self._handle_tool_interruption(tool_call)
        return None

    async def _handle_task_completion(self, final_answer: str) -> AgentImplOutput:
        self.logger_for_agent_logs.info("🔵 ENTERING _handle_task_completion")
        await self.message_queue.put(
            RealtimeEvent(
                type=EventType.AGENT_RESPONSE,
                content={"text": final_answer}
            )
        )
        
        self.logger_for_agent_logs.info("🟡 Message added to queue, waiting for processing...")
        
        try:
            await asyncio.wait_for(self.message_queue.join(), timeout=10.0)
            self.logger_for_agent_logs.info("🟢 Queue processing complete")
        except asyncio.TimeoutError:
            self.logger_for_agent_logs.warning("⚠️ Queue join timeout (non-critical, proceeding)")
        await asyncio.sleep(0.2)
        return AgentImplOutput(
            tool_output=final_answer,
            tool_result_message="Task completed",
        )

    async def _handle_tool_completion(self) -> AgentImplOutput:
        """Handle completion after a tool indicates the task is finished."""
        final_answer = self.tool_manager.get_final_answer()
        
        self.logger_for_agent_logs.info(f"🎯 Tool completion, final answer length: {len(final_answer)}")
        
        await self._send_message_to_queue(
            RealtimeEvent(
                type=EventType.AGENT_RESPONSE, 
                content={"text": final_answer}
            )
        )

        await asyncio.sleep(0.1)
        return AgentImplOutput(
            tool_output=final_answer, 
            tool_result_message="Task completed"
        )

    async def _handle_interruption(self, message: str) -> AgentImplOutput:
        """Handle user interruption (Ctrl+C)."""
        self.interrupted = True
        await self._send_message_to_queue(
            RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": message})
        )
        
        await asyncio.sleep(0.1)
        
        return AgentImplOutput(tool_output=message, tool_result_message=message)
    
    async def _handle_tool_interruption(self, tool_call: ToolCall) -> AgentImplOutput:
        """Handle interruption during tool execution."""
        self.interrupted = True
        self.history.add_tool_call_result(tool_call, TOOL_RESULT_INTERRUPT_MESSAGE)
        self.add_fake_assistant_turn(TOOL_CALL_INTERRUPT_FAKE_MODEL_RSP)
        
        # ✅ AWAIT the send
        await self._send_message_to_queue(
            RealtimeEvent(
                type=EventType.AGENT_RESPONSE, 
                content={"text": TOOL_RESULT_INTERRUPT_MESSAGE}
            )
        )
        
        await asyncio.sleep(0.1)
        
        return AgentImplOutput(
            tool_output=TOOL_RESULT_INTERRUPT_MESSAGE, 
            tool_result_message=TOOL_RESULT_INTERRUPT_MESSAGE
        )
    
    async def _handle_max_turns_reached(self, reason: str = "Agent did not complete after max turns") -> AgentImplOutput:
        """Handle when maximum turns are reached."""
        await self._send_message_to_queue(
            RealtimeEvent(type=EventType.AGENT_RESPONSE, content={"text": reason})
        )
        
        await asyncio.sleep(0.1)

        return AgentImplOutput(tool_output=reason, tool_result_message=reason)

    def _create_image_blocks(self, files: List[str]) -> List[dict]:
        """Create image blocks from file paths."""
        supported_formats = {"png", "gif", "jpeg", "jpg", "webp"}
        image_blocks = []
        for file in files:
            try:
                file_extension = file.split(".")[-1].lower()
                if file_extension in supported_formats:
                    media_type = "jpeg" if file_extension == "jpg" else file_extension
                    file_path = self.workspace_manager.workspace_path(file)
                    base64_image = encode_image(str(file_path))
                    image_blocks.append({
                        "source": {"type": "base64", "media_type": f"image/{media_type}", "data": base64_image}
                    })
            except Exception as e:
                self.logger_for_agent_logs.warning(f"Failed to process image file {file}: {str(e)}")
        return image_blocks

    def _build_file_list(self, files: List[str]) -> str:
        """Build a formatted list of attached files for the prompt."""
        file_paths = []
        for file in files:
            try:
                relative_path = self.workspace_manager.relative_path(file)
                file_paths.append(relative_path)
            except Exception as e:
                self.logger_for_agent_logs.warning(f"Failed to process file path {file}: {str(e)}")
        if not file_paths:
            return ""
        file_list = '\n'.join(f" - {path}" for path in file_paths)
        return f"\n\nAttached files:\n{file_list}"

    def _log_visual_separation(self, log_type: LogLevel):
        """Log a visual separator for clarity in logs."""
        separator = "-" * 30 + f" {log_type.value} " + "-" * 30
        self.logger_for_agent_logs.info(f"\n{separator}\n")

    async def run_agent(self, instruction: str, files: Optional[List[str]] = None, resume: bool = False) -> tuple[str, Any]:
        """High-level method to run the agent with an instruction."""
        self.tool_manager.reset()
        should_resume, reason = self._should_resume_task(instruction, resume)
        
        self.logger_for_agent_logs.info(
            f"🔍 Resume decision: {should_resume} (reason: {reason})\n"
            f"   Input: '{instruction[:50]}...'\n"
            f"   Was paused: {self.is_task_paused}"
        )
        
        if not should_resume:
            self._reset_todo_tracking()
            self.interrupted = False
            self.warnings_sent.clear()
            self.tool_budget = self._calculate_tool_budget(instruction)
            self.plan_enforced = False
            self.last_plan_check_turn = 0
            self.plan_drift_warnings = 0
            self.is_task_paused = False
            self.paused_task_context = None

            if self.embedding_provider:
                self.embedding_provider.reset_stats()
                
        if resume and not self.history.is_next_turn_user():
            self.logger_for_agent_logs.warning(
                "Agent state is inconsistent (last turn likely crashed). "
                "Injecting a recovery message to repair the history and proceed."
            )
            
            recovery_message = (
                "My previous attempt to respond resulted in a critical system error "
                "and was not completed. I am now ready for your next instruction."
            )
            try:
                from llm.base import TextResult
                self.history.add_assistant_turn([TextResult(text=recovery_message)])
            except Exception as e:
                self.logger_for_agent_logs.error(f"Failed to inject recovery message: {e}. Clearing history as a fallback.")
                self.history.clear() 

        tool_input = {"instruction": instruction, "files": files or []}
        self.last_model_token_info = self.last_model_token_info or {}
        result = await self.run(tool_input, self.history)
        return result, self.last_model_token_info
    
    def get_token_info(self) -> dict:
        """Get the cumulative token usage for the run."""
        token_info = {
            "local_estimate": {
                "input_tokens": self.local_input_tokens,
                "output_tokens": self.local_output_tokens,
                "total_tokens": self.local_input_tokens + self.local_output_tokens,
                "total_embedding_tokens": self.cumulative_embedding_tokens,
            },
            "model_actual": {
                "cumulative_input_tokens": self.cumulative_input_tokens,
                "cumulative_output_tokens": self.cumulative_output_tokens,
                "cumulative_total_tokens": self.cumulative_total_tokens,
                "total_embedding_tokens": self.cumulative_embedding_tokens,
            },
            "difference": {
                "input_diff": self.cumulative_input_tokens - self.local_input_tokens,
                "output_diff": self.cumulative_output_tokens - self.local_output_tokens,
                "accuracy_pct": round(
                    (self.local_input_tokens + self.local_output_tokens) / 
                    max(self.cumulative_total_tokens, 1) * 100, 
                    2
                )
            },
            "last_turn_tokens": self.last_model_token_info or {},

        }
        return token_info
    
    def cancel(self):
        """Cancel the agent execution."""
        self.interrupted = True
        self.logger_for_agent_logs.info("Agent cancellation requested")
    
    def clear(self):
        """Clear the agent's state for a new session."""
        self._reset_todo_tracking()
        self.history.clear()
        self.interrupted = False
        self.tool_manager.reset()
        
        self.partial_tool_calls.clear()
        self.seen_stream_ids.clear()
        self.warnings_sent.clear()

        self.cumulative_embedding_tokens = 0
        self.cumulative_embedding_cost = 0.0

        if self.embedding_provider:
            self.embedding_provider.reset_stats()

        # Stop message processing task when clearing
        if self.message_processing_task:
            try:
                asyncio.create_task(self.stop_message_processing())
            except Exception:
                pass

    def add_fake_assistant_turn(self, text: str):
        """Add a fake assistant turn to the history and send it to the message queue."""
        self.history.add_assistant_turn([TextResult(text=text)])
        if self.interrupted:
            rsp_type = EventType.AGENT_RESPONSE_INTERRUPTED
        else:
            rsp_type = EventType.AGENT_RESPONSE

        self.message_queue.put_nowait(
            RealtimeEvent(
                type=rsp_type,
                content={"text": text},
            )
        )