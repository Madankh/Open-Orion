"""
FIXED: Y.js WebSocket endpoint with proper binary protocol
Sends Y.js updates as binary, not JSON
"""

import asyncio
import logging
from fastapi import WebSocket, WebSocketDisconnect
import time
import json

from yjs_websocket_handler import (
    yjs_manager,
    load_initial_state,
    cleanup_connection,
    HAS_YPY
)

from yjs_protocol import (
    decode_message,
    decode_sync_message,
    encode_sync_message,
    encode_awareness_message,
    MESSAGE_SYNC,
    MESSAGE_AWARENESS,
    MESSAGE_AUTH,
    SYNC_STEP1,
    SYNC_STEP2,
    SYNC_UPDATE
)

from verifySystem import verify_token

logger = logging.getLogger("yjs_endpoint")

CONNECTION_TIMEOUT = 300
HEARTBEAT_INTERVAL = 30


async def yjs_websocket_endpoint(
    websocket: WebSocket,
    token: str,
    session_id: str,
    db
):
    """Main WebSocket endpoint with multi-user awareness"""
    
    if not HAS_YPY:
        await websocket.close(code=1011, reason="Y.js support not available")
        return
    
    user_id = None
    room = None
    heartbeat_task = None
    save_task = None
    client_id = None
    
    try:
        await websocket.accept()
        
        # Authenticate
        payload = verify_token(token)
        user_id = payload.get('id')
        user = await db.get_user_by_id(user_id)
        user_email = user.get('email', 'unknown')
        username = user.get('username')
        
        if not user_id:
            await websocket.close(code=1008, reason="Authentication failed")
            return
        
        # Join room
        client_id = f"{user_id}_{int(time.time() * 1000)}"
        room = await yjs_manager.join_room(websocket, session_id, client_id)
        
        if not room:
            await websocket.close(code=1008, reason="Room at capacity")
            return
        
        # Store user metadata on websocket
        websocket.user_id = user_id
        websocket.user_email = user_email
        websocket.client_id = client_id
        
        logger.info(f"✅ User {user_email} joined room {session_id} as {client_id}")
        
        # Load initial state
        await load_initial_state(room, db, session_id)
        
        # Send initial sync (SYNC_STEP2 with full state)
        initial_state = room.get_full_state()
        if initial_state:
            sync_msg = encode_sync_message(SYNC_STEP2, initial_state)
            await websocket.send_bytes(sync_msg)
            logger.info(f"📤 Sent initial state: {len(initial_state)} bytes")
        
        # Start background tasks
        from yjs_websocket_handler import periodic_save_loop
        heartbeat_task = asyncio.create_task(
            send_heartbeat(websocket, client_id, HEARTBEAT_INTERVAL)
        )
        save_task = asyncio.create_task(
            periodic_save_loop(room, db, session_id, user_id)
        )
        
        # Notify other users that someone joined
        await broadcast_user_joined(room, websocket, user_email, username, client_id)
        
        # Main message loop
        await handle_message_loop(
            websocket=websocket,
            room=room,
            user_id=user_id,
            client_id=client_id,
            db=db,
            session_id=session_id
        )
    
    except WebSocketDisconnect:
        logger.info(f"👋 User {user_id} disconnected from {session_id}")
    
    except Exception as e:
        logger.error(f"💥 WebSocket error: {e}", exc_info=True)
    
    finally:
        # Cleanup
        if heartbeat_task:
            heartbeat_task.cancel()
            try:
                await heartbeat_task
            except asyncio.CancelledError:
                pass
        
        if save_task:
            save_task.cancel()
            try:
                await save_task
            except asyncio.CancelledError:
                pass
        
        if room:
            # Notify others that user left
            await broadcast_user_left(room, websocket, client_id)
            await cleanup_connection(websocket, db)


async def handle_message_loop(
    websocket: WebSocket,
    room,
    user_id: str,
    client_id: str,
    db,
    session_id: str
):
    """Main message loop - handles binary Y.js and JSON awareness"""
    
    last_activity = time.time()
    message_count = 0
    
    while True:
        try:
            message = await asyncio.wait_for(
                websocket.receive(),
                timeout=CONNECTION_TIMEOUT
            )
            
            message_count += 1
            last_activity = time.time()
            
            # ============================================
            # TEXT MESSAGES (JSON)
            # ============================================
            if "text" in message:
                text_data = message["text"]
                
                try:
                    data = json.loads(text_data)
                    message_type = data.get("type")
                    
                    # ✅ NEW: Handle JSON Y.js updates from frontend
                    if message_type == "update":
                        await handle_json_yjs_update(
                            room=room,
                            websocket=websocket,
                            data=data,
                            client_id=client_id
                        )
                    
                    # Handle sync-step-1 (initial sync request)
                    elif message_type == "sync-step-1":
                        await handle_json_sync_step1(
                            room=room,
                            websocket=websocket,
                            data=data,
                            client_id=client_id
                        )
                    
                    # Handle awareness messages
                    elif message_type == "awareness":
                        await handle_json_awareness(
                            room=room,
                            websocket=websocket,
                            data=data,
                            client_id=client_id
                        )
                    
                    # Handle AI interactions
                    elif message_type == "ai-interaction-update":
                        await handle_ai_interaction(
                            room=room,
                            websocket=websocket,
                            data=data,
                            client_id=client_id
                        )
                    
                    # Handle ping
                    elif message_type == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                    
                    else:
                        logger.debug(f"Unknown text type: {message_type}")
                
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON: {e}")
            
            # ============================================
            # BINARY MESSAGES (Y.js protocol)
            # ============================================
            elif "bytes" in message:
                data = message["bytes"]
                
                # Handle ping
                if len(data) == 0:
                    await websocket.send_bytes(b'')
                    continue
                
                # Decode Y.js message
                try:
                    message_type, content = decode_message(data)
                    
                    if message_type == MESSAGE_SYNC:
                        await handle_sync_protocol(
                            websocket=websocket,
                            room=room,
                            content=content,
                            client_id=client_id
                        )
                    
                    elif message_type == MESSAGE_AWARENESS:
                        await handle_binary_awareness(
                            websocket=websocket,
                            room=room,
                            content=content,
                            client_id=client_id
                        )
                    
                except ValueError as e:
                    logger.error(f"Invalid Y.js message: {e}")
        
        except asyncio.TimeoutError:
            logger.warning(f"Connection timeout for {client_id}")
            break
        
        except WebSocketDisconnect:
            raise
        
        except Exception as e:
            logger.error(f"Message loop error: {e}", exc_info=True)
            break

async def handle_json_yjs_update(
    room,
    websocket: WebSocket,
    data: dict,
    client_id: str
):
    """Handle Y.js updates sent as JSON from frontend"""
    
    update_array = data.get("update")
    
    if not update_array:
        logger.warning(f"[{client_id}] Received empty update")
        return
    
    try:
        # Convert array to bytes
        update_bytes = bytes(update_array)
        
        logger.info(f"📥 [{client_id}] JSON Y.js update received: {len(update_bytes)} bytes")
        
        # Apply update to room's Y.js document
        success = room.apply_update(update_bytes)
        
        if success:
            logger.info(f"✅ [{client_id}] Update applied to Y.js doc")
            
            # Broadcast to all OTHER users as JSON (matching frontend format)
            broadcast_message = {
                "type": "update",
                "update": update_array,
                "clientId": client_id,
                "userId": websocket.user_id,
                "timestamp": int(time.time() * 1000)
            }
            
            broadcast_tasks = []
            for conn in room.connections:
                if conn != websocket:
                    try:
                        # Send as JSON text
                        task = conn.send_text(json.dumps(broadcast_message))
                        broadcast_tasks.append(task)
                    except Exception as e:
                        logger.error(f"Failed to broadcast update: {e}")
            
            if broadcast_tasks:
                await asyncio.gather(*broadcast_tasks, return_exceptions=True)
                logger.info(f"📡 [{client_id}] Broadcast to {len(broadcast_tasks)} users")
        else:
            logger.error(f"❌ [{client_id}] Failed to apply update")
            
    except Exception as e:
        logger.error(f"Error handling JSON Y.js update: {e}", exc_info=True)


async def handle_json_sync_step1(
    room,
    websocket: WebSocket,
    data: dict,
    client_id: str
):
    """Handle initial sync request sent as JSON"""
    
    state_vector_array = data.get("stateVector", [])
    
    try:
        logger.info(f"🔄 [{client_id}] JSON SYNC_STEP1 received")
        
        if state_vector_array and len(state_vector_array) > 0:
            # Client has some state, send diff
            state_vector = bytes(state_vector_array)
            diff = room.get_update_from_state_vector(state_vector)
            logger.info(f"📤 Sending diff: {len(diff) if diff else 0} bytes")
        else:
            # Client has no state, send everything
            diff = room.get_full_state()
            logger.info(f"📤 Sending full state: {len(diff) if diff else 0} bytes")
        
        # Send as JSON to match frontend format
        if diff:
            response = {
                "type": "sync-step-2",
                "update": list(diff)
            }
            await websocket.send_text(json.dumps(response))
            logger.info(f"✅ [{client_id}] SYNC_STEP2 sent as JSON")
        
    except Exception as e:
        logger.error(f"Error in JSON SYNC_STEP1: {e}", exc_info=True)

# ============================================
# JSON Awareness Handler
# ============================================
async def handle_json_awareness(
    room,
    websocket: WebSocket,
    data: dict,
    client_id: str
):
    """Handle JSON awareness messages and broadcast to all other users"""
    
    awareness_data = data.get("awareness")
    
    if not awareness_data:
        return
    
    logger.debug(f"👁️  [{client_id}] Broadcasting awareness to {len(room.connections) - 1} users")
    
    # Add sender info to awareness
    awareness_message = {
        "type": "awareness",
        "clientId": client_id,
        "userId": websocket.user_id,
        "userEmail": websocket.user_email,
        "awareness": awareness_data,
        "timestamp": int(time.time() * 1000)
    }
    
    # Broadcast to all OTHER users in the room
    broadcast_tasks = []
    for conn in room.connections:
        if conn != websocket:
            try:
                task = conn.send_text(json.dumps(awareness_message))
                broadcast_tasks.append(task)
            except Exception as e:
                logger.error(f"Failed to send awareness: {e}")
    
    if broadcast_tasks:
        await asyncio.gather(*broadcast_tasks, return_exceptions=True)


# ============================================
# AI Interaction Handler
# ============================================
async def handle_ai_interaction(
    room,
    websocket: WebSocket,
    data: dict,
    client_id: str
):
    """Handle AI interaction updates and broadcast to all users"""
    
    interaction = data.get("interaction", {})
    session_id = data.get("sessionId")
    
    logger.info(f"🤖 [{client_id}] AI interaction: {interaction.get('type')}")
    
    # Broadcast to all OTHER users
    interaction_message = {
        "type": "ai-interaction-update",
        "clientId": client_id,
        "userId": websocket.user_id,
        "userEmail": websocket.user_email,
        "sessionId": session_id,
        "interaction": interaction,
        "timestamp": int(time.time() * 1000)
    }
    
    broadcast_tasks = []
    for conn in room.connections:
        if conn != websocket:
            try:
                task = conn.send_text(json.dumps(interaction_message))
                broadcast_tasks.append(task)
            except Exception as e:
                logger.error(f"Failed to send AI interaction: {e}")
    
    if broadcast_tasks:
        await asyncio.gather(*broadcast_tasks, return_exceptions=True)


# ============================================
# Binary Awareness (Y.js protocol)
# ============================================
async def handle_binary_awareness(
    websocket: WebSocket,
    room,
    content: bytes,
    client_id: str
):
    """Handle binary awareness from Y.js editor"""
    
    if not content or len(content) == 0:
        return
    
    try:
        room.update_awareness(client_id, content)
        awareness_msg = encode_awareness_message(content)
        await room.broadcast(awareness_msg, exclude=websocket)
        logger.debug(f"✅ Binary awareness broadcast")
    except Exception as e:
        logger.error(f"Error handling binary awareness: {e}")


# ============================================
# Sync Protocol Handler (CRITICAL FIX)
# ============================================
async def handle_sync_protocol(
    websocket: WebSocket,
    room,
    content: bytes,
    client_id: str
):
    """Handle Y.js sync protocol - SENDS BINARY NOT JSON"""
    
    try:
        sync_type, sync_content = decode_sync_message(content)
        logger.debug(f"📥 Sync message: type={sync_type}, content_len={len(sync_content)}")
    except ValueError as e:
        logger.error(f"Invalid sync message: {e}")
        return
    
    # SYNC_STEP1: Client sends state vector, we respond with diff
    if sync_type == SYNC_STEP1:
        try:
            logger.info(f"🔄 SYNC_STEP1 from {client_id}")
            
            if sync_content and len(sync_content) > 0:
                # Client has some state, send diff
                diff = room.get_update_from_state_vector(sync_content)
                logger.info(f"📤 Sending diff: {len(diff) if diff else 0} bytes")
            else:
                # Client has no state, send everything
                diff = room.get_full_state()
                logger.info(f"📤 Sending full state: {len(diff) if diff else 0} bytes")
            
            # ✅ FIX: Send as BINARY, not JSON
            response = encode_sync_message(SYNC_STEP2, diff if diff else b'')
            await websocket.send_bytes(response)
            logger.info(f"✅ SYNC_STEP2 sent: {len(response)} bytes")
            
        except Exception as e:
            logger.error(f"Error in SYNC_STEP1: {e}", exc_info=True)
    
    # SYNC_STEP2: Server sends us updates based on our state vector
    elif sync_type == SYNC_STEP2:
        if sync_content and len(sync_content) > 0:
            logger.info(f"📥 SYNC_STEP2 received: {len(sync_content)} bytes")
            success = room.apply_update(sync_content)
            if success:
                # ✅ FIX: Broadcast as BINARY
                update_msg = encode_sync_message(SYNC_UPDATE, sync_content)
                await room.broadcast(update_msg, exclude=websocket)
                logger.info(f"📡 Broadcast SYNC_UPDATE to room")
    
    # SYNC_UPDATE: Incremental update from client
    elif sync_type == SYNC_UPDATE:
        if sync_content and len(sync_content) > 0:
            logger.info(f"📥 SYNC_UPDATE received: {len(sync_content)} bytes")
            success = room.apply_update(sync_content)
            if success:
                # ✅ FIX: Broadcast as BINARY
                update_msg = encode_sync_message(SYNC_UPDATE, sync_content)
                await room.broadcast(update_msg, exclude=websocket)
                logger.info(f"📡 Broadcast SYNC_UPDATE to room")


async def broadcast_user_joined(room, websocket, user_email, username, client_id):
    """Notify all users when someone joins"""
    
    join_message = {
        "type": "user-joined",
        "clientId": client_id,
        "userEmail": user_email,
        "username": username,
        "timestamp": int(time.time() * 1000)
    }
    
    for conn in room.connections:
        if conn != websocket:
            try:
                await conn.send_text(json.dumps(join_message))
            except:
                pass


async def broadcast_user_left(room, websocket, client_id):
    """Notify all users when someone leaves"""
    
    leave_message = {
        "type": "user-left",
        "clientId": client_id,
        "timestamp": int(time.time() * 1000)
    }
    
    for conn in room.connections:
        if conn != websocket:
            try:
                await conn.send_text(json.dumps(leave_message))
            except:
                pass


# ============================================
# Heartbeat
# ============================================
async def send_heartbeat(websocket: WebSocket, client_id: str, interval: int):
    """Send periodic heartbeat"""
    
    try:
        while True:
            await asyncio.sleep(interval)
            await websocket.send_bytes(b'')  # Binary ping
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Heartbeat error: {e}")