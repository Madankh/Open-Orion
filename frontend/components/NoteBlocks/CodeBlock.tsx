import React from "react";
import { useEffect,useState,useRef } from "react";
import { X } from "lucide-react";
import { Block } from "@/typings/agent";

interface CodeBlockProps {
  block: Block & { language: string };
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: () => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ block, darkMode, updateBlock, deleteBlock, onTextSelect,handleTextChange,onBlockFocus }) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [localContent, setLocalContent] = useState<string>(block.content || '');
  const [showDeleteButton, setShowDeleteButton] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [localContent]);

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
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.currentTarget.selectionStart || 0;
      const end = e.currentTarget.selectionEnd || 0;
      const newValue = localContent.substring(0, start) + '  ' + localContent.substring(end);
      setLocalContent(newValue);
      setTimeout(() => {
        if (e.currentTarget) {
          e.currentTarget.selectionStart = e.currentTarget.selectionEnd = start + 2;
        }
      }, 0);
    }
    if (e.key === 'Escape') {
      setLocalContent(block.content || '');
      setIsEditing(false);
    }
    if (e.key === 'Backspace' && localContent === '') {
      e.preventDefault();
      deleteBlock(block.id);
    }
  };

  if (isEditing) {
    return (
      <div className={`my-4 rounded-lg p-1 font-mono text-sm ${darkMode ? 'bg-black bg-opacity-50 border border-gray-700' : 'bg-gray-800 text-gray-100'}`}>
        <div className="flex justify-between items-center mb-2">
          <select
            value={block.language}
            onChange={(e) => updateBlock(block.id, { language: e.target.value })}
            className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-600 text-gray-200'}`}
          >
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={(e) => {
            setLocalContent(e.target.value);
            if (handleTextChange) {
              handleTextChange(block.id, e.target.value);
            }
          }}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          spellCheck="false"
          className="w-full bg-transparent border-none outline-none resize-none font-mono text-sm leading-relaxed focus:ring-0"
          placeholder="Enter your code here..."
          autoFocus
        />
      </div>
    );
  }

  return (
    <div 
      className={`group my-2 rounded-lg p-1 font-mono text-sm cursor-pointer relative ${darkMode ? 'bg-black bg-opacity-50 border border-gray-700 hover:border-gray-600' : 'bg-gray-800 text-gray-100 hover:bg-gray-700'}`}
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
          className="absolute -right-2 -top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
          title="Delete code block"
        >
          <X size={12} />
        </button>
      )}
      
      <div className="flex justify-between items-center mb-2">
        <span className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-600 text-gray-200'}`}>
          {block.language}
        </span>
      </div>
      <pre className="whitespace-pre-wrap">
        {localContent || 'Click to add code...'}
      </pre>
    </div>
  );
};


export default CodeBlock;