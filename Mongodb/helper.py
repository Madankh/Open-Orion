from datetime import datetime
from typing import Optional, Dict, Any, Annotated
from pydantic import BaseModel, Field, ConfigDict, field_validator
from pydantic_core import core_schema
from pydantic import GetCoreSchemaHandler
from bson import ObjectId
import uuid


class PyObjectId(ObjectId):
    """Custom ObjectId class for Pydantic v2 compatibility."""
    
    @classmethod
    def __get_pydantic_core_schema__(
        cls, source_type: Any, handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        return core_schema.with_info_plain_validator_function(
            cls.validate,
            serialization=core_schema.to_string_ser_schema(),
        )
    
    @classmethod
    def validate(cls, v: Any, info=None) -> 'PyObjectId':
        if isinstance(v, ObjectId):
            return cls(v)
        if isinstance(v, str):
            if not ObjectId.is_valid(v):
                raise ValueError("Invalid ObjectId")
            return cls(v)
        raise ValueError("Invalid ObjectId type")


class Session(BaseModel):
    """MongoDB model for agent sessions."""
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
    
    id: Annotated[PyObjectId, Field(alias="_id")] = Field(default_factory=PyObjectId)
    session_uuid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    workspace_dir: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    device_id: Optional[str] = None

    def model_dump(self, **kwargs):
        """Override to handle ObjectId serialization."""
        data = super().model_dump(**kwargs)
        if 'id' in data:
            data['id'] = str(data['id'])
        return data


class Event(BaseModel):
    """MongoDB model for agent events."""
    
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
    )
    
    id: Annotated[PyObjectId, Field(alias="_id")] = Field(default_factory=PyObjectId)
    event_uuid: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str  # Reference to session_uuid
    user_id: str
    created_by: Optional[str] = ''
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    event_type: str
    event_payload: Dict[str, Any]

    def model_dump(self, **kwargs):
        """Override to handle ObjectId serialization."""
        data = super().model_dump(**kwargs)
        if 'id' in data:
            data['id'] = str(data['id'])
        return data
    
from typing import Optional, List, Dict, Any
import uuid
import json
from dotenv import load_dotenv
import logging
from datetime import datetime
from pydantic import BaseModel, Field
load_dotenv()
logger = logging.getLogger(__name__)

class WorkItem(BaseModel):
    """Work item schema matching your frontend structure"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    last_modified: datetime = Field(default_factory=datetime.utcnow)
    type: str = Field(default="document")  # 'document', 'note', 'whiteboard'
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    content: Optional[Dict[str, Any]] = None
    blocks: List[Dict[str, Any]] = []

class Topic(BaseModel):
    """Topic schema containing work items"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    work_items: List[WorkItem] = []
    is_expanded: bool = False
    color: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str

class TeamMember(BaseModel):
    """Team member schema"""
    id: str
    name: str
    avatar: Optional[str] = None
    status: str = Field(default="offline")
    role: str = Field(default="member")

class ProjectList(BaseModel):
    """Main project list schema"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # 'personal' or 'group'
    owner_id: str
    members: List[TeamMember] = []
    topics: List[Topic] = []
    is_expanded: bool = False
    icon: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    permissions: Dict[str, str] = {}

class WorkspaceSession(BaseModel):
    """Track active workspace sessions"""
    session_id: str
    user_id: str
    project_list_id: str
    topic_id: str
    work_item_id: str
    workspace_path: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_accessed: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True

class DateTimeEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle datetime objects"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)

class CanvasNode(BaseModel):
    """Canvas node schema"""
    node_id: str
    canvas_id: str
    session_id: str
    user_id: str
    type: str 
    position: Dict[str, float]  # {x: 100, y: 200}
    content: str
    title: str
    parent_id: Optional[str] = None
    child_ids: List[str] = []
    level: int
    color: str
    is_expanded: bool = True
    is_running: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    last_modified: datetime = Field(default_factory=datetime.utcnow)
    last_modified_by: str
    branch_id: str = "main"
    # Media-specific fields
    file_type: Optional[str] = None
    file_name: Optional[str] = None
    media_url: Optional[str] = None

class CanvasConnection(BaseModel):
    """Canvas connection schema"""
    connection_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    canvas_id: str
    session_id: str
    from_node: str
    to_node: str
    from_point: str  # 'top', 'right', 'bottom', 'left'
    to_point: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str
    branch_id: str = "main"

class CanvasBranch(BaseModel):
    """Canvas branch for conflict resolution"""
    branch_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    canvas_id: str
    session_id: str
    parent_branch_id: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    merge_status: str = "active"  # 'active', 'merged', 'abandoned'
    description: Optional[str] = None

class CanvasEvent(BaseModel):
    """Canvas-specific event for history tracking"""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    canvas_id: str
    session_id: str
    user_id: str
    event_type: str  # 'node_created', 'node_updated', 'connection_created', etc.
    node_id: Optional[str] = None
    connection_id: Optional[str] = None
    branch_id: str = "main"
    event_data: Dict[str, Any]  # The actual change data
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    parent_event_id: Optional[str] = None  # For event chains
    conflicts_with: List[str] = []  # Conflicting events
