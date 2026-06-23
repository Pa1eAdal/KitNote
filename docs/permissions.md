# KitNote Tauri Permissions

KitNote uses a minimal Tauri capability in `src-tauri/capabilities/default.json`.

Enabled permissions:

- `core:default`: required for the app window, custom commands, and standard Tauri desktop behavior.
- `dialog:default`: required for the user-triggered image picker in the bottom toolbar.

File reads and writes for note data are not exposed directly to the frontend. They go through Rust commands that write to the KitNote app data directory. Inserted images are copied into that app data directory after the user selects or drops them.

Local links are opened only after a direct double-click in preview mode. The Rust command normalizes the path, checks that it exists, and blocks common executable or script extensions.
