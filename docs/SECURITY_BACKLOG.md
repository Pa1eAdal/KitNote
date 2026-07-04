# KitNote Security And Stability Backlog

Last updated: 2026-07-01

Source of truth: `docs/SECURITY_AUDIT.md`. This file is a planning summary, not a replacement for the audit. Recheck implementation and Tauri documentation before changing permissions, rendering, persistence, or release configuration.

## Current Position

The 2026-07-01 remediation closed all four High findings, Medium Finding 5, and Medium Finding 6. The audit records zero open Critical or High findings, six open Medium findings, four open Low findings, and two informational findings.

This does not mean KitNote is fully hardened. Important renderer, persistence, responsiveness, image, and release controls remain incomplete.

## Completed Security And Reliability Work

### Local Links And Files

- Replaced permissive local-file handling with an ordinary-document/image allowlist.
- Blocked executables, scripts, shortcuts, control formats, unknown extensions, relative paths, UNC/network paths, device paths, alternate data streams, and remote `file://` hosts.
- Kept explicit `Ctrl+click` user intent and native `ShellExecuteW` launching without command-string construction.

### Process And Persistence Safety

- Added official Tauri single-instance behavior.
- Added an operating-system lock around note-data access.
- Added UUID-named temporary writes, atomic replacement, stale-version rejection, and last-known-good backup handling.
- Ordinary read failures now stop save/create operations instead of continuing from default data.
- Malformed data is preserved as a uniquely named corrupt copy; update-time corruption refuses replacement.

### Window Lifecycle

- Restores only notes left visible while `restoreAllNotesOnLaunch` is enabled; X hides without deleting, and all-hidden startup reopens only the most recently updated non-empty note when one exists.
- Serializes frontend saves and flushes the latest note state before X/native close.
- Uses one save-then-destroy path for custom and native close.
- Fixed the regression where X stayed disabled by returning the real queue operation, bounding waits, resetting close state in `finally`, and granting the narrow destroy permission.
- Close diagnostics use note IDs/window labels and do not intentionally log note content.

### Tauri Capabilities

Audit Finding 6, fixed on 2026-07-01.

- Removed `core:default` and replaced it with the exact event and window commands used by KitNote.
- Narrowed `dialog:default` to `dialog:allow-open`.
- Added the required runtime always-on-top setter.
- Removed the unused Tauri close command permission; save-before-close uses explicit window destruction.
- Kept frontend webview-window creation because both main and secondary notes provide `+`; moving creation to Rust remains a possible future architectural reduction.
- No filesystem, shell, or opener plugin permission is granted.

## Priority 1: Next Focused Hardening Batch

### Harden Rendered Markdown And Math

Audit Finding 8, Medium.

- Add a maintained allowlist sanitizer after Markdown-it/KaTeX rendering, or eliminate unsafe HTML-string construction.
- Escape the fatal math fallback unconditionally.
- Test raw HTML, event attributes, SVG, malformed TeX, oversized content, and `javascript:`, `vbscript:`, and HTML `data:` URLs.
- Keep raw Markdown HTML disabled and KaTeX `trust: false`.

### Review CSP With Renderer Changes

Audit Finding 13, Low, but closely related to Finding 8.

- Add explicit `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`, and `form-action 'none'` where compatible.
- Evaluate splitting style element/attribute policy and Tauri prototype freezing.
- Keep remote scripts and `unsafe-eval` prohibited.
- Test the final Tauri-compiled CSP in a release build before claiming completion.

### Protect Logging Privacy

Related to audit Findings 14, 16, and 17.

- Keep full note titles, Markdown/TeX content, links, and original local paths out of logs.
- Review Rust and frontend errors before adding new diagnostics.
- Document retention/cleanup expectations for `%APPDATA%\com.kitnote.desktop\kitnote.log`.
- Add a focused test or source-level check where practical.

## Priority 2: Remaining Medium Findings

### Scoped Local Image Access

Audit Finding 7.

- Configure Tauri's asset protocol only for KitNote's copied `assets` subtree.
- Do not expose arbitrary user files.
- Test image insert, restart, and render behavior.

### Persistence Evolution And Durability

Audit Finding 9, partially fixed.

- Backups and safer replacement now exist.
- Add explicit schema-version validation and migrations before changing the note model.
- Test old schemas, unknown/missing fields, partial JSON, disk-full behavior, and interrupted replacement.
- Review `sync_all`/directory durability requirements on Windows before claiming power-loss resilience.

### Move Blocking Work Off The Main Thread

Audit Finding 10.

- Move filesystem and native launcher work to suitable async or blocking-worker execution.
- Keep lock hold times bounded and preserve save ordering.
- Add slow-storage, large-note-set, and antivirus/file-lock simulations.

### Recover Failed Note-Window Creation

Audit Finding 11.

- Remove pending event listeners on timeout/failure.
- Decide whether failed creation rolls back the unused note or exposes it through a future reopen UI.
- Do not reintroduce the blank-window race: note data must exist before the new frontend loads it.
- A Rust-owned transaction may help later, but avoid a broad window-system rewrite without focused tests.

### Release Identity And Windows Trust

Audit Finding 12.

- Decide whether per-machine installation and its UAC requirement are necessary.
- Establish controlled CI release builds and publish SHA-256 checksums/provenance.
- Add trusted code signing and timestamping before broad public distribution when feasible.
- Document WebView2 bootstrap network behavior and any verified offline option.
- Treat SmartScreen reputation as separate from whether a binary is technically signed.

No CI release workflow is currently present in the repository.

## Priority 3: Low And Informational Follow-Up

- **Image validation and path privacy, Finding 14:** verify signatures, size, and dimensions; reject special paths; store relative asset references and avoid retaining original absolute paths unless necessary.
- **Version and icon reproducibility, Finding 15:** keep one version across npm/Cargo/Tauri, tag only exact release commits, and move source icon assets into a reproducible repository-owned location.
- **Regression coverage and documentation, Finding 16:** add integration coverage for window lifecycle, restoration, positioning, failed-window cleanup, and adversarial rendering.
- **Plaintext storage, Finding 17, Info:** clearly state that local-first is not encrypted. Continue relying on Windows per-user ACLs unless optional platform-backed encryption is designed later.
- **Build directory size, Finding 18, Info:** `src-tauri/target` is disposable build output and may grow by several GiB. It is ignored by Git. `cargo clean --manifest-path src-tauri\Cargo.toml` reclaims it but makes the next build slower.

## Recommended Next Batch

Keep the next implementation focused:

1. Add final Markdown/KaTeX sanitization and adversarial rendering tests.
2. Harden CSP alongside the sanitizer and verify the release-build policy.
3. Audit diagnostics to ensure note content and local paths never enter logs.

Preserve move, resize, X, `+`, restoration, always-on-top, Live Preview, settings dismissal, link blocking, single-instance protection, and persistence recovery.

## Postpone

These are valid future projects but should not be mixed into the next hardening batch:

- At-rest encryption or encrypted sync.
- Configurable data-directory migration.
- Advanced note manager, search, tags, or tray-based hidden-note recovery.
- Full automatic updater.
- Code signing if certificate/process ownership is not ready; continue documenting unsigned status meanwhile.
- SQLite migration unless note scale or schema requirements justify it.

## Verification Expectations

For each security batch:

- Add focused tests for the changed trust boundary.
- Run TypeScript, Live Preview, queue, frontend build, Rust formatting, Rust checks, and Rust tests.
- Run Tauri dev and manually verify all window/editor behaviors affected by capability or rendering changes.
- For release-security changes, inspect the release bundle rather than inferring behavior from development mode.
- Review staged files and confirm no note data, logs, app data, dependencies, build output, or installers are included.

## Suggested Next Prompt

```text
Fix only rendered Markdown and KaTeX hardening from Finding 8 in docs/SECURITY_AUDIT.md. Add a maintained final allowlist sanitizer or eliminate unsafe HTML-string construction, and escape fatal math fallbacks. Preserve Live Preview behavior, source editing, links, TeX rendering, all window behavior, local-link policy, single-instance behavior, and persistence protections. Do not redesign the UI, change the note model, alter Tauri permissions, modify installer configuration, or merge to main. Add adversarial rendering tests and run npm check/build, queue and Live Preview checks, Rust fmt/check/test, and manual Tauri verification.
```
