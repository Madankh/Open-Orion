import React from 'react';
import { Editor } from '@tiptap/react';
import { 
  Bold, 
  Italic, 
  Strikethrough, 
  Code, 
  Heading1, 
  Heading2, 
  Heading3, 
  List, 
  ListOrdered, 
  Quote, 
  Undo, 
  Redo, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Highlighter,
  Underline as UnderlineIcon,
  Sparkles
} from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
  onAIToggle: () => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ editor, onAIToggle }) => {
  if (!editor) {
    return null;
  }

  const ButtonClass = (isActive: boolean) => 
    `p-2 rounded-md transition-colors duration-200 flex items-center justify-center ${
      isActive 
        ? 'bg-slate-200 text-slate-900' 
        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
    }`;

  const Separator = () => <div className="w-px h-6 bg-slate-200 mx-2" />;

  return (
    <div className="border-b border-slate-200 bg-white p-2 sticky top-0 z-20 flex flex-wrap items-center gap-1 shadow-sm">
      
      {/* History */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className={`${ButtonClass(false)} disabled:opacity-30`}
          title="Undo"
        >
          <Undo size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className={`${ButtonClass(false)} disabled:opacity-30`}
          title="Redo"
        >
          <Redo size={18} />
        </button>
      </div>

      <Separator />

      {/* Basic Formatting */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={ButtonClass(editor.isActive('bold'))}
          title="Bold (Cmd+B)"
        >
          <Bold size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={ButtonClass(editor.isActive('italic'))}
          title="Italic (Cmd+I)"
        >
          <Italic size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={ButtonClass(editor.isActive('underline'))}
          title="Underline (Cmd+U)"
        >
          <UnderlineIcon size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={ButtonClass(editor.isActive('strike'))}
          title="Strikethrough"
        >
          <Strikethrough size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          className={ButtonClass(editor.isActive('code'))}
          title="Code"
        >
          <Code size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={ButtonClass(editor.isActive('highlight'))}
          title="Highlight"
        >
          <Highlighter size={18} />
        </button>
      </div>

      <Separator />

      {/* Headings */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={ButtonClass(editor.isActive('heading', { level: 1 }))}
          title="Heading 1"
        >
          <Heading1 size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={ButtonClass(editor.isActive('heading', { level: 2 }))}
          title="Heading 2"
        >
          <Heading2 size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={ButtonClass(editor.isActive('heading', { level: 3 }))}
          title="Heading 3"
        >
          <Heading3 size={18} />
        </button>
      </div>

      <Separator />

      {/* Lists & Alignment */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={ButtonClass(editor.isActive('bulletList'))}
          title="Bullet List"
        >
          <List size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={ButtonClass(editor.isActive('orderedList'))}
          title="Ordered List"
        >
          <ListOrdered size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={ButtonClass(editor.isActive('blockquote'))}
          title="Blockquote"
        >
          <Quote size={18} />
        </button>
      </div>

      <Separator />

      <div className="flex items-center gap-1 hidden md:flex">
         <button
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          className={ButtonClass(editor.isActive({ textAlign: 'left' }))}
          title="Align Left"
        >
          <AlignLeft size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          className={ButtonClass(editor.isActive({ textAlign: 'center' }))}
          title="Align Center"
        >
          <AlignCenter size={18} />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          className={ButtonClass(editor.isActive({ textAlign: 'right' }))}
          title="Align Right"
        >
          <AlignRight size={18} />
        </button>
         <button
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          className={ButtonClass(editor.isActive({ textAlign: 'justify' }))}
          title="Justify"
        >
          <AlignJustify size={18} />
        </button>
      </div>

      <Separator />

      {/* AI Action */}
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={onAIToggle}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-full text-sm font-medium transition-colors border border-indigo-200"
          title="AI Assistant"
        >
          <Sparkles size={16} />
          <span>AI Assist</span>
        </button>
      </div>

    </div>
  );
};

export default Toolbar;
