import React from "react";
import {Sparkles} from "lucide-react";
import {AISuggestion} from '@/typings/agent'
import { Block
  
 } from "@/typings/agent";

interface AISuggestionsPanelProps {
  suggestions: AISuggestion[];
  darkMode: boolean;
  onAccept: (suggestion: AISuggestion, action?: 'replace' | 'append' | 'insert') => void;
  onReject: (suggestionId: number) => void;
  showContext:boolean,
  blocks:Block[]
}

const AISuggestionsPanel: React.FC<AISuggestionsPanelProps> = ({ 
  suggestions, 
  darkMode, 
  onAccept, 
  onReject,
  showContext,
  blocks,
}) => {
  if (suggestions.length === 0) return null;

  // Helper function to check if suggestion is related to an existing block
  const hasRelatedBlock = (suggestion: AISuggestion) => {
    return suggestion.relatedBlockId && 
           blocks.find(b => b.id === suggestion.relatedBlockId);
  };

  // Render action buttons based on whether the suggestion is related to an existing block
  const renderActionButtons = (suggestion: AISuggestion) => {
    const relatedBlock = hasRelatedBlock(suggestion);
    
    if (relatedBlock) {
      // Show multiple options for existing blocks
      return (
        <div className="flex gap-1">
          <button
            onClick={() => onAccept(suggestion, 'replace')}
            className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 transition-colors"
            title="Replace the content of the original block"
          >
            Replace
          </button>
          <button
            onClick={() => onAccept(suggestion, 'append')}
            className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/30 rounded hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
            title="Append to the original block"
          >
            Append
          </button>
          <button
            onClick={() => onAccept(suggestion, 'insert')}
            className="px-2 py-1 text-xs font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/30 rounded hover:bg-purple-100 dark:hover:bg-purple-800/50 transition-colors"
            title="Insert as new block after the original"
          >
            Insert
          </button>
          <button
            onClick={() => onReject(suggestion.id)}
            className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-800/50 transition-colors"
          >
            Reject
          </button>
        </div>
      );
    } else {
      // Default buttons for new blocks
      return (
        <div className="flex gap-1">
          <button
            onClick={() => onAccept(suggestion)}
            className="px-2 py-1 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-900/30 rounded hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
          >
            Accept
          </button>
          <button
            onClick={() => onReject(suggestion.id)}
            className="px-2 py-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 rounded hover:bg-red-100 dark:hover:bg-red-800/50 transition-colors"
          >
            Reject
          </button>
        </div>
      );
    }
  };

  return (
    <div className="flex justify-center p-1">
      <div className={`w-full max-w-2xl rounded-xl border shadow-lg transition-colors duration-200 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className={`flex items-center gap-2 px-4 py-3 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <Sparkles size={18} className="text-blue-500" />
          <h3 className={`font-semibold text-lg ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Orion Suggestions
          </h3>
        </div>

        <div className="max-h-64 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="flex items-start justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
              <div className="flex-1">
                <p className={`text-sm mb-1 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  {suggestion.text}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`text-xs capitalize ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {suggestion.type}
                  </span>
                  {/* Show context info if available */}
                  {suggestion.relatedBlockId && showContext && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                      Related to {suggestion.relatedBlockType || 'block'}
                    </span>
                  )}
                </div>
              </div>

              {renderActionButtons(suggestion)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AISuggestionsPanel;