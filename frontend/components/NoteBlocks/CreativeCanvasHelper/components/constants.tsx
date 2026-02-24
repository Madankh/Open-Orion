import { NodeData, Connection, ColorTheme, GlobalNote } from '@/typings/agent';

// Node Colors:
// Updated to use colored backgrounds (pastels/light shades) so the node takes the color.
export const COLORS: Record<ColorTheme, string> = {
  white: 'bg-white border-gray-200',
  slate: 'bg-slate-100 border-slate-300',
  red: 'bg-red-100 border-red-300',
  green: 'bg-green-100 border-green-300',
  blue: 'bg-blue-100 border-blue-300',
  yellow: 'bg-yellow-100 border-yellow-300',
  orange: 'bg-orange-100 border-orange-300',
  purple: 'bg-purple-100 border-purple-300',
};

// Text Colors:
// Darker text for readability on light backgrounds
export const TEXT_COLORS: Record<ColorTheme, string> = {
  white: 'text-zinc-900',
  slate: 'text-slate-900',
  red: 'text-red-900',
  green: 'text-emerald-900',
  blue: 'text-blue-900',
  yellow: 'text-yellow-900',
  orange: 'text-orange-900',
  purple: 'text-purple-900',
};

// Content Text Colors (Body):
// Slightly softer dark colors matching the theme
export const BODY_TEXT_COLORS: Record<ColorTheme, string> = {
  white: 'text-zinc-500',
  slate: 'text-slate-600',
  red: 'text-red-800',
  green: 'text-emerald-800',
  blue: 'text-blue-800',
  yellow: 'text-yellow-800',
  orange: 'text-orange-800',
  purple: 'text-purple-800',
};

// Group Colors: Light pastel backgrounds for light mode canvas
export const GROUP_COLORS: Record<ColorTheme, string> = {
  white: 'border-zinc-300 bg-zinc-100/50',
  slate: 'border-slate-300 bg-slate-100/50',
  red: 'border-red-200 bg-red-50/50',
  green: 'border-emerald-200 bg-emerald-50/50',
  blue: 'border-blue-200 bg-blue-50/50',
  yellow: 'border-yellow-200 bg-yellow-50/50',
  orange: 'border-orange-200 bg-orange-50/50',
  purple: 'border-purple-200 bg-purple-50/50',
};

// Connection Colors: SVG hex values
export const CONNECTION_COLORS: Record<ColorTheme, string> = {
  white: '#a1a1aa',
  slate: '#94a3b8',
  red: '#f87171',
  green: '#34d399',
  blue: '#60a5fa',
  yellow: '#facc15',
  orange: '#fb923c',
  purple: '#c084fc',
};

// Global Notes
export const INITIAL_GLOBAL_NOTES: GlobalNote[] = [
  {
    id: 'gn1',
    title: 'Q3 Goals',
    content: '1. Increase user retention\n2. Ship the mobile app\n3. Hire 2 designers',
    color: 'yellow',
    createdAt: Date.now()
  },
  {
    id: 'gn2',
    title: 'Meeting Notes',
    content: 'Discussed the marketing budget. We need to allocate more to social ads.',
    color: 'white',
    createdAt: Date.now() - 10000
  }
];

// Initial Nodes (INCLUDING GROUPS as type: 'group')
export const INITIAL_NODES: NodeData[] = [
  // GROUP 1: OpenAI Strategy
  {
    id: 'g1',
    type: 'group',
    title: 'OpenAI Strategy',
    content: '',
    x: 100,
    y: 100,
    width: 800,
    height: 400,
    color: 'purple',
    childIds: ['n1', 'n2'],
    level: 0,
    isExpanded: true,
  },
  {
    id: 'n1',
    type: 'text',
    title: 'GPT-4o Launch',
    content: 'New model with vision capabilities',
    x: 150,
    y: 180,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g1',
    childIds: [],
    level: 1,
    isExpanded: true,
  },
  {
    id: 'n2',
    type: 'text',
    title: 'API Pricing',
    content: 'Competitive pricing vs competitors',
    x: 520,
    y: 180,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g1',
    childIds: [],
    level: 1,
    isExpanded: true,
  },

  // GROUP 2: Dev Ecosystem
  {
    id: 'g2',
    type: 'group',
    title: 'Dev Ecosystem',
    content: '',
    x: 1000,
    y: 100,
    width: 800,
    height: 400,
    color: 'blue',
    childIds: ['n3', 'n4', 'n5'],
    level: 0,
    isExpanded: true,
  },
  {
    id: 'n3',
    type: 'text',
    title: 'SDKs',
    content: 'Python, Node.js, and .NET support',
    x: 1050,
    y: 180,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g2',
    childIds: [],
    level: 1,
    isExpanded: true,
  },
  {
    id: 'n4',
    type: 'text',
    title: 'Documentation',
    content: 'Comprehensive API docs and examples',
    x: 1420,
    y: 180,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g2',
    childIds: [],
    level: 1,
    isExpanded: true,
  },
  {
    id: 'n5',
    type: 'text',
    title: 'Community',
    content: 'Active developer forums and support',
    x: 1050,
    y: 420,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g2',
    childIds: [],
    level: 1,
    isExpanded: true,
  },

  // GROUP 3: AI Landscape
  {
    id: 'g3',
    type: 'group',
    title: 'AI Landscape',
    content: '',
    x: 100,
    y: 600,
    width: 500,
    height: 400,
    color: 'slate',
    childIds: ['n6'],
    level: 0,
    isExpanded: true,
  },
  {
    id: 'n6',
    type: 'text',
    title: 'Competitors',
    content: 'Anthropic, Google, Meta AI',
    x: 150,
    y: 680,
    width: 320,
    height: 200,
    color: 'white',
    parentId: 'g3',
    childIds: [],
    level: 1,
    isExpanded: true,
  },

  // STANDALONE NODES (No parent)
  {
    id: 'n7',
    type: 'text',
    title: 'Future Trends',
    content: 'Multimodal AI, agents, and reasoning',
    x: 700,
    y: 700,
    width: 320,
    height: 200,
    color: 'yellow',
    childIds: [],
    level: 0,
    isExpanded: true,
  },
  {
    id: 'n8',
    type: 'text',
    title: 'Ethical Considerations',
    content: 'Safety, alignment, and responsible AI',
    x: 1100,
    y: 700,
    width: 320,
    height: 200,
    color: 'orange',
    childIds: [],
    level: 0,
    isExpanded: true,
  },
];

// Connections
export const INITIAL_CONNECTIONS: Connection[] = [
  { 
    id: 'c1', 
    fromId: 'n1', 
    toId: 'n2', 
    label: 'pricing strategy', 
    strokeStyle: 'solid', 
    arrowType: 'end', 
    color: 'slate'
  },
  { 
    id: 'c2', 
    fromId: 'n4', 
    toId: 'n5', 
    label: 'supports', 
    strokeStyle: 'solid', 
    arrowType: 'end', 
    color: 'slate' 
  },
  { 
    id: 'c3', 
    fromId: 'n3', 
    toId: 'n6',
    label: 'compares to', 
    strokeStyle: 'dashed', 
    arrowType: 'end', 
    color: 'slate' 
  },
  { 
    id: 'c4', 
    fromId: 'g1', 
    toId: 'g2',
    label: 'enables', 
    strokeStyle: 'solid', 
    arrowType: 'end', 
    color: 'blue' 
  },
  { 
    id: 'c5', 
    fromId: 'n6', 
    toId: 'n7',
    label: 'influences', 
    strokeStyle: 'dotted', 
    arrowType: 'end', 
    color: 'yellow' 
  },
];