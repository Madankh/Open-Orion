import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, BookmarkPlus, Trash2, ExternalLink, 
  Search, Loader2, Sparkles, Quote, Highlighter, Send, X
} from 'lucide-react';
import { Block } from '@/typings/agent';
import { useSelector } from 'react-redux';
import { pythonUrl } from '@/apiurl';

interface TranscriptSegment {
  timestamp: string;
  time_seconds: number;
  content: string;
  duration: number;
}

interface TimestampNote {
  id: string;
  timestamp: number;
  note: string;
  createdAt: number;
}

interface YouTubeBlockProps {
  block: Block & {
    url?: string;
    videoId?: string;
    title?: string;
    timestamps?: TimestampNote[];
  };
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  onAskAI: (prompt: string) => void;
  handleTextChange: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void; 
}
interface RootState {
    user: {
      currentUser?: {
        id?:string;
        user?: { _id: string };
      };
      accessToken: string;
    };
    
}
const YouTubeBlock: React.FC<YouTubeBlockProps> = ({
  block,
  darkMode,
  updateBlock,
  registerBlockRef,
  onAskAI,
}) => {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const userid = user?.currentUser?.id;

  const [isEditing, setIsEditing] = useState(!block.videoId);
  const [urlInput, setUrlInput] = useState(block.url || '');
  const [currentTime, setCurrentTime] = useState(0);
  
  // Default to false: Show Notes first
  const [showTranscript, setShowTranscript] = useState(false); 
  
  const [newNote, setNewNote] = useState('');
  
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  // Floating Selection Menu State
  const [selection, setSelection] = useState<{ x: number; y: number; text: string } | null>(null);
  const [isAiInputVisible, setIsAiInputVisible] = useState(false);
  const [aiQuestion, setAiQuestion] = useState('');

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timeUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);

  // --- Initialize YouTube API ---
  useEffect(() => {
    if (containerRef.current) registerBlockRef(block.id, containerRef.current);
    if (!block.videoId) return;

    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (iframeRef.current && (window as any).YT && !playerRef.current) {
        playerRef.current = new (window as any).YT.Player(iframeRef.current, {
          events: {
            onStateChange: (event: any) => {
              const YT = (window as any).YT;
              if (event.data === YT.PlayerState.PLAYING) startTimeTracking();
              else stopTimeTracking();
            }
          }
        });
      }
    };

    if ((window as any).YT?.Player) initPlayer();
    else (window as any).onYouTubeIframeAPIReady = initPlayer;

    return () => stopTimeTracking();
  }, [block.videoId]);

  const startTimeTracking = () => {
    stopTimeTracking();
    timeUpdateIntervalRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        setCurrentTime(playerRef.current.getCurrentTime());
      }
    }, 500);
  };

  const stopTimeTracking = () => {
    if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
  };

  // --- Handlers ---
  const handleUrlSubmit = useCallback(() => {
    const patterns = [/(?:v=|be\/|embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    let videoId = null;
    for (const p of patterns) {
      const match = urlInput.match(p);
      if (match) videoId = match[1];
    }

    if (videoId) {
      updateBlock(block.id, { url: urlInput, videoId, title: 'YouTube Video' });
      setIsEditing(false);
      setTranscript([]);
    }
  }, [urlInput, block.id, updateBlock]);

  const jumpToTimestamp = (time: number) => {
    playerRef.current?.seekTo(time, true);
    playerRef.current?.playVideo();
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Transcript & Research Logic ---
  const fetchTranscript = async () => {
    if (!block.videoId) return;
    setIsLoadingTranscript(true);
    setTranscriptError(null);
    try {
      const response = await fetch(`${pythonUrl}/api/youtube/transcript?url=${block.videoId}`,
        {headers: {
            'Authorization': `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        });
      const data = await response.json();
      if (data.success) setTranscript(data.segments);
      else throw new Error();
    } catch {
      setTranscriptError("Transcript not available for this video.");
    } finally {
      setIsLoadingTranscript(false);
    }
  };

  useEffect(() => {
    if (showTranscript && transcript.length === 0) fetchTranscript();
  }, [showTranscript]);

  const handleTextSelection = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (text && text.length > 5) {
      const range = sel?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        setSelection({
          x: rect.left + rect.width / 2,
          y: rect.top + window.scrollY - 50,
          text
        });
        setIsAiInputVisible(false);
        setAiQuestion('');
      }
    }
  };

  // Close selection when clicking elsewhere
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#floating-menu')) {
        setSelection(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);


  const handleSendAiQuestion = () => {
    if (!selection || !aiQuestion.trim()) return;
  
    const baseUrl = block.url || `https://www.youtube.com/watch?v=${block.videoId}`;

    const formattedPrompt = `
    Video Source: ${baseUrl}
    Timestamp: ${formatTime(currentTime)}
    Context from transcript: "${selection.text}" User Question ${aiQuestion}`.trim();
  
    onAskAI(formattedPrompt);

    setSelection(null);
    setIsAiInputVisible(false);
    setAiQuestion('');
  };

  const filteredTranscript = useMemo(() => {
    return transcript.filter(s => s.content.toLowerCase().includes(transcriptSearch.toLowerCase()));
  }, [transcript, transcriptSearch]);

  // --- UI Components ---
  if (isEditing) {
    return (
      <div ref={containerRef} className={`my-4 p-6 rounded-xl border-2 transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200 shadow-sm'}`}>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
            <Play size={20} className="text-red-600" />
          </div>
          <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Source Video</h3>
        </div>
        <input
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste YouTube Link"
          className={`w-full px-4 py-3 rounded-xl border-2 focus:ring-2 focus:ring-red-500 outline-none transition-all ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-50 border-gray-200'}`}
        />
        <div className="flex gap-3 mt-4">
          <button onClick={handleUrlSubmit} className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-all shadow-lg shadow-red-600/20">
            Embed & Analyze
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`my-6 rounded-2xl border overflow-hidden transition-all ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200 shadow-xl'}`}>
      
      {/* 1. Video Player */}
      <div className="relative aspect-video w-full bg-black">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${block.videoId}?enablejsapi=1&rel=0`}
          title="Video Player"
          className="w-full h-full"
          allowFullScreen
        />
      </div>

      {/* 2. Dashboard */}
      <div className="p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{block.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-sm font-mono px-2 py-0.5 rounded ${darkMode ? 'bg-gray-800 text-red-400' : 'bg-red-50 text-red-600'}`}>
                {formatTime(currentTime)}
              </span>
              <button onClick={() => setIsEditing(true)} className="text-xs text-gray-500 hover:underline flex items-center gap-1">
                <ExternalLink size={12}/> Change Source
              </button>
            </div>
          </div>
          
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
             <button 
              onClick={() => setShowTranscript(false)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!showTranscript ? (darkMode ? 'bg-gray-700 text-white' : 'bg-white shadow-sm text-gray-900') : 'text-gray-500'}`}
            >
              Notes ({block.timestamps?.length || 0})
            </button>

          </div>
        </div>

        {/* 3. Content Area */}
        <div className="min-h-[300px]">
          {showTranscript ? (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm border-none focus:ring-2 focus:ring-red-500 ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}
                  placeholder="Search in video..."
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                />
              </div>

              {/* TRANSCRIPT: VERTICAL LIST FIX */}
              <div 
                ref={transcriptScrollRef}
                onMouseUp={handleTextSelection}
                className={`max-h-[400px] overflow-y-auto p-2 rounded-xl transition-all space-y-1 ${
                  darkMode ? 'bg-gray-800/50' : 'bg-gray-50'
                }`}
              >
                {isLoadingTranscript ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                    <Loader2 className="animate-spin mb-2" />
                    <p className="text-sm">Synthesizing transcript...</p>
                  </div>
                ) : (
                  // Changed from span to div with flex layout for vertical list
                  filteredTranscript.map((seg, i) => {
                    const isActive = currentTime >= seg.time_seconds && (!filteredTranscript[i+1] || currentTime < filteredTranscript[i+1].time_seconds);
                    return (
                      <div 
                        key={i}
                        id={`seg-${block.id}-${seg.time_seconds}`}
                        onClick={() => jumpToTimestamp(seg.time_seconds)}
                        className={`flex gap-4 p-2 rounded-lg cursor-pointer transition-all duration-200 border-l-4 ${
                          isActive 
                            ? (darkMode ? 'bg-gray-700/50 border-red-500 text-white' : 'bg-white border-red-500 shadow-sm text-gray-900') 
                            : (darkMode ? 'border-transparent text-gray-400 hover:bg-gray-700/30 hover:text-gray-200' : 'border-transparent text-gray-600 hover:bg-gray-200/50 hover:text-black')
                        }`}
                      >
                        <span className="text-xs font-mono font-bold opacity-50 shrink-0 pt-1 select-none">
                          {formatTime(seg.time_seconds)}
                        </span>
                        <p className="text-sm leading-relaxed">
                          {seg.content}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Notes Section */
            <div className="flex flex-col gap-4">
               <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={`Add a research note at ${formatTime(currentTime)}...`}
                  className={`flex-1 px-4 py-2 rounded-xl border-none focus:ring-2 focus:ring-red-500 ${darkMode ? 'bg-gray-800 text-white' : 'bg-gray-100'}`}
                  onKeyDown={(e) => e.key === 'Enter' && newNote.trim() && (() => {
                     const ts = block.timestamps || [];
                     updateBlock(block.id, { timestamps: [...ts, { id: Date.now().toString(), timestamp: currentTime, note: newNote, createdAt: Date.now() }] });
                     setNewNote('');
                  })()}
                />
                <button 
                  onClick={() => {
                    const ts = block.timestamps || [];
                    updateBlock(block.id, { timestamps: [...ts, { id: Date.now().toString(), timestamp: currentTime, note: newNote, createdAt: Date.now() }] });
                    setNewNote('');
                  }}
                  className="p-2 bg-red-600 text-white rounded-xl hover:bg-red-700"
                >
                  <BookmarkPlus size={20} />
                </button>
              </div>
              
              <div className="flex flex-col gap-2">
                {block.timestamps?.length ? (
                  block.timestamps.map(ts => (
                    <div key={ts.id} className={`p-3 rounded-xl flex items-start gap-3 w-full ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      <button onClick={() => jumpToTimestamp(ts.timestamp)} className="mt-1 text-xs font-mono font-bold text-red-500 whitespace-nowrap">
                        {formatTime(ts.timestamp)}
                      </button>
                      <p className={`flex-1 text-sm break-words ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{ts.note}</p>
                      <button onClick={() => updateBlock(block.id, { timestamps: block.timestamps?.filter(x => x.id !== ts.id) })} className="text-gray-400 hover:text-red-500 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 opacity-50 text-sm">No notes yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Floating AI Selection Menu */}
      {selection && (
        <div 
          id="floating-menu"
          className="fixed z-[9999] p-1 rounded-xl shadow-2xl border animate-in fade-in zoom-in duration-200"
          style={{ 
            left: `${selection.x}px`, 
            top: `${selection.y}px`, 
            transform: 'translateX(-50%)',
            backgroundColor: darkMode ? '#1f2937' : 'white',
            borderColor: darkMode ? '#374151' : '#e5e7eb'
          }}
        >
          {!isAiInputVisible ? (
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsAiInputVisible(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
              >
                <Sparkles size={14} /> Ask AI
              </button>
              <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              <button onClick={() => { navigator.clipboard.writeText(selection.text); setSelection(null); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><Quote size={14} /></button>
              <button onClick={() => { 
                const ts = block.timestamps || []; 
                updateBlock(block.id, { timestamps: [...ts, { id: Date.now().toString(), timestamp: currentTime, note: `Highlight: "${selection.text}"`, createdAt: Date.now() }] });
                setSelection(null); 
              }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"><Highlighter size={14} /></button>
            </div>
          ) : (
            // Larger Input Box (w-96)
            <div className="flex items-center gap-2 p-2 w-96">
               <button onClick={() => setIsAiInputVisible(false)} className="text-gray-400 hover:text-gray-600">
                <X size={14} />
              </button>
              <input
                autoFocus
                type="text"
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendAiQuestion()}
                placeholder="Ask AI about this selection..."
                className={`flex-1 text-sm bg-transparent border-none focus:ring-0 p-0 ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
              />
              <button onClick={handleSendAiQuestion} className="p-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700">
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default YouTubeBlock;