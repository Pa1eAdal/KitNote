# KitNote

KitNote is a lightweight Windows sticky-note app built with Tauri v2, React, TypeScript, and Rust. It is local-first: note contents are stored on your computer, not in Git and not in a cloud service.

This is a fresh Tauri rebuild, not a continuation of the old Electron app. The only old asset reused is the KitNote icon from `C:\Users\RuaKo\Documents\P_project\assets`.

## What Works In This Milestone

- Borderless sticky-note window.
- Always-on-top enabled by default, with a setting to turn it off.
- Hidden top and bottom toolbars that appear on hover.
- Markdown editing with a preview toggle.
- TeX math rendering through KaTeX, including inline `$E = mc^2$` and block `$$...$$` syntax.
- Configurable note color, font color, font size, font family, opacity, and corner radius.
- Multiple note creation from the `+` button.
- Local JSON persistence.
- Image insertion from a file picker, copied into KitNote app data.
- Drag-and-drop image path support when the desktop WebView exposes a real file path.
- Hyperlink insertion for web URLs and local files/folders.
- Safe local link opening from Rust, with script/executable-like files blocked.

## Tech Stack

- Tauri v2 for the Windows desktop shell.
- Rust for persistence, image copying, safe file opening, and window creation.
- React and TypeScript for the UI.
- Vite for frontend development and builds.
- Markdown-it and KaTeX for Markdown and TeX rendering.
- Plain CSS with CSS variables for the note theme.

## Dependency Notes

- `@tauri-apps/api` and `@tauri-apps/cli`: required for Tauri v2 desktop integration and builds.
- `@tauri-apps/plugin-dialog`: used only for explicit image file selection.
- `react`, `react-dom`, `vite`, `typescript`: the requested lightweight frontend stack.
- `markdown-it` and `katex`: Markdown rendering plus a small local math rule, avoiding the vulnerable `markdown-it-katex` package.
- `lucide-react`: lightweight icon components for toolbar buttons.
- Rust crates `serde`, `serde_json`, `uuid`, `url`, and `open`: typed data, JSON persistence, IDs, URL validation, and safe default-app opening.

## Install Requirements

Install these before building:

1. Node.js 20 or newer.
2. Rust stable with Cargo.
3. Microsoft Visual Studio Build Tools with the C++ build tools workload.
4. Tauri prerequisites for Windows.

In this PowerShell environment, use `npm.cmd` instead of `npm` if script execution policy blocks `npm.ps1`.

## Install Dependencies

```powershell
npm.cmd install
```

## Run In Development

```powershell
npm.cmd run tauri:dev
```

For frontend-only development in a browser:

```powershell
npm.cmd run dev
```

## Build The App

Build the frontend only:

```powershell
npm.cmd run build
```

Build the Windows executable and installers:

```powershell
npm.cmd run tauri:build
```

Expected release outputs after a successful Tauri build:

- Executable and app bundle files under `src-tauri\target\release\`.
- NSIS installer under `src-tauri\target\release\bundle\nsis\`.
- MSI installer under `src-tauri\target\release\bundle\msi\` if the local Windows toolchain supports MSI builds.

## Note Data Location

KitNote stores notes in the app data directory resolved by Tauri. On Windows this is normally:

```text
%APPDATA%\com.kitnote.desktop\notes.json
```

Inserted images are copied under:

```text
%APPDATA%\com.kitnote.desktop\assets\
```

These files are private user data and should not be committed to Git.

## Icons

Source icon files are expected at:

```text
C:\Users\RuaKo\Documents\P_project\assets\app-icon.ico
C:\Users\RuaKo\Documents\P_project\assets\app-icon.png
```

Generated/copied Tauri icons live in:

```text
src-tauri\icons\
```

Regenerate them with:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\generate-icons.ps1
```

The Tauri config uses `src-tauri\icons\icon.ico` for the executable and installer icon.

## Git Remote

The intended remote is:

```powershell
git remote add origin https://git.nju.edu.cn/zzy5370/kitnote_new
```

Push local commits with:

```powershell
git push -u origin main
```

## Manual QA Checklist

- Launch the app with `npm.cmd run tauri:dev`.
- Confirm the note window is borderless, resizable, and starts always-on-top.
- Hover near the top and bottom edges to reveal the toolbars.
- Type Markdown and TeX, then switch to Preview.
- Insert a PNG/JPG/GIF/WebP image and confirm it still appears after restart.
- Insert a web link and double-click it in Preview.
- Insert a local document link and double-click it in Preview.
- Confirm `.exe`, `.bat`, `.cmd`, and `.ps1` local links are blocked.
- Create a second note with the `+` button.
- Quit and relaunch to confirm notes persist.

## Known Limitations

- Image drag/drop depends on whether the Windows WebView exposes a real file path. The image button is the reliable path.
- Images render inline in Markdown preview, but full direct manipulation is still a roadmap item.
- Closing a note closes that window; a tray menu for reopening saved notes is planned.
- Window position and size fields exist in the data model, but full automatic save/restore still needs more work.
- Risky local file links are currently blocked instead of showing a confirmation dialog.
- MSI generation may require extra Windows build tooling.
- Rounded corners use a transparent, decoration-free Tauri window with the visible note inset in CSS. Native Windows shadows are disabled for transparent note windows to avoid a rectangular frame around rounded corners.
- Runtime diagnostics are written to `kitnote.log` in the same app data directory as `notes.json`.

## Future Work

See `ROADMAP.md`.
