/* ------------------------------------------------------------------ */
/* Figure spec: a small, human-editable description of a diagram.      */
/*                                                                     */
/* Flow: image -> AI reads it into a spec -> the app redraws the spec  */
/* -> the student compares the redraw with the image and fixes the     */
/* spec -> the confirmed spec becomes text for the solver.             */
/* Coordinates are only for drawing (0..1, y grows downward).          */
/* ------------------------------------------------------------------ */

export type FigureKind = 'geometry' | 'circuit';

export type GeometrySpec = {
  kind: 'geometry';
  points: { id: string; x: number; y: number }[];
  segments: { a: string; b: string; label?: string; dashed?: boolean }[];
  circles: { center: string; through?: string; r?: number; label?: string }[];
  angles: { at: string; from: string; to: string; label?: string; right?: boolean }[];
  /** Segments sharing a group carry the same tick marks, so they are equal in length. */
  equal_marks: { segments: [string, string][] }[];
};

export const CIRCUIT_TYPES = [
  'resistor', 'voltage_source', 'current_source', 'capacitor', 'inductor', 'switch', 'lamp', 'wire',
] as const;
export type CircuitType = (typeof CIRCUIT_TYPES)[number];

export type CircuitSpec = {
  kind: 'circuit';
  nodes: { id: string; x: number; y: number; ground?: boolean }[];
  /**
   * value is in base SI units (ohms, volts, amps, farads, henries).
   * voltage_source: a is the negative terminal, b the positive terminal.
   * current_source: current flows from a to b through the source.
   */
  components: { id: string; type: CircuitType; a: string; b: string; value?: number; label?: string; closed?: boolean }[];
};

export type FigureSpec = GeometrySpec | CircuitSpec;
export type NormalizeResult = { spec: FigureSpec; warnings: string[] } | { error: string };

/* ---------------- validation ---------------- */

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const unit01 = (value: unknown) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : null;
};
const items = (value: unknown, cap: number): unknown[] => (Array.isArray(value) ? value.slice(0, cap) : []);

/** Checks an AI reading or a hand-edited spec. Anything that points at an unknown id is dropped with a warning. */
export const normalizeSpec = (raw: unknown, fallbackKind: FigureKind): NormalizeResult => {
  if (!isObject(raw)) return { error: 'The figure reading must be a JSON object.' };
  const kind = raw.kind === 'circuit' || raw.kind === 'geometry' ? raw.kind : fallbackKind;
  const warnings: string[] = [];

  if (kind === 'geometry') {
    const ids = new Set<string>();
    const points: GeometrySpec['points'] = [];
    for (const entry of items(raw.points, 40)) {
      if (!isObject(entry)) continue;
      const id = text(entry.id, 10);
      const x = unit01(entry.x);
      const y = unit01(entry.y);
      if (!id || x === null || y === null) { warnings.push('Ignored a point with no name or position.'); continue; }
      if (ids.has(id)) { warnings.push(`Ignored a second point named ${id}.`); continue; }
      ids.add(id);
      points.push({ id, x, y });
    }
    if (points.length < 2) return { error: 'The figure needs at least two named points.' };

    const segments: GeometrySpec['segments'] = [];
    const seen = new Set<string>();
    for (const entry of items(raw.segments, 80)) {
      if (!isObject(entry)) continue;
      const a = text(entry.a, 10);
      const b = text(entry.b, 10);
      if (!ids.has(a) || !ids.has(b) || a === b) { warnings.push(`Ignored segment ${a}${b}: it uses an unknown point.`); continue; }
      const key = [a, b].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const label = text(entry.label, 40);
      segments.push({ a, b, ...(label ? { label } : {}), ...(entry.dashed === true ? { dashed: true } : {}) });
    }

    const circles: GeometrySpec['circles'] = [];
    for (const entry of items(raw.circles, 10)) {
      if (!isObject(entry)) continue;
      const center = text(entry.center, 10);
      const through = text(entry.through, 10);
      const radius = typeof entry.r === 'number' && entry.r > 0 && entry.r <= 1 ? entry.r : undefined;
      if (!ids.has(center) || (!ids.has(through) && radius === undefined)) { warnings.push(`Ignored a circle at ${center || '?'}: it needs a known center and a point it passes through.`); continue; }
      const label = text(entry.label, 40);
      circles.push({ center, ...(ids.has(through) ? { through } : { r: radius }), ...(label ? { label } : {}) });
    }

    const angles: GeometrySpec['angles'] = [];
    for (const entry of items(raw.angles, 30)) {
      if (!isObject(entry)) continue;
      const at = text(entry.at, 10);
      const from = text(entry.from, 10);
      const to = text(entry.to, 10);
      if (![at, from, to].every(id => ids.has(id)) || new Set([at, from, to]).size < 3) { warnings.push(`Ignored angle ${from}${at}${to}: it uses an unknown point.`); continue; }
      const label = text(entry.label, 20);
      angles.push({ at, from, to, ...(label ? { label } : {}), ...(entry.right === true ? { right: true } : {}) });
    }

    const equal_marks: GeometrySpec['equal_marks'] = [];
    for (const group of items(raw.equal_marks, 8)) {
      if (!isObject(group)) continue;
      const pairs: [string, string][] = [];
      for (const pair of items(group.segments, 12)) {
        if (Array.isArray(pair) && pair.length === 2 && ids.has(text(pair[0], 10)) && ids.has(text(pair[1], 10))) {
          pairs.push([text(pair[0], 10), text(pair[1], 10)]);
        }
      }
      if (pairs.length) equal_marks.push({ segments: pairs });
    }
    return { spec: { kind: 'geometry', points, segments, circles, angles, equal_marks }, warnings };
  }

  const ids = new Set<string>();
  const nodes: CircuitSpec['nodes'] = [];
  for (const entry of items(raw.nodes, 40)) {
    if (!isObject(entry)) continue;
    const id = text(entry.id, 10);
    const x = unit01(entry.x);
    const y = unit01(entry.y);
    if (!id || x === null || y === null) { warnings.push('Ignored a node with no name or position.'); continue; }
    if (ids.has(id)) { warnings.push(`Ignored a second node named ${id}.`); continue; }
    ids.add(id);
    nodes.push({ id, x, y, ...(entry.ground === true ? { ground: true } : {}) });
  }
  const componentIds = new Set<string>();
  const components: CircuitSpec['components'] = [];
  for (const entry of items(raw.components, 60)) {
    if (!isObject(entry)) continue;
    const id = text(entry.id, 10);
    const type = CIRCUIT_TYPES.find(candidate => candidate === entry.type);
    const a = text(entry.a, 10);
    const b = text(entry.b, 10);
    if (!id || !type) { warnings.push(`Ignored component ${id || '?'}: unknown type.`); continue; }
    if (componentIds.has(id)) { warnings.push(`Ignored a second component named ${id}.`); continue; }
    if (!ids.has(a) || !ids.has(b) || a === b) { warnings.push(`Ignored ${id}: it must join two different known nodes.`); continue; }
    componentIds.add(id);
    const value = typeof entry.value === 'number' && Number.isFinite(entry.value) ? entry.value : undefined;
    const label = text(entry.label, 40);
    components.push({
      id, type, a, b,
      ...(value !== undefined ? { value } : {}),
      ...(label ? { label } : {}),
      ...(type === 'switch' ? { closed: entry.closed !== false } : {}),
    });
  }
  if (nodes.length < 2 || components.length < 1) return { error: 'The circuit needs at least two nodes and one component.' };
  return { spec: { kind: 'circuit', nodes, components }, warnings };
};

/* ---------------- number formatting ---------------- */

const PREFIXES: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

export const formatSI = (value: number, unit: string) => {
  if (value === 0) return `0 ${unit}`;
  const magnitude = Math.abs(value);
  const [scale, prefix] = PREFIXES.find(([size]) => magnitude >= size * 0.9999) ?? PREFIXES[PREFIXES.length - 1];
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`;
};

export const UNIT_OF: Record<CircuitType, string> = {
  resistor: 'Ω', lamp: 'Ω', voltage_source: 'V', current_source: 'A', capacitor: 'F', inductor: 'H', switch: '', wire: '',
};

/** Text shown next to a component in the drawing. */
export const componentCaption = (component: CircuitSpec['components'][number]) => {
  if (component.label) return component.label;
  const unit = UNIT_OF[component.type];
  return component.value !== undefined && unit ? `${component.id} = ${formatSI(component.value, unit)}` : component.id;
};

/* ---------------- DC circuit solver (modified nodal analysis) ---------------- */

export type DCComponentResult = {
  id: string;
  type: CircuitType;
  a: string;
  b: string;
  /** Current from a to b through the part, amps. null when it is not determined (plain wires). */
  current: number | null;
  /** Drop from a to b for passive parts, rise from a to b for sources, volts. */
  voltage: number | null;
  /** Passive parts: power dissipated. Sources: power supplied (negative means it absorbs power). */
  power: number | null;
  role: 'load' | 'source' | 'other';
};

export type DCResult =
  | {
      ok: true;
      ground: string;
      groundAssumed: boolean;
      nodeVoltages: { id: string; volts: number }[];
      components: DCComponentResult[];
      suppliedPower: number;
      dissipatedPower: number;
      balanced: boolean;
      notes: string[];
    }
  | { ok: false; error: string };

const UNSOLVABLE = 'The circuit could not be solved. Part of it may be floating, or sources may conflict. Check that every part connects back to ground.';

/** Gaussian elimination with partial pivoting. Returns null for a singular matrix. */
const solveLinear = (matrix: number[][], rhs: number[]) => {
  const size = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < size; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < size; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = col + 1; row < size; row += 1) {
      const factor = a[row][col] / a[col][col];
      for (let k = col; k <= size; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  const x = new Array<number>(size).fill(0);
  for (let row = size - 1; row >= 0; row -= 1) {
    let sum = a[row][size];
    for (let k = row + 1; k < size; k += 1) sum -= a[row][k] * x[k];
    x[row] = sum / a[row][row];
  }
  return x;
};

/** Exact DC solution. Capacitors are open, inductors and closed switches are shorts, wires merge nodes. */
export const solveDC = (spec: CircuitSpec): DCResult => {
  const parent = new Map<string, string>(spec.nodes.map(node => [node.id, node.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const shorts = (c: CircuitSpec['components'][number]) =>
    c.type === 'wire' || c.type === 'inductor' || (c.type === 'switch' && c.closed !== false);
  for (const c of spec.components) if (shorts(c)) parent.set(find(c.a), find(c.b));

  const stamped = spec.components.filter(c => ['resistor', 'lamp', 'voltage_source', 'current_source'].includes(c.type));
  if (!stamped.length) return { ok: false, error: 'There is no resistor or source to solve.' };

  for (const c of stamped) {
    if (c.value === undefined) return { ok: false, error: `${c.id} has no value. Add its value in the figure reading.` };
    if ((c.type === 'resistor' || c.type === 'lamp') && !(c.value > 0)) {
      return { ok: false, error: `${c.id} needs a resistance above 0 Ω. Use a wire for a short.` };
    }
  }

  const degree = new Map<string, number>();
  for (const c of stamped) for (const end of [c.a, c.b]) degree.set(find(end), (degree.get(find(end)) ?? 0) + 1);
  const flagged = spec.nodes.find(node => node.ground && degree.has(find(node.id)));
  let groundRoot: string;
  let groundAssumed = false;
  if (flagged) {
    groundRoot = find(flagged.id);
  } else {
    groundAssumed = true;
    groundRoot = [...degree.entries()].sort((left, right) => right[1] - left[1])[0][0];
  }
  const groundName = flagged?.id ?? spec.nodes.find(node => find(node.id) === groundRoot)?.id ?? groundRoot;

  const nets = [...degree.keys()].filter(root => root !== groundRoot);
  const index = new Map(nets.map((root, i) => [root, i]));
  const sources = stamped.filter(c => c.type === 'voltage_source');
  const size = nets.length + sources.length;
  const matrix = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  const rhs = new Array<number>(size).fill(0);
  const at = (end: string) => index.get(find(end)); // undefined = ground

  for (const c of stamped) {
    const p = at(c.a);
    const q = at(c.b);
    if (c.type === 'resistor' || c.type === 'lamp') {
      const g = 1 / (c.value as number);
      if (find(c.a) === find(c.b)) continue; // shorted out by wires: no current
      if (p !== undefined) matrix[p][p] += g;
      if (q !== undefined) matrix[q][q] += g;
      if (p !== undefined && q !== undefined) { matrix[p][q] -= g; matrix[q][p] -= g; }
    } else if (c.type === 'current_source') {
      if (q !== undefined) rhs[q] += c.value as number;
      if (p !== undefined) rhs[p] -= c.value as number;
    }
  }
  sources.forEach((c, k) => {
    const row = nets.length + k;
    const minus = at(c.a);
    const plus = at(c.b);
    if (plus !== undefined) { matrix[plus][row] += 1; matrix[row][plus] += 1; }
    if (minus !== undefined) { matrix[minus][row] -= 1; matrix[row][minus] -= 1; }
    rhs[row] = c.value as number;
  });

  const solution = size ? solveLinear(matrix, rhs) : [];
  if (!solution) return { ok: false, error: UNSOLVABLE };

  const volts = (id: string) => {
    const i = index.get(find(id));
    return i === undefined ? 0 : solution[i];
  };

  const components: DCComponentResult[] = spec.components.map(c => {
    const va = volts(c.a);
    const vb = volts(c.b);
    const base = { id: c.id, type: c.type, a: c.a, b: c.b };
    if (c.type === 'resistor' || c.type === 'lamp') {
      const current = (va - vb) / (c.value as number);
      return { ...base, current, voltage: va - vb, power: current * current * (c.value as number), role: 'load' as const };
    }
    if (c.type === 'voltage_source') {
      const branch = solution[nets.length + sources.indexOf(c)];
      const current = -branch;
      return { ...base, current, voltage: vb - va, power: (vb - va) * current, role: 'source' as const };
    }
    if (c.type === 'current_source') {
      const current = c.value as number;
      return { ...base, current, voltage: vb - va, power: (vb - va) * current, role: 'source' as const };
    }
    if (c.type === 'capacitor' || (c.type === 'switch' && c.closed === false)) {
      return { ...base, current: 0, voltage: va - vb, power: 0, role: 'other' as const };
    }
    return { ...base, current: null, voltage: null, power: null, role: 'other' as const };
  });

  const suppliedPower = components.filter(c => c.role === 'source').reduce((sum, c) => sum + (c.power ?? 0), 0);
  const dissipatedPower = components.filter(c => c.role === 'load').reduce((sum, c) => sum + (c.power ?? 0), 0);
  const balanced = Math.abs(suppliedPower - dissipatedPower) <= 1e-6 * Math.max(1, Math.abs(suppliedPower));

  const notes: string[] = [];
  if (spec.components.some(c => c.type === 'capacitor' || c.type === 'inductor' || c.type === 'switch')) {
    notes.push('DC steady state: capacitors act as open circuits, inductors as shorts, and switches as drawn.');
  }
  const nodeVoltages = spec.nodes
    .filter(node => node.id !== groundName && degree.has(find(node.id)))
    .map(node => ({ id: node.id, volts: volts(node.id) }));
  return { ok: true, ground: groundName, groundAssumed, nodeVoltages, components, suppliedPower, dissipatedPower, balanced, notes };
};

/* ---------------- text for the solver ---------------- */

const joinList = (parts: string[]) => parts.join('; ');

const describeGeometry = (spec: GeometrySpec) => {
  const lines = [`Points: ${spec.points.map(point => point.id).join(', ')}.`];
  if (spec.segments.length) {
    lines.push(`Segments drawn: ${joinList(spec.segments.map(s => `${s.a}${s.b}${s.label ? ` (${s.label})` : ''}${s.dashed ? ' dashed' : ''}`))}.`);
  }
  if (spec.circles.length) {
    lines.push(`Circles: ${joinList(spec.circles.map(c => `center ${c.center}${c.through ? `, passes through ${c.through}` : ''}${c.label ? ` (${c.label})` : ''}`))}.`);
  }
  if (spec.angles.length) {
    lines.push(`Angles marked: ${joinList(spec.angles.map(a => `∠${a.from}${a.at}${a.to}${a.right ? ' is a right angle' : ''}${a.label && !(a.right && /^90\s*°?$/.test(a.label)) ? (a.right ? ` (${a.label})` : ` = ${a.label}`) : ''}`))}.`);
  }
  for (const group of spec.equal_marks) {
    if (group.segments.length > 1) lines.push(`Equal tick marks: ${group.segments.map(([a, b]) => `${a}${b}`).join(' = ')}.`);
  }
  return lines;
};

const describeCircuit = (spec: CircuitSpec) => {
  const lines = [`Nodes: ${spec.nodes.map(node => node.id + (node.ground ? ' (ground)' : '')).join(', ')}.`, 'Components:'];
  for (const c of spec.components) {
    const value = c.value !== undefined && UNIT_OF[c.type] ? ` ${formatSI(c.value, UNIT_OF[c.type])}` : '';
    const name = c.type.replace('_', ' ');
    if (c.type === 'voltage_source') lines.push(`- ${c.id}: ${name}${value}, ${c.a} is the negative terminal and ${c.b} the positive terminal.`);
    else if (c.type === 'current_source') lines.push(`- ${c.id}: ${name}${value}, current flows from ${c.a} to ${c.b} through the source.`);
    else if (c.type === 'switch') lines.push(`- ${c.id}: ${c.closed === false ? 'open' : 'closed'} switch between ${c.a} and ${c.b}.`);
    else lines.push(`- ${c.id}: ${name}${value} between ${c.a} and ${c.b}.`);
  }
  const result = solveDC(spec);
  if (result.ok) {
    lines.push(`Exact DC solution, computed by a circuit solver from the description above (ground at ${result.ground}):`);
    for (const node of result.nodeVoltages) lines.push(`- V(${node.id}) = ${formatSI(node.volts, 'V')}`);
    for (const c of result.components) {
      if (c.current === null) continue;
      const forward = c.current >= 0;
      lines.push(`- I(${c.id}) = ${formatSI(Math.abs(c.current), 'A')} from ${forward ? c.a : c.b} to ${forward ? c.b : c.a}`);
      if (c.power !== null && c.role !== 'other') {
        lines.push(`- P(${c.id}) = ${formatSI(Math.abs(c.power), 'W')} ${c.role === 'load' ? 'dissipated' : c.power >= 0 ? 'supplied' : 'absorbed'}`);
      }
    }
    lines.push(...result.notes);
  }
  return lines;
};

/** The confirmed figure as plain text. Layout coordinates are left out on purpose. */
export const describeSpec = (spec: FigureSpec) =>
  [
    'Figure described and confirmed by the student. This description overrides anything different in an attached image.',
    ...(spec.kind === 'geometry' ? describeGeometry(spec) : describeCircuit(spec)),
  ].join('\n');