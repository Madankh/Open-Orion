import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Trash2,
} from 'lucide-react';

interface TableControlsProps {
  editor: any;
  darkMode?: boolean;
}

const TableControls: React.FC<TableControlsProps> = ({ editor, darkMode = false }) => {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!editor) return;

    const updatePosition = () => {
      const { $from } = editor.state.selection;
      let tableDepth = $from.depth;
      while (tableDepth > 0 && $from.node(tableDepth).type.name !== 'table') {
        tableDepth -= 1;
      }

      if (tableDepth === 0) {
        setPosition(null);
        return;
      }

      const tablePosition = $from.before(tableDepth);
      const tableNode = editor.view.nodeDOM(tablePosition) as HTMLElement | null;
      const tableElement = tableNode?.matches('table')
        ? tableNode
        : tableNode?.querySelector('table');
      if (!tableElement) {
        setPosition(null);
        return;
      }

      const rect = tableElement.getBoundingClientRect();
      const toolbarWidth = Math.min(620, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - toolbarWidth - 8));
      const top = rect.top >= 56 ? rect.top - 48 : Math.min(rect.bottom + 8, window.innerHeight - 48);
      setPosition({ top: Math.max(8, top), left });
    };

    updatePosition();
    editor.on('selectionUpdate', updatePosition);
    editor.on('transaction', updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('transaction', updatePosition);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [editor]);

  if (!editor || !position) return null;

  const buttonClass = `inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
    darkMode
      ? 'text-slate-200 hover:bg-slate-700 hover:text-white'
      : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
  }`;

  const run = (command: string) => {
    editor.chain().focus()[command]().run();
  };

  return (
    <div
      className={`fixed z-[65] flex max-w-[calc(100vw-16px)] flex-wrap items-center gap-1 rounded-lg border p-1 shadow-lg ${
        darkMode ? 'border-slate-600 bg-slate-800' : 'border-slate-200 bg-white'
      }`}
      style={{ top: position.top, left: position.left }}
      role="toolbar"
      aria-label="Table controls"
      onMouseDown={event => event.preventDefault()}
    >
      <button type="button" className={buttonClass} title="Insert row above" onClick={() => run('addRowBefore')}>
        <ArrowUp size={14} /> Row
      </button>
      <button type="button" className={buttonClass} title="Insert row below" onClick={() => run('addRowAfter')}>
        <ArrowDown size={14} /> Row
      </button>
      <button type="button" className={buttonClass} title="Delete row" onClick={() => run('deleteRow')}>
        − Row
      </button>
      <span className={`mx-1 h-5 w-px ${darkMode ? 'bg-slate-600' : 'bg-slate-200'}`} />
      <button type="button" className={buttonClass} title="Insert column to the left" onClick={() => run('addColumnBefore')}>
        <ArrowLeft size={14} /> Column
      </button>
      <button type="button" className={buttonClass} title="Insert column to the right" onClick={() => run('addColumnAfter')}>
        <ArrowRight size={14} /> Column
      </button>
      <button type="button" className={buttonClass} title="Delete column" onClick={() => run('deleteColumn')}>
        − Column
      </button>
      <span className={`mx-1 h-5 w-px ${darkMode ? 'bg-slate-600' : 'bg-slate-200'}`} />
      <button
        type="button"
        className={`${buttonClass} ${darkMode ? 'text-red-300 hover:bg-red-950' : 'text-red-600 hover:bg-red-50'}`}
        title="Delete table"
        onClick={() => run('deleteTable')}
      >
        <Trash2 size={14} /> Delete table
      </button>
    </div>
  );
};

export default TableControls;
