import React, { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { Send, X, Sparkles, Brain, Lightbulb, Edit, RefreshCw, Copy, Check, Zap, MessageSquare, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { marked } from 'marked';

// Lazy load the TipTap editor
const TipTapEditor = lazy(() => import('./TipTapEditor'));

interface Block {
  id: number;
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
  timestamps?: unknown[];
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

interface Position {
  x: number;
  y: number;
}

interface AIAssistance {
  selectedText: string;
  originalSelectionStart: number;
  originalSelectionEnd: number;
  suggestions: string[];
  isLoading: boolean;
  position: Position;
}

interface TextBlockProps {
  block: Block;
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: (text: string, position: Position) => void;
  onSlashCommand: (position: Position, blockId: number) => void;
  handleSend: (prompt: string, blockId?: number) => Promise<string>;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
  getCollaboratorActivityForBlock?: (blockId: number) => {
    userId: string;
    userEmail: string;
    action: 'typing' | 'ai_query';
    content?: string;
    color: string;
  } | null;
  isCollaborative?: boolean;
}

// Utility function to convert markdown to HTML
const convertMarkdownToHtml = (content: string): string => {
  if (!content) return '<p></p>';
  
  // Check if content is already HTML
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) return content;
  
  // Check if content looks like markdown
  const hasMarkdownSyntax = /[*_#`\[\]]/g.test(content);
  if (!hasMarkdownSyntax) {
    return `<p>${content}</p>`;
  }
  
  // Convert markdown to HTML
  try {
    return marked.parse(content) as string;
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return `<p>${content}</p>`;
  }
};

const TextBlock: React.FC<TextBlockProps> = ({ 
  block, 
  darkMode, 
  updateBlock, 
  deleteBlock, 
  onTextSelect, 
  onSlashCommand,
  handleSend,
  registerBlockRef,
  handleTextChange,
  onBlockFocus,
  getCollaboratorActivityForBlock,
  isCollaborative = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [useTipTap, setUseTipTap] = useState(false);
  const [localContent, setLocalContent] = useState(block.content || '');
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [aiAssistance, setAiAssistance] = useState<AIAssistance | null>(null);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const aiPanelRef = useRef<HTMLDivElement>(null);

  // Get collaborator activity for this block
  const collaboratorActivity = isCollaborative && getCollaboratorActivityForBlock 
    ? getCollaboratorActivityForBlock(block.id)
    : null;

  useEffect(() => {
    setLocalContent(block.content || '');
  }, [block.content]);

  // Register the textarea ref with the typing tracker
  useEffect(() => {
    if (textareaRef.current) {
      registerBlockRef(block.id, textareaRef.current);
    }
    return () => registerBlockRef(block.id, null);
  }, [block.id, registerBlockRef]);

  // Check if content has rich formatting that needs TipTap
  const needsTipTap = (content: string): boolean => {
    if (!content) return false;
    
    // Check for HTML tags that indicate rich formatting
    const richFormatting = [
      /<h[1-6]>/i,           
      /<strong>|<b>/i,   
      /<em>|<i>/i,         
      /<ul>|<ol>/i,    
      /<table>/i,         
      /<pre>|<code>/i,     
      /<mark>/i,          
      /<details>/i,      
      /data-type="taskList"/i 
    ];
    
    return richFormatting.some(pattern => pattern.test(content));
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

  const handleSave = () => {
    if (handleTextChange) {
      handleTextChange(block.id, localContent);
    } else {
      updateBlock(block.id, { content: localContent });
    }
    setIsEditing(false);
    setUseTipTap(false); // Reset TipTap state when closing
  };

  const handleTipTapChange = (htmlContent: string) => {
    setLocalContent(htmlContent);
    if (handleTextChange) {
      handleTextChange(block.id, htmlContent);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const position = e.target.selectionStart || 0;
    setLocalContent(text);
  
    // Real-time collaborative updates
    if (handleTextChange) {
      handleTextChange(block.id, text);
    }
  
    const beforeCursor = text.substring(0, position);
    const lastSlashIndex = beforeCursor.lastIndexOf('/');
    
    if (lastSlashIndex !== -1 && (lastSlashIndex === 0 || text[lastSlashIndex - 1] === ' ' || text[lastSlashIndex - 1] === '\n')) {
      const afterSlash = beforeCursor.substring(lastSlashIndex + 1);
      if (afterSlash.length >= 0) {
        const rect = e.target.getBoundingClientRect();
        onSlashCommand({ x: rect.left, y: rect.top + 20 }, block.id);
      }
    }
  };

  const handleMouseUp = async (e: React.MouseEvent) => {
    const textarea = textareaRef.current;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    
    if (selectedText && selectedText.length > 0 && textarea) {
      const selectionStart = textarea.selectionStart || 0;
      const selectionEnd = textarea.selectionEnd || 0;
      
      const x = e.clientX;
      const y = e.clientY;
      
      setAiAssistance({
        selectedText,
        originalSelectionStart: selectionStart,
        originalSelectionEnd: selectionEnd,
        suggestions: [],
        isLoading: true,
        position: { x, y }
      });

      try {
        const prompt = `Please provide 3 different improved versions of this text: "${selectedText}". Consider grammar, clarity, style, and impact. Return only the 3 improved versions, each on a separate line with no additional explanation.`;
        
        const response = await handleSend(prompt, block.id);
        
        const suggestions = response.split('\n')
          .map(s => s.trim())
          .filter(s => s.length > 0)
          .slice(0, 3);
        
        if (suggestions.length === 0) {
          suggestions.push(
            selectedText.charAt(0).toUpperCase() + selectedText.slice(1),
            selectedText.toLowerCase(),
            selectedText.toUpperCase()
          );
        }
        
        setAiAssistance(prev => prev ? {
          ...prev,
          suggestions,
          isLoading: false
        } : null);
      } catch (error) {
        console.error('Error getting AI suggestions:', error);
        
        const fallbackSuggestions = [
          selectedText.charAt(0).toUpperCase() + selectedText.slice(1),
          selectedText.replace(/\b\w/g, l => l.toUpperCase()),
          selectedText + ' (enhanced)'
        ];
        
        setAiAssistance(prev => prev ? {
          ...prev,
          suggestions: fallbackSuggestions,
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
      const response = await handleSend(prompt, block.id);
      
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: [response.trim()],
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
    if (!aiAssistance) return;
    
    const beforeSelection = localContent.substring(0, aiAssistance.originalSelectionStart);
    const afterSelection = localContent.substring(aiAssistance.originalSelectionEnd);
    const newContent = beforeSelection + suggestion + afterSelection;
    
    setLocalContent(newContent);
    updateBlock(block.id, { content: newContent });
    
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
      const response = await handleSend(prompt, block.id);
      
      setAiAssistance(prev => prev ? {
        ...prev,
        suggestions: [response.trim()],
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      handleSave();
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

  const handleStartEditing = () => {
    setIsEditing(true);
    onBlockFocus?.(block.id);
    
    // Only load TipTap if content has rich formatting
    if (needsTipTap(localContent)) {
      setUseTipTap(true);
    }
  };

  const switchToTipTap = () => {
    // Convert current content to HTML if it's markdown
    const htmlContent = convertMarkdownToHtml(localContent);
    setLocalContent(htmlContent);
    setUseTipTap(true);
    
    // Update the block immediately so TipTap gets the HTML content
    if (handleTextChange) {
      handleTextChange(block.id, htmlContent);
    } else {
      updateBlock(block.id, { content: htmlContent });
    }
  };

  if (isEditing) {
    // Use TipTap for rich formatted content
    if (useTipTap) {
      return (
        <div className={`mb-1 p-1 border rounded-lg relative ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}>
          <Suspense fallback={
            <div className="flex items-center justify-center p-4">
              <RefreshCw className="animate-spin text-blue-500" size={20} />
              <span className="ml-2 text-sm text-gray-500">Loading editor...</span>
            </div>
          }>
            <TipTapEditor
              content={localContent}
              onChange={handleTipTapChange}
              onBlur={() => {}} 
              darkMode={darkMode}
              blockId={block.id}
              onSlashCommand={onSlashCommand}
            />
          </Suspense>
          
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
            <button
              onClick={() => {
                setUseTipTap(false); // Switch back to plain text
              }}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              Switch to plain text
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setLocalContent(block.content || '');
                  setIsEditing(false);
                  setUseTipTap(false);
                }}
                className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Use simple textarea for plain text
    return (
      <div className={`mb-1 p-1 border rounded-lg relative ${darkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <textarea
          ref={textareaRef}
          value={localContent}
          onChange={handleInputChange}
          onBlur={(e) => {
            // Don't auto-save if clicking the "Switch to rich text" button
            const relatedTarget = e.relatedTarget as HTMLElement;
            if (relatedTarget?.textContent?.includes('Switch to rich text')) {
              return;
            }
            handleSave();
          }}
          onKeyDown={handleKeyDown}
          className={`w-full p-2 border-none outline-none resize-none overflow-hidden ${darkMode ? 'bg-transparent text-white' : 'bg-transparent'}`}
          placeholder="Start writing or type '/' for commands..."
          autoFocus
          rows={1}
          style={{ minHeight: '40px' }}
        />

        {/* Button to switch to rich text editor */}
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              switchToTipTap();
            }}
            onMouseDown={(e) => {
              // Prevent blur event when clicking this button
              e.preventDefault();
            }}
            className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
              darkMode ? 'text-gray-400 hover:text-gray-200 hover:bg-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Edit size={12} />
            Switch to rich text
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setLocalContent(block.content || '');
                setIsEditing(false);
              }}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded"
            >
              Cancel
            </button>
            <span className="text-xs text-gray-500">
              Ctrl+Enter to save
            </span>
          </div>
        </div>

        {/* AI Assistance Popup - Same as before */}
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
            {/* Same AI panel content as before */}
            <div className={`p-1 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Zap className="text-blue-500" size={16} />
                  <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Text AI Assistant
                  </span>
                </div>
                <button
                  onClick={() => {
                    setAiAssistance(null);
                    setShowAIPanel(false);
                    setCustomPrompt('');
                  }}
                  className={`p-1 rounded hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'text-gray-500'}`}
                >
                  <X size={14} />
                </button>
              </div>
              
              <div className={`text-sm p-2 rounded ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-50 text-gray-600'}`}>
                Selected: {aiAssistance.selectedText}
              </div>
            </div>

            <div className={`p-1 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
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

            <div className={`p-1 border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
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
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                      handleCustomPrompt();
                    }
                  }}
                  disabled={aiAssistance.isLoading}
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

            <div className="p-1">
              {aiAssistance.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="animate-spin text-blue-500" size={16} />
                    <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                      Getting AI suggestions...
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {aiAssistance.suggestions.map((suggestion, index) => (
                    <div 
                      key={index} 
                      className={`p-1 rounded border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
                    >
                      <div className="flex-1 min-w-0">
                        <MessageMarkdown>{suggestion}</MessageMarkdown>
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
                          className={`px-3 py-1 rounded text-xs transition-colors flex items-center gap-1 ${
                            copiedIndex === index
                              ? 'bg-green-500 text-white'
                              : darkMode
                                ? 'bg-gray-600 hover:bg-gray-500 text-gray-200'
                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                        >
                          {copiedIndex === index ? <Check size={12} /> : <Copy size={12} />}
                          {copiedIndex === index ? 'Copied!' : 'Copy'}
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
  }

  // View mode - just display the content
  return (
    <div 
      className={`group mb-1 p-2 min-h-12 cursor-text rounded-lg border relative ${
        collaboratorActivity 
          ? `border-2 animate-pulse` 
          : darkMode 
          ? 'border-transparent hover:border-gray-600 hover:bg-gray-800' 
          : 'border-transparent hover:border-gray-200 hover:bg-gray-50'
      }`}
      style={collaboratorActivity ? { borderColor: collaboratorActivity.color } : undefined}
      onClick={handleStartEditing}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setShowDeleteButton(true)}
      onMouseLeave={() => setShowDeleteButton(false)}
    >
      {/* Collaborator Indicator */}
      {collaboratorActivity && (
        <div 
          className="absolute -top-6 left-0 px-2 py-1 rounded text-xs font-medium"
          style={{ 
            backgroundColor: collaboratorActivity.color,
            color: 'white'
          }}
        >
          {collaboratorActivity.userEmail.split('@')[0]} is {collaboratorActivity.action === 'typing' ? 'typing' : 'using AI'}...
        </div>
      )}

      {(showDeleteButton || !localContent) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            deleteBlock(block.id);
          }}
          className="absolute -left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full p-1"
          title="Delete block"
        >
          <X size={12} />
        </button>
      )}
      
      {localContent ? (
        <div className="flex-1 min-w-0">
          <MessageMarkdown>{localContent}</MessageMarkdown>
        </div>
      ) : (
        <div className={`${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
          Click to start writing...
        </div>
      )}
    </div>
  );
};

export default TextBlock;