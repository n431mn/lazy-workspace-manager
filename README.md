<p align="center">
  <img src="icon.svg" width="72" height="72" alt="lazy-workspace-manager icon">
</p>

# lazy-workspace-manager

English | [中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2%2B-4b6bfb)](https://github.com/deepseek-ai/deepseek-harness)

A DeepSeek Harness (DSH) Web plugin providing lazy loading and on-demand workspace management.

## Overview

In multi-project development environments, DSH accumulates workspace registrations as directories change. Over time, the sidebar enumerates all historical workspaces and conversations, leading to visual clutter and increased navigation friction.

**lazy-workspace-manager** implements **lazy loading** and **automated workspace lifecycle management**:
- **On-Demand Loading**: Avoids listing every historical workspace at startup, preventing sidebar bloat across numerous project directories.
- **Context-Aware Attribution**: Opening or restoring a conversation automatically traces and loads its registered workspace, preventing conversations from falling into the "Ungrouped" state.
- **Frontend Filtering with a Host Index**: Filters the shared workspace and session projections while the plugin is active; the Host also keeps an index of registered workspaces and known sessions and attaches directory-owned sessions to their workspace. Removing the plugin returns the sidebar to DSH's global lists; the index and startup preferences remain in the profile data directory.

---

## Features

- **On-Demand Sidebar Loading**: Restricts the sidebar to actively loaded workspace folders and their respective conversations.
- **Automatic Folder Attribution**: Automatically loads the parent workspace when opening conversations via search or session restore.
- **Persistent Startup Defaults**: Allows pinning high-frequency workspaces to load automatically on startup via settings.
- **Sidebar Unload Semantics**: Remaps the sidebar "Delete workspace" action to "Unload" (hides from view without deregistering or deleting session files); full workspace deletion is retained in settings with two-step confirmation.
- **Filter Drafts and Archives**: Suppresses interaction-less blank drafts and archived sessions to maintain a clean workspace tree.
- **Reversible Unload, Persistent Index**: Unloading only hides a folder and never deletes sessions; removing the plugin restores global workspace loading. The Host index and startup defaults remain under the profile data directory.

---

## Requirements

- DeepSeek Harness Web: **0.2.1-rc.2** or higher.
- Node.js: **22.15+** or **24+**.
- Pure JavaScript bundle without native dependencies or compilation requirements.

---

## Installation

### From GitHub

```sh
dsh plugin --profile web add "git+https://github.com/n431mn/lazy-workspace-manager.git#v1.0.0"
dsh web
```

*Note: Omit the `#v1.0.0` tag to track the latest changes on the `main` branch.*

### From Local Path

```sh
dsh plugin --profile web add "link:D:/path/to/lazy-workspace-manager"
dsh web
```

After installation and restarting `dsh web`, refresh your browser to access the management interface at **Settings → Workspaces by folder**.

---

## Usage

1. **Workspace Management** (**Settings → Workspaces by folder**):
   - Click **Add folder…** to select a project path; the workspace will register and mount immediately.
   - Use folder card toggles to **Load** or **Unload** workspaces as needed.
   - Check **Load at startup** to persist default workspace choices across sessions and page reloads.
2. **Sidebar Interactions**:
   - The sidebar "Delete workspace" action unloads the target folder without deleting underlying data.
   - Permanent workspace removal is performed through **Delete registration…** on the settings card.

---

## Uninstallation

To restore official default DSH behavior:

```sh
dsh plugin --profile web remove lazy-workspace-manager
dsh web
```

Upon reloading the browser, all workspaces and sessions render under standard global loading behavior. The plugin's index and startup defaults stay in the profile data directory.

---

## License

[MIT](LICENSE)
