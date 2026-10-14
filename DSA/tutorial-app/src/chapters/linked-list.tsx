import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/linked-list';
import { mergeTwo, removeNthFromEnd, reverseList } from '../traces/linked-list';
import { Walkthrough } from '../viz/Walkthrough';

const reversal = reverseList([1, 2, 3, 4, 5]);
const merge = mergeTwo([1, 3, 6, 9], [2, 3, 4]);
const removal = removeNthFromEnd([10, 20, 30, 40, 50], 2);

export default function LinkedList() {
  return (
    <>
      <TopicIntro
        id="linked-list"
        time="4–5 hours, plus problems"
        before={['complexity', 'array', 'recursion']}
        learn={[
          'What a linked list is, what it is good at, and what it costs compared with an array',
          'The dummy head: one trick that removes most special cases',
          'Reversing a list iteratively and recursively, whole or in parts',
          'Merging, splitting, and finding nodes from the end with a gap',
          'Combining middle, reverse and merge for palindrome and reorder problems',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A linked list is a treasure hunt. Each clue (a <b>node</b>) holds a value and tells you where the next clue is (its{' '}
          <b>next</b> pointer). The last clue says "the end" (null). You can only start from the first clue, the <b>head</b>, and follow
          the trail. There is no "jump to clue 7": reaching position k takes k steps.
        </p>
        <p>
          In exchange, changing the trail is cheap. To remove a node you change one pointer so the trail skips it; to insert a node
          you point it at its successor and point its predecessor at it. No other node moves, unlike an array, where inserting at the
          front shifts every element. Interview problems on linked lists are rarely about speed. They test whether you can rewire
          pointers precisely, in the right order, without losing the rest of the list or creating a loop.
        </p>
        <p>
          The most important move is reversal. Watch it: each step takes one node from the front of the unreversed part and puts it
          at the front of the reversed part.
        </p>
      </div>

      <Walkthrough
        title="Reverse a linked list with prev and curr"
        frames={reversal.frames}
        caption="Two lists are drawn, but they are the same nodes: each step turns one arrow around. Saving next first is what keeps the rest reachable."
      />

      <Box kind="key" label="Key idea">
        <p>
          Before changing any pointer, ask: <i>after this change, can I still reach every node I need?</i> If a node is only reachable
          through the pointer you are about to overwrite, save a reference to it first. Drawing three boxes and their arrows on paper
          before coding prevents nearly every linked list bug.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          LeetCode gives you the node type: an object with a value and a next pointer, written in TypeScript as a class ListNode with
          fields val and next (next is ListNode or null). You build everything else from references to nodes.
        </p>
      </div>
      <Structures
        items={[
          { name: 'List node', ts: 'ListNode with val: number and next: ListNode | null', ops: 'follow next O(1); reach position k O(k)', use: 'The list itself. A variable holding a node is a pointer into the list.' },
          { name: 'Dummy (sentinel) node', ts: 'a new ListNode(0) whose next is the head', ops: 'O(1) to create', use: 'Giving the head a predecessor, and starting result lists.' },
          { name: 'Tail pointer', ts: 'a ListNode variable', ops: 'append O(1)', use: 'Building a list in order without walking to its end each time.' },
          { name: 'Stack', ts: 'number[] or ListNode[] with push and pop', ops: 'O(1)', use: 'Reading a list backwards without reversing it (Add Two Numbers II).' },
          { name: 'Map of nodes', ts: 'Map<ListNode, ListNode>', ops: 'O(1) average; compares nodes by identity, which is what you want here', use: 'Translating pointers when copying (Copy List with Random Pointer), or remembering visited nodes.' },
        ]}
      />

      <TableWrap>
        <thead>
          <tr>
            <th>Operation</th>
            <th>Array</th>
            <th>Singly linked list</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Read element k</td>
            <td><Cost>O(1)</Cost></td>
            <td><Cost>O(k)</Cost>: walk from the head</td>
          </tr>
          <tr>
            <td>Insert or delete at the front</td>
            <td><Cost>O(n)</Cost>: shift everything</td>
            <td><Cost>O(1)</Cost></td>
          </tr>
          <tr>
            <td>Insert or delete after a node you hold</td>
            <td><Cost>O(n)</Cost></td>
            <td><Cost>O(1)</Cost></td>
          </tr>
          <tr>
            <td>Delete a node you hold (need its predecessor)</td>
            <td><Cost>O(n)</Cost></td>
            <td><Cost>O(n)</Cost> to find the predecessor; <Cost>O(1)</Cost> with a doubly linked list</td>
          </tr>
          <tr>
            <td>Find the length, the middle, the end</td>
            <td><Cost>O(1)</Cost></td>
            <td><Cost>O(n)</Cost> walk</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Dummy head and rewiring</h2>
        <p>
          Removing a node means changing the next pointer of the node <i>before</i> it. The head has no node before it, so every
          removal problem would need a special case for the head. A <b>dummy node</b> placed in front of the head fixes that: now every
          real node has a predecessor, the same rule works everywhere, and the answer is simply dummy.next at the end. Use one whenever
          the head might change.
        </p>
      </div>
      <Recipe
        name="Remove nodes behind a dummy head"
        when="nodes must be removed or the first node may change."
        steps={[
          'Create a dummy node whose next is the head. Set curr = dummy.',
          'While curr.next exists, look at that next node.',
          'If it must go, point curr.next past it, and do not move curr (the new next node must be checked too).',
          'Otherwise move curr to its next node.',
          'Return dummy.next.',
        ]}
        why="curr is always the last node that is definitely kept, so skipping its next node never loses a node that should stay."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: Reversal</h2>
        <p>
          The iterative reversal above needs three references: <b>prev</b> (the head of the reversed part), <b>curr</b> (the node being
          moved) and <b>next</b> (saved so the rest of the list stays reachable). The recursive version reads differently but does the
          same thing: reverse everything after the head, then make the head's old successor point back to the head, and make the head
          point to null. Iterative uses <Cost>O(1)</Cost> space; recursive uses <Cost>O(n)</Cost> stack.
        </p>
        <p>
          Partial reversals (positions left to right, pairs, groups of k) reuse the same move. The extra work is bookkeeping: keep a
          pointer to the node just before the reversed section, so you can reconnect it to the new front, and remember that the old
          first node of the section becomes its last.
        </p>
      </div>
      <Recipe
        name="Iterative reversal"
        when="a list or a section of it must be reversed in place."
        steps={[
          'Set prev = null (or the node after the section) and curr = the first node to reverse.',
          'Save next = curr.next.',
          'Point curr.next at prev.',
          'Move prev to curr, then curr to next.',
          'Repeat until the section is done; prev is now its first node.',
        ]}
        why="after each step, prev heads a correctly reversed list of all nodes processed so far, and next still holds the rest."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 3: Merge and split</h2>
        <p>
          To build a list, keep a dummy head and a <b>tail</b> pointer, and attach nodes to the tail. Merging two sorted lists is
          then "attach the smaller front node, repeat". Splitting is the same idea with two result lists: Partition List sends each
          node to "less than x" or "the rest", and Odd Even Linked List alternates. Remember to end each result list with null, so no
          old next pointer survives.
        </p>
      </div>
      <Walkthrough title="Merge two sorted lists behind a dummy head" frames={merge.frames} caption="No new nodes are created: the existing nodes are re-linked in sorted order." />
      <div className="prose">
        <p>
          Merging is also the heart of merge sort, which suits linked lists better than any other sort: find the middle, sort both
          halves, merge. That is Sort List. With k lists, merge them in pairs or use a min-heap of the k front nodes; see{' '}
          <See id="heap" /> and <See id="merge-sort" />.
        </p>

        <h2>Pattern 4: Two pointers with a gap</h2>
        <p>
          A list does not know its length, so "the n-th node from the end" is not directly reachable. Put two pointers n + 1 nodes
          apart, starting at a dummy, and move them together. When the leading pointer runs off the end, the trailing one is exactly
          one node before the target, which is where you need to be to remove it. The same idea aligns two lists of different
          lengths in Intersection of Two Linked Lists.
        </p>
      </div>
      <Walkthrough title="Remove the 2nd node from the end, in one pass" frames={removal.frames} />
      <div className="prose">
        <p>
          Pointers moving at <i>different speeds</i> are the other half of this family: fast and slow pointers find the middle and
          detect cycles. They are taught in full, with the proof of Floyd's algorithm, in <See id="two-pointers" />.
        </p>

        <h2>Pattern 5: Combine the basics</h2>
        <p>
          Many medium problems are three basic moves in a row. To check a palindrome, compare the list with itself backwards: find
          the middle (fast and slow), reverse the second half, and walk both halves together. Reorder List interleaves the first half
          with the reversed second half. Maximum Twin Sum adds the two halves pairwise. All three run in <Cost>O(n)</Cost> time and{' '}
          <Cost>O(1)</Cost> space, because reversing in place replaces the stack you would otherwise need.
        </p>
      </div>
      <Recipe
        name="Middle, reverse, walk both halves"
        when="the first half of the list must be matched with the second half read backwards."
        steps={[
          'Find the middle: slow moves one node and fast two until fast reaches the end.',
          'Reverse the list from the middle (and cut it there if you will rewire nodes).',
          'Walk from the head and from the reversed half at the same time, comparing, summing or interleaving.',
          'If the caller needs the list unchanged, reverse the second half back.',
        ]}
        why="reversal makes the far end of the list reachable from the middle, so both halves can be walked forwards together."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 6: Arithmetic on lists</h2>
        <p>
          A number can be stored one digit per node. If the ones digit comes first (Add Two Numbers), walking both lists together is
          exactly schoolbook addition with a carry, as in <See id="simulation" />. If the most significant digit comes first, read the
          digits backwards with two stacks, and build the answer by adding each new node at the front.
        </p>

        <h2>Pattern 7: Extra pointers</h2>
        <p>
          In Copy List with Random Pointer, each node also points at some arbitrary node. A copy must point at copies, never at
          originals. Make all the copies first and record original → copy in a Map; then every pointer can be translated. The O(1)
          space version weaves each copy right after its original, so "the copy of X" is simply X.next.
        </p>

        <h2>Worked example: Reverse Nodes in k-Group</h2>
        <p>Reverse the list k nodes at a time, leave a final short group alone, and use O(1) extra memory.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Copy the values into an array, reverse each block of k, and write them back. That is <Cost>O(n)</Cost> but uses{' '}
          <Cost>O(n)</Cost> space, and the problem forbids changing values anyway. You must rewire nodes.
        </p>
        <Step n={2}>Split it into moves you know</Step>
        <p>
          Each group is a partial reversal. What is new is the stitching: the node before the group must point to the group's new
          first node, and the group's old first node (now last) must point to the next group.
        </p>
        <Step n={3}>Write the loop</Step>
        <p>
          Keep groupPrev, the node before the current group, starting at a dummy. Count k nodes ahead; if there are fewer, stop.
          Reverse those k nodes with prev starting at the node after the group (so the reversed group already points onward). Then set
          groupPrev.next to the new first node, and move groupPrev to the old first node, which is now the group's tail.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each node is counted once and reversed once: <Cost>O(n)</Cost> time, <Cost>O(1)</Cost> space. k = 1 changes nothing. A
          length that is an exact multiple of k reverses every group. The dummy handles the head changing after the first group.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Overwriting curr.next before saving it, which cuts off the rest of the list.</>,
          <>Forgetting a dummy node, then writing special cases for the head that miss one situation.</>,
          <>Leaving an old next pointer at the end of a rebuilt list, which creates a cycle (Partition List, Reorder List).</>,
          <>Comparing nodes by value when the problem needs the same node (Intersection, cycle detection).</>,
          <>Using the wrong middle in merge sort, so a two-node list never splits and the recursion never ends.</>,
          <>Stepping fast twice without checking that fast.next exists.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Reverse 1 → 2 → 3 iteratively. Write prev, curr and the saved next after each step.',
            solution: 'Start prev = null, curr = 1. Step 1: next = 2, 1 → null, prev = 1, curr = 2. Step 2: next = 3, 2 → 1, prev = 2, curr = 3. Step 3: next = null, 3 → 2, prev = 3, curr = null. Head is 3: 3 → 2 → 1.',
          },
          {
            task: 'Why does removing the head with "point curr.next past the node" need a dummy node?',
            solution: 'The rule changes the predecessor\'s next pointer, and the head has no predecessor. The dummy gives it one, so the same rule works and the answer is dummy.next.',
          },
          {
            task: 'Lists A = 4 → 1 → 8 → 5 and B = 6 → 2 → 1 → 8 → 5 share the nodes 8 → 5 (the two 1s are different nodes). Using the switch-heads method, how many nodes does each pointer pass before they meet at 8?',
            hint: 'Pointer A walks all of A, then the unshared part of B.',
            solution: 'A has 2 unshared nodes, B has 3, and 2 are shared. Each pointer passes 2 + 2 + 3 = 7 nodes (A: 4, 1, 8, 5, 6, 2, 1; B: 6, 2, 1, 8, 5, 4, 1) and then both arrive at 8.',
          },
          {
            task: 'Check whether 1 → 2 → 3 → 2 → 1 is a palindrome with the middle, reverse, walk method. Which pairs are compared?',
            solution: 'The middle is 3. Reversing from it gives 1 → 2 → 3. Compare 1 with 1, 2 with 2, 3 with 3: a palindrome.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In iterative reversal, what must happen before curr.next is changed?',
            options: ['prev must move to curr', 'curr.next must be saved in next', 'The list length must be known', 'A dummy node must be created'],
            answer: 1,
            why: 'Once curr.next points back to prev, the rest of the list is reachable only through the saved reference.',
          },
          {
            q: 'To remove the n-th node from the end in one pass, how far apart should the two pointers be, starting from a dummy?',
            options: ['n − 1 nodes', 'n nodes', 'n + 1 nodes', 'Half the list'],
            answer: 2,
            why: 'With a gap of n + 1, when the leader becomes null the trailing pointer is one node before the target, which is where you need it.',
          },
          {
            q: 'Which approach checks a palindrome list in O(1) extra space?',
            options: ['Copy the values to an array and compare ends', 'Push all values on a stack', 'Find the middle, reverse the second half, compare the halves', 'Use a hash map of values'],
            answer: 2,
            why: 'The other three use O(n) memory. Reversing in place costs nothing extra.',
          },
          {
            q: 'Merging k sorted lists one after another into a growing result costs O(N · k). What brings it down to O(N log k)?',
            options: ['Sorting all values in an array', 'Merging in pairs, round after round, or a min-heap of front nodes', 'A dummy head', 'Reversing each list first'],
            answer: 1,
            why: 'Both methods make each node take part in about log k merge steps or heap operations.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For every problem, draw the list as boxes and arrows, and redraw it after each pointer change of your plan. When the drawing
          is right, the code is a transcription.
        </p>
      </div>
      <ProblemSet id="linked-list" />

      <Recap>
        <ul>
          <li>A linked list trades index access (O(k)) for O(1) insertion and removal next to a node you hold.</li>
          <li>Use a dummy head whenever the head might change; return dummy.next.</li>
          <li>Reversal is prev, curr and a saved next. Partial reversals add a pointer to the node before the section.</li>
          <li>Build lists with a dummy and a tail; end them with null. Gaps between two pointers measure from the end.</li>
          <li>Middle, reverse, walk both halves solves palindromes and reordering in O(1) space.</li>
        </ul>
      </Recap>
    </>
  );
}
