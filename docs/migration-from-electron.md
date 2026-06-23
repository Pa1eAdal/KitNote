# Migration From Electron

KitNote was rebuilt as a fresh Tauri v2 app because the earlier Electron version had a much larger runtime and packaging footprint than a sticky-note utility needs. Tauri keeps the web UI development model while using the system WebView and a small Rust backend, which should make the final app and installer much smaller.

## Reused

- The app name, KitNote.
- The icon source at `C:\Users\RuaKo\Documents\P_project\assets\app-icon.ico`.
- The matching PNG icon at `C:\Users\RuaKo\Documents\P_project\assets\app-icon.png` to generate Tauri icon sizes.
- The general sticky-note idea: soft pale note color, hidden controls, local notes.

## Not Reused

- No Electron runtime or Electron package configuration.
- No Electron `node_modules`, build artifacts, cache files, or installer setup.
- No old application architecture.
- No user note data from the old app.

## How This Avoids The Old Size Problem

The new project uses Tauri v2 with React, TypeScript, and a Rust command layer. Tauri does not bundle Chromium or Node.js into the app, so the Windows executable and installer should be far smaller than the Electron version after release builds are available.
