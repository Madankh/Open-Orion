import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {Sparkles, Trash2, Edit, MessageSquare, Brain, AlertTriangle} from 'lucide-react';

// Import block components
import TextBlock from './TextBlock';
import HeadingBlock from "./HeadingBlock";
import TableBlock from './TableBlock';
import CodeBlock from './CodeBlock';
import DetailsBlock from './DetailsBlock';
import QuoteBlock from './QuoteBlock';
import ListBlock from './ListBlock';
import LaTeXBlock from './LaTeXBlock';
import MediaBlock from './MediaBlock';
import Whiteboard from './Whiteboard'
import { Block } from '@/typings/agent';
import YouTubeBlock from './YoutubeBlock';
import KanbanBlock from './KanbanBlock';

interface Position {
  x: number;
  y: number;
}

interface BlockRendererProps {
  blocks: Block[];
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onTextSelect: () => void;
  onSlashCommand: (position: Position, blockId: number) => void;
  handleQuickAI: (prompt: string, blockId?: number) => Promise<string>
  onBlockAIRequest: (blockId: number, prompt: string, fileUrl?: string, whiteboardContext?: unknown,screenshotUrl?: string) => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  projectInfo?: {name: string, type: string};
  handleBlockTextChange?: (blockId: number, newContent: string) => void;
  onBlockFocus?: (blockId: number) => void;
  getCollaboratorActivityForBlock?: (blockId: number) => { // ADD THIS
    userId: string;
    userEmail: string;
    action: 'typing' | 'ai_query';
    content?: string;
    color: string;
  } | null;
}

// Enhanced Block AI Controls Component
interface BlockAIControlsProps {
  blockId: number;
  blockType: string;
  darkMode: boolean;
  onAIRequest: (blockId: number, prompt: string) => void;
}

const BlockAIControls = React.memo<BlockAIControlsProps>(({ 
  blockId, 
  blockType, 
  darkMode, 
  onAIRequest 
}) => {
  const [showAIMenu, setShowAIMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Memoize contextual prompts to avoid recreation on every render
  const contextualPrompts = useMemo((): string[] => {
    const promptMap: Record<string, string[]> = {
      'code': [
        'Explain this code',
        'Add comments to this code',
        'Optimize this code',
        'Find bugs in this code',
        'Convert to different language'
      ],
      'table': [
        'Analyze this data',
        'Add more sample data',
        'Create a chart from this data',
        'Summarize key insights',
        'Add calculated columns'
      ],
      'text': [
        'Expand this content',
        'Rewrite more clearly',
        'Summarize this text',
        'Add examples',
        'Make it more professional'
      ],
      'heading': [
        'Generate content for this section',
        'Create subsections',
        'Add introduction',
        'Expand the outline'
      ],
      'quote': [
        'Analyze this quote',
        'Find similar quotes',
        'Explain the meaning',
        'Provide context'
      ],
      'latex': [
        'Explain this formula',
        'Provide examples',
        'Derive this equation',
        'Show applications'
      ]
    };

    return promptMap[blockType] || [
      'Improve this content',
      'Add more details',
      'Rewrite professionally',
      'Create related content'
    ];
  }, [blockType]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowAIMenu(false);
      }
    };

    if (showAIMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAIMenu]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setShowAIMenu(false);
    }
  }, []);

  const handlePromptClick = useCallback((prompt: string) => {
    onAIRequest(blockId, prompt);
    setShowAIMenu(false);
  }, [blockId, onAIRequest]);

  const handleCustomPrompt = useCallback(() => {
    const customPrompt = window.prompt('Enter your custom AI request:');
    if (customPrompt?.trim()) {
      onAIRequest(blockId, customPrompt.trim());
    }
    setShowAIMenu(false);
  }, [blockId, onAIRequest]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowAIMenu(!showAIMenu)}
        onKeyDown={handleKeyDown}
        className={`p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${
          darkMode 
            ? 'hover:bg-gray-700 text-gray-400 hover:text-gray-300' 
            : 'hover:bg-gray-100 text-gray-500 hover:text-gray-600'
        }`}
        title="Ask AI about this block"
        aria-label="Ask AI about this block"
        aria-expanded={showAIMenu}
        aria-haspopup="menu"
      >
        <Sparkles size={16} aria-hidden="true" />
      </button>
      
      {showAIMenu && (
        <div 
          className={`absolute right-0 top-full mt-2 w-64 rounded-lg shadow-lg border z-50 ${
            darkMode 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white border-gray-200'
          }`}
          role="menu"
          aria-label="AI suggestions menu"
        >
          <div className={`p-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Brain size={14} aria-hidden="true" />
              <span className={darkMode ? 'text-gray-200' : 'text-gray-800'}>
                Ask AI
              </span>
            </div>
          </div>
          
          <div className="p-2 max-h-64 overflow-y-auto">
            {contextualPrompts.map((prompt, index) => (
              <button
                key={`${blockType}-${index}`}
                onClick={() => handlePromptClick(prompt)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  darkMode 
                    ? 'hover:bg-gray-700 text-gray-300' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                role="menuitem"
              >
                {prompt}
              </button>
            ))}
            
            <div className={`border-t mt-2 pt-2 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <button
                onClick={handleCustomPrompt}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  darkMode 
                    ? 'hover:bg-gray-700 text-gray-300' 
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
                role="menuitem"
              >
                <div className="flex items-center gap-2">
                  <Edit size={14} aria-hidden="true" />
                  Custom request...
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

BlockAIControls.displayName = 'BlockAIControls';

// Enhanced Block Wrapper Component
interface BlockWrapperProps {
  block: Block;
  darkMode: boolean;
  onDelete: (blockId: number) => void;
  onAIRequest: (blockId: number, prompt: string) => void;
  children: React.ReactNode;
  showAIControls?: boolean; // Renamed and separated from delete controls
  showDeleteControls?: boolean; // New separate prop for delete controls
}

const BlockWrapper = React.memo<BlockWrapperProps>(({ 
  block, 
  darkMode, 
  onDelete, 
  onAIRequest,
  children,
  showAIControls = true, 
  showDeleteControls = true
}) => {

  const handleDelete = useCallback(() => {
    if (window.confirm('Are you sure you want to delete this block?')) {
      onDelete(block.id);
    }
  }, [block.id, onDelete]);

  return (
    <div 
      className="group relative my-2"
    >
      <div className="relative">
        {children}
        
        {/* Block Controls - Show if either AI or Delete controls should be shown */}
        {(showAIControls || showDeleteControls) && (
          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* AI Controls - Always show if showAIControls is true */}
            {showAIControls && (
              <BlockAIControls 
                blockId={block.id}
                blockType={block.type}
                darkMode={darkMode}
                onAIRequest={onAIRequest}
              />
            )}
            
            {/* Delete Controls - Only show if showDeleteControls is true */}
            {showDeleteControls && (
              <button
                onClick={handleDelete}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode 
                    ? 'hover:bg-red-900/30 text-red-400 hover:text-red-300' 
                    : 'hover:bg-red-100 text-red-500 hover:text-red-600'
                }`}
                title="Delete block"
                aria-label="Delete block"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

BlockWrapper.displayName = 'BlockWrapper';

// Main BlockRenderer Component
const BlockRenderer = React.memo<BlockRendererProps>(({
  blocks,
  darkMode,
  updateBlock,
  deleteBlock,
  onTextSelect,
  onSlashCommand,
  handleQuickAI,
  onBlockAIRequest,
  registerBlockRef,
  projectInfo,
  handleBlockTextChange,
  onBlockFocus,
  getCollaboratorActivityForBlock
}) => {
  
  // Helper function to determine if AI controls should be shown for a block type
  const shouldShowAIControls = useCallback((blockType: string) => {
    // Hide AI controls for certain block types
    const blocksWithoutAIControls = ['whiteboard'];
    return !blocksWithoutAIControls.includes(blockType);
  }, []);

  // Helper function to determine if delete controls should be shown for a block type
  const shouldShowDeleteControls = useCallback(() => {
    return true;
  }, []);

  const handleTextChange = useCallback((blockId: number, newContent: string) => {
    if (handleBlockTextChange) {
      // Use the collaborative handler if available
      handleBlockTextChange(blockId, newContent);
    } else {
      // Fallback to regular update
      updateBlock(blockId, { content: newContent });
    }
  }, [handleBlockTextChange, updateBlock]);

  // Memoize block rendering to avoid unnecessary re-renders
  const renderBlock = useCallback((block: Block) => {
    // Create a wrapper that doesn't add extra props that individual blocks don't need
    const renderBlockContent = () => {
      switch (block.type) {
        case 'text':
          return (
            <TextBlock 
              key={block.id}
              block={block}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              onSlashCommand={onSlashCommand}
              deleteBlock={deleteBlock}
              handleSend={handleQuickAI}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'heading':
          return (
            <HeadingBlock 
              key={block.id}
              block={block as Block & { level: number }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );
        case 'whiteboard':
          return (
            <Whiteboard 
              key={block.id}
              block={{
                ...block,
                type: (block.type === 'whiteboard' ? 'general' : block.type) as "education" | "sales" | "marketing" | "general"
              }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              mainAIHandler={async (prompt: string, context?: unknown) => {
                const whiteboardContext = context;
                await onBlockAIRequest(block.id, prompt,undefined, whiteboardContext);
              }}
            />
          );
        case 'quote':
          return (
            <QuoteBlock 
              key={block.id}
              block={block}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'code':
          return (
            <CodeBlock 
              key={block.id}
              block={block as Block & { language: string }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'details':
          return (
            <DetailsBlock 
              key={block.id}
              block={block}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'table':
          return (
            <TableBlock 
              key={block.id}
              block={block as Block & { data: string[][] }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'bullet':
          return (
            <ListBlock 
              key={block.id}
              block={{ ...block, variant: 'bullet' } as Block & { variant: 'bullet' }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              onSlashCommand={onSlashCommand}
              handleSend={handleQuickAI}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'numbered-list':
          return (
            <ListBlock 
              key={block.id}
              block={{ ...block, variant: 'numbered' } as Block & { variant: 'numbered' }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              onTextSelect={onTextSelect}
              onSlashCommand={onSlashCommand}
              deleteBlock={deleteBlock}
              handleSend={handleQuickAI}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
              
            />
          );

        case 'youtube':
          return (
            <YouTubeBlock
              key={block.id}
              block={block as Block & { 
                url?: string; 
                videoId?: string; 
                title?: string;
                timestamps?: Array<{
                  id: string;
                  timestamp: number;
                  note: string;
                  createdAt: number;
                }>;
              }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
              onAskAI={(prompt) => onBlockAIRequest(block.id, prompt)} 
            />
          );
        
        case 'kanban':
          return (
            <KanbanBlock
              key={block.id}
              block={block as Block & { 
                columns?: Array<{
                  id: string;
                  title: string;
                  cards: Array<{
                    id: string;
                    title: string;
                    description?: string;
                    assignee?: string;
                    dueDate?: string;
                    priority?: 'low' | 'medium' | 'high';
                    tags?: string[];
                    createdAt: number;
                  }>;
                  color?: string;
                }>;
                boardTitle?: string;
              }}
              darkMode={darkMode}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'latex':
          return (
            <LaTeXBlock 
              key={block.id}
              block={block}
              darkMode={darkMode}
              updateBlock={updateBlock}
              // onTextSelect={onTextSelect}
              deleteBlock={deleteBlock}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              onBlockFocus={onBlockFocus}
            />
          );

        case 'image':
        case 'video':
        case 'audio':
        case 'document':
          return (
            <MediaBlock 
              key={block.id}
              block={block}
              darkMode={darkMode}
              updateBlock={updateBlock}
              deleteBlock={deleteBlock}
              onAskAI={(prompt, blockId, fileUrl,screenshotUrl) => onBlockAIRequest(blockId, prompt, fileUrl,undefined,screenshotUrl)}
              registerBlockRef={registerBlockRef}
              handleTextChange={handleTextChange}
              
            />
          );

        default:
          return (
            <div className={`my-4 p-1 border-2 border-dashed rounded-lg ${
              darkMode ? 'border-gray-600 text-gray-400' : 'border-gray-300 text-gray-500'
            }`}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} aria-hidden="true" />
                <span>Unknown block type: {block.type}</span>
              </div>
            </div>
          );
      }
    };

    return (
      <BlockWrapper
        key={block.id}
        block={block}
        darkMode={darkMode}
        onDelete={deleteBlock}
        onAIRequest={onBlockAIRequest}
        showAIControls={shouldShowAIControls(block.type)} 
        showDeleteControls={shouldShowDeleteControls()} 
      >
        {renderBlockContent()}
      </BlockWrapper>
    );
  }, [darkMode, updateBlock, deleteBlock, onTextSelect, onSlashCommand, handleQuickAI, onBlockAIRequest, shouldShowAIControls, shouldShowDeleteControls]);

  // Memoize the rendered blocks
  const renderedBlocks = useMemo(() => 
    blocks.map(renderBlock), 
    [blocks, renderBlock]
  );

  if (blocks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className={`text-center py-12 ${
          darkMode ? 'text-gray-400' : 'text-gray-500'
        }`}>
          <MessageSquare size={48} className="mx-auto mb-4 opacity-50" />
          <p>No blocks yet. Start by adding some content!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto" role="main" aria-label="Document blocks">
      {renderedBlocks}
    </div>
  );
});

BlockRenderer.displayName = 'BlockRenderer';

export default BlockRenderer;