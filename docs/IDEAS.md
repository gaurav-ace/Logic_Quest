# Parked ideas

Not approved for work. Do not act on these without the owner's approval (CLAUDE.md section 13).

- **Type-check `vite.config.ts`:** add `@types/node` as a dev dependency. It is currently left out of `tsc` to avoid an unapproved dependency. The logic it calls (`src/pwa/precache.ts`) is typed and tested.
- **Commit the browser check script:** the headless-Chrome check (phone/desktop layout, touch-only taps, offline, installability) used in Phase 0 lives outside the repo, because it relies on Windows Chrome and a Windows `node.exe` reached from WSL. A portable version would make UI checks repeatable in later phases.
- **Service worker update test:** add an automated check that a new deploy replaces the old cache. In Phase 0 this was reasoned about, not tested.
- **Prototype issues to carry into Phase 1/2:** streak was not saved; replaying a finished lesson could farm streak bonuses; the moving dot ignored reduced motion (fixed in the new renderer).
