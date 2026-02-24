import React from 'react';
import { X, Brain, Lightbulb, BookOpen} from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface TextSelectionPopupProps {
  show: boolean;
  position: Position;
  selectedText: string;
  darkMode: boolean;
  onAskAI: (text: string) => void;
  onClose: () => void;
}

const TextSelectionPopup: React.FC<TextSelectionPopupProps> = ({
  show,
  position,
  selectedText,
  darkMode,
  onAskAI,
  onClose
}) => {
  if (!show) return null;

  return (
    <div
      className={`fixed z-50 p-2 rounded-lg shadow-lg border ${
        darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
      }`}
      style={{
        left: Math.min(position.x, window.innerWidth - 200),
        top: position.y - 60,
      }}
    >
      <div className="flex gap-2">
        <button
          onClick={() => onAskAI(selectedText)}
          className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
            darkMode ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          <Brain size={14} />
          Ask AI
        </button>
        <button
          onClick={() => onAskAI(`Explain: ${selectedText}`)}
          className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
            darkMode ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          <Lightbulb size={14} />
          Explain
        </button>
        <button
          onClick={() => onAskAI(`Summarize: ${selectedText}`)}
          className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
            darkMode ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'
          }`}
        >
          <BookOpen size={14} />
          Summarize
        </button>
        <button
          onClick={onClose}
          className={`p-1 rounded text-sm transition-colors ${
            darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
          }`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};


export default TextSelectionPopup;