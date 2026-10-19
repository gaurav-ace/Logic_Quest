import { describe, expect, it } from 'vitest';
import { APP_NAME } from './main';

describe('toolchain smoke test', () => {
  it('imports TypeScript modules and runs assertions', () => {
    expect(APP_NAME).toBe('Logic Quest');
  });
});
