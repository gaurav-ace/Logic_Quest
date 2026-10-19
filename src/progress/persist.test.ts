import { describe, expect, it } from 'vitest';
import { persistMessage, requestPersistentStorage } from './persist';

const fake = (persisted: boolean, grant: boolean | Error) =>
  ({
    persisted: async () => persisted,
    persist: async () => {
      if (grant instanceof Error) throw grant;
      return grant;
    },
  }) as unknown as StorageManager;

describe('requestPersistentStorage', () => {
  it('reports storage that is already protected without asking again', async () => {
    expect(await requestPersistentStorage(fake(true, false))).toBe('persisted');
  });

  it('asks, and reports whether the browser agreed', async () => {
    expect(await requestPersistentStorage(fake(false, true))).toBe('persisted');
    expect(await requestPersistentStorage(fake(false, false))).toBe('not-persisted');
  });

  it('copes with a browser that throws or lacks the API', async () => {
    expect(await requestPersistentStorage(fake(false, new Error('blocked')))).toBe('not-persisted');
    expect(await requestPersistentStorage({} as StorageManager)).toBe('unsupported');
  });

  it('explains each state', () => {
    expect(persistMessage('persisted')).toContain('won’t clear it');
    expect(persistMessage('not-persisted')).toContain('may clear it');
  });
});
