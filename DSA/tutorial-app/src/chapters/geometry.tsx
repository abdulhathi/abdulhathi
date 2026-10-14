import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/geometry';
import { convexHull, rectangleProjections } from '../traces/geometry';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const hull = convexHull([[0, 1], [1, 0], [2, 2], [3, 0], [4, 1], [2, 4], [1, 2], [3, 3]]);
const boxes = rectangleProjections([0, 0, 4, 3], [2, 1, 6, 5]);

export default function Geometry() {
  return (
    <>
      <TopicIntro
        id="geometry"
        time="5–6 hours, plus problems"
        before={['math', 'number-theory', 'sorting', 'hash-table']}
        learn={[
          'Vectors, the dot product and the cross product, and why the cross product answers most geometry questions',
          'Choosing the right distance: Euclidean, Manhattan or Chebyshev',
          'Rectangles, circles, polygon area with the shoelace formula, and the triangle inequality',
          "The convex hull with Andrew's monotone chain, plus the ideas behind closest pairs, enclosing circles and k-d trees",
          'How to stay exact: squared distances, reduced fractions, BigInt, and tolerances when floating point is unavoidable',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Geometry problems on LeetCode are mostly about points with integer coordinates. They look like they need trigonometry,
          but nearly all of them are solved with a handful of exact integer tools. The most important is the{' '}
          <b>cross product</b>. Imagine driving from point O to point A and then on to B. Do you turn left, turn right, or go
          straight on? The cross product (A − O) × (B − O) = (A.x − O.x)(B.y − O.y) − (A.y − O.y)(B.x − O.x) answers that with its sign:
          positive for left, negative for right, zero for straight. From that one test you get collinearity, turn direction,
          triangle areas, polygon areas, segment intersection and convex hulls.
        </p>
        <p>
          The second big idea is to <b>split by axis</b>. Axis-aligned rectangles never need 2D reasoning: two rectangles
          overlap exactly when their shadows on the x-axis overlap and their shadows on the y-axis overlap.
        </p>
      </div>

      <VizFigure
        parts={boxes.parts}
        caption={`Rectangles A = (0,0)–(4,3) and B = (2,1)–(6,5). Their x-shadows overlap by 2 and their y-shadows by 2, so they share an area of ${boxes.area}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Stay in integers as long as possible. Compare <b>squared</b> distances instead of distances, compare slopes by{' '}
          <b>cross-multiplying</b> or as <b>reduced fractions</b>, and test turns with the <b>cross product</b>. Every division
          and square root introduces rounding, and rounding errors are exactly what hidden test cases are built to catch.
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
          { name: 'Point', ts: '[number, number] (a tuple)', ops: 'O(1) access', use: 'Every geometry problem. Write small helpers in your head: subtract, cross, dot, squared length.' },
          { name: 'Set of points', ts: 'Set<string> with "x,y", or Set<number> with x × K + y', ops: 'O(1) average lookup', use: 'Asking "is there a point at (x, y)?" as in Minimum Area Rectangle. Arrays as keys do not work: Set compares arrays by identity.' },
          { name: 'Map of directions', ts: 'Map<string, number>', ops: 'O(1) average', use: 'Counting points by exact reduced slope "dy/dx".' },
          { name: 'Sorted array', ts: 'Array.prototype.sort with a comparator', ops: 'O(n log n)', use: 'Convex hull (sort by x then y), angular sweeps (sort by angle), polygon side lengths.' },
          { name: 'Heap', ts: 'a hand-written binary heap', ops: 'O(log k) push and pop', use: 'k closest points (see the heap chapter).' },
          { name: 'BigInt', ts: 'bigint', ops: 'exact, slower', use: 'Cross-multiplying coordinates up to 10⁹, whose products reach 10¹⁸.' },
        ]}
      />

      <div className="prose">
        <h2>Vectors in five facts</h2>
        <ul>
          <li>A <b>vector</b> from A to B is (B.x − A.x, B.y − A.y): how far to move in x and in y.</li>
          <li>The <b>dot product</b> u · v = u.x × v.x + u.y × v.y is positive when the angle between u and v is acute, zero when they are perpendicular, negative when obtuse.</li>
          <li>The <b>cross product</b> u × v = u.x × v.y − u.y × v.x is positive when v is counter-clockwise from u, zero when parallel, negative when clockwise.</li>
          <li>|u × v| is the area of the parallelogram spanned by u and v, so a triangle's area is |AB × AC| / 2.</li>
          <li>Squared length u · u = u.x² + u.y² orders vectors by length without a square root.</li>
        </ul>

        <h2>Pattern 1: Distances and coordinates</h2>
        <p>The movement rules decide the distance. Read them carefully before choosing.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Distance</th>
            <th>Formula</th>
            <th>When</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Euclidean (straight line)</td><td>√(dx² + dy²), compare dx² + dy²</td><td>Free movement in the plane; circles; "closest to the origin"</td></tr>
          <tr><td>Manhattan</td><td>|dx| + |dy|</td><td>Moves only along the grid, one axis at a time</td></tr>
          <tr><td>Chebyshev</td><td>max(|dx|, |dy|)</td><td>Diagonal moves allowed at the same cost, like a chess king</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 2: Cross product and collinearity</h2>
      </div>
      <Recipe
        name="Orientation test"
        when="you need to know whether three points turn left, turn right or are collinear."
        steps={[
          'Form the vectors OA = A − O and OB = B − O.',
          'Compute c = OA.x × OB.y − OA.y × OB.x.',
          'c > 0: O → A → B turns left (counter-clockwise). c < 0: it turns right. c = 0: the three points are on one line.',
          'If coordinates can reach 10⁹, do the two multiplications with BigInt.',
        ]}
        why="the cross product is the signed area of the parallelogram on OA and OB, which is zero exactly when they point along one line."
        time="O(1)"
        space="O(1)"
      />
      <div className="prose">
        <p>
          Two uses come up again and again. <b>Same line:</b> instead of comparing slopes dy₁/dx₁ = dy₂/dx₂ (division, and
          vertical lines divide by zero), check dy₁ × dx₂ = dy₂ × dx₁. Or, when you need a hash key for a direction, reduce
          (dy, dx) by gcd(|dy|, |dx|) and fix the sign so that dx &gt; 0, or dx = 0 and dy &gt; 0. <b>Segments crossing:</b>{' '}
          segments AB and CD properly cross when C and D are on opposite sides of AB (orientations with opposite signs) and A
          and B are on opposite sides of CD; zero orientations mean touching or overlapping, which you check with coordinate
          ranges.
        </p>

        <h2>Pattern 3: Rectangles and circles</h2>
        <p>
          For axis-aligned rectangles, treat x and y separately. The overlap of [a₁, a₂] and [b₁, b₂] has length
          max(0, min(a₂, b₂) − max(a₁, b₁)). The overlap area is the x-overlap times the y-overlap, and the area of a union of
          two rectangles is A + B − overlap. For a circle and a rectangle, find the rectangle point closest to the centre by
          clamping the centre's coordinates into the rectangle's ranges, then compare its squared distance with r².
        </p>

        <h2>Pattern 4: Triangles and polygons</h2>
        <p>
          The <b>shoelace formula</b> gives the area of any simple polygon from its corners in order: add up xᵢ × yᵢ₊₁ − xᵢ₊₁ × yᵢ
          around the polygon (wrapping from the last corner back to the first) and halve the absolute value. It is just the cross
          product summed around the edges. For a triangle it is |AB × AC| / 2.
        </p>
      </div>
      <Recipe
        name="Shoelace formula"
        when="you need the area of a polygon whose corners are given in order around the boundary."
        steps={[
          'Set sum = 0.',
          'For each corner i, with j the next corner (wrapping to the first after the last), add xᵢ × y_j − x_j × yᵢ.',
          'The area is |sum| / 2. The sign of sum tells you the order: positive means counter-clockwise.',
        ]}
        why="each term is twice the signed area of the triangle from the origin to one edge; the parts outside the polygon cancel."
        time="O(n)"
        space="O(1)"
      />
      <div className="prose">
        <p>
          Two more facts. <b>Point in polygon:</b> cast a ray from the point to the right and count how many edges it crosses;
          an odd count means inside. <b>Triangle and polygon inequality:</b> lengths can form a polygon exactly when the longest
          is shorter than the sum of the rest, so after sorting you only ever compare the largest length with a prefix sum.
          Cutting a convex polygon into triangles optimally is an interval DP; see <See id="dp-interval" />.
        </p>

        <h2>Pattern 5: Convex hull and enclosing circle</h2>
        <p>
          The <b>convex hull</b> is the shape a rubber band takes around nails at the points. Andrew's{' '}
          <b>monotone chain</b> builds it after sorting: walk left to right keeping only left turns (that gives the lower hull),
          then right to left the same way (the upper hull). Whenever a new point would make a right turn, the previous point is
          inside and gets popped, like a monotonic stack (see <See id="monotonic-stack" />).
        </p>
      </div>
      <Walkthrough
        title="Monotone chain on eight points"
        frames={hull.frames}
        caption={`Hull corners: ${hull.hull.map((p) => `(${p[0]},${p[1]})`).join(', ')}. The points (1,2) and (2,2) are inside.`}
      />
      <Recipe
        name="Monotone chain convex hull"
        when="you need the convex hull, the shortest fence, or the outermost points of a set."
        steps={[
          'Sort the points by x, breaking ties by y.',
          'Lower hull: for each point in order, while the hull has at least two points and the last two plus this point do not turn left, pop the last point. Then push this point.',
          'Upper hull: do the same over the points in reverse order.',
          'Drop the last point of each chain (it repeats the first point of the other) and join them.',
          'To keep points that lie in the middle of a hull edge, pop only on a strict right turn and remove duplicates at the end.',
        ]}
        why="a point is a hull corner exactly when the boundary turns at it in one consistent direction; any point causing the wrong turn is enclosed."
        time="O(n log n) for the sort, O(n) for the chains"
        space="O(n)"
      />
      <div className="prose">
        <p>Three related ideas that LeetCode tags but rarely needs in full:</p>
        <ul>
          <li>
            <b>Minimum enclosing circle (Welzl):</b> shuffle the points, keep the current circle, and when a point falls outside
            it, rebuild the circle with that point on its edge (then with two, then three fixed points). Expected{' '}
            <Cost>O(n)</Cost>.
          </li>
          <li>
            <b>Closest pair of points:</b> sort by x, split in half, solve both halves, and only check pairs that straddle the
            middle within the best distance so far, in y order. A classic divide-and-conquer in <Cost>O(n log n)</Cost> (see{' '}
            <See id="divide-and-conquer" />).
          </li>
          <li>
            <b>k-d tree:</b> split the points by x at the median, then each half by y, alternating. Nearest-neighbour and range
            queries skip whole boxes that cannot contain anything better. For one-off "k closest" questions a heap or
            quickselect is simpler.
          </li>
        </ul>

        <h2>Pattern 6: Angles around a point</h2>
        <p>
          When you rotate in place, only each point's direction matters. Math.atan2(dy, dx) gives that angle in radians from
          −π to π; convert to degrees if the problem speaks in degrees. Sort the angles, and a fixed field of view becomes a
          window on a sorted list, a <See id="sliding-window" /> problem. The circle wraps around, so append every angle plus 360°
          before sliding. This is the one place where floating point is unavoidable: compare with a small tolerance.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Max Points on a Line</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Every pair of points defines a line; for each pair, count the points on it with the cross product. That is{' '}
          <Cost>O(n³)</Cost>: 27 million checks for 300 points. It passes, barely, but there is a cleaner way.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Lines through one fixed anchor point are told apart by direction alone. Instead of testing every third point against
          every line, group the other points by their direction from the anchor.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          For each anchor, compute (dy, dx) to each later point, divide by the GCD, and normalise the sign. Use it as a key in a
          hash map. The biggest group, plus the anchor, is the best line through that anchor. Using exact fractions avoids the
          classic bug where 1/3 computed two different ways gives two different doubles.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          <Cost>O(n²)</Cost> pairs, each with a GCD of <Cost>O(log C)</Cost>. One or two points: return their count. Vertical
          lines: dx = 0 becomes the key "1/0" after normalisation. Duplicate points would need a separate counter, but this
          problem promises unique points.
        </p>
      </div>

      <Box kind="warn" label="Floating point">
        <p>
          A double has about 15–16 significant digits. 0.1 + 0.2 is not exactly 0.3, and products of coordinates near 10⁹ pass
          2⁵³, where integers stop being exact. When you must use floating point (angles, circles through three points),
          compare with a tolerance such as 10⁻⁹ instead of ===, and never use a floating-point value as a hash key.
        </p>
      </Box>

      <Pitfalls
        items={[
          <>Computing slopes with division: vertical lines divide by zero and equal slopes can round differently.</>,
          <>Using Math.sqrt to compare distances; compare squared distances.</>,
          <>Forgetting that touching edges do not count as overlap when the problem asks for positive area (use &gt;, not ≥).</>,
          <>Normalising (dy, dx) without fixing the sign, so (1, 2) and (−1, −2) become different keys.</>,
          <>Popping on cross ≤ 0 in a convex hull when collinear boundary points must be kept, or vice versa.</>,
          <>Multiplying coordinates up to 10⁹ with plain numbers: products near 10¹⁸ lose their low digits.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'For O = (1, 1), A = (4, 2), B = (2, 4), compute the cross product (A − O) × (B − O). Does O → A → B turn left or right?',
            solution: '(3, 1) × (1, 3) = 3 × 3 − 1 × 1 = 8 > 0: a left (counter-clockwise) turn.',
          },
          {
            task: 'Use the shoelace formula to find the area of the polygon (0, 0), (4, 0), (4, 3), (0, 3).',
            solution: 'Sum = 0×0 − 4×0 + 4×3 − 4×0 + 4×3 − 0×3 + 0×0 − 0×3 = 0 + 12 + 12 + 0 = 24, so the area is 24 / 2 = 12.',
          },
          {
            task: 'Rectangles (0, 0)–(5, 5) and (3, −2)–(8, 4). What is their overlap area, and their total covered area?',
            solution: 'x-overlap = min(5, 8) − max(0, 3) = 2; y-overlap = min(5, 4) − max(0, −2) = 4; overlap 8. Total = 25 + 30 − 8 = 47.',
          },
          {
            task: 'What key does Max Points on a Line use for the direction from (2, 3) to (−4, −6)?',
            solution: 'dx = −6, dy = −9; gcd 3 gives (−2, −3); dx is negative, so flip both: dx = 2, dy = 3, key "3/2".',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A king on a chessboard moves one square in any direction per turn. How many turns from (0, 0) to (5, 3)?',
            options: ['8', '5', '√34', '3'],
            answer: 1,
            why: 'Chebyshev distance: max(5, 3) = 5. Three diagonal moves, then two straight.',
          },
          {
            q: 'The cross product of AB and AC is 0. What do you know?',
            options: ['The triangle ABC is right-angled', 'A, B and C are on one straight line', 'AB and AC have equal length', 'AB is perpendicular to AC'],
            answer: 1,
            why: 'A zero cross product means the vectors are parallel, so the points are collinear (or some coincide).',
          },
          {
            q: 'In the monotone chain, the last two hull points and the new point make a right turn. What happens?',
            options: ['Push the new point and continue', 'Pop the last hull point and test again', 'Stop: the hull is done', 'Swap the last two points'],
            answer: 1,
            why: 'A right turn means the middle point is enclosed, so it is removed; repeat until the turn is left.',
          },
          {
            q: 'Why append every angle + 360° before the sliding window in Maximum Number of Visible Points?',
            options: [
              'To sort faster',
              'So that a view crossing 0° (east) is a contiguous window',
              'To convert radians to degrees',
              'To count the points at your location',
            ],
            answer: 1,
            why: 'A view from 350° to 20° wraps around; in the doubled list it is the window 350°…380°.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the cross-product problems; once orientation is automatic, the rest of the chapter follows. Keep every
          computation in integers unless the problem forces angles.
        </p>
      </div>
      <ProblemSet id="geometry" />

      <Recap>
        <ul>
          <li>The cross product gives turn direction, collinearity and areas, with exact integer arithmetic.</li>
          <li>Pick the distance from the movement rules; compare squared distances.</li>
          <li>Axis-aligned shapes split into x and y intervals; circles meet boxes at the clamped centre.</li>
          <li>Shoelace for polygon area, sorting plus the triangle inequality for side lengths, monotone chain for hulls.</li>
          <li>Angles become a sliding window on a doubled sorted list; that is where tolerances belong, and almost nowhere else.</li>
        </ul>
      </Recap>
    </>
  );
}
