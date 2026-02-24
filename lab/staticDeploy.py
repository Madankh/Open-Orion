
from typing import Any, Optional, Dict, List
from pathlib import Path
import os
import logging
import mimetypes
import json
from urllib.parse import urljoin
from lab.base import AgentPlugin, AgentImplOutput
from llm.message_history import MessageHistory
from utilss.workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)

class StaticDeployTool(AgentPlugin):
    """
    Enhanced tool for deploying static files, websites, Python animations, and web games.
    Supports multiple deployment methods and file types.
    """

    name = "static_deploy"
    description = "Deploy static files, websites, animations, and games with multiple hosting options"
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "Path to the file or directory to deploy (relative to workspace root)",
            },
            "deployment_type": {
                "type": "string",
                "enum": ["auto", "website", "game", "animation", "static_file", "python_app"],
                "default": "auto",
                "description": "Type of deployment to optimize for"
            },
            "port": {
                "type": "integer",
                "default": 8000,
                "description": "Port to use for local server (if applicable)"
            },
            "generate_index": {
                "type": "boolean",
                "default": True,
                "description": "Generate index.html for directories"
            }
        },
        "required": ["file_path"],
    }

    def __init__(self, workspace_manager: WorkspaceManager):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.supported_formats = {
            'web': ['.html', '.htm', '.css', '.js', '.json'],
            'images': ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'],
            'media': ['.mp4', '.webm', '.mp3', '.wav', '.ogg'],
            'python': ['.py', '.ipynb'],
            'data': ['.csv', '.json', '.xml', '.txt']
        }

    def _detect_file_type(self, file_path: Path) -> str:
        """Detect the type of file/project for optimal deployment."""
        if file_path.is_dir():
            # Check for common project structures
            files_in_dir = [f.name.lower() for f in file_path.iterdir() if f.is_file()]
            
            if 'index.html' in files_in_dir:
                return 'website'
            elif any(f.endswith('.py') for f in files_in_dir):
                return 'python_app'
            elif any(f.endswith('.js') for f in files_in_dir) and any(f.endswith('.html') for f in files_in_dir):
                return 'game'
            else:
                return 'static_files'
        else:
            suffix = file_path.suffix.lower()
            if suffix in self.supported_formats['web']:
                return 'website'
            elif suffix in self.supported_formats['python']:
                return 'python_app'
            elif suffix in ['.html']:
                return 'game' if 'game' in file_path.name.lower() else 'website'
            else:
                return 'static_file'

    def _generate_index_html(self, directory: Path) -> str:
        """Generate a beautiful index.html for directory listings."""
        files = []
        for item in directory.iterdir():
            if item.name.startswith('.'):
                continue
            
            file_info = {
                'name': item.name,
                'type': 'directory' if item.is_dir() else 'file',
                'size': item.stat().st_size if item.is_file() else 0
            }
            files.append(file_info)
        
        files.sort(key=lambda x: (x['type'] == 'file', x['name'].lower()))
        
        html_content = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Directory Listing - {directory.name}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }}
        .container {{
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }}
        .header {{
            background: linear-gradient(45deg, #2196F3, #21CBF3);
            color: white;
            padding: 20px;
            text-align: center;
        }}
        .file-list {{
            padding: 20px;
        }}
        .file-item {{
            display: flex;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid #eee;
            text-decoration: none;
            color: #333;
            transition: background 0.3s;
        }}
        .file-item:hover {{
            background: #f5f5f5;
        }}
        .file-icon {{
            width: 24px;
            height: 24px;
            margin-right: 12px;
        }}
        .file-name {{
            flex: 1;
            font-weight: 500;
        }}
        .file-size {{
            color: #666;
            font-size: 0.9em;
        }}
        .directory {{ color: #2196F3; }}
        .file {{ color: #666; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📁 {directory.name}</h1>
            <p>Directory Listing</p>
        </div>
        <div class="file-list">
"""
        
        for file_info in files:
            icon = "📁" if file_info['type'] == 'directory' else "📄"
            size = f"{file_info['size'] / 1024:.1f} KB" if file_info['type'] == 'file' else ""
            
            html_content += f"""
            <a href="{file_info['name']}" class="file-item">
                <span class="file-icon">{icon}</span>
                <span class="file-name {file_info['type']}">{file_info['name']}</span>
                <span class="file-size">{size}</span>
            </a>
"""
        
        html_content += """
        </div>
    </div>
</body>
</html>
"""
        return html_content

    def _create_python_web_wrapper(self, python_file: Path) -> str:
        """Create a web wrapper for Python files using Pyodide."""
        python_content = python_file.read_text(encoding='utf-8')
        
        # Escape the Python code properly for JavaScript
        python_content_escaped = json.dumps(python_content)
        
        html_wrapper = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Python App - {python_file.name}</title>
        <script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                margin: 0;
                padding: 20px;
                background: #f5f5f5;
            }}
            .container {{
                max-width: 1200px;
                margin: 0 auto;
                background: white;
                border-radius: 10px;
                box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                overflow: hidden;
            }}
            .header {{
                background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
                color: white;
                padding: 20px;
                text-align: center;
            }}
            .controls {{
                padding: 20px;
                border-bottom: 1px solid #eee;
            }}
            .run-btn {{
                background: #4CAF50;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
                margin-right: 10px;
            }}
            .run-btn:hover {{
                background: #45a049;
            }}
            .run-btn:disabled {{
                background: #cccccc;
                cursor: not-allowed;
            }}
            .clear-btn {{
                background: #f44336;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 16px;
            }}
            .clear-btn:hover {{
                background: #da190b;
            }}
            .output {{
                padding: 20px;
                background: #f8f9fa;
                border-top: 1px solid #ddd;
                white-space: pre-wrap;
                font-family: 'Courier New', monospace;
                max-height: 400px;
                overflow-y: auto;
                min-height: 100px;
            }}
            .canvas-container {{
                padding: 20px;
                text-align: center;
            }}
            #plot-div {{
                margin: 20px 0;
            }}
            .loading {{
                color: #666;
                font-style: italic;
            }}
            .error {{
                color: #d32f2f;
                background: #ffebee;
                border: 1px solid #ffcdd2;
                padding: 10px;
                border-radius: 4px;
                margin: 10px 0;
            }}
            .success {{
                color: #388e3c;
                background: #e8f5e8;
                border: 1px solid #c8e6c9;
                padding: 10px;
                border-radius: 4px;
                margin: 10px 0;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🐍 Python Application</h1>
                <p>{python_file.name}</p>
            </div>
            <div class="controls">
                <button class="run-btn" id="runBtn" onclick="runPython()">▶️ Run Python Code</button>
                <button class="clear-btn" onclick="clearOutput()">🗑️ Clear Output</button>
            </div>
            <div class="canvas-container">
                <div id="plot-div"></div>
            </div>
            <div class="output" id="output">Click "Run Python Code" to execute the script...</div>
        </div>
    
        <script>
            let pyodide;
            let isInitialized = false;
            const pythonCode = {python_content_escaped};
            
            async function initPyodide() {{
                const output = document.getElementById('output');
                const runBtn = document.getElementById('runBtn');
                
                try {{
                    output.innerHTML = '<div class="loading">Loading Pyodide environment...</div>';
                    runBtn.disabled = true;
                    
                    // Load Pyodide
                    pyodide = await loadPyodide({{
                        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/"
                    }});
                    
                    output.innerHTML = '<div class="loading">Loading Python packages...</div>';
                    
                    // Load common packages
                    await pyodide.loadPackage(["micropip"]);
                    
                    // Install packages using micropip for better compatibility
                    await pyodide.runPython(`
                        import micropip
                        await micropip.install(['matplotlib', 'numpy', 'pandas'])
                    `);
                    
                    output.innerHTML = '<div class="success">✅ Python environment ready!</div>';
                    isInitialized = true;
                    runBtn.disabled = false;
                    
                }} catch (error) {{
                    output.innerHTML = `<div class="error">❌ Failed to initialize Python environment: ${{error.message}}</div>`;
                    console.error("Pyodide initialization error:", error);
                }}
            }}
            
            async function runPython() {{
                const output = document.getElementById('output');
                const plotDiv = document.getElementById('plot-div');
                const runBtn = document.getElementById('runBtn');
                
                try {{
                    if (!isInitialized) {{
                        output.innerHTML = '<div class="error">Python environment not ready. Please wait for initialization.</div>';
                        return;
                    }}
                    
                    runBtn.disabled = true;
                    output.innerHTML = '<div class="loading">Running Python code...</div>';
                    plotDiv.innerHTML = ''; // Clear previous plots
                    
                    // Set up output capture and matplotlib backend
                    await pyodide.runPython(`
                        import sys
                        import io
                        import matplotlib
                        import matplotlib.pyplot as plt
                        import base64
                        
                        # Set up matplotlib for web
                        matplotlib.use('Agg')
                        
                        # Capture stdout
                        old_stdout = sys.stdout
                        sys.stdout = captured_output = io.StringIO()
                        
                        # Clear any existing plots
                        plt.clf()
                        plt.close('all')
                    `);
                    
                    // Run the user's Python code
                    await pyodide.runPython(pythonCode);
                    
                    // Get the captured output
                    const capturedText = pyodide.runPython(`
                        # Restore stdout
                        sys.stdout = old_stdout
                        output_text = captured_output.getvalue()
                        
                        # Handle matplotlib plots
                        plot_data = None
                        if plt.get_fignums():
                            # Save plot to base64 string
                            buffer = io.BytesIO()
                            plt.savefig(buffer, format='png', bbox_inches='tight', dpi=150)
                            buffer.seek(0)
                            plot_data = base64.b64encode(buffer.read()).decode()
                            plt.close('all')
                        
                        (output_text, plot_data)
                    `);
                    
                    const [outputText, plotData] = capturedText;
                    
                    // Display output
                    if (outputText.trim()) {{
                        output.innerHTML = `<div class="success">✅ Code executed successfully!</div><pre>${{outputText}}</pre>`;
                    }} else {{
                        output.innerHTML = '<div class="success">✅ Code executed successfully! (No output)</div>';
                    }}
                    
                    // Display plot if available
                    if (plotData) {{
                        plotDiv.innerHTML = `<img src="data:image/png;base64,${{plotData}}" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;">`;
                    }}
                    
                }} catch (error) {{
                    output.innerHTML = `<div class="error">❌ Error executing Python code:<br>${{error.message}}</div>`;
                    console.error("Python execution error:", error);
                }} finally {{
                    runBtn.disabled = false;
                }}
            }}
            
            function clearOutput() {{
                document.getElementById('output').innerHTML = 'Output cleared. Click "Run Python Code" to execute the script...';
                document.getElementById('plot-div').innerHTML = '';
            }}
            
            // Initialize on page load
            window.addEventListener('load', () => {{
                setTimeout(initPyodide, 100); // Small delay to ensure DOM is ready
            }});
        </script>
    </body>
    </html>
    """
        return html_wrapper

    def _get_deployment_urls(self, file_path: Path) -> List[Dict[str, str]]:
        """Get multiple deployment URL options."""
        urls = []
        
        # Try different base URLs
        base_urls = [
            os.getenv("STATIC_FILE_BASE_URL", "").rstrip('/'),
            "https://apipy.curiositylab.fun",
            f"file://{file_path.absolute()}"
        ]
        
        # Option 1: Try different ways to get the correct UUID
        try:
            # Method 1: Check if workspace_manager has a connection_id or session_id property
            if hasattr(self.workspace_manager, 'connection_id'):
                connection_uuid = self.workspace_manager.connection_id
            elif hasattr(self.workspace_manager, 'session_id'):
                connection_uuid = self.workspace_manager.session_id
            elif hasattr(self.workspace_manager, 'workspace_id'):
                connection_uuid = self.workspace_manager.workspace_id
            else:
                # Method 2: Try looking at different directory levels
                # Maybe it's the grandparent instead of parent?
                connection_uuid = self.workspace_manager.root.parent.parent.name
                
                # Method 3: Or maybe we need to traverse up to find UUID format
                current_path = self.workspace_manager.root
                while current_path.parent != current_path:
                    parent_name = current_path.parent.name
                    # Check if it looks like a UUID (has dashes)
                    if '-' in parent_name and len(parent_name) == 36:
                        connection_uuid = parent_name
                        break
                    current_path = current_path.parent
                else:
                    # Fallback to original method
                    connection_uuid = self.workspace_manager.root.parent.name
                    
        except Exception as e:
            # Fallback to original method
            connection_uuid = self.workspace_manager.root.parent.name
        
        relative_path = file_path.relative_to(self.workspace_manager.root)
        url_path = str(relative_path).replace('\\', '/')
        
        for base_url in base_urls:
            if base_url:
                if base_url.startswith('http'):
                    url = f"{base_url}/workspace/{connection_uuid}/{url_path}"
                else:
                    url = base_url
                
                urls.append({
                    "url": url,
                    "type": "HTTP" if base_url.startswith('http') else "File",
                    "description": "Web accessible" if base_url.startswith('http') else "Local file"
                })
        
        return urls

    def _validate_and_prepare_file(self, file_path: str, deployment_type: str) -> tuple[bool, str, Optional[Path]]:
        """Validate and prepare file for deployment."""
        try:
            path_obj = Path(file_path)
            
            # Security checks
            if '..' in path_obj.parts:
                return False, "Path traversal not allowed", None
            
            workspace_path = self.workspace_manager.workspace_path(path_obj)
            
            if not workspace_path.exists():
                return False, f"File/directory does not exist: {file_path}", None
            
            # Ensure within workspace
            try:
                workspace_path.relative_to(self.workspace_manager.root)
            except ValueError:
                return False, "Path is outside workspace boundary", None
            
            # Auto-detect type if needed
            if deployment_type == "auto":
                deployment_type = self._detect_file_type(workspace_path)
            
            return True, deployment_type, workspace_path
            
        except Exception as e:
            logger.error(f"Error validating file path '{file_path}': {e}")
            return False, f"Invalid file path: {str(e)}", None

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        """Deploy the specified file or directory."""
        
        file_path = tool_input["file_path"]
        deployment_type = tool_input.get("deployment_type", "auto")
        port = tool_input.get("port", 8000)
        generate_index = tool_input.get("generate_index", True)
        
        logger.info(f"Deploying {deployment_type}: {file_path}")
        
        # Validate and prepare
        is_valid, detected_type_or_error, workspace_path = self._validate_and_prepare_file(
            file_path, deployment_type
        )
        
        if not is_valid:
            logger.warning(f"Deployment validation failed: {detected_type_or_error}")
            return AgentImplOutput(
                detected_type_or_error,
                "Deployment validation failed",
                auxiliary_data={"success": False}
            )
        
        deployment_type = detected_type_or_error
        
        try:
            # Prepare deployment based on type
            deployment_path = workspace_path
            connection_uuid = self.workspace_manager.root.parent.name
            if deployment_type == "python_app" and workspace_path.is_file():
                # Create web wrapper for Python files
                wrapper_html = self._create_python_web_wrapper(workspace_path)
                wrapper_path = workspace_path.parent / f"{workspace_path.stem}_web.html"
                wrapper_path.write_text(wrapper_html, encoding='utf-8')
                deployment_path = wrapper_path
                
            elif deployment_type in ["website", "game", "static_files"] and workspace_path.is_dir():
                # Generate index.html if needed
                if generate_index and not (workspace_path / "index.html").exists():
                    index_html = self._generate_index_html(workspace_path)
                    index_path = workspace_path / "index.html"
                    index_path.write_text(index_html, encoding='utf-8')
                    deployment_path = index_path
                elif (workspace_path / "index.html").exists():
                    deployment_path = workspace_path / "index.html"
            
            # Get deployment URLs
            urls = self._get_deployment_urls(deployment_path)
            
            # Create response
            file_size = deployment_path.stat().st_size if deployment_path.is_file() else 0
            size_mb = file_size / (1024 * 1024)
            
            urls_text = "\n".join([f"🔗 **{url['type']}**: {url['url']}" for url in urls])
            
            response_message = f"""
🚀 **Deployment Successful!**

📄 **File/Directory**: {file_path}
🎯 **Type**: {deployment_type}
📊 **Size**: {size_mb:.2f} MB
🌐 **Available URLs**:
{urls_text}

💡 **Tips**:
- For local development, use the localhost URLs
- For sharing, use the public URL (if available)
- Python apps run in the browser using Pyodide
- Games and animations should work directly in the browser
"""
            
            logger.info(f"Successfully deployed {deployment_type}: {file_path}")
            
            return AgentImplOutput(
                response_message,
                f"Deployment successful: {urls[0]['url'] if urls else 'No URLs available'}",
                auxiliary_data={
                    "success": True,
                    "deployment_type": deployment_type,
                    "urls": urls,
                    "file_size": file_size
                }
            )
            
        except Exception as e:
            error_msg = f"Deployment failed: {str(e)}"
            logger.error(error_msg)
            return AgentImplOutput(
                error_msg,
                "Deployment failed",
                auxiliary_data={"success": False}
            )

