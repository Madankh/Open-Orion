import asyncio
import json
import logging
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass
import aiohttp
import subprocess
from abc import ABC, abstractmethod
from copy import deepcopy

from lab.base import AgentPlugin, AgentImplOutput
from llm.message_history import MessageHistory
from llm.base import ToolAction

@dataclass
class MCPToolInfo:
    """Information about an MCP tool"""
    name: str
    description: str
    input_schema: Dict[str, Any]
    server_name: str
    server_url: Optional[str] = None

@dataclass
class MCPServerConfig:
    """Configuration for an MCP server"""
    name: str
    command: List[str]  # Command to start the server
    args: List[str] = None
    env: Dict[str, str] = None
    url: Optional[str] = None  # For HTTP-based MCP servers
    transport: str = "stdio"  # "stdio" or "http"

class MCPClient(ABC):
    """Abstract base class for MCP clients"""
    
    @abstractmethod
    async def connect(self) -> bool:
        pass
    
    @abstractmethod
    async def disconnect(self):
        pass
    
    @abstractmethod
    async def list_tools(self) -> List[MCPToolInfo]:
        pass
    
    @abstractmethod
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        pass

class StdioMCPClient(MCPClient):
    """MCP client for stdio-based servers"""
    
    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.request_id = 0
        self.logger = logging.getLogger(f"mcp_client_{config.name}")
    
    async def connect(self) -> bool:
        try:
            # Start the MCP server process
            cmd = self.config.command + (self.config.args or [])
            env = dict(os.environ)
            if self.config.env:
                env.update(self.config.env)
            
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )
            
            # Initialize MCP connection
            await self._send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "clientInfo": {
                    "name": "agent-tool-manager",
                    "version": "1.0.0"
                }
            })
            
            return True
        except Exception as e:
            self.logger.error(f"Failed to connect to MCP server {self.config.name}: {e}")
            return False
    
    async def disconnect(self):
        if self.process:
            self.process.terminate()
            await self.process.wait()
            self.process = None
    
    async def _send_request(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        self.request_id += 1
        request = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params
        }
        
        request_json = json.dumps(request) + '\n'
        self.process.stdin.write(request_json.encode())
        await self.process.stdin.drain()
        
        # Read response
        response_line = await self.process.stdout.readline()
        response = json.loads(response_line.decode().strip())
        
        if "error" in response:
            raise Exception(f"MCP error: {response['error']}")
        
        return response.get("result", {})
    
    async def list_tools(self) -> List[MCPToolInfo]:
        try:
            result = await self._send_request("tools/list", {})
            tools = []
            
            for tool_data in result.get("tools", []):
                tools.append(MCPToolInfo(
                    name=tool_data["name"],
                    description=tool_data.get("description", ""),
                    input_schema=tool_data.get("inputSchema", {}),
                    server_name=self.config.name
                ))
            
            return tools
        except Exception as e:
            self.logger.error(f"Failed to list tools from {self.config.name}: {e}")
            return []
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        try:
            result = await self._send_request("tools/call", {
                "name": tool_name,
                "arguments": arguments
            })
            return result.get("content", [])
        except Exception as e:
            self.logger.error(f"Failed to call tool {tool_name}: {e}")
            raise

class HttpMCPClient(MCPClient):
    """MCP client for HTTP-based servers"""
    
    def __init__(self, config: MCPServerConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None
        self.request_id = 0
        self.logger = logging.getLogger(f"mcp_client_{config.name}")
    
    async def connect(self) -> bool:
        try:
            self.session = aiohttp.ClientSession()
            # Test connection
            async with self.session.get(f"{self.config.url}/health") as resp:
                return resp.status == 200
        except Exception as e:
            self.logger.error(f"Failed to connect to HTTP MCP server {self.config.name}: {e}")
            return False
    
    async def disconnect(self):
        if self.session:
            await self.session.close()
            self.session = None
    
    async def list_tools(self) -> List[MCPToolInfo]:
        try:
            async with self.session.post(f"{self.config.url}/tools/list", json={}) as resp:
                result = await resp.json()
                tools = []
                
                for tool_data in result.get("tools", []):
                    tools.append(MCPToolInfo(
                        name=tool_data["name"],
                        description=tool_data.get("description", ""),
                        input_schema=tool_data.get("inputSchema", {}),
                        server_name=self.config.name,
                        server_url=self.config.url
                    ))
                
                return tools
        except Exception as e:
            self.logger.error(f"Failed to list tools from {self.config.name}: {e}")
            return []
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        try:
            payload = {
                "name": tool_name,
                "arguments": arguments
            }
            
            async with self.session.post(f"{self.config.url}/tools/call", json=payload) as resp:
                result = await resp.json()
                return result.get("content", [])
        except Exception as e:
            self.logger.error(f"Failed to call tool {tool_name}: {e}")
            raise

class MCPToolAdapter(AgentPlugin):
    """Adapter to make MCP tools work with the existing AgentPlugin interface"""
    
    def __init__(self, tool_info: MCPToolInfo, mcp_client: MCPClient):
        self.tool_info = tool_info
        self.mcp_client = mcp_client
        self.logger = logging.getLogger(f"mcp_tool_{tool_info.name}")
    
    @property
    def name(self) -> str:
        return f"mcp_{self.tool_info.server_name}_{self.tool_info.name}"
    
    @property
    def description(self) -> str:
        return f"[MCP:{self.tool_info.server_name}] {self.tool_info.description}"
    
    def get_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": self.tool_info.input_schema.get("properties", {}),
            "required": self.tool_info.input_schema.get("required", [])
        }
    
    async def run_impl(self, tool_input: Dict[str, Any], message_history: MessageHistory) -> AgentImplOutput:
        try:
            result = await self.mcp_client.call_tool(self.tool_info.name, tool_input)
            
            # Convert MCP result to string format expected by agent
            if isinstance(result, list):
                formatted_result = ""
                for item in result:
                    if item.get("type") == "text":
                        formatted_result += item.get("text", "")
                    elif item.get("type") == "image":
                        formatted_result += f"[Image: {item.get('source', {}).get('uri', 'unknown')}]"
                    else:
                        formatted_result += str(item)
                result = formatted_result
            elif not isinstance(result, str):
                result = json.dumps(result, indent=2)
            
            return AgentImplOutput(
                tool_result=result,
                log_to_user=f"MCP tool {self.tool_info.name} executed successfully"
            )
        except Exception as e:
            error_msg = f"Error executing MCP tool {self.tool_info.name}: {str(e)}"
            self.logger.error(error_msg)
            return AgentImplOutput(
                tool_result=f"Error: {error_msg}",
                log_to_user=error_msg
            )

class MCPToolManager:
    """Manager for MCP servers and tools"""
    
    def __init__(self, logger: Optional[logging.Logger] = None):
        self.logger = logger or logging.getLogger("mcp_tool_manager")
        self.servers: Dict[str, MCPClient] = {}
        self.tools: Dict[str, MCPToolAdapter] = {}
        self.server_configs: List[MCPServerConfig] = []
    
    def add_server_config(self, config: MCPServerConfig):
        """Add MCP server configuration"""
        self.server_configs.append(config)
    
    def add_multiple_server_configs(self, configs: List[MCPServerConfig]):
        """Add multiple MCP server configurations"""
        self.server_configs.extend(configs)
    
    async def initialize_servers(self):
        """Initialize all configured MCP servers"""
        for config in self.server_configs:
            await self._initialize_server(config)
    
    async def _initialize_server(self, config: MCPServerConfig):
        """Initialize a single MCP server"""
        try:
            # Create appropriate client based on transport
            if config.transport == "stdio":
                client = StdioMCPClient(config)
            elif config.transport == "http":
                client = HttpMCPClient(config)
            else:
                self.logger.error(f"Unsupported transport: {config.transport}")
                return
            
            # Connect to server
            if await client.connect():
                self.servers[config.name] = client
                
                # Discover tools
                tools = await client.list_tools()
                for tool_info in tools:
                    adapter = MCPToolAdapter(tool_info, client)
                    self.tools[adapter.name] = adapter
                
                self.logger.info(f"Initialized MCP server {config.name} with {len(tools)} tools")
            else:
                self.logger.error(f"Failed to connect to MCP server {config.name}")
        
        except Exception as e:
            self.logger.error(f"Error initializing MCP server {config.name}: {e}")
    
    async def shutdown_servers(self):
        """Shutdown all MCP servers"""
        for client in self.servers.values():
            await client.disconnect()
        self.servers.clear()
        self.tools.clear()
    
    def get_mcp_tools(self) -> List[AgentPlugin]:
        """Get all MCP tools as AgentPlugin instances"""
        return list(self.tools.values())
    
    def get_tool_by_name(self, name: str) -> Optional[MCPToolAdapter]:
        """Get MCP tool by name"""
        return self.tools.get(name)
    
    def list_available_tools(self) -> List[Dict[str, Any]]:
        """List all available MCP tools with their info"""
        tool_list = []
        for tool in self.tools.values():
            tool_list.append({
                "name": tool.name,
                "description": tool.description,
                "server": tool.tool_info.server_name,
                "schema": tool.get_schema()
            })
        return tool_list

# Enhanced AgentToolManager that includes MCP tools
class EnhancedAgentToolManager:
    """Enhanced tool manager that includes both native and MCP tools"""
    
    def __init__(self, native_tools: List[AgentPlugin], logger_for_agent_logs: logging.Logger):
        self.logger_for_agent_logs = logger_for_agent_logs
        self.native_tools = native_tools
        self.mcp_manager = MCPToolManager(logger_for_agent_logs)
        self.complete_tool = CompleteTool()  # Assuming this exists from your original code
    
    async def initialize_mcp_tools(self, mcp_configs: List[MCPServerConfig]):
        """Initialize MCP tools with given configurations"""
        self.mcp_manager.add_multiple_server_configs(mcp_configs)
        await self.mcp_manager.initialize_servers()
        
        mcp_tools = self.mcp_manager.get_mcp_tools()
        self.logger_for_agent_logs.info(f"Initialized {len(mcp_tools)} MCP tools")
    
    def get_tool(self, tool_name: str) -> AgentPlugin:
        """Get tool by name (checks both native and MCP tools)"""
        # Check native tools first
        try:
            tool = next(t for t in self.native_tools if t.name == tool_name)
            return tool
        except StopIteration:
            pass
        
        # Check MCP tools
        mcp_tool = self.mcp_manager.get_tool_by_name(tool_name)
        if mcp_tool:
            return mcp_tool
        
        # Check complete tool
        if self.complete_tool.name == tool_name:
            return self.complete_tool
        
        raise ValueError(f"Tool with name {tool_name} not found")
    
    def get_tools(self) -> List[AgentPlugin]:
        """Get all tools (native + MCP + complete tool)"""
        all_tools = self.native_tools.copy()
        all_tools.extend(self.mcp_manager.get_mcp_tools())
        all_tools.append(self.complete_tool)
        return all_tools
    
    async def run_tool(self, tool_params: ToolAction, history: MessageHistory):
        """Run tool (same interface as original)"""
        tool = self.get_tool(tool_params.tool_name)
        
        tool_name = tool_params.tool_name
        tool_input = tool_params.tool_input
        
        self.logger_for_agent_logs.info(f"Running tool: {tool_name}")
        self.logger_for_agent_logs.info(f"Tool input: {tool_input}")
        
        result = await tool.run(tool_input, deepcopy(history))
        
        # Logging logic (same as original)
        tool_input_str = "\n".join([f" - {k}: {v}" for k, v in tool_input.items()])
        log_message = f"Calling tool {tool_name} with input:\n{tool_input_str}"
        
        if isinstance(result, str):
            log_message += f"\nTool output:\n{result}\n\n"
        else:
            result_to_log = deepcopy(result)
            for i in range(len(result_to_log)):
                if result_to_log[i].get("type") == "image":
                    result_to_log[i]["source"]["data"] = "[REDACTED]"
            log_message += f"\nTool output:\n{result_to_log}\n\n"
        
        self.logger_for_agent_logs.info(log_message)
        
        if isinstance(result, tuple):
            tool_result, = result
        else:
            tool_result = result
        
        return tool_result
    
    def should_stop(self):
        return self.complete_tool.should_stop
    
    def get_final_answer(self):
        return self.complete_tool.answer
    
    def reset(self):
        self.complete_tool.reset()
    
    async def shutdown(self):
        """Shutdown MCP servers"""
        await self.mcp_manager.shutdown_servers()
    
    def list_all_tools(self) -> Dict[str, List[Dict[str, Any]]]:
        """List all tools categorized by type"""
        return {
            "native_tools": [
                {"name": tool.name, "description": getattr(tool, 'description', 'No description')}
                for tool in self.native_tools
            ],
            "mcp_tools": self.mcp_manager.list_available_tools(),
            "system_tools": [
                {"name": self.complete_tool.name, "description": "Complete the current task"}
            ]
        }

# Example usage and configuration helper
def create_example_mcp_configs() -> List[MCPServerConfig]:
    """Create example MCP server configurations"""
    return [
        # Example stdio-based MCP server (like filesystem tools)
        MCPServerConfig(
            name="filesystem",
            command=["python", "-m", "mcp_filesystem"],
            transport="stdio"
        ),
        
        # Example HTTP-based MCP server
        MCPServerConfig(
            name="web_tools",
            url="http://localhost:3000",
            transport="http"
        ),
        
        # Example with custom environment
        MCPServerConfig(
            name="database_tools",
            command=["python", "-m", "mcp_database"],
            args=["--config", "/path/to/db/config.json"],
            env={"DB_URL": "postgresql://user:pass@localhost/db"},
            transport="stdio"
        )
    ]

# Updated get_system_tools function
async def get_enhanced_system_tools(
    client,
    workspace_manager,
    message_queue: asyncio.Queue,
    container_id: Optional[str] = None,
    ask_user_permission: bool = False,
    tool_args: Dict[str, Any] = None,
    plan=None,
    web_key=None,
    img_video=None,
    mcp_configs: Optional[List[MCPServerConfig]] = None
) -> EnhancedAgentToolManager:
    """Enhanced version that includes MCP tools"""
    
    # Get native tools (your existing logic)
    logger = logging.getLogger("presentation_context_manager")
    
    # ... (your existing native tools creation logic) ...
    native_tools = [
        # ... your existing tools ...
    ]
    
    # Create enhanced tool manager
    tool_manager = EnhancedAgentToolManager(native_tools, logger)
    
    # Initialize MCP tools if configurations provided
    if mcp_configs:
        await tool_manager.initialize_mcp_tools(mcp_configs)
    
    return tool_manager