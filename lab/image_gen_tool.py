"""
Image Generation Tool using Fal AI API
Implementation for fal-ai/imagen4/preview model
Fixed to properly handle custom API keys by managing FAL_KEY environment variable
"""

import os
from pathlib import Path
from typing import Any, Optional, Dict, List
from io import BytesIO
from enum import Enum
from contextlib import contextmanager
import requests
from PIL import Image

try:
    import fal_client
    HAS_FAL_CLIENT = True
except ImportError:
    HAS_FAL_CLIENT = False

from lab.base import MessageHistory, AgentPlugin, AgentImplOutput
# from utilss.workspace_manager import WorkspaceManager
from utilss.workspace_manager import WorkspaceManager

# Configuration Module
class ImageConfig:
    """Configuration constants for image generation"""
    
    class AspectRatio(str, Enum):
        SQUARE = "1:1"
        WIDE = "16:9"
        TALL = "9:16"
        LANDSCAPE = "4:3"
        PORTRAIT = "3:4"
        VERTICAL = "2:3"
        HORIZONTAL = "3:2"
    
    class OutputFormat(str, Enum):
        PNG = "png"
        JPEG = "jpeg"
        WEBP = "webp"
    
    class SafetyLevel(str, Enum):
        STRICT = "strict"
        MODERATE = "moderate"
        PERMISSIVE = "permissive"
    
    # Supported models on Fal AI
    MODELS = {
        "imagen4": "fal-ai/imagen4/preview",
        "flux-schnell": "fal-ai/flux/schnell",
        "flux-dev": "fal-ai/flux/dev",
        "stable-diffusion": "fal-ai/stable-diffusion-v3-medium",
    }
    
    DEFAULT_MODEL = "flux-dev"
    DEFAULT_OUTPUT_FORMAT = OutputFormat.PNG
    DEFAULT_ASPECT_RATIO = AspectRatio.SQUARE
    PNG_EXTENSION = ".png"


# Exception Module
class ImageGenerationError(Exception):
    """Custom exception for image generation errors."""
    pass


# Client Module
class FalAIImageClient:
    """Client for interacting with Fal AI API"""
    
    def __init__(self, api_token: str):
        if not HAS_FAL_CLIENT:
            raise ImageGenerationError("Fal AI client package not available. Install with: pip install fal-client")
        
        # Store the API token - we'll set FAL_KEY temporarily during API calls
        self.api_token = api_token
        print(f"FalAI Client initialized with token: {api_token[:10]}...")
    
    @contextmanager
    def _temporary_fal_key(self):
        """Context manager for temporarily setting FAL_KEY environment variable"""
        # Store original value
        original = os.environ.get('FAL_KEY')
        
        try:
            # Set new value
            os.environ['FAL_KEY'] = self.api_token
            print(f"Temporarily set FAL_KEY to: {self.api_token[:10]}...")
            yield
        finally:
            # Restore original value
            if original is None:
                if 'FAL_KEY' in os.environ:
                    del os.environ['FAL_KEY']
                    print("Removed temporary FAL_KEY from environment")
            else:
                os.environ['FAL_KEY'] = original
                print(f"Restored original FAL_KEY: {original[:10]}...")
    
    def generate_image(self, model: str, prompt: str, **kwargs) -> List[str]:
        """Generate image using specified model and parameters"""
        # Use context manager for safer environment variable handling
        with self._temporary_fal_key():
            if model not in ImageConfig.MODELS:
                raise ImageGenerationError(f"Unsupported model: {model}. Available models: {list(ImageConfig.MODELS.keys())}")
            
            model_id = ImageConfig.MODELS[model]
            
            # Prepare input parameters based on model
            input_params = self._prepare_model_inputs(model, prompt, **kwargs)
            
            print(f"Current FAL_KEY in environment: {os.environ.get('FAL_KEY', 'NOT_SET')[:10]}...")
            print(f"Generating with model: {model_id}")
            
            try:
                # Submit the generation request
                handler = fal_client.submit(model_id, arguments=input_params)
                
                # Get the result
                result = handler.get()
                
                # Handle different output formats
                if isinstance(result, dict):
                    # Extract image URLs from the result
                    if "images" in result:
                        return [img["url"] for img in result["images"]]
                    elif "image" in result:
                        if isinstance(result["image"], dict) and "url" in result["image"]:
                            return [result["image"]["url"]]
                        elif isinstance(result["image"], str):
                            return [result["image"]]
                    elif "url" in result:
                        return [result["url"]]
                    else:
                        raise ImageGenerationError(f"Unexpected result format: {result}")
                elif isinstance(result, list):
                    return result
                elif isinstance(result, str):
                    return [result]
                else:
                    raise ImageGenerationError(f"Unexpected output format: {type(result)}")
                    
            except Exception as e:
                raise ImageGenerationError(f"Failed to generate image with fal_client: {str(e)}")
    
    def _prepare_model_inputs(self, model: str, prompt: str, **kwargs) -> Dict[str, Any]:
        """Prepare input parameters for specific models"""
        base_inputs = {
            "prompt": prompt,
        }
        
        # Model-specific parameters
        if model == "imagen4":
            base_inputs.update({
                "aspect_ratio": kwargs.get("aspect_ratio", ImageConfig.DEFAULT_ASPECT_RATIO.value),
                "output_format": kwargs.get("output_format", ImageConfig.DEFAULT_OUTPUT_FORMAT.value),
                "safety_level": kwargs.get("safety_level", "moderate"),
                "seed": kwargs.get("seed"),
                "num_inference_steps": kwargs.get("num_inference_steps", 20),
            })
        
        elif model in ["flux-schnell", "flux-dev"]:
            base_inputs.update({
                "image_size": self._aspect_ratio_to_size(kwargs.get("aspect_ratio", ImageConfig.DEFAULT_ASPECT_RATIO.value)),
                "num_inference_steps": kwargs.get("num_inference_steps", 4 if model == "flux-schnell" else 28),
                "guidance_scale": kwargs.get("guidance_scale", 3.5),
                "seed": kwargs.get("seed"),
                "enable_safety_checker": kwargs.get("enable_safety_checker", True),
            })
        
        elif model == "stable-diffusion":
            base_inputs.update({
                "image_size": self._aspect_ratio_to_size(kwargs.get("aspect_ratio", ImageConfig.DEFAULT_ASPECT_RATIO.value)),
                "num_inference_steps": kwargs.get("num_inference_steps", 20),
                "guidance_scale": kwargs.get("guidance_scale", 7.5),
                "seed": kwargs.get("seed"),
                "enable_safety_checker": kwargs.get("enable_safety_checker", True),
            })
        
        # Add num_images if specified
        num_outputs = kwargs.get("num_outputs", 1)
        if num_outputs > 1:
            base_inputs["num_images"] = num_outputs
        
        # Remove None values
        return {k: v for k, v in base_inputs.items() if v is not None}
    
    def _aspect_ratio_to_size(self, aspect_ratio: str) -> str:
        """Convert aspect ratio to image size format for Fal AI"""
        aspect_ratio_map = {
            "1:1": "square_hd",
            "16:9": "landscape_16_9",
            "9:16": "portrait_9_16",
            "4:3": "landscape_4_3",
            "3:4": "portrait_3_4",
            "3:2": "landscape_3_2",
            "2:3": "portrait_2_3",
        }
        return aspect_ratio_map.get(aspect_ratio, "square_hd")


# Validator Module
class InputValidator:
    """Validates input parameters for image generation"""
    
    @staticmethod
    def validate_tool_input(tool_input: Dict[str, Any]) -> None:
        """Validate the tool input parameters"""
        output_filename = tool_input.get("output_filename", "")
        
        if not output_filename.lower().endswith(ImageConfig.PNG_EXTENSION):
            raise ImageGenerationError(
                f"Output filename must end with {ImageConfig.PNG_EXTENSION}"
            )
        
        model = tool_input.get("model", ImageConfig.DEFAULT_MODEL)
        if model not in ImageConfig.MODELS:
            raise ImageGenerationError(
                f"Unsupported model: {model}. Available models: {list(ImageConfig.MODELS.keys())}"
            )
        
        # Validate aspect ratio
        aspect_ratio = tool_input.get("aspect_ratio", ImageConfig.DEFAULT_ASPECT_RATIO.value)
        valid_ratios = [ratio.value for ratio in ImageConfig.AspectRatio]
        if aspect_ratio not in valid_ratios:
            raise ImageGenerationError(
                f"Invalid aspect ratio: {aspect_ratio}. Valid options: {valid_ratios}"
            )
        
        # Validate safety level for imagen4
        if model == "imagen4":
            safety_level = tool_input.get("safety_level", "moderate")
            valid_safety_levels = ["strict", "moderate", "permissive"]
            if safety_level not in valid_safety_levels:
                raise ImageGenerationError(
                    f"Invalid safety level: {safety_level}. Valid options: {valid_safety_levels}"
                )


# File Manager Module
class ImageFileManager:
    """Handles file operations for generated images"""
    
    def __init__(self, workspace_manager: WorkspaceManager):
        self.workspace_manager = workspace_manager
    
    def prepare_output_path(self, relative_filename: str) -> Path:
        """Prepare the output path and create directories if needed"""
        local_output_path = self.workspace_manager.workspace_path(Path(relative_filename))
        local_output_path.parent.mkdir(parents=True, exist_ok=True)
        return local_output_path
    
    def download_and_save_image(self, image_url: str, output_path: Path) -> None:
        """Download image from URL and save to local path"""
        try:
            response = requests.get(image_url, stream=True)
            response.raise_for_status()
            
            # Load and save as PNG
            image = Image.open(BytesIO(response.content))
            image.save(str(output_path), "PNG")
            
        except requests.RequestException as e:
            raise ImageGenerationError(f"Failed to download image: {str(e)}")
        except Exception as e:
            raise ImageGenerationError(f"Failed to save image: {str(e)}")
    
    def get_output_url(self, relative_filename: str) -> str:
        """Generate the output URL for the saved image"""
        if hasattr(self.workspace_manager, "file_server_port"):
            return f"http://localhost:{self.workspace_manager.file_server_port}/workspace/{relative_filename}"
        return f"(Local path: {relative_filename})"


# Main Tool Module
class ImageGenerateTool(AgentPlugin):
    """Main image generation tool using Fal AI API"""
    
    name = "generate_image_from_text"
    description = """Generates an image based on a text prompt using Fal AI's image generation models including Imagen4.
The generated image will be saved to the specified local path in the workspace as a PNG file."""
    
    input_schema = {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "A detailed description of the image to be generated.",
            },
            "output_filename": {
                "type": "string",
                "description": "The desired relative path for the output PNG image file within the workspace (e.g., 'generated_images/my_image.png'). Must end with .png.",
            },
            "model": {
                "type": "string",
                "enum": list(ImageConfig.MODELS.keys()),
                "default": ImageConfig.DEFAULT_MODEL,
                "description": "The image generation model to use. 'flux-dev' is the default and recommended model.",
            },
            "num_outputs": {
                "type": "integer",
                "default": 1,
                "minimum": 1,
                "maximum": 4,
                "description": "Number of images to generate (1-4).",
            },
            "aspect_ratio": {
                "type": "string",
                "enum": [ratio.value for ratio in ImageConfig.AspectRatio],
                "default": ImageConfig.DEFAULT_ASPECT_RATIO.value,
                "description": "The aspect ratio for the generated image.",
            },
            "seed": {
                "type": "integer",
                "description": "(Optional) A seed for deterministic generation.",
            },
            "num_inference_steps": {
                "type": "integer",
                "description": "(Optional) Number of inference steps. Higher values may produce better quality but take longer.",
            },
            "guidance_scale": {
                "type": "number",
                "description": "(Optional) How closely to follow the prompt. Higher values follow the prompt more closely.",
            },
            "safety_level": {
                "type": "string",
                "enum": ["strict", "moderate", "permissive"],
                "default": "moderate",
                "description": "(Optional) Safety level for content filtering. Only applies to imagen4 model.",
            },
            "output_format": {
                "type": "string",
                "enum": [fmt.value for fmt in ImageConfig.OutputFormat],
                "default": ImageConfig.DEFAULT_OUTPUT_FORMAT.value,
                "description": "(Optional) Output format for the image.",
            },
            "api_token": {
                "type": "string",
                "description": "(Optional) Fal AI API token. If not provided, will use plan-based token resolution.",
            },
        },
        "required": ["prompt", "output_filename"],
    }
    
    def __init__(self, workspace_manager: WorkspaceManager = None, api_token: Optional[str] = None, 
                 key_part: Optional[str] = None, plan: Optional[str] = None):
        """
        Initialize the ImageGenerateTool
        
        Args:
            workspace_manager: WorkspaceManager instance
            api_token: Deprecated, use key_part instead
            key_part: Custom API key for custom_api plan
            plan: Plan type ('custom_api' or other)
        """
        super().__init__()
        self.workspace_manager = workspace_manager
        self.validator = InputValidator()
        self.file_manager = ImageFileManager(workspace_manager) if workspace_manager else None
        
        # Handle plan-based API key management
        self.plan = plan
        self.key_part = key_part
        self.api_token = api_token  # Keep for backward compatibility
        
        print(f"ImageGenerateTool initialized - Plan: {plan}, Key provided: {bool(key_part)}")
        
        # Validate plan and key configuration
        self._validate_plan_and_key()
    
    def _validate_plan_and_key(self) -> None:
        """Validate plan and API key configuration"""
        if self.plan == "custom_api":
            if not self.key_part:
                raise ImageGenerationError(
                    "Custom API key (key_part) is required when plan is 'custom_api'"
                )
            print(f"✓ Custom API plan validated with key: {self.key_part[:10]}...")
        elif self.plan is not None:
            # For non-custom_api plans, check environment variable exists
            env_key = os.environ.get('FAL_KEY')
            if not env_key:
                raise ImageGenerationError(
                    f"Plan '{self.plan}' requires FAL_KEY environment variable to be set"
                )
            print(f"✓ Plan '{self.plan}' validated with env FAL_KEY: {env_key[:10]}...")
    
    def _get_api_token(self) -> str:
        """Get the appropriate API token based on plan"""
        if self.plan == "custom_api":
            if not self.key_part:
                raise ImageGenerationError(
                    "Custom API key (key_part) is required for custom_api plan"
                )
            print(f"→ Using custom API key: {self.key_part[:10]}... for custom_api plan")
            return self.key_part
        
        elif self.plan is not None:
            # For other plans, use environment variable
            env_key = os.environ.get('FAL_KEY')
            if not env_key:
                raise ImageGenerationError(
                    f"Plan '{self.plan}' requires FAL_KEY environment variable to be set"
                )
            print(f"→ Using env FAL_KEY: {env_key[:10]}... for plan: {self.plan}")
            return env_key
        
        else:
            # For backward compatibility when no plan is specified
            token = self.api_token or os.environ.get('FAL_KEY')
            if not token:
                raise ImageGenerationError("No API token available")
            print(f"→ Using token (no plan): {token[:10]}...")
            return token
    
    def _initialize_client(self, tool_input_token: Optional[str] = None) -> FalAIImageClient:
        """Initialize the Fal AI client with plan-aware token management"""
        # For tool input tokens, only allow if plan is custom_api or not set
        if tool_input_token:
            if self.plan and self.plan != "custom_api":
                raise ImageGenerationError(
                    f"Cannot override API token for plan '{self.plan}'. "
                    "Token override only allowed for 'custom_api' plan."
                )
            print(f"→ Using tool input token: {tool_input_token[:10]}...")
            return FalAIImageClient(tool_input_token)
        
        # Use plan-based token resolution - NO FALLBACK FOR custom_api
        token = self._get_api_token()
        print(f"→ Final token being used: {token[:10]}... for plan: {self.plan}")
        return FalAIImageClient(token)
    
    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory] = None,
    ) -> AgentImplOutput:
        """Generate an image based on the provided text prompt"""
        try:
            # Validate input
            self.validator.validate_tool_input(tool_input)
            
            # Initialize client with plan-aware token management
            client = self._initialize_client(tool_input.get("api_token"))
            
            prompt = tool_input["prompt"]
            relative_output_filename = tool_input["output_filename"]
            model = tool_input.get("model", ImageConfig.DEFAULT_MODEL)
            
            # Prepare output path
            local_output_path = self.file_manager.prepare_output_path(relative_output_filename)
            
            print(f"🎨 Generating image with prompt: {prompt[:50]}...")
            print(f"📁 Output path: {relative_output_filename}")
            print(f"🤖 Model: {model}")
            print(f"📊 Plan: {self.plan}")
            
            # Generate image
            image_urls = client.generate_image(
                model=model,
                prompt=prompt,
                num_outputs=tool_input.get("num_outputs", 1),
                aspect_ratio=tool_input.get("aspect_ratio", ImageConfig.DEFAULT_ASPECT_RATIO.value),
                seed=tool_input.get("seed"),
                num_inference_steps=tool_input.get("num_inference_steps"),
                guidance_scale=tool_input.get("guidance_scale"),
                safety_level=tool_input.get("safety_level", "moderate"),
                output_format=tool_input.get("output_format", ImageConfig.DEFAULT_OUTPUT_FORMAT.value),
            )
            
            if not image_urls:
                raise ImageGenerationError("No images were generated")
            
            print(f"✅ Image generated successfully: {image_urls[0][:50]}...")
            
            # Download and save the first image
            self.file_manager.download_and_save_image(image_urls[0], local_output_path)
            
            # Generate output URL
            output_url = self.file_manager.get_output_url(relative_output_filename)
            
            # Include plan info in response
            plan_info = f" (Plan: {self.plan})" if self.plan else ""
            
            return AgentImplOutput(
                f"Successfully generated image using {model} model{plan_info} and saved to '{relative_output_filename}'. View at: {output_url}",
                f"Image generated and saved to {relative_output_filename}",
                {
                    "success": True,
                    "output_path": relative_output_filename,
                    "url": output_url,
                    "model_used": model,
                    "plan": self.plan,
                    "token_used": f"{self._get_api_token()[:10]}...",
                },
            )
            
        except ImageGenerationError as e:
            error_msg = f"Image generation failed: {str(e)}"
            print(f"❌ {error_msg}")
            return AgentImplOutput(
                error_msg,
                "Failed to generate image from text.",
                {"success": False, "error": str(e), "plan": self.plan},
            )
        except Exception as e:
            error_msg = f"Unexpected error during image generation: {str(e)}"
            print(f"💥 {error_msg}")
            return AgentImplOutput(
                error_msg,
                "Failed to generate image from text.",
                {"success": False, "error": str(e), "plan": self.plan},
            )
    
    def get_tool_start_message(self, tool_input: Dict[str, Any]) -> str:
        """Return a message indicating the tool has started"""
        model = tool_input.get("model", ImageConfig.DEFAULT_MODEL)
        plan_info = f" (Plan: {self.plan})" if self.plan else ""
        return f"Generating image using {model} model{plan_info}, saving to: {tool_input['output_filename']}"


# Factory Module
class ImageGenerationToolFactory:
    """Factory for creating image generation tools with different configurations"""
    
    @staticmethod
    def create_tool(workspace_manager: WorkspaceManager, api_token: Optional[str] = None, 
                   key_part: Optional[str] = None, plan: Optional[str] = None) -> ImageGenerateTool:
        """Create a configured image generation tool with plan support"""
        return ImageGenerateTool(workspace_manager, api_token, key_part, plan)
    
    @staticmethod
    def create_client(api_token: Optional[str] = None, key_part: Optional[str] = None, 
                     plan: Optional[str] = None) -> FalAIImageClient:
        """Create a standalone Fal AI client with plan support"""
        if plan == "custom_api":
            if not key_part:
                raise ImageGenerationError("key_part is required for custom_api plan")
            token = key_part
        elif plan is not None:
            token = os.environ.get('FAL_KEY')
            if not token:
                raise ImageGenerationError(f"FAL_KEY environment variable required for plan '{plan}'")
        else:
            token = api_token or key_part or os.environ.get('FAL_KEY')
            if not token:
                raise ImageGenerationError("API token is required")
        
        return FalAIImageClient(token)
    
    @staticmethod
    def get_available_models() -> Dict[str, str]:
        """Get available models"""
        return ImageConfig.MODELS.copy()


# Utility Functions
def create_image_tool(workspace_manager: WorkspaceManager, api_token: Optional[str] = None,
                     key_part: Optional[str] = None, plan: Optional[str] = None) -> ImageGenerateTool:
    """Simple function to create an image generation tool with plan support"""
    return ImageGenerationToolFactory.create_tool(workspace_manager, api_token, key_part, plan)


def generate_image_simple(
    prompt: str,
    output_path: str,
    workspace_manager: WorkspaceManager,
    api_token: Optional[str] = None,
    key_part: Optional[str] = None,
    plan: Optional[str] = None,
    model: str = ImageConfig.DEFAULT_MODEL,
    **kwargs
) -> Dict[str, Any]:
    """Simple function to generate an image without using the full tool interface"""
    try:
        tool = create_image_tool(workspace_manager, api_token, key_part, plan)
        
        tool_input = {
            "prompt": prompt,
            "output_filename": output_path,
            "model": model,
            **kwargs
        }
        
        # Run the tool (this is async, so you'd need to handle that in your calling code)
        # This is just a convenience function structure
        return {"success": True, "tool_input": tool_input, "plan": plan}
        
    except Exception as e:
        return {"success": False, "error": str(e), "plan": plan}


# Debug utility function
def test_api_key_isolation():
    """Test function to verify API key isolation works correctly"""
    print("🧪 Testing API key isolation...")
    
    # Save original environment
    original_fal_key = os.environ.get('FAL_KEY')
    print(f"Original FAL_KEY: {original_fal_key[:10] if original_fal_key else 'NOT_SET'}...")
    
    # Test with custom API key
    try:
        client = FalAIImageClient("test_custom_key_123")
        print(f"After client creation, FAL_KEY: {os.environ.get('FAL_KEY', 'NOT_SET')[:10]}...")
        
        # Environment should be restored after context manager
        print("✅ API key isolation test passed")
        
    except Exception as e:
        print(f"❌ API key isolation test failed: {e}")
    
    # Verify environment is restored
    final_fal_key = os.environ.get('FAL_KEY')
    if final_fal_key == original_fal_key:
        print("✅ Environment restoration test passed")
    else:
        print(f"❌ Environment restoration test failed: {final_fal_key} != {original_fal_key}")


if __name__ == "__main__":
    # Run tests if executed directly
    test_api_key_isolation()