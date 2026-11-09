import os
import asyncio
import hashlib
import json
import gzip
from datetime import datetime
import logging
from logging.handlers import RotatingFileHandler
import uuid
import base64
import io
import re
from pathlib import Path
from fastapi import APIRouter, Query, Request, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo import MongoClient, ReplaceOne
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from bson import ObjectId
from pydantic import BaseModel, Field, validator
from typing import Dict, List, Any, Optional
from verifySystem import verify_token, get_current_user
from Mongodb.db import DatabaseManager
from utilss.constants import UPLOAD_FOLDER_NAME, LOCAL_FALLBACK_FOLDER_NAME
from utilss.workspace_manager import WorkspaceManager
from validation import SecurityValidator
from dotenv import load_dotenv
from slowapi import Limiter
from slowapi.util import get_remote_address
import magic
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config
from urllib.parse import quote, unquote
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
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME")
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID")
R2_ENDPOINT_URL = os.getenv("R2_ENDPOINT_URL") or (
    f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else None
)
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY")
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL", "").rstrip("/")
OPENPARSER_API_KEY = os.getenv("OPENPARSER_API_KEY", "").strip()
OPENPARSER_OCR_MODEL = "paddleocr-vl-1.6"
OPENPARSER_OUTPUT_FORMAT = "openparser@1"
OPENPARSER_MAX_FILE_BYTES = 50 * 1024 * 1024
PDF_PARSE_CACHE_CHUNK_BYTES = 512 * 1024
_OPENPARSER_CLIENT = None

# ==================== CLOUDFLARE R2 CLIENT ====================
# R2 speaks the S3 API, but always set its endpoint explicitly so missing R2
# configuration can never send uploads to the default AWS S3 endpoint.
r2_client = None
if all((R2_BUCKET_NAME, R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)):
    r2_client = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT_URL,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
        config=Config(signature_version="s3v4"),
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
    kind: Optional[str] = 'note'
    card_id: Optional[str] = None
    card: Optional[Dict[str, Any]] = None

    @validator('content')
    def sanitize_content(cls, v):
        sanitized = SecurityValidator.sanitize_content(v)
        if sanitized is None:
            raise ValueError('Content could not be safely saved')
        return sanitized

class UpdateNodeRequest(BaseModel):
    content: Optional[str] = None
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    parent_node_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None
    width: Optional[float] = None   
    height: Optional[float] = None 
    is_expanded: Optional[bool] = None
    color: Optional[str] = None
    s3_key: Optional[str] = None
    file_name: Optional[str] = None
    node_type: Optional[str] = None
    media_url: Optional[str] = None
    pdfUrl: Optional[str] = None


class PDFHighlightRectRequest(BaseModel):
    x: float = Field(..., ge=0, le=1)
    y: float = Field(..., ge=0, le=1)
    width: float = Field(..., gt=0, le=1)
    height: float = Field(..., gt=0, le=1)


class PDFHighlightRequest(BaseModel):
    id: str = Field(..., min_length=1, max_length=120)
    pageNumber: int = Field(..., ge=1)
    color: str
    rects: List[PDFHighlightRectRequest] = Field(..., min_items=1, max_items=100)
    content: str = Field(..., max_length=20000)

    @validator("color")
    def validate_color(cls, value):
        if value not in {"yellow", "green", "blue", "pink", "purple"}:
            raise ValueError("Unsupported PDF highlight color")
        return value


class PDFHighlightsUpdateRequest(BaseModel):
    highlights: List[PDFHighlightRequest] = Field(default_factory=list, max_items=500)

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
    kind: Optional[str] = 'note'
    card_id: Optional[str] = None

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


class CardCreateRequest(BaseModel):
    card_id: Optional[str] = None
    card_type: str = 'text'
    title: str = Field('', max_length=500)
    content: str = Field('', max_length=1_000_000)
    tags: List[str] = Field(default_factory=list)
    media_url: Optional[str] = None
    s3_key: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    @validator('content')
    def sanitize_card_content(cls, value):
        sanitized = SecurityValidator.sanitize_content(value)
        if sanitized is None:
            raise ValueError('Content could not be safely saved')
        return sanitized


class CardUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=500)
    content: Optional[str] = Field(None, max_length=1_000_000)
    card_type: Optional[str] = None
    tags: Optional[List[str]] = None
    media_url: Optional[str] = None
    s3_key: Optional[str] = None
    file_name: Optional[str] = None
    file_type: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

    @validator('content')
    def sanitize_card_content(cls, value):
        if value is None:
            return value
        sanitized = SecurityValidator.sanitize_content(value)
        if sanitized is None:
            raise ValueError('Content could not be safely saved')
        return sanitized


class CardBatchRequest(BaseModel):
    card_ids: List[str] = Field(default_factory=list, max_items=100)


class CardConversionRequest(BaseModel):
    canvas_id: str
    branch_id: str = 'main'
    node_id: str
    card: CardCreateRequest


class CreateCardLinkRequest(BaseModel):
    from_card_id: str
    to_card_id: str
    source: str = 'manual'
    label: Optional[str] = None

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


def get_authenticated_user_id(credentials: HTTPAuthorizationCredentials) -> str:
    user_data = verify_token(credentials.credentials)
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid authentication")
    # The Node/Passport login flow signs JWTs with `id`; older token issuers
    # may still provide `_id` or `user_id`.
    user_id = user_data.get("id") or user_data.get("_id") or user_data.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Authenticated user ID is missing")
    return str(user_id)


def collect_node_r2_keys(node: Dict[str, Any], canvas_id: str) -> set[str]:
    """Find R2 upload keys owned by this canvas anywhere in a node record."""
    if not canvas_id:
        return set()

    key_pattern = re.compile(
        rf"(?<![A-Za-z0-9_-]){re.escape(canvas_id)}/"
        rf"{re.escape(UPLOAD_FOLDER_NAME)}/[A-Za-z0-9][A-Za-z0-9._-]*"
    )
    keys: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for nested_value in value.values():
                visit(nested_value)
        elif isinstance(value, (list, tuple)):
            for nested_value in value:
                visit(nested_value)
        elif isinstance(value, str):
            for match in key_pattern.finditer(unquote(value)):
                key = match.group(0)
                if SecurityValidator.validate_s3_key(key, canvas_id):
                    keys.add(key)

    visit(node)
    return keys


def _asset_reference_query(key: str) -> Dict[str, Any]:
    """Build a Mongo query for explicit and embedded references to an R2 key."""
    escaped_key = re.escape(key)
    encoded_key = re.escape(quote(key, safe="/"))
    patterns = {escaped_key, encoded_key}
    clauses: List[Dict[str, Any]] = [
        {"s3_key": key},
        {"s3Key": key},
        {"metadata.s3_key": key},
        {"metadata.s3Key": key},
        {"metadata.pdfSource.s3_key": key},
        {"metadata.pdfSource.s3Key": key},
        {"pdfSource.s3_key": key},
        {"pdfSource.s3Key": key},
        {"blocks.s3_key": key},
        {"blocks.s3Key": key},
    ]
    for field in (
        "content", "media_url", "mediaUrl", "pdfUrl", "imageUrl", "url",
        "metadata.content", "metadata.media_url", "metadata.pdfUrl",
        "metadata.pdfSource.fileUrl", "metadata.pdfSource.url",
        "pdfSource.fileUrl", "pdfSource.url",
        "blocks.content", "blocks.media_url", "blocks.mediaUrl",
        "blocks.pdfUrl", "blocks.url",
    ):
        clauses.extend({field: {"$regex": pattern}} for pattern in patterns)
    return {"$or": clauses}


async def is_r2_key_referenced_elsewhere(
    db_manager: DatabaseManager,
    key: str,
    canvas_id: str,
    node_id: str,
    branch_id: str,
) -> bool:
    """Preserve an upload while any other saved node, card, or note uses it."""
    reference_query = _asset_reference_query(key)
    current_node_query = {
        "canvas_id": canvas_id,
        "node_id": node_id,
        "branch_id": branch_id,
    }
    other_node_query = {
        "$and": [reference_query, {"$nor": [current_node_query]}]
    }

    if await db_manager.canvas_nodes.find_one(other_node_query):
        return True
    if await db_manager.cards.find_one(reference_query):
        return True
    if await db_manager.notepad_blocks.find_one(reference_query):
        return True
    return False


def remove_local_upload_copies(key: str) -> None:
    """Remove workspace and fallback copies for a validated session upload key."""
    parts = key.split("/")
    if len(parts) != 3 or parts[1] != UPLOAD_FOLDER_NAME:
        return

    session_id, _, filename = parts
    workspace_value = getattr(global_args, "workspace", None) if global_args else None
    workspace_root = Path(workspace_value or WORKSPACE_BASE).resolve()
    upload_dir = workspace_root / session_id / UPLOAD_FOLDER_NAME
    candidates = (
        upload_dir / filename,
        upload_dir / LOCAL_FALLBACK_FOLDER_NAME / filename,
    )
    for path in candidates:
        if not SecurityValidator.validate_path_safety(path, workspace_root):
            logger.warning("Skipping unsafe local upload cleanup path: %s", path)
            continue
        try:
            if path.is_file():
                path.unlink()
        except OSError as error:
            logger.warning("Could not remove local upload copy %s: %s", path, error)


def normalize_card_tags(tags: Optional[List[str]]) -> List[str]:
    if tags is not None and not isinstance(tags, list):
        raise HTTPException(status_code=400, detail="Card tags must be a list")
    normalized = []
    seen = set()
    for raw_tag in tags or []:
        tag = str(raw_tag).strip().lower().lstrip('#')
        if not tag or tag in seen:
            continue
        if len(tag) > 40:
            raise HTTPException(status_code=400, detail="Card tags must be 40 characters or fewer")
        seen.add(tag)
        normalized.append(tag)
    if len(normalized) > 50:
        raise HTTPException(status_code=400, detail="A card can have at most 50 tags")
    return normalized


async def get_accessible_card(
    db_manager: DatabaseManager,
    card_id: str,
    user_id: str,
    require_edit: bool = False,
) -> Optional[Dict[str, Any]]:
    card = await db_manager.cards.find_one({"card_id": card_id})
    if not card:
        return None
    if str(card.get("owner_id")) == user_id:
        return card

    placements = db_manager.canvas_nodes.find(
        {"card_id": card_id}, {"canvas_id": 1}
    )
    checked_canvases = set()
    async for placement in placements:
        canvas_id = placement.get("canvas_id")
        if not canvas_id or canvas_id in checked_canvases:
            continue
        checked_canvases.add(canvas_id)
        access = await verify_project_access(db_manager, canvas_id, user_id)
        if access and (
            not require_edit or access.get("access_level") in {"owner", "editor", "admin"}
        ):
            return card
    return None


async def upsert_card(
    db_manager: DatabaseManager,
    user_id: str,
    card_id: Optional[str],
    card_type: str,
    title: str,
    content: str,
    tags: Optional[List[str]] = None,
    card_fields: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    card_type = str(card_type or "text")
    title = str(title or "")
    content = str(content or "")
    if len(title) > 500 or len(content) > 1_000_000:
        raise HTTPException(status_code=400, detail="Card title or content is too long")
    if '<script' in content.lower():
        raise HTTPException(status_code=400, detail="Script tags not allowed")
    card_id = card_id or f"card-{uuid.uuid4()}"
    now = datetime.utcnow()
    card_data = {
        "card_id": card_id,
        "owner_id": user_id,
        "card_type": card_type,
        "title": title,
        "content": content,
        "tags": normalize_card_tags(tags),
        "updated_at": now,
    }
    for field in ("media_url", "s3_key", "file_name", "file_type", "metadata"):
        value = (card_fields or {}).get(field)
        if value is not None:
            card_data[field] = value
    existing = await db_manager.cards.find_one({"card_id": card_id})
    if existing and str(existing.get("owner_id")) != user_id:
        raise HTTPException(status_code=409, detail="Card ID is already in use")
    await db_manager.cards.update_one(
        {"card_id": card_id, "owner_id": user_id},
        {
            "$set": card_data,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return await db_manager.cards.find_one({"card_id": card_id, "owner_id": user_id})


async def card_response(
    db_manager: DatabaseManager,
    card: Dict[str, Any],
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    canvas_ids = await db_manager.canvas_nodes.distinct("canvas_id", {"card_id": card["card_id"]})
    if user_id:
        accessible_canvas_ids = []
        for canvas_id in canvas_ids:
            if await verify_project_access(db_manager, canvas_id, user_id):
                accessible_canvas_ids.append(canvas_id)
        canvas_ids = accessible_canvas_ids
    return {
        "card_id": card["card_id"],
        "id": card["card_id"],
        "card_type": card.get("card_type", card.get("type", "text")),
        "type": card.get("card_type", card.get("type", "text")),
        "title": card.get("title", ""),
        "content": card.get("content", ""),
        "tags": card.get("tags", []),
        "media_url": card.get("media_url"),
        "s3_key": card.get("s3_key"),
        "file_name": card.get("file_name"),
        "file_type": card.get("file_type"),
        "metadata": card.get("metadata", {}),
        "board_count": len(canvas_ids),
        "created_at": card.get("created_at").isoformat() if isinstance(card.get("created_at"), datetime) else card.get("created_at"),
        "updated_at": card.get("updated_at").isoformat() if isinstance(card.get("updated_at"), datetime) else card.get("updated_at"),
    }


def extract_note_link_ids(content: str) -> List[str]:
    return list(dict.fromkeys(re.findall(r'data-note-link-id=["\']([^"\']+)["\']', content or "")))


async def get_accessible_node_reference(
    db_manager: DatabaseManager,
    node_id: str,
    user_id: str,
) -> Optional[Dict[str, Any]]:
    placements = db_manager.canvas_nodes.find({"node_id": node_id})
    async for node in placements:
        if await verify_project_access(db_manager, node.get("canvas_id", ""), user_id):
            return node
    return None


@api_router_canvas.post("/cards")
async def create_card(
    request: CardCreateRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    card = await upsert_card(
        db_manager, user_id, request.card_id, request.card_type,
        request.title, request.content, request.tags,
        request.dict(include={"media_url", "s3_key", "file_name", "file_type", "metadata"}),
    )
    return await card_response(db_manager, card, user_id)


@api_router_canvas.post("/cards/batch")
async def get_cards_batch(
    request: CardBatchRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    cards = []
    for card_id in dict.fromkeys(request.card_ids):
        card = await get_accessible_card(db_manager, card_id, user_id)
        if card:
            cards.append(await card_response(db_manager, card, user_id))
    return cards


@api_router_canvas.get("/tags")
async def get_card_tags(
    q: str = Query("", max_length=100),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    accessible_card_ids = set()
    canvas_access: Dict[str, bool] = {}
    placements = db_manager.canvas_nodes.find(
        {"card_id": {"$type": "string"}},
        {"card_id": 1, "canvas_id": 1},
    )
    async for placement in placements:
        canvas_id = placement.get("canvas_id")
        card_id = placement.get("card_id")
        if not canvas_id or not card_id:
            continue
        if canvas_id not in canvas_access:
            access = await verify_project_access(db_manager, canvas_id, user_id)
            canvas_access[canvas_id] = bool(access)
        if canvas_access[canvas_id]:
            accessible_card_ids.add(card_id)

    # Owner cards are global to the signed-in user. Cards placed on any canvas
    # they can access are included too, including cards shared by collaborators.
    card_match = {"$or": [
        {"owner_id": user_id},
        {"card_id": {"$in": list(accessible_card_ids)}},
    ]}
    pipeline = [
        {"$match": card_match},
        {"$unwind": "$tags"},
    ]
    if q.strip():
        pipeline.append({
            "$match": {"tags": {"$regex": re.escape(q.strip()), "$options": "i"}}
        })
    pipeline.extend([
        {"$group": {"_id": "$tags", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ])
    cursor = db_manager.cards.aggregate(pipeline)
    return [{"name": row["_id"], "count": row["count"]} async for row in cursor]


@api_router_canvas.get("/search")
async def search_cards(
    q: str = Query(""),
    type: str = Query("card"),
    tags: List[str] = Query(default=[]),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    query: Dict[str, Any] = {}
    if type == "card":
        query["card_type"] = {"$exists": True}
    normalized_tags = normalize_card_tags(tags)
    if normalized_tags:
        query["tags"] = {"$all": normalized_tags}
    if q.strip():
        search_term = re.escape(q.strip())
        query["$or"] = [
            {"title": {"$regex": search_term, "$options": "i"}},
            {"content": {"$regex": search_term, "$options": "i"}},
        ]

    cursor = db_manager.cards.find(query).sort("updated_at", -1).limit(200)
    results = []
    async for candidate in cursor:
        card = await get_accessible_card(db_manager, candidate["card_id"], user_id)
        if card:
            results.append(await card_response(db_manager, card, user_id))
        if len(results) >= 50:
            break
    return results


@api_router_canvas.get("/cards/{card_id}")
async def get_card(
    card_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    card = await get_accessible_card(db_manager, card_id, user_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    return await card_response(db_manager, card, user_id)


@api_router_canvas.patch("/cards/{card_id}")
async def update_card(
    card_id: str,
    request: CardUpdateRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    card = await get_accessible_card(db_manager, card_id, user_id, require_edit=True)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found or not editable")

    changes = request.dict(exclude_unset=True)
    if not changes:
        return await card_response(db_manager, card, user_id)
    if "tags" in changes:
        changes["tags"] = normalize_card_tags(changes["tags"])
    if "card_type" in changes and not changes["card_type"]:
        changes.pop("card_type")
    changes["updated_at"] = datetime.utcnow()
    await db_manager.cards.update_one({"card_id": card_id}, {"$set": changes})
    updated = await db_manager.cards.find_one({"card_id": card_id})
    return await card_response(db_manager, updated, user_id)


@api_router_canvas.post("/card-links")
async def create_card_link(
    request: CreateCardLinkRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    if request.from_card_id == request.to_card_id:
        raise HTTPException(status_code=400, detail="A card cannot link to itself")
    source = await get_accessible_card(db_manager, request.from_card_id, user_id, require_edit=True)
    target = await get_accessible_card(db_manager, request.to_card_id, user_id)
    if not source or not target:
        raise HTTPException(status_code=404, detail="One or both cards were not found")

    link = {
        "link_id": str(uuid.uuid4()),
        "owner_id": user_id,
        "source_card_id": request.from_card_id,
        "target_card_id": request.to_card_id,
        "source": "manual",
        "label": request.label,
        "created_at": datetime.utcnow(),
    }
    try:
        await db_manager.card_links.insert_one(link)
    except Exception as error:
        if "duplicate" in str(error).lower():
            raise HTTPException(status_code=409, detail="Cards are already linked")
        raise
    return {"link_id": link["link_id"], "source": link["source"]}


@api_router_canvas.delete("/card-links/{link_id}")
async def delete_card_link(
    link_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    result = await db_manager.card_links.delete_one({"link_id": link_id, "owner_id": user_id})
    if not result.deleted_count:
        raise HTTPException(status_code=404, detail="Card link not found")
    return {"success": True}


@api_router_canvas.get("/cards/{card_id}/links")
async def get_card_links(
    card_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    card = await get_accessible_card(db_manager, card_id, user_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    outgoing = []
    incoming = []
    cursor = db_manager.card_links.find({
        "$or": [{"source_card_id": card_id}, {"target_card_id": card_id}]
    })
    async for link in cursor:
        linked_id = link["target_card_id"] if link["source_card_id"] == card_id else link["source_card_id"]
        linked_card = await get_accessible_card(db_manager, linked_id, user_id)
        if not linked_card:
            continue
        item = {
            "id": linked_card["card_id"],
            "title": linked_card.get("title", ""),
            "kind": "card",
            "source": link.get("source", "manual"),
        }
        if link["source_card_id"] == card_id:
            item["link_id"] = link.get("link_id")
            outgoing.append(item)
        else:
            incoming.append(item)

    outgoing_seen = {(item["id"], item["source"]) for item in outgoing}
    for linked_id in extract_note_link_ids(card.get("content", "")):
        linked_card = await get_accessible_card(db_manager, linked_id, user_id)
        if linked_card:
            item = {
                "id": linked_card["card_id"],
                "title": linked_card.get("title", ""),
                "kind": "card",
                "source": "mention",
            }
        else:
            linked_node = await get_accessible_node_reference(db_manager, linked_id, user_id)
            if not linked_node or linked_node.get("card_id"):
                continue
            item = {
                "id": linked_node.get("node_id", linked_id),
                "title": linked_node.get("title", ""),
                "kind": "document",
                "source": "mention",
            }
        key = (item["id"], item["source"])
        if key not in outgoing_seen:
            outgoing.append(item)
            outgoing_seen.add(key)

    mention_pattern = re.escape(f'data-note-link-id="{card_id}"')
    mention_cards = db_manager.cards.find({"content": {"$regex": mention_pattern}}).limit(100)
    incoming_seen = {(item["id"], item["source"]) for item in incoming}
    async for source_card in mention_cards:
        if source_card.get("card_id") == card_id:
            continue
        accessible_source = await get_accessible_card(db_manager, source_card.get("card_id", ""), user_id)
        if not accessible_source:
            continue
        item = {
            "id": accessible_source["card_id"],
            "title": accessible_source.get("title", ""),
            "kind": "card",
            "source": "mention",
        }
        key = (item["id"], item["source"])
        if key not in incoming_seen:
            incoming.append(item)
            incoming_seen.add(key)

    mention_nodes = db_manager.canvas_nodes.find({
        "content": {"$regex": mention_pattern}
    }).limit(100)
    async for source_node in mention_nodes:
        if source_node.get("card_id"):
            continue
        if not await verify_project_access(db_manager, source_node.get("canvas_id", ""), user_id):
            continue
        item = {
            "id": source_node.get("node_id", ""),
            "title": source_node.get("title", ""),
            "kind": "document",
            "source": "mention",
        }
        key = (item["id"], item["source"])
        if item["id"] and key not in incoming_seen:
            incoming.append(item)
            incoming_seen.add(key)

    card_placements = db_manager.canvas_nodes.find(
        {"card_id": card_id}, {"canvas_id": 1, "branch_id": 1, "node_id": 1}
    )
    async for placement in card_placements:
        canvas_id = placement.get("canvas_id", "")
        branch_id = placement.get("branch_id", "main")
        placement_node_id = placement.get("node_id", "")
        if not canvas_id or not placement_node_id:
            continue
        if not await verify_project_access(db_manager, canvas_id, user_id):
            continue
        connections = db_manager.canvas_connections.find({
            "canvas_id": canvas_id,
            "branch_id": branch_id,
            "$or": [
                {"from_node_id": placement_node_id},
                {"to_node_id": placement_node_id},
            ],
        })
        async for connection in connections:
            is_outgoing = connection.get("from_node_id") == placement_node_id
            linked_node_id = connection.get("to_node_id") if is_outgoing else connection.get("from_node_id")
            linked_node = await db_manager.get_canvas_node_by_id(canvas_id, linked_node_id, branch_id)
            if not linked_node:
                continue
            linked_card = None
            if linked_node.get("card_id"):
                linked_card = await get_accessible_card(db_manager, linked_node["card_id"], user_id)
                if not linked_card:
                    continue
            item = {
                "id": linked_card["card_id"] if linked_card else linked_node.get("node_id", linked_node_id),
                "title": linked_card.get("title", "") if linked_card else linked_node.get("title", ""),
                "kind": "card" if linked_card else "document",
                "source": "connection",
            }
            destination = outgoing if is_outgoing else incoming
            seen = outgoing_seen if is_outgoing else incoming_seen
            key = (item["id"], item["source"])
            if key not in seen:
                destination.append(item)
                seen.add(key)
    return {"out": outgoing, "in": incoming}


@api_router_canvas.get("/cards/{card_id}/boards")
async def get_card_boards(
    card_id: str,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    card = await get_accessible_card(db_manager, card_id, user_id)
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")

    boards: Dict[str, Dict[str, str]] = {}
    placements = db_manager.canvas_nodes.find(
        {"card_id": card_id}, {"canvas_id": 1, "node_id": 1}
    )
    async for placement in placements:
        canvas_id = placement.get("canvas_id")
        if not canvas_id or canvas_id in boards:
            continue
        access = await verify_project_access(db_manager, canvas_id, user_id)
        if not access:
            continue
        workspace = await db_manager.workspaces.find_one({"workspace_id": canvas_id})
        boards[canvas_id] = {
            "canvas_id": canvas_id,
            "title": (workspace or {}).get("title") or (workspace or {}).get("name") or canvas_id,
            "node_id": placement.get("node_id", ""),
        }
    return list(boards.values())


@api_router_canvas.post("/cards/convert")
async def convert_node_to_card(
    request: CardConversionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    user_id = get_authenticated_user_id(credentials)
    canvas_id = request.canvas_id
    branch_id = request.branch_id
    node_id = request.node_id
    card_input = request.card

    node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    access = await verify_project_access(db_manager, canvas_id, user_id)
    if access:
        if access.get("access_level") not in {"owner", "editor", "admin"}:
            raise HTTPException(status_code=403, detail="You cannot edit this canvas")
    elif str(node.get("created_by")) != user_id:
        raise HTTPException(status_code=403, detail="You cannot edit this canvas")

    card = await upsert_card(
        db_manager,
        user_id,
        card_input.card_id,
        card_input.card_type,
        card_input.title or node.get("title", ""),
        card_input.content or node.get("content", ""),
        card_input.tags,
        card_input.dict(include={"media_url", "s3_key", "file_name", "file_type", "metadata"}),
    )
    await db_manager.update_canvas_node(canvas_id, node_id, branch_id, {
        "kind": "card",
        "card_id": card["card_id"],
        "content": "",
        "updated_at": datetime.utcnow(),
    })
    return await card_response(db_manager, card, user_id)

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
        user_id = user_data.get("id") or user_data.get("_id") or user_data.get("user_id")
        
        logger.info(f"NODE_CREATE: User={user_id}, Canvas={request.canvas_id}, Type={request.node_type}, Title={request.title[:50]}")

        node_kind = request.kind or 'note'
        card_id = request.card_id
        if request.card:
            canvas_access = await verify_project_access(db_manager, request.canvas_id, str(user_id))
            if not canvas_access or canvas_access.get('access_level') not in {'owner', 'editor', 'admin'}:
                raise HTTPException(status_code=403, detail="You cannot add cards to this canvas")
            card_input = request.card
            card_id = card_input.get('card_id') or card_id
            if not card_id:
                raise HTTPException(status_code=400, detail="card_id is required for card nodes")
            await upsert_card(
                db_manager,
                str(user_id),
                card_id,
                card_input.get('card_type') or card_input.get('type') or request.node_type,
                card_input.get('title', request.title),
                card_input.get('content', request.content),
                card_input.get('tags', []),
                {
                    'media_url': card_input.get('media_url'),
                    's3_key': card_input.get('s3_key'),
                    'file_name': card_input.get('file_name'),
                    'file_type': card_input.get('file_type'),
                    'metadata': card_input.get('metadata'),
                },
            )
            node_kind = 'card'
        elif node_kind == 'card':
            canvas_access = await verify_project_access(db_manager, request.canvas_id, str(user_id))
            if not canvas_access or canvas_access.get('access_level') not in {'owner', 'editor', 'admin'}:
                raise HTTPException(status_code=403, detail="You cannot add cards to this canvas")
            if not card_id or not await get_accessible_card(db_manager, card_id, str(user_id)):
                raise HTTPException(status_code=404, detail="Card not found")
        
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
            'kind': node_kind,
            'card_id': card_id,
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
            metadata=request.metadata or {},
            kind=node_kind,
            card_id=card_id,
        )
    except HTTPException:
        raise
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

        previous_node = None
        stale_parse_cache_id = None
        if request.s3_key is not None or request.metadata is not None:
            previous_node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
            previous_metadata = previous_node.get("metadata") if previous_node and isinstance(previous_node.get("metadata"), dict) else {}
            previous_parse_state = previous_metadata.get("pdf_parse") if isinstance(previous_metadata.get("pdf_parse"), dict) else {}
            if request.s3_key is not None and previous_node and request.s3_key != (previous_node.get("s3_key") or ""):
                stale_parse_cache_id = previous_parse_state.get("cache_id")
        
        update_data = {'updated_at': datetime.utcnow()}
        
        if request.content is not None:
            update_data['content'] = request.content
        if request.title is not None:
            update_data['title'] = request.title
        if request.metadata is not None:
            previous_metadata = previous_node.get("metadata") if previous_node and isinstance(previous_node.get("metadata"), dict) else {}
            update_data['metadata'] = {**previous_metadata, **request.metadata}
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
            if previous_node and request.s3_key != (previous_node.get("s3_key") or ""):
                current_metadata = update_data.get("metadata", previous_metadata)
                update_data["metadata"] = {**current_metadata, "pdf_parse": None}
        if request.file_name is not None:
            update_data['file_name'] = request.file_name
        if request.node_type is not None:
            update_data['node_type'] = request.node_type
        if request.media_url is not None:
            update_data["media_url"] = request.media_url
        if request.pdfUrl is not None:
            update_data["pdfUrl"] = request.pdfUrl
        
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

        if stale_parse_cache_id:
            try:
                await db_manager.db["pdf_parse_cache"].delete_many({"cache_id": stale_parse_cache_id})
            except Exception as cache_error:
                logger.warning("Could not remove stale PDF parse cache for node %s (%s)", node_id, type(cache_error).__name__)
        
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
    """Delete a canvas node, its connections, and unreferenced uploaded files."""
    try:
        user_id = get_authenticated_user_id(credentials)
        access = await verify_project_access(db_manager, canvas_id, user_id)
        if not access:
            raise HTTPException(status_code=404, detail="Canvas not found")
        if access.get("access_level") not in {"owner", "editor", "admin"}:
            raise HTTPException(status_code=403, detail="You cannot delete nodes from this canvas")

        node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found")

        node_asset_keys = collect_node_r2_keys(node, canvas_id)
        unreferenced_keys = []
        for key in node_asset_keys:
            if not await is_r2_key_referenced_elsewhere(
                db_manager, key, canvas_id, node_id, branch_id
            ):
                unreferenced_keys.append(key)

        if unreferenced_keys and r2_client is None:
            raise HTTPException(
                status_code=503,
                detail="R2 storage is unavailable. The node was kept so its attached files can be deleted safely.",
            )

        deleted_r2_objects = 0
        failed_r2_keys = []
        for key in unreferenced_keys:
            r2_delete_failed = False
            if r2_client is not None:
                try:
                    r2_client.delete_object(Bucket=R2_BUCKET_NAME, Key=key)
                    deleted_r2_objects += 1
                except ClientError as error:
                    error_code = error.response.get("Error", {}).get("Code", "Unknown")
                    if error_code in {"NoSuchKey", "NotFound", "404"}:
                        logger.info("R2 object already absent during node cleanup: %s", key)
                    else:
                        logger.error("R2 cleanup failed for node %s object %s: %s", node_id, key, error_code)
                        failed_r2_keys.append(key)
                        r2_delete_failed = True
                except Exception as error:
                    logger.error("R2 cleanup failed for node %s object %s: %s", node_id, key, error)
                    failed_r2_keys.append(key)
                    r2_delete_failed = True

            if not r2_delete_failed:
                remove_local_upload_copies(key)

        if failed_r2_keys:
            raise HTTPException(
                status_code=503,
                detail="Could not remove all attached files from R2. The node was kept; retry after storage is available.",
            )

        node_deleted = await db_manager.delete_canvas_node(canvas_id, node_id, branch_id)
        if not node_deleted:
            raise HTTPException(status_code=404, detail="Node was already deleted")

        node_metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
        pdf_parse_state = node_metadata.get("pdf_parse") if isinstance(node_metadata.get("pdf_parse"), dict) else {}
        if pdf_parse_state.get("cache_id"):
            try:
                await db_manager.db["pdf_parse_cache"].delete_many({"cache_id": pdf_parse_state["cache_id"]})
            except Exception as cache_error:
                logger.warning("Could not remove PDF parse cache for deleted node %s (%s)", node_id, type(cache_error).__name__)
        
        await db_manager.db.canvas_connections.delete_many({
            "canvas_id": canvas_id,
            "branch_id": branch_id,
            "$or": [
                {"from_node_id": node_id},
                {"to_node_id": node_id}
            ]
        })
        
        logger.info(
            "Deleted node %s and connections from canvas %s; removed %s R2 object(s), preserved %s shared file(s)",
            node_id,
            canvas_id,
            deleted_r2_objects,
            len(node_asset_keys) - len(unreferenced_keys),
        )
        
        return JSONResponse(content={
            "message": "Node and associated connections deleted",
            "node_id": node_id,
            "canvas_id": canvas_id,
            "deleted_r2_objects": deleted_r2_objects,
            "preserved_shared_files": len(node_asset_keys) - len(unreferenced_keys),
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting node: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _openparser_client():
    global _OPENPARSER_CLIENT
    if not OPENPARSER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="PDF parsing is not configured. Set OPENPARSER_API_KEY on the server.",
        )
    if _OPENPARSER_CLIENT is None:
        try:
            from openparser import OpenParserClient
        except ImportError as error:
            logger.error("OpenParser SDK is unavailable: %s", type(error).__name__)
            raise HTTPException(status_code=503, detail="OpenParser SDK is not installed on the server")
        _OPENPARSER_CLIENT = OpenParserClient(api_key=OPENPARSER_API_KEY)
    return _OPENPARSER_CLIENT


def _plain_openparser_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): _plain_openparser_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain_openparser_value(item) for item in value]
    for method_name in ("model_dump", "to_dict", "dict"):
        method = getattr(value, method_name, None)
        if callable(method):
            try:
                return _plain_openparser_value(method())
            except TypeError:
                continue
    if hasattr(value, "__dict__"):
        return {
            str(key): _plain_openparser_value(item)
            for key, item in vars(value).items()
            if not str(key).startswith("_")
        }
    return str(value)


def _openparser_field(value: Any, key: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _openparser_error_detail(error: Exception) -> str:
    envelope = _plain_openparser_value(getattr(error, "envelope", None))
    if isinstance(envelope, dict) and isinstance(envelope.get("message"), str):
        return f"OpenParser: {envelope['message'][:240]}"
    return "OpenParser could not complete the PDF request"


async def _read_pdf_node_bytes(node: Dict[str, Any], canvas_id: str) -> tuple[bytes, str, str]:
    s3_key = node.get("s3_key") or node.get("s3Key")
    if not isinstance(s3_key, str) or not SecurityValidator.validate_s3_key(s3_key, canvas_id):
        raise HTTPException(status_code=400, detail="This PDF has no valid uploaded file attached")

    filename = SecurityValidator.validate_filename(Path(s3_key).name)
    if not filename or Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="The attached file is not a PDF")

    file_data = None
    if r2_client is not None:
        try:
            def read_r2_file() -> bytes:
                response = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=s3_key)
                return response["Body"].read(OPENPARSER_MAX_FILE_BYTES + 1)

            file_data = await asyncio.to_thread(read_r2_file)
        except Exception as error:
            logger.warning("Could not read PDF from R2 for parsing (%s)", type(error).__name__)

    if file_data is None:
        workspace_value = getattr(global_args, "workspace", None) if global_args else None
        workspace_root = Path(workspace_value or WORKSPACE_BASE).resolve()
        session_upload_dir = workspace_root / canvas_id / UPLOAD_FOLDER_NAME
        candidates = (
            session_upload_dir / filename,
            session_upload_dir / LOCAL_FALLBACK_FOLDER_NAME / filename,
        )
        for path in candidates:
            if not SecurityValidator.validate_path_safety(path, workspace_root):
                continue
            if not path.is_file():
                continue
            try:
                if path.stat().st_size > OPENPARSER_MAX_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="PDF exceeds OpenParser's 50 MiB file limit")
                file_data = await asyncio.to_thread(path.read_bytes)
                break
            except HTTPException:
                raise
            except OSError as error:
                logger.warning("Could not read local PDF for parsing (%s)", type(error).__name__)

    if file_data is None:
        raise HTTPException(status_code=404, detail="The uploaded PDF is unavailable in storage")
    if len(file_data) > OPENPARSER_MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="PDF exceeds OpenParser's 50 MiB file limit")
    if not file_data[:1024].lstrip().startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="The attached file does not contain a valid PDF")

    return file_data, filename, s3_key


def _parse_elements_for_range(parsed: Dict[str, Any], start_page: int, end_page: int) -> tuple[list, list, str]:
    pages = parsed.get("pages") if isinstance(parsed.get("pages"), list) else []
    elements = parsed.get("elements") if isinstance(parsed.get("elements"), list) else []
    pages_by_number = {
        int(page.get("number")): page
        for page in pages
        if isinstance(page, dict) and str(page.get("number", "")).isdigit()
    }
    selected_pages = [
        page for page_number, page in sorted(pages_by_number.items())
        if start_page <= page_number <= end_page
    ]
    element_by_id = {
        str(element.get("id")): element
        for element in elements
        if isinstance(element, dict) and element.get("id") is not None
    }

    ordered_elements = []
    included_ids = set()
    for page in selected_pages:
        page_order = page.get("reading_order") or page.get("element_ids") or []
        for element_id in page_order:
            element = element_by_id.get(str(element_id))
            if element and str(element_id) not in included_ids:
                ordered_elements.append(element)
                included_ids.add(str(element_id))

    for element in elements:
        if not isinstance(element, dict) or str(element.get("id")) in included_ids:
            continue
        locations = element.get("locations") or []
        page_numbers = {
            int(location.get("page_number"))
            for location in locations
            if isinstance(location, dict) and str(location.get("page_number", "")).isdigit()
        }
        if not page_numbers and str(element.get("page_number", "")).isdigit():
            page_numbers.add(int(element["page_number"]))
        if page_numbers and any(start_page <= page_number <= end_page for page_number in page_numbers):
            ordered_elements.append(element)
            included_ids.add(str(element.get("id")))

    markdown_lines = []
    current_page = None
    for element in ordered_elements:
        locations = element.get("locations") or []
        page_number = next((
            int(location["page_number"])
            for location in locations
            if isinstance(location, dict) and str(location.get("page_number", "")).isdigit()
        ), None)
        if page_number is not None and page_number != current_page:
            current_page = page_number
            markdown_lines.extend([f"## Page {page_number}", ""])
        text_value = element.get("markdown") or element.get("text") or element.get("content")
        if isinstance(text_value, str) and text_value.strip():
            markdown_lines.extend([text_value.strip(), ""])
        elif element.get("cells"):
            markdown_lines.extend(["```json", json.dumps(element["cells"], ensure_ascii=False), "```", ""])

    return selected_pages, ordered_elements, "\n".join(markdown_lines).strip()


def _pdf_parse_cache_id(canvas_id: str, node_id: str, branch_id: str, file_hash: str) -> str:
    identity = f"{canvas_id}:{node_id}:{branch_id}:{file_hash}:{OPENPARSER_OCR_MODEL}"
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


async def _store_pdf_parse_result(db_manager: DatabaseManager, cache_id: str, parsed: Dict[str, Any]) -> int:
    serialized = json.dumps(parsed, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
    compressed = gzip.compress(serialized)
    chunks = [
        compressed[offset:offset + PDF_PARSE_CACHE_CHUNK_BYTES]
        for offset in range(0, len(compressed), PDF_PARSE_CACHE_CHUNK_BYTES)
    ] or [b""]
    collection = db_manager.db["pdf_parse_cache"]
    operations = []
    for chunk_index, payload in enumerate(chunks):
        chunk_document = {
            "_id": f"{cache_id}:{chunk_index:08d}",
            "cache_id": cache_id,
            "chunk_index": chunk_index,
            "chunk_count": len(chunks),
            "payload": payload,
            "updated_at": datetime.utcnow(),
        }
        operations.append(ReplaceOne({"_id": chunk_document["_id"]}, chunk_document, upsert=True))
    await collection.bulk_write(operations, ordered=True)
    await collection.delete_many({"cache_id": cache_id, "chunk_index": {"$gte": len(chunks)}})
    return len(chunks)


async def _load_pdf_parse_result(
    db_manager: DatabaseManager,
    cache_id: Optional[str],
    chunk_count: Optional[int],
) -> Optional[Dict[str, Any]]:
    if not cache_id or not chunk_count or chunk_count < 1:
        return None
    chunk_ids = [f"{cache_id}:{index:08d}" for index in range(chunk_count)]
    cursor = db_manager.db["pdf_parse_cache"].find({"_id": {"$in": chunk_ids}}).sort("chunk_index", 1)
    chunks_by_index = {}
    async for document in cursor:
        chunks_by_index[int(document["chunk_index"])] = bytes(document["payload"])
    if len(chunks_by_index) != chunk_count:
        return None
    compressed = b"".join(chunks_by_index[index] for index in range(chunk_count))
    try:
        parsed = json.loads(gzip.decompress(compressed).decode("utf-8"))
        return parsed if isinstance(parsed, dict) else None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        logger.warning("PDF parse cache entry could not be decoded: %s", cache_id)
        return None


def _pdf_parse_range_response(
    parse_state: Dict[str, Any],
    parsed: Dict[str, Any],
    start_page: int,
    end_page: int,
) -> Dict[str, Any]:
    pages, elements, markdown = _parse_elements_for_range(parsed, start_page, end_page)
    all_pages = parsed.get("pages") if isinstance(parsed.get("pages"), list) else []
    page_count = len(all_pages)
    text_parts = []
    for element in elements:
        text_value = element.get("text") or element.get("markdown") or element.get("content")
        if isinstance(text_value, str) and text_value.strip():
            text_parts.append(text_value.strip())
    return {
        "status": "succeeded",
        "job_id": str(parse_state.get("job_id", "")),
        "model": OPENPARSER_OCR_MODEL,
        "document_id": parsed.get("document_id"),
        "page_count": page_count,
        "pages": pages,
        "elements": elements,
        "text": "\n\n".join(text_parts),
        "markdown": markdown,
        "provenance": parsed.get("provenance"),
    }


@api_router_canvas.get("/pdf/{canvas_id}/{node_id}/highlights")
async def get_pdf_highlights(
    canvas_id: str,
    node_id: str,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """Read highlights saved on a canvas PDF node."""
    user_id = get_authenticated_user_id(credentials)
    access = await verify_project_access(db_manager, canvas_id, user_id)
    if not access:
        raise HTTPException(status_code=404, detail="Canvas not found")

    node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
    if not node:
        raise HTTPException(status_code=404, detail="PDF node not found")
    if str(node.get("node_type", "")).lower() not in {"pdf", "document"}:
        raise HTTPException(status_code=400, detail="This canvas node is not a PDF")

    metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
    highlights = metadata.get("pdf_highlights")
    return {"highlights": highlights if isinstance(highlights, list) else []}


@api_router_canvas.put("/pdf/{canvas_id}/{node_id}/highlights")
async def save_pdf_highlights(
    canvas_id: str,
    node_id: str,
    request: PDFHighlightsUpdateRequest,
    branch_id: str = Query("main"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """Replace the saved highlights for a canvas PDF node."""
    user_id = get_authenticated_user_id(credentials)
    access = await verify_project_access(db_manager, canvas_id, user_id)
    if not access:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if access.get("access_level") not in {"owner", "editor", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot edit highlights in this canvas")

    node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
    if not node:
        raise HTTPException(status_code=404, detail="PDF node not found")
    if str(node.get("node_type", "")).lower() not in {"pdf", "document"}:
        raise HTTPException(status_code=400, detail="This canvas node is not a PDF")

    highlights = [highlight.dict() for highlight in request.highlights]
    updated = await db_manager.update_canvas_node(
        canvas_id,
        node_id,
        branch_id,
        {"metadata.pdf_highlights": highlights, "updated_at": datetime.utcnow()},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="PDF node not found")
    return {"saved": True, "count": len(highlights)}


@api_router_canvas.post("/pdf/{canvas_id}/{node_id}/parse")
async def start_pdf_parse(
    canvas_id: str,
    node_id: str,
    branch_id: str = Query("main"),
    retry: bool = Query(False),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """Queue an OpenParser PaddleOCR-VL job for an uploaded canvas PDF."""
    user_id = get_authenticated_user_id(credentials)
    access = await verify_project_access(db_manager, canvas_id, user_id)
    if not access:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if access.get("access_level") not in {"owner", "editor", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot parse files in this canvas")

    node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
    if not node:
        raise HTTPException(status_code=404, detail="PDF node not found")
    if str(node.get("node_type", "")).lower() not in {"pdf", "document"}:
        raise HTTPException(status_code=400, detail="This canvas node is not a PDF")

    file_data, filename, source_key = await _read_pdf_node_bytes(node, canvas_id)
    file_hash = hashlib.sha256(file_data).hexdigest()
    metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
    previous = metadata.get("pdf_parse") if isinstance(metadata.get("pdf_parse"), dict) else {}
    previous_status = str(previous.get("status", "")).lower()
    if previous.get("source_key") == source_key and previous.get("file_hash") == file_hash:
        if previous_status in {"queued", "running", "processing", "succeeded"}:
            return {"status": previous_status, "job_id": previous.get("job_id"), "model": OPENPARSER_OCR_MODEL}
        retry = retry or previous_status in {"failed", "indeterminate"}

    client = _openparser_client()
    retry_count = int(previous.get("retry_count", 0) or 0) + (1 if retry else 0)
    idempotency_seed = f"{canvas_id}:{node_id}:{branch_id}:{file_hash}:{OPENPARSER_OCR_MODEL}:{retry_count}"
    idempotency_key = hashlib.sha256(idempotency_seed.encode("utf-8")).hexdigest()
    try:
        accepted = await asyncio.to_thread(
            lambda: client.parse.async_(
                {"ocr_model": OPENPARSER_OCR_MODEL, "output_format": OPENPARSER_OUTPUT_FORMAT},
                file={"content": file_data, "filename": filename, "mime_type": "application/pdf"},
                idempotency_key=idempotency_key,
            )
        )
        accepted_data = _plain_openparser_value(accepted)
        job_id = accepted_data.get("id") or accepted_data.get("job_id") if isinstance(accepted_data, dict) else None
        if not job_id:
            raise RuntimeError("OpenParser did not return a job ID")
        status = str(accepted_data.get("status", "queued")).lower() if isinstance(accepted_data, dict) else "queued"
        if status not in {"queued", "running", "processing", "succeeded"}:
            status = "queued"
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("OpenParser parse admission failed for canvas %s node %s", canvas_id, node_id)
        raise HTTPException(status_code=502, detail=_openparser_error_detail(error)) from error

    parse_state = {
        "status": status,
        "job_id": str(job_id),
        "source_key": source_key,
        "file_hash": file_hash,
        "cache_id": _pdf_parse_cache_id(canvas_id, node_id, branch_id, file_hash),
        "cache_chunk_count": 0,
        "model": OPENPARSER_OCR_MODEL,
        "output_format": OPENPARSER_OUTPUT_FORMAT,
        "retry_count": retry_count,
        "started_at": datetime.utcnow(),
    }
    await db_manager.update_canvas_node(
        canvas_id,
        node_id,
        branch_id,
        {"metadata.pdf_parse": parse_state, "updated_at": datetime.utcnow()},
    )
    previous_cache_id = previous.get("cache_id")
    if previous_cache_id and previous_cache_id != parse_state["cache_id"]:
        try:
            await db_manager.db["pdf_parse_cache"].delete_many({"cache_id": previous_cache_id})
        except Exception as cache_error:
            logger.warning("Could not remove superseded PDF parse cache for node %s (%s)", node_id, type(cache_error).__name__)
    return {"status": status, "job_id": str(job_id), "model": OPENPARSER_OCR_MODEL}


@api_router_canvas.get("/pdf/{canvas_id}/{node_id}/parse")
async def get_pdf_parse(
    canvas_id: str,
    node_id: str,
    branch_id: str = Query("main"),
    start_page: int = Query(1, ge=1),
    end_page: int = Query(1, ge=1, le=10000),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db_manager: DatabaseManager = Depends(get_db_manager),
):
    """Read parse status and only the requested page range from the result."""
    user_id = get_authenticated_user_id(credentials)
    access = await verify_project_access(db_manager, canvas_id, user_id)
    if not access:
        raise HTTPException(status_code=404, detail="Canvas not found")
    if access.get("access_level") not in {"owner", "editor", "admin"}:
        raise HTTPException(status_code=403, detail="You cannot read parsed content from this canvas")
    if end_page < start_page:
        raise HTTPException(status_code=400, detail="end_page must be greater than or equal to start_page")

    node = await db_manager.get_canvas_node_by_id(canvas_id, node_id, branch_id)
    if not node:
        raise HTTPException(status_code=404, detail="PDF node not found")
    if str(node.get("node_type", "")).lower() not in {"pdf", "document"}:
        raise HTTPException(status_code=400, detail="This canvas node is not a PDF")
    metadata = node.get("metadata") if isinstance(node.get("metadata"), dict) else {}
    parse_state = metadata.get("pdf_parse") if isinstance(metadata.get("pdf_parse"), dict) else None
    if not parse_state or not parse_state.get("job_id"):
        return {"status": "idle", "job_id": None, "model": OPENPARSER_OCR_MODEL}
    current_source_key = node.get("s3_key") or node.get("s3Key")
    if parse_state.get("source_key") and parse_state.get("source_key") != current_source_key:
        return {"status": "idle", "job_id": None, "model": OPENPARSER_OCR_MODEL}

    try:
        parsed = await _load_pdf_parse_result(
            db_manager,
            parse_state.get("cache_id"),
            parse_state.get("cache_chunk_count"),
        )
    except Exception as cache_error:
        logger.exception("Could not read PDF parse cache for canvas %s node %s (%s)", canvas_id, node_id, type(cache_error).__name__)
        parsed = None
    if parsed is not None:
        return _pdf_parse_range_response(parse_state, parsed, start_page, end_page)

    client = _openparser_client()
    try:
        job = await asyncio.to_thread(client.jobs.get, str(parse_state["job_id"]))
        job_data = _plain_openparser_value(job)
        status_value = _openparser_field(job, "status", "unknown")
        status = str(getattr(status_value, "value", status_value)).lower()
        if status in {"succeeded", "completed", "complete"}:
            parsed_result = await asyncio.to_thread(
                lambda: client.jobs.result(str(parse_state["job_id"]), format=OPENPARSER_OUTPUT_FORMAT)
            )
            parsed = _plain_openparser_value(parsed_result)
            if not isinstance(parsed, dict):
                raise RuntimeError("OpenParser returned an invalid parse result")
            all_pages = parsed.get("pages") if isinstance(parsed.get("pages"), list) else []
            page_count = len(all_pages)
            cache_id = parse_state.get("cache_id") or _pdf_parse_cache_id(canvas_id, node_id, branch_id, str(parse_state.get("file_hash", "")))
            cache_chunk_count = 0
            try:
                cache_chunk_count = await _store_pdf_parse_result(db_manager, cache_id, parsed)
            except Exception as cache_error:
                logger.exception("Could not save PDF parse cache for canvas %s node %s (%s)", canvas_id, node_id, type(cache_error).__name__)
            updated_state = {
                **parse_state,
                "status": "succeeded",
                "cache_id": cache_id,
                "cache_chunk_count": cache_chunk_count,
                "page_count": page_count,
                "document_id": parsed.get("document_id"),
                "completed_at": datetime.utcnow(),
            }
            await db_manager.update_canvas_node(
                canvas_id,
                node_id,
                branch_id,
                {"metadata.pdf_parse": updated_state, "updated_at": datetime.utcnow()},
            )
            return _pdf_parse_range_response(updated_state, parsed, start_page, end_page)

        if status in {"failed", "indeterminate", "cancelled", "canceled"}:
            error_info = job_data.get("error") if isinstance(job_data, dict) else None
            updated_state = {**parse_state, "status": status, "error": error_info}
            await db_manager.update_canvas_node(
                canvas_id,
                node_id,
                branch_id,
                {"metadata.pdf_parse": updated_state, "updated_at": datetime.utcnow()},
            )
            return {"status": status, "job_id": str(parse_state["job_id"]), "error": error_info}

        return {"status": status if status in {"queued", "running", "processing"} else "running", "job_id": str(parse_state["job_id"]), "model": OPENPARSER_OCR_MODEL}
    except HTTPException:
        raise
    except Exception as error:
        logger.exception("OpenParser status lookup failed for canvas %s node %s", canvas_id, node_id)
        raise HTTPException(status_code=502, detail=_openparser_error_detail(error)) from error


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
                kind=node.get('kind', 'note'),
                card_id=node.get('card_id'),
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
                kind=node.get('kind', 'note'),
                card_id=node.get('card_id'),
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
        if not file_info or not isinstance(file_info, dict):
            raise HTTPException(status_code=400, detail="No file provided")
        original_filename = file_info.get("path", "unknown")
        
        logger.warning(f"UPLOAD_DETAILS: User={user_id}, IP={client_ip}, Session={session_id}, File={original_filename}")

        safe_session_id = SecurityValidator.validate_session_id(session_id)
        
        if not safe_session_id:
            raise HTTPException(status_code=400, detail="Invalid session_id format")
        
        if not await verify_session_ownership(db, safe_session_id, user_id):
            raise HTTPException(status_code=403, detail="Access denied to this session")
        
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
        # Keep the existing s3_key field as the persisted object-key contract;
        # these keys now refer to objects in Cloudflare R2.
        s3_key = f"{safe_session_id}/{UPLOAD_FOLDER_NAME}/{unique_filename}"
        actual_mime = magic.from_buffer(file_data, mime=True)
        content_type = actual_mime if actual_mime else declared_content_type or 'application/octet-stream'

        # Save locally first so an R2 outage does not lose the uploaded file.
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
            raise HTTPException(status_code=500, detail="Failed to save uploaded file locally")

        r2_url = None
        storage_backend = "local"
        try:
            if r2_client is None:
                raise RuntimeError("Cloudflare R2 storage is not configured")

            r2_client.put_object(
                Bucket=R2_BUCKET_NAME,
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
                }
            )

            if R2_PUBLIC_BASE_URL:
                r2_url = f"{R2_PUBLIC_BASE_URL}/{quote(s3_key, safe='/')}"
            storage_backend = "r2"
            logger.info(f"File uploaded to Cloudflare R2 - User: {user_id}, File: {unique_filename}, Hash: {file_hash[:16]}...")
        except Exception as e:
            # Do not fail the upload: the validated local copy is already available
            # through the /workspace static mount. Keep it outside the temporary
            # workspace cache so inactivity cleanup can preserve it.
            logger.warning(
                "Cloudflare R2 upload unavailable; keeping local copy for user %s, file %s (%s)",
                user_id,
                unique_filename,
                type(e).__name__,
            )
            try:
                fallback_dir = upload_dir / LOCAL_FALLBACK_FOLDER_NAME
                fallback_dir.mkdir(parents=True, exist_ok=True)
                fallback_path = fallback_dir / unique_filename
                if not SecurityValidator.validate_path_safety(fallback_path, session_path):
                    raise HTTPException(status_code=500, detail="Invalid fallback file path")
                os.replace(local_path, fallback_path)
                local_path = fallback_path
                full_url_path = (
                    f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/"
                    f"{LOCAL_FALLBACK_FOLDER_NAME}/{unique_filename}"
                )
                logger.info("File retained in local fallback storage: %s", local_path)
            except Exception as local_fallback_error:
                logger.error("Failed to retain local fallback upload: %s", local_fallback_error)
                raise HTTPException(status_code=500, detail="Failed to retain local upload")

        logger.info(f"✅ UPLOAD SUCCESS - User: {user_id}, File: {unique_filename}, Hash: {file_hash}, Size: {len(file_data)} bytes, Storage: {storage_backend}")
        
        return {
            "success": True,
            "message": "File uploaded successfully",
            "file": {
                "path": full_url_path,
                "r2_url": r2_url,
                # Backward-compatible response alias; URLs are set only when a
                # public R2 base URL is configured.
                "s3_url": r2_url,
                "s3_key": s3_key,
                "storage_backend": storage_backend,
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
        fallback_dir = upload_dir / LOCAL_FALLBACK_FOLDER_NAME
        fallback_path = fallback_dir / safe_filename

        if not SecurityValidator.validate_path_safety(session_path, workspace_path):
            raise HTTPException(status_code=500, detail="Invalid session path")

        if not SecurityValidator.validate_path_safety(local_path, upload_dir):
            raise HTTPException(status_code=500, detail="Invalid file path")
        if not SecurityValidator.validate_path_safety(fallback_path, session_path):
            raise HTTPException(status_code=500, detail="Invalid fallback file path")

        local_candidates = (
            (local_path, f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/{safe_filename}"),
            (
                fallback_path,
                f"/workspace/{safe_session_id}/{UPLOAD_FOLDER_NAME}/"
                f"{LOCAL_FALLBACK_FOLDER_NAME}/{safe_filename}",
            ),
        )
        for candidate_path, candidate_url in local_candidates:
            if not candidate_path.exists() or not candidate_path.is_file():
                continue
            try:
                file_stat = candidate_path.stat()

                logger.info(f"File found locally - User: {user_id}, File: {safe_filename}, Size: {file_stat.st_size}")

                return {
                    "success": True,
                    "message": "File already exists in workspace",
                    "already_exists": True,
                    "skipped_download": True,
                    "file": {
                        "path": candidate_url,
                        "local_path": str(candidate_path),
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
            if r2_client is None:
                raise HTTPException(status_code=503, detail="Cloudflare R2 storage is not configured")

            logger.info(f"Downloading from Cloudflare R2 - User: {user_id}, Key: {s3_key}")

            response = r2_client.get_object(Bucket=R2_BUCKET_NAME, Key=s3_key)
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

            logger.info(f"Downloaded from Cloudflare R2 - Size: {len(file_data)} bytes")

        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            if error_code in {"NoSuchKey", "NotFound", "404"}:
                raise HTTPException(status_code=404, detail="File not found in storage")
            logger.error(f"Cloudflare R2 download failed: {error_code}")
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

def iter_project_work_items(project: Dict[str, Any]):
    """Yield (topic_or_None, work_item) for direct items and topic items."""
    for wi in project.get("work_items") or []:
        yield None, wi
    for topic in project.get("topics") or []:
        for wi in topic.get("work_items") or []:
            yield topic, wi

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
        session_found = any(
            wi.get("session_id") == session_id
            for _, wi in iter_project_work_items(project)
        )

        
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
        
        # Derive the session's access scope from the stored workspace record.
        # The query parameters are retained for older clients, but are not
        # authoritative and may be absent when AgentOS opens from a canvas.
        access_level = None
        stored_project_id = workspace_info.get("project_id")

        if workspace_info.get("userid") == user_id:
            project_type = "personal"
            has_access = await check_personal_project_access(workspace_info, user_id)
            if not has_access:
                raise HTTPException(status_code=403, detail="Not authorized")
            access_level = "owner"
            user_id_filter = user_id
        else:
            project_type = "group"
            has_access, access_level = await check_group_project_access(
                db_manager, workspace_info, user_id,
                str(stored_project_id) if stored_project_id else None
            )
            if not has_access:
                raise HTTPException(status_code=403, detail="Not authorized")
            user_id_filter = None
        
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
                "project_type": project_type,
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
            "project_type": project_type,
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
    
