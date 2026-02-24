from argparse import ArgumentParser
import uuid
from pathlib import Path
from Mongodb.db import DatabaseManager
from utilss.workspace_manager import WorkspaceManager
from typing import Dict
def parse_common_args(parser: ArgumentParser):
    parser.add_argument(
        "--workspace",
        type=str,
        default="./workspace",
        help="Path to the workspace",
    )
    parser.add_argument(
        "--logs-path",
        type=str,
        default="agent_logs.txt",
        help="Path to save logs",
    )
    parser.add_argument(
        "--needs-permission",
        "-p",
        help="Ask for permission before executing commands",
        action="store_true",
        default=False,
    )
    parser.add_argument(
        "--use-container-workspace",
        type=str,
        default=None,
        help="(Optional) Path to the container workspace to run commands in.",
    )
    parser.add_argument(
        "--docker-container-id",
        type=str,
        default=None,
        help="(Optional) Docker container ID to run commands in.",
    )
    parser.add_argument(
        "--minimize-stdout-logs",
        help="Minimize the amount of logs printed to stdout.",
        action="store_true",
        default=False,
    )
    parser.add_argument(
        "--project-id",
        type=str,
        default=None,
        help="Project ID to use for Anthropic",
    )
    parser.add_argument(
        "--region",
        type=str,
        default=None,
        help="Region to use for Anthropic",
    )
    parser.add_argument(
        "--context-manager",
        type=str,
        default="file-based",
        choices=["file-based", "standard"],
        help="Type of context manager to use (file-based or standard)",
    )
    return parser


# Global registry for workspace managers
_workspace_registry: Dict[str, 'WorkspaceManager'] = {}

async def create_workspace_manager_for_connection(
    workspace_root: str, 
    db_manager: DatabaseManager,
    user_id:str,
    session_uuid:str,
    use_container_workspace: bool = False,
    database_name: str = "Curiositylab",
    **kwargs
) -> tuple['WorkspaceManager', str]:
    """
    Create async workspace manager for connection
    """
    connection_id = str(session_uuid)
    workspace_path = Path(workspace_root).resolve()
    connection_workspace = workspace_path / connection_id
    connection_workspace.mkdir(parents=True, exist_ok=True)
    # This will sync all files immediately
    workspace_manager = WorkspaceManager(
        root=connection_workspace,
        user_id=user_id,
        db=db_manager,
        container_workspace=connection_workspace if use_container_workspace else None,
        workspace_id=connection_id,
        database_name=database_name,
        **kwargs
    )
    
    # Initialize async components
    # await workspace_manager.force_sync_all_files()
    await workspace_manager.async_init()
    
    # Store in registry for cleanup
    _workspace_registry[connection_id] = workspace_manager
    
    return workspace_manager


# def create_workspace_manager_for_connection_docker(user_id: str, plan: str):
#     """
#     Create a new workspace manager instance for websocket connection
#     """
#     connection_id = str(uuid.uuid4())
#     network_mode = "none"
    
#     workspace_manager = DockerWorkspaceManager(
#         root=Path,
#         workspace_id=connection_id,
#         language_profile="python-basic",
#     )

#     return workspace_manager, connection_id
