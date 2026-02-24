import {AISuggestion} from '@/typings/agent'

interface ProcessableItem {
  type: string;
  content: string;
}

const createTextSuggestion = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion => ({
  id: Date.now() + Math.random(),
  text: content,
  type: 'text',
  sourceType: 'agent_response' as const,
  suggestedBlockType: 'text' as const,
  parsedContent: { content },
  relatedBlockId: contextBlockId,
  relatedBlockType: currentContextBlockType,
  insertAfterBlockId: contextBlockId
});

const createHeadingSuggestion = (content: string, contextBlockId?: number,currentContextBlockType?:string): AISuggestion => {
  const level = (content.match(/^#+/) || ['#'])[0].length;
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'heading',
    sourceType: 'agent_response' as const,
    suggestedBlockType: 'heading' as const,
    parsedContent: {
      level,
      content: content.replace(/^#+\s*/, '')
    },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};


const createCodeSuggestion = (content: string, contextBlockId?: number, currentContextBlockType?: string): AISuggestion => {
  // Extract language and code from markdown code block
  const codeBlockMatch = content.match(/```(\w+)?\s*([\s\S]*?)\s*```/);
  
  let language = 'javascript'; // default
  let codeContent = content;
  
  if (codeBlockMatch) {
    language = codeBlockMatch[1] || 'javascript';
    codeContent = codeBlockMatch[2].trim();
  } else {
    // Handle case where content doesn't have ``` markers
    // Check if content starts with a language indicator
    const lines = content.split('\n');
    const firstLine = lines[0].trim();
    if (firstLine.match(/^(python|javascript|typescript|java|cpp|c\+\+|html|css|sql|bash|shell)$/i)) {
      language = firstLine.toLowerCase();
      codeContent = lines.slice(1).join('\n').trim();
    }
  }
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'code',
    sourceType: 'agent_response' as const,
    suggestedBlockType: 'code' as const,
    parsedContent: { 
      content: codeContent,
      language: language
    },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

// 🔥 ADD THIS: Missing Quote Suggestion Function
const createQuoteSuggestion = (content: string, contextBlockId?: number, currentContextBlockType?: string): AISuggestion => {
  // Clean quote content by removing quote markers
  const cleanContent = content
    .split('\n')
    .map(line => line.replace(/^>\s?/, '').trim())
    .join('\n')
    .trim();
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'quote',
    sourceType: 'agent_response' as const,
    suggestedBlockType: 'quote' as const,
    parsedContent: { content: cleanContent },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};



const createLatexSuggestion = (content: string, contextBlockId?: number,currentContextBlockType?:string): AISuggestion => ({
  id: Date.now() + Math.random(),
  text: content,
  type: 'latex',
  sourceType: 'agent_response' as const,
  suggestedBlockType: 'latex' as const,
  parsedContent: { content: content.replace(/^\$\$|\$\$/g, '') },
  relatedBlockId: contextBlockId,
  relatedBlockType: currentContextBlockType,
  insertAfterBlockId: contextBlockId
});

const createTableSuggestion = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion => {   
  // Handle both actual newlines and escaped newlines
  const normalizedContent = content.replace(/\\n/g, '\n');
  const rows = normalizedContent.split('\n').filter(row => row.includes('|'));   
  const data = rows     
    .filter(row => !row.includes('---'))     
    .map(row => row.split('|').slice(1, -1).map(cell => cell.trim()));      

  return {     
    id: Date.now() + Math.random(),     
    text: content,     
    type: 'table',     
    sourceType: 'agent_response' as const,     
    suggestedBlockType: 'table' as const,     
    parsedContent: { data },     
    relatedBlockId: contextBlockId,     
    relatedBlockType: currentContextBlockType,     
    insertAfterBlockId: contextBlockId   
  }; 
};

const createListSuggestion = (content: string, listType: string, contextBlockId?: number,currentContextBlockType?:string): AISuggestion => ({
  id: Date.now() + Math.random(),
  text: content,
  type: 'text',
  sourceType: 'agent_response' as const,
  suggestedBlockType: 'text' as const,
  parsedContent: { content },
  relatedBlockId: contextBlockId,
  relatedBlockType: currentContextBlockType,
  insertAfterBlockId: contextBlockId
});


export const processJsonArray = (data: ProcessableItem[], contextBlockId?: number): AISuggestion[] => {
  const suggestions: AISuggestion[] = [];
  let currentTextGroup = '';
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    if (!item.type || !item.content) continue;
    
    switch (item.type) {
      case 'heading':
        // Flush any accumulated text first
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createHeadingSuggestion(item.content, contextBlockId));
        break;
      
        case 'code':
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createCodeSuggestion(item.content, contextBlockId));
        break;
         
      case 'quote':
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createQuoteSuggestion(item.content, contextBlockId));
        break;

        
      case 'latex':
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createLatexSuggestion(item.content, contextBlockId));
        break;
        
      case 'table':
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createTableSuggestion(item.content, contextBlockId));
        break;
        
      case 'numbered-list':
        // Handle numbered list properly
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createNumberedListSuggestion(item.content, contextBlockId));
        break;
        
      case 'bullet':
        if (currentTextGroup.trim()) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        suggestions.push(createListSuggestion(item.content, item.type, contextBlockId));
        break;
        
      case 'text':
        // Smart grouping for small connector texts
        if (item.content.trim().length < 30 && !item.content.includes('\n')) {
          const nextItem = data[i + 1];
          if (nextItem && ['latex', 'bullet', 'numbered-list'].includes(nextItem.type)) {
            // Group with next item
            currentTextGroup += item.content + '\n\n';
            continue;
          }
        }
        
        currentTextGroup += item.content + '\n\n';
        
        // Check if we should flush the group
        const nextItem = data[i + 1];
        if (!nextItem || 
            ['heading', 'table', 'latex'].includes(nextItem.type) ||
            currentTextGroup.length > 300) {
          suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
          currentTextGroup = '';
        }
        break;
    }
  }
  
  // Add any remaining text
  if (currentTextGroup.trim()) {
    suggestions.push(createTextSuggestion(currentTextGroup.trim(), contextBlockId));
  }
  
  return suggestions;
};

export const processNumberedListContent = (content: string): string[] => {
  if (!content) return [''];
  
  console.log('Raw content:', content); // Debug log
  
  // Handle double-escaped newlines (\\n) by converting them to actual newlines
  const processedContent = content.replace(/\\n/g, '\n');
  console.log('After replacing \\n:', processedContent); // Debug log
  
  // Split by actual newlines
  const lines = processedContent.split('\n').filter(line => line.trim());
  console.log('Split lines:', lines); // Debug log
  
  const items: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      // Remove the number and period at the start (1., 2., 3., etc.)
      const cleanLine = trimmedLine.replace(/^\d+\.\s*/, '').trim();
      if (cleanLine) {
        items.push(cleanLine);
      }
    }
  }
  
  console.log('Processed items:', items); // Debug log
  return items.length > 0 ? items : [''];
};

const processBulletListContent = (content: string): string[] => {
  if (!content) return [''];
  
  // Handle double-escaped newlines (\\n) by converting them to actual newlines
  const processedContent = content.replace(/\\n/g, '\n');
  
  // Split by actual newlines
  const lines = processedContent.split('\n').filter(line => line.trim());
  const items: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      // Remove bullet markers (-, *, •)
      const cleanLine = trimmedLine.replace(/^[-*•]\s*/, '').trim();
      if (cleanLine) {
        items.push(cleanLine);
      }
    }
  }
  
  return items.length > 0 ? items : [''];
};


const createNumberedListSuggestion = (content: string, contextBlockId?: number, currentContextBlockType?: string): AISuggestion => {
  // Extract items from numbered list content with proper parsing
  const items = processNumberedListContentForParsing(content);
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'numbered-list',
    sourceType: 'agent_response' as const,
    suggestedBlockType: 'numbered-list' as const,
    parsedContent: { 
      content,
      items // Add items array for better handling
    },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

const processNumberedListContentForParsing = (content: string): string[] => {
  if (!content) return [];
  
  // Handle double-escaped newlines first
  const processedContent = content.replace(/\\n/g, '\n');
  
  // Split by actual newlines and process each line
  const lines = processedContent.split('\n').filter(line => line.trim());
  const items: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine) {
      // Remove the number and period at the start (1., 2., 3., etc.)
      const cleanLine = trimmedLine.replace(/^\d+\.\s*/, '').trim();
      if (cleanLine) {
        items.push(cleanLine);
      }
    }
  }
  
  return items;
};


export const handleAdvancedMarkdownResponse = (response: string, contextBlockId?: number): AISuggestion[] => {
  const suggestions: AISuggestion[] = [];
  
  // Split content into logical sections using multiple delimiters
  const sections = splitMarkdownIntoSections(response);
  
  for (const section of sections) {
    const sectionSuggestions = parseMarkdownSection(section.content, section.type, contextBlockId);
    suggestions.push(...sectionSuggestions);
  }
  
  return suggestions.length > 0 ? suggestions : [createTextSuggestion(response, contextBlockId)];
};

const splitMarkdownIntoSections = (content: string): Array<{type: string, content: string}> => {
  const sections: Array<{type: string, content: string}> = [];
  const lines = content.split('\n');
  let currentSection = '';
  let currentType = 'text';
  let inCodeBlock = false;
  // let codeBlockLanguage = '';
  let inTable = false;
  let inQuote = false;
  let inList = false;
  let listType = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Handle code blocks
    if (trimmedLine.startsWith('```')) {
      if (!inCodeBlock) {
        // Starting code block
        if (currentSection.trim()) {
          sections.push({type: currentType, content: currentSection.trim()});
          currentSection = '';
        }
        inCodeBlock = true;
        // codeBlockLanguage = trimmedLine.slice(3).trim();
        currentType = 'code';
        currentSection = line + '\n';
      } else {
        // Ending code block
        currentSection += line + '\n';
        sections.push({type: currentType, content: currentSection.trim()});
        currentSection = '';
        currentType = 'text';
        inCodeBlock = false;
        // codeBlockLanguage = '';
      }
      continue;
    }
    
    // If inside code block, just accumulate
    if (inCodeBlock) {
      currentSection += line + '\n';
      continue;
    }
    
    // Handle headings
    if (trimmedLine.match(/^#{1,6}\s+/)) {
      // Flush current section
      if (currentSection.trim()) {
        sections.push({type: currentType, content: currentSection.trim()});
        currentSection = '';
      }
      
      sections.push({type: 'heading', content: trimmedLine});
      currentType = 'text';
      inTable = false;
      inQuote = false;
      inList = false;
      continue;
    }
    
    // Handle tables
    if (trimmedLine.includes('|') && !inQuote) {
      if (!inTable) {
        // Starting table
        if (currentSection.trim()) {
          sections.push({type: currentType, content: currentSection.trim()});
          currentSection = '';
        }
        inTable = true;
        currentType = 'table';
        inQuote = false;
        inList = false;
      }
      currentSection += line + '\n';
      continue;
    } else if (inTable && trimmedLine === '') {
      // Empty line might end table, but check next non-empty line
      let nextNonEmptyIndex = i + 1;
      while (nextNonEmptyIndex < lines.length && lines[nextNonEmptyIndex].trim() === '') {
        nextNonEmptyIndex++;
      }
      
      if (nextNonEmptyIndex >= lines.length || !lines[nextNonEmptyIndex].includes('|')) {
        // End of table
        sections.push({type: currentType, content: currentSection.trim()});
        currentSection = '';
        currentType = 'text';
        inTable = false;
      } else {
        currentSection += line + '\n';
      }
      continue;
    } else if (inTable && !trimmedLine.includes('|')) {
      // Non-table line while in table - end table
      sections.push({type: currentType, content: currentSection.trim()});
      currentSection = '';
      currentType = 'text';
      inTable = false;
    }
    
    // Handle quotes
    if (trimmedLine.startsWith('>')) {
      if (!inQuote) {
        // Starting quote
        if (currentSection.trim()) {
          sections.push({type: currentType, content: currentSection.trim()});
          currentSection = '';
        }
        inQuote = true;
        currentType = 'quote';
        inTable = false;
        inList = false;
      }
      currentSection += line + '\n';
      continue;
    } else if (inQuote && trimmedLine !== '' && !trimmedLine.startsWith('>')) {
      // Non-quote line while in quote - end quote
      sections.push({type: currentType, content: currentSection.trim()});
      currentSection = '';
      currentType = 'text';
      inQuote = false;
    } else if (inQuote && trimmedLine === '') {
      // Empty line in quote - might continue
      currentSection += line + '\n';
      continue;
    }
    
    // Handle lists
    const numberedListMatch = trimmedLine.match(/^\d+\.\s+/);
    const bulletListMatch = trimmedLine.match(/^[-*+]\s+/);
    
    if (numberedListMatch || bulletListMatch) {
      const newListType = numberedListMatch ? 'numbered-list' : 'bullet';
      
      if (!inList || listType !== newListType) {
        // Starting new list or changing list type
        if (currentSection.trim()) {
          sections.push({type: currentType, content: currentSection.trim()});
          currentSection = '';
        }
        inList = true;
        listType = newListType;
        currentType = newListType;
        inTable = false;
        inQuote = false;
      }
      currentSection += line + '\n';
      continue;
    } else if (inList && trimmedLine !== '' && !trimmedLine.match(/^[-*+\d\.]\s+/) && !trimmedLine.match(/^\s+/)) {
      // Non-list line while in list (not indented continuation) - end list
      sections.push({type: currentType, content: currentSection.trim()});
      currentSection = '';
      currentType = 'text';
      inList = false;
      listType = '';
    } else if (inList && (trimmedLine === '' || trimmedLine.match(/^\s+/))) {
      // Empty line or indented line in list - might continue
      currentSection += line + '\n';
      continue;
    }
    
    // Handle LaTeX (both block and inline)
    if (trimmedLine.match(/^\$\$/) || (trimmedLine.includes('$$') && !inQuote)) {
      // Block LaTeX
      if (currentSection.trim()) {
        sections.push({type: currentType, content: currentSection.trim()});
        currentSection = '';
      }
      
      // Handle multi-line LaTeX
      let latexContent = line;
      if (!trimmedLine.endsWith('$$')) {
        // Multi-line LaTeX
        for (let j = i + 1; j < lines.length; j++) {
          latexContent += '\n' + lines[j];
          if (lines[j].trim().endsWith('$$')) {
            i = j; // Skip processed lines
            break;
          }
        }
      }
      
      sections.push({type: 'latex', content: latexContent});
      currentType = 'text';
      inTable = false;
      inQuote = false;
      inList = false;
      continue;
    }
    
    // Regular text line
    if (!inTable && !inQuote && !inList) {
      currentType = 'text';
    }
    currentSection += line + '\n';
  }
  
  // Add final section
  if (currentSection.trim()) {
    sections.push({type: currentType, content: currentSection.trim()});
  }
  
  return sections;
};

const parseMarkdownSection = (content: string, type: string, contextBlockId?: number): AISuggestion[] => {
  switch (type) {
    case 'heading':
      return [parseHeadingSection(content, contextBlockId)];
    
    case 'code':
      return [parseCodeSection(content, contextBlockId)];
    
    case 'table':
      return [parseTableSection(content, contextBlockId)];
    
    case 'quote':
      return [parseQuoteSection(content, contextBlockId)];
    
    case 'numbered-list':
      return [parseListSection(content, 'numbered-list', contextBlockId)];
    
    case 'bullet':
      return [parseListSection(content, 'bullet', contextBlockId)];
    
    case 'latex':
      return [parseLatexSection(content, contextBlockId)];
    
    case 'text':
    default:
      return parseTextSection(content, contextBlockId);
  }
};

const parseHeadingSection = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion => {
  const match = content.match(/^(#{1,6})\s+(.+)/);
  const level = match ? match[1].length : 1;
  const text = match ? match[2] : content.replace(/^#+\s*/, '');
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'heading',
    sourceType: 'agent_response',
    suggestedBlockType: 'heading',
    parsedContent: { level, content: text },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

const parseCodeSection = (content: string, contextBlockId?: number,currentContextBlockType?:string): AISuggestion => {
  const match = content.match(/```(\w+)?\n?([\s\S]*?)```/);
  const language = match?.[1] || 'javascript';
  const code = match?.[2] || content.replace(/```[\w]*\n?|```/g, '');
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'code',
    sourceType: 'agent_response',
    suggestedBlockType: 'code',
    parsedContent: { content: code.trim(), language },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

const parseTableSection = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion => {
  const lines = content.split('\n');
  const tableLines = lines.filter(line => line.includes('|') && !line.includes('---'));
  
  const data = tableLines.map(line => {
    return line.split('|')
      .slice(1, -1) // Remove first and last empty elements
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0);
  }).filter(row => row.length > 0);
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'table',
    sourceType: 'agent_response',
    suggestedBlockType: 'table',
    parsedContent: { data },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

const parseQuoteSection = (content: string, contextBlockId?: number,currentContextBlockType?:string): AISuggestion => {
  // Remove quote markers and clean up
  const cleanContent = content
    .split('\n')
    .map(line => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'quote',
    sourceType: 'agent_response',
    suggestedBlockType: 'quote',
    parsedContent: { content: cleanContent },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};


const parseListSection = (content: string, listType: 'numbered-list' | 'bullet', contextBlockId?: number, currentContextBlockType?: string): AISuggestion => {
  const items = listType === 'numbered-list' ? processNumberedListContent(content) : processBulletListContent(content);
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: listType,
    sourceType: 'agent_response',
    suggestedBlockType: listType,
    parsedContent: { 
      content: content.trim(),
      items: items.length > 0 ? items : undefined
    },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};
const parseLatexSection = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion => {
  const cleanContent = content.replace(/^\$\$|\$\$$/g, '').trim();
  
  return {
    id: Date.now() + Math.random(),
    text: content,
    type: 'latex',
    sourceType: 'agent_response',
    suggestedBlockType: 'latex',
    parsedContent: { content: cleanContent },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  };
};

const parseTextSection = (content: string, contextBlockId?: number, currentContextBlockType?:string): AISuggestion[] => {
  // Handle inline LaTeX in text
  const latexInlineRegex = /\$([^$]+)\$/g;
  const hasInlineLatex = latexInlineRegex.test(content);
  
  if (hasInlineLatex) {
    // For now, keep as text but could be enhanced to split inline LaTeX
    return [{
      id: Date.now() + Math.random(),
      text: content,
      type: 'text',
      sourceType: 'agent_response',
      suggestedBlockType: 'text',
      parsedContent: { content: content.trim() },
      relatedBlockId: contextBlockId,
      relatedBlockType: currentContextBlockType,
      insertAfterBlockId: contextBlockId
    }];
  }
  
  // Split long text into paragraphs if needed
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim());
  
  if (paragraphs.length > 1 && content.length > 500) {
    // Split into multiple text suggestions for very long content
    return paragraphs.map(paragraph => ({
      id: Date.now() + Math.random(),
      text: paragraph,
      type: 'text',
      sourceType: 'agent_response',
      suggestedBlockType: 'text',
      parsedContent: { content: paragraph.trim() },
      relatedBlockId: contextBlockId,
      relatedBlockType: currentContextBlockType,
      insertAfterBlockId: contextBlockId
    }));
  }
  
  // Single text suggestion
  return [{
    id: Date.now() + Math.random(),
    text: content,
    type: 'text',
    sourceType: 'agent_response',
    suggestedBlockType: 'text',
    parsedContent: { content: content.trim() },
    relatedBlockId: contextBlockId,
    relatedBlockType: currentContextBlockType,
    insertAfterBlockId: contextBlockId
  }];
};