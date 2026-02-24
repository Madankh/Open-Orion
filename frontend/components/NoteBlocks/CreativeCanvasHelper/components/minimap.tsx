import React, { useMemo } from "react";
import { NodeData} from '@/typings/agent';

const Minimap: React.FC<{
    nodes: NodeData[];
    viewport: { x: number; y: number };
    scale: number;
    setViewport: (v: { x: number; y: number }) => void;
    screenWidth: number;
    screenHeight: number;
}> = ({ nodes, viewport, scale, setViewport, screenWidth, screenHeight }) => {
    // minmap resize place
    const MINIMAP_WIDTH = 90;  
    const MINIMAP_HEIGHT = 90; 

    // 1. Calculate the bounding box of all nodes
    const bounds = useMemo(() => {
        if (nodes.length === 0) return { minX: -500, maxX: 500, minY: -500, maxY: 500, width: 1000, height: 1000 };
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x + n.width > maxX) maxX = n.x + n.width;
            if (n.y < minY) minY = n.y;
            if (n.y + n.height > maxY) maxY = n.y + n.height;
        });

        // Add padding around the map so nodes aren't on the very edge
        const padding = 500; 
        return { 
            minX: minX - padding, 
            maxX: maxX + padding, 
            minY: minY - padding, 
            maxY: maxY + padding,
            width: (maxX + padding) - (minX - padding),
            height: (maxY + padding) - (minY - padding)
        };
    }, [nodes]);

    // 2. Map dimensions
    // We calculate scale based on the Width/Height constants we defined above
    const mapScale = Math.min(
        MINIMAP_WIDTH / bounds.width, 
        MINIMAP_HEIGHT / bounds.height
    );

    // 3. Current Viewport calculation (The red box)
    const viewX = -viewport.x / scale;
    const viewY = -viewport.y / scale;
    const viewW = screenWidth / scale;
    const viewH = screenHeight / scale;

    // 4. Click to jump logic
    const handleClick = (e: React.MouseEvent) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;

        // Convert click on map -> Canvas Coordinates
        const canvasX = bounds.minX + (clickX / mapScale);
        const canvasY = bounds.minY + (clickY / mapScale);

        // Center the viewport on that spot
        setViewport({
            x: -(canvasX * scale) + (screenWidth / 2),
            y: -(canvasY * scale) + (screenHeight / 2)
        });
    };

    return (
        <div 
            // 🟢 UPDATED: Use style for width/height instead of hardcoded tailwind classes
            style={{ 
                width: MINIMAP_WIDTH, 
                height: MINIMAP_HEIGHT 
            }}
            className="absolute bottom-6 left-6 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden z-50 cursor-crosshair opacity-90 hover:opacity-100 transition-opacity"
            onClick={handleClick}
        >
            <div className="relative w-full h-full bg-gray-50">
                {/* Render Nodes */}
                {nodes.map(node => (
                    <div
                        key={node.id}
                        className="absolute bg-gray-300 rounded-[2px]"
                        style={{
                            left: (node.x - bounds.minX) * mapScale,
                            top: (node.y - bounds.minY) * mapScale,
                            // Ensure nodes are at least 2px big so they are visible
                            width: Math.max(2, node.width * mapScale),
                            height: Math.max(2, node.height * mapScale),
                            backgroundColor: node.color || '#cbd5e1'
                        }}
                    />
                ))}

                {/* Render Viewport Indicator (Red Box) */}
                <div
                    className="absolute border-2 border-red-500 bg-red-500/10 pointer-events-none"
                    style={{
                        left: (viewX - bounds.minX) * mapScale,
                        top: (viewY - bounds.minY) * mapScale,
                        width: viewW * mapScale,
                        height: viewH * mapScale,
                    }}
                />
            </div>
        </div>
    );
};

export default Minimap;