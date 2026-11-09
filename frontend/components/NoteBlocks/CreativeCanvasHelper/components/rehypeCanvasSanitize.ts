type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  [key: string]: unknown;
};

const ALLOWED_TAGS = new Set([
  'a', 'blockquote', 'br', 'caption', 'code', 'del', 'details', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input', 'label',
  'li', 'mark', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const DROP_CONTENT_TAGS = new Set([
  'embed', 'iframe', 'math', 'noembed', 'noscript', 'object', 'script', 'style',
  'svg', 'template',
]);

const GLOBAL_ATTRIBUTES = new Set(['class', 'classname', 'title', 'style']);
const TAG_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  details: new Set(['open']),
  img: new Set(['src', 'alt', 'width', 'height', 'datas3key', 'datapdfpage']),
  input: new Set(['type', 'checked', 'disabled']),
  li: new Set(['datatype', 'datachecked']),
  mark: new Set(['datacolor']),
  ol: new Set(['start', 'type']),
  span: new Set(['datatype', 'datalatex', 'datadisplay', 'datanotelinkid']),
  summary: new Set(['contenteditable']),
  td: new Set(['colspan', 'rowspan', 'colwidth']),
  th: new Set(['colspan', 'rowspan', 'colwidth']),
  ul: new Set(['datatype']),
};

const SAFE_STYLE_PROPERTIES = new Set([
  'background-color', 'color', 'height', 'max-height', 'max-width', 'text-align',
  'text-decoration', 'width',
]);
const SAFE_URL_SCHEMES: Record<string, Set<string>> = {
  href: new Set(['http', 'https', 'mailto', 'tel']),
  src: new Set(['http', 'https']),
};
const SAFE_RASTER_DATA_IMAGE = /^data:image\/(?:png|gif|jpe?g|webp);base64,[a-z0-9+/=]+$/i;

const normalizeAttributeName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function isSafeUrl(value: unknown, attribute: 'href' | 'src'): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return true;

  if (/^data:/i.test(trimmed)) {
    return attribute === 'src' && trimmed.length <= 1_000_000 && SAFE_RASTER_DATA_IMAGE.test(trimmed);
  }

  const normalized = trimmed.replace(/[\u0000-\u0020\u007f]/g, '').toLowerCase();
  const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/)?.[1];
  return !scheme || SAFE_URL_SCHEMES[attribute].has(scheme);
}

function isSafeCssValue(property: string, value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || /url\s*\(|expression\s*\(|@import|\\|[<>]/i.test(normalized)) return false;

  if (property === 'text-align') return /^(left|right|center|justify|start|end)$/.test(normalized);
  if (property === 'text-decoration') return /^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/.test(normalized);
  if (['height', 'max-height', 'max-width', 'width'].includes(property)) {
    return /^(auto|0|[0-9]+(?:\.[0-9]+)?(?:px|%|em|rem|vw|vh|ch))$/.test(normalized);
  }
  return /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.%\s,/-]+\)|[a-z]{1,24}|transparent|currentcolor)$/.test(normalized);
}

function sanitizeStyle(value: unknown): unknown {
  if (typeof value === 'string') {
    const kept: string[] = [];
    for (const declaration of value.split(';')) {
      const separator = declaration.indexOf(':');
      if (separator < 1) continue;
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const cssValue = declaration.slice(separator + 1).trim();
      if (SAFE_STYLE_PROPERTIES.has(property) && isSafeCssValue(property, cssValue)) {
        kept.push(`${property}: ${cssValue}`);
      }
    }
    return kept.length ? kept.join('; ') : undefined;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const kept: Record<string, string> = {};
    for (const [rawProperty, rawValue] of Object.entries(value)) {
      const property = rawProperty.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).toLowerCase();
      if (SAFE_STYLE_PROPERTIES.has(property) && typeof rawValue === 'string' && isSafeCssValue(property, rawValue)) {
        kept[rawProperty] = rawValue;
      }
    }
    return Object.keys(kept).length ? kept : undefined;
  }

  return undefined;
}

function sanitizeElement(node: HastNode): HastNode[] {
  const tag = node.tagName?.toLowerCase();
  if (!tag) return [node];
  if (DROP_CONTENT_TAGS.has(tag)) return [];

  const children = (node.children || []).flatMap(sanitizeElement);
  if (!ALLOWED_TAGS.has(tag)) return children;

  const properties = { ...(node.properties || {}) };
  for (const [name, value] of Object.entries(properties)) {
    const normalizedName = normalizeAttributeName(name);
    const isAllowed = GLOBAL_ATTRIBUTES.has(normalizedName) || TAG_ATTRIBUTES[tag]?.has(normalizedName);
    if (!isAllowed || normalizedName.startsWith('on')) {
      delete properties[name];
      continue;
    }

    if (normalizedName === 'style') {
      const safeStyle = sanitizeStyle(value);
      if (safeStyle === undefined) delete properties[name];
      else properties[name] = safeStyle;
    } else if (normalizedName === 'href' || normalizedName === 'src') {
      if (!isSafeUrl(value, normalizedName)) delete properties[name];
    } else if (tag === 'input' && normalizedName === 'type' && String(value).toLowerCase() !== 'checkbox') {
      delete properties[name];
    } else if (tag === 'summary' && normalizedName === 'contenteditable' && String(value).toLowerCase() !== 'false') {
      delete properties[name];
    }
  }

  if (tag === 'a' && String(properties.target).toLowerCase() === '_blank') {
    properties.rel = ['noopener', 'noreferrer'];
  }

  return [{ ...node, properties, children }];
}

/** Defense-in-depth for old or externally created canvas HTML. */
export default function rehypeCanvasSanitize() {
  return (tree: HastNode) => {
    if (Array.isArray(tree.children)) tree.children = tree.children.flatMap(sanitizeElement);
  };
}
