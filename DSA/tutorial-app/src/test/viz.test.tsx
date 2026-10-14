import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { pickOptions } from '../pages/Drill';
import { mustLookup } from '../lib/leetcode';
import { PLACED } from '../topics';
import { layoutTree, levelOrder, parseLevelOrder } from '../viz/tree';
import type { Frame, Viz } from '../viz/types';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

describe('tree helpers', () => {
  it("parses LeetCode's level order, skipping children of missing nodes", () => {
    const root = parseLevelOrder([1, null, 2, 3]);
    expect(root?.left).toBeNull();
    expect(root?.right?.value).toBe(2);
    expect(root?.right?.left?.value).toBe(3);
    expect(root?.right?.left?.index).toBe(3);
    expect(levelOrder(root).map((n) => n.value)).toEqual([1, 2, 3]);
  });

  it('lays nodes out in in-order columns', () => {
    const cols = layoutTree(parseLevelOrder([2, 1, 3])).map((p) => [p.node.value, p.col, p.row]);
    expect(cols).toEqual([[1, 0, 1], [2, 1, 0], [3, 2, 1]]);
  });
});

describe('visualisations', () => {
  const every: Viz[] = [
    { kind: 'array', items: [1, 2, 3], pointers: [{ name: 'i', at: 3 }], window: [0, 1], label: 'arr' },
    { kind: 'grid', cells: [[1, 2], [3, 4]], rowHeaders: ['a', 'b'], colHeaders: ['x', 'y'], tones: { '0,1': 'match' } },
    { kind: 'tree', nodes: [4, 2, 7, 1, 3], tones: { 0: 'active' }, notes: { 1: 'h=1' } },
    { kind: 'graph', directed: true, nodes: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 100, y: 0 }], edges: [{ from: 'A', to: 'B', label: '5' }, { from: 'B', to: 'A' }] },
    { kind: 'list', items: [1, 2, 3], cycleTo: 1, pointers: [{ name: 'slow', at: 0 }] },
    { kind: 'list', items: [1, 2], doubly: true },
    { kind: 'stack', items: [1, 2] },
    { kind: 'queue', items: [] },
    { kind: 'set', items: ['a'] },
    { kind: 'map', entries: [['a', 1]] },
    { kind: 'vars', items: [['best', Infinity]] },
    { kind: 'bars', values: [3, 0, 2], water: [3, 3, 3], pointers: [{ name: 'L', at: 0 }] },
    { kind: 'intervals', items: [{ start: 1, end: 3 }, { start: 2, end: 6 }], marker: 2 },
  ];

  it('draws every kind of part', () => {
    const { container } = render(<VizFigure parts={every} caption="all" />);
    expect(container.querySelectorAll('.v-part')).toHaveLength(every.length);
    expect(screen.getByText('∞')).toBeInTheDocument();
    expect(screen.getByText('h=1')).toBeInTheDocument();
  });

  it('rejects a graph edge to an unknown node', () => {
    const bad: Viz = { kind: 'graph', nodes: [{ id: 'A', x: 0, y: 0 }], edges: [{ from: 'A', to: 'Z' }] };
    expect(() => render(<VizFigure parts={[bad]} />)).toThrow(/unknown node/);
  });

  it('steps through frames with buttons, the slider and the keyboard', async () => {
    const user = userEvent.setup();
    const frames: Frame[] = [1, 2, 3].map((n) => ({ note: `Frame number ${n}`, parts: [{ kind: 'array', items: [n] }] }));
    render(<Walkthrough title="demo" frames={frames} />);
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next ▶' }));
    expect(screen.getByText('Frame number 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last step' }));
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    screen.getByLabelText(/Walkthrough picture/).focus();
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });
});

describe('recognition drill options', () => {
  it('offers the right chapter and three that teach none of the problem\'s tags', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    for (const item of PLACED.slice(0, 40)) {
      const options = pickOptions(item, random);
      expect(options).toHaveLength(4);
      expect(options.map((o) => o.id)).toContain(item.topicId);
      const tags = new Set(mustLookup(item.problem.id).tags);
      for (const o of options.filter((c) => c.id !== item.topicId)) expect(o.tags.some((t) => tags.has(t))).toBe(false);
    }
  });
});
