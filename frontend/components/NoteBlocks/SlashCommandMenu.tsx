import React from 'react';
import { Image, FileText, Plus, Type, Hash, List, Quote, Table, Code, FileUp, PaintbrushIcon, Play, Trello } from 'lucide-react';

interface Position {
  x: number;
  y: number;
}

interface SlashCommand {
  name: string;
  icon: React.ReactNode;
  description: string;
}

interface SlashCommandCategory {
  category: string;
  items: SlashCommand[];
}

interface SlashCommandMenuProps {
  show: boolean;
  position: Position;
  darkMode: boolean;
  onSelectCommand: (commandName: string) => void;
}

const SlashCommandMenu: React.FC<SlashCommandMenuProps> = ({
  show,
  position,
  darkMode,
  onSelectCommand
}) => {
  if (!show) return null;

  const slashCommands: SlashCommandCategory[] = [
    {
      category: 'Text Formatting',
      items: [
        { name: 'Text', icon: <Type size={16} />, description: 'Plain text block' },
        { name: 'Heading 1', icon: <Hash size={16} />, description: 'Large heading' },
        { name: 'Heading 2', icon: <Hash size={16} />, description: 'Medium heading' },
        { name: 'Heading 3', icon: <Hash size={16} />, description: 'Small heading' },
        { name: 'Bullet List', icon: <List size={16} />, description: 'Bulleted list' },
        { name: 'Numbered List', icon: <List size={16} />, description: 'Numbered list' },
        { name: 'Quote', icon: <Quote size={16} />, description: 'Quote block' },
      ]
    },

    {
      category: 'Advanced Blocks',
      items: [
        { name: 'Table', icon: <Table size={16} />, description: 'Interactive table' },
        { name: 'Details', icon: <Plus size={16} />, description: 'Collapsible details' },
        { name: 'Code Block', icon: <Code size={16} />, description: 'Syntax-highlighted code' },
        { name: 'LaTeX', icon: <Type size={16} />, description: 'Mathematical equations' },
      ]
    },
    {
      category: 'Media & Generation',
      items: [
        { name: 'WhiteBoard', icon: <PaintbrushIcon size={16} />, description: 'Whiteboard' },
        { name: 'Image', icon: <Image size={16} />, description: 'Upload and analyze image' },
        {name: 'YouTube', description: 'Embed a YouTube video with timestamp notes', icon: <Play/>},
        // { name: 'Kanban Board',description: 'Create a task board with drag & drop',icon: <Trello/>},
        { name: 'PDF', icon: <FileUp size={16} />, description: 'Upload and analyze PDF' },

      ]
    }
  ];

  return (
    <div
      className={`fixed z-50 w-80 rounded-lg shadow-lg border max-h-96 overflow-y-auto ${
        darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'
      }`}
      style={{
        left: Math.min(position.x, window.innerWidth - 320),
        top: position.y,
      }}
    >
      {slashCommands.map((category) => (
        <div key={category.category} className="py-2">
          <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide ${
            darkMode ? 'text-gray-400' : 'text-gray-500'
          }`}>
            {category.category}
          </div>
          {category.items.map((command: SlashCommand) => (
            <button
              key={command.name}
              onClick={() => onSelectCommand(command.name)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                darkMode ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
              }`}
            >
              {command.icon}
              <div>
                <div className="font-medium">{command.name}</div>
                <div className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {command.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default SlashCommandMenu;