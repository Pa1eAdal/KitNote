# KitNote

KitNote is a lightweight Windows sticky-note app built with Tauri v2, React, TypeScript, and Rust. It is local-first: note contents are stored on your computer, not in Git and not in a cloud service.

This is a fresh Tauri rebuild, not a continuation of the old Electron app. The only old asset reused is the KitNote icon from `C:\Users\RuaKo\Documents\P_project\assets`.

The current public test release is **KitNote v0.2.0**. It is an early release intended for testing rather than a final stable product.

This software was fully generated with OpenAI Codex. The development environment identifies the model used for this work as ~~GPT-5~~ GPT-5.5.~~; it would be inaccurate to label it GPT-5.5 without verified provenance.~~

## What Works In This Milestone

- Borderless sticky-note window.
- Always-on-top enabled by default, with a setting to turn it off.
- Hidden top and bottom toolbars that appear on hover.
- CodeMirror 6 live preview with Markdown source kept as the single source of truth.
- Cursor-aware rendering for headings, bold, italic, inline code, fenced code, links, lists, blockquotes, and TeX math.
- TeX math rendering through KaTeX, including inline `$E = mc^2$` and block `$$...$$` syntax.
- Configurable note color, font color, font size, font family, opacity, and corner radius.
- Multiple note creation from the `+` button.
- All saved notes restore as windows on launch while `restoreAllNotesOnLaunch` is enabled.
- Per-note titles that can be renamed by clicking the title in the top toolbar.
- Local JSON persistence with single-instance protection, an interprocess lock, atomic replacement, and a last-known-good backup.
- X and native close requests flush the latest queued note state before the window closes.
- Image insertion from a file picker, copied into KitNote app data.
- Drag-and-drop image path support when the desktop WebView exposes a real file path.
- Hyperlink insertion for web URLs and local files/folders.
- Safe local link opening from Rust, with an ordinary-document/image allowlist and network/UNC targets blocked.

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
- CodeMirror 6 packages: source editing, undo/redo, cursor handling, Markdown parsing, and live-preview decorations.
- `lucide-react`: lightweight icon components for toolbar buttons.
- Rust crates `serde`, `serde_json`, `uuid`, and `url`: typed data, JSON persistence, IDs, and URL validation.
- `tauri-plugin-single-instance` and `fs2`: one running KitNote process plus a cross-process note-data lock.
- `windows-sys`: direct Windows `ShellExecuteW` calls after local/web targets pass Rust validation.

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

Run Rust checks from `src-tauri` or pass the manifest path from the project root:

```powershell
cargo fmt --manifest-path src-tauri\Cargo.toml -- --check
cargo check --manifest-path src-tauri\Cargo.toml
cargo test --manifest-path src-tauri\Cargo.toml
```

## Install And Uninstall

For a normal installation, run the generated NSIS `.exe` or MSI `.msi` installer and follow the Windows prompts. Windows may show an unrecognized publisher warning because this early test release is not code-signed.

To uninstall KitNote, open Windows **Settings > Apps > Installed apps**, find **KitNote**, and choose **Uninstall**. Uninstalling the application may leave local note data in the app data directory so it can be recovered or removed separately.

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

KitNote also maintains:

- `notes.backup.json`: the last valid data file before the latest successful replacement;
- `notes.corrupt-*.json`: malformed files preserved for manual recovery;
- `notes.lock`: an empty process-lock file with no note content.

Only one KitNote process writes this directory. A second launch focuses an existing KitNote window and exits. Saves use unique temporary files, a process-wide plus operating-system lock, stale-version checks, and atomic replacement. Read failures stop saves instead of resetting data.

Closing a note is not deletion. X saves the latest edit/window state before closing. When `restoreAllNotesOnLaunch` is enabled (the current default), every saved note opens again the next time KitNote starts.

Changing the default color affects new or fresh notes, but existing persisted notes keep their saved color. To reset test data, first close KitNote and back up `%APPDATA%\com.kitnote.desktop\notes.json`, then remove that file. KitNote will create a fresh yellow note the next time it starts.

The storage directory is not configurable in v0.2.0. See [Data Location](docs/data-location.md) for the current layout and the planned migration design.

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
- Type Markdown and TeX and confirm inactive syntax renders automatically.
- Click rendered syntax and confirm its raw source reappears for editing.
- Insert a PNG/JPG/GIF/WebP image and confirm it still appears after restart.
- Insert a web link and `Ctrl+click` it when rendered.
- Insert a safe local document/image link and `Ctrl+click` it when rendered.
- Confirm executable/script/shortcut/control links and UNC/network paths are blocked.
- Create a second note with the `+` button.
- Close the second note, quit, and relaunch to confirm all saved notes restore.
- Launch KitNote a second time and confirm it focuses the existing app instead of starting another writer.

## Troubleshooting

- `cargo metadata` or `cargo` not found: install Rust with Cargo and restart the terminal so `%USERPROFILE%\.cargo\bin` is on `PATH`.
- `link.exe` not found: install Visual Studio 2022 Build Tools with the **Desktop development with C++** workload, then build from a Developer PowerShell or Developer Command Prompt.
- Vite reports `EBUSY` under `src-tauri\target`: confirm the Vite watcher excludes Tauri build output, stop stale KitNote/Vite processes, and retry.
- Windows warns about an unknown publisher: this test release is not digitally signed. Verify that the installer came from the KitNote release page before running it.
- The build directory becomes very large: Rust debug, release, incremental, and installer artifacts are stored under `src-tauri\target`. After preserving release installers, run `cargo clean --manifest-path src-tauri\Cargo.toml` to reclaim space. The next build will take longer.

## Known Limitations

- Image drag/drop depends on whether the Windows WebView exposes a real file path. The image button is the reliable path.
- Images render inline in Markdown preview, but full direct manipulation is still a roadmap item.
- Live Preview supports a focused Markdown subset. Tables, task-list controls, footnotes, and nested edge cases remain raw or partially rendered.
- Rendered links open with `Ctrl+click`; a normal click reveals their Markdown source.
- Closing a note closes that window; a tray menu for reopening saved notes is planned.
- Closed notes return on the next app launch while restore-all is enabled; an immediate tray/list reopen action is still planned.
- Local file links outside the ordinary-document/image safe list are blocked instead of showing a confirmation dialog.
- MSI generation may require extra Windows build tooling.
- Rounded corners use a transparent, decoration-free Tauri window with the visible note inset in CSS. Native Windows shadows are disabled for transparent note windows to avoid a rectangular frame around rounded corners.
- Runtime diagnostics are written to `kitnote.log` in the same app data directory as `notes.json`.

## Future Work

See `ROADMAP.md`.

## License

KitNote is available under the [MIT License](LICENSE).
