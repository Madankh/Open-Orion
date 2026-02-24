import json
import logging
from typing import List, Dict, Any
from Mongodb.db import DatabaseManager
from Streamllm import SummarizationLLM


class MemoryManager:
    """High-level memory management with LLM integration"""
    
    def __init__(
        self,
        storage: DatabaseManager,
        logger: logging.Logger,
        model_name: str = "openai/gpt-4o-mini"
    ):
        self.storage = storage
        self.logger = logger
        
        # ✅ FIX 1: Create an INSTANCE of SummarizationLLM
        self.llm = SummarizationLLM(
            model_name=model_name,
            max_retries=2
        )
    
    async def summarize_conversation(
        self, 
        conversation_text: str, 
        current_date: str
    ) -> Dict[str, Any]:
        """
        Use LLM to extract structured summary from conversation
        
        Returns dict matching your exact structure:
        {
            "date": "2025-10-20",
            "goals": ["build new memory system"],
            "actions": [...],
            "outcomes": [...],
            "contributors": ["maDan kD", "AI Agent"],
            "summary": "..."
        }
        """
        prompt = f"""Analyze this conversation and extract a structured summary.

Conversation:
{conversation_text}

Extract the following information in JSON format:
{{
  "date": "{current_date}",
  "goals": [list of main goals discussed],
  "actions": [list of specific actions taken or discussed],
  "outcomes": [list of decisions made, conclusions reached, or results achieved],
  "contributors": [list of people involved - extract names from conversation],
  "summary": "2-3 sentence summary of the entire conversation"
}}

Return ONLY valid JSON, no extra text."""

        try:
            summary_data = await self.llm.summarize_to_json(
                prompt=prompt,
                temperature=0.0,
                max_tokens=2000
            )
            
            required_keys = ["date", "goals", "actions", "outcomes", "contributors", "summary"]
            if all(key in summary_data for key in required_keys):
                return summary_data
            else:
                self.logger.error("LLM response missing required keys")
                return self._create_empty_summary(current_date)
                
        except json.JSONDecodeError as e:
            self.logger.error(f"Failed to parse LLM response as JSON: {e}")
            return self._create_empty_summary(current_date)
        except Exception as e:
            self.logger.error(f"Error during summarization: {e}")
            return self._create_empty_summary(current_date)
    
    def _create_empty_summary(self, date: str) -> Dict:
        """Fallback empty summary structure"""
        return {
            "date": date,
            "goals": [],
            "actions": [],
            "outcomes": [],
            "contributors": [],
            "summary": "No summary available"
        }
    
    async def save_daily_memory(self, summary_data: Dict) -> str:
        """Save daily memory node to MongoDB"""
        node_id = await self.storage.insert_daily_node(summary_data)
        self.logger.info(f"Saved daily memory node: {summary_data['date']}")
        return node_id
    
    async def consolidate_week(self, week_start: str, week_end: str) -> Dict:
        """
        Consolidate 7 daily nodes into one weekly summary using LLM
        """
        daily_nodes = await self.storage.get_daily_nodes_in_range(week_start, week_end)
        
        if not daily_nodes:
            self.logger.warning(f"No daily nodes found for week {week_start} to {week_end}")
            return None
        
        # Prepare input for LLM
        daily_summaries = "\n\n".join([
            f"Date: {node['date']}\nGoals: {node['goals']}\nActions: {node['actions']}\nOutcomes: {node['outcomes']}\nSummary: {node['summary']}"
            for node in daily_nodes
        ])
        
        prompt = f"""Consolidate these daily summaries into a weekly summary.

Daily Summaries ({week_start} to {week_end}):
{daily_summaries}

Create a weekly summary in JSON format:
{{
  "week_start": "{week_start}",
  "week_end": "{week_end}",
  "core_goals": [main goals across the week],
  "key_actions": [most important actions taken],
  "insights": [key learnings or realizations],
  "pending": [unfinished goals or next steps],
  "summary": "3-4 sentence narrative summary of the week"
}}

Return ONLY valid JSON."""

        try:
            # ✅ FIX 3: Use correct async method
            weekly_data = await self.llm.summarize_to_json(
                prompt=prompt,
                temperature=0.0,
                max_tokens=2000
            )
            node_id = await self.storage.insert_weekly_node(weekly_data)
            self.logger.info(f"Created weekly summary: {week_start} to {week_end}")
            return weekly_data
        except Exception as e:
            self.logger.error(f"Failed to create weekly summary: {e}")
            return None
    
    async def retrieve_relevant_memories(
        self,
        query: str,
        query_type: str = "last_n_days",
        n: int = 7
    ) -> List[Dict]:
        """
        Retrieve memories based on query type
        
        Args:
            query: Search term or date
            query_type: "last_n_days", "date", "goal", "outcome"
            n: Number of days (for last_n_days)
        """
        if query_type == "last_n_days":
            return await self.storage.get_last_n_days(n)
        elif query_type == "date":
            node = await self.storage.get_daily_node_by_date(query)
            return [node] if node else []
        elif query_type == "goal":
            return await self.storage.search_daily_nodes_by_goal(query)
        elif query_type == "outcome":
            return await self.storage.search_daily_nodes_by_outcome(query)
        else:
            self.logger.warning(f"Unknown query type: {query_type}")
            return []
    
    def format_memories_for_context(self, memories: List[Dict]) -> str:
        """Format retrieved memories into readable context"""
        if not memories:
            return "No relevant past memories found."
        
        formatted = "=== PAST CONTEXT ===\n\n"
        for memory in memories:
            formatted += f"Date: {memory['date']}\n"
            formatted += f"Goals: {', '.join(memory['goals'])}\n"
            formatted += f"Summary: {memory['summary']}\n"
            if memory.get('outcomes'):
                formatted += f"Outcomes: {', '.join(memory['outcomes'])}\n"
            formatted += "\n"
        
        formatted += "=== END PAST CONTEXT ===\n"
        return formatted