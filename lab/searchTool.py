"""
Context Retrieval Tool - Time-based retrieval from blocks
"""

from typing import Any, Dict, List, Optional
from lab.base import AgentPlugin, AgentImplOutput
import logging

class RetrieveContextTool(AgentPlugin):
    """
    Tool that allows the agent to retrieve historical context from work item blocks.
    Agent decides when and what context to fetch.
    """
    
    name = "retrieve_context"
    description = """
    Retrieve historical context from previous work sessions.
    
    USE CASES (Choose the matching pattern):
    - "What did I work on?" → mode: recent, n_days: 3
    - "What is my goal?" → mode: recent, n_days: 1
    - "Show my progress" → mode: recent, n_days: 7
    - "What did I do yesterday?" → mode: recent, n_days: 1
    - "What did I do last week?" → mode: recent, n_days: 7
    - "Find work about machine learning" → mode: search, keyword: "machine learning"
    - "When did I learn about caching?" → mode: search, keyword: "caching"
    - "I think I learn about caching?" → mode: search, keyword: "caching"
    - "What about API design?" → mode: search, keyword: "API design"
    - "Show work from October 29 to October 31" → mode: date_range, start_date: "2025-10-29", end_date: "2025-10-31"
    - "Give me an overview" → mode: smart_context (automatic recent + relevant)
    
    MODES:
    - recent: Shows everything from last N days (DEFAULT for most questions)
    - search: Find keywords in block content (text, youtube notes, kanban, etc)
    - smart_context: Intelligent retrieval - recent days + relevant matches (best for "catch me up")
    - date_range: For explicit date queries
    
    ⚠️ DEFAULT: 
    - General questions → 'recent' mode with n_days=1-3
    - Topic searches → 'search' mode (searches all block content)
    - "Catch me up" → 'smart_context' mode
    """

    input_schema = {
        "type": "object",
        "properties": {
            "mode": {
                "type": "string",
                "enum": ["recent", "date_range", "search", "smart_context"],
                "description": "ALWAYS start with 'recent' unless you have a specific reason to use another mode."
            },
            "n_days": {
                "type": "integer",
                "description": "Number of recent days to fetch (for 'recent' mode). Default: 3",
                "default": 3
            },
            "start_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format (for 'date_range' mode)"
            },
            "end_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format (for 'date_range' mode)"
            },
            "keyword": {
                "type": "string",
                "description": "Keyword to search for (for 'search' or 'smart_context' modes). Searches across all block types."
            }
        },
        "required": ["mode"]
    }
    
    def __init__(self, db_manager, session_id: str, user_id: str, logger: logging.Logger):
        """
        Initialize the context retrieval tool.
        
        Args:
            db_manager: DatabaseManager instance
            session_id: Current session ID
            user_id: Current user ID
            logger: Logger instance
        """
        super().__init__()
        self.db_manager = db_manager
        self.session_id = session_id
        self.user_id = user_id
        self.logger = logger
    
    async def run_impl(self, tool_input: dict[str, Any], message_history: Optional[Any] = None) -> AgentImplOutput:
        """
        Execute the context retrieval based on mode.
        
        Args:
            tool_input: Dictionary containing mode and parameters
            message_history: Optional message history (not used)
            
        Returns:
            AgentImplOutput with formatted context
        """
        mode = tool_input.get("mode", "recent")
        
        try:
            context_result = None
            metadata = {"mode": mode}
            
            if mode == "recent":
                n_days = tool_input.get("n_days", 3)
                context_result = await self._get_recent_context(n_days)
                metadata["n_days"] = n_days
            
            elif mode == "date_range":
                start_date = tool_input.get("start_date")
                end_date = tool_input.get("end_date")
                
                if not start_date or not end_date:
                    error_msg = "Error: Both start_date and end_date are required for date_range mode."
                    return AgentImplOutput(
                        tool_output=error_msg,
                        tool_result_message=error_msg
                    )
                
                context_result = await self._get_date_range_context(start_date, end_date)
                metadata.update({"start_date": start_date, "end_date": end_date})
            
            elif mode == "search":
                keyword = tool_input.get("keyword")
                
                if not keyword:
                    error_msg = "Error: keyword is required for search mode."
                    return AgentImplOutput(
                        tool_output=error_msg,
                        tool_result_message=error_msg
                    )
                
                context_result = await self._get_smart_context(keyword)
                metadata.update({"keyword": keyword})
            
            elif mode == "smart_context":
                keyword = tool_input.get("keyword", "")
                context_result = await self._get_smart_context(keyword)
                metadata["keyword"] = keyword if keyword else "none (recent only)"
            
            else:
                error_msg = f"Error: Unknown mode '{mode}'. Valid modes: recent, date_range, search, smart_context"
                return AgentImplOutput(
                    tool_output=error_msg,
                    tool_result_message=error_msg
                )
            
            # Return successful result
            return AgentImplOutput(
                tool_output=context_result,
                tool_result_message="Context retrieved successfully",
                auxiliary_data={
                    **metadata,
                    "context_length": len(context_result)
                }
            )
        
        except Exception as e:
            self.logger.error(f"Context retrieval failed: {str(e)}", exc_info=True)
            error_msg = f"Error retrieving context: {str(e)}"
            return AgentImplOutput(
                tool_output=error_msg,
                tool_result_message=error_msg,
                auxiliary_data={"error": str(e)}
            )
    
    async def _get_recent_context(self, n_days: int) -> str:
        """Fetch blocks from last N days."""
        from datetime import datetime, timedelta
        
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=n_days)
        
        blocks = await self.db_manager.get_blocks_by_date_range(
            session_id=self.session_id,
            user_id=self.user_id,
            start_date=start_date.isoformat(),
            end_date=end_date.isoformat()
        )
        
        if not blocks:
            return f"No blocks found in the last {n_days} day(s)."
        
        return self._format_blocks(blocks, f"Last {n_days} day(s)")
    
    async def _get_date_range_context(self, start_date: str, end_date: str) -> str:
        """Fetch blocks for a specific date range."""
        blocks = await self.db_manager.get_blocks_by_date_range(
            session_id=self.session_id,
            user_id=self.user_id,
            start_date=start_date,
            end_date=end_date
        )
        
        if not blocks:
            return f"No blocks found between {start_date} and {end_date}."
        
        return self._format_blocks(blocks, f"{start_date} to {end_date}")
    
    async def _search_blocks(self, keyword: str) -> str:
        """Search blocks by keyword."""
        blocks = await self.db_manager.search_blocks_by_content(
            session_id=self.session_id,
            user_id=self.user_id,
            keyword=keyword
        )
        
        if not blocks:
            return f"No results found for '{keyword}'."
        
        # Limit to 20 most recent matches
        limited_blocks = blocks[:20]
        
        return self._format_blocks(
            limited_blocks,
            f"Search results for '{keyword}' (found {len(blocks)}, showing {len(limited_blocks)})",
            highlight_keyword=keyword
        )
    
    async def _get_smart_context(self, keyword: str = "") -> str:
        """Intelligent context retrieval - combines recent + relevant history."""
        context_data = await self.db_manager.get_smart_context(
            session_id=self.session_id,
            user_id=self.user_id,
            keyword=keyword
        )
        
        recent_blocks = context_data.get("recent_context", [])
        relevant_blocks = context_data.get("relevant_context", [])
        stats = context_data.get("stats", {})
        
        # Build response
        sections = []
        
        if recent_blocks:
            sections.append(
                self._format_blocks(
                    recent_blocks, 
                    "📌 RECENT CONTEXT (Last 7 days)"
                )
            )
        
        if relevant_blocks:
            sections.append(
                self._format_blocks(
                    relevant_blocks, 
                    f"🔍 RELEVANT HISTORY (matching '{keyword}')",
                    highlight_keyword=keyword
                )
            )
        
        if not sections:
            return "No context available yet."
        
        return "\n\n".join(sections) 
    
    def _format_blocks(
        self, 
        blocks: List[Dict], 
        title: str,
        highlight_keyword: str = ""
    ) -> str:
        """Format blocks into readable context."""
        if not blocks:
            return "No blocks available."
        
        lines = [
            f"📚 {title}",
            f"Found {len(blocks)} block(s)\n",
            "=" * 70
        ]
        
        for block in blocks:
            block_type = block.get("type", "unknown")
            created_at = block.get("created_at", "Unknown")
            
            lines.append(f"\n🔹 Type: {block_type} | Created: {created_at}")
            lines.append("-" * 70)
            
            # Format based on block type
            if block_type == "text":
                content = block.get("content", "")[:500]  # Limit length
                lines.append(f"📝 {content}")
            
            elif block_type == "youtube":
                title_text = block.get("title", "YouTube Video")
                timestamps = block.get("timestamps", [])
                lines.append(f"🎥 {title_text}")
                if timestamps:
                    lines.append("  Timestamps:")
                    for ts in timestamps[:5]:  # Show first 5
                        note = ts.get("note", "")
                        timestamp = ts.get("timestamp", 0)
                        lines.append(f"    [{timestamp}s] {note}")
            
            elif block_type == "table":
                data = block.get("data", [])
                lines.append(f"📊 Table with {len(data)} rows")
                if data:
                    # Show header
                    lines.append(f"  Header: {' | '.join(str(c) for c in data[0])}")
            
            elif block_type == "code":
                language = block.get("language", "")
                content = block.get("content", "")[:200]
                lines.append(f"💻 Code ({language})")
                lines.append(f"  {content}...")
            
            elif block_type == "kanban":
                board_title = block.get("boardTitle", "Kanban Board")
                columns = block.get("columns", [])
                lines.append(f"📋 {board_title}")
                for col in columns:
                    col_title = col.get("title", "")
                    cards = col.get("cards", [])
                    lines.append(f"  [{col_title}]: {len(cards)} card(s)")
                    for card in cards[:3]:  # Show first 3 cards
                        card_title = card.get("title", "")
                        card_desc = card.get("description", "")
                        lines.append(f"    - {card_title}: {card_desc}")
            
            elif block_type in ["bullet", "numbered-list"]:
                content = block.get("content", "")[:300]
                lines.append(f"• {content}")
            
            lines.append("")  # Empty line between blocks
        
        lines.append("=" * 70)
        
        if highlight_keyword:
            lines.append(f"\n💡 TIP: Results contain mentions of '{highlight_keyword}'")
        
        return "\n".join(lines)
    
    def get_tool_param(self):
        """Return tool descriptor for LLM."""
        from llm.base import ToolDescriptor
        return ToolDescriptor(
            name=self.name,
            description=self.description,
            input_schema=self.input_schema
        )