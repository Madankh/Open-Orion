import React, { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect } from 'react';
import { NodeData, InfiniteCanvasProps, DragState, Position, ColorTheme, Connection, ConnectionStyle, ConnectionArrow, GlobalNote, RootState,Card } from '@/typings/agent';
import { COLORS, INITIAL_GLOBAL_NOTES } from '../NoteBlocks/CreativeCanvasHelper/components/constants';
import { NodeCard } from './components/NodeCard';
import type { NodeOperationStatus } from './components/NodeOperationOverlay';
import dynamic from 'next/dynamic';
import { GroupContainer } from './components/GroupContainer';
import { ConnectionLayer } from './components/ConnectionLayer';
import Minimap from "../NoteBlocks/CreativeCanvasHelper/components/minimap"
import { useCollab } from "../Y_realtime/Yjs";
import { NotesSidebar } from './components/NotesSidebar';
import { Plus, Minus, Move, StickyNote, LayoutGrid, X, Trash2, ArrowRight, Minus as MinusIcon, MoveHorizontal, LocateFixed, Undo2, Redo2, BookOpen, Sparkles, Loader2, FileText, Layers, CornerDownRight, ArrowUp, MessageSquareText, Paintbrush, AtomIcon } from 'lucide-react';
import { EditorSidebar, NoteLinkTarget, WhiteboardEditorSidebar } from '../NoteBlocks/CreativeCanvasHelper/components/editing';
import SessionNoteEditor from '../NoteBlocks/CreativeCanvasHelper/components/editRef';
import { useConnectionVirtualization, useCanvasTransform, useNodeMap, snapToGrid } from '../NoteBlocks/CreativeCanvasHelper/components/vertulization';
import { useWebSocketHandlers } from './CreativeCanvasHelper/hooks/useWebSocketHandlers';
import AICollaborate from './AICollaborate';
import { useSelector } from 'react-redux';
import { toast } from 'sonner';
import { marked } from 'marked';
import { pythonUrl,nodeUrl } from "../../apiurl"
import { useCards, normalizeCard } from './CreativeCanvasHelper/hooks/useCards';
import { CardMetaPanel } from './CreativeCanvasHelper/components/CardMetaPanel';
import { CardSearchPalette } from './CreativeCanvasHelper/components//CardSearchPalette';
import { TagFilterBar } from './CreativeCanvasHelper/components/TagFilterBar';

import {
    collectSmartNodeContext,
    getConnectedNodesWithMedia,
    buildLiveCanvasChatContext,
    cleanUrlPath,
    buildCanvasQueryPayload,
} from '../NoteBlocks/CreativeCanvasHelper/components/ContextHelpers';
import APIcontainer from "../APIcontainer"
import {
    SNAP_GRID, GROUP_PADDING, findParentPDF,
    readFileAsBase64, extractYoutubeId, apiService, getNodeCenter, GROUP_HEADER_HEIGHT,
    getGroupBounds, API_BASE_URL, isGroupNode, restoreInlineImageSources
} from '../NoteBlocks/CreativeCanvasHelper/components/CanvasHelpers';

const AdvancedKnowledgeExtractor = dynamic(
    () => import('./Pdfreader'),
    {
        ssr: false,
        loading: () => <div className="flex items-center justify-center p-4">Loading PDF viewer...</div>
    }
);

interface CanvasModelOption {
    id: string;
    name: string;
    provider: string;
    description?: string;
}


const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({
    sessionId,
    socket,
    workspaceInfoFromHome,
    projectInfo,
    projectContext,
    isConnected,
    userinfo,
    onNavigateBoard,
    onExploreInDepth,
    onAgentModeChange,
    currentAgentMode,
    currentAgentType,
    onApplyNote,
    selectedModel,
    focusRequest,
    
    onModelChange
}) => {

    const CUSTOM_API_MODELS: CanvasModelOption[] = [
        {id: "z-ai/glm-4.7", name: "Z-ai", provider: "z-ai/glm-4.7", description: "z-ai/glm-4.7" },
        {id:"google/gemini-3-pro-preview",name: "Google", provider: "google/gemini-3-pro-preview", description: "google/gemini-3-pro-preview" },
        {id: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen", provider: "qwen/qwen3-vl-30b-a3b-instruct", description: "Token efficient model" },
        {id:"openai/gpt-5.2",name: "openai", provider: "openai/gpt-5.2", description: "openai/gpt-5.2" },
        {id:"anthropic/claude-sonnet-4.5",name: "Anthropic", provider: "anthropic/claude-sonnet-4.5", description: "anthropic/claude-sonnet-4.5" },
        {id: "z-ai/glm-4.6", name: "z-ai/glm-4.6", provider: "Z-ai", description: "Best at tool use but cost more token" },
        {id: "mistralai/ministral-14b-2512", name: "Mistralai", provider: "mistralai/ministral-14b-2512", description: "Token efficient model" },
        {id: "z-ai/glm-4.6v", name: "Z-ai", provider: "z-ai/glm-4.6v", description: "Token efficient model" },
        {id: "deepseek/deepseek-v3.2-speciale", name: "Deepseek", provider: "deepseek/deepseek-v3.2-speciale", description: "" },
        {id: "google/gemini-2.5-flash-lite", name: "google", provider: "google/gemini-2.5-flash-lite", description: "Token efficient model" },
    ];

    const BASIC_MODELS: CanvasModelOption[] = [
        {id: "z-ai/glm-4.5-air:free", name: "Z-ai", provider: "z-ai/glm-4.5-air:free", description: "z-ai/glm-4.5-air:free" },
        { id: "z-ai/glm-4.7", name: "Z-ai", provider: "z-ai/glm-4.7", description: "z-ai/glm-4.7" },
        { id: "z-ai/glm-4.6", name: "z-ai/glm-4.6", provider: "Z-ai", description: "Best at tool use but cost more token" },
        { id: "mistralai/ministral-14b-2512", name: "Mistralai", provider: "mistralai/ministral-14b-2512", description: "Token efficient model" },
        { id: "z-ai/glm-4.6v", name: "Z-ai", provider: "z-ai/glm-4.6v", description: "Token efficient model" },
        { id: "deepseek/deepseek-v3.2-speciale", name: "Deepseek", provider: "deepseek/deepseek-v3.2-speciale", description: "" },
        { id: "google/gemini-2.5-flash-lite", name: "google", provider: "google/gemini-2.5-flash-lite", description: "Token efficient model" },
        { id: "qwen/qwen3-vl-30b-a3b-instruct", name: "Qwen", provider: "qwen/qwen3-vl-30b-a3b-instruct", description: "Token efficient model" },
    ];

    const user = useSelector((state: RootState) => state.user);
    const accessToken = user?.accessToken;
    const collab = useCollab();
    const pdfarray = [{ name: "Reader mode" }];
    const unsavedPositionsRef = useRef<Map<string, { x: number, y: number, width?: number, height?: number }>>(new Map());
    const [isSaving, setIsSaving] = useState(false);
    const [pdfJumpLocation, setPdfJumpLocation] = useState<{ pageNumber: number, boundingBox: any, boundingBoxNormalized?: boolean } | null>(null);
    const [loadingRefIds, setLoadingRefIds] = useState<Set<string>>(new Set());
    const [localNodes, setLocalNodes] = useState<NodeData[]>([]);
    const [localConnections, setLocalConnections] = useState<Connection[]>([]);
    const [localGlobalNotes, setLocalGlobalNotes] = useState<GlobalNote[]>(INITIAL_GLOBAL_NOTES);
    const [socketReady, setSocketReady] = useState(false);
    const [Profile, setProfile] = useState('');
    const [username, setusername] = useState('Me');
    const [UserPlanID, setUserPlanID] = useState<string | null>(null);

    const isCollaborativeMode = useMemo(() => {
        return projectInfo?.type === 'group';
    }, [projectInfo?.type]);




    const [projectNotes, setProjectNotes] = useState<any[]>([]);
    const handleResetView = useCallback(() => {
        // Reset to default
        setViewport({ x: 0, y: 0 });
        setScale(0.8);
    }, []);

    const saveUnsavedPositions = useCallback(async () => {
        if (unsavedPositionsRef.current.size === 0 || !accessToken) return;

        setIsSaving(true);

        // Convert Map to array for the API
        const updates = Array.from(unsavedPositionsRef.current.entries()).map(([id, data]) => ({
            node_id: id,
            position_x: data.x,
            position_y: data.y,
            ...(data.width && { width: data.width }),
            ...(data.height && { height: data.height })
        }));

        // Clear the map immediately so new changes can pile up while we save
        unsavedPositionsRef.current.clear();

        try {
            await fetch(`${API_BASE_URL}/nodes/${sessionId}/batch-update?branch_id=main`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ updates })
            });
            console.log(`✅ Saved ${updates.length} node positions`);
        } catch (error) {
            console.error('❌ Failed to auto-save positions:', error);
        } finally {
            setIsSaving(false);
        }
    }, [sessionId, accessToken, API_BASE_URL]);

    const [windowSize, setWindowSize] = useState({ w: 1000, h: 800 });

    useEffect(() => {
        setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        const handleResize = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const autoSaveInterval = setInterval(() => {
            if (unsavedPositionsRef.current.size > 0) {
                saveUnsavedPositions();
            }
        }, 15000);

        return () => clearInterval(autoSaveInterval);
    }, [saveUnsavedPositions]);

    const nodes = useMemo(() => {
        if (isCollaborativeMode) {
            return Array.from(collab.canvasNodes.values());
        }
        return localNodes;
    }, [isCollaborativeMode, collab.canvasNodes, localNodes]);

    // Unified connections
    const connections = useMemo(() => {
        if (isCollaborativeMode) {
            return collab.canvasConnections;
        }
        return localConnections;
    }, [isCollaborativeMode, collab.canvasConnections, localConnections]);

    // Unified global notes
    const globalNotes = useMemo(() => {
        if (isCollaborativeMode) {
            return Array.from(collab.canvasGlobalNotes?.values());
        }
        return localGlobalNotes;
    }, [isCollaborativeMode, collab.canvasGlobalNotes, localGlobalNotes]);

    // Create refs for WebSocket handlers
    const nodesRef = useRef(nodes);
    useLayoutEffect(() => { nodesRef.current = nodes; }, [nodes]);

    const connectionsRef = useRef(connections);
    useLayoutEffect(() => { connectionsRef.current = connections; }, [connections]);

    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
    const [nodeOperations, setNodeOperations] = useState<Record<string, NodeOperationStatus>>({});
    const activeNodeOperationsRef = useRef(new Set<string>());
    const beginNodeOperation = useCallback((nodeId: string, status: NodeOperationStatus) => {
        if (activeNodeOperationsRef.current.has(nodeId)) return false;
        activeNodeOperationsRef.current.add(nodeId);
        setNodeOperations(current => ({ ...current, [nodeId]: status }));
        return true;
    }, []);
    const finishNodeOperation = useCallback((nodeId: string) => {
        activeNodeOperationsRef.current.delete(nodeId);
        setNodeOperations(current => {
            if (!current[nodeId]) return current;
            const next = { ...current };
            delete next[nodeId];
            return next;
        });
    }, []);
    const [activePDFNode, setActivePDFNode] = useState<string | null>(null);
    const [pdfReaderVisible, setPDFReaderVisible] = useState(false);
    const [isPDFReaderExpanded, setIsPDFReaderExpanded] = useState(false);
    const [scale, setScale] = useState(0.80);
    const [viewport, setViewport] = useState({ x: 0, y: 0 });
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isCompleted, setIsCompleted] = useState(false);
    const [isWorkspaceChatOpen, setIsWorkspaceChatOpen] = useState(false);
    const [workspaceChatWidth, setWorkspaceChatWidth] = useState(0);
    const [workspaceEditorWidth, setWorkspaceEditorWidth] = useState(700);
    const dockResizeCleanupRef = useRef<(() => void) | null>(null);
    const [workspaceChatAnchorId, setWorkspaceChatAnchorId] = useState<string | null>(null);
    const [workspaceChatContextSentOnOpen, setWorkspaceChatContextSentOnOpen] = useState(false);
    const [workspaceReaderContext, setWorkspaceReaderContext] = useState<{
        title: string;
        content: string;
        imageData?: string;
        askImmediately?: boolean;
        requestId?: string;
    } | null>(null);

    const nodeSaveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const connectionSaveTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const pdfSelectionPlacementRef = useRef<{ nodeId: string | null; nextIndex: number }>({ nodeId: null, nextIndex: 0 });

    // Inside InfiniteCanvas component, near your other useRefs:
    const viewportRef = useRef(viewport);
    const scaleRef = useRef(scale);

    // Keep refs synced with state
    useEffect(() => {
        viewportRef.current = viewport;
        scaleRef.current = scale;
        nodesRef.current = nodes;
        connectionsRef.current = connections;
    }, [viewport, scale, nodes, connections]);

    const containerRef = useRef<HTMLDivElement>(null);
    const getDockedEditorWidth = useCallback((containerWidth: number, chatWidth: number) => {
        const availableWidth = Math.max(0, containerWidth - chatWidth);
        if (!pdfReaderVisible) return Math.min(workspaceEditorWidth, availableWidth);

        const minimumEditorWidth = Math.min(360, availableWidth);
        const preferredReaderWidth = containerWidth * (isPDFReaderExpanded ? 0.7 : 0.4);
        const editorWidthForPreferredReader = availableWidth - preferredReaderWidth;
        return Math.min(
            workspaceEditorWidth,
            Math.max(minimumEditorWidth, editorWidthForPreferredReader),
        );
    }, [isPDFReaderExpanded, pdfReaderVisible, workspaceEditorWidth]);
    const openNodeEditor = useCallback((nodeId: string) => {
        const bounds = containerRef.current?.getBoundingClientRect();
        if (isWorkspaceChatOpen && bounds) {
            setWorkspaceEditorWidth(getDockedEditorWidth(bounds.width, workspaceChatWidth));
        }
        setEditingNodeId(nodeId);
    }, [getDockedEditorWidth, isWorkspaceChatOpen, workspaceChatWidth]);
    const animRef = useRef<number>();
    const {
      cards, upsertCards, removeCard, patchCard, updateTags, loadCards,
      suggestTags, search, searchTags, getLinks, getBoards, addLink, removeLink, linksVersion,
    } = useCards({ accessToken, apiBase: API_BASE_URL, nodes });

    const [tagFilter, setTagFilter] = useState<string[]>([]);
    const [paletteMode, setPaletteMode] = useState<null | 'add' | 'link'>(null);

    // const [cards, setCards] = useState<Record<string, Card>>({});

    const [highlightId, setHighlightId] = useState<string | null>(null);
    
    // Connection Mode State
    const [connectingNodeId, setConnectingNodeId] = useState<string | null>(null);
    const [mousePos, setMousePos] = useState<Position>({ x: 0, y: 0 });

    // AI State
    const [aiPrompt, setAiPrompt] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);
    // const aiInputRef = useRef<HTMLTextAreaElement>(null);
    // const screenToCanvas = useScreenToCanvas(viewport, scale);
    // const canvasToScreen = useCanvasToScreen(viewport, scale);

    // History State
    const [history, setHistory] = useState<{ nodes: NodeData[], connections: Connection[], globalNotes: GlobalNote[] }[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Drag State
    const [dragState, setDragState] = useState<DragState & { startViewport?: { x: number, y: number } }>({
        isDragging: false,
        type: null,
        id: null,
        startX: 0,
        startY: 0,
        initialPositions: {},
    });

    const { streamingState } = useWebSocketHandlers({
        socket,
        enabled: !isWorkspaceChatOpen,
        nodesRef,
        connectionsRef,
        canvas: {
            zoom: scale,
            pan: viewport,
            isDragging: dragState.isDragging,
            dragStart: { x: dragState.startX, y: dragState.startY },
            selectedNodeId: selectedId
        },
        setIsLoading: setIsAiLoading,
        setIsCompleted,
        isCollaborativeMode,
        collab,
        setLocalNodes,
        setLocalConnections
    });

    const updateNodes = useCallback((updater: (prev: NodeData[]) => NodeData[]) => {
        if (isCollaborativeMode) {
            const currentNodes = Array.from(collab.canvasNodes.values());
            const updated = updater(currentNodes);

            // ✅ Find which nodes were deleted
            const currentIds = new Set(currentNodes.map(n => n.id));
            const updatedIds = new Set(updated.map(n => n.id));

            // ✅ Delete removed nodes from Y.js
            for (const node of currentNodes) {
                if (!updatedIds.has(node.id)) {
                    collab.deleteYCanvasNode(node.id);
                }
            }

            // ✅ Add/update remaining nodes
            updated.forEach(node => {
                const existing = collab.canvasNodes.get(node.id);
                if (existing) {
                    // ✅ FIX: Check ALL important fields
                    const hasChanged =
                        existing.x !== node.x ||
                        existing.y !== node.y ||
                        existing.width !== node.width ||
                        existing.height !== node.height ||
                        existing.content !== node.content ||
                        existing.title !== node.title ||
                        existing.isExpanded !== node.isExpanded ||
                        existing.parentId !== node.parentId ||
                        existing.color !== node.color ||
                        existing.type !== node.type ||
                        existing.kind !== node.kind ||
                        existing.cardId !== node.cardId ||
                        existing.youtubeId !== node.youtubeId ||
                        existing.pdfUrl !== node.pdfUrl ||
                        existing.mediaUrl !== node.mediaUrl ||
                        existing.imageUrl !== node.imageUrl ||
                        existing.s3Key !== node.s3Key ||
                        existing.fileName !== node.fileName ||
                        existing.fileType !== node.fileType;

                    if (hasChanged) {
                        // ✅ FIX: Sync ALL fields to Y.js
                        collab.updateYCanvasNode(node.id, {
                            x: node.x,
                            y: node.y,
                            width: node.width,
                            height: node.height,
                            content: node.content,
                            title: node.title,
                            isExpanded: node.isExpanded,
                            color: node.color,
                            childIds: node.childIds,
                            parentId: node.parentId,
                            type: node.type,
                            kind: node.kind,
                            cardId: node.cardId,
                            // ✅ ADD: Media fields
                            ...(node.kind !== undefined && { kind: node.kind }),
                            ...(node.cardId !== undefined && { cardId: node.cardId }),
                            ...(node.youtubeId !== undefined && { youtubeId: node.youtubeId }),
                            ...(node.pdfUrl !== undefined && { pdfUrl: node.pdfUrl }),
                            ...(node.mediaUrl !== undefined && { mediaUrl: node.mediaUrl }),
                            ...(node.imageUrl !== undefined && { imageUrl: node.imageUrl }),
                            ...(node.s3Key !== undefined && { s3Key: node.s3Key }),
                            ...(node.fileName !== undefined && { fileName: node.fileName }),
                            ...(node.fileType !== undefined && { fileType: node.fileType }),
                            ...(node.pdfFile !== undefined && { pdfFile: node.pdfFile }),
                            ...(node.pdfSource !== undefined && { pdfSource: node.pdfSource }),
                            ...(node.projectNoteId !== undefined && { projectNoteId: node.projectNoteId }),
                            ...(node.globalNoteId !== undefined && { globalNoteId: node.globalNoteId }),
                        });
                    }
                } else {
                    collab.addYCanvasNode({
                        id: node.id,
                        type: node.type,
                        x: node.x,
                        y: node.y,
                        width: node.width,
                        height: node.height,
                        content: node.content,
                        title: node.title,
                        parentId: node.parentId,
                        childIds: node.childIds,
                        level: node.level,
                        color: node.color,
                        isExpanded: node.isExpanded,
                        ...(node.kind && { kind: node.kind }),
                        ...(node.cardId && { cardId: node.cardId }),
                        ...(node.youtubeId && { youtubeId: node.youtubeId }),
                        ...(node.pdfUrl && { pdfUrl: node.pdfUrl }),
                        ...(node.mediaUrl && { mediaUrl: node.mediaUrl }),
                        ...(node.imageUrl && { imageUrl: node.imageUrl }),
                        ...(node.s3Key && { s3Key: node.s3Key }),
                        ...(node.fileName && { fileName: node.fileName }),
                        ...(node.fileType && { fileType: node.fileType }),
                        ...(node.pdfFile && { pdfFile: node.pdfFile }),
                        ...(node.pdfSource && { pdfSource: node.pdfSource }),
                        ...(node.projectNoteId && { projectNoteId: node.projectNoteId }),
                        ...(node.globalNoteId && { globalNoteId: node.globalNoteId }),
                    } as any);
                }
            });
        } else {
            setLocalNodes(updater);
        }
    }, [isCollaborativeMode, collab]);



    const updateConnections = useCallback((updater: (prev: Connection[]) => Connection[]) => {
        if (isCollaborativeMode) {
            // Convert YCanvasConnection[] to Connection[] format
            const currentConnections: Connection[] = connections.map(c => ({
                id: c.id,
                fromId: c.fromId,
                toId: c.toId,
                strokeStyle: c.strokeStyle,
                arrowType: c.arrowType,
                color: c.color as any, // Cast because YCanvasConnection.color is string
                label: c.label || ''
            }));

            const updated = updater(currentConnections);

            // Find what changed
            const currentIds = new Set(currentConnections.map(c => c.id));
            const updatedIds = new Set(updated.map(c => c.id));

            // Delete removed connections
            for (const conn of currentConnections) {
                if (!updatedIds.has(conn.id)) {
                    collab.deleteYCanvasConnection(conn.id);
                }
            }

            // Add new or update existing connections
            for (const conn of updated) {
                if (!currentIds.has(conn.id)) {
                    // New connection - add it
                    collab.addYCanvasConnection(conn);
                } else {
                    // Existing connection - check if changed
                    const existing = currentConnections.find(c => c.id === conn.id);
                    if (existing) {
                        const hasChanged =
                            existing.color !== conn.color ||
                            existing.label !== conn.label ||
                            existing.strokeStyle !== conn.strokeStyle ||
                            existing.arrowType !== conn.arrowType;

                        if (hasChanged) {
                            collab.updateYCanvasConnection(conn.id, conn);
                        }
                    }
                }
            }
        } else {
            setLocalConnections(updater);
        }
    }, [isCollaborativeMode, collab, connections]);



    const updateGlobalNotes = useCallback((updater: (prev: GlobalNote[]) => GlobalNote[]) => {
        if (isCollaborativeMode) {
            const updated = updater(globalNotes);
            updated.forEach(note => {
                const existingNote = collab.canvasGlobalNotes.get(note.id);
                if (existingNote) {
                    collab.updateYGlobalNote(note.id, note);
                } else {
                    collab.canvasGlobalNotes.set(note.id, note);
                }
            });
        } else {
            setLocalGlobalNotes(updater);
        }
    }, [isCollaborativeMode, collab, globalNotes]);

    // --- History Management ---
    const addToHistory = useCallback(() => {
        const currentState = { nodes, connections, globalNotes };
        setHistory(prev => {
            const newHistory = prev.slice(0, historyIndex + 1);
            return [...newHistory, currentState];
        });
        setHistoryIndex(prev => prev + 1);
    }, [nodes, connections, globalNotes, historyIndex]);

    const saveNodeParent = useCallback(async (childNodeId: string, newParentId: string | null) => {
        if (!accessToken) return;

        // ✅ Get parent from collaborative or local state
        const parentNode = isCollaborativeMode
            ? collab.canvasNodes.get(newParentId || '')
            : nodes.find(n => n.id === newParentId);

        if (!newParentId) {
            // Ungrouping
            try {
                await fetch(`${API_BASE_URL}/nodes/${sessionId}/${childNodeId}?branch_id=main`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        group_id: "",
                        parent_node_id: null
                    })
                });
                console.log(`✅ Ungrouped node ${childNodeId}`);
            } catch (error) {
                console.error('❌ Error ungrouping node:', error);
            }
            return;
        }

        if (!parentNode) {
            console.warn("⚠️ saveNodeParent: Could not find parent node with ID:", newParentId);
            return;
        }

        const isTargetGroup = isGroupNode(parentNode);

        const payload = {
            group_id: isTargetGroup ? newParentId : "",
            parent_node_id: newParentId
        };

        try {
            // ✅ USE CHILD NODE ID, NOT PARENT ID
            await fetch(`${API_BASE_URL}/nodes/${sessionId}/${childNodeId}?branch_id=main`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            console.log(`✅ Saved relationship: Node ${childNodeId} -> ${isTargetGroup ? 'Group' : 'Parent'} ${newParentId}`);
        } catch (error) {
            console.error('❌ Error saving node parent:', error);
        }
    }, [accessToken, sessionId, API_BASE_URL, nodes, isCollaborativeMode, collab]);


    useEffect(() => {
        if (user?.currentUser?.username) {
            setusername(user.currentUser.username);
        }
        if (user?.currentUser?.profile) {
            setProfile(user?.currentUser?.profile);
        }
    }, [user?.currentUser?.username, user?.currentUser?.profile]);

    const userid = user?.currentUser?.id;
    useEffect(() => {
        const fetchUserData = async () => {
            if (!user.accessToken || !userid) {
                return;
            }
            try {
                const response = await fetch(`${nodeUrl}/api/auth/user/${userid}`, {
                    method: 'GET',
                    headers: {
                        'token': `${user.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                });

                if (!response.ok) {
                    throw new Error(`Failed to fetch user: ${response.status}`);
                }

                const data = await response.json();
                setUserPlanID(data.plan);
            } catch (err) {
                console.error("Error fetching user data:", err);
            }
        };

        fetchUserData();
    }, [user.accessToken, userid]);

    const AVAILABLE_MODELS =
      UserPlanID === "custom_api"
        ? CUSTOM_API_MODELS
        : UserPlanID === "basic"
        ? BASIC_MODELS
        : BASIC_MODELS;
        
    // Socket ready state management
    useEffect(() => {
        if (!socket) {
            setSocketReady(false);
            return;
        }

        const handleOpen = () => {
            console.log('✅ Socket OPENED in InfiniteCanvas');
            setSocketReady(true);
        };

        const handleClose = () => {
            console.log('❌ Canvas detected socket CLOSED');
            setSocketReady(false);
        };

        const handleError = () => {
            console.log('❌ Canvas detected socket ERROR');
            setSocketReady(false);
        };

        if (socket.readyState === WebSocket.OPEN) {
            console.log('✅ Socket already OPEN on mount');
            setSocketReady(true);
        } else {
            console.log('⏳ Socket not ready yet, state:', socket.readyState);
        }

        socket.addEventListener('open', handleOpen);
        socket.addEventListener('close', handleClose);
        socket.addEventListener('error', handleError);

        return () => {
            socket.removeEventListener('open', handleOpen);
            socket.removeEventListener('close', handleClose);
            socket.removeEventListener('error', handleError);
        };
    }, [socket]);


    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const prevState = history[historyIndex - 1];
            updateNodes(() => prevState.nodes);
            updateConnections(() => prevState.connections);
            updateGlobalNotes(() => prevState.globalNotes);
            setHistoryIndex(prev => prev - 1);
        }
    }, [history, historyIndex, updateNodes, updateConnections, updateGlobalNotes]);

    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const nextState = history[historyIndex + 1];
            updateNodes(() => nextState.nodes);
            updateConnections(() => nextState.connections);
            updateGlobalNotes(() => nextState.globalNotes);
            setHistoryIndex(prev => prev + 1);
        }
    }, [history, historyIndex, updateNodes, updateConnections, updateGlobalNotes]);

    // Initial history push
    useEffect(() => {
        if (history.length === 0) {
            setHistory([{ nodes, connections, globalNotes }]);
            setHistoryIndex(0);
        }
    }, []);

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo();
                else undo();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // --- Deletion ---
    const handleDelete = useCallback(async () => {
        if (!selectedId) return;

        const freshNodes = isCollaborativeMode
            ? Array.from(collab.canvasNodes.values())
            : nodes;

        // Check for Connection using ID
        if (connections.some(c => c.id === selectedId)) {
            addToHistory();
            updateConnections(prev => prev.filter(c => c.id !== selectedId));

            // Call API to delete
            if (accessToken) {
                fetch(`${API_BASE_URL}/connections/${sessionId}/${selectedId}?branch_id=main`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }).catch(err => console.error("Failed to delete connection", err));
            }
            setSelectedId(null);
            return;
        }

        // Node deletion logic
        const node = freshNodes.find(n => n.id === selectedId);
        if (node) {
            if (!accessToken) {
                toast.error('Sign in again before deleting this node');
                return;
            }
            if (!beginNodeOperation(selectedId, 'deleting')) {
                toast.info('This node is already being updated');
                return;
            }
            try {
                const response = await fetch(`${API_BASE_URL}/nodes/${sessionId}/${selectedId}?branch_id=main`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (!response.ok) {
                    const result = await response.json().catch(() => ({}));
                    throw new Error(result.detail || `Delete failed (${response.status})`);
                }

                addToHistory();
                if (isGroupNode(node)) {
                    // Unparent all children before deleting group
                    updateNodes(prev => prev.map(n =>
                        n.parentId === selectedId ? { ...n, parentId: undefined } : n
                    ).filter(n => n.id !== selectedId));
                } else {
                    updateNodes(prev => prev.filter(n => n.id !== selectedId));
                }

                updateConnections(prev => prev.filter(c => c.fromId !== selectedId && c.toId !== selectedId));
                setSelectedId(null);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Could not delete node and its attached files');
            } finally {
                finishNodeOperation(selectedId);
            }
        }
    }, [selectedId, nodes, connections, addToHistory, updateNodes, updateConnections, accessToken, sessionId, API_BASE_URL, isCollaborativeMode, collab, beginNodeOperation, finishNodeOperation]);



    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                const target = e.target as HTMLElement;
                if (
                    target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable ||
                    target.closest('.ProseMirror') ||
                    target.closest('[contenteditable="true"]')
                ) {
                    return;
                }
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleDelete, selectedId]);


    // Collect branch files (PDFs, images, etc.)
    const collectBranchFiles = (nodeId: string, nodesRef: React.RefObject<NodeData[]>) => {
        const allNodes = nodesRef.current || [];
        if (allNodes.length === 0) return [];

        // Use a Map to prevent sending duplicate file paths
        const filesMap = new Map<string, any>();

        const addFileToMap = (node: NodeData) => {
            const path = node.pdfUrl || node.mediaUrl || node.s3Key;
            // Ensure path exists and hasn't been added yet
            if (path && !filesMap.has(path)) {
                filesMap.set(path, {
                    node_id: node.id,
                    file_type: node.type,
                    file_path: path,
                    title: node.title,
                    s3_key: node.s3Key
                });
            }
        };

        if (!nodeId) {
            allNodes.forEach(addFileToMap);
            return Array.from(filesMap.values());
        }

        const selectedNode = allNodes.find(n => n.id === nodeId);
        if (!selectedNode) return [];

        if (isGroupNode(selectedNode)) {
            const childNodes = allNodes.filter(n => n.parentId === selectedNode.id);
            childNodes.forEach(addFileToMap);
        }
        else {
            let currentNode: NodeData | undefined = selectedNode;
            while (currentNode) {
                addFileToMap(currentNode);
                currentNode = currentNode.parentId
                    ? allNodes.find(n => n.id === currentNode.parentId)
                    : undefined;
            }
        }

        return Array.from(filesMap.values());
    };


    const handleAskAi = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!aiPrompt.trim() || isAiLoading) return;

        // Check socket connection
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.error('❌ Socket not ready');
            toast.error("WebSocket connection is not open. Please try again.");
            return;
        }

        setIsAiLoading(true);
        try {
            const sourceNodeId = selectedId;
            const currentNode = sourceNodeId ? nodes.find(n => n.id === sourceNodeId) : null;
            const uniqueId = crypto.randomUUID().split('-')[0];
            const timestamp = Date.now();
            const responseNodeId = `response_${uniqueId}_${timestamp}`;

            const nodeContext = sourceNodeId
                ? collectSmartNodeContext(sourceNodeId, nodesRef)
                : {
                    parentChain: [],
                    childNodes: [],
                    siblingNodes: [],
                    groupInfo: null,
                    isQueryingGroup: false
                };


            const connectedNodes = sourceNodeId
                ? getConnectedNodesWithMedia(sourceNodeId, connectionsRef, nodesRef)
                : [];

            const rawBranchFiles = collectBranchFiles(sourceNodeId || '', nodesRef);

            // Clean file paths
            const cleanedBranchFiles = rawBranchFiles.map(f => ({
                ...f,
                file_path: cleanUrlPath(f.file_path),
                s3_key: f.s3_key
            }));

            // Create simple string array of paths
            const filePaths = cleanedBranchFiles
                .map(f => f.file_path)
                .filter(Boolean);

            // Handle Parent PDF (if inside a PDF node)
            const parentPDF = sourceNodeId ? findParentPDF(sourceNodeId, nodesRef) : null;
            if (parentPDF?.pdfUrl) {
                const pdfPath = cleanUrlPath(parentPDF.pdfUrl);

                // Only add if not already in list
                if (!filePaths.includes(pdfPath)) {
                    filePaths.unshift(pdfPath);
                }
            }
            const apiKeys = { llm: null, image: null, web: null };

            if (typeof window !== 'undefined') {
                const allApiKeysStr = localStorage.getItem('allApiKeys');
                if (allApiKeysStr) {
                    const allApiKeys = JSON.parse(allApiKeysStr);
                    apiKeys.llm = allApiKeys.llm;
                    apiKeys.image = allApiKeys.image_or_video;
                    apiKeys.web = allApiKeys.webSearch;
                } else {
                    apiKeys.llm = localStorage.getItem('apiKey_llm');
                    apiKeys.image = localStorage.getItem('apiKey_image_or_video');
                    apiKeys.web = localStorage.getItem('apiKey_webSearch');
                }
            }

            if (!currentNode) {
                toast.error("Please select a node first");
                setIsAiLoading(false);
                return;
            }

            // Build node connections
            const nodeConnectionsData = sourceNodeId
                ? connectionsRef.current?.filter(conn =>
                    conn.fromId === sourceNodeId || conn.toId === sourceNodeId
                ).map(conn => ({
                    from: conn.fromId,
                    to: conn.toId,
                    from_node: nodes.find(n => n.id === conn.fromId)?.title,
                    to_node: nodes.find(n => n.id === conn.toId)?.title
                }))
                : [];

            const canvasQuery = buildCanvasQueryPayload(
                currentNode,
                nodeContext,
                connectedNodes,
                filePaths,
                sessionId,
                username,
                Profile,
                userinfo?._id || '',
                projectInfo,
                workspaceInfoFromHome,
                selectedModel || '',
                UserPlanID,
                apiKeys,
                cleanedBranchFiles,
                nodeConnectionsData || []
            );

            (canvasQuery.content as Record<string, unknown>).instruction = aiPrompt.trim();

            // Update canvas state with current values
            canvasQuery.content.canvas_state.viewport = {
                zoom: scale,
                pan_x: viewport.x,
                pan_y: viewport.y
            };
            canvasQuery.content.canvas_state.total_nodes = nodes.length;
            canvasQuery.content.canvas_state.total_connections = connections.length;

            canvasQuery.content.node_id = responseNodeId;

            socket.send(JSON.stringify(canvasQuery));

            if (sourceNodeId) {
                if (isCollaborativeMode) {
                    collab.updateYCanvasNode(sourceNodeId, { isRunning: true });
                } else {
                    updateNodes(prev => prev.map(n =>
                        n.id === sourceNodeId ? { ...n, isRunning: true } : n
                    ));
                }
            }

            setAiPrompt('');
            console.log('✅ Canvas query sent successfully');

        } catch (error) {
            console.error("❌ Error sending AI request:", error);
            toast.error("Failed to send request. Please try again.");
            setIsAiLoading(false);

            if (selectedId) {
                if (isCollaborativeMode) {
                    collab.updateYCanvasNode(selectedId, { isRunning: false });
                } else {
                    updateNodes(prev => prev.map(n =>
                        n.id === selectedId ? { ...n, isRunning: false } : n
                    ));
                }
            }
        }
    };


    const downloadFileToWorkspace = useCallback(async (s3Key: string) => {
        if (!accessToken) return null;
        return await apiService.downloadFile(sessionId, s3Key, accessToken);
    }, [accessToken, sessionId]);


    const handlePDFSelectionAdd = useCallback(async (selection: any) => {
        if (!activePDFNode) return false;

        const parentNode = nodes.find(n => n.id === activePDFNode);
        if (!parentNode) return false;
        if (!accessToken) {
            toast.error('Sign in again before saving this PDF selection');
            return false;
        }

        const existingRangeNode = selection.pageRange
            ? nodes.find(node => {
                const belongsToPdf = node.parentId === activePDFNode ||
                    Boolean(parentNode.pdfUrl && node.pdfSource?.fileUrl === parentNode.pdfUrl);
                const samePageRange =
                    (node.pdfSource?.pageRange?.startPage === selection.pageRange.startPage &&
                     node.pdfSource?.pageRange?.endPage === selection.pageRange.endPage) ||
                    node.title === `PDF pages ${selection.pageRange.startPage}–${selection.pageRange.endPage}`;
                return belongsToPdf && samePageRange;
            })
            : undefined;
        if (pdfSelectionPlacementRef.current.nodeId !== activePDFNode) {
            pdfSelectionPlacementRef.current = { nodeId: activePDFNode, nextIndex: 0 };
        }
        const savedChildren = nodesRef.current.filter(n => n.parentId === activePDFNode).length;
        const placementIndex = existingRangeNode
            ? Math.max(0, nodes.findIndex(node => node.id === existingRangeNode.id))
            : Math.max(savedChildren, pdfSelectionPlacementRef.current.nextIndex);
        if (!existingRangeNode) pdfSelectionPlacementRef.current.nextIndex = placementIndex + 1;

        const embeddedImages = Array.isArray(selection.embeddedImages) ? selection.embeddedImages : [];
        const hasImageUpload = Boolean(selection.imageData || embeddedImages.length);
        if (hasImageUpload && !beginNodeOperation(activePDFNode, 'uploading')) {
            toast.info('This node is already being updated');
            return false;
        }

        addToHistory();

        let content = "";
        let nodeType: 'text' | 'image' = 'text';
        let imageUrl: string | undefined = undefined;
        let s3Key: string | undefined = undefined;
        const embeddedImageMetadata: Array<{
            s3Key: string;
            pageNumber: number;
            alt: string;
            boundingBox: { x: number; y: number; width: number; height: number };
        }> = [...(existingRangeNode?.pdfSource?.embeddedImages || [])];

        // 1. Prepare Content & Upload Images if necessary
        switch (selection.type) {
            case 'text':
                content = selection.content || '';
                if (embeddedImages.length) {
                    const escapeHtmlAttribute = (value: unknown) => String(value ?? '')
                        .replace(/&/g, '&amp;')
                        .replace(/"/g, '&quot;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    try {
                        for (const embeddedImage of embeddedImages) {
                            const safeAssetName = String(embeddedImage.id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
                            const uploaded = await apiService.uploadFile(sessionId, {
                                path: `pdf_page_${embeddedImage.pageNumber}_${safeAssetName}.png`,
                                content: embeddedImage.imageData,
                            }, accessToken);
                            const uploadedKey = uploaded.file.s3_key;
                            const uploadedUrl = `${pythonUrl}${uploaded.file.path}`;
                            const imageTag = `<img src="${escapeHtmlAttribute(uploadedUrl)}" data-s3-key="${escapeHtmlAttribute(uploadedKey)}" alt="${escapeHtmlAttribute(embeddedImage.alt)}" data-pdf-page="${embeddedImage.pageNumber}" style="max-width:100%;height:auto;" />`;
                            content = content.replace(`[[PDF_IMAGE:${embeddedImage.id}]]`, imageTag);
                            embeddedImageMetadata.push({
                                s3Key: uploadedKey,
                                pageNumber: embeddedImage.pageNumber,
                                alt: embeddedImage.alt,
                                boundingBox: embeddedImage.boundingBox,
                            });
                        }
                    } catch (err) {
                        console.error('Failed to save embedded PDF images', err);
                        toast.error('Failed to save one of the PDF images');
                        finishNodeOperation(activePDFNode);
                        return false;
                    }
                }
                content;
                break;
            case 'image':
            case 'chart':
            case 'table':
            case 'diagram':
                if (selection.imageData) {
                    try {
                        const data = await apiService.uploadFile(sessionId, {
                            path: `selection_${Date.now()}.png`,
                            content: selection.imageData,
                        }, accessToken);
                        imageUrl = `${pythonUrl}${data.file.path}`;
                        s3Key = data.file.s3_key;
                        nodeType = 'image';
                        content = `${selection.content || `${selection.type.toUpperCase()} from page ${selection.pageNumber}`}\n\n_From PDF page ${selection.pageNumber}_`;
                    } catch (err) {
                        console.error("Failed to upload selection image", err);
                        toast.error("Failed to save image selection");
                        finishNodeOperation(activePDFNode);
                        return false; // Stop if upload fails
                    }
                }
                break;
        }

        const newId = existingRangeNode?.id || `n-${Date.now()}`;

        // 2. Create the Node Object
        const newNode: NodeData = {
            ...(existingRangeNode || {}),
            id: newId,
            type: nodeType,
            title: selection.pageRange
                ? `PDF pages ${selection.pageRange.startPage}–${selection.pageRange.endPage}`
                : `Page ${selection.pageNumber} - ${selection.type}`,
            content: content,
            x: existingRangeNode?.x ?? parentNode.x + 450,
            y: existingRangeNode?.y ?? parentNode.y + (placementIndex * 220),
            width: existingRangeNode?.width ?? 420,
            height: selection.pageRange ? 560 : nodeType === 'image' ? 400 : 200,
            color: parentNode.color,
            parentId: activePDFNode,
            childIds: [],
            level: parentNode.level,
            isExpanded: true,
            ...(imageUrl && { imageUrl, mediaUrl: imageUrl, s3Key }), // Save image data
            pdfSource: {
                fileUrl: parentNode.pdfUrl,
                pageNumber: selection.pageNumber,
                boundingBox: selection.boundingBox,
                boundingBoxNormalized: Boolean(selection.boundingBoxNormalized),
                ...(selection.pageRange && { pageRange: selection.pageRange }),
                ...(embeddedImageMetadata.length && { embeddedImages: embeddedImageMetadata }),
                type: selection.type
            }
        };

        // 3. Create the Connection Object
        const newConnId = `c-${Date.now()}`;
        const newConnection: Connection = {
            id: newConnId,
            fromId: activePDFNode,
            toId: newId,
            strokeStyle: 'solid',
            arrowType: 'end',
            color: 'slate',
            label: 'PDF'
        };
        const needsPdfConnection = !connections.some(connection =>
            connection.fromId === activePDFNode && connection.toId === newId
        );

        try {
            const headers = {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            };
            const pdfSource = {
                pageNumber: selection.pageNumber,
                boundingBox: selection.boundingBox,
                boundingBoxNormalized: Boolean(selection.boundingBoxNormalized),
                ...(selection.pageRange && { pageRange: selection.pageRange }),
                ...(embeddedImageMetadata.length && { embeddedImages: embeddedImageMetadata }),
                type: selection.type,
                fileUrl: parentNode.pdfUrl
            };
            const nodeResponse = existingRangeNode
                ? await fetch(`${API_BASE_URL}/nodes/${sessionId}/${newId}?branch_id=main`, {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                        parent_node_id: activePDFNode,
                        title: newNode.title,
                        content: newNode.content,
                        height: newNode.height,
                        metadata: { pdfSource }
                    })
                })
                : await fetch(`${API_BASE_URL}/nodes`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        canvas_id: sessionId,
                        node_id: newId,
                        branch_id: 'main',
                        parent_node_id: activePDFNode, // Connect to the PDF Node
                        node_type: nodeType,
                        title: newNode.title,
                        content: newNode.content,
                        position_x: newNode.x,
                        position_y: newNode.y,
                        width: newNode.width,
                        height: newNode.height,
                        level: newNode.level,
                        color: newNode.color,
                        is_expanded: true,

                        // The object key is durable; the workspace URL is only a cache location.
                        s3_key: s3Key || "",
                        metadata: { pdfSource }
                    })
                });
            if (!nodeResponse.ok) {
                const result = await nodeResponse.json().catch(() => ({}));
                throw new Error(result.detail || `Could not save selection (${nodeResponse.status})`);
            }

            if (existingRangeNode) {
                updateNodes(prev => prev.map(node => node.id === newId ? newNode : node));
            } else {
                updateNodes(prev => [...prev, newNode]);
            }
            toast.success(existingRangeNode ? 'Updated the PDF pages note' : 'Added PDF pages to the canvas');

            if (needsPdfConnection) {
                updateConnections(prev => [...prev, newConnection]);
                const connectionResponse = await fetch(`${API_BASE_URL}/connections`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        canvas_id: sessionId,
                        branch_id: 'main',
                        connection_id: newConnId,
                        from_node_id: newConnection.fromId,
                        to_node_id: newConnection.toId,
                        color: newConnection.color,
                        stroke_style: newConnection.strokeStyle,
                        arrow_type: newConnection.arrowType,
                        label: 'Resource'
                    })
                });
                if (!connectionResponse.ok) {
                    console.error('Could not save PDF selection connection:', connectionResponse.status);
                    toast.error('Selection saved, but its PDF connection could not be saved');
                }
            }
        } catch (error) {
            console.error("❌ Failed to save PDF selection node:", error);
            toast.error(error instanceof Error ? error.message : 'Failed to save to database');
            return false;
        } finally {
            if (hasImageUpload) finishNodeOperation(activePDFNode);
        }

        return true;

    }, [activePDFNode, nodes, connections, addToHistory, updateNodes, updateConnections, accessToken, sessionId, API_BASE_URL, beginNodeOperation, finishNodeOperation]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (editingNodeId) return;

        const target = e.target as HTMLElement;
        if (
            target.closest('[data-editor-sidebar]') ||
            target.closest('.ProseMirror') ||
            target.closest('.overflow-y-auto') ||
            target.closest('.overflow-auto')
        ) {
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            const zoomSpeed = 0.001;
            const delta = -e.deltaY;
            const newScale = Math.min(2, Math.max(0.1, scale + delta * zoomSpeed));
            setScale(newScale);
        } else {
            setViewport(prev => ({
                x: prev.x - e.deltaX,
                y: prev.y - e.deltaY
            }));
        }
    }, [scale, editingNodeId]);


    const handleOpenSource = useCallback((sourceNode: NodeData) => {
        if (!sourceNode.pdfSource) return;

        let targetPdfNode = nodes.find(n => n.id === sourceNode.parentId);
        if ((!targetPdfNode || !targetPdfNode.pdfUrl) && sourceNode.pdfSource.fileUrl) {
            targetPdfNode = nodes.find(n => n.pdfUrl === sourceNode.pdfSource?.fileUrl);
        }

        if (targetPdfNode && targetPdfNode.pdfUrl) {
            setActivePDFNode(targetPdfNode.id);
            setIsPDFReaderExpanded(false);

            setPdfJumpLocation({
                pageNumber: sourceNode.pdfSource.pageNumber,
                boundingBox: sourceNode.pdfSource.boundingBox,
                boundingBoxNormalized: sourceNode.pdfSource.boundingBoxNormalized
            });

            setPDFReaderVisible(true);
        } else {
            console.error("Could not find parent PDF node. Parent ID:", sourceNode.parentId);
            alert("Could not find the original PDF file on this canvas.");
        }
    }, [nodes]);

    const debouncedSaveNode = useCallback((nodeId: string, data: any) => {
        if (nodeSaveTimeoutsRef.current[nodeId]) clearTimeout(nodeSaveTimeoutsRef.current[nodeId]);

        nodeSaveTimeoutsRef.current[nodeId] = setTimeout(async () => {
            if (!accessToken) return;
            const saved = await apiService.saveNode(sessionId, nodeId, data, accessToken);
            if (!saved) toast.error('Could not save your changes. Check your connection and try again.');
            delete nodeSaveTimeoutsRef.current[nodeId];
        }, 1000);
    }, [accessToken, sessionId]);

    // const debouncedSaveCard = useCallback((cardId: string, data: any) => {
    //   if (cardSaveTimeoutsRef.current[cardId]) clearTimeout(cardSaveTimeoutsRef.current[cardId]);
    //   cardSaveTimeoutsRef.current[cardId] = setTimeout(async () => {
    //     if (!accessToken) return;
    //     try {
    //       await fetch(`${API_BASE_URL}/cards/${cardId}`, {
    //         method: 'PATCH',
    //         headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    //         body: JSON.stringify(data)
    //       });
    //     } catch (err) { console.error('Failed to save card', err); }
    //     delete cardSaveTimeoutsRef.current[cardId];
    //   }, 1000);
    // }, [accessToken]);
    
    const saveConnectionData = useCallback(async (connectionId: string, data: any) => {
        if (!accessToken) return;
        // Call the helper (isNew = false by default)
        await apiService.saveConnection(sessionId, connectionId, data, accessToken);
    }, [accessToken, sessionId]);


    const handleOpenPDFReader = useCallback((nodeId: string) => {
        const node = nodes.find(n => n.id === nodeId);
        if (node && node.type === 'pdf' && node.pdfUrl) {
            setPdfJumpLocation(null);
            setActivePDFNode(nodeId);
            setIsPDFReaderExpanded(false);
            setPDFReaderVisible(true);
        }
    }, [nodes]);

    const handleMouseDown = useCallback((e: React.MouseEvent, type: 'node' | 'canvas', id: string | null) => {
        if (e.button !== 0) return;

        const currentScale = scaleRef.current;
        const currentViewport = viewportRef.current;
        const canvasX = (e.clientX - currentViewport.x) / currentScale;
        const canvasY = (e.clientY - currentViewport.y) / currentScale;

        // --- 1. Connection Mode Logic ---
        if (connectingNodeId) {
            if (type === 'canvas') {
                setConnectingNodeId(null);
                return;
            }
            if (id && id !== connectingNodeId) {
                addToHistory();
                // Use Ref to check connections without re-rendering
                const exists = connectionsRef.current.some(c => c.fromId === connectingNodeId && c.toId === id);

                if (!exists) {
                    const newConnId = `c-${Date.now()}`;
                    const newConn: Connection = {
                        id: newConnId,
                        fromId: connectingNodeId,
                        toId: id,
                        label: '',
                        strokeStyle: 'solid',
                        arrowType: 'end',
                        color: 'slate'
                    };
                    updateConnections(prev => [...prev, newConn]);
                    setSelectedId(newConn.id);

                    if (accessToken) {
                        fetch(`${API_BASE_URL}/connections`, {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                canvas_id: sessionId,
                                branch_id: 'main',
                                connection_id: newConnId,
                                from_node_id: connectingNodeId,
                                to_node_id: id,
                                color: 'slate',
                                stroke_style: 'solid',
                                arrow_type: 'end'
                            })
                        }).catch(console.error);
                    }
                }
                setConnectingNodeId(null);
                return;
            }
        }

        // --- 2. Canvas Pan Setup ---
        if (type === 'canvas') {
            setDragState({
                isDragging: true,
                type: 'canvas',
                id: null,
                startX: e.clientX,
                startY: e.clientY,
                initialPositions: {},
                startViewport: { x: currentViewport.x, y: currentViewport.y }
            });
            if (e.target === e.currentTarget) {
                setSelectedId(null);
            }
            return;
        }

        // --- 3. Node/Group Drag Setup ---
        const initialPositions: Record<string, Position> = {};

        if (type === 'node' && id) {
            // Use Ref to find node (Faster, no stale closures)
            const currentNodes = isCollaborativeMode
                ? Array.from(collab.canvasNodes.values())
                : nodesRef.current;

            const node = currentNodes.find(n => n.id === id);

            if (node) {
                // A. Capture clicked node's position
                initialPositions[id] = { x: node.x, y: node.y };

                // B. Capture Group Children
                if (isGroupNode(node)) {
                    currentNodes.filter(n => n.parentId === id).forEach(child => {
                        initialPositions[child.id] = { x: child.x, y: child.y };
                    });
                }
            }
        }

        setDragState({
            isDragging: true,
            type,
            id,
            startX: canvasX,
            startY: canvasY,
            initialPositions,
        });

        if (isCollaborativeMode && id) {
            collab.updateCanvasPresence({
                currentDraggingNodeId: id,
                selectedNodeId: id
            });
        }
    }, [
        connectingNodeId,
        addToHistory,
        updateConnections,
        isCollaborativeMode,
        collab,
        accessToken,
        sessionId,
        API_BASE_URL
    ]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        // 1. Handle Connection Drawing
        if (connectingNodeId) {
            const currentScale = scaleRef.current;
            const currentViewport = viewportRef.current;
            setMousePos({
                x: (e.clientX - currentViewport.x) / currentScale,
                y: (e.clientY - currentViewport.y) / currentScale
            });
            return;
        }

        if (!dragState.isDragging) return;

        // 2. Handle Canvas Panning
        if (dragState.type === 'canvas') {
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            if (dragState.startViewport) {
                setViewport({
                    x: dragState.startViewport.x + dx,
                    y: dragState.startViewport.y + dy
                });
            }
            return;
        }

        // 3. Handle Node/Group Dragging
        const currentScale = scaleRef.current;
        const currentViewport = viewportRef.current;
        const currentCanvasX = (e.clientX - currentViewport.x) / currentScale;
        const currentCanvasY = (e.clientY - currentViewport.y) / currentScale;

        const dx = currentCanvasX - dragState.startX;
        const dy = currentCanvasY - dragState.startY;

        if (dragState.type === 'node' && dragState.id) {
            // We can just check initialPositions directly, no need to search nodes array
            const initial = dragState.initialPositions[dragState.id];

            if (initial) {
                // Calculate new position for the main dragged element
                const newX = snapToGrid(initial.x + dx, SNAP_GRID);
                const newY = snapToGrid(initial.y + dy, SNAP_GRID);

                // --- A. Update React State ---
                updateNodes(prev => prev.map(n => {
                    // Case 1: Moving the dragged node itself
                    if (n.id === dragState.id) {
                        return { ...n, x: newX, y: newY };
                    }

                    // Case 2: Moving Children (Fast check using initialPositions)
                    if (dragState.initialPositions[n.id] && n.parentId === dragState.id) {
                        const childInitial = dragState.initialPositions[n.id];
                        return {
                            ...n,
                            x: snapToGrid(childInitial.x + dx, SNAP_GRID),
                            y: snapToGrid(childInitial.y + dy, SNAP_GRID)
                        };
                    }
                    return n;
                }));

                // --- B. Queue for Auto-Save ---
                unsavedPositionsRef.current.set(dragState.id, { x: newX, y: newY });

                // Queue children
                const freshNodes = nodesRef.current;
                const node = freshNodes.find(n => n.id === dragState.id);

                if (node && isGroupNode(node)) {
                    Object.keys(dragState.initialPositions).forEach(childId => {
                        if (childId !== dragState.id) {
                            const childInitial = dragState.initialPositions[childId];
                            const cx = snapToGrid(childInitial.x + dx, SNAP_GRID);
                            const cy = snapToGrid(childInitial.y + dy, SNAP_GRID);
                            unsavedPositionsRef.current.set(childId, { x: cx, y: cy });
                        }
                    });
                }
            }
        }
    }, [
        dragState,
        connectingNodeId,
        updateNodes,
        setViewport,
        setMousePos,
        unsavedPositionsRef
    ]);


    const handleMouseUp = useCallback(() => {
        let needsHistoryPush = false;
        const nodesToSaveFinally: { id: string, x: number, y: number, width?: number, height?: number }[] = [];

        if (!dragState.isDragging) return;

        // --- FINALIZING NODE/GROUP DRAG ---
        if (dragState.type === 'node' && dragState.id) {
            const node = isCollaborativeMode
                ? collab.canvasNodes.get(dragState.id)
                : nodes.find(n => n.id === dragState.id);

            if (node) {
                // CASE 1: Dragging a Group
                if (isGroupNode(node)) {
                    const freshNodes = isCollaborativeMode
                        ? Array.from(collab.canvasNodes.values())
                        : nodes;

                    const newBounds = getGroupBounds(node, freshNodes);

                    // Update React State
                    updateNodes(prev => prev.map(n =>
                        n.id === dragState.id
                            ? { ...n, x: newBounds.x, y: newBounds.y, width: newBounds.w, height: newBounds.h }
                            : n
                    ));

                    // Queue Group Position
                    nodesToSaveFinally.push({
                        id: node.id, x: newBounds.x, y: newBounds.y, width: newBounds.w, height: newBounds.h
                    });

                    // Queue Children Positions (they moved with the group)
                    freshNodes.filter(n => n.parentId === node.id).forEach(child => {
                        nodesToSaveFinally.push({ id: child.id, x: child.x, y: child.y });
                    });

                    needsHistoryPush = true;
                }
                // CASE 2: Dragging a Regular Node
                else {
                    const nodeCenterX = node.x + node.width / 2;
                    const nodeCenterY = node.y + node.height / 2;

                    let foundParentId: string | null = null;

                    const freshNodes = isCollaborativeMode
                        ? Array.from(collab.canvasNodes.values())
                        : nodes;

                    for (const potentialParent of freshNodes) {
                        if (isGroupNode(potentialParent) && potentialParent.id !== node.id) {
                            const bounds = getGroupBounds(potentialParent, freshNodes);
                            if (
                                nodeCenterX >= bounds.x &&
                                nodeCenterX <= bounds.x + bounds.w &&
                                nodeCenterY >= bounds.y &&
                                nodeCenterY <= bounds.y + bounds.h
                            ) {
                                foundParentId = potentialParent.id;
                                break;
                            }
                        }
                    }

                    // --- DETECT PARENT CHANGE HERE ---
                    if (node.parentId !== foundParentId) {
                        // 1. Update Visual State
                        updateNodes(prev => prev.map(n =>
                            n.id === dragState.id ? { ...n, parentId: foundParentId || undefined } : n
                        ));

                        nodesToSaveFinally.push({ id: node.id, x: node.x, y: node.y });

                        saveNodeParent(node.id, foundParentId);

                        needsHistoryPush = true;
                    } else {
                        // Just a position change, no group change
                        nodesToSaveFinally.push({ id: node.id, x: node.x, y: node.y });
                    }
                }
            }
        }

        // --- FINALIZING CANVAS PAN ---
        if (dragState.type === 'canvas' && dragState.isDragging) {
        }

        // --- SAVE & CLEANUP ---
        if (needsHistoryPush) {
            addToHistory();
        }

        // Push positions to the Batch Queue
        if (nodesToSaveFinally.length > 0) {
            nodesToSaveFinally.forEach(update => {
                unsavedPositionsRef.current.set(update.id, {
                    x: update.x,
                    y: update.y,
                    width: update.width,
                    height: update.height
                });
            });
        }

        if (isCollaborativeMode) {
            collab.updateCanvasPresence({
                currentDraggingNodeId: null
            });
        }

        setDragState(prev => ({ ...prev, isDragging: false, type: null, id: null }));
    }, [
        dragState,
        nodes,
        updateNodes,
        isGroupNode,
        getGroupBounds,
        addToHistory,
        isCollaborativeMode,
        collab,
        setDragState,
        unsavedPositionsRef,
        saveNodeParent
    ]);

    // --- Global Note Logic ---
    const handleCreateNote = () => {
        addToHistory();
        const newNote: GlobalNote = {
            id: `gn-${Date.now()}`,
            title: 'REF From Outside',
            content: '',
            color: 'white',
            createdAt: Date.now()
        };
        updateGlobalNotes(prev => [newNote, ...prev]);
    };

    const handleUpdateNote = (id: string, updates: Partial<GlobalNote>) => {
        updateGlobalNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    const handleDeleteNote = (id: string) => {
        addToHistory();
        updateGlobalNotes(prev => prev.filter(n => n.id !== id));
        updateNodes(prev => prev.map(n => {
            if (n.globalNoteId === id) {
                const note = globalNotes.find(gn => gn.id === id);
                return {
                    ...n,
                    globalNoteId: undefined,
                    content: note?.content || n.content,
                    title: note?.title || n.title,
                    color: note?.color || n.color
                };
            }
            return n;
        }));
    };

    const focusNode = useCallback((nodeId: string) => {
      const node = nodesRef.current.find(n => n.id === nodeId);
      const box = containerRef.current?.getBoundingClientRect();
      if (!node || !box) return;    

      const toScale = 0.9;
      const canvasWidth = isWorkspaceChatOpen
        ? Math.max(0, box.width - workspaceChatWidth - (editingNodeId ? workspaceEditorWidth : 0))
        : box.width;
      const toVp = {
        x: canvasWidth / 2 - (node.x + node.width / 2) * toScale,
        y: box.height / 2 - (node.y + node.height / 2) * toScale,
      };
      const fromVp = viewportRef.current;
      const fromScale = scaleRef.current;
      const start = performance.now();
      const DURATION = 400;    

      cancelAnimationFrame(animRef.current as number);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION);
        const e = 1 - Math.pow(1 - t, 3);
        setViewport({ x: fromVp.x + (toVp.x - fromVp.x) * e, y: fromVp.y + (toVp.y - fromVp.y) * e });
        setScale(fromScale + (toScale - fromScale) * e);
        if (t < 1) animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);    

      setSelectedId(nodeId);
      setHighlightId(nodeId);
      setTimeout(() => setHighlightId(null), 1200);
    }, [isWorkspaceChatOpen, workspaceChatWidth, workspaceEditorWidth, editingNodeId]);    

    useEffect(() => {
      if (focusRequest?.nodeId) focusNode(focusRequest.nodeId);
    }, [focusRequest?.ts]);   // eslint-disable-line react-hooks/exhaustive-deps    


    const handleDropOnCanvas = async (e: React.DragEvent) => {
        e.preventDefault();

        const projectNoteData = e.dataTransfer.getData('application/project-note');
        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left - viewport.x) / scale - 160;
        const y = (e.clientY - rect.top - viewport.y) / scale - 100;

        const cardData = e.dataTransfer.getData('application/card');
        if (cardData) {
            e.dataTransfer.dropEffect = 'link';
            placeCard(normalizeCard(JSON.parse(cardData)), { x, y });
            return;
        }

        if (projectNoteData) {
            addToHistory();
            const projectNote = JSON.parse(projectNoteData);

            const contentForDisplay = projectNote.blocks
                ?.map((b: any) => b.content)
                .filter(Boolean)
                .join('\n\n') || '';

            const newNodeId = `n-${Date.now()}`;

            const newNode: NodeData = {
                id: newNodeId,
                type: 'text',
                title: projectNote.title || 'REF From Outside',
                content: contentForDisplay,
                x,
                y,
                width: 620,
                height: 300,
                color: 'purple',
                projectNoteId: projectNote.sessionId,
                globalNoteId: projectNote.sessionId,
                childIds: [],
                level: 0,
                isExpanded: true
            };

            if (isCollaborativeMode) {
                collab.addYCanvasNode({
                    id: newNode.id,
                    type: newNode.type,
                    x: newNode.x,
                    y: newNode.y,
                    width: newNode.width,
                    height: newNode.height,
                    content: newNode.content,
                    title: newNode.title,
                    parentId: newNode.parentId,
                    childIds: newNode.childIds,
                    level: newNode.level,
                    color: newNode.color,
                    isExpanded: newNode.isExpanded,
                    projectNoteId: projectNote.sessionId,
                    globalNoteId: projectNote.sessionId
                } as any);
            } else {
                updateNodes(prev => [...prev, newNode]);
            }

            setSelectedId(newNode.id);

            if (accessToken) {
                try {
                    await fetch(`${API_BASE_URL}/nodes`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            canvas_id: sessionId,
                            node_id: newNodeId,
                            branch_id: 'main',
                            parent_node_id: null,
                            node_type: 'text',
                            title: newNode.title,
                            content: "",
                            position_x: newNode.x,
                            position_y: newNode.y,
                            width: newNode.width,
                            height: newNode.height,
                            level: 0,
                            color: newNode.color,
                            is_expanded: true,
                            project_note_id: projectNote.sessionId,
                            global_note_id: projectNote.sessionId
                        })
                    });
                } catch (error) {
                    console.error("❌ Failed to save reference node:", error);
                }
            }
        }
    };

    useEffect(() => {
      const h = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteMode('add'); }
      };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    }, []);
    
    const boardTags = useMemo(() => {
      const s = new Set<string>();
      nodes.forEach(n => n.cardId && cards[n.cardId]?.tags?.forEach(t => s.add(t)));
      return Array.from(s).sort();
    }, [nodes, cards]);
    
    
    const handleUpdateNodeContent = (id: string, newContent: string) => {
      const node = nodes.find(n => n.id === id);
      if (!node) return;
      if (node.kind === 'card' && node.cardId) { patchCard(node.cardId, { content: newContent }); return; }
      if (node.globalNoteId) handleUpdateNote(node.globalNoteId, { content: newContent });
      else {
        updateNodes(prev => prev.map(n => n.id === id ? { ...n, content: newContent } : n));
        debouncedSaveNode(id, { content: newContent });
      }
    };

    const handleUpdateWhiteboard = useCallback((id: string, changes: { content?: unknown; title?: string }) => {
      const node = nodesRef.current.find(item => item.id === id);
      if (!node) return;

      const hasContent = Object.prototype.hasOwnProperty.call(changes, 'content');
      const serializedContent = hasContent
        ? JSON.stringify(changes.content ?? null) ?? 'null'
        : node.content;
      const nextTitle = changes.title ?? node.title;
      const nodeChanges = { content: serializedContent, title: nextTitle };

      if (isCollaborativeMode) {
        collab.updateYCanvasNode(id, nodeChanges);
      } else {
        updateNodes(prev => prev.map(item => item.id === id ? { ...item, ...nodeChanges } : item));
      }
      debouncedSaveNode(id, nodeChanges);
    }, [isCollaborativeMode, collab, updateNodes, debouncedSaveNode]);

    const placeCard = useCallback(async (card: Card, at?: { x: number; y: number }) => {
      const existing = nodesRef.current.find(n => n.cardId === card.id);
      if (existing) { focusNode(existing.id); return; }
    
      const x = at?.x ?? (-viewportRef.current.x + window.innerWidth / 2) / scaleRef.current - 210;
      const y = at?.y ?? (-viewportRef.current.y + window.innerHeight / 2) / scaleRef.current - 100;
    
      addToHistory();
      const newNodeId = `n-${Date.now()}`;
      const newNode: NodeData = {
        id: newNodeId, type: card.type, title: '', content: '', kind: 'card', cardId: card.id,
        x, y, width: 420, height: 200, color: 'white', childIds: [], level: 0, isExpanded: true,
      };
      upsertCards([{ ...card, boardCount: (card.boardCount || 0) + 1 }]);
    
      if (isCollaborativeMode) collab.addYCanvasNode({ ...newNode } as any);
      else updateNodes(prev => [...prev, newNode]);
      setSelectedId(newNodeId);
    
      if (accessToken) {
        try {
          await fetch(`${API_BASE_URL}/nodes`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              canvas_id: sessionId, node_id: newNodeId, branch_id: 'main', parent_node_id: null,
              node_type: card.type, kind: 'card', card_id: card.id, title: '', content: '',
              position_x: x, position_y: y, width: 420, height: 200, level: 0, color: 'white', is_expanded: true,
            }),
          });
        } catch (err) { console.error('Failed to save card placement', err); }
      }
    }, [focusNode, addToHistory, upsertCards, isCollaborativeMode, collab, updateNodes, accessToken, sessionId]);
    
    const openCard = useCallback(async (cardId: string) => {
      const onBoard = nodesRef.current.find(n => n.cardId === cardId);
      if (onBoard) return focusNode(onBoard.id);
      const card = cards[cardId] ?? (await loadCards([cardId]))[0];
      if (card) placeCard(card); else toast.error('Card not found');
    }, [cards, focusNode, loadCards, placeCard]);
    
    const openBoard = useCallback((canvasId: string, nodeId: string) => {
      if (canvasId === sessionId) focusNode(nodeId);
      else onNavigateBoard?.(canvasId, nodeId);   // new prop, see notes
    }, [sessionId, focusNode, onNavigateBoard]);
    
    const handleUpdateNodeTitle = (id: string, newTitle: string) => {
      const node = nodes.find(n => n.id === id);
      if (!node) return;
    
      if (node.kind === 'card' && node.cardId) { patchCard(node.cardId, { title: newTitle }); return; }
    
      if (node.globalNoteId) {
        handleUpdateNote(node.globalNoteId, { title: newTitle });
      } else {
        updateNodes(prev => prev.map(n => n.id === id ? { ...n, title: newTitle } : n));
        debouncedSaveNode(id, { title: newTitle });
      }
    };
    

    const handleUpdateNodeSize = useCallback((id: string, size: { width: number, height: number }) => {
        updateNodes(prev => prev.map(n => {
            if (n.id === id && (Math.abs(n.width - size.width) > 1 || Math.abs(n.height - size.height) > 1)) {
                debouncedSaveNode(id, { width: size.width, height: size.height });
                return { ...n, width: size.width, height: size.height };
            }
            return n;
        }));
    }, [updateNodes, debouncedSaveNode]);

    const handleChangeColor = useCallback((id: string, color: ColorTheme) => {
        addToHistory();

        const node = isCollaborativeMode
            ? collab.canvasNodes.get(id)
            : nodes.find(n => n.id === id);

        if (node) {
            // Handle global notes
            if (node.globalNoteId) {
                handleUpdateNote(node.globalNoteId, { color });
            }

            if (isCollaborativeMode) {
                collab.updateYCanvasNode(id, { color });
            } else {
                updateNodes(prev => prev.map(n => n.id === id ? { ...n, color } : n));
            }

            // Save to backend
            debouncedSaveNode(id, { color });
            return;
        }

        const connection = isCollaborativeMode
            ? connections.find(c => c.id === id)
            : connections.find(c => c.id === id);

        if (connection) {
            if (isCollaborativeMode) {
                collab.updateYCanvasConnection(id, { color: color });
            } else {
                updateConnections(prev => prev.map(c => c.id === id ? { ...c, color } : c));
            }

            saveConnectionData(id, { color });
        }
    }, [
        nodes,
        connections,
        isCollaborativeMode,
        collab,
        addToHistory,
        handleUpdateNote,
        updateNodes,
        updateConnections,
        debouncedSaveNode,
        saveConnectionData
    ]);


    const handleEmbedYoutube = useCallback(async (id: string, url: string) => {
        const videoId = extractYoutubeId(url);

        if (videoId) {
            addToHistory();
            if (isCollaborativeMode) {
                collab.updateYCanvasNode(id, {
                    type: 'youtube',
                    youtubeId: videoId,
                    mediaUrl: url,
                    width: 400,
                    height: 350
                });
            } else {
                updateNodes(prev => prev.map(n => n.id === id ? {
                    ...n,
                    type: 'youtube',
                    youtubeId: videoId,
                    mediaUrl: url,
                    width: 400,
                    height: 350
                } : n));
            }

            // Save to DB
            if (accessToken) {
                await apiService.saveNode(sessionId, id, {
                    node_type: 'youtube',
                    media_url: url,
                    youtube_id: videoId,
                    width: 400,
                    height: 350
                }, accessToken);
            }
        } else {
            toast.error("Invalid YouTube URL");
        }
    }, [accessToken, sessionId, addToHistory, isCollaborativeMode, collab, updateNodes]);


    const handleUploadPdf = useCallback((id: string, file: File) => {
        if (file.type !== 'application/pdf') return alert('Please upload a valid PDF file.');
        if (UserPlanID === 'free') return toast.error("Upgrade to Pro to upload files");
        if (!beginNodeOperation(id, 'uploading')) return toast.info('This node is already being updated');
        addToHistory();

        void (async () => {
            try {
                const base64Content = await readFileAsBase64(file);
                const data = await apiService.uploadFile(sessionId, { path: file.name, content: base64Content }, accessToken);
                const serverUrl = `${pythonUrl}${data.file.path}`;
                const s3Key = data.file.s3_key;
                const saved = await apiService.saveNode(sessionId, id, {
                    node_type: 'pdf',
                    s3_key: s3Key,
                    file_name: file.name,
                    width: 400,
                    height: 500
                }, accessToken);
                if (!saved) throw new Error('The PDF uploaded, but its canvas record could not be saved. Please retry.');

                if (isCollaborativeMode) {
                    collab.updateYCanvasNode(id, {
                        type: 'pdf',
                        pdfUrl: serverUrl,
                        s3Key: s3Key,
                        fileName: file.name,
                        // pdfFile: file.name,
                        width: 400,
                        height: 500
                    });
                } else {
                    updateNodes(prev => prev.map(n => n.id === id ? {
                        ...n,
                        type: 'pdf',
                        pdfUrl: serverUrl,
                        s3Key,
                        fileName: file.name,
                        pdfFile: file,
                        width: 400,
                        height: 500
                    } : n));
                }
                toast.success("PDF Uploaded Successfully");
            } catch (error) {
                console.error("Upload error:", error);
                toast.error(error instanceof Error ? error.message : "Failed to upload PDF");
            } finally {
                finishNodeOperation(id);
            }
        })();
    }, [accessToken, sessionId, addToHistory, isCollaborativeMode, collab, updateNodes, UserPlanID, beginNodeOperation, finishNodeOperation]);

    const handleUploadImage = useCallback((nodeId: string, file: File) => {
        if (UserPlanID === 'free') return toast.error("Upgrade to Pro to upload files");
        if (!beginNodeOperation(nodeId, 'uploading')) return toast.info('This node is already being updated');
        addToHistory();

        void (async () => {
            try {
                const base64Content = await readFileAsBase64(file);
                const data = await apiService.uploadFile(sessionId, { path: file.name, content: base64Content }, accessToken);
                const serverUrl = `${pythonUrl}${data.file.path}`;
                const s3Key = data.file.s3_key;
                const saved = await apiService.saveNode(sessionId, nodeId, {
                    node_type: 'image',
                    s3_key: s3Key,
                    file_name: file.name
                }, accessToken);
                if (!saved) throw new Error('The image uploaded, but its canvas record could not be saved. Please retry.');

                if (isCollaborativeMode) {
                    collab.updateYCanvasNode(nodeId, {
                        type: 'image',
                        imageUrl: serverUrl,
                        mediaUrl: serverUrl,
                        s3Key,
                        fileName: file.name
                    });
                } else {
                    updateNodes(prev => prev.map(n => nodeId === n.id ? {
                        ...n,
                        imageUrl: serverUrl,
                        mediaUrl: serverUrl,
                        s3Key,
                        type: 'image',
                        fileName: file.name
                    } : n));
                }
                toast.success("Image Uploaded");
            } catch (error) {
                console.error("Upload error:", error);
                toast.error(error instanceof Error ? error.message : "Failed to upload image");
            } finally {
                finishNodeOperation(nodeId);
            }
        })();
    }, [accessToken, sessionId, addToHistory, isCollaborativeMode, collab, updateNodes, UserPlanID, beginNodeOperation, finishNodeOperation]);

    const handleUploadEditorImage = useCallback(async (nodeId: string, file: File): Promise<{ url: string; s3Key: string } | null> => {
        if (!file.type.startsWith('image/')) {
            toast.error('Please choose a valid image file');
            return null;
        }
        if (UserPlanID === 'free') {
            toast.error('Upgrade to Pro to upload files');
            return null;
        }
        if (!beginNodeOperation(nodeId, 'uploading')) {
            toast.info('This node is already being updated');
            return null;
        }

        try {
            const base64Content = await readFileAsBase64(file);
            const data = await apiService.uploadFile(sessionId, {
                path: file.name,
                content: base64Content,
            }, accessToken);
            toast.success('Image uploaded');
            return { url: `${pythonUrl}${data.file.path}`, s3Key: data.file.s3_key };
        } catch (error) {
            console.error('Editor image upload error:', error);
            toast.error(error instanceof Error ? error.message : 'Failed to upload image');
            return null;
        } finally {
            finishNodeOperation(nodeId);
        }
    }, [accessToken, sessionId, UserPlanID, beginNodeOperation, finishNodeOperation]);


    // const getRenderNodes = () => {
    //     return nodes.map(node => {
    //         if (node.globalNoteId) {
    //             const globalNote = globalNotes.find(gn => gn.id === node.globalNoteId);
    //             if (globalNote) {
    //                 return {
    //                     ...node,
    //                     title: globalNote.title,
    //                     content: globalNote.content,
    //                     color: globalNote.color
    //                 };
    //             }
    //         }

    //         if (node.projectNoteId) {
    //             const isLoading = loadingRefIds.has(node.projectNoteId);
    //             const projectNote = projectNotes.find(pn => pn.session_id === node.projectNoteId);
    //             if (projectNote) {
    //                 const fullContent = projectNote.blocks
    //                     ?.map((b: any) => b.content)
    //                     .join('\n\n') || '';

    //                 return {
    //                     ...node,
    //                     title: projectNote.title,
    //                     content: fullContent,
    //                     isLoading: false
    //                 };
    //             }
    //             if (isLoading) {
    //                 return {
    //                     ...node,
    //                     content: '',
    //                     isLoading: true
    //                 };
    //             }
    //         }

    //         return { ...node, isLoading: false };
    //     });
    // };

    const renderNodes = useMemo(() => nodes.map(node => {
      // NEW: card placement -> join with its card
      if (node.kind === 'card' && node.cardId) {
        const card = cards[node.cardId];
        if (card) {
          const tags = card.tags ?? [];
          return {
            ...node, title: card.title, content: card.content, boardCount: card.boardCount, tags,
            dimmed: tagFilter.length > 0 && !tagFilter.every(t => tags.includes(t)),
            isLoading: false,
          };
        }
        return { ...node, content: '', isLoading: true };
      }
    
      // legacy global note branch (unchanged)
      if (node.globalNoteId) {
        const globalNote = globalNotes.find(gn => gn.id === node.globalNoteId);
        if (globalNote) {
          return { ...node, title: globalNote.title, content: globalNote.content, color: globalNote.color };
        }
      }
    
      // legacy project note branch (unchanged)
      if (node.projectNoteId) {
        const isLoading = loadingRefIds.has(node.projectNoteId);
        const projectNote = projectNotes.find(pn => pn.session_id === node.projectNoteId);
        if (projectNote) {
          const fullContent = projectNote.blocks?.map((b: any) => b.content).join('\n\n') || '';
          return { ...node, title: projectNote.title, content: fullContent, isLoading: false };
        }
        if (isLoading) return { ...node, content: '', isLoading: true };
      }
    
      return { ...node, isLoading: false };
    }), [nodes, cards, globalNotes, projectNotes, loadingRefIds, tagFilter]);
    
    useLayoutEffect(() => { nodesRef.current = renderNodes; }, [renderNodes]);
    const editingNode = renderNodes.find(n => n.id === editingNodeId);
    const workspaceChatContext = useMemo(
        () => workspaceChatAnchorId
            ? buildLiveCanvasChatContext(workspaceChatAnchorId, renderNodes, connections)
            : null,
        [workspaceChatAnchorId, renderNodes, connections]
    );

    useEffect(() => {
        if (isWorkspaceChatOpen && selectedId && selectedId !== workspaceChatAnchorId) {
            setWorkspaceChatAnchorId(selectedId);
        }
    }, [isWorkspaceChatOpen, selectedId, workspaceChatAnchorId]);

    useEffect(() => () => dockResizeCleanupRef.current?.(), []);

    const startDockResize = (pane: 'chat' | 'editor', event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dockResizeCleanupRef.current?.();

        const bounds = containerRef.current?.getBoundingClientRect();
        if (!bounds) return;

        const startX = event.clientX;
        const startChatWidth = workspaceChatWidth;
        const startEditorWidth = editingNodeId ? workspaceEditorWidth : 0;
        const startViewportX = viewport.x;
        const startDockWidth = startChatWidth + startEditorWidth;
        const hasEditorPane = Boolean(editingNodeId);
        const minCanvasWidth = hasEditorPane || bounds.width < 768 ? 0 : Math.min(280, bounds.width * 0.24);
        const minPaneWidth = bounds.width < 768 ? 160 : 320;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const handleMove = (moveEvent: PointerEvent) => {
            const delta = startX - moveEvent.clientX;
            let nextChatWidth = startChatWidth;
            let nextEditorWidth = startEditorWidth;

            if (pane === 'chat') {
                const maxChatWidth = hasEditorPane
                    ? Math.max(minPaneWidth, bounds.width - minPaneWidth)
                    : Math.max(minPaneWidth, bounds.width - minCanvasWidth);
                nextChatWidth = Math.min(maxChatWidth, Math.max(minPaneWidth, startChatWidth + delta));
                if (hasEditorPane) nextEditorWidth = Math.max(minPaneWidth, bounds.width - nextChatWidth);
            } else {
                const maxEditorWidth = Math.max(minPaneWidth, bounds.width - startChatWidth - minCanvasWidth);
                nextEditorWidth = Math.min(maxEditorWidth, Math.max(minPaneWidth, startEditorWidth + delta));
            }

            setWorkspaceChatWidth(nextChatWidth);
            if (editingNodeId) setWorkspaceEditorWidth(nextEditorWidth);
            setViewport(current => ({
                ...current,
                x: startViewportX - ((nextChatWidth + nextEditorWidth - startDockWidth) / 2),
            }));
        };

        const cleanup = () => {
            window.removeEventListener('pointermove', handleMove);
            window.removeEventListener('pointerup', cleanup);
            window.removeEventListener('pointercancel', cleanup);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            dockResizeCleanupRef.current = null;
        };

        dockResizeCleanupRef.current = cleanup;
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', cleanup);
        window.addEventListener('pointercancel', cleanup);
    };
    const editorLinkTargets = useMemo<NoteLinkTarget[]>(() => renderNodes.map(node => ({
      id: node.kind === 'card' && node.cardId ? node.cardId : node.id,
      title: node.title || 'Untitled',
      content: node.kind === 'card' && node.cardId ? cards[node.cardId]?.content || '' : node.content || '',
    })), [renderNodes, cards]);

    const openEditorLink = useCallback(async (targetId: string) => {
      const targetNode = nodesRef.current.find(node => node.cardId === targetId)
        || nodesRef.current.find(node => node.id === targetId);
      if (targetNode) {
        focusNode(targetNode.id);
        setEditingNodeId(null);
        return;
      }
      const targetCard = cards[targetId] || (await loadCards([targetId]))[0];
      if (targetCard) {
        setEditingNodeId(null);
        placeCard(targetCard);
      }
    }, [cards, focusNode, loadCards, placeCard]);

    const createNewNode = useCallback(async (
        options: {
            parentId?: string | null;
            type?: NodeData['type'];
            fileData?: any;
            asCard?: boolean;
            position?: { x: number; y: number };
            isGroup?: boolean;
        }
    ) => {
        const { parentId = null, type = 'text', fileData, asCard = false, position, isGroup = false } = options;

        const newNodeId = isGroup ? `g-${Date.now()}` : `n-${Date.now()}`;

        let calculatedX = 0;
        let calculatedY = 0;
        let parentNode: NodeData | undefined;
        let parentLevel = 0;

        if (parentId) {
            parentNode = isCollaborativeMode
                ? Array.from(collab.canvasNodes.values()).find(n => n.id === parentId)
                : nodes.find(n => n.id === parentId);

            if (parentNode) {
                parentLevel = parentNode.level;
                const siblings = isCollaborativeMode
                    ? Array.from(collab.canvasNodes.values()).filter(n => n.parentId === parentId)
                    : nodes.filter(n => n.parentId === parentId);

                if (isGroupNode(parentNode)) {
                    calculatedX = parentNode.x + GROUP_PADDING + 20;
                    calculatedY = parentNode.y + GROUP_HEADER_HEIGHT + 20 + (siblings.length * 60);
                } else {
                    calculatedX = parentNode.x + 450;
                    calculatedY = parentNode.y + (siblings.length * 220);
                }
            }
        } else if (position) {
            calculatedX = position.x;
            calculatedY = position.y;
        } else {
            calculatedX = (-viewport.x + (window.innerWidth / 2)) / scale - (isGroup ? 150 : 160);
            calculatedY = (-viewport.y + (window.innerHeight / 2)) / scale - 100;
        }

        const newNode: NodeData = {
            id: newNodeId,
            type: isGroup ? 'group' : type,
            title: fileData?.name || (isGroup ? 'New Group' : asCard ? 'New Card' : type === 'whiteboard' ? 'New Whiteboard' : 'New Node'),
            content: fileData
                ? fileData.content
                : type === 'whiteboard'
                    ? ''
                    : 'Click edit button to write',
            x: calculatedX,
            y: calculatedY,
            width: isGroup ? 300 : 420,
            height: isGroup ? 300 : type === 'whiteboard' ? 250 : (type === 'image' || type === 'pdf' ? 300 : 200),
            color: parentNode ? parentNode.color : (isGroup ? 'slate' : 'white'),
            parentId: parentId || undefined,
            childIds: [],
            level: parentLevel + 1,
            isExpanded: true,
            ...(fileData?.fileType && { fileType: fileData.fileType }),
            ...(fileData?.fileName && { fileName: fileData.fileName }),
            ...(fileData?.mediaUrl && { mediaUrl: fileData.mediaUrl }),
            ...(fileData?.pdfUrl && { pdfUrl: fileData.pdfUrl }),
            ...((fileData?.s3_key || fileData?.s3Key) && { s3Key: fileData.s3_key || fileData.s3Key }),
        };

        let newCard: Card | null = null;
        if (asCard && !isGroup && type === 'text') {
          const cardId = `card-${crypto.randomUUID()}`;
          newCard = { id: cardId, type: 'text', title: newNode.title, content: newNode.content, boardCount: 1 };
          newNode.kind = 'card';
          newNode.cardId = cardId;
          newNode.content = '';          // content now lives on the card
        }
        

        // Connection logic
        let newConnection: Connection | null = null;
        if (parentId && parentNode && !isGroupNode(parentNode)) {
            const newConnId = `c-${Date.now()}`;
            newConnection = {
                id: newConnId,
                fromId: parentId,
                toId: newNodeId,
                strokeStyle: 'solid',
                arrowType: 'end',
                color: parentNode.color || 'slate',
                label: ''
            };
        }

        addToHistory();
        
        if (newCard) upsertCards([newCard]);

        if (isCollaborativeMode) {
            // Convert to Y.js structure (FLAT x, y)
            const yNode = {
                id: newNode.id,
                type: newNode.type,
                x: newNode.x,
                y: newNode.y,
                width: newNode.width,
                height: newNode.height,
                content: newNode.content,
                title: newNode.title,
                parentId: newNode.parentId,
                childIds: newNode.childIds,
                level: newNode.level,
                color: newNode.color,
                isExpanded: newNode.isExpanded,
                ...(newNode.fileType && { fileType: newNode.fileType }),
                ...(newNode.fileName && { fileName: newNode.fileName }),
                ...(newNode.mediaUrl && { mediaUrl: newNode.mediaUrl }),
                ...(newNode.pdfUrl && { pdfUrl: newNode.pdfUrl }),
                ...(newNode.s3Key && { s3Key: newNode.s3Key }),
                ...(newNode.kind && { kind: newNode.kind }), 
                ...(newNode.cardId && { cardId: newNode.cardId }),
            };

            collab.addYCanvasNode(yNode as any);

            if (newConnection) {
                collab.addYCanvasConnection(newConnection);
            }
        } else {
            updateNodes(prev => [...prev, newNode]);
            if (newConnection) {
                updateConnections(prev => [...prev, newConnection]);
            }
        }

        setSelectedId(newNodeId);

        // Save to database
        try {
            if (!accessToken) {
                console.warn("No access token available, skipping save");
                return newNodeId;
            }

            await fetch(`${API_BASE_URL}/nodes`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    canvas_id: sessionId,
                    node_id: newNodeId,
                    branch_id: 'main',
                    parent_node_id: (parentNode && !isGroupNode(parentNode)) ? parentId : null,
                    group_id: (parentNode && isGroupNode(parentNode)) ? parentId : null,
                    node_type: newNode.type,
                    title: newNode.title,
                    content: newNode.content,
                    position_x: newNode.x,
                    position_y: newNode.y,
                    width: newNode.width,
                    height: newNode.height,
                    level: newNode.level,
                    color: newNode.color,
                    is_expanded: newNode.isExpanded,
                    file_type: fileData?.fileType,
                    file_name: fileData?.fileName,
                    media_url: (fileData?.s3_key || fileData?.s3Key) ? undefined : fileData?.mediaUrl,
                    pdfUrl: (fileData?.s3_key || fileData?.s3Key) ? undefined : fileData?.pdfUrl,
                    s3_key: fileData?.s3_key || fileData?.s3Key || '',
                    kind: newNode.kind || 'note',
                    card_id: newNode.cardId,
                    card: newCard ? {
                      card_id: newCard.id, card_type: newCard.type, title: newCard.title, content: newCard.content
                    } : undefined,
                    
                })
            });

            if (newConnection) {
                await fetch(`${API_BASE_URL}/connections`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        canvas_id: sessionId,
                        branch_id: 'main',
                        connection_id: newConnection.id,
                        from_node_id: newConnection.fromId,
                        to_node_id: newConnection.toId,
                        color: newConnection.color,
                        stroke_style: newConnection.strokeStyle,
                        arrow_type: newConnection.arrowType
                    })
                });
            }
        } catch (error) {
            console.error('Failed to save to database:', error);
        }

        return newNodeId;
    }, [nodes, viewport, scale, sessionId, userinfo, addToHistory, accessToken,

        updateNodes, updateConnections, API_BASE_URL, isCollaborativeMode, collab]);

    const convertToCard = useCallback(async (nodeId: string) => {
      if (!accessToken) return;
      const node = nodesRef.current.find(n => n.id === nodeId);
      if (!node || node.kind === 'card' || isGroupNode(node) || node.type !== 'text') return;
    
      // a pending debounced note save would overwrite the converted node
      if (nodeSaveTimeoutsRef.current[nodeId]) {
        clearTimeout(nodeSaveTimeoutsRef.current[nodeId]);
        delete nodeSaveTimeoutsRef.current[nodeId];
      }
    
      const cardId = `card-${crypto.randomUUID()}`;
      const card: Card = { id: cardId, type: 'text', title: node.title, content: node.content || '', boardCount: 1 };
    
      // optimistic update
      upsertCards([card]);
    //   setCards(prev => ({ ...prev, [cardId]: card }));
      if (isCollaborativeMode) {
        collab.updateYCanvasNode(nodeId, { kind: 'card', cardId, content: '' } as any);
      } else {
        updateNodes(prev => prev.map(n => n.id === nodeId ? { ...n, kind: 'card', cardId, content: '' } : n));
      }
    
      try {
        const res = await fetch(`${API_BASE_URL}/cards/convert`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            canvas_id: sessionId, branch_id: 'main', node_id: nodeId,
            card: { card_id: cardId, card_type: 'text', title: card.title, content: card.content }
          })
        });
        if (!res.ok) throw new Error(`convert failed: ${res.status}`);
        toast.success('Converted to card');
      } catch (err) {
        console.error(err);
        toast.error('Could not convert to card');
        // roll back
        removeCard(cardId);
        if (isCollaborativeMode) {
          collab.updateYCanvasNode(nodeId, { kind: 'note', cardId: undefined, content: card.content } as any);
        } else {
          updateNodes(prev => prev.map(n => n.id === nodeId ? { ...n, kind: 'note', cardId: undefined, content: card.content } : n));
        }
      }
    }, [accessToken, sessionId, isCollaborativeMode, collab, updateNodes]);

    const handleApplyNoteToSelection = useCallback(async (noteContent: string, messageId?: string) => {
      const selectedNode = nodesRef.current.find(node => node.id === selectedId);
      if (!selectedNode) {
        onApplyNote?.(noteContent, messageId);
        return;
      }

      const toEditorHtml = (content: string) => {
        const trimmedContent = content.trim();
        if (!trimmedContent) return '<p></p>';
        if (/<[a-z][\s\S]*>/i.test(trimmedContent)) return trimmedContent;
        return marked.parse(trimmedContent) as string;
      };

      if (isGroupNode(selectedNode)) {
        const newNodeId = await createNewNode({
          parentId: selectedNode.id,
          type: 'text',
          fileData: {
            name: 'AI Response',
            content: toEditorHtml(noteContent),
          },
        });
        openNodeEditor(newNodeId);
        toast.success('Knowledge added inside the group');
        return;
      }

      if (selectedNode.type === 'whiteboard' || selectedNode.projectNoteId) {
        toast.error('Knowledge Tap cannot add text directly to this node');
        return;
      }

      let existingContent = selectedNode.content || '';
      if (selectedNode.kind === 'card' && selectedNode.cardId) {
        const card = cards[selectedNode.cardId] ?? (await loadCards([selectedNode.cardId]))[0];
        if (!card) {
          toast.error('Could not load the selected card');
          return;
        }
        existingContent = card.content || '';
      }

      const hasPlaceholderContent = existingContent.trim() === 'Click edit button to write';
      const existingHtml = hasPlaceholderContent ? '' : toEditorHtml(existingContent);
      const responseHtml = toEditorHtml(noteContent);
      const combinedContent = existingHtml
        ? `${existingHtml}<p></p>${responseHtml}`
        : responseHtml;

      handleUpdateNodeContent(selectedNode.id, combinedContent);
      openNodeEditor(selectedNode.id);
      toast.success(selectedNode.kind === 'card' ? 'Knowledge added to card' : 'Knowledge added to node');
    }, [selectedId, nodesRef, onApplyNote, createNewNode, cards, loadCards, handleUpdateNodeContent, openNodeEditor]);
    
    const handleCreateNode = () => {
        createNewNode({ type: 'text' });
    };

    const handleCreateGroup = () => {
        createNewNode({ type: 'group', isGroup: true });
    };

    const handleCreateCard = () => createNewNode({ type: 'text', asCard: true });
    const handleCreateWhiteboard = () => createNewNode({ type: 'whiteboard' });
    const handleAddChildNode = (parentId: string) => {
        createNewNode({ parentId, type: 'text' });
    };

    const handleStartConnect = (nodeId: string) => {
        setConnectingNodeId(nodeId);
        setSelectedId(nodeId);
    };

    const handleCancelConnect = () => {
        setConnectingNodeId(null);
    };

    const handleUpdateConnectionLabel = (id: string, label: string) => {
        // Update in collab or local state IMMEDIATELY (no debounce needed for visual feedback)
        if (isCollaborativeMode) {
            collab.updateYCanvasConnection(id, { label });
        } else {
            updateConnections(prev => prev.map(c => c.id === id ? { ...c, label } : c));
        }

        // Debounce the API call
        if (connectionSaveTimeoutsRef.current[id]) {
            clearTimeout(connectionSaveTimeoutsRef.current[id]);
        }

        connectionSaveTimeoutsRef.current[id] = setTimeout(() => {
            saveConnectionData(id, { label });
            delete connectionSaveTimeoutsRef.current[id];
        }, 1000);
    };

    const handleUpdateConnectionStyle = (id: string, style: ConnectionStyle) => {
        addToHistory();

        if (isCollaborativeMode) {
            collab.updateYCanvasConnection(id, { strokeStyle: style });
        } else {
            updateConnections(prev => prev.map(c => c.id === id ? { ...c, strokeStyle: style } : c));
        }

        saveConnectionData(id, { stroke_style: style });
    };

    const handleUpdateConnectionArrow = (id: string, arrow: ConnectionArrow) => {
        addToHistory();

        if (isCollaborativeMode) {
            collab.updateYCanvasConnection(id, { arrowType: arrow });
        } else {
            updateConnections(prev => prev.map(c => c.id === id ? { ...c, arrowType: arrow } : c));
        }

        saveConnectionData(id, { arrow_type: arrow });
    };

    const selectedNode = renderNodes.find(n => n.id === selectedId);
    const selectedConnection = connections.find(c => c.id === selectedId);
    const selectedObject = selectedNode || selectedConnection;
    const isSelectedType = selectedNode
      ? (selectedNode.kind === 'card' ? 'Card' : selectedNode.globalNoteId ? 'Ref. Node' : isGroupNode(selectedNode) ? 'Group' : selectedNode.type === 'whiteboard' ? 'Whiteboard' : 'Node')
      : (selectedConnection ? 'Connection' : '');


    const selectedCard =
      selectedNode?.kind === 'card' && selectedNode.cardId ? cards[selectedNode.cardId] : undefined;
    
    
      
    const menuPosition = useMemo(() => {
        if (!selectedId) return null;

        const node = nodes.find(n => n.id === selectedId);
        if (node) {
            const screenX = (node.x * scale) + viewport.x + (node.width * scale) / 2;
            const screenY = (node.y * scale) + viewport.y;
            return { x: screenX, y: Math.max(10, screenY - (isGroupNode(node) ? 60 : 20)) };
        }

        const conn = connections.find(c => c.id === selectedId);
        if (conn) {
            const p1 = getNodeCenter(conn.fromId, nodes);
            const p2 = getNodeCenter(conn.toId, nodes);
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;

            return {
                x: (midX * scale) + viewport.x,
                y: Math.max(10, (midY * scale) + viewport.y - 40)
            };
        }

        return null;
    }, [selectedId, nodes, connections, scale, viewport, getNodeCenter]);

    const nodeMap = useNodeMap(renderNodes);
    const visibleNodes = renderNodes;
    const visibleConnections = useConnectionVirtualization(connections, nodeMap, viewport, scale);
    const transform = useCanvasTransform(viewport, scale);
    const visibleGroups = visibleNodes.filter(n => isGroupNode(n));
    const visibleRegularNodes = visibleNodes.filter(n => !isGroupNode(n));


    useEffect(() => {
        const fetchCanvasState = async () => {
            if (!sessionId || !user?.accessToken) return;

            try {
                // 1. Fetch the Canvas Structure
                const response = await fetch(
                    `${API_BASE_URL}/state/${sessionId}?branch_id=main`,
                    {
                        headers: {
                            'Authorization': `Bearer ${user.accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.ok) {
                    const data = await response.json();

                    const projectNoteIdsToFetch = new Set<string>();

                    const restoredNodes = await Promise.all(data.nodes.map(async (node: any) => {

                        if (node.project_note_id) {
                            projectNoteIdsToFetch.add(node.project_note_id);
                        }

                        let pdfUrl = node?.pdfUrl || node?.pdf_url || node?.media_url;
                        let mediaUrl = node?.media_url || node?.image_url;

                        if (node?.s3_key && node?.node_type === 'pdf') {
                            const downloadedUrl = await downloadFileToWorkspace(node.s3_key);
                            if (downloadedUrl) pdfUrl = downloadedUrl;
                        }
                        else if (node?.s3_key && (node?.node_type === 'image' || node?.node_type === 'media')) {
                            const downloadedUrl = await downloadFileToWorkspace(node?.s3_key);
                            if (downloadedUrl) mediaUrl = downloadedUrl;
                        }
                        let restoredPdfSource = undefined;

                        if (node.metadata) {
                            const metadata = typeof node.metadata === 'string'
                                ? JSON.parse(node.metadata)
                                : node.metadata;

                            if (metadata.pdfSource) {
                                restoredPdfSource = {
                                    ...metadata.pdfSource,
                                    fileUrl: pdfUrl || metadata.pdfSource.fileUrl,
                                };
                            }
                        }

                        const storedContent = (node.project_note_id || node.card_id) ? '' : (node.content || '');
                        const content = await restoreInlineImageSources(storedContent, user?.accessToken);

                        let youtubeId = undefined;
                        if (node.node_type === 'youtube' && node?.media_url) {
                            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
                            const match = node.media_url.match(regExp);
                            youtubeId = (match && match[2].length === 11) ? match[2] : null;
                        }

                        return {
                            id: node.node_id,
                            type: node.node_type,
                            title: node.title,
                            content,
                            x: node.position_x,
                            y: node.position_y,
                            width: node.width || 420,
                            height: node.height || 200,
                            color: node.color,
                            parentId: node.parent_node_id,
                            childIds: [],
                            level: node.level,
                            isExpanded: node.is_expanded,
                            fileType: node.file_type,
                            fileName: node.file_name,
                            imageUrl: mediaUrl,
                            pdfUrl: pdfUrl,
                            fileName: node.file_name,
                            s3Key: node.s3_key,
                            youtubeId: youtubeId,
                            projectNoteId: node.project_note_id,
                            globalNoteId: node.global_note_id,
                            pdfSource: restoredPdfSource,
                            kind: node.kind === 'card' ? 'card' : 'note',                            // add
                            cardId: node.card_id,                                                    // add
                        };
                    }));

                    data.nodes.forEach((node: any) => {
                        if (node.parent_node_id) {
                            const parent = restoredNodes.find((n: NodeData) => n.id === node.parent_node_id);
                            if (parent && !parent.childIds.includes(node.node_id)) {
                                parent.childIds.push(node.node_id);
                            }
                        }
                    });

                    const restoredConnections = data.connections.map((conn: any) => ({
                        id: conn.connection_id || `c-${conn.from_node_id}-${conn.to_node_id}`,
                        fromId: conn.from_node_id,
                        toId: conn.to_node_id,
                        color: conn.color || 'slate',
                        strokeStyle: conn.stroke_style || 'solid',
                        arrowType: conn.arrow_type || 'end',
                        label: conn.label || ''
                    }));

                    if (isCollaborativeMode) {
                        // Populate Y.js with fetched data
                        restoredNodes.forEach(node => {
                            collab.addYCanvasNode({
                                id: node.id,
                                type: node.type,
                                x: node.x,
                                y: node.y,
                                width: node.width,
                                height: node.height,
                                content: node.content,
                                title: node.title,
                                parentId: node.parentId,
                                childIds: node.childIds,
                                level: node.level,
                                color: node.color,
                                isExpanded: node.isExpanded,
                                ...(node.fileType && { fileType: node.fileType }),
                                ...(node.fileName && { fileName: node.fileName }),
                                ...(node.imageUrl && { mediaUrl: node.imageUrl }),
                                ...(node.pdfUrl && { pdfUrl: node.pdfUrl }),
                                ...(node.s3Key && { s3Key: node.s3Key }),
                                ...(node.youtubeId && { youtubeId: node.youtubeId }),
                                ...(node.projectNoteId && { projectNoteId: node.projectNoteId }),
                                ...(node.globalNoteId && { globalNoteId: node.globalNoteId }),
                                ...(node.pdfSource && { pdfSource: node.pdfSource }),
                                ...(node.kind && { kind: node.kind }),
                                ...(node.cardId && { cardId: node.cardId }),
                            } as any);
                        });

                        restoredConnections.forEach(conn => {
                            collab.addYCanvasConnection(conn);
                        });

                    } else {
                        setLocalNodes(restoredNodes);
                        setLocalConnections(restoredConnections);
                    }

                    if (projectNoteIdsToFetch.size > 0) {
                        setLoadingRefIds(new Set(projectNoteIdsToFetch));
                        try {
                            const batchResponse = await fetch(`${API_BASE_URL}/project-notes/batch-fetch`, {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${user.accessToken}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    session_ids: Array.from(projectNoteIdsToFetch)
                                })
                            });

                            if (batchResponse.ok) {
                                const notesData = await batchResponse.json();
                                setProjectNotes(prev => {
                                    const newNotes = notesData.filter((n: any) =>
                                        !prev.some(p => p.session_id === n.session_id)
                                    );
                                    return [...prev, ...newNotes];
                                });
                            }
                        } catch (err) {
                            console.error("❌ Failed to batch fetch note content", err);
                        } finally {
                            setLoadingRefIds(new Set());
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching canvas state:', error);
            }
        };

        fetchCanvasState();
    }, [sessionId, user?.accessToken, isCollaborativeMode, downloadFileToWorkspace]);

    const renderCollaborativeStatus = useMemo(() => {
        if (!isCollaborativeMode) return null;

        const activeCollaborators = collab.getActiveCollaborators();

        return (
            <div className="absolute top-4 left-4 bg-green-500/90 text-white px-4 py-2 rounded-lg backdrop-blur-sm shadow-lg flex items-center space-x-2 z-50">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>Live Collaboration</span>
                <span className="text-xs opacity-75">
                    ({activeCollaborators.length} active)
                </span>
            </div>
        );
    }, [isCollaborativeMode, collab]);

    const renderStreamingIndicator = useMemo(() => {
        if (!streamingState.current?.isStreaming) return null;

        return (
            <div className="absolute bottom-4 left-4 bg-blue-500/90 text-white px-4 py-2 rounded-lg backdrop-blur-sm shadow-lg flex items-center space-x-2 z-50">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>AI is responding...</span>
                {streamingState.current?.currentStreamingNodeId && (
                    <span className="text-xs opacity-75">
                        (Node: {streamingState.current.currentStreamingNodeId.slice(-8)})
                    </span>
                )}
            </div>
        );
    }, [streamingState]);

    if (!socketReady) {
        return (
            <div className="h-screen w-full bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 border-4 border-purple-500/30 border-t-purple-500 rounded-full animate-spin"></div>
                        </div>
                    </div>
                    <h3 className="text-white text-lg font-semibold mb-2">
                        Connecting to Canvas Workspace
                    </h3>
                    <p className="text-gray-400 text-sm">
                        Establishing real-time connection...
                    </p>
                    {socket && (
                        <div className="mt-4 text-xs text-gray-500">
                            Socket State: {
                                socket.readyState === 0 ? '🔄 Connecting...' :
                                    socket.readyState === 1 ? '✅ Open' :
                                        socket.readyState === 2 ? '⏳ Closing' :
                                            '❌ Closed'
                            }
                        </div>
                    )}
                </div>
            </div>
        );
    }
    
    return (

            <div
                ref={containerRef}
                className={`w-full h-full overflow-hidden bg-canvas bg-dot-pattern relative 
                    ${connectingNodeId ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}
                    `}
                    style={{
                        backgroundColor: '#ffffff',
                        backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
                        backgroundSize: '20px 20px'
                    }}
                    onWheel={handleWheel}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseDown={(e) => handleMouseDown(e, 'canvas', null)}
                    onDragOver={(e) => {
                        e.preventDefault();
                        if (Array.from(e.dataTransfer.types).includes('application/card')) {
                            e.dataTransfer.dropEffect = 'link';
                        }
                    }}
                    onDrop={handleDropOnCanvas}
                    >
               
                <NotesSidebar
                    isOpen={isSidebarOpen}
                    notes={globalNotes}
                    onAddNote={handleCreateNote}
                    onUpdateNote={handleUpdateNote}
                    onDeleteNote={handleDeleteNote}
                    onClose={() => setIsSidebarOpen(false)}
                    projectId={projectInfo?.projectId}
                    userInfo={userinfo}
                    searchCards={search}
                    searchTags={searchTags}
                />

                {renderCollaborativeStatus}
                {renderStreamingIndicator}
                <TagFilterBar
                  tags={boardTags} active={tagFilter}
                  onToggle={t => setTagFilter(p => p.includes(t) ? p.filter(x => x !== t) : [...p, t])}
                  onClear={() => setTagFilter([])}
                />
                
                {selectedCard && (
                  <CardMetaPanel
                    card={selectedCard} suggestions={suggestTags} refreshKey={linksVersion}
                    onTagsChange={t => updateTags(selectedCard.id, t)}
                    getLinks={getLinks} getBoards={getBoards}
                    currentBoard={{ canvas_id: sessionId, title: projectInfo?.title || sessionId, node_id: selectedNode?.id || '' }}
                    onOpenCard={openCard} onOpenBoard={openBoard}
                    onAddLink={() => setPaletteMode('link')} onRemoveLink={removeLink}
                  />
                )}
                
                <CardSearchPalette
                  open={!!paletteMode} mode={paletteMode ?? 'add'} onClose={() => setPaletteMode(null)}
                  search={search} suggestTags={suggestTags}
                  onPick={async card => {
                    if (paletteMode === 'link' && selectedCard) await addLink(selectedCard.id, card.id);
                    else placeCard(card);
                    setPaletteMode(null);
                  }}
                />
                {connectingNodeId && (
                    <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg z-[60] flex items-center gap-3 animate-in slide-in-from-top-2">
                        <span className="text-sm font-medium">Click a target Node or Group to link</span>
                        <button onClick={handleCancelConnect} className="hover:bg-blue-700 rounded-full p-1">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {(selectedObject || selectedConnection) && !connectingNodeId && menuPosition && (
                    <div
                        className="absolute z-50 flex flex-col items-center gap-2 min-w-[200px] animate-in fade-in zoom-in-95 duration-200"
                        style={{
                            left: menuPosition.x,
                            top: menuPosition.y,
                            transform: 'translate(-50%, -100%)'
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <div className="bg-white shadow-xl shadow-gray-200/50 rounded-xl p-2.5 border border-gray-100 flex flex-col items-center gap-2 w-full">

                            <div className="flex items-center justify-between w-full">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1">{isSelectedType}</span>
                                <button onClick={handleDelete} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors" title="Delete">
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {selectedObject && (
                                <div className="flex gap-1.5 flex-wrap justify-center px-1">
                                    {(['white', 'slate', 'red', 'green', 'blue', 'yellow', 'orange', 'purple'] as ColorTheme[]).map(color => (
                                        <button
                                            key={color}
                                            onClick={() => handleChangeColor(selectedObject.id, color)}
                                            className={`w-5 h-5 rounded-full border border-black/5 transition-transform hover:scale-110 ${COLORS[color].split(' ')[0].replace('border-', 'bg-')} ${selectedObject.color === color || (selectedConnection && selectedConnection.color === color) ? 'ring-1 ring-gray-900 ring-offset-1' : ''}`}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            )}
                            {selectedNode && (
                                <div className="w-full pb-2 border-b border-gray-100">
                                    {(selectedNode.projectNoteId || selectedNode.globalNoteId) ? (
                                        <button
                                            onClick={() => openNodeEditor(selectedNode.id)}
                                            className="flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                                        >
                                            <BookOpen size={14} />
                                            <span>Read Note</span>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => openNodeEditor(selectedNode.id)}
                                            className="flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-100 transition-colors"
                                        >
                                            {selectedNode.type === 'whiteboard' ? <Paintbrush size={14} /> : <FileText size={14} />}
                                            <span>{selectedNode.type === 'whiteboard' ? 'Open Whiteboard' : 'Edit Text'}</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {selectedConnection && (
                                <div className="w-full flex flex-col gap-2">
                                    <div className="flex items-center gap-1 justify-between p-1 bg-gray-50 rounded-lg border border-gray-200">
                                        <div className="flex gap-0.5 border-r border-gray-200 pr-1">
                                            <button onClick={() => handleUpdateConnectionStyle(selectedConnection.id, 'solid')} className={`p-1 rounded ${(!selectedConnection.strokeStyle || selectedConnection.strokeStyle === 'solid') ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="Solid"><MinusIcon size={14} /></button>
                                            <button onClick={() => handleUpdateConnectionStyle(selectedConnection.id, 'dashed')} className={`p-1 rounded ${selectedConnection.strokeStyle === 'dashed' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="Dashed"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h2" /><path d="M11 12h2" /><path d="M17 12h2" /></svg></button>
                                            <button onClick={() => handleUpdateConnectionStyle(selectedConnection.id, 'dotted')} className={`p-1 rounded ${selectedConnection.strokeStyle === 'dotted' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="Dotted"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h.01" /><path d="M12 12h.01" /><path d="M19 12h.01" /></svg></button>
                                        </div>

                                        <div className="flex gap-0.5">
                                            <button onClick={() => handleUpdateConnectionArrow(selectedConnection.id, 'none')} className={`p-1 rounded ${selectedConnection.arrowType === 'none' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="No Arrow"><div className="w-3 h-0.5 bg-current rounded-full"></div></button>
                                            <button onClick={() => handleUpdateConnectionArrow(selectedConnection.id, 'end')} className={`p-1 rounded ${(!selectedConnection.arrowType || selectedConnection.arrowType === 'end') ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="End Arrow"><ArrowRight size={14} /></button>
                                            <button onClick={() => handleUpdateConnectionArrow(selectedConnection.id, 'both')} className={`p-1 rounded ${selectedConnection.arrowType === 'both' ? 'bg-white shadow-sm text-blue-500' : 'text-gray-400 hover:text-gray-600'}`} title="Double Arrow"><MoveHorizontal size={14} /></button>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Label..."
                                        style={{ color: "black" }}
                                        value={selectedConnection.label || ''}
                                        onChange={(e) => handleUpdateConnectionLabel(selectedConnection.id, e.target.value)}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full px-2 py-1 border rounded-md text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-200 transition-all text-gray-900 placeholder:text-gray-400"
                                    />
                                </div>
                            )}

                            {selectedNode && selectedNode.kind !== 'card' && selectedNode.type === 'text' && !isGroupNode(selectedNode)
                              && !selectedNode.projectNoteId && !selectedNode.globalNoteId && (
                              <button
                                onClick={() => convertToCard(selectedNode.id)}
                                className="mt-1.5 flex items-center justify-center gap-2 w-full px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 transition-colors"
                              >
                                <Layers size={14} />
                                <span>Convert to card</span>
                              </button>
                            )}
                        </div>
                    </div>
                )}

                <div
                    className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40"
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <div className="bg-white shadow-lg shadow-gray-200/50 rounded-2xl p-2 flex flex-col gap-2 border border-gray-100">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={`p-2 rounded-xl transition-colors ${isSidebarOpen ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-600'}`}
                            title="References"
                        >
                            <BookOpen size={20} />
                        </button>
                        <div className="h-[1px] w-full bg-gray-100 mx-auto w-4/5"></div>
                        <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-gray-50 rounded-xl text-gray-600 disabled:opacity-30 transition-colors" title="Undo">
                            <Undo2 size={20} />
                        </button>
                        <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-gray-50 rounded-xl text-gray-600 disabled:opacity-30 transition-colors" title="Redo">
                            <Redo2 size={20} />
                        </button>
                        <button onClick={handleCreateCard} className="p-2 hover:bg-emerald-50 hover:text-emerald-600 rounded-xl text-gray-600 transition-colors" title="Create Card">
                          <Layers size={20} />
                        </button>                        

                        <div className="h-[1px] w-4/5 bg-gray-100 my-1"></div>
                        <button
                            onClick={handleResetView}
                            className="p-2 hover:bg-blue-50 text-gray-600 hover:text-blue-600 rounded-xl transition-colors"
                            title="Reset View"
                        >
                            <LocateFixed size={18} />
                        </button>

                    </div>

                    <div className="bg-white shadow-lg shadow-gray-200/50 rounded-2xl p-2 flex flex-col gap-2 border border-gray-100">
                        <button onClick={handleCreateNode} className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-xl text-gray-600 transition-colors" title="Create Node">
                            <StickyNote size={20} />
                        </button>
                        <button onClick={handleCreateWhiteboard} className="p-2 hover:bg-violet-50 hover:text-violet-600 rounded-xl text-gray-600 transition-colors" title="Create Whiteboard">
                            <Paintbrush size={20} />
                        </button>
                        <button onClick={handleCreateGroup} className="p-2 hover:bg-purple-50 hover:text-purple-600 rounded-xl text-gray-600 transition-colors" title="Create Group">
                            <LayoutGrid size={20} />
                        </button>
                    </div>

                    <div className="bg-white shadow-lg shadow-gray-200/50 rounded-2xl p-2 flex flex-col gap-2 border border-gray-100 items-center">
                        <button onClick={() => setScale(s => Math.min(2, s + 0.1))} className="p-2 hover:bg-gray-50 rounded-xl text-gray-600"><Plus size={18} /></button>
                        <div className="text-[10px] font-mono text-gray-400 font-medium select-none">{Math.round(scale * 100)}%</div>
                        <button onClick={() => setScale(s => Math.max(0.2, s - 0.1))} className="p-2 hover:bg-gray-50 rounded-xl text-gray-600"><Minus size={18} /></button>
                    </div>

                    <div className="bg-white shadow-lg shadow-gray-200/50 rounded-2xl p-2 flex flex-col gap-2 border border-gray-100">
                        <button className={`p-2 rounded-xl transition-colors ${dragState.type === 'canvas' ? 'text-blue-500 bg-blue-50' : 'text-gray-400'}`} title="Pan Tool">
                            <Move size={20} />
                        </button>
                    </div>
                </div>

                {!isWorkspaceChatOpen && <button
                    type="button"
                    onMouseDown={event => event.stopPropagation()}
                    onClick={() => {
                        const selectedNode = renderNodes.find(node => node.id === selectedId);
                        const selectedContext = selectedNode
                            ? buildLiveCanvasChatContext(selectedNode.id, renderNodes, connections)
                            : null;
                        const contextSentOnOpen = !!selectedContext && socket?.readyState === WebSocket.OPEN;
                        if (contextSentOnOpen && selectedContext) {
                            socket!.send(JSON.stringify({
                                type: 'canvas_context_update',
                                content: { canvas_context: selectedContext.snapshot },
                            }));
                        }
                        setWorkspaceChatContextSentOnOpen(contextSentOnOpen);
                        setWorkspaceChatAnchorId(selectedNode?.id || null);
                        const bounds = containerRef.current?.getBoundingClientRect();
                        const chatWidth = bounds
                            ? (bounds.width < 768
                                ? bounds.width * 0.65
                                : Math.min(560, Math.max(320, bounds.width * 0.36)))
                            : 0;
                        const minCanvasWidth = bounds && !editingNodeId && bounds.width >= 768
                            ? Math.min(280, bounds.width * 0.24)
                            : 0;
                        const editorWidth = editingNodeId && bounds
                            ? getDockedEditorWidth(bounds.width, chatWidth)
                            : 0;
                        if (editingNodeId) setWorkspaceEditorWidth(editorWidth);
                        setWorkspaceChatWidth(chatWidth);
                        setViewport(current => ({ ...current, x: current.x - (chatWidth + editorWidth) / 2 }));
                        setIsWorkspaceChatOpen(true);
                    }}
                    className="absolute bottom-12 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-800 shadow-xl transition hover:bg-gray-50"
                >
                    <AtomIcon size={17} className="text-blue-600" />
                    AgentOS
                </button>}

                {isWorkspaceChatOpen && (
                    <section
                        className="fixed inset-y-0 right-0 z-[70] flex flex-col border-l border-gray-200 bg-canvas bg-dot-pattern shadow-2xl"
                        style={{
                            width: workspaceChatWidth,
                            backgroundColor: '#ffffff',
                            backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                        }}
                        onMouseDown={event => event.stopPropagation()}
                        onMouseMove={event => event.stopPropagation()}
                        onWheel={event => event.stopPropagation()}
                        onDragOver={event => event.stopPropagation()}
                        onDrop={event => event.stopPropagation()}
                    >
                        <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4 text-slate-800">
                            <div className="min-w-0 truncate text-sm font-semibold">
                                Workspace chat{workspaceReaderContext ? ` · ${workspaceReaderContext.title}` : workspaceChatContext ? ` · ${workspaceChatContext.anchor_title}` : ''}
                            </div>
                            {workspaceChatContext && (
                                <span className="mr-3 shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                                    Live canvas context
                                </span>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    if (socket?.readyState === WebSocket.OPEN) {
                                        socket.send(JSON.stringify({ type: 'canvas_context_clear', content: {} }));
                                    }
                                    const editorWidth = editingNodeId ? workspaceEditorWidth : 0;
                                    setViewport(current => ({
                                        ...current,
                                        x: current.x + (workspaceChatWidth + editorWidth) / 2,
                                    }));
                                    setWorkspaceChatWidth(0);
                                    setIsWorkspaceChatOpen(false);
                                    setWorkspaceChatAnchorId(null);
                                    setWorkspaceChatContextSentOnOpen(false);
                                    setWorkspaceReaderContext(null);
                                }}
                                className="rounded-md p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                aria-label="Close workspace chat"
                            >
                                <X size={18} />
                            </button>
                        </header>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            <AICollaborate
                                sessionId={sessionId}
                                socket={socket}
                                workspaceInfoFromHome={workspaceInfoFromHome}
                                projectInfo={projectInfo}
                                projectContext={projectContext}
                                onAgentModeChange={onAgentModeChange}
                                currentAgentMode={currentAgentMode}
                                currentAgentType={currentAgentType}
                                onApplyNote={handleApplyNoteToSelection}
                                onModelChange={onModelChange}
                                currentModel={selectedModel}
                                userinfo={userinfo}
                                canvasContext={workspaceChatContext}
                                canvasContextSentOnOpen={workspaceChatContextSentOnOpen}
                                readerContext={workspaceReaderContext}
                                compact
                            />
                        </div>
                    </section>
                )}

                {isWorkspaceChatOpen && (
                    <>
                        <button
                            type="button"
                            className="fixed inset-y-0 z-[85] w-2 cursor-col-resize touch-none bg-gray-500/20 transition-colors hover:bg-blue-400/50 active:bg-blue-500/70"
                            style={{ right: Math.max(0, workspaceChatWidth - 4) }}
                            onPointerDown={event => startDockResize('chat', event)}
                            aria-label={editingNodeId ? 'Resize editor and AI chat split' : 'Resize AI chat width'}
                            title={editingNodeId ? 'Drag to resize the editor and chat split' : 'Drag to resize AI chat'}
                        />
                    </>
                )}

                <div
                    className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-200"
                    style={{
                        width: !isWorkspaceChatOpen
                            ? '100%'
                            : editingNodeId
                                ? '0px'
                                : `max(0px, calc(100% - ${workspaceChatWidth}px))`
                    }}
                >
                  <div
                    className="origin-top-left w-full h-full select-none"
                    style={{
                        transform,
                        transformOrigin: '0 0',
                    }}
                  >
                    {visibleGroups.map(group => (
                        <GroupContainer
                            key={group.id}
                            group={group}
                            nodes={renderNodes}
                            onMouseDown={(e, id) => handleMouseDown(e, 'node', id)}
                            onSelect={setSelectedId}
                            onRename={(id, title) => handleUpdateNodeTitle(id, title)}
                            onStartConnect={handleStartConnect}
                            isSelected={selectedId === group.id}
                            operationStatus={nodeOperations[group.id]}
                        />
                    ))}

                    <ConnectionLayer
                        nodes={visibleNodes}
                        groups={visibleGroups}
                        connections={visibleConnections}
                        pendingConnection={connectingNodeId ? { fromId: connectingNodeId, toPos: mousePos } : null}
                        onSelect={setSelectedId}
                        selectedId={selectedId}
                    />

                    {visibleRegularNodes.map(node => (
                        <NodeCard
                            key={node.id}
                            node={node}
                            scale={scale}
                            isSelected={selectedId === node.id}
                            onMouseDown={(e, id) => handleMouseDown(e, 'node', id)}
                            onSelect={setSelectedId}
                            onChangeColor={handleChangeColor}
                            onAddChild={handleAddChildNode}
                            onUploadImage={handleUploadImage}
                            onStartConnect={handleStartConnect}
                            onUpdateContent={handleUpdateNodeContent}
                            onUpdateTitle={handleUpdateNodeTitle}
                            onUpdateSize={handleUpdateNodeSize}
                            onEmbedYoutube={handleEmbedYoutube}
                            onUploadPdf={handleUploadPdf}
                            onEditContent={openNodeEditor}
                            onOpenPDFReader={handleOpenPDFReader}
                            onOpenSource={handleOpenSource}
                            onOpenLink={openEditorLink}
                            operationStatus={nodeOperations[node.id]}
                        />
                    ))}
                  </div>
                </div>
                {!isWorkspaceChatOpen && <Minimap
                    nodes={renderNodes} // Use renderNodes so it includes filtered/processed nodes
                    viewport={viewport}
                    scale={scale}
                    setViewport={setViewport}
                    screenWidth={windowSize.w}
                    screenHeight={windowSize.h}
                />}
                {editingNode && (
                    editingNode.type === 'whiteboard' ? (
                        <WhiteboardEditorSidebar
                            nodeId={editingNode.id}
                            title={editingNode.title}
                            content={editingNode.content || ''}
                            isOpen={!!editingNodeId}
                            onClose={() => setEditingNodeId(null)}
                            onWhiteboardChange={(changes) => handleUpdateWhiteboard(editingNode.id, changes)}
                            dockOffsetPx={isWorkspaceChatOpen ? workspaceChatWidth : 0}
                            widthPx={workspaceEditorWidth}
                        />
                    ) : editingNode.projectNoteId ? (
                        <SessionNoteEditor
                            sessionId={editingNode.projectNoteId}
                            rightOffsetPx={isWorkspaceChatOpen ? workspaceChatWidth + 8 : 8}
                            widthPx={workspaceEditorWidth}
                            onClose={() => {
                                setEditingNodeId(null);
                            }}
                        />
                    ) : (
                        <EditorSidebar
                            nodeId={editingNode.kind === 'card' && editingNode.cardId ? editingNode.cardId : editingNode.id}
                            title={editingNode.title}
                            content={editingNode.content}
                            accessToken={accessToken}
                            model={selectedModel}
                            onContentChange={(html) => handleUpdateNodeContent(editingNode.id, html)}
                            onUploadImage={(file) => handleUploadEditorImage(editingNode.id, file)}
                            isOpen={!!editingNodeId}
                            onClose={() => setEditingNodeId(null)}
                            linkTargets={editorLinkTargets}
                            onOpenLink={openEditorLink}
                            dockOffsetPx={isWorkspaceChatOpen ? workspaceChatWidth : 0}
                            widthPx={workspaceEditorWidth}
                            onExploreInDepth={() => {
                                onExploreInDepth?.({ title: editingNode.title || 'Untitled', content: editingNode.content || '' });
                                setEditingNodeId(null);
                            }}
                        />
                    )
                )}

                {pdfReaderVisible && activePDFNode && (() => {
                    const pdfNode = nodes.find(n => n.id === activePDFNode);
                    const occupiedRightPx =
                        (isWorkspaceChatOpen ? workspaceChatWidth : 0) +
                        (editingNodeId ? workspaceEditorWidth + (editingNode?.projectNoteId ? 8 : 0) : 0);

                    if (pdfNode && pdfNode.pdfUrl) {
                        return (
                            <div
                                className="absolute top-0 h-full bg-white shadow-2xl z-50 border-l border-gray-200 transition-[right,width] duration-300 ease-in-out"
                                style={{
                                    right: `${occupiedRightPx}px`,
                                    width: `min(${isPDFReaderExpanded ? '70%' : '40%'}, max(0px, calc(100% - ${occupiedRightPx}px)))`,
                                }}
                            >
                                <div className="h-full flex flex-col">
                                    <div className="bg-gray-900 text-white p-4 flex items-center justify-between">
                                        <button
                                            onClick={() => {
                                                setPDFReaderVisible(false);
                                                setActivePDFNode(null);
                                                setIsPDFReaderExpanded(false);
                                                setPdfJumpLocation(null);
                                            }}
                                            className="p-2 hover:bg-gray-800 rounded-lg transition"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>

                                    <div className="flex-1 overflow-hidden">
                                        <AdvancedKnowledgeExtractor
                                            pdfUrl={pdfNode.pdfUrl}
                                            pdfFile={pdfNode.pdfFile || pdfNode.fileName || pdfarray}
                                            onSelectionAdd={handlePDFSelectionAdd}
                                            parentNodeId={activePDFNode}
                                            canvasId={sessionId}
                                            accessToken={accessToken}
                                            isExpanded={isPDFReaderExpanded}
                                            onToggleExpand={() => setIsPDFReaderExpanded(expanded => !expanded)}
                                            onAddParsedContentToAI={(title, content, imageData, askImmediately = false) => {
                                                setWorkspaceReaderContext({
                                                    title,
                                                    content,
                                                    imageData,
                                                    askImmediately,
                                                    requestId: askImmediately ? crypto.randomUUID() : undefined,
                                                });
                                                const pdfChatContext = activePDFNode
                                                    ? buildLiveCanvasChatContext(activePDFNode, renderNodes, connections)
                                                    : null;
                                                const contextSentOnOpen = !!pdfChatContext && socket?.readyState === WebSocket.OPEN;
                                                if (contextSentOnOpen && pdfChatContext) {
                                                    socket!.send(JSON.stringify({
                                                        type: 'canvas_context_update',
                                                        content: { canvas_context: pdfChatContext.snapshot },
                                                    }));
                                                }
                                                setWorkspaceChatContextSentOnOpen(contextSentOnOpen);
                                                setWorkspaceChatAnchorId(activePDFNode);
                                                if (!isWorkspaceChatOpen) {
                                                    const bounds = containerRef.current?.getBoundingClientRect();
                                                    const chatWidth = bounds
                                                        ? (bounds.width < 768
                                                            ? bounds.width * 0.65
                                                            : Math.min(560, Math.max(320, bounds.width * 0.36)))
                                                        : 360;
                                                    const editorWidth = editingNodeId && bounds
                                                        ? getDockedEditorWidth(bounds.width, chatWidth)
                                                        : 0;
                                                    if (editingNodeId) setWorkspaceEditorWidth(editorWidth);
                                                    setWorkspaceChatWidth(chatWidth);
                                                    setViewport(current => ({
                                                        ...current,
                                                        x: current.x - (chatWidth + editorWidth) / 2,
                                                    }));
                                                }
                                                setIsWorkspaceChatOpen(true);
                                            }}
                                            initialLocation={pdfJumpLocation} />
                                    </div>
                                </div>
                            </div>
                        );
                    }
                    return null;
                })()}
{UserPlanID == "custom_api" ? <APIcontainer/> : ""}
            </div>

    );
}

export default InfiniteCanvas;
