
from pathlib import Path
from typing import Any, Optional, List, Dict, Set
import logging
import hashlib
from datetime import datetime
import asyncio
import uuid

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, 
    Filter, FieldCondition, MatchValue, PayloadSchemaType
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pymupdf

from lab.base import AgentPlugin, AgentImplOutput
from llm.message_history import MessageHistory
from utilss.workspace_manager import WorkspaceManager
from Mongodb.db import DatabaseManager


class EmbeddingProvider:
    """Handles all embedding operations"""
    
    def __init__(self, provider: str = "openai", api_key: str = None):
        self.provider = provider
        self.api_key = api_key
        self._client = None
        self._dimension = 4096
           
        self.total_prompt_tokens = 0 
        self.total_embedding_tokens = 0  
        self.total_cost = 0.0  
        self.total_texts_embedded = 0
        self.embedding_calls = 0
        
    async def initialize(self):
        """Initialize the embedding client"""
        if self.provider == "openai":
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key
            )
            self._dimension = 4096  
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    @property
    def dimension(self) -> int:
        return self._dimension
    
    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Batch embed multiple texts"""
        if self.provider == "openai":
            response = await self._client.embeddings.create(
                model="qwen/qwen3-embedding-8b",
                input=texts
            )
            if hasattr(response, 'usage') and response.usage:
                prompt_tokens = response.usage.prompt_tokens
                total_tokens = response.usage.total_tokens
                
                # Extract cost from model_extra if available
                cost = 0.0
                if hasattr(response.usage, 'model_extra') and response.usage.model_extra:
                    cost = response.usage.model_extra.get('cost', 0.0)
                
                # Update cumulative counters
                self.total_prompt_tokens += prompt_tokens
                self.total_embedding_tokens += total_tokens
                self.total_cost += cost
                
                print(
                    f"🔢 Embedded {len(texts)} texts: "
                    f"{prompt_tokens} tokens, ${cost:.8f}"
                )
            else:
                print("⚠️ No usage info in API response")
            
            # Update call tracking
            self.total_texts_embedded += len(texts)
            self.embedding_calls += 1

            return [item.embedding for item in response.data]
    
    async def embed_query(self, query: str) -> List[float]:
        """Embed a single query"""
        if self.provider == "openai":
            response = await self._client.embeddings.create(
                model="qwen/qwen3-embedding-8b",
                input=[query]
            )
            if hasattr(response, 'usage') and response.usage:
                prompt_tokens = response.usage.prompt_tokens
                total_tokens = response.usage.total_tokens
                
                # Extract cost from model_extra if available
                cost = 0.0
                if hasattr(response.usage, 'model_extra') and response.usage.model_extra:
                    cost = response.usage.model_extra.get('cost', 0.0)
                
                # Update cumulative counters
                self.total_prompt_tokens += prompt_tokens
                self.total_embedding_tokens += total_tokens
                self.total_cost += cost
                
                print(
                    f"🔍 Embedded query: {prompt_tokens} tokens, ${cost:.8f}"
                )
            else:
                print("⚠️ No usage info in API response")
            
            self.total_texts_embedded += 1
            self.embedding_calls += 1

            return response.data[0].embedding

    def get_token_stats(self) -> dict:
        """Get embedding token statistics"""
        return {
            "total_prompt_tokens": self.total_prompt_tokens,
            "total_embedding_tokens": self.total_embedding_tokens,
            "total_cost": self.total_cost,
            "total_texts_embedded": self.total_texts_embedded,
            "embedding_calls": self.embedding_calls,
            "avg_tokens_per_text": (
                self.total_embedding_tokens / max(self.total_texts_embedded, 1)
            ),
        }
    
    def reset_stats(self):
            """Reset token tracking"""
            self.total_prompt_tokens = 0
            self.total_embedding_tokens = 0
            self.total_cost = 0.0
            self.total_texts_embedded = 0
            self.embedding_calls = 0

class DocumentIndexManager:
    """
    Manages indexed documents with USER and SESSION isolation
    Each user has their own namespace, each session is tracked separately
    """
    
    def __init__(
        self,
        db_manager: DatabaseManager,
        qdrant_client: AsyncQdrantClient,
        embeddings: EmbeddingProvider,
        collection_name: str = "documents",
        user_id: str = None,  # REQUIRED
        session_id: Optional[str] = None  # Optional session scope
    ):
        if not user_id:
            raise ValueError("user_id is required for DocumentIndexManager")
            
        self.db_manager = db_manager
        self.qdrant = qdrant_client
        self.embeddings = embeddings
        self.collection_name = collection_name
        self.user_id = user_id  # USER ISOLATION
        self.session_id = session_id  # SESSION ISOLATION
        
        # Per-user cache of indexed file hashes
        self._indexed_cache: Set[str] = set()
        self._lock = asyncio.Lock()
        
    async def initialize(self):
        """Load cached indexed documents for THIS USER ONLY"""
        db = self.db_manager.db
        metadata_col = db["rag_metadata"]
        
        # Query filter: only this user's documents
        query_filter = {
            "user_id": self.user_id,
            "status": "completed"
        }
        
        # If session_id provided, filter by session too
        if self.session_id:
            query_filter["session_id"] = self.session_id
        
        cursor = metadata_col.find(query_filter, {"file_hash": 1})
        
        async for doc in cursor:
            self._indexed_cache.add(doc["file_hash"])
        
        scope = f"user {self.user_id}" + (f" session {self.session_id}" if self.session_id else "")
        logging.info(f"✓ Loaded {len(self._indexed_cache)} indexed documents for {scope}")
    
    def is_indexed(self, file_hash: str) -> bool:
        """Check if document is already indexed FOR THIS USER"""
        return file_hash in self._indexed_cache
    
    async def mark_as_indexed(self, file_hash: str):
        """Mark document as indexed FOR THIS USER"""
        async with self._lock:
            self._indexed_cache.add(file_hash)
    
    async def get_indexed_count(self) -> int:
        """Get total number of indexed documents FOR THIS USER"""
        return len(self._indexed_cache)
    
    def get_user_filter(self) -> List[FieldCondition]:
        """Build Qdrant filter for this user/session"""
        conditions = [
            FieldCondition(
                key="user_id",
                match=MatchValue(value=self.user_id)
            )
        ]
        
        # Add session filter if specified
        if self.session_id:
            conditions.append(
                FieldCondition(
                    key="session_id",
                    match=MatchValue(value=self.session_id)
                )
            )
        
        return conditions


class IndexDocumentsTool(AgentPlugin):
    """
    Tool for indexing PDF documents WITH USER ISOLATION
    """
    
    name = "index_documents"
    description = (
        "💾 PRESERVE: Index PDFs into a personal semantic memory for future retrieval. "
        "Use only after you understand the document and want to preserve it for deep search. "
        "Documents are indexed once per user and session; already indexed files are skipped. "
        "Creates embeddings and stores content in a searchable database. "
        "Use this immediately after 'scouting' the intro/TOC of a large file"
        "After indexing, use 'search_documents' for precise queries."
    )
    
    input_schema = {
        "type": "object",
        "properties": {
            "file_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of PDF file paths to index"
            },
            "force_reindex": {
                "type": "boolean",
                "description": "Force re-indexing. Default: false",
                "default": False
            }
        },
        "required": ["file_paths"]
    }
    
    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        index_manager: DocumentIndexManager,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        logger: Optional[logging.Logger] = None
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.index_manager = index_manager
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.logger = logger or logging.getLogger(__name__)
        
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate SHA256 hash"""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    def _validate_file_path(self, relative_path: str) -> tuple[bool, str, Optional[Path]]:
        """Validate PDF file path"""
        try:
            path_obj = Path(relative_path)
            
            if "uploaded_files" not in path_obj.parts:
                relative_path = str(Path("uploaded_files") / path_obj.name)
            
            full_path = self.workspace_manager.workspace_path(Path(relative_path))
            
            if not full_path.exists():
                return False, f"File not found: {relative_path}", None
            
            if not full_path.is_file():
                return False, f"Not a file: {relative_path}", None
            
            if full_path.suffix.lower() != ".pdf":
                return False, f"Not a PDF: {relative_path}", None
            
            return True, "", full_path
            
        except Exception as e:
            return False, f"Invalid path: {str(e)}", None
    
    async def _extract_pdf_text(self, pdf_path: Path) -> tuple[str, Dict]:
        """Extract text from PDF"""
        loop = asyncio.get_event_loop()
        
        def _extract():
            doc = pymupdf.open(pdf_path)
            metadata = {
                "total_pages": doc.page_count,
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", "")
            }
            
            text = ""
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)
                page_text = page.get_text("text")
                if page_text.strip():
                    text += f"\n--- Page {page_num + 1} ---\n{page_text}"
            
            doc.close()
            return text.strip(), metadata
        
        return await loop.run_in_executor(None, _extract)
    
    async def _index_single_document(
        self,
        file_hash: str,
        file_path: str,
        full_path: Path
    ) -> Dict[str, Any]:
        """Index a single document FOR THIS USER"""
        try:
            # Extract text
            self.logger.info(f"📖 Extracting: {file_path}")
            text, metadata = await self._extract_pdf_text(full_path)
            
            if not text.strip():
                raise ValueError("No text content in PDF")
            
            # Split into chunks
            chunks = self.text_splitter.split_text(text)
            self.logger.info(f"📝 Split into {len(chunks)} chunks")
            
            # Batch embed
            self.logger.info(f"🔄 Generating embeddings...")
            embeddings = await self.index_manager.embeddings.embed_texts(chunks)
            
            # Create Qdrant points with USER and SESSION isolation
            points = []
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                payload = {
                    "text": chunk,
                    "file_hash": file_hash,
                    "file_path": file_path,
                    "user_id": self.index_manager.user_id,  # USER ISOLATION
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "indexed_at": datetime.utcnow().isoformat()
                }
                
                # Add session_id if available
                if self.index_manager.session_id:
                    payload["session_id"] = self.index_manager.session_id
                
                point = PointStruct(
                    id=str(uuid.uuid4()),
                    vector=embedding,
                    payload=payload
                )
                points.append(point)
            
            # Upload to Qdrant in batches
            batch_size = 100
            for i in range(0, len(points), batch_size):
                batch = points[i:i + batch_size]
                await self.index_manager.qdrant.upsert(
                    collection_name=self.index_manager.collection_name,
                    points=batch
                )
            
            # Save metadata to MongoDB with USER and SESSION
            db = self.index_manager.db_manager.db
            metadata_col = db["rag_metadata"]
            
            doc_metadata = {
                "file_hash": file_hash,
                "file_path": file_path,
                "user_id": self.index_manager.user_id,  # USER ISOLATION
                "chunk_count": len(chunks),
                "total_pages": metadata.get("total_pages", 0),
                "status": "completed",
                "indexed_at": datetime.utcnow(),
                "pdf_metadata": metadata
            }
            
            # Add session_id if available
            if self.index_manager.session_id:
                doc_metadata["session_id"] = self.index_manager.session_id
            
            await metadata_col.update_one(
                {
                    "file_hash": file_hash,
                    "user_id": self.index_manager.user_id
                },
                {"$set": doc_metadata},
                upsert=True
            )
            
            # Mark as indexed in cache
            await self.index_manager.mark_as_indexed(file_hash)
            
            self.logger.info(f"✅ Indexed: {file_path} ({len(chunks)} chunks)")
            
            return {
                "success": True,
                "file_path": file_path,
                "chunks": len(chunks),
                "pages": metadata.get("total_pages", 0)
            }
            
        except Exception as e:
            self.logger.error(f"❌ Failed to index {file_path}: {e}")
            return {
                "success": False,
                "file_path": file_path,
                "error": str(e)
            }
    
    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        """Index documents for THIS USER"""
        
        file_paths = tool_input["file_paths"]
        force_reindex = tool_input.get("force_reindex", False)
        
        self.logger.info(f"🚀 User {self.index_manager.user_id}: Indexing {len(file_paths)} documents...")
        stats_before = self.index_manager.embeddings.get_token_stats()
        # Validate all files first
        validated_files = []
        errors = []
        
        for file_path_str in file_paths:
            is_valid, error_msg, full_path = self._validate_file_path(file_path_str)
            
            if not is_valid:
                errors.append(f"❌ {file_path_str}: {error_msg}")
                continue
            
            file_hash = self._calculate_file_hash(full_path)
            
            # Check if already indexed FOR THIS USER
            if self.index_manager.is_indexed(file_hash) and not force_reindex:
                self.logger.info(f"⏭️  Skipping (already indexed): {file_path_str}")
                continue
            
            validated_files.append((file_hash, file_path_str, full_path))
        
        if not validated_files and not errors:
            return AgentImplOutput(
                "All documents are already indexed. No new documents to process.",
                "All documents already indexed",
                {
                    "success": True,
                    "total_documents": len(file_paths),
                    "already_indexed": len(file_paths),
                    "newly_indexed": 0,
                    "embedding_tokens_used": 0, 
                    "embedding_cost": 0.0,     
                }
            )
        
        # Index new documents in parallel
        tasks = [
            self._index_single_document(file_hash, file_path_str, full_path)
            for file_hash, file_path_str, full_path in validated_files
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        stats_after = self.index_manager.embeddings.get_token_stats()
        
        tokens_used = stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"]
        cost_used = stats_after["total_cost"] - stats_before["total_cost"]
        
        if tokens_used > 0:
            summary += f"\n\n📊 Embedding tokens used: {tokens_used:,} (${cost_used:.6f})"

        # Process results
        successful = []
        failed = []
        
        for result in results:
            if isinstance(result, Exception):
                failed.append(str(result))
            elif result.get("success"):
                successful.append(result)
            else:
                failed.append(result.get("error", "Unknown error"))
        
        # Format response
        summary_parts = []
        
        if successful:
            total_chunks = sum(r["chunks"] for r in successful)
            summary_parts.append(
                f"✅ Successfully indexed {len(successful)} document(s) with {total_chunks} chunks total"
            )
        
        skipped_count = len(file_paths) - len(validated_files) - len(errors)
        if skipped_count > 0:
            summary_parts.append(f"⏭️  Skipped {skipped_count} already indexed document(s)")
        
        if errors:
            summary_parts.append(f"❌ {len(errors)} validation error(s)")
        
        if failed:
            summary_parts.append(f"❌ {len(failed)} indexing failure(s)")
        
        summary = "\n".join(summary_parts)

        if tokens_used > 0:
            summary += f"\n\n📊 Embedding tokens used: {tokens_used:,} (${cost_used:.6f})"

        details = []
        for r in successful:
            details.append(f"  • {r['file_path']}: {r['chunks']} chunks ({r['pages']} pages)")
        
        if details:
            summary += "\n\nIndexed documents:\n" + "\n".join(details)
        
        if errors:
            summary += "\n\nErrors:\n" + "\n".join(f"  • {e}" for e in errors)
        
        return AgentImplOutput(
            summary,
            f"Indexed {len(successful)}/{len(file_paths)} documents",
            {
                "success": True,
                "total_requested": len(file_paths),
                "successfully_indexed": len(successful),
                "already_indexed": skipped_count,
                "failed": len(failed) + len(errors),
                "indexed_files": [r["file_path"] for r in successful],
                "embedding_tokens_used": tokens_used,
                "embedding_cost": cost_used,
            }
        )

class SearchDocumentsTool(AgentPlugin):
    """
    Tool for searching indexed documents WITH USER ISOLATION
    """
    
    name = "search_documents"
    description = (
        "🔍 RECALL: Semantic search across indexed documents to retrieve specific information. "
        "Use for targeted questions like: 'find X', 'what does the paper say about Y?', "
        "'compare Z across papers', or 'locate methodology details'. "
        "Searches all indexed PDFs unless a specific file_path is provided. "
        "Returns relevant text chunks with similarity scores. "
        "This tool is for recall, not first-time reading. "
        "Only searches documents you have indexed; other users cannot access your data."
    )    

    input_schema = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Your search query"
            },
            "file_path": {
                "type": "string",
                "description": "Optional: Search only in this specific file"
            },
            "top_k": {
                "type": "integer",
                "description": "Number of results (1-20). Default: 5",
                "default": 5,
                "minimum": 1,
                "maximum": 20
            },
            "min_score": {
                "type": "number",
                "description": "Minimum similarity score (0-1). Default: 0.5",
                "default": 0.5,
                "minimum": 0,
                "maximum": 1
            }
        },
        "required": ["query"]
    }
    
    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        index_manager: DocumentIndexManager,
        logger: Optional[logging.Logger] = None
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.index_manager = index_manager
        self.logger = logger or logging.getLogger(__name__)
    
    def _calculate_file_hash(self, file_path: Path) -> str:
        """Calculate file hash"""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                sha256.update(chunk)
        return sha256.hexdigest()
    
    async def run_impl(
        self,
        tool_input: Dict[str, Any],
        message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        """Search indexed documents FOR THIS USER ONLY"""
        
        query = tool_input["query"]
        file_path_str = tool_input.get("file_path")
        top_k = tool_input.get("top_k", 5)
        min_score = tool_input.get("min_score", 0.34)
        
        self.logger.info(f"🔍 User {self.index_manager.user_id}: Searching '{query}'")
        stats_before = self.index_manager.embeddings.get_token_stats()

        # Check if any documents are indexed FOR THIS USER
        indexed_count = await self.index_manager.get_indexed_count()
        if indexed_count == 0:
            return AgentImplOutput(
                "You haven't indexed any documents yet. Use 'index_documents' tool first.",
                "No indexed documents",
                {"success": False, "error": "no_indexed_documents",                "embedding_tokens_used": 0,  # ✅ ADD THIS
                "embedding_cost": 0.0}
            )
        
        # Build filter - ALWAYS includes user_id
        must_conditions = self.index_manager.get_user_filter()
        
        # If specific file requested
        if file_path_str:
            try:
                path_obj = Path(file_path_str)
                if "uploaded_files" not in path_obj.parts:
                    file_path_str = str(Path("uploaded_files") / path_obj.name)
                
                full_path = self.workspace_manager.workspace_path(Path(file_path_str))
                
                if not full_path.exists():
                    return AgentImplOutput(
                        f"File not found: {file_path_str}",
                        "File not found",
                        {"success": False, "error": "file_not_found",                        "embedding_tokens_used": 0,
                        "embedding_cost": 0.0}
                    )
                
                file_hash = self._calculate_file_hash(full_path)
                
                # Check if this file is indexed FOR THIS USER
                if not self.index_manager.is_indexed(file_hash):
                    return AgentImplOutput(
                        f"Document '{file_path_str}' is not indexed. Use 'index_documents' first.",
                        "Document not indexed",
                        {"success": False, "error": "document_not_indexed" ,"embedding_tokens_used": 0,"embedding_cost": 0.0,}
                    )
                
                must_conditions.append(
                    FieldCondition(
                        key="file_hash",
                        match=MatchValue(value=file_hash)
                    )
                )
                
            except Exception as e:
                return AgentImplOutput(
                    f"Error processing file path: {str(e)}",
                    "Invalid file path",
                    {"success": False, "error": str(e), 
                    "embedding_tokens_used": 0,
                    "embedding_cost": 0.0,}
                )
        
        try:
            # Generate query embedding
            self.logger.info("🔄 Generating query embedding...")
            query_embedding = await self.index_manager.embeddings.embed_query(query)
            
            stats_after = self.index_manager.embeddings.get_token_stats()
            tokens_used = stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"]
            cost_used = stats_after["total_cost"] - stats_before["total_cost"]

            # Search Qdrant - FILTERED BY USER
            self.logger.info(f"🔍 Searching YOUR {indexed_count} indexed document(s)...")
            response = await self.index_manager.qdrant.query_points(
                collection_name=self.index_manager.collection_name,
                query=query_embedding,
                query_filter=Filter(must=must_conditions),  # USER FILTER
                limit=top_k,
                score_threshold=min_score,
                with_payload=True
            )
            
            results = response.points if response else []
            
            if not results:
                scope = f"in '{file_path_str}'" if file_path_str else f"across your {indexed_count} document(s)"
                return AgentImplOutput(
                    f"No relevant information found {scope} for: '{query}'",
                    "No results found",
                    {
                        "success": True,
                        "results_count": 0,
                        "query": query,
                        "scope": "single_file" if file_path_str else "all_files",
                        "embedding_tokens_used": tokens_used,
                        "embedding_cost": cost_used,
                    }
                )
            
            # Format results
            context_parts = []
            source_files = set()
            
            for i, result in enumerate(results, 1):
                source_files.add(result.payload["file_path"])
                context_parts.append(
                    f"[Chunk {i}] Score: {result.score:.3f} | Source: {result.payload['file_path']}\n"
                    f"{result.payload['text']}\n"
                )
            
            context = "\n".join(context_parts)
            
            scope = f"in '{file_path_str}'" if file_path_str else f"across {len(source_files)} document(s)"
            summary = (
                f"Found {len(results)} relevant chunk(s) {scope}\n"
                f"Sources: {', '.join(source_files)}"
            )
            
            return AgentImplOutput(
                context,
                summary,
                {
                    "success": True,
                    "results_count": len(results),
                    "query": query,
                    "sources": list(source_files),
                    "scope": "single_file" if file_path_str else "all_files",
                    "embedding_tokens_used": tokens_used,
                    "embedding_cost": cost_used,
                }
            )
            
        except Exception as e:
            self.logger.error(f"❌ Search error: {e}", exc_info=True)
            
            # Get partial stats if available
            try:
                stats_after = self.index_manager.embeddings.get_token_stats()
                tokens_used = stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"]
                cost_used = stats_after["total_cost"] - stats_before["total_cost"]
            except:
                tokens_used = 0
                cost_used = 0.0
            
            return AgentImplOutput(
                f"Search failed: {str(e)}",
                "Search error",
                {
                    "success": False, 
                    "error": str(e),
                    "embedding_tokens_used": tokens_used,
                    "embedding_cost": cost_used,
                }
            )

class PDFTextReader(AgentPlugin):
    """Enhanced PDF text extraction tool with page-based access and better error handling."""
    
    name = "pdf_content_extract"
    description = (
        "🔍 SCOUT (Short Reads Only): Extracts raw text from specific pages (limit 1-5 pages). "
        "Use ONLY for: 1. Documents under 5 pages. 2. Reading the Table of Contents/Intro (pages 1-3) to plan a RAG strategy. "
        "❌ DO NOT use this to read entire documents longer than 5 pages. "
        "For documents > 5 pages, you MUST use 'index_documents' instead."
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
        
async def setup_rag_tools(
    workspace_manager: WorkspaceManager,
    db_manager: DatabaseManager,
    qdrant_url: str,
    qdrant_api_key: str,
    embedding_provider: str = "openai",
    embedding_api_key: str = None,
    collection_name: str = "documents",
    user_id: str = None,  # REQUIRED
    session_id: Optional[str] = None  # Optional
) -> tuple[IndexDocumentsTool, SearchDocumentsTool,PDFTextReader,EmbeddingProvider]:
    """
    Setup RAG tools with USER and SESSION isolation
    Each user gets their own isolated tools instance
    """
    
    if not user_id:
        raise ValueError("user_id is REQUIRED for RAG tools")
    
    # Initialize Qdrant client (shared)
    qdrant_client = AsyncQdrantClient(
        url=qdrant_url,
        api_key=qdrant_api_key,
        timeout=60
    )
    
    embeddings = EmbeddingProvider(
        provider=embedding_provider,
        api_key=embedding_api_key
    )
    await embeddings.initialize()
    
    # Ensure collection exists (shared)
    try:
        await qdrant_client.get_collection(collection_name)
    except:
        await qdrant_client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=embeddings.dimension,
                distance=Distance.COSINE
            )
        )
        
        # Create indexes for user_id and session_id
        await qdrant_client.create_payload_index(
            collection_name=collection_name,
            field_name="user_id",
            field_schema=PayloadSchemaType.KEYWORD
        )
        await qdrant_client.create_payload_index(
            collection_name=collection_name,
            field_name="session_id",
            field_schema=PayloadSchemaType.KEYWORD
        )
        await qdrant_client.create_payload_index(
            collection_name=collection_name,
            field_name="file_hash",
            field_schema=PayloadSchemaType.KEYWORD
        )
    
    # Create USER-SPECIFIC index manager
    index_manager = DocumentIndexManager(
        db_manager=db_manager,
        qdrant_client=qdrant_client,
        embeddings=embeddings,
        collection_name=collection_name,
        user_id=user_id,  # USER ISOLATION
        session_id=session_id  # SESSION ISOLATION
    )
    
    await index_manager.initialize()
    
    # Create USER-SPECIFIC tools
    index_tool = IndexDocumentsTool(
        workspace_manager=workspace_manager,
        index_manager=index_manager
    )
    
    search_tool = SearchDocumentsTool(
        workspace_manager=workspace_manager,
        index_manager=index_manager
    )

    pdftextreader = PDFTextReader(workspace_manager=workspace_manager)
    
    logging.info(f"✅ RAG tools initialized for user={user_id}, session={session_id}")
    
    return index_tool, search_tool,pdftextreader,embeddings

