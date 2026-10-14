// Visualisations are plain data, so the frames of a walkthrough can be produced by
// running the real algorithm (see src/traces/) and checked by tests.

/** Colour roles. active = being looked at now · match = found / kept · info = secondary focus ·
 *  warn = candidate or about to change · bad = rejected / conflict · done = finished · dim = out of play. */
export type Tone = 'active' | 'match' | 'info' | 'warn' | 'bad' | 'done' | 'dim';

export type Cell = number | string | null;

/** A labelled marker under an array, list or bar cell, such as `L`, `R`, `slow` or `i`. */
export type Pointer = { name: string; at: number; tone?: Tone };

type Base = { label?: string };

export type ArrayViz = Base & {
  kind: 'array';
  items: Cell[];
  tones?: Partial<Record<number, Tone>>; // by index
  pointers?: Pointer[];
  window?: [number, number]; // inclusive index range drawn as a bracket
  indices?: boolean; // show the index under each cell (default true)
  offset?: number; // shift right by this many cells, e.g. a pattern sliding under a text
};

export type GridViz = Base & {
  kind: 'grid';
  cells: Cell[][];
  tones?: Partial<Record<string, Tone>>; // by "row,col"
  rowHeaders?: string[]; // e.g. the characters of one string in an LCS table
  colHeaders?: string[];
};

export type TreeViz = Base & {
  kind: 'tree';
  nodes: Cell[]; // LeetCode level order: [3, 9, 20, null, null, 15, 7]
  tones?: Partial<Record<number, Tone>>; // by position in `nodes`
  notes?: Partial<Record<number, string>>; // small text under a node, e.g. "h=2"
};

export type GraphNode = { id: string; x: number; y: number; label?: string };
export type GraphEdge = { from: string; to: string; label?: string; tone?: Tone };
export type GraphViz = Base & {
  kind: 'graph';
  directed?: boolean;
  nodes: GraphNode[]; // x and y in any unit; the drawing is scaled to fit
  edges: GraphEdge[];
  tones?: Partial<Record<string, Tone>>; // by node id
  notes?: Partial<Record<string, string>>; // small text under a node, e.g. a distance
};

export type ListViz = Base & {
  kind: 'list';
  items: Cell[];
  tones?: Partial<Record<number, Tone>>;
  pointers?: Pointer[];
  doubly?: boolean;
  cycleTo?: number; // the last node links back to this index
};

export type StackViz = Base & { kind: 'stack'; items: Cell[]; tones?: Partial<Record<number, Tone>> }; // bottom first
export type QueueViz = Base & { kind: 'queue'; items: Cell[]; tones?: Partial<Record<number, Tone>> }; // front first
export type SetViz = Base & { kind: 'set'; items: Cell[]; tones?: Partial<Record<number, Tone>> };
export type MapViz = Base & {
  kind: 'map';
  entries: [Cell, Cell][];
  tones?: Partial<Record<number, Tone>>; // by entry position
  keyTitle?: string;
  valueTitle?: string;
};
/** Named values such as `sum = 7` or `best = 3`. */
export type VarsViz = Base & { kind: 'vars'; items: [string, Cell][]; tones?: Partial<Record<number, Tone>> };

export type BarsViz = Base & {
  kind: 'bars';
  values: number[];
  tones?: Partial<Record<number, Tone>>;
  pointers?: Pointer[];
  water?: number[]; // a level above each bar, e.g. trapped rain water
};

export type Interval = { start: number; end: number; label?: string; tone?: Tone };
export type IntervalsViz = Base & {
  kind: 'intervals';
  items: Interval[];
  marker?: number; // a vertical sweep line at this position
  min?: number;
  max?: number;
};

export type Viz =
  | ArrayViz | GridViz | TreeViz | GraphViz | ListViz | StackViz | QueueViz
  | SetViz | MapViz | VarsViz | BarsViz | IntervalsViz;

/** One step of a walkthrough: what it looks like, and a sentence on what just happened. */
export type Frame = { note: string; parts: Viz[] };
