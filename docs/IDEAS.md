# Parked ideas

Not approved for work. Do not act on these without the owner's approval (CLAUDE.md section 13).

- **Type-check `vite.config.ts`:** add `@types/node` as a dev dependency. It is currently left out of `tsc` to avoid an unapproved dependency. The logic it calls (`src/pwa/precache.ts`) is typed and tested.
- **Service worker update test:** add an automated check that a new deploy replaces the old cache. In Phase 0 this was reasoned about, not tested.
- **Prototype issues to carry into Phase 2:** streak was not saved; replaying a finished lesson could farm streak bonuses. (The dot ignoring reduced motion is fixed.)
- **Run browser checks in CI:** `scripts/browser-check.mjs` could run in GitHub Actions against `vite preview` (ubuntu runners have Chrome). Not done yet.
- **Predict the next step:** pause before a step and ask "what happens next?" (CLAUDE.md section 6). Planned for Phase 3.
- Disabled buttons keep their pressed colour with grey text (seen on the design exercise's class chips after "Check"). Disabled controls are exempt from contrast rules, but a clearer "done" look (for example a ✓ and full-contrast text) would read better. Noted 2026-10-19 during Phase 5b.
- **Shuffle answer options when shown:** in 149 of 168 quiz questions (before Phase 5c.4) the right answer is the first option, and options are shown in file order, so "always tap the first" scores well. A deterministic shuffle at render time (quiz, predictions, critique fix-first) would fix every lesson at once. Found 2026-10-19 during 5c.4; raised with the owner as a fix, not just an idea.
- **Load lessons on demand:** the lesson JSON is bundled into the main script, which passed Vite's 500 kB warning in Phase 5c (575 kB minified, 181 kB gzipped). Loading each track's lessons when it is opened would keep the first load small on mid-range phones.
