from typing import Any, Optional
import subprocess
import os
from llm.message_history import MessageHistory
from lab.base import AgentPlugin, AgentImplOutput
from utilss.workspace_manager import WorkspaceManager


class SlideDeckInitTool(AgentPlugin):
    name = "slide_deck_init"
    description = "This tool initializes a presentation environment by creating a lightweight CDN-based reveal.js setup with Chart.js support for data visualizations. It creates a presentation directory structure and generates template files that use reveal.js and Chart.js from CDN. Perfect for students, researchers, and business professionals."
    input_schema = {
        "type": "object",
        "properties": {
            "project_name": {"type": "string"},
            "use_cdn": {"type": "boolean", "default": True, "description": "Use CDN version (recommended) or download local files"}
        },
        "required": ["project_name"],
    }

    def __init__(self, workspace_manager: WorkspaceManager) -> None:
        super().__init__()
        self.workspace_manager = workspace_manager

    def _create_cdn_template(self, presentation_dir: str) -> str:
        """Create CDN-based presentation template with Chart.js support"""
        
        # Create main index.html template with Chart.js
        index_template = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Presentation</title>
    
    <!-- Reveal.js CDN CSS -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/theme/white.min.css" id="theme">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/highlight/monokai.min.css">
    
    <!-- Chart.js CDN for data visualization -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
    
    <style>
        /* Custom styles for iframe slides */
        .reveal .slides section iframe {
            width: 100%;
            height: 100vh;
            border: none;
        }
        
        .reveal .slides {
            text-align: left;
        }
        
        .reveal h1, .reveal h2, .reveal h3 {
            text-align: center;
        }
        
        /* Better chart container styling */
        .chart-container {
            position: relative;
            height: 500px;
            width: 100%;
            margin: 20px auto;
        }
    </style>
</head>
<body>
    <div class="reveal">
        <div class="slides">
            <!-- Welcome slide -->
            <section>
                <h1>Welcome to Your Presentation</h1>
                <p>Individual slides will be added here using the slide_deck_complete tool</p>
                <p><small>Powered by Reveal.js & Chart.js</small></p>
            </section>
            
            <!--PLACEHOLDER SLIDES REPLACE THIS-->
            
        </div>
    </div>

    <!-- Reveal.js CDN JavaScript -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/reveal.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/notes/notes.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/markdown/markdown.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/highlight/highlight.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/search/search.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.3.1/plugin/zoom/zoom.min.js"></script>
    
    <script>
        Reveal.initialize({
            hash: true,
            controls: true,
            progress: true,
            center: true,
            transition: 'slide',
            
            plugins: [ 
                RevealMarkdown, 
                RevealHighlight, 
                RevealNotes,
                RevealSearch,
                RevealZoom
            ]
        });
    </script>
</body>
</html>'''

        # Create slides directory
        slides_dir = os.path.join(presentation_dir, "slides")
        os.makedirs(slides_dir, exist_ok=True)
        
        # Create improved sample slide template
        sample_slide = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {
            font-family: "Source Sans Pro", Helvetica, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .slide-content {
            max-width: 900px;
            background: rgba(255, 255, 255, 0.95);
            padding: 50px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            color: #222;
        }
        h1 {
            color: #667eea;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-align: center;
        }
        h2, h3 {
            color: #764ba2;
            margin-top: 25px;
            margin-bottom: 15px;
        }
        ul, ol {
            margin-left: 30px;
            margin-top: 20px;
        }
        li {
            margin-bottom: 12px;
            font-size: 1.1em;
        }
        .highlight-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 10px;
            margin: 25px 0;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .highlight-box h3 {
            color: white;
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="slide-content">
        <h1>Sample Slide</h1>
        <p>This is an enhanced sample slide with better styling. Create more slides in the slides/ directory.</p>
        <ul>
            <li>Point 1: Clear and concise</li>
            <li>Point 2: Professional appearance</li>
            <li>Point 3: Easy to customize</li>
        </ul>
        <div class="highlight-box">
            <h3>Key Takeaway</h3>
            <p>Important information stands out with this styling</p>
        </div>
    </div>
</body>
</html>'''

        # Save files
        index_path = os.path.join(presentation_dir, "index.html")
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(index_template)
            
        sample_slide_path = os.path.join(slides_dir, "sample.html")
        with open(sample_slide_path, "w", encoding="utf-8") as f:
            f.write(sample_slide)
        
        return f"CDN-based presentation template with Chart.js created at {presentation_dir}"

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        try:
            project_name = tool_input["project_name"]
            use_cdn = tool_input.get("use_cdn", True)
            
            # Create the presentation directory
            presentation_dir = os.path.join(str(self.workspace_manager.root), "presentation")
            os.makedirs(presentation_dir, exist_ok=True)

            if use_cdn:
                # Use CDN approach (recommended)
                message = self._create_cdn_template(presentation_dir)
                
                return AgentImplOutput(
                    f"Successfully initialized CDN-based slide deck for '{project_name}' with Chart.js support. "
                    f"Template created at ./presentation/index.html. "
                    f"Create individual slides in ./presentation/slides/ directory and use slide_deck_complete to combine them. "
                    f"Sample slide created at ./presentation/slides/sample.html. "
                    f"Use create_slide_template tool to create slides with charts, tables, and more.",
                    "Successfully initialized CDN-based slide deck with Chart.js",
                    auxiliary_data={"success": True, "use_cdn": True, "project_name": project_name, "has_chartjs": True},
                )
            else:
                # Original local approach (will be saved to MongoDB)
                clone_command = f"git clone https://github.com/Madankh/reveal.js.git presentation/reveal.js"
                
                clone_result = subprocess.run(
                    clone_command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    cwd=self.workspace_manager.root
                )
                
                if clone_result.returncode != 0:
                    return AgentImplOutput(
                        f"Failed to clone reveal.js repository: {clone_result.stderr}",
                        "Failed to clone reveal.js repository",
                        auxiliary_data={"success": False, "error": clone_result.stderr},
                    )

                install_command = "npm install"
                
                install_result = subprocess.run(
                    install_command,
                    shell=True,
                    capture_output=True,
                    text=True,
                    cwd=f"{self.workspace_manager.root}/presentation/reveal.js"
                )
                
                if install_result.returncode != 0:
                    return AgentImplOutput(
                        f"Failed to install dependencies: {install_result.stderr}",
                        "Failed to install dependencies",
                        auxiliary_data={"success": False, "error": install_result.stderr},
                    )

                return AgentImplOutput(
                    "Successfully initialized local slide deck. Repository cloned into `./presentation/reveal.js` and dependencies installed (npm install). "
                    "Note: This will consume more storage space in your workspace.",
                    "Successfully initialized local slide deck",
                    auxiliary_data={"success": True, "use_cdn": False, "clone_output": clone_result.stdout, "install_output": install_result.stdout},
                )
            
        except Exception as e:
            return AgentImplOutput(
                f"Error initializing slide deck: {str(e)}",
                "Error initializing slide deck",
                auxiliary_data={"success": False, "error": str(e)},
            )


SLIDE_IFRAME_TEMPLATE = """\
        <section>
            <iframe src="{slide_path}" scrolling="auto" style="width: 100%; height: 100vh; border: none;"></iframe>
        </section>"""

class SlideDeckCompleteTool(AgentPlugin):
    name = "slide_deck_complete"
    description = "This tool finalizes a presentation by combining multiple individual slide files into a complete reveal.js presentation. It takes an ordered list of slide file paths and embeds them as iframes into the main index.html file, creating a cohesive slideshow that can be viewed in a web browser. Works with both CDN and local reveal.js setups."
    input_schema = {
        "type": "object",
        "properties": {
            "slide_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "The ordered paths of the slides to be combined",
            },
        },
        "required": ["slide_paths"],
    }

    def __init__(self, workspace_manager: WorkspaceManager) -> None:
        super().__init__()
        self.workspace_manager = workspace_manager

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        slide_paths = tool_input["slide_paths"]
        
        # Validate slide paths
        for slide_path in slide_paths:
            normalized_path = slide_path.lstrip("./")
            if not normalized_path.startswith("slides/") and not normalized_path.startswith("presentation/slides/"):
                return AgentImplOutput(
                    f"Error: Slide path '{slide_path}' must be in the slides/ subdirectory (e.g. `./slides/introduction.html`, `./presentation/slides/conclusion.html`)",
                    "Invalid slide path",
                    auxiliary_data={"success": False, "error": "Invalid slide path format"},
                )
        
        slide_iframes = [SLIDE_IFRAME_TEMPLATE.format(slide_path=slide_path) for slide_path in slide_paths]
        
        # Try CDN version first (presentation/index.html)
        cdn_index_path = f"{self.workspace_manager.root}/presentation/index.html"
        local_index_path = f"{self.workspace_manager.root}/presentation/reveal.js/index.html"
        
        index_path = None
        index_content = None
        
        # Check for CDN version first
        if os.path.exists(cdn_index_path):
            index_path = cdn_index_path
            try:
                with open(index_path, "r", encoding="utf-8") as file:
                    index_content = file.read()
            except Exception as e:
                return AgentImplOutput(
                    f"Error reading CDN index.html: {str(e)}",
                    "Error reading CDN index.html",
                    auxiliary_data={"success": False, "error": str(e)},
                )
        # Fallback to local version
        elif os.path.exists(local_index_path):
            index_path = local_index_path
            try:
                with open(index_path, "r", encoding="utf-8") as file:
                    index_content = file.read()
            except Exception as e:
                return AgentImplOutput(
                    f"Error reading local index.html: {str(e)}",
                    "Error reading local index.html",
                    auxiliary_data={"success": False, "error": str(e)},
                )
        else:
            return AgentImplOutput(
                "Error: No index.html found. Please run slide_deck_init first to initialize the presentation.",
                "No index.html found",
                auxiliary_data={"success": False, "error": "No index.html found"},
            )

        # Replace placeholder with slide iframes
        slide_iframes_str = "\n".join(slide_iframes)
        
        if "<!--PLACEHOLDER SLIDES REPLACE THIS-->" in index_content:
            index_content = index_content.replace("<!--PLACEHOLDER SLIDES REPLACE THIS-->", slide_iframes_str)
        else:
            # If placeholder not found, try to insert before closing </div> of slides
            if '<div class="slides">' in index_content:
                # Find the last </div> before </div> (reveal container)
                slides_end = index_content.rfind('</div>', 0, index_content.rfind('</div>'))
                if slides_end != -1:
                    index_content = (index_content[:slides_end] + 
                                   "\n" + slide_iframes_str + "\n" + 
                                   index_content[slides_end:])

        # Write the updated content
        try:
            with open(index_path, "w", encoding="utf-8") as file:
                file.write(index_content)
        except Exception as e:
            return AgentImplOutput(
                f"Error writing index.html: {str(e)}",
                "Error writing index.html",
                auxiliary_data={"success": False, "error": str(e)},
            )

        # Determine which type of setup was used
        setup_type = "CDN-based" if "cdn" in index_path else "local"
        relative_path = index_path.replace(str(self.workspace_manager.root) + "/", "")

        message = f"Successfully combined slides with order {slide_paths} into `{relative_path}`. " \
                 f"Using {setup_type} reveal.js setup with Chart.js support. " \
                 f"If the order is not correct, you can use the `slide_deck_complete` tool again to correct the order. " \
                 f"The final presentation is now available at `{relative_path}`."

        return AgentImplOutput(
            message,
            message,
            auxiliary_data={"success": True, "slide_paths": slide_paths, "setup_type": setup_type, "index_path": relative_path},
        )


# Enhanced utility tool for creating slide templates with MORE OPTIONS
class SlideTemplateTool(AgentPlugin):
    name = "create_slide_template"
    description = "Creates a new slide template file in the slides directory with professional styling. Supports multiple template types including charts (bar, line, pie), tables, two-column layouts, timelines, and more. Perfect for students, researchers, and business presentations."
    input_schema = {
        "type": "object",
        "properties": {
            "slide_name": {"type": "string", "description": "Name of the slide file (without .html extension)"},
            "title": {"type": "string", "description": "Title of the slide"},
            "template_type": {
                "type": "string", 
                "enum": ["basic", "list", "image", "code", "quote", "chart", "table", "two-column", "timeline"],
                "default": "basic",
                "description": "Type of slide template: basic (text), list (bullet points), image (with image placeholder), code (code snippet), quote (blockquote), chart (data visualization with Chart.js), table (data table), two-column (side-by-side content), timeline (process/timeline)"
            }
        },
        "required": ["slide_name", "title"],
    }

    def __init__(self, workspace_manager: WorkspaceManager) -> None:
        super().__init__()
        self.workspace_manager = workspace_manager

    def _get_template(self, template_type: str, title: str, slide_name: str) -> str:
        """Get slide template based on type with enhanced styling"""
        base_style = '''<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
    <style>
        body {
            font-family: "Source Sans Pro", Helvetica, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            margin: 0;
            padding: 40px;
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .slide-content {
            max-width: 1000px;
            width: 100%;
            background: rgba(255, 255, 255, 0.95);
            padding: 50px;
            border-radius: 15px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            color: #222;
        }
        h1 {
            color: #667eea;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-align: center;
            border-bottom: 3px solid #764ba2;
            padding-bottom: 15px;
        }
        h2, h3 {
            color: #764ba2;
            margin-top: 25px;
            margin-bottom: 15px;
        }
        ul, ol {
            margin-left: 30px;
            margin-top: 20px;
        }
        li {
            margin-bottom: 12px;
            font-size: 1.1em;
        }
        code {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 3px 8px;
            border-radius: 4px;
            font-family: "Courier New", monospace;
            font-size: 0.9em;
        }
        pre {
            background: #2c3e50;
            color: #ecf0f1;
            padding: 25px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.95em;
            line-height: 1.5;
        }
        .highlight-box {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 25px;
            border-radius: 10px;
            margin: 25px 0;
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
        .highlight-box h3 {
            color: white;
            margin-top: 0;
        }
        .quote-block {
            border-left: 5px solid #667eea;
            margin: 30px 0;
            padding: 20px 30px;
            background: #f8f9fa;
            border-radius: 0 8px 8px 0;
            font-style: italic;
            font-size: 1.2em;
        }
        .quote-author {
            text-align: right;
            margin-top: 15px;
            font-weight: bold;
            color: #764ba2;
        }
        img {
            max-width: 100%;
            height: auto;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            margin: 20px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 25px 0;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: bold;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #ddd;
        }
        tr:hover {
            background: #f5f5f5;
        }
        .two-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 25px 0;
        }
        .column {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin: 30px 0;
        }
        .timeline {
            position: relative;
            padding: 20px 0;
        }
        .timeline-item {
            padding: 20px;
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            margin-bottom: 20px;
            border-radius: 0 8px 8px 0;
        }
        .timeline-item h3 {
            margin-top: 0;
            color: #667eea;
        }
    </style>
</head>
<body>
    <div class="slide-content">'''

        templates = {
            "basic": f'''
        <h1>{title}</h1>
        <p style="font-size: 1.2em; margin-bottom: 25px;">Your content goes here. This is a clean, professional slide template.</p>
        <ul>
            <li>Key point number one</li>
            <li>Important detail or insight</li>
            <li>Supporting information</li>
        </ul>
        <div class="highlight-box">
            <h3>💡 Key Takeaway</h3>
            <p>Summarize the most important message from this slide</p>
        </div>''',
            
            "list": f'''
        <h1>{title}</h1>
        <h2>Main Points</h2>
        <ul>
            <li>First major point with detailed explanation</li>
            <li>Second important concept to highlight</li>
            <li>Third critical element for consideration</li>
            <li>Fourth supporting detail or example</li>
        </ul>
        <div class="highlight-box">
            <h3>✨ Summary</h3>
            <p>These points collectively demonstrate the key concept</p>
        </div>''',
            
            "image": f'''
        <h1>{title}</h1>
        <p style="font-size: 1.1em;">Visual representation of the concept:</p>
        <!-- Uncomment and update the image path below -->
        <!-- <img src="path/to/your/image.jpg" alt="{title} visualization"> -->
        <div style="background: #f8f9fa; padding: 40px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="font-size: 1.5em; color: #764ba2;">📷</p>
            <p><em>Add your image by uncommenting the img tag above</em></p>
        </div>
        <p>Context and explanation of what the image shows...</p>''',
            
            "code": f'''
        <h1>{title}</h1>
        <p>Example implementation:</p>
        <pre><code>// Your code here
function processData(input) {{
    const result = input.map(item => {{
        return {{
            id: item.id,
            value: item.value * 2
        }};
    }});
    return result;
}}

// Usage
const data = processData(rawInput);
console.log(data);</code></pre>
        <p><strong>Explanation:</strong> This code demonstrates the key algorithm/concept...</p>''',
            
            "quote": f'''
        <h1>{title}</h1>
        <div class="quote-block">
            <h2>"Insert your inspiring or relevant quote here"</h2>
            <div class="quote-author">— Author Name, Title/Context</div>
        </div>
        <p style="font-size: 1.1em;">This quote illustrates the importance of [concept]. It relates to our discussion because...</p>
        <ul>
            <li>Key interpretation point</li>
            <li>Practical application</li>
            <li>Broader implications</li>
        </ul>''',
            
            "chart": f'''
        <h1>{title}</h1>
        <p style="font-size: 1.1em;">Data visualization showing key trends and insights:</p>
        <div class="chart-container">
            <canvas id="chart_{slide_name}"></canvas>
        </div>
        <script>
            // Sample data - replace with your actual data
            const ctx = document.getElementById('chart_{slide_name}').getContext('2d');
            new Chart(ctx, {{
                type: 'bar', // Options: 'bar', 'line', 'pie', 'doughnut', 'radar'
                data: {{
                    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
                    datasets: [{{
                        label: 'Dataset 1',
                        data: [65, 59, 80, 81, 56, 55],
                        backgroundColor: 'rgba(102, 126, 234, 0.6)',
                        borderColor: 'rgba(102, 126, 234, 1)',
                        borderWidth: 2
                    }}, {{
                        label: 'Dataset 2',
                        data: [45, 69, 60, 71, 66, 75],
                        backgroundColor: 'rgba(118, 75, 162, 0.6)',
                        borderColor: 'rgba(118, 75, 162, 1)',
                        borderWidth: 2
                    }}]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{
                            position: 'top',
                        }},
                        title: {{
                            display: true,
                            text: 'Chart Title'
                        }}
                    }},
                    scales: {{
                        y: {{
                            beginAtZero: true
                        }}
                    }}
                }}
            }});
        </script>
        <p><strong>Key insights:</strong> Describe what the data shows and its significance...</p>''',
            
            "table": f'''
        <h1>{title}</h1>
        <p style="font-size: 1.1em;">Comparison of key metrics and data points:</p>
        <table>
            <thead>
                <tr>
                    <th>Category</th>
                    <th>Metric 1</th>
                    <th>Metric 2</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Item A</td>
                    <td>95%</td>
                    <td>120</td>
                    <td>✅ Complete</td>
                </tr>
                <tr>
                    <td>Item B</td>
                    <td>87%</td>
                    <td>98</td>
                    <td>🔄 In Progress</td>
                </tr>
                <tr>
                    <td>Item C</td>
                    <td>72%</td>
                    <td>85</td>
                    <td>⏳ Pending</td>
                </tr>
                <tr>
                    <td>Item D</td>
                    <td>91%</td>
                    <td>110</td>
                    <td>✅ Complete</td>
                </tr>
            </tbody>
        </table>
        <div class="highlight-box">
            <h3>📊 Analysis</h3>
            <p>Summary of what this data reveals and recommended actions...</p>
        </div>''',
            
            "two-column": f'''
        <h1>{title}</h1>
        <div class="two-columns">
            <div class="column">
                <h3>Left Column</h3>
                <ul>
                    <li>First point or advantage</li>
                    <li>Second consideration</li>
                    <li>Third important detail</li>
                    <li>Fourth supporting fact</li>
                </ul>
            </div>
            <div class="column">
                <h3>Right Column</h3>
                <ul>
                    <li>Contrasting point or disadvantage</li>
                    <li>Alternative perspective</li>
                    <li>Different approach</li>
                    <li>Complementary information</li>
                </ul>
            </div>
        </div>
        <div class="highlight-box">
            <h3>🎯 Conclusion</h3>
            <p>Synthesis of both perspectives and final recommendation...</p>
        </div>''',
            
            "timeline": f'''
        <h1>{title}</h1>
        <p style="font-size: 1.1em; margin-bottom: 30px;">Process flow and key milestones:</p>
        <div class="timeline">
            <div class="timeline-item">
                <h3>Phase 1: Planning</h3>
                <p><strong>Duration:</strong> Weeks 1-2</p>
                <p>Initial research, stakeholder meetings, and requirement gathering. Define project scope and objectives.</p>
            </div>
            <div class="timeline-item">
                <h3>Phase 2: Development</h3>
                <p><strong>Duration:</strong> Weeks 3-6</p>
                <p>Core implementation, testing, and iteration. Build features and functionality.</p>
            </div>
            <div class="timeline-item">
                <h3>Phase 3: Testing</h3>
                <p><strong>Duration:</strong> Weeks 7-8</p>
                <p>Quality assurance, user testing, and bug fixes. Ensure everything works smoothly.</p>
            </div>
            <div class="timeline-item">
                <h3>Phase 4: Launch</h3>
                <p><strong>Duration:</strong> Week 9</p>
                <p>Deployment, monitoring, and final adjustments. Go live with the solution.</p>
            </div>
        </div>''',
        }

        return base_style + templates[template_type] + '''
    </div>
</body>
</html>'''

    async def run_impl(
        self,
        tool_input: dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        try:
            slide_name = tool_input["slide_name"]
            title = tool_input["title"]
            template_type = tool_input.get("template_type", "basic")
            
            # Ensure slides directory exists
            slides_dir = os.path.join(str(self.workspace_manager.root), "presentation", "slides")
            os.makedirs(slides_dir, exist_ok=True)
            
            # Create slide file
            slide_filename = f"{slide_name}.html"
            slide_path = os.path.join(slides_dir, slide_filename)
            
            # Generate template content
            template_content = self._get_template(template_type, title, slide_name)
            
            # Save slide
            with open(slide_path, "w", encoding="utf-8") as f:
                f.write(template_content)
            
            relative_path = f"presentation/slides/{slide_filename}"
            
            # Enhanced success message with template-specific tips
            tips = {
                "chart": "Remember to customize the chart data, type (bar/line/pie), and labels to match your needs.",
                "table": "Update the table rows and columns with your actual data for clear comparisons.",
                "two-column": "Perfect for pros/cons, before/after, or comparing two concepts side-by-side.",
                "timeline": "Great for project plans, processes, or historical progressions.",
                "code": "Add syntax highlighting by specifying the language in your code block.",
                "quote": "Use this to emphasize important statements or expert opinions.",
                "image": "Uncomment the <img> tag and add your image path for visual impact.",
                "list": "Ideal for summarizing multiple points clearly and concisely.",
                "basic": "A versatile template that works for most general content."
            }
            
            tip_message = tips.get(template_type, "")
            
            return AgentImplOutput(
                f"Successfully created '{template_type}' slide template: {relative_path}\n"
                f"Title: {title}\n"
                f"💡 Tip: {tip_message}",
                f"Created {template_type} slide template: {slide_filename}",
                auxiliary_data={
                    "success": True, 
                    "slide_path": relative_path, 
                    "template_type": template_type,
                    "title": title,
                    "has_chart": template_type == "chart"
                },
            )
            
        except Exception as e:
            return AgentImplOutput(
                f"Error creating slide template: {str(e)}",
                "Error creating slide template",
                auxiliary_data={"success": False, "error": str(e)},
            )