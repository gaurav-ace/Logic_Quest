// Ask the browser to keep this site's storage even when the device runs low on space. Without
// it, browsers may clear "best-effort" site data on their own. Chrome decides without asking the
// learner (installed apps and often-used sites are usually granted).

export type PersistState = 'persisted' | 'not-persisted' | 'unsupported';

export async function requestPersistentStorage(storage: StorageManager | undefined = navigator.storage): Promise<PersistState> {
  if (!storage?.persist || !storage.persisted) return 'unsupported';
  try {
    if (await storage.persisted()) return 'persisted';
    return (await storage.persist()) ? 'persisted' : 'not-persisted';
  } catch {
    return 'not-persisted';
  }
}

export function persistMessage(state: PersistState): string {
  if (state === 'persisted') return 'This browser has agreed to keep your progress: it won’t clear it to free up space.';
  return 'This browser may clear it if the device runs very low on space.';
}
