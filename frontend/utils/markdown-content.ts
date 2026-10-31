const CODE_SPAN_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const LOOSE_INLINE_MATH_RE = /(^|[^\\$])\$[ \t]*([^$\n]+?)[ \t]*\$(?!\d)/g;

const looksLikeMath = (expression: string) => {
  const value = expression.trim();
  return /^[A-Za-z]$/.test(value) ||
    /^[A-Za-z][A-Za-z0-9]*(?:[_^][A-Za-z0-9{}]+)$/.test(value) ||
    /[\\_^{}=<>+\-*/()[\]]/.test(value);
};

/** Normalize common PDF OCR output while leaving code and currency amounts alone. */
export const normalizeMarkdownContent = (content: string) => {
  if (!content) return content;

  return content.split(CODE_SPAN_RE).map((part, index) => {
    if (index % 2 === 1) return part;

    const withoutTableLabel = part
      .replace(/^([ \t]*)(?:table|tabular data)[ \t]*:[ \t]*(?=\|)/gim, '$1')
      .replace(/^([ \t]*)(?:table|tabular data)[ \t]*:[ \t]*\r?\n(?=[ \t]*\|)/gim, '$1');

    return withoutTableLabel.replace(LOOSE_INLINE_MATH_RE, (match, prefix: string, expression: string) =>
      looksLikeMath(expression) ? `${prefix}$${expression.trim()}$` : match,
    );
  }).join('');
};
