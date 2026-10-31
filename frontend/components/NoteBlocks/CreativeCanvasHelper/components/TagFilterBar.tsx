import React from 'react';

export const TagFilterBar = ({ tags, active, onToggle, onClear }: {
  tags: string[]; active: string[]; onToggle: (t: string) => void; onClear: () => void;
}) => {
  if (!tags.length) return null;
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 bg-white border border-gray-100 shadow rounded-full px-2 py-1 max-w-[60%] overflow-x-auto"
      onMouseDown={e => e.stopPropagation()}>
      {tags.map(t => (
        <button key={t} onClick={() => onToggle(t)}
          className={`px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap ${active.includes(t) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          #{t}
        </button>
      ))}
      {active.length > 0 && <button onClick={onClear} className="text-[11px] text-gray-400 px-1">clear</button>}
    </div>
  );
};