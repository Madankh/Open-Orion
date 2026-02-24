import asyncio
import aiohttp
from .impotantutils import truncate_content
import os

class WebpageVisitException(Exception):
    pass

class ContentExtractionError(WebpageVisitException):
    pass

class NetworkError(WebpageVisitException):
    pass


class BaseVisitClient:
    name: str = "Base"
    max_output_length: int

    async def forward(self, url: str) -> str:
        raise NotImplementedError("Subclasses must implement this method")


class MarkdownifyVisitClient(BaseVisitClient):
    name = "Markdownify"

    def __init__(self, max_output_length: int = 40000, **kwargs):
        self.max_output_length = max_output_length

    async def forward(self, url: str) -> str:
        try:
            import re
            from markdownify import markdownify
        except ImportError:
            raise WebpageVisitException("Required packages 'markdownify' not installed")

        try:
            timeout = aiohttp.ClientTimeout(total=20)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    if response.status != 200:
                        raise NetworkError(f"HTTP status {response.status}")
                    html = await response.text()
        except asyncio.TimeoutError:
            raise NetworkError("The request timed out")
        except aiohttp.ClientError as e:
            raise NetworkError(f"Network error: {str(e)}")

        markdown_content = markdownify(html).strip()
        markdown_content = re.sub(r"\n{3,}", "\n\n", markdown_content)

        if not markdown_content:
            raise ContentExtractionError("No content found in the webpage")

        return truncate_content(markdown_content, self.max_output_length)


class TavilyVisitClient(BaseVisitClient):
    name = "Tavily"

    def __init__(self, max_output_length: int = 40000, key_part=None, **kwargs):
        self.max_output_length = max_output_length
        
        # # Use provided API key or environment variable
        # self.key_part = key_part or os.environ.get("TAVILY_API_KEY", "")
        self.key_part = key_part
        # if not self.key_part:
        #     raise WebpageVisitException("No API key provided and TAVILY_API_KEY environment variable not set")

    async def forward(self, url: str) -> str:
        try:
            from tavily import AsyncTavilyClient
        except ImportError as e:
            raise ImportError("You must install package 'tavily'") from e

        tavily_client = AsyncTavilyClient(api_key=self.key_part)
        response = await tavily_client.extract(
            url, include_images=True, extract_depth="advanced"
        )

        if not response or "results" not in response or not response["results"]:
            return f"No content could be extracted from {url}"

        data = response["results"][0]
        content = data.get("raw_content", "")
        images = data.get("images", [])

        if images:
            image_markdown = "\n\n### Images:\n"
            for i, img_url in enumerate(images):
                image_markdown += f"![Image {i + 1}]({img_url})\n"
            content += image_markdown

        return truncate_content(content, self.max_output_length)


def create_visit_client(max_output_length: int = 40000, plan=None, key_part=None, **kwargs) -> BaseVisitClient:
    # Check plan and decide which client to use
    if plan == "custom_api":
        # For custom_api plan, use Tavily with provided key_part
        if not key_part:
            raise ValueError("API key is required for custom_api plan")
        print("Using Tavily to visit webpage (custom API)")
        return TavilyVisitClient(max_output_length=max_output_length, key_part=key_part, **kwargs)
    else:
        # For other plans, check environment variable first, then fallback to Markdownify
        env_api_key = os.environ.get("TAVILY_API_KEY_SEARCH", "")
        if env_api_key:
            print("Using Tavily to visit webpage (environment variable)")
            return TavilyVisitClient(max_output_length=max_output_length, key_part=env_api_key, **kwargs)
        else:
            print("Using Markdownify to visit webpage")
            return "VISIT WEBSITE TOKEN MISSING PLEASE ENTER THAT "
            # return MarkdownifyVisitClient(max_output_length=max_output_length, **kwargs)