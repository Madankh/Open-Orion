from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional
import jsonschema
from typing_extensions import final
from llm.base import ToolDescriptor
from llm.message_history import MessageHistory

ToolInputSchema = dict[str, Any]

@dataclass
class AgentImplOutput:
    """Output from an llm tool implementation"""
    tool_output: list[dict[str,Any]] | str
    tool_result_message: str
    auxiliary_data: dict[str,Any] = field(default_factory=dict)

class AgentPlugin(ABC):
    """A tool that fits into the standard llm tool-calling paradigm"""
    
    # These should be defined as class attributes in subclasses
    name: str
    description: str
    input_schema: ToolInputSchema
    
    def __init__(self):
        # Validate that subclass has defined the required class attributes
        if not hasattr(self, 'name') or not self.name:
            raise ValueError(f"{self.__class__.__name__} must define 'name' class attribute")
        if not hasattr(self, 'description') or not self.description:
            raise ValueError(f"{self.__class__.__name__} must define 'description' class attribute")
        if not hasattr(self, 'input_schema') or not self.input_schema:
            raise ValueError(f"{self.__class__.__name__} must define 'input_schema' class attribute")

    ## Control flow property
    @property
    def should_stop(self) -> bool:
        return False

    @final
    async def run(self, tool_input: dict[str, Any], message_history: Optional[MessageHistory] = None) -> str | list[dict[str, Any]]:
        if message_history:
            assert message_history.is_next_turn_user()

        try:
            self._validate_tool_input(tool_input)
            result = await self.run_impl(tool_input, message_history)
            tool_result = result
        except jsonschema.ValidationError as exc:
            tool_result = "Invalid tool input: " + exc.message
        except Exception as exc:
            raise RuntimeError("Bad request: " + str(exc))
        return tool_result

    def get_tool_start_message(self, tool_input: ToolInputSchema) -> str:
        """Return a user-friendly message to be shown to the model when the tool is called"""
        return f"calling tool {self.name}"

    @abstractmethod
    async def run_impl(self, tool_input: dict[str, Any], message_history: Optional[MessageHistory] = None) -> AgentImplOutput:
        raise NotImplementedError()

    def get_tool_param(self) -> ToolDescriptor:
        return ToolDescriptor(
            name=self.name,
            description=self.description,
            input_schema=self.input_schema
        )

    def _validate_tool_input(self, tool_input: dict[str, Any]) -> None:
        jsonschema.validate(instance=tool_input, schema=self.input_schema)