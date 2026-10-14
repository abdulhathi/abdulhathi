import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/stack';
import { decode, evalPostfix, validBrackets } from '../traces/stack';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const brackets = validBrackets('{[()()]}');
const broken = validBrackets('([)]');
const postfix = evalPostfix(['5', '1', '2', '+', '4', '*', '+', '3', '-']);
const nested = decode('2[a3[b]]c');

export default function Stack() {
  return (
    <>
      <TopicIntro
        id="stack"
        time="4–5 hours, plus problems"
        before={['array', 'string', 'recursion']}
        learn={[
          'What "last in, first out" means, and why so many problems secretly have that shape',
          'Six patterns: matching pairs, cancel the top, evaluate expressions, nested context, design with stacks, replace recursion',
          'How to evaluate arithmetic with precedence and brackets without any parser',
          'How to turn a recursive algorithm into a loop with an explicit stack',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A stack is a pile of plates. You can put a plate on top (<b>push</b>), look at the top plate (<b>peek</b>), or take the
          top plate off (<b>pop</b>). You never pull a plate out of the middle. The last plate you put down is the first one you
          pick up again: <b>last in, first out</b>.
        </p>
        <p>
          That sounds like a limitation, but it is exactly the shape of many problems. Brackets close in the reverse order they
          opened. An "undo" button undoes the most recent action. A function call returns before the function that called it. A
          new letter can only cancel the letter just before it. Whenever the thing you need next is <i>the most recent thing that
          is still open</i>, a stack hands it to you in <Cost>O(1)</Cost>.
        </p>
        <p>
          The brute-force alternative usually rescans: find the nearest unmatched bracket by walking backwards, or delete a pair
          and start the whole string again. That costs <Cost>O(n²)</Cost>. A stack keeps the unfinished items in order as you go,
          so each item is pushed once and popped at most once: <Cost>O(n)</Cost> in total.
        </p>
      </div>

      <Walkthrough
        title="Are these brackets matched? {[()()]}"
        frames={brackets.frames}
        caption="Every closing bracket is compared with exactly one opener: the one on top of the stack."
      />

      <div className="prose">
        <p>
          Now watch it fail. In <b>([)]</b> each bracket has a partner somewhere, so counting alone would say it is fine. The stack
          catches the problem because <b>)</b> arrives while <b>[</b> is still the most recent open bracket.
        </p>
      </div>
      <Walkthrough title="A string that only looks balanced: ([)]" frames={broken.frames} />

      <Box kind="key" label="Key idea">
        <p>
          Reach for a stack when <i>the next item can only interact with the most recent unfinished item</i>. If you notice
          yourself scanning backwards to find "the last one that is still open", that backwards scan is the top of a stack.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a stack. The <See id="recognition" /> collects the signals from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          TypeScript has no separate stack type, and it does not need one: an array's <b>push</b> and <b>pop</b> work on its end
          in <Cost>O(1)</Cost>, so a plain array is a perfect stack. What you store on it is the real design decision.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Stack', ts: 'number[] or string[] with push, pop and stack[stack.length - 1]', ops: 'push, pop, peek O(1)', use: 'The default for every pattern in this chapter.' },
          { name: 'Stack of indices', ts: 'number[] holding positions', ops: 'O(1)', use: 'When you need to know where an item was, not just what it was: lengths of valid runs, which brackets to delete.' },
          { name: 'Stack of pairs', ts: '[value, extra][] e.g. [letter, count]', ops: 'O(1)', use: 'Remember a little more per entry: the running minimum, a run length, a saved (text, count) context.' },
          { name: 'Counter', ts: 'number', ops: 'O(1)', use: 'With only one kind of bracket, the stack\'s size is all you need, so a counter replaces it.' },
          { name: 'Map', ts: 'Map<string, string>', ops: 'get O(1)', use: 'Look up the partner of a closing bracket.' },
        ]}
      />
      <Box kind="tip" label="TypeScript tip">
        <p>
          Never use <b>shift</b> or <b>unshift</b> on a stack. They work on the front of the array and move every other element,
          which is <Cost>O(n)</Cost>. A stack only ever touches the end.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Matching pairs</h2>
        <p>
          Push every opener. When a closer arrives, it must match the opener on top; if it does, pop. At the end, the stack must
          be empty. Small twists on this one idea cover a whole family: count how many insertions or deletions make a string valid,
          measure the longest valid run, score nested brackets, or allow wildcards.
        </p>
      </div>
      <Recipe
        name="Match openers and closers"
        when="items open and close, and they must close in the reverse order they opened."
        steps={[
          'Start with an empty stack (push −1 first if you will measure lengths of valid runs).',
          'For an opener: push it, or push its index if positions matter.',
          'For a closer: if the stack is empty or the top is the wrong kind, record a problem (invalid, a deletion, a new base); otherwise pop.',
          'After the scan, whatever is still on the stack was never closed.',
        ]}
        why="the only opener a closer is allowed to close is the most recent one that is still open, and that is always the top."
        time="O(n)"
        space="O(n), or O(1) with one bracket type and a counter"
      />

      <div className="prose">
        <h2>Pattern 2: Cancel the top</h2>
        <p>
          Some problems remove neighbours: two equal letters cancel, a star deletes the letter before it, ".." goes up one
          folder, two asteroids collide. After a removal, the items on either side become neighbours and may interact in turn.
          Rescanning after each removal is <Cost>O(n²)</Cost>. Instead, keep the survivors on a stack: the only survivor a new
          item can touch is the top.
        </p>
      </div>
      <Recipe
        name="Stack of survivors"
        when="adjacent items cancel, merge or collide, and a removal brings new neighbours together."
        steps={[
          'Scan the input with an empty stack of survivors.',
          'For each new item, compare it with the top. While the new item beats or cancels the top, pop.',
          'If the new item survives, push it (or update the top, for example by adding to a run count).',
          'At the end, the stack from bottom to top is the result.',
        ]}
        why="removals only ever happen at the boundary between the processed part and the new item, which is the top of the stack."
        time="O(n): each item is pushed once and popped at most once"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Evaluate expressions</h2>
        <p>
          In <b>postfix</b> notation (reverse Polish), the operator comes after its operands: "1 2 +" means 1 + 2. There are no
          brackets and no precedence rules, because an operator always applies to the two most recent values. That makes postfix
          the purest stack problem there is.
        </p>
      </div>
      <Walkthrough
        title="Evaluate the postfix expression 5 1 2 + 4 × + 3 −"
        frames={postfix.frames}
        caption={`This is 5 + (1 + 2) × 4 − 3 written in postfix. Result: ${postfix.value}.`}
      />
      <div className="prose">
        <p>
          Ordinary <b>infix</b> expressions (operators between operands) need two more ideas. For precedence without brackets,
          treat the expression as a sum of terms: + and − start a new term on the stack, while × and ÷ combine with the term on
          top immediately, because they bind tighter. For brackets, save your progress when one opens and restore it when it
          closes, which is the next pattern.
        </p>
      </div>
      <Recipe
        name="Sum of terms (precedence without a parser)"
        when="you must evaluate +, −, × and ÷ in a string, with the usual precedence and no brackets."
        steps={[
          'Remember the operator that came before the current number; start with "+".',
          'Build each number digit by digit.',
          'When a number ends: "+" pushes it, "−" pushes its negative, "×" and "÷" replace the top with top × number or top ÷ number.',
          'At the end, add up the stack.',
        ]}
        why="× and ÷ are applied as soon as both operands are known, before any + or − that comes later can touch them."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Nested context</h2>
        <p>
          When the input nests (brackets inside brackets, calls inside calls), each opening marker starts a fresh piece of work
          and each closing marker finishes the innermost one and hands the result back to the level above. Push the state you
          are in when a level opens; pop it when the level closes and combine. This is exactly what the computer's call stack does
          for recursive functions.
        </p>
      </div>
      <Walkthrough
        title="Decode 2[a3[b]]c"
        frames={nested.frames}
        caption={`The inner bracket is finished first and its result is handed to the outer one. Result: "${nested.result}".`}
      />
      <Recipe
        name="Save and restore context"
        when="the input nests, and the meaning of the inside depends on what came before the opening marker."
        steps={[
          'Keep the state of the current level: text built so far, a running result, a sign, a count.',
          'At an opening marker, push the current state and reset it for the new level.',
          'At a closing marker, finish the current level, pop the saved state and combine the two.',
          'At the end, the current state holds the answer.',
        ]}
        why="levels close in the reverse order they open, so the saved state you pop always belongs to the level that encloses the one you just finished."
        time="O(n) plus the size of anything you build"
        space="O(depth) for the saved states"
      />

      <div className="prose">
        <h2>Pattern 5: Design with stacks</h2>
        <p>
          Design problems ask for a structure where every operation is fast. The trick is usually to store a little extra beside
          each entry. In <b>Min Stack</b>, each entry also remembers the minimum of everything beneath it, so popping restores the
          old minimum for free. The same thinking builds a stack from queues, or a queue from two stacks (see{' '}
          <See id="queue" />).
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'stack', label: 'stack of (value, min so far)', items: ['5 (min 5)', '7 (min 5)', '3 (min 3)', '8 (min 3)'], tones: { 3: 'active' } },
          { kind: 'vars', items: [['top', 8], ['getMin()', 3]], tones: { 1: 'match' } },
        ]}
        caption="Pop 8 and the top entry says the minimum is still 3. Pop 3 as well and the new top says 5. Nothing is recomputed."
      />

      <div className="prose">
        <h2>Pattern 6: Replace recursion</h2>
        <p>
          Every recursive function uses a stack: the call stack. You can always manage that stack yourself. Interviewers ask for
          this ("can you do it iteratively?"), and it also protects you from stack overflow on very deep inputs, such as a
          linked-list-shaped tree with 10⁵ nodes. For tree traversals, the order in which you push children decides the order in
          which you visit them. You will use this again in <See id="binary-tree" /> and <See id="dfs" />.
        </p>
      </div>
      <Recipe
        name="Iterative depth-first traversal"
        when="you need a recursive traversal as a loop, or the recursion could be too deep."
        steps={[
          'Push the starting node.',
          'While the stack is not empty, pop a node and process it.',
          'Push the node\'s children in reverse of the order you want to visit them (for pre-order: right, then left).',
          'For in-order, instead walk left pushing nodes, pop one, visit it, then move to its right child.',
        ]}
        why="last in, first out means the child you push last is processed first, exactly like the recursive call you would make first."
        time="O(n)"
        space="O(h), the height of the tree"
      />

      <div className="prose">
        <h2>Worked example: asteroid collision</h2>
        <p>
          Asteroids move along a line. Positive values move right, negative values move left, and the size is the absolute value.
          When two meet, the smaller one explodes; equal sizes both explode. What is left?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Repeatedly scan for a right-mover directly followed by a left-mover, resolve that collision, and scan again. Each pass
          can remove just one asteroid, so this is <Cost>O(n²)</Cost> with 10⁴ asteroids. It works, but you can do better.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          After a collision, the scan starts over from the beginning, but nothing before the collision point has changed. Only the
          survivor and its new left neighbour can collide next.
        </p>
        <Step n={3}>Find the rule</Step>
        <p>
          Process asteroids from left to right and keep the survivors so far on a stack. A right-mover cannot hit anything already
          processed, so push it. A left-mover can only hit right-movers, and the nearest one is on top. Let it fight the top: pop
          smaller right-movers; stop when it meets a bigger one (it explodes), an equal one (both explode), a left-mover or an empty
          stack (it survives and is pushed).
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          The inner loop looks worrying, but every asteroid is pushed at most once and popped at most once, so the total work is{' '}
          <Cost>O(n)</Cost>. Edge cases: all moving the same way (nothing collides), a left-mover first (nothing to hit, it
          survives), and a left-mover that destroys everything.
        </p>
      </div>

      <div className="prose">
        <h2>Stack, counter or monotonic stack?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>One kind of bracket, only validity or depth needed</td>
            <td>A counter</td>
            <td>The stack would only ever hold copies of "(", so its size is the whole story.</td>
          </tr>
          <tr>
            <td>Several kinds of bracket, or you need positions</td>
            <td>Stack of characters or indices</td>
            <td>You must know which opener is on top, or where it was.</td>
          </tr>
          <tr>
            <td>Next or previous greater or smaller element</td>
            <td>Monotonic stack (<See id="monotonic-stack" />)</td>
            <td>Keep the stack sorted and pop everything the new element beats.</td>
          </tr>
          <tr>
            <td>Process in arrival order</td>
            <td>Queue (<See id="queue" />)</td>
            <td>First in, first out is the opposite of a stack.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Popping or peeking an <b>empty stack</b>. In TypeScript that gives <b>undefined</b> silently instead of an error, so the bug hides. Check the length first.</>,
          <>Forgetting the <b>final check</b>: after the scan, leftover items on the stack usually mean the input was not valid.</>,
          <>Using <b>shift</b>/<b>unshift</b> instead of <b>push</b>/<b>pop</b>, which turns an O(n) solution into O(n²).</>,
          <>In expression problems, popping operands in the <b>wrong order</b>: the first value popped is the right operand of − and ÷.</>,
          <>Using <b>Math.floor</b> for division that must truncate toward zero; negative results come out one too small.</>,
          <>Building strings by repeated concatenation inside a loop when you could collect pieces in an array and join once.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the bracket check on "{[]}(" by hand. What is on the stack at the end, and what is the answer?',
            solution: 'After "{[]}" the stack is empty; "(" is pushed. The scan ends with "(" still open, so the string is invalid.',
          },
          {
            task: 'Evaluate the postfix expression 4 2 3 × − 6 2 ÷ + with a stack. Write the stack after each token.',
            hint: 'The first operator, ×, uses 2 and 3.',
            solution: '4 | 4 2 | 4 2 3 | 4 6 | −2 | −2 6 | −2 6 2 | −2 3 | 1. The answer is 1.',
          },
          {
            task: 'Remove adjacent equal pairs from "abccbaz" using the cancel-the-top pattern. What is left?',
            solution: 'a, ab, abc, then c cancels c: ab; b cancels b: a; a cancels a: empty; push z. The result is "z".',
          },
          {
            task: 'Why is Min Stack\'s getMin O(1) even after many pops, when a single "current minimum" variable is not enough?',
            solution: 'Each entry stores the minimum at the moment it was pushed, so after any pop the new top already holds the right minimum. One variable cannot know the previous minimum once the current one is popped.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A counter adds 1 for any opening bracket and subtracts 1 for any closing bracket, rejecting the string if it ever goes negative or does not end at 0. Which string does it wrongly accept?',
            options: ['"(()"', '"([)]"', '")("', '"(("'],
            answer: 1,
            why: 'The counts balance and never go negative, but ")" arrives while "[" is the most recent open bracket. Only a stack sees which kind is on top.',
          },
          {
            q: 'In postfix, the stack holds [8, 3] (3 on top) and the next token is "−". What gets pushed?',
            options: ['−5', '5', '11', '24'],
            answer: 1,
            why: 'Pop 3 first (right operand), then 8 (left operand): 8 − 3 = 5.',
          },
          {
            q: 'Asteroid Collision has a loop inside a loop. Why is it still O(n)?',
            options: [
              'Because the inner loop runs at most twice',
              'Because every asteroid is pushed at most once and popped at most once',
              'Because collisions are rare',
              'It is not; it is O(n²)',
            ],
            answer: 1,
            why: 'Count the total work over the whole run, not per iteration: n pushes and at most n pops. This is called amortised analysis.',
          },
          {
            q: 'For an iterative pre-order traversal, in which order do you push a node\'s children?',
            options: ['Left, then right', 'Right, then left', 'It does not matter', 'Only the left child'],
            answer: 1,
            why: 'Last in, first out: pushing right first means left comes off the stack first, giving node, left, right.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Work through each pattern in order. Spend 20–30 minutes on a problem before opening a hint, and reveal one hint at a time.
          Problems marked <b>Core</b> are the minimum set. Mark a problem Solved and the <a href="#/review">review queue</a> brings
          it back in a few days.
        </p>
      </div>
      <ProblemSet id="stack" />

      <Recap>
        <ul>
          <li>A stack gives you the most recent unfinished item in O(1). If you are scanning backwards for "the last one still open", use a stack.</li>
          <li>Matching pairs, cancelling neighbours, nested contexts and undo are all last in, first out.</li>
          <li>Expressions: postfix is a pure stack; infix needs a sum of terms for precedence and saved contexts for brackets.</li>
          <li>Store more than the value when it helps: indices for lengths, counts for runs, the running minimum for Min Stack.</li>
          <li>Any recursion can become a loop with an explicit stack, which also avoids stack overflow on deep inputs.</li>
        </ul>
      </Recap>
    </>
  );
}
