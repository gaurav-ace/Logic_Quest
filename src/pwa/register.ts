// Registered only in production builds: in `npm run dev` a worker would serve stale files
// from its cache and hide code changes.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch((e: unknown) => {
    // Not fatal: the app still works online without offline support.
    console.warn('Service worker registration failed', e);
  });
}
