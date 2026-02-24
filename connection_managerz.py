import asyncio
import logging
import inspect
from datetime import datetime
from typing import Dict, Set, Optional
from fastapi import WebSocket
from agents.MainAgent import MainAgent

logger = logging.getLogger("websocket_handler")

class KeepAliveManager:
    def __init__(self, websocket: WebSocket, interval: int = 10):
        self.websocket = websocket
        self.interval = interval
        self.active = False
        self.task = None
        self._lock = asyncio.Lock()
    
    async def start(self):
        """Start sending keep-alive pings with race condition protection."""
        async with self._lock:
            if self.active:
                return
            
            self.active = True
            self.task = asyncio.create_task(self._keep_alive_loop())
    
    async def stop(self):
        """Stop sending keep-alive pings with proper cleanup."""
        async with self._lock:
            self.active = False
            if self.task and not self.task.done():
                self.task.cancel()
                try:
                    await asyncio.wait_for(self.task, timeout=2.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
                except Exception as e:
                    print(f"Keep-alive cleanup error: {e}")
                finally:
                    self.task = None
    
    async def _keep_alive_loop(self):
        """Send periodic keep-alive messages with error recovery."""
        consecutive_failures = 0
        max_failures = 3
        
        try:
            while self.active and consecutive_failures < max_failures:
                await asyncio.sleep(self.interval)
                
                if not self.active:
                    break
                
                try:
                    await self.websocket.send_json({
                        "type": "keep_alive",
                        "timestamp": datetime.utcnow().isoformat(),
                        "message": "Processing..."
                    })
                    consecutive_failures = 0
                    
                except Exception as e:
                    consecutive_failures += 1
                    print(f"Keep-alive failed (attempt {consecutive_failures}): {e}")
                    
                    if consecutive_failures >= max_failures:
                        print("Too many keep-alive failures, stopping")
                        break
                        
        except asyncio.CancelledError:
            pass
        finally:
            self.active = False

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.active_agents: Dict[WebSocket, MainAgent] = {}
        self.active_tasks: Dict[WebSocket, asyncio.Task] = {}
        self.message_processors: Dict[WebSocket, asyncio.Task] = {}
        self.keep_alive_managers: Dict[WebSocket, KeepAliveManager] = {}
        self.connection_api_keys: Dict[WebSocket, Dict[str, str]] = {}
        self.connection_model_names: Dict[WebSocket, str] = {}
        self.connection_user_tokens: Dict[WebSocket, str] = {}
        self.workspace_managers = {}
        
    async def add_connection(self, websocket: WebSocket) -> KeepAliveManager:
        """Add a new WebSocket connection"""
        self.active_connections.add(websocket)
        keep_alive = KeepAliveManager(websocket, interval=15)
        self.keep_alive_managers[websocket] = keep_alive
        return keep_alive
    
    def get_agent(self, websocket: WebSocket) -> Optional[MainAgent]:
        """Get agent for a connection"""
        return self.active_agents.get(websocket)

    def set_user_token(self, websocket: WebSocket, token: str):
        self.connection_user_tokens[websocket] = token

    def get_user_token(self, websocket: WebSocket) -> Optional[str]:
        return self.connection_user_tokens.get(websocket)

    def set_agent(self, websocket: WebSocket, agent: MainAgent):
        """Set agent for a connection"""
        self.active_agents[websocket] = agent
    
    def get_active_task(self, websocket: WebSocket) -> Optional[asyncio.Task]:
        """Get active task for a connection"""
        return self.active_tasks.get(websocket)
    
    def set_active_task(self, websocket: WebSocket, task: asyncio.Task):
        """Set active task for a connection"""
        self.active_tasks[websocket] = task
    
    def remove_active_task(self, websocket: WebSocket):
        """Remove active task for a connection"""
        self.active_tasks.pop(websocket, None)
    
    def set_message_processor(self, websocket: WebSocket, processor: asyncio.Task):
        """Set message processor for a connection"""
        self.message_processors[websocket] = processor
    
    def set_api_keys(self, websocket: WebSocket, api_keys: Dict[str, str]):
        """Set API keys for a connection"""
        self.connection_api_keys[websocket] = api_keys
    
    def get_api_keys(self, websocket: WebSocket) -> Dict[str, str]:
        """Get API keys for a connection"""
        return self.connection_api_keys.get(websocket, {})
    
    def set_model_name(self, websocket: WebSocket, model_name: str):
        """Set model name for a connection"""
        self.connection_model_names[websocket] = model_name
    
    def get_model_name(self, websocket: WebSocket) -> Optional[str]:
        """Get model name for a connection"""
        return self.connection_model_names.get(websocket)
    
    def is_connection_active(self, websocket: WebSocket) -> bool:
        """Check if connection is still active"""
        return websocket in self.active_connections

async def cleanup_connection(
    websocket: WebSocket,
    connection_manager: ConnectionManager,
    *,
    background: bool = False,
    timeout_task: float = 5.0,
    timeout_processor: float = 3.0,
    timeout_agent: float = 5.0,
    logger = print,
) -> Optional[asyncio.Task]:
    """
    Comprehensive, concurrency-friendly cleanup.

    - If background=False (default): await until cleanup is *done* (deterministic).
    - If background=True: schedule cleanup and return the created asyncio.Task.
    """
    from teamCollaborate import cleanup_team_connection
    
    async def _maybe_await(callable_or_awaitable, *args, **kwargs):
        """Call a sync function or await a coroutine uniformly."""
        try:
            res = callable_or_awaitable(*args, **kwargs) if callable(callable_or_awaitable) else callable_or_awaitable
            if inspect.isawaitable(res):
                return await res
            return res
        except Exception as e:
            logger(f"Error in maybe_await: {e}")

    async def _safe_cancel(task: asyncio.Task, *, timeout: float, label: str):
        """Cancel a task and await it with a timeout."""
        if task.done():
            return
        task.cancel()
        try:
            await asyncio.wait_for(task, timeout=timeout)
        except asyncio.CancelledError:
            pass
        except asyncio.TimeoutError:
            logger(f"Timeout while cancelling {label}")
        except Exception as e:
            logger(f"Exception while cancelling {label}: {e}")

    async def _agent_cleanup(agent):
        """Drain queues, call cleanup (if any), then break circular references."""
        try:
            q = getattr(agent, "message_queue", None)
            if q is not None and hasattr(q, "empty") and hasattr(q, "get_nowait"):
                while True:
                    if q.empty():
                        break
                    try:
                        q.get_nowait()
                    except Exception:
                        break
        except Exception as e:
            logger(f"Agent queue drain error: {e}")

        try:
            if hasattr(agent, "cleanup"):
                coro = agent.cleanup
                async def _bounded_cleanup():
                    await _maybe_await(coro)

                try:
                    await asyncio.wait_for(_bounded_cleanup(), timeout=timeout_agent)
                except asyncio.TimeoutError:
                    logger("Timeout during agent.cleanup()")
        except Exception as e:
            logger(f"Agent cleanup error: {e}")

        for attr in ("websocket", "client", "tools", "workspace_manager"):
            try:
                if hasattr(agent, attr):
                    setattr(agent, attr, None)
            except Exception:
                pass

    async def _keep_alive_stop(keep_alive):
        """Stop keep-alive manager."""
        try:
            stop = getattr(keep_alive, "stop", None)
            if stop is not None:
                await _maybe_await(stop)
        except Exception as e:
            logger(f"Keep-alive stop error: {e}")

    async def _do_cleanup():
        logger(f"Starting cleanup for {id(websocket)}")

        # Remove from active connections first
        connection_manager.active_connections.discard(websocket)
        
        # Clean up team connections
        await cleanup_team_connection(websocket)

        # Get all connection data
        keep_alive = connection_manager.keep_alive_managers.pop(websocket, None)
        task = connection_manager.active_tasks.pop(websocket, None)
        agent = connection_manager.active_agents.pop(websocket, None)
        processor = connection_manager.message_processors.pop(websocket, None)

        # Clear secrets/labels immediately
        connection_manager.connection_api_keys.pop(websocket, None)
        connection_manager.connection_model_names.pop(websocket, None)

        # Collect concurrent cleanup steps
        steps = []

        if keep_alive is not None:
            steps.append(_keep_alive_stop(keep_alive))

        if isinstance(task, asyncio.Task):
            steps.append(_safe_cancel(task, timeout=timeout_task, label="active task"))

        if isinstance(processor, asyncio.Task):
            steps.append(_safe_cancel(processor, timeout=timeout_processor, label="message processor"))

        if agent is not None:
            steps.append(_agent_cleanup(agent))

        if steps:
            results = await asyncio.gather(*steps, return_exceptions=True)
            for r in results:
                if isinstance(r, Exception):
                    logger(f"Cleanup step raised: {r}")

        logger(f"Cleanup completed for {id(websocket)}")

    if background:
        t = asyncio.create_task(_do_cleanup())
        return t
    else:
        await _do_cleanup()
        return None
    