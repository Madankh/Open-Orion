from pathlib import Path
from typing import Any, Optional, List, Dict, Set, Tuple
import logging
import hashlib
import re
import asyncio
import uuid
from datetime import datetime, timezone

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, Range,
    PayloadSchemaType, FilterSelector,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pymupdf

from lab.base import AgentPlugin, AgentImplOutput
from llm.message_history import MessageHistory
from utilss.workspace_manager import WorkspaceManager
from Mongodb.db import DatabaseManager


# ======================================================================
# Citation primitives
# ======================================================================

# Tag format the agent must use in answers: [file.pdf, p.7]
CITATION_RE = re.compile(r"\[([^\[\]]+?),\s*p\.\s*(\d+)\s*\]")
_QUOTE_RE = re.compile(r'"([^"]{15,})"|\u201c([^\u201d]{15,})\u201d')

CITATION_RULES = (
    "CITATION RULES: Every claim taken from these sources MUST end with its tag, "
    "exactly as shown, e.g. [paper.pdf, p.7]. Use only tags that appear in the "
    "retrieved results. Never invent a page number. If the sources do not support a "
    "claim, say so instead of guessing. Quote only text that appears verbatim in a chunk."
)


def make_tag(file_name: str, page: Optional[int]) -> str:
    return f"[{file_name}, p.{page if page is not None else '?'}]"


def _norm(text: str) -> str:
    """Normalize for fuzzy containment checks (whitespace, case, hyphen line-breaks)."""
    text = text.replace("-\n", "")
    return re.sub(r"\s+", " ", text).strip().lower()


class CitationRegistry:
    """
    Remembers every (file, page) the agent has actually seen via search / page reads.
    Used to verify that tags in a final answer are real, and that quotes are verbatim.
    """

    def __init__(self):
        self._pages: Dict[Tuple[str, int], List[str]] = {}
        self._display_names: Dict[str, str] = {}

    def register(self, file_name: str, page: Optional[int], text: str) -> None:
        if page is None:
            return
        key = (file_name.lower(), int(page))
        bucket = self._pages.setdefault(key, [])
        if text not in bucket:
            bucket.append(text)
        self._display_names[file_name.lower()] = file_name

    def has(self, file_name: str, page: int) -> bool:
        return (file_name.lower(), int(page)) in self._pages

    def known_files(self) -> List[str]:
        return sorted(self._display_names.values())

    def _texts_for(self, tags: List[Tuple[str, int]]) -> str:
        parts = []
        for name, page in tags:
            parts.extend(self._pages.get((name.lower(), page), []))
        return _norm(" ".join(parts))

    def _all_text(self) -> str:
        return _norm(" ".join(t for texts in self._pages.values() for t in texts))

    def validate(self, answer: str) -> Dict[str, Any]:
        """
        Check an answer draft:
          - every tag points to a (file, page) the agent actually retrieved
          - quoted passages appear verbatim in the cited page(s)
          - (heuristic) long sentences with no citation at all
        """
        found: List[Dict[str, Any]] = []
        seen: Set[Tuple[str, int]] = set()
        for m in CITATION_RE.finditer(answer):
            name, page = m.group(1).strip(), int(m.group(2))
            if (name.lower(), page) in seen:
                continue
            seen.add((name.lower(), page))
            found.append({
                "tag": make_tag(name, page),
                "file": name,
                "page": page,
                "verified": self.has(name, page),
            })

        unverified = [c["tag"] for c in found if not c["verified"]]

        uncited, bad_quotes = [], []
        for sent in re.split(r"(?<=[.!?])\s+|\n+", answer):
            s = sent.strip()
            if not s:
                continue
            tags = [(m.group(1).strip(), int(m.group(2))) for m in CITATION_RE.finditer(s)]

            # uncited-claim heuristic: skip headings / short lines
            if not tags and len(s) > 60 and not s.startswith("#"):
                uncited.append(s[:140])

            for qm in _QUOTE_RE.finditer(s):
                quote = _norm(qm.group(1) or qm.group(2))
                haystack = self._texts_for(tags) if tags else self._all_text()
                if quote not in haystack:
                    bad_quotes.append(quote[:140])

        return {
            "ok": not unverified and not bad_quotes,
            "citations": found,
            "unverified_citations": unverified,
            "unmatched_quotes": bad_quotes,
            "possibly_uncited_sentences": uncited,
        }


# ======================================================================
# Embeddings
# ======================================================================

class EmbeddingProvider:
    """Handles all embedding operations (batched, retried, cost-tracked)"""

    def __init__(
        self,
        provider: str = "openai",
        api_key: str = None,
        model: str = "qwen/qwen3-embedding-8b",
        batch_size: int = 64,
        max_concurrency: int = 4,
        max_retries: int = 3,
    ):
        self.provider = provider
        self.api_key = api_key
        self.model = model
        self.batch_size = batch_size
        self.max_retries = max_retries
        self._sem = asyncio.Semaphore(max_concurrency)
        self._client = None
        self._dimension = 4096
        self.logger = logging.getLogger(__name__)

        self.total_prompt_tokens = 0
        self.total_embedding_tokens = 0
        self.total_cost = 0.0
        self.total_texts_embedded = 0
        self.embedding_calls = 0

    async def initialize(self):
        if self.provider == "openai":
            from openai import AsyncOpenAI
            self._client = AsyncOpenAI(
                base_url="https://openrouter.ai/api/v1",
                api_key=self.api_key,
            )
            self._dimension = 4096
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")

    @property
    def dimension(self) -> int:
        return self._dimension

    def _track_usage(self, response, n_texts: int) -> None:
        usage = getattr(response, "usage", None)
        if usage:
            cost = 0.0
            extra = getattr(usage, "model_extra", None)
            if extra:
                cost = extra.get("cost", 0.0) or 0.0
            self.total_prompt_tokens += usage.prompt_tokens
            self.total_embedding_tokens += usage.total_tokens
            self.total_cost += cost
            self.logger.info(
                f"🔢 Embedded {n_texts} text(s): {usage.prompt_tokens} tokens, ${cost:.8f}"
            )
        else:
            self.logger.warning("⚠️ No usage info in embedding response")
        self.total_texts_embedded += n_texts
        self.embedding_calls += 1

    async def _embed_batch(self, batch: List[str]) -> List[List[float]]:
        last_err: Optional[Exception] = None
        async with self._sem:
            for attempt in range(self.max_retries):
                try:
                    response = await self._client.embeddings.create(
                        model=self.model, input=batch
                    )
                    self._track_usage(response, len(batch))
                    data = sorted(response.data, key=lambda d: d.index)
                    return [d.embedding for d in data]
                except Exception as e:
                    last_err = e
                    wait = 2 ** attempt
                    self.logger.warning(
                        f"Embedding batch failed (attempt {attempt + 1}/{self.max_retries}): {e}; retry in {wait}s"
                    )
                    await asyncio.sleep(wait)
        raise RuntimeError(f"Embedding failed after {self.max_retries} attempts: {last_err}")

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Batch embed many texts; order is preserved."""
        if not texts:
            return []
        batches = [texts[i:i + self.batch_size] for i in range(0, len(texts), self.batch_size)]
        results = await asyncio.gather(*(self._embed_batch(b) for b in batches))
        return [emb for batch in results for emb in batch]

    async def embed_query(self, query: str) -> List[float]:
        return (await self._embed_batch([query]))[0]

    def get_token_stats(self) -> dict:
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
        self.total_prompt_tokens = 0
        self.total_embedding_tokens = 0
        self.total_cost = 0.0
        self.total_texts_embedded = 0
        self.embedding_calls = 0


# ======================================================================
# Shared helpers
# ======================================================================

def resolve_pdf_path(
    workspace_manager: WorkspaceManager, relative_path: str
) -> Tuple[bool, str, Optional[Path]]:
    """Validate a PDF path (forced into uploaded_files/)."""
    try:
        path_obj = Path(relative_path)
        if "uploaded_files" not in path_obj.parts:
            relative_path = str(Path("uploaded_files") / path_obj.name)

        full_path = workspace_manager.workspace_path(Path(relative_path))

        if not full_path.exists():
            return False, f"File not found: {relative_path}", None
        if not full_path.is_file():
            return False, f"Not a file: {relative_path}", None
        if full_path.suffix.lower() != ".pdf":
            return False, f"Not a PDF: {relative_path}", None
        return True, "", full_path
    except Exception as e:
        return False, f"Invalid path: {e}", None


def file_sha256(file_path: Path) -> str:
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ======================================================================
# Index manager
# ======================================================================

class DocumentIndexManager:
    """
    Manages indexed documents with USER and SESSION isolation.
    Also owns the CitationRegistry for this user/session.
    """

    def __init__(
        self,
        db_manager: DatabaseManager,
        qdrant_client: AsyncQdrantClient,
        embeddings: EmbeddingProvider,
        collection_name: str = "documents",
        user_id: str = None,
        session_id: Optional[str] = None,
    ):
        if not user_id:
            raise ValueError("user_id is required for DocumentIndexManager")

        self.db_manager = db_manager
        self.qdrant = qdrant_client
        self.embeddings = embeddings
        self.collection_name = collection_name
        self.user_id = user_id
        self.session_id = session_id

        self._indexed_cache: Set[str] = set()
        self._lock = asyncio.Lock()
        self.citations = CitationRegistry()

    async def initialize(self):
        """Load cached indexed documents for THIS USER (and session, if set)"""
        metadata_col = self.db_manager.db["rag_metadata"]

        query_filter = {"user_id": self.user_id, "status": "completed"}
        if self.session_id:
            query_filter["session_id"] = self.session_id

        async for doc in metadata_col.find(query_filter, {"file_hash": 1}):
            self._indexed_cache.add(doc["file_hash"])

        scope = f"user {self.user_id}" + (f" session {self.session_id}" if self.session_id else "")
        logging.info(f"✓ Loaded {len(self._indexed_cache)} indexed documents for {scope}")

    def is_indexed(self, file_hash: str) -> bool:
        return file_hash in self._indexed_cache

    async def mark_as_indexed(self, file_hash: str):
        async with self._lock:
            self._indexed_cache.add(file_hash)

    async def get_indexed_count(self) -> int:
        return len(self._indexed_cache)

    def get_user_filter(self) -> List[FieldCondition]:
        """Qdrant conditions for this user/session"""
        conditions = [FieldCondition(key="user_id", match=MatchValue(value=self.user_id))]
        if self.session_id:
            conditions.append(
                FieldCondition(key="session_id", match=MatchValue(value=self.session_id))
            )
        return conditions


# ======================================================================
# Index tool
# ======================================================================

class IndexDocumentsTool(AgentPlugin):
    """Index PDFs page-by-page so every chunk can be cited as [file, p.N]."""

    name = "index_documents"
    description = (
        "💾 PRESERVE: Index PDFs into a personal semantic memory for future retrieval. "
        "Use only after you understand the document and want to preserve it for deep search. "
        "Documents are indexed once per user and session; already indexed files are skipped. "
        "Chunks are page-aware, so search results can be cited with exact page numbers. "
        "Use this immediately after 'scouting' the intro/TOC of a large file. "
        "After indexing, use 'search_documents' for precise queries."
    )

    input_schema = {
        "type": "object",
        "properties": {
            "file_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of PDF file paths to index",
            },
            "force_reindex": {
                "type": "boolean",
                "description": "Force re-indexing (replaces old chunks). Default: false",
                "default": False,
            },
        },
        "required": ["file_paths"],
    }

    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        index_manager: DocumentIndexManager,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
        logger: Optional[logging.Logger] = None,
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
            separators=["\n\n", "\n", ". ", " ", ""],
            add_start_index=True,
        )

    async def _extract_pdf_pages(self, pdf_path: Path) -> Tuple[List[Dict[str, Any]], Dict]:
        """Return per-page text (with nearest TOC section) + document metadata."""
        loop = asyncio.get_running_loop()

        def _extract():
            doc = pymupdf.open(pdf_path)
            try:
                toc = doc.get_toc() or []  # [[level, title, page], ...]
                metadata = {
                    "total_pages": doc.page_count,
                    "title": doc.metadata.get("title", ""),
                    "author": doc.metadata.get("author", ""),
                    "has_toc": bool(toc),
                }

                pages: List[Dict[str, Any]] = []
                empty_pages: List[int] = []
                for i in range(doc.page_count):
                    page_no = i + 1
                    text = doc.load_page(i).get_text("text").strip()
                    if not text:
                        empty_pages.append(page_no)
                        continue
                    section = ""
                    for _lvl, title, toc_page in toc:
                        if toc_page <= page_no:
                            section = title
                        else:
                            break
                    pages.append({"page": page_no, "text": text, "section": section})

                metadata["pages_without_text"] = empty_pages
                return pages, metadata
            finally:
                doc.close()

        return await loop.run_in_executor(None, _extract)

    async def _delete_existing(self, file_hash: str) -> None:
        """Remove old chunks of this file for this user/session (used on force_reindex)."""
        conditions = self.index_manager.get_user_filter() + [
            FieldCondition(key="file_hash", match=MatchValue(value=file_hash))
        ]
        await self.index_manager.qdrant.delete(
            collection_name=self.index_manager.collection_name,
            points_selector=FilterSelector(filter=Filter(must=conditions)),
        )

    async def _index_single_document(
        self, file_hash: str, file_path: str, full_path: Path, force: bool = False
    ) -> Dict[str, Any]:
        im = self.index_manager
        try:
            self.logger.info(f"📖 Extracting: {file_path}")
            pages, metadata = await self._extract_pdf_pages(full_path)
            if not pages:
                raise ValueError(
                    "No extractable text (scanned PDF? it needs OCR before indexing)"
                )

            # Chunk PER PAGE so each chunk has exactly one page number
            chunks: List[Dict[str, Any]] = []
            for p in pages:
                for d in self.text_splitter.create_documents([p["text"]]):
                    start = d.metadata.get("start_index", 0)
                    chunks.append({
                        "text": d.page_content,
                        "page": p["page"],
                        "section": p["section"],
                        "char_start": start,
                        "char_end": start + len(d.page_content),
                    })
            self.logger.info(f"📝 {len(pages)} pages → {len(chunks)} chunks")

            if force:
                await self._delete_existing(file_hash)

            embeddings = await im.embeddings.embed_texts([c["text"] for c in chunks])

            file_name = Path(file_path).name
            now = _utcnow().isoformat()
            points = []
            for i, (c, emb) in enumerate(zip(chunks, embeddings)):
                payload = {
                    "text": c["text"],
                    "file_hash": file_hash,
                    "file_path": file_path,
                    "file_name": file_name,
                    "page_number": c["page"],
                    "section": c["section"],
                    "char_start": c["char_start"],
                    "char_end": c["char_end"],
                    "user_id": im.user_id,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "title": metadata.get("title", ""),
                    "author": metadata.get("author", ""),
                    "indexed_at": now,
                }
                if im.session_id:
                    payload["session_id"] = im.session_id

                # deterministic id → re-indexing overwrites instead of duplicating
                point_id = str(uuid.uuid5(
                    uuid.NAMESPACE_URL,
                    f"{im.user_id}:{im.session_id}:{file_hash}:{i}",
                ))
                points.append(PointStruct(id=point_id, vector=emb, payload=payload))

            for i in range(0, len(points), 100):
                await im.qdrant.upsert(
                    collection_name=im.collection_name, points=points[i:i + 100]
                )

            doc_metadata = {
                "file_hash": file_hash,
                "file_path": file_path,
                "file_name": file_name,
                "user_id": im.user_id,
                "chunk_count": len(chunks),
                "total_pages": metadata.get("total_pages", 0),
                "pages_without_text": metadata.get("pages_without_text", []),
                "status": "completed",
                "indexed_at": _utcnow(),
                "pdf_metadata": metadata,
                "session_id": im.session_id,
            }
            await im.db_manager.db["rag_metadata"].update_one(
                {"file_hash": file_hash, "user_id": im.user_id, "session_id": im.session_id},
                {"$set": doc_metadata},
                upsert=True,
            )

            await im.mark_as_indexed(file_hash)
            self.logger.info(f"✅ Indexed: {file_path} ({len(chunks)} chunks)")

            return {
                "success": True,
                "file_path": file_path,
                "file_name": file_name,
                "chunks": len(chunks),
                "pages": metadata.get("total_pages", 0),
                "pages_without_text": metadata.get("pages_without_text", []),
            }

        except Exception as e:
            self.logger.error(f"❌ Failed to index {file_path}: {e}")
            return {"success": False, "file_path": file_path, "error": str(e)}

    async def run_impl(
        self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        file_paths = tool_input["file_paths"]
        force_reindex = tool_input.get("force_reindex", False)
        im = self.index_manager

        self.logger.info(f"🚀 User {im.user_id}: Indexing {len(file_paths)} documents...")
        stats_before = im.embeddings.get_token_stats()

        validated, errors = [], []
        for fp in file_paths:
            ok, err, full_path = resolve_pdf_path(self.workspace_manager, fp)
            if not ok:
                errors.append(f"❌ {fp}: {err}")
                continue
            file_hash = file_sha256(full_path)
            if im.is_indexed(file_hash) and not force_reindex:
                self.logger.info(f"⏭️  Skipping (already indexed): {fp}")
                continue
            validated.append((file_hash, fp, full_path))

        if not validated and not errors:
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
                },
            )

        results = await asyncio.gather(
            *(self._index_single_document(h, p, fp, force_reindex) for h, p, fp in validated),
            return_exceptions=True,
        )

        stats_after = im.embeddings.get_token_stats()
        tokens_used = stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"]
        cost_used = stats_after["total_cost"] - stats_before["total_cost"]

        successful, failed = [], []
        for r in results:
            if isinstance(r, Exception):
                failed.append(str(r))
            elif r.get("success"):
                successful.append(r)
            else:
                failed.append(f"{r.get('file_path')}: {r.get('error', 'Unknown error')}")

        skipped = len(file_paths) - len(validated) - len(errors)

        parts = []
        if successful:
            total_chunks = sum(r["chunks"] for r in successful)
            parts.append(
                f"✅ Successfully indexed {len(successful)} document(s) with {total_chunks} chunks total"
            )
        if skipped > 0:
            parts.append(f"⏭️  Skipped {skipped} already indexed document(s)")
        if errors:
            parts.append(f"❌ {len(errors)} validation error(s)")
        if failed:
            parts.append(f"❌ {len(failed)} indexing failure(s)")
        summary = "\n".join(parts)

        if tokens_used > 0:
            summary += f"\n\n📊 Embedding tokens used: {tokens_used:,} (${cost_used:.6f})"

        if successful:
            lines = []
            for r in successful:
                line = f"  • {r['file_name']}: {r['chunks']} chunks ({r['pages']} pages)"
                if r["pages_without_text"]:
                    pw = r["pages_without_text"]
                    shown = ", ".join(map(str, pw[:10])) + ("…" if len(pw) > 10 else "")
                    line += f" ⚠️ no text on pages: {shown} (scanned? not citable)"
                lines.append(line)
            summary += "\n\nIndexed documents (cite as [file_name, p.N]):\n" + "\n".join(lines)

        if errors:
            summary += "\n\nErrors:\n" + "\n".join(f"  • {e}" for e in errors)
        if failed:
            summary += "\n\nFailures:\n" + "\n".join(f"  • {e}" for e in failed)

        return AgentImplOutput(
            summary,
            f"Indexed {len(successful)}/{len(file_paths)} documents",
            {
                "success": True,
                "total_requested": len(file_paths),
                "successfully_indexed": len(successful),
                "already_indexed": skipped,
                "failed": len(failed) + len(errors),
                "indexed_files": [r["file_path"] for r in successful],
                "embedding_tokens_used": tokens_used,
                "embedding_cost": cost_used,
            },
        )


# ======================================================================
# Search tool
# ======================================================================

class SearchDocumentsTool(AgentPlugin):
    """Semantic search that returns citation-ready chunks."""

    name = "search_documents"
    description = (
        "🔍 RECALL: Semantic search across indexed documents to retrieve specific information. "
        "Use for targeted questions like: 'find X', 'what does the paper say about Y?', "
        "'compare Z across papers', or 'locate methodology details'. "
        "Searches all indexed PDFs unless a specific file_path is provided; optionally limit to a page range. "
        "Each returned chunk carries a citation tag like [file.pdf, p.7]. "
        "Your final answer MUST cite these tags after every claim derived from them, "
        "and must not cite anything not returned by a tool. If no chunk supports a claim, say so instead of guessing. "
        "This tool is for recall, not first-time reading. "
        "Only searches documents you have indexed; other users cannot access your data."
    )

    input_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Your search query"},
            "file_path": {
                "type": "string",
                "description": "Optional: Search only in this specific file",
            },
            "page_start": {
                "type": "integer",
                "description": "Optional: only search from this page (1-based)",
                "minimum": 1,
            },
            "page_end": {
                "type": "integer",
                "description": "Optional: only search up to this page (inclusive)",
                "minimum": 1,
            },
            "top_k": {
                "type": "integer",
                "description": "Number of results (1-20). Default: 5",
                "default": 5,
                "minimum": 1,
                "maximum": 20,
            },
            "min_score": {
                "type": "number",
                "description": "Minimum similarity score (0-1). Default: 0.35",
                "default": 0.35,
                "minimum": 0,
                "maximum": 1,
            },
        },
        "required": ["query"],
    }

    DEFAULT_MIN_SCORE = 0.35

    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        index_manager: DocumentIndexManager,
        logger: Optional[logging.Logger] = None,
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.index_manager = index_manager
        self.logger = logger or logging.getLogger(__name__)

    @staticmethod
    def _fail(message: str, short: str, error: str, tokens: int = 0, cost: float = 0.0):
        return AgentImplOutput(
            message,
            short,
            {
                "success": False,
                "error": error,
                "embedding_tokens_used": tokens,
                "embedding_cost": cost,
            },
        )

    async def run_impl(
        self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        query = tool_input["query"]
        file_path_str = tool_input.get("file_path")
        page_start = tool_input.get("page_start")
        page_end = tool_input.get("page_end")
        top_k = tool_input.get("top_k", 5)
        min_score = tool_input.get("min_score", self.DEFAULT_MIN_SCORE)
        im = self.index_manager

        self.logger.info(f"🔍 User {im.user_id}: Searching '{query}'")
        stats_before = im.embeddings.get_token_stats()

        indexed_count = await im.get_indexed_count()
        if indexed_count == 0:
            return self._fail(
                "You haven't indexed any documents yet. Use 'index_documents' tool first.",
                "No indexed documents",
                "no_indexed_documents",
            )

        must = im.get_user_filter()

        if file_path_str:
            ok, err, full_path = resolve_pdf_path(self.workspace_manager, file_path_str)
            if not ok:
                return self._fail(err, "Invalid file path", "invalid_file_path")
            file_hash = file_sha256(full_path)
            if not im.is_indexed(file_hash):
                return self._fail(
                    f"Document '{file_path_str}' is not indexed. Use 'index_documents' first.",
                    "Document not indexed",
                    "document_not_indexed",
                )
            must.append(FieldCondition(key="file_hash", match=MatchValue(value=file_hash)))

        if page_start or page_end:
            must.append(
                FieldCondition(key="page_number", range=Range(gte=page_start, lte=page_end))
            )

        try:
            query_embedding = await im.embeddings.embed_query(query)
            stats_after = im.embeddings.get_token_stats()
            tokens_used = stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"]
            cost_used = stats_after["total_cost"] - stats_before["total_cost"]

            # over-fetch a little so de-duplication doesn't starve top_k
            response = await im.qdrant.query_points(
                collection_name=im.collection_name,
                query=query_embedding,
                query_filter=Filter(must=must),
                limit=top_k * 2,
                score_threshold=min_score,
                with_payload=True,
            )
            raw = response.points if response else []

            # de-duplicate identical text (repeated headers, duplicate uploads)
            results, seen_text = [], set()
            for r in raw:
                key = _norm(r.payload["text"])
                if key in seen_text:
                    continue
                seen_text.add(key)
                results.append(r)
                if len(results) >= top_k:
                    break

            scope = f"in '{file_path_str}'" if file_path_str else f"across {indexed_count} document(s)"
            if not results:
                return AgentImplOutput(
                    f"No relevant information found {scope} for: '{query}'. "
                    "Do not answer from guesswork; tell the user the documents don't cover this, "
                    "or try a rephrased query.",
                    "No results found",
                    {
                        "success": True,
                        "results_count": 0,
                        "query": query,
                        "citations": [],
                        "scope": "single_file" if file_path_str else "all_files",
                        "embedding_tokens_used": tokens_used,
                        "embedding_cost": cost_used,
                    },
                )

            context_parts, citations, source_files = [], [], set()
            for r in results:
                p = r.payload
                file_name = p.get("file_name") or Path(p["file_path"]).name
                page = p.get("page_number")
                section = p.get("section", "")
                tag = make_tag(file_name, page)

                source_files.add(p["file_path"])
                im.citations.register(file_name, page, p["text"])

                citations.append({
                    "tag": tag,
                    "file_name": file_name,
                    "file_path": p["file_path"],
                    "page": page,
                    "section": section,
                    "chunk_index": p.get("chunk_index"),
                    "char_start": p.get("char_start"),
                    "char_end": p.get("char_end"),
                    "score": round(r.score, 3),
                    "snippet": p["text"][:240],
                })

                header = f"{tag} | score {r.score:.3f}"
                if section:
                    header += f" | section: {section}"
                context_parts.append(f"{header}\n{p['text']}\n")

            context = (
                CITATION_RULES
                + "\n\n"
                + "\n".join(context_parts)
                + f"\nAvailable tags: {', '.join(dict.fromkeys(c['tag'] for c in citations))}"
            )
            summary = (
                f"Found {len(results)} relevant chunk(s) {scope}\n"
                f"Sources: {', '.join(sorted(source_files))}"
            )

            return AgentImplOutput(
                context,
                summary,
                {
                    "success": True,
                    "results_count": len(results),
                    "query": query,
                    "sources": sorted(source_files),
                    "citations": citations,
                    "scope": "single_file" if file_path_str else "all_files",
                    "embedding_tokens_used": tokens_used,
                    "embedding_cost": cost_used,
                },
            )

        except Exception as e:
            self.logger.error(f"❌ Search error: {e}", exc_info=True)
            stats_after = im.embeddings.get_token_stats()
            return self._fail(
                f"Search failed: {e}",
                "Search error",
                str(e),
                stats_after["total_embedding_tokens"] - stats_before["total_embedding_tokens"],
                stats_after["total_cost"] - stats_before["total_cost"],
            )


# ======================================================================
# Source (page) lookup tool
# ======================================================================

class GetCitedSourceTool(AgentPlugin):
    """Read the full text of one cited page, to double-check a claim before citing it."""

    name = "get_cited_source"
    description = (
        "📄 VERIFY: Fetch the full text of one indexed page, given its citation tag parts "
        "(file_name + page). Use when a search chunk is ambiguous or cut off and you need the full "
        "page context before making a claim. The page is then citable as [file_name, p.N]."
    )

    input_schema = {
        "type": "object",
        "properties": {
            "file_name": {
                "type": "string",
                "description": "File name exactly as in the citation tag, e.g. 'paper.pdf'",
            },
            "page": {"type": "integer", "description": "Page number (1-based)", "minimum": 1},
        },
        "required": ["file_name", "page"],
    }

    def __init__(self, index_manager: DocumentIndexManager, logger: Optional[logging.Logger] = None):
        super().__init__()
        self.index_manager = index_manager
        self.logger = logger or logging.getLogger(__name__)

    async def run_impl(
        self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        file_name = Path(tool_input["file_name"]).name
        page = tool_input["page"]
        im = self.index_manager

        must = im.get_user_filter() + [
            FieldCondition(key="file_name", match=MatchValue(value=file_name)),
            FieldCondition(key="page_number", match=MatchValue(value=page)),
        ]

        try:
            points, _ = await im.qdrant.scroll(
                collection_name=im.collection_name,
                scroll_filter=Filter(must=must),
                limit=200,
                with_payload=True,
                with_vectors=False,
            )
        except Exception as e:
            return AgentImplOutput(
                f"Lookup failed: {e}", "Lookup error", {"success": False, "error": str(e)}
            )

        if not points:
            return AgentImplOutput(
                f"No indexed text for {make_tag(file_name, page)}. "
                "Check the file name/page, or the page may have no extractable text.",
                "Page not found",
                {"success": False, "error": "page_not_found"},
            )

        # Stitch overlapping chunks back together using stored char offsets
        points.sort(key=lambda p: p.payload.get("char_start", 0))
        page_text, cursor = "", 0
        for p in points:
            start = p.payload.get("char_start", cursor)
            text = p.payload["text"]
            if start >= cursor:
                page_text += text if start == cursor else "\n" + text
                cursor = start + len(text)
            elif start + len(text) > cursor:
                page_text += text[cursor - start:]
                cursor = start + len(text)

        section = points[0].payload.get("section", "")
        tag = make_tag(file_name, page)
        im.citations.register(file_name, page, page_text)

        header = f"{tag}" + (f" | section: {section}" if section else "")
        return AgentImplOutput(
            f"{header}\n\n{page_text}",
            f"Read {tag} ({len(page_text)} chars)",
            {
                "success": True,
                "tag": tag,
                "file_name": file_name,
                "page": page,
                "section": section,
                "chars": len(page_text),
            },
        )


# ======================================================================
# Citation verification tool
# ======================================================================

class VerifyCitationsTool(AgentPlugin):
    """Audit a draft answer before sending it to the user."""

    name = "verify_citations"
    description = (
        "✅ AUDIT: Check your DRAFT final answer before sending it. Verifies that every [file, p.N] tag "
        "refers to a page you actually retrieved, that quoted passages appear verbatim in the cited page, "
        "and flags long sentences with no citation. Call this once on any answer built from documents; "
        "fix every reported problem, then answer."
    )

    input_schema = {
        "type": "object",
        "properties": {
            "answer": {"type": "string", "description": "The full draft answer, with citation tags"}
        },
        "required": ["answer"],
    }

    def __init__(self, index_manager: DocumentIndexManager, logger: Optional[logging.Logger] = None):
        super().__init__()
        self.index_manager = index_manager
        self.logger = logger or logging.getLogger(__name__)

    async def run_impl(
        self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        report = self.index_manager.citations.validate(tool_input["answer"])

        lines = []
        if not report["citations"]:
            lines.append("⚠️ No citation tags found. Add [file, p.N] tags for claims from documents.")
        else:
            lines.append(f"Citations found: {len(report['citations'])}")

        if report["unverified_citations"]:
            lines.append(
                "❌ Unverified citations (not retrieved by any tool; remove or fetch them first):\n"
                + "\n".join(f"  • {t}" for t in report["unverified_citations"])
            )
            known = self.index_manager.citations.known_files()
            if known:
                lines.append(f"  Files seen so far: {', '.join(known)}")
        if report["unmatched_quotes"]:
            lines.append(
                "❌ Quotes not found verbatim in the cited source (paraphrase or correct them):\n"
                + "\n".join(f"  • \"{q}\"" for q in report["unmatched_quotes"])
            )
        if report["possibly_uncited_sentences"]:
            lines.append(
                "⚠️ Sentences without a citation (cite them or mark them as your own inference):\n"
                + "\n".join(f"  • {s}…" for s in report["possibly_uncited_sentences"][:8])
            )
        if report["ok"] and not report["possibly_uncited_sentences"] and report["citations"]:
            lines.append("✅ All citations verified.")

        return AgentImplOutput(
            "\n".join(lines),
            "Citations verified" if report["ok"] else "Citation problems found",
            {"success": True, **report},
        )


# ======================================================================
# Scout tool (short reads)
# ======================================================================

class PDFTextReader(AgentPlugin):
    """PDF text extraction for short reads. Page headers double as citation tags."""

    name = "pdf_content_extract"
    description = (
        "🔍 SCOUT (Short Reads Only): Extracts raw text from specific pages (limit 1-5 pages). "
        "Use ONLY for: 1. Documents under 5 pages. 2. Reading the Table of Contents/Intro (pages 1-3) to plan a RAG strategy. "
        "Each page is headed with its citation tag, e.g. [file.pdf, p.2]. "
        "❌ DO NOT use this to read entire documents longer than 5 pages. "
        "For documents > 5 pages, you MUST use 'index_documents' instead."
    )
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "The relative path to the PDF file within the workspace (e.g., 'uploads/my_resume.pdf').",
            },
            "start_page": {
                "type": "integer",
                "description": "Starting page number (1-based indexing). If not specified, starts from page 1.",
                "minimum": 1,
            },
            "end_page": {
                "type": "integer",
                "description": "Ending page number (1-based indexing). If not specified, extracts to the last page.",
                "minimum": 1,
            },
            "include_metadata": {
                "type": "boolean",
                "description": "Whether to include PDF metadata in the output. Defaults to False.",
                "default": False,
            },
        },
        "required": ["file_path"],
    }

    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        max_output_length: int = 15000,
        citation_registry: Optional[CitationRegistry] = None,
        logger: Optional[logging.Logger] = None,
    ):
        super().__init__()
        self.workspace_manager = workspace_manager
        self.max_output_length = max_output_length
        self.citations = citation_registry
        self.logger = logger or logging.getLogger(__name__)

    def _validate_page_range(
        self, start_page: Optional[int], end_page: Optional[int], total_pages: int
    ) -> Tuple[bool, str, int, int]:
        start = start_page if start_page is not None else 1
        end = end_page if end_page is not None else total_pages

        if start < 1:
            return False, "Start page must be >= 1", start, end
        if end < 1:
            return False, "End page must be >= 1", start, end
        if start > total_pages:
            return False, f"Start page {start} exceeds total pages {total_pages}", start, end
        if end > total_pages:
            self.logger.warning(f"End page {end} exceeds total pages {total_pages}, adjusting")
            end = total_pages
        if start > end:
            return False, f"Start page {start} cannot be greater than end page {end}", start, end
        return True, "", start, end

    def _extract_metadata(self, doc: pymupdf.Document) -> Dict[str, Any]:
        try:
            m = doc.metadata
            return {
                "title": m.get("title", ""),
                "author": m.get("author", ""),
                "subject": m.get("subject", ""),
                "creator": m.get("creator", ""),
                "producer": m.get("producer", ""),
                "creation_date": m.get("creationDate", ""),
                "modification_date": m.get("modDate", ""),
                "total_pages": doc.page_count,
            }
        except Exception as e:
            self.logger.warning(f"Failed to extract metadata: {e}")
            return {"total_pages": doc.page_count}

    def _extract_text_from_pages(
        self, doc: pymupdf.Document, start_page: int, end_page: int, file_name: str
    ) -> Tuple[str, Dict[str, Any]]:
        out, page_info = [], {}
        for page_num in range(start_page - 1, end_page):
            try:
                text = doc.load_page(page_num).get_text("text")
                if text.strip():
                    out.append(f"\n--- {make_tag(file_name, page_num + 1)} ---\n{text}")
                    page_info[f"page_{page_num + 1}"] = len(text)
                    if self.citations is not None:
                        self.citations.register(file_name, page_num + 1, text.strip())
                else:
                    page_info[f"page_{page_num + 1}"] = 0
            except Exception as e:
                self.logger.error(f"Failed to extract text from page {page_num + 1}: {e}")
                page_info[f"page_{page_num + 1}_error"] = str(e)
        return "".join(out).strip(), page_info

    async def run_impl(
        self, tool_input: Dict[str, Any], message_history: Optional[MessageHistory]
    ) -> AgentImplOutput:
        rel = tool_input["file_path"]
        start_page = tool_input.get("start_page")
        end_page = tool_input.get("end_page")
        include_metadata = tool_input.get("include_metadata", False)

        ok, err, full_path = resolve_pdf_path(self.workspace_manager, rel)
        if not ok:
            return AgentImplOutput(f"Error: {err}", f"File validation failed: {err}",
                                   {"success": False, "error": err})

        file_name = full_path.name
        try:
            doc = pymupdf.open(full_path)
            try:
                total_pages = doc.page_count
                ok_range, range_err, start, end = self._validate_page_range(
                    start_page, end_page, total_pages
                )
                if not ok_range:
                    return AgentImplOutput(
                        f"Error: {range_err}",
                        f"Page range validation failed: {range_err}",
                        {"success": False, "error": range_err},
                    )

                text, page_info = self._extract_text_from_pages(doc, start, end, file_name)
                metadata = self._extract_metadata(doc) if include_metadata else {}
            finally:
                doc.close()

            if not text:
                return AgentImplOutput(
                    f"Warning: No text content found in pages {start} to {end} of {rel}",
                    "No text extracted from specified pages",
                    {
                        "success": True,
                        "extracted_chars": 0,
                        "pages_processed": end - start + 1,
                        "page_info": page_info,
                        "metadata": metadata,
                    },
                )

            original_length = len(text)
            if original_length > self.max_output_length:
                text = (
                    text[: self.max_output_length]
                    + f"\n\n... (content truncated due to length limit of {self.max_output_length} characters)"
                )

            data = {
                "success": True,
                "extracted_chars": original_length,
                "displayed_chars": len(text),
                "pages_processed": end - start + 1,
                "page_range": f"{start}-{end}",
                "total_pages": total_pages,
                "page_info": page_info,
                "truncated": original_length > self.max_output_length,
            }
            if include_metadata:
                data["metadata"] = metadata

            return AgentImplOutput(
                text,
                f"Successfully extracted text from {rel} (pages {start}-{end}, {original_length} characters)",
                data,
            )

        except pymupdf.FileDataError as e:
            msg = f"PDF file is corrupted or invalid: {e}"
            return AgentImplOutput(f"Error: {msg}", f"Failed to process PDF: {msg}",
                                   {"success": False, "error": msg, "error_type": "corrupted_file"})
        except PermissionError as e:
            msg = f"Permission denied accessing file: {e}"
            return AgentImplOutput(f"Error: {msg}", f"Access denied: {msg}",
                                   {"success": False, "error": msg, "error_type": "permission_denied"})
        except Exception as e:
            msg = f"Unexpected error extracting text from PDF {rel}: {e}"
            self.logger.error(msg, exc_info=True)
            return AgentImplOutput(f"Error: {msg}", f"Failed to extract text from {rel}",
                                   {"success": False, "error": str(e), "error_type": "unexpected_error"})


# ======================================================================
# Setup
# ======================================================================

async def _ensure_collection(client: AsyncQdrantClient, name: str, dim: int) -> None:
    try:
        await client.get_collection(name)
    except Exception:
        await client.create_collection(
            collection_name=name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )

    # Idempotent: also upgrades collections created before citations existed
    indexes = {
        "user_id": PayloadSchemaType.KEYWORD,
        "session_id": PayloadSchemaType.KEYWORD,
        "file_hash": PayloadSchemaType.KEYWORD,
        "file_name": PayloadSchemaType.KEYWORD,
        "page_number": PayloadSchemaType.INTEGER,
    }
    for field, schema in indexes.items():
        try:
            await client.create_payload_index(
                collection_name=name, field_name=field, field_schema=schema
            )
        except Exception as e:
            logging.debug(f"Payload index '{field}' not created (likely exists): {e}")


async def setup_rag_tools(
    workspace_manager: WorkspaceManager,
    db_manager: DatabaseManager,
    qdrant_url: str,
    qdrant_api_key: str,
    embedding_provider: str = "openai",
    embedding_api_key: str = None,
    collection_name: str = "documents",
    user_id: str = None,  # REQUIRED
    session_id: Optional[str] = None,
) -> Tuple[
    IndexDocumentsTool,
    SearchDocumentsTool,
    PDFTextReader,
    EmbeddingProvider,
    GetCitedSourceTool,
    VerifyCitationsTool,
]:
    """
    Setup RAG tools with USER and SESSION isolation.
    Returns the original 4 objects followed by the 2 new citation tools.
    """
    if not user_id:
        raise ValueError("user_id is REQUIRED for RAG tools")

    qdrant_client = AsyncQdrantClient(url=qdrant_url, api_key=qdrant_api_key, timeout=60)

    embeddings = EmbeddingProvider(provider=embedding_provider, api_key=embedding_api_key)
    await embeddings.initialize()

    await _ensure_collection(qdrant_client, collection_name, embeddings.dimension)

    index_manager = DocumentIndexManager(
        db_manager=db_manager,
        qdrant_client=qdrant_client,
        embeddings=embeddings,
        collection_name=collection_name,
        user_id=user_id,
        session_id=session_id,
    )
    await index_manager.initialize()

    index_tool = IndexDocumentsTool(workspace_manager=workspace_manager, index_manager=index_manager)
    search_tool = SearchDocumentsTool(workspace_manager=workspace_manager, index_manager=index_manager)
    pdf_reader = PDFTextReader(
        workspace_manager=workspace_manager, citation_registry=index_manager.citations
    )
    source_tool = GetCitedSourceTool(index_manager=index_manager)
    verify_tool = VerifyCitationsTool(index_manager=index_manager)

    logging.info(f"✅ RAG tools initialized for user={user_id}, session={session_id}")

    return index_tool, search_tool, pdf_reader, embeddings, source_tool, verify_tool