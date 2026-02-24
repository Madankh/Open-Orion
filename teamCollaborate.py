import asyncio
import logging
from datetime import datetime
from typing import Dict, Set, Any, List
from collections import defaultdict
from fastapi import WebSocket

# Team collaboration state
team_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
team_agents: Dict[str, Any] = {}
team_queues: Dict[str, asyncio.Queue] = defaultdict(asyncio.Queue)
team_session_data: Dict[str, Dict] = {}
team_processing_state: Dict[str, Dict] = {}


# Real-time session state tracking
session_connections: Dict[str, Set[WebSocket]] = defaultdict(set)  # session_id -> websockets
session_user_info: Dict[str, Dict[str, Any]] = defaultdict(dict)   # session_id -> {user_id: user_data}
session_ai_state: Dict[str, Dict] = {}                             # session_id -> ai_conversation_state
session_canvas_state: Dict[str, Any] = {}                          # session_id -> canvas_state
session_activity_log: Dict[str, List[Dict]] = defaultdict(list)    # session_id -> activity_history

async def handle_team_collaboration_message(
    websocket: WebSocket,
    message: dict,
    user: dict,
    db_manager,
    workspace_manager,
    session_uuid: str
):
    """Handle team collaboration specific messages"""
    
    msg_type = message.get("type")
    content = message.get("content", {})
    user_id = str(user['_id'])
    user_name = user.get('name', user.get('email', 'Unknown User'))
    
    if msg_type == "join_team_session":
        project_id = content.get("project_id")
        if not project_id:
            await websocket.send_json({
                "type": "error",
                "content": {"message": "Project ID is required"}
            })
            return
            
        is_member = await verify_team_membership(db_manager, user_id, project_id)
        if not is_member:
            await websocket.send_json({
                "type": "error", 
                "content": {"message": "You are not a member of this project"}
            })
            return
            
        await join_team_session(websocket, user_id, user_name, project_id, session_uuid, db_manager, workspace_manager)
        
    elif msg_type == "team_query":
        project_id = content.get("project_id")
        query_text = content.get("text", "")
        await handle_team_query(websocket, user_id, user_name, project_id, query_text, content)
        
    elif msg_type == "team_chat":
        project_id = content.get("project_id")
        chat_message = content.get("message", "")
        await broadcast_team_chat(user_id, user_name, project_id, chat_message)

async def verify_team_membership(db_manager, user_id: str, project_id: str) -> bool:
    """Verify if user is a member of the project"""
    try:
        from bson import ObjectId
        project = await db_manager.project_lists.find_one({
            "_id": ObjectId(project_id),
            "$or": [
                {"owner_id": user_id},
                {"members.id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        })
        return project is not None
    except Exception as e:
        logging.error(f"Error verifying team membership: {e}")
        return False

async def join_team_session(websocket: WebSocket, user_id: str, user_name: str, project_id: str, session_uuid: str, db_manager, workspace_manager):
    """Add user to team collaboration session"""
    
    team_connections[project_id].add(websocket)
    
    team_session_data[project_id] = {
        "session_uuid": session_uuid,
        "workspace_manager": workspace_manager,
        "db_manager": db_manager
    }
    
    if project_id not in team_processing_state:
        team_processing_state[project_id] = {
            "is_processing": False,
            "current_user": None,
            "current_user_name": None
        }
    
    if project_id not in team_agents:
        await initialize_shared_agent(project_id, user_id, session_uuid, db_manager, workspace_manager)
    
    team_members = await get_team_members(db_manager, project_id)
    
    await websocket.send_json({
        "type": "team_session_joined",
        "content": {
            "project_id": project_id,
            "team_members": team_members,
            "processing_state": team_processing_state[project_id],
            "message": f"Joined team collaboration for project {project_id}"
        }
    })
    
    await broadcast_to_team(project_id, {
        "type": "team_member_joined",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "online_count": len(team_connections[project_id]),
            "message": f"{user_name} joined the collaboration"
        }
    }, exclude_websocket=websocket)

async def get_team_members(db_manager, project_id: str) -> List[Dict]:
    """Get team members from database"""
    try:
        from bson import ObjectId
        project = await db_manager.project_lists.find_one({"_id": ObjectId(project_id)})
        if project:
            members = project.get("members", [])
            owner_id = project.get("owner_id")
            if owner_id and not any(m.get("id") == owner_id for m in members):
                owner = await db_manager.get_user_by_id(owner_id)
                if owner:
                    members.append({
                        "id": owner_id,
                        "name": owner.get("name", "Owner"),
                        "email": owner.get("email", ""),
                        "role": "owner",
                        "status": "online"
                    })
            return members
        return []
    except Exception as e:
        logging.error(f"Error getting team members: {e}")
        return []

async def initialize_shared_agent(project_id: str, user_id: str, session_uuid: str, db_manager, workspace_manager):
    """Initialize shared AI agent for the team"""
    try:
        from llm import get_client
        from agents.AgentExecutor import AgentExecutor
        from lab import get_system_tools
        from prompts.system_prompt import SystemPromptBuilder
        from utilss.constants import WorkSpaceMode
        from llm.token_counter import TokenCounter
        from llm.context_manager.standard import StandardContextManager
        
        llm_client = get_client("openai", model_name="gpt-4", use_caching=False)
        
        shared_queue = asyncio.Queue()
        team_queues[project_id] = shared_queue
        
        tool_args = {
            "deep_research": False,
            "pdf": True,
            "mode": 'team_collaboration',
            "browser": True,
        }
        
        tools = get_system_tools(
            client=llm_client,
            workspace_manager=workspace_manager,
            message_queue=shared_queue,
            container_id=None,
            ask_user_permission=False,
            tool_args=tool_args,
            plan="standard"
        )
        
        system_prompt_builder = SystemPromptBuilder(WorkSpaceMode.LOCAL, "team_collaboration")
        team_prompt = f"""
        {system_prompt_builder.default_system_prompt}
        
        TEAM COLLABORATION MODE:
        - You are assisting a team of multiple users working together on shared projects
        - Multiple team members can see your responses in real-time
        - When responding, be clear and comprehensive as multiple people are watching
        - Encourage collaboration and knowledge sharing between team members
        - All team members share the same workspace and can see each other's work
        """
        
        token_counter = TokenCounter()
        context_manager = StandardContextManager(
            token_counter,
            logger=logging.getLogger(f"TeamAgent_{project_id}"),
            token_budget=60_000,
        )
        
        agent = AgentExecutor(
            system_prompt=team_prompt,
            client=llm_client,
            tools=tools,
            message_queue=shared_queue,
            logger_for_agent_logs=logging.getLogger(f"TeamAgent_{project_id}"),
            context_manager=context_manager,
            workspace_manager=workspace_manager,
            max_output_tokens_per_turn=32768,
            max_turns=200,
            websocket=None,
            session_id=session_uuid,
            user_id=user_id,
            db_manager=db_manager
        )
        
        team_agents[project_id] = agent
        asyncio.create_task(process_shared_agent_messages(project_id))
        
    except Exception as e:
        logging.error(f"Error initializing shared agent: {e}")

async def process_shared_agent_messages(project_id: str):
    """Process messages from shared agent and broadcast to team"""
    agent = team_agents.get(project_id)
    queue = team_queues.get(project_id)
    
    if not agent or not queue:
        return
        
    try:
        message_processor = asyncio.create_task(agent.start_message_processing())
        
        while True:
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
                
                await broadcast_to_team(project_id, {
                    "type": "team_agent_response",
                    "content": event.model_dump() if hasattr(event, 'model_dump') else event
                })
                
            except asyncio.TimeoutError:
                if project_id not in team_agents:
                    break
                continue
                
    except Exception as e:
        logging.error(f"Error processing shared agent messages: {e}")
    finally:
        if message_processor and not message_processor.done():
            message_processor.cancel()

async def handle_team_query(websocket: WebSocket, user_id: str, user_name: str, project_id: str, query_text: str, content: dict):
    """Handle AI query from team member"""
    
    processing_state = team_processing_state.get(project_id, {})
    if processing_state.get("is_processing"):
        current_user_name = processing_state.get("current_user_name", "Another user")
        await websocket.send_json({
            "type": "team_ai_busy",
            "content": {
                "message": f"AI is currently processing a request from {current_user_name}. Please wait...",
                "current_user": processing_state.get("current_user"),
                "current_user_name": current_user_name
            }
        })
        return
    
    agent = team_agents.get(project_id)
    if not agent:
        await websocket.send_json({
            "type": "error",
            "content": {"message": "Shared agent not available"}
        })
        return
    
    team_processing_state[project_id] = {
        "is_processing": True,
        "current_user": user_id,
        "current_user_name": user_name
    }
    
    enhanced_query = f"[Team Request from {user_name}]: {query_text}"
    
    await broadcast_to_team(project_id, {
        "type": "team_ai_processing",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "query": query_text,
            "processing_state": team_processing_state[project_id],
            "message": f"AI is processing {user_name}'s request..."
        }
    })
    
    try:
        files = content.get("files", [])
        resume = content.get("resume", False)
        
        agent.websocket = websocket
        agent.user_id = user_id
        
        await agent.run_agent(enhanced_query, files, resume)
        
    except Exception as e:
        await broadcast_to_team(project_id, {
            "type": "team_agent_error",
            "content": {
                "error": str(e),
                "user_id": user_id,
                "user_name": user_name,
                "message": f"Error processing {user_name}'s request: {str(e)}"
            }
        })
    finally:
        team_processing_state[project_id] = {
            "is_processing": False,
            "current_user": None,
            "current_user_name": None
        }
        
        await broadcast_to_team(project_id, {
            "type": "team_ai_available",
            "content": {
                "processing_state": team_processing_state[project_id],
                "message": "AI is now available for the next request"
            }
        })

async def broadcast_team_chat(user_id: str, user_name: str, project_id: str, message: str):
    """Broadcast chat message to team members"""
    await broadcast_to_team(project_id, {
        "type": "team_chat_message",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "message": message,
            "timestamp": datetime.utcnow().isoformat()
        }
    })

async def broadcast_to_team(project_id: str, data: dict, exclude_websocket: WebSocket = None):
    """Broadcast message to all team members in a project"""
    if project_id not in team_connections:
        return
    
    disconnected_websockets = set()
    
    for websocket in team_connections[project_id]:
        if websocket == exclude_websocket:
            continue
            
        try:
            await websocket.send_json(data)
        except:
            disconnected_websockets.add(websocket)
    
    team_connections[project_id] -= disconnected_websockets

async def cleanup_session_connection(websocket: WebSocket, session_id: str, user_id: str = None):
    """Clean up when user disconnects from session"""
    
    if session_id in session_connections:
        session_connections[session_id].discard(websocket)
        
        if user_id and session_id in session_user_info and user_id in session_user_info[session_id]:
            # Remove user info
            del session_user_info[session_id][user_id]
            
            # Broadcast user left
            await broadcast_to_session(session_id, {
                "type": "user_left_session",
                "content": {
                    "user_id": user_id,
                    "timestamp": datetime.utcnow().isoformat(),
                    "online_count": len(session_user_info[session_id])
                }
            })
            
            # Log activity
            await log_session_activity(session_id, user_id, "Unknown", "left_session", {})
        
        # Clean up if no more connections
        if not session_connections[session_id]:
            session_connections.pop(session_id, None)
            session_user_info.pop(session_id, None)


async def handle_session_sync_message(
    websocket: WebSocket,
    message: dict,
    user: dict,
    db_manager,
    workspace_manager,
    session_uuid: str
):
    """Handle real-time session synchronization messages"""
    
    msg_type = message.get("type")
    content = message.get("content", {})
    user_id = str(user['_id'])
    user_name = user.get('name', user.get('email', 'Unknown User'))
    session_id = content.get("session_id") or session_uuid
    
    if not session_id:
        await websocket.send_json({
            "type": "error",
            "content": {"message": "Session ID is required"}
        })
        return
    
    # Handle different sync message types
    if msg_type == "join_session":
        await handle_join_session(websocket, user_id, user_name, session_id, content, db_manager)
    
    elif msg_type == "canvas_update":
        await handle_canvas_sync(websocket, user_id, user_name, session_id, content)
    
    elif msg_type == "ai_message_sync":
        await handle_ai_message_sync(websocket, user_id, user_name, session_id, content)
    
    elif msg_type == "user_activity_sync":
        await handle_user_activity_sync(websocket, user_id, user_name, session_id, content)
    
    elif msg_type == "whiteboard_action":
        await handle_whiteboard_sync(websocket, user_id, user_name, session_id, content)
    
    elif msg_type == "typing_in_ai":
        await handle_ai_typing_sync(websocket, user_id, user_name, session_id, content)

async def handle_join_session(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict, db_manager):
    """Handle user joining a session for real-time sync"""
    
    # Add to session connections
    session_connections[session_id].add(websocket)
    
    # Store user info
    session_user_info[session_id][user_id] = {
        "user_name": user_name,
        "websocket": websocket,
        "joined_at": datetime.utcnow().isoformat(),
        "current_view": content.get("current_view", "canvas"),
        "status": "active",
        "last_activity": datetime.utcnow().isoformat()
    }
    
    # Get current session state from database
    session_data = await get_session_state(db_manager, session_id)
    
    # Send complete session state to joining user
    await websocket.send_json({
        "type": "session_state_sync",
        "content": {
            "session_id": session_id,
            "canvas_state": session_canvas_state.get(session_id, session_data.get("canvas_state", {})),
            "ai_conversation": session_ai_state.get(session_id, session_data.get("ai_conversation", [])),
            "online_users": [
                {
                    "user_id": uid,
                    "user_name": data["user_name"],
                    "current_view": data["current_view"],
                    "status": data["status"]
                }
                for uid, data in session_user_info[session_id].items()
            ],
            "recent_activity": session_activity_log[session_id][-50:],  # Last 50 activities
            "your_user_id": user_id
        }
    })
    
    # Broadcast user joined to other session participants
    await broadcast_to_session(session_id, {
        "type": "user_joined_session",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "current_view": content.get("current_view", "canvas"),
            "timestamp": datetime.utcnow().isoformat(),
            "online_count": len(session_user_info[session_id])
        }
    }, exclude_websocket=websocket)
    
    # Log activity
    await log_session_activity(session_id, user_id, user_name, "joined_session", {
        "view": content.get("current_view", "canvas")
    })

async def handle_canvas_sync(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict):
    """Handle real-time canvas synchronization (whiteboard, notes, etc.)"""
    
    action = content.get("action")  # "add_block", "update_block", "delete_block", "move_block"
    block_data = content.get("block_data", {})
    
    # Update session canvas state
    if session_id not in session_canvas_state:
        session_canvas_state[session_id] = {"blocks": [], "last_updated": datetime.utcnow().isoformat()}
    
    canvas_state = session_canvas_state[session_id]
    
    if action == "add_block":
        block_data["id"] = block_data.get("id", f"block_{len(canvas_state['blocks'])}")
        block_data["created_by"] = user_id
        block_data["created_at"] = datetime.utcnow().isoformat()
        canvas_state["blocks"].append(block_data)
        
    elif action == "update_block":
        block_id = block_data.get("id")
        for i, block in enumerate(canvas_state["blocks"]):
            if block.get("id") == block_id:
                canvas_state["blocks"][i] = {**block, **block_data, "updated_by": user_id, "updated_at": datetime.utcnow().isoformat()}
                break
                
    elif action == "delete_block":
        block_id = block_data.get("id")
        canvas_state["blocks"] = [block for block in canvas_state["blocks"] if block.get("id") != block_id]
        
    elif action == "move_block":
        block_id = block_data.get("id")
        new_position = block_data.get("position", {})
        for block in canvas_state["blocks"]:
            if block.get("id") == block_id:
                block["position"] = new_position
                block["moved_by"] = user_id
                break
    
    canvas_state["last_updated"] = datetime.utcnow().isoformat()
    canvas_state["last_updated_by"] = user_id
    
    # Broadcast to all session participants
    await broadcast_to_session(session_id, {
        "type": "canvas_update_sync",
        "content": {
            "action": action,
            "block_data": block_data,
            "user_id": user_id,
            "user_name": user_name,
            "timestamp": datetime.utcnow().isoformat(),
            "session_id": session_id
        }
    }, exclude_websocket=websocket)
    
    # Log activity
    await log_session_activity(session_id, user_id, user_name, f"canvas_{action}", block_data)

async def handle_ai_message_sync(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict):
    """Handle real-time AI conversation synchronization"""
    
    message_type = content.get("message_type")  # "user_message", "ai_response", "ai_thinking"
    message_content = content.get("message", "")
    message_id = content.get("message_id", f"msg_{datetime.utcnow().timestamp()}")
    
    # Initialize AI state if not exists
    if session_id not in session_ai_state:
        session_ai_state[session_id] = {
            "messages": [],
            "current_request": None,
            "is_processing": False
        }
    
    ai_state = session_ai_state[session_id]
    
    # Create message object
    message_obj = {
        "id": message_id,
        "type": message_type,
        "content": message_content,
        "user_id": user_id,
        "user_name": user_name,
        "timestamp": datetime.utcnow().isoformat(),
        "files": content.get("files", [])
    }
    
    if message_type == "user_message":
        ai_state["messages"].append(message_obj)
        ai_state["current_request"] = {
            "user_id": user_id,
            "user_name": user_name,
            "message_id": message_id,
            "started_at": datetime.utcnow().isoformat()
        }
        ai_state["is_processing"] = True
        
    elif message_type == "ai_response":
        ai_state["messages"].append(message_obj)
        ai_state["current_request"] = None
        ai_state["is_processing"] = False
        
    elif message_type == "ai_thinking":
        # Update current request with thinking status
        if ai_state.get("current_request"):
            ai_state["current_request"]["thinking"] = message_content
    
    # Broadcast to all session participants
    await broadcast_to_session(session_id, {
        "type": "ai_message_sync",
        "content": {
            "message": message_obj,
            "ai_state": {
                "is_processing": ai_state["is_processing"],
                "current_request": ai_state.get("current_request")
            },
            "session_id": session_id
        }
    })
    
    # Log activity
    await log_session_activity(session_id, user_id, user_name, f"ai_{message_type}", {
        "message_preview": message_content[:100] + "..." if len(message_content) > 100 else message_content
    })

async def handle_user_activity_sync(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict):
    """Handle user activity updates (view changes, focus, etc.)"""
    
    activity_type = content.get("activity")  # "switched_to_canvas", "switched_to_ai", "focused_block"
    activity_data = content.get("data", {})
    
    # Update user info
    if session_id in session_user_info and user_id in session_user_info[session_id]:
        session_user_info[session_id][user_id]["last_activity"] = datetime.utcnow().isoformat()
        session_user_info[session_id][user_id]["current_activity"] = activity_type
        
        if activity_type == "switched_to_canvas":
            session_user_info[session_id][user_id]["current_view"] = "canvas"
        elif activity_type == "switched_to_ai":
            session_user_info[session_id][user_id]["current_view"] = "ai"
    
    # Broadcast activity to other participants
    await broadcast_to_session(session_id, {
        "type": "user_activity_update",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "activity": activity_type,
            "data": activity_data,
            "timestamp": datetime.utcnow().isoformat()
        }
    }, exclude_websocket=websocket)

async def handle_whiteboard_sync(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict):
    """Handle whiteboard-specific real-time actions"""
    
    action = content.get("action")  # "draw", "erase", "add_shape", "add_text"
    draw_data = content.get("data", {})
    
    # Broadcast immediately to all participants
    await broadcast_to_session(session_id, {
        "type": "whiteboard_action_sync",
        "content": {
            "action": action,
            "data": draw_data,
            "user_id": user_id,
            "user_name": user_name,
            "timestamp": datetime.utcnow().isoformat(),
            "session_id": session_id
        }
    }, exclude_websocket=websocket)

async def handle_ai_typing_sync(websocket: WebSocket, user_id: str, user_name: str, session_id: str, content: dict):
    """Handle AI typing indicators"""
    
    is_typing = content.get("is_typing", False)
    
    await broadcast_to_session(session_id, {
        "type": "ai_typing_indicator",
        "content": {
            "user_id": user_id,
            "user_name": user_name,
            "is_typing": is_typing,
            "timestamp": datetime.utcnow().isoformat()
        }
    }, exclude_websocket=websocket)

async def broadcast_to_session(session_id: str, data: dict, exclude_websocket: WebSocket = None):
    """Broadcast message to all participants in a session"""
    
    if session_id not in session_connections:
        return
    
    disconnected_websockets = set()
    
    for websocket in session_connections[session_id]:
        if websocket == exclude_websocket:
            continue
            
        try:
            await websocket.send_json(data)
        except Exception as e:
            logging.error(f"Failed to send to websocket: {e}")
            disconnected_websockets.add(websocket)
    
    # Remove disconnected websockets
    session_connections[session_id] -= disconnected_websockets

async def log_session_activity(session_id: str, user_id: str, user_name: str, action: str, data: dict):
    """Log session activity for history"""
    
    activity = {
        "user_id": user_id,
        "user_name": user_name,
        "action": action,
        "data": data,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    session_activity_log[session_id].append(activity)
    
    # Keep only last 1000 activities per session
    if len(session_activity_log[session_id]) > 1000:
        session_activity_log[session_id] = session_activity_log[session_id][-1000:]

async def get_session_state(db_manager, session_id: str):
    """Get session state from database"""
    try:
        session_data = await db_manager.get_work_item_by_session(session_id)
        if session_data:
            return {
                "canvas_state": session_data.get("blocks", []),
                "ai_conversation": session_data.get("ai_messages", [])
            }
        return {"canvas_state": [], "ai_conversation": []}
    except Exception as e:
        logging.error(f"Failed to get session state: {e}")
        return {"canvas_state": [], "ai_conversation": []}
    



async def cleanup_team_connection(websocket: WebSocket, user_id: str = None):
    """Clean up when team member disconnects"""
    
    for project_id, websockets in team_connections.items():
        if websocket in websockets:
            websockets.remove(websocket)
            
            processing_state = team_processing_state.get(project_id, {})
            if processing_state.get("current_user") == user_id:
                team_processing_state[project_id] = {
                    "is_processing": False,
                    "current_user": None,
                    "current_user_name": None
                }
                
                await broadcast_to_team(project_id, {
                    "type": "team_ai_available",
                    "content": {
                        "processing_state": team_processing_state[project_id],
                        "message": "AI is now available (previous user disconnected)"
                    }
                })
            
            await broadcast_to_team(project_id, {
                "type": "team_member_left",
                "content": {
                    "user_id": user_id,
                    "online_count": len(websockets),
                    "message": "A team member left"
                }
            })
            
            if not websockets:
                await cleanup_project_session(project_id)

async def cleanup_project_session(project_id: str):
    """Clean up when all team members leave"""
    
    if project_id in team_agents:
        try:
            agent = team_agents[project_id]
            if hasattr(agent, 'cleanup'):
                await agent.cleanup()
        except:
            pass
        del team_agents[project_id]
    
    team_queues.pop(project_id, None)
    team_processing_state.pop(project_id, None)
    team_session_data.pop(project_id, None)
    team_connections.pop(project_id, None)