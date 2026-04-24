# AltCut Development & Safety Rules

To ensure project stability and prevent regression when adding new features, follow these core architectural rules.

## 1. AI Pipeline Integrity
- **Non-Blocking Execution**: All AI tasks MUST be triggered via the Rust `run_ai_job` command. Never run heavy logic directly in the frontend.
- **Absolute Paths**: The Python backend and Rust bridge MUST exchange **absolute file paths**. Relative paths lead to broken previews when assets move or deep-linked folders are used.
- **Progress Feedback**: Python scripts MUST use `log()` with `flush=True` so that the Rust bridge can stream logs to the UI in real-time.
- **Cleanup**: Temporary files (like `.wav` extracts) MUST be deleted by the backend immediately after use to prevent storage bloat.

## 2. Data Persistence (SQLite)
- **SSOT (Single Source of Truth)**: The SQLite database is the source of truth. UI states (like `timelineClips`) must be refreshed from the DB using `loadTimeline()` after any mutation.
- **Status Tracking**: Always update the `ai_metadata` table before and after an AI job. This ensures that even if the app restarts, the UI correctly displays the "Completed" or "Failed" state.
- **Asset Links**: Never delete an asset from the `assets` table if it is still referenced in `timeline_clips`.

## 3. Preview & Rendering
- **Tauri Asset Protocol**: Always wrap local file paths with `convertFileSrc()` before passing them to the Remotion `<Player>` or `<Video>` components.
- **Frame Accuracy**: Remotion uses `fps`. When calculating time, always use the formula: `frame = Math.floor(seconds * fps)`.
- **Absolute Positioning**: The timeline uses absolute positioning. Any new track or clip type must respect the `timeline_start` and `duration` offsets calculated in `db.ts`.

## 4. UI/UX Consistency
- **Grid Layout**: Maintain the `app-shell` grid defined in `App.css`. Do not use ad-hoc floats or absolute positioning for main panels.
- **Theming**: Use the CSS variables defined in `:root` (e.g., `--accent-primary`, `--bg-panel`) for all new components to maintain the "CapCut" aesthetic.
- **User Feedback**: Every backend action (export, AI job, delete) MUST have a corresponding UI feedback (spinner, alert, or status badge).

## 5. Environment & Dependencies
- **Binary Check**: Before running AI tools, verify the existence of `ffmpeg` and `ffprobe` in the system path.
- **Virtual Env**: Never commit `backend_env/` or `venv/` folders. Update `.gitignore` if a new environment path is created.
- **Type Safety**: New metadata types must be added to `src/types/` and `src/lib/db.ts` to ensure the frontend can safely parse AI JSON outputs.
