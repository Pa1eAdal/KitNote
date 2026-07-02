# KitNote Project Context

Last updated: 2026-07-01

## Purpose

KitNote is a lightweight, local-first Windows sticky-note application. Notes are editable Markdown/TeX documents displayed in small borderless, always-on-top windows. User data stays in the local Tauri application-data directory; KitNote does not provide cloud sync.

The application is an early test product, not a finished security-hardened or enterprise release.

## Why Tauri Replaced Electron

KitNote was rebuilt as a separate Tauri v2 project rather than continuing the old Electron implementation. Electron's bundled Chromium and Node.js runtime produced a larger application and packaging footprint than this utility needed. Tauri retains a web frontend while using the Windows system WebView and a Rust backend, reducing the expected runtime and installer size.

The old Electron architecture, dependencies, build outputs, and note data were not migrated. Only the KitNote identity and icon assets were reused. Do not switch this repository back to Electron.

## Repository And Paths

- Git remote: `https://git.nju.edu.cn/zzy5370/kitnote_new`
- Developer workspace: `C:\code\KitNote_new`
- Original icon: `C:\Users\RuaKo\Documents\P_project\assets\app-icon.ico`
- Generated Tauri icons: `src-tauri\icons\`
- Release executable: `src-tauri\target\release\KitNote.exe`
- NSIS output: `src-tauri\target\release\bundle\nsis\`
- MSI output: `src-tauri\target\release\bundle\msi\`
- Windows user data: `%APPDATA%\com.kitnote.desktop\`

The original icon path is workstation-specific. Reproducible icon generation from repository-owned source assets remains unfinished.

## Current Version Status

`package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` all declare version `0.2.0`. The documented public test release is v0.2.0, dated 2026-06-24.

As of this update, `fix/security-hardening` is at `eaf84a6`, three commits after the `v0.2.0` tag. These later commits have not been declared a new release. Do not describe an untagged branch build as a new KitNote release. The current Windows installers are unsigned.

Always verify the current branch, tags, and version metadata before release work.

## Architecture

### Frontend

The React/TypeScript application starts in `src/main.tsx`; `src/App.tsx` coordinates note loading, autosave, settings, window state, new-note creation, and safe closing. UI components live under `src/components/`, CSS in `src/styles.css`, and shared frontend types in `src/types.ts`.

The borderless transparent window uses custom drag and resize controls. Tauri window APIs provide movement, edge/corner resize, geometry, monitor information, always-on-top state, close interception, and destruction after a successful save.

### Rust Backend

`src-tauri/src/lib.rs` registers Tauri commands and plugins. Rust owns note persistence, image copying, validated link launching, logging, and single-instance handling. Persistence details are separated into `src-tauri/src/persistence.rs`; Windows local-link validation is in `src-tauri/src/link_policy.rs`.

Frontend access is controlled by `src-tauri/capabilities/default.json`. Broad core and dialog defaults were replaced with the specific event, window, webview-window creation, and open-dialog commands KitNote uses. See `docs/permissions.md` and `docs/SECURITY_BACKLOG.md`.

### Note Persistence

The primary store is `%APPDATA%\com.kitnote.desktop\notes.json`. Related files include:

- `notes.backup.json`: last-known-good data preserved during replacement.
- `notes.lock`: interprocess lock file with no note content.
- `notes.corrupt-*.json`: malformed data retained for recovery.
- `assets\`: copied note images.
- `kitnote.log`: runtime diagnostics.

Writes use a process lock, an operating-system file lock, UUID-named temporary files, and atomic replacement. Save operations reject stale note versions. Ordinary read errors stop save/create operations rather than continuing from empty defaults. Malformed startup data is preserved before a clean store is created.

Notes are readable local JSON, not encrypted. See `docs/data-location.md` before changing storage behavior.

### Multi-Window Behavior

The main window loads the same React application as secondary `note-*` windows. A note ID is passed through the URL query string. `src/notes/store.ts` persists a new note first, then creates its Tauri webview window so the new frontend can load existing data.

New note labels use UUID-based IDs. New notes inherit visual and window settings from the source note but do not inherit title, content, images, or links. Placement prefers a position beside the source window and clamps the result to the monitor work area.

When `restoreAllNotesOnLaunch` is enabled, all saved notes reopen as windows on startup. X closes a window for the current session; it does not delete or permanently hide the saved note. A tray/list UI and persistent hidden state do not exist yet.

X and native close requests share one save-then-destroy path. Pending state is serialized and flushed before the current window is destroyed. Failures and timeouts keep the window open, restore the close button, and report an error.

### Live Preview

`src/components/LivePreviewEditor.tsx` uses CodeMirror 6. Markdown and TeX rendering helpers live under `src/editor/`. The saved Markdown/TeX source remains the single source of truth.

Inactive syntax is rendered while source around the cursor or selection stays visible for editing. The active-range logic includes the corrected inline-math boundary behavior. The supported Markdown subset is intentionally limited; tables, task lists, footnotes, and complex nested cases may remain raw or partially rendered.

Markdown rendering disables raw HTML and KaTeX uses `trust: false`, but final rendered HTML still crosses an `innerHTML` boundary without a dedicated allowlist sanitizer. This remains a security backlog item.

### Settings And Menus

Per-note settings include colors, font, opacity, corner radius, and always-on-top behavior. Titles are editable from the top toolbar. The settings popover closes on outside click or Escape.

The startup window is always-on-top through Tauri configuration. Runtime setting changes use the explicit `core:window:allow-set-always-on-top` permission; consult `docs/permissions.md`.

### Local Link Policy

Rendered links require direct `Ctrl+click`; they are not opened automatically. Web links are restricted to HTTP and HTTPS.

Rust applies an allowlist to local documents and images. It rejects relative paths, UNC/network targets, remote `file://` hosts, device paths, alternate data streams, scripts, executables, shortcuts, control formats, and unknown extensions. Approved targets are passed to native Windows `ShellExecuteW`, not to a shell command.

Do not weaken this policy or automatically open local paths without explicit user approval and focused security review.

### Single Instance

`tauri-plugin-single-instance` prevents a second KitNote process from becoming another writer and focuses an existing window. The operating-system note-data lock remains a second layer of protection.

## Working Features

- Tauri development launch with `npm.cmd run tauri:dev`.
- Borderless, transparent, rounded note windows.
- Window movement and edge/corner resizing.
- Always-on-top startup behavior.
- Safe X/native close with save flushing.
- Multi-note creation with `+`.
- Settings inheritance without content copying.
- Beside-source placement with monitor-edge avoidance.
- Editable titles and fresh sticky-note yellow defaults.
- CodeMirror Live Preview and TeX rendering.
- Corrected inline-math active range.
- Outside-click settings dismissal.
- Local JSON persistence, backups, corrupt-data preservation, and stale-write rejection.
- Startup restoration of saved notes.
- Single-instance protection.
- Hardened local-link handling.
- MIT license metadata.

Some GUI behavior was not automatable during the 2026-07-01 audit because Windows rejected capture of the transparent borderless window. Treat manual QA as required after shared window or editor changes.

## Recently Fixed

- Rebuilt separately with Tauri to avoid the old Electron runtime/package footprint.
- Restored movement and edge/corner resizing for rounded transparent windows.
- Fixed `+` creating a blank note and freezing the source window.
- Fixed inherited settings and beside-source note placement.
- Added editable titles, the fresh-note yellow default, and consistent MIT metadata.
- Added the CodeMirror 6 Live Preview editor.
- Corrected inline-math active-range handling.
- Remediated audit Findings 1-5: local-link safety, single-instance/interprocess protection, read-failure preservation, saved-note restoration, stale-write handling, and save-before-close.
- Fixed the close regression where X stayed disabled because close completion required `window.destroy()` permission and the old save queue could remain unresolved.

## Common Commands

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run check:live-preview
npm.cmd run check:save-queue
npm.cmd run build
npm.cmd run tauri:dev
npm.cmd run tauri:build

cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
cargo check --manifest-path src-tauri\Cargo.toml
cargo test --manifest-path src-tauri\Cargo.toml
```

Rust commands issued from the repository root must use `--manifest-path src-tauri\Cargo.toml`.

## Branch And Merge Workflow

1. Start from a clean, current branch.
2. Use a focused `fix/...`, `feat/...`, or documentation branch.
3. Inspect existing code and recent commits before changing shared window, editor, or persistence behavior.
4. Keep commits focused and run relevant frontend, Rust, and targeted regression checks.
5. Review staged paths for private data and generated output.
6. Push the branch when requested.
7. Do not merge to `main`/`master` unless the user explicitly asks. Use the GitLab merge-request flow when review is wanted.

Keep `main` stable and release-ready. Do not create tags or releases as part of an ordinary fix.

## Release Workflow

Release work must be explicitly requested.

1. Confirm the intended release commit and clean working tree.
2. Update version metadata consistently in `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json`.
3. Update release notes without inventing dates or shipped behavior.
4. Run frontend checks, focused scripts, Rust formatting/check/tests, and manual Windows QA.
5. Run `npm.cmd run tauri:build`.
6. Inspect NSIS/MSI outputs under `src-tauri\target\release\bundle`.
7. Record checksums and signing status.
8. Tag only the exact reviewed release commit, then push the tag when explicitly authorized.

Current signing, CI provenance, and reproducible icon generation are incomplete. Windows SmartScreen may warn about unsigned builds.

## Known Limitations

- X closes only for the current session; saved notes reopen while restore-all is enabled.
- There is no note switcher, tray restore menu, permanent hide state, or delete workflow.
- Live Preview supports a focused Markdown subset.
- Final Markdown/KaTeX HTML lacks a dedicated sanitizer.
- Local copied-image rendering needs a narrowly scoped asset-protocol review.
- Persistence has no versioned schema migration and blocking Rust commands may affect responsiveness on slow storage.
- A failed window-creation attempt can leave a saved note without an open window.
- Image validation and path metadata need further privacy/resource hardening.
- The data directory is not configurable.
- Notes are plaintext and installers are unsigned.
- There is no complete updater or automated release pipeline.

## Do-Not-Break Checklist

- App launches and existing note data remains readable.
- Move, resize, transparency, rounded corners, and always-on-top still work.
- X saves and closes one window; errors re-enable X without data loss.
- `+` creates a nonblank note without freezing existing windows.
- New notes inherit settings but not user content and appear on-screen beside the source.
- Live Preview editing, selection, undo/redo, and inline/block math remain usable.
- Settings dismiss correctly.
- Safe links open only after direct action; dangerous/local-network targets remain blocked.
- Persistence does not overwrite data after read errors or stale saves.
- A second process cannot become another writer.
- No note content, app data, logs, build output, or installers enter Git.
