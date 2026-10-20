import type { KeyValue } from '../progress/store';

// The learner's own Gemini API key (CLAUDE.md section 4.7, exception (a)): typed into the app and
// kept only in this profile's local storage. It has its own key, so it is never part of a progress
// or workshop export, and removing the learner removes it. Nothing ever logs or displays it.

export class GeminiKeyStore {
  constructor(
    private readonly kv: (KeyValue & { removeItem(key: string): void }) | null,
    private readonly key: string,
  ) {}

  get(): string {
    try {
      return this.kv?.getItem(this.key) ?? '';
    } catch {
      return '';
    }
  }

  /** False when storage is full or blocked. */
  set(value: string): boolean {
    try {
      if (!this.kv) return false;
      this.kv.setItem(this.key, value.trim());
      return true;
    } catch {
      return false;
    }
  }

  remove(): void {
    try {
      this.kv?.removeItem(this.key);
    } catch {
      // Nothing to remove from storage that can't be reached.
    }
  }
}
