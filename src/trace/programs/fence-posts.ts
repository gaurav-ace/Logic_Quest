import { predict, randomInt, Tracer } from '../tools';
import type { Program } from '../types';

// L4 "Loops and their limits": the fencepost (off-by-one) error. A fence `length` metres long
// with a post every metre, including both ends, needs length + 1 posts.

const code = [
  'def count_posts(length):',
  '    posts = 0',
  '    for m in range(0, length + 1):',
  '        posts = posts + 1',
  '    return posts',
];

export const fencePosts: Program<number> = {
  id: 'fence-posts',
  code,
  defaultInput: 4,
  randomInput: (r) => randomInt(r, 3, 8),
  describe: (length) => `length = ${length} metres`,
  reference(length) {
    let posts = 0;
    for (let m = 0; m <= length; m++) posts++;
    return posts;
  },
  run(length) {
    const t = new Tracer();
    const marks = Array.from({ length: length + 1 }, (_, m) => `${m} m`);
    const view = (m: number | null, placed: number) => [
      {
        type: 'array' as const,
        label: 'Post positions along the fence',
        values: marks,
        ...(m === null ? {} : { pointers: [{ name: 'm', index: m }], highlight: [m] }),
        done: Array.from({ length: placed }, (_, i) => i).filter((i) => i !== m),
      },
    ];
    const runs = predict(
      `The fence is ${length} metres long. How many times will line 4 run?`,
      length + 1,
      `range(0, ${length + 1}) gives 0, 1, …, ${length}: that is ${length + 1} values, one post at each metre mark including both ends.`,
      [
        { value: length, why: `One per metre sounds right, but a ${length}-metre fence has ${length + 1} marks (0 to ${length}): both ends need a post.` },
        { value: length - 1, why: 'That leaves out both end posts. Count the marks: 0 through the full length.' },
        { value: length + 2, why: `range stops before its end value, so ${length + 1} itself is not included.` },
      ],
      1,
    );
    t.step(null, `A fence ${length} metres long, with a post every metre, including both ends. How many posts?`, { length }, view(null, 0));
    let posts = 0;
    t.step(2, 'posts starts at 0.', { posts }, view(null, 0), runs);
    for (let m = 0; m <= length; m++) {
      t.step(3, m === 0 ? 'The loop starts at m = 0: the post at the very start.' : `m = ${m}.`, { m, posts }, view(m, posts));
      posts++;
      const lastAsk =
        m === length - 1
          ? predict(
              `m is ${m}. Will the loop run again after this pass?`,
              'Yes, once more',
              `range(0, ${length + 1}) includes ${length}, so there is one more pass, for the post at the far end.`,
              [
                { value: 'No, it stops', why: `It would stop if the range were range(0, ${length}). The end value here is ${length + 1}, so ${length} is still included.` },
                { value: 'Yes, twice more', why: `The last value is ${length}; range never includes its end value ${length + 1}.` },
              ],
              m,
            )
          : undefined;
      t.step(4, `A post at ${m} m. posts = ${posts}.`, { m, posts }, view(m, posts), lastAsk);
    }
    t.step(5, `Done: ${posts} posts for ${length} metres. The off-by-one trap is answering ${length}.`, { result: posts }, view(null, posts));
    return t.frames;
  },
};
