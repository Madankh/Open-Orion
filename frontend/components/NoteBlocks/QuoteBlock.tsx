import React from "react";
import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

import { Block } from "@/typings/agent";

interface QuoteBlockProps {
  block: Block;
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: () => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}

const QuoteBlock: React.FC<QuoteBlockProps> = ({ 
  block, 
  darkMode, 
  updateBlock, 
  deleteBlock, 
  onTextSelect,
  handleTextChange,

}) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [localContent, setLocalContent] = useState<string>(block.content || '');
  const [showDeleteButton, setShowDeleteButton] = useState<boolean>(false);
  const markdownRef = useRef<HTMLDivElement>(null);

  // ALL HOOKS MUST BE AT THE TOP - Before any conditional returns
  useEffect(() => {
    if (block.content !== localContent && !isEditing) {
      setLocalContent(block.content || '');
    }
  }, [block.content, localContent, isEditing]);

  const handleSave = () => {
    if (handleTextChange) {
      handleTextChange(block.id, localContent);
    } else {
      updateBlock(block.id, { content: localContent });
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) handleSave();
    if (e.key === 'Escape') {
      setLocalContent(block.content || '');
      setIsEditing(false);
    }
    if (e.key === 'Backspace' && localContent === '') {
      e.preventDefault();
      deleteBlock(block.id);
    }
  };

  const cleanedContent = localContent || "Click to add quote...";

  // Now conditional rendering is safe
  if (isEditing) {
    return (
      <div className={`my-4 border-l-4 border-gray-400 pl-4 py-2 rounded-r-lg ${
        darkMode ? 'bg-gray-800 border-l-gray-500' : 'bg-gray-50 border-l-gray-400'
      }`}>
        <textarea
          value={localContent}
          onChange={(e) => {
             setLocalContent(e.target.value);
             if (handleTextChange) {
               handleTextChange(block.id, e.target.value);
             }
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className={`w-full p-2 bg-transparent border-none outline-none resize-none italic min-h-16 ${
            darkMode ? 'text-white placeholder-gray-400' : 'text-gray-900 placeholder-gray-500'
          }`}
          placeholder="Enter quote..."
          autoFocus
        />
      </div>
    );
  }

  return (
    <div 
      className={`group my-4 border-l-4 pl-4 py-2 cursor-pointer rounded-r-lg relative transition-colors ${
        darkMode 
          ? 'border-l-gray-500 bg-gray-800 text-gray-300 hover:bg-gray-700' 
          : 'border-l-gray-400 bg-gray-50 text-gray-600 hover:bg-gray-100'
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
          title="Delete quote"
        >
          <X size={12} />
        </button>
      )}
      
      {localContent ? (
        <div 
          ref={markdownRef}
          className={`prose prose-sm max-w-none italic ${
            darkMode 
              ? 'prose-invert prose-headings:text-gray-300 prose-p:text-gray-300 prose-strong:text-gray-300 prose-em:text-gray-400 prose-code:text-gray-300 prose-pre:bg-gray-700 prose-blockquote:border-gray-600 prose-blockquote:text-gray-400'
              : 'prose-headings:text-gray-600 prose-p:text-gray-600 prose-strong:text-gray-600 prose-em:text-gray-500 prose-code:text-gray-700 prose-pre:bg-gray-100 prose-blockquote:border-gray-300 prose-blockquote:text-gray-500'
          }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeHighlight, rehypeRaw, rehypeKatex]}
          >
            {cleanedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className={`italic ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Click to add quote...
        </div>
      )}
    </div>
  );
};

export default QuoteBlock;