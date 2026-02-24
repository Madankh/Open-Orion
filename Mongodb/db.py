"""
Core Database Manager
Handles all basic database operations for sessions, events, users, projects, and notepad blocks
"""

from typing import Optional, List, Dict, Any, Tuple
import uuid
import json
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from bson import ObjectId
from bson.errors import InvalidId
from pymongo import DESCENDING, ASCENDING, UpdateOne
from pymongo.asynchronous.mongo_client import AsyncMongoClient
from dotenv import load_dotenv

from Mongodb.helper import (
    Session, Event, WorkItem, Topic, TeamMember,
    ProjectList, WorkspaceSession
)
from Mongodb.operation import NotepadCanvasOperations

load_dotenv()
logger = logging.getLogger(__name__)


class DateTimeEncoder(json.JSONEncoder):
    """Custom JSON encoder to handle datetime objects"""
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def serialize_datetime_objects(obj):
    """Recursively convert datetime objects to ISO strings"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {key: serialize_datetime_objects(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [serialize_datetime_objects(item) for item in obj]
    return obj


class DatabaseManager(NotepadCanvasOperations):
    """
    Unified database manager.
    Inherits canvas/notepad operations from NotepadCanvasOperations
    and adds session, event, user, and project management.
    """

    def __init__(self, client: AsyncMongoClient, db_name: str = "Curiositylab"):
        # NotepadCanvasOperations.__init__ sets up self.client, self.db,
        # and all canvas-related collections
        super().__init__(client, db_name)

        # Core collections (not in NotepadCanvasOperations)
        self.sessions = self.db.sessions
        self.events = self.db.events
        self.users = self.db.users
        self.workspaces = self.db.workspaces
        self.files = self.db.files
        self.project_lists = self.db.project_lists
        self.project_invites = self.db.project_invites
        self.collaboration_logs = self.db.collaboration_logs

        # Time-based collections
        self.daily_nodes = self.db.daily_nodes
        self.weekly_nodes = self.db.weekly_nodes
        self.monthly_nodes = self.db.monthly_nodes

        self._indexes_created = False

    async def _ensure_indexes(self):
        """Create all database indexes (core + canvas)."""
        if self._indexes_created:
            return

        try:
            # Session indexes
            await self.sessions.create_index("user_id")
            await self.sessions.create_index("session_uuid", unique=True)
            await self.sessions.create_index("workspace_dir", unique=True)
            await self.sessions.create_index([("user_id", 1), ("created_at", -1)])
            await self.sessions.create_index("device_id")

            # Event indexes
            await self.events.create_index("user_id")
            await self.events.create_index("session_id")
            await self.events.create_index([("session_id", 1), ("timestamp", 1)])
            await self.events.create_index([("user_id", 1), ("timestamp", -1)])
            await self.events.create_index([("user_id", 1), ("event_type", 1)])

            # Notepad blocks indexes
            await self.notepad_blocks.create_index("session_id")
            await self.notepad_blocks.create_index("user_id")
            await self.notepad_blocks.create_index([("session_id", 1), ("user_id", 1)])
            await self.notepad_blocks.create_index([("user_id", 1), ("updated_at", -1), ("last_accessed", -1)])

            # Workspace indexes
            await self.workspaces.create_index("workspace_id")
            await self.workspaces.create_index("userid")
            await self.workspaces.create_index([("workspace_id", 1), ("userid", 1)])
            await self.workspaces.create_index([("userid", 1), ("updated_at", -1)])

            # Files indexes
            await self.files.create_index("workspace_id")
            await self.files.create_index("userid")
            await self.files.create_index([("workspace_id", 1), ("userid", 1), ("file_path", 1)])
            await self.files.create_index([("userid", 1), ("updated_at", -1)])

            # Project list indexes
            await self.project_lists.create_index("owner_id")
            await self.project_lists.create_index("type")
            await self.project_lists.create_index([("owner_id", 1), ("created_at", -1)])
            await self.project_lists.create_index("permissions.user_id")

            # Time-based indexes
            await self.daily_nodes.create_index([("date", DESCENDING)])
            await self.daily_nodes.create_index([("goals", ASCENDING)])
            await self.daily_nodes.create_index([("created_at", DESCENDING)])
            await self.weekly_nodes.create_index([("week_start", DESCENDING)])
            await self.weekly_nodes.create_index([("week_end", DESCENDING)])
            await self.monthly_nodes.create_index([("month", DESCENDING)])
            await self.monthly_nodes.create_index([("year", DESCENDING)])

            # Also create canvas indexes from parent
            await self._ensure_canvas_collections()

            self._indexes_created = True
            print("[INFO] Database indexes created successfully")
        except Exception as e:
            print(f"[WARNING] Failed to create some indexes: {e}")

    # ============================================================================
    # SESSION MANAGEMENT
    # ============================================================================

    async def create_session_safe(
        self,
        session_uuid: uuid.UUID,
        user_id: str,
        workspace_path: Path,
        device_id: Optional[str] = None,
    ) -> Tuple[uuid.UUID, Path]:
        """Create a new session safely, handling duplicates."""
        await self._ensure_indexes()

        session_str = str(session_uuid)

        existing_session = await self.sessions.find_one({"session_uuid": session_str})
        if existing_session:
            await self.sessions.update_one(
                {"session_uuid": session_str},
                {
                    "$set": {
                        "last_accessed": datetime.utcnow(),
                        "workspace_dir": str(workspace_path)
                    }
                }
            )
            print(f"Updated existing WebSocket session {session_str}")
            return session_uuid, workspace_path

        session = Session(
            session_uuid=session_str,
            user_id=user_id,
            workspace_dir=str(workspace_path),
            device_id=device_id
        )

        try:
            await self.sessions.insert_one(session.model_dump(by_alias=True))
            print(f"Created new WebSocket session {session_str}")
            return session_uuid, workspace_path
        except Exception as e:
            if "E11000" in str(e) and "session_uuid" in str(e):
                await self.sessions.update_one(
                    {"session_uuid": session_str},
                    {
                        "$set": {
                            "last_accessed": datetime.utcnow(),
                            "workspace_dir": str(workspace_path)
                        }
                    }
                )
                print(f"Handled race condition for session {session_str}")
                return session_uuid, workspace_path
            else:
                raise e

    async def get_session_by_id(
        self,
        session_id: uuid.UUID,
        user_id: Optional[str] = None
    ) -> Optional[Session]:
        """Get a session by its UUID"""
        try:
            session_id_str = str(session_id)

            queries_to_try = [
                {"workspace_id": session_id_str},
                {"session_uuid": session_id_str},
            ]

            for base_query in queries_to_try:
                if user_id:
                    base_query["userid"] = user_id

                doc = await self.workspaces.find_one(base_query)
                if doc:
                    session_data = {
                        "session_uuid": doc.get("workspace_id", doc.get("session_uuid")),
                        "user_id": doc.get("userid", doc.get("user_id")),
                        "workspace_dir": doc.get("root_path", doc.get("workspace_dir")),
                        "device_id": doc.get("device_id"),
                        "created_at": doc.get("created_at"),
                        "last_accessed": doc.get("last_activity", doc.get("updated_at"))
                    }
                    return Session(**session_data)

            return None
        except Exception as e:
            logger.error(f"Error in get_session_by_id: {str(e)}")
            return None

    async def update_session(self, session_uuid: uuid.UUID, updates: Dict[str, Any]) -> bool:
        """Update an existing session with new fields."""
        if "last_accessed" not in updates:
            updates["last_accessed"] = datetime.utcnow()

        result = await self.sessions.update_one(
            {"session_uuid": str(session_uuid)},
            {"$set": updates}
        )
        return result.modified_count > 0

    async def get_session_by_workspace(
        self,
        workspace_dir: str,
        user_id: Optional[str] = None
    ) -> Optional[Session]:
        """Get a session by its workspace directory."""
        query = {"workspace_dir": workspace_dir}
        if user_id:
            query["user_id"] = user_id

        doc = await self.sessions.find_one(query)
        return Session(**doc) if doc else None

    async def get_session_by_device_id(
        self,
        device_id: str,
        user_id: Optional[str] = None
    ) -> Optional[Session]:
        """Get a session by its device ID."""
        query = {"device_id": device_id}
        if user_id:
            query["user_id"] = user_id

        doc = await self.sessions.find_one(query)
        return Session(**doc) if doc else None

    async def get_user_sessions(
        self,
        user_id: str,
        limit: Optional[int] = None
    ) -> List[Session]:
        """Get all sessions for a user."""
        cursor = self.sessions.find({"user_id": user_id}).sort("created_at", DESCENDING)
        if limit:
            cursor = cursor.limit(limit)

        documents = await cursor.to_list(length=None)
        return [Session(**doc) for doc in documents]

    async def delete_user_session(self, session_id: uuid.UUID, user_id: str) -> bool:
        """Delete a session owned by a specific user."""
        session_result = await self.sessions.delete_one({
            "session_uuid": str(session_id),
            "user_id": user_id
        })

        if session_result.deleted_count > 0:
            await self.events.delete_many({
                "session_id": str(session_id),
                "user_id": user_id
            })
            return True

        return False

    async def cleanup_old_sessions(self, user_id: str, keep_count: int = 10) -> int:
        """Keep only the N most recent sessions for a user, delete the rest."""
        cursor = self.sessions.find({"user_id": user_id}).sort("created_at", DESCENDING).limit(keep_count)
        sessions_to_keep = await cursor.to_list(length=None)

        if len(sessions_to_keep) < keep_count:
            return 0

        keep_uuids = [session["session_uuid"] for session in sessions_to_keep]

        delete_result = await self.sessions.delete_many({
            "user_id": user_id,
            "session_uuid": {"$nin": keep_uuids}
        })

        await self.events.delete_many({
            "user_id": user_id,
            "session_id": {"$nin": keep_uuids}
        })

        return delete_result.deleted_count

    async def session_exists_in_sessions_collection(
        self,
        session_id: str,
        user_id: Optional[str] = None
    ) -> bool:
        """Check if a session exists in the sessions collection"""
        try:
            query = {"session_uuid": str(session_id)}
            if user_id:
                query["user_id"] = user_id
            session = await self.sessions.find_one(query)
            return session is not None
        except Exception as e:
            logger.error(f"Error checking session existence: {str(e)}")
            return False

    # ============================================================================
    # EVENT MANAGEMENT
    # ============================================================================

    async def save_event(
        self,
        session_id: uuid.UUID,
        user_id: str,
        event
    ) -> str:
        """Save an event to the database."""
        await self._ensure_indexes()

        db_event = Event(
            session_id=str(session_id),
            user_id=user_id,
            created_by=user_id,
            event_type=event.type.value,
            event_payload=event.model_dump(),
        )

        result = await self.events.insert_one(db_event.model_dump(by_alias=True))
        return db_event.event_uuid

    async def get_session_events(
        self,
        session_id: uuid.UUID,
        user_id: Optional[str] = None,
        limit: int = 50,
        before_timestamp: Optional[float] = None
    ) -> List[Event]:
        """Get paginated events for a session."""
        query = {"session_id": str(session_id)}
        if user_id:
            query["user_id"] = user_id

        if before_timestamp is not None:
            dt_object = datetime.fromtimestamp(before_timestamp, tz=timezone.utc)
            query["timestamp"] = {"$lt": dt_object}

        cursor = self.events.find(query).sort("timestamp", -1).limit(limit)
        documents = await cursor.to_list(length=limit)
        return [Event(**doc) for doc in documents]

    async def get_user_events(
        self,
        user_id: str,
        event_type: Optional[str] = None,
        limit: Optional[int] = None
    ) -> List[Event]:
        """Get events for a user, optionally filtered by event type."""
        query = {"user_id": user_id}
        if event_type:
            query["event_type"] = event_type

        cursor = self.events.find(query).sort("timestamp", DESCENDING)
        if limit:
            cursor = cursor.limit(limit)

        documents = await cursor.to_list(length=None)
        return [Event(**doc) for doc in documents]

    # ============================================================================
    # USER MANAGEMENT
    # ============================================================================

    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a user by their ID."""
        try:
            object_id = ObjectId(user_id)
            user = await self.users.find_one({"_id": object_id})
            return user
        except Exception as e:
            logger.error(f"Failed to get user {user_id}: {e}")
            return None

    async def update_user_token(self, user_id: str, new_token: int) -> bool:
        """Update user's token limit."""
        try:
            object_id = ObjectId(user_id)
            result = await self.users.update_one(
                {'_id': object_id},
                {"$set": {"token_limit": new_token}}
            )
            return result.matched_count > 0
        except Exception as e:
            logger.error(f"Failed to update user token {user_id}: {e}")
            return False

    async def get_user_stats(self, user_id: str) -> dict:
        """Get statistics for a user."""
        session_count = await self.sessions.count_documents({"user_id": user_id})
        event_count = await self.events.count_documents({"user_id": user_id})

        pipeline = [
            {"$match": {"user_id": user_id}},
            {"$group": {"_id": "$event_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]

        event_types_cursor = self.events.aggregate(pipeline)
        event_types = await event_types_cursor.to_list(length=None)

        return {
            "session_count": session_count,
            "event_count": event_count,
            "event_type_distribution": {item["_id"]: item["count"] for item in event_types}
        }

    # ============================================================================
    # PROJECT & WORKSPACE MANAGEMENT
    # ============================================================================

    async def create_project_list(
        self,
        user_id: str,
        name: str,
        type: str = "personal"
    ) -> ProjectList:
        """Create a new project list"""
        project_list = ProjectList(
            name=name,
            type=type,
            owner_id=user_id
        )

        if type == "group":
            owner_info = await self.get_user_by_id(user_id)
            member = TeamMember(
                id=user_id,
                name=owner_info.get('name', 'Unknown'),
                status="online",
                role="owner"
            )
            project_list.members.append(member)
            project_list.permissions[user_id] = "owner"

        result = await self.project_lists.insert_one(project_list.dict())
        project_list.id = str(result.inserted_id)
        return project_list

    async def get_user_project_lists(self, user_id: str) -> List[ProjectList]:
        """Get all project lists for a user"""
        query = {
            "$or": [
                {"owner_id": user_id},
                {f"permissions.{user_id}": {"$exists": True}}
            ]
        }

        cursor = self.project_lists.find(query)
        project_lists = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            project_lists.append(ProjectList(**doc))

        return project_lists

    async def add_topic_to_project(
        self,
        project_id: str,
        user_id: str,
        topic_name: str
    ) -> Topic:
        """Add a new topic to a project list"""
        topic = Topic(name=topic_name, created_by=user_id)

        try:
            project_object_id = ObjectId(project_id)
        except InvalidId:
            raise ValueError("Invalid project ID format")

        result = await self.project_lists.update_one(
            {"_id": project_object_id},
            {"$push": {"topics": topic.dict()}}
        )

        if result.matched_count == 0:
            raise ValueError("Project list not found")

        return topic

    async def add_work_item_to_topic(
        self,
        project_id: str,
        topic_id: str,
        user_id: str,
        title: str,
        type: str = "document",
        session_id: Optional[str] = None
    ) -> WorkItem:
        """Add a new work item to a topic"""
        work_item = WorkItem(
            title=title,
            type=type,
            created_by=user_id,
            session_id=session_id or str(uuid.uuid4())
        )

        try:
            project_object_id = ObjectId(project_id)
        except InvalidId:
            raise ValueError("Invalid project ID format")

        result = await self.project_lists.update_one(
            {"_id": project_object_id, "topics.id": topic_id},
            {"$push": {"topics.$.work_items": work_item.dict()}}
        )

        if result.matched_count == 0:
            raise ValueError("Project or topic not found")

        return work_item

    async def create_workspace_session(
        self,
        session_id: str,
        user_id: str,
        project_list_id: str,
        topic_id: str,
        work_item_id: str
    ) -> WorkspaceSession:
        """Create or update a workspace session"""
        session = WorkspaceSession(
            session_id=session_id,
            user_id=user_id,
            project_list_id=project_list_id,
            topic_id=topic_id,
            work_item_id=work_item_id
        )

        await self.workspaces.replace_one(
            {"session_id": session_id},
            session.dict(),
            upsert=True
        )

        return session

    async def update_session_access(self, session_id: str):
        """Update last accessed time for a session"""
        await self.workspaces.update_one(
            {"session_id": session_id},
            {"$set": {"last_accessed": datetime.utcnow()}}
        )

    async def get_work_item_session(self, session_id: str) -> Optional[WorkspaceSession]:
        """Get workspace session by session ID"""
        doc = await self.workspaces.find_one({"session_id": session_id})
        return WorkspaceSession(**doc) if doc else None

    async def get_work_item_by_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get work item details by session ID"""
        try:
            session_str = str(session_id)

            pipeline = [
                {"$unwind": "$topics"},
                {"$unwind": "$topics.work_items"},
                {"$match": {"topics.work_items.session_id": session_str}},
                {"$project": {
                    "work_item": "$topics.work_items",
                    "topic": "$topics",
                    "project_id": "$_id",
                    "project_name": "$name",
                    "project_type": "$type",
                    "owner_id": "$owner_id"
                }}
            ]

            cursor = self.project_lists.aggregate(pipeline)
            result = await cursor.to_list(length=1)

            if result:
                return {
                    "work_item": result[0]["work_item"],
                    "topic": result[0]["topic"],
                    "project": {
                        "_id": result[0]["project_id"],
                        "name": result[0]["project_name"],
                        "type": result[0]["project_type"],
                        "owner_id": result[0]["owner_id"]
                    }
                }

            return None
        except Exception as e:
            logger.error(f"Error in get_work_item_by_session: {str(e)}")
            return None

    # ============================================================================
    # UTILITY METHODS
    # ============================================================================

    async def close(self):
        """Close the database connection."""
        self.client.close()

    async def __aenter__(self):
        """Async context manager entry."""
        await self._ensure_indexes()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()

    async def create_invite_indexes(self):
        """Create indexes for project invites collection"""
        try:
            await self.project_invites.create_index([
                ("project_id", 1),
                ("email", 1)
            ], unique=True)
            await self.project_invites.create_index([
                ("expires_at", 1)
            ], expireAfterSeconds=0)
        except Exception as e:
            logger.error(f"Failed to create invite indexes: {e}")