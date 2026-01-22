# Tauri Rewrite Plan

Rust + Tauri 2.x rewrite with system ffmpeg/ffprobe and cancellation support.

## Stack & Constraints
- Backend: Rust (stable), Tauri 2.x, `tauri::api::process::Command` or `tokio::process`, `serde/serde_json`, `anyhow`.
- Frontend: React 18 + TypeScript, Vite, Tailwind, Zustand. Use `@tauri-apps/api` (`dialog`, `invoke`, `listen`, `convertFileSrc`); remove preload typings.
- System dependency: ffmpeg/ffprobe must be on PATH (no bundled sidecars).

## Bootstrap
- Scaffold a Tauri 2.x + Vite + React + TS template.
- Port existing `src/`, Tailwind config, and `@` alias into the new project.
- Update npm scripts: `tauri dev`, `tauri build`, keep lint/type-check.

## API Surface
- Commands: `select_video`, `select_subtitle`, `select_output` (dialogs), `get_duration(path)`, `process_video(params)`, `cancel_process(jobId)`.
- Events: `ffmpeg-progress` `{ jobId, seconds, percent }`, `ffmpeg-complete`, `ffmpeg-error`, `ffmpeg-cancelled`.
- Maintain a concurrent map `jobId (Uuid) -> Child` for cancellation.

## Frontend Changes
- Replace `window.electronAPI` usage with `@tauri-apps/api` calls for dialogs, invokes, events, and `convertFileSrc` for previews.
- Add `jobId` to the store; wire ProcessingPanel to start/cancel jobs and subscribe to progress/complete/error events.
- Update types to the new payloads; remove preload-specific typings.

## Rust Implementation
- `get_duration`: run `ffprobe -v quiet -print_format json -show_format <file>`, parse duration via `serde_json`.
- `process_video`: validate inputs/outputs/extensions; build args (`-ss/-to`, optional `-vf subtitles=...`, `-c:v libx264 -c:a aac`); spawn async, stream stderr, regex `time=` to compute seconds/percent, emit progress; on exit emit complete/error and clean the map.
- `cancel_process`: look up `jobId`, call `kill`, emit cancelled, remove from the map.
- On first use, check `ffmpeg -version` / `ffprobe -version`; return a friendly error if missing.

## Packaging & Config
- `tauri.conf.json`: app id/name, bundle targets, icons; default resource isolation; no ffmpeg sidecars. Codesign settings for macOS/Windows can stay commented but documented.

## Testing & QA
- Automated: TS type-check, ESLint; Rust unit tests for arg builder/progress parser; cancellation test with a mock long-running command if feasible.
- Manual (Windows + one of macOS/Linux): select/preview (via `convertFileSrc`), trim, subtitle, process, observe progress, cancel mid-run, verify missing-ffmpeg error path, ensure output creation.
- Verify `tauri dev` and `tauri build` produce working dev and installer builds.

## Success Criteria
- Core flows match the Electron app; progress and cancellation are accurate.
- Renderer stays sandboxed; all native access through Tauri commands/events.
- Clear errors when ffmpeg/ffprobe are missing; documented system dependency.
- Builds/installers generated; lint/type-check pass; no regressions in trim/subtitle/output behavior.
