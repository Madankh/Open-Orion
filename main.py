import os
import argparse
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timedelta
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, Query, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from pymongo.errors import ConnectionFailure
from pymongo import MongoClient
from dotenv import load_dotenv
import uvicorn
from typing import Dict, Set
from fastapi.staticfiles import StaticFiles
import shutil
from yjs_endpoint import yjs_websocket_endpoint
load_dotenv()

from App.routers.api_routes_core import (
    api_router_core,
    set_global_args as set_core_global_args,
    set_global_db_manager as set_core_global_db_manager
)
from App.routers.api_routes_canvas import (
    api_router_canvas,
    set_global_args as set_canvas_global_args,
    set_global_db_manager as set_canvas_global_db_manager
)


from websocket import (
    websocket_endpoint, 
    set_global_args as set_ws_global_args,
    set_global_db_manager as set_ws_global_db_manager,
    is_workspace_active,
    get_active_workspaces_info
)

from util import parse_common_args
from Mongodb.db import DatabaseManager
from utilss.constants import UPLOAD_FOLDER_NAME, LOCAL_FALLBACK_FOLDER_NAME

# MongoDB setup
SYNC_MONGODB_URI = os.getenv("MONGODB_URI")
DATABASE_NAME = "curiositytestlab"
client = AsyncMongoClient(SYNC_MONGODB_URI)
db_manager = DatabaseManager(client=client, db_name=DATABASE_NAME)

# Workspace cleanup configuration
WORKSPACE_INACTIVITY_TIMEOUT_MINUTES = 120
GLOBAL_CLEANUP_INTERVAL_SECONDS = 2 * 60 * 60 

def get_db() -> DatabaseManager:
    return db_manager


# Create logger
logger = logging.getLogger("main_app")
logger.setLevel(logging.INFO)

# Global args
global_args = None

class DefaultArgs:
    def __init__(self):
        workspace_env = os.getenv('WORKSPACE_PATH')
        
        if workspace_env:
            self.workspace = str(Path(workspace_env).resolve())
        else:
            # Try /workspace first, fall back to a writable location
            candidate = Path('/workspace')
            try:
                candidate.mkdir(parents=True, exist_ok=True)
                self.workspace = str(candidate)
            except PermissionError:
                # Fall back to a user-writable directory
                fallback = Path.home() / 'workspace'
                fallback.mkdir(parents=True, exist_ok=True)
                self.workspace = str(fallback)
                logger.warning(f"⚠️  No permission for /workspace, using fallback: {self.workspace}")
        
        logger.info(f"📁 Workspace path initialized: {self.workspace}")
        
        self.use_container_workspace = False
        self.docker_container_id = None
        self.needs_permission = False

async def global_workspace_cleanup_task():
    """
    Periodic cleanup that removes inactive workspace files while protecting active sessions.
    Runs every 2 hours and cleans up workspaces inactive for 2+ hours.
    """
    while True:
        try:
            logger.info("=" * 70)
            logger.info("[GLOBAL CLEANUP] Starting workspace cleanup cycle")
            logger.info("=" * 70)
            
            unloaded_count = 0
            skipped_active = 0
            skipped_errors = 0
            
            # Calculate inactivity threshold
            cutoff_time = datetime.now() - timedelta(minutes=WORKSPACE_INACTIVITY_TIMEOUT_MINUTES)
            logger.info(f"🕒 Cutoff time: {cutoff_time.strftime('%Y-%m-%d %H:%M:%S')}")
            logger.info(f"⏱️  Cleaning workspaces inactive since before {cutoff_time.strftime('%H:%M:%S')}")
            
            # Query database for potentially inactive workspaces
            workspaces_collection = db_manager.workspaces
            inactive_workspaces_cursor = workspaces_collection.find(
                {"last_activity": {"$lt": cutoff_time}}
            )
            
            # Get current active workspace snapshot for logging
            active_info = await get_active_workspaces_info()
            active_workspace_ids = set(active_info['active_workspaces'].keys())
            logger.info(f"📊 Currently active sessions: {active_info['count']} workspaces")
            if active_workspace_ids:
                logger.info(f"🔒 Protected workspaces: {list(active_workspace_ids)}")
            
            # Process each potentially inactive workspace
            candidates_processed = 0
            async for ws_doc in inactive_workspaces_cursor:
                candidates_processed += 1
                workspace_id = ws_doc.get('workspace_id')
                
                # Validate workspace document
                if not workspace_id:
                    logger.warning("⚠️  Skipping workspace document without workspace_id")
                    skipped_errors += 1
                    continue
                
                # CRITICAL: Check if workspace has active sessions
                is_active = await is_workspace_active(workspace_id)
                
                if is_active:
                    logger.info(
                        f"⏭️  [{candidates_processed}] PROTECTED: {workspace_id}\n"
                        f"     Last DB activity: {ws_doc.get('last_activity')}\n"
                        f"     Status: Has active WebSocket sessions - SKIP CLEANUP"
                    )
                    skipped_active += 1
                    continue
                
                # Workspace is truly inactive - proceed with cleanup
                workspace_root_path = Path(ws_doc.get('root_path', f'{global_args.workspace}/{workspace_id}'))
                container_workspace = ws_doc.get('container_workspace')
                last_activity = ws_doc.get('last_activity', 'unknown')
                
                logger.info(
                    f"🗑️  [{candidates_processed}] CLEANING: {workspace_id}\n"
                    f"     Last activity: {last_activity}\n"
                    f"     Local path: {workspace_root_path}\n"
                    f"     Container path: {container_workspace or 'None'}\n"
                    f"     Status: No active sessions - proceeding with deletion"
                )
                
                try:
                    deleted_local = False
                    deleted_container = False
                    
                    # Keep local-only upload fallbacks when an inactive workspace
                    # is cleaned. Normal cached files and workspace artifacts are
                    # still removed as before.
                    if workspace_root_path.exists():
                        upload_dir = workspace_root_path / UPLOAD_FOLDER_NAME
                        fallback_dir = upload_dir / LOCAL_FALLBACK_FOLDER_NAME
                        has_fallback_files = (
                            fallback_dir.is_dir()
                            and not fallback_dir.is_symlink()
                            and any(path.is_file() for path in fallback_dir.iterdir())
                        )

                        if has_fallback_files:
                            for workspace_entry in workspace_root_path.iterdir():
                                if workspace_entry == upload_dir:
                                    for upload_entry in upload_dir.iterdir():
                                        if upload_entry == fallback_dir:
                                            continue
                                        if upload_entry.is_dir() and not upload_entry.is_symlink():
                                            shutil.rmtree(upload_entry, ignore_errors=True)
                                        else:
                                            upload_entry.unlink(missing_ok=True)
                                    continue
                                if workspace_entry.is_dir() and not workspace_entry.is_symlink():
                                    shutil.rmtree(workspace_entry, ignore_errors=True)
                                else:
                                    workspace_entry.unlink(missing_ok=True)
                        else:
                            shutil.rmtree(workspace_root_path, ignore_errors=True)
                        deleted_local = True
                        if has_fallback_files:
                            logger.info(
                                f"     ✅ Cleaned workspace and retained local fallback uploads: {fallback_dir}"
                            )
                        else:
                            logger.info(f"     ✅ Deleted local workspace: {workspace_root_path}")
                    else:
                        logger.info(f"     ℹ️  Local workspace already removed: {workspace_root_path}")
                    
                    # Remove container workspace if exists
                    if container_workspace:
                        container_path = Path(container_workspace)
                        if container_path.exists():
                            shutil.rmtree(container_path, ignore_errors=True)
                            deleted_container = True
                            logger.info(f"     ✅ Deleted container workspace: {container_path}")
                        else:
                            logger.info(f"     ℹ️  Container workspace already removed: {container_path}")
                    
                    if deleted_local or deleted_container:
                        logger.info(f"     ✅ Successfully cleaned up workspace: {workspace_id}")
                        unloaded_count += 1
                    else:
                        logger.info(f"     ℹ️  No files to clean for workspace: {workspace_id}")
                    
                except Exception as e:
                    logger.error(
                        f"     ❌ CLEANUP FAILED for workspace {workspace_id}: {str(e)}\n"
                        f"     Error type: {type(e).__name__}"
                    )
                    skipped_errors += 1
            
            # Final summary
            logger.info("=" * 70)
            logger.info("[GLOBAL CLEANUP] Cleanup cycle completed")
            logger.info("=" * 70)
            logger.info(f"📋 Summary:")
            logger.info(f"   • Candidates evaluated: {candidates_processed}")
            logger.info(f"   • ✅ Cleaned up: {unloaded_count} workspaces")
            logger.info(f"   • 🔒 Protected (active): {skipped_active} workspaces")
            logger.info(f"   • ❌ Errors: {skipped_errors} workspaces")
            logger.info(f"   • 📊 Currently active: {active_info['count']} workspaces")
            
            if active_workspace_ids:
                logger.info(f"   • Active workspace IDs: {sorted(active_workspace_ids)}")
            
            logger.info(f"⏰ Next cleanup in {GLOBAL_CLEANUP_INTERVAL_SECONDS // 3600} hours")
            logger.info("=" * 70)

        except Exception as e:
            logger.error("=" * 70)
            logger.error(f"❌ CRITICAL ERROR in global_workspace_cleanup_task")
            logger.error("=" * 70)
            logger.error(f"Error: {str(e)}")
            logger.error(f"Type: {type(e).__name__}")
            import traceback
            logger.error("Stack trace:")
            logger.error(traceback.format_exc())
            logger.error("=" * 70)

        # Wait for next cleanup cycle
        await asyncio.sleep(GLOBAL_CLEANUP_INTERVAL_SECONDS)
        

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("--- Lifespan Startup ---")

    try:
        await client.admin.command('ping')
        logger.info("✅ Async MongoDB connection successful.")
        await db_manager._ensure_indexes()
    except ConnectionFailure as e:
        logger.error(f"❌ Async MongoDB connection failed: {e}")

    # ⭐ CRITICAL: Initialize the split API route modules with database manager
    logger.info("Initializing API route modules...")
    set_core_global_db_manager(db_manager)
    set_canvas_global_db_manager(db_manager)
    logger.info("✅ Split API route modules (core & canvas) initialized with database")

    # ✅ Start the async background cleanup with workspace checks
    cleanup_task = asyncio.create_task(global_workspace_cleanup_task())
    logger.info("✅ Started global workspace cleanup background task with active session checks.")

    yield

    logger.info("--- Lifespan Shutdown ---")
    
    # Cancel cleanup task
    cleanup_task.cancel()
    try:
        await cleanup_task
    except asyncio.CancelledError:
        logger.info("Cleanup task cancelled successfully")
    
    await client.close()
    logger.info("✅ Async MongoDB connection closed.")


# Create FastAPI app with lifespan manager
app = FastAPI(title="Curiosity WebSocket API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:3000",
    # "https://www.curiositylab.fun"
    ],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(api_router_core)
app.include_router(api_router_canvas)

# WebSocket endpoint
@app.websocket("/ws")
async def websocket_handler(
    websocket: WebSocket, 
    token: str = Query(...),
    session_id: str = Query(...),
    db: DatabaseManager = Depends(get_db)
    ):
    """WebSocket endpoint handler"""
    return await websocket_endpoint(websocket, token,session_id,db)

@app.websocket("/yjs")
async def yjs_websocket_handler(
    websocket: WebSocket,
    token: str = Query(...),
    session_id: str = Query(...),
    db: DatabaseManager = Depends(get_db)
):
    """
    Y.js WebSocket endpoint
    Usage: ws://localhost:8000/yjs?token=<jwt>&session_id=<room_id>
    """
    await yjs_websocket_endpoint(websocket, token, session_id, db)

@app.get('/health')
async def health_check():
    """Health check endpoint for container orchestration"""
    return {"status": "ok", "service": "ai-agent"}

def setup_workspace(app, workspace_path):
    """Setup static file serving for workspace"""
    try:
        app.mount(
            "/workspace",
            StaticFiles(directory=workspace_path, html=True),
            name="workspace",
        )
    except RuntimeError:
        # Directory might not exist yet
        os.makedirs(workspace_path, exist_ok=True)
        app.mount(
            "/workspace",
            StaticFiles(directory=workspace_path, html=True),
            name="workspace",
        )


def main():
    """Main entry point for the WebSocket server."""
    global global_args
    # Parse command-line arguments
    parser = argparse.ArgumentParser(
        description="WebSocket Server for interacting with the Agent"
    )
    parser = parse_common_args(parser)
    parser.add_argument(
        "--host",
        type=str,
        default="127.0.0.1",
        help="Host to run the server on",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8000,
        help="Port to run the server on",
    )
    args = parser.parse_args()
    
    # Initialize with defaults if no args provided
    if global_args is None:
        global_args = DefaultArgs()
    
    # Update global_args with parsed arguments
    for key, value in vars(args).items():
        setattr(global_args, key, value)

    # ⭐ CRITICAL: Set global args in ALL modules (including split API routes)
    set_ws_global_args(global_args)
    set_core_global_args(global_args)    
    set_canvas_global_args(global_args)   

    # ⭐ CRITICAL: Set database manager in ALL modules (including split API routes)  
    set_ws_global_db_manager(db_manager)
    set_core_global_db_manager(db_manager)     
    set_canvas_global_db_manager(db_manager)  
    
    logger.info("✅ All modules initialized with database and args")

    # Setup workspace static files
    setup_workspace(app, global_args.workspace)

    # Start the FastAPI server
    logger.info(f"Starting WebSocket server on {global_args.host}:{global_args.port}")
    logger.info(f"📁 Using workspace directory: {global_args.workspace}")
    
    uvicorn.run(app, host=global_args.host, port=global_args.port,
            limit_concurrency=1000,
            limit_max_requests=None,
            timeout_keep_alive=3600,)

if __name__ == "__main__":
    main()
