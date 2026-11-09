import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, ChevronUp, FileText, MessageCircle, Map as MapIcon, MoreHorizontal, X, ZoomIn, ZoomOut,
  MoveHorizontal, Crop, Search, Pencil, Copy, Info, Link as LinkIcon,
  Trash2, Library, Sparkles, ArrowUp, Bookmark, Loader2, Plus,
} from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { pythonUrl } from '../../apiurl';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type SelectionType = 'text' | 'image' | 'chart' | 'table' | 'diagram' | 'mixed';
type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

interface NormBox { x: number; y: number; width: number; height: number }

interface EmbeddedPdfImage {
  id: string;
  imageData: string;
  alt: string;
  pageNumber: number;
  boundingBox: NormBox;
}

interface Selection {
  id: string;
  type: SelectionType;
  content: string;
  imageData?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  boundingBoxNormalized?: boolean;
  embeddedImages?: EmbeddedPdfImage[];
  pageRange?: { startPage: number; endPage: number };
  pageNumber: number;
  timestamp: string;
  tags: string[];
}

interface Highlight {
  id: string;
  pageNumber: number;
  color: HighlightColor;
  rects: NormBox[];
  content: string;
}

interface PDFDoc {
  id: string;
  name: string;
  url: string;
  numPages: number;
  uploadedAt: string;
}

interface ParsedPage {
  number: number;
  width?: number;
  height?: number;
  unit?: string;
  element_ids?: string[];
  reading_order?: string[];
}

interface ParsedElement {
  id: string;
  kind?: string;
  role?: string;
  text?: string;
  markdown?: string;
  content?: string;
  cells?: unknown;
  locations?: Array<{
    page_number: number;
    bbox?: { left: number; top: number; right: number; bottom: number };
  }>;
  confidence?: { score?: number };
}

interface PDFParseResponse {
  status: string;
  job_id?: string | null;
  model?: string;
  document_id?: string;
  page_count?: number;
  pages?: ParsedPage[];
  elements?: ParsedElement[];
  text?: string;
  markdown?: string;
  error?: unknown;
}

export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string }
export interface ChatContextItem { id: string; title: string; content: string; imageData?: string }
export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  context: ChatContextItem[];
  documentName: string;
  currentPage: number;
}

export interface ReaderMenuActions {
  openInNewTab?: () => void;
  addHere?: () => void;
  openInPopup?: () => void;
  copyLink?: () => void;
  share?: () => void;
  addToInbox?: () => void;
  manageTags?: () => void;
  addToWhiteboard?: () => void;
  delete?: () => void;
}

/* ------------------------------------------------------------------ */
/* Pure helpers (parse logic unchanged)                                */
/* ------------------------------------------------------------------ */

const parseFailureText = (error: unknown, fallback: string) => {
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string' && message.trim()) return message;
    const code = (error as Record<string, unknown>).code;
    if (typeof code === 'string' && code.trim()) return code;
  }
  return fallback;
};

const markdownTableCell = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim();

const parsedCellsToMarkdown = (cells: unknown): string => {
  if (typeof cells === 'string') {
    try {
      const parsed = JSON.parse(cells);
      if (Array.isArray(parsed)) return parsedCellsToMarkdown(parsed);
      if (parsed && typeof parsed === 'object') return parsedCellsToMarkdown(parsed);
    } catch {
      return '';
    }
    return '';
  }

  const rows = new Map<number, Map<number, string>>();
  const input = Array.isArray(cells)
    ? cells
    : cells && typeof cells === 'object' && Array.isArray((cells as Record<string, unknown>).rows)
      ? (cells as { rows: unknown[] }).rows.flatMap((row, rowIndex) =>
          Array.isArray(row) ? row.map((cell, columnIndex) => ({ row_index: rowIndex, column_index: columnIndex, text: cell })) : []
        )
      : [];

  if (input.length && input.every(Array.isArray)) {
    input.forEach((row, rowIndex) => {
      (row as unknown[]).forEach((cell, columnIndex) => {
        const value = cell && typeof cell === 'object'
          ? (cell as Record<string, unknown>).text ?? (cell as Record<string, unknown>).value ?? ''
          : cell;
        if (!rows.has(rowIndex)) rows.set(rowIndex, new Map());
        rows.get(rowIndex)!.set(columnIndex, markdownTableCell(value));
      });
    });
  } else {
    input.forEach(cell => {
      if (!cell || typeof cell !== 'object') return;
      const item = cell as Record<string, unknown>;
      if (item.row_index === undefined && item.row === undefined) return;
      if (item.column_index === undefined && item.column === undefined) return;
      const rowValue = Number(item.row_index ?? item.row);
      const columnValue = Number(item.column_index ?? item.column);
      if (!Number.isFinite(rowValue) || !Number.isFinite(columnValue)) return;
      const rowIndex = Math.max(0, Math.trunc(rowValue));
      const columnIndex = Math.max(0, Math.trunc(columnValue));
      if (!rows.has(rowIndex)) rows.set(rowIndex, new Map());
      const value = item.text ?? item.value ?? item.content ?? '';
      rows.get(rowIndex)!.set(columnIndex, markdownTableCell(value));
    });
  }

  if (!rows.size) return '';
  const rowIndexes = Array.from(rows.keys()).sort((left, right) => left - right);
  const columnCount = Math.max(...Array.from(rows.values()).flatMap(row => Array.from(row.keys()))) + 1;
  if (!columnCount) return '';
  const renderRow = (rowIndex: number) =>
    `| ${Array.from({ length: columnCount }, (_, columnIndex) => rows.get(rowIndex)?.get(columnIndex) || '').join(' | ')} |`;
  const headerIndex = rowIndexes[0];
  const markdownRows = [renderRow(headerIndex), `| ${Array(columnCount).fill('---').join(' | ')} |`];
  rowIndexes.slice(1).forEach(rowIndex => markdownRows.push(renderRow(rowIndex)));
  return markdownRows.join('\n');
};

const parsedElementTable = (element: ParsedElement) =>
  parsedCellsToMarkdown(element.cells) ||
  parsedCellsToMarkdown(element.markdown) ||
  parsedCellsToMarkdown(element.text) ||
  parsedCellsToMarkdown(element.content);

const openParserValueToText = (value: string) => {
  if (!/<[a-z][^>]*>/i.test(value)) return value.trim();
  if (typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(value, 'text/html');
    return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

const parsedElementText = (element: ParsedElement) => {
  const table = parsedElementTable(element);
  if (table) return table;
  return openParserValueToText(element.markdown || element.text || element.content || '');
};

const parsedElementRole = (element: ParsedElement) => (element.role || element.kind || 'text').trim().toLowerCase().replace(/[\s-]+/g, '_');
const isPageNumberElement = (element: ParsedElement) => /^(page_number|folio)$/.test(parsedElementRole(element));
const isPageFooterElement = (element: ParsedElement) => /^(page_footer|running_footer)$/.test(parsedElementRole(element));
const isVisualElement = (element: ParsedElement) =>
  /figure|image|chart|table|diagram|picture|graphic|illustration|photo/i.test(`${element.kind || ''} ${element.role || ''}`);
const isUnhelpfulVisualPlaceholder = (element: ParsedElement, text: string) =>
  isVisualElement(element) && /^(?:\*\s*)?no\s+(?:text|content)\s+(?:was\s+)?recognized\s+in\s+this\s+region\.?\s*(?:\*)?$/i.test(text.trim());

const elementsForPage = (resp: PDFParseResponse | null, pageNumber: number): ParsedElement[] => {
  const page = resp?.pages?.find(item => item.number === pageNumber);
  if (!page) return [];
  const elementMap = new Map((resp?.elements || []).map(element => [element.id, element]));
  const orderedIds = page.reading_order?.length ? page.reading_order : page.element_ids || [];
  const orderedElements = orderedIds
    .map(id => elementMap.get(id))
    .filter((element): element is ParsedElement => Boolean(element));
  const orderedElementIds = new Set(orderedElements.map(element => element.id));
  const remainingElements = (resp?.elements || []).filter(element =>
    !orderedElementIds.has(element.id) && element.locations?.some(location => location.page_number === pageNumber)
  );
  return [...orderedElements, ...remainingElements];
};

const textForPage = (resp: PDFParseResponse | null, pageNumber: number) => {
  if (!resp?.pages?.some(item => item.number === pageNumber)) return '';
  return elementsForPage(resp, pageNumber).map(element => {
    if (isPageNumberElement(element) || isPageFooterElement(element)) return '';
    const text = parsedElementText(element).trim();
    if (!text || isUnhelpfulVisualPlaceholder(element, text)) return '';
    return parsedElementRole(element) === 'page_header' ? `## ${text}` : text;
  }).filter(Boolean).join('\n\n');
};

const normBounds = (resp: PDFParseResponse | null, element: ParsedElement, pageNumber: number): NormBox | null => {
  const location = element.locations?.find(item => item.bbox && item.page_number === pageNumber);
  const page = resp?.pages?.find(item => item.number === pageNumber);
  if (!location?.bbox || !page?.width || !page.height) return null;
  const { left, top, right, bottom } = location.bbox;
  return {
    x: left / page.width,
    y: top / page.height,
    width: (right - left) / page.width,
    height: (bottom - top) / page.height,
  };
};

const cropImage = (dataUrl: string, b: NormBox): Promise<string | null> =>
  new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const x = Math.max(0, Math.min(img.width - 1, Math.floor(b.x * img.width)));
      const y = Math.max(0, Math.min(img.height - 1, Math.floor(b.y * img.height)));
      const w = Math.max(1, Math.min(img.width - x, Math.ceil(b.width * img.width)));
      const h = Math.max(1, Math.min(img.height - y, Math.ceil(b.height * img.height)));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });

const extractFormattedContent = (range: Range): string => {
  const fragment = range.cloneContents();
  const spans = fragment.querySelectorAll('span');
  let formattedText = '';
  let lastY = 0;
  if (spans.length === 0) return range.toString();
  spans.forEach(span => {
    const style = window.getComputedStyle(span);
    const fontSize = parseFloat(style.fontSize);
    const text = span.textContent || '';
    const top = span.getBoundingClientRect().top;
    if (Math.abs(top - lastY) > 5 && lastY !== 0) formattedText += '\n';
    lastY = top;
    if (fontSize > 18) formattedText += `### ${text}`;
    else if (text.trim().startsWith('•') || text.trim().startsWith('●') || text.trim().startsWith('-')) {
      formattedText += `- ${text.replace(/^[•●-]\s*/, '')}`;
    } else formattedText += text;
  });
  if (formattedText.trim().length === 0) return range.toString();
  return formattedText;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pct = (b: NormBox) => ({ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const PARSING_STATES = ['queued', 'running', 'processing'];
const FAILED_STATES = ['failed', 'indeterminate', 'cancelled', 'canceled'];

const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#60a5fa',
  pink: '#f472b6',
  purple: '#a78bfa',
};

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */

const ParsedIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="M8.5 9V8h7v1M12 8v8M10.5 16h3" />
  </svg>
);

const IconButton: React.FC<{
  title: string;
  description?: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}> = ({ title, description, active, onClick, children }) => (
  <div className="group relative">
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      aria-pressed={active}
      className={`flex h-8 w-8 items-center justify-center rounded-md transition ${
        active ? 'bg-blue-50 text-blue-600' : 'text-neutral-600 hover:bg-neutral-100'
      }`}
    >
      {children}
    </button>
    <div className="pointer-events-none absolute right-0 top-full z-[70] mt-2 w-max max-w-[240px] rounded-lg bg-neutral-900 px-3 py-2 text-left text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-hover:delay-300">
      <div className="text-[13px] font-semibold leading-tight">{title}</div>
      {description && <div className="mt-0.5 text-[13px] leading-snug text-neutral-200">{description}</div>}
    </div>
  </div>
);

const PillButton: React.FC<{ title: string; active?: boolean; onClick?: () => void; children: React.ReactNode }> = ({ title, active, onClick, children }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${active ? 'bg-white/25' : 'hover:bg-white/15'}`}
  >
    {children}
  </button>
);

const Modal: React.FC<{ onClose: () => void; children: React.ReactNode; width?: number }> = ({ onClose, children, width = 400 }) =>
  createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30" onMouseDown={onClose}>
      <div
        onMouseDown={e => e.stopPropagation()}
        style={{ width }}
        className="max-w-[92vw] overflow-hidden rounded-xl bg-[#f7f7f7] shadow-2xl ring-1 ring-black/10"
      >
        {children}
      </div>
    </div>,
    document.body
  );

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

interface AdvancedKnowledgeExtractorProps {
  pdfUrl?: string;
  pdfFile?: File | unknown;
  onSelectionAdd?: (selection: Selection) => void | boolean | Promise<void | boolean>;
  parentNodeId?: string;
  canvasId?: string;
  accessToken?: string;
  onAddParsedContentToAI?: (
    title: string,
    content: string,
    imageData?: string,
    askImmediately?: boolean,
  ) => void;
  initialLocation?: {
    pageNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    boundingBoxNormalized?: boolean;
  } | null;
  /** Called when the user closes the reader (X button). */
  onClose?: () => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  /** Called after a rename from the "..." menu. */
  onRename?: (name: string) => void;
  /** Hooks for the app-level items in the "..." menu. */
  menuActions?: ReaderMenuActions;
  /** Answer a chat message inside the built-in AI panel. Return the assistant reply. */
  onChatSend?: (request: ChatRequest) => Promise<string>;
  /** Replace the built-in AI chat panel with your own. */
  renderChatPanel?: (api: {
    close: () => void;
    context: ChatContextItem[];
    clearContext: () => void;
    currentPage: number;
    documentName: string;
  }) => React.ReactNode;
}

const AdvancedKnowledgeExtractor: React.FC<AdvancedKnowledgeExtractorProps> = ({
  pdfUrl,
  pdfFile,
  onSelectionAdd,
  parentNodeId,
  canvasId,
  accessToken,
  onAddParsedContentToAI,
  initialLocation,
  onClose,
  onRename,
  menuActions,
  onChatSend,
  renderChatPanel,
}) => {
  /* ---------- document / viewport state ---------- */
  const [currentDocument, setCurrentDocument] = useState<PDFDoc | null>(null);
  const [title, setTitle] = useState('PDF Document');
  const [renaming, setRenaming] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [baseSize, setBaseSize] = useState({ w: 612, h: 792 });
  const [pageSizes, setPageSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [scaleMode, setScaleMode] = useState<'width' | 'custom'>('width');
  const [customScale, setCustomScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1, 2]));
  const [pageInput, setPageInput] = useState('1');
  const [pageEditing, setPageEditing] = useState(false);

  /* ---------- selection / highlight state ---------- */
  const [areaMode, setAreaMode] = useState(false);
  const [drag, setDrag] = useState<{ page: number; sx: number; sy: number; box: { x: number; y: number; w: number; h: number } | null } | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightsLoaded, setHighlightsLoaded] = useState(false);
  const [highlightLoadError, setHighlightLoadError] = useState('');
  const [highlightSaveError, setHighlightSaveError] = useState('');
  const [highlightSaveRetry, setHighlightSaveRetry] = useState(0);
  const [textToolbar, setTextToolbar] = useState<{
    x: number; y: number; pageNumber: number; content: string; rects: NormBox[]; bounds: NormBox;
  } | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState(false);

  /* ---------- parse state (unchanged semantics) ---------- */
  const [parseStatus, setParseStatus] = useState('idle');
  const [parseError, setParseError] = useState('');
  const [parseResponse, setParseResponse] = useState<PDFParseResponse | null>(null);
  const [selectedParsedElementId, setSelectedParsedElementId] = useState<string | null>(null);
  const [parseStartPage, setParseStartPage] = useState(1);
  const [parseEndPage, setParseEndPage] = useState(1);
  const [isLoadingParseRange, setIsLoadingParseRange] = useState(false);
  const [showParsed, setShowParsed] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const parseRequestGenerationRef = useRef(0);

  /* ---------- search ---------- */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchPages, setSearchPages] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);

  /* ---------- side panel / chat ---------- */
  const [panel, setPanel] = useState<'chat' | 'highlights' | null>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const [resizing, setResizing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContextItem[]>([]);

  /* ---------- menu / dialogs / toast ---------- */
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [copyDialog, setCopyDialog] = useState<{ open: boolean; start: number; end: number; busy: boolean; error: string }>({
    open: false, start: 1, end: 1, busy: false, error: '',
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState('');

  /* ---------- refs ---------- */
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const pdfProxyRef = useRef<PDFDocumentProxy | null>(null);
  const pageTextCache = useRef<Record<number, string>>({});
  const moreWrapRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const dragBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastAppliedInitialLocationRef = useRef<AdvancedKnowledgeExtractorProps['initialLocation']>(null);
  const highlightsLoadedRef = useRef(false);
  const highlightLoadGenerationRef = useRef(0);
  const highlightSnapshotRef = useRef<{ key: string; snapshot: string } | null>(null);
  const pendingHighlightsRef = useRef<Highlight[]>([]);
  const pendingHighlightDeletesRef = useRef<Set<string>>(new Set());
  const highlightSaveQueueRef = useRef<Promise<void>>(Promise.resolve());

  const resolvedPdfUrl = pdfUrl
    ? (/^(https?:|blob:|data:)/i.test(pdfUrl)
      ? pdfUrl
      : `${pythonUrl}${pdfUrl.startsWith('/') ? '' : '/'}${pdfUrl}`)
    : '';

  const fileName = typeof File !== 'undefined' && pdfFile instanceof File
    ? pdfFile.name
    : typeof pdfFile === 'string'
      ? pdfFile.split(/[\\/]/).pop()
      : Array.isArray(pdfFile) && pdfFile[0]?.name
        ? pdfFile[0].name
        : undefined;
  const highlightPersistenceKey = canvasId && parentNodeId ? `${canvasId}:${parentNodeId}:main` : '';

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  }, []);

  /* ---------- scale ---------- */
  const fitScale = containerWidth ? clamp((containerWidth - 48) / baseSize.w, 0.3, 3) : 1;
  const scale = scaleMode === 'width' ? fitScale : customScale;
  const pageBox = (n: number) => {
    const size = pageSizes[n] ?? baseSize;
    return { w: size.w * scale, h: size.h * scale };
  };
  const zoomBy = (factor: number) => {
    setCustomScale(clamp(scale * factor, 0.3, 4));
    setScaleMode('custom');
  };

  /* ------------------------------------------------------------------ */
  /* Effects                                                             */
  /* ------------------------------------------------------------------ */

  // Reset when the PDF changes
  useEffect(() => {
    parseRequestGenerationRef.current += 1;
    pageTextCache.current = {};
    highlightsLoadedRef.current = false;
    highlightSnapshotRef.current = null;
    pendingHighlightsRef.current = [];
    pendingHighlightDeletesRef.current.clear();
    setHighlightsLoaded(false);
    setHighlightLoadError('');
    setHighlightSaveError('');
    setHighlights([]);
    if (!resolvedPdfUrl) {
      setCurrentDocument(null);
      setCurrentPage(1);
      setNumPages(0);
      setActiveSelection(null);
      return;
    }
    setCurrentDocument(previous => previous?.url === resolvedPdfUrl ? previous : {
      id: `doc-${Date.now()}`,
      name: fileName || 'PDF Document',
      url: resolvedPdfUrl,
      numPages: 0,
      uploadedAt: new Date().toISOString(),
    });
    setTitle(fileName || 'PDF Document');
    setCurrentPage(1);
    setNumPages(0);
    setPageSizes({});
    setActiveSelection(null);
    setSelections([]);
    setTextToolbar(null);
    setParseStatus('idle');
    setParseError('');
    setParseResponse(null);
    setShowParsed(false);
    setSelectedParsedElementId(null);
    setParseStartPage(1);
    setParseEndPage(1);
    setSearchQuery('');
    setSearchPages([]);
  }, [resolvedPdfUrl, fileName, canvasId, parentNodeId]);

  // Parse range covers the whole document once we know the page count
  useEffect(() => {
    if (numPages > 0) {
      setParseStartPage(1);
      setParseEndPage(numPages);
      setCopyDialog(d => ({ ...d, start: 1, end: Math.min(numPages, Math.max(1, d.end)) }));
    }
  }, [numPages]);

  // Track container width (refits automatically when the side panel opens)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setContainerWidth(el.clientWidth));
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [currentDocument, collapsed]);

  // Lazy page rendering
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !numPages) return;
    const io = new IntersectionObserver(entries => {
      setVisiblePages(prev => {
        const next = new Set(prev);
        entries.forEach(entry => {
          const n = Number((entry.target as HTMLElement).dataset.pageNumber);
          if (entry.isIntersecting) next.add(n);
          else next.delete(n);
        });
        return next;
      });
    }, { root, rootMargin: '1200px 0px' });
    for (let i = 1; i <= numPages; i++) {
      const el = pageRefs.current[i];
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, [numPages, collapsed, currentDocument?.url]);

  useEffect(() => {
    if (!pageEditing) setPageInput(String(currentPage));
  }, [currentPage, pageEditing]);

  // Jump to an initial location
  useEffect(() => {
    if (!initialLocation) {
      lastAppliedInitialLocationRef.current = null;
      return;
    }
    if (!currentDocument || currentDocument.url !== resolvedPdfUrl || numPages === 0) return;
    if (lastAppliedInitialLocationRef.current === initialLocation) return;
    lastAppliedInitialLocationRef.current = initialLocation;
    requestAnimationFrame(() => goToPage(initialLocation.pageNumber));
    setActiveSelection({
      id: 'jump-highlight',
      type: 'mixed',
      content: '',
      pageNumber: initialLocation.pageNumber,
      boundingBox: initialLocation.boundingBox,
      boundingBoxNormalized: initialLocation.boundingBoxNormalized,
      timestamp: new Date().toISOString(),
      tags: [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocument, initialLocation, numPages, resolvedPdfUrl]);

  // Poll parse job
  const requestPDFParse = useCallback(async (
    method: 'GET' | 'POST',
    startPage: number,
    endPage: number,
    retry = false,
  ): Promise<PDFParseResponse> => {
    if (!canvasId || !parentNodeId) throw new Error('This PDF is not attached to a canvas node.');
    if (!accessToken) throw new Error('Sign in again to parse this PDF.');
    const params = new URLSearchParams({
      branch_id: 'main',
      start_page: String(startPage),
      end_page: String(endPage),
    });
    if (method === 'POST' && retry) params.set('retry', 'true');
    const response = await fetch(
      `${pythonUrl}/api/pdf/${encodeURIComponent(canvasId)}/${encodeURIComponent(parentNodeId)}/parse?${params.toString()}`,
      { method, headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = typeof payload?.detail === 'string'
        ? payload.detail
        : typeof payload?.error?.message === 'string'
          ? payload.error.message
          : 'Could not parse this PDF.';
      throw new Error(detail);
    }
    return payload as PDFParseResponse;
  }, [accessToken, canvasId, parentNodeId]);

  const requestPdfHighlights = useCallback(async (method: 'GET' | 'PUT', highlights?: Highlight[]) => {
    if (!canvasId || !parentNodeId || !accessToken) throw new Error('This PDF is not attached to a signed-in canvas.');
    const response = await fetch(
      `${pythonUrl}/api/pdf/${encodeURIComponent(canvasId)}/${encodeURIComponent(parentNodeId)}/highlights?branch_id=main`,
      {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(method === 'PUT' ? { body: JSON.stringify({ highlights: highlights || [] }) } : {}),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof payload?.detail === 'string' ? payload.detail : 'Could not save PDF highlights.');
    }
    return payload as { highlights?: Highlight[]; saved?: boolean; count?: number };
  }, [accessToken, canvasId, parentNodeId]);

  const loadPdfHighlights = useCallback(async () => {
    const generation = ++highlightLoadGenerationRef.current;
    highlightsLoadedRef.current = false;
    setHighlightsLoaded(false);
    setHighlightLoadError('');
    if (!canvasId || !parentNodeId || !accessToken) {
      highlightsLoadedRef.current = true;
      setHighlightsLoaded(true);
      return;
    }
    try {
      const payload = await requestPdfHighlights('GET');
      if (generation !== highlightLoadGenerationRef.current) return;
      const saved = Array.isArray(payload.highlights) ? payload.highlights : [];
      const restored = saved.filter(highlight => !pendingHighlightDeletesRef.current.has(highlight.id));
      const restoredIds = new Set(restored.map(highlight => highlight.id));
      const merged = [...restored, ...pendingHighlightsRef.current.filter(highlight => !restoredIds.has(highlight.id))];
      setHighlights(merged);
      pendingHighlightsRef.current = [];
      pendingHighlightDeletesRef.current.clear();
      highlightSnapshotRef.current = { key: highlightPersistenceKey, snapshot: JSON.stringify(saved) };
      highlightsLoadedRef.current = true;
      setHighlightsLoaded(true);
    } catch (error) {
      if (generation !== highlightLoadGenerationRef.current) return;
      setHighlightLoadError(error instanceof Error ? error.message : 'Could not load saved PDF highlights.');
      showToast('Could not load saved PDF highlights');
    }
  }, [accessToken, canvasId, highlightPersistenceKey, parentNodeId, requestPdfHighlights, showToast]);

  useEffect(() => {
    void loadPdfHighlights();
    return () => { highlightLoadGenerationRef.current += 1; };
  }, [loadPdfHighlights, resolvedPdfUrl]);

  useEffect(() => {
    if (!canvasId || !parentNodeId || !accessToken || !highlightsLoaded || !highlightsLoadedRef.current) return;
    const snapshot = JSON.stringify(highlights);
    if (highlightSnapshotRef.current?.key === highlightPersistenceKey && highlightSnapshotRef.current.snapshot === snapshot) return;

    let cancelled = false;
    const saveTask = highlightSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await requestPdfHighlights('PUT', highlights);
        if (highlightSnapshotRef.current?.key === highlightPersistenceKey) {
          highlightSnapshotRef.current = { key: highlightPersistenceKey, snapshot };
        }
      });
    highlightSaveQueueRef.current = saveTask;
    void saveTask.then(() => {
      if (!cancelled && highlightSnapshotRef.current?.key === highlightPersistenceKey) setHighlightSaveError('');
    }).catch(error => {
      if (cancelled || highlightSnapshotRef.current?.key !== highlightPersistenceKey) return;
      setHighlightSaveError(error instanceof Error ? error.message : 'Could not save PDF highlights.');
      showToast('Could not save PDF highlights');
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, canvasId, highlightPersistenceKey, highlights, highlightsLoaded, parentNodeId, highlightSaveRetry, requestPdfHighlights, showToast]);

  const loadParsedPageRange = useCallback(async () => {
    const startPage = Math.max(1, Math.min(parseStartPage, numPages || parseStartPage));
    const endPage = Math.max(startPage, Math.min(parseEndPage, numPages || parseEndPage));
    const generation = ++parseRequestGenerationRef.current;
    setIsLoadingParseRange(true);
    setParseError('');
    try {
      const result = await requestPDFParse('GET', startPage, endPage);
      if (generation !== parseRequestGenerationRef.current) return;
      setParseStatus(result.status);
      if (result.status === 'succeeded') {
        setParseResponse(result);
        setSelectedParsedElementId(null);
      } else if (FAILED_STATES.includes(result.status)) {
        setParseError(parseFailureText(result.error, 'The PDF parse job did not finish.'));
      }
    } catch (error) {
      if (generation !== parseRequestGenerationRef.current) return;
      setParseError(error instanceof Error ? error.message : 'Could not load parsed pages.');
    } finally {
      if (generation === parseRequestGenerationRef.current) setIsLoadingParseRange(false);
    }
  }, [numPages, parseEndPage, parseStartPage, requestPDFParse]);

  const startPdfParse = useCallback(async (retry = false) => {
    const generation = ++parseRequestGenerationRef.current;
    setParseError('');
    setParseResponse(null);
    setSelectedParsedElementId(null);
    try {
      const result = await requestPDFParse('POST', 1, Math.max(numPages, 1), retry);
      if (generation !== parseRequestGenerationRef.current) return;
      setParseStatus(result.status);
      if (result.status === 'succeeded') await loadParsedPageRange();
    } catch (error) {
      if (generation !== parseRequestGenerationRef.current) return;
      setParseStatus('failed');
      setParseError(error instanceof Error ? error.message : 'Could not start the PDF parse.');
    }
  }, [loadParsedPageRange, numPages, requestPDFParse]);

  useEffect(() => {
    if (!PARSING_STATES.includes(parseStatus)) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await requestPDFParse('GET', parseStartPage, Math.max(parseEndPage, parseStartPage));
        if (cancelled) return;
        setParseStatus(result.status);
        if (result.status === 'succeeded') {
          setParseResponse(result);
          setParseError('');
          return;
        }
        if (FAILED_STATES.includes(result.status)) {
          setParseError(parseFailureText(result.error, 'The PDF parse job did not finish.'));
          return;
        }
      } catch (error) {
        if (cancelled) return;
        setParseError(error instanceof Error ? error.message : 'Could not check PDF parse status.');
      }
      timer = setTimeout(poll, 1800);
    };
    timer = setTimeout(poll, 900);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [parseEndPage, parseStartPage, parseStatus, requestPDFParse]);

  // Restore a saved parse
  useEffect(() => {
    if (!resolvedPdfUrl || !canvasId || !parentNodeId || !accessToken) return;
    let cancelled = false;
    const generation = parseRequestGenerationRef.current;
    const restorePage = Math.max(1, initialLocation?.pageNumber || 1);
    requestPDFParse('GET', restorePage, restorePage).then(result => {
      if (cancelled || generation !== parseRequestGenerationRef.current) return;
      setParseStatus(result.status);
      if (result.status === 'succeeded') setParseResponse(result);
      else if (FAILED_STATES.includes(result.status)) {
        setParseError(parseFailureText(result.error, 'The saved PDF parse did not finish.'));
      }
    }).catch(error => {
      if (!cancelled && generation === parseRequestGenerationRef.current) {
        setParseError(error instanceof Error ? error.message : 'Could not restore the saved PDF parse.');
      }
    });
    return () => { cancelled = true; };
  }, [accessToken, canvasId, initialLocation?.pageNumber, parentNodeId, requestPDFParse, resolvedPdfUrl]);

  // Search across pages
  const goToPage = useCallback((n: number) => {
    const root = scrollRef.current;
    const target = clamp(n, 1, Math.max(numPages, 1));
    const el = pageRefs.current[target];
    setCurrentPage(target);
    if (root && el) root.scrollTo({ top: Math.max(0, el.offsetTop - 16), behavior: 'smooth' });
  }, [numPages]);

  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2 || !pdfProxyRef.current) {
      setSearchPages([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const pdf = pdfProxyRef.current;
      if (!pdf) return;
      const hits: number[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return;
        let text = pageTextCache.current[i];
        if (text === undefined) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text = content.items.map(item => ('str' in item ? item.str : '')).join(' ').toLowerCase();
          pageTextCache.current[i] = text;
        }
        if (text.includes(q)) hits.push(i);
      }
      if (cancelled) return;
      setSearchPages(hits);
      setSearchIndex(0);
      if (hits.length) goToPage(hits[0]);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, goToPage]);

  const stepSearch = (direction: 1 | -1) => {
    if (!searchPages.length) return;
    const next = (searchIndex + direction + searchPages.length) % searchPages.length;
    setSearchIndex(next);
    goToPage(searchPages[next]);
  };

  const textRenderer = useMemo(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return undefined;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return ({ str }: { str: string }) => {
      let out = '';
      let last = 0;
      for (const m of str.matchAll(re)) {
        const index = m.index ?? 0;
        out += escapeHtml(str.slice(last, index)) + `<mark>${escapeHtml(m[0])}</mark>`;
        last = index + m[0].length;
      }
      return out + escapeHtml(str.slice(last));
    };
  }, [searchQuery]);

  // Chat auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatBusy]);

  // Dismiss floating text toolbar on outside mousedown
  useEffect(() => {
    if (!textToolbar) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-hp-toolbar]')) setTextToolbar(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [textToolbar]);

  // Close menu / dialogs with Escape or outside click
  useEffect(() => {
    if (!menuPos && !copyDialog.open && !infoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setMenuPos(null);
      setCopyDialog(d => ({ ...d, open: false }));
      setInfoOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element)?.closest?.('[data-hp-menu]') && !moreWrapRef.current?.contains(e.target as Node)) setMenuPos(null);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [menuPos, copyDialog.open, infoOpen]);

  /* ------------------------------------------------------------------ */
  /* Rendering / cropping                                                */
  /* ------------------------------------------------------------------ */

  const onDocumentLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    pdfProxyRef.current = pdf;
    pageTextCache.current = {};
    setNumPages(pdf.numPages);
    setCurrentDocument(prev => prev ? { ...prev, numPages: pdf.numPages } : null);
    try {
      const first = await pdf.getPage(1);
      const viewport = first.getViewport({ scale: 1 });
      setBaseSize({ w: viewport.width, h: viewport.height });
    } catch { /* keep default size */ }
  }, []);

  const renderPageToImage = useCallback(async (pageNum: number): Promise<string | null> => {
    try {
      setIsRenderingPage(true);
      const pdf = pdfProxyRef.current ?? (currentDocument?.url ? await pdfjs.getDocument(currentDocument.url).promise : null);
      if (!pdf) return null;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error rendering page:', error);
      return null;
    } finally {
      setIsRenderingPage(false);
    }
  }, [currentDocument?.url]);

  const cropParsedElement = useCallback(async (
    element: ParsedElement,
    pageNumber: number,
    resp: PDFParseResponse | null = parseResponse,
  ): Promise<EmbeddedPdfImage | null> => {
    const bounds = normBounds(resp, element, pageNumber);
    if (!bounds) return null;
    const pageImage = await renderPageToImage(pageNumber);
    if (!pageImage) {
      setParseError(`Could not render the visual on page ${pageNumber}.`);
      return null;
    }
    const imageData = await cropImage(pageImage, bounds);
    if (!imageData) {
      setParseError(`Could not prepare the visual on page ${pageNumber}.`);
      return null;
    }
    return {
      id: `${pageNumber}-${element.id}`,
      imageData,
      alt: `${element.role || element.kind || 'Figure'} from PDF page ${pageNumber}`,
      pageNumber,
      boundingBox: bounds,
    };
  }, [parseResponse, renderPageToImage]);

  /* ------------------------------------------------------------------ */
  /* Canvas / AI actions                                                 */
  /* ------------------------------------------------------------------ */

  const addToKnowledge = useCallback((selection: Selection) => {
    if (onSelectionAdd) {
      onSelectionAdd(selection);
      setActiveSelection(null);
      return;
    }
    if (!currentDocument) return;
    setSelections(prev => [...prev, selection]);
    setActiveSelection(null);
  }, [onSelectionAdd, currentDocument]);

  const addChatContext = useCallback((
    contextTitle: string,
    content: string,
    imageData?: string,
    askImmediately = false,
  ) => {
    if (onAddParsedContentToAI) {
      if (content || imageData) onAddParsedContentToAI(contextTitle, content, imageData, askImmediately);
      return;
    }
    setChatContext(prev => [...prev, { id: `ctx-${Date.now()}-${prev.length}`, title: contextTitle, content, imageData }]);
    setPanel('chat');
  }, [onAddParsedContentToAI]);

  const addParsedElementToCanvas = useCallback(async (element: ParsedElement, cropRegion = false) => {
    if (!onSelectionAdd) return;
    const location = element.locations?.find(item => item.bbox && item.page_number === currentPage)
      || element.locations?.find(item => item.bbox && item.page_number > 0);
    if (!location) return;
    const elementText = parsedElementText(element);
    const role = element.role || element.kind || 'PDF content';
    if (!cropRegion) {
      if (!elementText || isUnhelpfulVisualPlaceholder(element, elementText)) return;
      await onSelectionAdd({
        id: `parsed-element-${element.id}-${Date.now()}`,
        type: 'text',
        content: `${role}: ${elementText || 'Recognized PDF content'}`,
        boundingBox: normBounds(parseResponse, element, location.page_number) || { x: 0, y: 0, width: 1, height: 1 },
        boundingBoxNormalized: true,
        pageNumber: location.page_number,
        timestamp: new Date().toISOString(),
        tags: ['openparser', role.toLowerCase()],
      });
      showToast('Added to canvas');
      return;
    }
    const image = await cropParsedElement(element, location.page_number);
    if (!image) return;
    await onSelectionAdd({
      id: `parsed-region-${element.id}-${Date.now()}`,
      type: 'image',
      content: `${role} · ${elementText || 'PDF figure'}\n\nOpenParser element ${element.id}`,
      imageData: image.imageData,
      boundingBox: image.boundingBox,
      boundingBoxNormalized: true,
      pageNumber: location.page_number,
      timestamp: new Date().toISOString(),
      tags: ['openparser', 'figure', role.toLowerCase()],
    });
    showToast('Image added to canvas');
  }, [cropParsedElement, currentPage, onSelectionAdd, parseResponse, showToast]);

  const addParsedPagesToCanvas = useCallback(async (pageNumbers: number[], resp: PDFParseResponse | null = parseResponse) => {
    if (!onSelectionAdd || !pageNumbers.length) return;
    const pages = pageNumbers
      .map(pageNumber => resp?.pages?.find(item => item.number === pageNumber))
      .filter((page): page is ParsedPage => Boolean(page))
      .sort((left, right) => left.number - right.number);
    if (!pages.length) return;

    const imageAssets: EmbeddedPdfImage[] = [];
    const contentBlocks: string[] = [];
    const seenPageHeaders = new Set<string>();
    for (const page of pages) {
      contentBlocks.push(`# Page ${page.number}`);
      const elements = elementsForPage(resp, page.number);
      if (!elements.length) {
        contentBlocks.push('_No content was recognized on this page._');
        continue;
      }
      for (const element of elements) {
        const role = parsedElementRole(element);
        if (isPageNumberElement(element) || isPageFooterElement(element)) continue;
        const isVisual = isVisualElement(element);
        const structuredTable = parsedElementTable(element);
        let rawText = (structuredTable || parsedElementText(element)).trim().replace(/</g, '&lt;').replace(/>/g, '&gt;');
        if (isUnhelpfulVisualPlaceholder(element, rawText)) rawText = '';
        if (role === 'page_header' && rawText) {
          const headerKey = rawText.toLowerCase();
          if (seenPageHeaders.has(headerKey)) rawText = '';
          else seenPageHeaders.add(headerKey);
        }
        if (/^(title|heading|section_header|page_header)$/.test(role) && rawText && !rawText.startsWith('#')) {
          rawText = `## ${rawText}`;
        }
        const block: string[] = [];
        if (rawText) block.push(rawText);
        if (isVisual && !(role.includes('table') && structuredTable)) {
          const image = await cropParsedElement(element, page.number, resp);
          if (image) {
            imageAssets.push(image);
            block.push(`[[PDF_IMAGE:${image.id}]]`);
          }
        }
        if (block.length) contentBlocks.push(block.join('\n\n'));
      }
    }

    const startPage = pages[0].number;
    const endPage = pages[pages.length - 1].number;
    await onSelectionAdd({
      id: `parsed-range-${startPage}-${endPage}-${Date.now()}`,
      type: 'text',
      content: contentBlocks.join('\n\n'),
      embeddedImages: imageAssets,
      pageRange: { startPage, endPage },
      boundingBox: { x: 0, y: 0, width: 1, height: 1 },
      boundingBoxNormalized: true,
      pageNumber: startPage,
      timestamp: new Date().toISOString(),
      tags: ['openparser', 'full-page', ...(endPage !== startPage ? ['page-range'] : [])],
    });
    showToast(startPage === endPage ? 'Page added to canvas' : 'Pages added to canvas');
  }, [cropParsedElement, onSelectionAdd, parseResponse, showToast]);

  const addParsedRangeToCanvas = useCallback(async () => {
    const pages = (parseResponse?.pages || [])
      .filter(page => page.number >= parseStartPage && page.number <= parseEndPage)
      .map(page => page.number)
      .sort((left, right) => left - right);
    await addParsedPagesToCanvas(pages);
  }, [addParsedPagesToCanvas, parseEndPage, parseResponse?.pages, parseStartPage]);

  const handleCopyParsedMarkdown = useCallback(async () => {
    const pageText = textForPage(parseResponse, currentPage);
    if (!pageText) return;
    try {
      await navigator.clipboard.writeText(pageText);
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(''), 1800);
    } catch {
      setParseError('Clipboard access is unavailable in this browser.');
    }
  }, [currentPage, parseResponse]);

  const handleAddParsedContentToAI = useCallback(() => {
    const content = (parseResponse?.pages || [])
      .map(page => {
        const text = textForPage(parseResponse, page.number);
        return text ? `# Page ${page.number}\n\n${text}` : '';
      })
      .filter(Boolean)
      .join('\n\n');
    if (!content) return;
    const pageRange = parseStartPage === parseEndPage ? `page ${parseStartPage}` : `pages ${parseStartPage}–${parseEndPage}`;
    addChatContext(`${currentDocument?.name || 'PDF'} · ${pageRange}`, content);
  }, [addChatContext, currentDocument?.name, parseEndPage, parseResponse, parseStartPage]);

  const handleToggleParsed = useCallback(async () => {
    if (showParsed) { setShowParsed(false); setSelectedParsedElementId(null); return; }
    setShowParsed(true);
    if (PARSING_STATES.includes(parseStatus)) return;
    if (parseStatus === 'succeeded') {
      if ((parseResponse?.pages?.length || 0) < numPages) await loadParsedPageRange();
      return;
    }
    await startPdfParse(FAILED_STATES.includes(parseStatus));
  }, [loadParsedPageRange, numPages, parseResponse?.pages?.length, parseStatus, showParsed, startPdfParse]);

  const copyRangeAsMarkdown = useCallback(async () => {
    const start = Math.min(copyDialog.start, copyDialog.end);
    const end = Math.max(copyDialog.start, copyDialog.end);
    setCopyDialog(d => ({ ...d, busy: true, error: '' }));
    try {
      const wanted = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      let resp = parseResponse;
      const hasAll = Boolean(resp) && wanted.every(n => resp!.pages?.some(p => p.number === n));
      if (!hasAll) {
        if (parseStatus !== 'succeeded') throw new Error('Parse this PDF first with the T button, then copy again.');
        resp = await requestPDFParse('GET', start, end);
        if (resp.status !== 'succeeded') throw new Error('The parse is not ready yet.');
      }
      const text = wanted
        .map(n => {
          const t = textForPage(resp!, n);
          return t ? `# Page ${n}\n\n${t}` : '';
        })
        .filter(Boolean)
        .join('\n\n');
      if (!text) throw new Error('No parsed text in this page range.');
      // Copy first, while the click still counts as a user gesture
      let copied = true;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        copied = false;
      }
      // Then put the whole range (all parsed text, tables and figure crops) into ONE canvas node
      if (onSelectionAdd) {
        await addParsedPagesToCanvas(wanted, resp);
      }
      setCopyDialog(d => ({ ...d, open: false, busy: false }));
      showToast(
        onSelectionAdd
          ? copied ? 'Copied and added to canvas as one note' : 'Added to canvas as one note'
          : 'Copied as Markdown'
      );
    } catch (error) {
      setCopyDialog(d => ({ ...d, busy: false, error: error instanceof Error ? error.message : 'Could not copy.' }));
    }
  }, [addParsedPagesToCanvas, copyDialog.end, copyDialog.start, onSelectionAdd, parseResponse, parseStatus, requestPDFParse, showToast]);

  /* ------------------------------------------------------------------ */
  /* Text selection + highlights                                         */
  /* ------------------------------------------------------------------ */

  const handleTextMouseUp = useCallback(() => {
    if (areaMode || showParsed) return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const startEl = range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
    const pageEl = startEl?.closest('[data-page-number]') as HTMLElement | null;
    if (!pageEl) return;
    const pageNumber = Number(pageEl.dataset.pageNumber);
    const box = pageEl.getBoundingClientRect();
    const content = extractFormattedContent(range).replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
    if (!content) return;
    const rects = Array.from(range.getClientRects())
      .filter(r => r.width > 1 && r.height > 1)
      .map(r => ({
        x: (r.left - box.left) / box.width,
        y: (r.top - box.top) / box.height,
        width: r.width / box.width,
        height: r.height / box.height,
      }));
    const rr = range.getBoundingClientRect();
    setTextToolbar({
      x: rr.left + rr.width / 2,
      y: rr.top,
      pageNumber,
      content,
      rects,
      bounds: { x: (rr.left - box.left) / box.width, y: (rr.top - box.top) / box.height, width: rr.width / box.width, height: rr.height / box.height },
    });
  }, [areaMode, showParsed]);

  const clearBrowserSelection = () => window.getSelection()?.removeAllRanges();

  const addHighlight = (color: HighlightColor) => {
    if (!textToolbar) return;
    const highlight: Highlight = {
      id: `hl-${Date.now()}`,
      pageNumber: textToolbar.pageNumber,
      color,
      rects: textToolbar.rects,
      content: textToolbar.content,
    };
    if (!highlightsLoadedRef.current && canvasId && parentNodeId && accessToken) {
      pendingHighlightsRef.current = [...pendingHighlightsRef.current, highlight];
    }
    setHighlights(prev => [...prev, highlight]);
    setTextToolbar(null);
    clearBrowserSelection();
  };

  const removeHighlight = (highlightId: string) => {
    pendingHighlightsRef.current = pendingHighlightsRef.current.filter(highlight => highlight.id !== highlightId);
    if (!highlightsLoadedRef.current && canvasId && parentNodeId && accessToken) {
      pendingHighlightDeletesRef.current.add(highlightId);
    }
    setHighlights(prev => prev.filter(highlight => highlight.id !== highlightId));
  };

  /* ------------------------------------------------------------------ */
  /* Area selection                                                      */
  /* ------------------------------------------------------------------ */

  const startDrag = (page: number, e: React.MouseEvent) => {
    const el = pageRefs.current[page];
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    setActiveSelection(null);
    dragBoxRef.current = null;
    setDrag({ page, sx: e.clientX - r.left, sy: e.clientY - r.top, box: null });
  };

  const dragPage = drag?.page ?? null;
  const finishAreaRef = useRef<(page: number, box: { x: number; y: number; w: number; h: number }) => void>(() => {});
  finishAreaRef.current = async (page, box) => {
    const el = pageRefs.current[page];
    if (!el) return;
    const nb: NormBox = { x: box.x / el.clientWidth, y: box.y / el.clientHeight, width: box.w / el.clientWidth, height: box.h / el.clientHeight };
    const pageImage = await renderPageToImage(page);
    const imageData = pageImage ? (await cropImage(pageImage, nb)) ?? undefined : undefined;
    setActiveSelection({
      id: `sel-${Date.now()}`,
      type: 'image',
      content: `image selection from page ${page}`,
      imageData,
      boundingBox: nb,
      boundingBoxNormalized: true,
      pageNumber: page,
      timestamp: new Date().toISOString(),
      tags: [],
    });
  };

  useEffect(() => {
    if (dragPage === null) return;
    const el = pageRefs.current[dragPage];
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = clamp(e.clientX - r.left, 0, r.width);
      const cy = clamp(e.clientY - r.top, 0, r.height);
      setDrag(d => {
        if (!d) return d;
        const box = { x: Math.min(d.sx, cx), y: Math.min(d.sy, cy), w: Math.abs(cx - d.sx), h: Math.abs(cy - d.sy) };
        dragBoxRef.current = box;
        return { ...d, box };
      });
    };
    const onUp = () => {
      const box = dragBoxRef.current;
      setDrag(null);
      dragBoxRef.current = null;
      if (box && box.w > 10 && box.h > 10) finishAreaRef.current(dragPage, box);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragPage]);

  /* ------------------------------------------------------------------ */
  /* Chat                                                                */
  /* ------------------------------------------------------------------ */

  const sendChat = async (override?: string) => {
    const message = (override ?? chatInput).trim();
    if (!message || chatBusy) return;
    const history = messages;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', text: message }]);
    setChatInput('');
    setChatBusy(true);
    try {
      const reply = onChatSend
        ? await onChatSend({ message, history, context: chatContext, documentName: title, currentPage })
        : 'The AI chat is not connected yet. Pass an onChatSend prop to answer here.';
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', text: reply }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Something went wrong. Try again.',
      }]);
    } finally {
      setChatBusy(false);
    }
  };

  const attachCurrentPage = () => {
    const text = textForPage(parseResponse, currentPage);
    if (!text) { showToast('Parse this PDF first (T button)'); return; }
    addChatContext(`${title} · page ${currentPage}`, `# Page ${currentPage}\n\n${text}`);
  };

  const startPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setResizing(true);
    const startX = e.clientX;
    const startWidth = panelWidth;
    const move = (ev: MouseEvent) => setPanelWidth(clamp(startWidth + (startX - ev.clientX), 280, 680));
    const up = () => {
      setResizing(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  /* ------------------------------------------------------------------ */
  /* Menu                                                                */
  /* ------------------------------------------------------------------ */

  const notAvailable = () => showToast('Not available here yet');
  const run = (fn?: () => void) => () => { setMenuPos(null); (fn ?? notAvailable)(); };

  type MenuEntry = { label: string; icon: React.ReactNode; shortcut?: string; onClick: () => void; divider?: boolean };
  const menuEntries: MenuEntry[] = [
    { label: 'Rename', icon: <Pencil size={18} />, onClick: run(() => setRenaming(true)) },
    { label: 'Copy content as Markdown', icon: <Copy size={18} />, onClick: run(() => setCopyDialog(d => ({ ...d, open: true, error: '', start: 1, end: Math.max(1, numPages) }))) },
    { label: 'Show info', icon: <Info size={18} />, shortcut: 'Option+Shift+I', divider: true, onClick: run(() => setInfoOpen(true)) },
    { label: 'View all highlights', icon: <Library size={18} />, onClick: run(() => setPanel('highlights')) },
    { label: 'Delete', icon: <Trash2 size={18} />, divider: true, onClick: run(menuActions?.delete) },
  ];

  const openMenu = () => {
    if (menuPos) { setMenuPos(null); return; }
    const rect = moreWrapRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
  };

  const commitRename = (value: string) => {
    const next = value.trim();
    setRenaming(false);
    if (next && next !== title) {
      setTitle(next);
      onRename?.(next);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Derived                                                             */
  /* ------------------------------------------------------------------ */

  const isParsing = PARSING_STATES.includes(parseStatus) || isLoadingParseRange;
  const hasParsedCurrent = Boolean(parseResponse?.pages?.some(p => p.number === currentPage));

  const parsedByPage = useMemo(() => {
    const map = new Map<number, ParsedElement[]>();
    (parseResponse?.elements || []).forEach(element => {
      element.locations?.forEach(location => {
        if (!location.bbox) return;
        const list = map.get(location.page_number) ?? [];
        if (!list.includes(element)) list.push(element);
        map.set(location.page_number, list);
      });
    });
    return map;
  }, [parseResponse?.elements]);

  const selectedElement = parseResponse?.elements?.find(element => element.id === selectedParsedElementId) || null;
  const selectedElementPage = selectedElement?.locations?.find(l => l.bbox)?.page_number;

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const renderPageOverlays = (n: number) => {
    const elements = showParsed ? parsedByPage.get(n) || [] : [];
    const jump = activeSelection && activeSelection.pageNumber === n ? activeSelection : null;
    const jumpBox: React.CSSProperties | null = jump
      ? jump.boundingBoxNormalized
        ? pct(jump.boundingBox)
        : { left: jump.boundingBox.x, top: jump.boundingBox.y, width: jump.boundingBox.width, height: jump.boundingBox.height }
      : null;

    return (
      <>
        {highlights.filter(h => h.pageNumber === n).flatMap(h =>
          h.rects.map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className="pointer-events-none absolute rounded-[2px]"
              style={{ ...pct(r), background: HIGHLIGHT_COLORS[h.color], opacity: 0.38, mixBlendMode: 'multiply' }}
            />
          ))
        )}

        {selections.filter(sel => sel.pageNumber === n).map(sel => (
          <div
            key={sel.id}
            className="pointer-events-none absolute rounded border-2 border-blue-400/70 bg-blue-400/5"
            style={sel.boundingBoxNormalized
              ? pct(sel.boundingBox)
              : { left: sel.boundingBox.x, top: sel.boundingBox.y, width: sel.boundingBox.width, height: sel.boundingBox.height }}
          />
        ))}

        {elements.map(element => {
          const bounds = normBounds(parseResponse, element, n);
          if (!bounds) return null;
          const visual = isVisualElement(element);
          const selected = selectedParsedElementId === element.id;
          const role = element.role || element.kind || 'Text';
          return (
            <button
              type="button"
              key={`parsed-${element.id}`}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => {
                e.stopPropagation();
                setSelectedParsedElementId(selected ? null : element.id);
              }}
              className={`group absolute z-20 rounded-[3px] border transition ${
                selected ? 'border-blue-500 bg-blue-500/15' : 'border-transparent hover:border-blue-400'
              } ${visual ? 'bg-amber-500/10' : 'bg-black/[0.045]'}`}
              style={{ ...pct(bounds), minWidth: 6, minHeight: 6 }}
              aria-label={`${role} on page ${n}`}
            >
              <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow group-hover:opacity-100">
                {role}
                {typeof element.confidence?.score === 'number' && ` · ${Math.round(element.confidence.score * 100)}%`}
              </span>
            </button>
          );
        })}

        {/* parsed element popover */}
        {selectedElement && selectedElementPage === n && (() => {
          const bounds = normBounds(parseResponse, selectedElement, n);
          if (!bounds) return null;
          const visual = isVisualElement(selectedElement);
          const text = parsedElementText(selectedElement);
          const hasText = Boolean(text.trim()) && !isUnhelpfulVisualPlaceholder(selectedElement, text);
          return (
            <div
              className="absolute z-40 w-[320px] rounded-xl border border-neutral-200 bg-white p-3 shadow-xl"
              style={{
                left: `clamp(8px, ${bounds.x * 100}%, calc(100% - 328px))`,
                top: `min(calc(${(bounds.y + bounds.height) * 100}% + 8px), calc(100% - 190px))`,
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => e.stopPropagation()}
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="truncate text-xs font-semibold text-neutral-800">
                  {selectedElement.role || selectedElement.kind || 'Recognized text'}
                  {typeof selectedElement.confidence?.score === 'number' && (
                    <span className="ml-2 font-normal text-neutral-400">{Math.round(selectedElement.confidence.score * 100)}%</span>
                  )}
                </div>
                <button type="button" onClick={() => setSelectedParsedElementId(null)} className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Close details">
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-28 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-700">
                {hasText ? text : visual ? 'Visual region. Save it as an image crop or include it with the selected pages.' : 'No readable text was found in this region.'}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {hasText && onSelectionAdd && (
                  <button type="button" onClick={() => void addParsedElementToCanvas(selectedElement)} className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-neutral-700">Add text</button>
                )}
                {visual && onSelectionAdd && (
                  <button type="button" onClick={() => void addParsedElementToCanvas(selectedElement, true)} className="rounded-md bg-amber-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-amber-700">Save image crop</button>
                )}
                {hasText && (
                  <button type="button" onClick={() => addChatContext(`${title} · page ${n}`, text, undefined, true)} className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50">Ask AI</button>
                )}
              </div>
            </div>
          );
        })()}

        {/* area drag preview */}
        {drag && drag.page === n && drag.box && (
          <div
            className="pointer-events-none absolute z-30 border-2 border-dashed border-blue-500 bg-blue-500/10"
            style={{ left: drag.box.x, top: drag.box.y, width: drag.box.w, height: drag.box.h }}
          />
        )}

        {/* active selection (jump target or area crop) */}
        {jump && jumpBox && (
          <div className="pointer-events-none absolute z-30" style={jumpBox}>
            <div className="absolute inset-0 rounded border-2 border-blue-500 bg-blue-400/20" />
            {jump.id !== 'jump-highlight' && (
              <div
                data-hp-toolbar
                className="pointer-events-auto absolute left-0 top-full mt-2 flex gap-1.5 rounded-lg border border-neutral-200 bg-white p-1.5 shadow-xl"
                onMouseDown={e => e.stopPropagation()}
              >
                <button type="button" onClick={() => addToKnowledge(jump)} className="flex items-center gap-1.5 rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-700">
                  <Bookmark size={13} />
                  {onSelectionAdd ? 'Add to canvas' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { addChatContext(`${title} · page ${n} (area)`, '', jump.imageData, true); setActiveSelection(null); }}
                  className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Sparkles size={13} />
                  Ask AI
                </button>
                <button type="button" onClick={() => setActiveSelection(null)} className="rounded-md px-2 py-1.5 text-xs font-medium text-neutral-500 hover:bg-neutral-100">Cancel</button>
              </div>
            )}
          </div>
        )}
      </>
    );
  };



  const highlightsPanelBody = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 px-4">
        <Library size={16} className="text-neutral-600" />
        <span className="text-sm font-semibold text-neutral-800">Highlights</span>
        <span className="text-xs text-neutral-400">{highlights.length}</span>
        <button type="button" onClick={() => setPanel(null)} className="ml-auto rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100" aria-label="Close highlights">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!highlightsLoaded ? (
          <div className="px-2 py-8 text-center text-xs leading-relaxed text-neutral-500">
            <p>{highlightLoadError || 'Loading saved highlights…'}</p>
            {highlightLoadError && (
              <>
                <p className="mt-2">You can keep highlighting. Retry to load and sync saved marks.</p>
                <button type="button" onClick={() => void loadPdfHighlights()} className="mt-2 rounded-md px-2.5 py-1 font-medium text-blue-600 hover:bg-blue-50">
                  Retry
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {highlightSaveError && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">
                <span className="min-w-0">{highlightSaveError}</span>
                <button type="button" onClick={() => { setHighlightSaveError(''); setHighlightSaveRetry(value => value + 1); }} className="shrink-0 font-medium underline">
                  Retry
                </button>
              </div>
            )}
            {highlights.length === 0 ? (
              <p className="px-2 py-8 text-center text-xs leading-relaxed text-neutral-500">
                No highlights yet. Select text in the PDF and pick a color.
              </p>
            ) : (
              <div className="space-y-2">
                {[...highlights].sort((a, b) => a.pageNumber - b.pageNumber).map(h => (
                  <div key={h.id} className="group flex gap-2.5 rounded-lg border border-neutral-200 p-2.5 hover:bg-neutral-50">
                    <span className="mt-0.5 w-1 shrink-0 rounded-full" style={{ background: HIGHLIGHT_COLORS[h.color] }} />
                    <button type="button" onClick={() => goToPage(h.pageNumber)} className="min-w-0 flex-1 text-left">
                      <p className="line-clamp-4 text-[13px] leading-snug text-neutral-800">{h.content}</p>
                      <p className="mt-1 text-[11px] text-neutral-400">Page {h.pageNumber}</p>
                    </button>
                    <button type="button" onClick={() => removeHighlight(h.id)} className="self-start rounded p-1 text-neutral-300 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 group-hover:opacity-100" aria-label="Delete highlight">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className={`hp-pdf flex h-full w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white text-neutral-800 ${areaMode || showParsed ? 'hp-nosel' : ''}`}>
      <style>{`
        .hp-pdf .react-pdf__Page { position: relative; }
        .hp-pdf .react-pdf__Page__canvas { display: block !important; user-select: none; }
        .hp-pdf .react-pdf__Page__textContent span { color: transparent !important; cursor: text; }
        .hp-pdf .react-pdf__Page__textContent ::selection { background: rgba(59,130,246,.3); }
        .hp-pdf .react-pdf__Page__textContent mark { background: rgba(250,204,21,.6); color: transparent; border-radius: 2px; }
        .hp-pdf.hp-nosel .react-pdf__Page__textContent { pointer-events: none; }
        .hp-scroll { scrollbar-width: thin; scrollbar-color: #d4d4d4 transparent; }
        .hp-scroll::-webkit-scrollbar { width: 10px; }
        .hp-scroll::-webkit-scrollbar-thumb { background: #d4d4d4; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
      `}</style>

      {/* ---------------- Header ---------------- */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-neutral-200 bg-white px-3">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown size={18} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <FileText size={18} className="shrink-0 text-neutral-800" />
        {renaming ? (
          <input
            autoFocus
            defaultValue={title}
            onBlur={e => commitRename(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitRename((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') setRenaming(false);
            }}
            className="min-w-0 flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-[15px] font-medium outline-none"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-800" onDoubleClick={() => setRenaming(true)}>{title}</span>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <IconButton
            title={showParsed ? 'Hide parsed content' : 'Show parsed content'}
            description="Turn this PDF into structured selectable text for AI chat"
            active={showParsed}
            onClick={() => void handleToggleParsed()}
          >
            {isParsing ? <Loader2 size={18} className="animate-spin" /> : <ParsedIcon />}
          </IconButton>

          <div ref={moreWrapRef}>
            <button
              type="button"
              onClick={openMenu}
              aria-label="More"
              className={`flex h-8 w-8 items-center justify-center rounded-md transition ${menuPos ? 'bg-neutral-100' : 'hover:bg-neutral-100'} text-neutral-600`}
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ---------------- Body ---------------- */}
      {!collapsed && (
        <div className="flex min-h-0 flex-1">
          <div className="relative min-w-0 flex-1">
            <div
              ref={scrollRef}
              onScroll={() => {
                const root = scrollRef.current;
                if (!root) return;
                const mid = root.getBoundingClientRect().top + root.clientHeight * 0.35;
                let best = 1;
                let bestDistance = Infinity;
                for (let i = 1; i <= numPages; i++) {
                  const el = pageRefs.current[i];
                  if (!el) continue;
                  const r = el.getBoundingClientRect();
                  if (r.top <= mid && r.bottom >= mid) { best = i; break; }
                  const d = Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
                  if (d < bestDistance) { bestDistance = d; best = i; }
                }
                setCurrentPage(best);
              }}
              onMouseUp={handleTextMouseUp}
              className={`hp-scroll absolute inset-0 overflow-auto bg-[#f5f5f4] ${areaMode ? 'select-none' : ''}`}
            >
              {currentDocument ? (
                <Document
                  file={currentDocument.url}
                  onLoadSuccess={onDocumentLoadSuccess}
                  loading={
                    <div className="flex items-center justify-center p-16 text-sm text-neutral-500">
                      <Loader2 size={18} className="mr-2 animate-spin" /> Loading PDF
                    </div>
                  }
                  error={
                    <div className="p-16 text-center">
                      <p className="text-sm font-medium text-red-500">Could not load this PDF</p>
                      <p className="mt-1 text-xs text-neutral-500">Try uploading it again.</p>
                    </div>
                  }
                >
                  <div className="flex flex-col items-center pb-24 pt-4">
                    {Array.from({ length: numPages }, (_, i) => i + 1).map(n => {
                      const box = pageBox(n);
                      return (
                        <div
                          key={n}
                          ref={el => { pageRefs.current[n] = el; }}
                          data-page-number={n}
                          className="relative mb-4 bg-white shadow-sm ring-1 ring-black/5"
                          style={{ width: box.w, height: box.h, cursor: areaMode ? 'crosshair' : undefined }}
                          onMouseDown={e => { if (areaMode && e.button === 0) startDrag(n, e); }}
                        >
                          {visiblePages.has(n) && (
                            <Page
                              pageNumber={n}
                              scale={scale}
                              renderTextLayer
                              renderAnnotationLayer
                              customTextRenderer={textRenderer}
                              onLoadSuccess={p => {
                                const w = (p as { originalWidth: number }).originalWidth;
                                const h = (p as { originalHeight: number }).originalHeight;
                                setPageSizes(prev => (prev[n]?.w === w && prev[n]?.h === h ? prev : { ...prev, [n]: { w, h } }));
                              }}
                              loading={<div style={{ width: box.w, height: box.h }} />}
                            />
                          )}
                          {renderPageOverlays(n)}
                        </div>
                      );
                    })}
                  </div>
                </Document>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="text-center">
                    <FileText size={48} className="mx-auto mb-3 text-neutral-300" />
                    <p className="text-sm font-medium text-neutral-600">No PDF loaded</p>
                  </div>
                </div>
              )}
            </div>

            {/* parsed actions bar */}
            {showParsed && (
              <div className="absolute left-1/2 top-3 z-30 flex max-w-[94%] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border border-neutral-200 bg-white/95 p-1 shadow-lg backdrop-blur">
                {isParsing && !hasParsedCurrent && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-600">
                    <Loader2 size={13} className="animate-spin" /> Parsing PDF
                  </span>
                )}
                {parseError && (
                  <span className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-600">
                    <span className="max-w-[240px] truncate" title={parseError}>{parseError}</span>
                    {FAILED_STATES.includes(parseStatus) && (
                      <button type="button" onClick={() => void startPdfParse(true)} className="rounded border border-red-200 px-1.5 py-0.5 font-medium hover:bg-red-50">Retry</button>
                    )}
                  </span>
                )}
                {hasParsedCurrent && (
                  <>
                    {onSelectionAdd && (
                      <button type="button" onClick={() => void addParsedPagesToCanvas([currentPage])} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">Add page to canvas</button>
                    )}
                    {onSelectionAdd && (parseResponse?.pages?.length || 0) > 1 && (
                      <button type="button" onClick={() => void addParsedRangeToCanvas()} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">Add all {parseResponse?.pages?.length} pages</button>
                    )}
                    <button type="button" onClick={() => void handleCopyParsedMarkdown()} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100">{copyStatus || 'Copy page'}</button>
                    <button type="button" onClick={handleAddParsedContentToAI} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50">Add all to AI</button>
                  </>
                )}
              </div>
            )}

            {isRenderingPage && (
              <div className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white shadow-lg">Processing image…</div>
            )}

            {toast && (
              <div className="absolute bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-3.5 py-2 text-[13px] text-white shadow-xl">{toast}</div>
            )}

            {/* floating bottom pill */}
            {currentDocument && numPages > 0 && (
              <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-0.5 rounded-xl bg-neutral-900/95 px-1.5 py-1 text-white shadow-2xl backdrop-blur">
                {searchOpen ? (
                  <div className="flex items-center gap-1 pl-1.5">
                    <Search size={15} className="text-neutral-400" />
                    <input
                      autoFocus
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') stepSearch(e.shiftKey ? -1 : 1);
                        if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery(''); }
                      }}
                      placeholder="Find in PDF"
                      className="w-40 bg-transparent px-1 text-sm text-white outline-none placeholder:text-neutral-500"
                    />
                    <span className="min-w-[44px] text-center text-xs text-neutral-400">
                      {searchQuery.trim().length < 2 ? '' : searchPages.length ? `${searchIndex + 1}/${searchPages.length}p` : 'None'}
                    </span>
                    <PillButton title="Previous match" onClick={() => stepSearch(-1)}><ChevronUp size={16} /></PillButton>
                    <PillButton title="Next match" onClick={() => stepSearch(1)}><ChevronDown size={16} /></PillButton>
                    <PillButton title="Close search" onClick={() => { setSearchOpen(false); setSearchQuery(''); }}><X size={16} /></PillButton>
                  </div>
                ) : (
                  <>
                    <PillButton title="Zoom in" onClick={() => zoomBy(1.15)}><ZoomIn size={17} /></PillButton>
                    <PillButton title="Zoom out" onClick={() => zoomBy(1 / 1.15)}><ZoomOut size={17} /></PillButton>
                    <PillButton title="Fit to width" active={scaleMode === 'width'} onClick={() => setScaleMode('width')}><MoveHorizontal size={17} /></PillButton>
                    <PillButton
                      title="Select area as image"
                      active={areaMode}
                      onClick={() => { setAreaMode(m => !m); setTextToolbar(null); setActiveSelection(null); }}
                    >
                      <Crop size={17} />
                    </PillButton>
                    <span className="mx-1 h-5 w-px bg-white/20" />
                    <div className="flex items-center gap-1 px-1.5 text-sm tabular-nums">
                      <input
                        value={pageInput}
                        onFocus={() => setPageEditing(true)}
                        onChange={e => setPageInput(e.target.value.replace(/\D/g, ''))}
                        onBlur={() => setPageEditing(false)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const n = parseInt(pageInput, 10);
                            if (Number.isFinite(n)) goToPage(n);
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                        className="w-8 rounded bg-white/10 py-0.5 text-center text-sm outline-none focus:bg-white/20"
                        aria-label="Current page"
                      />
                      <span className="text-neutral-400">/ {numPages}</span>
                    </div>
                    <span className="mx-1 h-5 w-px bg-white/20" />
                    <PillButton title="Find in PDF" onClick={() => setSearchOpen(true)}><Search size={17} /></PillButton>
                  </>
                )}
              </div>
            )}
          </div>

          {/* side panel (chat / highlights) */}
          <div
            className="relative shrink-0 overflow-hidden bg-white"
            style={{ width: panel ? panelWidth : 0, transition: resizing ? 'none' : 'width 220ms cubic-bezier(.2,.8,.2,1)' }}
          >
            {panel && (
              <>
                <div
                  onMouseDown={startPanelResize}
                  className="absolute inset-y-0 left-0 z-10 w-1 cursor-col-resize hover:bg-blue-400/40"
                  aria-hidden
                />
                <div className="h-full border-l border-neutral-200" style={{ width: panelWidth }}>
                  {highlightsPanelBody}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ---------------- Floating text selection toolbar ---------------- */}
      {textToolbar && createPortal(
        <div
          data-hp-toolbar
          onMouseDown={e => e.preventDefault()}
          className="fixed z-[90] flex items-center gap-1 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl"
          style={{
            left: clamp(textToolbar.x, 150, window.innerWidth - 150),
            top: textToolbar.y > 70 ? textToolbar.y - 10 : textToolbar.y + 40,
            transform: textToolbar.y > 70 ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
        >
          {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map(color => (
            <button
              key={color}
              type="button"
              onClick={() => addHighlight(color)}
              title={`Highlight ${color}`}
              className="h-5 w-5 rounded-full ring-1 ring-black/10 transition hover:scale-110"
              style={{ background: HIGHLIGHT_COLORS[color] }}
              aria-label={`Highlight ${color}`}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-neutral-200" />
          <button
            type="button"
            title="Add to canvas"
            onClick={() => {
              addToKnowledge({
                id: `sel-${Date.now()}`,
                type: 'text',
                content: textToolbar.content,
                boundingBox: textToolbar.bounds,
                boundingBoxNormalized: true,
                pageNumber: textToolbar.pageNumber,
                timestamp: new Date().toISOString(),
                tags: [],
              });
              setTextToolbar(null);
              clearBrowserSelection();
            }}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            <Bookmark size={16} />
          </button>
          <button
            type="button"
            title="Ask AI"
            onClick={() => {
              addChatContext(`${title} · page ${textToolbar.pageNumber}`, textToolbar.content, undefined, true);
              setTextToolbar(null);
              clearBrowserSelection();
            }}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            <Sparkles size={16} />
          </button>
          <button
            type="button"
            title="Copy"
            onClick={() => {
              void navigator.clipboard.writeText(textToolbar.content);
              showToast('Copied');
              setTextToolbar(null);
              clearBrowserSelection();
            }}
            className="rounded-md p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            <Copy size={16} />
          </button>
        </div>,
        document.body
      )}

      {/* ---------------- "..." menu ---------------- */}
      {menuPos && createPortal(
        <div
          data-hp-menu
          className="fixed z-[95] w-[300px] overflow-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-2xl"
          style={{ top: menuPos.top, right: menuPos.right, maxHeight: `calc(100vh - ${menuPos.top + 12}px)` }}
        >
          {menuEntries.map(entry => (
            <React.Fragment key={entry.label}>
              {entry.divider && <div className="my-1.5 h-px bg-neutral-200" />}
              <button
                type="button"
                onClick={entry.onClick}
                className="mx-1.5 flex h-10 w-[calc(100%-12px)] items-center gap-3 rounded-lg px-3 text-left text-[15px] text-neutral-800 hover:bg-neutral-100"
              >
                <span className="flex w-5 shrink-0 justify-center text-neutral-700">{entry.icon}</span>
                <span className="flex-1 truncate">{entry.label}</span>
                {entry.shortcut && <span className="text-[13px] text-neutral-400">{entry.shortcut}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>,
        document.body
      )}

      {/* ---------------- Copy as Markdown dialog ---------------- */}
      {copyDialog.open && (
        <Modal onClose={() => setCopyDialog(d => ({ ...d, open: false }))}>
          <div className="px-6 pb-2 pt-6">
            <h3 className="text-[15px] font-semibold text-neutral-900">Copy PDF as Markdown</h3>
            {(['start', 'end'] as const).map((key, index) => (
              <React.Fragment key={key}>
                {index === 1 && <div className="h-px bg-neutral-200" />}
                <div className="flex items-center justify-between py-3.5">
                  <span className="text-[15px] text-neutral-600">{key === 'start' ? 'Start page' : 'End page'}</span>
                  <select
                    value={copyDialog[key]}
                    onChange={e => setCopyDialog(d => ({ ...d, [key]: Number(e.target.value) }))}
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-700 outline-none focus:border-blue-400"
                  >
                    {Array.from({ length: Math.max(numPages, 1) }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
              </React.Fragment>
            ))}
            {copyDialog.error && <p className="pb-2 text-xs text-red-600">{copyDialog.error}</p>}
          </div>
          <div className="flex justify-end border-t border-neutral-200 bg-[#ececec] px-6 py-3.5">
            <button
              type="button"
              onClick={() => void copyRangeAsMarkdown()}
              disabled={copyDialog.busy}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white/70 px-4 py-1.5 text-[15px] font-medium text-blue-600 hover:bg-white disabled:opacity-60"
            >
              {copyDialog.busy && <Loader2 size={14} className="animate-spin" />}
              Copy content
            </button>
          </div>
        </Modal>
      )}

      {/* ---------------- Info dialog ---------------- */}
      {infoOpen && (
        <Modal onClose={() => setInfoOpen(false)}>
          <div className="px-6 py-6">
            <h3 className="mb-3 text-[15px] font-semibold text-neutral-900">PDF info</h3>
            {[
              ['Name', title],
              ['Pages', numPages ? String(numPages) : '-'],
              ['Opened', currentDocument ? new Date(currentDocument.uploadedAt).toLocaleString() : '-'],
              ['Parsed', parseStatus === 'succeeded' ? 'Yes' : isParsing ? 'In progress' : 'No'],
              ['Highlights', String(highlights.length)],
            ].map(([label, value], index) => (
              <div key={label} className={`flex items-center justify-between py-2.5 text-sm ${index ? 'border-t border-neutral-200' : ''}`}>
                <span className="text-neutral-500">{label}</span>
                <span className="max-w-[220px] truncate text-neutral-800">{value}</span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdvancedKnowledgeExtractor;
