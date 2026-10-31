import React, { useEffect, useState } from 'react';
import { X, Plus, LayoutGrid, FileText, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Card } from '@/typings/agent';
import { CardLinks, CardBoard, CardRefItem } from '../CreativeCanvasHelper/hooks/useCards';

export const TagEditor = ({ tags, suggestions, onChange }: {
  tags: string[]; suggestions: string[]; onChange: (t: string[]) => void;
}) => {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const t = draft.trim().toLowerCase().replace(/^#/, '');
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {tags.map(t => (
        <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[11px]">
          #{t}
          <button onClick={() => onChange(tags.filter(x => x !== t))}><X size={10} /></button>
        </span>
      ))}
      <input
        list="card-tag-suggestions" value={draft} placeholder="add tag"
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          else if (e.key === 'Backspace' && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
        className="flex-1 min-w-[70px] text-[11px] outline-none bg-transparent text-gray-800"
      />
      <datalist id="card-tag-suggestions">
        {suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
};

const Section = ({ title, action, children }: any) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</span>
      {action}
    </div>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const Row = ({ item, onOpen, onRemove }: { item: CardRefItem; onOpen: () => void; onRemove?: () => void }) => (
  <div className="group flex items-center gap-1">
    <button onClick={onOpen} className="flex-1 flex items-center gap-1.5 text-left px-1.5 py-1 rounded hover:bg-gray-50 truncate">
      {item.kind === 'document' ? <FileText size={12} /> : null}
      <span className="truncate">{item.title || 'Untitled'}</span>
      {item.source !== 'manual' && <span className="text-[9px] text-gray-400">{item.source}</span>}
    </button>
    {onRemove && item.source === 'manual' && (
      <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"><X size={12} /></button>
    )}
  </div>
);

export const CardMetaPanel = ({
  card, suggestions, refreshKey, onTagsChange, getLinks, getBoards, currentBoard,
  onOpenCard, onOpenDocument, onOpenBoard, onAddLink, onRemoveLink,
}: {
  card: Card; suggestions: string[]; refreshKey: number;
  onTagsChange: (t: string[]) => void;
  getLinks: (id: string) => Promise<CardLinks>;
  getBoards: (id: string) => Promise<CardBoard[]>;
  currentBoard?: CardBoard;
  onOpenCard: (id: string) => void;
  onOpenDocument?: (id: string) => void;
  onOpenBoard: (canvasId: string, nodeId: string) => void;
  onAddLink: () => void;
  onRemoveLink: (linkId: string) => void;
}) => {
  const [links, setLinks] = useState<CardLinks>({ out: [], in: [] });
  const [boards, setBoards] = useState<CardBoard[]>([]);

  useEffect(() => {
    let live = true;
    getLinks(card.id).then(l => live && setLinks(l)).catch(() => {});
    getBoards(card.id).then(remoteBoards => {
      if (!live) return;
      const allBoards = currentBoard
        ? [currentBoard, ...remoteBoards.filter(b => b.canvas_id !== currentBoard.canvas_id)]
        : remoteBoards;
      setBoards(allBoards);
    }).catch(() => {
      if (live) setBoards(currentBoard ? [currentBoard] : []);
    });
    return () => { live = false; };
  }, [card.id, refreshKey, getLinks, getBoards, currentBoard?.canvas_id, currentBoard?.title, currentBoard?.node_id]);

  const open = (i: CardRefItem) => (i.kind === 'document' ? onOpenDocument?.(i.id) : onOpenCard(i.id));

  return (
    <div
      className="absolute right-4 top-20 w-72 max-h-[70vh] bg-white border border-gray-100 shadow-xl rounded-xl z-50 flex flex-col"
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-800 truncate">{card.title || 'Untitled card'}</div>
      <div className="overflow-y-auto p-3 space-y-4 text-xs text-gray-700">
        <Section title="Tags">
          <TagEditor tags={card.tags ?? []} suggestions={suggestions} onChange={onTagsChange} />
        </Section>

        <Section title={`Appears in ${boards.length} whiteboard${boards.length === 1 ? '' : 's'}`}>
          {boards.map(b => (
            <button key={b.canvas_id} onClick={() => onOpenBoard(b.canvas_id, b.node_id)}
              className="w-full flex items-center gap-1.5 text-left px-1.5 py-1 rounded hover:bg-gray-50 truncate">
              <LayoutGrid size={12} /><span className="truncate">{b.title || b.canvas_id}</span>
            </button>
          ))}
        </Section>

        <Section title={<span className="inline-flex items-center gap-1"><ArrowDownLeft size={11} />Linked from ({links.in.length})</span>}>
          {links.in.map(i => <Row key={`${i.kind}-${i.id}-${i.source}`} item={i} onOpen={() => open(i)} />)}
        </Section>

        <Section
          title={<span className="inline-flex items-center gap-1"><ArrowUpRight size={11} />Links to ({links.out.length})</span>}
          action={<button onClick={onAddLink} className="text-gray-400 hover:text-blue-600" title="Link a card"><Plus size={13} /></button>}
        >
          {links.out.map(i => (
            <Row key={`${i.kind}-${i.id}-${i.source}`} item={i} onOpen={() => open(i)}
              onRemove={i.link_id ? () => onRemoveLink(i.link_id!) : undefined} />
          ))}
        </Section>
      </div>
    </div>
  );
};
