import copy
import logging
from llm.base import GeneralContentBlock, ToolCall, AgentFormattedResult
from llm.context_manager.base import ContextManager
from llm.token_counter import TokenCounter
from  termcolor  import colored

class StandardContextManager(ContextManager):
    TRUNCATED_TOOL_OUTPUT_MSG = (
    "[Truncated...re-run tool if you need to see output again.]"
    )
    TRUNCATED_TOOL_INPUT_MSG = (
        "[Truncated...re-run tool if you need to see input/output again.]"
    )

    def __init__(self,
                token_counter:TokenCounter, 
                logger:logging.Logger, 
                token_budget:int=32_000,
                truncate_keep_n_turns:int=3 
                ):
        super().__init__(token_counter, logger, token_budget)
        self.truncate_keep_n_turns = max(1,truncate_keep_n_turns)
        self.truncate_history_token_savings:list[int] = []

    def apply_truncation_if_needed(
            self, 
            message_lists:list[list[GeneralContentBlock]]
            ) -> list[list[GeneralContentBlock]]:
        """Applies truncation strategy if token count exceeds budget"""
        current_tokens = self.count_tokens(message_lists)
        if current_tokens <= self._token_budget:
            return message_lists
        
        self.logger.warning(
            f"Token count {current_tokens} exceeds budget {self._token_budget}."
            f"Truncating history, keeping last {self.truncate_keep_n_turns} turn"
        )
        print(
            f"Token count {current_tokens} exceeds budget {self._token_budget}. "
            f"Truncating history, keeping last {self.truncate_keep_n_turns} turns.",
            "yellow",
        )

        # make deep copy to modify
        truncated_message_lists=copy.deepcopy(message_lists)
        truncation_point = len(truncated_message_lists) - self.truncate_keep_n_turns

        #apply  generic  truncation to older turns message
        for i in range(truncation_point):
            for message in truncated_message_lists[i]:
                if isinstance(message, AgentFormattedResult):
                    message.tool_result = self.TRUNCATED_TOOL_OUTPUT_MSG
                    if message.tool_name == "sequential_thinking":
                        message.tool_result["thought"] = self.TRUNCATED_TOOL_INPUT_MSG
                    elif message.tool_name == "str_replace_editor":
                        if "file_text" in message.tool_result:
                            message.tool_result["file_text"] = (
                                self.TRUNCATED_TOOL_INPUT_MSG
                            )
                        if "old_str" in message.tool_result:
                            message.tool_result["old_str"] = (
                                self.TRUNCATED_TOOL_INPUT_MSG
                            )
                        if "new_str" in message.tool_result:
                            message.tool_result["new_str"] = (
                                self.TRUNCATED_TOOL_INPUT_MSG
                            )
                        
        

        new_token_count = self.count_tokens(truncated_message_lists)
        tokens_saved = current_tokens - new_token_count
        self.logger.info(
            f"Truncation saved ~{tokens_saved} tokens. New count: {new_token_count}"
        )
        print(
            colored(
                f" [ContextManager] Token count after truncation: {new_token_count}",
                "yellow",
            )
        )

        return truncated_message_lists