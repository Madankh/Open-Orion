import React, { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import { useSelector } from 'react-redux';
import { YBlock , GlobalNote,Connection, ColorTheme, ConnectionStyle, ConnectionArrow, NodeData} from '@/typings/agent';
import { PDFSourceData } from '@/typings/agent';

export interface AIInteraction {
  userId: string;
  userEmail: string;
  type: 'typing_query' | 'receiving_response' | 'idle';
  query?: string;
  response?: string;
  timestamp: number;
  blockId?: number;
  component: 'notepad' | 'ai_chat';
}

export interface CollaboratorPresence {
  userId: string;
  email: string;
  cursor?: { x: number; y: number } | null;
  selection?: any;
  activeComponent?: 'notepad' | 'ai' | 'sidebar' | 'whiteboard' | 'canvas'|'ai_chat'
  lastSeen: number;
  color: string;
  aiInteraction?: AIInteraction | null;
  currentlyTyping?: {
    component: 'notepad' | 'ai_chat';
    blockId?: number;
    content?: string;
  } | null;
  canvasPresence?: CanvasPresence | null;

  scrollPosition?: {
    component: 'notepad' | 'ai_chat';
    percentage: number;
    timestamp: number;
  } | null;
}

interface RootState {
  user: {
    currentUser?: { _id?: string; user?: { _id: string; email: string } };
    accessToken?: string;
  };
}


export interface YCanvasNode {
  id: string;
  type: 'text' | 'agent' | 'conversation' | 'file' | 'media' | 'pdf' | 'image' | 'youtube' | 'group' | 'link';
  
  // ✅ FIX: Use flat x, y structure (matches NodeData)
  x: number;
  y: number;
  width: number;
  height: number;
  
  content: string;
  title: string;
  parentId?: string;
  childIds: string[];
  level: number;
  
  // ✅ FIX: Use ColorTheme instead of string
  color: ColorTheme;
  isExpanded: boolean;
  
  // Optional fields
  fileType?: string;
  fileName?: string;
  mediaUrl?: string;
  s3Key?: string;
  pdfFile?: File;
  pdfUrl?: string;
  isRunning?: boolean;
  error?: boolean;
  youtubeId?: string;
  imageUrl?: string;
  projectNoteId?: string;
  globalNoteId?: string;
  pdfSource?: PDFSourceData;
  // ✅ ADD: Timestamp for change detection
  _timestamp?: number;
}

export const yNodeToNodeData = (yNode: YCanvasNode): NodeData => ({
  id: yNode.id,
  type: yNode.type,
  title: yNode.title,
  content: yNode.content,
  x: yNode.x,
  y: yNode.y,
  width: yNode.width,
  height: yNode.height,
  color: yNode.color, // Now matches ColorTheme
  parentId: yNode.parentId,
  childIds: yNode.childIds ? [...yNode.childIds] : [],
  level: yNode.level,
  isExpanded: yNode.isExpanded,
  ...(yNode.fileType && { fileType: yNode.fileType }),
  ...(yNode.fileName && { fileName: yNode.fileName }),
  ...(yNode.mediaUrl && { mediaUrl: yNode.mediaUrl }),
  ...(yNode.pdfUrl && { pdfUrl: yNode.pdfUrl }),
  ...(yNode.s3Key && { s3Key: yNode.s3Key }),
  ...(yNode.youtubeId && { youtubeId: yNode.youtubeId }),
  ...(yNode.imageUrl && { imageUrl: yNode.imageUrl }),
  ...(yNode.projectNoteId && { projectNoteId: yNode.projectNoteId }),
  ...(yNode.globalNoteId && { globalNoteId: yNode.globalNoteId }),
  ...(yNode.pdfSource && { pdfSource: yNode.pdfSource }),
  ...(yNode.isRunning !== undefined && { isRunning: yNode.isRunning }),
  ...(yNode.error !== undefined && { error: yNode.error })
});

// ✅ Convert NodeData to YCanvasNode
export const nodeDataToYNode = (node: NodeData): YCanvasNode => ({
  id: node.id,
  type: node.type,
  title: node.title,
  content: node.content,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height,
  color: node.color, // ColorTheme matches
  parentId: node.parentId,
  childIds: [...node.childIds],
  level: node.level,
  isExpanded: node.isExpanded,
  ...(node.fileType && { fileType: node.fileType }),
  ...(node.fileName && { fileName: node.fileName }),
  ...(node.mediaUrl && { mediaUrl: node.mediaUrl }),
  ...(node.pdfUrl && { pdfUrl: node.pdfUrl }),
  ...(node.s3Key && { s3Key: node.s3Key }),
  ...(node.youtubeId && { youtubeId: node.youtubeId }),
  ...(node.imageUrl && { imageUrl: node.imageUrl }),
  ...(node.projectNoteId && { projectNoteId: node.projectNoteId }),
  ...(node.globalNoteId && { globalNoteId: node.globalNoteId }),
  ...(node.isRunning !== undefined && { isRunning: node.isRunning }),
  ...(node.error !== undefined && { error: node.error }),
  _timestamp: Date.now()
});

// ✅ Convert YCanvasConnection to Connection
export const yConnToConnection = (yConn: YCanvasConnection): Connection => ({
  id: yConn.id,
  fromId: yConn.fromId,
  toId: yConn.toId,
  color: yConn.color, // ColorTheme matches
  strokeStyle: yConn.strokeStyle || 'solid', // Provide default
  arrowType: yConn.arrowType,
  label: yConn.label || ''
});

// ✅ Convert Connection to YCanvasConnection
export const connectionToYConn = (conn: Connection): YCanvasConnection => ({
  id: conn.id,
  fromId: conn.fromId,
  toId: conn.toId,
  color: conn.color || 'slate', // Provide default ColorTheme
  strokeStyle: conn.strokeStyle || 'solid', // Required field
  arrowType: conn.arrowType || 'end',
  label: conn.label || '',
  _timestamp: Date.now()
});

export interface YCanvasConnection {
  id: string;  
  fromId: string; 
  toId: string; 
  
  // ✅ FIX: Make strokeStyle required with default value
  strokeStyle: ConnectionStyle;
  arrowType: ConnectionArrow;
  
  // ✅ FIX: Use ColorTheme instead of string
  color: ColorTheme;
  label?: string;
  
  // ✅ ADD: Timestamp for change detection
  _timestamp?: number;
}

export interface CanvasPresence {
  currentEditingNodeId: string | null;
  currentDraggingNodeId: string | null;
  selectedNodeId: string | null;
  cursorPosition: { x: number; y: number } | null;
}

export interface CollabContextValue {
  ydoc: Y.Doc | null;
  awareness: Awareness | null;
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';

  yCanvasGlobalNotes: Y.Map<GlobalNote> | null;
  canvasGlobalNotes: Map<string, GlobalNote>;
  updateYGlobalNote: (noteId: string, updates: Partial<GlobalNote>) => void;
  addYGlobalNote: (note: GlobalNote) => void;
  deleteYGlobalNote: (noteId: string) => void;

  yBlocks: Y.Array<YBlock> | null;
  blocks: YBlock[];
  updateYBlock: (blockId: number, updates: Partial<YBlock>) => void;
  insertYBlock: (afterBlockId: number, newBlock: YBlock) => void;
  deleteYBlock: (blockId: number) => void;
  addYBlock: (block: YBlock) => void;

  yCanvasNodes: Y.Map<YCanvasNode> | null;
  canvasNodes: Map<string, YCanvasNode>;
  updateYCanvasNode: (nodeId: string, updates: Partial<YCanvasNode>) => void;
  addYCanvasNode: (node: YCanvasNode) => void;
  deleteYCanvasNode: (nodeId: string) => void;

  yCanvasConnections: Y.Array<YCanvasConnection> | null;
  canvasConnections: YCanvasConnection[];
  addYCanvasConnection: (connection: YCanvasConnection) => void;
  updateYCanvasConnection: (connectionId: string, updates: Partial<Connection>) => void;
  deleteYCanvasConnection: (connectionId: string) => void; // ✅ CHANGE: Use ID instead of from/to
  

  notepadText: Y.Text | null;
  whiteboardObjects: Y.Array<any> | null;
  aiConversations: Y.Map<any> | null;
  userPresence: Y.Map<CollaboratorPresence> | null;
  aiInteractions: Y.Array<AIInteraction> | null;

  collaborators: Map<string, CollaboratorPresence>;

  getCollaboratorActivityForBlock: (blockId: number) => {
    userId: string;
    userEmail: string;
    action: 'typing' | 'ai_query';
    content?: string;
    color: string;
  } | null;

  // NEW: Canvas-specific helpers
  getCollaboratorActivityForNode: (nodeId: string) => {
    userId: string;
    userEmail: string;
    action: 'editing' | 'dragging' | 'selected';
    color: string;
  } | null;

  updateCanvasPresence: (presence: Partial<CanvasPresence>) => void;
  getCollaboratorCursorsOnCanvas: () => Array<{
    userId: string;
    userEmail: string;
    position: { x: number; y: number };
    color: string;
  }>;

  updatePresence: (presence: Partial<CollaboratorPresence>) => void;
  getActiveCollaborators: () => CollaboratorPresence[];
  isCollaboratorActive: (userId: string) => boolean;
  updateAIInteraction: (interaction: Partial<AIInteraction>) => void;
  getActiveAIInteractions: () => AIInteraction[];
  broadcastTypingInAI: (query: string, component: 'notepad' | 'ai_chat', blockId?: number) => void;
  broadcastAIResponse: (response: string, originalQuery: string, component: 'notepad' | 'ai_chat', blockId?: number) => void;

  reconnect: () => void;
}


const CollabContext = createContext<CollabContextValue | undefined>(undefined);

export const useCollab = (): CollabContextValue => {
  const context = useContext(CollabContext);
  if (!context) throw new Error('useCollab must be used within CollabProvider');
  return context;
};

interface CollabProviderProps {
  children: React.ReactNode;
  sessionId: string | null;
  currentUser: { id?:string; user?: { _id: string, email: string };} | null;
  isCollaborativeProject?: boolean;
  projectType?: 'personal' | 'group';
  onConnectionChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
}

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

// -----------------------------
// CollabProvider
// -----------------------------
const CollabProvider: React.FC<CollabProviderProps> = ({
  children,
  sessionId,
  currentUser,
  isCollaborativeProject = false,
  projectType = 'personal',
  onConnectionChange
}) => {
  const accessToken = useSelector((state: RootState) => state.user?.accessToken);

  // Core state + refs
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const ydocRef = useRef<Y.Doc | null>(null);

  const [awareness, setAwareness] = useState<Awareness | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);

  const [yjsSocket, setYjsSocket] = useState<WebSocket | null>(null);
  const yjsWsRef = useRef<WebSocket | null>(null);

  const [yBlocks, setYBlocks] = useState<Y.Array<YBlock> | null>(null);
  const yBlocksRef = useRef<Y.Array<YBlock> | null>(null);

  const [blocks, setBlocks] = useState<YBlock[]>([]);
  const [collaborators, setCollaborators] = useState<Map<string, CollaboratorPresence>>(new Map());
  const [aiInteractions, setAIInteractions] = useState<AIInteraction[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  const observerTimeoutRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);

  const userColorRef = useRef<string>(USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);

  const updateConnectionStatus = useCallback((status: typeof connectionStatus) => {
    setConnectionStatus(status);
    setIsConnected(status === 'connected');
    onConnectionChange?.(status);
  }, [onConnectionChange]);

  const updatePresence = useCallback((presenceUpdate: Partial<CollaboratorPresence>) => {
    if (!awarenessRef.current || !currentUser) return;

    try {
      const currentState = awarenessRef.current.getLocalState() || {};
      // create a shallow, serializable state
      const newState = {
        ...(currentState as any),
        ...presenceUpdate,
        lastSeen: Date.now()
      };
      awarenessRef.current.setLocalState(newState);
    } catch (err) {
      console.warn('[COLLAB] updatePresence failed', err);
    }
  }, [currentUser]);

  const parseAwarenessArray = useCallback((awarenessArray: number[] | Uint8Array): any => {
    try {
      const buffer = awarenessArray instanceof Uint8Array ? awarenessArray : new Uint8Array(awarenessArray);
      const text = new TextDecoder().decode(buffer);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('[COLLAB] Error parsing awareness data:', error);
    }
    return null;
  }, []);

  const getActiveCollaborators = useCallback((): CollaboratorPresence[] => {
    const now = Date.now();
    const activeThreshold = 30000; // 30s
    return Array.from(collaborators.values()).filter(c => (now - c.lastSeen) < activeThreshold);
  }, [collaborators]);

  const isCollaboratorActive = useCallback((userId: string): boolean => {
    const collab = collaborators.get(userId);
    if (!collab) return false;
    return (Date.now() - collab.lastSeen) < 30000;
  }, [collaborators]);

  const [yCanvasGlobalNotes, setYCanvasGlobalNotes] = useState<Y.Map<GlobalNote> | null>(null);
  const yCanvasGlobalNotesRef = useRef<Y.Map<GlobalNote> | null>(null);
  const [canvasGlobalNotes, setCanvasGlobalNotes] = useState<Map<string, GlobalNote>>(new Map());

  const updateYGlobalNote = useCallback((noteId: string, updates: Partial<GlobalNote>) => {
    const notesMap = yCanvasGlobalNotesRef.current;
    const doc = ydocRef.current;
    
    if (!notesMap || projectType !== 'group' || !doc) {
      console.warn('[Y.JS GLOBAL NOTES] ⚠️ Cannot update note: not initialized');
      return;
    }
  
    try {
      const currentNote = notesMap.get(noteId);
      if (!currentNote) {
        console.warn('[Y.JS GLOBAL NOTES] ⚠️ Note not found:', noteId);
        return;
      }
  
      const updatedNote = { 
        ...currentNote, 
        ...updates,
        _timestamp: Date.now()
      };
      
      doc.transact(() => {
        notesMap.set(noteId, updatedNote);
      });
      
    } catch (err) {
      console.error('[Y.JS GLOBAL NOTES] ❌ updateYGlobalNote error', err);
    }
  }, [projectType]);
  
  const addYGlobalNote = useCallback((note: GlobalNote) => {
    const notesMap = yCanvasGlobalNotesRef.current;
    const doc = ydocRef.current;
    
    if (!notesMap || projectType !== 'group' || !doc) {
      console.warn('[Y.JS GLOBAL NOTES] ⚠️ Cannot add note: not initialized');
      return;
    }
  
    try {
      doc.transact(() => {
        notesMap.set(note.id, {
          ...note,
          _timestamp: Date.now()
        });
      });
      
    } catch (err) {
      console.error('[Y.JS GLOBAL NOTES] ❌ addYGlobalNote error', err);
    }
  }, [projectType]);
  
  const deleteYGlobalNote = useCallback((noteId: string) => {
    const notesMap = yCanvasGlobalNotesRef.current;
    const doc = ydocRef.current;
    
    if (!notesMap || projectType !== 'group' || !doc) return;
  
    try {
      doc.transact(() => {
        notesMap.delete(noteId);
      });
      
    } catch (err) {
      console.error('[Y.JS GLOBAL NOTES] ❌ deleteYGlobalNote error', err);
    }
  }, [projectType]);
  
  const updateAIInteraction = useCallback((interactionUpdate: Partial<AIInteraction>) => {
    if (!currentUser || !yjsWsRef.current || !sessionId) return;

    const fullInteraction: AIInteraction = {
      userId: currentUser.id,
      userEmail: currentUser?.user?.email,
      type: 'idle',
      timestamp: Date.now(),
      component: 'ai_chat',
      ...interactionUpdate
    } as AIInteraction;

    // Update local presence
    updatePresence({ aiInteraction: fullInteraction });

    // send to server
    try {
      if (yjsWsRef.current && yjsWsRef.current.readyState === WebSocket.OPEN) {
        yjsWsRef.current.send(JSON.stringify({ type: 'ai-interaction-update', sessionId, interaction: fullInteraction }));
      }
    } catch (err) {
      console.warn('[COLLAB] Failed to send AI interaction', err);
    }
  }, [currentUser, sessionId, updatePresence]);

  const getActiveAIInteractions = useCallback((): AIInteraction[] => {
    const now = Date.now();
    return aiInteractions.filter(i => (now - i.timestamp) < 60000);
  }, [aiInteractions]);

  const getCollaboratorActivityForBlock = useCallback((blockId: number) => {
    if (!currentUser) return null;
    const now = Date.now();
    const recentThreshold = 5000;

    for (const [userId, presence] of collaborators.entries()) {
      if (userId === currentUser.id) continue;

      if (presence.currentlyTyping?.blockId === blockId &&
          presence.currentlyTyping?.component === 'notepad' &&
          (now - presence.lastSeen) < recentThreshold) {
        return { userId, userEmail: presence.email, action: 'typing' as const, content: presence.currentlyTyping.content, color: presence.color };
      }

      if (presence.aiInteraction?.blockId === blockId &&
          presence.aiInteraction?.component === 'notepad' &&
          (now - presence.aiInteraction.timestamp) < 60000) {
        return { userId, userEmail: presence.email, action: 'ai_query' as const, content: presence.aiInteraction.query, color: presence.color };
      }
    }

    return null;
  }, [collaborators, currentUser]);

  const broadcastTypingInAI = useCallback((query: string, component: 'notepad' | 'ai_chat', blockId?: number) => {
    updateAIInteraction({ type: 'typing_query', query, component, blockId });
    updatePresence({ currentlyTyping: { component, content: query, blockId } });
  }, [updateAIInteraction, updatePresence]);

  const broadcastAIResponse = useCallback((response: string, originalQuery: string, component: 'notepad' | 'ai_chat', blockId?: number) => {
    updateAIInteraction({ type: 'receiving_response', query: originalQuery, response, component, blockId });
    updatePresence({ currentlyTyping: undefined as any });
  }, [updateAIInteraction, updatePresence]);

  const reconnect = useCallback(() => {
    updateConnectionStatus('connecting');
    // consumer should drive a re-render or change props to trigger effect; we keep this simple
  }, [updateConnectionStatus]);

  const updateYBlock = useCallback((blockId: number, updates: Partial<YBlock>) => {
    const arr = yBlocksRef.current;
    const doc = ydocRef.current;
    if (!arr || projectType !== 'group' || !doc) return;

    try {
      const current = arr.toArray();
      const idx = current.findIndex(b => b.id === blockId);
      if (idx === -1) return;

      const updated = { ...current[idx], ...updates };
      doc.transact(() => {
        arr.delete(idx, 1);
        arr.insert(idx, [updated]);
      });
    } catch (err) {
      console.error('[Y.JS BLOCKS] updateYBlock error', err);
    }
  }, [projectType]);

  const insertYBlock = useCallback((afterBlockId: number, newBlock: YBlock) => {
    const arr = yBlocksRef.current;
    const doc = ydocRef.current;
    if (!arr || projectType !== 'group' || !doc) return;

    try {
      const current = arr.toArray();
      const idx = current.findIndex(b => b.id === afterBlockId);
      const insertAt = idx === -1 ? current.length : idx + 1;
      doc.transact(() => arr.insert(insertAt, [newBlock]));
    } catch (err) {
      console.error('[Y.JS BLOCKS] insertYBlock error', err);
    }
  }, [projectType]);

  const deleteYBlock = useCallback((blockId: number) => {
    const arr = yBlocksRef.current;
    const doc = ydocRef.current;
    if (!arr || projectType !== 'group' || !doc) return;

    try {
      const current = arr.toArray();
      const idx = current.findIndex(b => b.id === blockId);
      if (idx === -1) return;
      doc.transact(() => arr.delete(idx, 1));
    } catch (err) {
      console.error('[Y.JS BLOCKS] deleteYBlock error', err);
    }
  }, [projectType]);

  const addYBlock = useCallback((block: YBlock) => {
    const arr = yBlocksRef.current;
    const doc = ydocRef.current;
    if (!arr || projectType !== 'group' || !doc) {
      console.warn('[Y.JS BLOCKS] Cannot add block: not initialized or not group project');
      return;
    }

    try {

      doc.transact(() => arr.push([block]));
    } catch (err) {
      console.error('[Y.JS BLOCKS] addYBlock error', err);
    }
  }, [projectType]);

  const [yCanvasNodes, setYCanvasNodes] = useState<Y.Map<YCanvasNode> | null>(null);
  const yCanvasNodesRef = useRef<Y.Map<YCanvasNode> | null>(null);
  const [canvasNodes, setCanvasNodes] = useState<Map<string, YCanvasNode>>(new Map());
  
  const [yCanvasConnections, setYCanvasConnections] = useState<Y.Array<YCanvasConnection> | null>(null);
  const yCanvasConnectionsRef = useRef<Y.Array<YCanvasConnection> | null>(null);
  const [canvasConnections, setCanvasConnections] = useState<YCanvasConnection[]>([]);
  
  const canvasObserverTimeoutRef = useRef<number | null>(null);
  
  // **REPLACE these functions in your Yjs.tsx CollabProvider:**
const updateYCanvasNode = useCallback((nodeId: string, updates: Partial<YCanvasNode>) => {
  const nodesMap = yCanvasNodesRef.current;
  const doc = ydocRef.current;
  
  if (!nodesMap || projectType !== 'group' || !doc) {
    console.warn('[Y.JS CANVAS] ⚠️ Cannot update node: not initialized');
    return;
  }

  try {
    const currentNode = nodesMap.get(nodeId);
    if (!currentNode) {
      console.warn('[Y.JS CANVAS] ⚠️ Node not found:', nodeId);
      return;
    }

    const updatedNode = { 
      ...currentNode, 
      ...updates,
      parentId: updates.parentId !== undefined ? updates.parentId : currentNode.parentId, // ✅ Preserve parentId
      _timestamp: Date.now()
    };
    
    doc.transact(() => {
      nodesMap.set(nodeId, updatedNode);
    });
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ updateYCanvasNode error', err);
  }
}, [projectType]);
  
const updateYCanvasConnection = useCallback((connectionId: string, updates: Partial<YCanvasConnection>) => {
  const connArray = yCanvasConnectionsRef.current;
  const doc = ydocRef.current;
  
  if (!connArray || projectType !== 'group' || !doc) {
    console.warn('[Y.JS CANVAS] ⚠️ Cannot update connection: not initialized');
    return;
  }

  try {
    const existing = connArray.toArray();
    const idx = existing.findIndex(c => c.id === connectionId);
    
    if (idx === -1) {
      console.warn('[Y.JS CANVAS] ⚠️ Connection not found:', connectionId);
      return;
    }

    const currentConnection = existing[idx];
    const updatedConnection = {
      ...currentConnection,
      ...updates,
      color: updates.color || currentConnection.color,
      _timestamp: Date.now() // Force change detection
    };

    doc.transact(() => {
      connArray.delete(idx, 1);
      connArray.insert(idx, [updatedConnection]);
    });
    
    console.log('[Y.JS CANVAS] ✅ Updated connection:', connectionId);
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ updateYCanvasConnection error', err);
  }
}, [projectType]);


const addYCanvasNode = useCallback((node: YCanvasNode) => {
  const nodesMap = yCanvasNodesRef.current;
  const doc = ydocRef.current;
  
  if (!nodesMap || projectType !== 'group' || !doc) {
    console.warn('[Y.JS CANVAS] ⚠️ Cannot add node: not initialized');
    return;
  }

  try {
    // ✅ FIX: No origin parameter
    doc.transact(() => {
      nodesMap.set(node.id, {
        ...node,
        _timestamp: Date.now() // Force detection
      });
    }); // NO ORIGIN!
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ addYCanvasNode error', err);
  }
}, [projectType]);
  
const deleteYCanvasNode = useCallback((nodeId: string) => {
  const nodesMap = yCanvasNodesRef.current;
  const doc = ydocRef.current;
  
  if (!nodesMap || projectType !== 'group' || !doc) return;

  try {
    
    // ✅ FIX: No origin parameter
    doc.transact(() => {
      nodesMap.delete(nodeId);
    }); // NO ORIGIN!
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ deleteYCanvasNode error', err);
  }
}, [projectType]);



const addYCanvasConnection = useCallback((connection: Connection) => {
  const connArray = yCanvasConnectionsRef.current;
  const doc = ydocRef.current;
  
  if (!connArray || projectType !== 'group' || !doc) {
    console.warn('[Y.JS CANVAS] ⚠️ Cannot add connection: not initialized');
    return;
  }

  try {
    const existing = connArray.toArray();
    
    // Check for duplicate using connection ID
    const isDuplicate = existing.some(c => c.id === connection.id);
    
    if (isDuplicate) {
      console.log('[Y.JS CANVAS] Connection already exists:', connection.id);
      return;
    }

    // Convert Connection to YCanvasConnection format
    const yConnection: YCanvasConnection = {
      id: connection.id,
      fromId: connection.fromId,
      toId: connection.toId,
      strokeStyle: connection.strokeStyle,
      arrowType: connection.arrowType,
      color: connection.color,
      label: connection.label || ''
    };

    doc.transact(() => {
      connArray.push([yConnection]);
    });
    
    console.log('[Y.JS CANVAS] ✅ Added connection:', connection.id);
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ addYCanvasConnection error', err);
  }
}, [projectType]);


const deleteYCanvasConnection = useCallback((connectionId: string) => {
  const connArray = yCanvasConnectionsRef.current;
  const doc = ydocRef.current;
  
  if (!connArray || projectType !== 'group' || !doc) {
    console.warn('[Y.JS CANVAS] ⚠️ Cannot delete connection: not initialized');
    return;
  }

  try {
    const existing = connArray.toArray();
    const idx = existing.findIndex(c => c.id === connectionId);
    
    if (idx === -1) {
      console.warn('[Y.JS CANVAS] ⚠️ Connection not found:', connectionId);
      return;
    }

    doc.transact(() => {
      connArray.delete(idx, 1);
    });
    
    console.log('[Y.JS CANVAS] ✅ Deleted connection:', connectionId);
    
  } catch (err) {
    console.error('[Y.JS CANVAS] ❌ deleteYCanvasConnection error', err);
  }
}, [projectType]);

  
  const getCollaboratorActivityForNode = useCallback((nodeId: string) => {
    if (!currentUser) return null;
    const now = Date.now();
    const recentThreshold = 5000;
  
    for (const [userId, presence] of collaborators.entries()) {
      if (userId === currentUser.id) continue;
  
      const canvasPresence = presence.canvasPresence;
      if (!canvasPresence) continue;
  
      if ((now - presence.lastSeen) > recentThreshold) continue;
  
      if (canvasPresence.currentEditingNodeId === nodeId) {
        return { userId, userEmail: presence.email, action: 'editing' as const, color: presence.color };
      }
  
      if (canvasPresence.currentDraggingNodeId === nodeId) {
        return { userId, userEmail: presence.email, action: 'dragging' as const, color: presence.color };
      }
  
      if (canvasPresence.selectedNodeId === nodeId) {
        return { userId, userEmail: presence.email, action: 'selected' as const, color: presence.color };
      }
    }
  
    return null;
  }, [collaborators, currentUser]);



  const updateCanvasPresence = useCallback((canvasPresence: Partial<CanvasPresence>) => {
    if (!awarenessRef.current || !currentUser) return;
  
    try {
      const currentState = awarenessRef.current.getLocalState() || {};
      const newState = {
        ...(currentState as any),
        canvasPresence: {
          ...(currentState as any).canvasPresence,
          ...canvasPresence
        },
        activeComponent: 'canvas',
        lastSeen: Date.now()
      };
      awarenessRef.current.setLocalState(newState);
    } catch (err) {
      console.warn('[COLLAB] updateCanvasPresence failed', err);
    }
  }, [currentUser]);
  

  const getCollaboratorCursorsOnCanvas = useCallback(() => {
    const cursors: Array<{
      userId: string;
      userEmail: string;
      position: { x: number; y: number };
      color: string;
    }> = [];
  
    const now = Date.now();
    const activeThreshold = 10000; // 10s for cursor visibility
  
    for (const [userId, presence] of collaborators.entries()) {
      if (userId === currentUser?.id) continue;
      if ((now - presence.lastSeen) > activeThreshold) continue;
      if (presence.activeComponent !== 'canvas') continue;
  
      const canvasPresence = presence.canvasPresence;
      if (canvasPresence?.cursorPosition) {
        cursors.push({
          userId,
          userEmail: presence.email,
          position: canvasPresence.cursorPosition,
          color: presence.color
        });
      }
    }
  
    return cursors;
  }, [collaborators, currentUser]);


  
  useEffect(() => {
    // Guards
    if (!isCollaborativeProject || projectType === 'personal') {
      // ensure we are clean
      setYdoc(null);
      setAwareness(null);
      setYjsSocket(null);
      setYBlocks(null);
      updateConnectionStatus('disconnected');
      return;
    }

    if (!sessionId || !currentUser || !accessToken || projectType !== 'group') {
      setYdoc(null);
      setAwareness(null);
      setYjsSocket(null);
      setYBlocks(null);
      updateConnectionStatus('disconnected');
      return;
    }

    const doc = new Y.Doc();
    const awarenessInstance = new Awareness(doc);
    const blocksArray = doc.getArray<YBlock>(`blocks-${sessionId}`);

    // store refs
    ydocRef.current = doc;
    awarenessRef.current = awarenessInstance;
    yBlocksRef.current = blocksArray;

    setYdoc(doc);
    setAwareness(awarenessInstance);
    setYBlocks(blocksArray);

    const canvasNodesMap = doc.getMap<YCanvasNode>(`canvas-nodes-${sessionId}`);
    const canvasConnectionsArray = doc.getArray<YCanvasConnection>(`canvas-connections-${sessionId}`);
    
    yCanvasNodesRef.current = canvasNodesMap;
    yCanvasConnectionsRef.current = canvasConnectionsArray;
    
    setYCanvasNodes(canvasNodesMap);
    setYCanvasConnections(canvasConnectionsArray);
  const canvasGlobalNotesMap = doc.getMap<GlobalNote>(`canvas-global-notes-${sessionId}`);
  
  yCanvasGlobalNotesRef.current = canvasGlobalNotesMap;
  setYCanvasGlobalNotes(canvasGlobalNotesMap);

  // Global notes observer
  const handleGlobalNotesChange = () => {
    if (canvasObserverTimeoutRef.current) {
      clearTimeout(canvasObserverTimeoutRef.current);
    }

    canvasObserverTimeoutRef.current = window.setTimeout(() => {
      try {
        const notesMap = new Map<string, GlobalNote>();
        
        canvasGlobalNotesMap.forEach((note, key) => {
          notesMap.set(key, {
            id: note.id,
            title: note.title,
            content: note.content,
            color: note.color,
            createdAt: note.createdAt
          });
        });
        
        setCanvasGlobalNotes(notesMap);
        
      } catch (err) {
        console.error('[Y.JS GLOBAL NOTES] handleGlobalNotesChange failed', err);
      }
    }, 10);
  };

  canvasGlobalNotesMap.observe(handleGlobalNotesChange);

  // Initial load for global notes
  const initialGlobalNotes = new Map<string, GlobalNote>();
  canvasGlobalNotesMap.forEach((note, key) => {
    initialGlobalNotes.set(key, {
      id: note.id,
      title: note.title,
      content: note.content,
      color: note.color,
      createdAt: note.createdAt
    });
  });
  setCanvasGlobalNotes(initialGlobalNotes);
    // Canvas nodes observer
    
   const handleCanvasNodesChange = () => {
     if (canvasObserverTimeoutRef.current) {
       clearTimeout(canvasObserverTimeoutRef.current);
     }
   
     canvasObserverTimeoutRef.current = window.setTimeout(() => {
       try {
         const nodesMap = new Map<string, YCanvasNode>();
         
         canvasNodesMap.forEach((node, key) => {
           // ✅ FIX: Ensure all required fields are present
           nodesMap.set(key, {
             id: node.id,
             type: node.type,
             x: node.x ?? 0,
             y: node.y ?? 0,
             width: node.width ?? 420,
             height: node.height ?? 200,
             content: node.content ?? '',
             title: node.title ?? '',
             parentId: node.parentId,
             childIds: node.childIds ? [...node.childIds] : [],
             level: node.level ?? 0,
             color: node.color ?? 'white',
             isExpanded: node.isExpanded ?? false,
             ...(node.fileType && { fileType: node.fileType }),
             ...(node.fileName && { fileName: node.fileName }),
             ...(node.fileType && { fileType: node.fileType }),
             ...(node.fileName && { fileName: node.fileName }),
             ...(node.youtubeId && { youtubeId: node.youtubeId }),  
             ...(node.imageUrl && { imageUrl: node.imageUrl }),          
             ...(node.projectNoteId && { projectNoteId: node.projectNoteId }), 
             ...(node.globalNoteId && { globalNoteId: node.globalNoteId }),
             ...(node.mediaUrl && { mediaUrl: node.mediaUrl }),
             ...(node.pdfUrl && { pdfUrl: node.pdfUrl }),
             ...(node.s3Key && { s3Key: node.s3Key }),
             ...(node.imageUrl && { imageUrl: node.imageUrl }),
             ...(node.globalNoteId && { globalNoteId: node.globalNoteId }),
             ...(node.pdfSource && { pdfSource: node.pdfSource }),
             ...(node.projectNoteId && { projectNoteId: node.projectNoteId }),
             ...(node.youtubeId && { youtubeId: node.youtubeId }),
             ...(node.isRunning !== undefined && { isRunning: node.isRunning }),
             ...(node.error !== undefined && { error: node.error })
           });
         });
         
         // ✅ CRITICAL: Force React re-render with new reference
         setCanvasNodes(nodesMap);
         
       } catch (err) {
         console.error('[Y.JS CANVAS] handleCanvasNodesChange failed', err);
       }
     }, 10);
   };
   
    
    canvasNodesMap.observe(handleCanvasNodesChange);
    
    // Canvas connections observer
    const handleCanvasConnectionsChange = (event: Y.YArrayEvent<YCanvasConnection>) => {
      try {
        // Create clean snapshot with proper structure
        const snapshot = canvasConnectionsArray.toArray().map(c => ({
          id: c.id,
          fromId: c.fromId,
          toId: c.toId,
          strokeStyle: c.strokeStyle || 'solid' as ConnectionStyle,
          arrowType: c.arrowType || 'end' as ConnectionArrow,
          color: c.color,
          label: c.label || ''
        }));
        
        setCanvasConnections(snapshot);
        console.log('[Y.JS CANVAS] 🔄 Connections updated:', snapshot.length);
        
      } catch (err) {
        console.error('[Y.JS CANVAS] handleCanvasConnectionsChange failed', err);
      }
    };
    
    
    canvasConnectionsArray.observe(handleCanvasConnectionsChange);
    
    // Initial load for canvas
  const initialNodes = new Map<string, YCanvasNode>();
  canvasNodesMap.forEach((node, key) => {
    initialNodes.set(key, {
      id: node.id,
      type: node.type,
      x: node.x ?? 0,    
      y: node.y ?? 0, 
      width: node.width ?? 420,
      height: node.height ?? 200,
      content: node.content ?? '',
      title: node.title ?? '',
      parentId: node.parentId,
      childIds: node.childIds ? [...node.childIds] : [],
      level: node.level ?? 0,
      color: node.color ?? 'white',
      isExpanded: node.isExpanded ?? false,
      ...(node.fileType && { fileType: node.fileType }),
      ...(node.fileName && { fileName: node.fileName }),
      ...(node.mediaUrl && { mediaUrl: node.mediaUrl }),
      ...(node.pdfUrl && { pdfUrl: node.pdfUrl }),
      ...(node.s3Key && { s3Key: node.s3Key })
    });
  });
  setCanvasNodes(initialNodes);
  
  
    const initialConnections = canvasConnectionsArray.toArray().map(c => ({ ...c }));
    setCanvasConnections(initialConnections);
    


    const handleBlocksChange = (event: Y.YArrayEvent<YBlock>) => {
      try {
        // Copy snapshot immediately while event is still valid
        const snapshot = blocksArray.toArray().map(b => ({ ...b }));

        // Extract minimal scalar diagnostics synchronously
        const added = (event.changes && (event.changes.added as any)?.size) ?? 0;
        const deleted = (event.changes && (event.changes.deleted as any)?.size) ?? 0;
        const deltaLen = (event.changes && (event.changes.delta as any)?.length) ?? 0;

        // Debounce state updates, but do NOT reference `event` inside the timeout
        if (observerTimeoutRef.current) clearTimeout(observerTimeoutRef.current);

        observerTimeoutRef.current = window.setTimeout(() => {
          setBlocks(snapshot);
        }, 10);
      } catch (err) {
        console.error('[Y.JS BLOCKS] handleBlocksChange failed', err);
      }
    };

    blocksArray.observe(handleBlocksChange);

    // Initial load
    const initial = blocksArray.toArray().map(b => ({ ...b }));
    setBlocks(initial);

    // -----------------------------
    // Awareness initial state
    // -----------------------------
    awarenessInstance.setLocalState({
      user: { id: currentUser.id, email: currentUser?.user?.email, color: userColorRef.current },
      cursor: null,
      activeComponent: null,
      lastSeen: Date.now(),
      aiInteraction: null,
      currentlyTyping: null
    } as any);

    // Awareness change handler
    const handleAwarenessChange = () => {
      const states = awarenessInstance.getStates();
      setCollaborators(prev => {
        const updated = new Map(prev);
        states.forEach((state: any, clientId: any) => {
          if (!state?.user || !state.user.id) return;
          if (state.user.id === currentUser.id) return;

          const presence: CollaboratorPresence = {
            userId: state.user.id,
            email: state.user.email,
            cursor: state.cursor,
            selection: state.selection,
            activeComponent: state.activeComponent,
            lastSeen: state.lastSeen || Date.now(),
            color: state.user.color,
            aiInteraction: state.aiInteraction,
            currentlyTyping: state.currentlyTyping
          };

          updated.set(state.user.id, presence);
        });

        // keep recently seen collaborators for a short grace period
        const now = Date.now();
        const grace = 35000;
        prev.forEach((coll, id) => {
          if (!updated.has(id) && (now - coll.lastSeen) < grace) {
            updated.set(id, coll);
          }
        });

        return updated;
      });
    };

    awarenessInstance.on('change', handleAwarenessChange);

    updateConnectionStatus('connecting');

    // NOTE: adapt the URL to your server; using local default like earlier
    const yjsWsUrl = `ws://localhost:8000/yjs?token=${encodeURIComponent(accessToken)}&session_id=${encodeURIComponent(sessionId)}`;

    const ws = new WebSocket(yjsWsUrl);

    let pingInterval: number | null = null;

    ws.onopen = () => {
      updateConnectionStatus('connected');
      setYjsSocket(ws);
      yjsWsRef.current = ws;

      try {
        const stateVector = Y.encodeStateVector(doc);
        ws.send(JSON.stringify({ type: 'sync-step-1', stateVector: Array.from(stateVector) }));

        const awarenessUpdate = encodeAwarenessUpdate(awarenessInstance, [awarenessInstance.clientID]);
        ws.send(JSON.stringify({ type: 'awareness', awareness: Array.from(awarenessUpdate) }));
      } catch (err) {
        console.warn('[Y.JS] initial sync failed', err);
      }

      // heartbeat
      pingInterval = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
      }, 30000);
      pingIntervalRef.current = pingInterval;
    };

    ws.onmessage = async (event) => {
      try {
        // ✅ Handle ArrayBuffer (binary Yjs updates)
        if (event.data instanceof ArrayBuffer) {
          try {
            const update = new Uint8Array(event.data);
            console.log('[Y.JS] Received ArrayBuffer, size:', update.length);
            Y.applyUpdate(doc, update, 'websocket');
          } catch (err) {
            console.error('[Y.JS] Failed to apply ArrayBuffer update:', err);
            console.debug('[Y.JS] First 20 bytes:', Array.from(new Uint8Array(event.data).slice(0, 20)));
          }
          return;
        }
    
        // ✅ Handle Blob - try to decode as text first (most servers send JSON)
        if (event.data instanceof Blob) {
          const arrayBuffer = await event.data.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          // ALWAYS try to decode as text first
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(uint8Array);
            
            if (text && text.trim()) {
              console.log('[Y.JS] Blob decoded as text:', text.substring(0, 100));
              
              // Try to parse as JSON
              try {
                const data = JSON.parse(text);
                console.log('[Y.JS] Blob contains JSON message type:', data.type);
                processJsonMessage(data);
                return;
              } catch {
                console.warn('[Y.JS] Blob is text but not JSON');
              }
            }
          } catch (decodeError) {
            // Not valid UTF-8, might be binary
            console.log('[Y.JS] Blob is not valid UTF-8, treating as binary');
          }
          // DON'T try to apply - your server isn't sending valid Yjs updates
          return;
        }
    
        // ✅ Handle string messages (JSON)
        if (typeof event.data === 'string') {
          console.log('[Y.JS] Received string message, length:', event.data.length);
          
          if (event.data && event.data.trim()) {
            try {
              const data = JSON.parse(event.data);
              console.log('[Y.JS] String message type:', data.type);
              processJsonMessage(data);
            } catch (parseErr) {
              console.error('[Y.JS] Failed to parse string as JSON:', parseErr);
              console.debug('[Y.JS] String preview:', event.data.substring(0, 100));
            }
          }
          return;
        }
    
        console.warn('[Y.JS] Received unknown data type:', typeof event.data);
    
      } catch (err) {
        console.error('[Y.JS] onmessage processing error', err);
        console.debug('[Y.JS] Event data type:', typeof event.data);
      }
    
      // ✅ Inline function with closure access
      function processJsonMessage(data: any) {
        try {
          switch (data.type) {
            case 'sync-step-2':
              if (data.update) {
                try {
                  const updateArray = new Uint8Array(data.update);
                  console.log('[Y.JS] Applying sync-step-2 update, size:', updateArray.length);
                  Y.applyUpdate(doc, updateArray, 'websocket');
                } catch (err) {
                  console.error('[Y.JS] Failed to apply sync-step-2 update:', err);
                }
              }
              break;
    
            case 'update':
              if (data.update) {
                try {
                  const u = new Uint8Array(data.update);
                  console.log('[Y.JS] Applying update, size:', u.length);
                  Y.applyUpdate(doc, u, 'websocket');
                } catch (err) {
                  console.error('[Y.JS] Failed to apply update:', err);
                }
              }
              break;
    
            case 'awareness':
              try {
                const awarenessUpdateBuffer = new Uint8Array(data.awareness);
                applyAwarenessUpdate(awarenessInstance, awarenessUpdateBuffer, 'websocket');
              } catch (err) {
                console.warn('[Y.JS] Could not apply awareness update', err);
              }
    
              const parsed = parseAwarenessArray(data.awareness);
              if (parsed && data.userId && data.userId !== currentUser.id) {
                setCollaborators(prev => {
                  const map = new Map(prev);
                  const presence: CollaboratorPresence = {
                    userId: data.userId,
                    email: data.userEmail || parsed.user?.email || 'unknown',
                    cursor: parsed.cursor,
                    selection: parsed.selection,
                    activeComponent: parsed.activeComponent,
                    lastSeen: data.timestamp || Date.now(),
                    color: parsed.user?.color || USER_COLORS[0],
                    aiInteraction: parsed.aiInteraction,
                    currentlyTyping: parsed.currentlyTyping,
                    canvasPresence: parsed.canvasPresence
                  };
                  map.set(data.userId, presence);
                  return map;
                });
              }
              break;
    
            case 'ai-interaction-update':
              setAIInteractions(prev => {
                const filtered = prev.filter(i => 
                  !(i.userId === data.interaction.userId && i.blockId === data.interaction.blockId)
                );
                return [...filtered, data.interaction];
              });
    
              setCollaborators(prev => {
                const map = new Map(prev);
                const existing = map.get(data.interaction.userId);
                if (existing) {
                  map.set(data.interaction.userId, { 
                    ...existing, 
                    aiInteraction: data.interaction, 
                    lastSeen: Date.now() 
                  });
                }
                return map;
              });
              break;
    
            case 'user-joined':
              console.log('[Y.JS] User joined:', data.userEmail);
              break;
    
            case 'user-left':
              setCollaborators(prev => {
                const map = new Map(prev);
                for (const [uid, coll] of map.entries()) {
                  if (coll.email === data.userEmail) {
                    map.delete(uid);
                    break;
                  }
                }
                return map;
              });
              break;
    
            case 'pong':
              // Heartbeat response
              break;
    
            default:
              console.log('[Y.JS] Unhandled message type:', data?.type);
          }
        } catch (err) {
          console.error('[Y.JS] Error processing message type:', data?.type, err);
        }
      }
    };

    ws.onerror = (err) => {
      console.error('[Y.JS] websocket error', err);
      updateConnectionStatus('error');
    };

    ws.onclose = (ev) => {

      updateConnectionStatus('disconnected');
      yjsWsRef.current = null;
      setYjsSocket(null);

      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }

      if (ev.code !== 1000) {
        // schedule a reconnect attempt (consumer can also call reconnect())
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {

        }, 3000) as unknown as number;
      }
    };

  function handleJsonMessage(data: any) {
    switch (data.type) {
      case 'sync-step-2':
        if (data.update) {
          const updateArray = new Uint8Array(data.update);
          Y.applyUpdate(doc, updateArray, 'websocket');
        }
        break;
  
      case 'update':
        if (data.update) {
          const u = new Uint8Array(data.update);
          Y.applyUpdate(doc, u, 'websocket');
        }
        break;
  
      case 'awareness':
        try {
          const awarenessUpdateBuffer = new Uint8Array(data.awareness);
          applyAwarenessUpdate(awarenessInstance, awarenessUpdateBuffer, 'websocket');
        } catch (err) {
          console.warn('[Y.JS] Could not apply awareness update', err);
        }
  
        const parsed = parseAwarenessArray(data.awareness);
        if (parsed && data.userId && data.userId !== currentUser.id) {
          setCollaborators(prev => {
            const map = new Map(prev);
            const presence: CollaboratorPresence = {
              userId: data.userId,
              email: data.userEmail || parsed.user?.email || 'unknown',
              cursor: parsed.cursor,
              selection: parsed.selection,
              activeComponent: parsed.activeComponent,
              lastSeen: data.timestamp || Date.now(),
              color: parsed.user?.color || USER_COLORS[0],
              aiInteraction: parsed.aiInteraction,
              currentlyTyping: parsed.currentlyTyping
            };
            map.set(data.userId, presence);
            return map;
          });
        }
        break;
  
      case 'ai-interaction-update':
        setAIInteractions(prev => {
          const filtered = prev.filter(i => 
            !(i.userId === data.interaction.userId && i.blockId === data.interaction.blockId)
          );
          return [...filtered, data.interaction];
        });
  
        setCollaborators(prev => {
          const map = new Map(prev);
          const existing = map.get(data.interaction.userId);
          if (existing) {
            map.set(data.interaction.userId, { 
              ...existing, 
              aiInteraction: data.interaction, 
              lastSeen: Date.now() 
            });
          }
          return map;
        });
        break;
  
      case 'user-joined':
        console.log('[Y.JS] User joined:', data.userEmail);
        break;
  
      case 'user-left':
        setCollaborators(prev => {
          const map = new Map(prev);
          for (const [uid, coll] of map.entries()) {
            if (coll.email === data.userEmail) {
              map.delete(uid);
              break;
            }
          }
          return map;
        });
        break;
  
      case 'pong':
        // Heartbeat response
        break;
  
      default:
        console.log('[Y.JS] Unhandled message type:', data?.type);
    }
  }
    // -----------------------------
    // Document update handler (local -> remote)
    // -----------------------------
    const handleDocUpdate = (update: Uint8Array, origin: any) => {
      if (origin === 'websocket') return;
      try {
        if (yjsWsRef.current && yjsWsRef.current.readyState === WebSocket.OPEN) {
          yjsWsRef.current.send(JSON.stringify({ type: 'update', update: Array.from(update) }));
        }
      } catch (err) {
        console.warn('[Y.JS] failed to send update', err);
      }
    };

    doc.on('update', handleDocUpdate);

    // Awareness local -> remote
    const handleAwarenessUpdate = ({ added, updated, removed }: any, origin: any) => {
      if (origin === 'websocket') return;
      try {
        if (yjsWsRef.current && yjsWsRef.current.readyState === WebSocket.OPEN) {
          const changedClients = (added || []).concat(updated || [], removed || []);
          const awarenessUpdateData = encodeAwarenessUpdate(awarenessInstance, changedClients);
          yjsWsRef.current.send(JSON.stringify({ type: 'awareness', awareness: Array.from(awarenessUpdateData) }));
        }
      } catch (err) {
        console.warn('[Y.JS] handleAwarenessUpdate failed', err);
      }
    };

    awarenessInstance.on('update', handleAwarenessUpdate as any);

    // -----------------------------
    // Cleanup on unmount or dependencies change
    // -----------------------------
    return () => {

      if (reconnectTimeoutRef.current) { clearTimeout(reconnectTimeoutRef.current); reconnectTimeoutRef.current = null; }
      if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null; }
      if (observerTimeoutRef.current) { clearTimeout(observerTimeoutRef.current); observerTimeoutRef.current = null; }

      try { blocksArray.unobserve(handleBlocksChange); } catch { /* ignore */ }
      try { canvasNodesMap.unobserve(handleCanvasNodesChange); } catch { /* ignore */ }
      try { canvasConnectionsArray.unobserve(handleCanvasConnectionsChange); } catch { /* ignore */ }
      try { canvasGlobalNotesMap.unobserve(handleGlobalNotesChange); } catch { /* ignore */ }
      
      if (canvasObserverTimeoutRef.current) { 
        clearTimeout(canvasObserverTimeoutRef.current); 
        canvasObserverTimeoutRef.current = null; 
      }
      
      yCanvasNodesRef.current = null;
      yCanvasConnectionsRef.current = null;
      
      setYCanvasNodes(null);
      setYCanvasConnections(null);
      setCanvasNodes(new Map());
      setCanvasConnections([]);

      try { awarenessInstance.off('change', handleAwarenessChange); } catch (e) { /* ignore */ }
      try { doc.off('update', handleDocUpdate); } catch (e) { /* ignore */ }
      try { awarenessInstance.off('update', handleAwarenessUpdate as any); } catch (e) { /* ignore */ }

      if (yjsWsRef.current && (yjsWsRef.current.readyState === WebSocket.OPEN || yjsWsRef.current.readyState === WebSocket.CONNECTING)) {
        try { yjsWsRef.current.close(1000, 'Component cleanup'); } catch (e) { /* ignore */ }
      }

      try { awarenessInstance.destroy(); } catch (e) { /* ignore */ }
      try { doc.destroy(); } catch (e) { /* ignore */ }

      ydocRef.current = null;
      awarenessRef.current = null;
      yBlocksRef.current = null;
      yCanvasGlobalNotesRef.current = null;
      setYCanvasGlobalNotes(null);
      setCanvasGlobalNotes(new Map());
      
      setYdoc(null);
      setAwareness(null);
      setYBlocks(null);
      setYjsSocket(null);
      setBlocks([]);
      setCollaborators(new Map());
      setAIInteractions([]);
      updateConnectionStatus('disconnected');
    };

  }, [sessionId, currentUser?.id, currentUser?.user?.email, accessToken, projectType, isCollaborativeProject, updateConnectionStatus, parseAwarenessArray]);

  // -----------------------------
  // Presence heartbeat
  // -----------------------------
  useEffect(() => {
    if (!isCollaborativeProject || projectType === 'personal') return;
    if (!awarenessRef.current || !currentUser || !isConnected) return;

    const hb = window.setInterval(() => updatePresence({ lastSeen: Date.now() }), 15000);
    return () => clearInterval(hb);
  }, [currentUser, isConnected, updatePresence, isCollaborativeProject, projectType]);

  // -----------------------------
  // Cleanup old AI interactions
  // -----------------------------
  useEffect(() => {
    if (!isCollaborativeProject || projectType === 'personal') return;
    const cleanup = window.setInterval(() => {
      const now = Date.now();
      setAIInteractions(prev => prev.filter(i => (now - i.timestamp) < 300000));
    }, 60000);
    return () => clearInterval(cleanup);
  }, [isCollaborativeProject, projectType]);

  // -----------------------------
  // Memoize context value so consumers don't re-render unnecessarily
  // -----------------------------
const contextValue = useMemo<CollabContextValue>(() => ({
    ydoc,
    awareness,
    isConnected,
    connectionStatus,
    collaborators,
    yCanvasGlobalNotes,
    canvasGlobalNotes,
    updateYGlobalNote,
    addYGlobalNote,
    deleteYGlobalNote,
    yBlocks,
    blocks,
    updateYBlock,
    insertYBlock,
    deleteYBlock,
    addYBlock,

    yCanvasNodes,
    canvasNodes,
    updateYCanvasNode,
    addYCanvasNode,
    deleteYCanvasNode,
  
    // ✅ FIX: Add updateYCanvasConnection here!
    yCanvasConnections,
    canvasConnections,
    addYCanvasConnection,
    updateYCanvasConnection,  // ⬅️ ADD THIS LINE!
    deleteYCanvasConnection,

    notepadText: (ydoc && sessionId) ? ydoc.getText(`notepad-${sessionId}`) : null,
    whiteboardObjects: (ydoc && sessionId) ? ydoc.getArray(`whiteboard-${sessionId}`) : null,
    aiConversations: (ydoc && sessionId) ? ydoc.getMap(`ai-conversations-${sessionId}`) : null,
    userPresence: (ydoc && sessionId) ? ydoc.getMap(`presence-${sessionId}`) : null,
    aiInteractions: (ydoc && sessionId) ? ydoc.getArray(`ai-interactions-${sessionId}`) : null,

    updatePresence,
    getActiveCollaborators,
    isCollaboratorActive,
    updateAIInteraction,
    getActiveAIInteractions,
    broadcastTypingInAI,
    broadcastAIResponse,
    getCollaboratorActivityForBlock,

    getCollaboratorActivityForNode,
    updateCanvasPresence,
    getCollaboratorCursorsOnCanvas,
    reconnect
}), [
    ydoc, awareness, isConnected, connectionStatus, collaborators,
    yBlocks, blocks, updateYBlock, insertYBlock, deleteYBlock, addYBlock,
    yCanvasNodes, canvasNodes, updateYCanvasNode, addYCanvasNode, deleteYCanvasNode,
    yCanvasConnections, canvasConnections, addYCanvasConnection, 
    updateYCanvasConnection,  // ⬅️ ADD THIS TO DEPENDENCY ARRAY TOO!
    deleteYCanvasConnection,
    sessionId, updatePresence, getActiveCollaborators, isCollaboratorActive,
    updateAIInteraction, getActiveAIInteractions, broadcastTypingInAI, broadcastAIResponse,
    getCollaboratorActivityForBlock, getCollaboratorActivityForNode,
    updateCanvasPresence, getCollaboratorCursorsOnCanvas, reconnect,
    yCanvasGlobalNotes, canvasGlobalNotes, updateYGlobalNote, addYGlobalNote, deleteYGlobalNote
]);


  return (
    <CollabContext.Provider value={contextValue}>
      {children}
    </CollabContext.Provider>
  );
};

export default CollabProvider;
