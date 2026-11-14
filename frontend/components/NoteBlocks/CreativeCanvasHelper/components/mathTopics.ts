/* ------------------------------------------------------------------ */
/* Topic data for MathPracticePanel. Pure data + one pure function,    */
/* so adding a topic later (linear algebra, calculus…) means adding    */
/* one entry to TOPICS and nothing else.                               */
/* ------------------------------------------------------------------ */

export type MathTopic = 'general' | 'geometry' | 'trigonometry' | 'logarithms' | 'calculus' | 'stats' | 'physics';
export type AngleUnit = 'degrees' | 'radians';

/** `latex` goes into the MathLive field; #? is a fill-in placeholder. `label` is what the button shows (rendered with KaTeX). */
export type PaletteItem = { label: string; latex: string; title: string };
export type Example = { title: string; problem: string; givens?: string[]; find?: string; angleUnit?: AngleUnit };
export type RefGroup = { heading: string; items: { name: string; latex: string }[] };

export type TopicConfig = {
  id: MathTopic;
  label: string;
  blurb: string;
  tip: string;
  usesAngles: boolean;
  defaultAngleUnit: AngleUnit;
  palette: PaletteItem[];
  examples: Example[];
  reference: RefGroup[];
};

/** Plain-text symbols for the givens / find inputs (these are normal text fields, not MathLive). */
export const GEOMETRY_TEXT_SYMBOLS = ['∠', '°', '⟂', '∥', '△', '≅', '∼', 'π', '√'];

export const TOPICS: Record<MathTopic, TopicConfig> = {
  general: {
    id: 'general',
    label: 'General',
    blurb: 'Any algebra or calculus problem.',
    tip: 'Wrap the equation in $…$ and write “solve for x” so the answer can be checked locally.',
    usesAngles: false,
    defaultAngleUnit: 'radians',
    palette: [
      { label: '\\frac{a}{b}', latex: '\\frac{#?}{#?}', title: 'Fraction' },
      { label: '\\sqrt{x}', latex: '\\sqrt{#?}', title: 'Square root' },
      { label: 'x^n', latex: '#?^{#?}', title: 'Power' },
      { label: 'x_n', latex: '#?_{#?}', title: 'Subscript' },
      { label: '\\pm', latex: '\\pm', title: 'Plus or minus' },
      { label: '\\le', latex: '\\le', title: 'Less than or equal' },
      { label: '\\ge', latex: '\\ge', title: 'Greater than or equal' },
      { label: '\\ne', latex: '\\ne', title: 'Not equal' },
      { label: '\\pi', latex: '\\pi', title: 'Pi' },
    ],
    examples: [
      { title: 'Linear', problem: 'Solve for $x$: $2x + 4 = 14$' },
      { title: 'Quadratic', problem: 'Solve for $x$: $x^2 - 5x + 6 = 0$' },
    ],
    reference: [],
  },

  geometry: {
    id: 'geometry',
    label: 'Geometry',
    blurb: 'Triangles, circles, areas, volumes and coordinate geometry.',
    tip: 'List every fact the diagram shows under “Figure & givens”. The AI treats the figure as not drawn to scale.',
    usesAngles: true,
    defaultAngleUnit: 'degrees',
    palette: [
      { label: '\\angle', latex: '\\angle ', title: 'Angle' },
      { label: '\\triangle', latex: '\\triangle ', title: 'Triangle' },
      { label: '\\overline{AB}', latex: '\\overline{#?}', title: 'Segment' },
      { label: '\\overrightarrow{AB}', latex: '\\overrightarrow{#?}', title: 'Ray' },
      { label: '\\widehat{AB}', latex: '\\widehat{#?}', title: 'Arc' },
      { label: '\\parallel', latex: '\\parallel', title: 'Parallel' },
      { label: '\\perp', latex: '\\perp', title: 'Perpendicular' },
      { label: '\\cong', latex: '\\cong', title: 'Congruent' },
      { label: '\\sim', latex: '\\sim', title: 'Similar' },
      { label: '^{\\circ}', latex: '^{\\circ}', title: 'Degrees' },
      { label: '\\pi', latex: '\\pi', title: 'Pi' },
      { label: '\\sqrt{x}', latex: '\\sqrt{#?}', title: 'Square root' },
      { label: '\\frac{a}{b}', latex: '\\frac{#?}{#?}', title: 'Fraction' },
      { label: 'x^2', latex: '#?^{2}', title: 'Squared' },
    ],
    examples: [
      {
        title: 'Altitude to hypotenuse',
        problem: 'Triangle ABC has a right angle at B. D is the foot of the altitude from B to AC.',
        givens: ['AB = 6', 'BC = 8', '∠B = 90°', 'BD ⟂ AC, D lies on AC'],
        find: 'BD, AD and DC',
      },
      {
        title: 'Inscribed angle',
        problem: 'A circle has center O. Chord AB subtends a central angle at O. P is a point on the major arc AB.',
        givens: ['∠AOB = 100°'],
        find: '∠APB',
      },
      {
        title: 'Coordinate triangle',
        problem: 'Triangle with vertices A(1, 2), B(7, 2) and C(4, 8).',
        givens: [],
        find: 'the area and the circumcenter',
      },
      {
        title: 'Cone volume',
        problem: 'A cone has base radius $r = 5$ cm and slant height $13$ cm. Find its volume.',
        givens: [],
        find: 'volume in cm³',
      },
    ],
    reference: [
      {
        heading: 'Triangles',
        items: [
          { name: 'Area', latex: 'A=\\tfrac12 bh' },
          { name: 'Heron', latex: 'A=\\sqrt{s(s-a)(s-b)(s-c)},\\ s=\\tfrac{a+b+c}{2}' },
          { name: 'Pythagorean', latex: 'a^2+b^2=c^2' },
          { name: 'Interior angles', latex: '(n-2)\\cdot 180^{\\circ}' },
          { name: 'Similar: area ratio', latex: '\\frac{A_1}{A_2}=\\left(\\frac{a_1}{a_2}\\right)^2' },
        ],
      },
      {
        heading: 'Circles',
        items: [
          { name: 'Area', latex: 'A=\\pi r^2' },
          { name: 'Circumference', latex: 'C=2\\pi r' },
          { name: 'Arc length (θ in rad)', latex: 's=r\\theta' },
          { name: 'Sector area (θ in rad)', latex: 'A=\\tfrac12 r^2\\theta' },
          { name: 'Inscribed angle', latex: '\\angle APB=\\tfrac12\\,\\angle AOB' },
        ],
      },
      {
        heading: 'Solids and coordinates',
        items: [
          { name: 'Sphere', latex: 'V=\\tfrac43\\pi r^3,\\ S=4\\pi r^2' },
          { name: 'Cylinder', latex: 'V=\\pi r^2 h' },
          { name: 'Cone', latex: 'V=\\tfrac13\\pi r^2 h' },
          { name: 'Distance', latex: 'd=\\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}' },
          { name: 'Midpoint', latex: 'M=\\left(\\tfrac{x_1+x_2}{2},\\tfrac{y_1+y_2}{2}\\right)' },
        ],
      },
    ],
  },

  trigonometry: {
    id: 'trigonometry',
    label: 'Trigonometry',
    blurb: 'Identities, equations on an interval, right and oblique triangles.',
    tip: 'State the interval (for example 0 ≤ x < 2π) so every solution in it is expected. Pick degrees or radians above.',
    usesAngles: true,
    defaultAngleUnit: 'radians',
    palette: [
      { label: '\\sin', latex: '\\sin\\left(#?\\right)', title: 'Sine' },
      { label: '\\cos', latex: '\\cos\\left(#?\\right)', title: 'Cosine' },
      { label: '\\tan', latex: '\\tan\\left(#?\\right)', title: 'Tangent' },
      { label: '\\sec', latex: '\\sec\\left(#?\\right)', title: 'Secant' },
      { label: '\\csc', latex: '\\csc\\left(#?\\right)', title: 'Cosecant' },
      { label: '\\cot', latex: '\\cot\\left(#?\\right)', title: 'Cotangent' },
      { label: '\\sin^{-1}', latex: '\\sin^{-1}\\left(#?\\right)', title: 'Inverse sine' },
      { label: '\\cos^{-1}', latex: '\\cos^{-1}\\left(#?\\right)', title: 'Inverse cosine' },
      { label: '\\tan^{-1}', latex: '\\tan^{-1}\\left(#?\\right)', title: 'Inverse tangent' },
      { label: '\\sin^{2}', latex: '\\sin^{2}\\left(#?\\right)', title: 'Sine squared' },
      { label: '\\pi', latex: '\\pi', title: 'Pi' },
      { label: '\\frac{\\pi}{n}', latex: '\\frac{\\pi}{#?}', title: 'Pi over n' },
      { label: '\\theta', latex: '\\theta', title: 'Theta' },
      { label: '^{\\circ}', latex: '^{\\circ}', title: 'Degrees' },
    ],
    examples: [
      { title: 'Equation on [0, 2π)', problem: 'Solve for $x$: $2\\sin(x) = 1$ for $0 \\le x < 2\\pi$', angleUnit: 'radians' },
      { title: 'Quadratic in cos', problem: 'Solve for $x$: $2\\cos^2(x) - \\cos(x) - 1 = 0$ for $0^{\\circ} \\le x < 360^{\\circ}$', angleUnit: 'degrees' },
      { title: 'Simplify', problem: 'Simplify $\\frac{\\sin 2x}{1 + \\cos 2x}$', angleUnit: 'radians' },
      { title: 'Law of cosines', problem: 'In triangle $ABC$, $a = 7$, $b = 9$ and $C = 50^{\\circ}$. Find side $c$ and the other two angles.', angleUnit: 'degrees' },
    ],
    reference: [
      {
        heading: 'Identities',
        items: [
          { name: 'Pythagorean', latex: '\\sin^2\\theta+\\cos^2\\theta=1' },
          { name: '', latex: '1+\\tan^2\\theta=\\sec^2\\theta' },
          { name: '', latex: '1+\\cot^2\\theta=\\csc^2\\theta' },
        ],
      },
      {
        heading: 'Sum and double angle',
        items: [
          { name: 'Sine sum', latex: '\\sin(A\\pm B)=\\sin A\\cos B\\pm\\cos A\\sin B' },
          { name: 'Cosine sum', latex: '\\cos(A\\pm B)=\\cos A\\cos B\\mp\\sin A\\sin B' },
          { name: 'Tangent sum', latex: '\\tan(A\\pm B)=\\frac{\\tan A\\pm\\tan B}{1\\mp\\tan A\\tan B}' },
          { name: 'Double sine', latex: '\\sin 2\\theta=2\\sin\\theta\\cos\\theta' },
          { name: 'Double cosine', latex: '\\cos 2\\theta=\\cos^2\\theta-\\sin^2\\theta=2\\cos^2\\theta-1' },
        ],
      },
      {
        heading: 'Triangles and units',
        items: [
          { name: 'Law of sines', latex: '\\frac{a}{\\sin A}=\\frac{b}{\\sin B}=\\frac{c}{\\sin C}' },
          { name: 'Law of cosines', latex: 'c^2=a^2+b^2-2ab\\cos C' },
          { name: 'Degrees ↔ radians', latex: '180^{\\circ}=\\pi\\ \\text{rad}' },
        ],
      },
    ],
  },

  logarithms: {
    id: 'logarithms',
    label: 'Logarithms',
    blurb: 'Log and exponential equations, properties, change of base.',
    tip: 'The argument of a log must be positive. Every answer is substituted back, so extraneous roots are flagged.',
    usesAngles: false,
    defaultAngleUnit: 'radians',
    palette: [
      { label: '\\log_b', latex: '\\log_{#?}\\left(#?\\right)', title: 'Log, any base' },
      { label: '\\log_2', latex: '\\log_{2}\\left(#?\\right)', title: 'Log base 2' },
      { label: '\\log_{10}', latex: '\\log_{10}\\left(#?\\right)', title: 'Log base 10' },
      { label: '\\ln', latex: '\\ln\\left(#?\\right)', title: 'Natural log' },
      { label: 'e^{x}', latex: 'e^{#?}', title: 'e to a power' },
      { label: 'b^{x}', latex: '#?^{#?}', title: 'Power' },
      { label: '\\frac{a}{b}', latex: '\\frac{#?}{#?}', title: 'Fraction' },
      { label: '\\sqrt{x}', latex: '\\sqrt{#?}', title: 'Square root' },
      { label: '>', latex: '>', title: 'Greater than' },
      { label: '\\ge', latex: '\\ge', title: 'Greater than or equal' },
      { label: '\\ne', latex: '\\ne', title: 'Not equal' },
    ],
    examples: [
      { title: 'Extraneous root', problem: 'Solve for $x$: $\\log_2(x) + \\log_2(x-2) = 3$' },
      { title: 'Exponential', problem: 'Solve for $x$: $2^{x+1} = 7$' },
      { title: 'Quotient rule', problem: 'Solve for $x$: $\\ln(x+1) - \\ln(x) = 2$' },
      { title: 'Change of base', problem: 'Express $\\log_5 12$ using natural logs and evaluate it to 4 decimal places.' },
    ],
    reference: [
      {
        heading: 'Properties',
        items: [
          { name: 'Product', latex: '\\log_b(xy)=\\log_b x+\\log_b y' },
          { name: 'Quotient', latex: '\\log_b\\frac{x}{y}=\\log_b x-\\log_b y' },
          { name: 'Power', latex: '\\log_b(x^k)=k\\log_b x' },
          { name: 'Change of base', latex: '\\log_b x=\\frac{\\ln x}{\\ln b}' },
          { name: 'Inverse', latex: 'b^{\\log_b x}=x' },
          { name: 'Special values', latex: '\\log_b b=1,\\ \\log_b 1=0,\\ \\ln e=1' },
        ],
      },
      {
        heading: 'Domain',
        items: [{ name: 'Valid log', latex: '\\log_b(x)\\ \\text{needs}\\ x>0,\\ b>0,\\ b\\ne1' }],
      },
    ],
  },

  calculus: {
    id: 'calculus',
    label: 'Calculus',
    blurb: 'Limits, derivatives, integrals, series, multivariable.',
    tip: 'Write the function inside one $…$ block, e.g. $\\frac{d}{dx}\\left(x^2\\sin x\\right)$ or $\\int_0^1 x e^{x}\\,dx$. These two forms are verified numerically.',
    usesAngles: false,
    defaultAngleUnit: 'radians',
    palette: [
      { label: '\\frac{d}{dx}', latex: '\\frac{d}{dx}', title: 'Derivative' },
      { label: '\\int', latex: '\\int_{#?}^{#?} #? \\,dx', title: 'Definite integral' },
      { label: '\\lim', latex: '\\lim_{x\\to #?}', title: 'Limit' },
      { label: '\\sum', latex: '\\sum_{n=1}^{\\infty}', title: 'Series' },
      { label: '\\partial', latex: '\\partial', title: 'Partial derivative' },
      { label: '\\infty', latex: '\\infty', title: 'Infinity' },
    ],
    examples: [
      { title: 'Derivative', problem: 'Differentiate $\\frac{d}{dx}\\left(x^2\\sin x\\right)$' },
      { title: 'Definite integral', problem: 'Evaluate $\\int_0^1 x e^{x}\\,dx$' },
    ],
    reference: [
      {
        heading: 'Derivatives',
        items: [
          { name: 'Product', latex: "(uv)' = u'v + uv'" },
          { name: 'Quotient', latex: "\\left(\\frac{u}{v}\\right)' = \\frac{u'v - uv'}{v^2}" },
          { name: 'Chain', latex: "\\frac{d}{dx}f(g(x)) = f'(g(x))\\,g'(x)" },
        ],
      },
      {
        heading: 'Integrals',
        items: [
          { name: 'By parts', latex: '\\int u\\,dv = uv - \\int v\\,du' },
          { name: 'Power', latex: '\\int x^n\\,dx = \\frac{x^{n+1}}{n+1} + C' },
        ],
      },
    ],
  },

  stats: {
    id: 'stats',
    label: 'Probability & stats',
    blurb: 'Counting, probability, distributions, expectation, hypothesis tests.',
    tip: 'State the distribution and every parameter. Say whether sampling is with or without replacement.',
    usesAngles: false,
    defaultAngleUnit: 'radians',
    palette: [
      { label: '\\binom{n}{k}', latex: '\\binom{#?}{#?}', title: 'Binomial coefficient' },
      { label: '\\bar{x}', latex: '\\bar{x}', title: 'Sample mean' },
      { label: '\\sigma', latex: '\\sigma', title: 'Std deviation' },
      { label: '\\mu', latex: '\\mu', title: 'Mean' },
      { label: 'P(A|B)', latex: 'P(#?\\mid #?)', title: 'Conditional probability' },
      { label: '\\cap', latex: '\\cap', title: 'Intersection' },
      { label: '\\cup', latex: '\\cup', title: 'Union' },
    ],
    examples: [
      { title: 'Binomial', problem: 'A fair coin is tossed 10 times. Find the probability of exactly 4 heads.' },
      { title: 'Conditional', problem: 'Given $P(A)=0.4$, $P(B)=0.5$ and $P(A\\cap B)=0.2$, find $P(A|B)$.' },
    ],
    reference: [
      {
        heading: 'Probability',
        items: [
          { name: 'Bayes', latex: 'P(A|B)=\\frac{P(B|A)P(A)}{P(B)}' },
          { name: 'Binomial', latex: 'P(X=k)=\\binom{n}{k}p^k(1-p)^{n-k}' },
        ],
      },
      {
        heading: 'Summary',
        items: [
          { name: 'Variance', latex: '\\mathrm{Var}(X)=E[X^2]-E[X]^2' },
          { name: 'z-score', latex: 'z=\\frac{x-\\mu}{\\sigma}' },
        ],
      },
    ],
  },

  physics: {
    id: 'physics',
    label: 'Physics & engineering',
    blurb: 'Mechanics, circuits, waves, thermodynamics, engineering math.',
    tip: 'Give every quantity with units. Use “Draw from problem” for circuits and diagrams, then confirm the drawing before checking.',
    usesAngles: true,
    defaultAngleUnit: 'degrees',
    palette: [
      { label: '\\Omega', latex: '\\Omega', title: 'Ohm' },
      { label: '\\mu', latex: '\\mu', title: 'Mu' },
      { label: '\\omega', latex: '\\omega', title: 'Omega' },
      { label: '\\theta', latex: '\\theta', title: 'Theta' },
      { label: '\\vec{F}', latex: '\\vec{#?}', title: 'Vector' },
      { label: '\\Delta', latex: '\\Delta', title: 'Delta' },
      { label: '\\mathrm{m/s^2}', latex: '\\mathrm{m/s^2}', title: 'm/s²' },
    ],
    examples: [
      {
        title: 'Series circuit',
        problem: 'Find the current and the voltage across R2.',
        givens: ['V = 12 V battery in series with R1 = 4 Ω and R2 = 6 Ω'],
        find: 'current I and V across R2',
      },
      {
        title: 'Incline',
        problem: 'A block slides down a rough incline. Find its acceleration.',
        givens: ['m = 2 kg', 'incline angle 30°', 'kinetic friction coefficient μ = 0.3', 'g = 9.8 m/s²'],
        find: 'acceleration of the block',
      },
    ],
    reference: [
      {
        heading: 'Mechanics',
        items: [
          { name: 'Newton 2', latex: '\\sum \\vec{F}=m\\vec{a}' },
          { name: 'Kinematics', latex: 's=v_0t+\\tfrac12at^2' },
          { name: 'Kinetic energy', latex: 'E_k=\\tfrac12mv^2' },
        ],
      },
      {
        heading: 'Circuits',
        items: [
          { name: 'Ohm', latex: 'V=IR' },
          { name: 'Series', latex: 'R_{eq}=R_1+R_2+\\cdots' },
          { name: 'Parallel', latex: '\\frac1{R_{eq}}=\\frac1{R_1}+\\frac1{R_2}+\\cdots' },
          { name: 'RC time constant', latex: '\\tau=RC' },
        ],
      },
    ],
  },
};

export const TOPIC_ORDER: MathTopic[] = ['general', 'calculus', 'stats', 'geometry', 'trigonometry', 'logarithms', 'physics'];

/** Turns the form fields into the single `expression` string sent to the AI. */
export const buildProblemText = (parts: {
  problem: string;
  givens: string[];
  find: string;
  angleUnit: AngleUnit | null;
}) => {
  const blocks = [parts.problem.trim()];
  if (parts.givens.length) blocks.push(`Given:\n${parts.givens.map(item => `- ${item}`).join('\n')}`);
  if (parts.find) blocks.push(`Find: ${parts.find}`);
  if (parts.angleUnit) {
    blocks.push(parts.angleUnit === 'degrees' ? 'Angle unit: degrees.' : 'Angle unit: radians (unless a degree sign is shown).');
  }
  return blocks.filter(Boolean).join('\n\n');
};