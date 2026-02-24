import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, Image as ImageIcon, BarChart3, Table2, Type, Bookmark, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type SelectionType = 'text' | 'image' | 'chart' | 'table' | 'diagram' | 'mixed';

interface Selection {
  id: string;
  type: SelectionType;
  content: string;
  imageData?: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pageNumber: number;
  timestamp: string;
  tags: string[];
}

interface PDFDoc {
  id: string;
  name: string;
  file: File | unknown;
  url: string;
  numPages: number;
  uploadedAt: string;
}

interface AdvancedKnowledgeExtractorProps {
  pdfUrl?: string;
  pdfFile: File | unknown;
  onSelectionAdd?: (selection: Selection) => void;
  parentNodeId?: string;
  initialLocation?: {
    pageNumber: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  } | null;
}

const AdvancedKnowledgeExtractor: React.FC<AdvancedKnowledgeExtractorProps> = ({ 
  pdfUrl,
  pdfFile,
  onSelectionAdd,
  parentNodeId,
  initialLocation 
}) => {
  const [currentDocument, setCurrentDocument] = useState<PDFDoc | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [selectionMode, setSelectionMode] = useState<SelectionType | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState(false);

  const documentViewerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    if (pdfUrl && pdfFile && !currentDocument) {
      let docName = 'Reading Mode';
      if (pdfFile instanceof File) {
        docName = pdfFile.name;
      } else if (typeof pdfFile === 'string') {
        docName = pdfFile;
      } else if (Array.isArray(pdfFile) && pdfFile[0]?.name) {
        docName = pdfFile[0].name;
      }
      const newDoc: PDFDoc = {
        id: `doc-${Date.now()}`,
        name: docName,
        file: pdfFile,
        url: `${pdfUrl}`,
        numPages: 0,
        uploadedAt: new Date().toISOString()
      };
      setCurrentDocument(newDoc);
      setCurrentPage(1);
    }
  }, [pdfUrl, pdfFile, currentDocument]);

  useEffect(() => {
    if (initialLocation && currentDocument) {
        // Switch to the correct page
        setCurrentPage(initialLocation.pageNumber);
        
        // Create a temporary "highlight" selection to show the user where the content is
        const jumpSelection: Selection = {
            id: 'jump-highlight',
            type: 'mixed', // or 'text'
            content: '',
            pageNumber: initialLocation.pageNumber,
            boundingBox: initialLocation.boundingBox,
            timestamp: new Date().toISOString(),
            tags: []
        };
        
        // This will render the box using your existing renderSelectionOverlay or selection map logic
        // We add it to selections temporarily or set it as active (but non-editable)
        setActiveSelection(jumpSelection);
    }
  }, [initialLocation, currentDocument]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (currentDocument) {
      setCurrentDocument(prev => prev ? { ...prev, numPages } : null);
    }
  }, [currentDocument]);

  // Render current page to image for cropping
  const renderPageToImage = useCallback(async (pageNum: number): Promise<string | null> => {
    try {
      setIsRenderingPage(true);
      if (!currentDocument?.url) return null;

      const pdf = await pdfjs.getDocument(currentDocument.url).promise;
      const page = await pdf.getPage(pageNum);
      
      const scale = 2;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const context = canvas.getContext('2d');
      if (!context) return null;
      
      const renderContext = {
        canvas,
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      setIsRenderingPage(false);
      
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error rendering page:', error);
      setIsRenderingPage(false);
      return null;
    }
  }, [currentDocument?.url]);

  const extractFormattedContent = (range: Range): string => {
    const fragment = range.cloneContents();
    const spans = fragment.querySelectorAll('span');
    let formattedText = '';
    let lastY = 0;
    
    // If simple selection without multiple spans, return text
    if (spans.length === 0) return range.toString();

    spans.forEach((span) => {
        const style = window.getComputedStyle(span);
        const fontSize = parseFloat(style.fontSize);
        const text = span.textContent || '';
        const top = span.getBoundingClientRect().top; // Check for new line

        // 1. Detect New Lines (simplistic check)
        if (Math.abs(top - lastY) > 5 && lastY !== 0) {
            formattedText += '\n';
        }
        lastY = top;

        // 2. Detect Headers (Heuristic: Font > 20px)
        // Note: You might need to adjust '20' based on your PDF's scaling
        if (fontSize > 18) { // Assuming 18px is roughly an H2/H1
             formattedText += `### ${text}`; // Convert to Markdown Header
        } 
        // 3. Detect Bullets (PDFs often use specific chars for bullets)
        else if (text.trim().startsWith('•') || text.trim().startsWith('●') || text.trim().startsWith('-')) {
             formattedText += `- ${text.replace(/^[•●-]\s*/, '')}`; // Convert to Markdown List
        }
        // 4. Normal Text
        else {
             formattedText += text;
        }
    });

    // Fallback if the heuristics failed or DOM was messy (common in some PDFs)
    if (formattedText.trim().length === 0) return range.toString();

    return formattedText;
  };


  const handleTextSelection = useCallback(() => {
    if (selectionMode !== 'text') return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    // 1. Get the Raw DOM Range
    const range = selection.getRangeAt(0);
    
    // 2. Extract Styled Content
    // We try to format it, but if it fails, we fall back to standard text
    let capturedContent = extractFormattedContent(range);
    
    // Cleanup: Remove excessive whitespace often found in PDF text layers
    capturedContent = capturedContent.replace(/\s+/g, ' ').replace(/\n\s+/g, '\n');

    if (capturedContent.length > 0 && contentRef.current) {
      const rect = range.getBoundingClientRect();
      const containerRect = contentRef.current.getBoundingClientRect();

      const newSelection: Selection = {
        id: `sel-${Date.now()}`,
        type: 'text',
        content: capturedContent, // This now contains "### Title" or "- List item"
        boundingBox: {
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height
        },
        pageNumber: currentPage,
        timestamp: new Date().toISOString(),
        tags: []
      };
      
      console.log("Captured Formatted:", newSelection);
      setActiveSelection(newSelection);
    }
  }, [currentPage, selectionMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (selectionMode && selectionMode !== 'text' && e.button === 0 && contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      setIsSelecting(true);
      setSelectionStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setSelectionBox(null);
      e.preventDefault();
      e.stopPropagation();
    }
  }, [selectionMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelecting && selectionStart && contentRef.current) {
      const rect = contentRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;

      setSelectionBox({
        x: Math.min(selectionStart.x, currentX),
        y: Math.min(selectionStart.y, currentY),
        width: Math.abs(currentX - selectionStart.x),
        height: Math.abs(currentY - selectionStart.y)
      });
    }
  }, [isSelecting, selectionStart]);

  const handleMouseUp = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSelecting && selectionBox && selectionMode && currentDocument) {
      if (selectionBox.width > 10 && selectionBox.height > 10) {
        let imageData: string | undefined = undefined;
        
        // For non-text selections, render page and crop
        if (selectionMode !== 'text') {
          console.log('🖼️ Rendering page to capture image...');
          const pageImage = await renderPageToImage(currentPage);
          
          if (pageImage) {
            console.log('✅ Page rendered successfully');
            
            // Load image and crop it
            const img = new Image();
            img.onload = () => {
              try {
                // Get the display dimensions of contentRef
                const displayWidth = contentRef.current?.offsetWidth || 612;
                const displayHeight = contentRef.current?.offsetHeight || 792;
                
                // Calculate scale between rendered image and display
                const scaleX = img.width / displayWidth;
                const scaleY = img.height / displayHeight;
                
                console.log('📐 Scale factors:', { scaleX, scaleY, imgWidth: img.width, imgHeight: img.height, displayWidth, displayHeight });
                
                // Convert selection box to image coordinates
                const x = selectionBox.x * scaleX;
                const y = selectionBox.y * scaleY;
                const width = selectionBox.width * scaleX;
                const height = selectionBox.height * scaleY;
                
                console.log('✂️ Cropping:', { x, y, width, height });
                
                // Create canvas for cropped image
                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = Math.ceil(width);
                croppedCanvas.height = Math.ceil(height);
                
                const ctx = croppedCanvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
                  imageData = croppedCanvas.toDataURL('image/png');
                  console.log('✅ Image cropped successfully, size:', imageData.length);
                  
                  // Create selection with image data
                  const newSelection: Selection = {
                    id: `sel-${Date.now()}`,
                    type: selectionMode,
                    content: `${selectionMode} selection from page ${currentPage}`,
                    imageData: imageData,
                    boundingBox: selectionBox,
                    pageNumber: currentPage,
                    timestamp: new Date().toISOString(),
                    tags: []
                  };
                  
                  setActiveSelection(newSelection);
                }
              } catch (error) {
                console.error('❌ Error processing image:', error);
                const newSelection: Selection = {
                  id: `sel-${Date.now()}`,
                  type: selectionMode,
                  content: `${selectionMode} selection from page ${currentPage}`,
                  boundingBox: selectionBox,
                  pageNumber: currentPage,
                  timestamp: new Date().toISOString(),
                  tags: []
                };
                setActiveSelection(newSelection);
              }
            };
            img.onerror = () => {
              console.error('❌ Failed to load image');
              const newSelection: Selection = {
                id: `sel-${Date.now()}`,
                type: selectionMode,
                content: `${selectionMode} selection from page ${currentPage}`,
                boundingBox: selectionBox,
                pageNumber: currentPage,
                timestamp: new Date().toISOString(),
                tags: []
              };
              setActiveSelection(newSelection);
            };
            img.src = pageImage;
          }
        }
      }
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionBox(null);
    }
  }, [isSelecting, selectionBox, selectionMode, currentDocument, currentPage, renderPageToImage]);

  const addToKnowledge = useCallback((selection: Selection) => {
    console.log('Adding selection with page number:', selection.pageNumber);
    if (onSelectionAdd) {
      onSelectionAdd(selection);
      setActiveSelection(null);
      return;
    }

    if (!currentDocument) return;
    
    setSelections(prev => [...prev, selection]);
    setActiveSelection(null);
  }, [onSelectionAdd, currentDocument]);

  const renderSelectionOverlay = () => {
    if (!activeSelection) return null;

    const buttonTop = activeSelection.boundingBox.y > 60 
      ? activeSelection.boundingBox.y - 50 
      : activeSelection.boundingBox.y + activeSelection.boundingBox.height + 10;

    return (
      <div
        className="absolute pointer-events-none z-50"
        style={{
          left: activeSelection.boundingBox.x,
          top: activeSelection.boundingBox.y,
          width: activeSelection.boundingBox.width,
          height: activeSelection.boundingBox.height
        }}
      >
        <div className="absolute inset-0 bg-blue-400 opacity-20 border-2 border-blue-500 rounded" />
        <div 
          className="absolute left-0 bg-white rounded-lg shadow-2xl p-2 flex gap-2 pointer-events-auto border border-gray-200"
          style={{ top: buttonTop - activeSelection.boundingBox.y }}
        >
          <button
            onClick={() => addToKnowledge(activeSelection)}
            className="px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm flex items-center gap-1.5 font-medium shadow-sm"
          >
            <Bookmark size={14} />
            {onSelectionAdd ? 'Add to Canvas' : 'Add'}
          </button>

          <button
            onClick={() => setActiveSelection(null)}
            className="px-2 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full bg-gray-50">
      <style>{`
        .react-pdf__Page__textContent {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          right: 0 !important;
          bottom: 0 !important;
          overflow: hidden !important;
          opacity: ${selectionMode === 'text' ? '1' : '0.01'} !important;
          line-height: 1 !important;
          pointer-events: ${selectionMode === 'text' ? 'auto' : 'none'} !important;
        }

        .react-pdf__Page__textContent span {
          color: transparent !important;
          position: absolute !important;
          white-space: pre !important;
          cursor: text !important;
          transform-origin: 0% 0% !important;
        }

        .react-pdf__Page__canvas {
          display: block !important;
          user-select: none !important;
        }

        .react-pdf__Page {
          position: relative !important;
        }
      `}</style>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentDocument && (
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <FileText size={16} className="text-blue-600" />
                  <span className="text-sm font-medium text-gray-900 max-w-xs truncate">{currentDocument.name}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setSelectionMode(selectionMode === 'text' ? null : 'text')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-1.5 ${
                    selectionMode === 'text'
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Select text"
                >
                  <Type size={16} />
                  Text
                </button>
                <button
                  onClick={() => setSelectionMode(selectionMode === 'image' ? null : 'image')}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition flex items-center gap-1.5 ${
                    selectionMode === 'image'
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                  title="Select image"
                >
                  <ImageIcon size={16} />
                  Image
                </button>

              </div>

              {currentDocument && (
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                    className="p-1.5 hover:bg-white rounded transition"
                    title="Zoom out"
                  >
                    <ZoomOut size={16} className="text-gray-600" />
                  </button>
                  <span className="px-2 text-sm font-medium text-gray-700 min-w-[3rem] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={() => setScale(Math.min(2, scale + 0.1))}
                    className="p-1.5 hover:bg-white rounded transition"
                    title="Zoom in"
                  >
                    <ZoomIn size={16} className="text-gray-600" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PDF Viewer */}
        <div className="flex-1 overflow-auto bg-gray-100">
          {currentDocument ? (
            <div className="flex justify-center items-start py-8">
              <div style={{ display: 'inline-block' }}>
                <div
                  ref={documentViewerRef}
                  className="bg-white shadow-2xl rounded-lg overflow-hidden"
                >
                  <div 
                    ref={contentRef}
                    className="relative"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseUpCapture={selectionMode === 'text' ? handleTextSelection : undefined}
                    style={{ 
                      userSelect: selectionMode === 'text' ? 'text' : 'none',
                      cursor: selectionMode && selectionMode !== 'text' ? 'crosshair' : selectionMode === 'text' ? 'text' : 'default'
                    }}
                  >
                    <Document 
                      file={currentDocument.url} 
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading={
                        <div className="flex items-center justify-center p-12">
                          <div className="text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-3"></div>
                            <p className="text-gray-500">Loading PDF...</p>
                          </div>
                        </div>
                      }
                      error={
                        <div className="p-12 text-center">
                          <p className="text-red-500 font-medium">Error loading PDF</p>
                          <p className="text-sm text-gray-500 mt-2">Please try uploading again</p>
                        </div>
                      }
                    >
                      <Page 
                        pageNumber={currentPage} 
                        scale={scale}
                        renderTextLayer={true}
                        renderAnnotationLayer={true}
                        loading={
                          <div className="flex items-center justify-center p-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                          </div>
                        }
                      />
                    </Document>

                    {isRenderingPage && (
                      <div className="absolute inset-0 bg-black/10 flex items-center justify-center rounded">
                        <div className="bg-white px-4 py-2 rounded-lg shadow">
                          <p className="text-sm text-gray-700">Processing image...</p>
                        </div>
                      </div>
                    )}

                    {isSelecting && selectionBox && (
                      <div
                        className="absolute border-2 border-dashed pointer-events-none"
                        style={{
                          left: selectionBox.x,
                          top: selectionBox.y,
                          width: selectionBox.width,
                          height: selectionBox.height,
                          zIndex: 9999,
                          borderColor: selectionMode === 'image' ? '#8B5CF6' : selectionMode === 'chart' ? '#10B981' : selectionMode === 'table' ? '#F59E0B' : '#3B82F6',
                          backgroundColor: selectionMode === 'image' ? 'rgba(139, 92, 246, 0.1)' : selectionMode === 'chart' ? 'rgba(16, 185, 129, 0.1)' : selectionMode === 'table' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                        }}
                      />
                    )}

                    {renderSelectionOverlay()}

                    {selections.filter(sel => sel.pageNumber === currentPage).map(sel => (
                      <div
                        key={sel.id}
                        className="absolute border-2 pointer-events-none rounded"
                        style={{
                          left: sel.boundingBox.x,
                          top: sel.boundingBox.y,
                          width: sel.boundingBox.width,
                          height: sel.boundingBox.height,
                          zIndex: 10,
                          borderColor: sel.type === 'text' ? '#3B82F6' : sel.type === 'image' ? '#8B5CF6' : sel.type === 'chart' ? '#10B981' : '#F59E0B',
                          backgroundColor: sel.type === 'text' ? 'rgba(59, 130, 246, 0.05)' : sel.type === 'image' ? 'rgba(139, 92, 246, 0.05)' : sel.type === 'chart' ? 'rgba(16, 185, 129, 0.05)' : 'rgba(245, 158, 11, 0.05)'
                        }}
                      />
                    ))}
                  </div>

                  {/* Page Navigation */}
                  <div className="border-t border-gray-200 p-4 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-black border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition shadow-sm"
                    >
                      <ChevronLeft size={16} />
                      Previous
                    </button>
                    <span className="text-sm font-medium text-gray-700">
                      Page {currentPage} of {numPages || '...'}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
                      disabled={currentPage === numPages || numPages === 0}
                      className="px-4 py-2 bg-black border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition shadow-sm"
                    >
                      Next
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <FileText size={64} className="mx-auto mb-4 text-gray-300" />
                <h3 className="text-xl font-semibold text-gray-700 mb-2">No PDF Loaded</h3>
                <p className="text-gray-500">PDF will load automatically</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectionMode && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-40">
          {selectionMode === 'text' && <Type size={20} />}
          {selectionMode === 'image' && <ImageIcon size={20} />}
          {selectionMode === 'chart' && <BarChart3 size={20} />}
          {selectionMode === 'table' && <Table2 size={20} />}
          <span className="font-medium">
            {selectionMode === 'text' && 'Text Selection Mode - Highlight text to capture'}
            {selectionMode === 'image' && 'Image Selection Mode - Click and drag to select area'}
            {selectionMode === 'chart' && 'Chart Selection Mode - Click and drag to select area'}
            {selectionMode === 'table' && 'Table Selection Mode - Click and drag to select area'}
          </span>
          <button
            onClick={() => setSelectionMode(null)}
            className="ml-2 px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-sm transition"
          >
            Exit
          </button>
        </div>
      )}
    </div>
  );
};

export default AdvancedKnowledgeExtractor;