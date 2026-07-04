# KitNote Maintainer Context

## Project

- KitNote is a lightweight Windows sticky-note app.
- Stack: Tauri v2, React, TypeScript, and Rust.
- This is a fresh Tauri project. Do not switch it back to Electron or modify the old Electron project.
- Repository: `https://git.nju.edu.cn/zzy5370/kitnote_new`
- Developer workspace: `C:\code\KitNote_new`

## Preserve

- `npm.cmd run tauri:dev` launches the app.
- Note windows move and resize from edges and corners.
- X saves pending state and safely closes only the current window.
- `+` creates a usable note window without freezing existing windows.
- New notes inherit source-note settings, contain no copied text, and are placed beside the source while avoiding screen edges.
- CodeMirror Live Preview works, including the corrected inline-math active range.
- The settings panel closes on outside click.
- Local-link safety rules remain enforced.
- Single-instance operation, interprocess locking, stale-write protection, backups, corrupt-data preservation, and read-failure protection remain active.

## Git Workflow

- Use feature or fix branches for substantial changes. Keep `main` stable and release-ready.
- Do not merge into `main` or `master` unless the user explicitly asks.
- Do not create tags, installers, or releases unless the user explicitly asks.
- Before committing, inspect the staged file list.

## Safety

- Never commit private note data or app data.
- Never commit `notes.json`, backups, corrupt copies, `src-tauri/target`, top-level `target`, `node_modules`, `dist`, installers, logs, caches, or environment files.
- Never log full note titles or contents. Note IDs and window labels are acceptable when needed for diagnostics.
- Do not automatically open local files.
- Do not weaken the local-link allowlist or network/UNC blocking without explicit user approval.

## Commands

```powershell
npm.cmd run check
npm.cmd run check:live-preview
npm.cmd run check:note-visibility
npm.cmd run check:save-queue
npm.cmd run build
npm.cmd run tauri:dev
npm.cmd run tauri:build

cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
cargo check --manifest-path src-tauri\Cargo.toml
cargo test --manifest-path src-tauri\Cargo.toml
```

Rust commands run from the repository root must use `--manifest-path src-tauri\Cargo.toml`.

## Completion Standard

- Run checks appropriate to the change and report pass/fail results.
- State exactly what was manually verified and what remains unverified.
- Confirm that no private data or build artifacts are staged or committed.
- Push the current branch when the user asks.
- Preserve working window, editor, persistence, and security behavior unless the task explicitly targets it.
