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
import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import {
  Bold, Italic, Strikethrough, Highlighter, Heading1, Heading2, Heading3,
  List, CheckSquare, Link2, Palette, Plus, X, Table2, ListOrdered, Code, ChevronRight, Edit3
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css'; 


import { marked } from 'marked';

// Add this utility function at the top (after imports, before components)
const convertMarkdownToHtml = (content: string): string => {
  if (!content) return '<p></p>';
  
  // Check if content is already HTML
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(content);
  if (hasHtmlTags) return content;
  
  // Check if content looks like markdown
  const hasMarkdownSyntax = /[*_#`\[\]]/g.test(content);
  if (!hasMarkdownSyntax) {
    // Plain text - wrap in paragraph
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
// Custom Details/Summary (Toggle) Extension
const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  
  addAttributes() {
    return {
      open: {
        default: false,
        parseHTML: element => element.hasAttribute('open'),
        renderHTML: attributes => {
          if (attributes.open) {
            return { open: true };
          }
          return {};
        },
      },
      summary: {
        default: 'Toggle',
        parseHTML: element => {
          const summary = element.querySelector('summary');
          return summary ? summary.textContent : 'Toggle';
        },
      },
    };
  },
  
  parseHTML() {
    return [{ tag: 'details' }];
  },
  
  renderHTML({ HTMLAttributes, node }) {
    return [
      'details',
      mergeAttributes(HTMLAttributes, { class: 'toggle-block' }),
      ['summary', { class: 'toggle-summary', contenteditable: 'false' }, node.attrs.summary],
      ['div', { class: 'toggle-content' }, 0],
    ];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(ToggleComponent);
  },
});

// React Component for Toggle
const ToggleComponent = ({ node, updateAttributes, editor }: any) => {
  const [isOpen, setIsOpen] = React.useState(node.attrs.open);
  const [summary, setSummary] = React.useState(node.attrs.summary);
  const [isEditingSummary, setIsEditingSummary] = React.useState(false);
  
  const toggleOpen = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    updateAttributes({ open: newState });
  };
  
  const handleSummaryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSummary = e.target.value;
    setSummary(newSummary);
    updateAttributes({ summary: newSummary });
  };
  
  return (
    <NodeViewWrapper className={`toggle-block-wrapper ${isOpen ? 'open' : ''}`}>
      <details open={isOpen} className="toggle-block">
        <summary 
          className="toggle-summary" 
          onClick={(e) => {
            e.preventDefault();
            if (!isEditingSummary) {
              toggleOpen();
            }
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            setIsEditingSummary(true);
          }}
        >
          {isEditingSummary ? (
            <input
              type="text"
              value={summary}
              onChange={handleSummaryChange}
              onBlur={() => setIsEditingSummary(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setIsEditingSummary(false);
                }
              }}
              autoFocus
              className="toggle-summary-input"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            summary
          )}
        </summary>
        {isOpen && (
          <div className="toggle-content">
            <NodeViewContent />
          </div>
        )}
      </details>
    </NodeViewWrapper>
  );
};

const MenuButton = ({ onClick, isActive, icon, label, className = '' }: any) => (
  <button
    onClick={onClick}
    className={`p-1.5 rounded flex items-center gap-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-blue-100 text-blue-600' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
    } ${className}`}
    title={label}
    type="button"
  >
    {icon}
    {label && <span className="text-xs">{label}</span>}
  </button>
);

const Separator = () => <div className="w-[1px] h-4 bg-slate-200 mx-1 self-center" />;

export const NodeContentDisplay: React.FC<{ 
  content: string; 
  bodyTextColorClass: string; 
  onEditClick: () => void 
}> = ({ content, bodyTextColorClass, onEditClick }) => {

  return (
    <div className="relative group markdown-display-container w-full overflow-hidden">
      <div className={`prose prose-sm max-w-none ${bodyTextColorClass} dark:prose-invert`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeHighlight]}
          components={{
            // TABLE WRAPPER (Prevents table from breaking the layout)
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4 rounded-lg border border-border">
                <table className="m-0" {...props} />
              </div>
            ),
            // MARK / HIGHLIGHT
            mark: ({ node, ...props }: any) => (
              <mark 
                style={{ backgroundColor: props['data-color'] || '#fef08a' }} 
                className="px-1 rounded text-inherit"
                {...props} 
              />
            ),
            // DETAILS / TOGGLE
            details: ({ node, ...props }: any) => (
              <details className="border-l-4 border-slate-200 pl-4 my-4" {...props} />
            ),
            // TASK LISTS
            ul: ({ node, ...props }: any) => {
              if (props['data-type'] === 'taskList') {
                return <ul className="list-none p-0 my-4 space-y-2" {...props} />;
              }
              return <ul {...props} />;
            },
            li: ({ node, ...props }: any) => {
              // Handle Tiptap task item styling
              if (node.children?.[0]?.type === 'element' && node.children[0].tagName === 'input') {
                return <li className="flex items-start gap-2" {...props} />;
              }
              return <li {...props} />;
            }
          }}
        >
          {content?.length > 4000 ? content?.slice(0, 5000) + '.... ' : content}

        </ReactMarkdown>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onEditClick();
        }}
        className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-full bg-white shadow-sm border border-slate-200 z-10 hover:bg-slate-50"
      >
        <Edit3 size={12} className="text-slate-500" />
      </button>
    </div>
  );
};

interface EditorSidebarProps {
  nodeId: string;
  content: string;
  onContentChange: (content: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  nodeId,
  content,
  onContentChange,
  isOpen,
  onClose
}) => {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  
  const lowlight = createLowlight(common);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false,
      }),
      CodeBlockLowlight.configure({
        lowlight,
      }),
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
      Details,
    ],
    content: convertMarkdownToHtml(content),
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-6 py-8 text-slate-900 leading-relaxed min-h-[calc(100vh-200px)]',
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onContentChange(html);
      checkForSlashCommand(editor);
    },
  });

  const slashCommands = [
    { 
      label: 'Heading 1', 
      icon: <Heading1 size={16} />, 
      description: 'Large section heading',
      action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() 
    },
    { 
      label: 'Heading 2', 
      icon: <Heading2 size={16} />, 
      description: 'Medium section heading',
      action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() 
    },
    { 
      label: 'Heading 3', 
      icon: <Heading3 size={16} />, 
      description: 'Small section heading',
      action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() 
    },
    { 
      label: 'Bullet List', 
      icon: <List size={16} />, 
      description: 'Create a simple bullet list',
      action: () => editor?.chain().focus().toggleBulletList().run() 
    },
    { 
      label: 'Numbered List', 
      icon: <ListOrdered size={16} />, 
      description: 'Create a numbered list',
      action: () => editor?.chain().focus().toggleOrderedList().run() 
    },
    { 
      label: 'Task List', 
      icon: <CheckSquare size={16} />, 
      description: 'Track tasks with a checklist',
      action: () => editor?.chain().focus().toggleTaskList().run() 
    },
    { 
      label: 'Code Block', 
      icon: <Code size={16} />, 
      description: 'Insert a code block with syntax highlighting',
      action: () => editor?.chain().focus().toggleCodeBlock().run() 
    },
    { 
      label: 'Toggle List', 
      icon: <ChevronRight size={16} />, 
      description: 'Create a collapsible toggle section',
      action: () => {
        editor?.chain().focus().insertContent({
          type: 'details',
          attrs: { summary: 'Toggle heading', open: true },
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Add your content here...' }],
            },
          ],
        }).run();
      }
    },
    { 
      label: 'Table', 
      icon: <Table2 size={16} />, 
      description: 'Insert a 3x3 table',
      action: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() 
    },
  ];

  const checkForSlashCommand = (editor: any) => {
    if (!editor) return;

    const { selection, doc } = editor.state;
    const { $anchor } = selection;
    const textBefore = $anchor.parent.textContent.slice(0, $anchor.parentOffset);
    
    if (textBefore.endsWith('/')) {
      const coords = editor.view.coordsAtPos($anchor.pos);
      
      setSlashMenuPosition({
        top: coords.top + 25,
        left: coords.left
      });
      setShowSlashMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  const executeSlashCommand = (index: number) => {
    if (!editor) return;
    
    const { selection } = editor.state;
    const { $anchor } = selection;
    const from = $anchor.pos - 1;
    const to = $anchor.pos;
    
    editor.chain().deleteRange({ from, to }).run();
    slashCommands[index].action();
    setShowSlashMenu(false);
  };


  useEffect(() => {
    if (!showSlashMenu || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % slashCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + slashCommands.length) % slashCommands.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeSlashCommand(selectedCommandIndex);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        const { selection } = editor.state;
        const { $anchor } = selection;
        const from = $anchor.pos - 1;
        const to = $anchor.pos;
        editor.chain().focus().deleteRange({ from, to }).run();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSlashMenu, selectedCommandIndex, editor]);

  useEffect(() => {
    if (editor && isOpen && content) {
      const htmlContent = convertMarkdownToHtml(content);
      const currentContent = editor.getHTML();
      
      // Only update if content has changed
      if (htmlContent !== currentContent) {
        editor.commands.setContent(htmlContent);
      }
    }
  }, [content, editor, isOpen]);

  if (!isOpen || !editor) return null;

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className="fixed right-0 top-0 bottom-0 w-[700px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Edit Content</h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        {/* Editor Content with Bubble & Floating Menus */}
        <div className="flex-1 overflow-y-auto relative">
          <CustomBubbleMenu editor={editor} />
          <CustomFloatingMenu editor={editor} />
          <EditorContent editor={editor} />
        </div>

        {/* Slash Command Menu */}
        {showSlashMenu && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-slate-200 py-2 w-72"
            style={{
              top: `${slashMenuPosition.top}px`,
              left: `${slashMenuPosition.left}px`,
            }}
          >
            <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Basic Blocks
            </div>
            {slashCommands.map((cmd, index) => (
              <button
                key={index}
                onClick={() => executeSlashCommand(index)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors ${
                  index === selectedCommandIndex 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className={`mt-0.5 ${index === selectedCommandIndex ? 'text-blue-600' : 'text-slate-400'}`}>
                  {cmd.icon}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{cmd.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{cmd.description}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <style jsx global>{`
        .ProseMirror h1 {
          font-size: 2.25em;
          font-weight: 800;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          line-height: 1.1;
          color: #111;
        }
        .ProseMirror h2 {
          font-size: 1.75em;
          font-weight: 700;
          margin-top: 1.3em;
          margin-bottom: 0.5em;
          line-height: 1.2;
          color: #333;
        }
        .ProseMirror h3 {
          font-size: 1.5em;
          font-weight: 600;
          margin-top: 1em;
          margin-bottom: 0.5em;
          color: #444;
        }
        .ProseMirror p {
          margin-bottom: 1em;
          font-size: 1rem;
        }
        .ProseMirror mark {
          padding: 0.1em 0.2em;
          border-radius: 0.2em;
          color: inherit;
        }
        .ProseMirror mark[data-color="#fef08a"] {
          background-color: #fef08a;
        }
        .ProseMirror mark[data-color="#fecaca"] {
          background-color: #fecaca;
        }
        .ProseMirror mark[data-color="#bfdbfe"] {
          background-color: #bfdbfe;
        }
        .ProseMirror mark[data-color="#bbf7d0"] {
          background-color: #bbf7d0;
        }
        .ProseMirror mark[data-color="#e9d5ff"] {
          background-color: #e9d5ff;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
          margin-bottom: 1em;
        }
        .ProseMirror ul {
          list-style-type: disc;
        }
        .ProseMirror ol {
          list-style-type: decimal;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #adb5bd;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1em 0;
          overflow: hidden;
        }
        .ProseMirror td, .ProseMirror th {
          min-width: 1em;
          border: 1px solid #ced4da;
          padding: 6px 8px;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .ProseMirror th {
          font-weight: bold;
          text-align: left;
          background-color: #f1f3f5;
        }
        .ProseMirror .selectedCell:after {
          z-index: 2;
          position: absolute;
          content: "";
          left: 0; right: 0; top: 0; bottom: 0;
          background: rgba(200, 200, 255, 0.4);
          pointer-events: none;
        }
        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          margin-bottom: 0.5rem;
        }
        ul[data-type="taskList"] li > label {
          margin-right: 0.5rem;
          margin-top: 0.1rem;
          user-select: none;
          cursor: pointer;
        }
        ul[data-type="taskList"] li > div {
          flex: 1;
        }
        .ProseMirror a {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
        .ProseMirror u {
          text-decoration: underline;
        }
        .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          font-family: 'JetBrainsMono', 'Courier New', monospace;
          padding: 1rem;
          border-radius: 0.5rem;
          margin: 1rem 0;
          overflow-x: auto;
        }
        .ProseMirror pre code {
          color: inherit;
          padding: 0;
          background: none;
          font-size: 0.9rem;
          line-height: 1.5;
        }
        .ProseMirror code {
          background-color: #f1f5f9;
          color: #e11d48;
          padding: 0.15rem 0.3rem;
          border-radius: 0.25rem;
          font-size: 0.9em;
          font-family: 'Courier New', monospace;
        }
        
        .toggle-block-wrapper {
          margin: 0.5rem 0;
        }
        
        .ProseMirror details.toggle-block {
          border-left: 3px solid #e2e8f0;
          padding-left: 1rem;
          transition: all 0.2s ease;
        }
        
        .ProseMirror details.toggle-block:hover {
          border-left-color: #94a3b8;
        }
        
        .toggle-block-wrapper.open .ProseMirror details.toggle-block {
          border-left-color: #3b82f6;
        }
        
        .ProseMirror summary.toggle-summary {
          cursor: pointer;
          font-weight: 600;
          color: #1e293b;
          padding: 0.5rem 0;
          list-style: none;
          display: flex;
          align-items: center;
          user-select: none;
          transition: color 0.2s ease;
          outline: none;
        }
        
        .ProseMirror summary.toggle-summary::-webkit-details-marker {
          display: none;
        }
        
        .ProseMirror summary.toggle-summary::before {
          content: '▶';
          display: inline-block;
          margin-right: 0.5rem;
          transition: transform 0.2s ease;
          color: #64748b;
          font-size: 0.75rem;
        }
        
        .toggle-block-wrapper.open .ProseMirror summary.toggle-summary::before {
          transform: rotate(90deg);
        }
        
        .ProseMirror summary.toggle-summary:hover {
          color: #3b82f6;
        }
        
        .toggle-summary-input {
          background: transparent;
          border: none;
          outline: none;
          font-weight: 600;
          color: #1e293b;
          font-size: inherit;
          font-family: inherit;
          padding: 0;
          margin: 0;
          width: 100%;
        }
        
        .ProseMirror .toggle-content {
          padding: 0.5rem 0 0.5rem 0.5rem;
          color: #475569;
        }
        
        .ProseMirror .toggle-content p:last-child {
          margin-bottom: 0;
        }
        
        .ProseMirror .toggle-content .ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
          outline-offset: 2px;
        }

        .node-display-content .ProseMirror {
          outline: none;
        }
        
        .node-display-content .ProseMirror p {
          margin-bottom: 0.5em;
          line-height: 1.6;
        }
        
        .node-display-content .ProseMirror p:last-child {
          margin-bottom: 0;
        }
        
        .node-display-content .ProseMirror h1 {
          font-size: 1.5em;
          font-weight: 700;
          margin: 0.5em 0;
        }
        
        .node-display-content .ProseMirror h2 {
          font-size: 1.3em;
          font-weight: 600;
          margin: 0.5em 0;
        }
        
        .node-display-content .ProseMirror h3 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0.5em 0;
        }
        
        .node-display-content .ProseMirror strong {
          font-weight: 600;
        }
        
        .node-display-content .ProseMirror em {
          font-style: italic;
        }
        
        .node-display-content .ProseMirror u {
          text-decoration: underline;
        }
        
        .node-display-content .ProseMirror mark {
          padding: 0.1em 0.2em;
          border-radius: 0.2em;
        }
        
        .node-display-content .ProseMirror code {
          background-color: rgba(0, 0, 0, 0.08);
          padding: 0.15em 0.4em;
          border-radius: 0.25rem;
          font-size: 0.9em;
          font-family: monospace;
        }
        
        .node-display-content .ProseMirror ul,
        .node-display-content .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5em 0;
        }
        
        .node-display-content .ProseMirror ul {
          list-style-type: disc;
        }
        
        .node-display-content .ProseMirror ol {
          list-style-type: decimal;
        }
        
        .node-display-content .ProseMirror li {
          margin: 0.2em 0;
        }
        
        .node-display-content .ProseMirror a {
          color: inherit;
          text-decoration: underline;
        }
        
        .node-display-content .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 0.5em 0;
        }
        
        .node-display-content .ProseMirror td,
        .node-display-content .ProseMirror th {
          border: 1px solid rgba(0, 0, 0, 0.1);
          padding: 0.4em 0.6em;
        }
        
        .node-display-content .ProseMirror th {
          font-weight: 600;
          background-color: rgba(0, 0, 0, 0.03);
        }
        
        .node-display-content ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0;
        }
        
        .node-display-content ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
        }
        
        .node-display-content ul[data-type="taskList"] li > label {
          margin-right: 0.5rem;
          user-select: none;
        }
        
        .node-display-content .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          font-family: monospace;
          padding: 0.75rem;
          border-radius: 0.5rem;
          margin: 0.5em 0;
          overflow-x: auto;
        }
        
        .node-display-content .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
        }
      `}</style>
    </>
  );
};

// Bubble Menu Component
const CustomBubbleMenu = ({ editor }: { editor: any }) => {
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
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 p-1 flex items-center gap-0.5"
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
            className="bg-slate-100 text-sm border-none rounded px-2 py-1 flex-1 min-w-0 focus:ring-2 focus:ring-blue-500 outline-none text-black"
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
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg p-2 grid grid-cols-5 gap-1 z-50 w-32">
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
                <button onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }} className="col-span-5 text-xs text-slate-400 hover:text-black mt-1 text-center">Reset</button>
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
              <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-lg p-2 flex flex-col gap-1 z-50 w-36">
                {highlightColors.map(({ color, label }) => (
                  <button
                    key={color}
                    onClick={() => {
                      editor.chain().focus().toggleHighlight({ color }).run();
                      setShowHighlightPicker(false);
                    }}
                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 transition text-left"
                  >
                    <div className="w-5 h-5 rounded border border-slate-300" style={{ backgroundColor: color }} />
                    <span className="text-xs text-slate-700">{label}</span>
                  </button>
                ))}
                <button onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false); }} className="text-xs text-slate-400 hover:text-black mt-1 text-center py-1">Remove</button>
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

// Floating Menu Component
const CustomFloatingMenu = ({ editor }: { editor: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      const { selection } = editor.state;
      const { $anchor, empty } = selection;
      
      const isRootDepth = $anchor.depth === 1;
      const isEmptyBlock = $anchor.parent.content.size === 0;

      if (empty && isRootDepth && isEmptyBlock) {
        const coords = editor.view.coordsAtPos($anchor.pos);
        
        const editorElement = document.querySelector('.ProseMirror');
        if (editorElement) {
          const editorRect = editorElement.getBoundingClientRect();
          
          setPosition({
            top: coords.top - editorRect.top,
            left: 10
          });
          setIsOpen(true);
          return;
        }
      }
      setIsOpen(false);
    };

    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('focus', update);

    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('focus', update);
    };
  }, [editor]);

  if (!isOpen) return null;

  return (
    <div 
      ref={containerRef}
      className="absolute z-40 flex items-center gap-1"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <MenuButton
        onClick={() => {}}
        icon={<Plus size={20} className="text-slate-300 hover:text-slate-600 transition-colors" />}
      />
      <div className="flex items-center bg-white border border-slate-200 shadow-sm rounded-md p-1 gap-1 ml-1">
        <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} icon={<Heading1 size={16} />} label="H1" />
        <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} icon={<Heading2 size={16} />} label="H2" />
        <MenuButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} icon={<Heading3 size={16} />} label="H3" />
        <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} icon={<List size={16} />} label="List" />
        <MenuButton onClick={() => editor.chain().focus().toggleTaskList().run()} icon={<CheckSquare size={16} />} label="Task" />
        <MenuButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} icon={<Code size={16} />} label="Code" />
        <MenuButton 
          onClick={() => {
            editor.chain().focus().insertContent({
              type: 'details',
              attrs: { summary: 'Toggle', open: true },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Content here...' }],
                },
              ],
            }).run();
          }} 
          icon={<ChevronRight size={16} />} 
          label="Toggle" 
        />
        <MenuButton onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} icon={<Table2 size={16} />} label="Table" />
      </div>
    </div>
  );
};