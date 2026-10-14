import { Box, TableWrap } from '../components/Content';
import { CHAPTER_HOURS, HOURS_PER_WEEK, MINUTES, phaseEstimates, totals } from '../lib/plan';
import { hrefFor } from '../lib/route';

export default function StudyPlan() {
  const phases = phaseEstimates();
  const t = totals();
  let coreWeek = 0;
  let allWeek = 0;
  return (
    <>
      <div className="prose">
        <p>
          The lab is big on purpose, so you never run out of practice on any topic. You do not need every problem. Pick a route,
          study a little most days, and let the review queue keep earlier topics fresh. The estimates below assume{' '}
          {HOURS_PER_WEEK} hours a week, {CHAPTER_HOURS} hours per chapter, and generous first-solve times of {MINUTES.Easy},{' '}
          {MINUTES.Medium} and {MINUTES.Hard} minutes for Easy, Medium and Hard problems including hints. They are calculated from
          the problems in the lab, so they stay current.
        </p>
        <h2>Choose your route</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Route</th>
            <th>What you do</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>Core path</b></td>
            <td style={{ whiteSpace: 'normal' }}>Every chapter, and only the problems marked Core. Best if you have an interview within months.</td>
            <td>about {t.coreHours} hours · {t.coreWeeks} weeks</td>
          </tr>
          <tr>
            <td><b>Everything</b></td>
            <td style={{ whiteSpace: 'normal' }}>Every chapter and every problem. The route to being genuinely strong at contests and hard interviews.</td>
            <td>about {t.allHours} hours · {t.allWeeks} weeks</td>
          </tr>
          <tr>
            <td><b>Core first, then deepen</b></td>
            <td style={{ whiteSpace: 'normal' }}>Do the Core path, then return to each phase for the remaining problems, Medium before Hard. Recommended.</td>
            <td>Core path, then as long as you like</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Phase by phase</h2>
        <p>Week numbers are cumulative at {HOURS_PER_WEEK} hours a week.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Phase</th>
            <th>Chapters</th>
            <th>Problems</th>
            <th>Core path</th>
            <th>Everything</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((p) => {
            const coreStart = coreWeek + 1;
            const allStart = allWeek + 1;
            coreWeek += p.coreHours / HOURS_PER_WEEK;
            allWeek += p.allHours / HOURS_PER_WEEK;
            return (
              <tr key={p.group}>
                <td>{p.group}</td>
                <td>{p.chapters}</td>
                <td>
                  {p.problems} ({p.core} core)
                </td>
                <td>
                  {p.coreHours} h · weeks {Math.floor(coreStart)}–{Math.max(Math.floor(coreStart), Math.ceil(coreWeek))}
                </td>
                <td>
                  {p.allHours} h · weeks {Math.floor(allStart)}–{Math.max(Math.floor(allStart), Math.ceil(allWeek))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>A week that works</h2>
        <ul>
          <li><b>Two sessions</b> on a new chapter: read it, step through the walkthroughs, do the exercises and the quiz.</li>
          <li><b>Three sessions</b> of problems from that chapter: two or three problems each, Easy first, Core before the rest.</li>
          <li><b>Ten minutes daily</b> on the <a href={hrefFor('review')}>review queue</a>: re-solve due problems from a blank editor.</li>
          <li><b>Once a week</b>, twenty questions of the <a href={hrefFor('drill')}>recognition drill</a> across everything you have finished.</li>
          <li><b>Every fourth week</b>, a lighter week: no new chapter, just mixed problems from earlier phases and the review queue.</li>
        </ul>

        <h2>How to know you are ready to move on</h2>
        <ul>
          <li>You can explain the chapter's technique and its proof idea to someone else without notes.</li>
          <li>You solved most Core problems in the chapter, at least half of them without hints.</li>
          <li>You can name the technique for that chapter's problems in the drill, quickly.</li>
        </ul>
      </div>

      <Box kind="tip" label="If you have an interview soon">
        <p>
          Two to four weeks out: focus on Phases 2 to 6, do only Core problems, and do the drill daily. In the final week, re-solve
          problems you marked Solved (the review queue) instead of learning new topics, and practise talking through your solution
          out loud as in <a href={hrefFor('method')}>How to solve any problem</a>.
        </p>
      </Box>

      <Box kind="key" label="Keep what you learn">
        <p>
          Spaced repetition is the difference between solving 500 problems and remembering 500 problems. Every time you mark a
          problem Solved, it is scheduled to come back after 3, 7, 15 and 30 days. Re-solving it from scratch each time, in under
          20 minutes and without hints, is what makes the technique automatic.
        </p>
      </Box>
    </>
  );
}
