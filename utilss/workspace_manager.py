from pathlib import Path
from typing import Optional, Dict, Any
import base64
import shutil
import asyncio
import time
import hashlib
from datetime import datetime, timedelta
from pymongo import AsyncMongoClient
import logging
import fnmatch
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from Mongodb.db import DatabaseManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WorkspaceManager:
    def __init__(self, root: Path,database_name: str, user_id: Optional[str] = None, db: Optional[DatabaseManager] = None,container_workspace: Optional[Path] = None,
                 workspace_id: str = None,
                 cleanup_interval: int = 3600, 
                 max_inactive_time: int = 3600, 
                 max_file_size: int = 1 * 1024 * 1024):  
        
        # Original attributes
        self.root = root.absolute()
        self.container_workspace = container_workspace.absolute() if container_workspace else None
        self.userid = user_id
        
        # Database configuration
        self.db_manager = db  # Store the DatabaseManager instance
        self.database_name = database_name
        self.workspace_id = workspace_id
        
        # Lifecycle management
        self.cleanup_interval = cleanup_interval
        self.max_inactive_time = max_inactive_time
        self.max_file_size = max_file_size
        self.last_activity = datetime.now()
        
        # Async/sync coordination
        self._loop = None
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._cleanup_task = None
        self._initialized = False
        
        # File filtering configuration
        self._init_file_filters()
        
        # MongoDB connection (will be initialized in async_init)
        self.client = None
        self.db = None
        self.workspaces_collection = None
        self.files_collection = None
        
        # File tracking
        self._file_cache = {}
        self._dirty_files = set()
        
        # Ensure root directory exists (synchronous)
        self.root.mkdir(parents=True, exist_ok=True)
        if self.container_workspace:
            self.container_workspace.mkdir(parents=True, exist_ok=True)

    async def async_init(self):
        """Async initialization - call this after creating the object"""
        if self._initialized:
            return
            
        self._loop = asyncio.get_event_loop()
        
        # Initialize MongoDB connection using DatabaseManager
        await self._init_mongodb()
        
        # Restore workspace from MongoDB if exists
        await self._restore_workspace()
        
        # Start cleanup task
        self._cleanup_task = asyncio.create_task(self._cleanup_daemon())
        
        self._initialized = True
        logger.info(f"WorkspaceManager initialized for user {self.userid}: {self.workspace_id}")

    def _init_file_filters(self):
        """Initialize file filtering rules (synchronous)"""
        # Directories to exclude from MongoDB (but keep locally for execution)
        self.excluded_dirs = {
            'node_modules', '.git', '.next', '.nuxt', 'dist', 'build', '.cache',
            '.vscode', '.idea', '__pycache__', '.pytest_cache', '.mypy_cache',
            'venv', 'env', '.env', 'vendor', 'target', 'bin', 'obj', '.gradle',
            'coverage', '.nyc_output', 'logs', 'tmp', 'temp', '.DS_Store', 'Thumbs.db',
            'reveal.js', 'bootstrap', 'jquery', 'fontawesome', 'materialize',
            'semantic', 'foundation', 'bulma', 'tailwindcss', 'chartjs', 'd3',
            'three', 'ace', 'codemirror', 'monaco-editor', 'tinymce', 'ckeditor',
            'prismjs', 'highlightjs', 'mathjax', 'katex', 'plotly', 'leaflet',
            'openlayers', 'cesium', 'mp4',
        }
        
        # File patterns to exclude
        self.excluded_patterns = {
            '*.log', '*.tmp', '*.temp', '*.cache', '*.pid', '*.lock', '*.swp',
            '*.swo', '*~', '.DS_Store', 'Thumbs.db', '*.exe', '*.dll', '*.so',
            '*.dylib', '*.zip', '*.tar.gz', '*.rar', '*.7z', '*.mp4', '*.avi',
            '*.mov', '*.wmv', '*.flv', '*.mkv', '*.db', '*.sqlite', '*.sqlite3',
            '*.suo', '*.user', '*.userosscache', '*.sln.docstates', '*.min.js',
            '*.min.css', 'reveal*.js', 'reveal*.css', 'bootstrap*.js',
            'bootstrap*.css', 'jquery*.js', 'd3*.js', 'three*.js', 'chart*.js',
            'plotly*.js',
        }
        
        # Files to exclude (exact names)
        self.excluded_files = {
            '.env', '.env.local', '.env.development', '.env.production', '.env.test',
            'package-lock.json', 'yarn.lock', 'Pipfile.lock', 'poetry.lock',
            'composer.lock', 'Gemfile.lock', '.gitignore', 'npm-debug.log',
            'yarn-error.log', 'debug.log', 'error.log', 'access.log'
        }
        
        # Important files to ALWAYS save (override other rules)
        self.important_files = {
            'package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml',
            'setup.py', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
            'README.md', 'LICENSE', 'Makefile', '.gitignore', 'tsconfig.json',
            'webpack.config.js', 'vite.config.js', 'next.config.js',
            'tailwind.config.js', 'postcss.config.js', 'index.html',
            'slide1.html', 'slide2.html', 'slide3.html', 'presentation.html',
            'slides.html',
        }

    def _is_library_directory(self, path: Path) -> bool:
        """Check if a path is within a library directory"""
        path_parts = path.parts
        library_indicators = [
            'reveal.js', 'node_modules', 'bower_components', 'vendor',
            'lib', 'libs', 'library', 'libraries', 'third-party', 'external',
            'assets/lib', 'assets/libs', 'js/lib', 'js/libs', 'css/lib', 'css/libs'
        ]
        
        for part in path_parts:
            if part.lower() in [lib.lower() for lib in library_indicators]:
                return True
        return False

    def _should_save_to_mongodb(self, file_path: Path) -> bool:
        """Determine if file should be saved to MongoDB (synchronous)"""
        try:
            rel_path = self.relative_path(file_path)
            path_parts = rel_path.parts
            file_name = file_path.name
            
            # Always save important files
            if file_name in self.important_files:
                return True
            
            if self._is_library_directory(rel_path):
                return False
            
            # Check if file is in excluded directory
            for part in path_parts:
                if part in self.excluded_dirs:
                    return False
            
            # Check excluded file names
            if file_name in self.excluded_files:
                return False
            
            # Check excluded patterns
            for pattern in self.excluded_patterns:
                if fnmatch.fnmatch(file_name, pattern):
                    return False
            
            # Check file size
            if file_path.exists() and file_path.stat().st_size > self.max_file_size:
                logger.warning(f"File too large for MongoDB: {rel_path}")
                return False
            
            # Check if it's a binary file
            if file_path.exists() and self._is_likely_binary(file_path):
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error checking file {file_path}: {e}")
            return False

    def _is_likely_binary(self, file_path: Path) -> bool:
        """Check if file is likely binary (synchronous)"""
        try:
            text_extensions = {
                '.txt', '.md', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css',
                '.scss', '.sass', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini',
                '.cfg', '.conf', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',
                '.cmd', '.dockerfile', '.sql', '.r', '.php', '.rb', '.go', '.rs',
                '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.vb', '.swift', '.kt',
                '.scala', '.clj', '.hs', '.elm', '.vue', '.svelte', '.astro', '.prisma'
            }
            
            if file_path.suffix.lower() in text_extensions:
                return False
            
            if file_path.stat().st_size > 1024 * 1024:
                return True
                
            try:
                with open(file_path, 'rb') as f:
                    chunk = f.read(1024)
                    if b'\x00' in chunk:
                        return True
                    chunk.decode('utf-8')
                    return False
            except (UnicodeDecodeError, OSError):
                return True
                
        except Exception:
            return True


    async def _init_mongodb(self):
        """Initialize MongoDB connection using DatabaseManager (async)"""
        try:
            self.workspaces_collection = self.db_manager.workspaces
            self.files_collection = self.db_manager.files
            
            # Create indexes for better performance
            await self.workspaces_collection.create_index([("workspace_id", 1), ("userid", 1)])
            await self.files_collection.create_index([("workspace_id", 1), ("userid", 1), ("file_path", 1)])
            
            logger.info(f"Connected to MongoDB database: {self.database_name}")
        except Exception as e:
            logger.error(f"Failed to connect to MongoDB: {e}")
            raise

    def _update_activity(self):
        """Update last activity timestamp (synchronous)"""
        self.last_activity = datetime.now()

    async def _save_file_to_mongodb(self, file_path: Path, content: bytes = None):
        """Save file to MongoDB with enhanced error handling"""
        try:
            if not self._should_save_to_mongodb(file_path):
                logger.debug(f"Skipping file (filtered): {self.relative_path(file_path)}")
                return
            
            rel_path = self.relative_path(file_path)
            
            # Read content if not provided
            if content is None and file_path.exists():
                try:
                    content = await self._loop.run_in_executor(
                        self._executor, file_path.read_bytes
                    )
                except Exception as e:
                    logger.error(f"Failed to read file content: {rel_path} - {e}")
                    return
            
            if content is not None:
                if len(content) > self.max_file_size:
                    logger.warning(f"File too large, skipping: {rel_path} ({len(content)} bytes)")
                    return
                
                file_doc = {
                    "workspace_id": self.workspace_id,
                    "userid": self.userid,
                    "file_path": str(rel_path),
                    "content": content,
                    "size": len(content),
                    "created_at": datetime.now(),
                    "updated_at": datetime.now()
                }
                
                try:
                    result = await self.files_collection.update_one(
                        {
                            "workspace_id": self.workspace_id, 
                            "userid": self.userid,
                            "file_path": str(rel_path)
                        },
                        {"$set": file_doc},
                        upsert=True
                    )
                    
                    if result.upserted_id or result.modified_count > 0:
                        logger.info(f"✅ Saved to MongoDB: {rel_path} ({len(content)} bytes)")
                    else:
                        logger.warning(f"⚠️ No changes made to MongoDB: {rel_path}")
                        
                except Exception as e:
                    logger.error(f"❌ MongoDB operation failed for {rel_path}: {e}")
                    raise
            else:
                logger.warning(f"⚠️ No content to save for: {rel_path}")
                
        except Exception as e:
            logger.error(f"❌ Failed to save file to MongoDB: {file_path} - {e}")
            raise
        
    async def force_sync_all_files(self):
        """Force sync all local files to MongoDB (for debugging)"""
        logger.info("🔄 Force syncing all local files...")
        
        try:
            local_files = await self._loop.run_in_executor(
                self._executor, self._get_local_files
            )
            
            logger.info(f"Found {len(local_files)} local files to sync")
            
            tasks = []
            for rel_path in local_files:
                full_path = self.root / rel_path
                if self._should_save_to_mongodb(full_path):
                    tasks.append(self._save_file_to_mongodb(full_path))
            
            if tasks:
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                success_count = sum(1 for r in results if not isinstance(r, Exception))
                error_count = len(results) - success_count
                
                logger.info(f"✅ Force sync complete: {success_count} succeeded, {error_count} failed")
                
                # Clear dirty files after successful sync
                self._dirty_files.clear()
            else:
                logger.info("No files needed syncing")
                
        except Exception as e:
            logger.error(f"❌ Force sync failed: {e}")
            raise

    async def _load_file_from_mongodb(self, file_path: Path) -> bool:
        """Load file from MongoDB (async)"""
        try:
            rel_path = self.relative_path(file_path)
            file_doc = await self.files_collection.find_one({
                "workspace_id": self.workspace_id,
                "userid": self.userid,
                "file_path": str(rel_path)
            })
                         
            if file_doc and 'content' in file_doc:
                file_path.parent.mkdir(parents=True, exist_ok=True)
                                 
                # Handle both Binary and raw bytes
                content = file_doc['content']
                if hasattr(content, 'decode'):  # It's already bytes
                    file_path.write_bytes(content)
                elif isinstance(content, str):  # It's a base64 string
                    file_path.write_bytes(base64.b64decode(content))
                else:  # It's a MongoDB Binary object
                    file_path.write_bytes(bytes(content))
                                 
                logger.debug(f"Loaded file from MongoDB: {rel_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to load file from MongoDB: {e}")
            return False

    def _write_file_content(self, file_path: Path, content):
        """Helper to write file content synchronously"""
        file_path.parent.mkdir(parents=True, exist_ok=True)
        if hasattr(content, 'decode'):
            file_path.write_bytes(content)
        elif isinstance(content, str):
            file_path.write_bytes(base64.b64decode(content))
        else:
            file_path.write_bytes(bytes(content))

    async def _restore_workspace(self):
        """Restore workspace from MongoDB (async)"""
        logger.info(f"--- [STARTING RESTORE] Attempting to restore workspace_id: '{self.workspace_id}' for user: '{self.userid}' ---")
        try:
            workspace_doc = await self.workspaces_collection.find_one({
                "workspace_id": self.workspace_id,
                "userid": self.userid
            })
            
            if workspace_doc:
                logger.info(f"SUCCESS: Found workspace document for '{self.workspace_id}' (user: {self.userid}).")
                
                files_cursor = self.files_collection.find({
                    "workspace_id": self.workspace_id,
                    # "userid": self.userid
                })
                files_list = await files_cursor.to_list(length=None)
                
                logger.info(f"Found {len(files_list)} file documents in MongoDB for this workspace.")
                
                if not files_list:
                    logger.warning("WARNING: Workspace exists, but no file documents were found.")
                    return
                
                restored_count = 0
                for file_doc in files_list:
                    file_rel_path = file_doc["file_path"]
                    logger.info(f"  --> Attempting to restore file: {file_rel_path}")
                    
                    try:
                        full_path = self.root / file_rel_path
                        full_path.parent.mkdir(parents=True, exist_ok=True)
                        content = file_doc['content']
                        full_path.write_bytes(bytes(content)) # BSON Binary needs to be cast to bytes
                        logger.info(f"      SUCCESS: Wrote file to {full_path}")
                        restored_count += 1
                    except Exception as e:
                        logger.error(f"      ERROR: Failed to write file {file_rel_path}. Reason: {e}")
    
                logger.info(f"--- [RESTORE COMPLETE] Restored {restored_count} files for workspace: {self.workspace_id} ---")
    
            else:
                logger.warning(f"FAILURE: No workspace document found for workspace_id: '{self.workspace_id}'. Cannot restore files.")
                await self._save_workspace_metadata()
                logger.info(f"Created new (empty) workspace metadata entry: {self.workspace_id}")
    
        except Exception as e:
            import traceback
            traceback.print_exc()
            logger.error(f"CRITICAL ERROR in _restore_workspace: {e}")
            

    async def sync_workspace_to_db(self):
        """Sync workspace to database (async)"""
        self._update_activity()
        logger.info("================== [STARTING ASYNC SYNC] ==================")
        
        # Get local files (run in executor since it's I/O intensive)
        local_files = await self._loop.run_in_executor(
            self._executor, 
            self._get_local_files
        )
        
        # Get files in DB for this user
        files_in_db = {
            doc['file_path'] async for doc in self.files_collection.find(
                {
                    "workspace_id": self.workspace_id,
                    "userid": self.userid
                }, 
                {"file_path": 1}
            )
        }
        
        # Save/Update all local files
        logger.info(f"Updating/Creating {len(local_files)} local files in DB...")
        tasks = [
            self._save_file_to_mongodb(self.root / rel_path)
            for rel_path in local_files
        ]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Delete stale files
        files_to_delete = files_in_db - local_files
        if files_to_delete:
            logger.info(f"Deleting {len(files_to_delete)} stale files from DB...")
            delete_tasks = [
                self._delete_file_from_mongodb(self.root / rel_path)
                for rel_path in files_to_delete
            ]
            await asyncio.gather(*delete_tasks, return_exceptions=True)
        
        await self._save_workspace_metadata()
        logger.info("Async full sync complete.")

    def _get_local_files(self):
        """Get local files synchronously"""
        return {
            str(p.relative_to(self.root))
            for p in self.root.rglob("*")
            if p.is_file() and self._should_save_to_mongodb(p)
        }

    async def _delete_file_from_mongodb(self, file_path: Path):
        """Delete file from MongoDB (async)"""
        rel_path = self.relative_path(file_path)
        try:
            await self.files_collection.delete_one({
                "workspace_id": self.workspace_id,
                "userid": self.userid,
                "file_path": str(rel_path)
            })
            logger.debug(f"Deleted from MongoDB: {rel_path}")
        except Exception as e:
            logger.error(f"Failed to delete file from MongoDB: {e}")

    async def _save_workspace_metadata(self):
        """Save workspace metadata to MongoDB (async)"""
        try:
            workspace_doc = {
                "workspace_id": self.workspace_id,
                "userid": self.userid,
                "root_path": str(self.root),
                "container_workspace": str(self.container_workspace) if self.container_workspace else None,
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "last_activity": self.last_activity
            }
            
            await self.workspaces_collection.update_one(
                {
                    "workspace_id": self.workspace_id,
                    "userid": self.userid
                },
                {"$set": workspace_doc},
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to save workspace metadata: {e}")

    async def _cleanup_daemon(self):
        """Background cleanup daemon (async)"""
        logger.info(f"🚀 AUTO-SAVE DAEMON STARTED for user {self.userid}! Interval: {self.cleanup_interval}s")
        
        cycle_count = 0
        while True:
            try:
                cycle_count += 1
                logger.debug(f"Auto-save cycle #{cycle_count} starting for user {self.userid}...")
                
                await asyncio.sleep(self.cleanup_interval)
                
                # Sync dirty files with proper reporting
                dirty_count = len(self._dirty_files)
                if dirty_count > 0:
                    logger.info(f"🔄 Auto-save triggered for user {self.userid}: {dirty_count} dirty files")
                    await self._sync_dirty_files()
                else:
                    logger.debug(f"Auto-save for user {self.userid}: No dirty files to sync")
                
                # Save metadata
                await self._save_workspace_metadata()
                
                # Check if inactive
                inactive_time = datetime.now() - self.last_activity
                if inactive_time > timedelta(seconds=self.max_inactive_time):
                    logger.info(f"Workspace for user {self.userid} inactive for {inactive_time}, cleaning up...")
                    await self._cleanup_local_files()
                    
            except asyncio.CancelledError:
                logger.info(f"🛑 Auto-save daemon cancelled for user {self.userid}")
                break
            except Exception as e:
                logger.error(f"❌ Auto-save daemon error for user {self.userid}: {e}")
                import traceback
                traceback.print_exc()
                # Continue running but wait a bit longer
                await asyncio.sleep(min(60, self.cleanup_interval))

    async def _sync_dirty_files(self):
        """Sync dirty files (async)"""
        if not self._dirty_files:
            return
            
        dirty_files = list(self._dirty_files)
        logger.info(f"Auto-save: Syncing {len(dirty_files)} dirty files for user {self.userid}...")
        
        tasks = []
        valid_files = []
        
        for rel_path_str in dirty_files:
            # Convert relative path back to full path
            full_path = self.root / rel_path_str
            
            if full_path.exists() and self._should_save_to_mongodb(full_path):
                tasks.append(self._save_file_to_mongodb(full_path))
                valid_files.append(rel_path_str)
            else:
                # Remove non-existent files from dirty set
                logger.debug(f"Removing non-existent dirty file for user {self.userid}: {rel_path_str}")
                self._dirty_files.discard(rel_path_str)
        
        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Only clear dirty files that were successfully synced
            successful_files = []
            for i, result in enumerate(results):
                if not isinstance(result, Exception):
                    successful_files.append(valid_files[i])
                else:
                    logger.error(f"Failed to sync {valid_files[i]} for user {self.userid}: {result}")
            
            # Remove only successfully synced files
            for file_path in successful_files:
                self._dirty_files.discard(file_path)
            
            logger.info(f"Auto-save: Successfully synced {len(successful_files)}/{len(tasks)} files for user {self.userid}")
        else:
            logger.debug(f"Auto-save: No valid dirty files to sync for user {self.userid}")

    async def _cleanup_local_files(self):
        """Clean up local files (async)"""
        logger.info(f"Cleaning up inactive workspace for user {self.userid}: {self.workspace_id}")
        
        await self._sync_dirty_files()
        
        # Run file system operations in executor
        await self._loop.run_in_executor(self._executor, self._remove_local_directories)

    def _remove_local_directories(self):
        """Remove local directories synchronously"""
        if self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)
        if self.container_workspace and self.container_workspace.exists():
            shutil.rmtree(self.container_workspace, ignore_errors=True)
    
    def _mark_file_dirty(self, file_path: Path):
        """Mark a file as dirty for later sync"""
        # Store relative path instead of full path for consistency
        rel_path = str(self.relative_path(file_path))
        self._dirty_files.add(rel_path)
        logger.debug(f"🔄 Marked file as dirty for user {self.userid}: {rel_path}")

    async def save_file(self, path: Path | str, content: str | bytes):
        """Save file with automatic MongoDB sync"""
        self._update_activity()
        full_path = self.ensure_path_exists(path)
        
        rel_path = self.relative_path(full_path)
        logger.info(f"💾 Saving file for user {self.userid}: {rel_path}")
        
        # First, write the file locally
        try:
            if isinstance(content, str):
                content_bytes = content.encode('utf-8')
                await self._loop.run_in_executor(
                    self._executor, full_path.write_text, content, 'utf-8'
                )
            else:
                content_bytes = content
                await self._loop.run_in_executor(
                    self._executor, full_path.write_bytes, content
                )
            
            logger.debug(f"✅ File written locally for user {self.userid}: {rel_path}")
            
        except Exception as e:
            logger.error(f"❌ Failed to write file locally for user {self.userid}: {rel_path} - {e}")
            raise
        
        # Then handle MongoDB sync
        if self._should_save_to_mongodb(full_path):
            file_name = full_path.name
            
            # Important files get immediate save
            if file_name in self.important_files:
                logger.info(f"⚡ Immediately saving important file for user {self.userid}: {file_name}")
                try:
                    await self._save_file_to_mongodb(full_path, content_bytes)
                    logger.info(f"✅ Important file saved to MongoDB for user {self.userid}: {rel_path}")
                except Exception as e:
                    logger.error(f"❌ Failed to save important file to MongoDB for user {self.userid}: {rel_path} - {e}")
                    # Still mark as dirty for retry
                    self._mark_file_dirty(full_path)
            else:
                # Regular files get marked for periodic sync
                self._mark_file_dirty(full_path)
                logger.debug(f"📝 Marked for auto-save for user {self.userid}: {rel_path}")
        else:
            logger.debug(f"⏭️ File excluded from MongoDB sync for user {self.userid}: {rel_path}")

    def mark_file_changed(self, file_path: Path | str):
        """Mark a file as changed (for external file modifications)"""
        full_path = self.workspace_path(file_path)
        if self._should_save_to_mongodb(full_path):
            self._mark_file_dirty(full_path)
            self._update_activity()

    async def read_file(self, path: Path | str) -> bytes:
        """Read file with MongoDB fallback (async)"""
        self._update_activity()
        full_path = self.workspace_path(path)
        
        if full_path.exists():
            return full_path.read_bytes()
        
        if await self._load_file_from_mongodb(full_path):
            return full_path.read_bytes()
        
        raise FileNotFoundError(f"File not found: {path}")

    async def list_files(self, include_excluded: bool = False) -> list[str]:
        """List all files in workspace (async)"""
        self._update_activity()
        files = set()
        
        # Local files
        if self.root.exists():
            for file_path in self.root.rglob("*"):
                if file_path.is_file():
                    rel_path = str(file_path.relative_to(self.root))
                    if include_excluded or self._should_save_to_mongodb(file_path):
                        files.add(rel_path)
        
        # MongoDB files (these are already filtered)
        try:
            mongo_files = self.files_collection.find({
                "workspace_id": self.workspace_id
            })
            for file_doc in mongo_files:
                files.add(file_doc["file_path"])
        except Exception as e:
            logger.error(f"Failed to list MongoDB files: {e}")
        
        return sorted(list(files))

    def _get_local_files_with_filter(self, include_excluded: bool) -> set:
        """Get local files with filtering"""
        files = set()
        if self.root.exists():
            for file_path in self.root.rglob("*"):
                if file_path.is_file():
                    rel_path = str(file_path.relative_to(self.root))
                    if include_excluded or self._should_save_to_mongodb(file_path):
                        files.add(rel_path)
        return files

    async def sync_now(self):
        """Force immediate sync (async)"""
        self._update_activity()
        await self._sync_dirty_files()
        await self._save_workspace_metadata()

    async def cleanup(self):
        """Manual cleanup (async)"""
        await self.sync_now()
        # Remove local files
        if self.root.exists():
            shutil.rmtree(self.root, ignore_errors=True)
        
        if self.container_workspace and self.container_workspace.exists():
            shutil.rmtree(self.container_workspace, ignore_errors=True)

    async def close(self):
        """Close connections and cleanup"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        
        await self.sync_now()
        

    def workspace_path(self, path: Path | str) -> Path:
        """Convert a path to workspace-relative path"""
        self._update_activity()
        path = Path(path)
        
        if path.is_absolute():
            return path
        
        full_path = self.root / path
        return full_path


    def container_path(self, path: Path | str) -> Path:
        """Convert a path to container-relative path"""
        self._update_activity()
        path = Path(path)
        
        if not self.container_workspace:
            return self.workspace_path(path)
        
        if path.is_absolute():
            return path
        
        full_path = self.container_workspace / path
        return full_path

    def relative_path(self, path: Path | str) -> Path:
        """Get path relative to workspace root"""
        self._update_activity()
        path = Path(path)
        abs_path = self.workspace_path(path)
        
        try:
            return abs_path.relative_to(self.root)
        except ValueError:
            return abs_path

    def ensure_path_exists(self, path: Path | str) -> Path:
        """Ensure a path exists and return the absolute path"""
        self._update_activity()
        full_path = self.workspace_path(path)
        full_path.parent.mkdir(parents=True, exist_ok=True)
        return full_path

    def get_current_working_directory(self) -> Path:
        """Get the current working directory for this workspace"""
        self._update_activity()
        return self.container_workspace if self.container_workspace else self.root

    def get_workspace_info(self) -> Dict[str, Any]:
        """Get workspace information (synchronous)"""
        saved_files = len(self.list_files(include_excluded=False))
        total_files = len(self.list_files(include_excluded=True))
        return {
            "workspace_id": self.workspace_id,
            "userid": self.userid,
            "root": str(self.root),
            "container_workspace": str(self.container_workspace) if self.container_workspace else None,
            "last_activity": self.last_activity.isoformat(),
            "saved_files": saved_files,
            "total_files": total_files,
            "dirty_files": len(self._dirty_files),
            "max_file_size": self.max_file_size,
            "excluded_dirs": len(self.excluded_dirs),
            "excluded_patterns": len(self.excluded_patterns),
            "initialized": self._initialized
        }

    # Configuration methods (synchronous)
    def add_excluded_dir(self, dir_name: str):
        """Add a directory to exclude from MongoDB sync"""
        self.excluded_dirs.add(dir_name)

    def add_excluded_pattern(self, pattern: str):
        """Add a file pattern to exclude from MongoDB sync"""
        self.excluded_patterns.add(pattern)

    def add_important_file(self, file_name: str):
        """Add a file to the important files list (immediate sync)"""
        self.important_files.add(file_name)

    def set_max_file_size(self, size_bytes: int):
        """Set the maximum file size for MongoDB sync"""
        self.max_file_size = size_bytes

    def get_excluded_info(self) -> Dict[str, Any]:
        """Get information about excluded files and patterns"""
        return {
            "excluded_dirs": sorted(list(self.excluded_dirs)),
            "excluded_patterns": sorted(list(self.excluded_patterns)),
            "excluded_files": sorted(list(self.excluded_files)),
            "important_files": sorted(list(self.important_files)),
            "max_file_size": self.max_file_size
        }

    async def get_user_workspaces(self) -> list[Dict[str, Any]]:
        """Get all workspaces for the current user"""
        try:
            workspaces = []
            async for workspace_doc in self.workspaces_collection.find(
                {"userid": self.userid}
            ):
                # Remove MongoDB ObjectId for JSON serialization
                workspace_doc.pop('_id', None)
                workspaces.append(workspace_doc)
            return workspaces
        except Exception as e:
            logger.error(f"Failed to get user workspaces for {self.userid}: {e}")
            return []

    async def delete_workspace(self):
        """Delete the entire workspace and all its files"""
        try:
            # Delete all files for this workspace
            await self.files_collection.delete_many({
                "workspace_id": self.workspace_id,
                "userid": self.userid
            })
            
            # Delete workspace metadata
            await self.workspaces_collection.delete_one({
                "workspace_id": self.workspace_id,
                "userid": self.userid
            })
            
            # Remove local files
            await self._loop.run_in_executor(self._executor, self._remove_local_directories)
            
            logger.info(f"Deleted workspace {self.workspace_id} for user {self.userid}")
            
        except Exception as e:
            logger.error(f"Failed to delete workspace {self.workspace_id} for user {self.userid}: {e}")
            raise

    async def get_file_info(self, file_path: str) -> Optional[Dict[str, Any]]:
        """Get information about a specific file"""
        try:
            file_doc = await self.files_collection.find_one({
                "workspace_id": self.workspace_id,
                "userid": self.userid,
                "file_path": file_path
            })
            
            if file_doc:
                # Remove content and ObjectId for response
                file_info = {
                    "file_path": file_doc["file_path"],
                    "size": file_doc["size"],
                    "created_at": file_doc["created_at"],
                    "updated_at": file_doc["updated_at"]
                }
                return file_info
            return None
            
        except Exception as e:
            logger.error(f"Failed to get file info for {file_path}: {e}")
            return None

    async def __aenter__(self):
        """Async context manager entry"""
        await self.async_init()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()

    def __str__(self) -> str:
        return f"WorkspaceManager(id={self.workspace_id}, user={self.userid}, root={self.root}, container={self.container_workspace})"