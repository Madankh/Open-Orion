import json
from typing import Optional, cast, Any, Iterator
from enum import Enum
from llm.base import (
    AgentContentBlock,
    GeneralContentBlock,
    LLMMessages,
    ToolCall,
    TextPrompt,
    TextResult,
    ToolAction,
    AgentFormattedResult,
    ImageBlock,
)


class TurnType(Enum):
    USER = "user"
    ASSISTANT = "assistant"


class MessageHistory:
    """Manages conversation history with improved validation and proactive error recovery."""
    
    def __init__(self):
        self._message_lists: list[list[GeneralContentBlock]] = []
        self._valid_user_types = (TextPrompt, AgentFormattedResult, ImageBlock)
        self._valid_assistant_types = (TextResult, ToolCall)
        self._recovery_enabled = True  # Flag to control recovery behavior
    
    # Core turn management with proactive recovery
    def add_user_prompt(self, prompt: str, image_blocks: list[dict[str, Any]] | None = None):
        """Adds a user prompt with optional image blocks."""
        user_turn = self._build_user_turn(prompt, image_blocks)
        self.add_user_turn(user_turn)
    
    def add_user_turn(self, messages: list[GeneralContentBlock]):
        """Adds a user turn with proactive recovery and validation."""
        # Proactive recovery before validation
        if self._recovery_enabled:
            recovery_result = self._ensure_valid_user_turn_state()
            if recovery_result:
                print(f"[Recovery] Applied user turn recovery: {recovery_result}")
        
        self._validate_turn_order(TurnType.USER)
        self._validate_message_types(messages, self._valid_user_types, "user")
        self._message_lists.append(messages)
    
    def add_assistant_turn(self, messages: list[AgentContentBlock]):
        """Adds an assistant turn with proactive recovery and validation."""
        # Proactive recovery before validation
        if self._recovery_enabled:
            recovery_result = self._ensure_valid_assistant_turn_state()
            if recovery_result:
                print(f"[Recovery] Applied assistant turn recovery: {recovery_result}")
        
        self._validate_turn_order(TurnType.ASSISTANT)
        self._message_lists.append(cast(list[GeneralContentBlock], messages))
    
    # Proactive Recovery Methods
    def _ensure_valid_user_turn_state(self) -> Optional[str]:
        """
        Ensures the conversation state is ready for a user turn.
        Returns a description of any recovery action taken.
        """
        if self.is_next_turn_user():
            return None  # Already in correct state
        
        # We need a user turn but the state expects assistant
        # This means the last turn was probably a user turn that got duplicated
        
        if self._is_empty():
            return None  # Empty state is fine for user turn
        
        last_turn = self._get_last_turn()
        
        # Case 1: Last turn appears to be a duplicate user turn
        if self._is_user_turn(last_turn):
            # Check if the second-to-last turn is also a user turn
            if len(self._message_lists) >= 2 and self._is_user_turn(self._message_lists[-2]):
                # Remove the duplicate user turn
                self._message_lists.pop()
                return "Removed duplicate user turn"
        
        # Case 2: Missing assistant response to complete the conversation flow
        elif self._is_assistant_turn(last_turn):
            # The state is correct, but our logic might be wrong
            # Let's check if there are pending tool calls that need results
            pending_tools = self.get_pending_tool_calls()
            if pending_tools:
                # This is actually correct - we need tool results (user turn)
                return None
            else:
                # Add a synthetic user continuation to fix the flow
                continuation_prompt = TextPrompt("Please continue.")
                self._message_lists.append([continuation_prompt])
                return "Added synthetic user continuation"
        
        return None
    
    def _ensure_valid_assistant_turn_state(self) -> Optional[str]:
        """
        Ensures the conversation state is ready for an assistant turn.
        Returns a description of any recovery action taken.
        """
        if self.is_next_turn_assistant():
            return None  # Already in correct state
        
        # We need an assistant turn but the state expects user
        # This means the last turn was probably an assistant turn that got duplicated
        
        if self._is_empty():
            # Assistant can't go first, add a synthetic user prompt
            initial_prompt = TextPrompt("Hello, I need assistance.")
            self._message_lists.append([initial_prompt])
            return "Added synthetic initial user prompt"
        
        last_turn = self._get_last_turn()
        
        # Case 1: Last turn appears to be a duplicate assistant turn
        if self._is_assistant_turn(last_turn):
            # Check if the second-to-last turn is also an assistant turn
            if len(self._message_lists) >= 2 and self._is_assistant_turn(self._message_lists[-2]):
                # Remove the duplicate assistant turn
                self._message_lists.pop()
                return "Removed duplicate assistant turn"
        
        # Case 2: Last turn is user turn, but we think we need user turn next
        elif self._is_user_turn(last_turn):
            # Check if this user turn has pending tool results that need to be added first
            if self._has_tool_calls_needing_results():
                # Add synthetic tool results
                self._add_synthetic_tool_results()
                return "Added synthetic tool results for pending calls"
        
        return None
    
    def _is_user_turn(self, turn: list[GeneralContentBlock]) -> bool:
        """Check if a turn contains user messages."""
        return any(isinstance(msg, self._valid_user_types) for msg in turn)
    
    def _is_assistant_turn(self, turn: list[GeneralContentBlock]) -> bool:
        """Check if a turn contains assistant messages."""
        return any(isinstance(msg, self._valid_assistant_types) for msg in turn)
    
    def _has_tool_calls_needing_results(self) -> bool:
        """Check if there are tool calls in recent assistant turns that need results."""
        if len(self._message_lists) < 2:
            return False
        
        # Look at the last assistant turn
        for i in range(len(self._message_lists) - 1, -1, -1):
            turn = self._message_lists[i]
            if self._is_assistant_turn(turn):
                # Check if this turn has tool calls
                for msg in turn:
                    if isinstance(msg, ToolCall):
                        return True
                break  # Only check the most recent assistant turn
        
        return False
    
    def _add_synthetic_tool_results(self):
        """Add synthetic results for pending tool calls."""
        # Find the most recent assistant turn with tool calls
        for i in range(len(self._message_lists) - 1, -1, -1):
            turn = self._message_lists[i]
            if self._is_assistant_turn(turn):
                tool_calls = [msg for msg in turn if isinstance(msg, ToolCall)]
                if tool_calls:
                    # Create synthetic results
                    results = []
                    for tool_call in tool_calls:
                        result = AgentFormattedResult(
                            tool_call_id=tool_call.tool_call_id,
                            tool_name=tool_call.tool_name,
                            tool_result="[Synthetic result - operation completed]"
                        )
                        results.append(result)
                    
                    # Add as a user turn
                    self._message_lists.append(results)
                    break
    
    # Enhanced validation with better error messages
    def _validate_turn_order(self, expected_turn: TurnType):
        """Validates that the turn order is correct with detailed error information."""
        current_state = "empty" if self._is_empty() else ("expecting assistant" if self.is_next_turn_assistant() else "expecting user")
        
        if expected_turn == TurnType.USER and not self.is_next_turn_user():
            raise ValueError(
                f"Cannot add user turn - conversation state: {current_state}. "
                f"Last turn type: {self.get_last_turn_type()}. "
                f"Turn count: {len(self._message_lists)}"
            )
        elif expected_turn == TurnType.ASSISTANT and not self.is_next_turn_assistant():
            raise ValueError(
                f"Cannot add assistant turn - conversation state: {current_state}. "
                f"Last turn type: {self.get_last_turn_type()}. "
                f"Turn count: {len(self._message_lists)}"
            )
    
    def get_last_turn_type(self) -> Optional[str]:
        """Get the type of the last turn for debugging."""
        if self._is_empty():
            return None
        
        last_turn = self._get_last_turn()
        if self._is_user_turn(last_turn):
            return "user"
        elif self._is_assistant_turn(last_turn):
            return "assistant"
        else:
            return "unknown"
    
    # Recovery control methods
    def enable_recovery(self):
        """Enable proactive recovery (default behavior)."""
        self._recovery_enabled = True
    
    def disable_recovery(self):
        """Disable proactive recovery for debugging or strict validation."""
        self._recovery_enabled = False
    
    def is_recovery_enabled(self) -> bool:
        """Check if recovery is enabled."""
        return self._recovery_enabled
    
    # Safe turn addition methods (public API for external recovery)
    def safe_add_user_turn(self, messages: list[GeneralContentBlock]) -> bool:
        """
        Safely add a user turn with recovery. Returns True if successful.
        """
        try:
            self.add_user_turn(messages)
            return True
        except ValueError as e:
            print(f"[Safe Add] Failed to add user turn: {e}")
            return False
    
    def safe_add_assistant_turn(self, messages: list[AgentContentBlock]) -> bool:
        """
        Safely add an assistant turn with recovery. Returns True if successful.
        """
        try:
            self.add_assistant_turn(messages)
            return True
        except ValueError as e:
            print(f"[Safe Add] Failed to add assistant turn: {e}")
            return False
    
    # Diagnostic methods
    def diagnose_state(self) -> dict[str, Any]:
        """Return detailed information about the current conversation state."""
        return {
            "turn_count": len(self._message_lists),
            "is_empty": self._is_empty(),
            "next_turn_expected": "user" if self.is_next_turn_user() else "assistant",
            "last_turn_type": self.get_last_turn_type(),
            "pending_tool_calls": len(self.get_pending_tool_calls()),
            "recovery_enabled": self._recovery_enabled,
            "last_turn_content_types": [type(msg).__name__ for msg in self._get_last_turn()] if not self._is_empty() else []
        }
    
    # Tool handling (existing methods remain the same)
    def get_pending_tool_calls(self) -> list[ToolAction]:
        """Returns tool calls from the last assistant turn, if any."""
        if self._is_empty() or self.is_next_turn_assistant():
            return []
        return [
            self._convert_to_tool_action(msg)
            for msg in self._get_last_turn()
            if isinstance(msg, ToolCall)
        ]
    
    def add_tool_call_result(self, parameters: ToolAction, result: str):
        """Adds a single tool call result."""
        self.add_tool_call_results([parameters], [result])
    
    def add_tool_call_results(self, parameters: list[ToolAction], results: list[str]):
        """Adds multiple tool call results with validation."""
        if not self.is_next_turn_user():
            raise ValueError("Cannot add tool call results, expected user turn next")
        
        if len(parameters) != len(results):
            raise ValueError("Parameters and results must have the same length")
        
        formatted_results = [
            AgentFormattedResult(
                tool_call_id=params.tool_call_id,
                tool_name=params.tool_name,
                tool_result=result
            )
            for params, result in zip(parameters, results)
        ]
        self._message_lists.append(formatted_results)
    
    # All other existing methods remain unchanged...
    def get_messages_for_llm(self) -> LLMMessages:
        """Returns messages formatted for LLM consumption."""
        return list(self._message_lists)
    
    def get_last_assistant_text_response(self) -> Optional[str]:
        """Returns the text part of the last assistant response, if any."""
        if self._is_empty() or self.is_next_turn_assistant():
            return None
        
        for message in reversed(self._get_last_turn()):
            if isinstance(message, TextResult):
                return message.text
        return None
    
    def is_next_turn_user(self) -> bool:
        """Checks if the next turn should be from user."""
        return len(self._message_lists) % 2 == 0
    
    def is_next_turn_assistant(self) -> bool:
        """Checks if the next turn should be from assistant."""
        return not self.is_next_turn_user()
    
    def get_turn_count(self) -> int:
        """Returns the number of turns in the conversation."""
        return len(self._message_lists)
    
    def get_current_turn_type(self) -> Optional[TurnType]:
        """Returns the type of the current turn."""
        if self._is_empty():
            return None
        return TurnType.USER if self.is_next_turn_assistant() else TurnType.ASSISTANT
    
    def clear(self):
        """Clears all conversation history."""
        self._message_lists.clear()
    
    def is_empty(self) -> bool:
        """Checks if the conversation history is empty."""
        return len(self._message_lists) == 0
    
    def get_last_n_turns(self, n: int) -> list[list[GeneralContentBlock]]:
        """Returns the last n turns from the conversation."""
        if n <= 0:
            return []
        return self._message_lists[-n:]
    
    def to_dict(self) -> dict:
        """Returns a dictionary representation of the history."""
        return {
            'message_lists': [
                [message.to_dict() for message in message_list]
                for message_list in self._message_lists
            ],
            'turn_count': self.get_turn_count(),
            'next_turn_type': self.get_current_turn_type().value if self.get_current_turn_type() else None,
            'recovery_enabled': self._recovery_enabled
        }
    
    def __str__(self) -> str:
        """JSON representation of the history."""
        try:
            return json.dumps(self.to_dict(), indent=2)
        except Exception as e:
            return f"[Error serializing history: {e}]"
    
    def get_summary(self, max_str_len: int = 100) -> str:
        """Returns a truncated summary of the conversation history."""
        def truncate_strings(obj):
            if isinstance(obj, str):
                return obj[:max_str_len] + "..." if len(obj) > max_str_len else obj
            elif isinstance(obj, dict):
                return {k: truncate_strings(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [truncate_strings(item) for item in obj]
            return obj
        
        try:
            truncated_data = truncate_strings(self.to_dict())
            return json.dumps(truncated_data, indent=2)
        except Exception as e:
            return f"[Error serializing summary: {e}]"
    
    def __iter__(self) -> Iterator[list[GeneralContentBlock]]:
        """Allows iteration over message turns."""
        return iter(self._message_lists)
    
    def __len__(self) -> int:
        """Returns the number of turns."""
        return len(self._message_lists)
    
    def __getitem__(self, index: int) -> list[GeneralContentBlock]:
        """Allows indexing into message turns."""
        return self._message_lists[index]
    
    # Private helper methods
    def _build_user_turn(self, prompt: str, image_blocks: list[dict[str, Any]] | None) -> list[GeneralContentBlock]:
        """Builds a user turn from prompt and optional images."""
        user_turn = []
        if image_blocks:
            for img_block in image_blocks:
                user_turn.append(ImageBlock(type="image", source=img_block["source"]))
        user_turn.append(TextPrompt(prompt))
        return user_turn
    
    def _validate_message_types(self, messages: list[GeneralContentBlock], valid_types: tuple, turn_type: str):
        """Validates that all messages are of valid types for the turn."""
        for msg in messages:
            if not isinstance(msg, valid_types):
                raise TypeError(f"Invalid message type for {turn_type} turn: {type(msg)}")
    
    def _convert_to_tool_action(self, tool_call: ToolCall) -> ToolAction:
        """Converts a ToolCall to a ToolAction."""
        return ToolAction(
            tool_call_id=tool_call.tool_call_id,
            tool_name=tool_call.tool_name,
            tool_input=tool_call.tool_input,
        )
    
    def _is_empty(self) -> bool:
        """Internal helper to check if history is empty."""
        return len(self._message_lists) == 0
    
    def _get_last_turn(self) -> list[GeneralContentBlock]:
        """Gets the last turn from the conversation."""
        if self._is_empty():
            return []
        return self._message_lists[-1]
    
    def set_message_list(self, message_list: list[list[GeneralContentBlock]]):
        """Sets the entire message list (use with caution)."""
        self._message_lists = message_list