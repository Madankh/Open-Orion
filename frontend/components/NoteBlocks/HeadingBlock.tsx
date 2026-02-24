import React from "react";
import { useState, useRef } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css"; // You can change this to any highlight.js theme
interface Block {
  id:number;
  type?: 'text' | 'heading' | 'code' | 'table' | 'bullet' | 'numbered-list' | 
        'quote' | 'details' | 'latex' | 'image' | 'video' | 'audio' | 
        'pdf' | 'document' | 'whiteboard' | 'youtube' | 'kanban';
  content?: string ;
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

interface HeadingBlockProps {
  block: Block & { level: number };
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: () => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}

const HeadingBlock: React.FC<HeadingBlockProps> = ({ 
  block, 
  darkMode, 
  updateBlock, 
  deleteBlock, 
  onTextSelect,
  registerBlockRef,
  handleTextChange,
  onBlockFocus
}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [localContent, setLocalContent] = useState<string>(block.content || '');
  const [showDeleteButton, setShowDeleteButton] = useState<boolean>(false);
  const markdownRef = useRef<HTMLDivElement>(null);

  const handleSave = () => {
    // Use collaborative text change handler if available, otherwise fallback to updateBlock
    if (handleTextChange) {
      handleTextChange(block.id, localContent);
    } else {
      updateBlock(block.id, { content: localContent });
    }
    setIsEditing(false);
  };

  // Handle real-time content changes during typing
  const handleContentChange = (newContent: string) => {
    setLocalContent(newContent);
    
    // For collaborative editing, send changes in real-time while typing
    if (handleTextChange) {
      handleTextChange(block.id, newContent);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    }
    if (e.key === 'Escape') {
      setLocalContent(block.content || '');
      setIsEditing(false);
    }
    // Delete empty heading on Backspace
    if (e.key === 'Backspace' && localContent === '') {
      e.preventDefault();
      deleteBlock(block.id);
    }
  };

  // Handle blur event to save changes
  const handleBlur = () => {
    handleSave();
  };

  const headingClasses: Record<number, string> = {
    1: 'text-4xl font-bold',
    2: 'text-3xl font-bold',
    3: 'text-2xl font-bold'
  };

  // Clean content for markdown rendering
  const cleanedContent = localContent || `Heading ${block.level}`;

  // Update local content when block content changes (for collaborative updates from other users)
  React.useEffect(() => {
    if (block.content !== localContent && !isEditing) {
      setLocalContent(block.content || '');
    }
  }, [block.content, localContent, isEditing]);

  if (isEditing) {
    return (
      <div className="my-4">
        <input
          value={localContent}
          onChange={(e) => handleContentChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={`w-full p-2 border-none outline-none bg-transparent ${headingClasses[block.level]} ${
            darkMode ? 'text-white placeholder-gray-400' : 'text-gray-800 placeholder-gray-500'
          }`}
          placeholder={`Heading ${block.level}`}
          autoFocus
        />
      </div>
    );
  }

  return (
    <div 
      className={`group my-2 p-2 cursor-pointer rounded-lg relative transition-colors ${
        darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-50'
      }`}
      onClick={() => setIsEditing(true)}
      onMouseUp={onTextSelect}
      onMouseEnter={() => setShowDeleteButton(true)}
      onMouseLeave={() => setShowDeleteButton(false)}
    >
      {/* Delete Button */}
      {(showDeleteButton || !localContent) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteBlock(block.id);
          }}
          className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
          title="Delete heading"
        >
          <X size={12} />
        </button>
      )}

      {localContent ? (
        <div 
          ref={markdownRef}
          className={`prose prose-lg max-w-none ${
            darkMode 
              ? 'prose-invert prose-headings:text-white prose-strong:text-white prose-em:text-gray-300 prose-code:text-gray-300'
              : 'prose-headings:text-gray-800 prose-strong:text-gray-800 prose-em:text-gray-700 prose-code:text-gray-700'
          }`}
        >
          {/* Force the heading level by wrapping in appropriate heading tag */}
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeRaw, rehypeKatex]}
            components={{
              // Override all heading levels to use the block's specified level
              h1: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              h2: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              h3: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              h4: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              h5: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              h6: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
              // If no heading markup is used, treat as plain text in heading style
              p: ({ children }) => React.createElement(`h${block.level}`, { 
                className: `${headingClasses[block.level]} ${darkMode ? 'text-white' : 'text-gray-800'}` 
              }, children),
            }}
          >
            {cleanedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className={`${headingClasses[block.level]} ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Heading {block.level}
        </div>
      )}
    </div>
  );
};

export default HeadingBlock;