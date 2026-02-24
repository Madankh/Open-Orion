# from pathlib import Path
# from typing import Optional, Dict, Any, List, Tuple, Union
# import base64
# import shutil
# import threading
# import time
# import hashlib
# import json
# import tarfile
# import io
# import tempfile
# import subprocess
# import psutil
# import resource
# import re
# import os
# from datetime import datetime, timedelta
# from pymongo import MongoClient
# import gridfs
# import logging
# import fnmatch
# import docker

# # Configure logging
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
# logger = logging.getLogger(__name__)

# class DockerWorkspaceManager:
#     """
#     Unified workspace manager supporting multiple languages with intelligent auto-detection,
#     visualization capabilities, and secure command execution.
#     """
    
#     # Comprehensive language configurations
#     LANGUAGE_CONFIGS = {
#         "python-basic": {
#             "image": "python:3.11-slim",
#             "memory": "256m",
#             "cpu": "0.5",
#             "setup_commands": [
#                 "apt-get update -qq",
#                 "apt-get install -y -qq build-essential",
#                 "pip install --no-cache-dir requests numpy pandas matplotlib seaborn plotly"
#             ],
#             "extensions": [".py"],
#             "runtime_cmd": "python3"
#         },
#         "python-dataviz": {
#             "image": "python:3.11-slim", 
#             "memory": "512m",
#             "cpu": "1.0",
#             "setup_commands": [
#                 "apt-get update -qq",
#                 "apt-get install -y -qq libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev libgomp1",
#                 "pip install --no-cache-dir pandas numpy matplotlib seaborn plotly scipy scikit-learn jupyter"
#             ],
#             "extensions": [".py", ".ipynb"],
#             "runtime_cmd": "python3",
#             "display_setup": True
#         },
#         "python-ml": {
#             "image": "python:3.11-slim",
#             "memory": "1024m", 
#             "cpu": "2.0",
#             "setup_commands": [
#                 "apt-get update -qq",
#                 "apt-get install -y -qq libgl1-mesa-glx libglib2.0-0 build-essential",
#                 "pip install --no-cache-dir torch torchvision numpy pandas matplotlib scikit-learn tensorflow jupyter"
#             ],
#             "extensions": [".py", ".ipynb"],
#             "runtime_cmd": "python3"
#         },
#         "javascript": {
#             "image": "node:18-slim",
#             "memory": "256m",
#             "cpu": "0.5", 
#             "setup_commands": [
#                 "npm install -g typescript ts-node nodemon",
#                 "npm install -g @types/node"
#             ],
#             "extensions": [".js", ".ts", ".jsx", ".tsx"],
#             "runtime_cmd": "node"
#         },
#         "c-cpp": {
#             "image": "gcc:11-slim",
#             "memory": "128m",
#             "cpu": "0.5",
#             "setup_commands": [
#                 "apt-get update -qq",
#                 "apt-get install -y -qq build-essential cmake gdb valgrind"
#             ],
#             "extensions": [".c", ".cpp", ".h", ".hpp", ".cc", ".cxx"],
#             "runtime_cmd": "gcc"
#         },
#         "go": {
#             "image": "golang:1.21-alpine",
#             "memory": "128m", 
#             "cpu": "0.5",
#             "setup_commands": [
#                 "apk add --no-cache git build-base"
#             ],
#             "extensions": [".go"],
#             "runtime_cmd": "go"
#         },
#         "multi-lang": {
#             "image": "ubuntu:22.04",
#             "memory": "512m",
#             "cpu": "1.5",
#             "setup_commands": [
#                 "apt-get update -qq",
#                 "apt-get install -y -qq python3 python3-pip nodejs npm gcc g++ golang-go git curl wget vim nano",
#                 "pip3 install --no-cache-dir pandas numpy matplotlib requests seaborn plotly",
#                 "npm install -g typescript ts-node"
#             ],
#             "extensions": [".py", ".js", ".ts", ".c", ".cpp", ".go", ".sh"],
#             "runtime_cmd": "auto-detect"
#         }
#     }
    
#     def __init__(self, root: Path,
#                  container_workspace: Optional[Path] = None,
#                  mongodb_uri: str = "mongodb+srv://Motionfog:Dropleton123@cluster0.xvptlon.mongodb.net/Curiositylab",
#                  database_name: str = "Curiositylab",
#                  workspace_id: str = None,
#                  language_profile: str = "multi-lang",
#                  auto_detect_language: bool = True,
#                  max_inactive_time: int = 1600):
        
#         # Core configuration - MUST be first
#         self.workspace_id = workspace_id or self._generate_workspace_id()
#         print(workspace_id, "workspace_id")
    
#         self.language_profile = language_profile
#         self.auto_detect_language = auto_detect_language
#         self.max_inactive_time = max_inactive_time
#         self.last_activity = datetime.now()
        
#         # Get language configuration - BEFORE any other operations
#         self.lang_config = self.LANGUAGE_CONFIGS.get(language_profile, self.LANGUAGE_CONFIGS["multi-lang"])
        
#         # Initialize ALL REQUIRED ATTRIBUTES first
#         self.docker_image = self.lang_config["image"]  # FIX: Initialize this early
#         self.container_memory_limit = self.lang_config["memory"]
#         self.container_cpu_limit = self.lang_config["cpu"]
        
#         # MongoDB configuration
#         self.mongodb_uri = mongodb_uri
#         self.database_name = database_name
#         self.use_mongodb = bool(mongodb_uri)
        
#         # Initialize security and file filtering
#         self._init_file_filters()
#         self._init_security_filters()
        
#         # File system setup
#         self.container_workspace = container_workspace.absolute() if container_workspace else None
#         self.temp_dir = tempfile.mkdtemp(prefix=f"workspace_{self.workspace_id}_")
#         self.root = Path(self.temp_dir)
#         self.container_workspace_path = "/workspace"
        
#         # Additional required attributes
#         self.max_file_size = 10 * 1024 * 1024  # 10MB
#         self._dirty_files = set()
#         self.network_mode = "bridge"  # FIX: Changed from "none" to allow internet access
        
#         # Docker setup - initialize before restore
#         self.docker_client = None
#         self.active_container = None
        
#         # Initialize MongoDB connection
#         if self.use_mongodb:
#             self._init_mongodb()
        
#         # Initialize workspace
#         logger.info(f"🚀 Initializing workspace {self.workspace_id} with {self.language_profile} profile")
        
#         # Initialize Docker
#         self._init_docker()
        
#         # Restore workspace AFTER all attributes are initialized
#         if self.use_mongodb:
#             self._restore_workspace()
        
#         # Setup container and start monitoring
#         self._setup_container_async()
#         self._start_monitoring()
        
#         logger.info(f"✅ Workspace {self.workspace_id} initialized successfully")

#     def _init_file_filters(self):
#         """Initialize comprehensive security-focused file filtering rules"""
#         # Security-sensitive files that should NEVER be accessible
#         self.security_blocked_files = {
#             '.env', '.env.local', '.env.development', '.env.production', '.env.test',
#             '.envrc', '.env.example', '.environment',
#             'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',  # SSH keys
#             'id_rsa.pub', 'id_dsa.pub', 'id_ecdsa.pub', 'id_ed25519.pub',
#             'known_hosts', 'authorized_keys', 'ssh_config',
#             '.aws/credentials', '.aws/config',  # AWS credentials
#             '.gcp/credentials.json', 'service-account.json',  # GCP
#             '.docker/config.json',  # Docker credentials
#             'config.json', 'credentials.json', 'secrets.json',
#             '.npmrc', '.pypirc', '.gitconfig',  # Package manager configs
#             'password.txt', 'passwords.txt', 'secret.txt', 'secrets.txt',
#             '.htpasswd', '.passwd', 'shadow', 'gshadow',
#             'private.key', 'private.pem', 'cert.key', 'server.key',
#             'wallet.dat', 'keystore', '.keystore',
#             # Database connection files
#             'database.yml', 'db_config.yml', 'database.json'
#         }
        
#         # Security-sensitive directories that should be blocked
#         self.security_blocked_dirs = {
#             '.ssh', '.gnupg', '.aws', '.gcp', '.azure', '.kube',
#             '.docker', 'secrets', 'private', 'keys', 'certs',
#             '/etc', '/var', '/usr', '/root', '/home', '/opt',
#             'C:\\Users', 'C:\\Windows', 'C:\\Program Files'
#         }
        
#         # Patterns for potentially dangerous files
#         self.security_blocked_patterns = {
#             '*.key', '*.pem', '*.crt', '*.p12', '*.pfx',
#             '*.keystore', '*.jks', '*.truststore',
#             '*password*', '*secret*', '*credential*', '*token*',
#             '*.env*', '*config.json', '*credentials*',
#             '*.sql', '*.db', '*.sqlite*',  # Database files
#             '*.exe', '*.msi', '*.dmg', '*.pkg', '*.deb', '*.rpm'  # Executables
#         }
        
#         # Standard exclusions for performance/space
#         self.excluded_dirs = {
#             'node_modules', '.git', '.next', '.nuxt', 'dist', 'build',
#             '.cache', '.vscode', '.idea', '__pycache__', '.pytest_cache',
#             '.mypy_cache', 'venv', 'env', 'vendor', 'target', 'bin', 'obj',
#             '.gradle', 'coverage', '.nyc_output', 'logs', 'tmp', 'temp'
#         }
        
#         self.excluded_patterns = {
#             '*.log', '*.tmp', '*.temp', '*.cache', '*.pid', '*.lock',
#             '*.swp', '*.swo', '*~', '.DS_Store', 'Thumbs.db',
#             '*.zip', '*.tar.gz', '*.rar', '*.7z', '*.tar', '*.gz',
#             '*.mp4', '*.avi', '*.mov', '*.wmv', '*.flv', '*.mkv'
#         }
        
#         # Files that are safe and important to preserve
#         self.allowed_files = {
#             'package.json', 'requirements.txt', 'Pipfile', 'pyproject.toml',
#             'setup.py', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
#             'README.md', 'LICENSE', 'Makefile', 'tsconfig.json',
#             'webpack.config.js', 'vite.config.js', 'next.config.js',
#             'tailwind.config.js', 'postcss.config.js', '.gitignore'
#         }

#     def _init_security_filters(self):
#         """Initialize security filters"""
#         self.dangerous_patterns = [
#             '../', '..\\', '/etc/', '/var/', '/root/', '/home/',
#             'c:\\', 'd:\\', '\\windows\\', '\\users\\',
#             '/proc/', '/sys/', '/dev/', '/bin/rm', '/bin/dd'
#         ]
        
#         self.blocked_commands = {
#             'rm -rf /', 'dd if=', 'mkfs', 'fdisk', 'mount', 'umount',
#             'passwd', 'su', 'sudo', 'chmod 777', 'chown root'
#         }

#     def _generate_workspace_id(self) -> str:
#         """Generate unique workspace ID"""
#         timestamp = str(int(time.time()))
#         random_part = hashlib.md5(os.urandom(16)).hexdigest()[:8]
#         return f"ws_{timestamp}_{random_part}"
    
#     def _init_mongodb(self):
#         """Initialize MongoDB connection with secure collections"""
#         try:
#             self.client = MongoClient(self.mongodb_uri)
#             self.db = self.client[self.database_name]
#             self.workspaces_collection = self.db.secure_workspaces
#             self.files_collection = self.db.secure_files
#             self.fs = gridfs.GridFS(self.db, collection="secure_fs")
            
#             # Create indexes for better performance
#             self.workspaces_collection.create_index("workspace_id")
#             self.files_collection.create_index([("workspace_id", 1), ("file_path", 1)])
            
#             logger.info(f"Connected to secure MongoDB: {self.mongodb_uri}")
#         except Exception as e:
#             logger.error(f"Failed to connect to MongoDB: {e}")
#             raise
    
#     def _load_file_from_mongodb(self, rel_path: str) -> bool:
#         """Load file from MongoDB to container workspace"""
#         try:
#             file_doc = self.files_collection.find_one({
#                 "workspace_id": self.workspace_id,
#                 "file_path": rel_path
#             })
            
#             if file_doc and 'content' in file_doc:
#                 local_path = Path(self.temp_dir) / rel_path
#                 local_path.parent.mkdir(parents=True, exist_ok=True)
                
#                 content = file_doc['content']
#                 if isinstance(content, bytes):
#                     local_path.write_bytes(content)
#                 else:
#                     local_path.write_bytes(bytes(content))
                
#                 logger.debug(f"Loaded secure file: {rel_path}")
#                 return True
                
#             return False
            
#         except Exception as e:
#             logger.error(f"Failed to load file securely: {e}")
#             return False
        
#     def _restore_workspace(self):
#         """
#         Restores workspace from MongoDB. If the workspace does not exist,
#         it creates a new metadata entry for it.
#         """
#         logger.info(f"--- [STARTING RESTORE] Attempting to restore workspace: '{self.workspace_id}' ---")
        
#         # This check is crucial for when MongoDB is disabled
#         if not self.use_mongodb:
#             logger.warning("MongoDB is disabled. Skipping workspace restore.")
#             return
    
#         try:
#             # Check if the WORKSPACE METADATA exists first
#             workspace_doc = self.workspaces_collection.find_one({
#                 "workspace_id": self.workspace_id
#             })
    
#             if workspace_doc:
#                 logger.info(f"SUCCESS: Found existing workspace document for '{self.workspace_id}'.")
                
#                 # Now, restore the files associated with it
#                 files_cursor = self.files_collection.find({
#                     "workspace_id": self.workspace_id
#                 })
                
#                 restored_count = 0
#                 for file_doc in files_cursor:
#                     rel_path = file_doc["file_path"]
#                     if self._load_file_from_mongodb(rel_path):
#                         restored_count += 1
                
#                 logger.info(f"--- [RESTORE COMPLETE] Restored {restored_count} files for workspace: {self.workspace_id} ---")
    
#             else:
#                 # THIS IS THE LOGIC THAT CREATES A NEW WORKSPACE
#                 logger.warning(f"FAILURE: No workspace document found for '{self.workspace_id}'.")
#                 self._save_workspace_metadata() # Create the metadata record
#                 logger.info(f"CREATED new (empty) workspace metadata entry: {self.workspace_id}")
    
#         except Exception as e:
#             import traceback
#             traceback.print_exc()
#             logger.error(f"CRITICAL ERROR in _restore_workspace: {e}")


#     # Original methods - keeping same signatures
#     def workspace_path(self, path: Path | str) -> Path:
#         """Convert a path to workspace-relative path"""
#         self._update_activity()
#         path = Path(path)
        
#         # If it's already absolute, return as-is
#         if path.is_absolute():
#             return path
        
#         # For relative paths, make them relative to root
#         full_path = self.root / path
        
#         # If file doesn't exist locally, try to load from MongoDB
#         if not full_path.exists():
#             self._load_file_from_mongodb(full_path)
        
#         return full_path
    
#     def relative_path(self, path: Path | str) -> Path:
#         """Get path relative to workspace root"""
#         self._update_activity()
#         path = Path(path)
#         abs_path = self.workspace_path(path)
        
#         try:
#             return abs_path.relative_to(self.root)
#         except ValueError:
#             # If path is not under root, return the absolute path
#             return abs_path
    
#     def ensure_path_exists(self, path: Path | str) -> Path:
#         """Ensure a path exists and return the absolute path"""
#         self._update_activity()
#         full_path = self.workspace_path(path)
#         full_path.parent.mkdir(parents=True, exist_ok=True)
        
#         return full_path
    
#     def sync_workspace_to_db(self):
#         """Sync workspace to MongoDB with security filtering"""
#         self._update_activity()
#         logger.info("Starting secure workspace sync")
        
#         if not Path(self.temp_dir).exists():
#             return
        
#         # Get all files in temp directory
#         local_files = set()
#         for file_path in Path(self.temp_dir).rglob("*"):
#             if file_path.is_file():
#                 rel_path = str(file_path.relative_to(Path(self.temp_dir)))
#                 if self._should_save_to_mongodb(file_path):
#                     local_files.add(rel_path)
#                     self._save_file_to_mongodb(file_path)
        
#         # Clean up removed files from DB
#         db_files = {
#             doc['file_path'] 
#             for doc in self.files_collection.find(
#                 {"workspace_id": self.workspace_id}, 
#                 {"file_path": 1}
#             )
#         }
        
#         files_to_delete = db_files - local_files
#         for rel_path in files_to_delete:
#             self.files_collection.delete_one({
#                 "workspace_id": self.workspace_id,
#                 "file_path": rel_path
#             })
        
#         self._save_workspace_metadata()
#         logger.info(f"Synced {len(local_files)} secure files")
    
#     def _save_workspace_metadata(self):
#         """Save workspace metadata"""
#         if not self.use_mongodb:
#             logger.debug("MongoDB disabled, skipping metadata save")
#             return
            
#         try:
#             workspace_doc = {
#                 "workspace_id": self.workspace_id,
#                 "docker_image": getattr(self, 'docker_image', 'unknown'),  # Safe access
#                 "language_profile": self.language_profile,
#                 "created_at": datetime.now(),
#                 "updated_at": datetime.now(),
#                 "last_activity": self.last_activity,
#                 "security_version": "1.0",
#                 "container_id": self.active_container.id if self.active_container else None,
#                 "container_status": self.active_container.status if self.active_container else "none",
#                 "temp_dir": self.temp_dir,
#                 "max_file_size": getattr(self, 'max_file_size', 10 * 1024 * 1024)
#             }
            
#             result = self.workspaces_collection.update_one(
#                 {"workspace_id": self.workspace_id},
#                 {"$set": workspace_doc},
#                 upsert=True
#             )
            
#             if result.upserted_id:
#                 logger.info(f"✅ Created new workspace metadata: {self.workspace_id}")
#             elif result.modified_count > 0:
#                 logger.info(f"✅ Updated workspace metadata: {self.workspace_id}")
#             else:
#                 logger.debug(f"📝 Workspace metadata unchanged: {self.workspace_id}")
                
#         except Exception as e:
#             logger.error(f"Failed to save workspace metadata: {e}")
#             import traceback
#             traceback.print_exc()

#     def _init_docker(self):
#         """Initialize Docker client and pull image if needed"""
#         try:
#             self.docker_client = docker.from_env()
            
#             # Check if image exists, pull if not
#             try:
#                 self.docker_client.images.get(self.docker_image)
#                 logger.info(f"✅ Docker image '{self.docker_image}' found")
#             except docker.errors.ImageNotFound:
#                 logger.info(f"📥 Pulling Docker image '{self.docker_image}'...")
#                 self.docker_client.images.pull(self.docker_image)
#                 logger.info(f"✅ Image '{self.docker_image}' pulled successfully")
                
#         except Exception as e:
#             logger.error(f"❌ Docker initialization failed: {e}")
#             raise DockerError(f"Failed to initialize Docker: {e}")
    
#     def _setup_container_async(self):
#         """Create and configure the Docker container with better performance"""
#         try:
#             # Parse resource limits
#             memory_mb = self._parse_memory(self.lang_config["memory"])
#             cpu_limit = float(self.lang_config["cpu"])
            
#             # Environment variables
#             environment = {
#                 "PYTHONPATH": self.container_workspace_path,
#                 "HOME": self.container_workspace_path,
#                 "WORKSPACE_ID": self.workspace_id,
#                 "LANGUAGE_PROFILE": self.language_profile,
#                 "DEBIAN_FRONTEND": "noninteractive"
#             }
            
#             # Add display setup for visualization
#             if self.lang_config.get("display_setup"):
#                 environment.update({
#                     "DISPLAY": ":99",
#                     "MPLBACKEND": "Agg"
#                 })
            
#             logger.info("🐳 Creating Docker container...")
#             # Create container with network access for package installation
#             self.active_container = self.docker_client.containers.run(
#                 image=self.docker_image,
#                 command="sleep infinity",
#                 detach=True,
#                 remove=False,
                
#                 # Resource limits
#                 mem_limit=f"{memory_mb}m",
#                 cpu_quota=int(cpu_limit * 100000),
#                 cpu_period=100000,
                
#                 # Security settings - Allow network for package installation
#                 network_mode="bridge",  # Changed from "none" to "bridge"
#                 user="root",  # Need root for package installation
#                 cap_drop=["ALL"],
#                 cap_add=["SETUID", "SETGID", "DAC_OVERRIDE", "NET_ADMIN"],  # Added NET_ADMIN
#                 security_opt=["no-new-privileges:true"],
                
#                 # Mount workspace directory
#                 volumes={
#                     self.temp_dir: {
#                         'bind': self.container_workspace_path,
#                         'mode': 'rw'
#                     }
#                 },
                
#                 environment=environment,
#                 name=f"workspace_{self.workspace_id}",
#                 hostname="workspace"
#             )
            
#             logger.info(f"✅ Container created: {self.active_container.short_id}")
            
#             # Install packages in background for better user experience
#             threading.Thread(target=self._install_packages_background, daemon=True).start()
            
#         except Exception as e:
#             logger.error(f"❌ Container setup failed: {e}")
#             raise DockerError(f"Failed to setup container: {e}")
    
#     def _update_activity(self):
#         """Update last activity timestamp"""
#         self.last_activity = datetime.now()
    

#     def _install_packages_background(self):
#         """Install required packages in the background"""
#         setup_commands = self.lang_config.get("setup_commands", [])
        
#         if not setup_commands:
#             logger.info("No packages to install")
#             return
        
#         # Wait a bit for container to fully start
#         time.sleep(2)
        
#         for i, command in enumerate(setup_commands, 1):
#             logger.info(f"📦 Installing packages ({i}/{len(setup_commands)}): {command[:50]}...")
            
#             # Add timeout and retry logic
#             max_retries = 3
#             for attempt in range(max_retries):
#                 exit_code, stdout, stderr = self._execute_in_container(command)
                
#                 if exit_code == 0:
#                     logger.info(f"✅ Package installation step {i} completed")
#                     break
#                 else:
#                     if attempt < max_retries - 1:
#                         logger.warning(f"⚠️  Package installation attempt {attempt + 1} failed, retrying...")
#                         time.sleep(5)
#                     else:
#                         logger.error(f"❌ Package installation step {i} failed after {max_retries} attempts:")
#                         logger.error(f"   Command: {command}")
#                         logger.error(f"   Exit code: {exit_code}")
#                         logger.error(f"   Stderr: {stderr[:200]}...")
        
#         logger.info("🎉 Package installation process completed")
        
#         # After packages are installed, optionally restrict network access
#         # (This is more complex and might require recreating the container)
#         if hasattr(self, 'restrict_network_after_setup') and self.restrict_network_after_setup:
#             self._restrict_container_network()
    
#     def _parse_memory(self, memory_str: str) -> int:
#         """Parse memory string like '512m' to MB integer"""
#         memory_str = memory_str.lower().strip()
#         if memory_str.endswith('m'):
#             return int(memory_str[:-1])
#         elif memory_str.endswith('g'):
#             return int(memory_str[:-1]) * 1024
#         else:
#             return int(memory_str)  # Assume MB
    
#     # ADD MISSING METHODS
#     def list_files(self,include_excluded=True) -> List[str]:
#         """List all secure files in workspace"""
#         try:
#             self._update_activity()
#             files = set()
            
#             # Local files
#             if Path(self.temp_dir).exists():
#                 for file_path in Path(self.temp_dir).rglob("*"):
#                     if file_path.is_file() and self._should_save_to_mongodb(file_path):
#                         rel_path = str(file_path.relative_to(Path(self.temp_dir)))
#                         files.add(rel_path)
            
#             # MongoDB files
#             mongo_files = self.files_collection.find({"workspace_id": self.workspace_id})
#             for file_doc in mongo_files:
#                 files.add(file_doc["file_path"])
            
#             return sorted(list(files))
            
#         except Exception as e:
#             logger.error(f"Failed to list files: {e}")
#             return []
    
#     def read_file(self, path: str) -> Optional[bytes]:
#         """Read file securely from container workspace"""
#         try:
#             self._update_activity()
            
#             if self._is_path_dangerous(path):
#                 logger.warning(f"SECURITY: Blocked dangerous read path: {path}")
#                 return None
            
#             local_path = Path(self.temp_dir) / path
            
#             if local_path.exists():
#                 return local_path.read_bytes()
            
#             # Try loading from MongoDB
#             if self._load_file_from_mongodb(path):
#                 return local_path.read_bytes()
            
#             return None
            
#         except Exception as e:
#             logger.error(f"Failed to read file securely: {e}")
#             return None
    
#     def _detect_language(self, code: str, filename: str = None) -> str:
#         """Detect programming language from code or filename"""
#         if filename:
#             ext = Path(filename).suffix.lower()
#             if ext == '.py':
#                 return 'python'
#             elif ext in ['.js', '.jsx']:
#                 return 'javascript'
#             elif ext in ['.ts', '.tsx']:
#                 return 'typescript'
#             elif ext == '.c':
#                 return 'c'
#             elif ext in ['.cpp', '.cc', '.cxx']:
#                 return 'cpp'
#             elif ext == '.go':
#                 return 'go'
        
#         # Simple heuristic based on code content
#         code_lower = code.lower()
#         if any(keyword in code_lower for keyword in ['import ', 'def ', 'print(']):
#             return 'python'
#         elif any(keyword in code_lower for keyword in ['console.log', 'function ', 'const ', 'let ']):
#             return 'javascript'
#         elif any(keyword in code_lower for keyword in ['#include', 'int main']):
#             return 'c' if 'iostream' not in code_lower else 'cpp'
#         elif 'package main' in code_lower or 'func main' in code_lower:
#             return 'go'
        
#         return 'python'  # Default
    

#     def _is_command_safe(self, command: str) -> bool:
#         """Check if command is safe to execute"""
#         command_lower = command.lower()
        
#         # Check for dangerous patterns
#         if any(pattern in command_lower for pattern in self.dangerous_patterns):
#             return False
            
#         # Check for blocked commands
#         if any(blocked in command_lower for blocked in self.blocked_commands):
#             return False
            
#         return True
    
#     def _execute_in_container(self, command: str | List[str], working_dir: str = None) -> Tuple[int, str, str]:
#         """Execute command in the container"""
#         try:
#             self._update_activity()
            
#             if not self.active_container:
#                 raise DockerError("No active container")
            
#             # Safety check for string commands
#             if isinstance(command, str) and not self._is_command_safe(command):
#                 return 1, "", "Command blocked for security reasons"
            
#             if isinstance(command, str):
#                 command = ["/bin/bash", "-c", command]
            
#             exec_result = self.active_container.exec_run(
#                 command,
#                 workdir=working_dir or self.container_workspace_path,
#                 user="root",
#                 environment={"HOME": self.container_workspace_path},
#                 demux=True
#             )
            
#             # Handle demuxed output
#             stdout_bytes = exec_result.output[0] if exec_result.output[0] else b""
#             stderr_bytes = exec_result.output[1] if exec_result.output[1] else b""
            
#             stdout = stdout_bytes.decode('utf-8', errors='replace') if stdout_bytes else ""
#             stderr = stderr_bytes.decode('utf-8', errors='replace') if stderr_bytes else ""
            
#             return exec_result.exit_code, stdout, stderr
            
#         except Exception as e:
#             logger.error(f"Container execution error: {e}")
#             return 1, "", str(e)
    
#     def execute_bash_command(self, command: str, working_dir: str = None) -> Tuple[int, str, str]:
#         """Execute any bash command in the container"""
#         logger.info(f"🔧 Executing bash command: {command}")
#         return self._execute_in_container(command, working_dir)
    
#     def execute_code(self, code: str, language: str = None, filename: str = None) -> Tuple[int, str, str]:
#         """Execute code with automatic language detection"""
#         if language is None:
#             language = self._detect_language(code, filename)
        
#         logger.info(f"🔥 Executing {language} code")
        
#         try:
#             if language == "python":
#                 return self._execute_python(code, filename)
#             elif language in ["javascript", "js"]:
#                 return self._execute_javascript(code, filename)
#             elif language == "typescript":
#                 return self._execute_typescript(code, filename)
#             elif language == "c":
#                 return self._execute_c(code, filename)
#             elif language in ["cpp", "c++"]:
#                 return self._execute_cpp(code, filename)
#             elif language == "go":
#                 return self._execute_go(code, filename)
#             else:
#                 return 1, "", f"Unsupported language: {language}"
                
#         except Exception as e:
#             logger.error(f"Code execution error: {e}")
#             return 1, "", str(e)
     
#     def _execute_python(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Execute Python code with visualization support"""
#         if filename is None:
#             filename = "script.py"
        
#         # Add matplotlib backend for visualization
#         if any(lib in code for lib in ['matplotlib', 'pyplot', 'plt', 'seaborn', 'plotly']):
#             code = "import matplotlib\nmatplotlib.use('Agg')\n" + code
        
#         # Save and execute
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save Python file"
        
#         return self._execute_in_container(f"python3 {filename}")
    
#     def _execute_javascript(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Execute JavaScript code"""
#         if filename is None:
#             filename = "script.js"
        
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save JavaScript file"
        
#         return self._execute_in_container(f"node {filename}")
    
#     def _execute_typescript(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Execute TypeScript code"""
#         if filename is None:
#             filename = "script.ts"
        
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save TypeScript file"
        
#         return self._execute_in_container(f"npx ts-node {filename}")
    
#     def _execute_c(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Compile and execute C code"""
#         if filename is None:
#             filename = "program.c"
        
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save C file"
        
#         # Compile
#         exe_name = Path(filename).stem
#         exit_code, stdout, stderr = self._execute_in_container(f"gcc -o {exe_name} {filename}")
        
#         if exit_code != 0:
#             return exit_code, stdout, f"Compilation failed:\n{stderr}"
        
#         # Execute
#         return self._execute_in_container(f"./{exe_name}")
    
#     def _execute_cpp(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Compile and execute C++ code"""
#         if filename is None:
#             filename = "program.cpp"
        
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save C++ file"
        
#         # Compile
#         exe_name = Path(filename).stem
#         exit_code, stdout, stderr = self._execute_in_container(f"g++ -std=c++17 -o {exe_name} {filename}")
        
#         if exit_code != 0:
#             return exit_code, stdout, f"Compilation failed:\n{stderr}"
        
#         # Execute
#         return self._execute_in_container(f"./{exe_name}")
    
#     def _execute_go(self, code: str, filename: str = None) -> Tuple[int, str, str]:
#         """Execute Go code"""
#         if filename is None:
#             filename = "program.go"
        
#         if not self.save_file(filename, code):
#             return 1, "", "Failed to save Go file"
        
#         return self._execute_in_container(f"go run {filename}")
    
#     # ADD ALL OTHER MISSING METHODS HERE...
#     def _is_path_dangerous(self, path: str) -> bool:
#         """Check if path is potentially dangerous"""
#         path = str(path).lower()
#         dangerous_patterns = [
#             '../', '..\\', '/etc/', '/var/', '/root/', '/home/',
#             'c:\\', 'd:\\', '\\windows\\', '\\users\\',
#             '.env', 'password', 'secret', 'credential', 'key',
#             '/proc/', '/sys/', '/dev/'
#         ]
        
#         return any(pattern in path for pattern in dangerous_patterns)

#     def _is_security_blocked(self, file_path: Path) -> bool:
#         """Check if file is blocked for security reasons"""
#         try:
#             path_str = str(file_path).lower()
#             file_name = file_path.name.lower()
            
#             # Check blocked files
#             if file_name in self.security_blocked_files:
#                 logger.warning(f"SECURITY BLOCK: Blocked sensitive file: {file_path}")
#                 return True
            
#             # Check blocked directories
#             path_parts = Path(path_str).parts
#             for part in path_parts:
#                 if part in self.security_blocked_dirs:
#                     logger.warning(f"SECURITY BLOCK: Blocked sensitive directory: {file_path}")
#                     return True
            
#             # Check blocked patterns
#             for pattern in self.security_blocked_patterns:
#                 if fnmatch.fnmatch(file_name, pattern.lower()):
#                     logger.warning(f"SECURITY BLOCK: Blocked pattern match: {file_path}")
#                     return True
            
#             # Additional security checks
#             if file_path.exists() and self._contains_secrets_heuristic(file_path):
#                 logger.warning(f"SECURITY BLOCK: Potential secrets detected: {file_path}")
#                 return True
            
#             return False
            
#         except Exception as e:
#             logger.error(f"Error in security check for {file_path}: {e}")
#             return True  # Fail secure
    
#     def _contains_secrets_heuristic(self, file_path: Path) -> bool:
#         """Heuristic check for potential secrets in file content"""
#         try:
#             if not file_path.exists() or file_path.stat().st_size > 1024 * 1024:  # Skip large files
#                 return False
            
#             # Patterns that might indicate secrets
#             secret_patterns = [
#                 r'password\s*[=:]\s*["\']?[^\s"\']{8,}',
#                 r'secret\s*[=:]\s*["\']?[^\s"\']{16,}',
#                 r'token\s*[=:]\s*["\']?[^\s"\']{20,}',
#                 r'key\s*[=:]\s*["\']?[^\s"\']{16,}',
#                 r'api[_-]?key\s*[=:]\s*["\']?[^\s"\']{16,}',
#                 r'[a-zA-Z0-9]{32,}',  # Long hex strings
#                 r'-----BEGIN [A-Z ]+-----'  # PEM format
#             ]
            
#             try:
#                 content = file_path.read_text(encoding='utf-8', errors='ignore')[:4096]  # First 4KB only
#                 import re
#                 for pattern in secret_patterns:
#                     if re.search(pattern, content, re.IGNORECASE):
#                         return True
#             except:
#                 pass  # If we can't read it, assume it's not a secret
                
#             return False
            
#         except Exception:
#             return False

#     def _should_save_to_mongodb(self, file_path: Path) -> bool:
#         """Enhanced security-aware file filtering"""
#         try:
#             # Security check first - this is critical
#             if self._is_security_blocked(file_path):
#                 return False
            
#             file_name = file_path.name
#             path_parts = file_path.parts
            
#             # Always allow explicitly allowed files
#             if file_name in self.allowed_files:
#                 return True
            
#             # Check standard exclusions
#             for part in path_parts:
#                 if part in self.excluded_dirs:
#                     return False
            
#             for pattern in self.excluded_patterns:
#                 if fnmatch.fnmatch(file_name, pattern):
#                     return False
            
#             # File size check
#             if file_path.exists() and file_path.stat().st_size > self.max_file_size:
#                 logger.warning(f"File too large: {file_path}")
#                 return False
            
#             # Binary file check with allowances
#             if file_path.exists() and self._is_likely_binary(file_path):
#                 # Allow small images for web projects
#                 if file_path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp'}:
#                     return file_path.stat().st_size <= 1024 * 1024  # 1MB limit
#                 return False
            
#             return True
            
#         except Exception as e:
#             logger.error(f"Error checking file {file_path}: {e}")
#             return False
    
#     def _is_likely_binary(self, file_path: Path) -> bool:
#         """Check if file is likely binary"""
#         try:
#             text_extensions = {
#                 '.txt', '.md', '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.scss', '.sass',
#                 '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash',
#                 '.zsh', '.fish', '.ps1', '.bat', '.cmd', '.dockerfile', '.sql', '.r', '.php',
#                 '.rb', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.vb', '.swift',
#                 '.kt', '.scala', '.clj', '.hs', '.elm', '.vue', '.svelte', '.astro', '.prisma'
#             }
            
#             if file_path.suffix.lower() in text_extensions:
#                 return False
            
#             if file_path.stat().st_size > 1024 * 1024:
#                 return True
                
#             try:
#                 with open(file_path, 'rb') as f:
#                     chunk = f.read(1024)
#                     if b'\x00' in chunk:
#                         return True
#                     chunk.decode('utf-8')
#                     return False
#             except (UnicodeDecodeError, OSError):
#                 return True
                
#         except Exception:
#             return True

#     def save_file(self, path: str, content: str | bytes) -> bool:
#         """Save file securely in container workspace"""
#         try:
#             self._update_activity()
            
#             # Validate path for security
#             if self._is_path_dangerous(path):
#                 logger.warning(f"SECURITY: Blocked dangerous path: {path}")
#                 return False
            
#             local_path = Path(self.temp_dir) / path
            
#             # Security check
#             if self._is_security_blocked(local_path):
#                 return False
            
#             local_path.parent.mkdir(parents=True, exist_ok=True)
            
#             if isinstance(content, str):
#                 content_bytes = content.encode('utf-8')
#                 local_path.write_text(content, encoding='utf-8')
#             else:
#                 content_bytes = content
#                 local_path.write_bytes(content)
            
#             # Save to MongoDB if allowed and enabled
#             if self.use_mongodb and self._should_save_to_mongodb(local_path):
#                 self._save_file_to_mongodb(local_path, content_bytes)
            
#             logger.info(f"✅ File saved: {path}")
#             return True
            
#         except Exception as e:
#             logger.error(f"Failed to save file securely: {e}")
#             return False

#     def _save_file_to_mongodb(self, file_path: Path, content: bytes = None):
#         """Save file to MongoDB with enhanced security"""
#         try:
#             if not self._should_save_to_mongodb(file_path):
#                 return
            
#             rel_path = str(file_path.relative_to(Path(self.temp_dir)))
            
#             if content is None and file_path.exists():
#                 content = file_path.read_bytes()
            
#             if content is not None and len(content) <= self.max_file_size:
#                 # Additional security scan of content
#                 if self._scan_content_for_secrets(content):
#                     logger.warning(f"SECURITY: Blocked file with potential secrets: {rel_path}")
#                     return
                
#                 file_doc = {
#                     "workspace_id": self.workspace_id,
#                     "file_path": rel_path,
#                     "content": content,
#                     "size": len(content),
#                     "content_hash": hashlib.sha256(content).hexdigest(),
#                     "created_at": datetime.now(),
#                     "updated_at": datetime.now(),
#                     "security_scanned": True
#                 }
                
#                 self.files_collection.update_one(
#                     {"workspace_id": self.workspace_id, "file_path": rel_path},
#                     {"$set": file_doc},
#                     upsert=True
#                 )
                
#                 logger.debug(f"Saved secure file to MongoDB: {rel_path}")
                
#         except Exception as e:
#             logger.error(f"Failed to save file to MongoDB: {e}")

#     def _scan_content_for_secrets(self, content: bytes) -> bool:
#         """Scan file content for potential secrets"""
#         try:
#             # Convert to string for pattern matching
#             text = content.decode('utf-8', errors='ignore')[:8192]  # First 8KB only
            
#             import re
#             dangerous_patterns = [
#                 r'password\s*[=:]\s*["\']?[^\s"\']{6,}',
#                 r'secret\s*[=:]\s*["\']?[^\s"\']{12,}',
#                 r'api[_-]?key\s*[=:]\s*["\']?[^\s"\']{12,}',
#                 r'token\s*[=:]\s*["\']?[^\s"\']{16,}',
#                 r'-----BEGIN [A-Z ]+-----',
#                 r'AKIA[0-9A-Z]{16}',  # AWS Access Key
#                 r'[0-9a-f]{32}',      # MD5/similar hashes
#                 r'[0-9a-f]{40}',      # SHA1 hashes
#                 r'[0-9a-f]{64}',      # SHA256 hashes
#             ]
            
#             for pattern in dangerous_patterns:
#                 if re.search(pattern, text, re.IGNORECASE | re.MULTILINE):
#                     return True
                    
#             return False
            
#         except Exception:
#             return False  # If we can't scan, allow it

#     def create_project_structure(self, project_type: str) -> Tuple[bool, str]:
#         """Create a standard project structure"""
#         try:
#             structures = {
#                 "python": {
#                     "main.py": "# Python main file\nprint('Hello, World!')\n",
#                     "requirements.txt": "# Python dependencies\n",
#                     "README.md": "# Python Project\n\nDescription of your project.\n",
#                     "src/__init__.py": "",
#                     "tests/test_main.py": "# Test file\nimport unittest\n\nclass TestMain(unittest.TestCase):\n    def test_example(self):\n        self.assertTrue(True)\n"
#                 },
#                 "javascript": {
#                     "index.js": "// JavaScript main file\nconsole.log('Hello, World!');\n",
#                     "package.json": '{\n  "name": "my-project",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "start": "node index.js"\n  }\n}',
#                     "README.md": "# JavaScript Project\n\nDescription of your project.\n",
#                     "src/app.js": "// Application logic\n",
#                     "tests/app.test.js": "// Test file\n"
#                 },
#                 "cpp": {
#                     "main.cpp": "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, World!\" << std::endl;\n    return 0;\n}",
#                     "Makefile": "CXX = g++\nCXXFLAGS = -std=c++17 -Wall -Wextra\nTARGET = main\nSOURCES = main.cpp\n\n$(TARGET): $(SOURCES)\n\t$(CXX) $(CXXFLAGS) -o $(TARGET) $(SOURCES)\n\nclean:\n\trm -f $(TARGET)\n",
#                     "README.md": "# C++ Project\n\nDescription of your project.\n",
#                     "src/main.cpp": "#include <iostream>\n\nint main() {\n    std::cout << \"Hello from src!\" << std::endl;\n    return 0;\n}"
#                 },
#                 "go": {
#                     "main.go": "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello, World!\")\n}",
#                     "go.mod": "module my-project\n\ngo 1.21\n",
#                     "README.md": "# Go Project\n\nDescription of your project.\n",
#                     "cmd/main.go": "package main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello from cmd!\")\n}"
#                 }
#             }
            
#             if project_type not in structures:
#                 return False, f"❌ Unknown project type: {project_type}. Available: {list(structures.keys())}"
            
#             files_created = []
#             for file_path, content in structures[project_type].items():
#                 if self.save_file(file_path, content):
#                     files_created.append(file_path)
            
#             return True, f"✅ Created {project_type} project structure:\n" + "\n".join(f"  📄 {f}" for f in files_created)
            
#         except Exception as e:
#             return False, f"❌ Project creation error: {str(e)}"

#     def get_workspace_info(self) -> Dict[str, Any]:
#         """Get workspace information"""
#         saved_files = len(self.list_files(include_excluded=False))
#         total_files = len(self.list_files(include_excluded=True))
        
#         return {
#             "workspace_id": self.workspace_id,
#             "root": str(self.root),
#             "temp_dir": str(self.temp_dir),
#             "container_workspace": str(self.container_workspace) if self.container_workspace else None,
#             "last_activity": self.last_activity.isoformat(),
#             "language_profile": self.language_profile,
#             "container_status": self.active_container.status if self.active_container else "none",
#             "saved_files": saved_files,
#             "total_files": total_files,
#             "dirty_files": len(self._dirty_files),
#             "max_file_size": self.max_file_size,
#             "excluded_dirs": len(self.excluded_dirs),
#             "excluded_patterns": len(self.excluded_patterns),
#             "mongodb_enabled": self.use_mongodb
#         }

#     def _start_monitoring(self):
#         """Start background monitoring thread"""
#         def monitor():
#             while True:
#                 try:
#                     time.sleep(300)  # Check every 5 minutes
                    
#                     # Check if container is still active
#                     if self.active_container:
#                         try:
#                             self.active_container.reload()
#                             if self.active_container.status != 'running':
#                                 logger.warning("🔄 Container stopped, recreating...")
#                                 self._setup_container_async()
#                         except:
#                             logger.warning("🔄 Container lost, recreating...")
#                             self.active_container = None
#                             self._setup_container_async()
                    
#                     # Check for inactivity
#                     if datetime.now() - self.last_activity > timedelta(seconds=self.max_inactive_time):
#                         logger.info("💤 Workspace inactive for too long, cleaning up...")
#                         self.cleanup()
#                         break
                        
#                 except Exception as e:
#                     logger.error(f"Monitoring error: {e}")
        
#         monitor_thread = threading.Thread(target=monitor, daemon=True)
#         monitor_thread.start()
#         logger.info("🔍 Background monitoring started")

#     def export_workspace(self) -> Optional[bytes]:
#         """Export workspace as secure tar archive"""
#         try:
#             self._update_activity()
#             self.sync_workspace_to_db()
            
#             # Create tar archive in memory
#             tar_buffer = io.BytesIO()
            
#             with tarfile.open(fileobj=tar_buffer, mode='w:gz') as tar:
#                 # Add workspace metadata
#                 metadata = {
#                     "workspace_id": self.workspace_id,
#                     "created_at": datetime.now().isoformat(),
#                     "security_version": "1.0",
#                     "file_count": len(self.list_files())
#                 }
                
#                 metadata_json = json.dumps(metadata, indent=2)
#                 metadata_info = tarfile.TarInfo(name='workspace_metadata.json')
#                 metadata_info.size = len(metadata_json.encode())
#                 tar.addfile(metadata_info, io.BytesIO(metadata_json.encode()))
                
#                 # Add all secure files
#                 for file_path in self.list_files():
#                     content = self.read_file(file_path)
#                     if content:
#                         file_info = tarfile.TarInfo(name=file_path)
#                         file_info.size = len(content)
#                         tar.addfile(file_info, io.BytesIO(content))
            
#             tar_buffer.seek(0)
#             return tar_buffer.read()
            
#         except Exception as e:
#             logger.error(f"Failed to export workspace: {e}")
#             return None

#     def import_workspace(self, tar_data: bytes) -> bool:
#         """Import workspace from secure tar archive"""
#         try:
#             self._update_activity()
            
#             tar_buffer = io.BytesIO(tar_data)
            
#             with tarfile.open(fileobj=tar_buffer, mode='r:gz') as tar:
#                 for member in tar.getmembers():
#                     if member.isfile():
#                         # Security check on file names
#                         if self._is_path_dangerous(member.name):
#                             logger.warning(f"Skipping dangerous file in import: {member.name}")
#                             continue
                        
#                         if member.name == 'workspace_metadata.json':
#                             continue  # Skip metadata file
                        
#                         # Extract and save file
#                         file_data = tar.extractfile(member)
#                         if file_data:
#                             content = file_data.read()
#                             if not self.save_file(member.name, content):
#                                 logger.warning(f"Failed to import file: {member.name}")
            
#             self.sync_workspace_to_db()
#             logger.info("Workspace imported successfully")
#             return True
            
#         except Exception as e:
#             logger.error(f"Failed to import workspace: {e}")
#             return False


#     def cleanup(self):
#         """Clean up workspace and container"""
#         try:
#             logger.info(f"Cleaning up secure workspace: {self.workspace_id}")
            
#             # Sync before cleanup
#             self.sync_workspace_to_db()
            
#             # Stop and remove container
#             if self.active_container:
#                 try:
#                     self.active_container.stop(timeout=10)
#                     self.active_container.remove(force=True)
#                     logger.info("Container removed successfully")
#                 except Exception as e:
#                     logger.error(f"Failed to remove container: {e}")
            
#             # Clean up temporary directory
#             if self.temp_dir and Path(self.temp_dir).exists():
#                 shutil.rmtree(self.temp_dir, ignore_errors=True)
#                 logger.info("Temporary directory cleaned up")
            
#         except Exception as e:
#             logger.error(f"Cleanup failed: {e}")

    
#     def _cleanup_daemon(self):
#         """Background cleanup daemon"""
#         while True:
#             try:
#                 time.sleep(self.cleanup_interval)
                
#                 # Check if workspace is inactive
#                 if datetime.now() - self.last_activity > timedelta(seconds=self.max_inactive_time):
#                     logger.info(f"Workspace inactive, cleaning up: {self.workspace_id}")
#                     self.cleanup()
#                     break
                
#                 # Periodic sync
#                 self.sync_workspace_to_db()
                
#             except Exception as e:
#                 logger.error(f"Cleanup daemon error: {e}")
    
#     def _start_cleanup_daemon(self):
#         """Start cleanup daemon thread"""
#         daemon_thread = threading.Thread(target=self._cleanup_daemon, daemon=True)
#         daemon_thread.start()
    
    
#     def __enter__(self):
#         return self
    
#     def __exit__(self, exc_type, exc_val, exc_tb):
#         self.cleanup()


# # Custom exceptions
# class DockerError(Exception):
#     """Docker-related errors"""
#     pass


# class WorkspaceFactory:
#     """Factory for creating different types of workspaces"""
    
#     @staticmethod
#     def create_python_workspace(root: Path, workspace_id: str = None, **kwargs) -> DockerWorkspaceManager:
#         """Create Python workspace with data science libraries"""
#         return DockerWorkspaceManager(
#             root=root,
#             workspace_id=workspace_id,
#             language_profile="python-dataviz",
#             **kwargs
#         )
    
#     @staticmethod
#     def create_web_workspace(root: Path, workspace_id: str = None, **kwargs) -> DockerWorkspaceManager:
#         """Create web development workspace"""
#         return DockerWorkspaceManager(
#             root=root,
#             workspace_id=workspace_id,
#             language_profile="javascript",
#             **kwargs
#         )
    
#     @staticmethod
#     def create_systems_workspace(root: Path, workspace_id: str = None, **kwargs) -> DockerWorkspaceManager:
#         """Create systems programming workspace"""
#         return DockerWorkspaceManager(
#             root=root,
#             workspace_id=workspace_id,
#             language_profile="c-cpp",
#             **kwargs
#         )
    
#     @staticmethod
#     def create_multi_language_workspace(root: Path, workspace_id: str = None, **kwargs) -> DockerWorkspaceManager:
#         """Create multi-language workspace"""
#         return DockerWorkspaceManager(
#             root=root,
#             workspace_id=workspace_id,
#             language_profile="python-basic",
#             **kwargs
#         )
