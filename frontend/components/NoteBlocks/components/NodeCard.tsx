import React, { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { NodeData, ColorTheme } from '@/typings/agent';
import { COLORS, TEXT_COLORS, BODY_TEXT_COLORS } from '../CreativeCanvasHelper/components/constants';
import {
  GripHorizontal,
  Link as LinkIcon,
  Image as ImageIcon,
  Type as TypeIcon,
  User,
  GitFork,
  Upload,
  ArrowRightCircle,
  Link2,
  Youtube,
  FileText,
  ArrowDownRight,
  Eye,
  Loader2,
  ArrowUpRight,
  Layers,
  Paintbrush,
} from 'lucide-react';
import { NodeContentDisplay } from '../CreativeCanvasHelper/components/editing';
import { getWhiteboardSnapshotInfo } from '../whiteboardSnapshot';
import NodeOperationOverlay, { type NodeOperationStatus } from './NodeOperationOverlay';

const TldrawImage = dynamic(() => import('tldraw').then(module => module.TldrawImage), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-xs text-slate-400">Preparing board preview...</div>,
});

const parseWhiteboardPreview = (content: string) => {
  if (!content) return { snapshot: null, shapeCount: 0 };
  const { snapshot, shapeCount } = getWhiteboardSnapshotInfo(content);
  return { snapshot, shapeCount };
};

// --- SKELETON COMPONENT ---
const ContentSkeleton = () => (
  <div className="w-full h-full p-6 flex flex-col gap-4 animate-pulse">
    <div className="flex justify-between items-center mb-2">
      <div className="h-6 w-3/4 bg-gray-200/80 rounded-md"></div>
      <div className="h-4 w-4 bg-gray-200/80 rounded-sm"></div>
    </div>
    <div className="space-y-3 flex-1">
      <div className="h-4 w-full bg-gray-100/80 rounded"></div>
      <div className="h-4 w-5/6 bg-gray-100/80 rounded"></div>
      <div className="h-4 w-full bg-gray-100/80 rounded"></div>
      <div className="h-4 w-4/6 bg-gray-100/80 rounded"></div>
    </div>
    <div className="mt-auto flex items-center gap-3 pt-4 border-t border-gray-100/50">
      <div className="h-6 w-6 rounded-full bg-gray-200/80"></div>
      <div className="h-3 w-20 bg-gray-200/80 rounded"></div>
    </div>
  </div>
);

const WhiteboardPreview: React.FC<{
  content: string;
  title: string;
  bodyTextColorClass: string;
  onSelect: () => void;
}> = ({ content, title, bodyTextColorClass, onSelect }) => {
  const previewRef = useRef<HTMLButtonElement>(null);
  const lastParsedContentRef = useRef(content);
  const [isNearViewport, setIsNearViewport] = useState(false);
  const [preview, setPreview] = useState(() => parseWhiteboardPreview(content));

  useEffect(() => {
    const target = previewRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '240px' });

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (content === lastParsedContentRef.current) return;
    const timeout = window.setTimeout(() => {
      setPreview(parseWhiteboardPreview(content));
      lastParsedContentRef.current = content;
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [content]);

  return (
    <button
      ref={previewRef}
      type="button"
      onMouseDown={event => event.stopPropagation()}
      onClick={event => {
        event.stopPropagation();
        onSelect();
      }}
      className="flex min-h-0 flex-1 cursor-pointer flex-col justify-center gap-2 text-left"
      aria-label={`Open whiteboard ${title}`}
    >
      {preview.shapeCount > 0 ? (
        <>
          <div className="relative h-28 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {isNearViewport && preview.snapshot ? (
              <TldrawImage
                snapshot={preview.snapshot}
                format="svg"
                background
                padding={12}
                preserveAspectRatio="xMidYMid meet"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Preparing board preview...
              </div>
            )}
            <span className="absolute bottom-2 right-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">
              {preview.shapeCount} {preview.shapeCount === 1 ? 'shape' : 'shapes'}
            </span>
          </div>
          <span className={`flex items-center gap-2 text-xs font-medium ${bodyTextColorClass}`}>
            <Paintbrush size={14} className="text-violet-500" />
            Open whiteboard
          </span>
        </>
      ) : (
        <div className="flex min-h-16 items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/60 px-4 py-3 transition-colors hover:border-violet-300 hover:bg-violet-50">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-violet-500 shadow-sm">
            <Paintbrush size={17} />
          </div>
          <div className="min-w-0">
            <span className={`block text-xs font-medium ${bodyTextColorClass}`}>Blank whiteboard</span>
            <span className="mt-0.5 block text-[11px] text-slate-400">Open to start drawing</span>
          </div>
        </div>
      )}
    </button>
  );
};

interface NodeCardProps {
  node: NodeData & { isLoading?: boolean };
  scale?: number;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onSelect: (id: string) => void;
  onChangeColor: (id: string, color: ColorTheme) => void;
  onAddChild: (parentId: string) => void;
  onUploadImage: (nodeId: string, file: File) => void;
  onStartConnect: (nodeId: string) => void;
  onUpdateContent?: (id: string, content: string) => void;
  onUpdateTitle?: (id: string, title: string) => void;
  onUpdateSize?: (id: string, size: { width: number; height: number }) => void;
  onEmbedYoutube: (id: string, url: string) => void;
  onUploadPdf: (id: string, file: File) => void;
  onEditContent?: (nodeId: string) => void;
  onOpenPDFReader?: (nodeId: string) => void;
  onOpenSource?: (node: NodeData) => void;
  onOpenLink?: (targetId: string) => void;
  operationStatus?: NodeOperationStatus;
}

export const NodeCard = React.memo<NodeCardProps>(
  ({
    node,
    scale = 1,
    isSelected,
    onMouseDown,
    onSelect,
    onAddChild,
    onUploadImage,
    onStartConnect,
    onUpdateTitle,
    onUpdateSize,
    onEmbedYoutube,
    onUploadPdf,
    onEditContent,
    onOpenPDFReader,
    onOpenSource,
    onOpenLink,
    operationStatus,
  }) => {
    const cardRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pdfInputRef = useRef<HTMLInputElement>(null);
    const titleRef = useRef<HTMLInputElement>(null);

    // Monitor total card size
    useEffect(() => {
      if (!cardRef.current || !onUpdateSize) return;

      let rafId: number | null = null;
      let pendingWidth: number | null = null;
      let pendingHeight: number | null = null;

      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          const width = target.offsetWidth;
          const height = target.offsetHeight;

          if (Math.abs(width - node.width) > 2 || Math.abs(height - (node.height || 0)) > 2) {
            pendingWidth = width;
            pendingHeight = height;

            if (rafId) cancelAnimationFrame(rafId);

            rafId = requestAnimationFrame(() => {
              if (pendingWidth !== null && pendingHeight !== null) {
                onUpdateSize(node.id, { width: pendingWidth, height: pendingHeight });
                pendingWidth = null;
                pendingHeight = null;
              }
              rafId = null;
            });
          }
        }
      });

      observer.observe(cardRef.current);

      return () => {
        observer.disconnect();
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [node.id, node.width, node.height, onUpdateSize]);

    // Loading State
    if (node.isLoading) {
      return (
        <div
          className="absolute bg-white rounded-[24px] border border-gray-200 shadow-sm transition-all duration-300"
          style={{
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
            zIndex: 5,
            boxShadow: '0 4px 20px -2px rgba(59, 130, 246, 0.15), 0 0 0 1px rgba(59, 130, 246, 0.1)',
          }}
        >
          <div className="absolute top-4 right-4 z-10">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
          </div>
          <ContentSkeleton />
        </div>
      );
    }

    const isCard = node.kind === 'card';
    const isMedia = node.type === 'image' || node.type === 'youtube' || node.type === 'pdf';
    const hasFixedHeight = isMedia || node.type === 'whiteboard';
    const textColorClass = TEXT_COLORS[node.color] || 'text-zinc-900';
    const bodyTextColorClass = BODY_TEXT_COLORS[node.color] || 'text-zinc-600';

    // --- HANDLERS ---
    const handleMouseDown = (e: React.MouseEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IFRAME' || tag === 'EMBED') {
        return;
      }

      e.stopPropagation();
      onSelect(node.id);
      onMouseDown(e, node.id);
    };

    const handleResizeMouseDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = node.width;
      const startHeight = node.height || cardRef.current?.offsetHeight || 200;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        moveEvent.preventDefault();
        const deltaX = (moveEvent.clientX - startX) / scale;
        const deltaY = (moveEvent.clientY - startY) / scale;

        const newWidth = Math.max(240, startWidth + deltaX);
        const newHeight = Math.max(150, startHeight + deltaY);

        if (onUpdateSize) {
          onUpdateSize(node.id, {
            width: newWidth,
            height: hasFixedHeight ? newHeight : node.height || 0,
          });
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onUploadImage(node.id, e.target.files[0]);
      }
      e.currentTarget.value = '';
    };

    const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        onUploadPdf(node.id, e.target.files[0]);
      }
      e.currentTarget.value = '';
    };

    const handleYoutubeClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      const url = prompt('Enter YouTube URL:');
      if (url) {
        onEmbedYoutube(node.id, url);
      }
    };

    const imageSrc = node.type !== 'youtube' ? node?.imageUrl || node?.mediaUrl : null;

    return (
      <div
        ref={cardRef}
        data-node-id={node.id}
        data-parent-id={node.parentId}
        className={`absolute flex flex-col rounded-[24px] border-2 transition-colors duration-200 group
          ${COLORS[node.color]}
          ${isSelected ? 'scale-[1.01] z-20 ring-1 ring-black/10' : 'hover:scale-[1.01] z-10'}
          ${node.projectNoteId ? 'border-dashed border-blue-400' : ''}
        `}
        style={{
          left: node.x,
          top: node.y,
          width: node.width,
          height: hasFixedHeight && node.height ? node.height : undefined,
          cursor: 'grab',
          opacity: node.dimmed ? 0.25 : 1, // tag filter
          transition: 'opacity 150ms',
        }}
        onMouseDown={handleMouseDown}
      >
        {/* Reference Badge */}
        {node.projectNoteId && (
          <div className="absolute -top-3 right-6 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-blue-200 shadow-sm z-30">
            <Link2 size={10} />
            Reference
          </div>
        )}

        {isCard && (
          <div className="absolute -top-3 right-6 bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-violet-200 shadow-sm z-30">
            <Link2 size={10} />
            Card reference
          </div>
        )}

        {/* "Appears in N whiteboards" badge (cards on more than one board) */}
        {isCard && (node.boardCount ?? 0) > 1 && (
          <div className="absolute -top-7 left-6 bg-white text-blue-600 px-2 py-0.5 rounded-md text-[10px] font-medium flex items-center gap-1 border border-blue-100 shadow-sm z-30 whitespace-nowrap">
            <ArrowUpRight size={10} />
            Appears in {node.boardCount} whiteboards
          </div>
        )}

        {/* Main Content Wrapper */}
        <div className="p-6 pb-2 flex flex-col h-full min-h-0">
          {/* Header Row */}
          <div className="flex items-start justify-between mb-3 gap-2 flex-shrink-0">
            <input
              ref={titleRef}
              value={node.title || ''}
              onChange={(e) => onUpdateTitle && onUpdateTitle(node.id, e.target.value)}
              placeholder="Title"
              className={`font-semibold text-base leading-tight bg-transparent focus:outline-none w-full ${textColorClass} placeholder:opacity-50`}
            />
            <div className={`${bodyTextColorClass} opacity-80 flex-shrink-0 pt-1`}>
              {node.type === 'text' && <TypeIcon className="w-4 h-4" />}
              {node.type === 'image' && <ImageIcon className="w-4 h-4" />}
              {node.type === 'link' && <LinkIcon className="w-4 h-4" />}
              {node.type === 'youtube' && <Youtube className="w-4 h-4" />}
              {node.type === 'pdf' && <FileText className="w-4 h-4" />}
              {node.type === 'whiteboard' && <Paintbrush className="w-4 h-4" />}
            </div>
          </div>

          {/* Content Display with PDF Indicator Logic */}
          {node.type === 'whiteboard' ? (
            <WhiteboardPreview
              content={node.content}
              title={node.title || 'Untitled'}
              bodyTextColorClass={bodyTextColorClass}
              onSelect={() => {
                onSelect(node.id);
                onEditContent?.(node.id);
              }}
            />
          ) : node.pdfSource ? (
            <div className="flex-1 min-h-0 flex gap-3">
              <div className="w-[4px] bg-yellow-400/80 rounded-full shrink-0 shadow-sm h-full max-h-[90%] my-auto" />
              <div className={`flex-1 ${node.pdfSource?.pageRange ? 'min-h-0' : ''}`}>
                <NodeContentDisplay
                  content={node.content}
                  bodyTextColorClass={bodyTextColorClass}
                  onEditClick={() => onEditContent && onEditContent(node.id)}
                  onOpenLink={onOpenLink}
                  truncateContent={!node.pdfSource?.pageRange && !isCard}
                  scrollableContent={Boolean(node.pdfSource?.pageRange)}
                />
              </div>
            </div>
          ) : (
            <NodeContentDisplay
              content={node.content}
              bodyTextColorClass={bodyTextColorClass}
              onEditClick={() => onEditContent && onEditContent(node.id)}
              onOpenLink={onOpenLink}
              truncateContent={!isCard}
            />
          )}

          {imageSrc && (
            <div className={`mt-4 rounded-xl overflow-hidden border border-black/10 bg-black/5 ${isMedia ? 'flex-1 min-h-0' : ''}`}>
              <img src={imageSrc} alt="" className="w-full h-full object-cover" draggable={false} />
            </div>
          )}

          {/* Media Content: YouTube */}
          {node.type === 'youtube' && node.youtubeId && (
            <div className={`mt-4 rounded-xl overflow-hidden border border-black/10 bg-black ${isMedia ? 'flex-1 min-h-0' : 'relative pt-[56.25%]'}`}>
              <iframe
                src={`https://www.youtube.com/embed/${node.youtubeId}`}
                className={`${isMedia ? 'w-full h-full' : 'absolute top-0 left-0 w-full h-full'}`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube Video"
              />
            </div>
          )}

          {/* Media Content: PDF Preview Card */}
          {node.type === 'pdf' && node.pdfUrl && (
            <div className="mt-auto pt-4 w-full">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPDFReader?.(node.id);
                }}
                className="group relative w-full aspect-[2/1] bg-red-50/50 rounded-xl overflow-hidden border border-red-100/50 transition-all duration-300 hover:shadow-md"
              >
                <div className="absolute inset-0 flex items-center justify-center p-4">
                  <div className="absolute w-3/4 h-full bg-white opacity-60 rounded-lg shadow-sm transform -rotate-3 translate-y-1 scale-95 border border-gray-200"></div>
                  <div className="relative w-3/4 h-full bg-white rounded-lg shadow-sm border border-gray-100 p-3 flex flex-col gap-2 transform transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-[1.02]">
                    <div className="w-full h-full flex flex-col gap-2 opacity-30">
                      <div className="h-4 w-2/3 bg-gray-800 rounded-sm" />
                      <div className="h-2 w-full bg-gray-400 rounded-sm mt-2" />
                      <div className="h-2 w-full bg-gray-400 rounded-sm" />
                      <div className="h-2 w-4/5 bg-gray-400 rounded-sm" />
                      <div className="mt-auto h-16 w-full bg-blue-100 rounded border border-blue-200" />
                    </div>
                    <div className="absolute top-2 right-2 p-1.5 bg-red-50 rounded-md text-red-500">
                      <FileText size={14} />
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gray-900/0 group-hover:bg-gray-900/10 transition-colors duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 group-active:opacity-0 transform translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                    <span className="bg-white text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg border border-gray-100 flex items-center gap-2">
                      <Eye size={12} />
                      Preview PDF
                    </span>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Tag chips (edited in CardMetaPanel) */}
          {!!node.tags?.length && (
            <div className="flex flex-wrap gap-1 mt-3 flex-shrink-0">
              {node.tags.map((t) => (
                <span
                  key={t}
                  className="px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 text-[10px] font-medium"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>

        {node.pdfSource && (
          <div className="px-6 pb-4 pt-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpenSource?.(node);
              }}
              className="group flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-transparent hover:border-blue-100 hover:bg-blue-50/50 transition-all duration-200 w-fit"
            >
              <div className="flex items-center justify-center w-4 h-4 rounded-full bg-red-100 text-red-600 group-hover:scale-110 transition-transform">
                <FileText size={8} />
              </div>
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide group-hover:text-blue-600">
                Link Page {node.pdfSource.pageNumber}
              </span>
              <ArrowUpRight size={12} className="text-blue-400 opacity-50" />
            </button>
          </div>
        )}

        {/* Resize Handle */}
        <div
          className="absolute bottom-0 right-0 p-2 cursor-nwse-resize text-black/20 hover:text-blue-500 transition-colors z-50 opacity-0 group-hover:opacity-100"
          onMouseDown={handleResizeMouseDown}
        >
          <ArrowDownRight size={22} strokeWidth={3} />
        </div>

        {/* Action Bar (Hover) */}
        <div className="px-6 py-3 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200 mt-auto flex-shrink-0">
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(node.id);
              }}
              className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${bodyTextColorClass}`}
              title="Create branch"
            >
              <GitFork className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartConnect(node.id);
              }}
              className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${bodyTextColorClass}`}
              title="Link to..."
            >
              <ArrowRightCircle className="w-4 h-4" />
            </button>
            <div className="w-[1px] h-4 bg-black/10 mx-1 my-auto"></div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${bodyTextColorClass}`}
              title="Upload Image"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />

            <button
              onClick={handleYoutubeClick}
              className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${bodyTextColorClass}`}
              title="Embed YouTube Video"
            >
              <Youtube className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                pdfInputRef.current?.click();
              }}
              className={`p-1.5 rounded-lg hover:bg-black/5 transition-colors ${bodyTextColorClass}`}
              title="Upload PDF"
            >
              <FileText className="w-4 h-4" />
            </button>
            <input type="file" ref={pdfInputRef} className="hidden" accept="application/pdf" onChange={handlePdfChange} />
          </div>
        </div>

        {/* Footer: Meta Info */}
        <div className="px-6 pb-6 flex items-center gap-3 opacity-80 flex-shrink-0">
          <div className="w-6 h-6 rounded-full flex items-center justify-center border border-black/5 bg-white/40">
            {isCard ? (
              <Layers className={`w-3 h-3 ${bodyTextColorClass}`} />
            ) : (
              <User className={`w-3 h-3 ${bodyTextColorClass}`} />
            )}
          </div>
          <div className="flex flex-col justify-center">
            <span className={`text-[10px] font-medium ${bodyTextColorClass}`}>
              {isCard ? 'Card' : node.projectNoteId ? 'Synced' : 'Local'}
            </span>
          </div>
          {isSelected && <GripHorizontal className={`ml-auto w-4 h-4 ${bodyTextColorClass}`} />}
        </div>

        {operationStatus && <NodeOperationOverlay status={operationStatus} />}
      </div>
    );
  },
  (prev, next) => {
    if (prev.node.id !== next.node.id) return false;

    const a = prev.node;
    const b = next.node;
    const nodeChanged =
      a.x !== b.x ||
      a.y !== b.y ||
      a.width !== b.width ||
      a.height !== b.height ||
      a.content !== b.content ||
      a.title !== b.title ||
      a.color !== b.color ||
      a.isLoading !== b.isLoading ||
      // cards
      a.kind !== b.kind ||
      a.cardId !== b.cardId ||
      a.dimmed !== b.dimmed ||
      a.boardCount !== b.boardCount ||
      (a.tags ?? []).join('|') !== (b.tags ?? []).join('|') ||
      // media / source (previously missing, caused stale cards after upload)
      a.type !== b.type ||
      a.imageUrl !== b.imageUrl ||
      a.mediaUrl !== b.mediaUrl ||
      a.pdfUrl !== b.pdfUrl ||
      a.youtubeId !== b.youtubeId ||
      a.pdfSource !== b.pdfSource ||
      a.projectNoteId !== b.projectNoteId;

    if (nodeChanged) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.operationStatus !== next.operationStatus) return false;
    if (Math.abs((prev.scale ?? 1) - (next.scale ?? 1)) > 0.01) return false;

    return true;
  }
);

NodeCard.displayName = 'NodeCard';
