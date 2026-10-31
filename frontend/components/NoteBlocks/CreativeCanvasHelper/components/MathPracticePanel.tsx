'use client';

import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import {
  AlertTriangle, CheckCircle2, CircleHelp, CircleX, CornerDownLeft, ImagePlus,
  Keyboard, ListOrdered, Loader2, Sigma, X,
} from 'lucide-react';
import { pythonUrl } from '@/apiurl';
import 'katex/dist/katex.min.css';
import 'mathlive/fonts.css';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type MathFieldElement = HTMLElement & {
  value: string;
  mathVirtualKeyboardPolicy: 'manual' | 'auto' | 'sandboxed';
};

type FormulaTarget = 'problem' | 'solution';

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
};
type MathCheckResponse = {
  status: 'correct' | 'incorrect' | 'partially_correct' | 'cannot_verify';
  summary: string;
  issues: { step: number | null; reason: string }[];
  review: { status: 'agrees' | 'disagrees' | 'unavailable'; summary: string };
};
type StoredImage = { url: string; s3Key: string };

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
    'fixed left-1/2 z-[70] flex w-[min(94vw,720px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl',
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
};

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

// Markdown folds a single "\n" into a space, which is why every step looked like
// it was on one line in the preview. Two trailing spaces make it a real line break.
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
  const activeRequestRef = useRef(0);
  // Remembers where the text cursor was in each textarea, because the textarea
  // loses focus while you type in the math field.
  const caretRef = useRef<Record<FormulaTarget, number>>({ problem: 0, solution: 0 });
  // Always points at the latest insertFormula so the Enter-key listener never uses stale state.
  const insertRef = useRef<(newLine: boolean) => void>(() => {});

  const [mathLiveReady, setMathLiveReady] = useState(false);
  const [problem, setProblem] = useState(() => {
    const initial = '';
    caretRef.current.problem = initial.length;
    return initial;
  });
  const [userSolution, setUserSolution] = useState('');
  const [formulaLatex, setFormulaLatex] = useState('');
  const [formulaTarget, setFormulaTarget] = useState<FormulaTarget | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  const [error, setError] = useState('');
  const [stepsBusy, setStepsBusy] = useState(false);
  const [checkBusy, setCheckBusy] = useState(false);
  const [steps, setSteps] = useState<MathStepsResponse | null>(null);
  const [check, setCheck] = useState<MathCheckResponse | null>(null);
  const [paperSolutionFile, setPaperSolutionFile] = useState<File | null>(null);
  const [paperSolutionText, setPaperSolutionText] = useState('');
  const [paperSolutionImage, setPaperSolutionImage] = useState<StoredImage | null>(null);
  const [paperOcrBusy, setPaperOcrBusy] = useState(false);
  const [paperOcrError, setPaperOcrError] = useState('');
  const [paperImageError, setPaperImageError] = useState('');

  const formulaOpen = formulaTarget !== null;

  const clearOldResults = () => {
    activeRequestRef.current += 1;
    setSteps(null);
    setCheck(null);
    setStepsBusy(false);
    setCheckBusy(false);
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
        body: JSON.stringify({ expression: problemText, user_solution: combinedSolution, model }),
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

  const verifyMathAnswers = async (expressionLatex: string, answerValues: string[]) => {
    if (!answerValues.length) return 'not_available' as const;
    try {
      const { ComputeEngine } = await import('@cortex-js/compute-engine');
      const engine = new ComputeEngine();
      const normalized = normalizeMathDelimiters(expressionLatex);
      const mathEquation = normalized.match(/\$\$([\s\S]*?=[\s\S]*?)\$\$|\$([^$\n]*=[^$\n]*)\$/);
      const equationLatex = mathEquation?.[1] || mathEquation?.[2] || normalized;
      const equation = engine.parse(equationLatex);
      if (!equation.isValid || equation.operator !== 'Equal') return 'not_available' as const;
      const variable = normalized.match(/\b(?:solve|find)\s+for\s+([a-zA-Z])/i)?.[1] || 'x';
      const roots = equation.solve(variable) as any;
      if (!Array.isArray(roots) || roots.length === 0 || !roots.every((root: any) => typeof root?.isEqual === 'function')) return 'not_available' as const;
      const answers = answerValues.map(value => engine.parse(value)).filter(answer => answer.isValid);
      if (!answers.length) return 'not_available' as const;
      return roots.every((root: any) => answers.some(answer => root.isEqual(answer) === true)) &&
        answers.every(answer => roots.some((root: any) => root.isEqual(answer) === true))
        ? 'verified' as const : 'mismatch' as const;
    } catch {
      return 'not_available' as const;
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
        body: JSON.stringify({ expression: problemText, model, reference_solution: combinedSolution }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.detail === 'string' ? payload.detail : 'The AI could not generate worked steps.');
      const engineVerification = await verifyMathAnswers(problemText, payload.answer_values || []);
      if (requestId === activeRequestRef.current) setSteps({ ...payload, engineVerification });
    } catch (caught) {
      if (requestId === activeRequestRef.current) setError(caught instanceof Error ? caught.message : 'The AI could not generate worked steps.');
    } finally {
      if (requestId === activeRequestRef.current) setStepsBusy(false);
    }
  };

  /* ---------------- insert into the document ---------------- */

  const insertAllMathWork = () => {
    const problemText = problem.trim();
    const imageHtml = paperSolutionImage
      ? `<img src="${escapeAttr(paperSolutionImage.url)}" alt="${escapeAttr(paperSolutionFile?.name || 'Paper solution')}" title="${escapeAttr(paperSolutionFile?.name || 'Paper solution')}" data-s3-key="${escapeAttr(paperSolutionImage.s3Key)}">`
      : '';
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
      userSolution.trim() ? `<h4>My written solution</h4><p>${formatMathTextHtml(userSolution.trim())}</p>` : '',
      imageHtml ? `<h4>Paper solution image</h4>${imageHtml}` : '',
      paperSolutionText.trim() ? `<h4>OCR text</h4><p>${formatMathTextHtml(paperSolutionText.trim())}</p>` : '',
      checkedHtml,
      stepsHtml,
    ].join('');
    onInsertContent(content);
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

  const handleDialogKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    // Escape inside the math field belongs to MathLive.
    if ((event.target as HTMLElement).tagName === 'MATH-FIELD') return;
    event.stopPropagation();
    if (formulaOpen) closeFormula();
    else onClose();
  };

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
            <p className={`mt-1 text-sm ${ui.muted}`}>Check your work with AI, or ask for a step-by-step solution.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100" aria-label="Close math practice"><X size={18} /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="math-practice-problem" className={ui.label}>Problem</label>
              {formulaButton('problem')}
            </div>
            <textarea
              id="math-practice-problem"
              ref={problemTextareaRef}
              value={problem}
              onChange={event => { setProblem(event.target.value); rememberCaret('problem', event.currentTarget); setError(''); clearOldResults(); }}
              onSelect={event => rememberCaret('problem', event.currentTarget)}
              className={`${ui.textarea} min-h-28`}
              placeholder="Write or paste the full problem, including any instructions and equations."
            />
            <MathTextPreview value={problem} />
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="math-user-solution" className={ui.label}>Your solution / work</label>
              {formulaButton('solution')}
            </div>
            <textarea
              id="math-user-solution"
              ref={solutionTextareaRef}
              value={userSolution}
              onChange={event => { setUserSolution(event.target.value); rememberCaret('solution', event.currentTarget); setError(''); clearOldResults(); }}
              onSelect={event => rememberCaret('solution', event.currentTarget)}
              className={`${ui.textarea} min-h-32`}
              placeholder="Write your solution one step per line, or use Insert formula to add steps with the math keyboard."
            />
            <MathTextPreview value={userSolution} />
          </div>

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
              {checkBusy ? 'Checking your work…' : 'Check'}
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
            </section>
          )}

          {steps && (
            <section className={ui.stepsBox}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-300">Step-by-step solution · {steps.topic}</div>
                  <p className={`mt-1 text-xs ${ui.muted}`}>AI solution with an independent review. Final roots are checked locally when supported.</p>
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
                <p><strong className="text-slate-300">Math engine:</strong> {steps.engineVerification === 'verified' ? 'The computed roots match the AI answer.' : steps.engineVerification === 'mismatch' ? 'The computed roots do not match the AI answer.' : 'Could not independently check this kind of answer.'}</p>
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
          <button type="button" onClick={insertAllMathWork} disabled={!problem.trim() && !combinedSolution}
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50">
            Insert all math work
          </button>
        </footer>
      </section>
    </>
  );
};

export default MathPracticePanel;