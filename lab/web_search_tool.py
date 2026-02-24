from llm.message_history import MessageHistory
from lab.base import (
    AgentPlugin,
    AgentImplOutput,
)
import os
from lab.web_search_client import create_search_client
from typing import Any, Optional


class WebSearchTool(AgentPlugin):
    name = "web_search"
    description = """Performs a web search using a search engine API and returns the search results."""
    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query to perform."},
        },
        "required": ["query"],
    }
    output_type = "string"

    def __init__(self, key_part=None, plan=None, max_results=10, **kwargs):
        self.max_results = max_results
        self.plan = plan
        print(key_part,plan,"key_part from web search tool")
        # Handle API key based on plan
        if plan == "custom_api":
            if not key_part:
                raise ValueError("API key is required for custom_api plan")
            self.key_part = key_part
        else:
            # For non-custom plans, use environment variable (don't pass api_key)
            self.key_part = os.environ.get("TAVILY_API_KEY_SEARCH", "")
        
        # Pass the key_part to the search client only if needed
        client_kwargs = kwargs.copy()
        if self.key_part is not None:
            client_kwargs['key_part'] = self.key_part
            
        self.web_search_client = create_search_client(
            max_results=max_results, 
            **client_kwargs
        )

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        query = tool_input["query"]
        try:
            output = await self.web_search_client.forward(query)
            return AgentImplOutput(
                output,
                f"Search Results with query: {query} successfully retrieved using {self.web_search_client.name}",
                auxiliary_data={"success": True},
            )
        except Exception as e:
            return AgentImplOutput(
                f"Error searching the web with {self.web_search_client.name}: {str(e)}",
                f"Failed to search the web with query: {query}",
                auxiliary_data={"success": False},
            )