import type { EdgeSpec, NodeKind, NodeSpec } from '../geometry';

type NodeMore = Pick<NodeSpec, 'sub' | 'shape' | 'w'>;

/** A box centred at (x, y). */
export const n = (id: string, kind: NodeKind, x: number, y: number, label: string, more: NodeMore = {}): NodeSpec => ({
  id, kind, x, y, label, ...more,
});

/** An arrow from node a to node b. */
export const e = (a: string, b: string, more: Omit<EdgeSpec, 'a' | 'b'> = {}): EdgeSpec => ({ a, b, ...more });
