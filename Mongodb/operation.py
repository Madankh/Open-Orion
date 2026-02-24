"""
Notepad Blocks and Canvas Operations
Handles all notepad block operations and canvas-specific functionality
"""

from typing import Optional, List, Dict, Any
import uuid
import logging
from datetime import datetime, timedelta
from pymongo import UpdateOne
from pymongo.asynchronous.mongo_client import AsyncMongoClient

logger = logging.getLogger(__name__)


def serialize_datetime_objects(obj):
    """Recursively convert datetime objects to ISO strings"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, dict):
        return {key: serialize_datetime_objects(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [serialize_datetime_objects(item) for item in obj]
    return obj


class NotepadCanvasOperations:
    """Operations for notepad blocks and canvas functionality"""
    
    def __init__(self, client: AsyncMongoClient, db_name: str = "Curiositylab"):
        self.client = client
        self.db = self.client[db_name]
        
        # Collections
        self.notepad_blocks = self.db.notepad_blocks
        self.project_lists = self.db.project_lists
        
        # Canvas collections
        self.canvas_states = self.db.canvas_states
        self.canvas_files = self.db.canvas_files
        self.canvas_nodes = self.db.canvas_nodes
        self.canvas_branches = self.db.canvas_branches
        self.canvas_connections = self.db.canvas_connections
        self.canvas_events = self.db.canvas_events
        self.user_presence = self.db.user_presence
        self.canvas_backups = self.db.canvas_backups
        
        self._canvas_indexes_created = False

    async def _ensure_canvas_collections(self):
        """Ensure all canvas-related collections exist with proper indexes"""
        if self._canvas_indexes_created:
            return
        
        # Canvas States Collection
        await self.canvas_states.create_index([
            ("canvas_id", 1),
            ("branch_id", 1),
            ("session_id", 1)
        ], unique=True)
        await self.canvas_states.create_index([("canvas_id", 1), ("saved_at", -1)])
        await self.canvas_states.create_index([("user_id", 1), ("saved_at", -1)])
        
        # Canvas Events Collection
        await self.canvas_events.create_index([("canvas_id", 1), ("timestamp", -1)])
        await self.canvas_events.create_index([("canvas_id", 1), ("branch_id", 1), ("timestamp", -1)])
        await self.canvas_events.create_index([("user_id", 1), ("timestamp", -1)])
        await self.canvas_events.create_index([("event_type", 1), ("timestamp", -1)])
        
        # Canvas Connections Collection
        await self.canvas_connections.create_index([
            ("canvas_id", 1),
            ("connection_id", 1),
            ("branch_id", 1)
        ], unique=True)
        await self.canvas_connections.create_index([("canvas_id", 1), ("branch_id", 1)])
        await self.canvas_connections.create_index([("from_node", 1)])
        await self.canvas_connections.create_index([("to_node", 1)])
        
        # Canvas Files Collection
        await self.canvas_files.create_index([
            ("canvas_id", 1),
            ("file_id", 1),
            ("branch_id", 1)
        ], unique=True)
        await self.canvas_files.create_index([("canvas_id", 1), ("branch_id", 1), ("uploaded_at", -1)])
        await self.canvas_files.create_index([("user_id", 1), ("uploaded_at", -1)])
        await self.canvas_files.create_index([("file_type", 1)])
        
        # User Presence Collection
        await self.user_presence.create_index([("canvas_id", 1), ("user_id", 1)], unique=True)
        await self.user_presence.create_index([("canvas_id", 1), ("last_seen", -1)])
        await self.user_presence.create_index([("last_seen", 1)], expireAfterSeconds=900)
        
        # Canvas Backups Collection
        await self.canvas_backups.create_index([("backup_id", 1)], unique=True)
        await self.canvas_backups.create_index([("canvas_id", 1), ("created_at", -1)])
        await self.canvas_backups.create_index([("created_by", 1), ("created_at", -1)])
        
        # Canvas Nodes Collection
        await self.canvas_nodes.create_index([("canvas_id", 1), ("branch_id", 1), ("level", 1)])
        await self.canvas_nodes.create_index([("parent_id", 1)])
        await self.canvas_nodes.create_index([("node_type", 1)])
        await self.canvas_nodes.create_index([("last_modified", -1)])
        
        # Canvas Branches Collection
        await self.canvas_branches.create_index([("parent_branch_id", 1)])
        await self.canvas_branches.create_index([("merge_status", 1)])
        await self.canvas_branches.create_index([("created_by", 1), ("created_at", -1)])
        
        self._canvas_indexes_created = True

    # ============================================================================
    # NOTEPAD BLOCK OPERATIONS
    # ============================================================================

    async def save_notepad_blocks(
        self,
        session_id: str,
        blocks: List[Dict[str, Any]],
        user_id: str,
        timestamp: int
    ) -> Dict[str, Any]:
        """Save notepad blocks to MongoDB with support for all block types"""
        try:
            # Process each block
            processed_blocks = []
            for block in blocks:
                processed_block = await self._process_block_for_storage(
                    block, session_id, user_id
                )
                processed_blocks.append(processed_block)
            
            # Create the document to save
            notepad_document = {
                "session_id": session_id,
                "user_id": user_id,
                "blocks": processed_blocks,
                "timestamp": timestamp,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
                "version": 1
            }
            
            # Use replace_one with upsert
            result = await self.notepad_blocks.replace_one(
                {"session_id": session_id},
                notepad_document,
                upsert=True
            )
            
            return {
                "success": True,
                "session_id": session_id,
                "blocks_count": len(processed_blocks),
                "operation": "updated" if result.matched_count > 0 else "created"
            }
        except Exception as e:
            logger.error(f"Error saving notepad blocks: {str(e)}")
            return {"success": False, "error": str(e)}

    async def _process_block_for_storage(
        self,
        block: Dict[str, Any],
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Process individual blocks based on their type for storage"""
        block_type = block.get("type", "text")
        block_id = block.get("id")
        
        # Base block structure
        processed_block = {
            "id": block_id,
            "type": block_type,
            "created_at": datetime.utcnow(),
            "session_id": session_id,
            "user_id": user_id
        }
        
        # Handle different block types
        if block_type == "text":
            processed_block.update({
                "content": block.get("content", ""),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "heading":
            processed_block.update({
                "content": block.get("content", ""),
                "level": block.get("level", 1),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "table":
            processed_block.update({
                "data": block.get("data", []),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "code":
            processed_block.update({
                "content": block.get("content", ""),
                "language": block.get("language", "javascript"),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "latex":
            processed_block.update({
                "content": block.get("content", ""),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "quote":
            processed_block.update({
                "content": block.get("content", ""),
                "author": block.get("author"),
                "aiContext": block.get("aiContext")
            })
        elif block_type in ["numbered-list", "bullet"]:
            processed_block.update({
                "content": block.get("content", ""),
                "items": block.get("items", []),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "details":
            processed_block.update({
                "title": block.get("title", ""),
                "content": block.get("content", ""),
                "isOpen": block.get("isOpen", False),
                "aiContext": block.get("aiContext")
            })
        elif block_type == "image":
            processed_block.update(await self._handle_image_block(block, session_id, user_id))
        elif block_type == "video":
            processed_block.update(await self._handle_video_block(block, session_id, user_id))
        elif block_type == "audio":
            processed_block.update(await self._handle_audio_block(block, session_id, user_id))
        elif block_type == "youtube":
            processed_block.update({
                "videoId": block.get("videoId", ""),
                "url": block.get("url", ""),
                "title": block.get("title"),
                "timestamps": block.get("timestamps")
            })
        elif block_type == "document":
            processed_block.update(await self._handle_pdf_block(block, session_id, user_id))
        else:
            # Unknown block type, store as-is
            processed_block.update({"raw_data": block})
        
        return processed_block

    async def load_notepad_blocks_paginated(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 15
    ) -> Dict[str, Any]:
        """
        Load notepad blocks with pagination support
        """
        try:
            await self._ensure_indexes()
            
            # Build query
            query = {"session_id": session_id}
            if user_id:
                query["user_id"] = user_id
            
            # Find the document
            document = await self.notepad_blocks.find_one(query)
            
            if not document:
                return {
                    "success": False,
                    "error": "Session not found"
                }
            
            all_blocks = document.get("blocks", [])  # or work_item.get("blocks", [])
            total_blocks = len(all_blocks)
            
            # Calculate descending pagination (latest blocks first)
            start_idx = max(total_blocks - page * page_size, 0)
            end_idx = total_blocks - (page - 1) * page_size
            
            # Validate page
            if start_idx >= end_idx and total_blocks > 0:
                return {
                    "success": False,
                    "error": f"Page {page} out of range. Total pages: {(total_blocks + page_size - 1) // page_size}"
                }
            
            blocks_slice = all_blocks[start_idx:end_idx]
            
            
            # Process blocks for frontend
            processed_blocks = []
            for block in blocks_slice:
                processed_block = await self._process_block_for_frontend(block)
                processed_blocks.append(processed_block)
            
            return {
                "success": True,
                "session_id": session_id,
                "blocks": processed_blocks,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_blocks": total_blocks,
                    "total_pages": (total_blocks + page_size - 1) // page_size,
                    "has_next": end_idx < total_blocks,
                    "has_prev": page > 1
                },
                "timestamp": document.get("timestamp"),
                "created_at": document.get("created_at"),
                "updated_at": document.get("updated_at")
            }
            
        except Exception as e:
            logger.error(f"Error loading paginated notepad blocks: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    
    async def load_notepad_blocks(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 1000
    ) -> Dict[str, Any]:
        """
        Load notepad blocks with pagination support
        """
        try:
            await self._ensure_indexes()
            
            # Build query
            query = {"session_id": session_id}
            if user_id:
                query["user_id"] = user_id
            
            # Find the document
            document = await self.notepad_blocks.find_one(query)
            
            if not document:
                return {
                    "success": False,
                    "error": "Session not found"
                }
            
            all_blocks = document.get("blocks", [])  # or work_item.get("blocks", [])
            total_blocks = len(all_blocks)
            
            # Calculate descending pagination (latest blocks first)
            start_idx = max(total_blocks - page * page_size, 0)
            end_idx = total_blocks - (page - 1) * page_size
            
            # Validate page
            if start_idx >= end_idx and total_blocks > 0:
                return {
                    "success": False,
                    "error": f"Page {page} out of range. Total pages: {(total_blocks + page_size - 1) // page_size}"
                }
            
            blocks_slice = all_blocks[start_idx:end_idx]
            
            
            # Process blocks for frontend
            processed_blocks = []
            for block in blocks_slice:
                processed_block = await self._process_block_for_frontend(block)
                processed_blocks.append(processed_block)
            
            return {
                "success": True,
                "session_id": session_id,
                "blocks": processed_blocks,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_blocks": total_blocks,
                    "total_pages": (total_blocks + page_size - 1) // page_size,
                    "has_next": end_idx < total_blocks,
                    "has_prev": page > 1
                },
                "timestamp": document.get("timestamp"),
                "created_at": document.get("created_at"),
                "updated_at": document.get("updated_at")
            }
            
        except Exception as e:
            logger.error(f"Error loading paginated notepad blocks: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    


    async def get_work_item_blocks_paginated(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 30
    ) -> Dict[str, Any]:
        """
        Get paginated blocks from work item
        """
        try:
            session_str = str(session_id)
            logger.info(f"🔍 DEBUG: Searching for session_id: '{session_str}', page: {page}, user: '{user_id}'")
            
            # Find the work item (same logic as before)
            all_docs = []
            async for doc in self.project_lists.find():
                all_docs.append(doc)
            
            result = None
            for doc in all_docs:
                if 'topics' not in doc:
                    continue
                for topic in doc['topics']:
                    if 'work_items' not in topic:
                        continue
                    for work_item in topic['work_items']:
                        if work_item.get('session_id') == session_str:
                            result = {
                                "work_item": work_item,
                                "topic": {
                                    "id": topic.get("id"),
                                    "name": topic.get("name")
                                },
                                "project": {
                                    "_id": doc["_id"],
                                    "name": doc["name"],
                                    "type": doc["type"],
                                    "owner_id": doc["owner_id"]
                                }
                            }
                            break
                    if result:
                        break
                if result:
                    break
            
            if not result:
                logger.warning(f"🔍 DEBUG: No work item found for session '{session_str}'")
                return {
                    "success": False,
                    "error": "Work item not found"
                }
            
            work_item = result["work_item"]
            topic = result["topic"]
            project = result["project"]
            
            # User authorization check
            if user_id and project.get("owner_id") != user_id:
                logger.warning(f"🔍 DEBUG: User {user_id} doesn't own work item")
                pass  # Allow access for now
            
            all_blocks = work_item.get("blocks", [])  # or work_item.get("blocks", [])
            total_blocks = len(all_blocks)
            
            # Calculate descending pagination (latest blocks first)
            start_idx = max(total_blocks - page * page_size, 0)
            end_idx = total_blocks - (page - 1) * page_size
            
            # Validate page
            if start_idx >= end_idx and total_blocks > 0:
                return {
                    "success": False,
                    "error": f"Page {page} out of range. Total pages: {(total_blocks + page_size - 1) // page_size}"
                }
            
            blocks_slice = all_blocks[start_idx:end_idx]

            
            # Process blocks
            processed_blocks = []
            for i, block in enumerate(blocks_slice):
                try:
                    processed_block = await self._process_block_for_frontend(block)
                    processed_block = serialize_datetime_objects(processed_block)
                    processed_blocks.append(processed_block)
                except Exception as e:
                    logger.error(f"Error processing block {start_idx + i}: {str(e)}")
            
            response_data = {
                "success": True,
                "session_id": session_str,
                "blocks": processed_blocks,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_blocks": total_blocks,
                    "total_pages": (total_blocks + page_size - 1) // page_size,
                    "has_next": end_idx < total_blocks,
                    "has_prev": page > 1
                },
                "work_item": {
                    "id": work_item.get("id"),
                    "title": work_item.get("title"),
                    "type": work_item.get("type"),
                },
                "topic": topic,
                "project": {
                    "id": str(project["_id"]),
                    "name": project["name"],
                    "type": project["type"],
                    "owner_id": project["owner_id"]
                }
            }
            
            return serialize_datetime_objects(response_data)
            
        except Exception as e:
            logger.error(f"Error getting paginated work item blocks: {str(e)}")
            return {
                "success": False,
                "error": str(e)
            }
    

    async def _handle_image_block(
        self,
        block: Dict[str, Any],
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Handle image block storage - only store URLs and metadata"""
        try:
            return {
                "name": block.get("name", ""),
                "url": block.get("url"),
                "s3_key": block.get("s3_key"),
                "alt": block.get("alt", ""),
                "storage_type": "url"
            }
        except Exception as e:
            logger.error(f"Error handling image block: {str(e)}")
            return {
                "name": block.get("name", ""),
                "size": block.get("size", 0),
                "error": str(e)
            }

    async def _handle_video_block(
        self,
        block: Dict[str, Any],
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Handle video block storage - only YouTube URLs supported"""
        try:
            video_id = block.get("videoId", "")
            url = block.get("url", "")
            
            if not video_id and not url:
                return {"error": "Only YouTube videos are supported"}
            
            # Extract video ID from URL if not provided
            if not video_id and url:
                if "youtube.com/watch?v=" in url:
                    video_id = url.split("watch?v=")[1].split("&")[0]
                elif "youtu.be/" in url:
                    video_id = url.split("youtu.be/")[1].split("?")[0]
            
            return {
                "videoId": video_id,
                "url": f"https://www.youtube.com/watch?v={video_id}" if video_id else url,
                "title": block.get("title", ""),
                "thumbnail": block.get("thumbnail", "") or f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                "duration": block.get("duration", 0),
                "storage_type": "youtube"
            }
        except Exception as e:
            logger.error(f"Error handling video block: {str(e)}")
            return {"error": str(e)}

    async def _handle_audio_block(
        self,
        block: Dict[str, Any],
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Handle audio block storage - store URL and metadata only"""
        try:
            return {
                "name": block.get("name", ""),
                "size": block.get("size", 0),
                "duration": block.get("duration", 0),
                "src": block.get("src", ""),
                "storage_type": "url"
            }
        except Exception as e:
            logger.error(f"Error handling audio block: {str(e)}")
            return {
                "name": block.get("name", ""),
                "size": block.get("size", 0),
                "error": str(e)
            }

    async def _handle_pdf_block(
        self,
        block: Dict[str, Any],
        session_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Handle PDF block storage - store URL and metadata only"""
        try:
            return {
                "file": "PDFMode",
                "pages": block.get("pages", 0),
                "url": block.get("url", ""),
                "s3_key": block.get("s3_key", "")
            }
        except Exception as e:
            logger.error(f"Error handling PDF block: {str(e)}")
            return {
                "name": block.get("name", ""),
                "size": block.get("size", 0),
                "error": str(e)
            }

    async def _process_block_for_frontend(self, block):
        """Process individual block and ensure datetime serialization"""
        try:
            processed_block = dict(block)
            
            # Convert any datetime fields explicitly
            for key, value in processed_block.items():
                if isinstance(value, datetime):
                    processed_block[key] = value.isoformat()
                elif key in ['created_at', 'last_modified', 'timestamp']:
                    if isinstance(value, str):
                        try:
                            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
                            processed_block[key] = dt.isoformat()
                        except:
                            pass
                    elif isinstance(value, datetime):
                        processed_block[key] = value.isoformat()
            
            return processed_block
        except Exception as e:
            logger.error(f"Error in _process_block_for_frontend: {str(e)}")
            safe_block = {}
            for key, value in block.items():
                try:
                    if isinstance(value, datetime):
                        safe_block[key] = value.isoformat()
                    else:
                        safe_block[key] = value
                except:
                    safe_block[key] = str(value)
            return safe_block

    async def load_notepad_blocks(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 1000
    ) -> Dict[str, Any]:
        """Load notepad blocks with pagination support"""
        try:
            query = {"session_id": session_id}
            if user_id:
                query["user_id"] = user_id
            
            document = await self.notepad_blocks.find_one(query)
            if not document:
                return {"success": False, "error": "Session not found"}
            
            all_blocks = document.get("blocks", [])
            total_blocks = len(all_blocks)
            
            # Calculate descending pagination
            start_idx = max(total_blocks - page * page_size, 0)
            end_idx = total_blocks - (page - 1) * page_size
            
            if start_idx >= end_idx and total_blocks > 0:
                return {
                    "success": False,
                    "error": f"Page {page} out of range"
                }
            
            blocks_slice = all_blocks[start_idx:end_idx]
            
            # Process blocks for frontend
            processed_blocks = []
            for block in blocks_slice:
                processed_block = await self._process_block_for_frontend(block)
                processed_blocks.append(processed_block)
            
            return {
                "success": True,
                "session_id": session_id,
                "blocks": processed_blocks,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_blocks": total_blocks,
                    "total_pages": (total_blocks + page_size - 1) // page_size,
                    "has_next": end_idx < total_blocks,
                    "has_prev": page > 1
                },
                "timestamp": document.get("timestamp"),
                "created_at": document.get("created_at"),
                "updated_at": document.get("updated_at")
            }
        except Exception as e:
            logger.error(f"Error loading notepad blocks: {str(e)}")
            return {"success": False, "error": str(e)}

    async def apply_block_changes(
        self,
        session_id: str,
        user_id: str,
        changes: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Apply granular changes to blocks array"""
        try:
            # Validate work item exists
            work_item = await self.project_lists.find_one(
                {"topics.work_items.session_id": session_id},
                {"topics.work_items.$": 1}
            )
            if not work_item:
                return {"success": False, "error": "Work item not found"}
            
            # Get or create notepad document
            notepad_doc = await self.notepad_blocks.find_one({"session_id": session_id})
            if not notepad_doc:
                notepad_doc = {
                    "session_id": session_id,
                    "user_id": user_id,
                    "blocks": [],
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "created_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow(),
                    "version": 1
                }
                await self.notepad_blocks.insert_one(notepad_doc)
                existing_block_ids = set()
            else:
                existing_block_ids = {block.get("id") for block in notepad_doc.get("blocks", [])}
            
            # Separate changes by type
            create_changes = []
            update_changes = []
            delete_changes = []
            
            for change in changes:
                action = change.get("action")
                if action == "create":
                    create_changes.append(change)
                elif action == "update":
                    block_id = change.get("id") or change.get("blockId") or change.get("block", {}).get("id")
                    if block_id and block_id not in existing_block_ids:
                        logger.warning(f"Block {block_id} doesn't exist, converting to create")
                        create_changes.append({"action": "create", "block": change.get("block", {})})
                    else:
                        update_changes.append(change)
                elif action == "delete":
                    delete_changes.append(change)
            
            # Process creates (batched)
            if create_changes:
                blocks_to_add = []
                for change in create_changes:
                    processed_block = await self._process_block_for_storage(
                        change.get("block"), session_id, user_id
                    )
                    blocks_to_add.append(processed_block)
                
                await self.notepad_blocks.update_one(
                    {"session_id": session_id},
                    {
                        "$push": {"blocks": {"$each": blocks_to_add}},
                        "$set": {"updated_at": datetime.utcnow()}
                    }
                )
                
                for block in blocks_to_add:
                    existing_block_ids.add(block.get("id"))
            
            # Process updates (batched with bulk_write)
            if update_changes:
                operations = []
                for change in update_changes:
                    block_id = change.get("id") or change.get("blockId")
                    block_updates = change.get("block", {})
                    if not block_id:
                        continue
                    
                    set_fields = {"updated_at": datetime.utcnow()}
                    for key, value in block_updates.items():
                        if key != "id":
                            set_fields[f"blocks.$[block].{key}"] = value
                    
                    operations.append(UpdateOne(
                        {"session_id": session_id},
                        {"$set": set_fields},
                        array_filters=[{"block.id": block_id}]
                    ))
                
                if operations:
                    await self.notepad_blocks.bulk_write(operations, ordered=False)
            
            # Process deletes (batched)
            if delete_changes:
                block_ids_to_delete = [
                    change.get("blockId") or change.get("id")
                    for change in delete_changes
                    if change.get("blockId") or change.get("id")
                ]
                if block_ids_to_delete:
                    await self.notepad_blocks.update_one(
                        {"session_id": session_id},
                        {
                            "$pull": {"blocks": {"id": {"$in": block_ids_to_delete}}},
                            "$set": {"updated_at": datetime.utcnow()}
                        }
                    )
            
            total_changes = len(create_changes) + len(update_changes) + len(delete_changes)
            return {
                "success": True,
                "message": f"Applied {total_changes} changes successfully",
                "creates": len(create_changes),
                "updates": len(update_changes),
                "deletes": len(delete_changes)
            }
        except Exception as e:
            logger.error(f"Error applying block changes: {e}")
            return {"success": False, "error": str(e)}

    async def add_block_to_work_item(
        self,
        session_id: str,
        user_id: str,
        block_data
    ) -> Dict[str, Any]:
        """Add blocks to work item"""
        try:
            # Handle both single block and multiple blocks
            if isinstance(block_data, dict):
                processed_block = await self._process_block_for_storage(
                    block_data, session_id, user_id
                )
                blocks_to_add = [processed_block]
            elif isinstance(block_data, list):
                blocks_to_add = []
                for block in block_data:
                    processed_block = await self._process_block_for_storage(
                        block, session_id, user_id
                    )
                    blocks_to_add.append(processed_block)
            else:
                return {"success": False, "error": "Invalid block_data format"}
            
            # Update work item
            result = await self.project_lists.update_one(
                {"topics.work_items.session_id": session_id},
                {
                    "$push": {
                        "topics.$[].work_items.$[item].blocks": {"$each": blocks_to_add}
                    }
                },
                array_filters=[{"item.session_id": session_id}]
            )
            
            if result.modified_count > 0:
                return {
                    "success": True,
                    "message": f"Added {len(blocks_to_add)} block(s) successfully."
                }
            else:
                return {"success": False, "error": "Work item not found"}
        except Exception as e:
            logger.error(f"Error adding block to work item: {e}")
            return {"success": False, "error": str(e)}

    async def update_work_item_blocks(
        self,
        session_id: str,
        user_id: str,
        all_blocks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Replace entire blocks array for a work item"""
        try:
            processed_blocks = []
            for block in all_blocks:
                processed_block = await self._process_block_for_storage(
                    block, session_id, user_id
                )
                processed_blocks.append(processed_block)
            
            result = await self.project_lists.update_one(
                {"topics.work_items.session_id": session_id},
                {
                    "$set": {
                        "topics.$[].work_items.$[item].blocks": processed_blocks,
                        "topics.$[].work_items.$[item].last_modified": datetime.utcnow()
                    }
                },
                array_filters=[{"item.session_id": session_id}]
            )
            
            if result.modified_count > 0:
                return {"success": True, "message": "Canvas updated successfully."}
            else:
                return {"success": False, "error": "Work item not found"}
        except Exception as e:
            logger.error(f"Error updating work item blocks: {e}")
            return {"success": False, "error": str(e)}

    async def get_work_item_blocks_paginated(
        self,
        session_id: str,
        user_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 30
    ) -> Dict[str, Any]:
        """Get paginated blocks from work item"""
        try:
            session_str = str(session_id)
            
            # Find the work item
            all_docs = []
            async for doc in self.project_lists.find():
                all_docs.append(doc)
            
            result = None
            for doc in all_docs:
                if 'topics' not in doc:
                    continue
                for topic in doc['topics']:
                    if 'work_items' not in topic:
                        continue
                    for work_item in topic['work_items']:
                        if work_item.get('session_id') == session_str:
                            result = {
                                "work_item": work_item,
                                "topic": {
                                    "id": topic.get("id"),
                                    "name": topic.get("name")
                                },
                                "project": {
                                    "_id": doc["_id"],
                                    "name": doc["name"],
                                    "type": doc["type"],
                                    "owner_id": doc["owner_id"]
                                }
                            }
                            break
                    if result:
                        break
                if result:
                    break
            
            if not result:
                return {"success": False, "error": "Work item not found"}
            
            work_item = result["work_item"]
            all_blocks = work_item.get("blocks", [])
            total_blocks = len(all_blocks)
            
            # Calculate pagination
            start_idx = max(total_blocks - page * page_size, 0)
            end_idx = total_blocks - (page - 1) * page_size
            
            if start_idx >= end_idx and total_blocks > 0:
                return {"success": False, "error": f"Page {page} out of range"}
            
            blocks_slice = all_blocks[start_idx:end_idx]
            
            # Process blocks
            processed_blocks = []
            for block in blocks_slice:
                processed_block = await self._process_block_for_frontend(block)
                processed_block = serialize_datetime_objects(processed_block)
                processed_blocks.append(processed_block)
            
            response_data = {
                "success": True,
                "session_id": session_str,
                "blocks": processed_blocks,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_blocks": total_blocks,
                    "total_pages": (total_blocks + page_size - 1) // page_size,
                    "has_next": end_idx < total_blocks,
                    "has_prev": page > 1
                },
                "work_item": {
                    "id": work_item.get("id"),
                    "title": work_item.get("title"),
                    "type": work_item.get("type"),
                },
                "topic": result["topic"],
                "project": {
                    "id": str(result["project"]["_id"]),
                    "name": result["project"]["name"],
                    "type": result["project"]["type"],
                    "owner_id": result["project"]["owner_id"]
                }
            }
            
            return serialize_datetime_objects(response_data)
        except Exception as e:
            logger.error(f"Error getting paginated work item blocks: {str(e)}")
            return {"success": False, "error": str(e)}

    # ============================================================================
    # SEARCH & CONTEXT OPERATIONS
    # ============================================================================

    async def get_blocks_by_date_range(
        self,
        session_id: str,
        user_id: str,
        start_date: str,
        end_date: str
    ) -> List[Dict]:
        """Get blocks within date range"""
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            
            work_item_result = await self.load_notepad_blocks(
                session_id, user_id, page=1, page_size=10000
            )
            
            if not work_item_result.get("success"):
                return []
            
            all_blocks = work_item_result.get("blocks", [])
            filtered_blocks = []
            
            for block in all_blocks:
                block_type = block.get('type', '')
                if block_type in ['whiteboard', 'document']:
                    continue
                
                timestamp_field = block.get('timestamp') or block.get('created_at') or block.get('date')
                if not timestamp_field:
                    continue
                
                if isinstance(timestamp_field, str):
                    block_time = datetime.fromisoformat(timestamp_field.replace('Z', '+00:00'))
                elif isinstance(timestamp_field, datetime):
                    block_time = timestamp_field
                else:
                    continue
                
                if start_dt <= block_time <= end_dt:
                    filtered_blocks.append(block)
            
            return filtered_blocks
        except Exception as e:
            logger.error(f"Error getting blocks by date range: {str(e)}")
            return []

    async def search_blocks_by_content(
        self,
        session_id: str,
        user_id: str,
        keyword: str
    ) -> List[Dict]:
        """Search blocks by keyword"""
        try:
            work_item_result = await self.load_notepad_blocks(
                session_id, user_id, page=1, page_size=10000
            )
            
            if not work_item_result.get("success"):
                return []
            
            all_blocks = work_item_result.get("blocks", [])
            keyword_lower = keyword.lower()
            matched_blocks = []
            
            for block in all_blocks:
                block_type = block.get('type', '')
                if block_type in ['whiteboard', 'document']:
                    continue
                
                # Search in different block types
                if self._block_matches_keyword(block, keyword_lower):
                    matched_blocks.append(block)
            
            return matched_blocks
        except Exception as e:
            logger.error(f"Error searching blocks: {str(e)}")
            return []

    def _block_matches_keyword(self, block: Dict, keyword: str) -> bool:
        """Check if block matches keyword"""
        block_type = block.get('type', '')
        
        if block_type == 'text':
            return keyword in block.get('content', '').lower()
        elif block_type == 'youtube':
            title = block.get('title', '').lower()
            if keyword in title:
                return True
            for ts in block.get('timestamps', []):
                if keyword in ts.get('note', '').lower():
                    return True
        elif block_type == 'table':
            for row in block.get('data', []):
                for cell in row:
                    if keyword in str(cell).lower():
                        return True
        elif block_type == 'code':
            return keyword in block.get('content', '').lower()
        elif block_type in ['bullet', 'numbered-list']:
            return keyword in block.get('content', '').lower()
        elif block_type == 'kanban':
            if keyword in block.get('boardTitle', '').lower():
                return True
            for col in block.get('columns', []):
                for card in col.get('cards', []):
                    if keyword in card.get('title', '').lower() or keyword in card.get('description', '').lower():
                        return True
        
        return False

    async def get_smart_context(
        self,
        session_id: str,
        user_id: str,
        keyword: str = ""
    ) -> Dict:
        """Smart context retrieval from work_item blocks (last 7 days only)"""
        try:
            work_item_result = await self.load_notepad_blocks(
                session_id, user_id, page=1, page_size=10000
            )
            
            if not work_item_result.get("success"):
                return {
                    "recent_context": [],
                    "relevant_context": [],
                    "stats": None
                }
            
            all_blocks = work_item_result.get("blocks", [])
            valid_blocks = [b for b in all_blocks if b.get('type') not in ['whiteboard', 'document']]
            
            # Only consider last 7 days
            cutoff_time = datetime.utcnow() - timedelta(days=7)
            last_7_days_blocks = []
            
            for block in valid_blocks:
                timestamp_field = block.get('created_at') or block.get('timestamp')
                if timestamp_field:
                    try:
                        if isinstance(timestamp_field, str):
                            block_time = datetime.fromisoformat(timestamp_field.replace('Z', '+00:00'))
                        else:
                            block_time = timestamp_field
                        if block_time >= cutoff_time:
                            last_7_days_blocks.append(block)
                    except:
                        pass
            
            last_7_days_blocks.sort(key=lambda b: b.get('created_at', ''), reverse=True)
            
            # Recent context - most recent 10 blocks
            recent_blocks = last_7_days_blocks[:10]
            
            # Relevant context - keyword search within last 7 days
            relevant_blocks = []
            if keyword:
                matched = await self._search_in_blocks(last_7_days_blocks, keyword)
                recent_ids = {b.get('id') for b in recent_blocks}
                relevant_blocks = [b for b in matched if b.get('id') not in recent_ids][:10]
            
            stats = {
                "total_blocks_7days": len(last_7_days_blocks),
                "recent_blocks_returned": len(recent_blocks),
                "relevant_blocks_returned": len(relevant_blocks),
                "note": "Showing last 7 days only"
            }
            
            return {
                "recent_context": recent_blocks,
                "relevant_context": relevant_blocks,
                "stats": stats
            }
        except Exception as e:
            logger.error(f"Error getting smart context: {str(e)}")
            return {
                "recent_context": [],
                "relevant_context": [],
                "stats": None
            }

    async def _search_in_blocks(self, blocks: List[Dict], keyword: str) -> List[Dict]:
        """Internal helper to search within blocks"""
        try:
            keyword_tokens = [token.lower().strip() for token in keyword.split() if token.strip()]
            if not keyword_tokens:
                return []
            
            matched_blocks = []
            for block in blocks:
                if block.get('type') in ['whiteboard', 'document']:
                    continue
                
                searchable_texts = self._extract_searchable_text(block)
                combined_text = ' '.join(searchable_texts).lower()
                
                matches = sum(1 for token in keyword_tokens if token in combined_text)
                if matches > 0:
                    matched_blocks.append({
                        **block,
                        '_match_score': matches / len(keyword_tokens)
                    })
            
            matched_blocks.sort(key=lambda b: b.get('_match_score', 0), reverse=True)
            
            # Remove scoring metadata
            for block in matched_blocks:
                block.pop('_match_score', None)
            
            return matched_blocks
        except Exception as e:
            logger.error(f"Error searching in blocks: {str(e)}")
            return []

    def _extract_searchable_text(self, block: Dict) -> List[str]:
        """Extract all searchable text from a block"""
        texts = []
        block_type = block.get('type', '')
        
        texts.extend([
            block.get('title', ''),
            block.get('content', ''),
            block.get('description', '')
        ])
        
        if block_type == 'youtube':
            for ts in block.get('timestamps', []):
                texts.append(ts.get('note', ''))
        elif block_type == 'table':
            for row in block.get('data', []):
                texts.extend([str(cell) for cell in row])
        elif block_type == 'kanban':
            texts.append(block.get('boardTitle', ''))
            for col in block.get('columns', []):
                texts.append(col.get('title', ''))
                for card in col.get('cards', []):
                    texts.extend([card.get('title', ''), card.get('description', '')])
        
        return texts

    # ============================================================================
    # CANVAS NODE OPERATIONS
    # ============================================================================

    async def save_canvas_node_with_branch(self, node_data: dict):
        """Save or update a canvas node"""
        try:
            await self._ensure_canvas_collections()
            
            filter_query = {
                'canvas_id': node_data['canvas_id'],
                'node_id': node_data['node_id'],
                'branch_id': node_data['branch_id']
            }
            
            update_data = {
                '$set': node_data,
                '$setOnInsert': {'created_at': node_data.get('created_at', datetime.utcnow())}
            }
            
            result = await self.canvas_nodes.update_one(
                filter_query,
                update_data,
                upsert=True
            )
            return result
        except Exception as e:
            logger.error(f"Error saving canvas node: {e}")
            raise

    async def update_canvas_node(
        self,
        canvas_id: str,
        node_id: str,
        branch_id: str,
        update_data: dict
    ):
        """Update specific fields of a canvas node"""
        try:
            filter_query = {
                'canvas_id': canvas_id,
                'node_id': node_id,
                'branch_id': branch_id
            }
            
            result = await self.canvas_nodes.update_one(
                filter_query,
                {'$set': update_data}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error updating canvas node: {e}")
            raise

    async def delete_canvas_node(self, canvas_id: str, node_id: str, branch_id: str):
        """Delete a canvas node"""
        try:
            result = await self.canvas_nodes.delete_one({
                'canvas_id': canvas_id,
                'node_id': node_id,
                'branch_id': branch_id
            })
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting canvas node: {e}")
            raise

    async def get_canvas_nodes(self, canvas_id: str, branch_id: str = "main"):
        """Get all nodes for a canvas and branch"""
        try:
            cursor = self.canvas_nodes.find({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            }).sort('created_at', 1)
            return cursor
        except Exception as e:
            logger.error(f"Error getting canvas nodes: {e}")
            raise

    async def get_canvas_node_by_id(
        self,
        canvas_id: str,
        node_id: str,
        branch_id: str = "main"
    ):
        """Get a specific node by ID"""
        try:
            node = await self.canvas_nodes.find_one({
                'canvas_id': canvas_id,
                'node_id': node_id,
                'branch_id': branch_id
            })
            return node
        except Exception as e:
            logger.error(f"Error getting canvas node: {e}")
            raise

    async def batch_update_canvas_nodes(
        self,
        canvas_id: str,
        branch_id: str,
        updates: List[dict]
    ):
        """Batch update multiple canvas nodes"""
        try:
            operations = []
            current_time = datetime.utcnow()
            
            for update in updates:
                node_id = update.get('node_id')
                update_data = {'updated_at': current_time}
                
                for field in ['position_x', 'position_y', 'width', 'height']:
                    if field in update:
                        update_data[field] = update[field]
                
                operations.append(
                    UpdateOne(
                        {
                            'canvas_id': canvas_id,
                            'node_id': node_id,
                            'branch_id': branch_id
                        },
                        {'$set': update_data}
                    )
                )
            
            if operations:
                result = await self.canvas_nodes.bulk_write(operations, ordered=False)
                return result.modified_count
            return 0
        except Exception as e:
            logger.error(f"Error batch updating canvas nodes: {e}")
            raise

    # ============================================================================
    # CANVAS CONNECTION OPERATIONS
    # ============================================================================

    async def save_canvas_connection(self, connection_data: dict):
        """Save a canvas connection between nodes"""
        try:
            await self._ensure_canvas_collections()
            
            filter_query = {
                'canvas_id': connection_data['canvas_id'],
                'branch_id': connection_data['branch_id'],
                'from_node_id': connection_data['from_node_id'],
                'to_node_id': connection_data['to_node_id']
            }
            
            update_data = {
                '$set': connection_data,
                '$setOnInsert': {'created_at': connection_data.get('created_at', datetime.utcnow())}
            }
            
            result = await self.canvas_connections.update_one(
                filter_query,
                update_data,
                upsert=True
            )
            return result
        except Exception as e:
            logger.error(f"Error saving canvas connection: {e}")
            raise

    async def delete_canvas_connection(
        self,
        canvas_id: str,
        from_node_id: str,
        to_node_id: str,
        branch_id: str
    ):
        """Delete a specific connection"""
        try:
            result = await self.canvas_connections.delete_one({
                'canvas_id': canvas_id,
                'branch_id': branch_id,
                'from_node_id': from_node_id,
                'to_node_id': to_node_id
            })
            return result.deleted_count > 0
        except Exception as e:
            logger.error(f"Error deleting canvas connection: {e}")
            raise

    async def delete_canvas_connections_for_node(
        self,
        canvas_id: str,
        node_id: str,
        branch_id: str
    ):
        """Delete all connections involving a specific node"""
        try:
            result = await self.canvas_connections.delete_many({
                'canvas_id': canvas_id,
                'branch_id': branch_id,
                '$or': [
                    {'from_node_id': node_id},
                    {'to_node_id': node_id}
                ]
            })
            return result.deleted_count
        except Exception as e:
            logger.error(f"Error deleting canvas connections: {e}")
            raise

    async def get_canvas_connections(self, canvas_id: str, branch_id: str = "main"):
        """Get all connections for a canvas and branch"""
        try:
            cursor = self.canvas_connections.find({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            }).sort('created_at', 1)
            return cursor
        except Exception as e:
            logger.error(f"Error getting canvas connections: {e}")
            raise

    # ============================================================================
    # CANVAS STATE OPERATIONS
    # ============================================================================

    async def get_canvas_state(self, canvas_id: str, branch_id: str = "main"):
        """Get complete canvas state (nodes + connections)"""
        try:
            await self._ensure_canvas_collections()
            
            # Fetch nodes
            nodes_cursor = self.canvas_nodes.find({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            }).sort('created_at', 1)
            nodes = await nodes_cursor.to_list(length=None)
            
            # Fetch connections
            connections_cursor = self.canvas_connections.find({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            }).sort('created_at', 1)
            connections = await connections_cursor.to_list(length=None)
            
            return {
                'nodes': nodes,
                'connections': connections,
                'total_nodes': len(nodes),
                'total_connections': len(connections)
            }
        except Exception as e:
            logger.error(f"Error getting canvas state: {e}")
            raise

    async def clear_canvas(self, canvas_id: str, branch_id: str = "main"):
        """Clear all nodes and connections for a canvas/branch"""
        try:
            nodes_result = await self.canvas_nodes.delete_many({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            })
            
            connections_result = await self.canvas_connections.delete_many({
                'canvas_id': canvas_id,
                'branch_id': branch_id
            })
            
            return {
                'deleted_nodes': nodes_result.deleted_count,
                'deleted_connections': connections_result.deleted_count
            }
        except Exception as e:
            logger.error(f"Error clearing canvas: {e}")
            raise