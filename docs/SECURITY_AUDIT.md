# KitNote Security & Stability Audit

Audit date: 2026-07-01

Audited revision: `b6c91a5` on `main` (`v0.2.0-1-gb6c91a5`)

Scope: static source/configuration review plus local build, test, dependency, Git, and disk-usage checks

## Summary

KitNote has a sound early foundation. At the time of the first-pass audit, it was not ready to be treated as secure or data-loss-resistant software.

The strongest existing controls are a restrictive script CSP, disabled raw Markdown HTML, KaTeX `trust: false`, explicit user interaction before links open, Rust-owned note storage, UUID note IDs, temporary-file-plus-rename writes, corrupt-file preservation, and clean Git ignore rules.

No Critical issue was found. The original audit identified four High issues:

1. Local links can still open dangerous Windows shortcut/control formats and UNC network paths.
2. Two KitNote processes can overwrite each other's note data.
3. A transient read failure can cause a later save/create operation to continue from fresh default data.
4. secondary notes become unavailable through the UI after their window is closed or after restart.

The focused remediation passes on 2026-07-01 fixed all four High findings and Medium Findings 5 and 6. Important Medium issues remain around main-thread Rust I/O, local image rendering, HTML rendering boundaries, persistence migrations, failed window creation, and unsigned release packaging.

The first-pass audit changed only this report. The later focused remediation changed the application and documentation files described in the remediation status and command results below.

## Risk Ratings

- **Critical:** immediate compromise or unrecoverable loss with little or no user interaction.
- **High:** realistic code execution, credential exposure, or substantial data-loss/data-availability risk.
- **Medium:** meaningful defense, reliability, privacy, or release weakness that needs scheduled work.
- **Low:** hardening, limited-impact privacy/reliability issue, or maintainability debt.
- **Info:** expected behavior or operational fact users and maintainers should understand.

Finding totals:

| Rating | Count |
| --- | ---: |
| Critical | 0 |
| High | 4 |
| Medium | 8 |
| Low | 4 |
| Info | 2 |

Post-remediation open finding totals:

| Rating | Open |
| --- | ---: |
| Critical | 0 |
| High | 0 |
| Medium | 6 |
| Low | 4 |
| Info | 2 |

## Remediation Status

- **Finding 1 fixed:** local files now use an ordinary-document/image allowlist; shortcuts, executable/script/control types, UNC/network/device paths, remote file URLs, alternate data streams, relative paths, and unknown extensions are blocked. Validated targets use native `ShellExecuteW`, not a command string.
- **Finding 2 fixed:** the official Tauri single-instance plugin focuses an existing window and exits a second process. Every note-data operation also takes an OS-level file lock, and writes use UUID-named temporary files.
- **Finding 3 fixed:** save/create return ordinary read errors without writing. Startup preserves malformed JSON under a unique corrupt filename; update operations preserve a recovery copy and refuse replacement. Successful saves maintain `notes.backup.json`.
- **Finding 4 fixed:** the main window honors `restoreAllNotesOnLaunch` for notes left visible and selects the most recently updated visible note for the main window. X persists hidden state without deleting content, hidden historical records do not reopen automatically, and all-hidden startup prefers the most recently updated non-empty note.
- **Finding 5 fixed:** frontend saves are serialized, stale note versions are rejected, and X/native close requests flush the latest note state before closing.
- **Finding 5 regression fix:** the save queue now returns the real queued operation instead of a separately settled promise. Save and close waits are bounded, close state always resets in `finally`, and frontend/Rust diagnostics record note IDs and window labels without note content.
- **Native close regression fix:** Tauri's `onCloseRequested` implementation completes an allowed close with `window.destroy()`. KitNote now grants the narrow `core:window:allow-destroy` permission and routes both X and native close through one save-then-destroy path without recursive close interception.
- **Finding 6 fixed:** `core:default` was replaced with the exact event/window commands KitNote uses, `dialog:default` was narrowed to `dialog:allow-open`, the runtime always-on-top setter was added, and the unused Tauri close command grant was removed.

## Findings

### Finding 1: Windows local-link policy misses executable shortcut and network targets

- **Severity:** High
- **Remediation status:** Fixed on 2026-07-01
- **Area:** Local files, hyperlinks, Windows security
- **Files inspected:** `src-tauri/src/lib.rs:325-405`, `src/App.tsx:238-245`, `src/components/LinkDialog.tsx:9-47`
- **Problem:** `open_file_target` canonicalizes a path and blocks only `exe`, `bat`, `cmd`, `com`, `msi`, `ps1`, `vbs`, `js`, `jse`, `wsf`, `scr`, and `jar`. It then passes every other path to `open::that`, which uses the Windows shell association. Dangerous types such as `.lnk`, `.url`, `.hta`, `.cpl`, `.reg`, `.chm`, `.pif`, `.scf`, `.appref-ms`, `.msc`, `.ws`, `.wsh`, `.vbe`, and `.sct` are not blocked. UNC paths such as `\\server\share` and file URLs with a remote host are also not rejected. The persisted `confirmRiskyLocalLinks` setting is not used.
- **Why it matters:** A `.lnk` or related shell file can launch a program. Opening a hostile UNC path can contact a remote SMB server and may disclose Windows authentication material. A user must Ctrl+click the rendered link, which reduces likelihood, but a link in pasted/untrusted note content still crosses a dangerous trust boundary.
- **Recommended fix:** Prefer an allowlist of ordinary document/image/text types and folders. At minimum, block the full Windows executable/shortcut/control list, reject UNC/network file paths by default, and require a clear confirmation for anything outside the allowlist. Bind local links to paths explicitly selected by the user where practical. Add tests for case variants, trailing dots, shortcuts, UNC paths, file URLs, and directories.
- **Suggested priority:** 1
- **Whether code change is required:** Yes

### Finding 2: The write lock does not protect against a second KitNote process

- **Severity:** High
- **Remediation status:** Fixed on 2026-07-01
- **Area:** Persistence, concurrency, Windows process lifecycle
- **Files inspected:** `src-tauri/src/lib.rs:11-13`, `src-tauri/src/lib.rs:218-280`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- **Problem:** `Mutex<()>` serializes windows only inside one process. KitNote has no single-instance plugin, OS file lock, revision check, or per-process temp filename. Two processes can read the same `notes.json`, independently change it, write the same `notes.json.tmp`, and replace the main file.
- **Why it matters:** Double-clicking an installed app while it is already running is ordinary user behavior. Separate processes can lose whole-note updates through last-writer-wins behavior or interfere with the shared temporary file.
- **Recommended fix:** Make KitNote single-instance and focus/restore the existing process when a second launch is attempted. Also add an interprocess lock or compare-and-swap revision around persistence so correctness does not depend only on single-instance startup behavior. Use a unique temp file and test simultaneous writers.
- **Suggested priority:** 2
- **Whether code change is required:** Yes

### Finding 3: Save/create operations can replace loaded data after a read failure

- **Severity:** High
- **Remediation status:** Fixed on 2026-07-01
- **Area:** Persistence, error recovery, data loss
- **Files inspected:** `src-tauri/src/lib.rs:189-227`, `src-tauri/src/lib.rs:238-280`
- **Problem:** `save_note` uses `read_app_data(&app).unwrap_or_else(|_| default_app_data())`. `create_note_window` has equivalent fallback behavior. The code treats every read error as permission to continue from fresh default data. Malformed JSON is moved aside first, but other I/O failures can also enter this path.
- **Why it matters:** A temporary read/sharing/permission error must not be converted into a new data set that can overwrite the user's known notes. Even with the corrupt-file copy, the app can appear to have reset and requires manual recovery.
- **Recommended fix:** Propagate read errors and refuse to write over existing data. Separate explicit corruption recovery from ordinary I/O failures. Preserve a durable last-known-good backup before replacement, validate recovered data, and show a recovery UI rather than silently continuing.
- **Suggested priority:** 3
- **Whether code change is required:** Yes

### Finding 4: Closed secondary notes have no supported reopen path

- **Severity:** High
- **Remediation status:** Fixed for visibility-aware startup restoration and recovery on 2026-07-02
- **Area:** Multi-window lifecycle, data availability
- **Files inspected:** `src/App.tsx:31-50`, `src/components/TopToolbar.tsx:60-70`, `src-tauri/src/lib.rs:145-153`, `src-tauri/src/lib.rs:407-424`, `src/types.ts:3-6`
- **Problem:** Startup selects only `data.notes[0]`. The `restoreAllNotesOnLaunch` setting is stored but never acted on. Closing a note simply closes its window. There is no note list, tray restore action, or startup loop that opens saved secondary notes.
- **Why it matters:** The JSON still contains the note, but a normal user cannot access it. Closing a secondary note or restarting the app therefore behaves like data loss.
- **Recommended fix:** Before adding deletion, implement a reliable reopen path. On launch, honor `restoreAllNotesOnLaunch` or provide a note switcher/tray list. Distinguish Close/Hide from Delete and confirm destructive deletion. Add restart and close/reopen tests with multiple notes.
- **Suggested priority:** 4
- **Whether code change is required:** Yes

### Finding 5: The last edit or window position can be lost on close

- **Severity:** Medium
- **Remediation status:** Fixed on 2026-07-01
- **Area:** Autosave, close behavior
- **Files inspected:** `src/App.tsx:52-65`, `src/App.tsx:74-132`, `src/components/TopToolbar.tsx:60-70`
- **Problem:** Saving starts 450 ms after the latest React state change. The close button calls `window.close()` directly. There is no pending-save flush, close-request interception, save queue drain, or unload-safe handoff.
- **Why it matters:** Typing, moving, or resizing and immediately clicking X can discard the most recent change. Repeated quick-close behavior makes this visible even though the debounce window is short.
- **Recommended fix:** Keep the latest note in a ref, serialize saves, intercept close requests, flush the pending state, and close only after success or an explicit user choice. Test close during a pending and an in-flight save.
- **Suggested priority:** 5
- **Whether code change is required:** Yes

### Finding 6: The Tauri capability is both broader than needed and incomplete

- **Severity:** Medium
- **Remediation status:** Fixed on 2026-07-01
- **Area:** Tauri permissions, least privilege
- **Files inspected:** `src-tauri/capabilities/default.json`, generated `src-tauri/gen/schemas/acl-manifests.json`, `src/App.tsx`, `src/notes/store.ts`, `src/components/TopToolbar.tsx`, `src/components/ResizeHandles.tsx`
- **Problem:** `core:default` expands to defaults for app, event, image, menu, path, resources, tray, webview, and window. It grants unused menu/tray/image/path operations. `dialog:default` grants message, save, and open dialogs even though KitNote uses only open. Conversely, `setAlwaysOnTop()` is called but `core:window:allow-set-always-on-top` is not granted, so changing that setting can fail at runtime.
- **Why it matters:** A renderer compromise inherits unnecessary native capabilities. Missing the needed setter also causes a user-facing reliability defect.
- **Recommended fix:** Replace `core:default` with the exact event/window/app reads and listeners in use. Replace `dialog:default` with `dialog:allow-open`. Add only `core:window:allow-set-always-on-top`. Keep close/drag/resize. Consider moving note-window creation to Rust so the renderer does not need general webview-window creation authority.
- **Suggested priority:** After High findings
- **Whether code change is required:** Yes

Pre-remediation permission review:

| Permission | Current reason | Needed? | Narrowing |
| --- | --- | --- | --- |
| `core:default` | Window geometry, monitor data, event listeners | Partially | Replace with individual app/event/window permissions; remove menu, tray, image, path, and unrelated webview access |
| `core:webview:allow-create-webview-window` | `+` creates a note window | Yes in current architecture | Prefer Rust-owned creation; otherwise keep only for `main` and `note-*` |
| `core:window:allow-close` | X button | Yes | Already narrow |
| `core:window:allow-start-dragging` | Borderless window movement | Yes | Already narrow |
| `core:window:allow-start-resize-dragging` | Custom edge/corner resizing | Yes | Already narrow |
| `dialog:default` | Image picker | Only `open` is needed | Use `dialog:allow-open` |
| Missing: `core:window:allow-set-always-on-top` | Settings toggle | Yes | Add only this setter |

Tauri's documentation confirms that [`core:default` expands to all core defaults](https://v2.tauri.app/reference/acl/core-permissions/) and [`dialog:default` enables open, save, and message](https://v2.tauri.app/plugin/dialog/).

The focused remediation replaced the defaults with explicit event listen/unlisten; current-monitor, geometry, scale, focus, always-on-top, destroy, drag, and resize window commands; webview-window creation; and open-dialog access. The unused close command was removed because KitNote's intercepted close flow calls `destroy()` only after a successful save. No Tauri filesystem, shell, or opener permission is enabled.

### Finding 7: Copied local images are not exposed by a scoped asset protocol

- **Severity:** Medium
- **Area:** Image rendering, Tauri configuration
- **Files inspected:** `src/editor/markdown.ts:5-7`, `src/editor/markdown.ts:119-129`, `src-tauri/tauri.conf.json:29-31`, `src-tauri/src/lib.rs:282-323`
- **Problem:** Local paths are converted with `convertFileSrc`, and CSP allows `asset:`/`http://asset.localhost`, but `app.security.assetProtocol` is not configured. Tauri v2 defaults it to disabled with an empty scope.
- **Why it matters:** Copied images may persist correctly but fail to render. Enabling the protocol without a narrow scope later could expose arbitrary local files to the WebView.
- **Recommended fix:** Enable the asset protocol only for KitNote's copied assets directory, for example the app-data `assets/**` subtree. Do not expose all user files. Add an insert/restart/render test.
- **Suggested priority:** After High findings
- **Whether code change is required:** Yes

Tauri documents that the [asset protocol must be enabled and scoped](https://v2.tauri.app/security/asset-protocol/).

### Finding 8: User content crosses an `innerHTML` boundary without a final sanitizer

- **Severity:** Medium
- **Area:** Markdown, KaTeX, Live Preview, XSS
- **Files inspected:** `src/editor/markdown.ts:14-49`, `src/editor/markdown.ts:101-144`, `src/components/LivePreviewEditor.tsx:50-70`, `src-tauri/tauri.conf.json:29-31`
- **Problem:** Markdown-it and KaTeX output is inserted with `element.innerHTML`. Raw Markdown HTML is disabled, Markdown-it rejects common script URL schemes, KaTeX uses `trust: false`, and the CSP disallows inline scripts. These are good controls, but there is no final allowlist sanitizer. The fallback in `renderMath` returns the raw TeX source if the lenient KaTeX render itself throws.
- **Why it matters:** A future parser/plugin regression or unusual fatal KaTeX path would place attacker-controlled text directly at an HTML sink. A renderer injection would be amplified by Tauri command access.
- **Recommended fix:** Sanitize the final Markdown/KaTeX HTML with a narrowly configured, maintained sanitizer, or construct preview DOM without HTML strings. Escape the fatal math fallback unconditionally. Add adversarial tests for raw HTML, event attributes, script/data/vbscript links, malformed TeX, SVG, and oversized inputs.
- **Suggested priority:** After High findings
- **Whether code change is required:** Yes

Adversarial spot checks during this audit showed that current Markdown-it escaped raw HTML and left `javascript:`, `vbscript:`, and HTML `data:` links as text. KaTeX with `trust: false` did not create a JavaScript hyperlink. This lowers current exploitability but does not remove the sink.

### Finding 9: Persistence has no last-known-good backup or real schema migration

- **Severity:** Medium
- **Remediation status:** Partially fixed on 2026-07-01; durable temp writes and last-known-good backup were added, but schema migration is still missing
- **Area:** Persistence, upgrades, recovery
- **Files inspected:** `src-tauri/src/lib.rs:83-89`, `src-tauri/src/lib.rs:189-227`, `docs/data-location.md`
- **Problem:** Writes use a temporary file and rename, which is a good atomic replacement pattern. However, there is no routine backup before replacement, no `sync_all` durability step, and `schema_version` is read but never validated or migrated. Adding a required field can make an old file fail deserialization and be treated as malformed.
- **Why it matters:** Power loss, disk faults, and future data-model changes need a predictable recovery path. A timestamped corrupt copy is useful but is not a tested upgrade strategy.
- **Recommended fix:** Keep a validated last-known-good backup, fsync the file/directory where appropriate, implement versioned migrations, and test old schema, partial JSON, unknown fields, missing fields, disk-full, and interrupted replacement scenarios.
- **Suggested priority:** Before changing the data model
- **Whether code change is required:** Yes

### Finding 10: All note I/O and launcher work runs in synchronous main-thread commands

- **Severity:** Medium
- **Area:** Stability, responsiveness, scale
- **Files inspected:** `src-tauri/src/lib.rs:229-363`, `src/App.tsx:52-65`
- **Problem:** The Tauri commands are synchronous. Tauri executes non-async commands on the main thread. Each autosave reads and parses the complete data file, serializes all notes, writes it, and renames it while holding process and file locks. Native Windows `ShellExecuteW` can also take time while Windows resolves a file association.
- **Why it matters:** Large note collections, slow/redirected roaming AppData, antivirus scanning, or launcher delays can freeze every window. This matches the app's historical class of low-CPU UI freezes.
- **Recommended fix:** Move blocking filesystem and launcher work to `spawn_blocking`/worker execution. Keep lock hold times small, serialize saves through a dedicated queue, and persist per-note changes or migrate to SQLite as data grows. Add latency and large-data tests.
- **Suggested priority:** After immediate data-loss fixes
- **Whether code change is required:** Yes

Tauri recommends async commands for heavy work because [synchronous commands execute on the main thread](https://v2.tauri.app/develop/calling-rust/).

### Finding 11: Failed note-window creation leaves persisted orphan data

- **Severity:** Medium
- **Area:** Multi-window transaction, event cleanup
- **Files inspected:** `src/notes/store.ts:38-96`, `src-tauri/src/lib.rs:253-280`
- **Problem:** The Rust command persists the new note before the frontend creates its window. That ordering avoids the earlier blank-window race, but if window creation errors or times out, the new note remains stored with no recovery UI. Timeout settlement also does not unregister the two pending `once` listeners.
- **Why it matters:** A failed `+` attempt can create hidden notes and slowly accumulate stale listeners/records.
- **Recommended fix:** Treat data creation and window creation as a recoverable transaction. On failure, either remove the unused new note safely or expose it in the reopen UI. Explicitly unregister listeners on timeout. A Rust-owned window creation flow would simplify rollback and permission scope.
- **Suggested priority:** After the reopen path exists
- **Whether code change is required:** Yes

### Finding 12: Windows release artifacts lack identity and use elevated/networked install behavior

- **Severity:** Medium
- **Area:** Installer, release, Windows trust
- **Files inspected:** `src-tauri/tauri.conf.json:33-57`, `README.md`, `docs/releases/v0.2.0.md`
- **Problem:** The test release is unsigned, NSIS is configured `perMachine` (UAC/admin), and missing WebView2 is handled by a network download bootstrapper. No CI release workflow, published checksums, signing identity, or reproducible release procedure is present.
- **Why it matters:** Users receive an unknown-publisher warning and cannot strongly verify who built the installer. Admin elevation increases impact if an artifact is replaced. Network bootstrap behavior adds an installation dependency and can fail in restricted environments. Unsigned low-reputation binaries are also more likely to trigger Defender/SmartScreen warnings.
- **Recommended fix:** Use a trusted code-signing certificate, timestamp signatures, publish SHA-256 checksums and build provenance, and build releases in a controlled CI environment. Reconsider per-machine installation unless KitNote needs it. Document the official WebView2 download behavior and provide a verified offline option if required.
- **Suggested priority:** Before public distribution
- **Whether code change is required:** Configuration and release-process changes

### Finding 13: CSP is good for scripts but can be hardened

- **Severity:** Low
- **Area:** CSP, WebView hardening
- **Files inspected:** `src-tauri/tauri.conf.json:29-31`, `src/App.tsx:263-275`, `src/editor/markdown.ts`
- **Problem:** The CSP has no `unsafe-eval`, no remote scripts, and a narrow `connect-src`, which is good. It allows `style-src 'unsafe-inline'`, `data:` images, and does not explicitly set `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`, or `form-action 'none'`. `freezePrototype` remains at its default `false`.
- **Why it matters:** These are defense-in-depth gaps. Inline style permission can make HTML injection more useful for UI deception, and large data images can consume memory.
- **Recommended fix:** Add explicit deny directives, separate style element and style attribute policy if practical, evaluate Tauri's prototype freezing, and cap data/image sizes. Keep remote scripts and `unsafe-eval` prohibited.
- **Suggested priority:** Safe later improvement
- **Whether code change is required:** Configuration change

### Finding 14: Image imports validate extension only and retain absolute path metadata

- **Severity:** Low
- **Area:** File handling, privacy, resource limits
- **Files inspected:** `src-tauri/src/lib.rs:282-323`, `src/App.tsx:172-205`, `src/types.ts:25-31`
- **Problem:** The copy command checks only the filename extension. It does not verify image magic/type, dimensions, or file size. It accepts any path supplied by an app WebView. `originalPath` and the absolute app-data `storedPath` are saved in note data/content.
- **Why it matters:** An explicitly selected huge or mislabeled file can consume disk/memory. Absolute paths can reveal the Windows username and folder structure when note data is shared or included in diagnostics.
- **Recommended fix:** Verify file signatures, set size/dimension limits, reject device/special paths, and store asset-relative paths. Keep original path metadata only if the feature truly needs it.
- **Suggested priority:** Safe later improvement
- **Whether code change is required:** Yes

### Finding 15: Release versioning and icon generation are not reproducible

- **Severity:** Low
- **Area:** Release hygiene, privacy, maintainability
- **Files inspected:** `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `README.md`, `scripts/generate-icons.ps1`, Git tags
- **Problem:** `main` is one commit after tag `v0.2.0` but still builds as version `0.2.0`, so two different source states can produce identically versioned binaries. The icon script and README hard-code `C:\Users\RuaKo\Documents\P_project\assets`, exposing a local username/path and preventing another maintainer from reproducing icon generation.
- **Why it matters:** Users and maintainers cannot map an installer version to one exact source revision, and release regeneration depends on one workstation.
- **Recommended fix:** Bump the patch version for post-tag builds or derive an explicit build identifier, tag only the exact released commit, and keep source icon assets in a documented repository location with relative defaults.
- **Suggested priority:** Before the next tagged release
- **Whether code change is required:** Script/metadata changes

### Finding 16: Security documentation and regression coverage do not match the risk surface

- **Severity:** Low
- **Remediation status:** Partially fixed on 2026-07-01; documentation and High-finding regression coverage were updated
- **Area:** Tests, documentation, maintainability
- **Files inspected:** `docs/permissions.md`, `README.md`, `scripts/check-live-preview-ranges.mjs`, `src-tauri/src/lib.rs:427-495`
- **Problem:** Permission/link documentation now reflects current behavior, and tests cover link policy, persistence replacement/recovery, read failures, backups, stale writes, note inheritance, save-queue recovery, and visibility-aware startup selection/migration. Automated coverage is still missing for full close-window integration, note positioning, HTML sanitization, failed-window rollback, and actual multi-window restoration.
- **Why it matters:** Incorrect documentation hides permission drift, and high-risk paths can regress without a failing check.
- **Recommended fix:** Update permission/link documentation after the fixes. Add focused unit/integration tests for each High finding and the persistence/window lifecycle before expanding features.
- **Suggested priority:** Alongside each corresponding fix
- **Whether code change is required:** Tests and documentation

### Finding 17: Notes are local but stored as readable plaintext

- **Severity:** Info
- **Area:** Privacy
- **Files inspected:** `src-tauri/src/lib.rs:156-227`, `docs/data-location.md`, network/API scan across `src/`
- **Problem:** Titles, Markdown/TeX, links, settings, and absolute asset paths are readable JSON under the user's roaming app-data directory. Copied images are also unencrypted.
- **Why it matters:** This is normal for an early local-first note app, but it does not protect against another process/user with filesystem access, malware, backups, or profile synchronization. Users should not interpret "local-first" as "encrypted."
- **Recommended fix:** State this clearly. Rely on normal Windows per-user ACLs now; consider an optional DPAPI-backed encrypted store later. Never invent custom cryptography.
- **Suggested priority:** Documentation now; encryption only as a planned feature
- **Whether code change is required:** No for the current model

No automatic network transmission of note contents was found. Remote Markdown images are rendered as URLs by Markdown-it, but the production CSP does not permit `http:` or `https:` in `img-src`, so they should be blocked. Runtime logs contain error text and note IDs, not full note content.

### Finding 18: Rust build artifacts explain the multi-gigabyte project size

- **Severity:** Info
- **Area:** Disk use, repository hygiene
- **Files inspected:** on-disk directory sizes and `.gitignore`
- **Problem:** `src-tauri/target` was absent at the start of the audit. Running only `cargo check` and `cargo test` regenerated **3.719 GiB**:

| Directory | Size |
| --- | ---: |
| `src-tauri/target/debug/deps` | 2.821 GiB |
| `src-tauri/target/debug/build` | 0.559 GiB |
| `src-tauri/target/debug/incremental` | 0.339 GiB |
| `node_modules` | 128.4 MiB |
| `dist` | 2.1 MiB |

- **Why it matters:** Debug symbols, duplicate test/check objects, build scripts, and incremental caches are large on Windows. Release objects and NSIS/MSI bundle intermediates can readily push this past 6 GiB.
- **Recommended fix:** No source fix is required. `.gitignore` correctly excludes `src-tauri/target/`, top-level `target/`, `dist/`, `node_modules/`, generated Tauri schemas, logs, temp files, environment files, note JSON, corrupt/backup JSON, and SQLite files. When disk space is needed, `cargo clean --manifest-path src-tauri/Cargo.toml` is safe for source but deletes cached build output; the next build will be much slower. It was deliberately not run during this audit.
- **Suggested priority:** Operational cleanup only when needed
- **Whether code change is required:** No

## Completed Top Priority Fixes

1. Replaced local-link blacklist behavior with a strict Windows-safe allowlist that blocks shortcuts, control files, and UNC/network paths.
2. Enforced single-instance operation and protected `notes.json` with an interprocess file lock.
3. Removed default-data fallback from save/create read failures and added last-known-good/corrupt recovery copies.
4. Added visibility-aware startup restoration, non-destructive close/hide semantics, and an all-hidden one-note fallback.
5. Added serialized saves, stale-version checks, and save flushing before a note window closes.
6. Replaced broad Tauri default capabilities with the explicit commands required by current note-window behavior.

## Safe Later Improvements

- Enable a tightly scoped asset protocol for copied images.
- Sanitize final Live Preview HTML and escape every fatal fallback.
- Move blocking commands off the main thread and reduce whole-file rewrites.
- Add versioned migrations and power-loss/recovery tests around the new backup strategy.
- Sign Windows installers, publish checksums, and use reproducible release automation.
- Harden CSP and consider `freezePrototype`.
- Validate image bytes/size and store relative asset paths.
- Split persistence, command, link-policy, and model code out of the 495-line Rust `lib.rs` as those areas gain tests.

## Things That Look Good

- Raw HTML is disabled in Markdown-it.
- KaTeX uses `trust: false`; invalid TeX normally renders as safe error output.
- Current spot checks rejected common script URL schemes.
- CSP blocks inline/eval/remote scripts and restricts IPC connections.
- Links are not opened automatically during rendering; they require Ctrl+click.
- Web links are restricted to `http` and `https`.
- Rust owns persistence and image copying; there is no broad Tauri filesystem plugin permission.
- Note IDs and window labels use UUIDs; query parameters are URL-encoded.
- New-note data is persisted before its window initializes, and the Rust lock is released before frontend window creation.
- The new note inherits settings/window state but not title, content, images, or links, with a Rust regression test.
- Multi-window move/resize event listeners are cleaned up on React effect disposal.
- Writes use a temp file and rename rather than writing JSON directly over the live file.
- Malformed JSON is moved to a timestamped corrupt copy.
- Logs do not intentionally include full note contents.
- Both npm and Cargo lockfiles are committed.
- No tracked build output, installer, executable, note database, secret, or environment file was found.
- Package, Cargo, and Tauri versions and MIT license metadata agree at `0.2.0`.

## Commands Run

| Command/check | Result |
| --- | --- |
| `git -c safe.directory=C:/code/KitNote_new status --short --branch` | Passed; clean before report creation, `main...origin/main` |
| `git -c safe.directory=C:/code/KitNote_new log --oneline --decorate -5` | Passed; audited head `b6c91a5` |
| `git ... describe --tags --always --dirty` | `v0.2.0-1-gb6c91a5` |
| `git ... ls-files` build/private artifact scan | No tracked target, dist, node_modules, installer, executable, note, log, environment, or SQLite files found |
| `git ... check-ignore -v ...` | Confirmed target, dist, node_modules, temp, logs, notes, and SQLite patterns are ignored |
| `npm.cmd run check` | Passed |
| `npm.cmd run check:live-preview` | Passed; source-style list lines, plain Enter behavior, independent list-line math, and inline-math cursor boundaries are covered |
| `npm.cmd run check:note-visibility` | Passed; visible-only restore, latest-visible main selection, three-note close/restart behavior, non-empty all-hidden fallback, and explicit note-ID selection are covered |
| `npm.cmd run check:save-queue` | Passed; serialized tasks recover after rejection, failed close state resets, and unresolved operations time out |
| `npm.cmd run build` | Passed before and after remediation; Vite warned about a 1,111.59 kB JavaScript chunk and ineffective dynamic code splitting |
| `cargo fmt --manifest-path src-tauri\Cargo.toml -- --check` | Passed |
| `cargo check --manifest-path src-tauri\Cargo.toml` | Passed |
| `cargo test --manifest-path src-tauri\Cargo.toml` | Passed after startup-selection remediation; 20 tests passed, 0 failed |
| `npm.cmd audit --json` | Passed after network permission was granted; 0 known vulnerabilities across 166 dependencies |
| `cargo audit` availability check | Not available; no RustSec result was produced |
| `npm.cmd ls --depth=0` | Passed; direct installed dependency versions recorded |
| `cargo tree --manifest-path src-tauri\Cargo.toml --depth 1` | Passed; direct Rust dependency versions recorded |
| `cargo tree ... --duplicates` | Passed; expected transitive duplicates found, including Windows support crates and two `thiserror` major versions |
| Adversarial Markdown/KaTeX Node spot checks | Raw HTML escaped; common script links not rendered as anchors; KaTeX untrusted JavaScript href not activated |
| Generated Tauri ACL manifest inspection | Confirmed `core:default` and `dialog:default` expansions |
| Post-Finding 6 source/API-to-ACL mapping | Confirmed every retained permission maps to a current frontend Tauri call; broad core/dialog defaults and the unused close command are absent |
| Directory size measurement | `src-tauri/target` measured at 3.719 GiB after Rust checks |
| `npm.cmd run tauri -- info` | Environment portion succeeded, but the command did not terminate within 120 seconds and was stopped |
| Isolated `tauri dev` using identifier `com.kitnote.codex-runtime` | Launched successfully with no Rust/Tauri terminal error |
| Isolated `tauri dev` after capability narrowing | Normal KitNote controls and saved status loaded; repeated autosaves succeeded with no terminal permission error |
| Synthetic three-note legacy visibility migration and restart | Passed; only the most recently updated note opened, two notes remained saved as hidden, and the second launch still opened one window |
| Isolated runtime save diagnostics | Logged matching `Save started` and `Save succeeded` records without note content |
| Second isolated `KitNote.exe` launch | Passed; second process exited and the running process count remained one |

The first sandboxed `npm audit` attempt could not reach the npm advisory endpoint. It was rerun with approved network/cache access and completed successfully. `cargo audit` can be installed later with:

```powershell
cargo install cargo-audit
cargo audit --file src-tauri\Cargo.lock
```

## Things Not Verified

- The GUI was launched during remediation under a separate `com.kitnote.codex-runtime` data directory.
- Automated capture of the transparent borderless window failed with Windows error `0x80004002`, so move, resize, X, `+`, image insertion, and always-on-top toggling still require manual desktop verification. Visible-only startup count was verified with synthetic data, and Live Preview behavior was verified in the browser frontend.
- Single-instance process behavior was verified without GUI input.
- No malicious `.lnk`, UNC, executable, or other local target was opened.
- No power-loss, disk-full, antivirus-lock, roaming-profile, Unicode-path, OneDrive-path, or simultaneous-process fault injection was performed.
- No signed or unsigned installer was built or installed during this audit.
- MSI/NSIS contents, uninstall behavior, Windows Defender, SmartScreen reputation, and WebView2 bootstrap network behavior were not dynamically tested.
- Rust dependency advisories were not checked because `cargo-audit` is not installed.
- A full penetration test, browser-engine fuzzing, dependency source review, and binary reproducibility check were outside scope.
- Tauri's final compile-time CSP transformation was not inspected from a release binary.

## Recommended Next Codex Prompt

```text
Fix only Finding 8 in docs/SECURITY_AUDIT.md: add final Markdown/KaTeX output sanitization and adversarial rendering tests. Do not redesign the UI or change the note data model. Preserve move, resize, X, +, transparency, rounded corners, always-on-top, Live Preview behavior, note inheritance, restore-all startup, local-link policy, single-instance protection, and save-before-close. Run npm check/build, focused Live Preview checks, Rust fmt/check/test, and manual regression verification.
```
