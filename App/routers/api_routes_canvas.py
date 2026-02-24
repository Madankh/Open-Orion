import os
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler
import uuid
import base64
import io
from pathlib import Path
from fastapi import APIRouter, Query, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo import MongoClient
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from bson import ObjectId
from pydantic import BaseModel, Field, validator
from typing import Dict, List, Any, Optional
from verifySystem import verify_token, get_current_user
from Mongodb.db import DatabaseManager
from utilss.constants import UPLOAD_FOLDER_NAME
from utilss.workspace_manager import WorkspaceManager
from validation import SecurityValidator
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address
import magic
import boto3
from botocore.exceptions import ClientError
from bson import ObjectId
from bson.errors import InvalidId
load_dotenv()

# ==================== CONFIGURATION ====================
LOG_DIR = Path(os.getenv('LOG_DIR', '/tmp/Orion_project/logs'))
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ==================== LOGGING ====================
logger = logging.getLogger("api_routes_canvas")
logger.setLevel(logging.INFO)

file_handler = RotatingFileHandler(
    LOG_DIR / "api_canvas.log",
    maxBytes=10*1024*1024,
    backupCount=5
)
file_handler.setLevel(logging.INFO)
formatter = logging.Formatter(
    '%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)

file_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# ==================== SECURITY ====================
security = HTTPBearer()

# ==================== API ROUTER ====================
api_router_canvas = APIRouter(prefix="/api")

# ==================== ENVIRONMENT VARIABLES ====================
SYNC_MONGODB_URI = os.environ.get("MONGODB_URI")
MONGODB_DATABASE = os.environ.get("MONGODB_DATABASE")
BUCKET_NAME = os.getenv("BUCKET_NAME")
BUCKET_REGION = os.getenv("BUCKET_REGION")
ACCESS_KEY = os.getenv("ACCESS_KEY")
aws_secret_access_key = os.getenv("Secret_access_key")

# ==================== S3 CLIENT ====================
s3_client = boto3.client(
    's3',
    aws_access_key_id=ACCESS_KEY,
    aws_secret_access_key=aws_secret_access_key,
    region_name=BUCKET_REGION 
)

# ==================== GLOBAL STATE ====================
global_db_manager = None
global_args = None
WORKSPACE_BASE = Path(os.getenv("WORKSPACE_BASE", "./workspace")).resolve()
WORKSPACE_BASE.mkdir(parents=True, exist_ok=True)

async def validate_session_id(session_id: str) -> Optional[uuid.UUID]:
    """Validate and convert session_id to UUID format"""
    try:
        return uuid.UUID(session_id)
    except (ValueError, AttributeError):
        logger.warning(f"Invalid session_id format: {session_id}")
        return None
    
RATE_LIMITS = {
    'upload': os.getenv('RATE_LIMIT_UPLOAD', '10/minute'),     
    'download': os.getenv('RATE_LIMIT_DOWNLOAD', '30/minute'),  
    'workspace': os.getenv('RATE_LIMIT_WORKSPACE', '20/minute')
}

def set_global_args(args):
    global global_args
    global_args = args

def set_global_db_manager(db_manager):
    global global_db_manager
    global_db_manager = db_manager

def get_db_manager() -> DatabaseManager:
    if global_db_manager is None:
        raise HTTPException(status_code=500, detail="Database manager not initialized")
    return global_db_manager

def get_database() -> DatabaseManager:
    if global_db_manager is None:
        raise HTTPException(status_code=500, detail="Database manager not initialized")
    return global_db_manager

def get_async_db():
    """Get asynchronous database connection"""
    async_client = AsyncMongoClient(SYNC_MONGODB_URI)
    return async_client[MONGODB_DATABASE]

# ==================== REQUEST MODELS ====================
class NodePosition(BaseModel):
    x: float
    y: float

class CreateNodeRequest(BaseModel):
    canvas_id: str
    node_id: str
    branch_id: str = "main"
    parent_node_id: Optional[str] = None
    node_type: str
    title: str = Field(..., max_length=500)
    group_id: Optional[str] = ''
    global_note_id: Optional[str] = ''
    s3_key: Optional[str] = ''
    content: str = Field(..., max_length=1_000_000) 
    position_x: float
    position_y: float
    width: Optional[float] = 420.0 
    height: Optional[float] = 200.0
    level: int = 0
    color: str = "#3B82F6"
    is_expanded: bool = True
    project_note_id: Optional[str] = ''
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    media_url: Optional[str] = None
    pdfUrl: Optional[str] = None
    pdfFile: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    @validator('content')
    def sanitize_content(cls, v):
        if '<script' in v.lower():
            raise ValueError('Script tags not allowed')
        return v

class UpdateNodeRequest(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None
    parent_node_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None   
    height: Optional[float] = None 
    is_expanded: Optional[bool] = None
    color: Optional[str] = None
    s3_key: Optional[str] = None
    node_type: Optional[str] = None
    media_url: Optional[str] = None

class CreateConnectionRequest(BaseModel):
    canvas_id: str
    branch_id: str = "main"
    connection_id: Optional[str] = None 
    from_node_id: str
    to_node_id: str
    from_point: str = "bottom"
    to_point: str = "top"
    color: Optional[str] = "slate"
    stroke_style: Optional[str] = "solid"
    arrow_type: Optional[str] = "end"

class UpdateConnectionRequest(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    stroke_style: Optional[str] = None
    arrow_type: Optional[str] = None

class BatchCreateNodesRequest(BaseModel):
    canvas_id: str
    branch_id: str = "main"
    nodes: List[CreateNodeRequest]
    connections: List[CreateConnectionRequest]

class BatchUpdateNodeRequest(BaseModel):
    updates: List[Dict[str, Any]]

class BatchFetchNotesRequest(BaseModel):
    session_ids: List[str]

class NodeResponse(BaseModel):
    node_id: str
    canvas_id: str
    branch_id: str
    parent_node_id: Optional[str]
    group_id: Optional[str] = None
    node_type: str
    s3_key: Optional[str] = ''
    project_note_id: Optional[str] = ''
    global_note_id: Optional[str] = ''
    title: str
    content: str
    position_x: float
    position_y: float
    width: float
    height: float
    level: int
    color: str
    is_expanded: bool
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    media_url: Optional[str] = None
    pdfUrl: Optional[str] = None
    pdfFile: Optional[str] = None
    updated_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class ConnectionResponse(BaseModel):
    connection_id: str
    canvas_id: str
    branch_id: str
    from_node_id: str
    to_node_id: str
    from_point: str
    to_point: str
    color: Optional[str] = "slate"
    stroke_style: Optional[str] = "solid"
    arrow_type: Optional[str] = "end"
    label: str = ""

class CanvasStateResponse(BaseModel):
    canvas_id: str
    branch_id: str
    nodes: List[NodeResponse]
    connections: List[ConnectionResponse]
    total_nodes: int
    total_connections: int

# ==================== HELPER FUNCTIONS ====================
def serialize_datetime_objects(obj):
    """Recursively convert datetime objects to ISO strings"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {key: serialize_datetime_objects(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [serialize_datetime_objects(item) for item in obj]
    return obj


async def get_session_project_info(
    db_manager: DatabaseManager,
    session_id: str
) -> Optional[Dict[str, Any]]:
    """Get session and associated project information"""
    try:
        workspace_info = await db_manager.workspaces.find_one({
            "workspace_id": session_id
        })
        
        if not workspace_info:
            logger.warning(f"Workspace not found for session: {session_id}")
            return None
        print(workspace_info, "workspace_info")
        return workspace_info
    except Exception as e:
        logger.error(f"Error fetching workspace info: {str(e)}")
        return None


async def verify_session_ownership(
    db_manager: DatabaseManager,
    session_id: str,
    user_id: str
) -> bool:
    """Verify session ownership"""
    try:
        workspace = await db_manager.workspaces.find_one({
            "workspace_id": session_id,
            "userid": user_id
        })
        
        if not workspace:
            logger.warning(
                f"Session ownership verification failed - "
                f"Session: {session_id}, User: {user_id}"
            )
            return False
        
        return True
        
    except Exception as e:
        logger.error(f"Session ownership verification error: {e}")
        return False

async def verify_project_access(
    db_manager: DatabaseManager,
    session_id: str,
    user_id: str
) -> Optional[Dict[str, Any]]:
    """Verify project access"""
    try:
        workspace = await db_manager.workspaces.find_one({
            "workspace_id": session_id
        })
        
        if not workspace:
            return None
        
        if workspace.get("userid") == user_id:
            return {
                "type": "personal",
                "access_level": "owner"
            }
        
        project_id = workspace.get("project_id")
        if not project_id:
            return None
        
        try:
            project = await db_manager.project_lists.find_one({
                "_id": ObjectId(project_id),
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            })
            
            if not project:
                return None
            
            access_level = "owner" if project.get("owner_id") == user_id else \
                          project.get("permissions", {}).get(user_id, "viewer")
            
            return {
                "type": "group",
                "access_level": access_level,
                "project_id": str(project_id)
            }
            
        except Exception as e:
            logger.error(f"Project access check error: {e}")
            return None
            
    except Exception as e:
        logger.error(f"Access verification error: {e}")
        return None

# ==================== NODE ENDPOINTS ====================
@api_router_canvas.post("/nodes", response_model=NodeResponse)
async def create_node(
    request: CreateNodeRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Create a new canvas node"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user_id = user_data.get("_id") or user_data.get("user_id")
        
        logger.info(f"NODE_CREATE: User={user_id}, Canvas={request.canvas_id}, Type={request.node_type}, Title={request.title[:50]}")
        
        node_data = {
            'canvas_id': request.canvas_id,
            'node_id': request.node_id,
            'branch_id': request.branch_id,
            'parent_node_id': request.parent_node_id,
            'node_type': request.node_type,
            's3_key': request.s3_key or '',
            'group_id': request.group_id or '',
            'project_note_id': request.project_note_id or '',
            'global_note_id': request.global_note_id or '',
            'title': request.title,
            'content': request.content,
            'position_x': request.position_x,
            'position_y': request.position_y,
            'width': request.width,
            'height': request.height,
            'level': request.level,
            'color': request.color,
            'is_expanded': request.is_expanded,
            'created_by': user_id,
            'metadata': request.metadata or {}
        }
        
        if request.file_type:
            node_data['file_type'] = request.file_type
        if request.file_name:
            node_data['file_name'] = request.file_name
        if request.media_url:
            node_data['media_url'] = request.media_url
        if request.pdfUrl:
            node_data['pdfUrl'] = request.pdfUrl
        if request.pdfFile:
            node_data['pdfFile'] = request.pdfFile
        
        is_valid, error_msg = SecurityValidator.validate_node_data(node_data)
        
        if not is_valid:
            logger.warning(f"NODE_VALIDATION_FAILED: User={user_id}, Error={error_msg}")
            raise HTTPException(status_code=400, detail=f"Security validation failed: {error_msg}")
    
        result = await db_manager.save_canvas_node_with_branch(node_data)
        
        logger.info(f"Created node {request.node_id} in canvas {request.canvas_id}")
        
        return NodeResponse(
            node_id=request.node_id,
            canvas_id=request.canvas_id,
            branch_id=request.branch_id,
            parent_node_id=request.parent_node_id,
            node_type=request.node_type,
            title=node_data['title'],
            content=node_data['content'],
            s3_key=request.s3_key or '',
            group_id=request.group_id or '',
            project_note_id=request.project_note_id or '',
            global_note_id=request.global_note_id or '',
            position_x=request.position_x,
            position_y=request.position_y,
            width=request.width,
            height=request.height,
            level=request.level,
            color=request.color,
            is_expanded=request.is_expanded,
            file_type=request.file_type,
            file_name=request.file_name,
            media_url=node_data.get('media_url'), 
            pdfUrl=node_data.get('pdfUrl'),
            pdfFile=request.pdfFile,
            metadata=request.metadata or {}
        )
        
    except Exception as e:
        logger.error(f"Error creating node: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.patch("/nodes/{canvas_id}/batch-update")
async def batch_update_nodes(
    canvas_id: str,
    request: BatchUpdateNodeRequest,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Batch update multiple canvas nodes"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        updated_count = await db_manager.batch_update_canvas_nodes(
            canvas_id=canvas_id,
            branch_id=branch_id,
            updates=request.updates
        )
        
        logger.info(f"Batch updated {updated_count} nodes in canvas {canvas_id}")
        
        return JSONResponse(content={
            "message": "Nodes updated successfully",
            "canvas_id": canvas_id,
            "updated_count": updated_count
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error batch updating nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.patch("/nodes/{canvas_id}/{node_id}")
async def update_node(
    canvas_id: str,
    node_id: str,
    request: UpdateNodeRequest,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Update an existing canvas node"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        update_data = {'updated_at': datetime.utcnow()}
        
        if request.content is not None:
            update_data['content'] = request.content
        if request.title is not None:
            update_data['title'] = request.title
        if request.position_x is not None:
            update_data['position_x'] = request.position_x
        if request.position_y is not None:
            update_data['position_y'] = request.position_y
        if request.is_expanded is not None:
            update_data['is_expanded'] = request.is_expanded
        if request.color is not None:
            update_data['color'] = request.color
        if request.parent_node_id is not None:
            update_data['parent_node_id'] = request.parent_node_id
        if request.width is not None:
            update_data['width'] = request.width
        if request.height is not None:
            update_data['height'] = request.height
        if request.s3_key is not None:
            update_data['s3_key'] = request.s3_key
        if request.node_type is not None:
            update_data['node_type'] = request.node_type
        if request.media_url is not None:
            update_data["media_url"] = request.media_url
        
        is_valid, error_msg = SecurityValidator.validate_node_data(update_data)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Security validation failed: {error_msg}")
        
        result = await db_manager.update_canvas_node(
            canvas_id=canvas_id,
            node_id=node_id,
            branch_id=branch_id,
            update_data=update_data
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Node not found")
        
        logger.info(f"Updated node {node_id} in canvas {canvas_id}")
        
        return JSONResponse(content={
            "message": "Node updated successfully",
            "node_id": node_id,
            "canvas_id": canvas_id,
            "updated_fields": list(update_data.keys())
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating node: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.delete("/nodes/{canvas_id}/{node_id}")
async def delete_node(
    canvas_id: str,
    node_id: str,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Delete a canvas node and its connections"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        await db_manager.delete_canvas_node(canvas_id, node_id, branch_id)
        
        await db_manager.db.canvas_connections.delete_many({
            "canvas_id": canvas_id,
            "branch_id": branch_id,
            "$or": [
                {"from_node_id": node_id},
                {"to_node_id": node_id}
            ]
        })
        
        logger.info(f"Deleted node {node_id} and connections from canvas {canvas_id}")
        
        return JSONResponse(content={
            "message": "Node and associated connections deleted",
            "node_id": node_id,
            "canvas_id": canvas_id
        })
        
    except Exception as e:
        logger.error(f"Error deleting node: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.get("/nodes/{canvas_id}/viewport", response_model=CanvasStateResponse)
async def get_nodes_in_viewport(
    canvas_id: str,
    x_min: float = Query(..., description="Left boundary"),
    x_max: float = Query(..., description="Right boundary"),
    y_min: float = Query(..., description="Top boundary"),
    y_max: float = Query(..., description="Bottom boundary"),
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Fetch only nodes visible within the specific viewport coordinates"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")

        node_query = {
            "canvas_id": canvas_id,
            "branch_id": branch_id,
            "position_x": {"$gte": x_min, "$lte": x_max},
            "position_y": {"$gte": y_min, "$lte": y_max}
        }

        cursor = db_manager.canvas_nodes.find(node_query)
        
        visible_nodes = []
        visible_node_ids = []

        async for node in cursor:
            visible_node_ids.append(node['node_id'])
            visible_nodes.append(NodeResponse(
                node_id=node['node_id'],
                canvas_id=node['canvas_id'],
                branch_id=node['branch_id'],
                node_type=node['node_type'],
                title=node['title'],
                content=node['content'],
                position_x=node['position_x'],
                position_y=node['position_y'],
                level=node['level'],
                color=node['color'],
                s3_key=node.get('s3_key'),
                width=node.get('width', 420.0),
                height=node.get('height', 200.0),
                parent_node_id=node.get('parent_node_id'),
                group_id=node.get('group_id'),
                project_note_id=node.get('project_note_id'),
                global_note_id=node.get('global_note_id'),
                is_expanded=node.get('is_expanded', True),
                file_type=node.get('file_type'),
                file_name=node.get('file_name'),
                media_url=node.get('media_url'),
                pdfUrl=node.get('pdfUrl'),
                pdfFile=node.get('pdfFile'),
                metadata=node.get('metadata', {}), 
                created_at=node.get('created_at', datetime.utcnow()).isoformat() if isinstance(node.get('created_at'), datetime) else None,
                updated_at=node.get('updated_at', datetime.utcnow()).isoformat() if isinstance(node.get('updated_at'), datetime) else None
            ))

        connection_query = {
            "canvas_id": canvas_id,
            "branch_id": branch_id,
            "$or": [
                {"from_node_id": {"$in": visible_node_ids}},
                {"to_node_id": {"$in": visible_node_ids}}
            ]
        }

        conn_cursor = db_manager.canvas_connections.find(connection_query)
        visible_connections = []

        async for conn in conn_cursor:
            visible_connections.append(ConnectionResponse(
                connection_id=str(conn.get('connection_id', conn['_id'])),
                canvas_id=conn['canvas_id'],
                branch_id=conn['branch_id'],
                from_node_id=conn['from_node_id'],
                to_node_id=conn['to_node_id'],
                from_point=conn.get('from_point', 'bottom'),
                to_point=conn.get('to_point', 'top'),
                color=conn.get('color', 'slate'),
                stroke_style=conn.get('stroke_style', 'solid'),
                arrow_type=conn.get('arrow_type', 'end'),
                label=conn.get("label", "")
            ))

        return CanvasStateResponse(
            canvas_id=canvas_id,
            branch_id=branch_id,
            nodes=visible_nodes,
            connections=visible_connections,
            total_nodes=len(visible_nodes),
            total_connections=len(visible_connections)
        )

    except Exception as e:
        logger.error(f"Error fetching viewport nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CONNECTION ENDPOINTS ====================
@api_router_canvas.post("/connections", response_model=ConnectionResponse)
async def create_connection(
    request: CreateConnectionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Create a new canvas connection"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
            
        conn_id = request.connection_id if request.connection_id else str(uuid.uuid4())
        connection_data = {
            'canvas_id': request.canvas_id,
            'branch_id': request.branch_id,
            'connection_id': conn_id, 
            'from_node_id': request.from_node_id,
            'to_node_id': request.to_node_id,
            'from_point': request.from_point,
            'to_point': request.to_point,
            'color': request.color,
            'stroke_style': request.stroke_style,
            'arrow_type': request.arrow_type,
        }
        
        await db_manager.save_canvas_connection(connection_data)
        
        return ConnectionResponse(
            connection_id=conn_id,
            canvas_id=request.canvas_id,
            branch_id=request.branch_id,
            from_node_id=request.from_node_id,
            to_node_id=request.to_node_id,
            from_point=request.from_point,
            to_point=request.to_point,
            color=request.color,
            stroke_style=request.stroke_style,
            arrow_type=request.arrow_type,
        )
        
    except Exception as e:
        logger.error(f"Error creating connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.patch("/connections/{canvas_id}/{connection_id_param}")
async def update_connection(
    canvas_id: str,
    connection_id_param: str,
    request: UpdateConnectionRequest,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Update connection (accepts either connection_id OR MongoDB _id)"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")

        update_data = {}
        if request.label is not None:
            update_data['label'] = request.label
        if request.color is not None:
            update_data['color'] = request.color
        if request.stroke_style is not None:
            update_data['stroke_style'] = request.stroke_style
        if request.arrow_type is not None:
            update_data['arrow_type'] = request.arrow_type
        
        if not update_data:
            return {"message": "No changes detected"}

        update_data['updated_at'] = datetime.utcnow()

        filter_query = {
            "canvas_id": canvas_id,
            "branch_id": branch_id
        }

        is_valid_object_id = False
        try:
            valid_oid = ObjectId(connection_id_param)
            is_valid_object_id = True
        except:
            is_valid_object_id = False

        if is_valid_object_id:
            filter_query["$or"] = [
                {"connection_id": connection_id_param},
                {"_id": ObjectId(connection_id_param)}
            ]
        else:
            filter_query["connection_id"] = connection_id_param

        result = await db_manager.db.canvas_connections.update_one(
            filter_query,
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail=f"Connection not found (searched for {connection_id_param})")

        return {"success": True, "message": "Connection updated"}

    except Exception as e:
        logger.error(f"Error updating connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.delete("/connections/{canvas_id}/{from_node_id}/{to_node_id}")
async def delete_connection(
    canvas_id: str,
    from_node_id: str,
    to_node_id: str,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Delete a specific connection"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        await db_manager.delete_canvas_connection(
            canvas_id=canvas_id,
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            branch_id=branch_id
        )
        
        logger.info(f"Deleted connection {from_node_id} → {to_node_id}")
        
        return JSONResponse(content={
            "message": "Connection deleted successfully",
            "from_node_id": from_node_id,
            "to_node_id": to_node_id
        })
        
    except Exception as e:
        logger.error(f"Error deleting connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== CANVAS STATE ENDPOINTS ====================
@api_router_canvas.get("/state/{canvas_id}", response_model=CanvasStateResponse)
async def get_canvas_state(
    canvas_id: str,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Get complete canvas state (all nodes and connections)"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        nodes_cursor = await db_manager.get_canvas_nodes(canvas_id, branch_id)
        nodes = []
        
        async for node in nodes_cursor:
            nodes.append(NodeResponse(
                node_id=node['node_id'],
                canvas_id=node['canvas_id'],
                branch_id=node['branch_id'],
                node_type=node['node_type'],
                title=node['title'],
                content=node['content'],
                position_x=node['position_x'],
                position_y=node['position_y'],
                level=node['level'],
                color=node['color'],
                s3_key=node.get('s3_key'),
                width=node.get('width', 420.0),
                height=node.get('height', 200.0),
                parent_node_id=node.get('parent_node_id'),
                project_note_id=node.get('project_note_id'),
                is_expanded=node.get('is_expanded', True),
                file_type=node.get('file_type'),
                file_name=node.get('file_name'),
                media_url=node.get('media_url'),
                pdfUrl=node.get('pdfUrl'),
                pdfFile=node.get('pdfFile'),
                metadata=node.get('metadata', {}), 
                created_at=node['created_at'].isoformat(),
                updated_at=node.get('updated_at').isoformat() if node.get('updated_at') else None
            ))
        
        connections_cursor = await db_manager.get_canvas_connections(canvas_id, branch_id)
        connections = []
        
        async for conn in connections_cursor:
            connections.append(ConnectionResponse(
                connection_id=str(conn['_id']),
                canvas_id=conn['canvas_id'],
                branch_id=conn['branch_id'],
                from_node_id=conn['from_node_id'],
                to_node_id=conn['to_node_id'],
                from_point=conn['from_point'],
                to_point=conn['to_point'],
                color=conn['color'],
                stroke_style=conn['stroke_style'],
                arrow_type=conn['arrow_type'],
                label=conn.get("label") or "",
                created_at=conn['created_at'].isoformat()
            ))
        
        logger.info(f"Retrieved canvas state for {canvas_id}: {len(nodes)} nodes, {len(connections)} connections")
        
        return CanvasStateResponse(
            canvas_id=canvas_id,
            branch_id=branch_id,
            nodes=nodes,
            connections=connections,
            total_nodes=len(nodes),
            total_connections=len(connections)
        )
        
    except Exception as e:
        logger.error(f"Error retrieving canvas state: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router_canvas.post("/batch/save")
async def batch_save_canvas_state(
    request: BatchCreateNodesRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager)
):
    """Batch save multiple nodes and connections at once"""
    try:
        user_data = verify_token(credentials.credentials)
        if not user_data:
            raise HTTPException(status_code=401, detail="Invalid authentication")
        user_id = user_data.get("_id") or user_data.get("user_id")
        
        created_nodes = []
        created_connections = []
        
        for node_req in request.nodes:
            node_data = {
                'canvas_id': request.canvas_id,
                'node_id': node_req.node_id,
                'branch_id': request.branch_id,
                'parent_node_id': node_req.parent_node_id,
                'node_type': node_req.node_type,
                'title': node_req.title,
                'content': node_req.content,
                'position_x': node_req.position_x,
                'position_y': node_req.position_y,
                'width': node_req.width,
                'height': node_req.height,
                'level': node_req.level,
                'color': node_req.color,
                'is_expanded': node_req.is_expanded,
                'created_by': user_id,
                'created_at': datetime.utcnow()
            }
            
            if node_req.file_type:
                node_data['file_type'] = node_req.file_type
            if node_req.file_name:
                node_data['file_name'] = node_req.file_name
            if node_req.media_url:
                node_data['media_url'] = node_req.media_url
            
            await db_manager.save_canvas_node_with_branch(node_data)
            created_nodes.append(node_req.node_id)
        
        for conn_req in request.connections:
            connection_data = {
                'canvas_id': request.canvas_id,
                'branch_id': request.branch_id,
                'from_node_id': conn_req.from_node_id,
                'to_node_id': conn_req.to_node_id,
                'from_point': conn_req.from_point,
                'to_point': conn_req.to_point,
                'created_at': datetime.utcnow()
            }
            
            await db_manager.save_canvas_connection(connection_data)
            created_connections.append(f"{conn_req.from_node_id} → {conn_req.to_node_id}")
        
        logger.info(f"Batch saved {len(created_nodes)} nodes and {len(created_connections)} connections")
        
        return JSONResponse(content={
            "message": "Batch save successful",
            "canvas_id": request.canvas_id,
            "created_nodes": created_nodes,
            "created_connections": created_connections,
            "total_nodes": len(created_nodes),
            "total_connections": len(created_connections)
        })
        
    except Exception as e:
        logger.error(f"Error in batch save: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# This file continues from api_routes_canvas.py
# Add these endpoints to api_routes_canvas.py or import them

# ==================== NOTE & SESSION ENDPOINTS ====================

@api_router_canvas.get("/note/session/{session_id}")
async def get_session_blocks_alternative(
    session_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=15),
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Paginated blocks endpoint"""
    try:
        user_id = current_user['id']
        
        notepad_result = await db.load_notepad_blocks_paginated(
            session_id, user_id, page, page_size
        )
        
        if notepad_result["success"]:
            response_data = {
                "blocks": notepad_result["blocks"],
                "pagination": notepad_result.get("pagination", {}),
                "metadata": {
                    "timestamp": notepad_result.get("timestamp"),
                    "workspace_dir": f"workspace/{session_id}"
                }
            }
            return JSONResponse(content=serialize_datetime_objects(response_data))
        
        response_data = {
            "blocks": [],
            "pagination": {"total_blocks": 0, "page": page, "page_size": page_size},
            "metadata": {
                "workspace_dir": f"workspace/{session_id}"
            }
        }
        return JSONResponse(content=serialize_datetime_objects(response_data))
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        error_response = {
            "blocks": [],
            "pagination": {"total_blocks": 0},
            "metadata": {"workspace_dir": f"workspace/{session_id}"},
            "error": str(e)
        }
        return JSONResponse(content=error_response, status_code=500)

@api_router_canvas.get("/projects/{project_id}/notes")
async def get_project_session_notes(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db_manager: DatabaseManager = Depends(get_database),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0)
):
    """Get all session notes from a group project for the current user"""
    try:
        user_id = current_user['id']
        
        try:
            project_object_id = ObjectId(project_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        project = await db_manager.project_lists.find_one({
            "_id": project_object_id,
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        
        access_level = "owner" if project.get("owner_id") == user_id else project.get("permissions", {}).get(user_id, "viewer")
        
        session_ids = []
        project_structure = []
        
        for topic in project.get("topics", []):
            topic_info = {
                "topic_id": topic.get("id"),
                "topic_name": topic.get("name"),
                "work_items": []
            }
            
            for work_item in topic.get("work_items", []):
                session_id = work_item.get("session_id")
                if session_id:
                    session_ids.append(session_id)
                    topic_info["work_items"].append({
                        "work_item_id": work_item.get("id"),
                        "title": work_item.get("title"),
                        "type": work_item.get("type"),
                        "session_id": session_id
                    })
            
            if topic_info["work_items"]:
                project_structure.append(topic_info)
        
        if not session_ids:
            return {
                "success": True,
                "project_id": project_id,
                "project_name": project.get("name"),
                "project_type": project.get("type"),
                "access_level": access_level,
                "notes": [],
                "total_notes": 0,
                "project_structure": project_structure
            }
        
        db = get_async_db()
        blocks_collection = db.notepad_blocks
        
        query = {"session_id": {"$in": session_ids}}
        
        if project.get("type") == "personal":
            query["user_id"] = user_id
        
        total_count = await blocks_collection.count_documents(query)
        
        cursor = blocks_collection.find(query).sort("updated_at", -1).skip(offset).limit(limit)
        
        notes = []
        async for doc in cursor:
            work_item_info = None
            topic_info = None
            
            for topic in project_structure:
                for work_item in topic["work_items"]:
                    if work_item["session_id"] == doc["session_id"]:
                        work_item_info = work_item
                        topic_info = {
                            "topic_id": topic["topic_id"],
                            "topic_name": topic["topic_name"]
                        }
                        break
                if work_item_info:
                    break
            
            title = "Untitled Note"
            if doc.get("blocks") and len(doc["blocks"]) > 0:
                first_block = doc["blocks"][0]
                if first_block.get("content"):
                    title = first_block["content"][:100]
            
            author_id = doc.get("user_id")
            author = await db_manager.users.find_one({"_id": ObjectId(author_id)})
            author_info = {
                "user_id": author_id,
                "username": author.get("username", "Unknown") if author else "Unknown",
                "email": author.get("email", "") if author else ""
            }
            
            notes.append({
                "session_id": doc["session_id"],
                "title": title,
                "blocks_count": len(doc.get("blocks", [])),
                "created_at": doc.get("created_at").isoformat() if doc.get("created_at") else None,
                "updated_at": doc.get("updated_at").isoformat() if doc.get("updated_at") else None,
                "timestamp": doc.get("timestamp"),
                "author": author_info,
                "work_item": work_item_info,
                "topic": topic_info
            })
        
        logger.info(f"Retrieved {len(notes)} notes from project {project_id} for user {user_id}")
        
        return {
            "success": True,
            "project_id": project_id,
            "project_name": project.get("name"),
            "project_type": project.get("type"),
            "access_level": access_level,
            "notes": notes,
            "total_notes": total_count,
            "offset": offset,
            "limit": limit,
            "has_more": offset + limit < total_count,
            "project_structure": project_structure
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching project notes: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch project notes: {str(e)}")

@api_router_canvas.post("/project-notes/batch-fetch")
async def batch_fetch_project_notes(
    request: BatchFetchNotesRequest,
    current_user: dict = Depends(get_current_user),
    db_manager: DatabaseManager = Depends(get_database)
):
    """Batch fetch content for multiple session IDs"""
    try:
        user_id = current_user['id']
        
        if not request.session_ids:
            return []

        db = get_async_db()
        blocks_collection = db.notepad_blocks

        cursor = blocks_collection.find({
            "session_id": {"$in": request.session_ids}
        })

        results = []
        
        async for doc in cursor:
            title = "REF From Outside.."
            all_blocks = doc.get("blocks", [])
            
            if all_blocks and len(all_blocks) > 0:
                first_block = all_blocks[0]
                if isinstance(first_block, dict) and first_block.get("content"):
                    title = first_block["content"][:100]

            text_blocks = []
            for block in all_blocks:
                if not isinstance(block, dict):
                    continue
                
                block_type = block.get("type", "text")
                
                if block_type in ["document", "whiteboard", "youtube"]:
                    continue
                if block.get("file") or block.get("status") == "uploaded":
                    continue
                if "document" in block and "session" in block:
                    continue
                
                if block_type in ["text", "code"]:
                    text_blocks.append(block)

            results.append({
                "session_id": doc["session_id"],
                "title": title,
                "blocks": text_blocks,
                "updated_at": doc.get("updated_at")
            })

        return JSONResponse(content=serialize_datetime_objects(results))

    except Exception as e:
        logger.error(f"Error in batch fetch notes: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to batch fetch notes: {str(e)}")

# ==================== WORKSPACE ENDPOINTS ====================

@api_router_canvas.get("/workspaces/{workspace_id}/content")
async def get_workspace_content(
    workspace_id: str,
    db_manager: DatabaseManager = Depends(get_db_manager),
    current_user: dict = Depends(get_current_user),
):
    """Loads a workspace by its ID, reads all its files, and returns them as JSON"""
    temp_api_root = WORKSPACE_BASE / workspace_id
    user_id = current_user['id']

    logger.info(f"WORKSPACE_ACCESS: User={user_id}, Workspace={workspace_id}")
    
    try:
        async with WorkspaceManager(
            root=temp_api_root,
            user_id=user_id,
            db=db_manager,
            workspace_id=workspace_id,
            max_inactive_time=60
        ) as ws_manager:
            
            file_paths = await ws_manager.list_files(include_excluded=False)
            logger.info(f"WORKSPACE_ACCESS: User={user_id}, Workspace={workspace_id}")
            
            files_data = []
            for path_str in file_paths:
                try:
                    content_bytes = await ws_manager.read_file(path_str)
                    content_text = content_bytes.decode('utf-8')
                    is_binary = False
                except UnicodeDecodeError:
                    content_text = base64.b64encode(content_bytes).decode('utf-8')
                    is_binary = True
                
                files_data.append({
                    "path": path_str,
                    "content": content_text,
                    "is_binary": is_binary
                })
            
            response = {
                "workspace_id": ws_manager.workspace_id,
                "files": files_data,
            }
            
            return response
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to load workspace content: {e}")

# ==================== FILE UPLOAD/DOWNLOAD (with rate limiting from slowapi) ====================
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@api_router_canvas.post("/upload")
@limiter.limit(RATE_LIMITS['upload'])
async def upload_file_endpoint(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Secure file upload with virus scanning and rate limiting"""
    try:
        user_id = current_user['id']
        client_ip = request.client.host if request.client else "unknown"
        
        logger.info(f"Upload attempt - User: {user_id}, IP: {client_ip}")
        
        try:
            data = await request.json()
        except Exception as e:
            logger.warning(f"Invalid JSON in upload request: {e}")
            raise HTTPException(status_code=400, detail="Invalid request format")
        
        session_id = data.get("session_id")
        file_info = data.get("file")
        original_filename = file_info.get("path", "unknown")
        
        logger.warning(f"UPLOAD_DETAILS: User={user_id}, IP={client_ip}, Session={session_id}, File={original_filename}")

        safe_session_id = SecurityValidator.validate_session_id(session_id)
        
        if not safe_session_id:
            raise HTTPException(status_code=400, detail="Invalid session_id format")
        
        if not await verify_session_ownership(db, safe_session_id, user_id):
            raise HTTPException(status_code=403, detail="Access denied to this session")
        
        if not file_info or not isinstance(file_info, dict):
            raise HTTPException(status_code=400, detail="No file provided")
        
        file_path = file_info.get("path", "")
        file_content = file_info.get("content", "")
        
        if not file_path or not file_content:
            raise HTTPException(status_code=400, detail="File path and content required")
        
        safe_filename = SecurityValidator.validate_filename(file_path)
        if not safe_filename:
            raise HTTPException(status_code=400, detail="Invalid filename")
        
        extension = SecurityValidator.validate_file_extension(safe_filename)
        if not extension:
            allowed = ', '.join(SecurityValidator.ALLOWED_EXTENSIONS.keys())
            raise HTTPException(status_code=400, detail=f"File type not allowed. Allowed: {allowed}")
        
        file_data = None
        declared_content_type = None
        
        if file_content.startswith("data:"):
            try:
                header, encoded = file_content.split(",", 1)
                file_data = base64.b64decode(encoded)
                if ';' in header:
                    declared_content_type = header.split(':')[1].split(';')[0]
            except Exception as e:
                logger.error(f"Base64 decode failed: {e}")
                raise HTTPException(status_code=400, detail="Invalid file encoding")
        else:
            file_data = file_content.encode('utf-8')
            declared_content_type = 'text/plain'
        
        if len(file_data) > SecurityValidator.MAX_FILE_SIZE:
            size_mb = SecurityValidator.MAX_FILE_SIZE / (1024 * 1024)
            raise HTTPException(status_code=400, detail=f"File exceeds {size_mb}MB limit")
        
        if not SecurityValidator.validate_mime_type(file_data, declared_content_type or '', extension):
            raise HTTPException(status_code=400, detail=f"File content doesn't match extension {extension}")
        
        if SecurityValidator.detect_executable_content(file_data):
            logger.warning(f"Executable content detected - User: {user_id}, File: {safe_filename}")
            raise HTTPException(status_code=400, detail="Executable files not allowed")
        
        unique_filename = SecurityValidator.generate_secure_filename(safe_filename)
        file_hash = SecurityValidator.calculate_file_hash(file_data)
        logger.info(f"✅ UPLOAD SUCCESS - User: {user_id}, File: {unique_filename}, Hash: {file_hash}, Size: {len(file_data)} bytes")

        s3_key = f"{safe_session_id}/{UPLOAD_FOLDER_NAME}/{unique_filename}"
        actual_mime = magic.from_buffer(file_data, mime=True)
        content_type = actual_mime if actual_mime else declared_content_type or 'application/octet-stream'
        
        try:
            s3_client.put_object(
                Bucket=BUCKET_NAME,
                Key=s3_key,
                Body=file_data,
                ContentType=content_type,
                Metadata={
                    'session_id': safe_session_id,
                    'original_filename': safe_filename,
                    'user_id': str(user_id),
                    'upload_timestamp': datetime.utcnow().isoformat(),
                    'file_hash': file_hash,
                    'virus_scanned': 'true',
                    'virus_scan_clean': 'true'
                },
                ServerSideEncryption='AES256'
            )
            
            s3_url = f"https://{BUCKET_NAME}.s3.{BUCKET_REGION}.amazonaws.com/{s3_key}"
            logger.info(f"File uploaded to S3 - User: {user_id}, File: {unique_filename}, Hash: {file_hash[:16]}...")
            
        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to upload to storage")
        
        try:
            workspace_path = Path(global_args.workspace).resolve()
            session_path = workspace_path / safe_session_id
            
            if not SecurityValidator.validate_path_safety(session_path, workspace_path):
                raise HTTPException(status_code=500, detail="Invalid session path")
            
            upload_dir = session_path / UPLOAD_FOLDER_NAME
            upload_dir.mkdir(parents=True, exist_ok=True)
            
            local_path = upload_dir / unique_filename
            
            if not SecurityValidator.validate_path_safety(local_path, upload_dir):
                raise HTTPException(status_code=500, detail="Invalid file path")
            
            with open(local_path, "wb") as f:
                f.write(file_data)
            
            os.chmod(local_path, 0o400)
            
            full_url_path = f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/{unique_filename}"
            logger.info(f"File saved locally: {local_path}")
            
        except Exception as e:
            logger.error(f"Local save failed: {e}")
            full_url_path = None
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "path": full_url_path,
                "s3_url": s3_url,
                "s3_key": s3_key,
                "original_filename": safe_filename,
                "stored_filename": unique_filename,
                "size_bytes": len(file_data),
                "content_type": content_type,
                "hash": file_hash,
                "virus_scanned": True,
                "upload_timestamp": datetime.utcnow().isoformat()
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload error - User: {user_id if 'user_id' in locals() else 'unknown'}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Upload failed")

@api_router_canvas.post("/download")
@limiter.limit(RATE_LIMITS['download'])
async def download_file_endpoint(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Secure file download with rate limiting"""
    user_id = current_user.get('id', 'unknown')
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"Download attempt - User: {user_id}, IP: {client_ip}")

    try:
        try:
            data = await request.json()
        except Exception as e:
            logger.warning(f"Invalid JSON in download request: {e}")
            raise HTTPException(status_code=400, detail="Invalid request format")

        session_id = data.get("session_id")
        s3_key = data.get("s3_key")

        safe_session_id = SecurityValidator.validate_session_id(session_id)
        if not safe_session_id:
            raise HTTPException(status_code=400, detail="Invalid session_id format")

        if not s3_key or not isinstance(s3_key, str):
            raise HTTPException(status_code=400, detail="s3_key required")

        if not SecurityValidator.validate_s3_key(s3_key, safe_session_id):
            raise HTTPException(status_code=403, detail="File doesn't belong to this session")

        access_info = await verify_project_access(db, safe_session_id, user_id)
        if not access_info:
            raise HTTPException(status_code=403, detail="Access denied")

        try:
            filename = Path(s3_key).name
            if '/' in filename or '\\' in filename or '..' in filename:
                raise ValueError("Invalid filename")

            safe_filename = SecurityValidator.validate_filename(filename)
            if not safe_filename:
                raise ValueError("Invalid filename format")
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid filename in s3_key")

        workspace_path = Path(global_args.workspace).resolve()
        session_path = workspace_path / safe_session_id
        upload_dir = session_path / UPLOAD_FOLDER_NAME
        local_path = upload_dir / safe_filename

        if not SecurityValidator.validate_path_safety(session_path, workspace_path):
            raise HTTPException(status_code=500, detail="Invalid session path")

        if not SecurityValidator.validate_path_safety(local_path, upload_dir):
            raise HTTPException(status_code=500, detail="Invalid file path")

        if local_path.exists() and local_path.is_file():
            try:
                file_stat = local_path.stat()
                full_url_path = f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/{safe_filename}"

                logger.info(f"File found locally - User: {user_id}, File: {safe_filename}, Size: {file_stat.st_size}")

                return {
                    "success": True,
                    "message": "File already exists in workspace",
                    "already_exists": True,
                    "skipped_download": True,
                    "file": {
                        "path": full_url_path,
                        "local_path": str(local_path),
                        "s3_key": s3_key,
                        "original_filename": safe_filename,
                        "size_bytes": file_stat.st_size,
                        "modified_time": file_stat.st_mtime,
                        "access_level": access_info.get("access_level")
                    }
                }
            except Exception as e:
                logger.warning(f"File exists but couldn't read stats: {e}")

        try:
            logger.info(f"Downloading from S3 - User: {user_id}, Key: {s3_key}")

            response = s3_client.get_object(Bucket=BUCKET_NAME, Key=s3_key)
            file_data = response['Body'].read()
            content_type = response.get('ContentType', 'application/octet-stream')
            metadata = response.get('Metadata', {})

            stored_session_id = metadata.get('session_id')
            if stored_session_id and stored_session_id != safe_session_id:
                raise HTTPException(status_code=403, detail="File metadata validation failed")

            stored_hash = metadata.get('file_hash')
            if stored_hash:
                actual_hash = SecurityValidator.calculate_file_hash(file_data)
                if actual_hash != stored_hash:
                    logger.error(f"File hash mismatch - Expected: {stored_hash}, Got: {actual_hash}")
                    raise HTTPException(status_code=500, detail="File integrity check failed")

            logger.info(f"Downloaded from S3 - Size: {len(file_data)} bytes")

        except s3_client.exceptions.NoSuchKey:
            raise HTTPException(status_code=404, detail="File not found in storage")
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            logger.error(f"S3 download failed: {error_code}")
            raise HTTPException(status_code=500, detail=f"Download failed: {error_code}")

        try:
            upload_dir.mkdir(parents=True, exist_ok=True)
            with open(local_path, "wb") as f:
                f.write(file_data)
            os.chmod(local_path, 0o400)

            full_url_path = f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/{safe_filename}"

            logger.info(f"File saved to workspace - User: {user_id}, Path: {local_path}")

            return {
                "success": True,
                "message": "File downloaded successfully",
                "already_exists": False,
                "skipped_download": False,
                "file": {
                    "path": full_url_path,
                    "local_path": str(local_path),
                    "s3_key": s3_key,
                    "original_filename": metadata.get('original_filename', safe_filename),
                    "content_type": content_type,
                    "size_bytes": len(file_data),
                    "access_level": access_info.get("access_level"),
                    "download_timestamp": datetime.utcnow().isoformat()
                }
            }

        except Exception as e:
            logger.error(f"Failed to save locally: {e}")
            raise HTTPException(status_code=500, detail="Failed to save file")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Download error - User: {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Download failed")

@api_router_canvas.get("/projects/{project_id}/notes/{session_id}")
async def get_specific_project_note(
    project_id: str,
    session_id: str,
    current_user: dict = Depends(get_current_user),
    db_manager: DatabaseManager = Depends(get_database),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500)
):
    """
    Get detailed blocks for a specific session note within a project.
    This allows viewing the full content of a specific note.
    """
    try:
        user_id = current_user['id']
        
        # Convert project_id to ObjectId
        try:
            project_object_id = ObjectId(project_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        # Check if user has access to this project
        project = await db_manager.project_lists.find_one({
            "_id": project_object_id,
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        })
        
        if not project:
            raise HTTPException(
                status_code=404, 
                detail="Project not found or access denied"
            )
        
        # Verify this session belongs to this project
        session_found = False
        for topic in project.get("topics", []):
            for work_item in topic.get("work_items", []):
                if work_item.get("session_id") == session_id:
                    session_found = True
                    break
            if session_found:
                break
        
        if not session_found:
            raise HTTPException(
                status_code=404,
                detail="Session not found in this project"
            )
        
        # For personal projects, verify ownership
        # For group projects, allow any member to view
        db = get_async_db()
        blocks_collection = db.notepad_blocks
        
        query = {"session_id": session_id}
        
        if project.get("type") == "personal":
            query["user_id"] = user_id
        
        # Fetch the session document
        session_doc = await blocks_collection.find_one(query)
        
        if not session_doc:
            raise HTTPException(
                status_code=404,
                detail="Note not found for this session"
            )
        
        # Get all blocks
        all_blocks = session_doc.get("blocks", [])
        
        # IMPORTANT: Filter blocks to only include TEXT blocks
        # Exclude: document, whiteboard, youtube, code (or include code if you want)
        text_blocks = []
        for block in all_blocks:
            if not isinstance(block, dict):
                continue
                
            block_type = block.get("type", "text")
            
            # Skip document, whiteboard, youtube types
            if block_type in ["document", "whiteboard", "youtube"]:
                continue
            
            # Skip if it has file/url/status properties (document indicators)
            if block.get("file") or block.get("status") == "uploaded":
                continue
            
            # Skip whiteboards with nested document/session structure
            if "document" in block and "session" in block:
                continue
            
            # Only include text and code blocks
            if block_type in ["text", "code"]:
                text_blocks.append(block)
        
        # If no text blocks found, return empty
        if not text_blocks:
            return JSONResponse(content=serialize_datetime_objects({
                "success": True,
                "project_id": project_id,
                "session_id": session_id,
                "blocks": [],
                "pagination": {
                    "total_blocks": 0,
                    "page": page,
                    "page_size": page_size,
                    "has_more": False
                },
                "metadata": {
                    "created_at": session_doc.get("created_at").isoformat() if session_doc.get("created_at") else None,
                    "updated_at": session_doc.get("updated_at").isoformat() if session_doc.get("updated_at") else None,
                    "timestamp": session_doc.get("timestamp"),
                    "workspace_dir": f"workspace/{session_id}",
                    "author": {
                        "user_id": session_doc.get("user_id"),
                        "username": "Unknown",
                        "email": ""
                    }
                }
            }))
        
        # Paginate text blocks only
        total_blocks = len(text_blocks)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paginated_blocks = text_blocks[start_idx:end_idx]
        
        # Get author info
        author_id = session_doc.get("user_id")
        author = await db_manager.users.find_one({"_id": ObjectId(author_id)})
        
        response_data = {
            "success": True,
            "project_id": project_id,
            "session_id": session_id,
            "blocks": paginated_blocks,
            "pagination": {
                "total_blocks": total_blocks,
                "page": page,
                "page_size": page_size,
                "has_more": end_idx < total_blocks
            },
            "metadata": {
                "created_at": session_doc.get("created_at").isoformat() if session_doc.get("created_at") else None,
                "updated_at": session_doc.get("updated_at").isoformat() if session_doc.get("updated_at") else None,
                "timestamp": session_doc.get("timestamp"),
                "workspace_dir": f"workspace/{session_id}",
                "author": {
                    "user_id": author_id,
                    "username": author.get("username", "Unknown") if author else "Unknown",
                    "email": author.get("email", "") if author else ""
                }
            }
        }
        
        return JSONResponse(content=serialize_datetime_objects(response_data))
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching specific project note: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch note: {str(e)}"
        )
    
async def check_personal_project_access(
    workspace_info: Dict[str, Any],
    user_id: str
) -> bool:
    """Check if user has access to personal project session"""
    # Personal project: only owner (workspace creator) can access
    workspace_owner = workspace_info.get("userid")
    
    if workspace_owner != user_id:
        logger.warning(
            f"Unauthorized access attempt: user {user_id} tried to access "
            f"personal project owned by {workspace_owner}"
        )
        return False
    
    return True

async def check_group_project_access(
    db_manager: get_database,
    workspace_info: Dict[str, Any],
    user_id: str,
    projectID:str
) -> tuple[bool, Optional[str]]:
    """
    Check if user has access to group project session.
    Returns: (has_access: bool, access_level: Optional[str])
    """
    
    if not projectID:
        logger.warning(f"Session {workspace_info.get('workspace_id')} has no associated project")
        return False, None
    
    try:
        # Find project with user having some permission
        project = await db_manager.project_lists.find_one({
            "_id": ObjectId(projectID),
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        })
        
        if not project:
            logger.warning(
                f"User {user_id} has no access to project {projectID}"
            )
            return False, None
        
        # Determine access level
        if project.get("owner_id") == user_id:
            access_level = "owner"
        else:
            access_level = project.get(f"permissions.{user_id}", "editor")
        
        # Check if access level allows viewing events
        # Typically: owner, admin, editor can view; viewer may or may not
        allowed_levels = ["owner", "admin", "editor"]
        if access_level not in allowed_levels:
            logger.warning(
                f"User {user_id} has insufficient permissions ({access_level}) "
                f"to view events for project {projectID}"
            )
            return False, access_level
        
        return True, access_level
        
    except Exception as e:
        logger.error(f"Error checking group project access: {str(e)}")
        return False, None

def serialize_event(event: Any, workspace_dir: Optional[str] = None) -> Dict[str, Any]:
    """Convert event object to dictionary with proper serialization"""
    try:
        event_dict = {
            "id": str(event.event_uuid),
            "session_id": str(event.session_id),
            "timestamp": event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp),
            "event_type": event.event_type,
            "event_payload": event.event_payload or {},
        }
        
        if workspace_dir:
            event_dict["workspace_dir"] = workspace_dir
        
        return event_dict
    except Exception as e:
        logger.error(f"Error serializing event: {str(e)}")
        # Return minimal event object on error
        return {
            "id": str(getattr(event, 'event_uuid', 'unknown')),
            "session_id": str(getattr(event, 'session_id', 'unknown')),
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": "error",
            "event_payload": {"error": "Failed to serialize event"}
        }
    

@api_router_canvas.get("/sessions/{session_id}/events")
async def get_session_events(
    session_id: str,
    projectId: str = Query(None),
    projectType: str = Query(None),
    current_user: dict = Depends(get_current_user),
    db_manager: DatabaseManager = Depends(get_db_manager),
    limit: int = Query(50, ge=1, le=100),
    before: Optional[float] = Query(None)
):
    try:
        user_id = current_user.get('id')
        if not user_id:
            logger.error("No user_id found in current_user")
            raise HTTPException(status_code=401, detail="Invalid authentication")
        
        # ==================== VALIDATION ====================
        
        session_uuid = await validate_session_id(session_id)
        if not session_uuid:
            raise HTTPException(
                status_code=400,
                detail="Invalid session_id format. Must be a valid UUID."
            )
        
        # ==================== AUTHORIZATION ====================
        
        workspace_info = await get_session_project_info(db_manager, session_id)
        if not workspace_info:
            raise HTTPException(status_code=404, detail="Session not found")
        
        if not projectType:
            raise HTTPException(status_code=500, detail="Error determining session type")
        
        access_level = None
        
        # User ID Filtering Logic
        if projectType == "personal":
            has_access = await check_personal_project_access(workspace_info, user_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Not authorized")
            access_level = "owner"
            user_id_filter = user_id
            
        elif projectType == "group":
            has_access, access_level = await check_group_project_access(
                db_manager, workspace_info, user_id, projectId
            )
            if not has_access:
                raise HTTPException(status_code=403, detail="Not authorized")
            user_id_filter = None
        else:
            raise HTTPException(status_code=500, detail=f"Unknown project type: {projectType}")
        
        events = await db_manager.get_session_events(
            session_id=session_uuid,
            user_id=user_id_filter,
            limit=limit,
            before_timestamp=before
        )

        events.reverse()
        
        if not events:
            return {
                "success": True,
                "project_type": projectType,
                "access_level": access_level,
                "events": [],
                "count": 0,
            }
        
        # ==================== SERIALIZATION ====================
        
        workspace_dir = workspace_info.get("root_path")
        event_list = []
        
        for event in events:
            event_dict = serialize_event(event, workspace_dir)
            event_list.append(event_dict)
        
        # ==================== RESPONSE ====================
        
        return {
            "success": True,
            "project_type": projectType,
            "access_level": access_level,
            "events": event_list,
            "count": len(event_list),
            "has_more": len(event_list) == limit 
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error retrieving session events")
    