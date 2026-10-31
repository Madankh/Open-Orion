import React from 'react';
import { Loader2, Trash2, Upload } from 'lucide-react';

export type NodeOperationStatus = 'uploading' | 'deleting';

const NodeOperationOverlay: React.FC<{ status: NodeOperationStatus }> = ({ status }) => {
  const isUploading = status === 'uploading';

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center rounded-[22px] bg-slate-950/25 px-4 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label={isUploading ? 'Uploading files for this node' : 'Deleting this node'}
      onMouseDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <div className="absolute inset-1.5 rounded-[18px] border border-white/70 shadow-[0_0_28px_rgba(99,102,241,0.35)] animate-pulse" />
      <div className="relative flex min-w-[210px] items-center gap-3 rounded-2xl border border-white/80 bg-white/95 px-4 py-3 shadow-2xl shadow-slate-900/20">
        <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isUploading ? 'bg-violet-50 text-violet-600' : 'bg-rose-50 text-rose-600'}`}>
          <div className={`absolute inset-0 rounded-full border-[2px] border-transparent ${isUploading ? 'border-t-violet-500 border-r-cyan-400' : 'border-t-rose-500 border-r-orange-400'} animate-spin`} />
          {isUploading ? <Upload size={17} /> : <Trash2 size={17} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-800">
            {isUploading ? 'Uploading to your workspace' : 'Deleting node and files'}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">Working on this node…</div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full w-1/2 rounded-full ${isUploading ? 'bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400' : 'bg-gradient-to-r from-rose-400 via-orange-400 to-rose-500'} animate-pulse`} />
          </div>
        </div>
        <Loader2 size={15} className={`shrink-0 animate-spin ${isUploading ? 'text-violet-500' : 'text-rose-500'}`} />
      </div>
    </div>
  );
};

export default NodeOperationOverlay;
