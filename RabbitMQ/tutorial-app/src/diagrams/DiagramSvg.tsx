import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import {
  EDGE_KINDS, HEX_INSET, hasSlots, pillWidth, placeNode, routeEdge,
  type DiagramSpec, type EdgeSpec, type PlacedNode,
} from './geometry';

/** The diagram drawing itself, shared by the inline figure and the zoom viewer. */
export function DiagramSvg({ spec, className = 'dg', style }: { spec: DiagramSpec; className?: string; style?: CSSProperties }) {
  // Marker ids must be unique per drawing, and useId output may contain characters ids cannot.
  const uid = 'dg' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const nodes = useMemo(() => new Map(spec.nodes.map((n) => [n.id, placeNode(n)])), [spec]);

  return (
    <svg className={className} style={style} viewBox={`0 0 ${spec.width} ${spec.height}`} role="img" aria-labelledby={`${uid}-t`}>
      <title id={`${uid}-t`}>{spec.title}</title>
      <defs>
        {EDGE_KINDS.map((k) => (
          <marker key={k} id={`${uid}-ah-${k}`} viewBox="0 0 10 10" refX={9} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path className={`dg-ah ${k}`} d="M0,0 L10,5 L0,10 z" />
          </marker>
        ))}
      </defs>
      {spec.edges.map((e, i) => (
        <Edge key={i} edge={e} nodes={nodes} uid={uid} />
      ))}
      {[...nodes.values()].map((n) => (
        <Node key={n.id} node={n} />
      ))}
    </svg>
  );
}

function Edge({ edge, nodes, uid }: { edge: EdgeSpec; nodes: Map<string, PlacedNode>; uid: string }) {
  const kind = edge.kind ?? 'flow';
  const { d, labelAt } = routeEdge(nodes, edge);
  const [lx, ly] = labelAt;
  return (
    <>
      <path className={`dg-edge ${kind}`} d={d} markerEnd={`url(#${uid}-ah-${kind})`} />
      {edge.label && (
        <g className={`dg-pill ${kind}`}>
          <rect x={lx - pillWidth(edge.label) / 2} y={ly - 9} width={pillWidth(edge.label)} height={18} rx={9} />
          <text x={lx} y={ly + 3.8} textAnchor="middle">{edge.label}</text>
        </g>
      )}
    </>
  );
}

function Node({ node: n }: { node: PlacedNode }) {
  const left = n.x - n.w / 2;
  const top = n.y - n.h / 2;
  const textX = hasSlots(n.kind) ? n.x - 9 : n.x;
  const i = HEX_INSET;

  let shape: ReactNode;
  if (n.kind === 'exchange') {
    const pts = [
      [left + i, top], [left + n.w - i, top], [left + n.w, n.y],
      [left + n.w - i, top + n.h], [left + i, top + n.h], [left, n.y],
    ];
    shape = <polygon points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} />;
  } else {
    shape = <rect x={left} y={top} width={n.w} height={n.h} rx={hasSlots(n.kind) ? 5 : 14} />;
  }

  return (
    <g className={`dg-node ${n.kind}`}>
      {shape}
      {/* three bars suggest messages stacked in a queue */}
      {hasSlots(n.kind) &&
        [10, 16, 22].map((dx) => (
          <line key={dx} className="slot" x1={left + n.w - dx} y1={n.y - 11} x2={left + n.w - dx} y2={n.y + 11} />
        ))}
      <text className="lbl" x={textX} y={n.y - 2} textAnchor="middle">{n.label}</text>
      <text className="sub" x={textX} y={n.y + 14} textAnchor="middle">{n.sub}</text>
    </g>
  );
}
