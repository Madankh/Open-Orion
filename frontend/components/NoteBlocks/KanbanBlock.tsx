import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  memo
} from 'react';
import {
  Plus,
  Trash2,
  GripVertical,
  Edit2,
  Check,
  X,
  MoreVertical,
  Calendar,
  User
} from 'lucide-react';
import { Block } from '@/typings/agent';

/* -------------------------
   Types
   ------------------------- */
export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  assignee?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
  tags?: string[];
  createdAt: number;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
  color?: string;
}

interface KanbanBlockProps {
  block: Block & { columns?: KanbanColumn[]; boardTitle?: string };
  darkMode: boolean;
  updateBlock: (id: number | string, newProps: Partial<Block>) => void;
  deleteBlock: (blockId: number | string) => void;
  registerBlockRef: (blockId: number | string, element: HTMLElement | null) => void;
  handleTextChange?: (blockId: number | string, newContent: string) => void;
  onBlockFocus?: (blockId: number | string) => void;
}

/* -------------------------
   Defaults
   ------------------------- */
const DEFAULT_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To Do', cards: [], color: '#6B7280' },
  { id: 'inprogress', title: 'In Progress', cards: [], color: '#3B82F6' },
  { id: 'done', title: 'Done', cards: [], color: '#10B981' }
];

/* -------------------------
   Utility: Priority Badge
   ------------------------- */
const PriorityBadge: React.FC<{ priority: 'low' | 'medium' | 'high'; darkMode: boolean }> = ({ priority, darkMode }) => {
  const colors = {
    low: darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700',
    medium: darkMode ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-100 text-yellow-700',
    high: darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
  } as const;

  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[priority]}`}>
      {priority.toUpperCase()}
    </span>
  );
};

/* -------------------------
   CardComponent (memoized, outside parent)
   ------------------------- */
interface CardComponentProps {
  card: KanbanCard;
  columnId: string;
  darkMode: boolean;
  onEdit: (columnId: string, cardId: string) => void;
  onDelete: (columnId: string, cardId: string) => void;
  onDragStart: (columnId: string, cardId: string, e: React.DragEvent) => void;
}
const CardComponent: React.FC<CardComponentProps> = memo(function CardComponent({
  card,
  columnId,
  darkMode,
  onEdit,
  onDelete,
  onDragStart
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(columnId, card.id, e)}
      className={`p-3 rounded-lg border cursor-move transition-shadow hover:shadow-lg ${
        darkMode ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1">
          <GripVertical size={16} className={darkMode ? 'text-gray-600' : 'text-gray-400'} />
          <h4 className={`font-medium text-sm ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
            {card.title}
          </h4>
        </div>
        <button
          onClick={() => setIsExpanded(prev => !prev)}
          className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'}`}
        >
          <MoreVertical size={14} />
        </button>
      </div>

      {card.description && (
        <p className={`text-xs mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          {card.description}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {card.priority && <PriorityBadge priority={card.priority} darkMode={darkMode} />}

        {card.dueDate && (
          <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <Calendar size={12} />
            {new Date(card.dueDate).toLocaleDateString()}
          </span>
        )}

        {card.assignee && (
          <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
            <User size={12} />
            {card.assignee}
          </span>
        )}
      </div>

      {card.tags && card.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.tags.map((tag, idx) => (
            <span key={idx} className={`px-2 py-0.5 rounded text-xs ${darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-700'}`}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {isExpanded && (
        <div className={`mt-2 pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(columnId, card.id)}
              className={`text-xs px-2 py-1 rounded transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              <Edit2 size={12} className="inline mr-1" />
              Edit
            </button>
            <button
              onClick={() => onDelete(columnId, card.id)}
              className={`text-xs px-2 py-1 rounded transition-colors ${darkMode ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
            >
              <Trash2 size={12} className="inline mr-1" />
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

/* -------------------------
   CardForm (memoized, outside parent)
   - Controlled form with local state but kept stable across parent renders
   ------------------------- */
interface CardFormProps {
  columnId: string;
  darkMode: boolean;
  initial?: Partial<KanbanCard>;
  onSubmit: (columnId: string, cardData: Partial<KanbanCard>) => void;
  onClose: () => void;
}
const CardForm: React.FC<CardFormProps> = memo(function CardForm({ columnId, darkMode, initial = {}, onSubmit, onClose }) {
  const [formData, setFormData] = useState<Partial<KanbanCard>>({
    title: initial.title || '',
    description: initial.description || '',
    assignee: initial.assignee || '',
    dueDate: initial.dueDate || '',
    priority: (initial.priority as 'low' | 'medium' | 'high') || 'medium',
    tags: initial.tags || []
  });

  // Keep initial in sync only when form is first mounted (no reset on parent re-render)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      setFormData(prev => ({ ...prev, ...initial }));
    }
    // intentionally no dependency on `initial` to avoid re-syncs that would clobber user's typed text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = useCallback((field: keyof KanbanCard, value: string | string[] | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  return (
    <div className={`p-3 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <input
        type="text"
        placeholder="Task title..."
        value={formData.title || ''}
        onChange={(e) => handleChange('title', e.target.value)}
        className={`w-full px-3 py-2 rounded border mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
        autoFocus
      />

      <textarea
        placeholder="Description..."
        value={formData.description || ''}
        onChange={(e) => handleChange('description', e.target.value)}
        className={`w-full px-3 py-2 rounded border mb-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
        rows={3}
      />

      <div className="flex gap-2 mb-2">
        <input
          type="date"
          value={formData.dueDate || ''}
          onChange={(e) => handleChange('dueDate', e.target.value)}
          className={`flex-1 px-2 py-1 rounded border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
        />

      </div>

      <select
        value={formData.priority || 'medium'}
        onChange={(e) => handleChange('priority', e.target.value as 'low' | 'medium' | 'high')}
        className={`w-full px-2 py-1 rounded border mb-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
      >
        <option value="low">Low Priority</option>
        <option value="medium">Medium Priority</option>
        <option value="high">High Priority</option>
      </select>

      <div className="flex gap-2">
        <button
          onClick={() => {
            if (formData.title?.trim()) {
              onSubmit(columnId, formData);
            }
          }}
          disabled={!formData.title?.trim()}
          className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Check size={14} className="inline mr-1" /> Add Card
        </button>

        <button
          onClick={onClose}
          className={`px-3 py-1.5 rounded text-sm transition-colors ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
});

/* -------------------------
   Main KanbanBlock
   ------------------------- */
const KanbanBlock: React.FC<KanbanBlockProps> = ({
  block,
  darkMode,
  updateBlock,
  registerBlockRef,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [columns, setColumns] = useState<KanbanColumn[]>(block.columns ?? DEFAULT_COLUMNS);
  const [boardTitle, setBoardTitle] = useState<string>(block.boardTitle ?? 'Kanban Board');
  const [isEditingTitle, setIsEditingTitle] = useState(false);

  // track which column's add form is open
  const [newCardColumn, setNewCardColumn] = useState<string | null>(null);

  // edit-card id mapping (columnId -> cardId) for when user clicks Edit
  const [editingCardId, setEditingCardId] = useState<{ columnId: string; cardId: string } | null>(null);

  // dragged card stored in ref to avoid frequent re-renders while dragging
  const draggedCardRef = useRef<{ columnId: string; cardId: string } | null>(null);

  // debounced updateBlock
  const updateTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef({ columns, boardTitle });

  useEffect(() => {
    // register DOM ref with parent
    if (containerRef.current) {
      registerBlockRef(block.id, containerRef.current);
    }
    return () => registerBlockRef(block.id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id, registerBlockRef]);

  // Debounced push to parent updateBlock to reduce re-renders and external saves
  useEffect(() => {
    // avoid scheduling if nothing changed
    if (JSON.stringify(lastSavedRef.current) === JSON.stringify({ columns, boardTitle })) {
      return;
    }

    if (updateTimerRef.current) {
      window.clearTimeout(updateTimerRef.current);
    }
    updateTimerRef.current = window.setTimeout(() => {
      updateBlock(block.id, { columns, boardTitle });
      lastSavedRef.current = { columns, boardTitle };
      updateTimerRef.current = null;
    }, 400);

    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
    };
  }, [columns, boardTitle, updateBlock, block.id]);

  // Clean up on unmount: immediate flush
  useEffect(() => {
    return () => {
      if (updateTimerRef.current) {
        window.clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      // final flush
      updateBlock(block.id, { columns, boardTitle });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------
     Column/Card actions
     ------------------------- */
  const addCard = useCallback((columnId: string, cardData: Partial<KanbanCard>) => {
    const newCard: KanbanCard = {
      id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: cardData.title || 'Untitled Task',
      description: cardData.description,
      assignee: cardData.assignee,
      dueDate: cardData.dueDate,
      priority: cardData.priority || 'medium',
      tags: cardData.tags || [],
      createdAt: Date.now()
    };

    setColumns(prev => prev.map(col => (col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col)));
    setNewCardColumn(null);
  }, []);

  const updateCard = useCallback((columnId: string, cardId: string, updates: Partial<KanbanCard>) => {
    setColumns(prev => prev.map(col => (col.id === columnId ? { ...col, cards: col.cards.map(c => (c.id === cardId ? { ...c, ...updates } : c)) } : col)));
  }, []);

  const deleteCard = useCallback((columnId: string, cardId: string) => {
    setColumns(prev => prev.map(col => (col.id === columnId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col)));
  }, []);

  const moveCard = useCallback((fromColumnId: string, toColumnId: string, cardId: string) => {
    setColumns(prev => {
      const fromColumn = prev.find(col => col.id === fromColumnId);
      const card = fromColumn?.cards.find(c => c.id === cardId);
      if (!card) return prev;

      return prev.map(col => {
        if (col.id === fromColumnId) {
          return { ...col, cards: col.cards.filter(c => c.id !== cardId) };
        }
        if (col.id === toColumnId) {
          return { ...col, cards: [...col.cards, card] };
        }
        return col;
      });
    });
  }, []);

  /* -------------------------
     Drag handlers (use refs to avoid re-renders)
     ------------------------- */
  const handleDragStart = useCallback((columnId: string, cardId: string, e: React.DragEvent) => {
    draggedCardRef.current = { columnId, cardId };
    // set dataTransfer to allow drop in some browsers
    try {
      e.dataTransfer.setData('text/plain', cardId);
      e.dataTransfer.effectAllowed = 'move';
    } catch {
      // ignore in strict environments
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((targetColumnId: string) => {
    const dragged = draggedCardRef.current;
    if (dragged && dragged.columnId !== targetColumnId) {
      moveCard(dragged.columnId, targetColumnId, dragged.cardId);
    }
    draggedCardRef.current = null;
  }, [moveCard]);

  /* -------------------------
     Columns management
     ------------------------- */
  const addColumn = useCallback(() => {
    const newCol: KanbanColumn = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: 'New Column',
      cards: [],
      color: '#6B7280'
    };
    setColumns(prev => [...prev, newCol]);
  }, []);

  const deleteColumn = useCallback((columnId: string) => {
    if (columns.length <= 1) {
      window.alert('Cannot delete the last column');
      return;
    }
    if (window.confirm('Delete this column and all its cards?')) {
      setColumns(prev => prev.filter(c => c.id !== columnId));
    }
  }, [columns.length]);

  const updateColumnTitle = useCallback((columnId: string, newTitle: string) => {
    setColumns(prev => prev.map(col => (col.id === columnId ? { ...col, title: newTitle } : col)));
  }, []);

  /* -------------------------
     Editing card flow
     ------------------------- */
  const handleEditCard = useCallback((columnId: string, cardId: string) => {
    setEditingCardId({ columnId, cardId });
    // open form in that column
    setNewCardColumn(columnId);
  }, []);

  const handleSubmitEditCard = useCallback((columnId: string, cardData: Partial<KanbanCard>) => {
    // If editing existing card
    if (editingCardId && editingCardId.cardId) {
      updateCard(editingCardId.columnId, editingCardId.cardId, cardData);
      setEditingCardId(null);
      setNewCardColumn(null);
      return;
    }
    // Otherwise add new
    addCard(columnId, cardData);
    setNewCardColumn(null);
  }, [addCard, editingCardId, updateCard]);

  /* -------------------------
     Render
     ------------------------- */
  return (
    <div ref={(el) => { containerRef.current = el; }} className="my-4">
      {/* Board Header */}
      <div className={`p-4 rounded-t-lg border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={boardTitle}
              onChange={(e) => setBoardTitle(e.target.value)}
              onBlur={() => setIsEditingTitle(false)}
              onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
              className={`flex-1 px-3 py-2 rounded border focus:outline-none focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`}
              autoFocus
            />
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h3
              onClick={() => setIsEditingTitle(true)}
              className={`text-lg font-semibold cursor-pointer ${darkMode ? 'text-gray-200 hover:text-gray-100' : 'text-gray-800 hover:text-gray-900'}`}
            >
              {boardTitle}
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={addColumn}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors flex items-center gap-1"
              >
                <Plus size={14} />
                Add Column
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Columns */}
      <div className={`flex gap-4 p-4 overflow-x-auto ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {columns.map((column) => (
          <div
            key={column.id}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(column.id)}
            className={`flex-shrink-0 w-80 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-100'}`}
          >
            {/* Column Header */}
            <div className="p-3 border-b" style={{ borderColor: column.color }}>
              <div className="flex items-center justify-between mb-2">
                <input
                  type="text"
                  value={column.title}
                  onChange={(e) => updateColumnTitle(column.id, e.target.value)}
                  className={`flex-1 px-2 py-1 rounded border-none font-medium focus:outline-none ${darkMode ? 'bg-transparent text-gray-200' : 'bg-transparent text-gray-800'}`}
                />
                <button
                  onClick={() => deleteColumn(column.id)}
                  className={`p-1 rounded transition-colors ${darkMode ? 'hover:bg-gray-700 text-gray-400 hover:text-red-400' : 'hover:bg-gray-200 text-gray-500 hover:text-red-600'}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                {column.cards.length} card{column.cards.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Cards */}
            <div className="p-3 space-y-2 min-h-[200px] max-h-[600px] overflow-y-auto">
              {column.cards.map((card) => (
                <CardComponent
                  key={card.id}
                  card={card}
                  columnId={column.id}
                  darkMode={darkMode}
                  onEdit={handleEditCard}
                  onDelete={deleteCard}
                  onDragStart={handleDragStart}
                />
              ))}

              {/* Add / Edit Card Form */}
              {newCardColumn === column.id ? (
                <CardForm
                  columnId={column.id}
                  darkMode={darkMode}
                  initial={
                    editingCardId && editingCardId.columnId === column.id
                      ? column.cards.find(c => c.id === editingCardId.cardId) ?? undefined
                      : undefined
                  }
                  onSubmit={(colId, cardData) => {
                    // If editing existing card
                    if (editingCardId && editingCardId.columnId === column.id) {
                      updateCard(editingCardId.columnId, editingCardId.cardId, cardData);
                      setEditingCardId(null);
                      setNewCardColumn(null);
                      return;
                    }
                    addCard(colId, cardData);
                  }}
                  onClose={() => {
                    setNewCardColumn(null);
                    setEditingCardId(null);
                  }}
                />
              ) : (
                <button
                  onClick={() => setNewCardColumn(column.id)}
                  className={`w-full py-2 rounded-lg border-2 border-dashed transition-colors flex items-center justify-center gap-2 ${darkMode ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600'}`}
                >
                  <Plus size={16} />
                  Add Card
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KanbanBlock;
