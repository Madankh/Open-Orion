import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FileText, Image as ImageIcon, Type, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Brain, X } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { pythonUrl,nodeUrl } from "../../apiurl"
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

type SelectionType = 'text' | 'image';

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
}

interface PDFDoc {
  id: string;
  name: string;
  file: File;
  url: string;
  numPages: number;
  uploadedAt: string;
}

interface AdvancedKnowledgeExtractorProps {
  pdfUrl?: string;
  pdfFile?: File;
  onAskAI?: (prompt: string, selection: Selection, pdfUrl?: string) => void;
  parentNodeId?: string;
}

const AdvancedKnowledgeExtractor: React.FC<AdvancedKnowledgeExtractorProps> = ({ 
  pdfUrl,
  pdfFile,
  onAskAI, 
}) => {
  const [currentDocument, setCurrentDocument] = useState<PDFDoc | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [selectionMode, setSelectionMode] = useState<SelectionType | null>(null);
  const [activeSelection, setActiveSelection] = useState<Selection | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isSubmittingAI, setIsSubmittingAI] = useState(false);

  const documentViewerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pdfUrl && pdfFile && !currentDocument) {
      const newDoc: PDFDoc = {
        id: `doc-${Date.now()}`,
        name: pdfFile.name,
        file: pdfFile,
        url: `${pythonUrl}${pdfUrl}`,
        numPages: 0,
        uploadedAt: new Date().toISOString()
      };
      setCurrentDocument(newDoc);
      setCurrentPage(1);
    }
  }, [pdfUrl, pdfFile, currentDocument]);
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    if (currentDocument) {
      setCurrentDocument(prev => prev ? { ...prev, numPages } : null);
    }
  }, [currentDocument]);

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

  const handleTextSelection = useCallback(() => {
    if (selectionMode !== 'text') return;
    
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 0 && currentDocument && contentRef.current) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      const containerRect = contentRef.current.getBoundingClientRect();

      if (rect && containerRect) {
        const newSelection: Selection = {
          id: `sel-${Date.now()}`,
          type: 'text',
          content: selectedText,
          boundingBox: {
            x: rect.left - containerRect.left,
            y: rect.top - containerRect.top,
            width: rect.width,
            height: rect.height
          },
          pageNumber: currentPage,
          timestamp: new Date().toISOString()
        };

        setActiveSelection(newSelection);
        setTimeout(() => selection?.removeAllRanges(), 100);
      }
    }
  }, [currentDocument, currentPage, selectionMode]);

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
        if (selectionMode === 'image') {
          const pageImage = await renderPageToImage(currentPage);
          
          if (pageImage) {
            const img = new Image();
            img.onload = () => {
              try {
                const displayWidth = contentRef.current?.offsetWidth || 512;
                const displayHeight = contentRef.current?.offsetHeight || 692;
                
                const scaleX = img.width / displayWidth;
                const scaleY = img.height / displayHeight;
                
                const x = selectionBox.x * scaleX;
                const y = selectionBox.y * scaleY;
                const width = selectionBox.width * scaleX;
                const height = selectionBox.height * scaleY;
                
                const croppedCanvas = document.createElement('canvas');
                croppedCanvas.width = Math.ceil(width);
                croppedCanvas.height = Math.ceil(height);
                
                const ctx = croppedCanvas.getContext('2d');
                if (ctx) {
                  ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
                  const imageData = croppedCanvas.toDataURL('image/png');
                  
                  const newSelection: Selection = {
                    id: `sel-${Date.now()}`,
                    type: 'image',
                    content: `Image from page ${currentPage}`,
                    imageData: imageData,
                    boundingBox: selectionBox,
                    pageNumber: currentPage,
                    timestamp: new Date().toISOString()
                  };
                  
                  setActiveSelection(newSelection);
                }
              } catch (error) {
                console.error('Error processing image:', error);
              }
            };
            img.onerror = () => {
              console.error('Failed to load image');
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

  const handleAskAI = useCallback(async () => {
    if (!activeSelection || !aiPrompt.trim() || !onAskAI) return;
    
    setIsSubmittingAI(true);
    try {
      onAskAI(aiPrompt, activeSelection, pdfUrl);
      setShowAIModal(false);
      setAiPrompt('');
      setActiveSelection(null);
    } catch (error) {
      console.error('Error sending AI request:', error);
    } finally {
      setIsSubmittingAI(false);
    }
  }, [activeSelection, aiPrompt, onAskAI, pdfUrl]);

  const getSuggestedPrompts = useCallback((selectionType: SelectionType): string[] => {
    if (selectionType === 'text') {
      return [
        'Explain this text',
        'Summarize this',
        'Simplify this',
        'Expand on this',
        'Find key points'
      ];
    } else {
      return [
        'Describe this image',
        'What is shown here?',
        'Extract information',
        'Analyze this image',
        'Explain in detail'
      ];
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowAIModal(false);
    setAiPrompt('');
  }, []);

  const renderSelectionOverlay = () => {
    if (!activeSelection) return null;

    const buttonY = activeSelection.boundingBox.y > 100 
      ? activeSelection.boundingBox.y - 60 
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
          className="absolute bg-white rounded-lg shadow-2xl p-2 pointer-events-auto border border-gray-200"
          style={{ 
            top: buttonY - activeSelection.boundingBox.y,
            left: 0
          }}
        >
          <button
            onClick={() => setShowAIModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2 font-medium shadow-sm transition-colors"
            title={`Ask AI about this ${activeSelection.type}`}
          >
            <Brain size={16} />
            Ask AI
          </button>

          <button
            onClick={() => setActiveSelection(null)}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 text-sm mt-2 w-full text-left"
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
                {/* <button
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
                </button> */}
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
                      file={`${pythonUrl}${pdfUrl}`} 
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
                        renderAnnotationLayer={false}
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
                          borderColor: selectionMode === 'image' ? '#8B5CF6' : '#3B82F6',
                          backgroundColor: selectionMode === 'image' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(59, 130, 246, 0.1)'
                        }}
                      />
                    )}

                    {renderSelectionOverlay()}
                  </div>

                  <div className="border-t border-gray-200 p-4 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 bg-black border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition shadow-sm text-white"
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
                      className="px-4 py-2 bg-black border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium transition shadow-sm text-white"
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
          <span className="font-medium">
            {selectionMode === 'text' && 'Text Selection Mode - Highlight text'}
            {selectionMode === 'image' && 'Image Selection Mode - Click and drag'}
          </span>
          <button
            onClick={() => setSelectionMode(null)}
            className="ml-2 px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-full text-sm transition"
          >
            Exit
          </button>
        </div>
      )}

      {showAIModal && activeSelection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Brain size={20} className="text-blue-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">Ask AI</h2>
                  <p className="text-sm text-gray-500">About {activeSelection.type === 'text' ? 'selected text' : 'selected image'}</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {activeSelection.type === 'image' && activeSelection.imageData && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Selected Image:</p>
                  <img 
                    src={activeSelection.imageData} 
                    alt="Selected content"
                    className="max-w-full h-auto rounded-lg border border-gray-200 max-h-48"
                  />
                </div>
              )}

              {activeSelection.type === 'text' && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Selected Text:</p>
                  <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-32 overflow-y-auto">
                    <p className="text-sm text-gray-700">{activeSelection.content}</p>
                  </div>
                </div>
              )}

              {/* Suggested Prompts */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Quick suggestions:</p>
                <div className="grid grid-cols-2 gap-2">
                  {getSuggestedPrompts(activeSelection.type).map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setAiPrompt(prompt)}
                      className="px-3 py-2 text-left text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Your question:
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask anything about this content..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-black"
                  rows={4}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                disabled={isSubmittingAI}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAskAI}
                disabled={!aiPrompt.trim() || isSubmittingAI}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2 font-medium"
              >
                {isSubmittingAI && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                {isSubmittingAI ? 'Sending...' : 'Ask AI'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdvancedKnowledgeExtractor;