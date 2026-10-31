import React, { useState, useEffect } from 'react';
import { Card, GlobalNote } from '@/typings/agent';
import { 
    Plus, Search, BookOpen, GripVertical, Trash2, 
    Edit3, Eye, X, FileText, Loader2, AlertCircle, 
    ChevronDown, ChevronRight, User, Link2, RefreshCcw,
    Maximize2, Minimize2, Layers, Tag
} from 'lucide-react';
import { pythonUrl } from "../../../apiurl"
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import { useSelector } from 'react-redux';

interface RootState {
  user: {
    currentUser?: {
      id?:string;
      user?: { _id: string, email: string };
    };
    accessToken: string;
  };
}


interface NotesSidebarProps {
  isOpen: boolean;
  notes: GlobalNote[];
  onAddNote: () => void;
  onUpdateNote: (id: string, updates: Partial<GlobalNote>) => void;
  onDeleteNote: (id: string) => void;
  onClose: () => void;
  projectId?: string;
  userInfo?: any;
  searchCards: (query: string, tags: string[], signal?: AbortSignal) => Promise<Card[]>;
  searchTags: (query: string, signal?: AbortSignal) => Promise<{ name: string; count: number }[]>;
}

const ProjectNoteCard = ({ 
    projectNote, 
    isExpanded,
    onToggle,
    onDragStart,
    isLoadingBlocks
}: { 
    projectNote: any,
    isExpanded: boolean,
    onToggle: () => void,
    onDragStart: (e: React.DragEvent, note: any) => void,
    isLoadingBlocks?: boolean
}) => {
    return (
        <div 
            draggable
            onDragStart={(e) => onDragStart(e, projectNote)}
            className="group relative flex flex-col rounded-xl border border-purple-200 bg-gradient-to-br from-purple-50/50 to-blue-50/30 hover:shadow-lg transition-all duration-300 cursor-grab active:cursor-grabbing"
        >
          
            <div className="flex items-center gap-2 p-3">
                <button 
                    onClick={onToggle}
                    className="text-purple-400 hover:text-purple-600 transition-colors"
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                
                <GripVertical size={14} className="text-purple-300" />
                
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-bold text-gray-800 text-sm truncate">{projectNote.title}</h4>
                        <Link2 size={12} className="text-purple-400" />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            <User size={10} />
                            <span>{projectNote.author?.username || 'Unknown'}</span>
                        </div>
                        {projectNote.work_item && (
                            <span className="text-[10px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                                {projectNote.work_item.title}
                            </span>
                        )}
                        {projectNote.topic && (
                            <span className="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
                                {projectNote.topic.topic_name}
                            </span>
                        )}
                    </div>
                </div>

                <div className="text-xs text-purple-600 font-medium bg-purple-100 px-2 py-1 rounded-md">
                    {projectNote.blocks_count || 0} blocks
                </div>
            </div>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-2 animate-in slide-in-from-top-2">
                      {isLoadingBlocks ? (
                          <div className="flex items-center justify-center py-4">
                              <Loader2 className="animate-spin text-purple-500" size={20} />
                              <span className="ml-2 text-xs text-gray-500">Loading blocks...</span>
                          </div>
                      ) : projectNote.blocks && projectNote.blocks.length > 0 ? (
                        <div className="bg-white/70 rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                            {projectNote.blocks.slice(0, 5).map((block: any, idx: number) => (
                                <div key={block.id || idx} className="border-l-2 border-purple-300 pl-2">
                                    <div className="text-[9px] font-mono text-purple-500 mb-1">
                                        Block {idx + 1} • {block.type || 'text'}
                                    </div>
                                    <div className="text-xs text-gray-700 line-clamp-2">
                                       <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight]}>
                                        {block.content.length > 500 ? block.content.slice(0, 500) + '…' : block.content}

                                      </ReactMarkdown>
                                    </div>
                                </div>
                            ))}
                            {projectNote.blocks.length > 5 && (
                                <div className="text-xs text-purple-500 italic text-center pt-1">
                                    +{projectNote.blocks.length - 5} more blocks
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-xs text-gray-400 italic text-center py-2">Loading blocks...</div>
                    )}
                </div>
            )}
            
            <div className="absolute left-0 top-4 w-1 h-8 rounded-r-full bg-gradient-to-b from-purple-500 to-blue-500" />
        </div>
    );
};

export const NotesSidebar: React.FC<NotesSidebarProps> = ({
  isOpen,
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onClose,
  projectId,
  userInfo,
  searchCards,
  searchTags,
}) => {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;
  const [searchTerm, setSearchTerm] = useState('');
  const [projectNotes, setProjectNotes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'project' | 'cards'>('cards');
  const [loadingBlocks, setLoadingBlocks] = useState<Set<string>>(new Set());
  const [cardResults, setCardResults] = useState<Card[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchTerm, setTagSearchTerm] = useState('');
  const [tagSearchResults, setTagSearchResults] = useState<{ name: string; count: number }[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isSearchingCards, setIsSearchingCards] = useState(false);
  const [isSearchingTags, setIsSearchingTags] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(420);
  const resizeCleanupRef = React.useRef<(() => void) | null>(null);

  // NEW: Track if we have successfully loaded data
  const [hasLoaded, setHasLoaded] = useState(false);

  // NEW: Reset loading state if projectId changes (user switches projects)
  useEffect(() => {
    setHasLoaded(false);
    setProjectNotes([]);
  }, [projectId]);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem('reference-library-width'));
    if (Number.isFinite(savedWidth) && savedWidth >= 320 && savedWidth <= 760) {
      setSidebarWidth(savedWidth);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('reference-library-width', String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    // UPDATED: Only fetch if we haven't loaded yet
    if (isOpen && projectId && activeTab === 'project' && !hasLoaded) {
      fetchProjectNotes();
    }
  }, [isOpen, projectId, activeTab, hasLoaded]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'cards') return;
    const controller = new AbortController();
    let live = true;
    const timeout = window.setTimeout(() => {
      setIsSearchingCards(true);
      searchCards(searchTerm, selectedTags, controller.signal)
        .then(results => {
          if (!live) return;
          setCardResults(results);
          setSelectedCardId(current =>
            results.some(card => card.id === current) ? current : results[0]?.id ?? null
          );
        })
        .catch(error => {
          if (live && error?.name !== 'AbortError') setCardResults([]);
        })
        .finally(() => {
          if (live) setIsSearchingCards(false);
        });
    }, 180);

    return () => {
      live = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, activeTab, searchTerm, selectedTags, searchCards]);

  useEffect(() => {
    if (!isOpen || activeTab !== 'cards') return;
    const controller = new AbortController();
    let live = true;
    const timeout = window.setTimeout(() => {
      setIsSearchingTags(true);
      searchTags(tagSearchTerm, controller.signal)
        .then(results => {
          if (live) setTagSearchResults(results);
        })
        .catch(error => {
          if (live && error?.name !== 'AbortError') setTagSearchResults([]);
        })
        .finally(() => {
          if (live) setIsSearchingTags(false);
        });
    }, 120);

    return () => {
      live = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isOpen, activeTab, tagSearchTerm, searchTags]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    resizeCleanupRef.current?.();
    const startX = event.clientX;
    const startWidth = sidebarWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMove = (moveEvent: PointerEvent) => {
      setSidebarWidth(Math.min(760, Math.max(320, startWidth + moveEvent.clientX - startX)));
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      resizeCleanupRef.current = null;
    };

    resizeCleanupRef.current = cleanup;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  const handleDragCard = (event: React.DragEvent, card: Card) => {
    event.dataTransfer.setData('application/card', JSON.stringify(card));
    event.dataTransfer.setData('text/plain', card.title || 'Card reference');
    event.dataTransfer.effectAllowed = 'link';
  };

  // UPDATED: Added force param
  const fetchProjectNotes = async (force = false) => {
    if (!projectId) return;
    
    // Prevent duplicate fetch if already loaded and not forcing refresh
    if (!force && hasLoaded) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${pythonUrl}/api/projects/${projectId}/notes`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch project notes');

      const data = await response.json();
      
      setProjectNotes(data.notes || []);
      setHasLoaded(true); // Mark as loaded
    } catch (err) {
      console.error('Error fetching project notes:', err);
      setError('Failed to load project notes');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchProjectNotes(true);
  };

  const fetchNoteDetails = async (sessionId: string) => {
    if (!projectId) return null;

    try {
      const response = await fetch(`${pythonUrl}/api/projects/${projectId}/notes/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch note details');

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('Error fetching note details:', err);
      return null;
    }
  };

const toggleNoteExpansion = async (sessionId: string) => {
    const newExpanded = new Set(expandedNotes);
    
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
      setExpandedNotes(newExpanded);
    } else {
      newExpanded.add(sessionId);
      setExpandedNotes(newExpanded); // Update expansion state FIRST
      
      const noteIndex = projectNotes.findIndex(n => n.session_id === sessionId);
      if (noteIndex !== -1 && !projectNotes[noteIndex].blocks) {
        setLoadingBlocks(prev => new Set(prev).add(sessionId));
        const details = await fetchNoteDetails(sessionId);

        setLoadingBlocks(prev => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });

        if (details) {
          const updated = [...projectNotes];
          updated[noteIndex] = { ...updated[noteIndex], blocks: details.blocks, metadata: details.metadata };
          setProjectNotes(updated);
        }
      }
    }
  };

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('application/react-note-id', noteId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragProjectNote = (e: React.DragEvent, projectNote: any) => {
    const noteData = {
      type: 'project-note-reference',
      sessionId: projectNote.session_id,
      title: projectNote.title,
      blocks: projectNote.blocks || [],
      author: projectNote.author,
      workItem: projectNote.work_item,
      topic: projectNote.topic,
      metadata: projectNote.metadata,
    };
    
    e.dataTransfer.setData('application/project-note', JSON.stringify(noteData));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredNotes = notes.filter(n => 
      n.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      n.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProjectNotes = projectNotes.filter(n => {
    try {
      if (!n || typeof n !== 'object') return false;
      
      const title = n.title || '';
      const username = n.author?.username || '';
      const workItemTitle = n.work_item?.title || '';
      const searchLower = searchTerm.toLowerCase();
      
      return (
        title.toLowerCase().includes(searchLower) ||
        username.toLowerCase().includes(searchLower) ||
        workItemTitle.toLowerCase().includes(searchLower)
      );
    } catch (error) {
      return false;
    }
  });

  const filteredTags = new Map(tagSearchResults.map(tag => [tag.name, tag]));
  selectedTags.forEach(tag => {
    if (!filteredTags.has(tag)) filteredTags.set(tag, { name: tag, count: 0 });
  });

  return (
    <>
        {isOpen && (
            <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[90] md:hidden" onClick={onClose} />
        )}
        <div 
            className={`
                fixed top-0 left-0 h-full
                bg-white shadow-2xl border-r border-gray-200/80
                transform transition-transform duration-300 ease-out z-[100] flex flex-col
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
            style={{
                width: `min(${sidebarWidth}px, calc(100vw - 24px))`,
                backgroundImage: 'radial-gradient(#e5e7eb 1.5px, transparent 1.5px)',
                backgroundSize: '20px 20px',
                backgroundColor: '#ffffff'
            }}
            onMouseDown={event => event.stopPropagation()}
            onWheel={event => event.stopPropagation()}
            onDrop={event => event.stopPropagation()}
        >
            <div className="p-5 pb-2 bg-white/80 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-100">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-500 text-white rounded-lg">
                            <BookOpen size={18} />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-800 text-base leading-none">Reference Library</h2>
                            <p className="text-[10px] text-gray-400 mt-1 font-medium tracking-wide uppercase">Knowledge Base</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setSidebarWidth(width => width >= 560 ? 360 : 640)}
                            className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-all"
                            title={sidebarWidth >= 560 ? 'Contract library' : 'Expand library'}
                            aria-label={sidebarWidth >= 560 ? 'Contract library' : 'Expand library'}
                        >
                            {sidebarWidth >= 560 ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <button onClick={onClose} className="p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 rounded-lg transition-all" aria-label="Close reference library">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div className="flex gap-1 mb-3 bg-gray-100 p-1 rounded-lg items-center">
                    <button
                        onClick={() => setActiveTab('cards')}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'cards' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Layers size={13} /> Research Cards ({cardResults.length})
                    </button>
                    {projectId && (
                        <button 
                            onClick={() => setActiveTab('project')}
                            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${activeTab === 'project' ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Quick Notes ({projectNotes.length})
                        </button>
                    )}
                    {activeTab === 'project' && projectId && (
                        <button 
                            onClick={handleRefresh}
                            className={`p-1.5 rounded-md hover:bg-white hover:text-purple-600 text-gray-400 transition-all ${isLoading ? 'animate-spin text-purple-500' : ''}`}
                            title="Refresh List"
                        >
                            <RefreshCcw size={14} />
                        </button>
                    )}
                </div>

                <div className="flex gap-2">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4 group-focus-within:text-purple-500 transition-colors" />
                        <input 
                            type="text" 
                            placeholder={activeTab === 'cards' ? 'Search cards by title or content…' : 'Search notes…'} 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-100 focus:border-purple-200 transition-all"
                        />
                    </div>
                </div>
            </div>

            <div className={`flex-1 min-h-0 p-4 space-y-3 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent ${activeTab === 'cards' ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>

                {activeTab === 'cards' && (
                    <>
                        <div className="shrink-0 space-y-2">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2 text-gray-400" size={13} />
                                <input
                                    type="search"
                                    value={tagSearchTerm}
                                    onChange={event => setTagSearchTerm(event.target.value)}
                                    placeholder="Search tags…"
                                    aria-label="Search tags"
                                    className="w-full rounded-lg border border-gray-200 bg-white/90 py-1.5 pl-8 pr-8 text-xs text-gray-800 outline-none transition focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
                                />
                                {isSearchingTags && <Loader2 className="absolute right-2.5 top-2 animate-spin text-purple-400" size={13} />}
                            </div>
                            <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
                            {Array.from(filteredTags.values()).slice(0, 48).map(tag => (
                                <button
                                    key={tag.name}
                                    type="button"
                                    onClick={() => setSelectedTags(current => current.includes(tag.name) ? current.filter(item => item !== tag.name) : [...current, tag.name])}
                                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] transition-colors ${selectedTags.includes(tag.name) ? 'bg-blue-600 text-white' : 'bg-white/90 border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}
                                >
                                    <Tag size={10} /> #{tag.name}
                                    <span className={selectedTags.includes(tag.name) ? 'text-blue-100' : 'text-gray-400'}>{tag.count}</span>
                                </button>
                            ))}
                            {!!selectedTags.length && (
                                <button type="button" onClick={() => setSelectedTags([])} className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-700">
                                    Clear tags
                                </button>
                            )}
                            {!isSearchingTags && !tagSearchResults.length && !tagSearchTerm && <span className="text-[11px] text-gray-400">No tags found across cards you can access.</span>}
                            {!isSearchingTags && !tagSearchResults.length && !!tagSearchTerm && <span className="text-[11px] text-gray-400">No global tags match “{tagSearchTerm}”.</span>}
                            </div>
                        </div>

                        <div className="flex-1 min-h-0 flex flex-col gap-3">
                            <div className={`space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-200 ${selectedCardId ? 'max-h-[38%] shrink-0' : 'flex-1'}`}>
                                {isSearchingCards && cardResults.length === 0 ? (
                                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-400">
                                        <Loader2 className="animate-spin text-purple-500" size={18} /> Searching cards…
                                    </div>
                                ) : cardResults.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400">
                                        <Layers size={28} className="mb-2 text-purple-300" />
                                        <p className="text-sm font-medium">No cards found</p>
                                        <p className="text-xs mt-1">Try another search or clear a tag filter.</p>
                                    </div>
                                ) : cardResults.map(card => (
                                    <article
                                        key={card.id}
                                        draggable
                                        onDragStart={event => handleDragCard(event, card)}
                                        onClick={() => setSelectedCardId(card.id)}
                                        className={`group cursor-grab active:cursor-grabbing rounded-xl border p-3 transition-all ${selectedCardId === card.id ? 'border-purple-300 bg-purple-50/80 shadow-sm' : 'border-gray-200 bg-white/90 hover:border-purple-200 hover:shadow-sm'}`}
                                        title="Drag onto the canvas to add a linked reference"
                                    >
                                        <div className="flex items-start gap-2">
                                            <GripVertical size={14} className="mt-0.5 shrink-0 text-gray-300 group-hover:text-purple-400" />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="truncate text-sm font-semibold text-gray-800">{card.title || 'Untitled card'}</h3>
                                                    <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium uppercase text-blue-600">{card.type}</span>
                                                </div>
                                                <div className="mt-1 flex flex-wrap gap-1">
                                                    {(card.tags || []).map(tag => <span key={tag} className="text-[10px] text-purple-600">#{tag}</span>)}
                                                    <span className="ml-auto text-[9px] text-gray-400">Reference · drag to canvas</span>
                                                </div>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>

                            {cardResults.find(card => card.id === selectedCardId) && (() => {
                                const card = cardResults.find(item => item.id === selectedCardId)!;
                                return (
                                    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-purple-200 bg-white/95 shadow-sm">
                                        <header className="shrink-0 border-b border-gray-100 px-3 py-2">
                                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-800">
                                                <FileText size={13} className="text-purple-500" />
                                                <span className="truncate">{card.title || 'Untitled card'}</span>
                                            </div>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {(card.tags || []).map(tag => <span key={tag} className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-600">#{tag}</span>)}
                                            </div>
                                        </header>
                                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-700 scrollbar-thin scrollbar-thumb-gray-200">
                                            {card.content ? (
                                                <div className="prose prose-sm max-w-none break-words text-gray-700">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, rehypeHighlight]}>
                                                        {card.content}
                                                    </ReactMarkdown>
                                                </div>
                                            ) : <p className="text-xs italic text-gray-400">This card has no content.</p>}
                                        </div>
                                    </section>
                                );
                            })()}
                        </div>
                    </>
                )}
                
                {activeTab === 'project' && (
                    <>
                        {isLoading && projectNotes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8">
                                <Loader2 className="animate-spin text-purple-500 mb-2" size={32} />
                                <p className="text-sm text-gray-500">Loading project notes...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center">
                                <AlertCircle className="text-red-400 mb-2" size={32} />
                                <p className="text-sm text-red-600 font-medium">{error}</p>
                                <button 
                                    onClick={() => fetchProjectNotes(true)}
                                    className="mt-3 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs hover:bg-red-100 transition-colors"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : filteredProjectNotes.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                                <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-3">
                                    <FileText className="text-purple-300" size={32} />
                                </div>
                                <p className="text-sm font-medium text-gray-500">No project notes found</p>
                                <p className="text-xs text-gray-400 mt-1">Notes from your project will appear here</p>
                            </div>
                        ) : (
                            filteredProjectNotes?.map(projectNote => (
                                <ProjectNoteCard 
                                    key={projectNote.session_id}
                                    projectNote={projectNote}
                                    isExpanded={expandedNotes.has(projectNote.session_id)}
                                    onToggle={() => toggleNoteExpansion(projectNote.session_id)}
                                    onDragStart={handleDragProjectNote}
                                    isLoadingBlocks={loadingBlocks.has(projectNote.session_id)}
                                />
                            ))
                        )}
                    </>
                )}

            </div>
            
            <div className="p-3 bg-white/80 border-t border-gray-100 text-center">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                    <GripVertical size={10} />
                    {activeTab === 'project' ? 'Drag to create reference nodes' : 'Drag cards to canvas as references'}
                </span>
            </div>
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize reference library"
                onPointerDown={startResize}
                className="absolute inset-y-0 right-0 z-30 w-2 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-purple-400/20"
                title="Drag to resize the Reference Library"
            >
                <div className="absolute inset-y-0 right-0 w-px bg-gray-200" />
            </div>
        </div>
    </>
  );
};
