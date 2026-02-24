import os
from datetime import datetime, timedelta
import logging
from logging.handlers import RotatingFileHandler
import uuid
import base64
from pathlib import Path
from fastapi import APIRouter, Query, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pymongo import MongoClient
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from bson import ObjectId
from bson.errors import InvalidId
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
from verifySystem import verify_token, get_current_user
from Mongodb.db import DatabaseManager
from utilss.constants import UPLOAD_FOLDER_NAME
from validation import SecurityValidator
from dotenv import load_dotenv
from urllib.parse import quote_plus
from slowapi import Limiter
from slowapi.util import get_remote_address

load_dotenv()

# ==================== CONFIGURATION ====================
redis_host = os.getenv('REDIS_HOST', 'redis')
redis_port = os.getenv('REDIS_PORT', 6379)
redis_password = os.getenv('REDIS_PASSWORD', '')

if redis_password:
    encoded_pwd = quote_plus(redis_password)
    redis_uri = f"redis://:{encoded_pwd}@{redis_host}:{redis_port}"
else:
    redis_uri = f"redis://{redis_host}:{redis_port}"

# Rate limiter configuration
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=redis_uri,
    strategy="fixed-window"
)

RATE_LIMITS = {
    'upload': os.getenv('RATE_LIMIT_UPLOAD', '10/minute'),     
    'download': os.getenv('RATE_LIMIT_DOWNLOAD', '30/minute'),  
    'workspace': os.getenv('RATE_LIMIT_WORKSPACE', '20/minute')
}

LOG_DIR = Path(os.getenv('LOG_DIR', '/tmp/Orion_project/logs'))
LOG_DIR.mkdir(parents=True, exist_ok=True)

# ==================== LOGGING ====================
logger = logging.getLogger("api_routes_core")
logger.setLevel(logging.INFO)

file_handler = RotatingFileHandler(
    LOG_DIR / "api_security.log",
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
api_router_core = APIRouter(prefix="/api")

# ==================== ENVIRONMENT VARIABLES ====================
SYNC_MONGODB_URI = os.environ.get("MONGODB_URI")
MONGODB_DATABASE = os.environ.get("MONGODB_DATABASE")

# ==================== GLOBAL STATE ====================
global_db_manager = None
global_args = None

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

# ==================== REQUEST MODELS ====================
class CreateProjectRequest(BaseModel):
    name: str
    type: str = "personal"

class CreateTopicRequest(BaseModel):
    name: str

class CreateWorkItemRequest(BaseModel):
    title: str
    type: str = "document"

class UpdateProjectRequest(BaseModel):
    name: Optional[str] = None
    is_expanded: Optional[bool] = None

class UpdateTopicRequest(BaseModel):
    name: Optional[str] = None
    is_expanded: Optional[bool] = None

class UpdateWorkItemRequest(BaseModel):
    title: Optional[str] = None
    last_modified: Optional[str] = None
    session_id: Optional[str] = None

class AddCollaboratorRequest(BaseModel):
    email: str
    role: str
    project_id: str

class UpdateCollaboratorRequest(BaseModel):
    role: Optional[str] = None
    status: Optional[str] = None

class CollaboratorResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    status: str
    added_at: str
    added_by: str

# ==================== HELPER FUNCTIONS ====================
async def check_free_plan_limits(
    db: DatabaseManager,
    user_id: str,
    action: str,
    project_id: str = None,
    topic_id: str = None
) -> dict:
    """Check if user on free plan can perform the action"""
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return {"allowed": False, "message": "User not found", "upgrade_required": False}
    
    plan = user.get("plan", "free")
    
    if plan != "free":
        return {"allowed": True, "message": "", "upgrade_required": False}
    
    if action == "create_project":
        personal_count = await db.project_lists.count_documents({
            "owner_id": user_id,
            "type": "personal"
        })
        if personal_count >= 2:
            return {
                "allowed": False,
                "message": "Free plan allows only 1 personal project. Upgrade to create more.",
                "upgrade_required": True
            }
    
    elif action == "create_group_project":
        return {
            "allowed": False,
            "message": "Team projects are a Pro feature. Upgrade to collaborate with teams.",
            "upgrade_required": True
        }
    
    elif action == "create_topic":
        project = await db.project_lists.find_one({"_id": ObjectId(project_id)})
        if project:
            topic_count = len(project.get("topics", []))
            if topic_count >= 2:
                return {
                    "allowed": False,
                    "message": "Free plan allows only 1 topic per project. Upgrade for unlimited topics.",
                    "upgrade_required": True
                }
    
    elif action == "create_work_item":
        project = await db.project_lists.find_one({"_id": ObjectId(project_id)})
        if project:
            topic = next((t for t in project.get("topics", []) if t["id"] == topic_id), None)
            if topic:
                work_items = topic.get("work_items", [])
                workspace_count = sum(1 for w in work_items if w.get("type") == "whiteboard")
                canvas_count = sum(1 for w in work_items if w.get("type") == "document")
                
                return {
                    "allowed": True,
                    "workspace_count": workspace_count,
                    "canvas_count": canvas_count,
                    "upgrade_required": False
                }
    
    return {"allowed": True, "message": "", "upgrade_required": False}

# ==================== PROJECT ENDPOINTS ====================
@api_router_core.get("/projects")
async def get_user_projects(
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Get all project lists for the current user"""
    try:
        user_id = current_user['id']
        project_lists = await db.get_user_project_lists(user_id)
        
        return {
            "success": True,
            "projects": [project.dict() for project in project_lists]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get projects: {str(e)}")

@api_router_core.post("/projects")
async def create_project(
    request: CreateProjectRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Create a new project list"""
    try:
        user_id = current_user['id']
        
        if request.type == "group":
            limit_check = await check_free_plan_limits(db, user_id, "create_group_project")
        else:
            limit_check = await check_free_plan_limits(db, user_id, "create_project")
        
        if not limit_check["allowed"]:
            raise HTTPException(
                status_code=403,
                detail={
                    "message": limit_check["message"],
                    "upgrade_required": limit_check["upgrade_required"],
                    "error_code": "FREE_PLAN_LIMIT"
                }
            )
        
        project = await db.create_project_list(
            user_id=user_id,
            name=request.name,
            type=request.type
        )
        
        return {
            "success": True,
            "project": project.dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create project: {str(e)}")

@api_router_core.put("/projects/{project_id}")
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Update a project list"""
    try:
        user_id = current_user['id']
        
        update_fields = {}
        if request.name is not None:
            update_fields["name"] = request.name
        if request.is_expanded is not None:
            update_fields["is_expanded"] = request.is_expanded
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        projectob_id = ObjectId(project_id)
        result = await db.project_lists.update_one(
            {
                "_id": projectob_id,
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            },
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
            
        return {"success": True, "message": "Project updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update project: {str(e)}")

@api_router_core.delete("/projects/{project_id}")
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Delete a project list"""
    try:
        user_id = current_user['id']
        project_object_id = ObjectId(project_id)
        result = await db.project_lists.delete_one({
            "_id": project_object_id,
            "owner_id": user_id
        })
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
            
        return {"success": True, "message": "Project deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete project: {str(e)}")

# ==================== COLLABORATOR ENDPOINTS ====================
@api_router_core.post("/projects/{project_id}/collaborators/add")
async def add_collaborator(
    project_id: str,
    request: AddCollaboratorRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Add a collaborator directly to a project"""
    try:
        user_id = current_user['id']
        
        project = await db.project_lists.find_one({
            "_id": ObjectId(project_id),
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": "admin"}
            ]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or insufficient permissions")
        
        target_user = await db.users.find_one({"email": request.email})
        if not target_user:
            raise HTTPException(status_code=404, detail="User with this email not found")
        
        target_user_id = str(target_user["_id"])
        
        is_in_permissions = "permissions" in project and target_user_id in project["permissions"]
        is_in_members = any(member.get("id") == target_user_id for member in project.get("members", []))
        
        if is_in_permissions or is_in_members:
            raise HTTPException(status_code=400, detail="User is already a collaborator on this project")
        
        if project.get("owner_id") == target_user_id:
            raise HTTPException(status_code=400, detail="Cannot add project owner as collaborator")
        
        new_member = {
            "id": target_user_id,
            "name": target_user.get("username", target_user.get("name", "Unknown")),
            "email": request.email,
            "avatar": target_user.get("avatar"),
            "status": "online",
            "role": request.role
        }
        
        await db.project_lists.update_one(
            {"_id": ObjectId(project_id)},
            {
                "$set": {f"permissions.{target_user_id}": request.role},
                "$push": {"members": new_member}
            }
        )
        
        try:
            collaboration_log = {
                "project_id": project_id,
                "user_id": target_user_id,
                "email": request.email,
                "role": request.role,
                "added_by": user_id,
                "added_at": datetime.utcnow(),
                "action": "added"
            }
            
            if hasattr(db, 'collaboration_logs'):
                await db.collaboration_logs.insert_one(collaboration_log)
            else:
                await db.db.collaboration_logs.insert_one(collaboration_log)
                
        except Exception as log_error:
            print(f"Warning: Failed to log collaboration addition: {str(log_error)}")
        
        return {
            "success": True,
            "message": "Collaborator added successfully",
            "collaborator": {
                "id": target_user_id,
                "email": target_user["email"],
                "username": target_user.get("username", ""),
                "name": target_user.get("name", target_user.get("username", "")),
                "avatar": target_user.get("avatar"),
                "role": request.role,
                "status": "active"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add collaborator: {str(e)}")

@api_router_core.get("/projects/{project_id}/collaborators")
async def get_project_collaborators(
    project_id: str,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Get all collaborators for a project"""
    try:
        user_id = current_user['id']
        
        project = await db.project_lists.find_one({
            "_id": ObjectId(project_id),
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        
        collaborators = []
        if "permissions" in project:
            for collab_user_id, role in project["permissions"].items():
                user_doc = await db.users.find_one({"_id": ObjectId(collab_user_id)})
                if user_doc:
                    collaborators.append({
                        "id": collab_user_id,
                        "email": user_doc["email"],
                        "username": user_doc.get("username", ""),
                        "role": role,
                        "status": "active"
                    })
        
        owner = None
        if project.get("owner_id"):
            owner_doc = await db.users.find_one({"_id": ObjectId(project["owner_id"])})
            if owner_doc:
                owner = {
                    "id": project["owner_id"],
                    "email": owner_doc["email"],
                    "username": owner_doc.get("username", ""),
                    "role": "owner",
                    "status": "active"
                }
        
        return {
            "success": True,
            "collaborators": collaborators,
            "owner": owner,
            "project_name": project["name"],
            "project_type": project["type"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get collaborators: {str(e)}")

@api_router_core.put("/projects/{project_id}/collaborators/{collaborator_id}")
async def update_collaborator_role(
    project_id: str,
    collaborator_id: str,
    request: UpdateCollaboratorRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Update a collaborator's role"""
    try:
        user_id = current_user['id']
        
        project = await db.project_lists.find_one({
            "_id": ObjectId(project_id),
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": "admin"}
            ]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or insufficient permissions")
        
        if "permissions" not in project or collaborator_id not in project["permissions"]:
            raise HTTPException(status_code=404, detail="Collaborator not found in this project")
        
        if project.get("owner_id") == collaborator_id:
            raise HTTPException(status_code=400, detail="Cannot update project owner role")
        
        if request.role:
            await db.project_lists.update_one(
                {"_id": ObjectId(project_id)},
                {"$set": {f"permissions.{collaborator_id}": request.role}}
            )
        
        return {
            "success": True,
            "message": "Collaborator role updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update collaborator: {str(e)}")

@api_router_core.delete("/projects/{project_id}/collaborators/{collaborator_id}")
async def remove_collaborator(
    project_id: str,
    collaborator_id: str,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Remove a collaborator from a project"""
    try:
        user_id = current_user['id']
        
        project = await db.project_lists.find_one({
            "_id": ObjectId(project_id),
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": "admin"}
            ]
        })
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or insufficient permissions")
        
        if project.get("owner_id") == collaborator_id:
            raise HTTPException(status_code=400, detail="Cannot remove project owner")
        
        if "permissions" not in project or collaborator_id not in project["permissions"]:
            raise HTTPException(status_code=404, detail="Collaborator not found in this project")
        
        await db.project_lists.update_one(
            {"_id": ObjectId(project_id)},
            {"$unset": {f"permissions.{collaborator_id}": ""}}
        )
        
        collaboration_log = {
            "project_id": project_id,
            "user_id": collaborator_id,
            "removed_by": user_id,
            "removed_at": datetime.utcnow(),
            "action": "removed"
        }
        await db.collaboration_logs.insert_one(collaboration_log)
        
        return {
            "success": True,
            "message": "Collaborator removed successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove collaborator: {str(e)}")

@api_router_core.get("/users/search")
async def search_users(
    query: str,
    limit: int = 10,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Search users by email or username for collaboration"""
    try:
        search_filter = {
            "$or": [
                {"email": {"$regex": query, "$options": "i"}},
                {"username": {"$regex": query, "$options": "i"}}
            ]
        }
        
        users = await db.users.find(
            search_filter,
            {"email": 1, "username": 1}
        ).limit(limit).to_list(length=None)
        
        user_list = []
        for user in users:
            if str(user["_id"]) != current_user["id"]:
                user_list.append({
                    "id": str(user["_id"]),
                    "email": user["email"],
                    "username": user.get("username", "")
                })
        
        return {
            "success": True,
            "users": user_list
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search users: {str(e)}")

# ==================== TOPIC ENDPOINTS ====================
@api_router_core.post("/projects/{project_id}/topics")
async def create_topic(
    project_id: str,
    request: CreateTopicRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Add a new topic to a project"""
    try:
        user_id = current_user['id']
        
        limit_check = await check_free_plan_limits(
            db, user_id, "create_topic", project_id=project_id
        )
        
        if not limit_check["allowed"]:
            raise HTTPException(
                status_code=403,
                detail={
                    "message": limit_check["message"],
                    "upgrade_required": limit_check["upgrade_required"],
                    "error_code": "FREE_PLAN_LIMIT"
                }
            )
        
        topic = await db.add_topic_to_project(
            project_id=project_id,
            user_id=user_id,
            topic_name=request.name
        )
        
        return {
            "success": True,
            "topic": topic.dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create topic: {str(e)}")

@api_router_core.put("/projects/{project_id}/topics/{topic_id}")
async def update_topic(
    project_id: str,
    topic_id: str,
    request: UpdateTopicRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Update a topic"""
    try:
        user_id = current_user['id']
        
        update_fields = {}
        if request.name is not None:
            update_fields["topics.$.name"] = request.name
        if request.is_expanded is not None:
            update_fields["topics.$.is_expanded"] = request.is_expanded
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        project_object_id = ObjectId(project_id)
        result = await db.project_lists.update_one(
            {
                "_id": project_object_id,
                "topics.id": topic_id,
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            },
            {"$set": update_fields}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project or topic not found")
            
        return {"success": True, "message": "Topic updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update topic: {str(e)}")

@api_router_core.delete("/projects/{project_id}/topics/{topic_id}")
async def delete_topic(
    project_id: str,
    topic_id: str,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_database)
):
    """Delete a topic"""
    try:
        user_id = current_user['id']
        project_object_id = ObjectId(project_id)
        result = await db.project_lists.update_one(
            {
                "_id": project_object_id,
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            },
            {"$pull": {"topics": {"id": topic_id}}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project or topic not found")
            
        return {"success": True, "message": "Topic deleted successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete topic: {str(e)}")

# ==================== WORK ITEM ENDPOINTS ====================
@api_router_core.post("/projects/{project_id}/topics/{topic_id}/items")
async def create_work_item(
    project_id: str,
    topic_id: str,
    request: CreateWorkItemRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    """Add a new work item to a topic"""
    try:
        user_id = current_user['id']
        
        try:
            ObjectId(project_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        limit_check = await check_free_plan_limits(
            db, user_id, "create_work_item", 
            project_id=project_id, 
            topic_id=topic_id
        )
        
        if limit_check.get("workspace_count") is not None:
            if request.type == "whiteboard" and limit_check["workspace_count"] >= 1:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": "Free plan allows only 1 workspace per topic. Upgrade for more.",
                        "upgrade_required": True,
                        "error_code": "FREE_PLAN_LIMIT"
                    }
                )
            
            if request.type == "document" and limit_check["canvas_count"] >= 1:
                raise HTTPException(
                    status_code=403,
                    detail={
                        "message": "Free plan allows only 1 canvas per topic. Upgrade for more.",
                        "upgrade_required": True,
                        "error_code": "FREE_PLAN_LIMIT"
                    }
                )
            
        work_item = await db.add_work_item_to_topic(
            project_id=project_id,
            topic_id=topic_id,
            user_id=user_id,
            title=request.title,
            type=request.type
        )
        
        return {
            "success": True,
            "work_item": work_item.dict()
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create work item: {str(e)}")

@api_router_core.put("/projects/{project_id}/topics/{topic_id}/items/{work_item_id}")
async def update_work_item(
    project_id: str,
    topic_id: str,
    work_item_id: str,
    request: UpdateWorkItemRequest,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    """Update a work item"""
    try:
        user_id = current_user['id']
        
        try:
            project_object_id = ObjectId(project_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        update_fields = {}
        if request.title is not None:
            update_fields["topics.$[topic].work_items.$[item].title"] = request.title
        if request.last_modified is not None:
            update_fields["topics.$[topic].work_items.$[item].last_modified"] = request.last_modified
        if request.session_id is not None:
            update_fields["topics.$[topic].work_items.$[item].session_id"] = request.session_id
            
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = await db.project_lists.update_one(
            {
                "_id": project_object_id,
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            },
            {"$set": update_fields},
            array_filters=[
                {"topic.id": topic_id},
                {"item.id": work_item_id}
            ]
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project, topic, or work item not found")
            
        return {"success": True, "message": "Work item updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update work item: {str(e)}")

@api_router_core.delete("/projects/{project_id}/topics/{topic_id}/items/{work_item_id}")
async def delete_work_item(
    project_id: str,
    topic_id: str,
    work_item_id: str,
    current_user: dict = Depends(get_current_user),
    db: DatabaseManager = Depends(get_db_manager)
):
    """Delete a work item"""
    try:
        user_id = current_user['id']
        
        try:
            project_object_id = ObjectId(project_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid project ID format")
        
        result = await db.project_lists.update_one(
            {
                "_id": project_object_id,
                "topics.id": topic_id,
                "$or": [
                    {"owner_id": user_id},
                    {f"permissions.{user_id}": {"$exists": True}}
                ]
            },
            {"$pull": {"topics.$.work_items": {"id": work_item_id}}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Project, topic, or work item not found")
            
        return {"success": True, "message": "Work item deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete work item: {str(e)}")
    
