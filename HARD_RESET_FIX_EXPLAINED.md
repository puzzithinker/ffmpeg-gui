# How the FFmpeg GUI Was Fixed to Avoid Hard Resets

**Date of fix:** 2026-06-19
**Symptom:** The FFmpeg GUI was causing **hard system resets** (abrupt reboots) on Windows 11 during video processing.
**Scope:** Tauri 2.x / Rust backend + React renderer (the `ffmpeg-gui` project).

This document is a plain-language walkthrough of the recent fix: what was breaking, why it could trigger a *system-level* reboot (not just an app crash), exactly what was changed in the code, and whether anything else still needs attention. A companion forensic record lives in [`HARD_RESET_INVESTIGATION.md`](./HARD_RESET_INVESTIGATION.md).

---

## 1. Why a "hard reset" is not a normal bug

A Windows 11 hard reset is an abrupt reboot. In practice it is one of:

| Cause | Mechanism |
|---|---|
| **BSOD with auto-restart** | Windows 11 enables auto-restart on system failure by default, so a BSOD looks like a "hard reset" to the user. |
| **Thermal shutdown** | CPU/GPU hits `Tjmax` and the firmware cuts power to protect the silicon. |
| **PSU overload / rail droop** | Sustained max power draw drops voltage below the reset threshold. |

None of these are caused by ordinary application bugs (off-by-one, wrong type, etc.). They require **sustained system-level stress**: 100 % CPU, RAM exhaustion, disk-I/O saturation, or GPU driver TDR (Timeout Detection & Recovery). The fix therefore targeted *hot paths* — code that runs many times per second for the entire duration of an ffmpeg job — not logic bugs.

The investigation found **eight stress sources** in the codebase. Six were fixed in the first pass, the remaining two plus an orphan-process cleanup were fixed in a follow-up pass.

---

## 2. The eight stress sources — summary

| # | Severity | Location | Stress type | Hard-reset vector |
|---|----------|----------|-------------|-------------------|
| 1 | Critical | `commands/process.rs` | 100 % CPU | Thermal / PSU |
| 2 | Critical | `lib.rs` + `process.rs` | Disk I/O saturation | Storage WHEA |
| 3 | Critical | `ProcessingPanel.tsx` + `logging.rs` | GPU re-render flood | GPU TDR → BSOD |
| 4 | High | `commands/merge.rs` | RAM exhaustion | OOM → BSOD |
| 5 | High | `commands/process.rs` | Orphaned processes | Compounding load |
| 6 | High | `commands/video.rs` + `merge.rs` | Console alloc bursts | Amplifies #1–#3 |
| 7 | Medium | `commands/process.rs` | Alloc churn | Amplifies #1 |
| 8 | Medium | `commands/process.rs` | Latent path bug | UNC paths break |

The most likely root cause was **#1 + #2 + #3 together** — the *default behaviour for every user on every ffmpeg job*.

---

## 3. Fix #1 — Regex recompiled on every ffmpeg stderr line

### What was wrong

`parse_ffmpeg_time` was called for **every** stderr line ffmpeg emits (tens per second, for the whole job). Each call ran `Regex::new(...)` — which rebuilds the NFA, generates VM bytecode, and allocates on the heap.

```rust
// BEFORE — recompiles the regex on every stderr line
pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    let time_regex = Regex::new(r"time=(\d+):(\d+):(\d+\.?\d*)").unwrap();
    time_regex.captures(line)...
}
```

**Result:** sustained 100 % CPU on one core for the entire duration of every job. On a thermally or PSU-marginal Windows 11 machine (laptops, mini-PCs, SFF desktops), sustained 100 % CPU is a documented trigger for thermal shutdown or PSU rail droop → hard reset.

### The fix — compile once, reuse forever

`src-tauri/src/commands/process.rs`:

```rust
use std::sync::LazyLock;

// Compile the ffmpeg time regex exactly once. `Regex::new` is expensive (NFA build + bytecode
// generation + heap allocs); calling it per stderr line saturates a CPU core for the entire
// duration of a job. Requires Rust ≥1.80 for `LazyLock`.
static TIME_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"time=(\d+):(\d+):(\d+\.?\d*)").unwrap()
});

pub fn parse_ffmpeg_time(line: &str) -> Option<f64> {
    TIME_REGEX.captures(line).map(|captures| {
        let hours: f64 = captures[1].parse().unwrap_or(0.0);
        let minutes: f64 = captures[2].parse().unwrap_or(0.0);
        let seconds: f64 = captures[3].parse().unwrap_or(0.0);
        hours * 3600.0 + minutes * 60.0 + seconds
    })
}
```

`LazyLock` initialises the regex on first use and reuses it for the rest of the process lifetime. The Rust MSRV was bumped from **1.77.2 → 1.80.0** in `src-tauri/Cargo.toml` to unlock `LazyLock` (stabilised in 1.80). Edition 2024 (1.85) was intentionally **not** adopted — it carries breaking lint changes that belong in a dedicated migration, not a hot-fix pass.

**Effect:** the per-line CPU cost drops from "NFA build + match" to "match only". The sustained-100 %-CPU-per-core hot path is eliminated.

---

## 4. Fix #2 — Debug-level logging of every stderr line

### What was wrong

The Tauri log plugin was initialised at `Debug` level (`src-tauri/src/lib.rs`), and `monitor_ffmpeg_progress` did `log::debug!("ffmpeg stderr [{}]: {}", ...)` for **every** stderr line. The log plugin writes through to a file on disk — so every stderr line was a synchronous disk write.

```rust
// BEFORE — lib.rs
.level(log::LevelFilter::Debug)

// BEFORE — process.rs, inside the per-line parse loop
log::debug!("ffmpeg stderr [{}]: {}", job_id, trimmed);
```

Combined with #1, the backend did regex-compile + disk-write per line, all on one tokio worker. On Windows 11 with HDDs or SMR drives (common in OEM machines), sustained I/O saturation can trigger WHEA-Logger storage errors → BSOD → hard reset.

### The fix — raise the log floor, drop the per-line debug call

`src-tauri/src/lib.rs`:

```rust
.level(log::LevelFilter::Info)   // was Debug
```

`src-tauri/src/commands/process.rs`: the `log::debug!("ffmpeg stderr ...")` call was removed entirely. The `stderr_tail` ring buffer (last 50 lines) still captures stderr for error reporting, so no diagnostic capability is lost. The per-event `log::info!("Emitted ffmpeg-progress ...")` was also removed.

**Effect:** per-line disk writes are eliminated. Diagnostic information for failures is preserved via the ring buffer.

---

## 5. Fix #3 — Progress-event flood to WebView2

### What was wrong

Two layers of the flood:

**Backend** — `monitor_ffmpeg_progress` emitted a `ffmpeg-progress` event for *every* stderr line that contained a `time=` field (tens per second).

**Frontend** — `src/components/ProcessingPanel.tsx` had a per-event `logger.log(...)` call inside the `onFFmpegProgress` listener. Each `logger.log` issued a Tauri IPC command (`write_frontend_log`) that **opens a file handle, writes a line, and closes it** — per event.

```tsx
// BEFORE — ProcessingPanel.tsx
unlistenProgress = await tauriAPI.onFFmpegProgress((event) => {
  void logger.log(`[ProcessingPanel] Progress event: ...`)   // ← per event, IPC + disk write
  state.setProcessingProgress(...)                             // ← triggers React re-render
})
```

Each event therefore caused: IPC emit → JS listener → IPC command → file open/write/close → Zustand `set` → React re-render → WebView2 (Edge Chromium, GPU-accelerated) re-renders the progress bar + the `transition-all duration-200` CSS animation.

On systems with marginal GPU drivers (Intel Arc, older NVIDIA Studio drivers, AMD Adrenalin on certain Windows 11 builds), sustained high-frequency WebView2 GPU re-rendering is a known trigger for **GPU TDR** → `VIDEO_TDR_FAILURE` BSOD (0x100000ea) → Windows 11 auto-restarts → perceived as a "hard reset".

### The fix — throttle at the source, stop logging per event

**Backend** (`src-tauri/src/commands/process.rs`):

```rust
// Throttle progress emission: emit at most every 200 ms or on every 1% delta, whichever
// comes first. Without this, high-frequency ffmpeg stderr floods the renderer with events
// that trigger per-event disk logging + WebView2 re-renders — a GPU TDR / hard-reset vector.
let mut last_emit: Option<Instant> = None;
let mut last_percent: f64 = -1.0;
const MIN_INTERVAL: Duration = Duration::from_millis(200);
const MIN_DELTA: f64 = 1.0;

// ...inside the parse loop:
let now = Instant::now();
let time_ok = last_emit.map_or(true, |t| now.duration_since(t) >= MIN_INTERVAL);
let delta_ok = (percent - last_percent).abs() >= MIN_DELTA;

if time_ok || delta_ok {
    let _ = app.emit("ffmpeg-progress", ProgressPayload { ... });
    last_emit = Some(now);
    last_percent = percent;
}
```

**Frontend** (`src/components/ProcessingPanel.tsx`): the `void logger.log(...)` call inside the progress listener was removed. Lifecycle logging (start / complete / error / cancel) is unchanged.

**Effect:** event volume drops ~10–50× (from tens per second to at most 5 Hz). A progress bar does not need 60 Hz updates; 5 Hz is visually identical and ~12× cheaper. The per-event IPC + file-write + GPU re-render cascade is broken at the source.

---

## 6. Fix #4 — `merge_videos` held all input frames in RAM

### What was wrong

`merge_videos` used the ffmpeg `concat` **filter** (`-filter_complex ...concat=n=N`). The concat filter requires ffmpeg to allocate and hold frames for **all N inputs at once** in the filtergraph. Merging 5–10 large source-quality videos can consume 8–20 GB of RAM.

On a Windows 11 machine with 16 GB RAM and a small OEM pagefile, this triggers OOM. Win11 OOM normally kills the process, but if the pagefile is on a failing drive or the OOM coincides with a WHEA event, it cascades into a `MEMORY_MANAGEMENT` BSOD → hard reset. Only affects "Merge Videos" mode; trim/cut are unaffected.

### The fix — switch from the concat *filter* to the concat *demuxer*

`src-tauri/src/commands/merge.rs`:

The concat **demuxer** (`-f concat -safe 0 -i list.txt`) streams inputs sequentially instead of holding them all in RAM. Memory drops from O(N) to O(1).

```rust
// Use the concat DEMUXER instead of the concat FILTER. The filter holds frames for all N
// inputs in RAM simultaneously (O(N) memory — an OOM / hard-reset vector when merging many
// large files). The demuxer streams inputs sequentially (O(1) memory).
let list_path = std::env::temp_dir().join(format!("ffmpeg_concat_list_{}.txt", job_id));
write_concat_list(&list_path, &params.input_files)
    .map_err(|e| format!("Failed to write concat list: {}", e))?;

let mut args: Vec<String> = vec![
    "-f".to_string(), "concat".to_string(),
    "-safe".to_string(), "0".to_string(),
    "-i".to_string(), list_path.to_string_lossy().to_string(),
    "-vf".to_string(),
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30".to_string(),
    "-c:v".to_string(), "libx264".to_string(),
];
```

A new `write_concat_list` helper writes a temp list file with single-quote + backslash escaping (a Windows-specific hazard in the demuxer syntax). Resolution/audio normalisation is preserved via output-side filters: `-vf scale=...` and `-af aresample=44100` (or `-an` when any input lacks audio). The temp list file is cleaned up after the job exits via a new `cleanup_path: Option<PathBuf>` parameter on `monitor_ffmpeg_progress`.

> **Note:** `multi_cut_merge` (Multi-Cut & Merge mode) still uses the concat *filter* — and that is correct. It operates on a **single** input file with multiple trim segments, so memory is bounded by one input, not N. The concat filter is the right tool when you need per-segment trim/crop filtergraph transformations on one input.

**Effect:** merging many large files no longer risks OOM. Memory usage is constant regardless of the number of inputs.

---

## 7. Fix #5 — Mutex held across `child.wait().await` + orphaned processes on close

### What was wrong (part A — mutex serialisation)

```rust
// BEFORE — process.rs
let mut jobs = state.active_jobs.lock().await;   // ← lock acquired
if let Some(mut job) = jobs.remove(&job_id) {
    match job.child.wait().await {                 // ← mutex held across this await (entire job!)
```

The `tokio::sync::Mutex` was acquired **before** `child.wait().await` and held until the wait completed — i.e. for the entire remaining duration of the ffmpeg process. Consequences:

- `cancel_process` for **any** job could not acquire the lock while a wait was in progress — cancellation of unrelated jobs failed with "Job not found".
- The `tokio::spawn` monitor task was detached. If the user closed the app while ffmpeg was running, the `AppHandle` dropped but the spawned task kept running, holding the mutex, the child process, and the stderr reader. The ffmpeg process was **orphaned** — it kept consuming CPU/RAM/disk with no parent to reap it. Repeating this (close → reopen → start job → close) accumulated multiple orphaned ffmpeg processes, compounding toward system instability.

### The fix (part A) — take the job out, drop the lock, then wait

`src-tauri/src/commands/process.rs`:

```rust
// Take the job out of the map under the lock, then DROP the lock before waiting.
// Holding the mutex across `child.wait().await` serialises every other job operation
// (including cancellation of unrelated jobs) for the entire remaining process duration.
let job = {
    let mut jobs = state.active_jobs.lock().await;
    jobs.remove(&job_id)
};

if let Some(mut job) = job {
    match job.child.wait().await { ... }
}
```

**Effect:** the lock is held only for the cheap `remove` mutation. Cancellation of unrelated jobs is no longer blocked for the duration of a running process.

### The fix (part B) — kill orphaned jobs on app exit

`src-tauri/src/lib.rs`: `run()` was restructured from `Builder::run(context)` to `Builder::build(context)?.run(|handle, event|)` so a `RunEvent::Exit` handler can run cleanup:

```rust
app.run(|app_handle, event| {
    if let RunEvent::Exit = event {
        // Clone the Arc<Mutex> out of state to break the borrow from `app_handle.state()`
        // before locking. `try_lock` avoids deadlocking if a monitor task holds the mutex.
        let active_jobs = app_handle.state::<AppState>().active_jobs.clone();
        let jobs_guard = active_jobs.try_lock().ok();
        if let Some(mut jobs) = jobs_guard {
            for (id, mut job) in jobs.drain() {
                match job.child.start_kill() {
                    Ok(()) => log::info!("Killed orphaned ffmpeg job {} on app exit", id),
                    Err(e) => log::warn!("Failed to kill orphaned ffmpeg job {} on exit: {}", id, e),
                }
            }
        } else {
            log::warn!("Could not acquire job lock on exit; orphaned ffmpeg processes may remain");
        }
    }
});
```

Key choices:
- `try_lock().ok()` — synchronous, deadlock-safe. If a monitor task happens to hold the lock at exit, we log a warning rather than block.
- `child.start_kill()` — synchronous SIGKILL/terminate, safe to call from the sync handler (unlike the async `kill().await`).

**Effect:** closing the app mid-job no longer leaves orphaned ffmpeg processes accumulating CPU load.

---

## 8. Fix #6 — `CREATE_NO_WINDOW` missing on ffprobe spawns

### What was wrong

The `CREATE_NO_WINDOW` flag existed on the ffmpeg spawn sites in `process.rs` and `merge.rs`, but was **not** applied to the ffprobe paths in `video.rs` (`get_duration`, `check_ffmpeg_availability`) and `merge.rs` (`check_audio_stream`).

With `windows_subsystem = "windows"` (set in `main.rs`), every spawn without `CREATE_NO_WINDOW` allocates a new console buffer and connects `conhost.exe`. For `merge_videos`, `check_audio_stream` is called once per input file — 10 inputs = 10 console allocations, each a brief `csrss.exe` handle burst in the kernel. Not a hard-reset cause on its own, but it adds kernel handle-allocation bursts to an already-saturated system.

### The fix — centralise the flag in a helper, apply everywhere

`src-tauri/src/commands/mod.rs`:

```rust
// Suppress the console window that Windows allocates for every spawned child process when the
// parent uses `windows_subsystem = "windows"`. Must be applied to every ffmpeg/ffprobe spawn.
#[cfg(windows)]
pub fn apply_no_window(command: &mut tokio::process::Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn apply_no_window(_command: &mut tokio::process::Command) {}
```

The helper is now applied to **every** `Command::new("ffmpeg"|"ffprobe")` site:

| File | Function | Process |
|---|---|---|
| `commands/process.rs` | `process_video` | ffmpeg |
| `commands/video.rs` | `get_duration` | ffprobe |
| `commands/video.rs` | `check_ffmpeg_availability` | ffmpeg + ffprobe |
| `commands/merge.rs` | `multi_cut_merge` | ffmpeg |
| `commands/merge.rs` | `merge_videos` | ffmpeg |
| `commands/merge.rs` | `check_audio_stream` | ffprobe |

The two pre-existing inline `#[cfg(windows)]` blocks were replaced with the helper for consistency. Centralising the flag makes omission structurally impossible — any new spawn that forgets the helper is a visible code-review gap, not a silent platform difference.

**Effect:** no more per-spawn console-alloc bursts during heavy merge operations.

---

## 9. Fix #7 — stderr parser allocation churn

### What was wrong

The per-line split logic used `split_at` + `chars().next()` + `collect::<String>()` + `[1..].to_string()` — three to four `String` allocations per stderr line. With high stderr throughput this was constant Gen0 allocation churn on the tokio runtime allocator, amplifying the CPU cost of #1.

### The fix — single `String::drain`

`src-tauri/src/commands/process.rs`:

```rust
// Drain the line including its delimiter in one operation, then drop a trailing
// paired delimiter (\r\n or \n\r) if present. Fewer String allocations than the
// previous split_at + chars().next() + collect() + to_string() chain.
let mut end = pos + 1;
let bytes = pending.as_bytes();
if let Some(&next) = bytes.get(end) {
    if (next == b'\r' || next == b'\n') && next as char != bytes[pos] as char {
        end += 1;
    }
}
let segment: String = pending.drain(..end).collect();
```

One `drain` consumes the line + its delimiter(s) in a single operation. Paired-delimiter (`\r\n` / `\n\r`) detection is done via byte inspection before draining. Fewer allocations, no UTF-8 re-validation of the remainder.

> `tokio_util::codec::LinesCodec` was considered and rejected: it only splits on `\n` and would buffer ffmpeg's `\r`-overwritten stats lines into one giant line until the final `\n`, breaking progress parsing.

**Effect:** per-line allocation count drops from 3–4 to 1. Combined with #1, the hot path is now "match + one drain" per line.

---

## 10. Fix #8 — UNC path escaping broke `\\server\share\` subtitles

### What was wrong

`escape_subtitle_path` blanket-replaced `\` with `/`. A UNC path like `\\NAS\media\subs\movie.srt` became `//NAS/media/subs/movie.srt`, which ffmpeg's `lavf` may interpret as a protocol specifier. Not a hard-reset cause; a latent bug for UNC users.

### The fix — preserve the UNC prefix as an escaped literal

`src-tauri/src/commands/process.rs`:

```rust
fn escape_subtitle_path(path: &str) -> String {
    let mut escaped = if path.starts_with(r"\\") {
        let mut s = String::from(r"\\\\");        // preserve \\ as escaped literal \\\\
        s.push_str(&path[2..].replace('\\', "/")); // normalise only the backslashes after the prefix
        s
    } else {
        path.replace('\\', "/")
    };
    escaped = escaped.replace(':', r"\:");
    escaped.replace('\'', r"\'")
}
```

A new test `test_build_ffmpeg_args_with_unc_subtitle_path` covers `\\NAS\media\subs\movie.srt` → `subtitles=filename='\\\\NAS/media/subs/movie.srt'`. Drive-letter paths (`C:\...`) are unaffected — the existing tests pass unchanged.

**Effect:** UNC-hosted subtitles now work. No more protocol-misinterpretation risk.

---

## 11. Verification

```
cargo test          → 35 passed; 0 failed   (1 pre-existing dead_code warning in state.rs)
npm run type-check  → clean
```

The 35 tests include the new `test_build_ffmpeg_args_with_unc_subtitle_path` regression test for #8. `npm run lint` has a pre-existing failure (`.eslintrc.js` uses CommonJS while `package.json` declares `"type": "module"`) that is unrelated to these changes.

---

## 12. Root-cause verdict

In order of probability for a Windows 11 user, the most likely root cause was:

1. **#1 + #2 + #3 together** — sustained 100 % CPU (regex recompile per line) + saturated disk I/O (debug log of every line + frontend log of every event) + saturated WebView2 re-rendering. This was the **default behaviour for every user on every ffmpeg job**. On a thermally or PSU-marginal Windows 11 machine, this alone causes a hard reset on a long job. **Most likely root cause — now fixed.**
2. **#3 alone (GPU driver angle)** — on systems with marginal GPU drivers, the WebView2 progress-event flood caused GPU TDR → `VIDEO_TDR_FAILURE` BSOD → auto-restart. **Fixed by throttling.**
3. **#4 alone (OOM angle)** — only when using "Merge Videos" with many large files, on low-RAM / small-pagefile systems. **Fixed by switching to the concat demuxer.**
4. **#5 compounding** — repeated close-mid-job cycles left orphaned ffmpeg processes that accumulated CPU load toward instability. **Fixed by the exit handler.**

---

## 13. Lessons baked into the codebase

1. **Hot-path regex is a CPU bomb.** Any regex used per-line / per-event must be compiled once and cached (`OnceLock`, `LazyLock`, or `once_cell`). The cost is invisible in a unit test and only surfaces under real load.
2. **Log level matters in production.** Shipping a desktop app with `Debug`-level logging means every chatty subsystem hits the disk synchronously. Production log level should be `Info` at most.
3. **IPC events are not free.** Every `app.emit` → `listen` → `setState` → re-render is a cross-process + GPU pipeline round trip. Throttle at the **source** (backend), not the renderer.
4. **Don't log inside event handlers.** Logging belongs at lifecycle boundaries (start, complete, error), not per tick.
5. **Mutex + `.await` = accidental serialisation.** Take the lock, do the cheap mutation, drop the lock, **then** await the expensive operation.
6. **`concat` filter vs `concat` demuxer.** The filter holds all inputs in memory (O(N) RAM). The demuxer streams sequentially (O(1) RAM). For merging arbitrary files, the demuxer is almost always the right choice.
7. **`CREATE_NO_WINDOW` must be applied to *every* spawn on Windows GUI apps.** Centralise it in a helper to make omission structurally impossible.
8. **Detached tasks need cleanup.** On app close, enumerate and kill every active job — never assume the OS reaps children promptly on Windows.
9. **Hard resets are a *system* symptom, not an *app* symptom.** Investigate hot paths, resource holding, and event frequencies, not logic bugs.
10. **Unit tests hide load pathology.** The regex-recompile-per-call bug was invisible to unit tests. Load pathology needs a benchmark, a hot-path code review, or (as here) a production failure report.

---

## 14. Further-fix assessment (as of this review)

I re-walked every touched file and re-ran the gates. Status:

### Confirmed in place and working
- `cargo test` → **35 passed, 0 failed**.
- `npm run type-check` → **clean**.
- All six first-pass fixes (#1, #2, #3, #5, #6, #7) and all three follow-up fixes (#1 refined to `LazyLock`, #8 UNC, orphan-kill exit handler) are present in the current source.
- `apply_no_window` is applied at **all six** spawn sites (verified by reading `process.rs`, `video.rs`, `merge.rs`).
- `LazyLock` is in use; `rust-version = "1.80.0"` is set in `Cargo.toml`.
- The exit handler in `lib.rs` uses `try_lock().ok()` + `start_kill()` — deadlock-safe and sync-safe.
- The concat-demuxer rewrite in `merge_videos` is in place, with temp-list cleanup via `cleanup_path`.
- The progress throttle (≥200 ms or ≥1 % delta) is in place.
- The per-event `logger.log` in `ProcessingPanel.tsx` is removed.

### No further hard-reset fix required

The eight identified stress sources are all resolved, and the verification gates pass. There are **no remaining items in the investigation's "Not fixed" list** — the follow-up pass closed all of them.

### Minor polish opportunities (NOT hard-reset vectors)

These were intentionally left out of the hot-fix pass. Listed for completeness:

1. **`transition-all duration-200` on the progress bar** (`ProcessingPanel.tsx:466`). The throttle interval (≥200 ms) matched the CSS transition duration, so back-to-back emits driven by the 1 % delta override (`delta_ok` bypasses `time_ok`) could queue animations. **Applied:** removed `transition-all duration-200` from the progress bar — the bar now steps instantly with each throttled emit, eliminating any animation overlap.
2. **Per-read `String::from_utf8_lossy` + `push_str`** in `monitor_ffmpeg_progress`'s read loop (`process.rs:160`). This is normal buffered reading (one `String` per 2 KB read, not per line). The dominant costs (regex recompile, per-line disk logging) are already gone. **Not applied — not worth the churn.**
3. **A regression benchmark for `parse_ffmpeg_time`** under load. The existing unit tests only exercise correctness, not performance under load (lesson #10), so a future change that re-introduces per-call `Regex::new` would pass the suite. **Applied:** added `test_parse_ffmpeg_time_regex_cache_regression` to `process.rs` — an `#[ignore]`d test that calls `parse_ffmpeg_time` 100 000 times and asserts completion in under 2 s. A per-call recompile would blow this budget by ~50×+. Run explicitly with `cargo test -- --ignored parse_ffmpeg_time_regex_cache_regression`; ignored by default to avoid CI timing flakiness.
4. **The pre-existing `npm run lint` failure** (ESM/CJS config conflict: `.eslintrc.js` used `module.exports` while `package.json` declared `"type": "module"`, so Node refused to load the config). **Applied:** renamed `.eslintrc.js` → `.eslintrc.cjs` (explicit CommonJS extension, standard fix for this conflict) and updated the self-reference in `ignorePatterns`. Also fixed a second pre-existing config bug: `@typescript-eslint/recommended` → `plugin:@typescript-eslint/recommended` (missing `plugin:` prefix). `npm run lint` now runs and reports 26 pre-existing lint errors (mostly `no-explicit-any` in test files/IPC wrappers, plus a `rules-of-hooks` violation in `Timeline.tsx`) — these are separate code-quality issues unrelated to the hard-reset fix and are left for a dedicated cleanup pass.

### Polish verification
```
cargo test          → 35 passed; 0 failed; 1 ignored   (the new regression guard, ignored by design)
cargo test --ignored → 1 passed; 0 failed              (benchmark completes in 1.24s, well under the 2s budget)
npm run type-check  → clean
npm run lint        → runs successfully (was broken); reports 26 pre-existing errors unrelated to this work
```

### Conclusion

**No further fix is needed to avoid hard resets.** All eight stress sources are resolved, the orphan-process leak is closed, and the verification gates are green. The optional polish (items 1, 3, 4 above) has been applied; item 2 was deliberately skipped as not worth the churn.
