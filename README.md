<p align="center">
  <img src="icon.svg" width="72" height="72" alt="lazy-workspace-manager icon">
</p>

# lazy-workspace-manager

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2%2B-4b6bfb)](https://github.com/deepseek-ai/deepseek-harness)

A DeepSeek Harness (DSH) Web plugin that keeps the left sidebar empty on startup and loads a Workspace and its conversations only for the folders you add.

DSH normally lists every registered Workspace and every Session the moment the Web UI opens. With a handful of projects that is convenient; with dozens of folders and years of conversations it is noise. This plugin makes the sidebar folder-scoped: you add a directory, its Workspace and Sessions appear; everything else stays out of the way until you ask for it.

## Features

- **Folder-scoped sidebar** — only the folders you loaded are listed, together with their Sessions.
- **Add folder in Settings** — pick a directory once; the plugin registers the Workspace if needed and loads it immediately.
- **Load / unload per folder** — unload hides a folder and its Sessions without deleting the registration or touching session files.
- **Load at startup** — tick the box on a folder card to load it on every DSH start and every page reload. The choice is stored by the Host, not in the browser.
- **Opening a conversation loads its folder** — when DSH restores a Session on launch (or you open one from search), the plugin finds its Workspace and loads it, so the conversation never falls into “Ungrouped” just because its folder was not loaded.
- **Refresh keeps the tab** — a page reload restores the folders loaded in that browser tab. A brand-new tab starts from the startup defaults plus the folder of the conversation DSH opens.
- **“Delete workspace” becomes unload** — the sidebar action removes the folder from the sidebar instead of moving its Sessions into “Ungrouped”. The real registry delete lives in Settings behind a two-step confirmation.
- **Sessions the registry missed** — Sessions whose stored `cwd` is a registered Workspace directory are attributed to that folder and attached to it, so the sidebar and the record agree.
- **Quiet about drafts** — blank drafts (never received a user turn) and archived Sessions are hidden from the lists; the card still reports how many were hidden.
- **Durable index** — the Host keeps a complete workspace/session index on disk and serves it to the page, instead of trusting a projection that may not have caught up.

## Requirements

- DeepSeek Harness Web **0.2.1-rc.2 or newer** (`engines.dsh`).
- Node.js 22.15+ or 24+ (the range DSH itself supports).

The plugin is a plain-JavaScript bundle: no build step, no native modules, no runtime dependencies.

## Install

From GitHub:

```sh
dsh plugin --profile web add "git+https://github.com/n431mn/lazy-workspace-manager.git"
dsh web
```

Pin a commit for a reproducible install:

```sh
dsh plugin --profile web add "git+https://github.com/n431mn/lazy-workspace-manager.git#<commit>"
```

From a local checkout:

```sh
dsh plugin --profile web add "link:D:/path/to/lazy-workspace-manager"
dsh web
```

Restart `dsh web` after installing, then refresh the page once. The plugin appears as **Settings → Workspaces by folder**.

## Use

1. Open **Settings → Workspaces by folder**.
2. Choose **Add folder…** and pick the directory whose conversations you want in the sidebar.
3. The folder is loaded right away. Use the switch on its card to unload or load it again.
4. Tick **Load at startup** on the folders you always want. They are loaded on every start and page reload; **Unload all** only affects the current page and does not clear the preference.
5. Expand a folder card to see its Sessions and click one to open it. Sessions outside every loaded folder appear under **Sessions without a folder** at the bottom of the page, and in the sidebar's “Ungrouped” section only while **Show sessions that are not loaded** is on.

Notes:

- The sidebar's **Delete workspace** acts as **unload** in this plugin. The registration stays, so you can load the folder again later.
- **Delete registration…** on a Settings card is the real delete: it calls the Workspace registry and cannot be undone from the plugin.
- The loaded set is per browser tab. A new tab starts with the startup defaults plus the folder of the Session DSH opens.

## How it works

The bundle has two halves:

| Half | File | Responsibility |
| --- | --- | --- |
| Host | `index.js` | Maintains the durable index, resolves folder ownership, attaches directory Sessions, serves the index/config routes, injects the boot snapshot. |
| Client | `client.js` | Filters the shared `workspaces.list` and `sessions.list` projections, tracks the open Session, renders the Settings section. |

Host data lives in the active profile, independent of the browser and of the plugin checkout:

```text
<DSH_HOME>/profiles/<profile>/data/lazy-workspace-manager/index.json   # workspaces + sessions, rebuilt every 30 s when changed
<DSH_HOME>/profiles/<profile>/data/lazy-workspace-manager/config.json  # startup defaults
```

The index is recomputed from `workspaceRegistry` and `sessionQuery`, with titles folded from the title snapshots and the built-in fallback. It is only rewritten when its content changes.

Web routes:

| Route | Purpose |
| --- | --- |
| `GET /lazy-workspace-manager/index.json` | Live index for an open page. |
| `GET/POST /lazy-workspace-manager/config.json` | Read or replace the startup defaults (`{"defaults": ["<workspace-id>", ...]}`). |
| `GET /lazy-workspace-manager/diagnostics` | Package, host, client bundle, data files, and default count. |

At boot the same values are injected as `window.__DSH_LAZY_WORKSPACE_MANAGER__` and `window.__DSH_LAZY_WORKSPACE_MANAGER_CONFIG__`, so the first render already knows the index and the defaults.

The client does not fork the Workspace services: it temporarily wraps the shared `workspaces.list` / `sessions.list` snapshots while the plugin is active, and restores the original descriptors on dispose. Unloading is therefore purely a view operation — no Session is moved, rewritten, or deleted.

## Privacy

Everything stays on the machine. The plugin makes no network requests, collects no telemetry, and stores only workspace IDs, paths, titles, and session metadata in the profile's data directory.

## Limitations

- Tested against DSH **0.2.1-rc.2** Web on Windows. The host services and client slots it uses are shipped by DSH, but other platforms and future DSH versions are untested.
- The startup preference is a set of Workspace IDs. Deleting a Workspace registration leaves a stale ID in `config.json`; it is ignored until the folder is registered again.
- Blank drafts and archived Sessions are hidden from the lists by design. They are not deleted.
- The plugin relies on the Workspace registry's `attachSession` contract: a Session can only be attached to a Workspace whose path equals the Session's `cwd`.

## Development

```sh
npm run check   # syntax-check both halves
npm test        # five behavioural harnesses, no DSH required
node test/render.mjs   # preview the Settings page against the live profile (Windows)
```

Repository layout:

```text
index.js              Host half
client.js             Client half (module-loader bundle)
cordis.patch.yml      Loader row inserted by the bundle
locale/{en,zh}.json   Section title and description
icon.svg              Settings icon
test/                 Behavioural harnesses and the live preview
```

The harnesses stub the Host services and the browser module loader, so they run outside DSH and cover folder loading, reload restoration, startup defaults, open-Session tracking, and the index/config routes.

## License

[MIT](LICENSE)
