from pathlib import Path
from typing import Any, Optional, Union
import pymupdf
import logging

from llm.message_history import MessageHistory
from lab.base import (
    AgentPlugin,
    AgentImplOutput
)
from utilss.workspace_manager import WorkspaceManager


class PDFTextReader(AgentPlugin):
    """Enhanced PDF text extraction tool with page-based access and better error handling."""
    
    name = "pdf_content_extract"
    description = (
        "Extracts text content from PDF files located in the workspace. "
        "Supports extracting all pages or specific page ranges."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "The relative path to the PDF file within the workspace (e.g., 'uploads/my_resume.pdf')."
            },
            "start_page": {
                "type": "integer",
                "description": "Starting page number (1-based indexing). If not specified, starts from page 1.",
                "minimum": 1
            },
            "end_page": {
                "type": "integer", 
                "description": "Ending page number (1-based indexing). If not specified, extracts to the last page.",
                "minimum": 1
            },
            "include_metadata": {
                "type": "boolean",
                "description": "Whether to include PDF metadata in the output. Defaults to False.",
                "default": False
            }
        },
        "required": ["file_path"]
    }

    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        max_output_length: int = 15000,
        logger: Optional[logging.Logger] = None
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.max_output_length = max_output_length
        self.logger = logger or logging.getLogger(__name__)

    def _validate_file_path(self, relative_path: str) -> tuple[bool, str, Optional[Path]]:
        """Validate the file path and return validation result."""
        try:
            # Ensure the path points inside 'uploaded_files' if not already
            if "uploaded_files" not in Path(relative_path).parts:
                relative_path = str(Path("uploaded_files") / Path(relative_path).name)
    
            full_path = self.workspace_manager.workspace_path(Path(relative_path))
    
            if not full_path.exists():
                return False, f"File not found at {relative_path}", None
    
            if not full_path.is_file():
                return False, f"Path {relative_path} is not a file", None
    
            if full_path.suffix.lower() != ".pdf":
                return False, f"File {relative_path} is not a PDF", None
    
            return True, "", full_path
    
        except Exception as e:
            return False, f"Invalid file path: {str(e)}", None


    def _validate_page_range(self, start_page: Optional[int], end_page: Optional[int], 
                           total_pages: int) -> tuple[bool, str, int, int]:
        """Validate and normalize page range."""
        # Set defaults
        start = start_page if start_page is not None else 1
        end = end_page if end_page is not None else total_pages
        
        # Validate range
        if start < 1:
            return False, "Start page must be >= 1", start, end
            
        if end < 1:
            return False, "End page must be >= 1", start, end
            
        if start > total_pages:
            return False, f"Start page {start} exceeds total pages {total_pages}", start, end
            
        if end > total_pages:
            self.logger.warning(f"End page {end} exceeds total pages {total_pages}, adjusting to {total_pages}")
            end = total_pages
            
        if start > end:
            return False, f"Start page {start} cannot be greater than end page {end}", start, end
            
        return True, "", start, end

    def _extract_metadata(self, doc: pymupdf.Document) -> dict[str, Any]:
        """Extract metadata from PDF document."""
        try:
            metadata = doc.metadata
            return {
                "title": metadata.get("title", ""),
                "author": metadata.get("author", ""),
                "subject": metadata.get("subject", ""),
                "creator": metadata.get("creator", ""),
                "producer": metadata.get("producer", ""),
                "creation_date": metadata.get("creationDate", ""),
                "modification_date": metadata.get("modDate", ""),
                "total_pages": doc.page_count
            }
        except Exception as e:
            self.logger.warning(f"Failed to extract metadata: {str(e)}")
            return {"total_pages": doc.page_count}

    def _extract_text_from_pages(self, doc: pymupdf.Document, start_page: int, 
                                end_page: int) -> tuple[str, dict[str, Any]]:
        """Extract text from specified page range."""
        extracted_text = ""
        page_info = {}
        
        for page_num in range(start_page - 1, end_page):  # Convert to 0-based indexing
            try:
                page = doc.load_page(page_num)
                page_text = page.get_text("text")
                
                if page_text.strip():  # Only add non-empty pages
                    extracted_text += f"\n--- Page {page_num + 1} ---\n"
                    extracted_text += page_text
                    page_info[f"page_{page_num + 1}"] = len(page_text)
                else:
                    page_info[f"page_{page_num + 1}"] = 0
                    
            except Exception as e:
                self.logger.error(f"Failed to extract text from page {page_num + 1}: {str(e)}")
                page_info[f"page_{page_num + 1}_error"] = str(e)
                
        return extracted_text.strip(), page_info

    async def run_impl(self,
                      tool_input: dict[str, Any],
                      message_history: Optional[MessageHistory]) -> AgentImplOutput:
        """Main implementation method."""
        
        # Extract input parameters
        relative_file_path = tool_input["file_path"]
        start_page = tool_input.get("start_page")
        end_page = tool_input.get("end_page")
        include_metadata = tool_input.get("include_metadata", False)
        
        # Validate file path
        is_valid, error_msg, full_file_path = self._validate_file_path(relative_file_path)
        if not is_valid:
            return AgentImplOutput(
                f"Error: {error_msg}",
                f"File validation failed: {error_msg}",
                {"success": False, "error": error_msg},
            )

        try:
            # Open PDF document
            doc = pymupdf.open(full_file_path)
            total_pages = doc.page_count
            
            # Validate page range
            is_valid_range, range_error, start, end = self._validate_page_range(
                start_page, end_page, total_pages
            )
            if not is_valid_range:
                doc.close()
                return AgentImplOutput(
                    f"Error: {range_error}",
                    f"Page range validation failed: {range_error}",
                    {"success": False, "error": range_error},
                )
            
            # Extract text from specified pages
            extracted_text, page_info = self._extract_text_from_pages(doc, start, end)
            
            # Extract metadata if requested
            metadata = self._extract_metadata(doc) if include_metadata else {}
            
            doc.close()
            
            # Handle empty extraction
            if not extracted_text:
                return AgentImplOutput(
                    f"Warning: No text content found in pages {start} to {end} of {relative_file_path}",
                    f"No text extracted from specified pages",
                    {
                        "success": True,
                        "extracted_chars": 0,
                        "pages_processed": end - start + 1,
                        "page_info": page_info,
                        "metadata": metadata
                    },
                )
            
            # Truncate if necessary
            original_length = len(extracted_text)
            if len(extracted_text) > self.max_output_length:
                extracted_text = (
                    extracted_text[:self.max_output_length]
                    + f"\n\n... (content truncated due to length limit of {self.max_output_length} characters)"
                )
            
            # Prepare success response
            response_data = {
                "success": True,
                "extracted_chars": original_length,
                "displayed_chars": len(extracted_text),
                "pages_processed": end - start + 1,
                "page_range": f"{start}-{end}",
                "total_pages": total_pages,
                "page_info": page_info,
                "truncated": original_length > self.max_output_length
            }
            
            if include_metadata:
                response_data["metadata"] = metadata
            
            success_message = (
                f"Successfully extracted text from {relative_file_path} "
                f"(pages {start}-{end}, {original_length} characters)"
            )
            
            return AgentImplOutput(
                extracted_text,
                success_message,
                response_data,
            )
            
        except pymupdf.FileDataError as e:
            error_msg = f"PDF file is corrupted or invalid: {str(e)}"
            return AgentImplOutput(
                f"Error: {error_msg}",
                f"Failed to process PDF: {error_msg}",
                {"success": False, "error": error_msg, "error_type": "corrupted_file"},
            )
            
        except PermissionError as e:
            error_msg = f"Permission denied accessing file: {str(e)}"
            return AgentImplOutput(
                f"Error: {error_msg}",
                f"Access denied: {error_msg}",
                {"success": False, "error": error_msg, "error_type": "permission_denied"},
            )
            
        except Exception as e:
            error_msg = f"Unexpected error extracting text from PDF {relative_file_path}: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            return AgentImplOutput(
                f"Error: {error_msg}",
                f"Failed to extract text from {relative_file_path}",
                {"success": False, "error": str(e), "error_type": "unexpected_error"},
            )