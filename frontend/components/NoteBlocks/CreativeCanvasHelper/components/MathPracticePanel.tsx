'use client';

import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  Activity, AlertTriangle, BarChart3, BookOpen, CheckCircle2, CircleHelp, CircleX, CornerDownLeft, ImagePlus,
  Keyboard, Lightbulb, ListOrdered, Loader2, Plus, RefreshCw, Sigma, Trash2, TrendingUp, Triangle, Waves, X, Zap,
} from 'lucide-react';
import { pythonUrl } from '@/apiurl';
import {
  AngleUnit, Example, GEOMETRY_TEXT_SYMBOLS, MathTopic, TOPICS, TOPIC_ORDER, buildProblemText,
} from './mathTopics';
import { FigureRender, FigureSpec, parseSpec, specToText } from './FigureSpec';
import 'katex/dist/katex.min.css';
import 'mathlive/fonts.css';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type MathFieldElement = HTMLElement & {
  value: string;
  mathVirtualKeyboardPolicy: 'manual' | 'auto' | 'sandboxed';
  insert: (latex: string, options?: Record<string, unknown>) => boolean;
};

type FormulaTarget = 'problem' | 'solution';

/** ok: true = passed, false = failed, null = could not evaluate. */
type AnswerCheck = { value: string; ok: boolean | null; note: string };
type EngineResult = {
  status: 'verified' | 'mismatch' | 'not_available';
  /** complete = answers satisfy the equation AND no solution is missing; substitution = answers satisfy it, completeness unknown. */
  mode: 'complete' | 'substitution';
  /** equation = substituted into an equation; numeric = derivative/integral checked numerically. */
  kind: 'equation' | 'numeric';
  details: AnswerCheck[];
};

type MathStep = { title: string; explanation: string; latex: string };
type MathReview = { status: 'consistent' | 'needs_attention' | 'cannot_verify'; summary: string; issues: { step: number | null; reason: string }[] };
type MathStepsResponse = {
  topic: string;
  steps: MathStep[];
  final_answer: string;
  answer_values: string[];
  notes: string;
  review: MathReview;
  engineVerification: 'verified' | 'mismatch' | 'not_available';
  engineMode: 'complete' | 'substitution';
  engineKind: 'equation' | 'numeric';
  engineDetails: AnswerCheck[];
};
type MathCheckResponse = {
  status: 'correct' | 'incorrect' | 'partially_correct' | 'cannot_verify';
  summary: string;
  issues: { step: number | null; reason: string }[];
  review: { status: 'agrees' | 'disagrees' | 'unavailable'; summary: string };
  /** false = a figure was sent but the AI model could not read images; null/undefined = no figure sent. */
  figure_used?: boolean | null;
};
type StoredImage = { url: string; s3Key: string };
type FigureImage = { name: string; previewUrl: string; base64: string };

interface MathPracticePanelProps {
  accessToken?: string;
  model?: string;
  onClose: () => void;
  onInsertContent: (html: string) => void;
  onUploadImage: (file: File) => Promise<StoredImage | null>;
}

/* ------------------------------------------------------------------ */
/* Theme (dark). To change the look, edit only this block.             */
/* ------------------------------------------------------------------ */

const ui = {
  overlay: 'fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px]',
  dialog:
    'fixed left-1/2 z-[70] flex w-[min(94vw,760px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl',
  header: 'flex items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6',
  footer: 'flex flex-col-reverse gap-2 border-t border-slate-800 bg-slate-950/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6',
  title: 'text-base font-semibold text-slate-100',
  muted: 'text-slate-400',
  label: 'text-sm font-medium text-slate-200',
  textarea:
    'block w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/30',
  smallBtn:
    'inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50',
  smallBtnActive:
    'inline-flex items-center gap-1 rounded-md border border-violet-400 bg-violet-500/20 px-2.5 py-1.5 text-xs font-medium text-violet-100 hover:bg-violet-500/30 disabled:opacity-50',
  ghostBtn: 'rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800',
  primaryBtn:
    'inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50',
  secondaryBtn:
    'inline-flex items-center gap-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50',
  card: 'space-y-2 rounded-xl border border-slate-700 bg-slate-800/40 p-3 sm:p-4',
  preview: 'mt-2 rounded-lg border border-violet-500/20 bg-slate-950/70 px-3 py-2.5',
  stepsBox: 'space-y-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 sm:p-5',
  stepCard: 'rounded-lg border border-slate-700 bg-slate-800/70 p-3 sm:p-4',
  answerBox: 'rounded-lg border border-violet-500/30 bg-slate-950 p-3 sm:p-4',
  error: 'rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200',
  tabBar: 'flex gap-1.5 overflow-x-auto border-b border-slate-800 px-5 py-2.5 sm:px-6',
  tab: 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800',
  tabActive: 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400 bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-100',
  chip: 'rounded-full border border-slate-700 bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 hover:border-violet-400 hover:bg-slate-700',
  paletteBtn: 'rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 hover:bg-slate-700',
};

// Every MathTopic needs an icon. Add new topics here AND in mathTopics.ts.
const TOPIC_ICONS: Record<MathTopic, React.ComponentType<{ size?: number }>> = {
  general: Sigma,
  geometry: Triangle,
  trigonometry: Waves,
  logarithms: TrendingUp,
  calculus: Activity,
  stats: BarChart3,
  physics: Zap,
};

const PHYSICS_TEXT_SYMBOLS = ['Ω', 'μ', 'θ', 'ω', 'Δ', '°', '±', '×', '²', '³', '√'];

const statusLabel: Record<MathCheckResponse['status'], string> = {
  correct: 'Looks correct',
  incorrect: 'There are errors',
  partially_correct: 'Partially correct',
  cannot_verify: 'Could not verify',
};

const statusStyles: Record<MathCheckResponse['status'], string> = {
  correct: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  incorrect: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  partially_correct: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  cannot_verify: 'border-slate-600 bg-slate-800/60 text-slate-200',
};

// Styles for the <math-field> web component (it lives in its own shadow DOM,
// so Tailwind classes cannot reach inside it).
const mathFieldCss = `
.math-practice-field {
  display: block;
  width: 100%;
  min-height: 3rem;
  box-sizing: border-box;
  padding: 0.5rem 0.75rem;
  font-size: 1.25rem;
  color: #f1f5f9;
  background: #020617;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  overflow-x: auto;
  --caret-color: #a78bfa;
  --selection-background-color: #5b21b6;
  --selection-color: #ffffff;
  --text-font-family: inherit;
}
.math-practice-field:focus-within {
  border-color: #a78bfa;
  outline: 2px solid rgba(139, 92, 246, 0.3);
}
.math-practice-field::part(virtual-keyboard-toggle),
.math-practice-field::part(menu-toggle) {
  color: #cbd5e1;
}
`;

/* ------------------------------------------------------------------ */
/* Text / math helpers                                                 */
/* ------------------------------------------------------------------ */

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string) => escapeHtml(value).replace(/"/g, '&quot;');
const normalizeMathDelimiters = (value: string) => value
  .replace(/\${3,}/g, () => '$$')
  .replace(/\\\[([\s\S]*?)\\\]/g, (_match, latex) => `$$${latex}$$`)
  .replace(/\\\(([\s\S]*?)\\\)/g, (_match, latex) => `$${latex}$`);

// Markdown folds a single "\n" into a space. Two trailing spaces make it a real line break.
const withLineBreaks = (value: string) => normalizeMathDelimiters(value).replace(/\n/g, '  \n');

const renderTex = (latex: string, display = false) => {
  try {
    return katex.renderToString(latex, { throwOnError: false, displayMode: display, output: 'html' });
  } catch {
    return escapeHtml(latex);
  }
};

const makeMathSpan = (latex: string, display: boolean) =>
  `<span data-type="inline-math" data-latex="${escapeAttr(latex)}"${display ? ' data-display="true"' : ''}>$${escapeHtml(latex)}$</span>`;

const formatMathTextHtml = (value: string) => {
  const normalized = normalizeMathDelimiters(value);
  const items: { latex: string; display: boolean }[] = [];
  const stash = (source: string) => {
    const put = (latex: string, display: boolean) => {
      items.push({ latex: latex.trim(), display });
      return `zzmath${items.length - 1}zz`;
    };
    return source
      .replace(/\$\$([\s\S]+?)\$\$/g, (_match, latex) => put(latex, true))
      .replace(/(^|[^\\$])\$[ \t]*([^$\n]+?)[ \t]*\$(?!\d)/g, (match, before, latex) => {
        const expression = String(latex).trim();
        return /[\\_^{}=<>+\-*/()[\]]/.test(expression) || /^[A-Za-z]$/.test(expression)
          ? before + put(expression, false)
          : match;
      });
  };
  return escapeHtml(stash(normalized))
    .replace(/zzmath(\d+)zz/g, (_match, index) => {
      const item = items[Number(index)];
      return item ? makeMathSpan(item.latex, item.display) : '';
    })
    .replace(/\r?\n/g, '<br>');
};

/** Renders text containing $inline$ / $$display$$ math, keeping line breaks. */
const MathMarkdown: React.FC<{ value: string; className?: string }> = ({ value, className = '' }) => (
  <div className={`break-words [&_.katex-display]:overflow-x-auto [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 ${className}`}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
      {withLineBreaks(value)}
    </ReactMarkdown>
  </div>
);

const MathTextPreview: React.FC<{ value: string }> = ({ value }) => value.trim() ? (
  <div className={ui.preview}>
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">Formatted preview</div>
    <MathMarkdown value={value} className="max-h-48 overflow-auto text-sm leading-6 text-slate-200" />
  </div>
) : null;

/* ------------------------------------------------------------------ */
/* Figure helpers                                                      */
/* ------------------------------------------------------------------ */

/** Shrink an uploaded picture before sending it to the AI. */
const prepareFigure = (file: File) => new Promise<{ previewUrl: string; base64: string }>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read this image.'));
      return;
    }
    // White background so transparent PNG diagrams do not turn black as JPEG.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(objectUrl);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    resolve({ previewUrl: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) });
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('Could not read this image.'));
  };
  image.src = objectUrl;
});

/** Rasterize the redrawn SVG to a PNG (light-on-dark colors swapped for a white document page). */
const svgToPngFile = (svg: SVGSVGElement) => new Promise<File>((resolve, reject) => {
  const box = svg.viewBox.baseVal;
  const width = box.width || 380;
  const height = box.height || 280;
  const xml = new XMLSerializer().serializeToString(svg)
    .replace(/#cbd5e1/g, '#1e293b')
    .replace(/#e2e8f0/g, '#0f172a')
    .replace(/#a78bfa/g, '#6d28d9')
    .replace('<svg', `<svg width="${width}" height="${height}"`);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext('2d');
    if (!context) { URL.revokeObjectURL(url); reject(new Error('canvas')); return; }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => blob ? resolve(new File([blob], 'figure-redraw.png', { type: 'image/png' })) : reject(new Error('png')), 'image/png');
  };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('svg')); };
  image.src = url;
});

/* ------------------------------------------------------------------ */
/* Local answer check (runs in the browser with the compute engine)    */
/* ------------------------------------------------------------------ */

const TRIG_RE = /\\(?:sin|cos|tan|sec|csc|cot)/;
const LOG_RE = /\\(?:log|ln)/;
const NOT_AVAILABLE: EngineResult = { status: 'not_available', mode: 'substitution', kind: 'equation', details: [] };

// "x = 30^\circ" -> "30", "$\frac{\pi}{6}$" -> "\frac{\pi}{6}"
const cleanAnswer = (raw: string) => raw
  .replace(/\\\(|\\\)|\$/g, '')
  .replace(/^\s*[a-zA-Z]\s*=\s*/, '')
  .replace(/\^\{?\\circ\}?|\\degree|°/g, '')
  .trim();

const shortNumber = (value: number) => String(Number(value.toPrecision(6)));

// Evaluate an expression at one real point. null = undefined, complex or not finite.
const numAt = (engine: any, expr: any, variable: string, x: number): number | null => {
  try {
    const result: any = expr.subs({ [variable]: engine.number(x) }).N();
    const re = Number(result.re);
    const im = Number(result.im ?? 0);
    return Number.isFinite(re) && Math.abs(im) < 1e-9 ? re : null;
  } catch {
    return null;
  }
};

const closeEnough = (a: number, b: number, rel = 1e-4) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
const SAMPLE_POINTS = [0.31, 0.77, 1.13, 1.69, 2.41, 3.07];

/**
 * Numeric checks for calculus. Returns null when the problem is not a derivative / integral
 * we can read, so the caller falls back to the equation check.
 *  - derivative:        compare a central difference of f with the answer g at sample points
 *  - indefinite integral: check F'(x) = f(x) (the +C is ignored)
 *  - definite integral:   Simpson's rule against the numeric answer
 */
const verifyCalculus = (engine: any, problemLatex: string, answerValues: string[]): EngineResult | null => {
  if (answerValues.length !== 1) return null;
  const normalized = normalizeMathDelimiters(problemLatex);
  const span = normalized.match(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/);
  const src = (span?.[1] || span?.[2] || '').trim();
  if (!src) return null;
  const raw = answerValues[0];
  const answerLatex = raw.replace(/\\\(|\\\)|\$/g, '').replace(/^[^=]*=\s*/, '').replace(/\+\s*[cC]\s*$/, '').trim();
  const done = (ok: boolean | null, note: string): EngineResult => ({
    status: ok === null ? 'not_available' : ok ? 'verified' : 'mismatch',
    mode: 'substitution', kind: 'numeric', details: [{ value: raw, ok, note }],
  });

  // d/dx f(x)
  const derivative = src.match(/^\\frac\{d\}\{d([a-z])\}\s*([\s\S]+)$/);
  if (derivative) {
    const [, v, body] = derivative;
    const f = engine.parse(body);
    const g = engine.parse(answerLatex);
    if (!f.isValid || !g.isValid) return done(null, 'Could not read the function or the answer.');
    let compared = 0;
    for (const p of SAMPLE_POINTS) {
      const h = 1e-5;
      const hi = numAt(engine, f, v, p + h), lo = numAt(engine, f, v, p - h), gv = numAt(engine, g, v, p);
      if (hi === null || lo === null || gv === null) continue;
      compared++;
      const slope = (hi - lo) / (2 * h);
      if (!closeEnough(slope, gv, 1e-3)) return done(false, `At ${v} = ${p}, the derivative is about ${shortNumber(slope)} but the answer gives ${shortNumber(gv)}.`);
    }
    return compared >= 3 ? done(true, `Matches a numeric derivative at ${compared} points.`) : done(null, 'Too few valid sample points to check.');
  }

  // \int ... dx  (optional limits)
  const integral = src.match(/^\\int(?:_\{?([^\s^{}]+)\}?\^\{?([^\s{}]+)\}?)?\s*([\s\S]+?)\s*(?:\\,|\\;)?\s*d([a-z])\s*$/);
  if (integral) {
    const [, lowerRaw, upperRaw, body, v] = integral;
    const f = engine.parse(body);
    if (!f.isValid) return done(null, 'Could not read the integrand.');
    if (lowerRaw === undefined) {
      const F = engine.parse(answerLatex);
      if (!F.isValid) return done(null, 'Could not read the answer.');
      let compared = 0;
      for (const p of SAMPLE_POINTS) {
        const h = 1e-5;
        const hi = numAt(engine, F, v, p + h), lo = numAt(engine, F, v, p - h), fv = numAt(engine, f, v, p);
        if (hi === null || lo === null || fv === null) continue;
        compared++;
        const slope = (hi - lo) / (2 * h);
        if (!closeEnough(slope, fv, 1e-3)) return done(false, `Differentiating the answer at ${v} = ${p} gives ${shortNumber(slope)}, but the integrand is ${shortNumber(fv)}.`);
      }
      return compared >= 3 ? done(true, `The derivative of the answer matches the integrand at ${compared} points.`) : done(null, 'Too few valid sample points to check.');
    }
    const lo = Number((engine.parse(lowerRaw).N() as any)?.re);
    const hi = Number((engine.parse(upperRaw).N() as any)?.re);
    const expected = Number((engine.parse(answerLatex).N() as any)?.re);
    if (![lo, hi, expected].every(Number.isFinite)) return done(null, 'Needs finite limits and a numeric answer to check.');
    const n = 400, h = (hi - lo) / n;
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      const y = numAt(engine, f, v, lo + i * h);
      if (y === null) return done(null, 'The integrand is undefined somewhere on the interval, so Simpson\'s rule cannot be used.');
      sum += y * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
    }
    const approx = (sum * h) / 3;
    return closeEnough(approx, expected, 1e-4)
      ? done(true, `Simpson's rule gives ${shortNumber(approx)}, which matches.`)
      : done(false, `Simpson's rule gives ${shortNumber(approx)} but the answer is ${shortNumber(expected)}.`);
  }
  return null;
};

/**
 * 1) Calculus problems: numeric derivative / integral check (see verifyCalculus).
 * 2) Equations: put every AI answer back into the ORIGINAL equation and compare both sides.
 *    A complex result means a real-number rule was broken (for example the log of a negative number),
 *    so that answer is reported as extraneous.
 * 3) For plain polynomial equations only, also confirm that no root the engine finds is missing.
 *    Trig and log answers only get step 2, because the engine returns one period / the principal root.
 */
const verifyMathAnswers = async (
  expressionLatex: string,
  answerValues: string[],
  angleUnit: AngleUnit | null,
): Promise<EngineResult> => {
  if (!answerValues.length) return NOT_AVAILABLE;
  try {
    const { ComputeEngine } = await import('@cortex-js/compute-engine');
    const engine = new ComputeEngine();

    try {
      const calc = verifyCalculus(engine, expressionLatex, answerValues);
      if (calc) return calc;
    } catch {
      /* fall through to the equation check */
    }

    const normalized = normalizeMathDelimiters(expressionLatex);
    const mathEquation = normalized.match(/\$\$([\s\S]*?=[\s\S]*?)\$\$|\$([^$\n]*=[^$\n]*)\$/);
    const equationLatex = mathEquation?.[1] || mathEquation?.[2] || normalized;
    const equation = engine.parse(equationLatex);
    if (!equation.isValid || equation.operator !== 'Equal') return NOT_AVAILABLE;
    const [lhs, rhs] = ((equation as any).ops ?? []) as any[];
    if (!lhs || !rhs) return NOT_AVAILABLE;

    const variable = normalized.match(/\b(?:solve|find)\s+for\s+([a-zA-Z])/i)?.[1] || 'x';
    const hasTrig = TRIG_RE.test(equationLatex);
    const hasLog = LOG_RE.test(equationLatex);
    // The engine's sin/cos/tan take radians, so a degree answer such as 30 is converted first.
    const convertDegrees = angleUnit === 'degrees' && hasTrig;

    const details: AnswerCheck[] = answerValues.map(raw => {
      const cleaned = cleanAnswer(raw);
      let answer: any = cleaned ? engine.parse(cleaned) : null;
      if (!answer || !answer.isValid) return { value: raw, ok: null, note: 'Could not read this answer.' };
      let note = '';
      if (convertDegrees && !/\\pi/.test(cleaned)) {
        answer = engine.parse(`\\left(${cleaned}\\right)\\cdot\\frac{\\pi}{180}`);
        note = ' (read as degrees)';
      }
      try {
        const left: any = lhs.subs({ [variable]: answer }).N();
        const right: any = rhs.subs({ [variable]: answer }).N();
        const [leftRe, leftIm, rightRe, rightIm] = [Number(left.re), Number(left.im ?? 0), Number(right.re), Number(right.im ?? 0)];
        if (!Number.isFinite(leftRe) || !Number.isFinite(rightRe) || Math.abs(leftIm) > 1e-9 || Math.abs(rightIm) > 1e-9) {
          return {
            value: raw,
            ok: false,
            note: hasLog
              ? 'Extraneous: a log argument is zero or negative, so this is not a valid solution.'
              : 'The equation is not defined for this value.',
          };
        }
        const tolerance = 1e-6 * Math.max(1, Math.abs(leftRe), Math.abs(rightRe));
        return Math.abs(leftRe - rightRe) <= tolerance
          ? { value: raw, ok: true, note: `Satisfies the original equation${note}.` }
          : { value: raw, ok: false, note: `Left side is ${shortNumber(leftRe)} but right side is ${shortNumber(rightRe)}${note}.` };
      } catch {
        return { value: raw, ok: null, note: 'Could not evaluate this answer.' };
      }
    });

    let status: EngineResult['status'] = details.some(d => d.ok === false)
      ? 'mismatch'
      : details.every(d => d.ok === true) ? 'verified' : 'not_available';
    let mode: EngineResult['mode'] = 'substitution';

    if (status === 'verified' && !hasTrig && !hasLog) {
      try {
        const roots = equation.solve(variable) as any;
        if (Array.isArray(roots) && roots.length > 0 && roots.every((root: any) => typeof root?.isEqual === 'function')) {
          const answers = answerValues.map(value => engine.parse(cleanAnswer(value))).filter(answer => answer.isValid);
          if (roots.every((root: any) => answers.some(answer => root.isEqual(answer) === true))) {
            mode = 'complete';
          } else {
            status = 'mismatch';
            details.push({ value: '—', ok: false, note: 'The engine found a solution that is missing from the AI answer.' });
          }
        }
      } catch {
        /* solve is best-effort; substitution already passed */
      }
    }
    return { status, mode, kind: 'equation', details };
  } catch {
    return NOT_AVAILABLE;
  }
};

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const MathPracticePanel: React.FC<MathPracticePanelProps> = ({
  accessToken,
  model,
  onClose,
  onInsertContent,
  onUploadImage,
}) => {
  const formulaFieldRef = useRef<MathFieldElement | null>(null);
  const problemTextareaRef = useRef<HTMLTextAreaElement>(null);
  const solutionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const figureInputRef = useRef<HTMLInputElement>(null);
  const specBoxRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef(0);
  // Remembers where the text cursor was in each textarea, because the textarea
  // loses focus while you type in the math field.
  const caretRef = useRef<Record<FormulaTarget, number>>({ problem: 0, solution: 0 });
  // Which textarea you used last: quick-reference formulas are inserted there.
  const lastTargetRef = useRef<FormulaTarget>('problem');
  // The givens/find text input that has focus, so the symbol strip knows where to type.
  const activeSimpleRef = useRef<{ el: HTMLInputElement; set: (value: string) => void } | null>(null);
  // Row that should grab focus after Enter adds a new given.
  const focusGivenRef = useRef<number | null>(null);
  // Always points at the latest insertFormula so the Enter-key listener never uses stale state.
  const insertRef = useRef<(newLine: boolean) => void>(() => {});

  const [mathLiveReady, setMathLiveReady] = useState(false);
  const [problem, setProblem] = useState('');
  const [userSolution, setUserSolution] = useState('');
  const [formulaLatex, setFormulaLatex] = useState('');
  const [formulaTarget, setFormulaTarget] = useState<FormulaTarget | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [error, setError] = useState('');
  const [stepsBusy, setStepsBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [steps, setSteps] = useState<MathStepsResponse | null>(null);
  const [check, setCheck] = useState<MathCheckResponse | null>(null);
  const [paperSolutionFile, setPaperSolutionFile] = useState<File | null>(null);
  const [paperSolutionText, setPaperSolutionText] = useState('');
  const [paperSolutionImage, setPaperSolutionImage] = useState<StoredImage | null>(null);
  const [paperOcrBusy, setPaperOcrBusy] = useState(false);
  const [paperOcrError, setPaperOcrError] = useState('');
  const [paperImageError, setPaperImageError] = useState('');

  // Topic, angle unit, givens, uploaded figure, reference drawer.
  const [topic, setTopic] = useState<MathTopic>('general');
  const [angleUnit, setAngleUnit] = useState<AngleUnit>('degrees');
  const [givens, setGivens] = useState<string[]>(['']);
  const [findText, setFindText] = useState('');
  const [figure, setFigure] = useState<FigureImage | null>(null);
  const [figureStored, setFigureStored] = useState<StoredImage | null>(null);
  const [figureBusy, setFigureBusy] = useState(false);
  const [figureError, setFigureError] = useState('');
  const [showReference, setShowReference] = useState(false);

  // Figure spec: the AI's structured redraw of a geometry figure or circuit, confirmed by the student.
  const [specText, setSpecText] = useState('');
  const [spec, setSpec] = useState<FigureSpec | null>(null);
  const [specIssues, setSpecIssues] = useState<string[]>([]);
  const [specConfirmed, setSpecConfirmed] = useState(false);
  const [specBusy, setSpecBusy] = useState(false);

  const formulaOpen = formulaTarget !== null;
  const cfg = TOPICS[topic];
  const figureActive = topic === 'geometry' || topic === 'physics';
  const isPhysics = topic === 'physics';

  const clearOldResults = () => {
    activeRequestRef.current += 1;
    setSteps(null);
    setCheck(null);
    setStepsBusy(false);
    setCheckBusy(false);
  };

  const resetSpec = () => {
    setSpecText('');
    setSpec(null);
    setSpecIssues([]);
    setSpecConfirmed(false);
  };

  /* 1) On mount: load MathLive lazily (it is browser-only). */
  useEffect(() => {
    let cancelled = false;
    import('mathlive').then(() => {
      if (!cancelled) setMathLiveReady(true);
    }).catch(() => {
      if (!cancelled) setError('Math keyboard could not be loaded.');
    });
    return () => {
      cancelled = true;
      (window as any).mathVirtualKeyboard?.hide?.();
    };
  }, []);

  /* 2) Once MathLive is ready: keep the dialog above the on-screen keyboard. */
  useEffect(() => {
    if (!mathLiveReady) return;
    const keyboard = (window as any).mathVirtualKeyboard;
    if (!keyboard?.addEventListener) return;
    const sync = () => setKbHeight(keyboard.visible ? Math.round(keyboard.boundingRect?.height ?? 0) : 0);
    keyboard.addEventListener('geometrychange', sync);
    return () => keyboard.removeEventListener('geometrychange', sync);
  }, [mathLiveReady]);

  /* 3) When the formula bar opens: wire up the math field (stays open until Done). */
  useEffect(() => {
    const field = formulaFieldRef.current;
    if (!formulaOpen || !mathLiveReady || !field) return;
    field.mathVirtualKeyboardPolicy = 'manual';
    field.value = '';

    const onInput = () => setFormulaLatex(field.value || '');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      insertRef.current(!event.shiftKey); // Enter = next line, Shift+Enter = stay on the same line
    };
    field.addEventListener('input', onInput);
    field.addEventListener('keydown', onKeyDown, true); // capture, so MathLive does not swallow Enter

    const frame = requestAnimationFrame(() => {
      field.focus();
      (window as any).mathVirtualKeyboard?.show?.();
    });
    return () => {
      cancelAnimationFrame(frame);
      field.removeEventListener('input', onInput);
      field.removeEventListener('keydown', onKeyDown, true);
    };
  }, [formulaOpen, mathLiveReady]);

  const combinedSolution = [
    userSolution.trim() ? `Written solution:\n${userSolution.trim()}` : '',
    paperSolutionText.trim() ? `OCR solution from image:\n${paperSolutionText.trim()}` : '',
  ].filter(Boolean).join('\n\n');

  // Givens / find / figure / drawing are used by geometry and physics; angle unit only where angles matter.
  const typedGivens = figureActive ? givens.map(item => item.trim()).filter(Boolean) : [];
  const activeSpec = figureActive && spec && specConfirmed && specIssues.length === 0 ? spec : null;
  const activeGivens = activeSpec ? [...typedGivens, specToText(activeSpec)] : typedGivens;
  const activeFind = figureActive ? findText.trim() : '';
  const activeFigure = figureActive ? figure : null;
  const activeFigureStored = figureActive ? figureStored : null;
  const activeAngleUnit = cfg.usesAngles ? angleUnit : null;
  const compiledProblem = buildProblemText({ problem, givens: activeGivens, find: activeFind, angleUnit: activeAngleUnit });

  // Extra fields for the API. JSON.stringify drops the undefined ones.
  const aiContext = () => ({
    topic,
    angle_unit: activeAngleUnit ?? undefined,
    figure_image_base64: activeFigure?.base64,
    figure_mime_type: activeFigure ? 'image/jpeg' : undefined,
    figure_spec: activeSpec ?? undefined,
  });

  /* ---------------- topic, examples, givens ---------------- */

  const changeTopic = (next: MathTopic) => {
    if (next === topic) return;
    setTopic(next);
    setAngleUnit(TOPICS[next].defaultAngleUnit);
    resetSpec();
    setError('');
    clearOldResults();
  };

  const applyExample = (example: Example) => {
    setProblem(example.problem);
    caretRef.current.problem = example.problem.length;
    setGivens(example.givens && example.givens.length ? example.givens : ['']);
    setFindText(example.find ?? '');
    if (example.angleUnit) setAngleUnit(example.angleUnit);
    resetSpec();
    setError('');
    clearOldResults();
  };

  const registerGiven = (element: HTMLInputElement, index: number) => {
    activeSimpleRef.current = {
      el: element,
      set: value => { setGivens(prev => prev.map((item, i) => (i === index ? value : item))); clearOldResults(); },
    };
  };

  const registerFind = (element: HTMLInputElement) => {
    activeSimpleRef.current = { el: element, set: value => { setFindText(value); clearOldResults(); } };
  };

  const insertSimpleSymbol = (symbol: string) => {
    const active = activeSimpleRef.current;
    if (!active || !active.el.isConnected) return;
    const current = active.el.value;
    const position = active.el.selectionStart ?? current.length;
    active.set(current.slice(0, position) + symbol + current.slice(position));
    requestAnimationFrame(() => {
      active.el.focus();
      active.el.setSelectionRange(position + symbol.length, position + symbol.length);
    });
  };

  const addGiven = () => {
    focusGivenRef.current = givens.length;
    setGivens(prev => [...prev, '']);
  };

  const removeGiven = (index: number) => {
    activeSimpleRef.current = null;
    setGivens(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : ['']));
    clearOldResults();
  };

  /* ---------------- figure upload (picture the AI can read) ---------------- */

  const attachFigure = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setFigureError('Choose a PNG or JPEG of the figure.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFigureError('The image must be 10 MB or smaller.');
      return;
    }
    setFigureError('');
    setFigureStored(null);
    setFigureBusy(true);
    clearOldResults();
    try {
      const prepared = await prepareFigure(file);
      setFigure({ name: file.name, ...prepared });
      try {
        const uploaded = await onUploadImage(file);
        if (uploaded) setFigureStored(uploaded);
        else setFigureError('The figure is ready for the AI, but it could not be saved to your document.');
      } catch {
        setFigureError('The figure is ready for the AI, but it could not be saved to your document.');
      }
    } catch (caught) {
      setFigure(null);
      setFigureError(caught instanceof Error ? caught.message : 'Could not read this image.');
    } finally {
      setFigureBusy(false);
    }
  };

  const removeFigure = () => {
    setFigure(null);
    setFigureStored(null);
    setFigureError('');
    clearOldResults();
  };

  /* ---------------- figure spec: draw, edit, confirm ---------------- */

  const applySpecText = (text: string) => {
    setSpecText(text);
    setSpecConfirmed(false); // any edit must be re-confirmed
    clearOldResults();
    if (!text.trim()) { setSpec(null); setSpecIssues([]); return; }
    const parsed = parseSpec(text);
    setSpec(parsed.spec);
    setSpecIssues(parsed.issues);
  };

  const drawFromProblem = async () => {
    if (!problem.trim()) { setError('Enter the math problem first.'); return; }
    if (!accessToken) { setError('Sign in again to draw the figure.'); return; }
    setError('');
    setSpecBusy(true);
    try {
      const response = await fetch(`${pythonUrl}/api/math/figure-spec`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        // figure_spec is left out on purpose: the AI redraws from the text, the givens and the uploaded picture.
        body: JSON.stringify({ expression: buildProblemText({ problem, givens: typedGivens, find: activeFind, angleUnit: activeAngleUnit }), model, topic, figure_image_base64: activeFigure?.base64, figure_mime_type: activeFigure ? 'image/jpeg' : undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The AI could not draw this figure.');
      applySpecText(JSON.stringify(payload.spec, null, 2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The AI could not draw this figure.');
    } finally {
      setSpecBusy(false);
    }
  };

  /* ---------------- formula bar actions ---------------- */

  const rememberCaret = (target: FormulaTarget, element: HTMLTextAreaElement) => {
    // Only trust the caret while the textarea is focused; React resets it to the end on programmatic updates.
    if (document.activeElement === element) caretRef.current[target] = element.selectionStart ?? element.value.length;
  };

  const applyInsertion = (target: FormulaTarget, text: string) => {
    const source = target === 'problem' ? problem : userSolution;
    const position = Math.min(caretRef.current[target], source.length);
    const nextValue = `${source.slice(0, position)}${text}${source.slice(position)}`;
    const caret = position + text.length;
    caretRef.current[target] = caret;
    if (target === 'problem') setProblem(nextValue);
    else setUserSolution(nextValue);
    setError('');
    clearOldResults();
    requestAnimationFrame(() => {
      const element = target === 'problem' ? problemTextareaRef.current : solutionTextareaRef.current;
      if (!element) return;
      element.setSelectionRange(caret, caret);
      if (caret >= nextValue.length) element.scrollTop = element.scrollHeight;
    });
  };

  const insertFormula = (newLine: boolean) => {
    const field = formulaFieldRef.current;
    const latex = (field?.value ?? formulaLatex).trim();
    if (!latex || !formulaTarget) return;
    applyInsertion(formulaTarget, `$${latex}$${newLine ? '\n' : ''}`);
    // Clear the field and keep it focused so the next step can be typed immediately.
    if (field) field.value = '';
    setFormulaLatex('');
    requestAnimationFrame(() => field?.focus());
  };
  insertRef.current = insertFormula;

  const insertNewLine = () => {
    if (!formulaTarget) return;
    applyInsertion(formulaTarget, '\n');
    requestAnimationFrame(() => formulaFieldRef.current?.focus());
  };

  /** Palette button: type a symbol or template into the math field (#? are fill-in boxes). */
  const insertSymbol = (latex: string) => {
    const field = formulaFieldRef.current;
    if (!field) return;
    field.insert?.(latex, { focus: true, feedback: false, selectionMode: 'placeholder' });
    setFormulaLatex(field.value || '');
  };

  /** Quick-reference formula: goes into the math field if it is open, otherwise into the last textarea you used. */
  const insertReference = (latex: string) => {
    if (formulaOpen) insertSymbol(latex);
    else applyInsertion(lastTargetRef.current, `$${latex}$`);
  };

  const openFormula = (target: FormulaTarget) => {
    setFormulaTarget(target);
    requestAnimationFrame(() => {
      formulaFieldRef.current?.focus();
      (window as any).mathVirtualKeyboard?.show?.();
    });
  };

  const closeFormula = () => {
    setFormulaTarget(null);
    setFormulaLatex('');
    (window as any).mathVirtualKeyboard?.hide?.();
  };

  /* ---------------- image OCR ---------------- */

  const readSolutionImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setPaperOcrError('Choose a PNG or JPEG photo of your work.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPaperOcrError('The image must be 10 MB or smaller.');
      return;
    }
    if (!accessToken) {
      setPaperOcrError('Sign in again to read a solution image.');
      return;
    }

    setPaperSolutionFile(file);
    setPaperSolutionImage(null);
    setPaperSolutionText('');
    setPaperOcrError('');
    setPaperImageError('');
    setPaperOcrBusy(true);
    clearOldResults();
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this image.'));
        reader.onerror = () => reject(new Error('Could not read this image.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`${pythonUrl}/api/math/ocr-solution-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime_type: file.type, image_base64: dataUrl.slice(dataUrl.indexOf(',') + 1) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'Could not read the solution image.');
      const text = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!text) throw new Error('No readable solution text was found in the image.');
      setPaperSolutionText(text);
      try {
        const uploaded = await onUploadImage(file);
        if (uploaded) setPaperSolutionImage(uploaded);
        else setPaperImageError('The OCR text is ready, but the image could not be saved.');
      } catch {
        setPaperImageError('The OCR text is ready, but the image could not be saved.');
      }
    } catch (caught) {
      setPaperSolutionFile(null);
      setPaperOcrError(caught instanceof Error ? caught.message : 'Could not read the solution image.');
    } finally {
      setPaperOcrBusy(false);
    }
  };

  /* ---------------- AI check / steps ---------------- */

  const checkSolution = async () => {
    const problemText = problem.trim();
    if (!problemText) {
      setError('Enter the math problem first.');
      return;
    }
    if (!combinedSolution) {
      setError('Write your solution or upload a photo of it first.');
      return;
    }
    if (!accessToken) {
      setError('Sign in again to check your solution.');
      return;
    }
    setError('');
    setCheck(null);
    setSteps(null);
    const requestId = ++activeRequestRef.current;
    setCheckBusy(true);
    try {
      const response = await fetch(`${pythonUrl}/api/math/check-solution`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: compiledProblem, user_solution: combinedSolution, model, ...aiContext() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The AI could not check this solution.');
      if (requestId === activeRequestRef.current) setCheck(payload as MathCheckResponse);
    } catch (caught) {
      if (requestId === activeRequestRef.current) setError(caught instanceof Error ? caught.message : 'The AI could not check this solution.');
    } finally {
      if (requestId === activeRequestRef.current) setCheckBusy(false);
    }
  };

  const showSteps = async () => {
    const problemText = problem.trim();
    if (!problemText) {
      setError('Enter the math problem first.');
      return;
    }
    if (!accessToken) {
      setError('Sign in again to generate worked steps.');
      return;
    }
    setError('');
    setSteps(null);
    const requestId = ++activeRequestRef.current;
    setStepsBusy(true);
    try {
      const response = await fetch(`${pythonUrl}/api/math/solve-steps`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expression: compiledProblem, model, reference_solution: combinedSolution, ...aiContext() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The AI could not generate worked steps.');
      // The local check reads the equation / expression you typed, not the extra givens text.
      const engine = await verifyMathAnswers(problemText, payload.answer_values || [], activeAngleUnit);
      if (requestId === activeRequestRef.current) {
        setSteps({ ...payload, engineVerification: engine.status, engineMode: engine.mode, engineKind: engine.kind, engineDetails: engine.details });
      }
    } catch (caught) {
      if (requestId === activeRequestRef.current) setError(caught instanceof Error ? caught.message : 'The AI could not generate worked steps.');
    } finally {
      if (requestId === activeRequestRef.current) setStepsBusy(false);
    }
  };

  /* ---------------- insert into the document ---------------- */

  const insertAllMathWork = async () => {
    setInserting(true);
    // The confirmed redraw becomes a PNG in the document (the editor may strip inline SVG).
    let specImageHtml = '';
    const svg = specBoxRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (activeSpec && svg) {
      try {
        const uploaded = await onUploadImage(await svgToPngFile(svg));
        if (uploaded) specImageHtml = `<img src="${escapeAttr(uploaded.url)}" alt="Redrawn figure" title="Redrawn figure" data-s3-key="${escapeAttr(uploaded.s3Key)}">`;
      } catch {
        /* the problem text still carries the givens, so insertion continues without the picture */
      }
    }

    const problemText = compiledProblem.trim();
    const imageHtml = paperSolutionImage
      ? `<img src="${escapeAttr(paperSolutionImage.url)}" alt="${escapeAttr(paperSolutionFile?.name || 'Paper solution')}" title="${escapeAttr(paperSolutionFile?.name || 'Paper solution')}" data-s3-key="${escapeAttr(paperSolutionImage.s3Key)}">`
      : '';
    const figureHtml = (activeFigureStored
      ? `<img src="${escapeAttr(activeFigureStored.url)}" alt="${escapeAttr(activeFigure?.name || 'Figure')}" title="${escapeAttr(activeFigure?.name || 'Figure')}" data-s3-key="${escapeAttr(activeFigureStored.s3Key)}">`
      : '') + specImageHtml;
    const checkedHtml = check
      ? `<h4>AI solution check: ${statusLabel[check.status]}</h4><p>${escapeHtml(check.summary)}</p>` +
        check.issues.map(issue => `<p>${issue.step ? `Step ${issue.step}: ` : ''}${escapeHtml(issue.reason)}</p>`).join('') +
        `<p><strong>Independent review:</strong> ${escapeHtml(check.review.summary)}</p>`
      : '';
    const stepsHtml = steps
      ? `<h4>Worked solution: ${escapeHtml(steps.topic)}</h4>` +
        steps.steps.map((step, index) => `<p><strong>Step ${index + 1}: ${escapeHtml(step.title)}</strong><br>${formatMathTextHtml(step.explanation)}</p>${step.latex ? `<p>${makeMathSpan(step.latex, false)}</p>` : ''}`).join('') +
        `<h5>Answer</h5><p>${formatMathTextHtml(steps.final_answer)}</p>`
      : '';
    const content = [
      '<h3>Math problem and work</h3>',
      problemText ? `<h4>Problem</h4><p>${formatMathTextHtml(problemText)}</p>` : '',
      figureHtml ? `<h4>Figure</h4>${figureHtml}` : '',
      userSolution.trim() ? `<h4>My written solution</h4><p>${formatMathTextHtml(userSolution.trim())}</p>` : '',
      imageHtml ? `<h4>Paper solution image</h4>${imageHtml}` : '',
      paperSolutionText.trim() ? `<h4>OCR text</h4><p>${formatMathTextHtml(paperSolutionText.trim())}</p>` : '',
      checkedHtml,
      stepsHtml,
    ].join('');
    onInsertContent(content);
    setInserting(false);
    onClose();
  };

  /* ---------------- small render helpers ---------------- */

  const formulaButton = (target: FormulaTarget) => (
    <button
      type="button"
      disabled={!mathLiveReady}
      onClick={() => openFormula(target)}
      className={formulaTarget === target ? ui.smallBtnActive : ui.smallBtn}
    >
      <Keyboard size={13} /> Insert formula
    </button>
  );

  const exampleRow = cfg.examples.length > 0 && (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1 text-xs ${ui.muted}`}><Lightbulb size={12} /> Try an example</span>
      {cfg.examples.map(example => (
        <button key={example.title} type="button" className={ui.chip} onClick={() => applyExample(example)}>{example.title}</button>
      ))}
    </div>
  );

  const angleToggle = cfg.usesAngles && (
    <div role="radiogroup" aria-label="Angle unit" className="inline-flex overflow-hidden rounded-md border border-slate-700 text-xs">
      {(['degrees', 'radians'] as AngleUnit[]).map(unit => (
        <button
          key={unit}
          type="button"
          role="radio"
          aria-checked={angleUnit === unit}
          onClick={() => { setAngleUnit(unit); clearOldResults(); }}
          className={angleUnit === unit ? 'bg-violet-500/30 px-2.5 py-1.5 font-medium text-violet-100' : 'px-2.5 py-1.5 text-slate-300 hover:bg-slate-800'}
        >
          {unit === 'degrees' ? 'Degrees' : 'Radians'}
        </button>
      ))}
    </div>
  );

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Escape inside the math field belongs to MathLive.
    if ((event.target as HTMLElement).tagName === 'MATH-FIELD') return;
    event.stopPropagation();
    if (formulaOpen) closeFormula();
    else onClose();
  };

  const engineSummary = steps
    ? steps.engineVerification === 'verified'
      ? steps.engineKind === 'numeric'
        ? 'The answer passed a numeric check (finite differences or Simpson\'s rule).'
        : steps.engineMode === 'complete'
          ? 'Every answer satisfies the equation and no solution is missing.'
          : 'Every answer satisfies the original equation. Whether all solutions were found is not checked.'
      : steps.engineVerification === 'mismatch'
        ? 'At least one answer failed the local check.'
        : 'Could not independently check this kind of answer.'
    : '';

  const symbolStrip = isPhysics ? PHYSICS_TEXT_SYMBOLS : GEOMETRY_TEXT_SYMBOLS;

  /* ---------------- render ---------------- */

  return (
    <>
      <style>{mathFieldCss}</style>
      <div className={ui.overlay} onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="math-practice-title"
        className={ui.dialog}
        style={{
          // Slide up when the on-screen math keyboard opens so nothing is hidden behind it.
          top: `calc(50% - ${kbHeight / 2}px)`,
          maxHeight: `min(88vh, calc(100vh - ${kbHeight + 24}px))`,
        }}
        onMouseDown={event => event.stopPropagation()}
        onWheel={event => event.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <header className={ui.header}>
          <div>
            <div className="flex items-center gap-2 text-violet-400"><Sigma size={20} /><h4 id="math-practice-title" className={ui.title}>Math practice</h4></div>
            <p className={`mt-1 text-sm ${ui.muted}`}>Solve it yourself and let AI check your work. Stuck? Ask for a step-by-step solution.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close math practice"><X size={18} /></button>
        </header>

        <div role="tablist" aria-label="Topic" className={ui.tabBar}>
          {TOPIC_ORDER.map(id => {
            const Icon = TOPIC_ICONS[id];
            const active = id === topic;
            return (
              <button key={id} type="button" role="tab" aria-selected={active} onClick={() => changeTopic(id)} className={active ? ui.tabActive : ui.tab}>
                <Icon size={14} /> {TOPICS[id].label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <p className={`text-xs leading-5 ${ui.muted}`}>
            <span className="font-medium text-slate-300">{cfg.blurb}</span> {cfg.tip}
          </p>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="math-practice-problem" className={ui.label}>Problem</label>
              <div className="flex flex-wrap items-center gap-2">
                {angleToggle}
                {formulaButton('problem')}
              </div>
            </div>
            {exampleRow}
            <textarea
              id="math-practice-problem"
              ref={problemTextareaRef}
              value={problem}
              onFocus={() => { lastTargetRef.current = 'problem'; }}
              onChange={event => { setProblem(event.target.value); rememberCaret('problem', event.currentTarget); setError(''); clearOldResults(); }}
              onSelect={event => rememberCaret('problem', event.currentTarget)}
              className={`${ui.textarea} min-h-28`}
              placeholder="Write or paste the full problem, including any instructions and equations."
            />
            <MathTextPreview value={problem} />
          </div>

          {figureActive && (
            <section className={ui.card} aria-label="Figure and givens">
              <div>
                <h5 className="text-sm font-semibold text-slate-100">{isPhysics ? 'Diagram, circuit and givens' : 'Figure and givens'}</h5>
                <p className={`mt-1 text-xs ${ui.muted}`}>
                  {isPhysics
                    ? 'Add one fact per line with units: masses, forces, angles, component values, where things connect. The drawing is only a check that the AI understood the setup.'
                    : 'Add one fact per line: lengths, angles, which points lie on which lines. The AI treats the figure as not drawn to scale, so only these facts count.'}
                </p>
              </div>

              <div className="space-y-1.5">
                {givens.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-xs text-slate-500">{index + 1}</span>
                    <input
                      ref={element => {
                        if (element && focusGivenRef.current === index) { focusGivenRef.current = null; element.focus(); }
                      }}
                      type="text"
                      value={item}
                      aria-label={`Given ${index + 1}`}
                      placeholder={isPhysics
                        ? (index === 0 ? 'V = 12 V, R1 = 4 Ω in series with R2 = 6 Ω' : 'm = 2 kg on a 30° incline, μ = 0.3')
                        : (index === 0 ? 'AB = 6, ∠B = 90°' : 'D lies on AC, BD ⟂ AC')}
                      onFocus={event => registerGiven(event.currentTarget, index)}
                      onChange={event => {
                        const value = event.target.value;
                        setGivens(prev => prev.map((entry, i) => (i === index ? value : entry)));
                        setError('');
                        clearOldResults();
                      }}
                      onKeyDown={event => {
                        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
                        event.preventDefault();
                        focusGivenRef.current = index + 1;
                        setGivens(prev => [...prev.slice(0, index + 1), '', ...prev.slice(index + 1)]);
                      }}
                      className={ui.textarea}
                    />
                    <button type="button" onClick={() => removeGiven(index)} disabled={givens.length === 1 && !item}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-slate-100 disabled:opacity-30" aria-label={`Remove given ${index + 1}`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={addGiven} className={ui.smallBtn}><Plus size={13} /> Add given</button>
                <span className="mx-1 h-4 w-px bg-slate-700" aria-hidden="true" />
                {symbolStrip.map(symbol => (
                  <button key={symbol} type="button" className={ui.paletteBtn} onMouseDown={event => event.preventDefault()} onClick={() => insertSimpleSymbol(symbol)} aria-label={`Insert ${symbol}`}>{symbol}</button>
                ))}
              </div>

              <div>
                <label htmlFor="math-geometry-find" className="mb-1 block text-xs font-medium text-slate-300">Find</label>
                <input
                  id="math-geometry-find"
                  type="text"
                  value={findText}
                  placeholder={isPhysics ? 'the current through R2, or the block\'s acceleration' : 'BD, or the area of triangle ABC'}
                  onFocus={event => registerFind(event.currentTarget)}
                  onChange={event => { setFindText(event.target.value); setError(''); clearOldResults(); }}
                  className={ui.textarea}
                />
              </div>

              {/* Redraw: the AI turns the text into a structured spec, drawn locally so you can see what it understood. */}
              <div className="space-y-2 border-t border-slate-700 pt-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={specBusy || !accessToken || !problem.trim()} onClick={() => void drawFromProblem()} className={ui.smallBtn}>
                    {specBusy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {specBusy ? 'Drawing…' : spec ? 'Redraw' : 'Draw from problem'}
                  </button>
                  {spec && <button type="button" onClick={resetSpec} className={ui.ghostBtn}>Remove drawing</button>}
                  <span className={`text-xs ${ui.muted}`}>Optional. The AI only uses the drawing after you confirm it.</span>
                </div>
                {spec && <div ref={specBoxRef}><FigureRender spec={spec} /></div>}
                {specIssues.map((issue, index) => <p key={`${index}-${issue}`} role="status" className="text-sm text-amber-300">{issue}</p>)}
                {spec && (
                  <label className="flex items-start gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={specConfirmed}
                      disabled={specIssues.length > 0}
                      onChange={event => { setSpecConfirmed(event.target.checked); clearOldResults(); }}
                      className="mt-0.5"
                    />
                    <span>This drawing matches my problem. Use it when checking and solving. {specConfirmed ? '' : '(Not confirmed: the AI ignores it.)'}</span>
                  </label>
                )}
                <details className="text-xs text-slate-400">
                  <summary className="cursor-pointer select-none">Edit drawing data (JSON)</summary>
                  <textarea
                    value={specText}
                    onChange={event => applySpecText(event.target.value)}
                    spellCheck={false}
                    className={`${ui.textarea} mt-1.5 min-h-32 font-mono text-xs`}
                    placeholder='{"kind":"geometry","points":[{"id":"A","x":0,"y":0}, ...],"segments":[["A","B"]]}'
                  />
                </details>
              </div>

              <div className="border-t border-slate-700 pt-2">
                <input ref={figureInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => void attachFigure(event)} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={figureBusy} onClick={() => figureInputRef.current?.click()} className={ui.smallBtn}>
                    {figureBusy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                    {figureBusy ? 'Preparing figure…' : figure ? 'Replace picture' : 'Add picture'}
                  </button>
                  {figure && <button type="button" onClick={removeFigure} className={ui.ghostBtn}>Remove</button>}
                  <span className={`text-xs ${ui.muted}`}>Optional. Only AI models that can read images will use it.</span>
                </div>
                {figure && (
                  <img src={figure.previewUrl} alt={figure.name} className="mt-2 max-h-44 rounded-lg border border-slate-700 bg-white object-contain" />
                )}
                {figureError && <p role="alert" className="mt-1.5 text-sm text-amber-300">{figureError}</p>}
              </div>
            </section>
          )}

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="math-user-solution" className={ui.label}>Your solution / work</label>
              {formulaButton('solution')}
            </div>
            <textarea
              id="math-user-solution"
              ref={solutionTextareaRef}
              value={userSolution}
              onFocus={() => { lastTargetRef.current = 'solution'; }}
              onChange={event => { setUserSolution(event.target.value); rememberCaret('solution', event.currentTarget); setError(''); clearOldResults(); }}
              onSelect={event => rememberCaret('solution', event.currentTarget)}
              className={`${ui.textarea} min-h-32`}
              placeholder="Write your solution one step per line, or use Insert formula to add steps with the math keyboard."
            />
            <MathTextPreview value={userSolution} />
          </div>

          {cfg.reference.length > 0 && (
            <section className={ui.card} aria-label="Quick reference">
              <button type="button" onClick={() => setShowReference(value => !value)} aria-expanded={showReference} className="flex w-full items-center justify-between text-left">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100"><BookOpen size={15} /> Quick reference: {cfg.label.toLowerCase()}</span>
                <span className={`text-xs ${ui.muted}`}>{showReference ? 'Hide' : 'Show'}</span>
              </button>
              {showReference && (
                <div className="space-y-3 pt-1">
                  <p className={`text-xs ${ui.muted}`}>Click a formula to insert it into {formulaOpen ? 'the formula bar' : 'the text box you used last'}.</p>
                  {cfg.reference.map(group => (
                    <div key={group.heading}>
                      <h6 className="mb-1 text-xs font-semibold text-slate-300">{group.heading}</h6>
                      <div className="grid gap-1 sm:grid-cols-2">
                        {group.items.map(item => (
                          <button key={item.latex} type="button" title="Insert this formula" onMouseDown={event => event.preventDefault()} onClick={() => insertReference(item.latex)}
                            className="block w-full rounded-md border border-slate-700/70 bg-slate-900/60 px-2.5 py-1.5 text-left text-slate-100 hover:border-violet-400">
                            {item.name && <span className="block text-[11px] text-slate-400">{item.name}</span>}
                            <span className="block overflow-x-auto text-sm" dangerouslySetInnerHTML={{ __html: renderTex(item.latex) }} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          <section className={ui.card}>
            <div>
              <h5 className="text-sm font-semibold text-slate-100">Upload your paper solution</h5>
              <p className={`mt-1 text-xs ${ui.muted}`}>OCR reads a PNG or JPEG. Review the text before checking your work.</p>
            </div>
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => void readSolutionImage(event)} />
            <button type="button" disabled={paperOcrBusy} onClick={() => imageInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50">
              {paperOcrBusy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
              {paperOcrBusy ? 'Reading and saving image…' : paperSolutionFile ? 'Choose another image' : 'Choose solution image'}
            </button>
            {paperSolutionFile && <span className={`ml-2 text-xs ${ui.muted}`}>{paperSolutionFile.name}</span>}
            {paperOcrError && <p role="alert" className="text-sm text-rose-300">{paperOcrError}</p>}
            {paperImageError && <p role="status" className="text-sm text-amber-300">{paperImageError}</p>}
            {paperSolutionText && (
              <div>
                <label htmlFor="math-ocr-solution" className="block text-xs font-semibold text-slate-300">OCR result · editable</label>
                <textarea
                  id="math-ocr-solution"
                  value={paperSolutionText}
                  onChange={event => { setPaperSolutionText(event.target.value); clearOldResults(); }}
                  className={`${ui.textarea} mt-1.5 min-h-32 font-normal`}
                />
                <MathTextPreview value={paperSolutionText} />
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={checkBusy || stepsBusy || !accessToken || !combinedSolution} onClick={() => void checkSolution()} className={ui.primaryBtn}>
              {checkBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
              {checkBusy ? 'Checking your work…' : 'Check my work'}
            </button>
            <button type="button" disabled={stepsBusy || checkBusy || !accessToken} onClick={() => void showSteps()} className={ui.secondaryBtn}>
              {stepsBusy ? <Loader2 size={15} className="animate-spin" /> : <ListOrdered size={15} />}
              {stepsBusy ? 'Generating steps…' : 'Show steps'}
            </button>
          </div>

          {error && <p role="alert" className={ui.error}>{error}</p>}

          {check && (
            <section className={`space-y-3 rounded-xl border p-4 ${statusStyles[check.status]}`}>
              <div className="flex items-start gap-3">
                {check.status === 'correct' ? <CheckCircle2 className="mt-0.5 shrink-0" size={20} /> :
                  check.status === 'incorrect' ? <CircleX className="mt-0.5 shrink-0" size={20} /> :
                    check.status === 'partially_correct' ? <AlertTriangle className="mt-0.5 shrink-0" size={20} /> : <CircleHelp className="mt-0.5 shrink-0" size={20} />}
                <div>
                  <h5 className="text-sm font-semibold">{statusLabel[check.status]}</h5>
                  <p className="mt-1 text-sm leading-6">{check.summary}</p>
                </div>
              </div>
              {check.issues.length > 0 && <ul className="list-disc space-y-1 pl-10 text-sm">{check.issues.map((issue, index) => <li key={`${index}-${issue.reason}`}>{issue.step ? `Step ${issue.step}: ` : ''}{issue.reason}</li>)}</ul>}
              <p className="border-t border-white/10 pt-2 text-xs"><strong>Independent AI review:</strong> {check.review.summary}</p>
              {check.figure_used === false && (
                <p className="text-xs">This AI model could not read the picture, so it used only your givens. Pick a model that supports images to include it.</p>
              )}
            </section>
          )}

          {steps && (
            <section className={ui.stepsBox}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">Step-by-step solution · {steps.topic}</div>
                  <p className={`mt-1 text-xs ${ui.muted}`}>AI solution with an independent review. Answers are checked locally when supported.</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${steps.review.status === 'consistent' && steps.engineVerification === 'verified' ? 'bg-emerald-500/20 text-emerald-200' : steps.review.status === 'needs_attention' || steps.engineVerification === 'mismatch' ? 'bg-amber-500/20 text-amber-200' : 'bg-slate-700 text-slate-200'}`}>
                  {steps.review.status === 'consistent' && steps.engineVerification === 'verified' ? 'AI reviewed · answer checked' : steps.review.status === 'needs_attention' || steps.engineVerification === 'mismatch' ? 'Needs review' : 'Partially checked'}
                </span>
              </div>
              <ol className="space-y-3">
                {steps.steps.map((step, index) => (
                  <li key={`${index}-${step.title}`} className={ui.stepCard}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-xs font-bold text-violet-200">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <h5 className="text-sm font-semibold text-slate-100">{step.title}</h5>
                        <MathMarkdown value={step.explanation} className="mt-1 text-sm leading-6 text-slate-300" />
                        {step.latex && <div className="mt-2 overflow-x-auto rounded-md bg-slate-950 px-2 py-2 text-slate-100" dangerouslySetInnerHTML={{ __html: renderTex(step.latex, true) }} />}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={ui.answerBox}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Answer</div>
                <MathMarkdown value={steps.final_answer} className="text-slate-100" />
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <p><strong className="text-slate-300">AI review:</strong> {steps.review.summary}</p>
                <p><strong className="text-slate-300">Math engine:</strong> {engineSummary}</p>
                {steps.engineDetails.length > 0 && (
                  <ul className="space-y-0.5 pl-1">
                    {steps.engineDetails.map((detail, index) => (
                      <li key={`${index}-${detail.value}`} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className={detail.ok === true ? 'text-emerald-300' : detail.ok === false ? 'text-rose-300' : 'text-slate-400'} aria-label={detail.ok === true ? 'Passed' : detail.ok === false ? 'Failed' : 'Not checked'}>
                          {detail.ok === true ? '✓' : detail.ok === false ? '✗' : '?'}
                        </span>
                        <span className="text-slate-200" dangerouslySetInnerHTML={{ __html: renderTex(detail.value) }} />
                        <span>{detail.note}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {steps.review.issues.map((issue, index) => <p key={`${index}-${issue.reason}`} className="text-amber-300">{issue.step ? `Step ${issue.step}: ` : ''}{issue.reason}</p>)}
                {steps.notes && <p><strong className="text-slate-300">Notes:</strong> {steps.notes}</p>}
              </div>
            </section>
          )}
        </div>

        {/* Formula bar: docked above the footer so it stays visible, and stays open for many steps. */}
        {formulaTarget && (
          <section className="border-t border-violet-500/30 bg-violet-500/10 px-5 py-3 sm:px-6" aria-label="Formula editor">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-violet-200">
                Typing into: <span className="font-semibold">{formulaTarget === 'problem' ? 'Problem' : 'Your solution'}</span>
              </div>
              <div className="text-[11px] text-slate-400">Enter adds the formula and starts a new line · Shift+Enter keeps it on the same line</div>
            </div>
            <div className="mb-2 flex max-h-20 flex-wrap gap-1 overflow-y-auto" role="group" aria-label={`${cfg.label} symbols`}>
              {cfg.palette.map(item => (
                <button
                  key={item.latex}
                  type="button"
                  title={item.title}
                  aria-label={item.title}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => insertSymbol(item.latex)}
                  className={ui.paletteBtn}
                  dangerouslySetInnerHTML={{ __html: renderTex(item.label) }}
                />
              ))}
            </div>
            {React.createElement('math-field', {
              ref: (element: HTMLElement | null) => { formulaFieldRef.current = element as MathFieldElement | null; },
              className: 'math-practice-field',
              'aria-label': 'Formula to insert into the text field',
            })}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => insertFormula(true)} disabled={!formulaLatex.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50">
                <CornerDownLeft size={13} /> Add step
              </button>
              <button type="button" onClick={() => insertFormula(false)} disabled={!formulaLatex.trim()} className={ui.smallBtn}>Insert inline</button>
              <button type="button" onClick={insertNewLine} className={ui.smallBtn}>New line</button>
              <button type="button" onClick={closeFormula} className={ui.ghostBtn}>Done</button>
            </div>
          </section>
        )}

        <footer className={ui.footer}>
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800">Close</button>
          <button type="button" onClick={() => void insertAllMathWork()} disabled={inserting || (!problem.trim() && !combinedSolution)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
            {inserting && <Loader2 size={14} className="animate-spin" />}
            Insert all math work
          </button>
        </footer>
      </section>
    </>
  );
};

export default MathPracticePanel;