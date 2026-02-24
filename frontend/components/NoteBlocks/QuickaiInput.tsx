import React from "react";
import { Sparkles, Send, WifiOff, X } from "lucide-react";

interface QuickAIInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  handleCancel: () => void;
  isGenerating: boolean;
  darkMode: boolean;
  isConnected?: boolean;
  onConnect?: () => void;
}

const QuickAIInput: React.FC<QuickAIInputProps> = ({
  value,
  onChange,
  onSubmit,
  handleCancel,
  isGenerating,
  darkMode,
  isConnected = true,
  onConnect,
}) => {
  const bgColor = darkMode ? "bg-gray-800/80" : "bg-white/70";
  const textColor = darkMode ? "text-white" : "text-gray-900";
  const placeholderColor = darkMode ? "placeholder-gray-400" : "placeholder-gray-500";

  return (
    <div className="flex flex-col gap-3 mt-8 px-4 items-center w-full">
      {/* Connection status badge */}
      {!isConnected && (
        <div
          className={`flex items-center gap-2 px-3 py-1 text-xs rounded-full shadow-sm ${
            darkMode ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-600"
          }`}
        >
          <WifiOff size={14} />
          Connection lost
          {onConnect && (
            <button
              onClick={onConnect}
              className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full hover:bg-red-600 transition"
            >
              Reconnect
            </button>
          )}
        </div>
      )}

      {/* Input bar */}
      <div
        className={`flex items-center w-full max-w-2xl rounded-full shadow-lg ${bgColor} backdrop-blur-lg border border-transparent focus-within:border-blue-500 transition`}
      >
        <Sparkles
          size={20}
          className={`ml-4 ${darkMode ? "text-blue-400" : "text-blue-600"}`}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isConnected ? "Collaborate with Orion…" : "Connect to start..."}
          className={`flex-1 px-3 py-3 bg-transparent ${textColor} ${placeholderColor} focus:outline-none text-lg`}
          onKeyDown={(e) => e.key === "Enter" && isConnected && !isGenerating && onSubmit()}
          disabled={!isConnected}
        />
        
        {/* Dynamic button - Cancel when generating, Send when not */}
        {isGenerating ? (
          <button
            onClick={handleCancel}
            className={`mr-2 flex items-center justify-center gap-2 px-5 py-2.5 rounded-full ${
              darkMode ? "bg-red-600 hover:bg-red-700" : "bg-red-500 hover:bg-red-600"
            } text-white transition duration-200 hover:scale-105`}
            title="Cancel generation"
          >
            <X size={18} />
            <span className="text-sm font-medium">Cancel</span>
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={!value.trim() || !isConnected}
            className={`mr-2 flex items-center justify-center gap-2 px-5 py-2.5 rounded-full ${
              isConnected ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400"
            } text-white disabled:opacity-50 disabled:cursor-not-allowed transition duration-200 hover:scale-105 disabled:hover:scale-100`}
          >
            <Send size={18} />
          </button>
        )}
      </div>

      {/* Enhanced loading indicator with cancel option */}
      {isGenerating && (
        <div className="w-full max-w-2xl space-y-2">
          {/* Progress bar */}
          <div className="w-full h-1 rounded-full overflow-hidden bg-blue-200/30">
            <div className="h-full bg-blue-500 animate-pulse" />
          </div>
          
          {/* Status text with cancel button */}
          <div className="flex items-center justify-between text-sm">
            <div className={`flex items-center gap-2 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
              <div className="flex space-x-1">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span>Orion is thinking...</span>
            </div>
            
            <button
              onClick={handleCancel}
              className={`px-3 py-1 text-xs rounded-full transition ${
                darkMode 
                  ? "text-red-400 hover:bg-red-900/20 hover:text-red-300" 
                  : "text-red-600 hover:bg-red-50 hover:text-red-700"
              }`}
            >
              Stop generation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickAIInput;