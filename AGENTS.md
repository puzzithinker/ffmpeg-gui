# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains the React renderer (`src/main.tsx`, `src/App.tsx`), UI pieces in `src/components/`, shared state in `src/store/useVideoStore.ts` (Zustand), and shared types in `src/types/` (including preload typings).
- `electron/` holds the main process (`electron/main.ts`) and `preload.ts`, which exposes `window.electronAPI` with context isolation enabled; keep renderer code free of direct Node access.
- `public/` serves static assets; `index.html` is the root template. Build output goes to `dist/`; packaged installers to `release/`. Key config: `vite.config.ts` (`@` alias), `tailwind.config.js` (primary palette), `tsconfig*.json`, `.eslintrc.js`.

## Build, Test, and Development Commands
- Install once: `npm install`.
- UI dev: `npm run dev` or `npm run dev:vite`. Full stack dev: `npm run dev:full` (Vite + Electron) or `npm run dev:electron` after Vite is running.
- Builds: `npm run build` (renderer + main), or per target (`build:renderer`, `build:main`). Packaging: `npm run build:electron` → `release/`. Static preview: `npm run preview`.
- Quality gates: `npm run lint` (ESLint) and `npm run type-check` (TS noEmit).

## Coding Style & Naming Conventions
- TypeScript with strict settings; prefer functional `.tsx` components, PascalCase components, `use*` hooks, and 2-space indentation. Use the Zustand store for shared state instead of deep props.
- Import via the `@/` alias; avoid Node APIs in the renderer—route file/process work through the preload IPC surface. Styling favors Tailwind utilities with the configured `primary` palette; extend via config rather than inline styles.

## Testing Guidelines
- No automated suite; run lint + type-check and manually cover video selection, subtitle attachment, trimming, progress events, and output creation.
- If you add tests, colocate them with source files and stub IPC/child_process work; document any new commands added to `package.json`.

## Commit & Pull Request Guidelines
- Use short, imperative subjects with scope when helpful (e.g., `Fix preload path`, `Add timeline trim guard`). Keep commits focused and include FFmpeg or IPC rationale in bodies when relevant.
- PRs: provide a summary, why the change is needed, verification steps (commands + sample files), screenshots/GIFs for UI tweaks, platform + FFmpeg version if debugging OS-specific issues, and note if packaging was run.

## Security & Configuration Tips
- Ensure `ffmpeg`/`ffprobe` are on PATH. Validate paths and extensions before spawning processes and keep IPC channels narrow.
- Extend `window.electronAPI` in `preload.ts` and type it in `src/types/electron.d.ts`. Continue using `safe-file://` for local previews; avoid loading untrusted URLs in `BrowserWindow`.
