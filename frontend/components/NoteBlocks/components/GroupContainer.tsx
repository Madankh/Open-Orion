import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NodeData, ColorTheme } from '@/typings/agent';
import { COLORS, TEXT_COLORS } from '../CreativeCanvasHelper/components/constants';
import { GripVertical, ArrowRightCircle } from 'lucide-react';

// Exporting constants for collision detection
export const GROUP_PADDING = 24;
export const GROUP_HEADER_HEIGHT = 0; // Title is outside, so no header height

interface GroupContainerProps {
  group: NodeData; // Now accepts unified NodeData with type: 'group'
  nodes: NodeData[];
  onMouseDown: (e: React.MouseEvent, groupId: string) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, newTitle: string) => void;
  onStartConnect: (id: string) => void;
  isSelected: boolean;
}

// Helper to get group's background color classes
const GROUP_COLORS: Record<ColorTheme, string> = {
  white: 'bg-white/40 backdrop-blur-sm border-gray-200',
  slate: 'bg-slate-100/40 backdrop-blur-sm border-slate-300',
  red: 'bg-red-50/40 backdrop-blur-sm border-red-300',
  green: 'bg-green-50/40 backdrop-blur-sm border-green-300',
  blue: 'bg-blue-50/40 backdrop-blur-sm border-blue-300',
  yellow: 'bg-yellow-50/40 backdrop-blur-sm border-yellow-300',
  orange: 'bg-orange-50/40 backdrop-blur-sm border-orange-300',
  purple: 'bg-purple-50/40 backdrop-blur-sm border-purple-300',
};

export const GroupContainer: React.FC<GroupContainerProps> = ({
  group,
  nodes,
  onMouseDown,
  onSelect,
  onRename,
  onStartConnect,
  isSelected,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(group.title);
  const inputRef = useRef<HTMLInputElement>(null);

  // Calculate bounding box based on children (nodes with parentId === group.id)
  const bounds = useMemo(() => {
    const groupNodes = nodes.filter(n => n.parentId === group.id && n.type !== 'group');
    
    if (groupNodes.length === 0) {
      // Use group's own position/size as fallback
      return { x: group.x, y: group.y, w: Math.max(group.width, 500), h: Math.max(group.height, 200) };
    }
    
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    groupNodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      
      // Use actual height or estimate based on type
      const estimatedHeight = node.height || (node.imageUrl || node.type === 'image' ? 450 : 250);
      maxY = Math.max(maxY, node.y + estimatedHeight);
    });

    // Add padding
    minX -= GROUP_PADDING;
    minY -= GROUP_PADDING;
    maxX += GROUP_PADDING;
    maxY += GROUP_PADDING;

    return {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY
    };
  }, [nodes, group.id, group.x, group.y, group.width, group.height]);

  // Focus input when editing
  useEffect(() => {
    if (isEditingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleValue.trim()) {
      onRename(group.id, titleValue);
    } else {
      setTitleValue(group.title);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag if not clicking input
    if ((e.target as HTMLElement).tagName !== 'INPUT') {
      e.stopPropagation();
      onSelect(group.id);
      onMouseDown(e, group.id);
    }
  };

  const textColorClass = TEXT_COLORS[group.color] || 'text-zinc-900';
  const groupColorClass = GROUP_COLORS[group.color] || GROUP_COLORS.white;

  return (
    <div
      className={`absolute rounded-3xl border-2 transition-colors duration-200 group
        ${groupColorClass}
        ${isSelected ? 'border-blue-400 ring-4 ring-blue-100' : ''}
      `}
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.w,
        height: bounds.h,
        zIndex: 0, // Groups render behind nodes
        pointerEvents: 'auto'
      }}
      // Allow dragging from body if clicking directly on background
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleMouseDown(e);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.stopPropagation();
          onSelect(group.id);
        }
      }}
    >
      {/* External Group Title / Drag Handle */}
      <div 
        className={`absolute -top-14 left-0 h-10 min-w-[150px] max-w-[300px] flex items-center px-4 pr-2 rounded-full border shadow-sm cursor-grab active:cursor-grabbing transition-transform hover:-translate-y-0.5
          ${COLORS[group.color]}
          ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
        `}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setIsEditingTitle(true);
        }}
      >
        <div className={`mr-2 opacity-50 ${textColorClass}`}>
          <GripVertical size={14} />
        </div>

        <div className="flex-1 mr-2 min-w-0">
          {isEditingTitle ? (
            <input 
              ref={inputRef}
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') {
                  setTitleValue(group.title);
                  setIsEditingTitle(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className={`bg-transparent border-b border-gray-400 font-bold text-sm focus:outline-none w-full ${textColorClass}`}
            />
          ) : (
            <span className={`font-bold text-sm tracking-wide truncate select-none block ${textColorClass}`}>
              {group.title}
            </span>
          )}
        </div>

        {/* Connect Button - Visible on Group Hover or Selection */}
        <button 
          onClick={(e) => { 
            e.stopPropagation(); 
            onStartConnect(group.id); 
          }}
          className={`p-1 rounded-full hover:bg-black/10 transition-colors ${textColorClass} opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100' : ''}`}
          title="Link group"
        >
          <ArrowRightCircle size={16} />
        </button>
      </div>
    </div>
  );
};