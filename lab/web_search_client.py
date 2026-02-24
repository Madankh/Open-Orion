import json
import os
import requests
# import utllib
from .impotantutils import truncate_content


class BaseSearchClient:
    """
    A base class for search clients.
    """
    max_results: int
    name: str
    
    async def forward(self, query: str) -> str:
        raise NotImplementedError("Subclasses must implement this method.")


class TavilySearchClient(BaseSearchClient):
    """
    A client for the Tavily search engine.
    """
    
    def __init__(self, max_results=6, key_part=None, **kwargs):
        self.max_results = max_results
        self.name = "Tavily"
        
        # Simply use whatever key_part is passed (could be None)
        self.key_part = key_part
        
        if not self.key_part:
            raise ValueError("No API key provided")

    async def forward(self, query: str) -> str:
        try:
            from tavily import AsyncTavilyClient
        except ImportError as e:
            raise ImportError("You must install package tavily to run this tool")
        
        try:
            tavily_client = AsyncTavilyClient(api_key=self.key_part)
            response = await tavily_client.search(query=query, max_results=self.max_results)
            
            if not response or "results" not in response or not response["results"]:
                return f"No search results found for query: {query}"
            
            formatted_results = json.dumps(response["results"], indent=4)
            return truncate_content(formatted_results)
        except Exception as e:
            return f"Error searching with search tool Tavily: {str(e)}"


def create_search_client(max_results=10, plan=None, key_part=None, **kwargs) -> BaseSearchClient:
    # print(key_part,plan,"TavilySearchClient")
    # if plan == "custom_api":
    #     # For custom_api plan, use provided key_part
    #     if not key_part:
    #         raise ValueError("API key is required for custom_api plan")
    final_api_key = key_part
    # else:
    #     # For other plans, use environment variable
    #     final_api_key = os.environ.get("TAVILY_API_KEY_SEARCH", "")
    #     if not final_api_key:
    #         raise ValueError("TAVILY_API_KEY environment variable not set")
    
    return TavilySearchClient(max_results=max_results, key_part=final_api_key, **kwargs)