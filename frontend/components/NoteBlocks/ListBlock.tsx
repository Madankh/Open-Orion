import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Sparkles, Brain, Lightbulb, Edit, RefreshCw, Copy, Check, Zap, MessageSquare, BookOpen, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { Block } from '@/typings/agent';
// import rehypeMathJax from "rehype-mathjax";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Position {
  x: number;
  y: number;
}

interface AIAssistance {
  selectedText: string;
  suggestions: string[];
  isLoading: boolean;
  position: Position;
  itemIndex?: number;
}

interface ListBlockProps {
  block: Block & { variant: 'bullet' | 'numbered' };
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: (text: string, position: Position) => void;
  onSlashCommand: (position: Position, blockId: number) => void;
  handleSend: (message: string) => Promise<string>;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
}

const ListBlock: React.FC<ListBlockProps> = ({ 
  block, 
  darkMode, 
  updateBlock, 
  deleteBlock, 
  onTextSelect, 
  onSlashCommand,
  handleSend,

}) => {
  const [items, setItems] = useState<string[]>(block.items || ['']);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [showAddButton, setShowAddButton] = useState(false);
  const [aiAssistance, setAiAssistance] = useState<AIAssistance | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const aiPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setItems(block.items || ['']);
  }, [block.items]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (aiPanelRef.current && !aiPanelRef.current.contains(event.target as Node)) {
        setAiAssistance(null);
        setShowAIPanel(false);
        setCustomPrompt('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const saveItems = (newItems: string[]) => {
    const filteredItems = newItems.filter(item => item.trim() !== '');
    setItems(newItems);
    updateBlock(block.id, { items: filteredItems.length > 0 ? filteredItems : [''] });
  };

  const handleItemChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newItems = [...items];
      newItems.splice(index + 1, 0, '');
      setItems(newItems);
      setEditingIndex(index + 1);
      
      // Focus next input after state update
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus();
      }, 0);
    } else if (e.key === 'Backspace' && items[index] === '' && items.length > 1) {
      e.preventDefault();
      const newItems = items.filter((_, i) => i !== index);
      setItems(newItems);
      saveItems(newItems);
      
      // Focus previous input
      const prevIndex = Math.max(0, index - 1);
      setEditingIndex(prevIndex);
      setTimeout(() => {
        inputRefs.current[prevIndex]?.focus();
      }, 0);
    } else if (e.key === 'Escape') {
      setEditingIndex(null);
      saveItems(items);
    }

    // Handle slash commands
    const target = e.target as HTMLInputElement;
    const text = target.value;
    const position = target.selectionStart || 0;
    const beforeCursor = text.substring(0, position);
    const lastSlashIndex = beforeCursor.lastIndexOf('/');
    
    if (lastSlashIndex !== -1 && (lastSlashIndex === 0 || text[lastSlashIndex - 1] === ' ')) {
      const afterSlash = beforeCursor.substring(lastSlashIndex + 1);
      if (afterSlash.length >= 0) {
        const { left, top } = target.getBoundingClientRect();
        onSlashCommand({ x: left, y: top + 20 }, block.id);
      }
    }
  };


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

  const handleItemBlur = () => {
    setEditingIndex(null);
    const newItems = items.filter(item => item.trim() !== '');
    if (newItems.length === 0) {
      newItems.push('');
    }
    saveItems(newItems);
  };

  const handleMouseUp = async (e: React.MouseEvent, itemIndex: number) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 0) {
      const x = e.clientX;
      const y = e.clientY;
      
      setAiAssistance({
        selectedText,
        suggestions: [],
        isLoading: true,
        position: { x, y },
        itemIndex
      });

      try {
        const prompt = `Please provide 3 different improved versions of this text: "${selectedText}". Consider grammar, clarity, style, and impact. Return only the 3 improved versions, each on a separate line with no additional explanation.`;
        const response = await handleSend(prompt);
        const suggestions = response.split('\n').filter(s => s.trim()).slice(0, 3);
        
        setAiAssistance(prev => prev ? {
          ...prev,
          suggestions,
          isLoading: false
        } : null);
      } catch (error) {
        console.error('Error getting AI suggestions:', error);
        setAiAssistance(prev => prev ? {
          ...prev,
          suggestions: ['Error getting suggestions. Please try again.'],
          isLoading: false
        } : null);
      }

      onTextSelect(selectedText, { x, y });
    }
  };

  const handleCustomPrompt = async () => {
    if (!customPrompt.trim() || !aiAssistance) return;

    setAiAssistance(prev => prev ? { ...prev, isLoading: true } : null);

    try {
      const prompt = `${customPrompt}: "${aiAssistance.selectedText}"`;
      const response = await handleSend(prompt);
      
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: [response],
        isLoading: false
      } : null);
      setCustomPrompt('');
    } catch (error) {
      console.error('Error with custom prompt:', error);
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: ['Error processing request. Please try again.'],
        isLoading: false
      } : null);
    }
  };

  const replaceSuggestion = (suggestion: string) => {
    if (!aiAssistance || aiAssistance.itemIndex === undefined) return;
    
    const newItems = [...items];
    newItems[aiAssistance.itemIndex] = newItems[aiAssistance.itemIndex].replace(aiAssistance.selectedText, suggestion);
    setItems(newItems);
    saveItems(newItems);
    setAiAssistance(null);
    setShowAIPanel(false);
  };

  const copySuggestion = async (suggestion: string, index: number) => {
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const quickPrompts = [
    { icon: <Edit size={14} />, label: 'Make it better', prompt: 'Improve the writing quality, grammar, and clarity of this text' },
    { icon: <Sparkles size={14} />, label: 'Make it engaging', prompt: 'Make this text more engaging and compelling' },
    { icon: <Brain size={14} />, label: 'Simplify', prompt: 'Simplify this text to make it easier to understand' },
    { icon: <Lightbulb size={14} />, label: 'Professional', prompt: 'Rewrite this in a more professional tone' },
    { icon: <MessageSquare size={14} />, label: 'Conversational', prompt: 'Make this sound more conversational and friendly' },
    { icon: <BookOpen size={14} />, label: 'Academic', prompt: 'Rewrite this in an academic style' }
  ];

  const handleQuickPrompt = async (promptText: string) => {
    if (!aiAssistance) return;

    setAiAssistance(prev => prev ? { ...prev, isLoading: true } : null);

    try {
      const prompt = `${promptText}: "${aiAssistance.selectedText}"`;
      const response = await handleSend(prompt);
      
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: [response],
        isLoading: false
      } : null);
    } catch (error) {
      console.error('Error with quick prompt:', error);
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: ['Error processing request. Please try again.'],
        isLoading: false
      } : null);
    }
  };

  const addNewItem = () => {
    const newItems = [...items, ''];
    setItems(newItems);
    setEditingIndex(newItems.length - 1);
    setTimeout(() => {
      inputRefs.current[newItems.length - 1]?.focus();
    }, 0);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
    saveItems(newItems);
  };

  const getListMarker = (index: number) => {
    if (block.variant === 'numbered') {
      return `${index + 1}.`;
    } else {
      return '•';
    }
  };

  return (
    <div 
      className={`group mb-1 p-3 rounded-lg border relative ${darkMode ? 'border-transparent hover:border-gray-600 hover:bg-gray-800' : 'border-transparent hover:border-gray-200 hover:bg-gray-50'}`}
      onMouseEnter={() => {
        setShowDeleteButton(true);
        setShowAddButton(true);
      }}
      onMouseLeave={() => {
        setShowDeleteButton(false);
        setShowAddButton(false);
      }}
    >
      {/* Delete Button (left side) */}
      {showDeleteButton && (
        <button
          onClick={() => deleteBlock(block.id)}
          className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1 z-10"
          title="Delete list"
        >
          <X size={12} />
        </button>
      )}

      {/* Add Button (right side) */}
      {showAddButton && (
        <button
          onClick={addNewItem}
          className="absolute -right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1 z-10"
          title="Add new item"
        >
          <Plus size={12} />
        </button>
      )}

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-start gap-3 group/item">
            <div className={`flex-shrink-0 w-6 text-right font-medium mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              {getListMarker(index)}
            </div>
            
            <div className="flex-1 relative">
              {editingIndex === index ? (
                <input
                  ref={el => { inputRefs.current[index] = el; }}
                  type="text"
                  value={item}
                  onChange={(e) => handleItemChange(index, e.target.value)}
                  onBlur={handleItemBlur}
                  onKeyDown={(e) => handleItemKeyDown(e, index)}
                  onMouseUp={(e) => handleMouseUp(e, index)}
                  className={`w-full px-2 py-1 border-none outline-none bg-transparent ${darkMode ? 'text-white' : 'text-gray-900'}`}
                  placeholder="List item..."
                  autoFocus
                />
              ) : (
                <div
                  onClick={() => setEditingIndex(index)}
                  onMouseUp={(e) => handleMouseUp(e, index)}
                  className={`px-2 py-1 cursor-text min-h-6 ${darkMode ? 'text-gray-200' : 'text-gray-800'} ${!item.trim() ? (darkMode ? 'text-gray-500' : 'text-gray-400') : ''}`}
                >
                  {item.trim() ? <MessageMarkdown>{item}</MessageMarkdown> : 'Click to edit...'}
                </div>
              )}

              {items.length > 1 && (
                <button
                  onClick={() => removeItem(index)}
                  className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5"
                  title="Remove item"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* AI Assistance Popup */}
      {aiAssistance && (
        <div 
          ref={aiPanelRef}
          className={`fixed z-50 w-96 max-h-96 overflow-y-auto rounded-lg shadow-xl border ${
            darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
          }`}
          style={{
            left: Math.min(aiAssistance.position.x, window.innerWidth - 400),
            top: Math.min(aiAssistance.position.y + 10, window.innerHeight - 400)
          }}
        >
          {/* Header */}
          <div className={`p-3 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="text-blue-500" size={16} />
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  AI Assistant
                </span>
              </div>
              <button
                onClick={() => {
                  setAiAssistance(null);
                  setShowAIPanel(false);
                }}
                className={`p-1 rounded hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'text-gray-500'}`}
              >
                <X size={14} />
              </button>
            </div>
            
            <div className={`text-sm p-2 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
              {aiAssistance.selectedText}
            </div>
          </div>

          {/* Quick Actions */}
          <div className={`p-3 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                Quick Actions:
              </span>
              <button
                onClick={() => setShowAIPanel(!showAIPanel)}
                className={`p-1 rounded hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'text-gray-500'}`}
              >
                {showAIPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              {quickPrompts.slice(0, showAIPanel ? quickPrompts.length : 4).map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickPrompt(prompt.prompt)}
                  disabled={aiAssistance.isLoading}
                  className={`flex items-center gap-2 p-2 rounded text-sm transition-colors ${
                    darkMode 
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-200 disabled:bg-gray-800' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:bg-gray-50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {prompt.icon}
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Prompt */}
          <div className={`p-3 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Custom instruction..."
                className={`flex-1 px-3 py-2 rounded border text-sm ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomPrompt()}
              />
              <button
                onClick={handleCustomPrompt}
                disabled={!customPrompt.trim() || aiAssistance.isLoading}
                className="px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded text-sm disabled:cursor-not-allowed transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>

          {/* Suggestions */}
          <div className="p-3">
            {aiAssistance.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex items-center gap-2">
                  <RefreshCw className="animate-spin text-blue-500" size={16} />
                  <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    Getting suggestions...
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {aiAssistance.suggestions.map((suggestion, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                  >
                    <div className={`text-sm mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {suggestion}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => replaceSuggestion(suggestion)}
                        className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        onClick={() => copySuggestion(suggestion, index)}
                        className={`px-3 py-1 rounded text-xs transition-colors ${
                          copiedIndex === index
                            ? 'bg-green-500 text-white'
                            : darkMode
                              ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                              : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                      >
                        {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ListBlock;