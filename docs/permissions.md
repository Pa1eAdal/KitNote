# KitNote Tauri Permissions

KitNote uses one Tauri capability for the main window and `note-*` windows. It is functional but not yet fully least-privilege because `core:default` and `dialog:default` include APIs KitNote does not currently use.

Enabled permissions:

- `core:default`: currently supplies window geometry, monitor, and event APIs. It also includes unused core menu, tray, image, path, and other APIs and should be narrowed in a later permission-focused pass.
- `core:webview:allow-create-webview-window`: lets the `+` action and startup restoration create note windows.
- `core:window:allow-close`: lets native Windows close requests enter KitNote's save-before-close handler.
- `core:window:allow-destroy`: lets the shared X/native close path destroy only the current window after its save succeeds. Tauri's close-request API also requires this permission to complete an allowed close.
- `core:window:allow-start-dragging`: supports borderless window movement.
- `core:window:allow-start-resize-dragging`: supports edge/corner resizing.
- `dialog:default`: supplies the image picker, but also includes unused save/message dialogs. It should later become `dialog:allow-open`.

File reads and writes for note data are not exposed directly to the frontend. They go through Rust commands that write to the KitNote app data directory. Inserted images are copied into that app data directory after the user selects or drops them.

The current capability still needs a later focused correction for the runtime always-on-top setter: startup always-on-top comes from window configuration, but changing it at runtime should receive only `core:window:allow-set-always-on-top` when the broader defaults are narrowed.

The single-instance plugin is Rust-only and adds no frontend permission. A second KitNote launch exits after focusing an existing KitNote window.

Local links open only after a direct `Ctrl+click` on rendered content. Rust rejects relative paths, UNC/network paths, remote `file://` hosts, device paths, alternate data streams, executable/script/shortcut/control extensions, and file types outside KitNote's ordinary-document/image safe list. Web links are limited to `http` and `https`. Windows receives the validated target through the native `ShellExecuteW` API, not a command string.
