import React, { useState, useEffect } from 'react';
import { StickyNote, X, GripVertical, Folder, Link2, Calendar, Edit2, Check, ArrowRight } from 'lucide-react';

interface Note {
  id: string;
  content: string;
  groupId: string;
  groupName: string;
  createdAt: string;
  color: string;
  updatedAt?: string;
}

interface NotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  accessToken: string;
  onDragStart: (note: Note, e: React.DragEvent) => void;
  sharedNotes: Map<string, Note>;
  onUpdateSharedNote: (noteId: string, newContent: string) => void;
}

const NotesPanel: React.FC<NotesPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  accessToken,
  onDragStart,
  sharedNotes,
  onUpdateSharedNote
}) => {
  const [loading, setLoading] = useState(false);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [groupedNotes, setGroupedNotes] = useState<Map<string, Note[]>>(new Map());
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    const grouped = new Map<string, Note[]>();
    Array.from(sharedNotes.values()).forEach(note => {
      const existing = grouped.get(note.groupName) || [];
      grouped.set(note.groupName, [...existing, note]);
    });
    setGroupedNotes(grouped);
  }, [sharedNotes]);

  const handleDragStart = (note: Note, e: React.DragEvent) => {
    setDraggedNoteId(note.id);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify({
      noteId: note.id,
      isReference: true
    }));
    onDragStart(note, e);
  };

  const handleDragEnd = () => {
    setDraggedNoteId(null);
  };

  const handleStartEdit = (note: Note) => {
    setEditingNoteId(note.id);
    setEditContent(note.content);
  };

  const handleSaveEdit = () => {
    if (editingNoteId && editContent.trim()) {
      onUpdateSharedNote(editingNoteId, editContent.trim());
      setEditingNoteId(null);
      setEditContent('');
    }
  };

  const handleCancelEdit = () => {
    setEditingNoteId(null);
    setEditContent('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop for mobile, optional for desktop */}
      <div className="fixed inset-0 bg-black/20 z-30 transition-opacity md:hidden" onClick={onClose} />
      
      <div className="fixed right-0 top-0 h-full w-96 bg-slate-50 shadow-2xl z-40 border-l border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out">
        
        {/* Header - Glassmorphism style */}
        <div className="px-6 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-10">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <StickyNote size={22} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg leading-tight">Library</h3>
                <p className="text-xs text-slate-500 font-medium">
                  {sharedNotes.size} {sharedNotes.size === 1 ? 'Note' : 'Notes'} Available
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
          ) : sharedNotes.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center px-6">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-300">
                <Folder size={32} />
              </div>
              <h4 className="text-slate-900 font-medium mb-1">No notes found</h4>
              <p className="text-slate-500 text-sm">Notes created in your groups will automatically appear here.</p>
            </div>
          ) : (
            Array.from(groupedNotes.entries()).map(([groupName, groupNotes]) => (
              <div key={groupName} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Group Header */}
                <div className="flex items-center gap-2 mb-4 px-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {groupName}
                  </span>
                  <div className="h-px flex-1 bg-slate-200/60"></div>
                  <span className="text-[10px] font-semibold bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                    {groupNotes.length}
                  </span>
                </div>

                {/* Notes Grid */}
                <div className="space-y-4">
                  {groupNotes.map(note => (
                    <div
                      key={note.id}
                      className={`
                        relative group rounded-xl transition-all duration-300 ease-out
                        ${draggedNoteId === note.id ? 'opacity-40 scale-95 ring-2 ring-indigo-400 ring-offset-2' : 'bg-white shadow-sm hover:shadow-md hover:-translate-y-1'}
                        ${editingNoteId === note.id ? 'ring-2 ring-indigo-500 shadow-lg scale-[1.02] z-20' : 'border border-slate-100'}
                      `}
                    >
                      {/* Color Strip Indicator */}
                      <div 
                        className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full" 
                        style={{ backgroundColor: note.color || '#6366f1' }}
                      />

                      {editingNoteId === note.id ? (
                        // Edit Mode
                        <div className="p-4 pl-5">
                          <label className="text-xs font-bold text-indigo-600 mb-2 block uppercase tracking-wide">
                            Editing Note
                          </label>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-slate-50 text-slate-700 rounded-lg p-3 text-base leading-relaxed resize-none focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-200 transition-all mb-3"
                            rows={5}
                            autoFocus
                            placeholder="Write your thoughts..."
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={handleCancelEdit}
                              className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSaveEdit}
                              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg shadow-sm shadow-indigo-200 transition-all flex items-center gap-1.5"
                            >
                              <Check size={14} />
                              Save Changes
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(note, e)}
                          onDragEnd={handleDragEnd}
                          className="p-5 pl-6 cursor-grab active:cursor-grabbing"
                        >
                          {/* Drag Handle (Visible on Hover) */}
                          <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity text-slate-300">
                             <GripVertical size={16} />
                          </div>

                          <div className="mb-3 pr-4">
                            <p className="text-slate-700 text-base leading-relaxed font-normal whitespace-pre-wrap">
                              {note.content}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-50 mt-2">
                            <div className="flex items-center gap-3 text-xs text-slate-400">
                               <div className="flex items-center gap-1">
                                  <Calendar size={12} />
                                  <span>{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                               </div>
                               {note.updatedAt && (
                                 <span className="text-indigo-400 bg-indigo-50 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                   Edited
                                 </span>
                               )}
                            </div>
                            
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStartEdit(note);
                              }}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 py-1 rounded transition-all"
                            >
                              <Edit2 size={12} />
                              Edit
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 border-t border-slate-200">
          <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100/50">
            <div className="flex items-start gap-3">
              <div className="p-1.5 bg-indigo-100 rounded-full text-indigo-600 mt-0.5">
                <Link2 size={14} />
              </div>
              <div>
                <h5 className="text-xs font-bold text-indigo-900 mb-1">Drag to Connect</h5>
                <p className="text-xs text-indigo-700/80 leading-relaxed">
                  Drag a note card onto the canvas to create a live reference. Updates here will sync automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotesPanel;