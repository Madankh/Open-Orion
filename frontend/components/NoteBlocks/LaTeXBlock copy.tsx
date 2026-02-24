import React, { useState } from "react";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeMathJax from "rehype-mathjax";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { Trash2 } from "lucide-react";

interface Block {
  id: number;
  type: string;
  content?: string;
}

// Fixed LaTeX Block Component
const LaTeXBlock: React.FC<{
  block: Block;
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
}> = ({ block, darkMode, updateBlock, deleteBlock }) => {
  // We use a state for editing to provide a better user experience
  const [isEditing, setIsEditing] = useState(!block.content);
  const [localContent, setLocalContent] = useState(block.content || "");

  const handleSave = () => {
    // Only update if there's a change to avoid unnecessary re-renders
    if (localContent !== block.content) {
      updateBlock(block.id, { content: localContent });
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setLocalContent(block.content || "");
    setIsEditing(false);
  }

  // EDITING VIEW
  if (isEditing) {
    return (
      <div className={`my-4 border rounded-lg p-1 ${darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"}`}>
        <div className="flex justify-between items-center mb-3">
          <h4 className={`font-medium ${darkMode ? "text-white" : "text-gray-900"}`}>Edit LaTeX</h4>
        </div>
        
        <textarea
          value={localContent}
          onChange={(e) => setLocalContent(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") handleCancel() }}
          className={`w-full h-32 p-3 rounded border font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical ${
            darkMode ? "bg-gray-900 border-gray-600 text-white" : "bg-white border-gray-300"
          }`}
          placeholder="Mix text and math! Use $E=mc^2$ for inline math and $$\frac{d}{dx}$$ for display math."
          autoFocus
        />
        
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className={`px-3 py-1 rounded border ${
              darkMode ? "border-gray-600 text-gray-300 hover:bg-gray-700" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const MessageMarkdown = ({ children }: { children: string | null | undefined }) => {
  if (!children) return null;
  
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeMathJax, rehypeKatex, rehypeHighlight]}
        components={{
          a: ({ ...props }) => (
            <a target="_blank" rel="noopener noreferrer" {...props} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};


  // DISPLAY VIEW
  return (
    <div
      className={`my-4 rounded-lg p-1 cursor-pointer transition-all hover:shadow-md ${
        darkMode ? "bg-gray-800 border border-transparent hover:border-gray-700" : "bg-white border hover:border-gray-200"
      }`}
      onClick={() => setIsEditing(true)}
    >
      <div className="flex justify-end -mb-2 -mr-2 opacity-0 hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation(); // Prevent opening the editor when deleting
            deleteBlock(block.id);
          }}
          className="text-red-500 hover:text-red-400 p-2"
          title="Delete block"
        >
          <Trash2 size={16} />
        </button>
      </div>
      
      {localContent ? (
        <div className={darkMode ? 'latex-dark' : 'latex-light'}>
      <MessageMarkdown>{localContent}</MessageMarkdown>
        </div>
      ) : (
        <div className={`text-center py-6 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
          Click to add LaTeX equation...
        </div>
      )}
    </div>
  );
};

export default LaTeXBlock;