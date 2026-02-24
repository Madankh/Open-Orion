import os
import json
import logging
from typing import Any, AsyncGenerator, Union, List
import asyncio
from openai import AsyncOpenAI
from openai import (
    APIConnectionError as OpenAI_APIConnectionError,
)
from dotenv import load_dotenv
load_dotenv()

from openai import (
    InternalServerError as OpenAI_InternalServerError,
)
from openai import (
    RateLimitError as OpenAI_RateLimitError,
)
from openai._types import (
    NOT_GIVEN as OpenAI_NOT_GIVEN,
)

# Import your base classes - adjust these imports to match your actual module structure
from llm.base import (
    LLMClient,
    AgentThinkingBlock,
    ToolDescriptor,
    ToolCall,
    TextResult,
    TextPrompt,
    LLMMessages,
    ToolArgsChunk,
    AgentFormattedResult,
    recursively_remove_invoke_tag,
    ImageBlock,
    AgentThinkingBlock,
    MetadataBlock
)
from utilss.constants import DEFAULT_MODEL


class FunctionCallErrorException(Exception):
    """Exception raised when function call patterns are detected in content."""
    pass

class EmptyResponseException(Exception):
    """Exception raised when LLM returns completely empty response."""
    pass


class APIKeyMissingException(Exception):
    """Exception raised when API key is missing in custom_api mode."""
    pass


class OpenrouterDirectClient(LLMClient):
    """OpenRouter client with efficient streaming that returns consolidated responses."""
    
    def __init__(self, model_name, max_retries=2, use_caching=True, thinking_tokens=0, 
                 agent_id=None, run_id=None, parent_agent_id=None, events=None, 
                 stream_id=None, llm_model_id=None, llm_key=None, app_level_max_retries=3,mode=None):
        
        if mode == "custom_api":
            API_KEY = llm_key
            if not API_KEY or API_KEY.strip() == "":
                raise APIKeyMissingException("API key is missing for custom_api mode")
            self.model_name = model_name
            BASE_URL = os.getenv("OPENROUTER")
        else:
            API_KEY = os.getenv("OPENROUTER_KEY")
            BASE_URL = os.getenv("OPENROUTER")
            
            if model_name != None:
                self.model_name = model_name
            else:
                self.model_name = DEFAULT_MODEL

        
        self.client = AsyncOpenAI(
            base_url=BASE_URL,
            api_key=API_KEY
        )

        self.max_retries = max_retries
        self.app_level_max_retries = app_level_max_retries
        self.use_caching = use_caching
        self.thinking_tokens = thinking_tokens
        
        # Chunk processing attributes (from original code)
        self.agent_id = agent_id
        self.run_id = run_id
        self.parent_agent_id = parent_agent_id
        self.events = events
        self.stream_id = stream_id
        self.llm_model_id = llm_model_id
        
        # Initialize chunk processing state
        self.raw_chunks = []
        self.actual_usage = None
        self.model_id_used = None
        self.full_reasoning_content = ""
        self.full_content = ""
        self.current_tool_call_chunks = {}
        
        # Set up logging
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def _get_contextual_data_for_event(self):
        """Get contextual data for events - implement based on your needs."""
        return {}
    
    def _create_retry_messages(self, attempt: int, original_messages: list, current_stream_id: str = None) -> list:
        """Create retry messages based on attempt number."""
        retry_messages = original_messages.copy()
        
        if attempt == 0:
            # First retry - add empty assistant response and user instruction
            message_to_extend = [
                {"role": "assistant", "content": ""},
                {
                    "role": "user",
                    "content": (
                        "You just made an empty response, which is not acceptable. "
                        f"Not making any response is not an option. DO NOT apologize, just continue from where you left off. Directly address last message: '{json.dumps(original_messages[-1])}' "
                        "DO NOT GIVE ANY EXPLANATION, JUST CONTINUE THE TASK FROM WHERE YOU LEFT OFF. START YOUR RESPONSE WITH 'OK,' or equivalent in user's language, and then continue with your response. "
                        "Unless it is absolutely impossible to continue, you must obey this instruction and respond user's query without denial, preferably with a tool call at the end. "
                    )
                }
            ]
            retry_messages.extend(message_to_extend)
        elif attempt == 1:
            # Second retry - add more forceful instruction
            message_to_append = {
                "role": "user",
                "content": (
                    "You must ensure that you make a tool call or just say something, regardless of the situation. "
                    "Not making any response is not an option. "
                )
            }
            retry_messages.append(message_to_append)
        else:
            # Final retry - add fallback message
            message_to_append = {
                "role": "assistant",
                "content": (
                    "It appears that I am unable to make further progress. For this final attempt, I will just say something, or call a tool to conclude this flow. "
                    "[To Principal: If you see this message, please review my reasoning and content to assess my progress. "
                    "If there has been no meaningful advancement, consider restarting this workflow with revised requirements.]"
                )
            }
            retry_messages.append(message_to_append)
        
        return retry_messages

    async def process_chunk(self, chunk: Any) -> AsyncGenerator[Union[TextResult, AgentThinkingBlock, ToolArgsChunk], None]:
        """
        Process individual chunks and YIELDS multiple block types for true real-time streaming.
        This is now an async generator.
        """
        # --- Part 1: Initial Chunk Processing with improved usage extraction ---
        self.raw_chunks.append(chunk)
        
        if os.environ.get("DEBUG_LLM", "0") == "1":
            self.logger.debug("llm_chunk_received", extra={"agent_id": self.agent_id, "chunk_data": str(chunk)})
    
        # FIXED: Better usage extraction logic
        if hasattr(chunk, "usage") and chunk.usage is not None:
            self.logger.info(f"Usage chunk detected: {chunk.usage}")
            try:
                # Handle different usage object types
                if hasattr(chunk.usage, 'model_dump'):
                    # Pydantic model
                    self.actual_usage = chunk.usage.model_dump()
                elif hasattr(chunk.usage, "dict"):
                    # Object with dict method
                    self.actual_usage = chunk.usage.dict()
                elif hasattr(chunk.usage, "__dict__"):
                    # Regular object with __dict__
                    self.actual_usage = vars(chunk.usage)
                else:
                    # Try to convert to dict directly
                    self.actual_usage = dict(chunk.usage)
                
                self.logger.info(f"Successfully captured usage: {self.actual_usage}")
            except Exception as e_usage:
                self.logger.error(f"Failed to extract usage from chunk: {e_usage}", exc_info=True)
                try:
                    # Convert chunk to dict and look for usage
                    chunk_dict = json.loads(str(chunk)) if not isinstance(chunk, dict) else chunk
                    if 'usage' in chunk_dict:
                        self.actual_usage = chunk_dict['usage']
                        self.logger.info(f"Alternative usage extraction successful: {self.actual_usage}")
                except Exception as e_alt:
                    self.logger.error(f"Alternative usage extraction also failed: {e_alt}")
    
        if not hasattr(chunk, "choices") or not chunk.choices:
            self.logger.debug("llm_chunk_no_choices", extra={"agent_id": self.agent_id})
            return
        
        if not self.model_id_used and hasattr(chunk, "model") and chunk.model:
            self.model_id_used = chunk.model
            self.logger.debug("model_id_captured", extra={"agent_id": self.agent_id, "model_id_used": self.model_id_used})
    
        delta = chunk.choices[0].delta
        self.logger.debug("llm_delta_received", extra={"agent_id": self.agent_id, "delta_data": str(delta)})
    
        # --- Part 2: Content Streaming (Logic is the same, but now uses `yield`) ---
        if hasattr(delta, "reasoning_content") and delta.reasoning_content is not None:
            self.full_reasoning_content += delta.reasoning_content
            if self.events:
                # This is for backend logging/auditing
                await self.events.emit_llm_chunk(
                    run_id=self.run_id, agent_id=self.agent_id, parent_agent_id=self.parent_agent_id, 
                    chunk_type="reasoning_content", content=delta.reasoning_content, stream_id=self.stream_id, 
                    llm_id=self.llm_model_id, contextual_data=self._get_contextual_data_for_event()
                )
            yield AgentThinkingBlock(content=delta.reasoning_content)
    
        if hasattr(delta, "content") and delta.content is not None:
            self.full_content += delta.content
            if "<tool_call>" in self.full_content or "<tool_code>" in self.full_content:
                raise FunctionCallErrorException("Detected '<tool_call>' or '<tool_code>' in stream, forcing retry.")
            
            if self.events:
                # This is for backend logging/auditing
                await self.events.emit_llm_chunk(
                    run_id=self.run_id, agent_id=self.agent_id, parent_agent_id=self.parent_agent_id, 
                    chunk_type="content", content=delta.content, stream_id=self.stream_id, 
                    llm_id=self.llm_model_id, contextual_data=self._get_contextual_data_for_event()
                )
            
            # This sends the text chunk to the AgentExecutor for the live UI stream
            yield TextResult(text=delta.content)
    
        # --- Part 3: Tool Call Streaming (This is the completely new logic) ---
        if hasattr(delta, "tool_calls") and delta.tool_calls:
            for tc_chunk in delta.tool_calls:
                index = tc_chunk.index if hasattr(tc_chunk, "index") else 0
                if index not in self.current_tool_call_chunks:
                    self.current_tool_call_chunks[index] = {
                        "id": None, "type": "function", 
                        "function": {"name": "", "arguments": ""},
                        "has_signaled_start": False # Flag to prevent duplicate "thinking" signals
                    }
                
                # Buffer the ID for the final, complete tool call
                if hasattr(tc_chunk, "id") and tc_chunk.id:
                    self.current_tool_call_chunks[index]["id"] = tc_chunk.id
                
                if hasattr(tc_chunk, "function"):
                    # Handle the tool name
                    if hasattr(tc_chunk.function, "name") and tc_chunk.function.name:
                        tool_name_delta = tc_chunk.function.name
                        # Buffer the name for the final, complete tool call
                        self.current_tool_call_chunks[index]["function"]["name"] += tool_name_delta
                        
                        if self.events:
                            # This is for backend logging/auditing
                            await self.events.emit_llm_chunk(
                                run_id=self.run_id, agent_id=self.agent_id, parent_agent_id=self.parent_agent_id, 
                                chunk_type="tool_name", content=tool_name_delta, stream_id=self.stream_id, 
                                llm_id=self.llm_model_id, contextual_data=self._get_contextual_data_for_event()
                            )
                        
                        # Check if this is the first time we see a name for this tool
                        if not self.current_tool_call_chunks[index]["has_signaled_start"]:
                            self.current_tool_call_chunks[index]["has_signaled_start"] = True
                            tool_name = self.current_tool_call_chunks[index]["function"]["name"]
                            # This sends the "thinking" signal to the AgentExecutor for the live UI stream
                            yield AgentThinkingBlock(content=f"Using tool: `{tool_name}`")
                    
                    # Handle the tool arguments
                    if hasattr(tc_chunk.function, "arguments") and tc_chunk.function.arguments:
                        argument_delta = tc_chunk.function.arguments
                        
                        # 1. Buffer the arguments for the final, complete tool call
                        self.current_tool_call_chunks[index]["function"]["arguments"] += argument_delta
                        
                        if self.events:
                            # 2. This is for backend logging/auditing
                            await self.events.emit_llm_chunk(
                                run_id=self.run_id, agent_id=self.agent_id, parent_agent_id=self.parent_agent_id, 
                                chunk_type="tool_args", content=argument_delta, stream_id=self.stream_id, 
                                llm_id=self.llm_model_id, contextual_data=self._get_contextual_data_for_event()
                            )
                        buffered_tool_name = self.current_tool_call_chunks[index]["function"]["name"]
                        buffered_tool_id = self.current_tool_call_chunks[index]["id"]
                        # 3. This sends the argument chunk to the AgentExecutor for the live UI stream
                        yield ToolArgsChunk(
                            content=argument_delta,
                            tool_name=buffered_tool_name,
                            tool_call_id=buffered_tool_id
                        )
    
    def _convert_to_openai_format(self, messages: LLMMessages) -> list[dict]:
        """Convert internal message format to OpenAI/OpenRouter format."""
        self.logger.info(f"Converting {len(messages)} message groups to OpenAI format")
        
        openai_messages = []
        
        for idx, message_list in enumerate(messages):
            role = "user" if idx % 2 == 0 else "assistant"
            message_content_list = []
            
            self.logger.debug(f"Processing message group {idx} with role '{role}' containing {len(message_list)} messages")
            
            for message in message_list:
                message_content = None
                
                if isinstance(message, TextPrompt):
                    message_content = {"type": "text", "text": message.text}
                    self.logger.debug(f"Added TextPrompt: {message.text[:100]}...")
                elif isinstance(message, TextResult):
                    message_content = {"type": "text", "text": message.text}
                    self.logger.debug(f"Added TextResult: {message.text[:100]}...")
                elif isinstance(message, ImageBlock):
                    if hasattr(message.source, 'media_type') and hasattr(message.source, 'data'):
                        message_content = {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{message.source.media_type};base64,{message.source.data}"
                            }
                        }
                    else:
                        message_content = {
                            "type": "image_url",
                            "image_url": {"url": str(message.source)}
                        }
                    self.logger.debug(f"Added ImageBlock")
                elif isinstance(message, ToolCall):
                    if role == "assistant":
                        continue
                elif isinstance(message, AgentFormattedResult):
                    if role == "user":
                        tool_message = {
                            "role": "tool",
                            "tool_call_id": message.tool_call_id,
                            "content": str(message.tool_result)
                        }
                        openai_messages.append(tool_message)
                        self.logger.debug(f"Added tool result for call_id {message.tool_call_id}: {str(message.tool_result)[:100]}...")
                        continue
                
                if message_content and self._validate_content(message_content):
                    message_content_list.append(message_content)
            
            # Handle tool calls
            tool_calls = []
            if role == "assistant":
                for message in message_list:
                    if isinstance(message, ToolCall):
                        tool_calls.append({
                            "id": message.tool_call_id,
                            "type": "function",
                            "function": {
                                "name": message.tool_name,
                                "arguments": json.dumps(message.tool_input) if isinstance(message.tool_input, dict) else str(message.tool_input)
                            }
                        })
            
            if message_content_list or tool_calls:
                message_dict = {"role": role}
                
                if message_content_list:
                    if len(message_content_list) == 1 and message_content_list[0]["type"] == "text":
                        message_dict["content"] = message_content_list[0]["text"]
                    else:
                        message_dict["content"] = message_content_list
                
                if tool_calls:
                    message_dict["tool_calls"] = tool_calls
                
                if role == "assistant" and not tool_calls and not message_content_list:
                    message_dict["content"] = "I'll help you with that."
                
                openai_messages.append(message_dict)
        
        # Log the final message structure
        for i, msg in enumerate(openai_messages):
            msg_summary = {
                "role": msg["role"],
                "has_content": "content" in msg,
                "has_tool_calls": "tool_calls" in msg,
                "content_length": len(str(msg.get("content", ""))) if "content" in msg else 0,
                "tool_calls_count": len(msg.get("tool_calls", [])) if "tool_calls" in msg else 0
            }
            self.logger.debug(f"Message {i}: {msg_summary}")
        
        return openai_messages
    
    def _validate_content(self, content_block: dict) -> bool:
        """Validate that a content block has actual content."""
        if content_block.get("type") == "text":
            text = content_block.get("text", "").strip()
            return len(text) > 0
        elif content_block.get("type") == "tool_use":
            return True
        elif content_block.get("type") == "tool_result":
            content = content_block.get("content", "")
            if isinstance(content, str):
                return len(content.strip()) > 0
            return content is not None
        elif content_block.get("type") == "image_url":
            return content_block.get("image_url", {}).get("url") is not None
        return False
    
    async def _generate_single_attempt(
        self,
        openai_messages: list[dict],
        max_tokens: int,
        temperature: float = 0.0,
        tool_params: list = None,
        tool_choice: dict = None,
    ) -> AsyncGenerator[Union[TextResult, ToolCall, MetadataBlock, AgentThinkingBlock, ToolArgsChunk], None]:
        """Single generation attempt without retry logic."""
        
        # Reset chunk processing state
        self.raw_chunks = []
        self.actual_usage = None
        self.model_id_used = None
        self.full_reasoning_content = ""
        self.full_content = ""
        self.current_tool_call_chunks = {}
        
        # FIXED: Prepare request parameters with usage tracking enabled
        request_params = {
            "model": self.model_name,
            "messages": openai_messages,
            "max_tokens": 8192,
            "temperature": temperature,
            "stream": True,
        }
        
        if tool_params:
            request_params["tools"] = tool_params
            if tool_choice:
                request_params["tool_choice"] = self._convert_tool_choice(tool_choice)
        
        # Calculate and log token estimate
        total_chars = sum(len(str(msg.get("content", ""))) for msg in openai_messages)
        estimated_tokens = total_chars // 4
        self.logger.info(f"Estimated input tokens: ~{estimated_tokens}")
        
        has_content = False
        has_tool_calls = False
        
        try:
            stream = await self.client.chat.completions.create(**request_params)
            
            async for chunk in stream:
                # The inner loop correctly consumes the async generator
                async for result_block in self.process_chunk(chunk):
                    if isinstance(result_block, TextResult):
                        has_content = True
                    yield result_block    
            
            # Yield completed tool calls
            for call_index, call_data in self.current_tool_call_chunks.items():
                if call_data["id"] and call_data["function"]["name"]:
                    has_tool_calls = True
                    try:
                        if call_data["function"]["arguments"]:
                            tool_args = json.loads(call_data["function"]["arguments"])
                        else:
                            tool_args = {}
                        
                        yield ToolCall(
                            tool_call_id=call_data["id"],
                            tool_name=call_data["function"]["name"],
                            tool_input=recursively_remove_invoke_tag(tool_args)
                        )
                    except json.JSONDecodeError as e:
                        self.logger.error(f"Failed to parse tool call arguments: {e}")
                        yield ToolCall(
                            tool_call_id=call_data["id"],
                            tool_name=call_data["function"]["name"],
                            tool_input=call_data["function"]["arguments"]
                        )
            
            # Check for empty response
            if not has_content and not has_tool_calls:
                raise EmptyResponseException("Received completely empty response from LLM, forcing retry.")
            
            # FIXED: Yield metadata at the end with better usage data handling
            metadata = {"raw_response": "streaming_response"}
            if self.actual_usage:
                metadata.update(self.actual_usage)
                self.logger.info(f"Token usage from chunks: {self.actual_usage}")
            else:
                # Provide default values if usage wasn't captured
                metadata.update({
                    "prompt_tokens": -1,
                    "completion_tokens": -1,
                    "total_tokens": -1,
                })
                self.logger.warning("No usage information was captured from streaming response")
            
            yield MetadataBlock(metadata=metadata)
            self.logger.info("Generation completed successfully")
    
        except (FunctionCallErrorException, EmptyResponseException):
            # Re-raise these exceptions to trigger retry at higher level
            raise
        except Exception as e:
            self.logger.error(f"Streaming error: {e}", exc_info=True)
            
            # FIXED: Fallback logic with usage tracking
            self.logger.info("Attempting fallback to non-streaming request...")
            try:
                # Use the same parameters but without streaming
                fallback_params = request_params.copy()
                fallback_params["stream"] = False
                response = await self.client.chat.completions.create(**fallback_params)
                
                fallback_has_content = False
                fallback_has_tool_calls = False
                
                if response.choices and response.choices[0].message:
                    message = response.choices[0].message
                    if message.content and message.content.strip():
                        fallback_has_content = True
                        yield TextResult(text=message.content)
                    
                    if message.tool_calls:
                        fallback_has_tool_calls = True
                        for tool_call in message.tool_calls:
                            try:
                                tool_args = json.loads(tool_call.function.arguments)
                                yield ToolCall(
                                    tool_call_id=tool_call.id,
                                    tool_name=tool_call.function.name,
                                    tool_input=recursively_remove_invoke_tag(tool_args)
                                )
                            except json.JSONDecodeError:
                                yield ToolCall(
                                    tool_call_id=tool_call.id,
                                    tool_name=tool_call.function.name,
                                    tool_input=tool_call.function.arguments
                                )
                
                # Check for empty response in fallback too
                if not fallback_has_content and not fallback_has_tool_calls:
                    raise EmptyResponseException("Fallback also returned empty response, forcing retry.")
                
                # FIXED: Yield metadata with proper usage extraction
                metadata = {"raw_response": response}
                if response.usage:
                    metadata.update({
                        "prompt_tokens": response.usage.prompt_tokens,
                        "completion_tokens": response.usage.completion_tokens,
                        "total_tokens": response.usage.total_tokens,
                    })
                    # Add additional usage fields if they exist
                    if hasattr(response.usage, 'cached_tokens'):
                        metadata["cached_tokens"] = response.usage.cached_tokens
                    if hasattr(response.usage, 'reasoning_tokens'):
                        metadata["reasoning_tokens"] = response.usage.reasoning_tokens
                else:
                    metadata.update({
                        "prompt_tokens": -1,
                        "completion_tokens": -1,
                        "total_tokens": -1,
                    })
                yield MetadataBlock(metadata=metadata)
                
            except (EmptyResponseException, FunctionCallErrorException):
                # Re-raise these exceptions to trigger retry
                raise
            except Exception as fallback_error:
                self.logger.error(f"Fallback also failed: {fallback_error}", exc_info=True)
                raise Exception(f"Both streaming and fallback failed. Original: {e}, Fallback: {fallback_error}")

    async def generate(
        self,
        messages: LLMMessages,
        max_tokens: int,
        system_prompt: str | None = None,
        temperature: float = 0.0,
        tools: list[ToolDescriptor] = [],
        tool_choice: dict[str, str] | None = None,
        thinking_tokens: int | None = None,
    ) -> AsyncGenerator[Union[TextResult, ToolCall, MetadataBlock, AgentThinkingBlock, ToolArgsChunk], None]:
        """Generate streaming responses with enhanced chunk processing and retry logic."""
        
        # Convert to OpenAI format
        try:
            openai_messages = self._convert_to_openai_format(messages)
        except Exception as e:
            self.logger.error(f"Failed to convert messages to OpenAI format: {e}", exc_info=True)
            raise
        
        # Add system prompt if provided
        if system_prompt:
            openai_messages.insert(0, {"role": "system", "content": system_prompt})
            self.logger.info(f"Added system prompt: {system_prompt[:100]}...")
        
        # Convert tools to OpenAI format
        tool_params = None
        if tools:
            try:
                tool_params = [
                    {
                        "type": "function",
                        "function": {
                            "name": tool.name,
                            "description": tool.description,
                            "parameters": tool.input_schema
                        }
                    }
                    for tool in tools
                ]
            except Exception as e:
                self.logger.error(f"Failed to convert tools: {e}", exc_info=True)
                raise
        
        # Store original messages for retry logic
        original_messages = openai_messages.copy()
        current_stream_id = self.stream_id or "unknown"
        last_app_level_exception = None
        
        # Retry loop
        for attempt in range(self.app_level_max_retries + 1):
            try:
                self.logger.info(f"Generation attempt {attempt + 1}/{self.app_level_max_retries + 1}")
                
                # Use modified messages for retries
                if attempt > 0:
                    openai_messages = self._create_retry_messages(attempt - 1, original_messages, current_stream_id)
                    self.logger.info(f"Using retry messages for attempt {attempt + 1}")
                
                # Try the generation
                async for result in self._generate_single_attempt(
                    openai_messages=openai_messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    tool_params=tool_params,
                    tool_choice=tool_choice
                ):
                    yield result
                
                # If we get here, generation was successful
                return
                
            except (FunctionCallErrorException, EmptyResponseException) as e_retry:
                last_app_level_exception = e_retry
                self.logger.warning(
                    "app_level_retry_triggered", 
                    extra={
                        "stream_id": current_stream_id, 
                        "reason": str(e_retry), 
                        "attempt": attempt + 1, 
                        "max_attempts": self.app_level_max_retries + 1
                    }
                )
                
                # If this was the last attempt, re-raise the exception
                if attempt >= self.app_level_max_retries:
                    self.logger.error(
                        f"All {self.app_level_max_retries + 1} attempts failed. Last error: {e_retry}",
                        exc_info=True
                    )
                    raise e_retry
                
                # Add a small delay before retry
                await asyncio.sleep(1.0 * (attempt + 1))  # Progressive delay
                
            except Exception as e:
                # For non-retryable exceptions, just raise immediately
                self.logger.error(f"Non-retryable error during generation: {e}", exc_info=True)
                raise
    
    def _convert_tool_choice(self, tool_choice: dict[str, str]) -> dict:
        """Convert tool choice to OpenAI format."""
        if tool_choice.get("type") == "tool":
            return {
                "type": "function",
                "function": {"name": tool_choice["name"]}
            }
        return tool_choice