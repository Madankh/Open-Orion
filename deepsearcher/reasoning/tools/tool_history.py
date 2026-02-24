# from ii researcher
from typing import List, Set

class ToolHistory:
    """Tracks history of tool usage including visited URLs and search queries."""

    def __init__(self):
        """Initialize empty sets for tracking URLs and queries."""
        self._visited_urls: Set[str] = set()
        self._searched_queries: Set[str] = set()

    def add_visited_urls(self, urls: List[str]) -> None:
        """Add URLs to the set of visited URLs.

        Args:
            urls: List of URLs to add
        """
        self._visited_urls.update(urls)

    def add_searched_queries(self, queries: List[str]) -> None:
        """Add search queries to the set of searched queries.

        Args:
            queries: List of search queries to add
        """
        self._searched_queries.update(queries)

    def get_visited_urls(self) -> List[str]:
        """Get list of all visited URLs.

        Returns:
            List of visited URLs
        """
        return self._visited_urls

    def get_searched_queries(self) -> List[str]:
        """Get list of all searched queries.

        Returns:
            List of searched queries
        """
        return self._searched_queries
