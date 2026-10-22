<p align="center">
  <img src="icon.svg" width="72" height="72" alt="lazy-workspace-manager 图标">
</p>

# lazy-workspace-manager

[English](README.md) | 中文

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2%2B-4b6bfb)](https://github.com/deepseek-ai/deepseek-harness)

一个 DeepSeek Harness（DSH）Web 插件：启动时左侧栏保持为空，只有在你添加某个目录之后，才加载该目录对应的工作区及其会话。

DSH 默认会在 Web 界面打开时列出所有已注册工作区和所有会话。项目少的时候这很方便；目录一多、会话积累几年之后，侧栏就成了负担。这个插件把侧栏改成“按目录加载”：添加一个目录，它的工作区和会话才出现；没有加载的目录不占用侧栏空间。

## 功能

- **侧栏按目录加载** —— 只列出已加载的目录及其会话。
- **在设置里添加目录** —— 选一次目录；插件会按需注册工作区并立即加载。
- **逐个加载 / 卸载** —— 卸载只是隐藏该目录及其会话，不删除注册，也不改动会话文件。
- **启动时自动加载** —— 在目录卡片上勾选后，每次 DSH 启动、每次刷新页面都会自动加载该目录。选择由 Host 持久化，不依赖浏览器。
- **打开会话时自动加载其目录** —— DSH 启动时恢复某个会话，或你从搜索里打开一个会话时，插件会追溯它所属的工作区并加载，避免会话因为工作区没加载而掉进“未分组”。
- **刷新保留本标签页** —— 刷新页面会恢复当前标签页已加载的目录；新开的标签页从“启动默认目录”加“DSH 打开的那个会话所在目录”开始。
- **“删除工作区”改为“卸载”** —— 侧栏的删除操作只把目录和会话从左侧移除，不会把会话移进“未分组”。真正的注册删除在设置页里，需要二次确认。
- **补全会话归属** —— 会话记录的 `cwd` 等于某个已注册工作区目录、但注册表没有关联它时，插件会把它归到该目录并 `attachSession`，让侧栏和索引保持一致。
- **安静地隐藏草稿** —— 从未收到用户消息的空白会话、以及已归档会话不会出现在列表里；卡片仍会提示隐藏了多少个。
- **持久索引** —— Host 在磁盘上维护完整的工作区/会话索引并提供给页面，不依赖可能尚未追上的实时投影。

## 环境要求

- DeepSeek Harness Web **0.2.1-rc.2 或更新**（`engines.dsh`）。
- Node.js 22.15+ 或 24+（DSH 自身支持的范围）。

插件是纯 JavaScript 包：没有构建步骤、没有原生模块、没有运行时依赖。

## 安装

从 GitHub 安装：

```sh
dsh plugin --profile web add "git+https://github.com/n431mn/lazy-workspace-manager.git"
dsh web
```

需要可复现的安装时锁定 commit：

```sh
dsh plugin --profile web add "git+https://github.com/n431mn/lazy-workspace-manager.git#<commit>"
```

从本地目录安装：

```sh
dsh plugin --profile web add "link:D:/path/to/lazy-workspace-manager"
dsh web
```

安装后重启 `dsh web`，再刷新一次页面。插件入口是 **设置 → 按目录加载**。

## 使用

1. 打开 **设置 → 按目录加载**。
2. 点 **添加目录…**，选择想在侧栏看到的目录。
3. 目录会立即加载。用卡片上的开关可以卸载或重新加载。
4. 常用目录勾选 **启动时自动加载**。以后每次启动和刷新都会带上它；**全部卸载** 只影响当前页面，不会清掉这个偏好。
5. 展开目录卡片可以看到会话列表，点会话即可打开。不属于任何已加载目录的会话出现在页面底部的 **无目录的会话**；只有在打开 **显示未加载的会话** 时，它们才会出现在侧栏的“未分组”里。

说明：

- 侧栏的 **删除工作区** 在本插件里等于 **卸载**：注册仍然保留，之后可以重新加载。
- 设置卡片上的 **删除注册…** 才是真正的删除：它调用 Workspace 注册表，插件无法撤销。
- 已加载集合按浏览器标签页保存。新标签页从启动默认目录加 DSH 打开的那个会话所在目录开始。

## 工作原理

插件分两半：

| 半边 | 文件 | 职责 |
| --- | --- | --- |
| Host | `index.js` | 维护持久索引、解析目录归属、关联目录会话、提供索引/配置路由、注入启动快照。 |
| Client | `client.js` | 过滤共享的 `workspaces.list` 与 `sessions.list` 投影、跟踪当前打开的会话、渲染设置页。 |

Host 数据放在当前 profile 下，和浏览器、插件代码目录都无关：

```text
<DSH_HOME>/profiles/<profile>/data/lazy-workspace-manager/index.json   # 工作区与会话索引，内容变化时每 30 秒重建
<DSH_HOME>/profiles/<profile>/data/lazy-workspace-manager/config.json  # 启动默认目录
```

索引从 `workspaceRegistry` 与 `sessionQuery` 重算，标题来自标题快照和内置回退标题；只有内容变化时才写盘。

Web 路由：

| 路由 | 用途 |
| --- | --- |
| `GET /lazy-workspace-manager/index.json` | 打开中的页面读取实时索引。 |
| `GET/POST /lazy-workspace-manager/config.json` | 读取或替换启动默认目录（`{"defaults": ["<workspace-id>", ...]}`）。 |
| `GET /lazy-workspace-manager/diagnostics` | 包、Host、客户端 bundle、数据文件与默认目录数量。 |

启动时同样的内容会注入为 `window.__DSH_LAZY_WORKSPACE_MANAGER__` 和 `window.__DSH_LAZY_WORKSPACE_MANAGER_CONFIG__`，所以首帧就知道索引和默认目录。

客户端没有复制一套 Workspace 服务：它在插件激活期间临时包装共享的 `workspaces.list` / `sessions.list` 快照，卸载插件时恢复原始描述符。因此“卸载目录”纯粹是视图操作——不会移动、改写或删除任何会话。

## 隐私

所有数据都留在本机。插件不发起网络请求、不收集遥测，只在 profile 的数据目录里保存工作区 ID、路径、标题和会话元数据。

## 限制

- 只在 Windows 上的 DSH **0.2.1-rc.2** Web 验证过。它使用的 Host 服务和客户端插槽由 DSH 提供，但其他平台和未来 DSH 版本未测试。
- 启动偏好是一组 Workspace ID。删除工作区注册后，`config.json` 里会留下失效 ID；在重新注册该目录之前会被忽略。
- 空白草稿和已归档会话按设计不出现在列表里，但不会被删除。
- 插件依赖 Workspace 注册表的 `attachSession` 约定：只有会话的 `cwd` 与工作区路径一致时才能关联。

## 开发

```sh
npm run check   # 语法检查两半代码
npm test        # 五个行为测试，不需要启动 DSH
node test/render.mjs   # 用当前 profile 的数据预览设置页（Windows）
```

仓库结构：

```text
index.js              Host 半边
client.js             Client 半边（module-loader bundle）
cordis.patch.yml      bundle 插入的 Loader 行
locale/{en,zh}.json   设置分区标题和描述
icon.svg              设置图标
test/                 行为测试与实时预览
```

测试用桩替换 Host 服务和浏览器 module loader，因此可以在 DSH 之外运行，覆盖目录加载、刷新恢复、启动默认、打开会话跟踪、索引与配置路由。

## 许可证

[MIT](LICENSE)
