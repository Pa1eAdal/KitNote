# KitNote Data Location

## Current Storage

KitNote stores private user data in the Tauri application data directory. On Windows, the current identifier normally resolves to:

```text
%APPDATA%\com.kitnote.desktop\
```

The directory contains:

```text
notes.json        Note titles, Markdown/TeX source, settings, and window state
assets\           Images copied into KitNote
kitnote.log       Runtime diagnostics
```

This is user data, not disposable cache data. Deleting `notes.json` resets saved notes. Deleting `assets` can break image references inside notes.

The Rust backend resolves the directory through Tauri's `app_data_dir()` API. KitNote is currently a Windows-focused application, although the API itself is platform-aware.

## Why It Is Not Configurable In v0.2.0

Changing the data directory safely is larger than a folder picker. A reliable implementation must:

1. Store the selected directory somewhere that can be read before loading notes.
2. Validate that the destination is writable.
3. Stop note writes during migration.
4. Back up `notes.json` and copied assets.
5. Copy data without changing the source.
6. Validate the copied JSON and asset paths.
7. Switch to the destination only after validation succeeds.
8. Roll back cleanly after permission, disk-space, or interruption failures.
9. Keep the old data until the user confirms the new location works.
10. Handle multi-window restarts without two locations being active at once.

The current image records contain stored paths, so moving assets may also require path rewriting or a future relative-path format. Implementing only a folder picker would create a real risk of lost or split notes.

## Planned Design

A future release can add a **Data location** setting with:

- an explicit user-selected folder;
- a migration preview and warning;
- timestamped backup creation;
- copy, validation, and rollback;
- no deletion of the old location during migration;
- clear restart requirements;
- narrowly scoped filesystem access through Rust commands.

Until then, back up the complete `%APPDATA%\com.kitnote.desktop` directory before moving or resetting note data.
