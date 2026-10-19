// Registered only in production builds: in `npm run dev` a worker would serve stale files
// from its cache and hide code changes.

/** How often an open app checks for a new deploy, besides each time it comes back to the front. */
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * `onUpdate` runs when a new version takes over while this page is open (the page itself is still
 * the old version until it reloads). Not on the very first install, when there was nothing older.
 */
export function registerServiceWorker(onUpdate: () => void = () => {}): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) onUpdate();
  });
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then((registration) => {
      // Android often resumes the installed app instead of reloading it, so look for updates
      // whenever it comes back to the front, and now and then while it stays open.
      const check = () => void registration.update().catch(() => {});
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) check();
      });
      setInterval(check, CHECK_EVERY_MS);
    })
    .catch((e: unknown) => {
      // Not fatal: the app still works online without offline support.
      console.warn('Service worker registration failed', e);
    });
}
