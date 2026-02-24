"""
Y.js WebSocket Handler - FIXED for y-py API
Key fix: Use correct y-py method names
"""

import asyncio
import logging
from typing import Dict, Set, Optional
from fastapi import WebSocket
import time

try:
    import y_py as Y
    HAS_YPY = True
except ImportError:
    HAS_YPY = False
    logging.warning("y-py not installed. Install with: pip install y-py")

logger = logging.getLogger("yjs_handler")

# Constants
MAX_UPDATE_SIZE = 10 * 1024 * 1024
HEARTBEAT_INTERVAL = 30
SAVE_INTERVAL = 30
AWARENESS_TIMEOUT = 60
MAX_CONNECTIONS_PER_ROOM = 10


class YjsRoom:
    """Y.js collaboration room with CRDT support"""
    
    def __init__(self, room_id: str):
        self.room_id = room_id
        self.connections: Set[WebSocket] = set()
        self.client_ids: Dict[WebSocket, str] = {}
        self.awareness_states: Dict[str, dict] = {}
        self.lock = asyncio.Lock()
        
        if HAS_YPY:
            self.ydoc = Y.YDoc()
        else:
            self.ydoc = None
            logger.warning(f"Room {room_id} created without y-py support")
        
        self.last_save_time = time.time()
        self.pending_save = False
        self.dirty = False
        self.total_updates = 0
        self.created_at = time.time()
        
        logger.info(f"Created Y.js room: {room_id}")
    
    async def add_connection(self, websocket: WebSocket, client_id: str) -> bool:
        """Add connection to room"""
        async with self.lock:
            if len(self.connections) >= MAX_CONNECTIONS_PER_ROOM:
                logger.warning(f"Room {self.room_id} at capacity")
                return False
            
            self.connections.add(websocket)
            self.client_ids[websocket] = client_id
            logger.info(f"Client {client_id} joined room {self.room_id}")
            return True
    
    async def remove_connection(self, websocket: WebSocket):
        """Remove connection from room"""
        async with self.lock:
            client_id = self.client_ids.pop(websocket, "unknown")
            self.connections.discard(websocket)
            
            if client_id in self.awareness_states:
                del self.awareness_states[client_id]
            
            logger.info(f"Client {client_id} left room {self.room_id}")
    
    async def broadcast(self, message: bytes, exclude: Optional[WebSocket] = None):
        """Broadcast binary message to all except sender"""
        async with self.lock:
            disconnected = set()
            success_count = 0
            
            for conn in self.connections:
                if conn != exclude:
                    try:
                        await conn.send_bytes(message)
                        success_count += 1
                    except Exception as e:
                        client_id = self.client_ids.get(conn, "unknown")
                        logger.error(f"Failed to send to {client_id}: {e}")
                        disconnected.add(conn)
            
            for conn in disconnected:
                await self.remove_connection(conn)
            
            logger.debug(f"Broadcast to {success_count} clients")
    
    def apply_update(self, update: bytes) -> bool:
        """
        ✅ FIX: Apply Y.js update using correct y-py API
        """
        if not self.ydoc or not HAS_YPY:
            logger.error("Cannot apply update: y-py not available")
            return False
        
        try:
            if len(update) > MAX_UPDATE_SIZE:
                logger.warning(f"Update too large: {len(update)} bytes")
                return False
            
            if len(update) == 0:
                logger.debug("Empty update, skipping")
                return True
            
            # ✅ CORRECT: Use Y.apply_update(doc, update)
            Y.apply_update(self.ydoc, update)
            
            self.dirty = True
            self.total_updates += 1
            
            logger.debug(f"Applied update: {len(update)} bytes (total: {self.total_updates})")
            return True
        
        except Exception as e:
            logger.error(f"Failed to apply update: {e}", exc_info=True)
            return False
    
    def get_state_vector(self) -> Optional[bytes]:
        """
        ✅ FIX: Get state vector using correct y-py API
        """
        if not self.ydoc or not HAS_YPY:
            return None
        
        try:
            # ✅ CORRECT: Use Y.encode_state_vector(doc)
            return Y.encode_state_vector(self.ydoc)
        except Exception as e:
            logger.error(f"Failed to get state vector: {e}")
            return None
    
    def get_update_from_state_vector(self, state_vector: bytes) -> Optional[bytes]:
        """
        ✅ FIX: Get diff update using correct y-py API
        """
        if not self.ydoc or not HAS_YPY:
            return None
        
        try:
            if not state_vector or len(state_vector) == 0:
                # Client has nothing, send full state
                return Y.encode_state_as_update(self.ydoc)
            
            # ✅ CORRECT: Use Y.encode_state_as_update(doc, state_vector)
            diff = Y.encode_state_as_update(self.ydoc, state_vector)
            logger.debug(f"Generated diff: {len(diff)} bytes")
            return diff
        
        except Exception as e:
            logger.error(f"Failed to generate diff: {e}")
            return None
    
    def get_full_state(self) -> Optional[bytes]:
        """
        ✅ FIX: Get full state using correct y-py API
        """
        if not self.ydoc or not HAS_YPY:
            return None
        
        try:
            return Y.encode_state_as_update(self.ydoc)
        except Exception as e:
            logger.error(f"Failed to get full state: {e}")
            return None
    
    def update_awareness(self, client_id: str, awareness_data: bytes):
        """Update awareness state"""
        self.awareness_states[client_id] = {
            "data": awareness_data,
            "timestamp": time.time()
        }
    
    def cleanup_stale_awareness(self):
        """Remove stale awareness states"""
        now = time.time()
        stale = [
            cid for cid, state in self.awareness_states.items()
            if now - state["timestamp"] > AWARENESS_TIMEOUT
        ]
        for cid in stale:
            del self.awareness_states[cid]
    
    def should_save(self) -> bool:
        """Check if should save"""
        if not self.dirty or self.pending_save:
            return False
        return (time.time() - self.last_save_time) >= SAVE_INTERVAL
    
    def mark_saved(self):
        """Mark as saved"""
        self.dirty = False
        self.last_save_time = time.time()
        self.pending_save = False


class YjsCollaborationManager:
    """Manages Y.js rooms"""
    
    def __init__(self):
        self.rooms: Dict[str, YjsRoom] = {}
        self.connection_to_room: Dict[WebSocket, str] = {}
        self.lock = asyncio.Lock()
        self._cleanup_task = None
        self._metrics_task = None
    
    def start_background_tasks(self):
        """Start background tasks"""
        if self._cleanup_task is None:
            self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        if self._metrics_task is None:
            self._metrics_task = asyncio.create_task(self._metrics_loop())
    
    async def stop_background_tasks(self):
        """Stop background tasks"""
        for task in [self._cleanup_task, self._metrics_task]:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
    
    async def _cleanup_loop(self):
        """Cleanup loop"""
        while True:
            try:
                await asyncio.sleep(60)
                async with self.lock:
                    for room in self.rooms.values():
                        room.cleanup_stale_awareness()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Cleanup error: {e}")
    
    async def _metrics_loop(self):
        """Metrics loop"""
        while True:
            try:
                await asyncio.sleep(300)
                async with self.lock:
                    logger.info(
                        f"Metrics: {len(self.rooms)} rooms, "
                        f"{sum(len(r.connections) for r in self.rooms.values())} connections"
                    )
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Metrics error: {e}")
    
    async def get_or_create_room(self, room_id: str) -> YjsRoom:
        """Get or create room"""
        async with self.lock:
            if room_id not in self.rooms:
                self.rooms[room_id] = YjsRoom(room_id)
            return self.rooms[room_id]
    
    async def join_room(self, websocket: WebSocket, room_id: str, client_id: str) -> Optional[YjsRoom]:
        """Join room"""
        room = await self.get_or_create_room(room_id)
        success = await room.add_connection(websocket, client_id)
        if not success:
            return None
        
        async with self.lock:
            self.connection_to_room[websocket] = room_id
        return room
    
    async def leave_room(self, websocket: WebSocket) -> Optional[str]:
        """Leave room"""
        async with self.lock:
            room_id = self.connection_to_room.pop(websocket, None)
            if room_id and room_id in self.rooms:
                room = self.rooms[room_id]
                await room.remove_connection(websocket)
                if len(room.connections) == 0:
                    asyncio.create_task(self._cleanup_empty_room(room_id, delay=60))
            return room_id
    
    async def _cleanup_empty_room(self, room_id: str, delay: int = 60):
        """Cleanup empty room"""
        await asyncio.sleep(delay)
        async with self.lock:
            if room_id in self.rooms and len(self.rooms[room_id].connections) == 0:
                del self.rooms[room_id]
                logger.info(f"Removed empty room: {room_id}")
    
    def get_room(self, websocket: WebSocket) -> Optional[YjsRoom]:
        """Get room for connection"""
        room_id = self.connection_to_room.get(websocket)
        return self.rooms.get(room_id) if room_id else None
    
    def get_room_by_id(self, room_id: str) -> Optional[YjsRoom]:
        """Get room by ID"""
        return self.rooms.get(room_id)


# Global manager
yjs_manager = YjsCollaborationManager()


async def initialize_yjs_manager():
    """Initialize manager"""
    if not HAS_YPY:
        logger.error("y-py not installed!")
        return False
    yjs_manager.start_background_tasks()
    logger.info("Y.js manager initialized")
    return True


async def shutdown_yjs_manager():
    """Shutdown manager"""
    await yjs_manager.stop_background_tasks()
    logger.info("Y.js manager shutdown")


async def load_initial_state(room: YjsRoom, db_manager, room_id: str) -> bool:
    """Load initial state from DB"""
    try:
        if not room.ydoc or not HAS_YPY:
            return False
        
        state_bytes = None
        
        if hasattr(db_manager, 'get_yjs_state'):
            state_data = await db_manager.get_yjs_state(room_id)
            if state_data and 'data' in state_data:
                import base64
                state_bytes = base64.b64decode(state_data['data'])
        
        if state_bytes:
            room.apply_update(state_bytes)
            logger.info(f"Loaded initial state: {len(state_bytes)} bytes")
            room.dirty = False
            return True
        
        return False
    except Exception as e:
        logger.error(f"Failed to load state: {e}")
        return False


async def periodic_save_loop(room: YjsRoom, db_manager, room_id: str, user_id: str):
    """Periodic save loop"""
    try:
       pass
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Save loop error: {e}")


async def cleanup_connection(websocket: WebSocket, db_manager):
    """Cleanup connection"""
    try:
        room = yjs_manager.get_room(websocket)
        room_id = await yjs_manager.leave_room(websocket)
        
    except Exception as e:
        logger.error(f"Cleanup error: {e}")


__all__ = [
    'yjs_manager', 'YjsRoom', 'YjsCollaborationManager',
    'initialize_yjs_manager', 'shutdown_yjs_manager',
    'load_initial_state', 'save_room_state', 'periodic_save_loop',
    'cleanup_connection', 'HAS_YPY'
]