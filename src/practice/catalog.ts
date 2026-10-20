import type { Track } from '../lesson/schema';
import type { PracticeItem } from './schema';
import { validatePracticeFile } from './validate';

// One JSON file per track in practice/, loaded only when that track's practice list is opened, so
// the first load of the app doesn't grow (the main bundle is already past Vite's size warning).

const files = import.meta.glob<unknown>('../../practice/*.json', { import: 'default' });
const trackOf = (path: string) => path.replace(/^.*\/([a-z-]+)\.json$/, '$1');

/** Tracks that have practice, in curriculum order. */
export function practiceTracks(order: readonly Track[]): Track[] {
  const have = new Set(Object.keys(files).map(trackOf));
  return order.filter((t) => have.has(t));
}

const cache = new Map<Track, Promise<PracticeItem[]>>();

/** The track's items, validated. Bad data rejects with a PracticeValidationError. */
export function loadPractice(track: Track, lessonIds: ReadonlySet<string>): Promise<PracticeItem[]> {
  let p = cache.get(track);
  if (!p) {
    const load = files[`../../practice/${track}.json`];
    p = load ? load().then((data) => validatePracticeFile(`practice/${track}.json`, track, data, lessonIds)) : Promise.resolve([]);
    // A failed load (offline before the file was cached) can be retried later.
    p.catch(() => cache.delete(track));
    cache.set(track, p);
  }
  return p;
}
