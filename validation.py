import os
import re
import secrets
import hashlib
import redis
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime
from fastapi import APIRouter, Query, Request, status
from fastapi.responses import JSONResponse
import magic
from utilss.constants import UPLOAD_FOLDER_NAME
import io
import logging
from dotenv import load_dotenv
load_dotenv()
# Redis for rate limiting
redis_client = redis.Redis(
    host=os.getenv('REDIS_HOST', 'localhost'),
    port=int(os.getenv('REDIS_PORT', 6379)),
    db=int(os.getenv('REDIS_DB', 0)),
    password=os.getenv('REDIS_PASSWORD', None),
    decode_responses=True
)


# File security settings
MAX_FILE_SIZE = int(os.getenv('MAX_FILE_SIZE', 80 * 1024 * 1024))  # 80MB

logger = logging.getLogger("api_routes")


class SecurityValidator:
    """Centralized security validation utilities with virus scanning"""
    
    ALLOWED_EXTENSIONS = {
        '.pdf': ['application/pdf'],
        '.txt': ['text/plain'],
        '.doc': ['application/msword'],
        '.jpg': ['image/jpeg'],
        '.jpeg': ['image/jpeg'],
        '.png': ['image/png'],
        '.gif': ['image/gif'],
        '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
        '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],

    }
    
    MAX_FILE_SIZE = MAX_FILE_SIZE
    MAX_SESSION_ID_LENGTH = 64
    
    DANGEROUS_PATTERNS = [
        '..', '/', '\\', '%', 'etc', 'passwd', 'shadow', 
        'hosts', 'sudoers', '.ssh', '.env', 'config'
    ]
    
    EXECUTABLE_SIGNATURES = [
        b'\x7fELF',          
        b'MZ',            
        b'#!',                
        b'\xca\xfe\xba\xbe',  
        b'\xfe\xed\xfa',     
        b'PK\x03\x04',      
    ]
    BLOCKED_URL_SCHEMES = [
        'file://', 'ftp://', 'gopher://', 'data:', 'javascript:', 
        'vbscript:', 'about:', 'jar:', 'blob:'
    ]
    
    BLOCKED_URL_PATTERNS = [
        r'127\.0\.0\.',  # Localhost
        r'169\.254\.',   # AWS metadata
        r'10\.',         # Private network
        r'192\.168\.',   # Private network
        r'172\.(1[6-9]|2[0-9]|3[0-1])\.',  # Private network
        r'localhost',
        r'0\.0\.0\.0',
        r'\$\(',         # Command substitution
        r'`',            # Backticks
        r'\|',           # Pipes
        r'&&',           # Command chaining
        r';;',           # Command separator
        r'curl\s',       # Curl commands
        r'wget\s',       # Wget commands
        r'bash',         # Shell
        r'sh\s',         # Shell
        r'eval\s*\(',    # Eval
        r'exec\s*\(',    # Exec
    ]
    
    DANGEROUS_CONTENT_PATTERNS = [
        r'<script[^>]*>',           # Script tags
        r'javascript:',             # JavaScript protocol
        r'on\w+\s*=',              # Event handlers (onclick, onerror, etc.)
        r'data:text/html',         # Data URLs with HTML
        r'\$\{.*\}',               # Template injection
        r'<%.*%>',                 # Server-side templates
        r'\{\{.*\}\}',             # Template injection
        r'`[^`]*`',                # Backtick execution
        r'\$\([^)]*\)',            # Command substitution
        r'eval\s*\(',              # JavaScript eval
        r'Function\s*\(',          # Function constructor
        r'setTimeout\s*\(',        # Delayed execution
        r'setInterval\s*\(',       # Repeated execution
    ]
    @staticmethod
    def sanitize_url(url: str) -> Optional[str]:
        """
        Validate and sanitize URLs to prevent SSRF and command injection
        """
        if not url:
            return None
        
        url = url.strip()
        
        # Block dangerous schemes
        url_lower = url.lower()
        for scheme in SecurityValidator.BLOCKED_URL_SCHEMES:
            if url_lower.startswith(scheme):
                logger.warning(f"Blocked dangerous URL scheme: {scheme}")
                return None
        
        # Block command injection patterns
        for pattern in SecurityValidator.BLOCKED_URL_PATTERNS:
            if re.search(pattern, url, re.IGNORECASE):
                logger.warning(f"Blocked dangerous URL pattern: {pattern}")
                return None
        
        # Validate URL structure
        try:
            parsed = urlparse(url)
            
            # Must have valid scheme
            if parsed.scheme not in ['http', 'https']:
                logger.warning(f"Invalid URL scheme: {parsed.scheme}")
                return None
            
            # Must have hostname
            if not parsed.netloc:
                logger.warning("URL missing hostname")
                return None
            
            # Block internal IPs
            hostname = parsed.netloc.split(':')[0]  # Remove port
            if SecurityValidator._is_internal_ip(hostname):
                logger.warning(f"Blocked internal IP: {hostname}")
                return None
            
            return url
            
        except Exception as e:
            logger.error(f"URL validation error: {e}")
            return None
    
    @staticmethod
    def _is_internal_ip(hostname: str) -> bool:
        """Check if hostname is internal/private IP"""
        import ipaddress
        
        try:
            ip = ipaddress.ip_address(hostname)
            return ip.is_private or ip.is_loopback or ip.is_link_local
        except ValueError:
            # Not an IP, check hostname patterns
            hostname_lower = hostname.lower()
            return hostname_lower in ['localhost', 'localhost.localdomain']
    
    @staticmethod
    def sanitize_content(content: str, max_length: int = 1_000_000) -> Optional[str]:
        """
        Sanitize user content to prevent XSS and command injection
        """
        if not content:
            return content
        
        if len(content) > max_length:
            logger.warning(f"Content exceeds max length: {len(content)}")
            return None
        
        # Check for dangerous patterns
        content_lower = content.lower()
        for pattern in SecurityValidator.DANGEROUS_CONTENT_PATTERNS:
            if re.search(pattern, content, re.IGNORECASE):
                logger.warning(f"Blocked dangerous content pattern: {pattern}")
                return None
        
        # Remove null bytes
        content = content.replace('\x00', '')
        
        return content
    
    @staticmethod
    def validate_node_data(node_data: dict) -> Tuple[bool, str]:
        """
        Comprehensive validation for canvas node data
        Returns: (is_valid, error_message)
        """
        # Validate content
        if 'content' in node_data and node_data['content']:
            sanitized = SecurityValidator.sanitize_content(node_data['content'])
            if sanitized is None:
                return (False, "Content contains dangerous patterns")
            node_data['content'] = sanitized
        
        # Validate title
        if 'title' in node_data and node_data['title']:
            sanitized = SecurityValidator.sanitize_content(node_data['title'], max_length=500)
            if sanitized is None:
                return (False, "Title contains dangerous patterns")
            node_data['title'] = sanitized
        
        # Validate media_url
        if 'media_url' in node_data and node_data['media_url']:
            sanitized = SecurityValidator.sanitize_url(node_data['media_url'])
            if sanitized is None:
                return (False, "Invalid or dangerous media URL")
            node_data['media_url'] = sanitized
        
        # Validate pdfUrl
        if 'pdfUrl' in node_data and node_data['pdfUrl']:
            sanitized = SecurityValidator.sanitize_url(node_data['pdfUrl'])
            if sanitized is None:
                return (False, "Invalid or dangerous PDF URL")
            node_data['pdfUrl'] = sanitized
        
        # Validate color (prevent CSS injection)
        if 'color' in node_data and node_data['color']:
            color = node_data['color']
            # Allow hex colors (#RRGGBB or #RGB)
            is_hex = re.match(r'^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$', color)
            # Allow Tailwind color names (alphanumeric, hyphens, no spaces)
            is_tailwind = re.match(r'^[a-z0-9-]+$', color.lower())
            
            if not (is_hex or is_tailwind):
                return (False, "Invalid color format (use hex or color name)")
        
        return (True, "")
    
    @staticmethod
    def validate_session_id(session_id: str) -> Optional[str]:
        """Strictly validate session_id"""
        if not session_id:
            logger.warning("Empty session_id provided")
            return None
        
        if len(session_id) > SecurityValidator.MAX_SESSION_ID_LENGTH:
            logger.warning(f"Session ID too long: {len(session_id)} chars")
            return None
        
        if not re.match(r'^[a-zA-Z0-9_-]+$', session_id):
            logger.warning(f"Session ID contains invalid characters: {session_id}")
            return None
        
        session_lower = session_id.lower()
        for pattern in SecurityValidator.DANGEROUS_PATTERNS:
            if pattern in session_lower:
                logger.warning(f"Dangerous pattern '{pattern}' detected in session_id")
                return None
        
        return session_id
    
    @staticmethod
    def validate_filename(filename: str) -> Optional[str]:
        """Validate and sanitize filename"""
        if not filename:
            return None
        
        safe_name = Path(filename).name
        safe_name = safe_name.replace('/', '_').replace('\\', '_')
        
        if safe_name.startswith('.'):
            logger.warning(f"Hidden file detected: {safe_name}")
            return None
        
        name_lower = safe_name.lower()
        for pattern in SecurityValidator.DANGEROUS_PATTERNS:
            if pattern in name_lower:
                logger.warning(f"Dangerous pattern in filename: {safe_name}")
                return None
        
        if len(safe_name) > 255:
            stem = Path(safe_name).stem[:200]
            suffix = Path(safe_name).suffix
            safe_name = f"{stem}{suffix}"
        
        return safe_name
    
    @staticmethod
    def validate_file_extension(filename: str) -> Optional[str]:
        """Validate file extension"""
        extension = Path(filename).suffix.lower()
        
        if not extension:
            logger.warning(f"No extension found in filename: {filename}")
            return None
        
        if extension not in SecurityValidator.ALLOWED_EXTENSIONS:
            logger.warning(f"Disallowed extension: {extension}")
            return None
        
        return extension
    
    @staticmethod
    def validate_mime_type(file_data: bytes, declared_mime: str, extension: str) -> bool:
        """Validate MIME type"""
        try:
            actual_mime = magic.from_buffer(file_data, mime=True)
            allowed_mimes = SecurityValidator.ALLOWED_EXTENSIONS.get(extension, [])
            
            if extension in ['.txt', '.csv']:
                if actual_mime in ['text/plain', 'application/octet-stream', 'text/csv']:
                    return True
            
            if actual_mime not in allowed_mimes:
                logger.warning(
                    f"MIME mismatch - Extension: {extension}, "
                    f"Declared: {declared_mime}, Actual: {actual_mime}"
                )
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"MIME validation failed: {e}")
            return False
    
    @staticmethod
    def detect_executable_content(file_data: bytes) -> bool:
        """Check if file contains executable code"""
        for signature in SecurityValidator.EXECUTABLE_SIGNATURES:
            if file_data.startswith(signature):
                logger.warning(f"Executable signature detected: {signature.hex()}")
                return True
        
        try:
            sample = file_data[:1024].decode('utf-8', errors='ignore')
            dangerous_keywords = [
                'eval(', 'exec(', 'system(', 'subprocess',
                '__import__', 'compile(', '<script', 'javascript:',
                'data:text/html', 'onerror=', 'onload='
            ]
            
            sample_lower = sample.lower()
            for keyword in dangerous_keywords:
                if keyword in sample_lower:
                    logger.warning(f"Dangerous keyword detected: {keyword}")
                    return True
        except Exception:
            pass
        
        return False
    
    
    @staticmethod
    def validate_path_safety(path: Path, allowed_root: Path) -> bool:
        """Ensure path is within allowed root"""
        try:
            resolved_path = path.resolve()
            resolved_root = allowed_root.resolve()
            
            if not str(resolved_path).startswith(str(resolved_root)):
                logger.warning(
                    f"Path traversal detected - Path: {resolved_path}, "
                    f"Root: {resolved_root}"
                )
                return False
            
            return True
            
        except Exception as e:
            logger.error(f"Path validation error: {e}")
            return False
    
    @staticmethod
    def generate_secure_filename(original_filename: str) -> str:
        """Generate secure unique filename"""
        extension = Path(original_filename).suffix.lower()
        random_part = secrets.token_urlsafe(16)
        timestamp = datetime.utcnow().strftime('%Y%m%d%H%M%S')
        return f"{timestamp}_{random_part}{extension}"
    
    @staticmethod
    def calculate_file_hash(file_data: bytes) -> str:
        """Calculate SHA256 hash"""
        return hashlib.sha256(file_data).hexdigest()

    @staticmethod
    def validate_s3_key(s3_key: str, session_id: str) -> bool:
        """Validate S3 key"""
        if not s3_key or not session_id:
            return False
        
        expected_prefix = f"{session_id}/{UPLOAD_FOLDER_NAME}/"
        if not s3_key.startswith(expected_prefix):
            logger.warning(f"S3 key doesn't match session: {s3_key}")
            return False
        
        filename = s3_key[len(expected_prefix):]
        
        if '/' in filename or '\\' in filename or '..' in filename:
            logger.warning(f"Path traversal in S3 key filename: {filename}")
            return False
        
        return True
    
