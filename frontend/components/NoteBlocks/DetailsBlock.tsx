import React, { useState, useEffect } from 'react';
import {ChevronRight,Trash2 } from 'lucide-react';

interface Block {
  id:number;
  type?: 'text' | 'heading' | 'code' | 'table' | 'bullet' | 'numbered-list' | 
        'quote' | 'details' | 'latex' | 'image' | 'video' | 'audio' | 
        'pdf' | 'document' | 'whiteboard' | 'youtube' | 'kanban';
  content?: string;
  level?: number;
  language?: string;
  data?: string[][];
  title?: string;
  isOpen?: boolean;
  name?: string;
  size?: number | string;
  url?: string;
  serverPath?: string;
  src?: string;
  s3_key?: string;
  file?: File | string;
  status?: 'uploading' | 'uploaded' | 'error';
  videoId?: string;
  boardTitle?: string;
  pages?: string;
  created_at?: string;
  session_id?: string;
  user_id?: string;
  prompt?: string;
  query?: string;
  items?: string[];
  results?: SearchResult[];
  thumbnail?: string;
  aiContext?: {
    triggeredBy?: number;
    triggerType?: string;
    createdByAI?: boolean;
    aiPrompt?: string;
  };
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

const DetailsBlock: React.FC<{
  block: Block;
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  onTextSelect: () => void;
  deleteBlock: (blockId: number) => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}> = ({ block, darkMode, updateBlock, onTextSelect, deleteBlock,handleTextChange,onBlockFocus }) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [localTitle, setLocalTitle] = useState(block.title || 'Click to expand');
  const [localContent, setLocalContent] = useState(block.content || '');
  const [isOpen, setIsOpen] = useState(block.isOpen || false);

  useEffect(() => {
    if (!isEditingTitle) setLocalTitle(block.title || 'Click to expand');
  }, [block.title, isEditingTitle]);

  useEffect(() => {
    setIsOpen(block.isOpen || false);
  }, [block.isOpen]);

  useEffect(() => {
    if (block.content !== localContent && !isEditingContent) {
      setLocalContent(block.content || '');
    }
  }, [block.content, localContent, isEditingContent]);

  const toggleOpen = () => {
    const newOpen = !isOpen;
    setIsOpen(newOpen);
    updateBlock(block.id, { isOpen: newOpen });
  };

  const handleTitleSave = () => {
    updateBlock(block.id, { title: localTitle });
    setIsEditingTitle(false);
  };

  const handleContentSave = () => {
    if (handleTextChange) {
      handleTextChange(block.id, localContent);
    } else {
      updateBlock(block.id, { content: localContent });
    }
    setIsEditingContent(false);
  };

  return (
    <div className={`my-4 border rounded-lg p-3 group ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
      <div>
        <div className="flex items-center justify-between">
          <div
            onClick={() => {
              if (!isEditingTitle) {
                toggleOpen();
              }
            }}
            className="font-semibold cursor-pointer flex items-center gap-2 select-none flex-1"
          >
            <ChevronRight
              size={16}
              className={`transition-transform duration-200 ${
                isOpen ? "rotate-90" : "rotate-0"
              }`}
            />
            {isEditingTitle ? (
              <input
                type="text"
                value={localTitle}
                onChange={(e) => {
                  setLocalContent(e.target.value);
                  if (handleTextChange) {
                    handleTextChange(block.id, e.target.value);
                  }
                }}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleTitleSave();
                  }
                  if (e.key === "Escape") {
                    setLocalTitle(block.title || 'Click to expand');
                    setIsEditingTitle(false);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                className={`flex-grow p-1 rounded font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode
                    ? "bg-gray-700 text-white placeholder-gray-400"
                    : "bg-gray-100 text-gray-900 placeholder-gray-500"
                }`}
                placeholder="Enter title..."
                autoFocus
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingTitle(true);
                }}
                className="flex-grow cursor-text hover:bg-gray-100 dark:hover:bg-gray-700 p-1 rounded font-semibold"
              >
                {localTitle}
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              deleteBlock(block.id);
            }}
            className="text-red-400 hover:text-red-300 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Delete details block"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {isOpen && (
          <div className="mt-3 pl-6">
            {isEditingContent ? (
              <textarea
                value={localContent}
                onChange={(e) => setLocalContent(e.target.value)}
                onBlur={handleContentSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.ctrlKey) {
                    e.preventDefault();
                    handleContentSave();
                  }
                  if (e.key === "Escape") {
                    setLocalContent(block.content || '');
                    setIsEditingContent(false);
                  }
                  e.stopPropagation();
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add details content here..."
                className={`w-full p-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  darkMode
                    ? "bg-gray-700 text-white placeholder-gray-400"
                    : "bg-gray-100 text-gray-900 placeholder-gray-500"
                }`}
                rows={3}
                autoFocus
              />
            ) : (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingContent(true);
                }}
                onMouseUp={onTextSelect}
                className={`w-full p-2 rounded text-sm cursor-text min-h-12 ${
                  darkMode
                    ? "bg-gray-700 text-white hover:bg-gray-600"
                    : "bg-gray-100 text-gray-900 hover:bg-gray-50"
                }`}
              >
                {localContent || "Click to add details content..."}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DetailsBlock;