import type { Topic } from './types';

export const topic: Topic = {
  id: 'rejection-sampling',
  patterns: [
    { name: 'Building a bigger generator', idea: 'Combine calls of a small uniform generator into a uniform choice over a larger range, then reject the leftovers that do not divide evenly.' },
    { name: 'Sampling a shape', idea: 'Draw uniformly from an easy box around the shape and throw away the points that fall outside it.' },
  ],
  signals: [
    { see: '"implement randN() using randM()"', think: 'Combine calls into a larger uniform range, reject the excess', why: 'Two rand7 calls give 49 equally likely outcomes; keep a multiple of 10 of them and retry on the rest.' },
    { see: '"uniform random point inside a circle (or any shape)"', think: 'Sample the bounding box and reject points outside', why: 'Points inside the shape stay uniformly spread, because rejection treats every inside point alike.' },
    { see: '"expected number of calls"', think: 'Geometric distribution: 1 / (acceptance probability) attempts', why: 'Each attempt succeeds independently with probability p, so on average 1/p attempts are needed.' },
  ],
  problems: [
    {
      id: 470, title: 'Implement Rand10() Using Rand7()', pattern: 'Building a bigger generator', core: true,
      summary: 'Using only a function that returns a uniform integer from 1 to 7, write one that returns a uniform integer from 1 to 10.',
      hints: [
        'One call of rand7 has only 7 outcomes, too few to split evenly into 10.',
        'Two calls give 49 equally likely pairs: index = (a − 1) × 7 + b, from 1 to 49.',
        'Use 1 to 40 (four of each result) and roll again on 41 to 49.',
      ],
      insight: 'Two calls make a uniform number from 1 to 49; accepting only 1 to 40 and mapping it with (idx − 1) mod 10 + 1 gives every result exactly four cells, so the output is uniform. The expected cost is 2 × 49/40 = 2.45 calls.',
      approach: ['Repeat: a = rand7(), b = rand7(), idx = (a − 1) × 7 + b.', 'If idx ≤ 40, return (idx − 1) mod 10 + 1.', 'Otherwise try again.'],
      ds: ['Integers'], time: 'O(1) expected (2.45 calls)', space: 'O(1)',
      traps: [
        'Adding two rand7 results gives a triangular, not uniform, distribution.',
        'Mapping all 49 outcomes with mod 10 makes 1–9 more likely than 10.',
        'Follow-up: the 9 rejected outcomes are themselves uniform on 1–9; combining them with another rand7 gives 63 outcomes and wastes fewer calls.',
      ],
    },
    {
      id: 478, title: 'Generate Random Point in a Circle', pattern: 'Sampling a shape', core: true,
      summary: 'Given a circle\'s radius and centre, return a uniformly random point inside it (points on the edge count).',
      hints: [
        'Draw x and y uniformly in the square around the circle.',
        'If the point is outside the circle, draw again.',
        'Picking a random angle and a random distance r uniformly is NOT uniform: points bunch up near the centre.',
      ],
      insight: 'Rejection sampling: uniform points in the bounding square that land inside the circle are uniform in the circle; the acceptance rate is π/4 ≈ 78.5%, so about 1.27 tries on average.',
      approach: [
        'Repeat: x = random in [−r, r], y = random in [−r, r].',
        'If x² + y² ≤ r², return [centreX + x, centreY + y].',
        'Otherwise try again.',
      ],
      ds: ['Floating-point numbers'], time: 'O(1) expected', space: 'O(1)',
      traps: [
        'The polar alternative works only with distance = r × √(uniform): area grows with the square of the distance.',
        'Rejection is simple in 2D but wasteful in high dimensions, where the sphere fills a tiny part of the cube.',
      ],
    },
  ],
};
