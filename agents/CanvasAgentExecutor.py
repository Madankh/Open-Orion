import asyncio
import logging
import uuid
from typing import Any, Optional, List, Dict
from datetime import datetime
from fastapi import WebSocket
from agents.MainAgent import MainAgent
from llm.base import LLMClient, TextResult, ToolCall, ToolAction, AgentThinkingBlock, ToolArgsChunk, MetadataBlock
from llm.context_manager.base import ContextManager
from llm.message_history import MessageHistory
from lab.tool_manager import AgentToolManager
from utilss.workspace_manager import WorkspaceManager
from EvenInfo.event import RealtimeEvent, EventType
from Mongodb.db import DatabaseManager
from lab.base import AgentImplOutput
from lab.impotantutils import encode_image
from agents.TokenTracker import LocalTokenizer
class CanvasAgentExecutor(MainAgent):
    """
    Enhanced Canvas Agent with full FileContextManager integration
    for infinite context handling through externalized memory
    """
    
    name = "canvas_agent"
    description = "Canvas agent with infinite context through file-based memory"

    input_schema = {
        "type": "object", 
        "properties": {
            "instruction": {"type": "string", "description": "User instruction"},
        },
        "required": ["instruction"],
    }
    
    def __init__(
        self,
        system_prompt: str,
        client: LLMClient,
        tools: List,
        canvas_id: str,
        node_id: str,
        source_node_id: str,
        logger:logging.Logger,
        branch_id: str = "main",
        context_manager: ContextManager = None,
        workspace_manager: WorkspaceManager = None,
        websocket: Optional[WebSocket] = None,
        session_id: Optional[uuid.UUID] = None,
        user_id: Optional[str] = None,
        db_manager: Optional[DatabaseManager] = None,
        max_output_tokens_per_turn: int = 8192,
        max_turns: int = 20,
        message_queue: Optional[asyncio.Queue] = None,
        node_context: Optional[Dict] = None,
        project_context: Optional[Dict] = None,
        branch_files: Optional[List[Dict]] = None,
        node_connections: Optional[List[Dict]] = None,
        loaded_files: Optional[List[Dict]] = None,
        embedding_provider: Optional['EmbeddingProvider'] = None,
    ):
        super().__init__()
        self.logger = logger or logging.getLogger(f"CanvasAgent_{canvas_id}_{node_id}")
        # Core agent components
        self.system_prompt = system_prompt
        self.client = client
        self.context_manager = context_manager
        self.workspace_manager = workspace_manager
        
        self.tokenizer = LocalTokenizer(model_name="gpt-4")
        self.local_input_tokens = 0
        self.local_output_tokens = 0

        # Canvas identifiers
        self.canvas_id = canvas_id
        self.source_node_id = source_node_id
        self.node_id = node_id
        self.branch_id = branch_id
        self.session_id = str(session_id) if session_id else canvas_id
        self.user_id = user_id
        self.websocket = websocket
        self.loaded_files = loaded_files or []
        
        # Context from query
        self.node_context = node_context or {}
        self.project_context = project_context or {}
        self.branch_files = branch_files or []
        self.node_connections = node_connections or []
        
        # Validation
        if not context_manager:
            raise ValueError("ContextManager required")
        if not message_queue:
            raise ValueError("Message queue required")
        if not workspace_manager:
            raise ValueError("WorkspaceManager required for infinite context")
       
        # Initialize context manager with workspace
        if hasattr(self.context_manager, 'workspace_manager'):
            self.context_manager.workspace_manager = workspace_manager
        
        # Load existing context files from previous sessions
        if hasattr(self.context_manager, 'load_from_workspace'):
            self.context_manager.load_from_workspace()
            self.logger.info("Loaded existing context from workspace")
            
        # Message processing
        self.message_queue = message_queue
        self.message_processing_task = None
        self._processing_lock = asyncio.Lock()
        self.history = MessageHistory()
        self.interrupted = False
        
        # Database and logging
        self.db_manager = db_manager
        
        # Tool management with masking support
        self.tool_manager = AgentToolManager(tools=tools, logger_for_agent_logs=self.logger)
        
        # Configuration
        self.max_output_tokens = max_output_tokens_per_turn
        self.max_turns = max_turns
        
        # Token tracking
        self.cumulative_input_tokens = 0
        self.cumulative_output_tokens = 0
        self.cumulative_total_tokens = 0
        self.last_model_token_info = None
        
        self.cumulative_embedding_tokens = 0
        self.cumulative_embedding_cost = 0.0
        
        # Error tracking for learning
        self.error_count = 0
        self.last_error_turn = None


    async def start_message_processing(self) -> asyncio.Task:
        """Start WebSocket message processing"""
        async with self._processing_lock:
            await self._stop_message_processing_internal()
            
            while not self.message_queue.empty():
                try:
                    self.message_queue.get_nowait()
                    self.message_queue.task_done()
                except asyncio.QueueEmpty:
                    break
            
            self.message_processing_task = asyncio.create_task(self._process_messages())
            self.logger.info("Canvas message processing started")
            return self.message_processing_task

    async def _stop_message_processing_internal(self):
        """Stop message processing gracefully"""
        if self.message_processing_task and not self.message_processing_task.done():
            try:
                self.message_queue.put_nowait(None)
                await asyncio.wait_for(self.message_processing_task, timeout=3.0)
            except asyncio.TimeoutError:
                self.logger.warning("Message processing timeout, cancelling")
                self.message_processing_task.cancel()
                try:
                    await self.message_processing_task
                except asyncio.CancelledError:
                    pass
            except Exception as e:
                self.logger.error(f"Error stopping message processing: {e}")
            finally:
                self.message_processing_task = None

    async def stop_message_processing(self):
        """Public stop method"""
        async with self._processing_lock:
            await self._stop_message_processing_internal()

    async def _send_to_websocket(self, message: RealtimeEvent):
        """Send real-time event to WebSocket"""
        if message.type != EventType.USER_MESSAGE and self.websocket:
            try:
                await self.websocket.send_json(message.model_dump(mode='json'))
            except Exception as e:
                self.logger.warning(f"WebSocket send failed: {e}")
                self.websocket = None

    async def _process_messages(self):
        """Process message queue and send via WebSocket"""
        self.logger.info("Message processing loop started")
        
        try:
            while True:
                try:
                    message: Optional[RealtimeEvent] = await asyncio.wait_for(
                        self.message_queue.get(), timeout=1.0
                    )
                    
                    if message is None:
                        self.logger.info("Message processing shutdown")
                        self.message_queue.task_done()
                        break
                    
                    # Add canvas metadata
                    if hasattr(message, 'content') and isinstance(message.content, dict):
                        message.content.update({
                            'canvas_id': self.canvas_id,
                            'node_id': self.node_id,
                            'branch_id': self.branch_id,
                            'timestamp': datetime.utcnow().isoformat()
                        })
                    
                    await self._send_to_websocket(message)
                    self.message_queue.task_done()
                    
                except asyncio.TimeoutError:
                    continue
                except asyncio.CancelledError:
                    self.logger.info("Message processing cancelled")
                    break
                except Exception as e:
                    self.logger.error(f"Error processing message: {e}", exc_info=True)
                    try:
                        self.message_queue.task_done()
                    except ValueError:
                        pass
        except Exception as e:
            self.logger.error(f"Critical error in message processing: {e}", exc_info=True)
        finally:
            while not self.message_queue.empty():
                try:
                    self.message_queue.get_nowait()
                    self.message_queue.task_done()
                except (asyncio.QueueEmpty, ValueError):
                    break
            self.logger.info("Message processing finished")

    async def _send_message_to_queue(self, message: RealtimeEvent):
        """Queue message for WebSocket sending"""
        try:
            if self.message_queue:
                self.message_queue.put_nowait(message)
                await asyncio.sleep(0.001)
        except Exception as e:
            self.logger.error(f"Failed to queue message: {e}")

    async def _execute_tool_call(self, tool_call: ToolCall) -> Optional[AgentImplOutput]:
        """Execute tool with enhanced error tracking"""
        try:
            await self._send_message_to_queue(RealtimeEvent(
                type=EventType.TOOL_CALL,
                content={
                    'tool_call_id': tool_call.tool_call_id,
                    'tool_name': tool_call.tool_name,
                    'tool_input': tool_call.tool_input
                }
            ))
            tool_input_str = str(tool_call.tool_input)
            tool_call_tokens = self.tokenizer.count_tokens(tool_input_str)
            self.local_output_tokens += tool_call_tokens

            
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
            result = tool_resultoutput.tool_output
            result_str = str(result) if result else ""
            result_tokens = self.tokenizer.count_tokens(result_str)
            self.local_input_tokens += result_tokens 

            # Check for errors and track them
            if isinstance(result, str) and any(err in result.lower() for err in ['error', 'exception', 'failed']):
                self.error_count += 1
                self.last_error_turn = len(self.history.get_messages_for_llm())
                self.logger.warning(f"Tool error detected (count: {self.error_count})")
            
            await self._send_message_to_queue(RealtimeEvent(
                type=EventType.TOOL_RESULT,
                content={
                    'tool_call_id': tool_call.tool_call_id,
                    'tool_name': tool_call.tool_name,
                    'result': str(result)[:500]
                }
            ))
                
        except Exception as e:
            self.logger.error(f"Tool execution failed: {e}")
            self.error_count += 1
            error_msg = f"Tool failed: {e}"
            error_tokens = self.tokenizer.count_tokens(error_msg)
            self.local_input_tokens += error_tokens
            tool_action = ToolAction(
                tool_call_id=tool_call.tool_call_id,
                tool_name=tool_call.tool_name,
                tool_input=tool_call.tool_input
            )
            self.history.add_tool_call_results([tool_action], [f"Tool failed: {e}"])

    async def _execute_canvas_conversation(self) -> str:
        """Main conversation loop with infinite context support and zero-token retry logic"""
        turn_count = 0
        response_text = ""
        max_zero_token_retries = 3
        zero_token_retry_count = 0
        
        while turn_count < self.max_turns and not self.interrupted:
            turn_count += 1
            
            try:
                # Get available tools (respecting masking if active)
                tools = [tool.get_tool_param() for tool in self.tool_manager.get_tools()]
                
                # Get messages from history
                messages = self.history.get_messages_for_llm()
                if turn_count == 1 and self.loaded_files:
                    self.logger.info(f"Injecting {len(self.loaded_files)} images into conversation")
                    messages = self._inject_images_into_messages(messages)
                
                # Apply context optimization (this is where the magic happens!)
                if hasattr(self.context_manager, 'apply_truncation_if_needed'):
                    messages = self.context_manager.apply_truncation_if_needed(messages)
                    
                # Build enhanced system prompt
                enhanced_prompt = self._build_system_prompt()
               
                prompt_tokens = self.tokenizer.count_tokens(enhanced_prompt)
                self.local_input_tokens += prompt_tokens
                tools_str = str(tools)
                tool_def_tokens = self.tokenizer.count_tokens(tools_str)
                self.local_input_tokens += tool_def_tokens
    
                # Generate response
                response_generator = self.client.generate(
                    messages=messages,
                    max_tokens=self.max_output_tokens,
                    tools=tools,
                    system_prompt=enhanced_prompt,
                )
                
                text_content = ""
                tool_calls = []
                current_turn_token_info = None
                
                await self._send_message_to_queue(RealtimeEvent(
                    type=EventType.STREAMING_TOKEN,
                    content={"type": "start", "node_id": self.node_id}
                ))
                
                async for chunk in response_generator:
                    if self.interrupted:
                        break
                        
                    if isinstance(chunk, TextResult):
                        text_content += chunk.text
                        self.local_output_tokens += self.tokenizer.count_tokens(chunk.text)
                        await self._send_message_to_queue(RealtimeEvent(
                            type=EventType.STREAMING_TOKEN,
                            content={"type": "token", "token": chunk.text}
                        ))
                        
                    elif isinstance(chunk, ToolCall):
                        tool_calls.append(chunk)
                        
                    elif isinstance(chunk, AgentThinkingBlock):
                        await self._send_message_to_queue(RealtimeEvent(
                            type=EventType.AGENT_THINKING,
                            content={"thought": chunk.content}
                        ))
                        
                    elif isinstance(chunk, ToolArgsChunk):
                        await self._send_message_to_queue(RealtimeEvent(
                            type=EventType.TOOL_ARGS_STREAM,
                            content={
                                "token": chunk.content,
                                "tool_name": chunk.tool_name,
                                "tool_call_id": chunk.tool_call_id
                            }
                        ))
                        
                    elif isinstance(chunk, MetadataBlock):
                        current_turn_token_info = chunk.metadata
                
                # ✅ CHECK FOR ZERO-TOKEN RESPONSE (Model failure)
                if current_turn_token_info:
                    input_tokens = current_turn_token_info.get("prompt_tokens", 0) or 0
                    output_tokens = current_turn_token_info.get("completion_tokens", 0) or 0
                    total_tokens = current_turn_token_info.get("total_tokens", 0) or 0
                    
                    # Detect zero-token failure
                    if input_tokens == 0 and output_tokens == 0 and total_tokens == 0:
                        zero_token_retry_count += 1
                        
                        self.logger.warning(
                            f"⚠️ Zero-token response detected (attempt {zero_token_retry_count}/{max_zero_token_retries}). "
                            f"Model likely encountered an error. Retrying..."
                        )
                        
                        if zero_token_retry_count >= max_zero_token_retries:
                            self.logger.error(
                                f"❌ Failed after {max_zero_token_retries} retries. Model consistently failing."
                            )
                            
                            error_message = (
                                "The AI model encountered repeated errors. This may be due to:\n"
                                "• Context length limits\n"
                                "• Malformed requests\n"
                                "• API rate limits\n\n"
                                "Please try:\n"
                                "1. Breaking down your question into smaller parts\n"
                                "2. Starting a new conversation\n"
                                "3. Simplifying your request"
                            )
                            
                            await self._send_message_to_queue(RealtimeEvent(
                                type=EventType.AGENT_RESPONSE,
                                content={
                                    "text": error_message,
                                    "is_final": True,
                                    "error": True
                                }
                            ))
                            
                            return error_message
                        
                        # ✅ RETRY: Wait with backoff and retry same turn
                        await asyncio.sleep(1.0 * zero_token_retry_count)
                        turn_count -= 1  # Don't count this as a turn
                        continue
                    
                    else:
                        # ✅ SUCCESS: Reset retry counter and update tokens
                        zero_token_retry_count = 0
                        self.update_token_info(current_turn_token_info)
                
                # Add to history
                if text_content or tool_calls:
                    response_parts = []
                    if text_content:
                        response_parts.append(TextResult(text=text_content))
                    if tool_calls:
                        response_parts.extend(tool_calls)
                        tool_calls_str = str(tool_calls)
                        tool_calls_tokens = self.tokenizer.count_tokens(tool_calls_str)
                        self.local_output_tokens += tool_calls_tokens
    
                    self.history.add_assistant_turn(response_parts)
                
                # Handle tool calls or finish
                if tool_calls:
                    for tool_call in tool_calls:
                        await self._execute_tool_call(tool_call)
                else:
                    response_text = text_content
                    
                    # Save response node
                    await self._save_response_node(response_text)
                    
                    await self._send_message_to_queue(RealtimeEvent(
                        type=EventType.AGENT_RESPONSE,
                        content={
                            "text": response_text,
                            "is_final": True,
                            "node_id": self.node_id,
                            "node_updated": True
                        }
                    ))
                    break
                    
            except Exception as e:
                self.logger.error(f"Error in conversation: {e}", exc_info=True)
                
                # Don't count zero-token retries toward error limit
                if zero_token_retry_count > 0:
                    continue
                    
                response_text = f"Error: {str(e)}"
                await self._send_message_to_queue(RealtimeEvent(
                    type=EventType.AGENT_RESPONSE,
                    content={"text": response_text, "is_final": True, "error": True}
                ))
                break
        
        return response_text or "Processing completed"
    
        
    async def _save_response_node(self, response_text: str):
        """Save AI response node with connection"""
        if not self.db_manager:
            self.logger.warning("No DB manager, skipping save")
            return
        
        try:
            source_node = self.node_context.get('current_node', {})
            source_node_id = source_node.get('id')
            
            if not source_node_id:
                self.logger.error("No source node ID in context")
                return
            
            # Calculate position
            source_pos = source_node.get('position', {})
            response_position = {
                'x': source_pos.get('x', 0) + 350,
                'y': source_pos.get('y', 0)
            }
            
            # Save node
            node_data = {
                'canvas_id': self.canvas_id,
                'session_id': self.session_id,
                'node_id': self.node_id,
                'branch_id': self.branch_id,
                'parent_node_id': self.source_node_id,
                'node_type': 'conversation',
                'title': 'AI Response',
                'content': response_text,
                'position_x': response_position['x'],
                'position_y': response_position['y'],
                'level': source_node.get('level', 0) + 1,
                'color': source_node.get('color', '#3B82F6'),
                'created_by': self.user_id
            }
            
            await self.db_manager.save_canvas_node_with_branch(node_data)
            self.logger.info(f"Saved response node {self.node_id}")
            connection_id = str(uuid.uuid4())
            # Save connection
            connection_data = {
                'canvas_id': self.canvas_id,
                'branch_id': self.branch_id,
                'connection_id': connection_id,
                'from_node_id': self.source_node_id,
                'to_node_id': self.node_id,
                'from_point': 'right',
                'to_point': 'left',
                'color': 'slate',   
                'stroke_style': 'solid',  
                'arrow_type': 'end',     
                'label': 'AI collab',            
            }
            
            await self.db_manager.save_canvas_connection(connection_data)
            self.logger.info(f"Saved connection {source_node_id} → {self.node_id}")
            
        except Exception as e:
            self.logger.error(f"Failed to save response node: {e}", exc_info=True)

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
                self.logger.error(f"Failed to process image file {file}: {str(e)}")
        return image_blocks

    def _build_file_list(self, files: List[str]) -> str:
        """Build a formatted list of attached files for the prompt."""
        file_paths = []
        for file in files:
            try:
                relative_path = self.workspace_manager.relative_path(file)
                file_paths.append(relative_path)
            except Exception as e:
                self.logger.warning(f"Failed to process file path {file}: {str(e)}")
        if not file_paths:
            return ""
        file_list = '\n'.join(f" - {path}" for path in file_paths)
        return f"\n\nAttached files:\n{file_list}"

    def _format_node_list(self, nodes: List[Dict], title: str, limit: int = 5, char_limit: int = 150) -> List[str]:
        """Helper to format a list of nodes with strict budgeting."""
        if not nodes:
            return []
            
        lines = [f"{title} ({len(nodes)} items)", "-" * 50]
        
        # Determine strict count limit
        display_nodes = nodes[:limit]
        remaining = len(nodes) - limit
        
        for node in display_nodes:
            node_type = node.get('type', 'text')
            icon = "📷" if node_type == "media" else ("📁" if node_type == "group" else "📝")
            node_title = node.get('title', 'Untitled')
            content = node.get('content', '')
            
            lines.append(f"  {icon} {node_title} [{node_type}]")
            
            if content:
                # Groups get tighter truncation
                limit_to_use = 80 if node_type == "group" else char_limit
                truncated = self._truncate_text(content, limit_to_use)
                lines.append(f"     {truncated}")
                
        if remaining > 0:
            lines.append(f"  ... and {remaining} more items")
            
        lines.append("")
        return lines

    def _truncate_text(self, text: str, max_chars: int = 200) -> str:
        """Smart truncation that respects word boundaries and adds ellipsis."""
        if not text:
            return "[empty]"
        
        text = text.strip()
        if len(text) <= max_chars:
            return text
            
        truncated = text[:max_chars]
        # Try to cut at the last space to avoid splitting words
        last_space = truncated.rfind(' ')
        if last_space > max_chars * 0.8: # Only cut at space if it's near the end
            truncated = truncated[:last_space]
            
        return f"{truncated}..."

    def _build_system_prompt(self) -> str:
        """
        Build comprehensive system prompt with specific handling for Group Context
        and aggressive truncation for large datasets.
        """
        base_prompt = self.system_prompt or ""
        
        current_node = self.node_context.get('current_node', {})
        parent_chain = self.node_context.get('parent_chain', [])
        child_nodes = self.node_context.get('child_nodes', [])
        sibling_nodes = self.node_context.get('sibling_nodes', [])
        connected_nodes = self.node_context.get('connected_nodes', [])
        group_info = self.node_context.get('group_info', None)
        
        # 1. Header & Current Node
        context_parts = [
            "\n" + "="*60,
            "🎯 CANVAS CONTEXT - SMART VIEW",
            "="*60,
            f"Canvas ID: {self.canvas_id}",
            ""
        ]
        
        context_parts.extend([
            "📍 CURRENT NODE (Focus)",
            "-" * 50,
            f"Title: {current_node.get('title', 'Untitled')}",
            f"Type: {current_node.get('type', 'text')}",
            f"Content:\n{self._truncate_text(current_node.get('content', ''), 1000)}" # Allow more for current node
        ])
        
        # 2. Parent Chain (Crucial for Context)
        if parent_chain:
            context_parts.append(f"\n⬆️  ANCESTORS ({len(parent_chain)})")
            # Show last 3 parents with decent detail
            for p in reversed(parent_chain[-3:]):
                context_parts.append(f"  • {p.get('title')} ({p.get('type')})")
                if p.get('content'):
                    context_parts.append(f"    Context: {self._truncate_text(p.get('content'), 200)}")
        
        context_parts.append("")

        # 3. SMART GROUP LOGIC
        is_group_node = current_node.get('type') == 'group'
        is_inside_group = bool(group_info) or (current_node.get('parentId') and not current_node.get('parentId').startswith('root'))

        # CASE A: Current Node IS A GROUP
        if is_group_node:
            context_parts.append(f"📦 GROUP CONTENTS (Children of this group)")
            context_parts.append("-" * 50)
            
            # If it's a group, the 'child_nodes' are actually the group members
            if child_nodes:
                # We apply a "Token Budget" here. 
                # Max 15 items, max 100 chars each.
                total_group_chars = 0
                max_group_chars = 2500 
                
                for idx, child in enumerate(child_nodes):
                    if idx >= 15 or total_group_chars > max_group_chars:
                        context_parts.append(f"  ... (+ {len(child_nodes) - idx} more nodes inside group)")
                        break
                        
                    c_title = child.get('title', 'Untitled')
                    c_content = child.get('content', '')
                    c_type = child.get('type', 'text')
                    
                    # Truncate aggressively for group listing
                    trunc_content = self._truncate_text(c_content, 120)
                    total_group_chars += len(trunc_content)
                    
                    context_parts.append(f"  • [{c_type}] {c_title}: {trunc_content}")
            else:
                context_parts.append("  [Empty Group]")

        # CASE B: Current Node is INSIDE A GROUP (Siblings are peers)
        elif is_inside_group:
            group_name = group_info.get('title') if group_info else "Parent Group"
            context_parts.append(f"👥 GROUP PEERS (Inside '{group_name}')")
            context_parts.append("-" * 50)
            
            if sibling_nodes:
                # Peers are context, not focus. High truncation.
                for idx, sib in enumerate(sibling_nodes[:8]): # Only show 8 peers
                    trunc_content = self._truncate_text(sib.get('content', ''), 80)
                    context_parts.append(f"  • {sib.get('title')}: {trunc_content}")
                
                if len(sibling_nodes) > 8:
                    context_parts.append(f"  ... (+ {len(sibling_nodes) - 8} more peers)")
            else:
                context_parts.append("  [No other nodes in this group]")

        # CASE C: Standard Children/Siblings (if not dealing with groups)
        else:
            if child_nodes:
                context_parts.extend(self._format_node_list(child_nodes, "⬇️  CHILDREN", limit=5, char_limit=150))
            if sibling_nodes:
                context_parts.extend(self._format_node_list(sibling_nodes, "↔️  SIBLINGS", limit=3, char_limit=100))

        # 4. Connections & Files
        if connected_nodes:
            context_parts.extend(self._format_node_list(connected_nodes, "🔗 CONNECTIONS", limit=5, char_limit=100))

        if self.loaded_files:
            context_parts.append(f"\n📁 FILES ({len(self.loaded_files)})")
            for f in self.loaded_files:
                context_parts.append(f"  • {f.get('filename')} ({f.get('type')})")

        # 5. Guidelines
        context_parts.extend([
            "\n" + "="*60,
            "🧠 INSTRUCTIONS",
            "• You are acting within a specific node on an infinite canvas.",
            "• Use the Group Context provided to understand the cluster of information.",
            "• If the current node is a Group, your response effectively summarizes or acts on the group.",
            "• If inside a group, consider peer nodes as related data points.",
            "• Do not repeat large chunks of context in your output unless asked.",
            "="*60
        ])
        
        return base_prompt + "\n" + "\n".join(context_parts)

    def _build_user_instruction(self, instruction: str) -> str:
        """Build user prompt with enhanced context awareness"""
        current_node = self.node_context.get('current_node', {})
        parent_chain = self.node_context.get('parent_chain', [])
        
        parts = [
            "="*60,
            "💬 USER QUERY",
            "="*60,
        ]
        
        # Add context summary
        if parent_chain:
            immediate_parent = parent_chain[-1]
            parts.append(f"Asking from: {current_node.get('title', 'Current Node')}")
            parts.append(f"Previous context: {immediate_parent.get('title', 'Parent Node')}")
            
            if immediate_parent.get('type') == 'media':
                parts.append(f"⚠️  User is likely asking about the image: {immediate_parent.get('title')}")
        
        parts.append("")
        parts.append(f"Current node content: {current_node.get('content', '[empty]')}")
        parts.append("")
        
        # Image indicator
        if self.loaded_files:
            parts.append(f"🖼️  {len(self.loaded_files)} image(s) available in context")
            parts.append("")
        
        parts.extend([
            "User's question:",
            f'"{instruction}"',
            "",
            "="*60,
        ])
        
        return "\n".join(parts)

    def _inject_images_into_messages(self, messages: list) -> list:
        """
        Inject images into the message history for vision models.
        Supports Anthropic/OpenAI multi-modal format.
        """
        if not messages or not self.loaded_files:
            return messages
        
        # Find the first user message
        for i, msg in enumerate(messages):
            if msg.get("role") == "user":
                content = msg.get("content", "")
                
                # Convert to multi-modal format
                new_content = []
                
                # Add images first (so AI sees them before the question)
                for file_info in self.loaded_files:
                    if file_info.get("type") == "image":
                        try:
                            # Anthropic/OpenAI format
                            new_content.append({
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": self._get_media_type(file_info["filename"]),
                                    "data": file_info["content"]  # Should be base64 string
                                }
                            })
                            self.logger.info(f"Injected image: {file_info['filename']}")
                        except Exception as e:
                            self.logger.error(f"Failed to inject image {file_info['filename']}: {e}")
                
                # Add text content after images
                if isinstance(content, str):
                    new_content.append({
                        "type": "text",
                        "text": content
                    })
                elif isinstance(content, list):
                    # Already multi-modal, extend it
                    new_content.extend([c for c in content if c.get("type") != "image"])
                
                messages[i]["content"] = new_content
                self.logger.info(f"Message now has {len(new_content)} parts ({len(self.loaded_files)} images)")
                break
        
        return messages
    
    def _get_media_type(self, filename: str) -> str:
        """Get MIME type from filename"""
        ext = filename.lower().split('.')[-1]
        mime_types = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp'
        }
        return mime_types.get(ext, 'image/jpeg')
    
    async def run_impl(self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory] = None) -> AgentImplOutput:
        """Main execution entry point"""
        
        self.cumulative_input_tokens = 0
        self.cumulative_output_tokens = 0
        self.cumulative_total_tokens = 0
        self.cumulative_embedding_tokens = 0
        self.cumulative_embedding_cost = 0.0
        await self.start_message_processing()
        
        try:
            instruction = tool_input.get("instruction", "")
            files = tool_input.get("files", []) 
            
            if not instruction:
                return AgentImplOutput(
                    tool_output="No instruction provided",
                    tool_result_message="No instruction"
                )
    
            image_blocks = self._create_image_blocks(files)
            
            if files:
                instruction += self._build_file_list(files)
                pdf_files = [f for f in files if f.lower().endswith('.pdf')]
                if pdf_files:
                    instruction += (
                        f"\n\n📄 **PDF Files Attached**: Use the `pdf_content_extract` tool to read PDF content **unless the user explicitly asks for internet research or do research s**, in which case use web search tools instead."

                    )
    
            user_prompt = self._build_user_instruction(instruction)
            
            self.history.clear()
            self.interrupted = False
            self.history.add_user_prompt(user_prompt, image_blocks)  
            
            result = await self._execute_canvas_conversation()
            
            if hasattr(self.context_manager, 'get_context_stats'):
                stats = self.context_manager.get_context_stats()
                self.logger.info(f"Final context stats: {stats}")
            
            return AgentImplOutput(
                tool_output=result,
                tool_result_message="Canvas execution completed with infinite context"
            )
            
        except Exception as e:
            self.logger.error(f"Execution failed: {e}", exc_info=True)
            return AgentImplOutput(
                tool_output=f"Error: {str(e)}",
                tool_result_message=f"Error: {str(e)}"
            )
        finally:
            await self.stop_message_processing()
            

    async def cleanup(self):
        """Cleanup with context persistence"""
        try:
            await self.stop_message_processing()
            
            if hasattr(self.tool_manager, 'reset'):
                self.tool_manager.reset()
                
            self.logger.info(
                f"Cleanup completed for {self.canvas_id}/{self.node_id}. "
                f"Total tokens: {self.cumulative_total_tokens}"
            )
        except Exception as e:
            self.logger.error(f"Cleanup error: {e}")

    def update_token_info(self, model_token_info: Optional[dict]):
        """Track token usage"""
        if not model_token_info:
            return

        input_tokens = model_token_info.get("prompt_tokens", 0) or 0
        output_tokens = model_token_info.get("completion_tokens", 0) or 0
        total_tokens = model_token_info.get("total_tokens", 0) or (input_tokens + output_tokens)
        
        self.cumulative_input_tokens += input_tokens
        self.cumulative_output_tokens += output_tokens
        self.cumulative_total_tokens += total_tokens
        self.last_model_token_info = model_token_info

    @property
    def total_tokens_used(self) -> int:
        return self.cumulative_total_tokens

    @property  
    def logger_for_agent_logs(self) -> logging.Logger:
        return self.logger

    def get_token_info(self) -> dict:
        """Get comprehensive token info including context management"""
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
            "last_turn_tokens": self.last_model_token_info or {}
        }
        
        
        # Add context stats if available
        if hasattr(self.context_manager, 'get_context_stats'):
            token_info["context_stats"] = self.context_manager.get_context_stats()
        
        return token_info
    
    async def run_agent(
        self, 
        instruction: str, 
        files: Optional[List[str]] = None, 
        resume: bool = False
    ) -> tuple[str, Any]:
        """
        High-level method to run the canvas agent with an instruction.
        Matches the interface of AgentExecutor for consistency.
        """
        # Reset tool manager
        if hasattr(self.tool_manager, 'reset'):
            self.tool_manager.reset()
        
        # Clear state for new run
        self.interrupted = False
        
        # Build tool input
        tool_input = {
            "instruction": instruction,
            "files": files or []
        }
        
        self.logger.info(
            f"🎨 Canvas Agent starting:\n"
            f"   Canvas: {self.canvas_id}\n"
            f"   Node: {self.node_id}\n"
            f"   Branch: {self.branch_id}\n"
            f"   Instruction: {instruction[:100]}..."
        )
        
        # Execute via run_impl (which handles token tracking)
        self.last_model_token_info = self.last_model_token_info or {}
        result = await self.run(tool_input, self.history)
        
        self.logger.info(
            f"🎨 Canvas Agent completed:\n"
            f"   Total tokens: {self.cumulative_total_tokens}\n"
            f"   Input: {self.cumulative_input_tokens}\n"
            f"   Output: {self.cumulative_output_tokens}"
        )
        
        return result, self.last_model_token_info