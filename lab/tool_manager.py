import asyncio
import os
from copy import deepcopy
from typing import Optional, List, Dict, Any
import logging
from llm.base import LLMClient
from lab.base import AgentPlugin
from llm.message_history import MessageHistory
from lab.web_search_tool import WebSearchTool
from lab.visit_webpage_tool import VisitWebpageTool
from lab.complete_tool import CompleteTool
from llm.base import ToolAction
from utilss.workspace_manager import WorkspaceManager
from lab.base import AgentPlugin
from lab.replace_tool import StrReplaceEditorTool
from lab.staticDeploy import StaticDeployTool
from lab.sequential_thinkingtool import SequentialThinkingTool
from lab.slideTool import SlideDeckInitTool,SlideDeckCompleteTool
from lab.image_gen_tool import ImageGenerateTool
from lab.ListHtmlLinksTool import ListHtmlLinksTool
from lab.AdaptiveQuestionGenerator import AdaptiveQuestionGenerator
from lab.youtube_transcript_tool import YoutubeTranscriptTool
from Mongodb.db import DatabaseManager
from lab.searchTool import RetrieveContextTool
from lab.RagPDF import setup_rag_tools, IndexDocumentsTool, SearchDocumentsTool,PDFTextReader
from dotenv import load_dotenv
load_dotenv()

async def initialize_rag_tools(
    workspace_manager: WorkspaceManager,
    db_manager: DatabaseManager,
    user_id: str, 
    session_id: Optional[str] = None,
    logger: Optional[logging.Logger] = None
) -> tuple[IndexDocumentsTool, SearchDocumentsTool,PDFTextReader]:
    """
    Initialize RAG tools for SPECIFIC USER and SESSION
    NO CACHING - Each call creates isolated tools
    
    Args:
        workspace_manager: Workspace manager
        db_manager: MongoDB manager
        user_id: User identifier (REQUIRED)
        session_id: Session identifier (optional)
        logger: Logger instance
    
    Returns:
        Tuple of (IndexDocumentsTool, SearchDocumentsTool) isolated for this user
    """
    if not user_id:
        raise ValueError("user_id is REQUIRED for RAG tools initialization")
    
    logger = logger or logging.getLogger(__name__)
    
    # Validate environment variables
    qdrant_url = os.getenv("QDRANT_URL")
    qdrant_api_key = os.getenv("QDRANT_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_KEY")
    
    if not qdrant_url or not qdrant_api_key or not openrouter_key:
        raise ValueError(
            "Missing required environment variables: QDRANT_URL, QDRANT_API_KEY, OPENROUTER_KEY"
        )
    
    logger.info(f"🔧 Initializing RAG tools for user={user_id}, session={session_id}")
    
    try:
        # Create NEW tools for THIS USER - NO CACHING
        index_tool, search_tool,pdftextreader,embeddings = await setup_rag_tools(
            workspace_manager=workspace_manager,
            db_manager=db_manager,
            qdrant_url=qdrant_url,
            qdrant_api_key=qdrant_api_key,
            embedding_provider="openai",
            embedding_api_key=openrouter_key,
            collection_name="documents",
            user_id=user_id, 
            session_id=session_id  
        )
        
        logger.info(f"✅ RAG tools initialized for user={user_id}, session={session_id}")
        return (index_tool, search_tool,pdftextreader, embeddings)
    
    except Exception as e:
        logger.error(f"❌ Failed to initialize RAG tools for user={user_id}: {e}", exc_info=True)
        raise

def get_system_tools(
        client:LLMClient,
        workspace_manager:WorkspaceManager,
        message_queue:asyncio.Queue,
        container_id: Optional[str] = None,
        ask_user_permission:bool=False,
        tool_args:Dict[str, Any] = None,
        plan=None,
        web_key=None,
        img_video=None,
        db_manager: Optional[DatabaseManager] = None,
        session_uuid:Optional[str] = None,
        user_id:Optional[str]=None
        )->List[AgentPlugin]:
    """Retrieves a list of all system tools
    returns :
      list[AgentPlugin]: A list of all system tools
    """
    logger = logging.getLogger("persentation_context_manager")
    embedding_provider = None
    tools = [
        StrReplaceEditorTool(workspace_manager=workspace_manager,message_queue=message_queue),
        StaticDeployTool(workspace_manager=workspace_manager),
        SlideDeckInitTool(
            workspace_manager=workspace_manager,
        ),
        SlideDeckCompleteTool(
            workspace_manager=workspace_manager,
        ),
        ListHtmlLinksTool(workspace_manager=workspace_manager),
        AdaptiveQuestionGenerator(),
        RetrieveContextTool(db_manager=db_manager,session_id=session_uuid,user_id=user_id,logger=logger),
    ]
    if plan == "custom_api":
         # Add validation before creating tools
         if not web_key or web_key.strip() == "":
             raise ValueError(f"web_key is required for custom_api plan. Got: '{web_key}'")
         if not img_video or img_video.strip() == "":
             raise ValueError(f"img_video is required for custom_api plan. Got: '{img_video}'")
             
         print(f"DEBUG: Creating tools with web_key='{web_key}', img_video='{img_video}'")
         tools.append(WebSearchTool(key_part=web_key,plan=plan))
         tools.append(VisitWebpageTool(key_part=web_key,plan=plan))
         tools.append(ImageGenerateTool(workspace_manager=workspace_manager,key_part=img_video,plan=plan))
    else:
        tools.append(WebSearchTool()),
        tools.append(VisitWebpageTool()),
    
    # Conditionally add tools based on tool_args
    if tool_args:
        if tool_args.get("sequential_thinking", False):
            tools.append(SequentialThinkingTool())
        if tool_args.get("pdf", False) or tool_args.get("rag", False):
            rag_ready = all([
             user_id,
             session_uuid,
             db_manager
            ])
            if not rag_ready:
                logger.warning(
                    "⚠️ RAG requested but missing context "
                    f"(user_id={user_id}, session_uuid={session_uuid}). "
                    "Falling back to PDFTextReader."
                )
                tools.append(PDFTextReader(workspace_manager=workspace_manager))
            else:
                try:
                    loop = asyncio.get_event_loop()
                    
                    if loop.is_running():
                        async def init_and_add():
                            nonlocal embedding_provider
                            try:
                                index_tool, search_tool,pdftextreader,embeddings = await initialize_rag_tools(
                                    workspace_manager=workspace_manager,
                                    db_manager=db_manager,
                                    user_id=user_id,  
                                    session_id=session_uuid, 
                                    logger=logger
                                )
                                tools.append(pdftextreader)
                                tools.append(index_tool)
                                tools.append(search_tool)
                                embedding_provider =embeddings
                                logger.info(f"✅ RAG tools added for user={user_id}, session={session_uuid}")
                            except Exception as e:
                                logger.error(f"❌ Failed to add RAG tools for user={user_id}: {e}", exc_info=True)
                        
                        asyncio.create_task(init_and_add())
                        logger.info(f"⏳ RAG tools initialization scheduled for user={user_id}")
                    else:
                        # No running loop - initialize synchronously
                        index_tool, search_tool,pdftextreader,embeddings = loop.run_until_complete(
                            initialize_rag_tools(
                                workspace_manager=workspace_manager,
                                db_manager=db_manager,
                                user_id=user_id, 
                                session_id=session_uuid, 
                                logger=logger
                            )
                        )
                        tools.append(pdftextreader)
                        tools.append(index_tool)
                        tools.append(search_tool)
                        embedding_provider=embeddings
                        logger.info(f"✅ RAG tools added for user={user_id}, session={session_uuid}")
                
                except Exception as e:
                    logger.error(f"❌ Failed to initialize RAG tools for user={user_id}: {e}", exc_info=True)

    return tools,embedding_provider

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
            tool: AgentPlugin = next(t for t in self.get_tools() if t.name == tool_name)
            return tool
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
        return full AgentImplOutput  # ✅ NOW returns the complete object
        """
        llm_tool = self.get_tool(tool_params.tool_name)
        
        tool_name = tool_params.tool_name
        tool_input = tool_params.tool_input
        
        self.logger_for_agent_logs.info(f"Running tool: {tool_name}")
        self.logger_for_agent_logs.info(f"Tool input: {tool_input}")
        
        # ✅ Execute tool - now returns AgentImplOutput object
        result = await llm_tool.run(tool_input, deepcopy(history))
        
        # ✅ Extract tool_output for logging
        from lab.base import AgentImplOutput
        
        if isinstance(result, AgentImplOutput):
            tool_output = result.tool_output
            auxiliary_data = result.auxiliary_data if hasattr(result, 'auxiliary_data') else {}
        else:
            # Fallback for old-style tools that might still return raw output
            tool_output = result
            auxiliary_data = {}
        
        # Build log message
        tool_input_str = "\n".join([f" - {k}: {v}" for k, v in tool_input.items()])
        log_message = f"Calling tool {tool_name} with input:\n{tool_input_str}"
        
        # Log the output
        if isinstance(tool_output, str):
            log_message += f"\nTool output:\n{tool_output}\n\n"
        else:
            result_to_log = deepcopy(tool_output)
            
            # Redact image data if present
            if isinstance(result_to_log, list):
                for i in range(len(result_to_log)):
                    if isinstance(result_to_log[i], dict) and result_to_log[i].get("type") == "image":
                        if "source" in result_to_log[i] and "data" in result_to_log[i]["source"]:
                            result_to_log[i]["source"]["data"] = "[REDACTED]"
            
            log_message += f"\nTool output:\n{result_to_log}\n\n"
        
        # ✅ Log auxiliary_data if present (like embedding tokens)
        if auxiliary_data:
            # Filter out large data for logging
            aux_data_log = {k: v for k, v in auxiliary_data.items() 
                           if k not in ['raw_data', 'full_response']}
            if aux_data_log:
                log_message += f"Auxiliary data: {aux_data_log}\n"
        
        self.logger_for_agent_logs.info(log_message)
        
        # ✅ Handle legacy tuple returns (backward compatibility)
        if isinstance(result, tuple):
            tool_result, = result
        else:
            tool_result = result
        
        # ✅ Return the FULL object (not just tool_output)
        return tool_result
    
    def should_stop(self):
        return self.complete_tool.should_stop
    
    def get_final_answer(self):
        return self.complete_tool.answer
    
    def reset(self):
        self.complete_tool.reset()

    def get_tools(self) -> list[AgentPlugin]:
        return self.tools + [self.complete_tool]