import { useMemo, useState, type ReactNode } from 'react';
import { CHAPTERS } from '../chapters';
import { Box, See, TableWrap } from '../components/Content';
import { hrefFor } from '../lib/route';
import { TOPICS } from '../topics';

type Row = { see: string; think: string; why: string; chapter: string; title: string; num: string };

const QUESTIONS: [question: string, ifYes: ReactNode][] = [
  ['Is n tiny (about 20 or less) and you need the best subset, order or assignment?', <><See id="backtracking" />, <See id="bitmask" /></>],
  ['Is the input sorted, or would sorting it make the problem easy?', <><See id="two-pointers" />, <See id="binary-search" />, <See id="sorting" /></>],
  ['Do you need the minimum value x that works, and does "x works" imply "x + 1 works"?', <>Binary search on the answer (<See id="binary-search" />)</>],
  ['Is it about a contiguous subarray or substring?', <><See id="sliding-window" /> (sums only grow) or <See id="prefix-sum" /> (negatives allowed, counting exact sums)</>],
  ['Do you look things up repeatedly, count, or find duplicates or a partner value?', <><See id="hash-table" />, <See id="counting" /></>],
  ['Do you need the next greater or smaller element, or spans bounded by bigger values?', <><See id="monotonic-stack" /></>],
  ['Do you need the top or bottom k, a running median, or always the current smallest?', <><See id="heap" /></>],
  ['Are there ranges, meetings or events with start and end times?', <><See id="intervals" />, <See id="sweep-line" /></>],
  ['Is the data a tree, or a hierarchy with parents and children?', <><See id="binary-tree" />, <See id="tree" />, <See id="dp-tree" /></>],
  ['Are there things connected by relationships: cities, people, tasks with prerequisites, cells in a grid?', <><See id="graph" />, <See id="bfs" />, <See id="dfs" />, <See id="topological-sort" />, <See id="union-find" /></>],
  ['Shortest path, fewest steps or cheapest route?', <><See id="bfs" /> when every step costs the same, <See id="shortest-path" /> when costs differ</>],
  ['Must you list every combination, permutation or arrangement?', <><See id="backtracking" /></>],
  ['Count the ways, or find the best value, where choices overlap and repeat?', <><See id="dp" /> and its family, starting with <See id="memoization" /></>],
  ['Can you make the locally best choice and never regret it?', <><See id="greedy" /> (prove it with an exchange argument)</>],
  ['Many words or prefixes to search?', <><See id="trie" /></>],
  ['Many range queries with updates in between?', <><See id="segment-tree" />, <See id="binary-indexed-tree" /></>],
  ['Find a pattern inside a long text, or compare many substrings?', <><See id="string-matching" />, <See id="rolling-hash" /></>],
  ['Is the answer a formula: modulo 10⁹ + 7, divisibility, counting arrangements?', <><See id="number-theory" />, <See id="combinatorics" />, <See id="math" /></>],
];

export default function Recognition() {
  const rows = useMemo<Row[]>(
    () =>
      CHAPTERS.filter((c) => TOPICS[c.id]).flatMap((c) =>
        TOPICS[c.id].signals.map((s) => ({ ...s, chapter: c.id, title: c.title, num: c.num })),
      ),
    [],
  );
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const shown = needle ? rows.filter((r) => `${r.see} ${r.think} ${r.why} ${r.title}`.toLowerCase().includes(needle)) : rows;

  return (
    <>
      <div className="prose">
        <p>
          Recognising the technique is most of solving a problem. Use this page in two ways: run through the questions below when
          you meet a new problem, and search the full table of signals when a phrase in a problem statement looks familiar.
        </p>
        <h2>Ask these questions, in this order</h2>
        <p>The first question you answer "yes" to usually names the technique. Several yeses often mean the solution combines them.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>If yes, look at</th>
          </tr>
        </thead>
        <tbody>
          {QUESTIONS.map(([question, answer]) => (
            <tr key={question}>
              <td style={{ whiteSpace: 'normal' }}>{question}</td>
              <td>{answer}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <Box kind="tip" label="Practise it">
        <p>
          The <a href={hrefFor('drill')}>recognition drill</a> turns this page into practice: it shows a problem without its
          chapter and asks you to pick the technique.
        </p>
      </Box>

      <div className="prose">
        <h2>Every signal from every chapter</h2>
      </div>
      <label className="field" style={{ maxWidth: 420, margin: '6px 0 4px' }}>
        <span>Search the signals</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. subarray, sorted, k-th, grid" />
      </label>
      <p className="tracker-count">
        {shown.length} of {rows.length} signals
      </p>
      <TableWrap className="t signals">
        <thead>
          <tr>
            <th>When you see</th>
            <th>Think</th>
            <th>Why</th>
            <th>Chapter</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={`${r.chapter}-${i}`}>
              <td>{r.see}</td>
              <td className="think">{r.think}</td>
              <td>{r.why}</td>
              <td>
                <a href={hrefFor(r.chapter)}>
                  {r.num} {r.title}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
    </>
  );
}
