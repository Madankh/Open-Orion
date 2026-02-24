from typing import Any, Optional
from llm.message_history import MessageHistory
from lab.base import AgentPlugin, AgentImplOutput
from pydantic import BaseModel



class MessageTool(AgentPlugin):
    name = "MessageToUser"

    description = """\
       Send a message to the user. This tool is your primary way to communicate during task execution. Use it to maintain transparency, guide understanding, and adapt your behavior based on user interaction.
       
       You can use this tool for:
       -  **Sharing reasoning**: Explain your current thoughts, decision-making process, or next steps.
       -  **Asking questions**: Request clarification, follow-up information, or user preferences.
       -  **Acknowledging input**: Confirm receipt of user input or commands.
       -  **Providing updates**: Report progress, intermediate results, or changes in plan.
       -  **Task completion**: Notify the user when a task or subtask is finished.
       -  **Issue reporting**: Communicate errors, unexpected behavior, or external limitations.
       
       **Best Practices**:
       - Be clear and concise.
       - Use plain language unless technical detail is needed.
       - Match tone to context (professional, casual, encouraging, etc.).
       - Avoid over-using unless necessary; prefer meaningful updates.
       """
    
    input_schema = {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "The message to send to the user"},
        },
        "required": ["text"],
    }

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        assert tool_input["text"], "Model returned empty message"
        msg = "Sent message to user"
        return AgentImplOutput(msg, msg, auxiliary_data={"success": True})