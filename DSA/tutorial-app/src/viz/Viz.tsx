import { Fragment, useId, type ReactNode } from 'react';
import { layoutTree, parseLevelOrder } from './tree';
import type {
  ArrayViz, BarsViz, Cell, Frame, GraphViz, GridViz, IntervalsViz, ListViz, MapViz,
  Pointer, QueueViz, SetViz, StackViz, Tone, TreeViz, VarsViz, Viz,
} from './types';

export function fmt(c: Cell): string {
  if (c === null) return '';
  if (c === Infinity) return '∞';
  if (c === -Infinity) return '−∞';
  // A true minus sign reads better than a hyphen in the cells.
  if (typeof c === 'number' && c < 0) return `−${-c}`;
  return String(c);
}

const tc = (t: Tone | undefined) => (t ? ` t-${t}` : '');

/** Arrowhead marker ids must be unique on the page: a walkthrough renders every frame. */
function useMarkerId() {
  return 'm' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

function byIndex(pointers: Pointer[] | undefined) {
  const map = new Map<number, Pointer[]>();
  for (const p of pointers ?? []) map.set(p.at, [...(map.get(p.at) ?? []), p]);
  return map;
}

function Part({ kind, label, children }: { kind: string; label?: string; children: ReactNode }) {
  return (
    <div className={`v-part v-${kind}`}>
      {label && <div className="v-label">{label}</div>}
      {children}
    </div>
  );
}

/* ---------- array ---------- */

function ArrayView({ v }: { v: ArrayViz }) {
  const ptrs = byIndex(v.pointers);
  const showIdx = v.indices !== false;
  const [w0, w1] = v.window ?? [-1, -2];
  // Pointers may sit one past the end (a loop that has finished), so draw empty slots up to them.
  const last = Math.max(v.items.length - 1, ...[...ptrs.keys()]);
  const slots = Array.from({ length: last + 1 }, (_, i) => i);
  return (
    <Part kind="array" label={v.label}>
      <div className="v-scroll">
        <div className="v-row" role="list" aria-label={v.label ?? 'array'}>
          {Array.from({ length: v.offset ?? 0 }, (_, i) => (
            <div key={`pad${i}`} className="v-col v-pad" aria-hidden="true" />
          ))}
          {slots.map((i) => {
            const inWin = i >= w0 && i <= w1;
            const cls = ['v-col', inWin && 'in-win', i === w0 && 'win-l', i === w1 && 'win-r'].filter(Boolean).join(' ');
            const ghost = i >= v.items.length;
            return (
              <div key={i} className={cls} role="listitem">
                <div className={`v-cell${ghost ? ' v-ghost' : ''}${tc(v.tones?.[i])}`}>{ghost ? '' : fmt(v.items[i])}</div>
                {showIdx && <div className="v-idx">{ghost ? '' : i}</div>}
                <div className="v-ptrs">
                  {ptrs.get(i)?.map((p) => (
                    <span key={p.name} className={`v-ptr${tc(p.tone ?? 'active')}`}>{p.name}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Part>
  );
}

/* ---------- grid ---------- */

function GridView({ v }: { v: GridViz }) {
  const cols = Math.max(0, ...v.cells.map((r) => r.length));
  const hasRowHead = !!v.rowHeaders;
  return (
    <Part kind="grid" label={v.label}>
      <div className="v-scroll">
        <div className="v-gridbox" style={{ gridTemplateColumns: `repeat(${cols + (hasRowHead ? 1 : 0)}, minmax(2.1rem, max-content))` }}>
          {v.colHeaders && (
            <>
              {hasRowHead && <div className="v-gh" />}
              {Array.from({ length: cols }, (_, c) => (
                <div key={`h${c}`} className="v-gh">{v.colHeaders?.[c] ?? ''}</div>
              ))}
            </>
          )}
          {v.cells.map((row, r) => (
            <Fragment key={r}>
              {hasRowHead && <div className="v-gh">{v.rowHeaders?.[r] ?? ''}</div>}
              {Array.from({ length: cols }, (_, c) => (
                <div key={c} className={`v-cell${tc(v.tones?.[`${r},${c}`])}`}>{fmt(row[c] ?? null)}</div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    </Part>
  );
}

/* ---------- tree ---------- */

const TX = 46;
const TY = 60;
const TR = 17;

function TreeView({ v }: { v: TreeViz }) {
  const root = parseLevelOrder(v.nodes);
  const placed = layoutTree(root);
  const pos = new Map(placed.map((p) => [p.node.index, p]));
  const cols = Math.max(1, placed.length);
  const rows = Math.max(1, ...placed.map((p) => p.row + 1));
  const width = cols * TX + 16;
  const height = rows * TY + 8;
  const at = (col: number, row: number) => [8 + col * TX + TX / 2, 4 + row * TY + TR + 6] as const;
  return (
    <Part kind="tree" label={v.label}>
      <div className="v-scroll">
        <svg className="v-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.label ?? 'binary tree'}>
          {placed.map(({ node, col, row }) =>
            [node.left, node.right].map((child) => {
              if (!child) return null;
              const c = pos.get(child.index)!;
              const [x1, y1] = at(col, row);
              const [x2, y2] = at(c.col, c.row);
              return <line key={`${node.index}-${child.index}`} className="v-edge" x1={x1} y1={y1} x2={x2} y2={y2} />;
            }),
          )}
          {placed.map(({ node, col, row }) => {
            const [x, y] = at(col, row);
            const note = v.notes?.[node.index];
            return (
              <g key={node.index} className={`v-node${tc(v.tones?.[node.index])}`}>
                <circle cx={x} cy={y} r={TR} />
                <text x={x} y={y + 4} textAnchor="middle">{fmt(node.value)}</text>
                {note && <text className="v-note" x={x} y={y + TR + 12} textAnchor="middle">{note}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </Part>
  );
}

/* ---------- graph ---------- */

const GR = 17;
const GPAD = 30;

function GraphView({ v }: { v: GraphViz }) {
  const xs = v.nodes.map((n) => n.x);
  const ys = v.nodes.map((n) => n.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX + GPAD * 2;
  const height = Math.max(...ys) - minY + GPAD * 2 + 10;
  const pos = new Map(v.nodes.map((n) => [n.id, { x: n.x - minX + GPAD, y: n.y - minY + GPAD }]));
  const has = new Set(v.edges.map((e) => `${e.from}>${e.to}`));
  const uid = useMarkerId();

  return (
    <Part kind="graph" label={v.label}>
      <div className="v-scroll">
        <svg className="v-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.label ?? 'graph'}>
          {v.directed && (
            <defs>
              <marker id={uid} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                <path className="v-ah" d="M0,0 L10,5 L0,10 z" />
              </marker>
            </defs>
          )}
          {v.edges.map((e, i) => {
            const a = pos.get(e.from);
            const b = pos.get(e.to);
            if (!a || !b) throw new Error(`Graph edge refers to an unknown node: ${e.from} -> ${e.to}`);
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            // Two directed edges between the same pair bend apart so both stay visible.
            const bend = v.directed && has.has(`${e.to}>${e.from}`) ? 14 : 0;
            const x1 = a.x + ux * GR;
            const y1 = a.y + uy * GR;
            const x2 = b.x - ux * (GR + (v.directed ? 2 : 0));
            const y2 = b.y - uy * (GR + (v.directed ? 2 : 0));
            const mx = (x1 + x2) / 2 - uy * bend;
            const my = (y1 + y2) / 2 + ux * bend;
            const d = bend ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
            const lx = bend ? (x1 + 2 * mx + x2) / 4 : mx;
            const ly = bend ? (y1 + 2 * my + y2) / 4 : my;
            return (
              <g key={i} className={`v-gedge${tc(e.tone)}`}>
                <path d={d} markerEnd={v.directed ? `url(#${uid})` : undefined} />
                {e.label !== undefined && (
                  <>
                    <rect className="v-elbl-bg" x={lx - 4 - 3.6 * e.label.length} y={ly - 9} width={8 + 7.2 * e.label.length} height={16} rx={4} />
                    <text className="v-elbl" x={lx} y={ly + 3.5} textAnchor="middle">{e.label}</text>
                  </>
                )}
              </g>
            );
          })}
          {v.nodes.map((n) => {
            const p = pos.get(n.id)!;
            const note = v.notes?.[n.id];
            return (
              <g key={n.id} className={`v-node${tc(v.tones?.[n.id])}`}>
                <circle cx={p.x} cy={p.y} r={GR} />
                <text x={p.x} y={p.y + 4} textAnchor="middle">{n.label ?? n.id}</text>
                {note && <text className="v-note" x={p.x} y={p.y + GR + 13} textAnchor="middle">{note}</text>}
              </g>
            );
          })}
        </svg>
      </div>
    </Part>
  );
}

/* ---------- linked list ---------- */

const LW = 46;
const LH = 34;
const LGAP = 34;

function ListView({ v }: { v: ListViz }) {
  const n = v.items.length;
  const ptrs = byIndex(v.pointers);
  const hasCycle = v.cycleTo !== undefined && n > 0;
  const step = LW + LGAP;
  const x = (i: number) => 10 + i * step;
  const top = 8;
  const ptrRows = Math.max(0, ...[...ptrs.values()].map((p) => p.length));
  const cycleY = top + LH + 16 + ptrRows * 16;
  const width = x(n) + (hasCycle ? 0 : 40);
  const height = (hasCycle ? cycleY + 14 : top + LH + 10 + ptrRows * 16) + 4;
  const uid = useMarkerId();

  return (
    <Part kind="list" label={v.label}>
      <div className="v-scroll">
        <svg className="v-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.label ?? 'linked list'}>
          <defs>
            <marker id={uid} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
              <path className="v-ah" d="M0,0 L10,5 L0,10 z" />
            </marker>
          </defs>
          {v.items.map((item, i) => (
            <g key={i}>
              <g className={`v-lnode${tc(v.tones?.[i])}`}>
                <rect x={x(i)} y={top} width={LW} height={LH} rx={7} />
                <text x={x(i) + LW / 2} y={top + LH / 2 + 4} textAnchor="middle">{fmt(item)}</text>
              </g>
              {(i < n - 1 || !hasCycle) &&
                (v.doubly && i < n - 1 ? (
                  <>
                    <line className="v-larrow" x1={x(i) + LW + 2} y1={top + 11} x2={x(i) + step - 3} y2={top + 11} markerEnd={`url(#${uid})`} />
                    <line className="v-larrow" x1={x(i) + step - 2} y1={top + LH - 11} x2={x(i) + LW + 3} y2={top + LH - 11} markerEnd={`url(#${uid})`} />
                  </>
                ) : (
                  <line className="v-larrow" x1={x(i) + LW + 2} y1={top + LH / 2} x2={x(i) + step - 3} y2={top + LH / 2} markerEnd={`url(#${uid})`} />
                ))}
              {(ptrs.get(i) ?? []).map((p, k) => (
                <text key={p.name} className={`v-lptr${tc(p.tone ?? 'active')}`} x={x(i) + LW / 2} y={top + LH + 16 + k * 16} textAnchor="middle">
                  {p.name}
                </text>
              ))}
            </g>
          ))}
          {!hasCycle && (
            <text className="v-null" x={x(n) + 2} y={top + LH / 2 + 4}>null</text>
          )}
          {hasCycle && (
            <path
              className="v-larrow"
              // Vertical legs run near the node edges, clear of the centred pointer labels.
              d={`M${x(n - 1) + LW - 7},${top + LH} L${x(n - 1) + LW - 7},${cycleY} L${x(v.cycleTo!) + 7},${cycleY} L${x(v.cycleTo!) + 7},${top + LH + 3}`}
              fill="none"
              markerEnd={`url(#${uid})`}
            />
          )}
        </svg>
      </div>
    </Part>
  );
}

/* ---------- stack, queue, set, map, vars ---------- */

function StackView({ v }: { v: StackViz }) {
  return (
    <Part kind="stack" label={v.label}>
      <div className="v-stackbox" role="list" aria-label={v.label ?? 'stack'}>
        {v.items.length === 0 && <div className="v-empty">empty</div>}
        {v.items.map((item, i) => ({ item, i })).reverse().map(({ item, i }) => (
          <div key={i} className={`v-cell${tc(v.tones?.[i])}`} role="listitem">
            {fmt(item)}
            {i === v.items.length - 1 && <span className="v-tag">top</span>}
          </div>
        ))}
      </div>
    </Part>
  );
}

function QueueView({ v }: { v: QueueViz }) {
  return (
    <Part kind="queue" label={v.label}>
      <div className="v-scroll">
        <div className="v-queuebox" role="list" aria-label={v.label ?? 'queue'}>
          <span className="v-end">front</span>
          {v.items.length === 0 && <div className="v-empty">empty</div>}
          {v.items.map((item, i) => (
            <div key={i} className={`v-cell${tc(v.tones?.[i])}`} role="listitem">{fmt(item)}</div>
          ))}
          <span className="v-end">back</span>
        </div>
      </div>
    </Part>
  );
}

function SetView({ v }: { v: SetViz }) {
  return (
    <Part kind="set" label={v.label}>
      <div className="v-setbox">
        <span className="v-brace">{'{'}</span>
        {v.items.length === 0 && <span className="v-empty">empty</span>}
        {v.items.map((item, i) => (
          <span key={i} className={`v-chip${tc(v.tones?.[i])}`}>{fmt(item)}</span>
        ))}
        <span className="v-brace">{'}'}</span>
      </div>
    </Part>
  );
}

function MapView({ v }: { v: MapViz }) {
  return (
    <Part kind="map" label={v.label}>
      <table className="v-maptable">
        <thead>
          <tr>
            <th>{v.keyTitle ?? 'key'}</th>
            <th>{v.valueTitle ?? 'value'}</th>
          </tr>
        </thead>
        <tbody>
          {v.entries.length === 0 && (
            <tr>
              <td colSpan={2} className="v-empty">empty</td>
            </tr>
          )}
          {v.entries.map(([k, val], i) => (
            <tr key={i} className={tc(v.tones?.[i]).trim() || undefined}>
              <td>{fmt(k)}</td>
              <td>{fmt(val)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Part>
  );
}

function VarsView({ v }: { v: VarsViz }) {
  return (
    <Part kind="vars" label={v.label}>
      <div className="v-varsbox">
        {v.items.map(([name, value], i) => (
          <span key={name} className={`v-var${tc(v.tones?.[i])}`}>
            <span className="v-varname">{name}</span> = <b>{fmt(value)}</b>
          </span>
        ))}
      </div>
    </Part>
  );
}

/* ---------- bars ---------- */

const BW = 30;
const BGAP = 8;
const BH = 120;

function BarsView({ v }: { v: BarsViz }) {
  const ptrs = byIndex(v.pointers);
  const top = Math.max(1, ...v.values, ...(v.water ?? []));
  const scale = BH / top;
  const ptrRows = Math.max(0, ...[...ptrs.values()].map((p) => p.length));
  const width = v.values.length * (BW + BGAP) + BGAP;
  const base = BH + 22;
  const height = base + 18 + ptrRows * 15 + 4;
  return (
    <Part kind="bars" label={v.label}>
      <div className="v-scroll">
        <svg className="v-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.label ?? 'bar chart'}>
          {v.values.map((val, i) => {
            const x = BGAP + i * (BW + BGAP);
            const h = val * scale;
            const level = v.water?.[i] ?? 0;
            const wh = Math.max(0, level - val) * scale;
            return (
              <g key={i}>
                {wh > 0 && <rect className="v-water" x={x} y={base - h - wh} width={BW} height={wh} />}
                <rect className={`v-bar${tc(v.tones?.[i])}`} x={x} y={base - h} width={BW} height={Math.max(h, 1)} rx={3} />
                <text className="v-barval" x={x + BW / 2} y={base - h - wh - 5} textAnchor="middle">{val}</text>
                <text className="v-baridx" x={x + BW / 2} y={base + 14} textAnchor="middle">{i}</text>
                {(ptrs.get(i) ?? []).map((p, k) => (
                  <text key={p.name} className={`v-lptr${tc(p.tone ?? 'active')}`} x={x + BW / 2} y={base + 30 + k * 15} textAnchor="middle">
                    {p.name}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </Part>
  );
}

/* ---------- intervals ---------- */

function IntervalsView({ v }: { v: IntervalsViz }) {
  const lo = v.min ?? Math.min(...v.items.map((it) => it.start), v.marker ?? Infinity);
  const hi = v.max ?? Math.max(...v.items.map((it) => it.end), v.marker ?? -Infinity);
  const span = Math.max(1, hi - lo);
  const unit = Math.max(14, Math.min(48, 560 / span));
  const left = 18;
  const width = left * 2 + span * unit;
  const rowH = 24;
  const axisY = v.items.length * rowH + 12;
  const height = axisY + 28;
  const X = (t: number) => left + (t - lo) * unit;
  const every = span <= 24 ? 1 : Math.ceil(span / 24);
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / every) * every; t <= hi; t += every) ticks.push(t);
  return (
    <Part kind="intervals" label={v.label}>
      <div className="v-scroll">
        <svg className="v-svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={v.label ?? 'intervals'}>
          {v.items.map((it, i) => {
            const y = 6 + i * rowH;
            const w = Math.max(3, (it.end - it.start) * unit);
            const text = it.label ?? `[${it.start}, ${it.end}]`;
            return (
              <g key={i} className={`v-ival${tc(it.tone)}`}>
                <rect x={X(it.start)} y={y} width={w} height={rowH - 8} rx={4} />
                <text x={X(it.start) + w + 6} y={y + rowH / 2} className="v-ivlbl">{text}</text>
              </g>
            );
          })}
          <line className="v-axis" x1={left} y1={axisY} x2={width - left} y2={axisY} />
          {ticks.map((t) => (
            <g key={t}>
              <line className="v-axis" x1={X(t)} y1={axisY} x2={X(t)} y2={axisY + 4} />
              <text className="v-baridx" x={X(t)} y={axisY + 16} textAnchor="middle">{t}</text>
            </g>
          ))}
          {v.marker !== undefined && <line className="v-marker" x1={X(v.marker)} y1={0} x2={X(v.marker)} y2={axisY} />}
        </svg>
      </div>
    </Part>
  );
}

/* ---------- dispatch ---------- */

export function VizView({ v }: { v: Viz }) {
  switch (v.kind) {
    case 'array': return <ArrayView v={v} />;
    case 'grid': return <GridView v={v} />;
    case 'tree': return <TreeView v={v} />;
    case 'graph': return <GraphView v={v} />;
    case 'list': return <ListView v={v} />;
    case 'stack': return <StackView v={v} />;
    case 'queue': return <QueueView v={v} />;
    case 'set': return <SetView v={v} />;
    case 'map': return <MapView v={v} />;
    case 'vars': return <VarsView v={v} />;
    case 'bars': return <BarsView v={v} />;
    case 'intervals': return <IntervalsView v={v} />;
  }
}

export function FrameView({ frame }: { frame: Pick<Frame, 'parts'> }) {
  return (
    <div className="v-frame">
      {frame.parts.map((p, i) => (
        <VizView key={i} v={p} />
      ))}
    </div>
  );
}

/** A single still picture made of one or more parts. */
export function VizFigure({ parts, caption }: { parts: Viz[]; caption?: ReactNode }) {
  return (
    <figure className="vfig">
      <div className="vfig-stage">
        <FrameView frame={{ parts }} />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}
