from typing import Any, Optional
from lab.base import AgentPlugin, AgentImplOutput
from llm.message_history import MessageHistory


class CompleteTool(AgentPlugin):
    name = "complete"
    """The model should call this tool when it is done with the task."""

    description = "Call this tool when you are done with the task, and supply your answer or summary."
    input_schema = {
        "type": "object",
        "properties": {
            "answer": {
                "type": "string",
                "description": "The answer to the question, or final summary of actions taken to accomplish the task.",
            },
        },
        "required": ["answer"],
    }

    def __init__(self):
        super().__init__()
        self.answer: str = ""

    @property
    def should_stop(self):
        return self.answer != ""

    def reset(self):
        self.answer = ""

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        assert tool_input["answer"], "Model returned empty answer"
        self.answer = tool_input["answer"]
        return AgentImplOutput(tool_output=self.answer, tool_result_message=self.answer
    )

    def get_tool_start_message(self, tool_input: dict[str, Any]) -> str:
        return ""

class ReturnControlToUserTool(AgentPlugin):
    name = "return_control_to_user"
    description = "Return control back to the user. Use this tool when you are done with the task or after asking questions to user and waiting for their response. Use this tool when:\n You have completed your task or delivered the requested output\n You have asked a question or provided options and need the user to choose\n You are waiting for the user's response, input, or confirmation\n You want to pause to allow the user to review, reflect, or take the next action\nThis tool signals a handoff point, indicating that further action is expected from the user."
    input_schema = {
        "type": "object",
        "properties": {},
        "required": [],
    },
        
    def __init__(self):
        self.answer: str = ""

    @property
    def should_stop(self):
        return self.answer != ""

    def reset(self):
        self.answer = ""

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        self.answer = "Task completed"
        return AgentImplOutput(
            tool_result="Task completed",
            tool_result_message="Task completed",
        )

    def get_tool_start_message(self, tool_input: dict[str, Any]) -> str:
        return ""
