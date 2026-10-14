import { CHAPTERS } from '../chapters';
import { ALL_TAGS, NON_DSA_TAGS, SNAPSHOT_DATE } from '../lib/leetcode';
import { HOURS_PER_WEEK, totals } from '../lib/plan';
import { PLACED, PLACEMENTS } from '../topics';

export function Hero() {
  const topics = CHAPTERS.filter((c) => c.kind === 'topic').length;
  const core = new Set(PLACED.filter((p) => p.problem.core).map((p) => p.problem.id)).size;
  const tags = ALL_TAGS.length - NON_DSA_TAGS.length;
  const t = totals();
  return (
    <header className="hero">
      <p className="kicker">Hands-on course · Concepts first · No code to copy</p>
      <h1>Learn data structures and algorithms, one technique at a time</h1>
      <p className="lede">
        {topics} topic chapters take you from Big-O to network flow. Each one explains the idea, shows it working step by step,
        tells you which data structure to use and why, and then gives you hand-picked LeetCode problems with hints you reveal
        one at a time. You write every solution yourself.
      </p>
      <dl className="facts">
        <div><dt>Problems</dt><dd>{PLACEMENTS.size} LeetCode problems, {core} in the Core path</dd></div>
        <div><dt>Coverage</dt><dd>All {tags} algorithm tags on LeetCode (snapshot {SNAPSHOT_DATE})</dd></div>
        <div><dt>You need</dt><dd>A LeetCode account and some TypeScript or JavaScript</dd></div>
        <div><dt>Time at {HOURS_PER_WEEK} h a week</dt><dd>Core path about {t.coreWeeks} weeks; everything about {t.allWeeks} weeks</dd></div>
      </dl>
    </header>
  );
}
