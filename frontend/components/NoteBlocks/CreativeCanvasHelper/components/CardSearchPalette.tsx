import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Card } from '@/typings/agent';

export const CardSearchPalette = ({ open, mode, onClose, search, suggestTags, onPick }: {
  open: boolean; mode: 'add' | 'link'; onClose: () => void;
  search: (q: string, tags: string[], signal?: AbortSignal) => Promise<Card[]>;
  suggestTags: string[]; onPick: (c: Card) => void;
}) => {
  const [q, setQ] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      search(q, tags, ctl.signal).then(r => { setResults(r); setIdx(0); }).catch(() => {}).finally(() => setLoading(false));
    }, 200);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [open, q, tags, search]);

  if (!open) return null;
  const toggleTag = (t: string) => setTags(p => (p.includes(t) ? p.filter(x => x !== t) : [...p, t]));

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[420px] bg-white border border-gray-100 shadow-2xl rounded-xl z-[70]"
      onMouseDown={e => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <Search size={14} className="text-gray-400" />
        <input
          ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
          placeholder={mode === 'link' ? 'Link to card…' : 'Search cards to add to this board…'}
          className="flex-1 text-sm outline-none text-gray-900"
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && results[idx]) onPick(results[idx]);
            else if (e.key === 'Escape') onClose();
          }}
        />
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={14} /></button>
      </div>

      <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-gray-50 max-h-16 overflow-y-auto">
        {suggestTags.slice(0, 30).map(t => (
          <button key={t} onClick={() => toggleTag(t)}
            className={`px-1.5 py-0.5 rounded-full text-[11px] ${tags.includes(t) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
            #{t}
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {loading && !results.length && <div className="p-3 text-xs text-gray-400">Searching…</div>}
        {!loading && !results.length && <div className="p-3 text-xs text-gray-400">No cards</div>}
        {results.map((c, i) => (
          <div key={c.id} draggable={mode === 'add'}
            onDragStart={e => {
              e.dataTransfer.setData('application/card', JSON.stringify(c));
              e.dataTransfer.setData('text/plain', c.title || 'Card reference');
              e.dataTransfer.effectAllowed = 'link';
            }}
            onClick={() => onPick(c)} onMouseEnter={() => setIdx(i)}
            className={`px-3 py-2 cursor-pointer ${i === idx ? 'bg-blue-50' : ''}`}>
            <div className="text-sm font-medium text-gray-900 truncate">{c.title || 'Untitled'}</div>
            <div className="text-[11px] text-gray-500 line-clamp-1">
              {(c.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140)}
            </div>
            {!!c.tags?.length && <div className="mt-0.5 text-[10px] text-blue-600">{c.tags.map(t => `#${t}`).join(' ')}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};
