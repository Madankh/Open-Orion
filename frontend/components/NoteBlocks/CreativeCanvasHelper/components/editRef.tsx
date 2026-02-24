import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X,Loader2, FileText, ChevronRight, ChevronLeft } from 'lucide-react';
import { toast } from "sonner";
import { useSelector } from 'react-redux';
import { pythonUrl } from "../../../../apiurl"
import BlockRenderer from "../../../NoteBlocks/Block"; 
import SlashCommandMenu from "../../../NoteBlocks/SlashCommandMenu";
import { Block, Position, RootState } from '@/typings/agent';

interface SessionNoteEditorProps {
  sessionId: string;
  onClose: () => void;
  initialBlocks?: Block[];
}

const SessionNoteEditor: React.FC<SessionNoteEditorProps> = ({ 
  sessionId, 
  onClose,
  initialBlocks 
}) => {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken || '';

  const [blocks, setBlocks] = useState<Block[]>(initialBlocks || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialBlocks);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  const [focusedBlockId, setFocusedBlockId] = useState<number | null>(null);
  
  const [showSlashMenu, setShowSlashMenu] = useState<boolean>(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState<Position>({ x: 0, y: 0 });
  const [slashBlockId, setSlashBlockId] = useState<number | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);
  const [blocksPerPage] = useState(15);
  const [totalBlocks, setTotalBlocks] = useState(0);

  const generateBlockId = () => Date.now() + Math.random();

  // Calculate pagination info
  const totalPages = Math.ceil(totalBlocks / blocksPerPage);
  const hasOlderBlocks = currentPage < totalPages - 1;
  const hasNewerBlocks = currentPage > 0;

  // --- Data Fetching with Pagination ---
  const fetchBlocks = useCallback(async (page: number = 0) => {
    try {
      setIsLoading(true);
      const apiPage = page + 1; // API pages start at 1
      const response = await fetch(
        `${pythonUrl}/api/note/session/${sessionId}?page=${apiPage}&page_size=${blocksPerPage}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
        }
      );

      if (!response.ok) throw new Error("Failed to load notes");
      const data = await response.json();
      
      // Store pagination metadata
      if (data.pagination) {
        setTotalBlocks(data.pagination.total_blocks || 0);
      }

      let loadedBlocks = data.blocks || [];
      if (loadedBlocks.length === 0) {
        loadedBlocks = [{ id: generateBlockId(), type: 'text', content: '' }];
      }
      setBlocks(loadedBlocks);
    } catch (error) {
      console.error(error);
      toast.error("Could not load session notes");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, accessToken, blocksPerPage]);

  // Initial load
  useEffect(() => {
    if (initialBlocks) {
      setBlocks(initialBlocks);
      return;
    }

    if (sessionId && accessToken) {
      fetchBlocks(0);
    }
  }, [sessionId, accessToken, initialBlocks, fetchBlocks]);

  // Navigation handlers
  const goToOlderBlocks = useCallback(() => {
    if (hasOlderBlocks) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchBlocks(nextPage);
    }
  }, [hasOlderBlocks, currentPage, fetchBlocks]);

  const goToNewerBlocks = useCallback(() => {
    if (hasNewerBlocks) {
      const prevPage = currentPage - 1;
      setCurrentPage(prevPage);
      fetchBlocks(prevPage);
    }
  }, [hasNewerBlocks, currentPage, fetchBlocks]);

  // --- Optimization: Stable Handlers ---
  
  const updateBlock = useCallback((id: number, newProps: Partial<Block>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...newProps } : b));
  }, []);

  const handleBlockTextChange = useCallback((id: number, content: string) => {
    setBlocks(prev => {
      const targetBlock = prev.find(b => b.id === id);
      if (targetBlock && targetBlock.content === content) return prev;
      
      return prev.map(b => b.id === id ? { ...b, content } : b);
    });
  }, []);

  const deleteBlock = useCallback((id: number) => {
    setBlocks(prev => {
      if (prev.length <= 1) return [{ id: generateBlockId(), type: 'text', content: '' }];
      return prev.filter(b => b.id !== id);
    });
  }, []);

  const handleEnterKey = useCallback((currentBlockId: number) => {
    const newBlockId = generateBlockId();
    const newBlock: Block = { id: newBlockId, type: 'text', content: '' };
    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === currentBlockId);
      if (index === -1) return [...prev, newBlock];
      const newArr = [...prev];
      newArr.splice(index + 1, 0, newBlock);
      return newArr;
    });
    setFocusedBlockId(newBlockId);
  }, []);

  const handleSlashCommand = useCallback((position: Position, blockId: number) => {
    setSlashMenuPosition(position);
    setSlashBlockId(blockId);
    setShowSlashMenu(true);
  }, []);

  const insertBlockFromSlash = useCallback((blockTypeString: string) => {
    let type: Block['type'] = 'text';
    let extraProps = {};

    switch(blockTypeString) {
      case 'Heading 1': type = 'heading'; extraProps = { level: 1 }; break;
      case 'Heading 2': type = 'heading'; extraProps = { level: 2 }; break;
      case 'Bullet List': type = 'bullet'; break;
      case 'Numbered List': type = 'numbered-list'; break;
      case 'Code Block': type = 'code'; extraProps = { language: 'javascript' }; break;
      case 'Quote': type = 'quote'; break;
      case 'Table': type = 'table'; extraProps = { data: [['H1', 'H2'], ['C1', 'C2']] }; break;
      case 'Details': type = 'details'; extraProps = { title: 'Toggle', isOpen: true }; break;
      default: type = 'text';
    }

    const newBlock: Block = { id: generateBlockId(), type, content: '', ...extraProps };

    setBlocks(prev => {
      const index = prev.findIndex(b => b.id === slashBlockId);
      const newArr = [...prev];
      if (index !== -1 && prev[index].type === 'text' && !prev[index].content) {
        newArr[index] = newBlock;
      } else {
        newArr.splice(index + 1, 0, newBlock);
      }
      return newArr;
    });

    setFocusedBlockId(newBlock.id);
    setShowSlashMenu(false);
  }, [slashBlockId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`${pythonUrl}/api/note/session/${sessionId}/save`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ blocks })
      });
      if (!response.ok) throw new Error("Save failed");
      toast.success("Notes saved successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to save notes");
    } finally {
      setIsSaving(false);
    }
  };

  const rendererProps = useMemo(() => ({
    darkMode: true,
    handleBlockTextChange,
    updateBlock,
    deleteBlock,
    onEnterKey: handleEnterKey,
    onSlashCommand: handleSlashCommand,
    onTextSelect: () => {},
    handleQuickAI: async () => "",
    onBlockAIRequest: () => {},
    registerBlockRef: () => {}
  }), [handleBlockTextChange, updateBlock, deleteBlock, handleEnterKey, handleSlashCommand]);

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-300"
        onClick={onClose}
      />

      <div className="fixed top-2 bottom-2 right-2 w-[800px] max-w-[90vw] z-[70] flex flex-col bg-[#0F1117]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg">
              <FileText size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Project Notes</h2>
              <p className="text-xs text-gray-400">ID: {sessionId.slice(0, 8)}...</p>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-400" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {isLoading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <Loader2 className="animate-spin text-blue-500" size={32} />
              <p className="text-sm text-gray-500 font-medium">Loading content...</p>
            </div>
          ) : (
            <div className="px-8 py-8 pb-8">
              <BlockRenderer
                blocks={blocks}
                onBlockFocus={setFocusedBlockId}
                {...rendererProps}
              />

              {/* Pagination Navigation */}
              <div className="mt-8 flex items-center justify-center gap-4 pb-4">
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
                  <ChevronLeft size={16} />
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
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2 border-t border-white/5 bg-black/20 flex justify-between items-center text-[10px] text-gray-500 shrink-0">
          <span>{blocks.length} blocks {totalBlocks > 0 && `(${totalBlocks} total)`}</span>
          <div className="flex items-center gap-1">
            <span>Markdown supported</span>
            <ChevronRight size={10} />
          </div>
        </div>

        {/* Slash Command Menu */}
        <SlashCommandMenu
          show={showSlashMenu}
          position={slashMenuPosition}
          darkMode={true}
          onSelectCommand={insertBlockFromSlash}
        />
      </div>
    </>
  );
};

export default SessionNoteEditor;