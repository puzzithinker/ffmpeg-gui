# Architecture map & refactor opportunities

**Date:** 2026-07-17  
**Scope:** Shipped tree under `src/` (React) and `src-tauri/src/` (Tauri/Rust).  
**Goal:** Analysis only — inventory structure and remaining structural debt for a later implementer.  
**Baseline health (2026-07-17):** `cargo test --lib` → 43 passed, 1 ignored; `npm run type-check` → clean. (Frontend suite still has pre-existing Timeline test failures unrelated to this write-up.)

---

## 1. Architecture map

### 1.1 Runtime shape

```
┌─────────────────────────────────────────────────────────────┐
│  React renderer (Vite)                                        │
│  src/main.tsx → App.tsx → VideoProcessor + panels             │
│  Zustand store (useVideoStore)  ·  tauriAPI  ·  logger        │
└───────────────────────────┬─────────────────────────────────┘
                            │ invoke / listen / convertFileSrc
                            │ plugin-dialog (open/save)
┌───────────────────────────▼─────────────────────────────────┐
│  Tauri 2 main (Rust)                                          │
│  src-tauri/src/main.rs → lib.rs::run()                        │
│  AppState (jobs / pids / cancelled)                           │
│  commands/*  ──spawn──►  ffmpeg / ffprobe (PATH)              │
│  Events: ffmpeg-progress | complete | error | cancelled       │
└─────────────────────────────────────────────────────────────┘
```

System dependency: **ffmpeg + ffprobe on PATH** (not bundled). Checked at startup via `check_ffmpeg_availability`.

### 1.2 Backend modules (`src-tauri/src/`)

| Module | Role |
|---|---|
| `main.rs` | Entry; `windows_subsystem = "windows"` in release |
| `lib.rs` | Builder, invoke_handler, log plugin (`Info`), **exit kill** of orphan jobs |
| `state.rs` | `ProcessJob` + `AppState`: `active_jobs`, `job_pids`, `cancelled_jobs` |
| `commands/mod.rs` | `apply_no_window`, `kill_process_tree` (Windows `taskkill /T`) |
| `commands/process.rs` | Trim export: `process_video`, arg builder, progress monitor, cancel, brightness normalize (~1.3k LOC incl. tests) |
| `commands/merge.rs` | `multi_cut_merge` (copy pipeline vs reencode), `merge_videos` (probe + copy-or-reencode) |
| `commands/video.rs` | `get_duration`, `probe_stream_profile`, `profiles_compatible_for_copy`, ffmpeg availability |
| `commands/subtitle.rs` | Read/write SRT; temp subtitle for dirty editor |
| `commands/logging.rs` | Per-call append to frontend log file |
| `commands/dialog.rs` | **Registered but unused by renderer** — blocking file pickers |

**Registered IPC commands** (from `lib.rs`):  
`select_*_file` (dead from FE), `get_duration`, `check_ffmpeg_availability`, `process_video`, `cancel_process`, `cancel_all_processes`, `write_frontend_log`, `get_log_file_path`, `multi_cut_merge`, `merge_videos`, `read/write_subtitle_file`, `write_temp_subtitle`.

**Events emitted:** `ffmpeg-progress`, `ffmpeg-complete`, `ffmpeg-error`, `ffmpeg-cancelled`.

### 1.3 Frontend modules (`src/`)

| Module | Role |
|---|---|
| `main.tsx` / `App.tsx` | Boot, FFmpeg gate, **close-while-processing** cancel |
| `components/VideoProcessor.tsx` | Mode layout shell (trim / multi-cut / merge) |
| `ModeSelector.tsx` | Mode switch |
| `FileSelector.tsx` | Video + subtitle pick (via `tauriAPI` dialog plugin) |
| `VideoPreview.tsx` | Local preview via `convertFileSrc`; pauses while processing |
| `Timeline.tsx` / `TimestampInput.tsx` | Trim range UI |
| `CropSettings.tsx` | Crop box |
| `SubtitleSettings.tsx` / `SubtitleEditor.tsx` | Style + bilingual SRT edit |
| `SegmentEditor.tsx` | Multi-cut segment list |
| `MergeFileList.tsx` | Multi-file merge list |
| `ProcessingPanel.tsx` | Output path, quality UI, start/cancel, progress listeners (~544 LOC) |
| `ErrorAlert.tsx` / `LogFileInfo.tsx` | Error + log path |
| `store/useVideoStore.ts` | Single Zustand store: files, trim, crop, segments, merge list, subtitle edit, job state |
| `lib/tauri-api.ts` | camelCase ↔ snake_case invoke bridge + event listen |
| `lib/logger.ts` | IPC to `write_frontend_log` |
| `utils/srtParser.ts` | SRT parse/serialize (well tested) |
| `utils/timeFormatting.ts` / `pathParsing.ts` | Small pure helpers |
| `types/index.ts` | Shared TS domain types |

### 1.4 User flows → real modules

#### Trim (+ optional subtitles / crop / brightness)

1. `FileSelector` → `tauriAPI.selectVideoFile` (plugin-dialog) → `getVideoDuration` → `get_duration`  
2. Optional: subtitle file → `SubtitleEditor` / `read_subtitle_file` → store `subtitleEdit`  
3. `Timeline` / `CropSettings` / brightness on `VideoPreview` update store  
4. `ProcessingPanel` Start → maybe `writeTempSubtitle` if dirty → `process_video`  
5. Backend `build_ffmpeg_args`: **copy** if no filters; else libx264 + filters  
6. `monitor_ffmpeg_progress` → events → store progress; cancel via `cancel_process` / `cancel_all_processes`

#### Multi-cut & merge

1. Segments via `SegmentEditor` or files via `MergeFileList`  
2. `multi_cut_merge`: no crop → stream-copy segments + concat (`merge.rs`); crop → filter reencode  
3. `merge_videos`: probe profiles (`video.rs`) → copy if compatible else reencode  

#### Cancel

1. UI Stop → `cancelProcess` or `cancelAllProcesses`  
2. Backend: mark `cancelled_jobs`, `start_kill` if Child present, **`kill_process_tree(pid)`**, emit `ffmpeg-cancelled`  
3. Monitor reaps Child; suppresses complete/error  
4. App close path mirrors cancel (`App.tsx` + exit handler in `lib.rs`)

#### Subtitle edit

1. Load SRT → `read_subtitle_file` → `parseSrt` → store  
2. Edit in `SubtitleEditor`  
3. Export → `write_subtitle_file`; burn path uses dirty temp via `write_temp_subtitle`

### 1.5 Already shipped (do **not** re-list as open refactors)

Documented in `CANCEL_AND_QUALITY_FIX.md`, `HARD_RESET_*.md`:

| Area | Status |
|---|---|
| Regex compile-per-stderr-line | Fixed (`LazyLock` in `process.rs`) |
| Debug log flood / progress event flood | Fixed (Info level, ≤5 Hz throttle) |
| `CREATE_NO_WINDOW` on spawns | Fixed (`apply_no_window`) |
| Cancel leaving `ffmpeg.exe` alive | Fixed (PID registry + tree kill + cancel-all) |
| Merge OOM via concat **filter** | Fixed (concat **demuxer**) |
| Quality-first stream copy (multi-cut no crop, merge match) | Fixed |
| Brightness −100…100 → eq −1…1 | Fixed (`normalize_brightness`) |
| Exit orphan kill | Fixed (`lib.rs` + PID tree) |
| Preview unload during export | Fixed (`VideoPreview`) |

---

## 2. Refactor opportunities (remaining debt)

Each item: problem in **current** code, benefit, risk/blast radius, priority.

### R1 — Split `process.rs` god-module (P1)

**Problem:** `src-tauri/src/commands/process.rs` is ~1374 lines mixing param types, pure arg builders, spawn/register, stderr monitor, cancel, path escaping, and a large unit-test module. Hard to navigate; merge already depends on several of its public helpers (`register_job`, `run_registered_ffmpeg`, `monitor_ffmpeg_progress`, payloads).

**Benefit:** Smaller units (`args.rs`, `monitor.rs`, `cancel.rs`, `types.rs`) with clearer ownership; faster reviews; tests colocated with pure logic.

**Risk / blast radius:** Medium — pure move/split with `pub use` re-exports keeps merge/lib stable. Must not regress cancel/monitor ownership rules.

**Priority:** **P1**

---

### R2 — Delete or un-register dead Rust dialog commands (P1)

**Problem:** `commands/dialog.rs` implements `select_video_file` / `select_subtitle_file` / `select_output_file` with `blocking_pick_file` inside `async fn`. They are registered in `lib.rs` but the renderer **never** invokes them — `src/lib/tauri-api.ts` uses `@tauri-apps/plugin-dialog` `open`/`save` instead. Dead surface + risk of someone calling the blocking path on the async runtime later.

**Benefit:** Smaller IPC surface, no dual dialog stories, removes blocking-async footgun.

**Risk / blast radius:** Low — confirm no other callers (`grep` shows only registration). Drop from `generate_handler!` and delete file (or keep thin wrappers that delegate to plugin if desired).

**Priority:** **P1**

---

### R3 — Shared output/input validation helper (P2)

**Problem:** Extension allow-lists and “file exists” checks are copy-pasted:

- `process.rs` `validate_inputs` (`valid_exts = mp4,avi,mov,mkv,webm`)
- `merge.rs` `multi_cut_merge` and `merge_videos` (same list, same pattern)

**Benefit:** One place to add formats (e.g. `m4v`) or path policy; fewer inconsistent error strings.

**Risk / blast radius:** Low — extract pure `validate_output_path` / `assert_exists` in a small `validation.rs`.

**Priority:** **P2**

---

### R4 — Zustand selector subscriptions (P1)

**Problem:** Components call `useVideoStore()` and destructure large slices (e.g. `ProcessingPanel.tsx` pulls mode, files, trim, crop, subtitle edit, segments, merge list, quality, progress). Any `setProcessingProgress` tick re-renders the whole export panel and any other broad subscribers. Same pattern in `SubtitleEditor`, `FileSelector`, `VideoProcessor`.

**Benefit:** Progress updates only re-render progress chrome; typing in subtitle editor does not refresh unrelated panels. Aligns with hard-reset lesson that renderer work is not free (WebView2).

**Risk / blast radius:** Medium-low — mechanical `useVideoStore(s => s.x)` / `shallow` compare; easy to miss a field and get stale UI (fix coverage needed for panel).

**Priority:** **P1**

---

### R5 — Stabilize IPC naming (serde `rename_all`) and drop dual maps (P2)

**Problem:** Every invoke in `tauri-api.ts` hand-maps camelCase → snake_case (`input_file`, `start_time`, …). Event payloads normalize `jobId` / `job_id` / `jobID` via `normalizeJobId`. Backend structs use snake_case fields; FE types mirror domain in camelCase separately (`types/index.ts` vs `ProcessVideoParams` in tauri-api).

**Benefit:** Single rename policy on Rust (`#[serde(rename_all = "camelCase")]`) or TS shared DTOs; less drift when adding params (`prefer_copy` already required a dual edit).

**Risk / blast radius:** Medium — must update all invokes + tests together; a mismatch silently breaks production jobs.

**Priority:** **P2**

---

### R6 — Fix `App.tsx` close-handler subscription churn (P1)

**Problem:** `onCloseRequested` is registered in a `useEffect` that depends on `[isProcessing, currentJobId, ...]`. Every job start/end **re-subscribes** the close listener. Closure captures can race; unnecessary IPC/log noise.

**Benefit:** Single stable listener; read latest job state via `useVideoStore.getState()` / refs (same pattern already used in cancel).

**Risk / blast radius:** Low–medium — close-while-processing is a safety path; needs manual check.

**Priority:** **P1**

---

### R7 — Frontend logger + `write_frontend_log` efficiency (P2)

**Problem:** `logging.rs` opens/appends/closes the log file **per message**. `logger.ts` still called from `FileSelector`, `VideoPreview` (including `onLoadStart` / `onCanPlay`), and `App` close path. Progress logging was removed (good); residual chatty lifecycle logs remain.

**Benefit:** Less IPC + disk on Windows; simpler diagnostics via `tauri-plugin-log` levels or a buffered writer.

**Risk / blast radius:** Low — change logging path only; keep `get_log_file_path` for `LogFileInfo`.

**Priority:** **P2**

---

### R8 — Security defaults: CSP + asset scope (P0 for security posture)

**Problem:** `tauri.conf.json` sets `"csp": null` and `assetProtocol.scope: ["**"]`. Any local path is potentially exposable via `convertFileSrc` once known. Capabilities grant dialog open/save + default core.

**Benefit:** Least-privilege media access; reduces accidental exposure of unrelated filesystem paths in the WebView.

**Risk / blast radius:** Medium — too-tight scope breaks preview for user-selected videos; need scope update on file pick or use scoped URLs carefully.

**Priority:** **P0** (security) / implement carefully after product decision

---

### R9 — Virtualize `SubtitleEditor` list (P2)

**Problem:** `SubtitleEditor.tsx` maps **all** `subtitleEdit.entries` into DOM (`max-h-[500px] overflow-y-auto`). Large bilingual SRTs (thousands of cues) re-render the full list on each keystroke via store updates.

**Benefit:** Editable long scripts without UI jank.

**Risk / blast radius:** Medium — focus/scroll-to-new-entry behavior must preserve; pure UI.

**Priority:** **P2**

---

### R10 — Mode-aware `hasFilters` / quality UI logic (P1)

**Problem:** In `ProcessingPanel.tsx`:

```ts
const hasFilters = mode === 'trim'
  ? cropSettings.enabled || brightness !== 0 || !!subtitleFile
  : true   // multi-cut & merge always "hasFilters"
```

That forces quality mode toward reencode for multi-cut/merge in the UI even when backend stream-copies. Copy/reencode radios and CRF visibility are mode-confused; summary text papers over backend behavior.

**Benefit:** UI matches quality-first backend (copy when possible); users understand when CRF applies.

**Risk / blast radius:** Low–medium — UI-only if backend already correct; update tests in `ProcessingPanel.test.tsx`.

**Priority:** **P1**

---

### R11 — Deduplicate cancel-flag helpers & job lifecycle (P2)

**Problem:** `is_job_cancelled` lives in `process.rs`; `is_cancelled` is reimplemented in `merge.rs`. Multi-cut stream-copy pipeline orchestrates register/monitor/emit complete manually while single-shot jobs use `monitor_ffmpeg_progress(..., emit_lifecycle: true)`. Job lifecycle knowledge is split across two large files.

**Benefit:** One `JobRegistry` API: `register`, `cancel`, `is_cancelled`, `run_ffmpeg`, `finish`. Fewer orphan-edge bugs when adding a fourth job type.

**Risk / blast radius:** High if rewritten aggressively — cancel is security/UX critical. Prefer incremental extraction after R1.

**Priority:** **P2** (after R1)

---

### R12 — Docs / agent guidelines drift (P2)

**Problem:** `AGENTS.md` still describes **Electron** (`electron/main.ts`, `preload`, `window.electronAPI`, `npm run dev:full`). Reality is Tauri (`npm run dev` → `tauri dev`). `README` MSRV note may lag `Cargo.toml` (1.80). Contributors and agents following AGENTS.md will take wrong paths.

**Benefit:** Correct onboarding; fewer invalid assumptions in tool sessions.

**Risk / blast radius:** None for runtime — docs only.

**Priority:** **P2**

---

### R13 — Use `pathParsing.extractFileName` consistently (P3 / nits)

**Problem:** `utils/pathParsing.ts` exists and is unit-tested, but `FileSelector` / `ProcessingPanel` still inline `path.split(/[/\\]/).pop()`.

**Benefit:** Tiny DRY; consistent Windows path handling.

**Risk / blast radius:** Trivial.

**Priority:** **P3** (only if touching those files)

---

### R14 — Optional later product/tech (not pure refactors)

Listed so they are not confused with structural debt:

- HW encode (NVENC/QSV/AMF) option  
- Thread/priority caps for laptop thermals without lowering quality defaults  
- Delete partial output on cancel  
- Timeline document-level mouse capture for drag (UX)  
- Dead field `ProcessJob.job_id` (warns as unread) — drop or use  

---

## 3. Suggested implementation order (for a later PR series)

| Order | Item | Status |
|---|---|---|
| 1 | R2 dead dialog commands | **Done** (2026-07-17) — `dialog.rs` removed; FE uses plugin-dialog |
| 2 | R6 App close listener | **Done** — mount-once + `getState()` |
| 3 | R10 hasFilters / quality UI | **Done** — `src/utils/exportQuality.ts` |
| 4 | R4 Zustand selectors | **Done** — ProcessingPanel + App selectors |
| 5 | R1 split process.rs | **Done** — `commands/process/{types,args,progress,monitor,cancel,command}.rs` |
| 6 | R8 asset/CSP hardening | **Done** — CSP set; asset scope limited to user dirs (`$HOME/**`, …) not `**` |
| 7 | R3, R5, R7, R9, R11, R12 | Remaining

---

## 4. Test / tooling notes (debt only)

| Observation | Location |
|---|---|
| Rust unit tests strong for pure builders/probe | `process.rs`, `video.rs`, `merge` list helper |
| Cancel/kill path has **no** automated process-level test in-tree | Manual Windows verification documented in `CANCEL_AND_QUALITY_FIX.md` |
| Frontend: good store/SRT tests; Timeline tests currently fail (stale expectations vs `TimestampInput`) | `Timeline.test.tsx` |
| `AGENTS.md` claims “no automated suite” but vitest + cargo tests exist | Docs debt (R12) |

---

## 5. How to use this document

- **Do not** re-open work listed in §1.5 unless a regression is proven.  
- Pick items from §2 by priority and risk; each cites real paths.  
- After implementing, update this file’s §1.5 / strike completed R# entries.  
- Companion deep-dives: `CANCEL_AND_QUALITY_FIX.md`, `HARD_RESET_FIX_EXPLAINED.md`.
