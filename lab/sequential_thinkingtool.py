"""Sequential Thinking Tool.

This tool nudges the model to break down complex problems, analyze issues step-by-step, and ensure a thorough approach to problem-solving.
This is a port of Anthropic's sequential thinking MCP server (https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking) to Python.

Adapted from modelcontextprotocol by Anthropic, PBC.
Original license: MIT (https://github.com/c/servers/blob/main/LICENSE)
Modifications copyright (c) 2025 Augment Code.
"""

import json
import logging
from typing import Any, Dict, List, Optional, TypedDict

from llm.message_history import MessageHistory
from lab.base import (
    AgentPlugin,
    AgentImplOutput,
)

# Configure logging
logger = logging.getLogger(__name__)


class ThoughtData(TypedDict, total=False):
    """Type definition for thought data."""

    thought: str
    thoughtNumber: int
    totalThoughts: int
    isRevision: Optional[bool]
    revisesThought: Optional[int]
    branchFromThought: Optional[int]
    branchId: Optional[str]
    needsMoreThoughts: Optional[bool]
    nextThoughtNeeded: bool


class SequentialThinkingTool(AgentPlugin):
    """A tool for sequential thinking that helps break down complex problems.

    This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
    Each thought can build on, question, or revise previous insights as understanding deepens.
    """

    name = "sequential_thinking"
    description = """A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
* Regular analytical steps
* Revisions of previous thoughts
* Questions about previous decisions
* Realizations about needing more analysis
* Changes in approach
* Hypothesis generation
* Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached"""

    input_schema = {
        "type": "object",
        "properties": {
            "thought": {"type": "string", "description": "Your current thinking step"},
            "nextThoughtNeeded": {
                "type": "boolean",
                "description": "Whether another thought step is needed",
            },
            "thoughtNumber": {
                "type": "integer",
                "description": "Current thought number",
                "minimum": 1,
            },
            "totalThoughts": {
                "type": "integer",
                "description": "Estimated total thoughts needed",
                "minimum": 1,
            },
            "isRevision": {
                "type": "boolean",
                "description": "Whether this revises previous thinking",
            },
            "revisesThought": {
                "type": "integer",
                "description": "Which thought is being reconsidered",
                "minimum": 1,
            },
            "branchFromThought": {
                "type": "integer",
                "description": "Branching point thought number",
                "minimum": 1,
            },
            "branchId": {"type": "string", "description": "Branch identifier"},
            "needsMoreThoughts": {
                "type": "boolean",
                "description": "If more thoughts are needed",
            },
        },
        "required": ["thought", "nextThoughtNeeded", "thoughtNumber", "totalThoughts"],
    }

    def __init__(self, verbose: bool = False):
        """Initialize the sequential thinking tool."""
        super().__init__()
        self.thought_history: List[ThoughtData] = []
        self.branches: Dict[str, List[ThoughtData]] = {}
        self.verbose = verbose

    def _validate_thought_data(self, input_data: Dict[str, Any]) -> ThoughtData:
        """Validate the thought data input.

        Args:
            input_data: The input data to validate

        Returns:
            Validated ThoughtData

        Raises:
            ValueError: If the input data is invalid
        """
        # Handle case where input_data might be a string (from JSON parsing error)
        if isinstance(input_data, str):
            try:
                input_data = json.loads(input_data)
            except json.JSONDecodeError as e:
                raise ValueError(f"Invalid JSON input: {str(e)}")
        
        if not isinstance(input_data, dict):
            raise ValueError("Input must be a dictionary")

        if not input_data.get("thought") or not isinstance(input_data["thought"], str):
            raise ValueError("Invalid thought: must be a non-empty string")

        if not isinstance(input_data.get("thoughtNumber"), int) or input_data["thoughtNumber"] < 1:
            raise ValueError("Invalid thoughtNumber: must be a positive integer")

        if not isinstance(input_data.get("totalThoughts"), int) or input_data["totalThoughts"] < 1:
            raise ValueError("Invalid totalThoughts: must be a positive integer")

        if not isinstance(input_data.get("nextThoughtNeeded"), bool):
            raise ValueError("Invalid nextThoughtNeeded: must be a boolean")

        # Validate optional fields
        if input_data.get("isRevision") is not None and not isinstance(input_data["isRevision"], bool):
            raise ValueError("Invalid isRevision: must be a boolean")
        
        if input_data.get("revisesThought") is not None and (
            not isinstance(input_data["revisesThought"], int) or input_data["revisesThought"] < 1
        ):
            raise ValueError("Invalid revisesThought: must be a positive integer")

        if input_data.get("branchFromThought") is not None and (
            not isinstance(input_data["branchFromThought"], int) or input_data["branchFromThought"] < 1
        ):
            raise ValueError("Invalid branchFromThought: must be a positive integer")

        if input_data.get("branchId") is not None and not isinstance(input_data["branchId"], str):
            raise ValueError("Invalid branchId: must be a string")

        if input_data.get("needsMoreThoughts") is not None and not isinstance(input_data["needsMoreThoughts"], bool):
            raise ValueError("Invalid needsMoreThoughts: must be a boolean")

        return {
            "thought": input_data["thought"],
            "thoughtNumber": input_data["thoughtNumber"],
            "totalThoughts": input_data["totalThoughts"],
            "nextThoughtNeeded": input_data["nextThoughtNeeded"],
            "isRevision": input_data.get("isRevision"),
            "revisesThought": input_data.get("revisesThought"),
            "branchFromThought": input_data.get("branchFromThought"),
            "branchId": input_data.get("branchId"),
            "needsMoreThoughts": input_data.get("needsMoreThoughts"),
        }

    def _format_thought(self, thought_data: ThoughtData) -> str:
        """Format a thought for display.

        Args:
            thought_data: The thought data to format

        Returns:
            Formatted thought string
        """
        thought_number = thought_data["thoughtNumber"]
        total_thoughts = thought_data["totalThoughts"]
        thought = thought_data["thought"]
        is_revision = thought_data.get("isRevision", False)
        revises_thought = thought_data.get("revisesThought")
        branch_from_thought = thought_data.get("branchFromThought")
        branch_id = thought_data.get("branchId")

        prefix = ""
        context = ""

        if is_revision:
            prefix = "🔄 Revision"
            context = f" (revising thought {revises_thought})"
        elif branch_from_thought:
            prefix = "🌿 Branch"
            context = f" (from thought {branch_from_thought}, ID: {branch_id})"
        else:
            prefix = "💭 Thought"
            context = ""

        header = f"{prefix} {thought_number}/{total_thoughts}{context}"
        border_length = max(len(header), len(thought)) + 4
        border = "─" * border_length

        return f"""
┌{border}┐
│ {header.ljust(border_length)} │
├{border}┤
│ {thought.ljust(border_length)} │
└{border}┘"""

    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        """Run the sequential thinking tool.

        Args:
            tool_input: The input data for the tool
            message_history: Optional dialog messages

        Returns:
            Tool output with the result
        """
        try:
            # Add better error handling and logging
            logger.debug(f"Sequential thinking tool input: {tool_input}")
            
            validated_input = self._validate_thought_data(tool_input)

            # Adjust total thoughts if needed
            if validated_input["thoughtNumber"] > validated_input["totalThoughts"]:
                validated_input["totalThoughts"] = validated_input["thoughtNumber"]

            # Add to thought history
            self.thought_history.append(validated_input)

            # Handle branches
            if validated_input.get("branchFromThought") and validated_input.get("branchId"):
                branch_id = validated_input["branchId"]
                if branch_id not in self.branches:
                    self.branches[branch_id] = []
                self.branches[branch_id].append(validated_input)

            # Format and log the thought
            formatted_thought = self._format_thought(validated_input)
            if self.verbose:
                logger.info(formatted_thought)

            # Prepare response
            response = {
                "thoughtNumber": validated_input["thoughtNumber"],
                "totalThoughts": validated_input["totalThoughts"],
                "nextThoughtNeeded": validated_input["nextThoughtNeeded"],
                "branches": list(self.branches.keys()),
                "thoughtHistoryLength": len(self.thought_history),
            }

            return AgentImplOutput(
                tool_output=json.dumps(response, indent=2),
                tool_result_message=f"Processed thought {validated_input['thoughtNumber']}/{validated_input['totalThoughts']}",
                auxiliary_data={"thought_data": validated_input},
            )
        except Exception as e:
            logger.error(f"Error in sequential thinking tool: {str(e)}")
            error_response = {"error": str(e), "status": "failed"}
            return AgentImplOutput(
                tool_output=json.dumps(error_response, indent=2),
                tool_result_message=f"Error processing thought: {str(e)}",
                auxiliary_data={"error": str(e)},
            )

    def get_tool_start_message(self, tool_input: Dict[str, Any]) -> str:
        """Return a user-friendly message when the tool is called.

        Args:
            tool_input: The input data for the tool

        Returns:
            A user-friendly message
        """
        thought_number = tool_input.get("thoughtNumber", "?")
        total_thoughts = tool_input.get("totalThoughts", "?")
        return f"Processing sequential thought {thought_number}/{total_thoughts}"