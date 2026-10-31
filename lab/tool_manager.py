import asyncio
import os
from copy import deepcopy
from typing import Optional, List, Dict, Any, Tuple
import logging
from dotenv import load_dotenv

from llm.base import LLMClient, ToolAction
from llm.message_history import MessageHistory
from lab.base import AgentPlugin, AgentImplOutput
from lab.web_search_tool import WebSearchTool
from lab.visit_webpage_tool import VisitWebpageTool
from lab.complete_tool import CompleteTool
from lab.replace_tool import StrReplaceEditorTool
from lab.staticDeploy import StaticDeployTool
from lab.sequential_thinkingtool import SequentialThinkingTool
from lab.slideTool import SlideDeckInitTool, SlideDeckCompleteTool
from lab.image_gen_tool import ImageGenerateTool
from lab.ListHtmlLinksTool import ListHtmlLinksTool
from lab.AdaptiveQuestionGenerator import AdaptiveQuestionGenerator
from lab.youtube_transcript_tool import YoutubeTranscriptTool
from lab.searchTool import RetrieveContextTool
from lab.RagPDF import (
    setup_rag_tools,
    EmbeddingProvider,
    IndexDocumentsTool,
    SearchDocumentsTool,
    PDFTextReader,
    GetCitedSourceTool,
    VerifyCitationsTool,
)
from utilss.workspace_manager import WorkspaceManager
from Mongodb.db import DatabaseManager

load_dotenv()


async def initialize_rag_tools(
    workspace_manager: WorkspaceManager,
    db_manager: DatabaseManager,
    user_id: str,
    session_id: Optional[str] = None,
    logger: Optional[logging.Logger] = None,
) -> Tuple[
    IndexDocumentsTool,
    SearchDocumentsTool,
    PDFTextReader,
    EmbeddingProvider,
    GetCitedSourceTool,
    VerifyCitationsTool,
]:
    """
    Initialize RAG tools for a SPECIFIC USER and SESSION.
    NO CACHING - each call creates isolated tools (and a fresh citation registry).

    Returns:
        (index_tool, search_tool, pdf_reader, embeddings, get_cited_source_tool, verify_citations_tool)
    """
    if not user_id:
        raise ValueError("user_id is REQUIRED for RAG tools initialization")

    logger = logger or logging.getLogger(__name__)

    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_KEY")

    if not qdrant_url or not qdrant_api_key or not openrouter_key:
        raise ValueError(
            "Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, OPENROUTER_KEY"
        )

    logger.info(f"🔧 Initializing RAG tools for user={user_id}, session={session_id}")

    try:
        (
            index_tool,
            search_tool,
            pdf_reader,
            embeddings,
            get_cited_source_tool,
            verify_citations_tool,
        ) = await setup_rag_tools(
            workspace_manager=workspace_manager,
            db_manager=db_manager,
            qdrant_url=qdrant_url,
            qdrant_api_key=qdrant_api_key,
            embedding_provider="openai",
            embedding_api_key=openrouter_key,
            collection_name="documents",
            user_id=user_id,
            session_id=session_id,
        )

        logger.info(f"✅ RAG tools initialized for user={user_id}, session={session_id}")
        return (
            index_tool,
            search_tool,
            pdf_reader,
            embeddings,
            get_cited_source_tool,
            verify_citations_tool,
        )

    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG tools for user={user_id}: {e}", exc_info=True)
        raise


async def get_system_tools(
    client: LLMClient,
    workspace_manager: WorkspaceManager,
    message_queue: asyncio.Queue,
    container_id: Optional[str] = None,
    ask_user_permission: bool = False,
    tool_args: Optional[Dict[str, Any]] = None,
    plan=None,
    web_key=None,
    img_video=None,
    db_manager: Optional[DatabaseManager] = None,
    session_uuid: Optional[str] = None,
    user_id: Optional[str] = None,
) -> Tuple[List[AgentPlugin], Optional[EmbeddingProvider]]:
    """
    Build the list of system tools.

    NOTE: this is now ASYNC. Callers must `await get_system_tools(...)`.
    RAG tools are fully initialized before returning, so the returned tool list
    and embedding_provider are complete (no background task race).

    Returns:
        (tools, embedding_provider)  — embedding_provider is None when RAG is not active.
    """
    logger = logging.getLogger("persentation_context_manager")
    embedding_provider: Optional[EmbeddingProvider] = None

    tools: List[AgentPlugin] = [
        StrReplaceEditorTool(workspace_manager=workspace_manager, message_queue=message_queue),
        StaticDeployTool(workspace_manager=workspace_manager),
        SlideDeckInitTool(workspace_manager=workspace_manager),
        SlideDeckCompleteTool(workspace_manager=workspace_manager),
        ListHtmlLinksTool(workspace_manager=workspace_manager),
        AdaptiveQuestionGenerator(),
        RetrieveContextTool(
            db_manager=db_manager, session_id=session_uuid, user_id=user_id, logger=logger
        ),
    ]

    if plan == "custom_api":
        if not web_key or not web_key.strip():
            raise ValueError(f"web_key is required for custom_api plan. Got: '{web_key}'")
        if not img_video or not img_video.strip():
            raise ValueError(f"img_video is required for custom_api plan. Got: '{img_video}'")

        logger.debug("Creating custom_api tools (web search, webpage visit, image generation)")
        tools.append(WebSearchTool(key_part=web_key, plan=plan))
        tools.append(VisitWebpageTool(key_part=web_key, plan=plan))
        tools.append(ImageGenerateTool(workspace_manager=workspace_manager, key_part=img_video, plan=plan))
    else:
        tools.append(WebSearchTool())
        tools.append(VisitWebpageTool())

    if tool_args:
        if tool_args.get("sequential_thinking", False):
            tools.append(SequentialThinkingTool())

        if tool_args.get("pdf", False) or tool_args.get("rag", False):
            rag_ready = all([user_id, session_uuid, db_manager])

            if not rag_ready:
                logger.warning(
                    "⚠️ RAG requested but missing context "
                    f"(user_id={user_id}, session_uuid={session_uuid}, db_manager={'set' if db_manager else None}). "
                    "Falling back to PDFTextReader."
                )
                tools.append(PDFTextReader(workspace_manager=workspace_manager))
            else:
                try:
                    (
                        index_tool,
                        search_tool,
                        pdf_reader,
                        embeddings,
                        get_cited_source_tool,
                        verify_citations_tool,
                    ) = await initialize_rag_tools(
                        workspace_manager=workspace_manager,
                        db_manager=db_manager,
                        user_id=user_id,
                        session_id=session_uuid,
                        logger=logger,
                    )
                    tools.extend([
                        pdf_reader,
                        index_tool,
                        search_tool,
                        get_cited_source_tool,
                        verify_citations_tool,
                    ])
                    embedding_provider = embeddings
                    logger.info(f"✅ RAG tools added for user={user_id}, session={session_uuid}")

                except Exception as e:
                    logger.error(
                        f"❌ Failed to initialize RAG tools for user={user_id}: {e}. "
                        "Falling back to PDFTextReader.",
                        exc_info=True,
                    )
                    tools.append(PDFTextReader(workspace_manager=workspace_manager))

    return tools, embedding_provider


class AgentToolManager:
    """
    Manages the creation and execution of tools for the agent.

    This class is responsible for:
    - Initializing and managing all available tools
    - Providing access to tools by name
    - Executing tools with appropriate inputs
    - Logging tool execution details

    Tools include search capabilities, and task completion functionality.
    """

    def __init__(self, tools: List[AgentPlugin], logger_for_agent_logs: logging.Logger):
        self.logger_for_agent_logs = logger_for_agent_logs
        self.complete_tool = CompleteTool()
        self.tools = tools

    def get_tool(self, tool_name: str) -> AgentPlugin:
        try:
            return next(t for t in self.get_tools() if t.name == tool_name)
        except StopIteration:
            raise ValueError(f"Tool with name {tool_name} not found")

    async def run_tool(self, tool_params: ToolAction, history: MessageHistory):
        """
        Flow of execution:
        some_tool.run(tool_input, history)
        ↓
        AgentPlugin.run(...)  # defined in parent
        ↓
        self.run_impl(...)  # must be defined in child!
        ↓
        AgentImplOutput(tool_output, tool_result_message, auxiliary_data)
        ↓
        return full AgentImplOutput
        """
        llm_tool = self.get_tool(tool_params.tool_name)

        tool_name = tool_params.tool_name
        tool_input = tool_params.tool_input

        self.logger_for_agent_logs.info(f"Running tool: {tool_name}")
        self.logger_for_agent_logs.info(f"Tool input: {tool_input}")

        result = await llm_tool.run(tool_input, deepcopy(history))

        if isinstance(result, AgentImplOutput):
            tool_output = result.tool_output
            auxiliary_data = getattr(result, "auxiliary_data", None) or {}
        else:
            # Fallback for old-style tools that return raw output
            tool_output = result
            auxiliary_data = {}

        tool_input_str = "\n".join(f" - {k}: {v}" for k, v in tool_input.items())
        log_message = f"Calling tool {tool_name} with input:\n{tool_input_str}"

        if isinstance(tool_output, str):
            log_message += f"\nTool output:\n{tool_output}\n\n"
        else:
            result_to_log = deepcopy(tool_output)

            # Redact image data if present
            if isinstance(result_to_log, list):
                for item in result_to_log:
                    if isinstance(item, dict) and item.get("type") == "image":
                        if "data" in item.get("source", {}):
                            item["source"]["data"] = "[REDACTED]"

            log_message += f"\nTool output:\n{result_to_log}\n\n"

        # Log auxiliary data (embedding tokens, citations, ...) minus bulky fields
        if auxiliary_data:
            aux_log = {
                k: v for k, v in auxiliary_data.items()
                if k not in ("raw_data", "full_response")
            }
            if aux_log:
                log_message += f"Auxiliary data: {aux_log}\n"

        self.logger_for_agent_logs.info(log_message)

        # Legacy tuple returns (backward compatibility)
        if isinstance(result, tuple):
            return result[0]
        return result

    def should_stop(self):
        return self.complete_tool.should_stop

    def get_final_answer(self):
        return self.complete_tool.answer

    def reset(self):
        self.complete_tool.reset()

    def get_tools(self) -> List[AgentPlugin]:
        return self.tools + [self.complete_tool]