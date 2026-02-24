# import package
from abc import ABC, abstractmethod
import json
from dataclasses import dataclass
from typing import Any,Tuple,Union
from dataclasses_json import DataClassJsonMixin
from typing import Literal

import logging

logging.getLogger('httpx').setLevel(logging.WARNING)

# Flow  of the program 
# 1 ) Tool paramaters
# 2 ) Tool Definition
# 3 ) Tool call (LLM request to use a tool)
# 4 ) Tool results (what tools returns)
@dataclass
class ToolAction:
    tool_call_id : str
    tool_name : str
    tool_input:Any

@dataclass
class ToolDescriptor(DataClassJsonMixin):
    """Internal representation of llm tool"""
    name:str
    description:str
    input_schema:dict[str, Any]

@dataclass
class ToolCall(DataClassJsonMixin):
    tool_call_id:str
    tool_name:str
    tool_input:Any

    def __str__(self)->str:
        return f"{self.tool_name} with input:{self.tool_input}"

@dataclass
class AgentResult(DataClassJsonMixin):
    tool_call_id:str
    tool_name:str
    tool_result:Any

@dataclass 
class AgentFormattedResult(DataClassJsonMixin):
    tool_call_id:str
    tool_name:str
    tool_result: list[dict[str, Any]] | str
    # logic flow 
    # 1) check the type of tool_result
    # 2) if tool_result is a list 
    def __str__(self) ->str:
        if isinstance(self.tool_result, list):
            parts=[]
            for item in self.tool_result:
                if isinstance(item,dict):
                    if item.get("type") == "image":
                        source=item.get("source",{})
                        image_type = source.get("media_type","image/unknown")
                        parts.append(f"[Image attached - {image_type}]")
                    elif item.get("type") == "text":
                        parts.append(item.get("text" , ""))
                    else:
                        parts.append(str(item))
                else:
                    parts.append(str(item))
            return "\n".join(parts)
        else:
            return f"Name :  {self.tool_name}\nOutput:{self.tool_result}"
    
@dataclass    
class TextPrompt(DataClassJsonMixin):
    text:str

@dataclass
class ImageBlock(DataClassJsonMixin):
    type:Literal["image"]
    source:dict[str,Any]

    def __str__(self) -> str:
        source = self.source
        media_type = source.get("media_type", "image/unknown")
        source_type = source.get("type", "unknown")

        if source_type == "base64":
            return f"[Image attached - {media_type}]"
        else:
            return f"[Image attached - {media_type}, source : {source_type}]"
@dataclass
class AgentThinkingBlock(DataClassJsonMixin):
    content:str

@dataclass
class TextResult(DataClassJsonMixin):
    text:str

AgentContentBlock = Union[TextResult, ToolCall, AgentThinkingBlock]
UserContentBlock =  Union[TextPrompt, AgentFormattedResult, ImageBlock] 
GeneralContentBlock = Union[UserContentBlock, AgentContentBlock]
AssistantContentBlock = AgentContentBlock
LLMMessages = list[list[GeneralContentBlock]]


class LLMClient(ABC):

    @abstractmethod
    async def generate(
        self,
        messages: LLMMessages,
        max_tokens: int,
        system_prompt: str | None = None,
        temperature: float = 0.0,
        tools: list[ToolDescriptor] = [],
        tool_choice: dict[str, str] | None = None,
        thinking_tokens: int | None = None
    ) -> Tuple[list[AgentContentBlock], dict[str, Any]]:
        raise NotImplementedError
    

def recursively_remove_invoke_tag(obj):
    """Recursively remove the </invoke> tag from a dictionary or list."""
    result_obj = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            result_obj[key] = recursively_remove_invoke_tag(value)
    elif isinstance(obj, list):
        result_obj = [recursively_remove_invoke_tag(item) for item in obj]
    elif isinstance(obj, str):
        if "</invoke>" in obj:
            result_obj = json.loads(obj.replace("</invoke>", ""))
        else:
            result_obj = obj
    else:
        result_obj = obj
    return result_obj