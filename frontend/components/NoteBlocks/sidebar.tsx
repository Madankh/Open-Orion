import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Settings,
  Search,
  MoreHorizontal,
  List as ListIcon,
  BookOpen,
  FileText,
  Hash,
  Trash2,
  Check,
  X,
  Edit3,
  User,
  Sparkles,
  XCircle,
  Zap,
  Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from "react-redux";
import { logout } from '../../components/redux/userRedux';
import Link from 'next/link';
import {SettingsIcon, LogOut, Bug, CreditCard } from 'lucide-react';
import { AppDispatch } from '../redux/store';
import { ProjectAPI } from './apipoint';
import { nodeUrl } from '@/apiurl';

interface TeamMember {
  id: string;
  name: string;
  avatar?: string;
  status: 'online' | 'offline' | 'away';
}

interface WorkItem {
  id: string;
  title: string;
  lastModified: string; 
  type: 'document' | 'note' | 'whiteboard';
  sessionId?: string;
  session_id?: string;
  last_modified: Date;
}

interface Topic {
  id: string;
  name: string;
  workItems: WorkItem[];
  work_items: WorkItem;
  isExpanded: boolean;
  color?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  profile:string;
  token_limit: number;
}

interface RootState {
  user: {
    currentUser: User | null;
    accessToken: string | null;
    isFetching: boolean;
    error: string | null;
  };
}

interface ProjectList {
  id: string;
  name: string;
  type: 'personal' | 'group';
  members?: TeamMember[];
  topics: Topic[];
  isExpanded: boolean;
  icon?: string;
}

interface UserInfo {
  _id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  paymentHistory: any[];  // You can refine this based on the structure of paymentHistory
  plan: string;
  status: string;
  subscriptionEnd: string | null;  // Assuming it's a string or null
  token_limit: number;
  verified: boolean;
}

interface ProjectSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: (collapsed: boolean) => void;
  isMobile?: boolean;
  onWorkItemSelect?: (
    listId: string, 
    topicId: string, 
    workId: string,
    worktype:string,
    sessionId: string,
    projectInfo?: { projectType?: string; projectName?: string }
  ) => void;
  userinfo?:UserInfo,
  activeSession?: {sessionId: string, listId: string, topicId: string, workId: string} | null;
}


const generateSessionId = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const IconButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { title?: string; subtle?: boolean }> = ({ children, title, subtle, ...props }) => (
  <button
    {...props}
    title={title}
    className={`p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 ${subtle ? 'hover:bg-gray-800' : 'hover:bg-gray-700'}`}
  >
    {children}
  </button>
);

const InlineEditor: React.FC<{
  initial: string;
  placeholder?: string;
  onCancel: () => void;
  onSave: (value: string) => void;
  autoFocus?: boolean;
}> = ({ initial, placeholder, onCancel, onSave, autoFocus }) => {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => { 
    if (autoFocus && ref.current) {
      setTimeout(() => {
        ref.current?.focus();
        ref.current?.select();
      }, 100);
    }
  }, [autoFocus]);
  
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSave(value.trim());
          if (e.key === 'Escape') onCancel();
        }}
        style={{color:"white"}}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-sm bg-gray-800 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder-gray-400"
      />
      <IconButton onClick={() => onSave(value.trim())} title="Save">
        <Check className="w-4 h-4 text-green-400" />
      </IconButton>
      <IconButton onClick={onCancel} title="Cancel">
        <X className="w-4 h-4 text-red-400" />
      </IconButton>
    </div>
  );
};

const ConfirmModal: React.FC<{ open: boolean; title?: string; message?: string; onConfirm: () => void; onCancel: () => void }> = ({ open, title, message, onConfirm, onCancel }) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 grid place-items-center bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="bg-gray-800 border border-gray-700 rounded-lg p-4 w-11/12 max-w-md shadow-lg" initial={{ y: 12 }} animate={{ y: 0 }} exit={{ y: 12 }}>
            <div className="flex items-start gap-3">
              <XCircle className="w-6 h-6 text-red-400" />
              <div>
                <div className="font-semibold text-white">{title || 'Are you sure?'}</div>
                <div className="text-sm text-gray-400 mt-1">{message}</div>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={onCancel} className="px-3 py-1 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700">Cancel</button>
                  <button onClick={onConfirm} className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700">Delete</button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default function ProjectSidebar({ 
  isCollapsed: externalCollapsed, 
  onToggleCollapse,
  isMobile = false,
  onWorkItemSelect,
  userinfo,
  activeSession,
}: ProjectSidebarProps) {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { currentUser } = useSelector((state: RootState) => state.user);
  const dispatch = useDispatch<AppDispatch>();
  const [createLoading, setCreateLoading] = useState<{
    list?: boolean;
    group?: boolean;
  }>({});
  // Add state to track URL-based active session
  const [urlActiveSession, setUrlActiveSession] = useState<{
    sessionId: string;
    listId: string;
    topicId: string;
    workId: string;
    worktype:string;
  } | null>(null);

  // Helper function to get initials
  const getInitials = (username: string, email: string) => {
    if (username && username !== 'Unknown') {
      return username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.charAt(0).toUpperCase();
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      const response = await fetch(`${nodeUrl}/api/auth/logout`, {
        method: "GET",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Logout failed");

      localStorage.clear();
      dispatch(logout());
      window.location.href = "/login";
    } catch (err) {
      console.error("Logout error:", err);
    }
    setIsSettingsOpen(false);
  };

  // Close settings dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [projectLists, setProjectLists] = useState<ProjectList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [api] = useState(() => new ProjectAPI());

  // Update URL-based active session when projects load or URL changes
  useEffect(() => {
    const updateActiveFromUrl = () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const sessionId = urlParams.get('ChannelItemID');
        
        if (sessionId && projectLists.length > 0) {
          // Find the work item with this session ID
          for (const list of projectLists) {
            for (const topic of list.topics) {
              const workItem = topic.workItems?.find(w => 
                w.sessionId === sessionId || w.session_id === sessionId
              );
              if (workItem) {
                const newActiveSession = {
                  sessionId,
                  listId: list.id,
                  topicId: topic.id,
                  workId: workItem.id,
                  worktype: workItem.type
                };
                
                // Only update if it's actually different
                setUrlActiveSession(prev => {
                  if (prev?.sessionId === newActiveSession.sessionId && 
                      prev?.listId === newActiveSession.listId &&
                      prev?.topicId === newActiveSession.topicId &&
                      prev?.workId === newActiveSession.workId) {
                    return prev; 
                  }
                  return newActiveSession;
                });
                return; 
              }
            }
          }
        }
      }
      
      // If no session found, clear active session
      setUrlActiveSession(prev => prev ? null : prev);
    };
  
    updateActiveFromUrl();
    
    // Listen for URL changes
    const handleUrlChange = () => updateActiveFromUrl();
    window.addEventListener('popstate', handleUrlChange);
    
    return () => window.removeEventListener('popstate', handleUrlChange);
  }, [projectLists.length]);

  useEffect(() => {
    if (urlActiveSession) {
      setProjectLists(prev => prev.map(list => {
        
        if (list.id === urlActiveSession.listId) {
          return {
            ...list,
            isExpanded: true,
            topics: list.topics.map(topic => ({
              ...topic,
              isExpanded: topic.id === urlActiveSession.topicId ? true : topic.isExpanded
            }))
          };
        }
        return list;
      }));
    }
  }, [urlActiveSession]);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true);
        const response = await api.getProjects();
        
        const projects = response?.projects || [];
        const safeProjects = projects.map(project => ({
          ...project,
          topics: Array.isArray(project.topics) ? project.topics.map(topic => ({
            ...topic,
            workItems: Array.isArray(topic.workItems) 
              ? topic.workItems.map(workItem => ({
                  ...workItem,
                  sessionId: workItem?.session_id || workItem.sessionId,
                  lastModified: workItem?.last_modified || workItem.lastModified
                }))
              : Array.isArray(topic?.work_items) 
                ? topic?.work_items?.map(workItem => ({
                    ...workItem,
                    sessionId: workItem.session_id || workItem.sessionId,
                    lastModified: workItem.last_modified || workItem.lastModified
                  }))
                : []
          })) : []
        }));
        
        setProjectLists(safeProjects);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
        console.error('Failed to load projects:', err);
      } finally {
        setLoading(false);
      }
    };

    if (accessToken) {
      loadProjects();
    }
  }, [api, accessToken]);

  const isWorkItemActive = (listId: string, topicId: string, workId: string) => {
    // First check URL-based active session
    if (urlActiveSession) {
      return urlActiveSession.listId === listId && 
             urlActiveSession.topicId === topicId && 
             urlActiveSession.workId === workId;
    }
    
    // Fallback to prop-based active session
    return activeSession?.listId === listId && 
           activeSession?.topicId === topicId && 
           activeSession?.workId === workId;
  };

  const handleWorkItemSelect = async (listId: string, topicId: string, workId: string) => {
    const list = projectLists?.find(l => l.id === listId);
    const topic = list?.topics?.find(t => t.id === topicId);
    const workItem = topic?.workItems?.find(w => w.id === workId);
    const worktype = workItem?.type;
    
    let sessionId = workItem?.sessionId;
    
    // Only generate new session ID if none exists
    if (!sessionId) {
      console.log("⚡ Generating new session ID...");
      sessionId = generateSessionId();
      
      try {
        await api.updateWorkItem(listId, topicId, workId, { 
          sessionId 
        });
        
        // Update the project lists with new session ID
        setProjectLists(prev => prev.map(l => 
          l.id === listId ? {
            ...l,
            topics: l.topics.map(t => 
              t.id === topicId ? {
                ...t,
                workItems: t?.workItems?.map(w => 
                  w.id === workId ? { ...w, sessionId } : w
                )
              } : t
            )
          } : l
        ));
        
      } catch (error) {
        console.error('Failed to save session ID:', error);
        return;
      }
    } else {
      console.log("✅ Using existing session ID:", sessionId);
    }
    
    setIsNavigating(true);
    
    try {
      // Update URL-based active session immediately with the confirmed sessionId
      const newActiveSession = {
        sessionId,
        listId,
        topicId,
        workId,
        worktype
      };
      
      setUrlActiveSession(newActiveSession);
  
      // Update URL first
      const newUrl = `/canvas?ChannelItemID=${sessionId}`;
      window.history.pushState(
        { 
          sessionId, 
          listId, 
          topicId, 
          workId,
          worktype, 
          projectType: list?.type,
          projectName: list?.name,
          sidebarState: { projectLists, viewFilter, activeTeamId } 
        },
        '', 
        newUrl
      );
  
      // Then call the callback
      if (onWorkItemSelect) {
        onWorkItemSelect(listId, topicId, workId,worktype, sessionId, {
          projectType: list?.type,
          projectName: list?.name
        });
      }
      
      // Dispatch the navigation event
      window.dispatchEvent(new CustomEvent('workspace-navigate', {
        detail: { 
          sessionId, 
          listId, 
          topicId, 
          workId, 
          worktype,
          projectType: list?.type,
          projectName: list?.name,
          type: 'general' 
        }
      }));
      
    } catch (error) {
      console.error('Navigation failed:', error);
    } finally {
      setIsNavigating(false);
    }
  };

  const NavigationLoader = () => (
    <AnimatePresence>
      {isNavigating && (
        <motion.div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div 
            className="bg-gray-900 border border-gray-700 rounded-lg p-8 text-center"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            <div className="flex items-center justify-center mb-4">
              <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <div className="text-white font-medium mb-2">Initializing Workspace</div>
            <div className="text-gray-400 text-sm">Loading your collaborative space...</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed = externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
  
  const handleToggleCollapse = () => {
    const newCollapsed = !isCollapsed;
    if (onToggleCollapse) {
      onToggleCollapse(newCollapsed);
    } else {
      setInternalCollapsed(newCollapsed);
    }
  };

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [viewFilter, setViewFilter] = useState<'personal' | 'group'>('personal');
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [inlineAdd, setInlineAdd] = useState<{ kind: 'topic' | 'work' | null; listId?: string; topicId?: string,isSubmitting?: boolean; }>({ kind: null });
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ open: boolean; id?: string; type?: 'list' | 'topic' | 'work'; meta?: any }>({ open: false });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const matches = (txt: string) => txt.toLowerCase().includes(searchQuery.trim().toLowerCase());

  // Derived
  const personalLists = projectLists.filter(l => l?.type === 'personal');
  const groupLists = projectLists.filter(l => l?.type === 'group');

  const filteredPersonal = personalLists.filter(l => {
    if (!l || !searchQuery) return true;
    if (matches(l.name)) return true;
    if (l.topics?.some(t => t && (matches(t.name) || t?.workItems?.some(w => w && matches(w.title))))) return true;
    return false;
  });

  const filteredGroups = groupLists.filter(l => {
    if (!l || !searchQuery) return true;
    if (matches(l.name)) return true;
    if (l.topics?.some(t => t && (matches(t.name) || t?.workItems?.some(w => w && matches(w.title))))) return true;
    return false;
  });

  // Focus when inline add or edit
  useEffect(() => {
    if (inlineAdd.kind || editingListId) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 150);
    }
  }, [inlineAdd, editingListId]);

  useEffect(() => {
    if (viewFilter === 'group' && !activeTeamId && groupLists.length > 0) setActiveTeamId(groupLists[0]?.id || null);
    if (viewFilter === 'personal') setActiveTeamId(null);
  }, [viewFilter, groupLists]);

  const updateList = async (id: string, patch: Partial<ProjectList>) => {
    try {
      await api.updateProject(id, {
        name: patch.name,
        is_expanded: patch.isExpanded
      });
      setProjectLists(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    } catch (err) {
      setError(`${err} Failed to update project`);
    }
  };

  const toggleListExpansion = (listId: string) => updateList(listId, { isExpanded: !projectLists.find(l => l.id === listId)?.isExpanded });
  const toggleTopic = (listId: string, topicId: string) => setProjectLists(prev => prev.map(l => l.id === listId ? ({ ...l, topics: l.topics.map(t => t.id === topicId ? { ...t, isExpanded: !t.isExpanded } : t) }) : l));

  const startEditList = (listId: string) => {
    setEditingListId(listId);
  };

  const commitEditList = async (listId: string, newName: string) => {
    if (!newName.trim()) return;
    try {
      await api.updateProject(listId, { name: newName.trim() });
      setProjectLists(prev => prev.map(l => l.id === listId ? { ...l, name: newName.trim() } : l));
      setEditingListId(null);
    } catch (err) {
      console.error('Failed to update project name:', err);
      setError('Failed to update project name');
    }
  };

  const removeList = async (listId: string) => {
    try {
      await api.deleteProject(listId);
      setProjectLists(prev => prev.filter(l => l.id !== listId));
      if (activeTeamId === listId) {
        setActiveTeamId(projectLists.find(l => l.type === 'group' && l.id !== listId)?.id || null);
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError('Failed to delete project');
    }
  };

  const startAddTopic = (listId: string) => setInlineAdd({ kind: 'topic', listId });
  
  const commitAddTopic = async (listId: string, name: string) => {
    if (!name.trim()) return;
    setInlineAdd(prev => ({ ...prev, isSubmitting: true }));
    if (userinfo?.plan === 'free') {
      const list = projectLists.find(l => l.id === listId);
      if (list && list.topics && list.topics.length >= 1) {
        setError('Free plan allows only 1 topic per project. Upgrade to create more.');
        setInlineAdd({ kind: null });
        return;
      }
    }

    try {
      const response = await api.createTopic(listId, name.trim());
      const newTopic = response.topic;
      
      setProjectLists(prev => prev.map(l => 
        l.id === listId ? {
          ...l,
          topics: [...l.topics, newTopic],
          isExpanded: true
        } : l
      ));
      setInlineAdd({ kind: null, isSubmitting: false });
    } catch (err) {
      console.error('Failed to create topic:', err);
      setError(err?.message);
      setInlineAdd(prev => ({ ...prev, isSubmitting: false }));
    }
  };

  const startAddWork = (listId: string, topicId: string) => setInlineAdd({ kind: 'work', listId, topicId });

  const commitAddWork = async (listId: string, topicId: string, title: string, type: WorkItem['type'] = 'document') => {
    if (!title.trim()) return;
    setInlineAdd(prev => ({ ...prev, isSubmitting: true }));
    if (userinfo?.plan === 'free') {
      const list = projectLists.find(l => l.id === listId);
      const topic = list?.topics?.find(t => t.id === topicId);
      
    if (topic && topic.workItems) { // FIX: Check if workItems exists
      const workspaceCount = topic.workItems.filter(w => w.type === 'whiteboard').length;
      const canvasCount = topic.workItems.filter(w => w.type === 'document').length;
      
      if (type === 'whiteboard' && workspaceCount >= 1) {
        setError('Free plan allows only 1 workspace per topic. Upgrade to create more.');
        setInlineAdd({ kind: null });
        return;
      }
      
      if (type === 'document' && canvasCount >= 1) {
        setError('Free plan allows only 1 canvas per topic. Upgrade to create more.');
        setInlineAdd({ kind: null });
        return;
      }
    }
  }

    try {
      const response = await api.createWorkItem(listId, topicId, title.trim(), type);
      const newWork = response.work_item;
    
      // Instead of just updating local state, reload all projects to ensure consistency
      const refreshedResponse = await api.getProjects();
      const projects = refreshedResponse?.projects || [];
      const safeProjects = projects.map(project => ({
        ...project,
        topics: Array.isArray(project.topics) ? project.topics.map(topic => ({
          ...topic,
          workItems: Array.isArray(topic.workItems) 
            ? (topic?.workItems || []).map(workItem => ({
                ...workItem,
                sessionId: workItem?.session_id || workItem.sessionId,
                lastModified: workItem?.last_modified || workItem.lastModified
              }))
            : Array.isArray(topic?.work_items) 
              ? topic?.work_items?.map(workItem => ({
                  ...workItem,
                  sessionId: workItem.session_id || workItem.sessionId,
                  lastModified: workItem.last_modified || workItem.lastModified
                }))
              : []
        })) : []
      }));
      setProjectLists(safeProjects);
      setInlineAdd({ kind: null, isSubmitting: false });
      // Auto-select the newly created work item
      setTimeout(() => {
        handleWorkItemSelect(listId, topicId, newWork.id);
      }, 100);
      
    } catch (err) {
      console.log('Failed to create work item:', err?.message);
      setError(err?.message);
      setInlineAdd(prev => ({ ...prev, isSubmitting: false }));
    }
  };


  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.sidebarState) {
        setProjectLists(event.state.sidebarState.projectLists);
        setViewFilter(event.state.sidebarState.viewFilter);
        setActiveTeamId(event.state.sidebarState.activeTeamId);
      }
    };
  
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const scheduleDeleteList = (listId: string) => {
    const list = projectLists.find(l => l.id === listId);
    if (!list) return;
    const totalItems = list.topics.reduce((s, t) => s + t?.workItems.length, 0);
    setConfirmState({ open: true, id: listId, type: 'list', meta: { name: list.name, topics: list.topics?.length || 0, totalItems } });
  };

  const scheduleDeleteTopic = (listId: string, topicId: string) => {
    const topic = projectLists.find(l => l.id === listId)?.topics.find(t => t.id === topicId);
    if (!topic) return;
    setConfirmState({ open: true, id: topicId, type: 'topic', meta: { listId, name: topic.name, items: topic?.workItems?.length || 0 } });
  };

  const scheduleDeleteWork = (listId: string, topicId: string, workId: string) => setConfirmState({ open: true, id: workId, type: 'work', meta: { listId, topicId } });

  const runConfirm = async () => {
    if (!confirmState.open) return;
    const { type, id, meta } = confirmState;
    
    try {
      if (type === 'list' && id) {
        await removeList(id);
      }
      if (type === 'topic' && id) {
        const listId = meta.listId as string;
        await api.deleteTopic(listId, id);
        setProjectLists(prev => prev.map(l => l.id === listId ? ({ ...l, topics: l.topics.filter(t => t.id !== id) }) : l));
      }
      if (type === 'work' && id) {
        const { listId, topicId } = meta;
        await api.deleteWorkItem(listId, topicId, id);
        setProjectLists(prev => prev.map(l => l.id === listId ? ({ ...l, topics: l.topics.map(t => t.id === topicId ? ({ ...t, workItems: t?.workItems.filter(w => w.id !== id) }) : t) }) : l));
      }
    } catch (err) {
      console.error('Failed to delete:', err);
      setError(`Failed to delete ${type}`);
    }
    
    setConfirmState({ open: false });
  };

  const cancelConfirm = () => setConfirmState({ open: false });

  const createList = async (type: ProjectList['type']) => {
    setCreateLoading(prev => ({ 
      ...prev, 
      [type === 'group' ? 'group' : 'list']: true 
    }));
    
    try {
      const response = await api.createProject(
        type === 'group' ? 'New Team' : 'New List',
        type
      );
      const newList = response.project;
      
      setProjectLists(prev => [newList, ...prev]);
      if (type === 'group') setActiveTeamId(newList.id);
      
      setTimeout(() => {
        startEditList(newList.id);
      }, 100);
      
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err?.message);
    } finally {
      // ✅ ADD THIS
      setCreateLoading(prev => ({ 
        ...prev, 
        [type === 'group' ? 'group' : 'list']: false 
      }));
    }
  };
  
  
  const sidebarWidth = isCollapsed ? (isMobile ? '0' : '64px') : '320px';

  if (loading) {
    return (
      <motion.aside className="bg-black border-r border-gray-800 flex flex-col h-screen justify-center items-center" style={{ width: '320px' }}>
        <div className="text-white">Loading projects...</div>
      </motion.aside>
    );
  }

  if (error) {
    return (
      <motion.aside className="bg-black border-r border-gray-800 flex flex-col h-screen justify-center items-center p-4" style={{ width: '320px' }}>
        <div className="text-red-400 text-center">
          <p>Error:</p>
          <p>{error}</p>
        </div>
      </motion.aside>
    );
  }

  return (
    <motion.aside 
      className="bg-black border-r border-gray-800 flex flex-col h-screen relative"
      animate={{ width: sidebarWidth }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      style={{ minWidth: sidebarWidth, maxWidth: sidebarWidth }}
    >
      <ConfirmModal
        open={confirmState.open}
        title={confirmState.type === 'list' ? `Delete ${confirmState.meta?.name}?` : 'Delete?'}
        message={confirmState.type === 'list' ? (`This will delete ${confirmState.meta?.topics} topics and ${confirmState.meta?.totalItems} items.`) : ''}
        onConfirm={runConfirm}
        onCancel={cancelConfirm}
      />
      <NavigationLoader />

      {/* Collapsed State */}
      {isCollapsed && (
        <div className="flex flex-col h-full">
          <div className="px-3 py-3 border-b border-gray-800 flex flex-col items-center gap-2">
            <button
              onClick={handleToggleCollapse}
              className="w-10 h-10 grid place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow hover:from-purple-600 hover:to-indigo-700 transition-colors"
              title="Expand Sidebar"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 px-3 py-4 flex flex-col gap-3">
            <button
              onClick={() => setViewFilter('personal')}
              className={`w-10 h-10 rounded-md grid place-items-center ${viewFilter === 'personal' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
              title="Personal Lists"
            >
              <User className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewFilter('group')}
              className={`w-10 h-10 rounded-md grid place-items-center ${viewFilter === 'group' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'}`}
              title="Teams"
            >
              <ListIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="px-3 py-3 border-t border-gray-800">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full grid place-items-center text-white font-medium text-sm">
              {currentUser ? getInitials(currentUser?.username, currentUser?.email) : 'JD'}
            </div>
          </div>
        </div>
      )}

      {!isCollapsed && (
        <>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3">
            <button
              onClick={handleToggleCollapse}
              className="w-10 h-10 grid place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow hover:from-purple-600 hover:to-indigo-700 transition-colors"
              title="Collapse Sidebar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <Link href={"/canvas"}>
                 <div className="text-sm font-semibold text-white">Curiositylab</div>
              </Link>
              <div className="text-xs text-gray-500">Channels · lists · topics</div>
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
              <div className="px-2 py-1 rounded bg-gray-800">{projectLists.reduce((s, l) => s + (l?.topics?.reduce((x, t) => x + (t?.workItems?.length || 0), 0) || 0), 0)} entries</div>
              <IconButton subtle title="More">
                <MoreHorizontal className="w-4 h-4 text-gray-400" />
              </IconButton>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search lists, channels, topics..."
                style={{color:"white"}}
                className="w-full pl-9 pr-10 py-2 bg-gray-900 border border-gray-700 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder-gray-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 p-1 hover:text-gray-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 mt-3">
              <div className="inline-flex rounded-md overflow-hidden bg-gray-800 p-1">
                <button onClick={() => setViewFilter('personal')} className={`px-3 py-1 text-xs rounded-md ${viewFilter === 'personal' ? 'bg-gray-700 shadow text-white' : 'text-gray-400'}`}>
                  Personal
                </button>
                <button onClick={() => setViewFilter('group')} className={`px-3 py-1 text-xs rounded-md ${viewFilter === 'group' ? 'bg-gray-700 shadow text-white' : 'text-gray-400'}`}>
                  Teams
                </button>
              </div>
              <div className="ml-auto text-xs text-gray-500">{viewFilter === 'personal' ? `${filteredPersonal.length} lists` : `${filteredGroups.length} teams`}</div>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className={`flex-shrink-0 ${viewFilter === 'group' ? 'w-15' : 'w-0'} transition-all duration-200 border-r border-gray-800 overflow-y-auto bg-black`}> 
              {viewFilter === 'group' && (
                <div className="py-3 flex flex-col items-center gap-3">
                  {filteredGroups.map(team => (
                    <div key={team.id} className="group relative">
                      <button
                        onClick={() => setActiveTeamId(team.id)}
                        title={team.name}
                        className={`w-10 h-10 rounded-md grid place-items-center focus:outline-none ${activeTeamId === team.id ? 'ring-2 ring-indigo-400 bg-gray-800' : 'hover:bg-gray-800'}`}>
                        <div className="text-sm">{team.icon || team.name.split(' ').map(x => x[0]).slice(0,2).join('')}</div>
                      </button>

                      <div className="absolute -right-2 top-0 opacity-0 group-hover:opacity-100 flex flex-col gap-1">
                        <IconButton onClick={(e) => { e.stopPropagation(); startEditList(team.id); }} title="Edit team">
                          <Edit3 className="w-3 h-3 text-gray-400" />
                        </IconButton>
                        <IconButton onClick={(e) => { e.stopPropagation(); scheduleDeleteList(team.id); }} title="Delete team">
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </IconButton>
                      </div>
                    </div>
                  ))}

                  <button 
                    onClick={() => userinfo?.plan !== 'free' && createList('group')} 
                    disabled={userinfo?.plan === 'free'}
                    title={userinfo?.plan === 'free' ? 'Upgrade to create teams' : 'Create new team'}
                    className={`w-12 h-12 rounded-md grid place-items-center ${
                      userinfo?.plan === 'free' 
                        ? 'text-gray-600 cursor-not-allowed opacity-50' 
                        : 'text-gray-500 hover:bg-gray-800 cursor-pointer'
                    }`}
                  >
                      {createLoading.group ? (
                        <Activity className="w-5 h-5 animate-spin" />
                      ) : (
                        <Plus className="w-5 h-5" />
                      )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {viewFilter === 'personal' ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Lists</h4>
                      <div className="flex items-center gap-2">
                       <button 
                          onClick={() => {
                            if (userinfo?.plan === 'free' && personalLists.length >= 1) {
                              setError('Free plan allows only 1 personal project. Upgrade to create more.');
                              return;
                            }
                            createList('personal');
                          }} 
                          disabled={createLoading.list}
                          className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-2"
                        >
                          {createLoading.list ? (
                            <>
                              <Activity className="w-3 h-3 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Plus className="w-3 h-3" />
                              Create
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      {filteredPersonal.map(list => (
                        <div key={list.id} className="rounded-md hover:bg-gray-900 p-2 group border border-transparent hover:border-gray-700">
                          {editingListId === list.id ? (
                            <div className="bg-gray-800 rounded-md p-2 border border-indigo-500">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-md bg-gray-700 grid place-items-center text-sm">{list.icon}</div>
                                <div className="flex-1">
                                  <InlineEditor
                                    initial={list.name}
                                    autoFocus
                                    placeholder="List name"
                                    onCancel={() => setEditingListId(null)}
                                    onSave={(v) => commitEditList(list.id, v)}
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleListExpansion(list.id)}>
                            <motion.div
                              transition={{ type: "spring", stiffness: 120 }}
                              className="rounded-full p-3 bg-white/5"
                            >
                              <Sparkles size={6} aria-hidden />
                            </motion.div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate text-white">{list.name}</div>
                                <div className="text-xs text-gray-500">{list.topics?.length || 0} topics • {list.topics?.reduce((s,t)=>s+(t?.workItems?.length || 0),0) || 0} items</div>
                              </div>

                              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                                <IconButton onClick={(e) => { e.stopPropagation(); startAddTopic(list.id); }} title="Add topic">
                                  <Plus className="w-3 h-3 text-gray-400" />
                                </IconButton>
                                <IconButton onClick={(e) => { e.stopPropagation(); startEditList(list.id); }} title="Edit">
                                  <Edit3 className="w-3 h-3 text-gray-400" />
                                </IconButton>
                                <IconButton onClick={(e) => { e.stopPropagation(); scheduleDeleteList(list.id); }} title="Delete">
                                  <Trash2 className="w-3 h-3 text-red-400" />
                                </IconButton>
                              </div>

                              <ChevronDown className={`w-4 h-4 text-gray-500 transform transition-transform ${list.isExpanded ? 'rotate-0' : '-rotate-90'}`} />
                            </div>
                          )}

                          <AnimatePresence>
                            {list.isExpanded && editingListId !== list.id && (
                              <motion.div layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mt-3 pl-10 space-y-3">
                                {list.topics.length === 0 && (<div className="text-xs text-gray-500">No topics yet — add one.</div>)}

                                {list.topics.map(topic => {
                                  if (searchQuery && !matches(topic.name) && !topic.workItems.some(w => matches(w.title))) return null;
                                  return (
                                    <div key={topic.id} className="group">
                                      <div className="flex items-center gap-3">
                                        <div className={`${topic.color ?? 'bg-gray-700 text-gray-300'} px-2 py-0.5 rounded-full text-xs`}></div>
                                        <button onClick={() => toggleTopic(list.id, topic.id)} className="flex-1 text-sm text-gray-300 text-left truncate">
                                          {topic.name}
                                        </button>

                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                                          <div className="text-xs text-gray-500">{topic?.workItems?.length}</div>
                                          <IconButton onClick={(e) => { e.stopPropagation(); scheduleDeleteTopic(list.id, topic.id); }} title="Delete topic">
                                            <Trash2 className="w-3 h-3 text-red-400" />
                                          </IconButton>
                                        </div>
                                      </div>

                                      <AnimatePresence>
                                        {topic.isExpanded && (
                                          <motion.div className="mt-2 pl-8 space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                            {topic?.workItems?.length === 0 && <div className="text-xs text-gray-500">No content — add some.</div>}

                                            {(topic?.workItems || []).map(w => {
                                              if (searchQuery && !matches(w.title)) return null;
                                              const isActive = isWorkItemActive(list.id, topic.id, w.id);
                                              return (
                                                <div 
                                                  key={w.id} 
                                                 className={`flex items-center justify-between text-sm group cursor-pointer rounded-md p-2 transition-all duration-200 ${
                                                   isActive 
                                                     ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/40 shadow-md' 
                                                     : 'text-gray-300 bg-gray-900/70 hover:bg-gray-800 border border-transparent'
                                                 }`}
                                                  onClick={() => handleWorkItemSelect(list.id, topic.id, w.id)}
                                                >
                                                  <div className="flex items-center gap-2 min-w-0 truncate">
                                                    {isActive && <Activity className="w-3 h-3 text-purple-400 animate-pulse flex-shrink-0" />}
                                                    {w.type === 'document' ? 
                                                      <FileText className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} /> : 
                                                      w.type === 'note' ? 
                                                      <BookOpen className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} /> : 
                                                      <Hash className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} />
                                                    }
                                                    <div className={`truncate font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                                      {w.title}
                                                    </div>
                                                    {isActive && (
                                                      <div className="flex items-center gap-1 text-xs text-purple-300 bg-purple-900/30 px-2 py-0.5 rounded-full">
                                                        <Zap className="w-3 h-3" />
                                                        Active
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div className="flex items-center gap-2">
                                                    <IconButton onClick={(e) => { e.stopPropagation(); scheduleDeleteWork(list.id, topic.id, w.id); }} title="Delete">
                                                      <Trash2 className="w-4 h-4 text-red-400" />
                                                    </IconButton>
                                                  </div>
                                                </div>
                                              );
                                            })}

                                            {inlineAdd.kind === 'work' && inlineAdd.listId === list.id && inlineAdd.topicId === topic.id ? (
                                              <div className="bg-gray-900 rounded p-2">
                                                <WorkAddRow onCancel={() => setInlineAdd({ kind: null })} onSave={(title, type) => commitAddWork(list.id, topic.id, title, type)} inputRef={inputRef} isSubmitting={inlineAdd.isSubmitting} />
                                              </div>
                                            ) : (
                                              <button onClick={() => startAddWork(list.id, topic.id)} className="text-xs text-gray-500 py-1 flex items-center gap-2 hover:text-gray-300">
                                                <Plus className="w-3 h-3" /> Add content
                                              </button>
                                            )}
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}

                                {inlineAdd.kind === 'topic' && inlineAdd.listId === list.id ? (
                                  <div className="bg-gray-900 rounded p-2">
                                    <InlineEditor initial="" placeholder="New topic name..." autoFocus onCancel={() => setInlineAdd({ kind: null })} onSave={(v) => commitAddTopic(list.id, v)} />
                                  </div>
                                ) : (
                                    <button
                                      onClick={() => startAddTopic(list.id)}
                                      disabled={inlineAdd.isSubmitting}
                                      className="text-xs text-gray-500 py-1 flex items-center gap-2 hover:text-gray-300 disabled:opacity-50"
                                    >
                                      {inlineAdd.isSubmitting && inlineAdd.listId === list.id ? (
                                        <>
                                          <Activity className="w-3 h-3 animate-spin" />
                                          Adding...
                                        </>
                                      ) : (
                                        <>
                                          <Plus className="w-3 h-3" />
                                          Add topic
                                        </>
                                      )}
                                    </button>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Channels</h4>
                      <div className="flex items-center gap-2">

                      <button
                        onClick={() => activeTeamId && startAddTopic(activeTeamId)}
                        disabled={inlineAdd.isSubmitting}
                        className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-2 disabled:opacity-50"
                      >
                        {inlineAdd.isSubmitting && inlineAdd.listId === activeTeamId ? (
                          <>
                            <Activity className="w-3 h-3 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="w-3 h-3" />
                            New Channel
                          </>
                        )}
                      </button>
                        <IconButton title="Team settings">
                          <Settings className="w-4 h-4 text-gray-400" />
                        </IconButton>
                      </div>
                    </div>

                    {!activeTeamId ? (
                      <div className="text-sm text-gray-500">Select a team on the left to view channels.</div>
                    ) : (
                      <div>
                        {/* Team header */}
                        {editingListId === activeTeamId ? (
                          <div className="flex items-center gap-3 mb-3 bg-gray-800 border border-indigo-500 rounded-md p-2">
                            <div className="flex-1">
                              <InlineEditor initial={projectLists.find(p => p.id === activeTeamId)?.name || ''} autoFocus onCancel={() => setEditingListId(null)} onSave={(v) => commitEditList(activeTeamId, v)} />
                            </div>
                            <IconButton onClick={() => setEditingListId(null)} title="Close">
                              <X className="w-4 h-4 text-gray-400" />
                            </IconButton>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 mb-3 group">
                            <motion.div
                              transition={{ type: "spring", stiffness: 120 }}
                              className="rounded-full p-3 bg-white/5"
                            >
                              <Sparkles size={6} aria-hidden />
                            </motion.div>
                            <div className="flex-1">
                              <div className="font-medium text-sm text-white">{projectLists.find(p => p.id === activeTeamId)?.name}</div>
                              <div className="text-xs text-gray-500">{projectLists.find(p => p.id === activeTeamId)?.members?.length ? `${projectLists.find(p => p.id === activeTeamId)?.members?.length} members` : 'Team'}</div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100">
                              <IconButton onClick={() => startEditList(activeTeamId)} title="Edit team name">
                                <Edit3 className="w-4 h-4 text-gray-400" />
                              </IconButton>
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          {projectLists?.find(p => p.id === activeTeamId)?.topics.filter(t => (searchQuery ? matches(t?.name) || t?.workItems?.some(w => matches(w.title)) : true))?.map(topic => (
                            <div key={topic.id} className="rounded group hover:bg-gray-900 p-2 border border-transparent hover:border-gray-700">
                              <div className="flex items-center justify-between">
                                <button onClick={() => toggleTopic(activeTeamId, topic.id)} className="flex items-center gap-2 text-sm text-gray-300 flex-1">
                                  <Hash className="w-4 h-4 text-gray-500" />
                                  <div className="truncate">{topic.name}</div>
                                </button>

                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100">
                                  <div className="text-xs text-gray-500">{topic?.workItems?.length}</div>
                                  <IconButton onClick={() => scheduleDeleteTopic(activeTeamId, topic.id)} title="Delete">
                                    <Trash2 className="w-4 h-4 text-red-400" />
                                  </IconButton>
                                </div>
                              </div>

                              <AnimatePresence>
                                {topic?.isExpanded && (
                                  <motion.div className="mt-2 pl-8 space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                    {topic?.workItems?.length === 0 && <div className="text-xs text-gray-500">No threads yet — start one.</div>}

                                    {topic?.workItems?.map(w => {
                                      const isActive = isWorkItemActive(activeTeamId!, topic.id, w.id);
                                      return (
                                        <div 
                                          key={w.id} 
                                          className={`flex items-center justify-between text-sm group cursor-pointer rounded-md p-2 transition-all duration-200 ${
                                            isActive 
                                              ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/40 shadow-md' 
                                              : 'text-gray-300 hover:bg-gray-800/60 border border-transparent'
                                          }`}
                                          onClick={() => handleWorkItemSelect(activeTeamId!, topic.id, w.id)}
                                        >
                                          <div className="flex items-center gap-2 truncate">
                                            {isActive && <Activity className="w-3 h-3 text-purple-400 animate-pulse flex-shrink-0" />}
                                            {w.type === 'document' ? 
                                              <FileText className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} /> : 
                                              w.type === 'note' ? 
                                              <BookOpen className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} /> : 
                                              <Hash className={`w-4 h-4 ${isActive ? 'text-purple-300' : 'text-gray-500'}`} />
                                            }
                                            <div className={`truncate font-medium ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                              {w.title}
                                            </div>
                                            {isActive && (
                                              <div className="flex items-center gap-1 text-xs text-purple-300 bg-purple-900/30 px-2 py-0.5 rounded-full">
                                                <Zap className="w-3 h-3" />
                                                Active
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <IconButton onClick={(e) => { e.stopPropagation(); scheduleDeleteWork(activeTeamId!, topic.id, w.id); }} title="Delete">
                                              <Trash2 className="w-4 h-4 text-red-400" />
                                            </IconButton>
                                          </div>
                                        </div>
                                      );
                                    })}

                                    {inlineAdd.kind === 'work' && inlineAdd.listId === activeTeamId && inlineAdd.topicId === topic.id ? (
                                      <div className="bg-gray-900 rounded p-2">
                                        <WorkAddRow onCancel={() => setInlineAdd({ kind: null })} onSave={(title, type) => commitAddWork(activeTeamId, topic.id, title, type)} inputRef={inputRef} isSubmitting={inlineAdd.isSubmitting}/>
                                      </div>
                                    ) : (
                                      <button onClick={() => startAddWork(activeTeamId, topic.id)} className="text-xs text-gray-500 py-1 flex items-center gap-2 hover:text-gray-300">
                                        <Plus className="w-3 h-3" /> Add thread
                                      </button>
                                    )}

                                  </motion.div>
                                )}
                              </AnimatePresence>

                            </div>
                          ))}

                          {inlineAdd.kind === 'topic' && inlineAdd.listId === activeTeamId ? (
                            <div className="bg-gray-900 rounded p-2 mt-2">
                              <InlineEditor initial="" placeholder="New channel name..." autoFocus onCancel={() => setInlineAdd({ kind: null })} onSave={(v) => commitAddTopic(activeTeamId, v)} />
                            </div>
                          ) : (
                            <button onClick={() => startAddTopic(activeTeamId)} className="text-xs text-gray-500 py-1 flex items-center gap-2 mt-2 hover:text-gray-300">
                              <Plus className="w-3 h-3" /> New channel
                            </button>
                          )}

                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 py-3 border-t border-gray-800">
            <div className="px-4 py-3 border-t border-gray-800 relative" ref={settingsRef}>
              <div className="flex items-center gap-3">
                <div>
                  <img src={currentUser?.profile} style={{borderRadius:"50%"}} alt="" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">
                    {currentUser ? currentUser?.username : 'Madan'}
                  </div>
                  <div className="text-xs text-gray-500">
                    {currentUser ? currentUser?.email : 'youremail@gmail.com'}
                  </div>
                </div>
                <button 
                  title="Settings"
                  onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                  className="p-2 rounded-lg hover:bg-gray-700/50 transition-colors duration-200"
                >
                  <SettingsIcon className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            
              {/* Settings Dropdown */}
              {isSettingsOpen && (
                <div className="absolute bottom-full left-4 right-4 mb-2 bg-gray-800/98 backdrop-blur-sm rounded-lg border border-gray-700/50 shadow-lg overflow-hidden z-50">
                  {/* Profile Section */}
                  <div className="px-4 py-3 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                      <div>
                        <img src={currentUser?.profile} style={{borderRadius:"50%"}} alt="" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-white">
                          {currentUser ? currentUser?.username : 'Madan'}
                        </div>
                        <div className="text-xs text-gray-400">
                          {currentUser ? currentUser?.email : 'khadkasumnan@gmail.com'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Navigation Menu Items */}
                  <div className="p-2">
                    {currentUser ? (
                      <>
                        {/* Account Link */}
                        <Link 
                          href={`/profile?id=${currentUser.id}`} 
                          className="flex items-center gap-3 px-3 py-2 text-white/90 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 no-underline" 
                          onClick={() => setIsSettingsOpen(false)}
                        >
                          <User className="w-4 h-4" />
                          <span className="text-sm">Account</span>
                        </Link>

                        <Link 
                          href="/subscription" 
                          className="flex items-center gap-3 px-3 py-2 text-white/90 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 no-underline" 
                          onClick={() => setIsSettingsOpen(false)}
                        >
                          <CreditCard className="w-4 h-4" />
                          <span className="text-sm">Pricing</span>
                        </Link>
                        
                        {/* Bug Report */}
                        <Link 
                          href="/bug-report" 
                          className="flex items-center gap-3 px-3 py-2 text-white/90 hover:text-white hover:bg-gray-700/50 rounded-md transition-all duration-200 no-underline" 
                          onClick={() => setIsSettingsOpen(false)}
                        >
                          <Bug className="w-4 h-4" />
                          <span className="text-sm">Bug Report</span>
                        </Link>
                        
                        {/* Logout */}
                        <div className="border-t border-gray-700 mt-2 pt-2">
                          <button 
                            className="flex items-center gap-3 px-3 py-2 text-red-400 hover:text-red-300 hover:bg-gray-700/50 rounded-md transition-all duration-200 w-full text-left" 
                            onClick={handleLogout}
                          >
                            <LogOut className="w-4 h-4" />
                            <span className="text-sm">Logout</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      /* Login Button - Shows when user is not logged in */
                      <Link 
                        href="/login" 
                        className="flex items-center justify-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors duration-200 no-underline"
                        onClick={() => setIsSettingsOpen(false)}
                      >
                        <span className="text-sm">Login</span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </motion.aside>
  );
}

function WorkAddRow({
  onSave,
  onCancel,
  inputRef,
  isSubmitting = false,
}: {
  onSave: (title: string, type: WorkItem['type']) => void;
  onCancel: () => void;
  inputRef?: React.RefObject<HTMLInputElement>;
  isSubmitting?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<WorkItem['type']>('whiteboard');

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim(), type);
    }
  };

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-md shadow-sm p-3 mx-2 mb-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Title..."
        className="w-full px-2 py-1.5 text-sm text-white placeholder-gray-400 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
      />

      <select
        value={type}
        onChange={(e) => setType(e.target.value as WorkItem['type'])}
        className="w-full mt-2 px-2 py-1.5 text-xs text-gray-200 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
      >
        <option value="whiteboard">Workspace</option>
        <option value="document">Creative_canvas</option>
      </select>

      <div className="flex gap-1.5 mt-3">
        <button
          onClick={onCancel}
          className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSubmitting}
          className="flex-1 px-2 py-1.5 text-xs font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400"
        >
          {isSubmitting ? (
            <>
              <Activity className="w-3 h-3 animate-spin" />
              Creating...
            </>
          ) : (
            'Add'
          )}
        </button>
      </div>
    </div>
  );
}
