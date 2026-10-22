# Changelog

## 1.0.0 — 2026-10-22

First public release.

- Folder-scoped sidebar: only loaded folders and their Sessions are listed.
- Settings section with add/load/unload, per-folder Session lists, and registration deletion.
- Durable Host index of every registered Workspace and known Session, served live to the page.
- Directory Sessions are attributed by `cwd` and attached to their Workspace.
- Opening a Session loads its folder automatically.
- Page reload restores the loaded folders of the tab through `sessionStorage`.
- Per-folder **Load at startup** preference persisted in the profile's `config.json`.
- Blank drafts and archived Sessions are hidden with counts.
