'use client';
import React from 'react';

/* ---------------- Spec types (the AI emits this JSON) ---------------- */

export type GeoPoint = { id: string; x: number; y: number };
export type GeometrySpec = {
  kind: 'geometry';
  points: GeoPoint[];
  segments: [string, string][];
  circles?: { center: string; through?: string; r?: number }[];
  rightAngles?: { at: string; from: string; to: string }[];
  angles?: { at: string; from: string; to: string; label: string }[];
  ticks?: { seg: [string, string]; n: number }[];       // equal-length marks
  labels?: { seg: [string, string]; text: string }[];   // e.g. "6"
};

export type PartType = 'R' | 'V' | 'I' | 'C' | 'L' | 'SW' | 'LAMP' | 'GND';
export type CircuitPart = {
  id: string; type: PartType; label?: string; value?: string;
  from: [number, number]; to: [number, number];          // integer grid coords, axis-aligned
};
export type CircuitSpec = {
  kind: 'circuit';
  parts: CircuitPart[];
  wires: [number, number][][];                            // polylines on the grid
};
export type FigureSpec = GeometrySpec | CircuitSpec;

/* ---------------- Validation: returns human-readable problems ---------------- */

export const validateSpec = (spec: FigureSpec): string[] => {
  const issues: string[] = [];
  if (spec.kind === 'geometry') {
    const ids = new Set(spec.points.map(p => p.id));
    if (ids.size !== spec.points.length) issues.push('Duplicate point ids.');
    const need = (id: string, where: string) => { if (!ids.has(id)) issues.push(`${where}: unknown point "${id}".`); };
    spec.segments.forEach(([a, b]) => { need(a, 'segment'); need(b, 'segment'); });
    spec.circles?.forEach(c => { need(c.center, 'circle'); if (c.through) need(c.through, 'circle'); });
    spec.rightAngles?.forEach(r => { need(r.at, 'right angle'); need(r.from, 'right angle'); need(r.to, 'right angle'); });
    spec.angles?.forEach(r => { need(r.at, 'angle'); need(r.from, 'angle'); need(r.to, 'angle'); });
    spec.ticks?.forEach(t => { need(t.seg[0], 'tick'); need(t.seg[1], 'tick'); });
    spec.labels?.forEach(t => { need(t.seg[0], 'label'); need(t.seg[1], 'label'); });
    return issues;
  }
  // circuit: union-find over grid points joined by wires and parts' terminals
  const key = (p: [number, number]) => `${p[0]},${p[1]}`;
  const parent = new Map<string, string>();
  const find = (a: string): string => { if (!parent.has(a)) parent.set(a, a); const p = parent.get(a)!; if (p === a) return a; const r = find(p); parent.set(a, r); return r; };
  const union = (a: string, b: string) => parent.set(find(a), find(b));
  const ends = new Map<string, number>();
  const touch = (p: [number, number]) => { find(key(p)); ends.set(key(p), (ends.get(key(p)) ?? 0) + 1); };
  spec.wires.forEach(w => { for (let i = 0; i < w.length; i++) { find(key(w[i])); if (i) union(key(w[i - 1]), key(w[i])); } });
  const wireCells = new Set(spec.wires.flat().map(key));
  spec.parts.forEach(p => {
    if (p.type !== 'GND' && p.from[0] !== p.to[0] && p.from[1] !== p.to[1]) issues.push(`${p.id}: must be horizontal or vertical.`);
    touch(p.from); if (p.type !== 'GND') touch(p.to);
  });
  spec.parts.forEach(p => {
    const terms = p.type === 'GND' ? [p.from] : [p.from, p.to];
    terms.forEach(t => {
      const shared = (ends.get(key(t)) ?? 0) > 1 || wireCells.has(key(t));
      if (!shared) issues.push(`${p.id}: terminal (${t[0]},${t[1]}) is not connected to anything.`);
    });
  });
  const roots = new Set([...parent.keys()].map(find));
  if (roots.size > 1 && spec.parts.length > 1) {
    // parts connect to wires only via shared grid points, so count only clusters that contain a terminal
    const termRoots = new Set(spec.parts.flatMap(p => [p.from, p.to]).map(t => find(key(t))));
    if (termRoots.size > spec.parts.length * 2) issues.push('Circuit looks disconnected.');
  }
  return issues;
};

/* ---------------- Renderer ---------------- */

const STROKE = '#cbd5e1';
const ACCENT = '#a78bfa';
const TEXT = '#e2e8f0';

const GeometrySvg: React.FC<{ spec: GeometrySpec }> = ({ spec }) => {
  const W = 380, H = 280, PAD = 34;
  const xs = spec.points.map(p => p.x), ys = spec.points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min((W - 2 * PAD) / Math.max(1e-9, maxX - minX), (H - 2 * PAD) / Math.max(1e-9, maxY - minY));
  const P = (id: string) => {
    const p = spec.points.find(q => q.id === id);
    return p ? { x: PAD + (p.x - minX) * s, y: H - PAD - (p.y - minY) * s } : { x: 0, y: 0 };
  };
  const cx = spec.points.reduce((a, p) => a + P(p.id).x, 0) / spec.points.length;
  const cy = spec.points.reduce((a, p) => a + P(p.id).y, 0) / spec.points.length;
  const unit = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-72" role="img" aria-label="Redrawn geometry figure">
      {spec.circles?.map((c, i) => {
        const o = P(c.center);
        const r = c.through ? Math.hypot(P(c.through).x - o.x, P(c.through).y - o.y) : (c.r ?? 1) * s;
        return <circle key={i} cx={o.x} cy={o.y} r={r} fill="none" stroke={STROKE} strokeWidth={1.5} />;
      })}
      {spec.segments.map(([a, b], i) => <line key={i} x1={P(a).x} y1={P(a).y} x2={P(b).x} y2={P(b).y} stroke={STROKE} strokeWidth={1.8} />)}
      {spec.rightAngles?.map((r, i) => {
        const o = P(r.at), u = unit(o, P(r.from)), v = unit(o, P(r.to)), k = 11;
        const d = `M${o.x + u.x * k},${o.y + u.y * k} L${o.x + (u.x + v.x) * k},${o.y + (u.y + v.y) * k} L${o.x + v.x * k},${o.y + v.y * k}`;
        return <path key={i} d={d} fill="none" stroke={ACCENT} strokeWidth={1.5} />;
      })}
      {spec.angles?.map((g, i) => {
        const o = P(g.at), u = unit(o, P(g.from)), v = unit(o, P(g.to)), r = 22;
        const sweep = u.x * v.y - u.y * v.x > 0 ? 1 : 0;
        const d = `M${o.x + u.x * r},${o.y + u.y * r} A${r},${r} 0 0 ${sweep} ${o.x + v.x * r},${o.y + v.y * r}`;
        const m = unit({ x: 0, y: 0 }, { x: u.x + v.x, y: u.y + v.y });
        return (<g key={i}><path d={d} fill="none" stroke={ACCENT} strokeWidth={1.5} />
          <text x={o.x + m.x * (r + 12)} y={o.y + m.y * (r + 12) + 4} fill={TEXT} fontSize={12} textAnchor="middle">{g.label}</text></g>);
      })}
      {spec.ticks?.map((t, i) => {
        const a = P(t.seg[0]), b = P(t.seg[1]), u = unit(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        return <g key={i}>{Array.from({ length: t.n }, (_, j) => {
          const off = (j - (t.n - 1) / 2) * 5;
          return <line key={j} x1={mx + u.x * off - u.y * 5} y1={my + u.y * off + u.x * 5} x2={mx + u.x * off + u.y * 5} y2={my + u.y * off - u.x * 5} stroke={ACCENT} strokeWidth={1.5} />;
        })}</g>;
      })}
      {spec.labels?.map((t, i) => {
        const a = P(t.seg[0]), b = P(t.seg[1]), u = unit(a, b), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        let nx = -u.y, ny = u.x; if ((mx + nx - cx) * (mx - cx) + (my + ny - cy) * (my - cy) < 0) { nx = -nx; ny = -ny; }
        return <text key={i} x={mx + nx * 12} y={my + ny * 12 + 4} fill={TEXT} fontSize={12} textAnchor="middle">{t.text}</text>;
      })}
      {spec.points.map(p => {
        const q = P(p.id), u = unit({ x: cx, y: cy }, q);
        return (<g key={p.id}><circle cx={q.x} cy={q.y} r={2.5} fill={TEXT} />
          <text x={q.x + u.x * 13} y={q.y + u.y * 13 + 4} fill={TEXT} fontSize={14} fontWeight={600} textAnchor="middle">{p.id}</text></g>);
      })}
    </svg>
  );
};

const Symbol: React.FC<{ type: PartType }> = ({ type }) => {
  const st = { fill: 'none', stroke: STROKE, strokeWidth: 1.8 } as const;
  switch (type) {
    case 'R': return <polyline {...st} points="-16,0 -12,-7 -6,7 0,-7 6,7 12,-7 16,0" />;
    case 'C': return <g {...st}><line x1={-4} y1={-12} x2={-4} y2={12} /><line x1={4} y1={-12} x2={4} y2={12} /></g>;
    case 'L': return <path {...st} d="M-16,0 a4,5 0 0 1 8,0 a4,5 0 0 1 8,0 a4,5 0 0 1 8,0 a4,5 0 0 1 8,0" />;
    case 'V': return <g><circle r={14} {...st} /><text x={6} y={-3} fill={TEXT} fontSize={11} textAnchor="middle">+</text><text x={-6} y={-3} fill={TEXT} fontSize={11} textAnchor="middle">−</text></g>;
    case 'I': return <g {...st}><circle r={14} /><line x1={-8} y1={0} x2={8} y2={0} /><polyline points="3,-4 8,0 3,4" /></g>;
    case 'SW': return <g {...st}><circle cx={-12} cy={0} r={2} /><line x1={-12} y1={0} x2={10} y2={-10} /></g>;
    case 'LAMP': return <g {...st}><circle r={13} /><line x1={-9} y1={-9} x2={9} y2={9} /><line x1={-9} y1={9} x2={9} y2={-9} /></g>;
    default: return null;
  }
};

const CircuitSvg: React.FC<{ spec: CircuitSpec }> = ({ spec }) => {
  const S = 70, PAD = 40;
  const pts = [...spec.parts.flatMap(p => [p.from, p.to]), ...spec.wires.flat()];
  const minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
  const X = (g: number) => PAD + (g - minX) * S, Y = (g: number) => PAD + (maxY - g) * S;
  const W = PAD * 2 + (maxX - minX) * S, H = PAD * 2 + (maxY - minY) * S;
  return (
    <svg viewBox={`0 0 ${Math.max(W, 160)} ${Math.max(H, 120)}`} className="w-full max-h-72" role="img" aria-label="Redrawn circuit">
      {spec.wires.map((w, i) => <polyline key={i} points={w.map(p => `${X(p[0])},${Y(p[1])}`).join(' ')} fill="none" stroke={STROKE} strokeWidth={1.8} />)}
      {spec.parts.map(p => {
        const x1 = X(p.from[0]), y1 = Y(p.from[1]), x2 = X(p.to[0]), y2 = Y(p.to[1]);
        const label = [p.label, p.value].filter(Boolean).join(' = ');
        if (p.type === 'GND') return (
          <g key={p.id} stroke={STROKE} strokeWidth={1.8}><line x1={x1} y1={y1} x2={x1} y2={y1 + 10} />
            <line x1={x1 - 12} y1={y1 + 10} x2={x1 + 12} y2={y1 + 10} /><line x1={x1 - 7} y1={y1 + 15} x2={x1 + 7} y2={y1 + 15} /><line x1={x1 - 3} y1={y1 + 20} x2={x1 + 3} y2={y1 + 20} /></g>);
        const len = Math.hypot(x2 - x1, y2 - y1), ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, horiz = Math.abs(y2 - y1) < 1;
        return (
          <g key={p.id}>
            <g transform={`translate(${mx} ${my}) rotate(${ang})`}>
              <line x1={-len / 2} y1={0} x2={-16} y2={0} stroke={STROKE} strokeWidth={1.8} />
              <line x1={16} y1={0} x2={len / 2} y2={0} stroke={STROKE} strokeWidth={1.8} />
              <Symbol type={p.type} />
            </g>
            <text x={horiz ? mx : mx + 26} y={horiz ? my - 22 : my + 4} fill={TEXT} fontSize={12} textAnchor={horiz ? 'middle' : 'start'}>{label}</text>
          </g>);
      })}
    </svg>
  );
};

export const FigureRender: React.FC<{ spec: FigureSpec }> = ({ spec }) => (
  <div className="rounded-lg border border-slate-700 bg-slate-950 p-2">
    {spec.kind === 'geometry' ? <GeometrySvg spec={spec} /> : <CircuitSvg spec={spec} />}
  </div>
);

/** Parse + sanity check text from the JSON editor. */
export const parseSpec = (text: string): { spec: FigureSpec | null; issues: string[] } => {
  try {
    const raw = JSON.parse(text);
    if (raw?.kind === 'geometry' && Array.isArray(raw.points) && Array.isArray(raw.segments)) {
      const spec = raw as GeometrySpec; return { spec, issues: validateSpec(spec) };
    }
    if (raw?.kind === 'circuit' && Array.isArray(raw.parts) && Array.isArray(raw.wires)) {
      const spec = raw as CircuitSpec; return { spec, issues: validateSpec(spec) };
    }
    return { spec: null, issues: ['Spec needs kind "geometry" (points, segments) or "circuit" (parts, wires).'] };
  } catch {
    return { spec: null, issues: ['Not valid JSON.'] };
  }
};

/** Plain-text facts derived from a confirmed spec, appended to givens so the solver has no hidden info. */
export const specToText = (spec: FigureSpec): string => {
  if (spec.kind === 'geometry') {
    const lines: string[] = [`Figure (not to scale): points ${spec.points.map(p => p.id).join(', ')}.`,
      `Segments: ${spec.segments.map(([a, b]) => a + b).join(', ')}.`];
    spec.rightAngles?.forEach(r => lines.push(`∠${r.from}${r.at}${r.to} = 90°.`));
    spec.angles?.forEach(a => lines.push(`∠${a.from}${a.at}${a.to} = ${a.label}.`));
    spec.labels?.forEach(l => lines.push(`${l.seg[0]}${l.seg[1]} = ${l.text}.`));
    spec.ticks?.forEach(t => lines.push(`${t.seg[0]}${t.seg[1]} has equal-length mark group ${t.n}.`));
    spec.circles?.forEach(c => lines.push(`Circle centered at ${c.center}${c.through ? ` through ${c.through}` : c.r ? ` radius ${c.r}` : ''}.`));
    return lines.join(' ');
  }
  return 'Circuit components: ' + spec.parts.map(p =>
    `${p.id} (${p.type}${p.value ? ' ' + p.value : ''}) between grid (${p.from}) and (${p.to})`).join('; ') + '.';
};