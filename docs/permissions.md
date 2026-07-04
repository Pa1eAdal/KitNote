# KitNote Tauri Permissions

KitNote uses one local Tauri capability for the `main` window and `note-*` windows. Both kinds of window expose the same note controls, including `+`, image insertion, movement, resizing, settings, and close, so they currently need the same permission set.

Enabled permissions:

| Permission | Why KitNote needs it |
| --- | --- |
| `core:event:allow-listen` | Subscribes to window move, resize, and native close-request events. |
| `core:event:allow-unlisten` | Removes those event listeners when a React effect is disposed. |
| `core:webview:allow-create-webview-window` | Creates secondary note windows for `+` and startup restoration. |
| `core:window:allow-current-monitor` | Reads the current monitor work area so a new note stays on-screen. |
| `core:window:allow-destroy` | Destroys only the current window after save-before-close succeeds. |
| `core:window:allow-get-all-windows` | Checks whether a note window label already exists before creating or restoring it. |
| `core:window:allow-outer-position` | Reads source/current note position for persistence and beside-source placement. |
| `core:window:allow-outer-size` | Reads note dimensions for persistence and placement. |
| `core:window:allow-scale-factor` | Converts physical window events and geometry to logical coordinates. |
| `core:window:allow-set-always-on-top` | Applies the per-note always-on-top setting at runtime. |
| `core:window:allow-set-focus` | Focuses an existing note window instead of duplicating its label. |
| `core:window:allow-start-dragging` | Supports borderless window movement. |
| `core:window:allow-start-resize-dragging` | Supports custom edge/corner resizing. |
| `dialog:allow-open` | Opens only the file picker used for image insertion. |

The following broad or unused grants were removed:

- `core:default`, which expanded to default app, event, image, menu, path, resources, tray, webview, and window permissions.
- `dialog:default`, which enabled message and save dialogs in addition to the required open dialog.
- `core:window:allow-close`, because KitNote does not invoke Tauri's close command. X and native close requests share an intercepted save-then-`destroy()` path.

Event emit permissions are not granted. The `tauri://created` and `tauri://error` notifications used by `WebviewWindow` creation are handled locally by the JavaScript API; ordinary backend event emission is not used.

File reads and writes for note data are not exposed directly to the frontend. They go through Rust commands that write to the KitNote app data directory. Inserted images are copied into that app data directory after the user selects or drops them.

KitNote grants no Tauri filesystem, shell, or opener plugin permission. Safe local file and web-link opening goes through KitNote's Rust command and existing allowlist, not arbitrary shell execution.

The single-instance plugin is Rust-only and adds no frontend permission. A second KitNote launch exits after focusing an existing KitNote window.

Local links open only after a direct `Ctrl+click` on rendered content. Rust rejects relative paths, UNC/network paths, remote `file://` hosts, device paths, alternate data streams, executable/script/shortcut/control extensions, and file types outside KitNote's ordinary-document/image safe list. Web links are limited to `http` and `https`. Windows receives the validated target through the native `ShellExecuteW` API, not a command string.

`core:webview:allow-create-webview-window` remains the most security-sensitive frontend grant. It is required by the current frontend-owned multi-window design and has no narrower command scope in the generated ACL manifest. A future focused change could move note-window creation to Rust, but that would be an architectural change and is outside this permission-only pass.
