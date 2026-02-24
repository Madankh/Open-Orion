import json
import logging
from abc import ABC, abstractmethod
from typing import final
from llm.base import (
    GeneralContentBlock,
    TextPrompt,
    TextResult,
    ToolCall,
    AgentFormattedResult,
    ImageBlock
)

from llm.token_counter import TokenCounter
from llm.base import (
    AgentThinkingBlock
)

from utilss.constants import TOKEN_BUDGET

class ContextManager(ABC):
    """Abstract base class for context management strategies."""

    def __init__(
        self,
        token_counter: TokenCounter,
        logger: logging.Logger,
        token_budget: int = TOKEN_BUDGET,
    ):
        self.token_counter = token_counter
        self.logger = logger
        self._token_budget  = token_budget

    @property
    def token_budget(self)->int:
        """Return the token budget"""
        return self._token_budget
    
    def count_tokens(self,message_lists:list[list[GeneralContentBlock]])->int:
        """Counts tokens , ignoring thinking blokcs except in the very last message"""
        total_token = 0
        num_turns = len(message_lists)
        for i, message_lists in enumerate(message_lists):
            is_last_turn = i == num_turns - 1
            for message in message_lists:
                if isinstance(message, (TextPrompt, TextResult)):
                    total_token += self.token_counter.count_tokens(message.text)
                elif isinstance(message, AgentFormattedResult):
                    total_token += self.token_counter.count_tokens(message.tool_result)
                elif isinstance(message, ToolCall):
                    try:
                        input_str = json.dumps(message.tool_input)
                        total_token += self.token_counter.count_tokens(input_str)
                    except TypeError:
                        self.logger.warning(
                            f"Could not serialize tool input for token counting: {message.tool_input}"
                        )
                        total_token += 100
                elif isinstance(message, AgentThinkingBlock):
                    if is_last_turn:
                        total_token += self.token_counter.count_tokens(message.content)
    
                else:
                    self.logger.warning(
                        f"Unhandled message type for token counting: {type(message)}"
                    )
        return total_token
    
    @abstractmethod
    def apply_truncation_if_needed(
        self,message_lists:list[list[GeneralContentBlock]]
    )->list[list[GeneralContentBlock]]:
        """apply trucation to message lists if needed"""
        pass
