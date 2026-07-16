# Cancel reliability + quality-first encode paths

**Date of fix:** 2026-07-16  
**Scope:** Tauri 2.x / Rust backend + React renderer (`ffmpeg-gui`)  
**Related prior work:** [HARD_RESET_INVESTIGATION.md](./HARD_RESET_INVESTIGATION.md), [HARD_RESET_FIX_EXPLAINED.md](./HARD_RESET_FIX_EXPLAINED.md)

This document explains two related product issues and the fixes that shipped together:

1. **Stop/Cancel left `ffmpeg.exe` running** in the background on Windows 11.
2. **Quality and CPU load:** re-encode was used too often; we now **preserve original quality via stream copy whenever possible**.

---

## Part A — Stop job leaves ffmpeg running

### Symptom

- User starts processing (trim / multi-cut / merge).
- User clicks **Cancel Processing** (or closes the app after confirming cancel).
- The UI returns to idle, but **`ffmpeg.exe` keeps running** in Task Manager, still consuming CPU and writing (or locking) the output file.

### Why this happened (root causes)

#### A1 — Cancel only worked while the Child was in the job map

`cancel_process` did:

```text
remove job from active_jobs → child.kill() → emit cancelled
```

Meanwhile `monitor_ffmpeg_progress` did:

```text
read stderr until EOF
→ remove job from active_jobs
→ child.wait()   // process may still be alive here
```

As soon as the monitor **took ownership** of the `Child` for `wait()`, cancel saw **"Job not found"** and never issued a kill. The encode continued in the background.

Even earlier in the job, cancel was only reliable if the map lookup succeeded. There was **no PID fallback**.

#### A2 — Frontend could silently no-op Cancel

```tsx
// Before
if (currentJobId) {
  await tauriAPI.cancelProcess(currentJobId)
}
// if currentJobId is null → do nothing while isProcessing === true
```

`setProcessing(true)` ran **before** `processVideo` / multi-cut / merge returned a job id.  
`setCurrentJobId` ran **after** the invoke returned.  
Cancel in that window showed a Cancel button but **did not call the backend**.

#### A3 — Kill was single-process, not process-tree

`Child::kill()` / `TerminateProcess` only targets the direct process handle. That is usually enough for a lone ffmpeg, but combined with A1/A2 the user still saw orphans. On Windows we now use **`taskkill /F /T /PID`** (tree kill) as a reliable backup.

#### A4 — Multi-step multi-cut had no job id until the first spawn

The new stream-copy multi-cut path runs several ffmpeg invocations under one job id. Without a placeholder registry entry, cancel between “Start” and the first spawn could miss the job entirely.

---

### What we did (cancel fix)

| Change | Where | Purpose |
|---|---|---|
| **`job_pids: HashMap<Uuid, u32>`** | `state.rs` | PID registry that survives after the monitor takes the `Child` for wait |
| **`cancelled_jobs: HashSet<Uuid>`** | `state.rs` | Marks deliberate cancel so the monitor does not emit “complete” after kill |
| **`kill_process_tree(pid)`** | `commands/mod.rs` | Windows: `taskkill /F /T /PID` + `CREATE_NO_WINDOW`; Unix: `kill -KILL` |
| **`cancel_process` rewrite** | `process.rs` | Mark cancelled → `start_kill` if Child present (do **not** steal Child) → always PID tree kill → emit `ffmpeg-cancelled` |
| **`cancel_all_processes`** | `process.rs` + frontend API | Kill every registered job when UI has no id yet |
| **`register_job`** | `process.rs` | Central spawn registration; if job already cancelled, kill the new process immediately |
| **Monitor reaps only** | `process.rs` | Always owns `wait`; suppresses complete/error when cancelled; cleans PID registry |
| **Exit handler** | `lib.rs` | Kills by PID tree first, then `start_kill` on remaining Children |
| **Frontend Stop never no-ops** | `ProcessingPanel.tsx`, `App.tsx` | Cancel by id, else `cancelAllProcesses`; optimistic UI clear |

#### Ownership model (after fix)

```text
spawn:
  register_job(job_id, child)  → active_jobs + job_pids

cancel:
  cancelled_jobs.insert(job_id)
  if Child still in map: start_kill (leave Child for monitor)
  kill_process_tree(pid)       // always, if pid known
  emit ffmpeg-cancelled

monitor:
  read stderr (stop early if cancelled)
  remove Child, wait() to reap
  if cancelled → no complete/error event
  remove job_pids entry
```

#### Frontend Stop path

```text
Cancel clicked
  → jobId = store.currentJobId
  → if jobId: cancel_process(jobId)
  → else: cancel_all_processes()
  → clear isProcessing / progress / jobId
  → if that fails: still try cancel_all_processes()
```

### How to verify cancel on Windows 11

1. Start a long re-encode (e.g. burn subtitles or multi-cut with crop).
2. Click **Cancel Processing**.
3. Within ~1 second, Task Manager should show **no `ffmpeg.exe`**.
4. Click Cancel immediately after Start (before progress appears) — same expectation.
5. Close the app mid-job with “Cancel and close” — same expectation.

---

## Part B — Quality-first encode (preserve original quality)

### Symptom / product goal

Users want **original quality whenever possible**.  
Previously:

| Mode | Old behavior | Quality impact |
|---|---|---|
| Trim (no filters) | Stream copy | Good |
| Multi-cut | Always `filter_complex` + libx264 | Always re-encodes |
| Merge | Always scale to 1080p @ 30fps + libx264 | Always re-encodes, often worse |

Re-encode also drives high multi-core CPU / package voltage spikes on Windows 11 (expected under libx264, but often unnecessary).

### Policy (quality-first)

| Situation | Behavior |
|---|---|
| Trim, no crop / brightness / burn-in | **Stream copy** (`-c copy`) |
| Trim + filters | Re-encode required (CRF default 18) |
| Multi-cut, no crop | **Segment stream-copy + concat demuxer** (keyframe-aligned) |
| Multi-cut + crop | Frame-accurate re-encode |
| Merge, compatible streams | **Concat demuxer + `-c copy`** |
| Merge, mismatched streams | Re-encode fallback (prefer first file’s resolution; high CRF default) |

**Not changed by default:** we do **not** force `veryfast` presets or high CRF to “save CPU.” Quality preservation comes from **avoiding re-encode**, not from lowering encode settings.

### What we did (quality paths)

#### B1 — Merge stream-copy when compatible

**Files:** `video.rs` (`probe_stream_profile`, `profiles_compatible_for_copy`), `merge.rs` (`merge_videos`)

1. ffprobe each input for video codec, resolution, pix_fmt, frame rate, audio codec/rate/channels.
2. If all profiles match → concat demuxer + `-c copy`.
3. Else → re-encode with scale/pad to first file’s size (or 1920×1080 fallback), CRF from UI (default 18). Forced `fps=30` removed when re-encoding.

#### B2 — Multi-cut stream-copy when no crop

**Files:** `merge.rs` (`multi_cut_stream_copy`, `prefer_copy`)

1. For each segment: `ffmpeg -ss START -i INPUT -t DUR -c copy -avoid_negative_ts make_zero` → temp file.
2. Concat demuxer list → `-c copy` final output.
3. Temp work dir cleaned after the pipeline.
4. Same cancel/PID machinery; intermediate spawns use `emit_lifecycle: false` so only the outer driver emits complete/error.

**Tradeoff (documented in UI):** stream-copy cuts are **keyframe-aligned**, not frame-accurate. Crop forces re-encode for accuracy.

#### B3 — Brightness unit fix

UI slider is −100…100 (%). FFmpeg `eq=brightness` expects roughly −1.0…1.0.  
`normalize_brightness()` maps percent → unit range (values already in −1…1 are left as-is).

#### B4 — Smaller load mitigations (not quality-reducing)

- Progress emission hard-capped at ~5 Hz (200 ms interval).
- Preview `<video>` pauses and clears `src` while processing so decode + encode do not stack.
- ffmpeg stdout set to `null` (progress is on stderr) to avoid rare full-pipe stalls.

---

## Files touched

| Area | Files |
|---|---|
| Job state | `src-tauri/src/state.rs` |
| Kill helper | `src-tauri/src/commands/mod.rs` |
| Process / cancel / monitor | `src-tauri/src/commands/process.rs` |
| Merge / multi-cut | `src-tauri/src/commands/merge.rs` |
| Probe / compatibility | `src-tauri/src/commands/video.rs` |
| Exit cleanup | `src-tauri/src/lib.rs` |
| Frontend cancel + UI copy | `src/components/ProcessingPanel.tsx`, `src/App.tsx` |
| Preview unload | `src/components/VideoPreview.tsx` |
| API / types / tests | `src/lib/tauri-api.ts`, `src/types/index.ts`, tests/mocks |

---

## Verification

```bash
cd src-tauri && cargo test --lib
# expected: 43 passed, 1 ignored (regex cache regression, run with --ignored)

npm run type-check
npm run test:run -- src/components/ProcessingPanel.test.tsx src/lib/tauri-api.test.ts
```

Manual (Windows 11):

| Check | Expected |
|---|---|
| Cancel mid re-encode | No residual `ffmpeg.exe` |
| Cancel before first progress | No residual `ffmpeg.exe` |
| Merge two identical clips | Fast; stream copy; original quality |
| Multi-cut, no crop | Stream copy; keyframe cuts |
| Multi-cut + crop | Re-encode path |
| Trim + brightness +50 | `eq=brightness=0.5` (not 50) |

---

## What is intentionally still out of scope

- Hardware encoders (NVENC / QSV / AMF) as a user option.
- Default thread caps / BelowNormal process priority (optional later; must not reduce quality defaults).
- Frame-accurate multi-cut **without** re-encode (impossible with pure stream copy).
- Deleting partial output files on cancel (nice-to-have).

---

## Success criteria

1. **Stop always terminates ffmpeg** — no orphan background encode after Cancel or cancel-on-close.
2. **Original quality is the default** whenever stream copy is safe (trim no-filters, multi-cut no-crop, merge-compatible).
3. Re-encode remains available and quality-oriented (CRF 18 default) when filters or incompatible inputs require it.
4. Prior hard-reset hot-path mitigations (regex cache, log level, progress throttle, `CREATE_NO_WINDOW`, exit kill) remain intact.
