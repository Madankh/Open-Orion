import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import SlashCommandMenu from "./NoteBlocks/SlashCommandMenu"
import BlockRenderer from "./NoteBlocks/Block"
import { useSelector } from 'react-redux';
import { useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import Cookies from "js-cookie";
import { toast } from "sonner";
import Header from './NoteBlocks/Header';
import { Block, Position, RootState, InitAgentContent, WhiteboardContent, BlockData,BlockChange,UploadedResource} from '@/typings/agent'
import { debounce } from 'lodash';
import { handleAdvancedMarkdownResponse } from "./NoteBlocks/pars"
import { useComponentTracker, useAIQueryTracker } from './Y_realtime/TypingTracker';
import { useCollab } from './Y_realtime/Yjs';
import CollaborationIndicator from './Y_realtime/indicator';
import { pythonUrl,nodeUrl } from "../apiurl"
import { useResources } from '../components/NoteBlocks/context/Resource';

interface UserInfo {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  paymentHistory: any[];  
  plan: string;
  status: string;
  subscriptionEnd: string | null; 
  token_limit: number;
  verified: boolean;
}


interface AINotePadProps {
  sessionId?: string;
  socket?: WebSocket | null;
  isConnected?: boolean;
  onApplyNote?: (noteContent: string, messageId?: string) => void;
  noteBlocksToAdd?: Array<{
    content: string;
    timestamp: number;
  }>;
  onNoteBlocksProcessed?: () => void;
  projectInfo?: { name: string, type: string };
  userinfo?:UserInfo
}

const AINotePad: React.FC<AINotePadProps> = ({
  sessionId,
  socket,
  isConnected,
  noteBlocksToAdd,
  onNoteBlocksProcessed,
  projectInfo,
  userinfo
}) => {
  const { addResource, removeResource, setCurrentSession } = useResources();
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken || '';
  const userid = user?.currentUser?.id;
  const searchParams = useSearchParams();
  const urlSessionId = searchParams.get("ChannelItemID") || searchParams.get("id");
  const currentSessionId = sessionId || urlSessionId;
  const isReplayMode = React.useMemo(() => !!searchParams.get("id"), [searchParams]);

  // Collaboration setup
  const {
    blocks: collabBlocks,
    updateYBlock,
    insertYBlock,
    deleteYBlock,
    addYBlock,
    yBlocks,
    isConnected: yjsConnected,
    updatePresence,
    broadcastTypingInAI,
    getCollaboratorActivityForBlock,
    ydoc
  } = useCollab();

  const isGroupProject = projectInfo?.type === 'group';

  // ✅ FIX: Track initialization states separately
  const [localBlocks, setLocalBlocks] = useState<Block[]>([]);
  const [isLocalInitialized, setIsLocalInitialized] = useState(false);
  const [isYjsInitialized, setIsYjsInitialized] = useState(false);
  const [isFetchComplete, setIsFetchComplete] = useState(false);
  const [fetchedBlocks, setFetchedBlocks] = useState<Block[] | null>(null);

  const generateBlockId = (): number => Date.now() + Math.random();

  // State
  const [saveStatus, setSaveStatus] = useState<'synced' | 'pending' | 'saving' | 'error'>('synced');
  const [showSlashMenu, setShowSlashMenu] = useState<boolean>(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState<Position>({ x: 0, y: 0 });
  const [slashBlock, setSlashBlock] = useState<number | null>(null);

  const [currentContextBlockId, setCurrentContextBlockId] = useState<number | null>(null);
  const [currentContextBlockType, setCurrentContextBlockType] = useState<string>('text');
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [loadStartTime] = useState<number>(Date.now());
  const [currentEditingBlockId, setCurrentEditingBlockId] = useState<number | null>(null);
  const [workspaceInfo, setWorkspaceInfo] = useState<string>('');
  const [isLoadingSession, setIsLoadingSession] = useState<boolean>(false);
  const [agentInitialized, setAgentInitialized] = useState<boolean>(false);
  const [UserPlanID, setUserPlanID] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastActionType, setLastActionType] = useState<'typing' | 'significant' | 'none'>('none');
  const [processedWhiteboardIds, setProcessedWhiteboardIds] = useState<Set<number>>(new Set());
  const [blockRefs, setBlockRefs] = useState<Map<number, HTMLElement>>(new Map());

  const [collaboratorActivities, setCollaboratorActivities] = useState<Array<{
    userId: string;
    userEmail: string;
    component: 'notepad' | 'ai_chat' | 'whiteboard';
    blockId?: number;
    action: 'viewing' | 'typing' | 'ai_query' | 'idle';
    content?: string;
    timestamp: number;
    color: string;
  }>>([]);

  // Refs
  const lastSavedBlocksRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const hasInitializedYjsRef = useRef<boolean>(false);

  const { trackQueryStart } = useAIQueryTracker();
  useComponentTracker(containerRef, 'notepad');

  // API Keys
  let llm_key: string | null = null;
  let image_key: string | null = null;
  let web_key: string | null = null;

  if (typeof window !== 'undefined') {
    const allApiKeysStr = localStorage.getItem('allApiKeys');
    if (allApiKeysStr) {
      const allApiKeys = JSON.parse(allApiKeysStr);
      llm_key = allApiKeys.llm;
      image_key = allApiKeys.image_or_video;
      web_key = allApiKeys.webSearch;
    } else {
      llm_key = localStorage.getItem('apiKey_llm');
      image_key = localStorage.getItem('apiKey_image_or_video');
      web_key = localStorage.getItem('apiKey_webSearch');
    }
  }

  const isObject = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null;
  };

  const hasStringProperty = (obj: unknown, prop: string): obj is Record<string, string> => {
    return isObject(obj) && prop in obj && typeof obj[prop] === 'string';
  };

  const hasProperty = (obj: unknown, prop: string): obj is Record<string, unknown> => {
    return isObject(obj) && prop in obj;
  };

  const getUserColor = (userId: string): string => {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
      '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
    ];
    const index = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[index % colors.length];
  };

  const registerBlockRef = useCallback((blockId: number, element: HTMLElement | null) => {
    setBlockRefs(prev => {
      const newMap = new Map(prev);
      if (element) {
        newMap.set(blockId, element);
      } else {
        newMap.delete(blockId);
      }
      return newMap;
    });
  }, []);

  const parseAwarenessData = useCallback((awarenessArray: number[]) => {
    try {
      const buffer = new Uint8Array(awarenessArray);
      const text = new TextDecoder().decode(buffer);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
    }
    return null;
  }, []);

  useEffect(() => {
    if (!isGroupProject) {
      setIsYjsInitialized(true);
      return;
    }

    if (yjsConnected && yBlocks && ydoc) {
      setIsYjsInitialized(true);
    } else {
      setIsYjsInitialized(false);
    }
  }, [isGroupProject, yjsConnected, yBlocks, ydoc]);

  const blocks = useMemo(() => {
    // For group projects
    if (isGroupProject) {
      if (!isYjsInitialized) {
        return [];
      }
      
      if (!isFetchComplete) {
        return [];
      }
      return collabBlocks;
    }

    if (!isLocalInitialized) {
      return [];
    }

    return localBlocks;
  }, [isGroupProject, isYjsInitialized, isFetchComplete, collabBlocks, isLocalInitialized, localBlocks]);

  // WebSocket collaboration listener
  useEffect(() => {
    if (!socket) return;

    const handleCollabMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'ai-interaction-update') {
          const activity = {
            userId: data.userId,
            userEmail: data.userEmail,
            component: data.interaction.component as 'notepad' | 'ai_chat' | 'whiteboard',
            blockId: data.interaction.blockId,
            action: data.interaction.type === 'typing_query' ? 'typing' as const : 'ai_query' as const,
            content: data.interaction.query,
            timestamp: data.timestamp,
            color: getUserColor(data.userId)
          };

          setCollaboratorActivities(prev => {
            const filtered = prev.filter(a =>
              !(a.userId === activity.userId && a.blockId === activity.blockId)
            );
            return [...filtered, activity];
          });
        }

        if (data.type === 'awareness' && data.awareness) {
          const awarenessData = parseAwarenessData(data.awareness);

          if (awarenessData) {
            if (awarenessData.user && awarenessData.currentlyTyping) {
              const activity = {
                userId: data.userId || awarenessData.user.id,
                userEmail: data.userEmail || awarenessData.user.email,
                component: awarenessData.currentlyTyping.component as 'notepad' | 'ai_chat' | 'whiteboard',
                blockId: awarenessData.currentlyTyping.blockId,
                action: 'typing' as const,
                content: awarenessData.currentlyTyping.content,
                timestamp: Date.now(),
                color: awarenessData.user.color || getUserColor(data.userId || awarenessData.user.id)
              };

              setCollaboratorActivities(prev => {
                const filtered = prev.filter(a =>
                  !(a.userId === activity.userId && a.blockId === activity.blockId)
                );
                return [...filtered, activity];
              });
            }

            if (awarenessData.aiInteraction) {
              const activity = {
                userId: data.userId || awarenessData.user?.id,
                userEmail: data.userEmail || awarenessData.user?.email,
                component: awarenessData.aiInteraction.component as 'notepad' | 'ai_chat' | 'whiteboard',
                blockId: awarenessData.aiInteraction.blockId,
                action: awarenessData.aiInteraction.type === 'typing_query' ? 'typing' as const : 'ai_query' as const,
                content: awarenessData.aiInteraction.query,
                timestamp: awarenessData.aiInteraction.timestamp || Date.now(),
                color: awarenessData.user?.color || getUserColor(data.userId || awarenessData.user?.id)
              };

              setCollaboratorActivities(prev => {
                const filtered = prev.filter(a =>
                  !(a.userId === activity.userId && a.blockId === activity.blockId)
                );
                return [...filtered, activity];
              });
            }
          }
        }
      } catch (error) {
        console.error('[COLLAB] Error parsing collaboration message:', error);
      }
    };

    socket.addEventListener('message', handleCollabMessage);

    const cleanupInterval = setInterval(() => {
      setCollaboratorActivities(prev =>
        prev.filter(a => Date.now() - a.timestamp < 30000)
      );
    }, 10000);

    return () => {
      socket.removeEventListener('message', handleCollabMessage);
      clearInterval(cleanupInterval);
    };
  }, [socket, getUserColor, parseAwarenessData]);

// Pagination state
const [currentPage, setCurrentPage] = useState(0);
const [blocksPerPage] = useState(15);
const [totalBlocks, setTotalBlocks] = useState(0);

// Since API handles pagination, just use fetched blocks directly
const paginatedBlocks = useMemo(() => {
  // For group projects using Yjs, use collab blocks
  if (isGroupProject && isYjsInitialized) {
    const startIndex = currentPage * blocksPerPage;
    const endIndex = startIndex + blocksPerPage;
    return collabBlocks.slice(startIndex, endIndex);
  }
  
  // For personal projects, use fetched blocks (already paginated by API)
  return blocks;
}, [isGroupProject, isYjsInitialized, blocks, collabBlocks, currentPage, blocksPerPage]);

const totalPages = Math.ceil(totalBlocks / blocksPerPage);
const hasOlderBlocks = currentPage < totalPages - 1;
const hasNewerBlocks = currentPage > 0;

const fetchSessionEvents = useCallback(async (sessionIdToFetch: string, page: number = 1) => {
  if (!sessionIdToFetch || !accessToken) return;

  setIsLoadingSession(true);
  setIsInitialLoad(true);
  setIsFetchComplete(false);

  if (isGroupProject) {
    hasInitializedYjsRef.current = false;
  } else {
    setIsLocalInitialized(false);
  }
  
  try {
    // Add pagination parameters to API call
    const response = await fetch(
      `${pythonUrl}/api/note/session/${sessionIdToFetch}?page=${page}&page_size=${blocksPerPage}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Error fetching session events: ${response.statusText}`);
    }

    const data = await response.json();
    // Store pagination metadata
    if (data.pagination) {
      setTotalBlocks(data.pagination.total_blocks || 0);
    }

    if (data.metadata || data.events?.[0]?.workspace_dir) {
      const workspaceDir = data.events?.[0]?.workspace_dir || data.metadata?.workspace_dir || `workspace/${sessionIdToFetch}`;
      setWorkspaceInfo(workspaceDir);
    }

    // Helper function to download file from S3 to workspace
    const downloadFileToWorkspace = async (s3Key: string, sessionId: string) => {
      try {
        let cleanS3Key = s3Key;
        if (cleanS3Key.startsWith('/workspace/')) {
          cleanS3Key = cleanS3Key.substring(11);
        }

        const downloadResponse = await fetch(`${pythonUrl}/api/download`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            session_id: sessionId,
            s3_key: cleanS3Key
          })
        });

        if (!downloadResponse.ok) {
          const errorData = await downloadResponse.json().catch(() => ({}));
          console.error('[NOTEPAD] ❌ Download failed:', errorData);
          return null;
        }

        const result = await downloadResponse.json();
        return result.file?.path || null;
      } catch (error) {
        console.error('[NOTEPAD] ❌ Error downloading file:', error);
        return null;
      }
    };

    let convertedBlocks: Block[] = [];

    if (data.blocks && Array.isArray(data.blocks)) {
      convertedBlocks = await Promise.all(
        data.blocks.map(async (block: BlockData) => {
          // Whiteboard handling (disabled for group projects)
          if (block.type === 'whiteboard' && !isGroupProject) {
            const rawData = block.raw_data;
            let whiteboardContent: unknown = null;
            let whiteboardTitle = 'Untitled Whiteboard';

            if (hasStringProperty(rawData, 'title')) {
              whiteboardTitle = rawData.title;
            }

            if (hasProperty(rawData, 'content')) {
              const contentData = rawData.content;
              whiteboardContent = hasProperty(contentData, 'document')
                ? contentData.document
                : contentData;
            }

            return {
              id: block.id,
              type: 'whiteboard' as const,
              title: whiteboardTitle,
              content: whiteboardContent
            };
          }

          // Skip whiteboard blocks for group projects
          if (block.type === 'whiteboard' && isGroupProject) {
            return null;
          }

          // Handle document, PDF, and image blocks - download them to workspace
          if (block.type === 'document' || block.type === 'pdf' || block.type === 'image') {
            let workspacePath = block.url;
            
            // Download file from S3 to workspace if s3_key exists
            if (block.s3_key && block.session_id) {
              const downloadedPath = await downloadFileToWorkspace(block.s3_key, block.session_id);
              if (downloadedPath) {
                workspacePath = downloadedPath;
              }
            }

            return {
              id: block.id,
              type: block.type,
              content: block.content || '',
              title: block.title || block.file || 'Untitled',
              file: block.file,
              s3_key: block.s3_key,
              url: workspacePath, 
              size: block.size,
              pages: block.pages,
              created_at: block.created_at,
              session_id: block.session_id,
              user_id: block.user_id
            };
          }

          return {
            id: block.id,
            type: block.type,
            content: block.content || '',
            title: block.title,
            ...block
          };
        })
      );
      
      // Filter out null blocks
      convertedBlocks = convertedBlocks.filter((block): block is Block => block !== null && typeof block.id === 'number' && typeof block.type === 'string' && block.type.length > 0);
    }

    // Ensure at least one block
    if (convertedBlocks.length === 0) {
      convertedBlocks = [{ id: generateBlockId(), type: 'text', content: '' }];
    }
    convertedBlocks.forEach(block => {
      if (block && ['pdf', 'document', 'image', 'video', 'youtube'].includes(block.type)) {
        addResource({
          id: block.id,
          type: block.type as any,
          name: String(block.title || block.name || block.file || 'Untitled File'),
          url: block.url,
          s3_key: block.s3_key,
          size: typeof block.size === 'number' ? block.size : (block.size ? parseInt(String(block.size), 10) : undefined),
          blockId: block.id,
          sessionId: sessionIdToFetch,
          uploadedAt: typeof block.created_at === 'number' ? block.created_at : (block.created_at ? new Date(block.created_at).getTime() : Date.now())
        });
      }
    });
    // Store fetched blocks
    setFetchedBlocks(convertedBlocks);
    setIsFetchComplete(true);

    setTimeout(() => setIsInitialLoad(false), 1000);

  } catch (error) {
    console.error("[NOTEPAD] ❌ Failed to fetch session events:", error);
    toast.error(`${error}`);

    const fallbackBlocks = [{ id: generateBlockId(), type: 'text' as const, content: '' }];
    setFetchedBlocks(fallbackBlocks);
    setIsFetchComplete(true);

    setTimeout(() => setIsInitialLoad(false), 1000);
  } finally {
    setIsLoadingSession(false);
  }
}, [accessToken, isGroupProject, blocksPerPage,addResource]);

const goToOlderBlocks = useCallback(() => {
  if (hasOlderBlocks) {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    
    // Fetch the next page from API
    if (currentSessionId) {
      fetchSessionEvents(currentSessionId, nextPage + 1); // API pages start at 1
    }
    
    // Scroll to top smoothly
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}, [hasOlderBlocks, currentPage, currentSessionId, fetchSessionEvents]);

const goToNewerBlocks = useCallback(() => {
  if (hasNewerBlocks) {
    const prevPage = currentPage - 1;
    setCurrentPage(prevPage);
    
    // Fetch the previous page from API
    if (currentSessionId) {
      fetchSessionEvents(currentSessionId, prevPage + 1); // API pages start at 1
    }
    
    // Scroll to top smoothly
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}, [hasNewerBlocks, currentPage, currentSessionId, fetchSessionEvents]);


  const useBlockChangeTracker = () => {
      const pendingChanges = useRef<Map<number, BlockChange>>(new Map());
      const lastSavedVersion = useRef<number>(0);
    
      const trackChange = useCallback((change: BlockChange) => {
        // Merge changes for same block
        const existing = pendingChanges.current.get(change.blockId);
        
        if (existing) {
          // If deleting, keep delete action
          if (change.action === 'delete') {
            pendingChanges.current.set(change.blockId, change);
          } 
          // If creating then updating, keep as create
          else if (existing.action === 'create') {
            pendingChanges.current.set(change.blockId, {
              ...existing,
              block: { ...existing.block, ...change.block },
              timestamp: change.timestamp
            });
          }
          // Otherwise merge updates
          else {
            pendingChanges.current.set(change.blockId, {
              action: 'update',
              blockId: change.blockId,
              block: { ...existing.block, ...change.block },
              timestamp: change.timestamp
            });
          }
        } else {
          pendingChanges.current.set(change.blockId, change);
        }
      }, []);
    
      const getChanges = useCallback(() => {
        return Array.from(pendingChanges.current.values());
      }, []);
    
      const clearChanges = useCallback(() => {
        pendingChanges.current.clear();
      }, []);
    
      return { trackChange, getChanges, clearChanges, lastSavedVersion };
  };
  
  const { trackChange, getChanges, clearChanges } = useBlockChangeTracker();

  useEffect(() => {
    if (!isGroupProject) return;
    if (!isYjsInitialized) return;
    if (!isFetchComplete) return;
    if (!fetchedBlocks) return;
    if (hasInitializedYjsRef.current) return;

    // Check if Yjs already has data
    const existingBlocks = yBlocks?.toArray() || [];
    
    if (existingBlocks.length > 0) {
      hasInitializedYjsRef.current = true;
      return;
    }

    try {
      ydoc?.transact(() => {
        fetchedBlocks.forEach(block => {
          yBlocks?.push([block]);
        });
      });

      hasInitializedYjsRef.current = true;
    } catch (error) {
      console.error('[NOTEPAD] ❌ Error initializing Yjs:', error);
    }
  }, [isGroupProject, isYjsInitialized, isFetchComplete, fetchedBlocks, yBlocks, ydoc]);

  useEffect(() => {
    if (isGroupProject) return;
    if (!isFetchComplete) return;
    if (!fetchedBlocks) return;
    if (isLocalInitialized) return;

    setLocalBlocks(fetchedBlocks);
    setIsLocalInitialized(true);
  }, [isGroupProject, isFetchComplete, fetchedBlocks, isLocalInitialized]);

  useEffect(() => {
    if (currentSessionId) {
      fetchSessionEvents(currentSessionId);
    } else {
      // No session, initialize empty
      const emptyBlocks = [{ id: generateBlockId(), type: 'text' as const, content: '' }];
      setFetchedBlocks(emptyBlocks);
      setIsFetchComplete(true);
      setTimeout(() => setIsInitialLoad(false), 1000);
    }
  }, [currentSessionId, fetchSessionEvents]);

  // Agent initialization
  const initializeAgent = useCallback((currentSessionId: string | null) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !currentSessionId) return;

    const payloadContent: InitAgentContent = {
      tool_args: {
        deep_research: false,
        pdf: true,
        model_id: '',
        agent_type:"general",
        media_generation: false,
        audio_generation: false,
        mode: 'canvas_agent',
        browser: true,
      },
    };

    if (UserPlanID === "custom_api") {
      payloadContent.api_keys = {
        llmKey: llm_key,
        imageKey: image_key,
        webKey: web_key,
      };
    }

    socket.send(JSON.stringify({
      type: "init_agent",
      content: payloadContent,
    }));

    setAgentInitialized(true);
  }, [socket, UserPlanID, llm_key, image_key, web_key]);

  useEffect(() => {
    if (workspaceInfo && socket && isConnected && !agentInitialized && !sessionId) {
      setAgentInitialized(true);
      const newId = workspaceInfo.split("/").pop();
      if (newId) {
        setTimeout(() => initializeAgent(newId), 1000);
      }
    }
  }, [workspaceInfo, socket, isConnected, sessionId, agentInitialized, initializeAgent]);

  useEffect(() => {
    if (noteBlocksToAdd && noteBlocksToAdd.length > 0) {
      noteBlocksToAdd.forEach(note => {
        if (processedWhiteboardIds.has(note.timestamp)) return;
  
        let whiteboardData = null;
  
        // Try parsing whiteboard data (only for personal projects)
        if (!isGroupProject) {
          try {
            const parsed = JSON.parse(note.content);
            if (Array.isArray(parsed)) {
              whiteboardData = { shapes: parsed, action: 'Imported Diagram', explanation: '' };
            } else if (parsed.shapes && Array.isArray(parsed.shapes)) {
              whiteboardData = {
                shapes: parsed.shapes,
                action: parsed.action || 'Imported Diagram',
                explanation: parsed.explanation || ''
              };
            }
          } catch {
            const codeBlockMatch = note.content.match(/```json\s*\n([\s\S]*?)\n```/);
            if (codeBlockMatch) {
              try {
                const parsed = JSON.parse(codeBlockMatch[1]);
                if (Array.isArray(parsed)) {
                  whiteboardData = { shapes: parsed, action: 'Imported Diagram', explanation: '' };
                } else if (parsed.action && Array.isArray(parsed.shapes)) {
                  whiteboardData = parsed;
                }
              } catch {}
            }
          }
        }
  
        // Check if content is a detailed explanation (longer than 1500 chars or has structured sections)
        const isDetailedExplanation = note.content.length > 100 || 
          (/^\d+\)/.test(note.content) && note.content.split(/\n\d+\)/).length > 3);
  
        if (isDetailedExplanation) {
          // Create a single text block with the full content
          const detailedBlock: Block = {
            id: generateBlockId(),
            type: 'text',
            content: note.content
          };
  
          trackChange({
            action: 'create',
            blockId: detailedBlock.id,
            block: detailedBlock,
            timestamp: Date.now()
          });
  
          if (isGroupProject) {
            addYBlock(detailedBlock);
          } else {
            setLocalBlocks(prev => [...prev, detailedBlock]);
          }
          
          toast.success('Detailed explanation added');
        } else {
          // Handle regular markdown content for shorter responses
          const suggestions = handleAdvancedMarkdownResponse(note.content);
          
          // ✅ FIXED: Properly construct blocks based on type
          const newBlocks = suggestions.map(suggestion => {
            const blockId = generateBlockId();
            const blockType = suggestion.suggestedBlockType as Block['type'];
            
            // Base properties that all blocks share
            const baseProps = {
              id: blockId,
              type: blockType
            };
  
            // Handle different block types properly
            switch (blockType) {
              case 'heading':
                return {
                  ...baseProps,
                  type: 'heading' as const,
                  level: suggestion.parsedContent?.level || 1,
                  content: suggestion.parsedContent?.content || suggestion.text || ''
                };
  
              case 'code':
                return {
                  ...baseProps,
                  type: 'code' as const,
                  language: suggestion.parsedContent?.language || 'javascript',
                  content: suggestion.parsedContent?.content || suggestion.text || ''
                };
  
              case 'table':
                return {
                  ...baseProps,
                  type: 'table' as const,
                  data: suggestion.parsedContent?.data || [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']],
                  content: '' // Tables don't use content, they use data
                };
  
              case 'bullet':
                return {
                  ...baseProps,
                  type: 'bullet' as const,
                  content: suggestion.parsedContent?.content || suggestion.text || '',
                  items: suggestion.parsedContent?.items // ✅ ADD THIS LINE
                };
              
              case 'numbered-list':
                return {
                  ...baseProps,
                  type: 'numbered-list' as const,
                  content: suggestion.parsedContent?.content || suggestion.text || '',
                  items: suggestion.parsedContent?.items // ✅ ADD THIS LINE
                };
  
              case 'quote':
                return {
                  ...baseProps,
                  type: 'quote' as const,
                  content: suggestion.parsedContent?.content || suggestion.text || ''
                };
  
              case 'latex':
                return {
                  ...baseProps,
                  type: 'latex' as const,
                  content: suggestion.parsedContent?.content || suggestion.text || ''
                };
  
              case 'details':
                return {
                  ...baseProps,
                  type: 'details' as const,
                  title: suggestion.parsedContent?.title || 'Details',
                  content: suggestion.parsedContent?.content || suggestion.text || '',
                  isOpen: false
                };
  
              // Default case for text and other simple blocks
              default:
                return {
                  ...baseProps,
                  content: suggestion.parsedContent?.content || suggestion.text || ''
                };
            }
          });
  
          // Track all changes
          newBlocks.forEach(block => {
            trackChange({
              action: 'create',
              blockId: block.id,
              block: block,
              timestamp: Date.now()
            });
          });
  
          // Add blocks to appropriate store
          if (isGroupProject) {
            newBlocks.forEach(block => {
              addYBlock(block);
            });
          } else {
            setLocalBlocks(prev => [...prev, ...newBlocks]);
          }
          
          toast.success(`Added ${newBlocks.length} block${newBlocks.length !== 1 ? 's' : ''}`);
        }
      });
  
      setLastActionType('significant');
      if (onNoteBlocksProcessed) onNoteBlocksProcessed();
    }
  }, [noteBlocksToAdd, onNoteBlocksProcessed, isGroupProject, addYBlock, trackChange]);

  // Device ID initialization
  useEffect(() => {
    let existingDeviceId = Cookies.get("device_id");
    if (!existingDeviceId) {
      existingDeviceId = uuidv4();
      Cookies.set("device_id", existingDeviceId, {
        expires: 365,
        sameSite: "strict",
        secure: window.location.protocol === "https:"
      });
    }
  }, []);

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      if (!accessToken || !userid) {
        toast.error("Relogin or Login first please");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`${nodeUrl}/api/auth/user/${userid}`, {
          method: 'GET',
          headers: {
            'token': `${accessToken}`,
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
        toast.error("Relogin or Login first please");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, [accessToken, userid]);


  // Block operations - handle both local and collab
  const updateBlock = useCallback((id: number, newProps: Partial<Block>) => {
      // Get the current block to preserve all its fields
      const currentBlock = isGroupProject 
        ? collabBlocks.find(b => b.id === id)
        : localBlocks.find(b => b.id === id);
      
      if (currentBlock?.type === 'youtube' && newProps.videoId && newProps.url) {
        addResource({
          id: id,
          type: 'youtube',
          name: newProps.title || 'YouTube Video',
          url: newProps.url,
          s3_key: '', 
          size: 0,
          blockId: id,
          sessionId: currentSessionId || '', 
          uploadedAt: Date.now()
        });
      }
      // Merge current block with new props to get complete updated block
      const updatedBlock = currentBlock ? { ...currentBlock, ...newProps } : newProps;
      
      trackChange({
        action: 'update',
        blockId: id,
        block: updatedBlock, // Send complete block data
        timestamp: Date.now()
      });
      
      if (isGroupProject) {
        updateYBlock(id, newProps);
  
        if (newProps.content !== undefined) {
          updatePresence({
            currentlyTyping: {
              component: 'notepad',
              content: String(newProps.content).slice(0, 100),
              blockId: id
            }
          });
          broadcastTypingInAI(String(newProps.content), 'notepad', id);
        }
      } else {
        setLocalBlocks(prev =>
          prev.map(block =>
            block.id === id ? { ...block, ...newProps } : block
          )
        );
      }
      setLastActionType('typing');
    }, [isGroupProject, updateYBlock, updatePresence, broadcastTypingInAI, collabBlocks,addResource,currentSessionId, localBlocks]);

  const handleBlockTextChange = useCallback((blockId: number, newContent: string) => {
    updateBlock(blockId, { content: newContent });

    if (isGroupProject) {
      updatePresence({
        currentlyTyping: {
          component: 'notepad',
          content: newContent.slice(0, 100),
          blockId
        }
      });
      broadcastTypingInAI(newContent, 'notepad', blockId);
    }
  }, [updateBlock, isGroupProject, updatePresence, broadcastTypingInAI]);

  const deleteBlock = useCallback((blockId: number) => {
    removeResource(blockId);
    trackChange({
      action: 'delete',
      blockId,
      timestamp: Date.now()
    });
    if (isGroupProject) {
      if (blocks.length <= 1) {
        deleteYBlock(blockId);
        addYBlock({ id: generateBlockId(), type: 'text', content: '' });
      } else {
        deleteYBlock(blockId);
      }
    } else {
      if (localBlocks.length <= 1) {
        setLocalBlocks([{ id: generateBlockId(), type: 'text', content: '' }]);
      } else {
        setLocalBlocks(prev => prev.filter(b => b.id !== blockId));
      }
    }
    setLastActionType('significant');
  }, [isGroupProject, blocks.length, localBlocks.length, deleteYBlock, addYBlock]);

  const addBlock = useCallback((blockType: string = 'text') => {

    const newBlock: Block = {
      id: generateBlockId(),
      type: blockType as Block['type'],
      content: ''
    };

    trackChange({
      action: 'create',
      blockId: newBlock.id,
      block: newBlock,
      timestamp: Date.now()
    });

    if (isGroupProject) {
      if (!isYjsInitialized) {
        toast.error('Collaboration system is initializing, please wait...');
        return;
      }

      try {
        addYBlock(newBlock);
      } catch (error) {
        toast.error('Failed to add block');
      }
    } else {
      setLocalBlocks(prev => [...prev, newBlock]);
    }

    setLastActionType('significant');
  }, [isGroupProject, isYjsInitialized, addYBlock]);

  // Auto-save functionality
  const performSave = useCallback(async (blocksToSave: Block[]) => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) return;
  
    const changes = getChanges();
    if (changes.length === 0) {
      setSaveStatus('synced');
      return;
    }

    if (isSavingRef.current) {
      return;
    }
  
    try {
      isSavingRef.current = true;
      setSaveStatus('saving');
  
      // Send batch update with only changed blocks
      socket.send(JSON.stringify({
        type: "update_blocks",
        session_id: sessionId,
        content: {
          changes,
          timestamp: Date.now()
        }
      }));
     lastSavedBlocksRef.current = JSON.stringify(blocksToSave);
      clearChanges();
      setSaveStatus('synced');
    } catch (error) {
      console.error("Failed to save:", error);
      setSaveStatus('error');
      toast.error("Failed to save changes");
    } finally {
      isSavingRef.current = false;
    }
  }, [socket, sessionId, getChanges, clearChanges]);

  const debouncedSave = useCallback(
    debounce((blocks: Block[]) => performSave(blocks), 8000),
    [performSave]
  );

  const handleManualSave = useCallback(async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
      toast.error('Cannot save - not connected to server');
      return;
    }
    const changes = getChanges();
    if (changes.length === 0) {
      toast.info('All changes already saved');
      setSaveStatus('synced');
      return;
    }
  
    // If already saving, don't trigger another save
    if (isSavingRef.current) {
      toast.info('Save in progress...');
      return;
    }
  
    try {
      isSavingRef.current = true;
      setSaveStatus('saving');
  
      // Cancel any pending debounced saves
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      debouncedSave.cancel();
  
      // Send batch update with only changed blocks
      socket.send(JSON.stringify({
        type: "update_blocks",
        session_id: sessionId,
        content: {
          changes,
          timestamp: Date.now()
        }
      }));
  
      // Update last saved reference
      lastSavedBlocksRef.current = JSON.stringify(blocks);
      
      // Clear tracked changes
      clearChanges();
      
      // Update status
      setSaveStatus('synced');
      toast.success(`Saved ${changes.length} change${changes.length !== 1 ? 's' : ''}`);
      
    } catch (error) {
      console.error("Manual save failed:", error);
      setSaveStatus('error');
      toast.error("Failed to save changes");
    } finally {
      isSavingRef.current = false;
    }
  }, [socket, sessionId, blocks, getChanges, clearChanges, debouncedSave])

  const immediateSave = useCallback((blocks: Block[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    debouncedSave.cancel();
    performSave(blocks);
  }, [performSave, debouncedSave]);

  // Auto-save effect - for personal / Groups projects
  useEffect(() => {
    if (blocks.length === 0 || !sessionId || !socket || socket.readyState !== WebSocket.OPEN) return;
    if (isReplayMode && isLoadingSession) return;

    const timeSinceLoad = Date.now() - loadStartTime;
    if (isInitialLoad || timeSinceLoad < 12000) return;

    const blocksString = JSON.stringify(blocks);
    if (blocksString === lastSavedBlocksRef.current) return;
    const pendingChanges = getChanges();
    if (pendingChanges.length === 0) {
      // No changes, ensure we're synced
      if (saveStatus !== 'synced') {
        setSaveStatus('synced');
      }
      return;
    }

    setSaveStatus('pending');

    if (lastActionType === 'significant') {
      immediateSave(blocks);
      setLastActionType('none');
    } else {
      debouncedSave(blocks);
    }
    lastSavedBlocksRef.current = blocksString;
  }, [blocks, sessionId, socket, debouncedSave, immediateSave, lastActionType, isReplayMode, isLoadingSession, isInitialLoad, loadStartTime, isGroupProject]);


  const insertBlockAfter = useCallback((afterBlockId: number, newBlock: Block) => {
    trackChange({
      action: 'create',
      blockId: newBlock.id,
      block: newBlock,
      timestamp: Date.now()
    });

    if (isGroupProject) {
      insertYBlock(afterBlockId, newBlock);
      setTimeout(() => {
        const emptyBlock = {
          id: generateBlockId(),
          type: 'text' as const,
          content: ''
        };
        insertYBlock(newBlock.id as number, emptyBlock);
      }, 50);
    } else {
      setLocalBlocks(prev => {
        const activeIndex = prev.findIndex(b => b.id === afterBlockId);
        if (activeIndex === -1) return prev;

        const newBlocks = [...prev];
        newBlocks.splice(activeIndex + 1, 0, newBlock, {
          id: generateBlockId(),
          type: 'text',
          content: ''
        });

        return newBlocks;
      });
    }
    setLastActionType('significant');
  }, [isGroupProject, insertYBlock]);

  // File upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
  
    // ✅ ADD THIS CHECK AT THE START
    if (userinfo?.plan === "free") {
      toast.error("File uploads are not available on the free plan. Please upgrade to use this feature.");
      if (event.target) {
        event.target.value = '';
      }
      return;
    }

    const getFileType = (file: File): 'image' | 'video' | 'document' => {
      const fileType = file.type;
      if (fileType.startsWith('image/')) return 'image';
      if (fileType.startsWith('video/')) return 'video';
      return 'document';
    };

    const fileType = getFileType(file);
    const tempUrl = URL.createObjectURL(file);

    const newBlock: Block = {
      id: generateBlockId(),
      type: fileType,
      src: tempUrl,
      name: file.name,
      size: file.size,
      s3_key:'',
      file,
      status: 'uploading'
    };

    if (slashBlock) {
      insertBlockAfter(slashBlock, newBlock);
    } else {
      if (isGroupProject) {
        addYBlock(newBlock);
      } else {
        setLocalBlocks(prev => [...prev, newBlock]);
      }
      setLastActionType('significant');
    }

    try {
      const workspacePath = workspaceInfo || "";
      const connectionId = workspacePath.split("/").pop();

      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;

        try {
          const response = await fetch(`${pythonUrl}/api/upload`, {
            method: "POST",
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              session_id: connectionId,
              file: { path: file.name, content },
            }),
          });

          const result = await response.json();

          if (response.ok) {
            const newResource: UploadedResource = {
              id: newBlock.id,
              type: fileType as 'pdf' | 'document' | 'image' | 'video',
              name: file.name,
              url: result.file.path,
              s3_key: result.file.path,
              size: file.size,
              blockId: newBlock.id,
              uploadedAt: Date.now(),
              sessionId: sessionId // ✅ Important: tie to session
            };

            addResource(newResource);
            updateBlock(newBlock.id, {
              url: result.file.path,
              s3_key:result.file.path,
              serverPath: result.file.saved_path,
              status: 'uploaded'
            });

            toast.success(`${file.name} uploaded successfully! Click the AI button to analyze.`);
          } else {
            throw new Error(result.error || 'Upload failed');
          }
        } catch (uploadError) {
          console.error(`Error uploading ${file.name}:`, uploadError);
          updateBlock(newBlock.id, { status: 'error' });
          toast.error(`Failed to upload ${file.name}`);
        }
      };

      reader.readAsDataURL(file);

    } catch (error) {
      console.error('File upload error:', error);
      updateBlock(newBlock.id, { status: 'error' });
      toast.error('File upload failed');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  // Slash command handlers
  const handleSlashCommand = (position: Position, blockId: number) => {
    setSlashMenuPosition(position);
    setSlashBlock(blockId);
    setShowSlashMenu(true);
  };

  const insertBlock = (blockName: string) => {
    const fileBlockTypes = ['Image', 'Video', 'PDF', 'Kanban Board'];
    if (fileBlockTypes.includes(blockName) && userinfo?.plan === "free") {
      toast.error(`${blockName} blocks are not available on the free plan. Please upgrade.`);
      setShowSlashMenu(false);
      return;
    }
    let newBlock: Block | null = null;

    switch (blockName) {
      case 'Text':
        newBlock = { id: generateBlockId(), type: 'text', content: '' };
        break;
      case 'Heading 1':
        newBlock = { id: generateBlockId(), type: 'heading', level: 1, content: '' };
        break;
      case 'Heading 2':
        newBlock = { id: generateBlockId(), type: 'heading', level: 2, content: '' };
        break;
      case 'Heading 3':
        newBlock = { id: generateBlockId(), type: 'heading', level: 3, content: '' };
        break;
      case 'Bullet List':
        newBlock = { id: generateBlockId(), type: 'bullet', content: '' };
        break;
      case 'Numbered List':
        newBlock = { id: generateBlockId(), type: 'numbered-list', content: '' };
        break;
      case 'Quote':
        newBlock = { id: generateBlockId(), type: 'quote', content: '' };
        break;
      case 'Table':
        newBlock = {
          type: 'table',
          id: generateBlockId(),
          data: [
            ['Header 1', 'Header 2', 'Header 3'],
            ['Cell 1', 'Cell 2', 'Cell 3'],
            ['Cell 4', 'Cell 5', 'Cell 6']
          ]
        };
        break;
      case 'Details':
        newBlock = {
          type: 'details',
          id: generateBlockId(),
          title: 'Click to expand',
          content: '',
          isOpen: false
        };
        break;
      case 'Code Block':
        newBlock = { id: generateBlockId(), type: 'code', content: '', language: 'javascript' };
        break;
      case 'LaTeX':
        newBlock = { id: generateBlockId(), type: 'latex', content: '' };
        break;
      case 'Image':
        fileInputRef.current?.click();
        setShowSlashMenu(false);
        return;
      case 'Video':
        videoInputRef.current?.click();
        setShowSlashMenu(false);
        return;
      case 'WhiteBoard':
        if (isGroupProject) {
          toast.info('Whiteboard feature is not available in group projects');
          setShowSlashMenu(false);
          return;
        }

        const existingWhiteboard = blocks.find(b => b.type === 'whiteboard');
        if (existingWhiteboard) {
          toast.info('A whiteboard already exists. Edit shapes in the existing whiteboard.');
          setShowSlashMenu(false);
          return;
        }

        newBlock = { id: generateBlockId(), type: 'whiteboard', content: '' };
        break;
      
      case 'YouTube':
        newBlock = { 
          id: generateBlockId(), 
          type: 'youtube', 
          content: '',
          url: '',
          videoId: '',
          title: 'YouTube Video',
          timestamps: []
        };
        addResource({
          id: newBlock.id,
          type: 'youtube',
          name: 'YouTube Video',
          url: '', 
          s3_key: '',
          size: 0,
          blockId: newBlock.id,
          sessionId: currentSessionId || '', 
          uploadedAt: Date.now()
        });

        break;
      
      // ✨ NEW: Kanban Board Block
      case 'Kanban Board':
        newBlock = { 
          id: generateBlockId(), 
          type: 'kanban', 
          content: '',
          boardTitle: 'My Kanban Board',
          columns: [
            { id: 'todo', title: 'To Do', cards: [], color: '#6B7280' },
            { id: 'inprogress', title: 'In Progress', cards: [], color: '#3B82F6' },
            { id: 'done', title: 'Done', cards: [], color: '#10B981' }
          ]
        };
        break;

      case 'PDF':
        docInputRef.current?.click();
        setShowSlashMenu(false);
        return;
      default:
        newBlock = { id: generateBlockId(), type: 'text', content: '' };
    }

    if (newBlock && slashBlock) {
      insertBlockAfter(slashBlock, newBlock);
    }
    setShowSlashMenu(false);
  };

  // AI query handlers
  const handleQuestionSubmit = async (newQuestion: string, modelToUse: string, contextBlockId?: number, fileUrl?: string, screenshotUrl?: string) => {
    if (!newQuestion.trim()) return;
  
    trackQueryStart(newQuestion, 'notepad', contextBlockId);
  
    if (contextBlockId) {
      const contextBlock = blocks.find(b => b.id === contextBlockId);
      setCurrentContextBlockId(contextBlockId);
      setCurrentContextBlockType(contextBlock?.type || 'text');
    } else {
      setCurrentContextBlockId(null);
      setCurrentContextBlockType('text');
    }
  
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast.error("WebSocket connection is not open. Please try again.");
      return;
    }
  
    if (!sessionId) {
      const payloadContent: InitAgentContent = {
        tool_args: {
          deep_research: false,
          pdf: true,
          model_id: modelToUse,
          agent_type: 'general',
          media_generation: false,
          audio_generation: false,
          mode: 'canvas_agent',
          browser: true,
          sequential_thinking: false,
        },
      };
  
      if (UserPlanID === "custom_api") {
        payloadContent.api_keys = {
          llmKey: llm_key,
          imageKey: image_key,
          webKey: web_key,
        };
      }
    }
    const files: string[] = [];
    if (fileUrl) {
      // Remove the /workspace/{uuid}/ prefix
      const relativePath = fileUrl.replace(/^\/workspace\/[^\/]+\//, '');
      files.push(relativePath);
    }
    
    if (screenshotUrl) {
      // Remove the /workspace/{uuid}/ prefix
      const relativePath = screenshotUrl.replace(/^\/workspace\/[^\/]+\//, '');
      files.push(relativePath);
    }
  
    socket.send(JSON.stringify({
      type: "query",
      content: {
        text: newQuestion,
        mode: 'canvas_agent',
        resume: blocks.length > 1,
        files: files,
        file_paths: files,
        model_id: modelToUse
      },
    }));
  };

  const handleBlockAIRequest = (blockId: number, prompt: string, fileUrl?: string, whiteboardContext?: unknown,screenshotUrl?:string) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block || !prompt) return;

    setCurrentContextBlockId(blockId);
    setCurrentContextBlockType(block.type);

    let contextualPrompt = prompt;

    switch (block.type) {
      case 'code':
        contextualPrompt = `For this code block (${block.language || 'javascript'}): ${block.content || ''}\n\n${prompt}`;
        break;
      case 'table':
        contextualPrompt = `For this table data: ${JSON.stringify(block.data || [])}\n\n${prompt}`;
        break;
      case 'whiteboard':
        if (!isGroupProject) {
          const ctx = whiteboardContext as WhiteboardContent | null | undefined;
          const whiteboardInfo = {
            title: block.title || 'Whiteboard',
            shapeCount: ctx?.shapeCount || 0,
            whiteboardType: block.type || 'general',
            currentShapes: ctx?.shapes || [],
            viewport: ctx?.viewport
          };

          contextualPrompt = `
            For this ${whiteboardInfo.whiteboardType} whiteboard "${whiteboardInfo.title}":
            - Current shapes: ${whiteboardInfo.shapeCount}
            - Context: ${JSON.stringify(whiteboardInfo.currentShapes?.slice(0, 5))}
            
            Request: ${prompt}
          `;
        }
        break;
      case 'heading':
        contextualPrompt = `For this heading (level ${block.level}): ${block.content || ''}\n\n${prompt}`;
        break;
      case 'quote':
        contextualPrompt = `For this quote: ${block.content || ''}\n\n${prompt}`;
        break;
      case 'latex':
        contextualPrompt = `For this LaTeX expression: ${block.content || ''}\n\n${prompt}`;
        break;
      case 'pdf':
        contextualPrompt = `For this document (${block.name}): \n\n${prompt}`;
        break;
      case 'image':
        contextualPrompt = `For this image (${block.name}): \n\n${prompt}`;
        break;
      case 'video':
        contextualPrompt = `For this video (${block.name}): \n\n${prompt}`;
        break;
      default:
        contextualPrompt = `For this text: ${block.content || ''}\n\n${prompt}`;
    }

    handleQuestionSubmit(contextualPrompt, '', blockId, fileUrl,screenshotUrl);
  };


  
  const handleDirectAIRequest = async (prompt: string): Promise<string> => {
    if (!prompt.trim() || !isConnected || !socket) {
      throw new Error('Cannot send message: missing prompt or connection');
    }

    const requestId = `direct_${Date.now()}_${Math.random()}`;

    return new Promise((resolve, reject) => {
      try {
        const messageType = projectInfo?.type === "group" ? "team_query" : "query";

        socket.send(JSON.stringify({
          type: messageType,
          requestId: requestId,
          content: {
            text: prompt,
            resume: false,
            mode: "general",
            files: [],
            file_paths: [],
            model_id: '',
            direct_response: true
          },
        }));

        setTimeout(() => reject(new Error('Request timeout')), 30000);
      } catch (error) {
        reject(error);
      }
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // Loading screen
  if (isLoading || isLoadingSession) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-300">
            {isLoadingSession ? 'Loading session...' : 'Initializing...'}
          </p>
        </div>
      </div>
    );
  }


  // ✅ FIX: Better readiness check
  const isReady = isGroupProject 
    ? (isYjsInitialized && isFetchComplete)
    : (isLocalInitialized && isFetchComplete);

  return (
    <div className="flex flex-col h-screen bg-gray-900" ref={containerRef}>
      <Header
        darkMode={true}
        saveStatus={isGroupProject ? 'synced' : saveStatus}
        onManualSave={handleManualSave}
        isGroupProject={isGroupProject}
        connectionStatus={
          !socket || socket.readyState !== WebSocket.OPEN 
            ? 'disconnected' 
            : isGroupProject && !yjsConnected 
            ? 'connecting' 
            : 'connected'
        }
      />
      {isGroupProject && collaboratorActivities.length > 0 && (
        <CollaborationIndicator
          activities={collaboratorActivities}
          darkMode={true}
          currentBlockId={currentEditingBlockId}
          currentComponent="notepad"
        />
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-6 overflow-y-auto">
            {isReady ? (
              <>
                <BlockRenderer
                  blocks={blocks}
                  darkMode={true}
                  updateBlock={updateBlock}
                  deleteBlock={deleteBlock}
                  onTextSelect={() => { }}
                  onSlashCommand={handleSlashCommand}
                  handleQuickAI={handleDirectAIRequest}
                  onBlockAIRequest={handleBlockAIRequest}
                  registerBlockRef={registerBlockRef}
                  projectInfo={projectInfo}
                  handleBlockTextChange={handleBlockTextChange}
                  onBlockFocus={(blockId) => setCurrentEditingBlockId(blockId)}
                  getCollaboratorActivityForBlock={isGroupProject ? getCollaboratorActivityForBlock : undefined}
                />

<div className="my-4 flex items-center justify-center gap-4">
  {/* Left Arrow - Older Blocks */}
  <button
    onClick={goToOlderBlocks}
    disabled={!hasOlderBlocks}
    className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
      hasOlderBlocks
        ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
        : 'text-gray-700 cursor-not-allowed'
    }`}
    title="Load older blocks"
  >
    <svg 
      className="w-5 h-5" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M15 19l-7-7 7-7" 
      />
    </svg>
    <span className="text-sm">Older</span>
  </button>

  {/* Page Info */}
  {totalBlocks > blocksPerPage && (
    <div className="text-gray-500 text-sm">
      <span className="font-medium text-gray-400">
        {currentPage * blocksPerPage + 1}-{Math.min((currentPage + 1) * blocksPerPage, totalBlocks)}
      </span>
      {' '}of{' '}
      <span className="font-medium text-gray-400">{totalBlocks}</span>
    </div>
  )}

  {/* Add Block Button */}
  <button
    onClick={() => {
      addBlock();
    }}
    disabled={isGroupProject && !isYjsInitialized}
    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed transition-colors ${
      isGroupProject && !isYjsInitialized
        ? 'opacity-50 cursor-not-allowed border-gray-700 text-gray-600'
        : 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
    }`}
  >
    <Plus size={16} />
    {isGroupProject && !isYjsInitialized ? 'Initializing...' : 'Add block'}
  </button>

  {/* Right Arrow - Newer Blocks */}
  <button
    onClick={goToNewerBlocks}
    disabled={!hasNewerBlocks}
    className={`flex items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
      hasNewerBlocks
        ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-800'
        : 'text-gray-700 cursor-not-allowed'
    }`}
    title="Load newer blocks"
  >
    <span className="text-sm">Newer</span>
    <svg 
      className="w-5 h-5" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        strokeWidth={2} 
        d="M9 5l7 7-7 7" 
      />
    </svg>
  </button>
</div>

                <SlashCommandMenu
                  show={showSlashMenu}
                  position={slashMenuPosition}
                  darkMode={true}
                  onSelectCommand={insertBlock}
                />
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                  <p className="text-gray-400 text-sm">
                    {!isYjsInitialized && isGroupProject ? 'Connecting to collaboration...' :
                     !isFetchComplete ? 'Loading blocks...' :
                     'Initializing...'}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </div>
  );
};

export default AINotePad;