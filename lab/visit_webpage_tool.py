from lab.base import (
    AgentPlugin,
    AgentImplOutput
)
import os
from typing import Any, Optional
from llm.message_history import MessageHistory
from lab.visit_webpage_client import (
    create_visit_client,
    WebpageVisitException,
    ContentExtractionError,
    NetworkError
)

from utilss.constants import VISIT_WEB_PAGE_MAX_OUTPUT_LENGTH

class VisitWebpageTool(AgentPlugin):
    name = "visit_webpage"
    description = "You should call this tool when you need to visit a webpage and extract its content. Returns webpage content as text."
    input_schema = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The url of the webpage to visit.",
            }
        },
        "required": ["url"],
    }
    output_type = "string"

    def __init__(self, max_output_length: int = VISIT_WEB_PAGE_MAX_OUTPUT_LENGTH, key_part=None, plan=None, **kwargs):
        super().__init__()
        self.plan = plan
        self.max_output_length = max_output_length
        
        # Handle API key based on plan
        if plan == "custom_api":
            if not key_part:
                raise ValueError("API key is required for custom_api plan")
            self.key_part = key_part
        else:
            # For non-custom plans, use environment variable (don't pass key_part)
            self.key_part = os.environ.get("TAVILY_API_KEY_SEARCH", "")
        
        # Pass both plan and key_part to the visit client
        client_kwargs = kwargs.copy()
        client_kwargs['plan'] = plan
        if self.key_part is not None:
            client_kwargs['key_part'] = self.key_part
        
        self.visit_client = create_visit_client(
            max_output_length=max_output_length,
            **client_kwargs
        )

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        url = tool_input["url"]
        if "arxiv.org/abs" in url:
            url = "https://arxiv.org/html/" + url.split("/")[-1]

        try:
            output = await self.visit_client.forward(url)
            return AgentImplOutput(
                output,
                f"Webpage {url} successfully visited using {self.visit_client.name}",
                auxiliary_data={"success": True},
            )

        except ContentExtractionError:
            error_msg = f"Failed to extract content from {url} using {self.visit_client.name} tool. Please visit the webpage in a browser to manually verify the content or confirm that none is available."
            return AgentImplOutput(
                error_msg,
                f"Failed to extract content from {url}",
                auxiliary_data={"success": False},
            )

        except NetworkError:
            error_msg = f"Failed to access {url} using {self.visit_client.name} tool. Please check if the URL is correct and accessible from your browser."
            return AgentImplOutput(
                error_msg,
                f"Failed to access {url} due to network error",
                auxiliary_data={"success": False},
            )

        except WebpageVisitException:
            error_msg = f"Failed to visit {url} using {self.visit_client.name} tool. Please visit the webpage in a browser to manually verify the content."
            return AgentImplOutput(
                error_msg,
                f"Failed to visit {url}",
                auxiliary_data={"success": False},
            )