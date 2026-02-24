import React from "react";
import { useEffect, useState, useCallback } from "react";
import { Plus, X, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { WhiteboardContent } from "@/typings/agent";

interface Block {
  id:number;
  type?: 'text' | 'heading' | 'code' | 'table' | 'bullet' | 'numbered-list' | 
        'quote' | 'details' | 'latex' | 'image' | 'video' | 'audio' | 
        'pdf' | 'document' | 'whiteboard' | 'youtube' | 'kanban';
  content?: string
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
  columns?: unknown[];
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

interface TableBlockProps {
  block: Block & { data: string[][] };
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}

const MessageMarkdown = ({ children }: { children: string | null | undefined }) => {
  if (!children) return null;
     
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
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

const TableBlock: React.FC<TableBlockProps> = ({ block, darkMode, updateBlock, deleteBlock,registerBlockRef,handleTextChange,onBlockFocus}) => {
  // Initialize with proper default data
  const initialData = block.data && Array.isArray(block.data) && block.data.length > 0 
    ? block.data 
    : [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']];
    
  const [tableData, setTableData] = useState<string[][]>(initialData);
  const [isHovered, setIsHovered] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);

  // Update when block data changes
  useEffect(() => {
    if (block.data && Array.isArray(block.data) && block.data.length > 0) {
      setTableData(block.data);
    }
  }, [block.data]);


  // Initialize the block with default data if it doesn't exist
  useEffect(() => {
    if (!block.data || !Array.isArray(block.data) || block.data.length === 0) {
      updateBlock(block.id, { data: initialData });
    }
  }, [block.id, block.data, updateBlock, initialData]);

  const handleCellChange = (e: React.ChangeEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    const value = e.target.value;
    setTableData(prev => {
      const updated = prev.map(row => [...row]);
      // Ensure the row exists
      if (!updated[rowIndex]) {
        updated[rowIndex] = [];
      }
      updated[rowIndex][colIndex] = value;
      return updated;
    });
  };

  const commitChanges = useCallback(() => {
    // Validate data before committing
    if (tableData && Array.isArray(tableData) && tableData.length > 0) {
      updateBlock(block.id, { data: tableData });
    }
  }, [block.id, tableData, updateBlock]);

  const addRow = () => {
    const colCount = tableData[0]?.length || 2;
    const newRow = Array(colCount).fill('');
    const newData = [...tableData, newRow];
    setTableData(newData);
    updateBlock(block.id, { data: newData });
  };

  const addCol = () => {
    const newData = tableData.map(row => [...row, '']);
    setTableData(newData);
    updateBlock(block.id, { data: newData });
  };

  const deleteRow = (rowIndex: number) => {
    if (tableData.length > 1) {
      const newData = tableData.filter((_, i) => i !== rowIndex);
      setTableData(newData);
      updateBlock(block.id, { data: newData });
    }
  };

  const deleteCol = (colIndex: number) => {
    if (tableData[0]?.length > 1) {
      const newData = tableData.map(row => row.filter((_, i) => i !== colIndex));
      setTableData(newData);
      updateBlock(block.id, { data: newData });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, rowIndex: number, colIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const inputs = document.querySelectorAll(`.table-cell-input-${block.id}`) as NodeListOf<HTMLInputElement>;
      const currentIndex = rowIndex * (tableData[0]?.length || 0) + colIndex;
      const nextInput = inputs[currentIndex + 1];
      if (nextInput) nextInput.focus();
    } else if (e.key === 'Tab') {
      // Allow natural tab navigation
      commitChanges();
    }
  };

  // Handle blur to commit changes
  const handleBlur = () => {
    commitChanges();
    setEditingCell(null);
  };

  const handleCellClick = (rowIndex: number, colIndex: number) => {
    setEditingCell({ row: rowIndex, col: colIndex });
  };

  // Safety check for data
  if (!tableData || !Array.isArray(tableData) || tableData.length === 0) {
    return (
      <div className={`my-1 p-2 border rounded-lg ${
        darkMode ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-300 bg-white text-black'
      }`}>
        <div className="text-center">
          <p className="text-gray-500 mb-2">Loading table...</p>
          <button 
            onClick={() => {
              const defaultData = [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']];
              setTableData(defaultData);
              updateBlock(block.id, { data: defaultData });
            }}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Initialize Table
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`my-1 border rounded-lg overflow-hidden transition-all duration-200 ${
        darkMode ? 'border-gray-700 bg-gray-800 text-white' : 'border-gray-300 bg-white text-black'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Controls - completely hidden when not hovered */}
      {isHovered && (
        <div className={`flex justify-between items-center p-2 border-b transition-all duration-200 ${
          darkMode ? 'border-gray-700' : 'border-gray-300'
        }`}>
          <div className="flex gap-2">
            <button 
              onClick={addRow} 
              className={`text-sm flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <Plus size={14} /> Add row
            </button>
            <button 
              onClick={addCol} 
              className={`text-sm flex items-center gap-1 px-2 py-1 rounded transition-colors ${
                darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
              }`}
            >
              <Plus size={14} /> Add column
            </button>
          </div>
          <button
            onClick={() => deleteBlock(block.id)}
            className="text-red-500 hover:bg-red-900 px-2 py-1 rounded flex items-center gap-1 transition-colors"
            title="Delete table"
          >
            <Trash2 size={14} /> Delete Table
          </button>
        </div>
      )}

      <div className="overflow-x-auto p-1">
        <table className="w-full min-w-full border-collapse">
          <thead>
            <tr>
              {tableData[0]?.map((header, colIndex) => (
                <th key={`header-${colIndex}`} className="p-0.5 relative group">
                  {editingCell?.row === 0 && editingCell?.col === colIndex ? (
                    <input
                      type="text"
                      value={header || ''}
                      onChange={(e) => handleCellChange(e, 0, colIndex)}
                      onBlur={handleBlur}
                      onKeyDown={(e) => handleKeyDown(e, 0, colIndex)}
                      className={`table-cell-input-${block.id} w-full p-1.5 font-semibold text-sm rounded border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        darkMode 
                          ? 'border-gray-600 bg-gray-900 text-white' 
                          : 'border-gray-300 bg-gray-50 text-black'
                      }`}
                      placeholder={`Header ${colIndex + 1}`}
                      autoFocus
                    />
                  ) : (
                    <div
                      onClick={() => handleCellClick(0, colIndex)}
                      className={`w-full p-1.5 font-semibold text-sm rounded border cursor-pointer hover:border-blue-300 ${
                        darkMode 
                          ? 'border-gray-600 bg-gray-900 text-white hover:bg-gray-700' 
                          : 'border-gray-300 bg-gray-50 text-black hover:bg-gray-100'
                      }`}
                    >
                      <MessageMarkdown>{header || `Header ${colIndex + 1}`}</MessageMarkdown>
                    </div>
                  )}
                  {isHovered && tableData[0].length > 1 && (
                    <button
                      onClick={() => deleteCol(colIndex)}
                      className="absolute -top-1 -right-1 p-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded-full shadow-sm"
                      title="Delete column"
                    >
                      <X size={12} />
                    </button>
                  )}
                </th>
              )) || []}
            </tr>
          </thead>
          <tbody>
            {tableData.slice(1).map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className="group">
                {row.map((cell, colIndex) => (
                  <td key={`cell-${rowIndex}-${colIndex}`} className="p-0.5">
                    {editingCell?.row === rowIndex + 1 && editingCell?.col === colIndex ? (
                      <input
                        type="text"
                        value={cell || ''}
                        onChange={(e) => handleCellChange(e, rowIndex + 1, colIndex)}
                        onBlur={handleBlur}
                        onKeyDown={(e) => handleKeyDown(e, rowIndex + 1, colIndex)}
                        className={`table-cell-input-${block.id} w-full p-1.5 text-sm rounded border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                          darkMode 
                            ? 'border-gray-600 bg-gray-800 text-white' 
                            : 'border-gray-300 bg-gray-50 text-black'
                        }`}
                        placeholder={`Cell ${rowIndex + 1}-${colIndex + 1}`}
                        autoFocus
                      />
                    ) : (
                      <div
                        onClick={() => handleCellClick(rowIndex + 1, colIndex)}
                        className={`w-full p-1.5 text-sm rounded border cursor-pointer hover:border-blue-300 min-h-[1.5rem] ${
                          darkMode 
                            ? 'border-gray-600 bg-gray-800 text-white hover:bg-gray-700' 
                            : 'border-gray-300 bg-gray-50 text-black hover:bg-gray-100'
                        }`}
                      >
                      <MessageMarkdown>{cell || ''}</MessageMarkdown>
                      </div>
                    )}
                  </td>
                ))}
                {isHovered && tableData.length > 1 && (
                  <td className="p-0.5">
                    <button
                      onClick={() => deleteRow(rowIndex + 1)}
                      className="p-1 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete row"
                    >
                      <X size={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TableBlock;