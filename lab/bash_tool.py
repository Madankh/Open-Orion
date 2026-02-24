"""Docker-compatible Bash tool for executing shell commands.

This tool integrates with the DockerWorkspaceManager to execute bash commands
in a containerized environment while maintaining the same interface as the original bash tool.
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
import logging
from abc import ABC, abstractmethod
from utilss.workspace_manager import WorkspaceManager
from llm.message_history import MessageHistory
from lab.base import AgentPlugin, AgentImplOutput

# Configure logging
logger = logging.getLogger(__name__)

class CommandFilter(ABC):
    """Abstract base class for command filters.

    Command filters transform commands before they are executed.
    They can be used to implement remote execution, sandboxing, etc.
    """

    @abstractmethod
    def filter_command(self, command: str) -> str:
        """Transform a command before execution.

        Args:
            command: The original command

        Returns:
            The transformed command
        """
        pass


class DockerBashTool(AgentPlugin):
    """A Docker-compatible tool for executing bash commands.

    This tool allows the agent to run shell commands in a Docker container
    using the DockerWorkspaceManager. Commands are executed in a controlled
    containerized environment with appropriate safeguards.
    """

    name = "bash"
    description = """\
Run commands in a bash shell within a Docker container
* When invoking this tool, the contents of the "command" parameter does NOT need to be XML-escaped.
* Commands are executed in an isolated Docker container environment.
* State is persistent across command calls within the same workspace session.
* You have access to common linux and python packages via apt and pip.
* To inspect a particular line range of a file, e.g. lines 10-25, try 'sed -n 10,25p /path/to/the/file'.
* Please avoid commands that may produce a very large amount of output.
* Please run long lived commands in the background, e.g. 'sleep 10 &' or start a server in the background."""

    input_schema = {
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "The bash command to run in the Docker container.",
            },
        },
        "required": ["command"],
    }

    def __init__(
        self,
        workspace_manager:WorkspaceManager,  # DockerWorkspaceManager instance
        require_confirmation: bool = True,
        command_filters: Optional[List[CommandFilter]] = None,
        timeout: int = 180,
        additional_banned_command_strs: Optional[List[str]] = None,
    ):
        """Initialize the DockerBashTool.

        Args:
            workspace_manager: DockerWorkspaceManager instance for command execution
            require_confirmation: Whether to require user confirmation before executing commands
            command_filters: Optional list of command filters to apply before execution
            timeout: Command timeout in seconds
            additional_banned_command_strs: Additional banned command strings
        """
        super().__init__()
        self.workspace_manager = workspace_manager
        self.require_confirmation = require_confirmation
        self.command_filters = command_filters or []
        self.timeout = timeout

        # Default banned commands (can be extended)
        self.banned_command_strs = [
            "rm -rf /",
            "dd if=",
            "mkfs",
            "fdisk",
            "format",
            "shutdown",
            "reboot",
            "halt",
            "> /dev/null",
            ":(){ :|:& };:",  # Fork bomb
        ]
        
        if additional_banned_command_strs is not None:
            self.banned_command_strs.extend(additional_banned_command_strs)

        # Validate workspace manager
        if not hasattr(workspace_manager, 'execute_bash_command'):
            raise ValueError("workspace_manager must have execute_bash_command method")

        logger.info(f"🔧 DockerBashTool initialized with workspace: {workspace_manager.workspace_id}")

    def add_command_filter(self, command_filter: CommandFilter) -> None:
        """Add a command filter to the filter chain.

        Args:
            command_filter: The filter to add
        """
        self.command_filters.append(command_filter)

    def apply_filters(self, command: str) -> str:
        """Apply all command filters to a command.

        Args:
            command: The original command

        Returns:
            The transformed command after applying all filters
        """
        filtered_command = command
        for filter in self.command_filters:
            filtered_command = filter.filter_command(filtered_command)
        return filtered_command

    def _is_command_safe(self, command: str) -> Tuple[bool, str]:
        """Check if command is safe to execute.
        
        Args:
            command: The command to check
            
        Returns:
            Tuple of (is_safe, reason_if_not_safe)
        """
        command_lower = command.lower().strip()
        
        # Check for banned command strings
        for banned_str in self.banned_command_strs:
            if banned_str.lower() in command_lower:
                return False, f"Banned command pattern detected: {banned_str}"
        
        # Check for dangerous patterns
        dangerous_patterns = [
            '../', '..\\', '/etc/passwd', '/etc/shadow',
            'c:\\', 'd:\\', '\\windows\\', '\\system32\\',
            '/proc/version', '/sys/', '/dev/mem'
        ]
        
        for pattern in dangerous_patterns:
            if pattern.lower() in command_lower:
                return False, f"Potentially dangerous path detected: {pattern}"
        
        # Check for privilege escalation attempts
        privilege_patterns = [
            'sudo su', 'su -', 'chmod 777', 'chown root', 
            'passwd root', 'adduser', 'useradd'
        ]
        
        for pattern in privilege_patterns:
            if pattern.lower() in command_lower:
                return False, f"Privilege escalation attempt detected: {pattern}"
        
        return True, ""

    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        """Execute a bash command in the Docker container and return its output.

        Args:
            tool_input: Dictionary containing the command to execute
            message_history: Optional dialog messages for context

        Returns:
            AgentImplOutput containing the command output
        """
        original_command = tool_input["command"]

        # Apply all command filters
        command = self.apply_filters(original_command)
        
        aux_data = {
            "original_command": original_command,
            "executed_command": command,
            # "workspace_id": self.workspace_manager.workspace_id,
            # "language_profile": self.workspace_manager.language_profile,
        }

        # Show the original command in the confirmation prompt
        display_command = original_command
        # If the command was transformed, also show the transformed version
        if command != original_command:
            display_command = f"{original_command}\nTransformed to: {command}"

        # Safety check
        is_safe, safety_reason = self._is_command_safe(command)
        if not is_safe:
            return AgentImplOutput(
                f"❌ Command blocked for security reasons: {safety_reason}",
                f"Command not executed due to security restrictions: {safety_reason}",
                aux_data | {"success": False, "reason": "Security violation", "safety_reason": safety_reason}
            )

        # User confirmation if required
        if self.require_confirmation:
            confirmation = input(
                f"🔧 Do you want to execute the command in Docker container: {display_command}? (y/n): "
            )
            if confirmation.lower() not in ['y', 'yes']:
                return AgentImplOutput(
                    "❌ Command not executed due to lack of user confirmation.",
                    "Command execution cancelled by user",
                    aux_data | {"success": False, "reason": "User cancelled"}
                )

        # Check if workspace manager is available
        if not self.workspace_manager or not self.workspace_manager.active_container:
            return AgentImplOutput(
                "❌ Docker workspace not available. Container may be stopped or not initialized.",
                "Docker workspace unavailable",
                aux_data | {"success": False, "reason": "No active container"}
            )

        try:
            logger.info(f"🔧 Executing command in Docker: {command}")
            
            # Execute the command using the workspace manager
            exit_code, stdout, stderr = self.workspace_manager.execute_bash_command(command)
            
            # Format the output
            output_parts = []
            
            if stdout and stdout.strip():
                output_parts.append(f"📤 Output:\n{stdout.strip()}")
            
            if stderr and stderr.strip():
                output_parts.append(f"⚠️  Errors:\n{stderr.strip()}")
            
            if exit_code != 0:
                output_parts.append(f"🔴 Exit code: {exit_code}")
            else:
                output_parts.append(f"✅ Command completed successfully (exit code: 0)")
            
            if not stdout and not stderr:
                output_parts.append("✅ Command executed successfully (no output)")
            
            full_output = "\n\n".join(output_parts)
            
            # Determine success based on exit code
            success = exit_code == 0
            
            return AgentImplOutput(
                full_output,
                f"Command '{command}' executed in Docker container",
                aux_data | {
                    "success": success,
                    "exit_code": exit_code,
                    "stdout": stdout,
                    "stderr": stderr,
                    "container_id": self.workspace_manager.active_container.short_id if self.workspace_manager.active_container else None
                }
            )

        except Exception as e:
            error_msg = str(e)
            logger.error(f"❌ Error executing command in Docker: {error_msg}")
            
            # Check if it's a timeout error
            if "timeout" in error_msg.lower():
                return AgentImplOutput(
                    f"⏰ Command timed out after {self.timeout} seconds. Please try a simpler command or increase timeout.",
                    "Command execution timed out",
                    aux_data | {"success": False, "error": "timeout", "timeout": self.timeout}
                )
            
            # Check if container is still running
            try:
                if self.workspace_manager.active_container:
                    self.workspace_manager.active_container.reload()
                    container_status = self.workspace_manager.active_container.status
                    if container_status != 'running':
                        return AgentImplOutput(
                            f"❌ Docker container is not running (status: {container_status}). Please restart the workspace.",
                            "Docker container not running",
                            aux_data | {"success": False, "error": "container_not_running", "container_status": container_status}
                        )
            except Exception as container_check_error:
                logger.error(f"Failed to check container status: {container_check_error}")
            
            return AgentImplOutput(
                f"❌ Error executing command in Docker container: {error_msg}",
                f"Failed to execute command '{original_command}' in Docker",
                aux_data | {"success": False, "error": error_msg}
            )

    def get_tool_start_message(self, tool_input: Dict[str, Any]) -> str:
        """Get a message to display when the tool starts.

        Args:
            tool_input: Dictionary containing the command to execute

        Returns:
            A message describing the command being executed
        """
        return f"🔧 Executing bash command in Docker container: {tool_input['command']}"

    def get_workspace_info(self) -> Dict[str, Any]:
        """Get information about the Docker workspace.
        
        Returns:
            Dictionary containing workspace information
        """
        try:
            return self.workspace_manager.get_workspace_info()
        except Exception as e:
            logger.error(f"Failed to get workspace info: {e}")
            return {"error": str(e)}

    def get_resource_usage(self) -> Dict[str, Any]:
        """Get current resource usage of the Docker container.
        
        Returns:
            Dictionary containing resource usage information
        """
        try:
            return self.workspace_manager.get_resource_usage()
        except Exception as e:
            logger.error(f"Failed to get resource usage: {e}")
            return {"error": str(e)}


# Convenience filter classes
class WorkspacePathFilter(CommandFilter):
    """Filter that ensures commands operate within the workspace directory."""
    
    def __init__(self, workspace_path: str = "/workspace"):
        self.workspace_path = workspace_path
    
    def filter_command(self, command: str) -> str:
        """Ensure command operates in workspace directory."""
        # If command doesn't start with cd, prepend workspace change
        if not command.strip().startswith("cd"):
            return f"cd {self.workspace_path} && {command}"
        return command


class LoggingFilter(CommandFilter):
    """Filter that logs all commands before execution."""
    
    def __init__(self, logger_name: str = "bash_commands"):
        self.logger = logging.getLogger(logger_name)
    
    def filter_command(self, command: str) -> str:
        """Log the command and return it unchanged."""
        self.logger.info(f"Executing command: {command}")
        return command


class SandboxFilter(CommandFilter):
    """Filter that adds additional sandboxing to commands."""
    
    def filter_command(self, command: str) -> str:
        """Add timeout and resource limits to commands."""
        # Add timeout to long-running commands
        if any(keyword in command.lower() for keyword in ['while', 'for', 'sleep', 'wait']):
            return f"timeout 300 {command}"
        return command


def create_docker_bash_tool(
    workspace_manager,
    ask_user_permission: bool = True,
    command_filters: Optional[List[CommandFilter]] = None,
    timeout: int = 180,
    additional_banned_command_strs: Optional[List[str]] = None,
    add_workspace_filter: bool = True,
    add_logging_filter: bool = True,
) -> DockerBashTool:
    """Create a Docker-compatible bash tool for executing bash commands.

    Args:
        workspace_manager: DockerWorkspaceManager instance
        ask_user_permission: Whether to ask user permission for commands
        command_filters: Optional list of command filters to apply before execution
        timeout: Command timeout in seconds
        additional_banned_command_strs: Additional banned command strings
        add_workspace_filter: Whether to add workspace path filter
        add_logging_filter: Whether to add command logging filter

    Returns:
        DockerBashTool instance configured with the provided parameters
    """
    filters = command_filters or []
    
    # Add default filters if requested
    if add_workspace_filter:
        filters.append(WorkspacePathFilter())
    
    if add_logging_filter:
        filters.append(LoggingFilter())
    
    return DockerBashTool(
        workspace_manager=workspace_manager,
        require_confirmation=ask_user_permission,
        command_filters=filters,
        timeout=timeout,
        additional_banned_command_strs=additional_banned_command_strs,
    )


# Example usage with the Docker workspace manager
if __name__ == "__main__":
    # This would be used with your DockerWorkspaceManager
    print("🚀 Docker Bash Tool for AI Agents")
    print("=" * 50)
    print("This tool integrates with DockerWorkspaceManager to provide")
    print("secure bash command execution in containerized environments.")
    print("\nTo use:")
    print("1. Create a DockerWorkspaceManager instance")
    print("2. Create the bash tool: create_docker_bash_tool(workspace_manager)")
    print("3. Use the tool in your AI agent framework")