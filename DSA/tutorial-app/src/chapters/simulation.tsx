import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/simulation';
import { addStrings, circularGame, robotPasses } from '../traces/simulation';
import { Walkthrough } from '../viz/Walkthrough';

const robot = robotPasses('GGRG');
const sum = addStrings('4567', '658');
const circle = circularGame(5, 2);

export default function Simulation() {
  return (
    <>
      <TopicIntro
        id="simulation"
        time="3 hours, plus problems"
        before={['array', 'string', 'matrix']}
        learn={[
          'How to turn a wordy process into a small, exact state and a loop',
          'Schoolbook arithmetic on numbers too big for any built-in type',
          'Robots and walkers with direction tables',
          'Queues for turn-taking, and how to replace a simulation by a count',
          'Skipping ahead when the process runs for 10⁹ steps: cycles and full rounds',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Some problems have no trick. The statement describes a process, a robot moving, people queuing, numbers being added, and
          the task is to carry it out exactly. That sounds easy, and it is the reason these problems are failed so often: one rule
          applied in the wrong order, one forgotten carry, one off-by-one at the edge of a grid, and the answer is wrong.
        </p>
        <p>
          A good simulation starts with the <b>state</b>: the smallest set of variables that captures everything the next step
          needs. A robot is a position and a direction. A restaurant with one chef is "the time the chef is free". Long addition is a
          column index and a carry. Once the state is clear, the code is a loop that applies the rules to it, in the order the
          statement gives them.
        </p>
        <p>
          Then check the cost. A simulation is the intended answer when the number of steps is small. When the step count is huge
          (10⁹ days, 10⁹ chalk pieces), the simulation tells you what happens, and a second idea, a cycle, a full round or a formula,
          lets you jump to the end.
        </p>
      </div>

      <Walkthrough
        title="Robot Bounded In Circle: one pass tells you everything"
        frames={robot.frames}
        caption="The state is a position and a direction. After one pass the robot faces east, so four passes bring it home: it stays in a circle."
      />

      <Box kind="key" label="Key idea">
        <p>
          Write down the state before writing any loop: which variables, what they mean, and what one step does to them. If you
          cannot list the state in one sentence, you do not understand the process yet. If the number of steps is too large, look for
          something that repeats.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Direction table', ts: 'array of [dx, dy] pairs, north, east, south, west', ops: 'turn right: index + 1 mod 4; left: index + 3 mod 4', use: 'Robots, walkers, spiral walks, sight lines.' },
          { name: 'Queue', ts: 'array with a head index (push at the back, read at head)', ops: 'enqueue and dequeue O(1)', use: 'People taking turns, going to the back, leaving.' },
          { name: 'Digit array', ts: 'number[] built from the right', ops: 'O(1) per digit; reverse and join once at the end', use: 'Arithmetic on numbers given as strings.' },
          { name: 'Set of positions', ts: 'Set<string> with keys like "3,-2"', ops: 'O(1) average', use: 'Obstacles or visited cells on an unbounded plane.' },
          { name: 'Map of states', ts: 'Map<string, number> (state → step)', ops: 'O(1) average', use: 'Detecting when a process repeats, to skip ahead.' },
        ]}
      />
      <Box kind="tip" label="TypeScript tip">
        <p>
          Array.prototype.shift removes the first element but moves every other element down, so it costs O(n). For a queue that
          sees many operations, keep a head index and read from it instead, or see <See id="queue" /> for a circular buffer.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Follow the rules</h2>
        <p>
          Read the statement once for the story and once for the rules. Write the rules as a numbered list in your own words, with
          their order and their edge cases ("a dead cell with exactly three live neighbours..."). Then decide the state. Many
          "processes" collapse to one or two numbers: the time the chef is free, the number of empty bottles, the end of the current
          poison period. Each step reads the state, applies the rules, and writes the state back.
        </p>
      </div>
      <Recipe
        name="Simulate a process"
        when="the statement describes steps to repeat and the number of steps is small enough to run."
        steps={[
          'List the rules in order, in your own words, including what happens at the edges.',
          'Choose the state: the fewest variables that let you apply the next step.',
          'Loop: read the state, apply the rules in order, write the new state.',
          'Stop on the condition the statement gives, and read the answer from the state.',
          'Trace the statement\'s examples by hand with your rules before trusting them.',
        ]}
        why="if the state is complete and every rule is applied as written, the simulation cannot disagree with the statement."
        time="O(steps × cost per step)"
        space="O(state)"
      />

      <div className="prose">
        <h2>Pattern 2: Digit-by-digit arithmetic</h2>
        <p>
          When numbers arrive as strings with hundreds or thousands of digits, no number type holds them (TypeScript numbers are exact
          only up to 2⁵³). Do what you learned at school: line the numbers up on the right and work one column at a time, carrying
          into the next column. A digit's value is its character code minus the code of "0". Collect output digits from the right
          into an array and reverse it once at the end.
        </p>
      </div>
      <Walkthrough title="Add Strings: column by column with a carry" frames={sum.frames} caption={`4567 + 658 = ${sum.sum}.`} />
      <div className="prose">
        <p>
          Multiplication works the same way, with one neat simplification. The digit at position i of the first number times the
          digit at position j of the second always lands in result slots i + j and i + j + 1. So instead of writing out rows of
          partial products, add every digit product straight into one array of m + n slots and push the carries left.
        </p>

        <h2>Pattern 3: Position and direction</h2>
        <p>
          Number the directions 0 to 3: north, east, south, west, each with its (dx, dy) step. Turning right is direction + 1 mod 4,
          turning left is direction + 3 mod 4 (adding 3 avoids negative remainders), and moving forward adds the step of the current
          direction. Obstacles on an unbounded plane go into a set with string keys like "3,-2". The same table drives spiral walks
          in <See id="matrix" /> and grid searches in <See id="bfs" />.
        </p>
        <p>
          Robot Bounded In Circle shows the second half of the skill: reasoning about the simulation instead of running it forever.
          After one pass, if the robot is back home it clearly loops. If it faces a new direction, the next pass is the first one
          rotated, and four rotated copies add up to nothing, so it returns home. Only "facing north and not at home" escapes.
        </p>

        <h2>Pattern 4: Queues and turns</h2>
        <p>
          People in a line who act and go to the back, or sit in a circle and drop out, are a <b>queue</b>: the front is whoever acts
          next. Serving is a dequeue, "go to the back" is a dequeue followed by an enqueue, and leaving is a dequeue alone.
        </p>
      </div>
      <Walkthrough
        title="Find the Winner of the Circular Game with a queue"
        frames={circle.frames}
        caption={`n = 5 friends, every 2nd one leaves. Winner: friend ${circle.winner}.`}
      />
      <div className="prose">
        <p>
          Once the queue version works, ask whether you can count instead of simulate. In Time Needed to Buy Tickets, you never need
          the queue: each person ahead of person k buys at most tickets[k] tickets before k finishes, and each person behind buys at
          most tickets[k] − 1. The answer is a sum. In Reveal Cards In Increasing Order the trick is different: simulate the process
          on <i>positions</i> to learn the order they are revealed in, then place the sorted cards into that order.
        </p>

        <h2>Pattern 5: Skip ahead</h2>
        <p>
          If a problem asks for the state after 10⁹ steps, you cannot run 10⁹ steps. Two ideas cover almost every case. A{' '}
          <b>full round</b> that always costs the same lets you skip all complete rounds with one modulo (Find the Student that Will
          Replace the Chalk). A process with <b>finitely many states</b> must eventually repeat; store each state with the step at
          which you saw it, and when one comes back you know the cycle length and can reduce the remaining steps modulo it (Prison
          Cells After N Days).
        </p>
      </div>
      <Recipe
        name="Detect a cycle and skip ahead"
        when="each step is cheap and deterministic, there are few possible states, and the step count is enormous."
        steps={[
          'Keep a map from state (written as a string) to the step at which you first saw it.',
          'Before each step, look the current state up.',
          'If it is there, the cycle length is the current step minus the stored step. Reduce the remaining steps modulo that length.',
          'Simulate only the remaining steps and return the state.',
        ]}
        why="the process is deterministic, so once a state repeats, everything after it repeats with the same period."
        time="O(number of distinct states × cost per step)"
        space="O(number of distinct states)"
      />

      <div className="prose">
        <h2>Pattern 6: Careful formatting</h2>
        <p>
          Problems like Text Justification have no algorithmic trick, only rules. Split the work into stages you can check
          separately (decide which words go on each line; then lay out one line), and name the special cases explicitly: the last
          line, a line with a single word, and leftover spaces that go to the left gaps first.
        </p>

        <h2>Worked example: Prison Cells After N Days</h2>
        <p>
          Eight cells change every day: a middle cell becomes occupied exactly when its two neighbours are equal, and the end cells
          become vacant. Return the cells after n days, with n up to 10⁹.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Apply the rule n times. Each day costs 8 operations, so the total is 8 × 10⁹ operations. Correct, but far too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          There are only 2⁸ = 256 possible rows. Running 10⁹ days means visiting the same rows over and over, and each time the
          future that follows is identical.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          The next day depends only on today's row, so once a row repeats, the days after it repeat in the same order. Store each row
          with the day it first appeared. When a row reappears on day d after first appearing on day f, the cycle length is d − f,
          and the remaining n − d days can be reduced modulo d − f.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          A repeat must appear within 257 days, so the work is at most a few thousand operations: effectively <Cost>O(1)</Cost>. The
          starting row may never come back (after day 1 both ends are always vacant), which is why you look for <i>any</i> repeated
          row, not a return to the start. If n is smaller than the time to find a cycle, the loop simply ends first.
        </p>
      </div>

      <div className="prose">
        <h2>Simulate, count or skip?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Approach</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Few steps, each one simple</td>
            <td>Simulate exactly</td>
            <td>Walking Robot Simulation (at most 10⁴ commands of 9 steps)</td>
          </tr>
          <tr>
            <td>Many steps, but each element's total is easy to count</td>
            <td>Count instead of simulating</td>
            <td>Time Needed to Buy Tickets, Teemo Attacking</td>
          </tr>
          <tr>
            <td>Identical full rounds</td>
            <td>Skip complete rounds with modulo</td>
            <td>Find the Student that Will Replace the Chalk, Pass the Pillow</td>
          </tr>
          <tr>
            <td>Few possible states, huge step count</td>
            <td>Detect the cycle, then skip</td>
            <td>Prison Cells After N Days</td>
          </tr>
          <tr>
            <td>The process must be reversed to construct an input</td>
            <td>Simulate on positions or run the rules backwards</td>
            <td>Reveal Cards In Increasing Order</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Applying rules in a different order from the statement, such as checking divisibility by 3 before 15 in Fizz Buzz.</>,
          <>Forgetting the final carry in string addition, so 99 + 1 comes out as 00.</>,
          <>Computing a left turn as direction − 1 mod 4: in TypeScript the remainder of −1 is −1. Add 3 instead.</>,
          <>Using shift on a large array inside a loop, quietly turning O(n) into O(n²).</>,
          <>Updating shared state in the middle of a "simultaneous" step, so later cells see new values instead of old ones.</>,
          <>Running a simulation without checking how many steps it takes. Always multiply the step count by the cost per step first.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Add the binary numbers 1011 and 111 column by column. Write the carry after each column.',
            solution: 'From the right: 1 + 1 = 10 (write 0, carry 1); 1 + 1 + 1 = 11 (write 1, carry 1); 0 + 1 + 1 = 10 (write 0, carry 1); 1 + 0 + 1 = 10 (write 0, carry 1); final carry 1. Result 10010 (11 + 7 = 18).',
          },
          {
            task: 'A robot runs "GL" once. Where is it and which way does it face? Is it bounded?',
            solution: 'At (0, 1) facing west. Not facing north, so it returns home within four passes: bounded.',
          },
          {
            task: 'Tickets [2, 3, 2] and k = 2. Compute the answer with the counting formula instead of a queue.',
            solution: 'Indices 0 to 2 (up to and including k): min(2, 2) + min(3, 2) + min(2, 2) = 6. Nobody is behind k. Answer 6.',
          },
          {
            task: 'A process has 1,000 possible states and you must report the state after 10¹⁸ steps. At most how many steps must you simulate before you can skip?',
            solution: 'At most 1,000. Those steps produce 1,001 states (the start plus one per step), and with only 1,000 possible states two of them must be equal (the pigeonhole principle), which reveals the cycle.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Directions are numbered 0 = north, 1 = east, 2 = south, 3 = west. What is the direction after turning left from d?',
            options: ['d − 1', '(d + 1) mod 4', '(d + 3) mod 4', '(d + 2) mod 4'],
            answer: 2,
            why: 'A left turn goes one step backwards in the list. Adding 3 and taking mod 4 does that without ever producing a negative remainder.',
          },
          {
            q: 'After one pass of its instructions, a robot is at (2, 5) facing south. Is it bounded?',
            options: ['No, it moved away from the origin', 'Yes, because it no longer faces north', 'Only if the instructions contain a turn', 'It depends on the next pass'],
            answer: 1,
            why: 'Facing a new direction means later passes are rotated copies of the first, and after at most four passes the displacements cancel.',
          },
          {
            q: 'Two numbers have 5,000 digits each, given as strings. How do you add them?',
            options: ['Convert both to numbers and add', 'Add digit by digit from the right with a carry', 'Sort the digits first', 'Add from the left and fix carries later'],
            answer: 1,
            why: 'Numbers lose precision above 2⁵³. Column addition from the right handles any length in O(n).',
          },
          {
            q: 'Why can a deterministic process with 256 possible states be fast-forwarded by 10⁹ steps?',
            options: [
              'Because 256 divides 10⁹',
              'Because some state must repeat within 257 steps, and the process repeats from there',
              'Because each step is O(1)',
              'It cannot',
            ],
            answer: 1,
            why: 'After at most 257 steps a state repeats; from then on the states cycle with a fixed period, so the remaining steps reduce modulo that period.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Before coding each one, write the state in one line and the rules as a short list. Then trace the first example by hand.
          Most bugs in these problems show up during that trace.
        </p>
      </div>
      <ProblemSet id="simulation" />

      <Recap>
        <ul>
          <li>Start every simulation by naming the state: the fewest variables the next step needs.</li>
          <li>Apply rules in the order the statement gives, and test them on the examples by hand.</li>
          <li>Big numbers as strings: add and multiply digit by digit from the right with carries.</li>
          <li>Directions are indices into a move table; queues model turn-taking.</li>
          <li>When steps are too many, count per element, skip full rounds with modulo, or detect a cycle.</li>
        </ul>
      </Recap>
    </>
  );
}
