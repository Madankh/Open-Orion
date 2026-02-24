import asyncio
import json
import logging
import uuid
from typing import Dict, List, Any,Optional,Set
from fastapi import WebSocket, WebSocketDisconnect
from connection_managerz import ConnectionManager, cleanup_connection

from deep_research import handle_deep_research_message
from verifySystem import verify_token
from tokenDeducation import MultiModelTokenCalculator
from EvenInfo.event import RealtimeEvent, EventType
from Mongodb.db import DatabaseManager
from utilss.constants import DEFAULT_MODEL
from util import create_workspace_manager_for_connection
from agents.AgentExecutor import AgentExecutor
from agents.CanvasAgentExecutor import CanvasAgentExecutor
from llm.base import LLMClient
from llm import get_client
from utilss.prompt_generator import enhance_user_prompt
from llm.token_counter import TokenCounter
from llm.context_manager.standard import StandardContextManager
from lab import get_system_tools
from prompts.system_prompt import SystemPromptBuilder
from utilss.constants import WorkSpaceMode

# Create logger
logger = logging.getLogger("websocket_handler")
logger.setLevel(logging.INFO)

# Constants
MAX_OUTPUT_TOKENS_PER_TURN = 32768
MAX_TURNS = 200

# Global state - now managed by ConnectionManager
connection_manager = ConnectionManager()
global_args = None
global_db_manager = None

def set_global_args(args):
    """Set global args from main application"""
    global global_args
    global_args = args

def set_global_db_manager(db_manager):
    global global_db_manager
    global_db_manager = db_manager

# ============================================
active_workspaces: Dict[str, Set[WebSocket]] = {} 
workspace_lock = asyncio.Lock()

async def register_workspace_session(workspace_id: str, session_id: str, websocket: WebSocket):
    """Register an active workspace session with the actual WebSocket"""
    async with workspace_lock:
        if workspace_id not in active_workspaces:
            active_workspaces[workspace_id] = set()
        active_workspaces[workspace_id].add(websocket)  # Track WebSocket, not session_id
        connection_count = len(active_workspaces[workspace_id])
        logger.info(
            f"✅ Registered WebSocket for workspace {workspace_id} "
            f"(session: {session_id}, total connections: {connection_count})"
        )

async def unregister_workspace_session(workspace_id: str, session_id: str, websocket: WebSocket):
    """Unregister a workspace session"""
    async with workspace_lock:
        if workspace_id in active_workspaces:
            active_workspaces[workspace_id].discard(websocket)  # Remove specific WebSocket
            remaining = len(active_workspaces[workspace_id])
            
            logger.info(
                f"📤 Unregistered WebSocket for workspace {workspace_id} "
                f"(session: {session_id}, remaining connections: {remaining})"
            )
            
            if not active_workspaces[workspace_id]:
                del active_workspaces[workspace_id]
                logger.info(f"🗑️ No more active sessions for workspace {workspace_id}")
            else:
                logger.info(f"🔒 Workspace {workspace_id} still has {remaining} active connection(s)")

async def is_workspace_active(workspace_id: str) -> bool:
    """Check if a workspace has any active sessions"""
    async with workspace_lock:
        return workspace_id in active_workspaces and len(active_workspaces[workspace_id]) > 0

async def get_active_workspaces_info() -> dict:
    """Get information about all active workspaces (for debugging)"""
    async with workspace_lock:
        return {
            "active_workspaces": {
                ws_id: list(sessions) 
                for ws_id, sessions in active_workspaces.items()
            },
            "count": len(active_workspaces)
        }
    
async def websocket_endpoint(
    websocket: WebSocket,
    token: str,
    session_id: str,
    db_manager: DatabaseManager 
):
    """Main WebSocket endpoint handler - now much cleaner"""
    await websocket.accept()
    await websocket.send_json({"status": "connected"})
    
    # Add connection and setup keep-alive
    keep_alive = await connection_manager.add_connection(websocket)
    connection_manager.set_user_token(websocket, token)
    payload = verify_token(token)
    user_id = payload['id']
    session_uuid = session_id
    user = await db_manager.get_user_by_id(user_id)
    token_limit = user['token_limit']
    plan = user['plan']
    
    # Check token limits
    if token_limit <= 3 and plan != "custom_api":
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "Your token limit has been exhausted. Please upgrade your plan or wait for a reset."},
            ).model_dump()
        )
        await websocket.close()
        return

    # Setup workspace
    workspace_manager = await create_workspace_manager_for_connection(
        global_args.workspace, 
        db_manager,
        user_id,
        session_uuid,
        global_args.use_container_workspace
    )
    # connection_manager.set_workspace_manager(websocket, workspace_manager)
    workspace_id = workspace_manager.workspace_id
    await register_workspace_session(workspace_id, session_uuid,websocket)
    logger.info(f"📍 Workspace registered: {workspace_id} for session {session_uuid}")

    if not user:
        logger.error(f"Authentication successful, but user {user_id} not found in DB.")
        await websocket.close(code=1011, reason="User not found.")
        return 

    try:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.CONNECTION_ESTABLISHED,
                content={
                    "message": "Connected to Agent WebSocket Server",
                    "workspace_path": str(workspace_manager.root)
                }
            ).model_dump()
        )

        # Main message processing loop
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await handle_websocket_message(
                    websocket, message, session_uuid, 
                    user, workspace_manager, db_manager, token_limit, plan
                )

            except json.JSONDecodeError:
                await websocket.send_json(
                    RealtimeEvent(
                        type=EventType.ERROR, content={"message": "Invalid JSON format"}
                    ).model_dump()
                )
            except Exception as e:
                logger.error(f"Error processing message: {str(e)}")
                await websocket.send_json(
                    RealtimeEvent(
                        type=EventType.ERROR,
                        content={"message": f"Error processing request: {str(e)}"},
                    ).model_dump()
                )

    except WebSocketDisconnect:
        logger.info("Client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {str(e)}")
    finally:
        await unregister_workspace_session(workspace_id, session_uuid,websocket)
        logger.info(f"📤 Workspace unregistered: {workspace_id} for session {session_uuid}")
        await cleanup_connection(websocket, connection_manager)


async def handle_websocket_message(
    websocket: WebSocket, 
    message: dict, 
    session_uuid: uuid.UUID,
    user: dict,
    workspace_manager,
    db_manager: DatabaseManager,
    token_limit: str,
    plan: str
):
    """Handle individual WebSocket messages - now much smaller"""
    user_id = str(user['_id'])
    msg_type = message.get("type")
    content = message.get("content", {})
    api_keys = content.get('api_keys', {})

    # Helper to create/get client
    def get_or_create_llm_client():
        model_details = content.get('model_id')
        if not model_details and 'tool_args' in content:
            model_details = content['tool_args'].get('model_id')
        
        if not model_details:
            model_details = {"id": DEFAULT_MODEL, "name": DEFAULT_MODEL, "provider": "openai"}
        
        if isinstance(model_details, str):
            model_name = model_details
        else:
            model_name = model_details.get('id', DEFAULT_MODEL)

        if plan == "custom_api":
            current_api_keys = connection_manager.get_api_keys(websocket)
            if api_keys:
                current_api_keys.update(api_keys)
                connection_manager.set_api_keys(websocket, current_api_keys)
            
            llm_key = current_api_keys.get("llmKey", "")
            if not llm_key:
                raise ValueError("LLM API key is required for custom API plan")
                
            return get_client("openai", model_name=model_name, llm_key=llm_key, use_caching=False, mode="custom_api")
        else:
            return get_client("openai", model_name=model_name, use_caching=False)
    
    if msg_type == "init_agent":
        await handle_init_agent(websocket, content, plan, api_keys, session_uuid, user_id, workspace_manager, db_manager)

    elif msg_type == "canvas_query":
        await handle_canvas_query(websocket, content, user,session_uuid, db_manager, get_or_create_llm_client(),workspace_manager)

    elif msg_type == "query":
        await handle_query(websocket, content, user, db_manager)
    
    elif msg_type == "deep_research":
        if token_limit < 2000:
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.ERROR,
                    content={"message": "Your token limit has been exhausted. Please upgrade your plan or wait for a reset."},
                ).model_dump()
            )
        else:
            await handle_deep_research_message(
                websocket, content, user_id, db_manager, connection_manager.active_tasks
            )
    
    elif msg_type == "update_blocks":
        await handle_update_blocks(websocket, message, user_id, db_manager)
    
    elif msg_type == "enhance_prompt":
        await handle_enhance_prompt(websocket, content, get_or_create_llm_client())
    
    elif msg_type in ["workspace_info", "ping", "cancel"]:
        await handle_system_messages(websocket, msg_type, workspace_manager)

async def handle_init_agent(websocket, content, plan, api_keys, session_uuid, user_id, workspace_manager, db_manager):
    """Handle agent initialization"""
    try:
        if plan == "custom_api" and api_keys:
            connection_manager.set_api_keys(websocket, api_keys)
        tool_args = content.get('tool_args', {})
        # Create LLM client
        model_details = tool_args.get("model_id", {"id": DEFAULT_MODEL})
        if isinstance(model_details, str):
            model_name = model_details
        else:
            model_name = model_details.get('id', DEFAULT_MODEL)
        
        if plan == "custom_api":
            stored_keys = connection_manager.get_api_keys(websocket)
            llm_key = stored_keys.get("llmKey", "")
            if not llm_key:
                raise ValueError("LLM API key is required")
            llm_client = get_client("openai", model_name=model_name, llm_key=llm_key, use_caching=False, mode="custom_api")
        else:
            llm_client = get_client("openai", model_name=model_name, use_caching=False)
        
        connection_manager.set_model_name(websocket, model_name)
        
        tool_args = content.get("tool_args", {})
        agent_mode = tool_args.get("mode", {})
        agent_mode = tool_args.get("mode", "general")
        agent_type = tool_args.get("agent_type") 

        # Check if this should be a canvas agent
        is_canvas_agent = (
            agent_type == "canvas" or 
            agent_mode in ["creative_canvas", "canvas"] or
            content.get("canvas_id") is not None
        )
        stored_keys = connection_manager.get_api_keys(websocket)
        web_key = stored_keys.get("webKey", "")
        img_video = "currenly_not_allow_please"
        
        if is_canvas_agent:
            # Create Canvas Agent
            canvas_id = content.get("canvas_id", str(session_uuid))
            node_id = content.get("node_id")
            source_node_id = content.get("source_node_id")
            branch_id = content.get("branch_id")
            
            agent = await create_canvas_agent_for_connection(
                llm_client, canvas_id, node_id,source_node_id, branch_id, user_id,session_uuid,
                workspace_manager, websocket, tool_args, agent_mode, 
                db_manager, plan, web_key, img_video
            )
        else:
            # Create General Agent
            agent = await create_agent_for_connection(
                llm_client, session_uuid, user_id, workspace_manager, websocket,
                tool_args, agent_mode, db_manager, plan, web_key, img_video
            )
            
        connection_manager.set_agent(websocket, agent)
        connection_manager.set_message_processor(websocket, asyncio.create_task(agent.start_message_processing()))
        
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.AGENT_INITIALIZED,
                content={"Message": "Agent initialized"}
            ).model_dump()
        )
    except Exception as e:
        logger.error(f"Failed to initialize agent: {str(e)}")
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": f"Failed to initialize agent: {str(e)}"}
            ).model_dump()
        )

async def handle_query(websocket, content, user, db_manager):
    """Handle query messages"""
    if connection_manager.get_active_task(websocket) and not connection_manager.get_active_task(websocket).done():
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "A query is already being processed"},
            ).model_dump()
        )
        return
    
    user_input = content.get("text", "")
    resume = content.get("resume", False)
    files = content.get("files", [])
    model_name = connection_manager.get_model_name(websocket) or DEFAULT_MODEL

    await websocket.send_json(
        RealtimeEvent(
            type=EventType.PROCESSING,
            content={"message": "Processing your request..."},
        ).model_dump()
    )

    task = asyncio.create_task(
        run_agent_async(websocket, user_input, user, db_manager, resume, files, model_name)
    )
    connection_manager.set_active_task(websocket, task)

async def handle_canvas_query(
    websocket: WebSocket, content: dict, user: dict, session_uuid:str,
    db_manager: DatabaseManager, llm_client, workspace_manager
):
    """Handle canvas queries with enhanced context"""
    logger.info(f"=== CANVAS QUERY START ===")
    
    if connection_manager.get_active_task(websocket) and not connection_manager.get_active_task(websocket).done():
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "A query is already being processed"},
            ).model_dump()
        )
        return
    
    # Extract enhanced context from content
    canvas_id = content.get("canvas_id", "")
    node_id = content.get("node_id", "")
    branch_id = content.get("branch_id", "main") 
    source_node_id = content.get("source_node_id")
    user_input = content.get("instruction", "")
    files = content.get("files", [])
    
    # Enhanced context

    node_context = content.get("node_context", {})
    project_context = content.get("project_context", {})
    connected_nodes = content.get("connected_nodes", [])
    branch_files = content.get("branch_files", [])
    node_connections = content.get("node_connections", [])

    if not canvas_id or not node_id or not user_input:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "Canvas ID, Node ID, and instruction are required"},
            ).model_dump()
        )
        return

    # FIXED: Save canvas state to database before processing with proper error handling
    try:
        await save_canvas_state_to_db(
            db_manager, canvas_id, user['_id'], 
            node_context, project_context,
            node_connections, branch_files, connected_nodes, branch_id
        )
        logger.info("Canvas state saved to database successfully")
    except Exception as e:
        logger.error(f"Failed to save canvas state to database: {e}")
        # Continue processing even if save fails

    # Send processing started event
    await websocket.send_json(
        RealtimeEvent(
            type=EventType.CANVAS_AI_PROCESSING,
            content={
                "status": "started",
                "canvas_id": canvas_id,
                "node_id": node_id,
                "branch_id": branch_id,
                "message": "Processing canvas request..."
            },
        ).model_dump()
    )

    # Rest of the method remains the same...
    stored_keys = connection_manager.get_api_keys(websocket)
    web_key = stored_keys.get("webKey", "")
    img_video = "currenly_not_allow_please"
    
    tool_args = content.get("tool_args", {})
    agent_mode = tool_args.get("mode", "creative_canvas")
    
    user_id = str(user['_id'])
    plan = user.get('plan', 'free')
    
    try:
        agent = await create_canvas_agent_for_connection(
            llm_client=llm_client,
            canvas_id=canvas_id,
            node_id=node_id,
            source_node_id=source_node_id,
            branch_id=branch_id,
            user_id=user_id,
            session_uuid=session_uuid,
            workspace_manager=workspace_manager,
            websocket=websocket,
            tool_args=tool_args,
            agent_mode=agent_mode,
            db_manager=db_manager,
            plan=plan,
            web_key=web_key,
            img_video=img_video,
            node_context=node_context,
            project_context=project_context,
            branch_files=branch_files,
            node_connections=node_connections
        )
        
        logger.info(f"Created enhanced canvas agent: {type(agent).__name__}")
        
        connection_manager.set_agent(websocket, agent)
        connection_manager.set_message_processor(websocket, asyncio.create_task(agent.start_message_processing()))

        task = asyncio.create_task(
            run_canvas_agent_async(
                websocket=websocket,
                canvas_id=canvas_id,
                node_id=node_id,
                branch_id=branch_id,
                user_input=user_input,
                files=files,
                user=user,
                db_manager=db_manager,
            )
        )
        connection_manager.set_active_task(websocket, task)
        
    except Exception as e:
        logger.error(f"Failed to create enhanced canvas agent: {str(e)}", exc_info=True)
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": f"Failed to initialize canvas agent: {str(e)}"}
            ).model_dump()
        )

async def run_canvas_agent_async(
    websocket: WebSocket,
    canvas_id: str,
    node_id: str,
    branch_id: str,
    user_input: str,
    files: list,
    user: dict,
    db_manager: DatabaseManager,
):
    """Run canvas agent with enhanced error handling and guaranteed saves"""
    logger.info(f"=== CANVAS AGENT EXECUTION START ===")
    
    agent = connection_manager.get_agent(websocket)
    if not agent:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "No canvas agent found"},
            ).model_dump()
        )
        return
    
    logger.info(f"Agent type: {type(agent).__name__}")
    workspace = agent.workspace_manager
    
    # ✅ Track token info outside try block
    token_info = None
    model_name = connection_manager.get_model_name(websocket) or DEFAULT_MODEL
    
    try:
        # Send user message event
        agent.message_queue.put_nowait(
            RealtimeEvent(type=EventType.USER_MESSAGE, content={
                "instruction": user_input,
                "canvas_id": canvas_id,
                "node_id": node_id,
                "branch_id": branch_id
            })
        )
        
        logger.info(f"🚀 Calling agent.run_agent() with instruction")
        
        # ✅ Use run_agent() like the general agent does
        result, model_token_info = await asyncio.wait_for(
            agent.run_agent(user_input, files, resume=False),
            timeout=180.0
        )
        
        logger.info(f"✅ Agent execution completed successfully")
        
        # ✅ GET TOKEN INFO (now guaranteed to have data)
        token_info = agent.get_token_info()
        logger.info(f"📊 Token info retrieved: {token_info}")
        
        # Force save final canvas state
        if hasattr(agent, '_save_response_node'):
            try:
                logger.info("Canvas node save handled during execution")
            except Exception as e:
                logger.error(f"Error with canvas save: {e}")

    except asyncio.TimeoutError:
        logger.error("Canvas agent execution timed out")
        # ✅ Still try to get token info
        try:
            token_info = agent.get_token_info()
        except Exception as e:
            logger.error(f"Failed to get token info on timeout: {e}")
        
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "Canvas agent execution timed out"},
            ).model_dump()
        )
        
    except Exception as e:
        logger.error(f"Canvas agent execution failed: {str(e)}", exc_info=True)
        
        # ✅ Still try to get token info
        try:
            token_info = agent.get_token_info()
        except Exception as te:
            logger.error(f"Failed to get token info on error: {te}")
        
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": f"Canvas execution error: {str(e)}"},
            ).model_dump()
        )
        
    finally:
        # ✅ SMART TOKEN CALCULATION WITH FALLBACK
        if token_info:
            # Extract both sources
            print(token_info, "token_info")
            model_actual = token_info.get('model_actual', {})
            local_estimate = token_info.get('local_estimate', {})
            
            model_total = model_actual.get('cumulative_total_tokens', 0)
            local_total = local_estimate.get('total_tokens', 0)
            
            # 🎯 SMART DECISION LOGIC
            tokens_used = 0
            token_source = "unknown"
            
            if model_total > 0:
                # Model actual is available and non-zero
                if local_total > 0:
                    # Both are available - check if they're similar (within 10%)
                    difference_percent = abs(model_total - local_total) / local_total * 100
                    
                    if difference_percent <= 10:
                        # They're similar - use model_actual (more accurate)
                        tokens_used = model_total
                        token_source = "model_actual (verified with local)"
                        logger.info(f"✅ Using model_actual: {model_total} tokens (difference: {difference_percent:.1f}%)")
                    else:
                        # Significant difference - log warning but still use model_actual
                        tokens_used = model_total
                        token_source = "model_actual (large variance)"
                        logger.warning(
                            f"⚠️ Large difference between model_actual ({model_total}) "
                            f"and local_estimate ({local_total}): {difference_percent:.1f}%"
                        )
                else:
                    # Only model_actual available
                    tokens_used = model_total
                    token_source = "model_actual (no local estimate)"
                    logger.info(f"✅ Using model_actual: {model_total} tokens")
                    
            elif local_total > 0:
                # Model actual failed or returned 0, but we have local estimate
                tokens_used = local_total
                token_source = "local_estimate (fallback)"
                logger.warning(
                    f"⚠️ model_actual unavailable or zero, using local_estimate: {local_total} tokens"
                )
            else:
                # Both are zero or unavailable
                logger.error(
                    f"❌ No valid token data available:\n"
                    f"   model_actual: {model_actual}\n"
                    f"   local_estimate: {local_estimate}"
                )
            
            # 💰 DEDUCT CREDITS if we have tokens
            if tokens_used > 0:
                try:
                    # Use the appropriate source for deduction
                    billing_data = model_actual if model_total > 0 else local_estimate
                    
                    new_balance = await deduct_user_credits(
                        websocket,
                        billing_data, 
                        user, 
                        db_manager, 
                        model_name
                    )
                    
                    # Extract breakdown
                    input_tokens = model_actual.get('cumulative_input_tokens', 0) if model_total > 0 else local_estimate.get('input_tokens', 0)
                    output_tokens = model_actual.get('cumulative_output_tokens', 0) if model_total > 0 else local_estimate.get('output_tokens', 0)
                    embeddingToken = model_actual.get('total_embedding_tokens', 0) if model_total > 0 else local_estimate.get('total_embedding_tokens',0)
                    cached_tokens = token_info.get('last_turn_tokens', {}).get('prompt_tokens_details', {}).get('cached_tokens', 0)
                    
                    logger.info(
                        f"💰 Credits deducted successfully:\n"
                        f"   Source: {token_source}\n"
                        f"   Total tokens: {tokens_used}\n"
                        f"   Input tokens: {input_tokens}\n"
                        f"   Output tokens: {output_tokens}\n"
                        f"   Cached tokens: {cached_tokens}\n"
                        f"   embeddingToken: {embeddingToken}\n"
                        f"   New balance: {new_balance}"
                    )
                    
                    # Send token update to client
                    agent.message_queue.put_nowait(
                        RealtimeEvent(
                            type=EventType.CANVAS_AI_PROCESSING,
                            content={
                                "status": "completed",
                                "canvas_id": canvas_id,
                                "node_id": node_id,
                                "branch_id": branch_id,
                                "tokens_remaining": new_balance,
                                "tokens_used": tokens_used,
                                "token_source": token_source,
                                "token_breakdown": {
                                    "input": input_tokens,
                                    "output": output_tokens,
                                    "cached": cached_tokens
                                },
                                "message": "Canvas processing completed successfully"
                            }
                        )
                    )
                except Exception as e:
                    logger.error(f"❌ Failed to deduct credits: {e}", exc_info=True)
            else:
                logger.error("❌ Cannot deduct credits - no valid token count available")
            
        # Sync workspace
        if workspace:
            try:
                await workspace.sync_workspace_to_db()
            except Exception as e:
                logger.error(f"Error syncing workspace: {e}")
        
        connection_manager.remove_active_task(websocket)
        
async def create_canvas_agent_for_connection(
    llm_client: LLMClient, canvas_id: str, node_id: str,source_node_id:str, branch_id: str,
    user_id: str,session_uuid:str, workspace_manager, websocket: WebSocket, 
    tool_args: Dict[str, Any], agent_mode: str, db_manager: DatabaseManager, 
    plan: str, web_key: str, img_video: str,
    node_context: Optional[Dict] = None,
    project_context: Optional[Dict] = None,
    branch_files: Optional[List[Dict]] = None,
    node_connections: Optional[List[Dict]] = None
):
    """Create CanvasAgentExecutor with enhanced context"""
    logger_for_agent_logs = logging.getLogger(f"CanvasAgent_{canvas_id}_{node_id}")
    logger_for_agent_logs.setLevel(logging.DEBUG)

    queue = asyncio.Queue()
    tools = []
    if tool_args:
        tools,embedding_provider = get_system_tools(
            client=llm_client,
            workspace_manager=workspace_manager,
            message_queue=queue,
            container_id=global_args.docker_container_id,
            ask_user_permission=global_args.needs_permission,
            tool_args=tool_args,
            plan=plan,
            web_key=web_key,
            img_video=img_video,
            db_manager=db_manager,
            user_id=user_id,
        )
    tools = [t for t in tools if t.name != "complete"]
    system_prompt_builder = SystemPromptBuilder(WorkSpaceMode.LOCAL, agent_mode)
    token_counter = TokenCounter()
    context_manager = StandardContextManager(token_counter, logger=logger_for_agent_logs, token_budget=60_000)
    
    # Create agent with enhanced context
    agent = CanvasAgentExecutor(
        system_prompt=system_prompt_builder.default_system_prompt,
        client=llm_client,
        tools=tools,
        canvas_id=canvas_id,
        node_id=node_id,
        source_node_id=source_node_id,
        logger=logger_for_agent_logs,
        branch_id=branch_id,
        context_manager=context_manager,
        workspace_manager=workspace_manager,
        websocket=websocket,
        session_id=canvas_id,
        user_id=user_id,
        db_manager=db_manager,
        max_output_tokens_per_turn=MAX_OUTPUT_TOKENS_PER_TURN,
        max_turns=MAX_TURNS,
        message_queue=queue,
        node_context=node_context,
        project_context=project_context,
        branch_files=branch_files,
        node_connections=node_connections
    )

    return agent

async def handle_update_blocks(websocket, message, user_id, db_manager):
    """Handle granular block updates - more efficient"""
    try:
        session_id = message.get("session_id")
        content = message.get("content", {})
        changes = content.get("changes", [])
        print(changes,"changes")
        
        if not session_id:
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.ERROR,
                    content={"message": "Session ID is required"}
                ).model_dump()
            )
            return
        
        # Process each change
        results = await db_manager.apply_block_changes(
            session_id, 
            user_id, 
            changes
        )
        
        await websocket.send_json(
            RealtimeEvent(
                type="update_blocks",
                content={
                    "success": results.get("success", False),
                    "changes_applied": len(changes),
                    "message": results.get("message", "")
                }
            ).model_dump()
        )
        
    except Exception as e:
        logger.error(f"Failed to process batch update: {str(e)}")
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"error": str(e)}
            ).model_dump()
        )


async def handle_enhance_prompt(websocket, content, llm_client):
    """Handle prompt enhancement"""
    user_input = content.get("text", "")
    files = content.get("files", [])
    
    success, message, enhanced_prompt = await enhance_user_prompt(
        client=llm_client,
        user_input=user_input,
        files=files,
    )
    
    if success and enhanced_prompt:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.PROMPT_GENERATED,
                content={
                    "result": enhanced_prompt,
                    "original_request": user_input,
                },
            ).model_dump()
        )
    else:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": message},
            ).model_dump()
        )

async def handle_system_messages(websocket, msg_type, workspace_manager):
    """Handle system messages like ping, cancel, workspace_info"""
    if msg_type == "workspace_info":
        if workspace_manager:
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.WORKSPACE_INFO,
                    content={"path": str(workspace_manager.root)},
                ).model_dump()
            )
        else:
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.ERROR,
                    content={"message": "Workspace not initialized"},
                ).model_dump()
            )

    elif msg_type == "ping":
        await websocket.send_json(
            RealtimeEvent(type=EventType.PONG, content={}).model_dump()
        )

    elif msg_type == "cancel":
        active_task = connection_manager.get_active_task(websocket)
        if active_task and not active_task.done():
            active_task.cancel()
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.SYSTEM,
                    content={"message": "Query canceled"},
                ).model_dump()
            )
        else:
            await websocket.send_json(
                RealtimeEvent(
                    type=EventType.ERROR,
                    content={"message": "No active query to cancel"},
                ).model_dump()
            )

async def run_agent_async(websocket: WebSocket, user_input: str, user: str, db_manager: DatabaseManager, resume: bool = False, files: List[str] = [], model_name: str = "default_model"):
    """Run the agent asynchronously and send results back to the websocket."""
    agent = connection_manager.get_agent(websocket)
    if not agent:
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": "Agent not initialized for this connection"},
            ).model_dump()
        )
        return
    
    workspace = agent.workspace_manager
    token_info = None  # ✅ Track outside try block
    
    try:
        agent.message_queue.put_nowait(
            RealtimeEvent(type=EventType.USER_MESSAGE, content={"text": user_input})
        )
        await agent.run_agent(user_input, files, resume)

        # ✅ Get token info after successful execution
        token_info = agent.get_token_info()
        logger.info(f"Token info collected: {token_info}")

    except asyncio.CancelledError:
        logger.warning("Agent task was cancelled")
        # ✅ Still try to get partial token info
        try:
            token_info = agent.get_token_info()
        except Exception as e:
            logger.error(f"Failed to get token info after cancellation: {e}")
        raise  # Re-raise to properly handle cancellation
        
    except Exception as e:
        logger.error(f"Error running agent: {str(e)}", exc_info=True)
        
        # ✅ Still try to get token info even on error
        try:
            token_info = agent.get_token_info()
            logger.info(f"Token info collected after error: {token_info}")
        except Exception as te:
            logger.error(f"Failed to get token info after error: {te}")
        
        await websocket.send_json(
            RealtimeEvent(
                type=EventType.ERROR,
                content={"message": f"Error running agent: {str(e)}"},
            ).model_dump()
        )
        
    finally:
        # ✅ ALWAYS attempt token deduction if we have token info
        if token_info:
            print(token_info, "token_info")
            try:
                model_actual_total = token_info.get("model_actual", {}).get("cumulative_total_tokens", 0)
                local_estimate_total = token_info.get("local_estimate", {}).get("total_tokens", 0)
                tokens_to_bill = model_actual_total if model_actual_total > 0 else local_estimate_total
                
                if tokens_to_bill > 0:
                    # Create billing token info
                    if model_actual_total > 0:
                        billing_token_info = {
                            "cumulative_input_tokens": token_info["model_actual"]["cumulative_input_tokens"],
                            "cumulative_output_tokens": token_info["model_actual"]["cumulative_output_tokens"],
                            "cumulative_total_tokens": model_actual_total,
                            "total_embedding_tokens": token_info["model_actual"].get("total_embedding_tokens", 0),
                            "source": "model_actual"
                        }
                    else:
                        billing_token_info = {
                            "cumulative_input_tokens": token_info["local_estimate"]["input_tokens"],
                            "cumulative_output_tokens": token_info["local_estimate"]["output_tokens"],
                            "cumulative_total_tokens": local_estimate_total,
                            "total_embedding_tokens": token_info["local_estimate"].get("total_embedding_tokens", 0),
                            "source": "local_estimate"
                        }

                    logger.info(f"Deducting {tokens_to_bill} tokens from user {user['_id']}")
                    new_balance = await deduct_user_credits(websocket,billing_token_info, user, db_manager, model_name)
                    logger.info(f"New user balance: {new_balance}")                        
                else:
                    logger.warning("No tokens to bill - both sources returned 0")
                    
            except Exception as e:
                logger.error(f"Failed to deduct user credits: {str(e)}", exc_info=True)
        else:
            logger.warning("No token info available for billing - this request will not be charged")
        
        # Workspace sync
        if workspace:
            try:
                await workspace.sync_workspace_to_db()
            except Exception as e:
                logger.error(f"Error syncing workspace: {e}")
                
        connection_manager.remove_active_task(websocket)

async def deduct_user_credits(websocket: WebSocket,token_info: dict, user: str, db_manager: DatabaseManager, model_name: str = "default_model"):
    """Simple function to deduct credits from user balance"""
    user_id = str(user['_id'])
    user_balance = user.get("token_limit", 0)
    token = connection_manager.get_user_token(websocket)
    
    calculator = MultiModelTokenCalculator(db_manager)
    result = await calculator.deduct_credits(user_balance, token_info, user_id, model_name,token)
    return result['new_balance']

async def create_agent_for_connection(llm_client: LLMClient, session_id: uuid.UUID, user_id: str, workspace_manager, websocket: WebSocket, tool_args: Dict[str, Any], agent_mode: str, db_manager: DatabaseManager, plan: str, web_key: str, img_video: str):
    """Create a new agent instance for websocket connection"""
    device_id = websocket.query_params.get("device_id")
    logger_for_agent_logs = logging.getLogger(f"Agent_logs_{id(websocket)}")
    logger_for_agent_logs.setLevel(logging.DEBUG)

    existing_session = await db_manager.get_work_item_by_session(session_id)
    if not existing_session:
        await db_manager.create_session_safe(
            device_id=device_id,
            session_uuid=session_id,
            user_id=user_id,
            workspace_path=str(workspace_manager.root)
        )


    queue = asyncio.Queue()
    tools = []
    if tool_args:
        tools,embedding_provider = get_system_tools(
            client=llm_client,
            workspace_manager=workspace_manager,
            message_queue=queue,
            container_id=global_args.docker_container_id,
            ask_user_permission=global_args.needs_permission,
            tool_args=tool_args,
            plan=plan,
            web_key=web_key,
            img_video=img_video,
            db_manager=db_manager,
            user_id=user_id,
            session_uuid=session_id
        )
    
    system_prompt_builder = SystemPromptBuilder(WorkSpaceMode.LOCAL, agent_mode)
    token_counter = TokenCounter()
    context_manager = StandardContextManager(token_counter, logger=logger_for_agent_logs, token_budget=44_000)
    
    agent = AgentExecutor(
        system_prompt=system_prompt_builder.default_system_prompt,
        client=llm_client,
        tools=tools,
        message_queue=queue,
        logger_for_agent_logs=logger_for_agent_logs,
        context_manager=context_manager,
        workspace_manager=workspace_manager,
        agent_mode=agent_mode,
        max_output_tokens_per_turn=MAX_OUTPUT_TOKENS_PER_TURN,
        max_turns=MAX_TURNS,
        websocket=websocket,
        session_id=session_id,
        user_id=user_id,
        db_manager=db_manager,
        embedding_provider=embedding_provider
    )

    agent.session_id = session_id
    return agent

async def save_canvas_state_to_db(
    db_manager: DatabaseManager, 
    canvas_id: str, 
    user_id: str,
    canvas_state: dict,
    node_context: dict,
    project_context: dict,
    node_connections: list = None,
    branch_files: list = None,
    connected_nodes: list = None,
    branch_id: str = "main"
):
    """Save canvas state to database with multiple fallback methods"""
    try:
        state_data = {
            'canvas_id': canvas_id,
            'user_id': str(user_id),
            'branch_id': branch_id,
            'canvas_state': canvas_state,
            'node_context': node_context,
            'project_context': project_context,
            'node_connections': node_connections or [],
            'branch_files': branch_files or [],
            'connected_nodes': connected_nodes or [],
            'last_modified_by': str(user_id)
        }
        
        success = False
        
        # Method 1: Try canvas-specific save
        if hasattr(db_manager, 'save_canvas_state_comprehensive'):
            try:
                success = await db_manager.save_canvas_state_comprehensive(state_data)
                if success:
                    logger.info("Canvas state saved via save_canvas_state_comprehensive")
                    return True
            except Exception as e:
                logger.error(f"save_canvas_state_comprehensive failed: {e}")
        
        # Method 2: Try work item save
        if hasattr(db_manager, 'save_work_item'):
            try:
                work_item_data = {
                    'session_uuid': canvas_id,
                    'user_id': str(user_id),
                    'canvas_data': state_data,
                }
                success = await db_manager.save_work_item(work_item_data)
                if success:
                    logger.info("Canvas state saved via save_work_item")
                    return True
            except Exception as e:
                logger.error(f"save_work_item failed: {e}")
        
        # Method 3: Try update_work_item_blocks
        if hasattr(db_manager, 'update_work_item_blocks'):
            try:
                blocks_data = [{
                    'id': f"canvas_state_{canvas_id}",
                    'type': 'canvas_state',
                    'content': json.dumps(state_data),
                    'metadata': {
                        'canvas_id': canvas_id,
                        'branch_id': branch_id,
                        'save_type': 'canvas_state'
                    }
                }]
                result = await db_manager.update_work_item_blocks(
                    canvas_id, str(user_id), blocks_data
                )
                success = result.get('success', False)
                if success:
                    logger.info("Canvas state saved via update_work_item_blocks")
                    return True
            except Exception as e:
                logger.error(f"update_work_item_blocks failed: {e}")
        
        # Method 4: Try create_session_safe as fallback
        if hasattr(db_manager, 'create_session_safe'):
            try:
                success = await db_manager.create_session_safe(
                    device_id=canvas_id,
                    session_uuid=canvas_id,
                    user_id=str(user_id),
                    workspace_path=project_context.get('workspace_info', ''),
                    canvas_data=state_data
                )
                if success:
                    logger.info("Canvas state saved via create_session_safe")
                    return True
            except Exception as e:
                logger.error(f"create_session_safe failed: {e}")
        
        logger.error("All canvas state save methods failed")
        return False
        
    except Exception as e:
        logger.error(f"Critical error in save_canvas_state_to_db: {e}")
        return False


# source orionenv/bin/activate
# python <your_script_name>.py --host 0.0.0.0 --port 8000
