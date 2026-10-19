# Changelog

## Phase 0, Foundations (in progress)

- 0.1 Tooling: TypeScript 6.0.3, Vite 8.3.4, Vitest 5.0.5, ESLint 10.13.0 with typescript-eslint 8.71.2. All pinned exactly. Scripts: `dev`, `build`, `typecheck`, `lint`, `test`, `check`.
- 0.2 Lesson schema (`src/lesson/schema.ts`) and validator (`src/lesson/validate.ts`). The validator reports every problem with its path, rejects unknown fields, and checks that node references, edges, step hops and quiz answers are consistent. First lesson data: `lessons/hello.json` (sourced from MDN).
