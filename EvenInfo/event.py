from pydantic import BaseModel
from typing import Any, Dict
from enum import Enum


class EventType(str, Enum):
    # Connection Events
    CONNECTION_ESTABLISHED = "connection_established"
    PONG = "pong"
    UPDATE_BLOCKS = 'update_blocks',
    BLOCKS_UPDATE_SUCCESS = 'blocks_update_success',
    BLOCKS_UPDATE_ERROR = 'blocks_update_error',

    # Creative_canvas
    CANVAS_AI_PROCESSING = "CANVAS_AI_PROCESSING",
    CANVAS_AI_COMPLETE = "CANVAS_AI_COMPLETE",
    CANVAS_AI_ERROR = "CANVAS_AI_ERROR",

    # Agent Lifecycle
    AGENT_INITIALIZED = "agent_initialized"
    AGENT_THINKING = "agent_thinking"
    AGENT_RESPONSE = "agent_response"
    AWAITING_USER_INPUT = "awaiting_user_input"

    # Workspace / System
    WORKSPACE_INFO = "workspace_info"
    SYSTEM = "system"

    # User Interaction
    USER_MESSAGE = "user_message"
    PROMPT_GENERATED = "prompt_generated"

    # Tooling
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"

    # Streaming
    PROCESSING = "processing"
    STREAM_COMPLETE = "stream_complete"

    # File & Browser
    UPLOAD_SUCCESS = "upload_success"
    FILE_EDIT = "file_edit"
    BROWSER_USE = "browser_use"

    # Errors
    ERROR = "error"

    # Deep search
    DEEP_SEARCH_EVENT = "Deep_research_agent_started"
    DEEP_RESEARCH_START = "deep_research_start"
    DEEP_RESEARCH_STEP = "deep_research_step"
    DEEP_RESEARCH_TOKEN = "deep_research_token"
    DEEP_RESEARCH_COMPLETE = "DEEP_SEARCH_COMPLETE"
    TOKEN_USAGE = "token_usage" # For logging token costs
    REASONING_TOKEN="Reasoning_token"

    STREAMING_TOKEN = "STREAMING_TOKEN"
    TOOL_ARGS_STREAM = "Tool_processing"
    STREAMING_COMPLETE = "STREAMING_COMPLETE"

    AGENT_RESPONSE_INTERRUPTED="agent_response_interrupted"


class RealtimeEvent(BaseModel):
    type: EventType
    content: Dict[str, Any]
