// TipTapEditor.tsx - Separate file for lazy loading
import React, { useEffect, useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { Color } from '@tiptap/extension-color';
import { common, createLowlight } from 'lowlight';
import { Table } from '@tiptap/extension-table';
import { TextStyle } from '@tiptap/extension-text-style';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extension-placeholder';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { marked } from 'marked';
import {
  Bold, Italic, Strikethrough, Highlighter, Heading1, Heading2, Heading3,Link2, Palette, X
} from 'lucide-react';

interface TipTapEditorProps {
  content: string;
  onChange: (content: string) => void;
  onBlur?: () => void;
  darkMode: boolean;
  blockId: number;
  onSlashCommand?: (position: { x: number; y: number }, blockId: number) => void;
}
const darkMode = false;
// Convert markdown to HTML
const convertMarkdownToHtml = (content: string): string => {
  if (!content) return '<p></p>';
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) return content;
  const hasMarkdownSyntax = /[*_#`\[\]]/g.test(content);
  if (!hasMarkdownSyntax) return `<p>${content}</p>`;
  try {
    return marked.parse(content) as string;
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return `<p>${content}</p>`;
  }
};

const MenuButton = ({ onClick, isActive, icon, label, className = '' }: any) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded flex items-center gap-1.5 text-sm font-medium transition-colors ${
      isActive 
        ? 'bg-blue-100 text-blue-600' 
        : darkMode 
        ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-300' 
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    } ${className}`}
    title={label}
    type="button"
  >
    {icon}
  </button>
);

const Separator = () => <div className={`w-[1px] h-4 mx-1 self-center ${darkMode ? 'bg-gray-600' : 'bg-slate-200'}`} />;

// Bubble Menu Component
const BubbleMenu = ({ editor, darkMode }: { editor: any; darkMode: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { empty } = editor.state.selection;
      
      if (empty) {
        setIsOpen(false);
        setIsLinkMode(false);
        setShowColorPicker(false);
        setShowHighlightPicker(false);
        return;
      }

      const range = window.getSelection()?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        
        setPosition({
          top: rect.top - 50,
          left: rect.left + rect.width / 2
        });
        setIsOpen(true);
      }
    };

    editor.on('selectionUpdate', update);
    window.addEventListener('resize', update);

    return () => {
      editor.off('selectionUpdate', update);
      window.removeEventListener('resize', update);
    };
  }, [editor]);

  const setLink = () => {
    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    }
    setIsLinkMode(false);
  };

  const textColors = ['#000000', '#9B9A97', '#64473A', '#D9730D', '#DFAB01', '#0F7B6C', '#0B6E99', '#6940A5', '#9F1853', '#E03E3E'];
  
  const highlightColors = [
    { color: '#fef08a', label: 'Yellow' },
    { color: '#fecaca', label: 'Red' },
    { color: '#bfdbfe', label: 'Blue' },
    { color: '#bbf7d0', label: 'Green' },
    { color: '#e9d5ff', label: 'Purple' },
  ];

  if (!isOpen) return null;

  return (
    <div 
      ref={menuRef}
      className={`fixed z-50 rounded-lg shadow-xl border p-1 flex items-center gap-0.5 ${
        darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-slate-200'
      }`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        transform: 'translateX(-50%)',
      }}
    >
      {isLinkMode ? (
        <div className="flex items-center gap-2 px-2 py-1 w-full">
          <input 
            autoFocus
            className={`text-sm border-none rounded px-2 py-1 flex-1 min-w-0 focus:ring-2 focus:ring-blue-500 outline-none ${
              darkMode ? 'bg-gray-700 text-white' : 'bg-slate-100 text-black'
            }`}
            placeholder="https://..."
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && setLink()}
          />
          <button onClick={setLink} className="text-xs font-bold text-blue-600 hover:bg-blue-50 p-1 rounded whitespace-nowrap">OK</button>
          <button onClick={() => setIsLinkMode(false)} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
      ) : (
        <>
          <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={<Bold size={16} />} label="Bold" />
          <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={<Italic size={16} />} label="Italic" />
          <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon={<Strikethrough size={16} />} label="Underline" />
          <MenuButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} icon={<Strikethrough size={16} />} label="Strike" />
          
          <Separator />
          
          <MenuButton onClick={() => {
            setLinkUrl(editor.getAttributes('link').href || '');
            setIsLinkMode(true);
          }} isActive={editor.isActive('link')} icon={<Link2 size={16} />} label="Link" />

          <div className="relative">
            <MenuButton 
              onClick={() => {
                setShowColorPicker(!showColorPicker);
                setShowHighlightPicker(false);
              }} 
              isActive={false} 
              icon={<Palette size={16} className={editor.getAttributes('textStyle').color ? 'text-blue-500' : ''} />} 
              label="Color"
            />
            
            {showColorPicker && (
              <div className={`absolute top-full left-0 mt-2 border shadow-xl rounded-lg p-2 grid grid-cols-5 gap-1 z-50 w-32 ${
                darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-slate-200'
              }`}>
                {textColors.map(color => (
                  <button
                    key={color}
                    onClick={() => {
                      editor.chain().focus().setColor(color).run();
                      setShowColorPicker(false);
                    }}
                    className="w-5 h-5 rounded-full border border-slate-300 hover:scale-110 transition"
                    style={{ backgroundColor: color }}
                  />
                ))}
                <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }} className="col-span-5 text-xs text-slate-400 hover:text-white mt-1 text-center">Reset</button>
              </div>
            )}
          </div>
          
          <div className="relative">
            <MenuButton 
              onClick={() => {
                setShowHighlightPicker(!showHighlightPicker);
                setShowColorPicker(false);
              }} 
              isActive={editor.isActive('highlight')} 
              icon={<Highlighter size={16} className={editor.isActive('highlight') ? "text-yellow-500" : ""} />} 
              label="Highlight"
            />
            
            {showHighlightPicker && (
              <div className={`absolute top-full left-0 mt-2 border shadow-xl rounded-lg p-2 flex flex-col gap-1 z-50 w-36 ${
                darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-slate-200'
              }`}>
                {highlightColors.map(({ color, label }) => (
                  <button
                    key={color}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color }).run();
                      setShowHighlightPicker(false);
                    }}
                    className={`flex items-center gap-2 px-2 py-1 rounded transition text-left ${
                      darkMode ? 'hover:bg-gray-700' : 'hover:bg-slate-100'
                    }`}
                  >
                    <div className="w-5 h-5 rounded border border-slate-300" style={{ backgroundColor: color }} />
                    <span className={`text-xs ${darkMode ? 'text-gray-300' : 'text-slate-700'}`}>{label}</span>
                  </button>
                ))}
                <button onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false); }} className="text-xs text-slate-400 hover:text-white mt-1 text-center py-1">Remove</button>
              </div>
            )}
          </div>

          <Separator />

          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
            isActive={editor.isActive('heading', { level: 1 })} 
            icon={<Heading1 size={16} />} 
            label="H1"
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
            isActive={editor.isActive('heading', { level: 2 })} 
            icon={<Heading2 size={16} />} 
            label="H2"
          />
          <MenuButton 
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} 
            isActive={editor.isActive('heading', { level: 3 })} 
            icon={<Heading3 size={16} />} 
            label="H3"
          />
        </>
      )}
    </div>
  );
};

const TipTapEditor: React.FC<TipTapEditorProps> = ({
  content,
  onChange,
  onBlur,
  darkMode,
  blockId,
  onSlashCommand
}) => {
  const lowlight = createLowlight(common);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({ lowlight }),
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({
        placeholder: "Type '/' for commands or start writing...",
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: convertMarkdownToHtml(content),
    editorProps: {
      attributes: {
        class: `focus:outline-none p-2 ${darkMode ? 'text-white' : 'text-gray-900'} leading-relaxed min-h-[100px]`,
      },
      handleKeyDown: (view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          if (onBlur) onBlur();
          return true;
        }
        if (event.key === 'Escape') {
          if (onBlur) onBlur();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html);
      
    },
  });

  useEffect(() => {
    if (editor && content) {
      const htmlContent = convertMarkdownToHtml(content);
      const currentContent = editor.getHTML();
      
      if (htmlContent !== currentContent) {
        editor.commands.setContent(htmlContent);
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={`tiptap-wrapper ${darkMode ? 'dark-mode' : ''}`}>
      <BubbleMenu editor={editor} darkMode={darkMode} />
      <EditorContent editor={editor} />
      
      <style jsx global>{`
        .tiptap-wrapper .ProseMirror {
          outline: none;
        }
        .tiptap-wrapper .ProseMirror h1 {
          font-size: 2em;
          font-weight: 700;
          margin: 0.5em 0;
          color: ${darkMode ? '#fff' : '#111'};
        }
        .tiptap-wrapper .ProseMirror h2 {
          font-size: 1.5em;
          font-weight: 600;
          margin: 0.5em 0;
          color: ${darkMode ? '#e5e7eb' : '#333'};
        }
        .tiptap-wrapper .ProseMirror h3 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.5em 0;
          color: ${darkMode ? '#d1d5db' : '#444'};
        }
        .tiptap-wrapper .ProseMirror p {
          margin-bottom: 0.5em;
        }
        .tiptap-wrapper .ProseMirror strong {
          font-weight: 600;
        }
        .tiptap-wrapper .ProseMirror em {
          font-style: italic;
        }
        .tiptap-wrapper .ProseMirror u {
          text-decoration: underline;
        }
        .tiptap-wrapper .ProseMirror code {
          background-color: ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'};
          padding: 0.15em 0.4em;
          border-radius: 0.25rem;
          font-size: 0.9em;
          font-family: monospace;
        }
        .tiptap-wrapper .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          font-family: monospace;
          padding: 0.75rem;
          border-radius: 0.5rem;
          margin: 0.5em 0;
          overflow-x: auto;
        }
        .tiptap-wrapper .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
        }
        .tiptap-wrapper .ProseMirror ul,
        .tiptap-wrapper .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5em 0;
        }
        .tiptap-wrapper .ProseMirror ul {
          list-style-type: disc;
        }
        .tiptap-wrapper .ProseMirror ol {
          list-style-type: decimal;
        }
        .tiptap-wrapper .ProseMirror a {
          color: ${darkMode ? '#60a5fa' : '#2563eb'};
          text-decoration: underline;
        }
        .tiptap-wrapper .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }
        .tiptap-wrapper .ProseMirror td,
        .tiptap-wrapper .ProseMirror th {
          border: 1px solid ${darkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
          padding: 0.4em 0.6em;
        }
        .tiptap-wrapper .ProseMirror th {
          font-weight: 600;
          background-color: ${darkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'};
        }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
        }
        .tiptap-wrapper .ProseMirror ul[data-type="taskList"] li > label {
          margin-right: 0.5rem;
          user-select: none;
        }
        .tiptap-wrapper .ProseMirror mark {
          padding: 0.1em 0.2em;
          border-radius: 0.2em;
        }
        .tiptap-wrapper .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
      `}</style>
    </div>
  );
};

export default TipTapEditor;