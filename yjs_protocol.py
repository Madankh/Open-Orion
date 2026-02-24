"""
Y.js binary protocol utilities
Implements the Y.js WebSocket protocol specification
Reference: https://github.com/yjs/y-protocols
"""

from typing import Tuple
import struct

# Protocol message types (first byte of message)
MESSAGE_SYNC = 0        # Synchronization messages
MESSAGE_AWARENESS = 1   # Awareness protocol (cursors, selections)
MESSAGE_AUTH = 2        # Authentication messages
MESSAGE_QUERY_AWARENESS = 3  # Query awareness state

# Sync message subtypes (second byte for MESSAGE_SYNC)
SYNC_STEP1 = 0   # Client sends state vector, requests missing updates
SYNC_STEP2 = 1   # Server sends missing updates based on state vector
SYNC_UPDATE = 2  # Incremental update to document


def decode_message(data: bytes) -> Tuple[int, bytes]:
    """
    Decode Y.js message type and content
    
    Args:
        data: Raw binary message from WebSocket
    
    Returns:
        Tuple of (message_type, content)
    
    Raises:
        ValueError: If message is invalid
    """
    if not data or len(data) < 1:
        raise ValueError("Empty or invalid message")
    
    message_type = data[0]
    content = data[1:] if len(data) > 1 else b''
    
    return message_type, content


def decode_sync_message(content: bytes) -> Tuple[int, bytes]:
    """
    Decode sync message subtype and content
    
    Args:
        content: Content from MESSAGE_SYNC message
    
    Returns:
        Tuple of (sync_type, sync_content)
    
    Raises:
        ValueError: If sync message is invalid
    """
    if not content or len(content) < 1:
        raise ValueError("Empty or invalid sync content")
    
    sync_type = content[0]
    sync_content = content[1:] if len(content) > 1 else b''
    
    return sync_type, sync_content


def encode_message(message_type: int, content: bytes) -> bytes:
    """
    Encode a Y.js protocol message
    
    Args:
        message_type: Protocol message type (MESSAGE_SYNC, MESSAGE_AWARENESS, etc.)
        content: Message content
    
    Returns:
        Encoded binary message
    """
    return bytes([message_type]) + content


def encode_sync_message(sync_type: int, content: bytes) -> bytes:
    """
    Encode a Y.js sync protocol message
    
    Args:
        sync_type: Sync message type (SYNC_STEP1, SYNC_STEP2, SYNC_UPDATE)
        content: Sync content (state vector or update)
    
    Returns:
        Encoded binary sync message with proper headers
    """
    return bytes([MESSAGE_SYNC, sync_type]) + content


def encode_awareness_message(content: bytes) -> bytes:
    """
    Encode an awareness protocol message
    
    Args:
        content: Awareness update data
    
    Returns:
        Encoded binary awareness message
    """
    return bytes([MESSAGE_AWARENESS]) + content


def encode_auth_message(content: bytes) -> bytes:
    """
    Encode an authentication message
    
    Args:
        content: Authentication data
    
    Returns:
        Encoded binary auth message
    """
    return bytes([MESSAGE_AUTH]) + content


def encode_query_awareness_message() -> bytes:
    """
    Encode a query awareness message (requests awareness states from peers)
    
    Returns:
        Encoded binary query awareness message
    """
    return bytes([MESSAGE_QUERY_AWARENESS])


def validate_message_type(message_type: int) -> bool:
    """
    Validate if message type is known
    
    Args:
        message_type: Message type to validate
    
    Returns:
        True if valid, False otherwise
    """
    return message_type in {
        MESSAGE_SYNC,
        MESSAGE_AWARENESS,
        MESSAGE_AUTH,
        MESSAGE_QUERY_AWARENESS
    }


def validate_sync_type(sync_type: int) -> bool:
    """
    Validate if sync type is known
    
    Args:
        sync_type: Sync type to validate
    
    Returns:
        True if valid, False otherwise
    """
    return sync_type in {SYNC_STEP1, SYNC_STEP2, SYNC_UPDATE}


def get_message_type_name(message_type: int) -> str:
    """
    Get human-readable name for message type
    
    Args:
        message_type: Message type code
    
    Returns:
        String name of message type
    """
    names = {
        MESSAGE_SYNC: "SYNC",
        MESSAGE_AWARENESS: "AWARENESS",
        MESSAGE_AUTH: "AUTH",
        MESSAGE_QUERY_AWARENESS: "QUERY_AWARENESS"
    }
    return names.get(message_type, f"UNKNOWN({message_type})")


def get_sync_type_name(sync_type: int) -> str:
    """
    Get human-readable name for sync type
    
    Args:
        sync_type: Sync type code
    
    Returns:
        String name of sync type
    """
    names = {
        SYNC_STEP1: "STEP1",
        SYNC_STEP2: "STEP2",
        SYNC_UPDATE: "UPDATE"
    }
    return names.get(sync_type, f"UNKNOWN({sync_type})")


# Utility functions for debugging and logging

def format_message_info(data: bytes) -> str:
    """
    Format message information for logging
    
    Args:
        data: Raw binary message
    
    Returns:
        Formatted string with message details
    """
    try:
        if len(data) < 1:
            return "Empty message"
        
        message_type = data[0]
        type_name = get_message_type_name(message_type)
        
        info = f"{type_name} ({len(data)} bytes)"
        
        if message_type == MESSAGE_SYNC and len(data) >= 2:
            sync_type = data[1]
            sync_name = get_sync_type_name(sync_type)
            info += f" - {sync_name}"
        
        return info
    
    except Exception as e:
        return f"Invalid message: {e}"


def is_heartbeat(data: bytes) -> bool:
    """
    Check if message is a heartbeat (empty message)
    
    Args:
        data: Raw binary message
    
    Returns:
        True if heartbeat, False otherwise
    """
    return len(data) == 0


# Protocol constants for reference
PROTOCOL_VERSION = 1

# Maximum message sizes (for validation)
MAX_SYNC_MESSAGE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_AWARENESS_MESSAGE_SIZE = 1024 * 1024  # 1MB
MAX_AUTH_MESSAGE_SIZE = 10 * 1024  # 10KB


def validate_message_size(message_type: int, size: int) -> bool:
    """
    Validate message size based on type
    
    Args:
        message_type: Type of message
        size: Size in bytes
    
    Returns:
        True if size is acceptable, False otherwise
    """
    if message_type == MESSAGE_SYNC:
        return size <= MAX_SYNC_MESSAGE_SIZE
    elif message_type == MESSAGE_AWARENESS:
        return size <= MAX_AWARENESS_MESSAGE_SIZE
    elif message_type == MESSAGE_AUTH:
        return size <= MAX_AUTH_MESSAGE_SIZE
    else:
        return size <= MAX_SYNC_MESSAGE_SIZE  # Default to largest


# Error classes for protocol errors

class ProtocolError(Exception):
    """Base exception for protocol errors"""
    pass


class InvalidMessageError(ProtocolError):
    """Raised when message format is invalid"""
    pass


class MessageTooLargeError(ProtocolError):
    """Raised when message exceeds size limits"""
    pass


class UnsupportedMessageTypeError(ProtocolError):
    """Raised when message type is not supported"""
    pass


def decode_message_safe(data: bytes) -> Tuple[int, bytes]:
    """
    Safely decode message with validation and error handling
    
    Args:
        data: Raw binary message
    
    Returns:
        Tuple of (message_type, content)
    
    Raises:
        InvalidMessageError: If message is invalid
        MessageTooLargeError: If message is too large
        UnsupportedMessageTypeError: If message type is unknown
    """
    if not data:
        raise InvalidMessageError("Empty message")
    
    if len(data) < 1:
        raise InvalidMessageError("Message too short")
    
    message_type = data[0]
    
    if not validate_message_type(message_type):
        raise UnsupportedMessageTypeError(
            f"Unknown message type: {message_type}"
        )
    
    if not validate_message_size(message_type, len(data)):
        raise MessageTooLargeError(
            f"Message too large: {len(data)} bytes for type {message_type}"
        )
    
    content = data[1:] if len(data) > 1 else b''
    return message_type, content


def decode_sync_message_safe(content: bytes) -> Tuple[int, bytes]:
    """
    Safely decode sync message with validation
    
    Args:
        content: Sync message content
    
    Returns:
        Tuple of (sync_type, sync_content)
    
    Raises:
        InvalidMessageError: If sync message is invalid
        UnsupportedMessageTypeError: If sync type is unknown
    """
    if not content:
        raise InvalidMessageError("Empty sync content")
    
    if len(content) < 1:
        raise InvalidMessageError("Sync content too short")
    
    sync_type = content[0]
    
    if not validate_sync_type(sync_type):
        raise UnsupportedMessageTypeError(
            f"Unknown sync type: {sync_type}"
        )
    
    sync_content = content[1:] if len(content) > 1 else b''
    return sync_type, sync_content


# Export all public functions and constants
__all__ = [
    # Message types
    'MESSAGE_SYNC',
    'MESSAGE_AWARENESS',
    'MESSAGE_AUTH',
    'MESSAGE_QUERY_AWARENESS',
    
    # Sync types
    'SYNC_STEP1',
    'SYNC_STEP2',
    'SYNC_UPDATE',
    
    # Encoding functions
    'encode_message',
    'encode_sync_message',
    'encode_awareness_message',
    'encode_auth_message',
    'encode_query_awareness_message',
    
    # Decoding functions
    'decode_message',
    'decode_sync_message',
    'decode_message_safe',
    'decode_sync_message_safe',
    
    # Validation functions
    'validate_message_type',
    'validate_sync_type',
    'validate_message_size',
    
    # Utility functions
    'get_message_type_name',
    'get_sync_type_name',
    'format_message_info',
    'is_heartbeat',
    
    # Constants
    'PROTOCOL_VERSION',
    'MAX_SYNC_MESSAGE_SIZE',
    'MAX_AWARENESS_MESSAGE_SIZE',
    'MAX_AUTH_MESSAGE_SIZE',
    
    # Exceptions
    'ProtocolError',
    'InvalidMessageError',
    'MessageTooLargeError',
    'UnsupportedMessageTypeError',
]