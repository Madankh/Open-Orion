import React, { useState } from 'react';
import { FileText, Music, Trash2, Brain, ExternalLink, Play } from 'lucide-react';
import { RootState, SearchResult } from '@/typings/agent';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'next/navigation';
import { Selection } from '@/typings/agent';
import { pythonUrl,nodeUrl } from "../../apiurl"
// Dynamic import with SSR disabled
const AdvancedKnowledgeExtractor = dynamic(
  () => import('./PdfreaderNotepad'),
  {
    ssr: false,
    loading: () => <div className="flex items-center justify-center p-4">Loading PDF viewer...</div>
  }
);

export interface Block {
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
  file?: File ;
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


interface MediaBlockProps {
  block: Block;
  darkMode: boolean;
  updateBlock: (id: number, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number) => void;
  onAskAI?: (prompt: string, blockId: number, fileUrl?: string, screenshotUrl?: string) => void;
  registerBlockRef: (blockId: number, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number, newContent: string) => void;
}

const MediaBlock: React.FC<MediaBlockProps> = ({
  block,
  darkMode,
  deleteBlock,
  onAskAI,
  registerBlockRef,
  handleTextChange
}) => {
  const [showAIPromptInput, setShowAIPromptInput] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const searchParams = useSearchParams();
  const SessionId = searchParams.get("ChannelItemID") || searchParams.get("id");
  const getDocumentTypeDisplay = () => {
    if (!block.name) return 'Document';

    const extension = block.name.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'pdf': return 'PDF Document';
      case 'doc': case 'docx': return 'Word Document';
      case 'txt': return 'Text Document';
      case 'rtf': return 'Rich Text Document';
      case 'xls': case 'xlsx': return 'Excel Spreadsheet';
      case 'ppt': case 'pptx': return 'PowerPoint Presentation';
      case 'json': return 'JSON File';
      case 'csv': return 'CSV File';
      case 'md': return 'Markdown File';
      default: return 'Document';
    }
  };

  const handleAIAnalysis = () => {
    if (!userPrompt.trim() || !onAskAI) return;

    onAskAI(userPrompt, block.id, block.url);

    setShowAIPromptInput(false);
    setUserPrompt('');
  };

  const renderMedia = () => {
    switch (block.type) {
      case 'image':
        return (
          <div className="relative group">
            <img
              src={`${pythonUrl}${block.url}`}
              alt={block.name || 'Uploaded image'}
              className="w-full h-48 object-cover rounded-lg"
            />

            {/* Overlay with actions - only visible on hover */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                {/* AI Analysis Button */}
                {block.status === 'uploaded' && block.url && (
                  <button
                    onClick={() => setShowAIPromptInput(true)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors shadow-lg"
                    title="Ask AI about this image"
                  >
                    <Brain size={16} />
                  </button>
                )}

                {/* Open image button */}
                {block.url && (
                  <button
                    onClick={() => window.open(block.url, '_blank')}
                    className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-full transition-colors shadow-lg"
                    title="Open image"
                  >
                    <ExternalLink size={16} />
                  </button>
                )}

                {/* Delete button */}
                <button
                  onClick={() => deleteBlock(block.id)}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shadow-lg"
                  title="Delete image"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>

            {/* Loading overlay */}
            {block.status === 'uploading' && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2" />
                  <div className="text-sm">Uploading...</div>
                </div>
              </div>
            )}
          </div>
        );

      case 'video':
        return (
          <div className="relative group">
            <video
              src={block.src || block.url}
              className="w-full h-48 object-cover rounded-lg"
              poster={block.thumbnail}
            >
              Your browser does not support the video tag.
            </video>

            {/* Overlay with actions */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                {/* AI Analysis Button */}
                {block.status === 'uploaded' && block.url && (
                  <button
                    onClick={() => setShowAIPromptInput(true)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors shadow-lg"
                    title="Ask AI about this video"
                  >
                    <Brain size={16} />
                  </button>
                )}

                {/* Play/Open button */}
                <button
                  onClick={() => window.open(block.url, '_blank')}
                  className="p-2 bg-gray-600 hover:bg-gray-700 text-white rounded-full transition-colors shadow-lg"
                  title="Open video"
                >
                  <Play size={16} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => deleteBlock(block.id)}
                  className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors shadow-lg"
                  title="Delete video"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        );

      case 'audio':
        return (
          <div className={`p-1 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Music size={20} className="text-purple-500" />
                <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {block.name || 'Audio file'}
                </span>
              </div>
              <div className="flex gap-1">
                {block.status === 'uploaded' && block.url && (
                  <button
                    onClick={() => setShowAIPromptInput(true)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                    title="Ask AI about this audio"
                  >
                    <Brain size={14} />
                  </button>
                )}
                <button
                  onClick={() => deleteBlock(block.id)}
                  className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                  title="Delete audio"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            <audio controls className="w-full">
              <source src={block.src || block.url} />
            </audio>
          </div>
        );

      case 'pdf':
      case 'document':
        return (
          <div className="relative w-[full] h-[90vh] bg-white rounded-lg shadow-lg overflow-hidden">
            <AdvancedKnowledgeExtractor
              pdfUrl={block.url}
              pdfFile={block.file}
              onAskAI={async (prompt: string, selection: Selection, pdfUrl?: string) => {
                let screenshotPath: string | undefined;

                // If this is an image selection, upload the screenshot first
                if (selection.type === 'image' && selection.imageData) {
                  try {
                    // Upload the screenshot
                    const response = await fetch(`${pythonUrl}/api/upload`, {
                      method: "POST",
                      headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        session_id: SessionId,
                        file: {
                          path: `pdf_screenshot_page${selection.pageNumber}_${Date.now()}.png`,
                          content: selection.imageData
                        },
                      }),
                    });

                    const result = await response.json();

                    if (response.ok) {
                      screenshotPath = result.file.path;
                    } else {
                      toast.error('Failed to upload screenshot');
                      return;
                    }
                  } catch (error) {
                    console.error('[PDF] ❌ Error uploading screenshot:', error);
                    toast.error('Error uploading screenshot');
                    return;
                  }
                }

                // Create contextual prompt based on selection type
                let contextualPrompt = '';

                if (selection.type === 'text') {
                  contextualPrompt = `(Page ${selection.pageNumber})
          
          "${selection.content}"
          
          User's Question: ${prompt}`;
                } else if (selection.type === 'image' && screenshotPath) {
                  contextualPrompt = `(Page ${selection.pageNumber})
          
          User has selected a region/image from the PDF. Please analyze the image and answer their question.
          
          User's Question: ${prompt}`;
                }

                onAskAI?.(contextualPrompt, block.id, pdfUrl, screenshotPath);
              }}

              parentNodeId={`block-${block.id}`}
            />

          </div>
        );

      default:
        return (
          <div className={`p-1 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'
            }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText size={20} className="text-gray-500" />
                <span>Unsupported media type: {block.type}</span>
              </div>
              <button
                onClick={() => deleteBlock(block.id)}
                className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                title="Delete block"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        );
    }
  };

  const getSuggestedPrompts = () => {
    const basePrompts = [
      { text: 'Explain content', prompt: 'Explain what is shown in this file' },
      { text: 'Summarize', prompt: 'Summarize the main points from this file' }
    ];

    switch (block.type) {
      case 'video':
      case 'audio':
        return [
          ...basePrompts,
          { text: 'Transcribe', prompt: 'Transcribe the audio from this file' },
          { text: 'Key points', prompt: 'What are the key points discussed in this audio/video?' }
        ];

      case 'image':
        return [
          ...basePrompts,
          { text: 'Extract text', prompt: 'Extract all text from this image' },
          { text: 'Describe', prompt: 'Describe what you see in this image in detail' }
        ];

      case 'pdf':
      case 'document':
        return [
          ...basePrompts,
          { text: 'Extract text', prompt: 'Extract all text from this file' },
          { text: 'Key insights', prompt: 'What are the key insights from this document?' },
          { text: 'Action items', prompt: 'List any action items or tasks mentioned in this document' }
        ];

      default:
        return basePrompts;
    }
  };

  return (
    <div className="my-6">
      {/* Media content */}
      <div className="relative">
        {renderMedia()}
      </div>

      {/* AI Prompt Input Panel */}
      {showAIPromptInput && (
        <div className={`mt-4 p-1 rounded-lg border ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}>
          <div className="mb-3">
            <h4 className={`font-medium mb-2 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              <Brain size={16} />
              Ask AI about this {block.type === 'document' ? getDocumentTypeDisplay().toLowerCase() : block.type}
            </h4>
            <p className={`text-sm mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              What would you like to know about {block.name}?
            </p>
          </div>

          <div className="space-y-3">
            {/* Quick suggestion buttons */}
            <div className="flex flex-wrap gap-2">
              {getSuggestedPrompts().map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => setUserPrompt(suggestion.prompt)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${darkMode
                      ? 'border-gray-600 text-gray-300 hover:bg-gray-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  {suggestion.text}
                </button>
              ))}
            </div>

            {/* Custom prompt input */}
            <div>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder={`Ask anything about this ${block.type === 'document' ? 'document' : block.type}...`}
                className={`w-full px-3 py-2 border rounded-lg text-sm resize-none ${darkMode
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white border-gray-300 placeholder-gray-500'
                  }`}
                rows={3}
              />
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAIPromptInput(false);
                  setUserPrompt('');
                }}
                className={`px-4 py-2 text-sm rounded-lg ${darkMode
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-600 hover:text-gray-700'
                  }`}
              >
                Cancel
              </button>
              <button
                onClick={handleAIAnalysis}
                disabled={!userPrompt.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Ask AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MediaBlock;