import React, { useEffect, useLayoutEffect, useMemo, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
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
import { TextSelection } from '@tiptap/pm/state';
import {
  Bold, Italic, Strikethrough, Underline as UnderlineIcon, Highlighter, Heading1, Heading2, Heading3,
  List, CheckSquare, Link2, Palette, X, Table2, ListOrdered, Code, ChevronRight,
  Edit3, Paintbrush, Upload, Loader2, Calculator,
} from 'lucide-react';
import type { WhiteboardBlock } from '@/typings/agent';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

import { marked } from 'marked';
import TableControls from './TableControls';
import MathPracticePanel from './MathPracticePanel';
import { normalizeMarkdownContent } from '@/utils/markdown-content';

const WhiteboardCanvas = dynamic(() => import('../../Whiteboard'), {
  ssr: false,
  loading: () => <div className="flex min-h-[24rem] items-center justify-center text-sm text-slate-400">Loading whiteboard...</div>,
});

// Created once instead of on every render.
const lowlight = createLowlight(common);

/* -------------------------------------------------------------------------- */
/*  Markdown / math helpers                                                    */
/* -------------------------------------------------------------------------- */

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');
const decodeHtml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');

const renderTex = (latex: string, display = false): string => {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: display, output: 'html' });
  } catch {
    return escapeHtml(latex);
  }
};

type MathItem = { tex: string; display: boolean };

const DISPLAY_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
// Accept the whitespace commonly inserted by PDF extraction, but don't treat currency as math.
const INLINE_MATH_RE = /(^|[^\\$])\$[ \t]*([^$\n]+?)[ \t]*\$(?!\d)/g;

const stashMath = (segment: string, store: MathItem[]): string => {
  const put = (tex: string, display: boolean) => {
    store.push({ tex: tex.trim(), display });
    return `zzmath${store.length - 1}zz`;
  };
  return segment
    .replace(DISPLAY_MATH_RE, (_m, tex) => put(tex, true))
    .replace(INLINE_MATH_RE, (match, pre, tex) => {
      const expression = String(tex).trim();
      const looksLikeMath = /^[A-Za-z]$/.test(expression) ||
        /^[A-Za-z][A-Za-z0-9]*(?:[_^][A-Za-z0-9{}]+)$/.test(expression) ||
        /[\\_^{}=<>+\-*/()[\]]/.test(expression);
      return looksLikeMath ? pre + put(expression, false) : match;
    });
};

const mathSpan = (latex: string, display: boolean) =>
  `<span data-type="inline-math" data-latex="${escapeAttr(latex)}"${display ? ' data-display="true"' : ''}>$${escapeHtml(latex)}$</span>`;

const HTML_TAG_RE =
  /<\/?(?:p|div|span|br|hr|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|pre|code|blockquote|details|summary|img|a|strong|em|b|i|u|s|mark|label|input)\b[^>]*>/i;

// Wraps $...$ found in the *text* parts of an HTML string into math spans.
// Skips <pre>/<code> and spans that are already math nodes, so it is safe to run repeatedly.
const injectMathIntoHtml = (html: string): string => {
  if (!html.includes('$')) return html;
  let codeDepth = 0;
  let inMathSpan = false;

  return html
    .split(/(<[^>]+>)/g)
    .map(part => {
      if (part.startsWith('<')) {
        if (/^<(pre|code)\b/i.test(part)) codeDepth += 1;
        else if (/^<\/(pre|code)\b/i.test(part)) codeDepth = Math.max(0, codeDepth - 1);
        else if (/^<span\b[^>]*data-type="inline-math"/i.test(part)) inMathSpan = true;
        else if (inMathSpan && /^<\/span>/i.test(part)) inMathSpan = false;
        return part;
      }
      if (codeDepth > 0 || inMathSpan || !part.includes('$')) return part;

      const store: MathItem[] = [];
      const stashed = stashMath(part, store);
      if (!store.length) return part;
      return stashed.replace(/zzmath(\d+)zz/g, (_m, i) => {
        const item = store[Number(i)];
        return mathSpan(decodeHtml(item.tex), item.display);
      });
    })
    .join('');
};

const convertMarkdownToHtml = (content: string): string => {
  if (!content) return '<p></p>';

  // Preserve HTML-only content, but still parse Markdown when HTML embeds (such
  // as PDF figure <img> tags) are mixed with headings, lists, or emphasis.
  if (HTML_TAG_RE.test(content) && !looksLikeMarkdown(content)) return injectMathIntoHtml(content);

  try {
    content = normalizeMarkdownContent(content);
    // 1. Pull math out first so marked never sees the _ * \ characters inside LaTeX.
    const store: MathItem[] = [];
    const parts = content.split(/(```[\s\S]*?```|`[^`\n]*`)/g); // odd indexes = code, left untouched
    const withPlaceholders = parts.map((part, i) => (i % 2 === 1 ? part : stashMath(part, store))).join('');

    // 2. Markdown -> HTML
    const html = marked.parse(withPlaceholders, { async: false, gfm: true, breaks: true }) as string;

    // 3. Put the math back as real math nodes
    return html.replace(/zzmath(\d+)zz/g, (_m, i) => {
      const item = store[Number(i)];
      return mathSpan(item.tex, item.display);
    });
  } catch (error) {
    console.error('Error converting markdown to HTML:', error);
    return content
      .split(/\n{2,}/)
      .map(p => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }
};

const looksLikeMarkdown = (text: string) =>
  /(^|\s)#{1,6}\s+\S|\*\*[^*]+\*\*|\$[^$\n]+\$|^\s*[-*+]\s+\S|^\s*\d+\.\s+\S|`[^`]+`|^\s*>\s/m.test(text) ||
  (/^\s*\|.*\|\s*$/m.test(text) && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(text));

/* -------------------------------------------------------------------------- */
/*  Tiptap nodes                                                               */
/* -------------------------------------------------------------------------- */

const EditorImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      s3Key: {
        default: null,
        parseHTML: element => element.getAttribute('data-s3-key'),
        renderHTML: attributes => attributes.s3Key ? { 'data-s3-key': attributes.s3Key } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, {
      class: 'my-4 h-auto max-w-full rounded-lg',
    })];
  },
});

// Inline LaTeX node: stored as <span data-type="inline-math" data-latex="...">$...$</span>
const MathComponent = ({ node, updateAttributes }: any) => {
  const html = useMemo(
    () => renderTex(node.attrs.latex || '', Boolean(node.attrs.display)),
    [node.attrs.latex, node.attrs.display],
  );

  return (
    <NodeViewWrapper
      as="span"
      className={`inline-math${node.attrs.display ? ' inline-math-display' : ''}`}
      contentEditable={false}
      title="Double-click to edit LaTeX"
      onDoubleClick={() => {
        const next = window.prompt('Edit LaTeX', node.attrs.latex || '');
        if (next !== null && next.trim()) updateAttributes({ latex: next.trim() });
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: element => element.getAttribute('data-latex') || '',
        renderHTML: attributes => ({ 'data-latex': attributes.latex }),
      },
      display: {
        default: false,
        parseHTML: element => element.getAttribute('data-display') === 'true',
        renderHTML: attributes => (attributes.display ? { 'data-display': 'true' } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="inline-math"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math', class: 'inline-math' }), `$${HTMLAttributes['data-latex'] ?? ''}$`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathComponent);
  },
});

// Custom Details/Summary (Toggle) Extension
const Details = Node.create({
  name: 'details',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,
  selectable: false,

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
    return [{
      tag: 'details',
      contentElement: element => element.querySelector('.toggle-content') || element,
    }];
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

  useEffect(() => {
    setIsOpen(node.attrs.open);
    setSummary(node.attrs.summary);
  }, [node.attrs.open, node.attrs.summary]);

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
      <div className="toggle-block">
        <div className="toggle-summary">
          <button
            type="button"
            className="toggle-chevron"
            aria-label={isOpen ? 'Collapse toggle' : 'Expand toggle'}
            aria-expanded={isOpen}
            onMouseDown={event => event.preventDefault()}
            onClick={toggleOpen}
          >
            <ChevronRight size={16} strokeWidth={2.25} />
          </button>
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
              onMouseDown={event => event.stopPropagation()}
            />
          ) : (
            <span
              className="toggle-summary-text"
              onDoubleClick={event => {
                event.preventDefault();
                setIsEditingSummary(true);
              }}
              title="Double-click to rename"
            >
              {summary || 'Toggle'}
            </span>
          )}
        </div>
        <NodeViewContent
          as="div"
          className={`toggle-content ${isOpen ? 'expanded' : 'collapsed'}`}
          aria-hidden={!isOpen}
        />
      </div>
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

export interface NoteLinkTarget {
  id: string;
  title: string;
  content?: string;
}

const NoteLink = Node.create({
  name: 'noteLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      targetId: { default: null, parseHTML: element => element.getAttribute('data-note-link-id') },
      label: { default: '', parseHTML: element => element.getAttribute('data-note-link-label') || element.textContent || '' },
      displayText: { default: null, parseHTML: element => element.getAttribute('data-note-link-text') },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-note-link-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    const { targetId, label: nodeLabel, displayText, ...attributes } = HTMLAttributes;
    const label = nodeLabel || 'Untitled';
    return ['span', mergeAttributes(attributes, {
      'data-note-link-id': targetId,
      'data-note-link-label': label,
      ...(displayText ? { 'data-note-link-text': displayText } : {}),
      class: 'roam-note-link',
    }), displayText || `[[${label}]]`];
  },
});

const getLinkedTargetIds = (content: string) => Array.from(new Set(
  Array.from(content.matchAll(/data-note-link-id="([^"]+)"/g), match => match[1])
));

/* -------------------------------------------------------------------------- */
/*  Read-only display                                                          */
/* -------------------------------------------------------------------------- */

export const NodeContentDisplay: React.FC<{
  content: string;
  bodyTextColorClass: string;
  onEditClick: () => void;
  onOpenLink?: (targetId: string) => void;
  truncateContent?: boolean;
  scrollableContent?: boolean;
}> = ({ content, bodyTextColorClass, onEditClick, onOpenLink, truncateContent = true, scrollableContent = false }) => {

  const displayContent = useMemo(() => {
    const text = truncateContent && content?.length > 4000 ? content.slice(0, 5000) + '.... ' : (content || '');
    // HTML content: turn leftover $...$ into math spans. Raw markdown: remark-math handles it.
    return HTML_TAG_RE.test(text) ? injectMathIntoHtml(text) : normalizeMarkdownContent(text);
  }, [content, truncateContent]);

  return (
    <div className={`relative group markdown-display-container w-full ${scrollableContent ? 'h-full min-h-0 overflow-y-auto overscroll-contain pr-2' : 'overflow-hidden'}`}>
      <div className={`prose prose-sm max-w-none ${scrollableContent ? 'min-h-full' : ''} ${bodyTextColorClass} dark:prose-invert`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeRaw, rehypeKatex, rehypeHighlight]}
          components={{
            span: ({ node, ...props }: any) => {
              // Math node saved by the editor
              if (props['data-type'] === 'inline-math') {
                return (
                  <span
                    className="inline-math"
                    dangerouslySetInnerHTML={{
                      __html: renderTex(props['data-latex'] || '', props['data-display'] === 'true'),
                    }}
                  />
                );
              }

              const targetId = props['data-note-link-id'];
              if (!targetId) return <span {...props} />;
              return <span
                {...props}
                role="link"
                tabIndex={0}
                onMouseDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  onOpenLink?.(targetId);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenLink?.(targetId);
                  }
                }}
              />;
            },
            // TABLE WRAPPER (Prevents table from breaking the layout)
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-4 rounded-lg border border-border">
                <table className="m-0 min-w-max border-collapse text-xs" {...props} />
              </div>
            ),
            th: ({ node, ...props }) => <th className="border border-slate-200 bg-slate-50 px-2 py-1.5 text-left font-semibold dark:border-slate-700 dark:bg-slate-800" {...props} />,
            td: ({ node, ...props }) => <td className="border border-slate-200 px-2 py-1.5 align-top dark:border-slate-700" {...props} />,
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
          {displayContent}
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

/* -------------------------------------------------------------------------- */
/*  Editor sidebar                                                             */
/* -------------------------------------------------------------------------- */

interface EditorSidebarProps {
  nodeId: string;
  title?: string;
  content: string;
  onContentChange: (content: string) => void;
  onUploadImage: (file: File) => Promise<{ url: string; s3Key: string } | null>;
  isOpen: boolean;
  onClose: () => void;
  linkTargets?: NoteLinkTarget[];
  onOpenLink?: (targetId: string) => void;
  onExploreInDepth?: () => void;
  dockOffsetPx?: number;
  widthPx?: number;
  accessToken?: string;
  model?: string;
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({
  nodeId,
  title,
  content,
  onContentChange,
  onUploadImage,
  isOpen,
  onClose,
  linkTargets = [],
  onOpenLink,
  onExploreInDepth,
  dockOffsetPx = 0,
  widthPx = 700,
  accessToken,
  model,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showLinkMenu, setShowLinkMenu] = useState(false);
  const [linkMenuPosition, setLinkMenuPosition] = useState({ top: 0, left: 0 });
  const [linkQuery, setLinkQuery] = useState('');
  const [selectedLinkIndex, setSelectedLinkIndex] = useState(0);
  const [showMathPractice, setShowMathPractice] = useState(false);
  const linkTriggerRef = useRef<{ from: number; to: number } | null>(null);
  const lastEditorHtmlRef = useRef<string | null>(null);

  // editorProps are captured once by useEditor, so anything they call must go through a ref
  const editorRef = useRef<any>(null);
  const onOpenLinkRef = useRef(onOpenLink);
  onOpenLinkRef.current = onOpenLink;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        link: false,
        underline: false,
      }),
      NoteLink,
      InlineMath,
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
      EditorImage,
    ],
    content: convertMarkdownToHtml(content),
    editorProps: {
      attributes: {
        class: 'focus:outline-none px-6 py-8 text-slate-900 leading-relaxed min-h-[calc(100vh-200px)]',
      },
      // Plain-text paste (what PDF viewers give you) is not parsed as markdown by Tiptap,
      // so "###", "**bold**" and "$x$" would stay literal. Convert it ourselves.
      handlePaste: (view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;

        const text = clipboard.getData('text/plain');
        const html = clipboard.getData('text/html');
        if (!text || html) return false; // real rich text: let Tiptap handle it
        if (view.state.selection.$from.parent.type.name === 'codeBlock') return false;
        const normalizedText = normalizeMarkdownContent(text);
        if (!looksLikeMarkdown(normalizedText)) return false;

        event.preventDefault();
        editorRef.current?.chain().focus().insertContent(convertMarkdownToHtml(normalizedText)).run();
        return true;
      },
      handleKeyDown: (view, event) => {
        if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') return false;

        const { state } = view;
        const { $from } = state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name !== 'details') continue;
          const from = $from.start(depth);
          const to = $from.end(depth);
          if (from >= to) return false;

          view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, from, to)).scrollIntoView());
          event.preventDefault();
          return true;
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-note-link-id]');
        const targetId = target?.getAttribute('data-note-link-id');
        if (!targetId) return false;
        event.preventDefault();
        onOpenLinkRef.current?.(targetId);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      lastEditorHtmlRef.current = html;
      onContentChange(html);
      checkForSlashCommand(editor);
      checkForNoteLink(editor);
    },
  });

  editorRef.current = editor;

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
      action: () => editor?.chain().focus().insertContent({
          type: 'details',
          attrs: { summary: 'Toggle heading', open: true },
          content: [{ type: 'paragraph' }],
        }).run()
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

    const { selection } = editor.state;
    const { $anchor } = selection;
    const textBefore = $anchor.parent.textContent.slice(0, $anchor.parentOffset);

    if (textBefore.endsWith('/')) {
      const coords = editor.view.coordsAtPos($anchor.pos);
      const viewportPadding = 12;
      const menuHeight = Math.max(0, Math.min(480, window.innerHeight - viewportPadding * 2));
      const belowTop = coords.bottom + 8;
      const top = belowTop + menuHeight <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, coords.top - menuHeight - 8);
      const left = Math.max(viewportPadding, Math.min(coords.left, window.innerWidth - 288 - viewportPadding));

      setSlashMenuPosition({
        top,
        left,
      });
      setShowSlashMenu(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  };

  const checkForNoteLink = (editor: any) => {
    const { selection } = editor.state;
    const { $anchor } = selection;
    const textBefore = $anchor.parent.textContent.slice(0, $anchor.parentOffset);
    const match = textBefore.match(/\[\[([^\[\]]*)$/);
    if (!match) {
      setShowLinkMenu(false);
      linkTriggerRef.current = null;
      return;
    }

    const query = match[1];
    linkTriggerRef.current = { from: $anchor.pos - query.length - 2, to: $anchor.pos };
    const coords = editor.view.coordsAtPos($anchor.pos);
    setLinkMenuPosition({ top: coords.bottom + 8, left: coords.left });
    setLinkQuery(query);
    setSelectedLinkIndex(0);
    setShowSlashMenu(false);
    setShowLinkMenu(true);
  };

  const matchingLinkTargets = useMemo(() => linkTargets
    .filter(target => target.id !== nodeId && target.title.toLowerCase().includes(linkQuery.trim().toLowerCase()))
    .slice(0, 8), [linkTargets, linkQuery, nodeId]);

  const backlinkTargets = useMemo(() => linkTargets.filter(target => target.id !== nodeId), [linkTargets, nodeId]);

  const linkedTargets = useMemo(() => getLinkedTargetIds(editor?.getHTML() || content)
    .map(id => linkTargets.find(target => target.id === id))
    .filter((target): target is NoteLinkTarget => Boolean(target)), [editor, content, linkTargets]);

  const backlinks = useMemo(() => linkTargets
    .filter(target => target.id !== nodeId && getLinkedTargetIds(target.content || '').includes(nodeId)),
  [linkTargets, nodeId]);

  const insertNoteLink = (target: NoteLinkTarget) => {
    const range = linkTriggerRef.current;
    if (!editor || !range) return;
    editor.chain().focus().deleteRange(range).insertContent({
      type: 'noteLink',
      attrs: { targetId: target.id, label: target.title || 'Untitled', displayText: null },
    }).insertContent(' ').run();
    linkTriggerRef.current = null;
    setShowLinkMenu(false);
  };

  const insertSelectedTextLink = (target: NoteLinkTarget, range: { from: number; to: number }) => {
    if (!editor) return;
    const displayText = editor.state.doc.textBetween(range.from, range.to, ' ').trim();
    if (!displayText) return;
    editor.chain().focus().deleteRange(range).insertContent({
      type: 'noteLink',
      attrs: { targetId: target.id, label: target.title || 'Untitled', displayText },
    }).run();
    setShowLinkMenu(false);
  };

  const executeSlashCommand = (index: number) => {
    if (!editor) return;

    const { selection } = editor.state;
    const { $anchor } = selection;
    const from = $anchor.pos - 1;
    const to = $anchor.pos;
    if (from < 0 || editor.state.doc.textBetween(from, to) !== '/') {
      setShowSlashMenu(false);
      return;
    }

    editor.chain().deleteRange({ from, to }).run();
    slashCommands[index].action();
    setShowSlashMenu(false);
  };

  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !editor) return;
    if (!file.type.startsWith('image/')) return;

    setIsUploadingImage(true);
    try {
      const uploadedImage = await onUploadImage(file);
      if (!uploadedImage) return;

      editor.chain().focus().insertContent({
        type: 'image',
        attrs: { src: uploadedImage.url, alt: file.name, title: file.name, s3Key: uploadedImage.s3Key },
      }).run();
    } finally {
      setIsUploadingImage(false);
    }
  };

  useEffect(() => {
    if ((!showSlashMenu && !showLinkMenu) || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (showLinkMenu) {
        if (e.key === 'ArrowDown' && matchingLinkTargets.length) {
          e.preventDefault();
          setSelectedLinkIndex(index => (index + 1) % matchingLinkTargets.length);
        } else if (e.key === 'ArrowUp' && matchingLinkTargets.length) {
          e.preventDefault();
          setSelectedLinkIndex(index => (index - 1 + matchingLinkTargets.length) % matchingLinkTargets.length);
        } else if (e.key === 'Enter' && matchingLinkTargets[selectedLinkIndex]) {
          e.preventDefault();
          insertNoteLink(matchingLinkTargets[selectedLinkIndex]);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setShowLinkMenu(false);
          linkTriggerRef.current = null;
        }
        return;
      }

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
        if (from >= 0 && editor.state.doc.textBetween(from, to) === '/') {
          editor.chain().focus().deleteRange({ from, to }).run();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showSlashMenu, showLinkMenu, selectedCommandIndex, selectedLinkIndex, matchingLinkTargets, editor]);

  useEffect(() => {
    if (editor && isOpen) {
      const htmlContent = convertMarkdownToHtml(content);
      const currentContent = editor.getHTML();

      // Only update if content has changed
      if (htmlContent !== currentContent && htmlContent !== lastEditorHtmlRef.current) {
        editor.commands.setContent(htmlContent, { emitUpdate: false });
        lastEditorHtmlRef.current = htmlContent;
      }
    }
  }, [content, editor, isOpen]);

  useEffect(() => {
    setShowLinkMenu(false);
    linkTriggerRef.current = null;
    setShowMathPractice(false);
  }, [nodeId]);

  if (!isOpen || !editor) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        onWheel={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
      />

      {/* Sidebar */}
      <div
        data-editor-sidebar
        className="fixed top-0 bottom-0 bg-canvas bg-dot-pattern shadow-2xl z-50 flex flex-col transition-[right,width] duration-200"
        style={{
          right: dockOffsetPx,
          width: widthPx,
          backgroundColor: '#ffffff',
          backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        onWheel={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
        onMouseMove={event => event.stopPropagation()}
        onMouseUp={event => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 py-4 border-b border-slate-200">
          <div className="flex min-w-0 items-center gap-3">
            <h3 className="truncate text-lg font-semibold text-slate-900">{title || 'Edit Content'}</h3>

          </div>
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelection}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploadingImage}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60"
              aria-label="Upload image into this page"
              title="Upload image"
            >
              {isUploadingImage ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              <span className="hidden sm:inline">Image</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowMathPractice(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
              aria-label="Open math practice"
              title="Practice and solve math"
            >
              <Calculator size={16} />
              <span className="hidden sm:inline">Math</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Close editor"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Editor Content with Bubble & Floating Menus */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain relative">
          <CustomBubbleMenu editor={editor} linkTargets={backlinkTargets} onSelectBacklink={(target, range) => insertSelectedTextLink(target, range)} />
          <TableControls editor={editor} />
          <EditorContent editor={editor} />
        </div>

        {/* Slash Command Menu */}
        {showSlashMenu && (
          <div
            className="fixed z-50 bg-white rounded-lg shadow-2xl border border-slate-200 py-2 w-72"
            style={{
              top: `${slashMenuPosition.top}px`,
              left: `${slashMenuPosition.left}px`,
              maxHeight: 'min(70vh, 480px)',
              overflowY: 'auto',
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

        {showLinkMenu && (
          <div className="fixed z-[60] max-h-72 w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-2xl"
            style={{ top: `${linkMenuPosition.top}px`, left: `${linkMenuPosition.left}px` }}>
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Link to a page
            </div>
            {matchingLinkTargets.length ? matchingLinkTargets.map((target, index) => (
              <button key={target.id} type="button" onMouseDown={event => event.preventDefault()}
                onClick={() => insertNoteLink(target)}
                className={`block w-full px-3 py-2 text-left ${index === selectedLinkIndex ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <span className="block truncate text-sm font-medium text-slate-800">{target.title || 'Untitled'}</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {(target.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                </span>
              </button>
            )) : (
              <div className="px-3 py-2 text-xs text-slate-400">No matching pages on this whiteboard</div>
            )}
          </div>
        )}

        {showMathPractice && (
          <MathPracticePanel
            accessToken={accessToken}
            model={model}
            onClose={() => setShowMathPractice(false)}
            onUploadImage={onUploadImage}
            onInsertContent={html => editor.chain().focus().insertContent(html).run()}
          />
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
        .ProseMirror h4 {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0.9em 0 0.45em;
          color: #444;
        }
        .ProseMirror h5 {
          font-size: 1.1em;
          font-weight: 600;
          margin: 0.8em 0 0.4em;
          color: #555;
        }
        .ProseMirror h6 {
          font-size: 1em;
          font-weight: 700;
          margin: 0.75em 0 0.35em;
          color: #555;
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
          table-layout: auto;
          display: block;
          width: max-content;
          max-width: 100%;
          margin: 1em 0;
          overflow-x: auto;
        }
        .ProseMirror td, .ProseMirror th {
          min-width: 3.5em;
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
        .ProseMirror .roam-note-link {
          color: #2563eb;
          background: #eff6ff;
          border-radius: 0.25rem;
          padding: 0.05rem 0.2rem;
          cursor: pointer;
        }
        .ProseMirror .roam-note-link:hover {
          background: #dbeafe;
        }
        .markdown-display-container .roam-note-link {
          color: #2563eb;
          background: #eff6ff;
          border-radius: 0.25rem;
          padding: 0.05rem 0.2rem;
          cursor: pointer;
        }
        .markdown-display-container .roam-note-link:hover {
          background: #dbeafe;
        }
        .ProseMirror .inline-math {
          display: inline-block;
          padding: 0 0.1em;
          border-radius: 0.2rem;
          cursor: pointer;
        }
        .ProseMirror .inline-math-display {
          display: block;
          width: fit-content;
          max-width: 100%;
          margin: 0.65em auto;
          overflow-x: auto;
          padding: 0.2em 0.4em;
        }
        .ProseMirror .inline-math:hover {
          background: #f1f5f9;
        }
        .ProseMirror .inline-math.ProseMirror-selectednode {
          outline: 2px solid #3b82f6;
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
          margin: 0.2rem 0;
        }

        .toggle-block {
          min-width: 0;
        }

        .toggle-summary {
          display: flex;
          align-items: center;
          gap: 0.2rem;
          min-height: 1.9rem;
          border-radius: 0.375rem;
          color: #334155;
          font-size: 0.95rem;
          font-weight: 550;
          line-height: 1.4;
          transition: background-color 120ms ease, color 120ms ease;
        }

        .toggle-summary:hover {
          background: #f8fafc;
          color: #1d4ed8;
        }

        .toggle-chevron {
          display: inline-flex;
          flex: 0 0 auto;
          align-items: center;
          justify-content: center;
          width: 1.55rem;
          height: 1.55rem;
          padding: 0;
          border: 0;
          border-radius: 0.3rem;
          background: transparent;
          color: #64748b;
          cursor: pointer;
        }

        .toggle-chevron:hover {
          background: #e2e8f0;
          color: #334155;
        }

        .toggle-chevron svg {
          transition: transform 150ms ease;
        }

        .toggle-block-wrapper.open > .toggle-block > .toggle-summary .toggle-chevron svg {
          transform: rotate(90deg);
        }

        .toggle-summary-text {
          flex: 1;
          min-width: 0;
          padding: 0.25rem 0.4rem 0.25rem 0;
          cursor: text;
        }

        .toggle-summary-input {
          flex: 1;
          min-width: 0;
          margin: 0;
          padding: 0.25rem 0.4rem 0.25rem 0;
          border: 0;
          outline: none;
          background: transparent;
          color: #1e293b;
          font: inherit;
        }

        .toggle-content {
          margin: 0.1rem 0 0.35rem 0.77rem;
          padding: 0.15rem 0 0.15rem 0.8rem;
          border-left: 1px solid #e2e8f0;
          color: #475569;
        }

        .toggle-content.collapsed {
          display: none !important;
        }

        .toggle-content > [data-node-view-content] > *:last-child,
        .toggle-content > :last-child {
          margin-bottom: 0;
        }

        .markdown-display-container details.toggle-block {
          margin: 0.2rem 0;
          border: 0;
        }

        .markdown-display-container details.toggle-block > summary.toggle-summary {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          min-height: 1.9rem;
          padding: 0.2rem 0.35rem;
          border-radius: 0.375rem;
          color: #334155;
          font-weight: 550;
          cursor: pointer;
          list-style: none;
        }

        .markdown-display-container details.toggle-block > summary.toggle-summary::-webkit-details-marker {
          display: none;
        }

        .markdown-display-container details.toggle-block > summary.toggle-summary::before {
          content: '›';
          display: inline-block;
          width: 1rem;
          color: #64748b;
          font-size: 1.2rem;
          line-height: 1;
          transition: transform 150ms ease;
        }

        .markdown-display-container details.toggle-block[open] > summary.toggle-summary::before {
          transform: rotate(90deg);
        }

        .markdown-display-container details.toggle-block > .toggle-content {
          margin-left: 1.25rem;
          padding-left: 0.8rem;
          border-left: 1px solid #e2e8f0;
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

        .node-display-content .ProseMirror h4 {
          font-size: 1.05em;
          font-weight: 600;
          margin: 0.45em 0;
        }

        .node-display-content .ProseMirror h5 {
          font-size: 1em;
          font-weight: 600;
          margin: 0.4em 0;
        }

        .node-display-content .ProseMirror h6 {
          font-size: 0.95em;
          font-weight: 700;
          margin: 0.35em 0;
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
          display: block;
          width: max-content;
          max-width: 100%;
          margin: 0.5em 0;
          overflow-x: auto;
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

/* -------------------------------------------------------------------------- */
/*  Whiteboard sidebar                                                         */
/* -------------------------------------------------------------------------- */

interface WhiteboardEditorSidebarProps {
  nodeId: string;
  title?: string;
  content: string;
  isOpen: boolean;
  onClose: () => void;
  onWhiteboardChange: (changes: { content?: unknown; title?: string }) => void;
  dockOffsetPx?: number;
  widthPx?: number;
}

export const WhiteboardEditorSidebar: React.FC<WhiteboardEditorSidebarProps> = ({
  nodeId,
  title,
  content,
  isOpen,
  onClose,
  onWhiteboardChange,
  dockOffsetPx = 0,
  widthPx = 700,
}) => {
  const snapshot = useMemo(() => {
    if (!content) return null;
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  }, [content]);

  if (!isOpen) return null;

  const block: WhiteboardBlock = {
    id: nodeId,
    title: title || 'Untitled Whiteboard',
    content: snapshot,
    type: 'general',
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        onWheel={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
      />
      <aside
        data-editor-sidebar
        className="fixed bottom-0 top-0 z-50 flex flex-col bg-canvas bg-dot-pattern shadow-2xl"
        style={{
          right: dockOffsetPx,
          width: widthPx,
          backgroundColor: '#ffffff',
          backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
        aria-label="Whiteboard editor"
        onWheel={event => event.stopPropagation()}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2 text-slate-800">
            <Paintbrush size={18} className="text-violet-500" />
            <h3 className="text-lg font-semibold">Whiteboard</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-slate-100" aria-label="Close whiteboard editor">
            <X size={20} className="text-slate-500" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain px-4">
          <WhiteboardCanvas
            block={block}
            darkMode={false}
            showAIAssistant={false}
            updateBlock={(_id, changes) => onWhiteboardChange(changes)}
          />
        </div>
      </aside>
    </>
  );
};

/* -------------------------------------------------------------------------- */
/*  Bubble menu                                                                */
/* -------------------------------------------------------------------------- */

const CustomBubbleMenu = ({
  editor,
  linkTargets,
  onSelectBacklink,
}: {
  editor: any;
  linkTargets: NoteLinkTarget[];
  onSelectBacklink: (target: NoteLinkTarget, range: { from: number; to: number }) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isLinkMode, setIsLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showBacklinkPicker, setShowBacklinkPicker] = useState(false);
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
        setShowBacklinkPicker(false);
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

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!isOpen || !menu) return;

    const margin = 8;
    const panel = menu.closest<HTMLElement>('[data-editor-sidebar]');
    const panelRect = panel?.getBoundingClientRect();
    const halfMenuWidth = menu.offsetWidth / 2;
    const minLeft = (panelRect?.left ?? 0) + halfMenuWidth + margin;
    const maxLeft = Math.max(
      minLeft,
      (panelRect?.right ?? window.innerWidth) - halfMenuWidth - margin,
    );
    const menuHeight = menu.offsetHeight;
    const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
    const nextLeft = Math.min(maxLeft, Math.max(minLeft, position.left));
    const nextTop = Math.min(maxTop, Math.max(margin, position.top));

    if (nextLeft !== position.left || nextTop !== position.top) {
      setPosition({ top: nextTop, left: nextLeft });
    }
  }, [isOpen, position.left, position.top, isLinkMode, showBacklinkPicker]);

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
      {showBacklinkPicker ? (
        <div className="max-h-64 w-64 overflow-y-auto py-1">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Link selected text to</div>
          {linkTargets.length ? linkTargets.map(target => (
            <button key={target.id} type="button" className="block w-full px-3 py-2 text-left hover:bg-blue-50"
              onMouseDown={event => event.preventDefault()}
              onClick={() => {
                const { from, to } = editor.state.selection;
                if (from !== to) onSelectBacklink(target, { from, to });
                setShowBacklinkPicker(false);
              }}>
              <span className="block truncate text-sm font-medium text-slate-800">{target.title || 'Untitled'}</span>
              <span className="block truncate text-[11px] text-slate-400">{(target.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}</span>
            </button>
          )) : <div className="px-3 py-2 text-xs text-slate-400">No other pages available</div>}
        </div>
      ) : isLinkMode ? (
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
          <MenuButton onClick={() => setShowBacklinkPicker(true)} isActive={false} icon={<Link2 size={16} />} label="Backlink" />
          <Separator />
          <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} icon={<Bold size={16} />} label="Bold" />
          <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} icon={<Italic size={16} />} label="Italic" />
          <MenuButton onClick={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} icon={<UnderlineIcon size={16} />} label="Underline" />
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
