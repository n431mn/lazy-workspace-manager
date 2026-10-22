// lazy-workspace-manager — the profile links to a stable checkout outside any
// working tree, so clearing a project folder never removes the plugin.
window.__ModuleLoader__.load({
  id: 'lazy-workspace-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'lazyWorkspaceManager'

    const en = {
      'section.label': 'Workspaces by folder',
      'page.title': 'Workspaces by folder',
      'page.intro': 'The sidebar only lists the folders loaded here, together with their sessions. A page reload keeps them; a fresh launch starts empty, loads the folder of the conversation DSH opens on launch, and you add or load the others as needed.',
      'page.sidebarDelete': 'The sidebar’s “Delete workspace” acts as unload in this plugin: it removes the folder and its sessions from the sidebar without deleting the registration or moving sessions anywhere.',
      'page.add': 'Add folder…',
      'page.clear': 'Unload all',
      'page.loadedOf': '{loaded} of {total} folders loaded',
      'page.empty': 'No folder is registered yet. Add the folder whose conversations you want to see.',
      'page.stateLoaded': 'Loaded',
      'page.stateUnloaded': 'Not loaded',
      'page.sessions': '{count} sessions',
      'page.sessionList': 'Sessions ({count})',
      'page.noSessions': 'No sessions recorded for this folder yet.',
      'page.orphanSessions': 'Sessions without a folder ({count})',
      'page.orphanHint': 'Sessions that belong to no registered folder; click one to open it.',
      'page.untitled': 'Untitled',
      'page.blankHidden': '{count} blank sessions hidden',
      'page.archivedHidden': '{count} archived sessions hidden',
      'page.defaultHint': 'Tick “load at startup” on a folder to have it loaded automatically every time DSH starts or a page is reloaded.',
      'page.defaultToggle': 'Load at startup',
      'page.defaultTitle': 'Always load {path}',
      'page.load': 'Load this folder',
      'page.unload': 'Unload this folder',
      'page.delete': 'Delete registration…',
      'page.deleteConfirm': 'Delete registration',
      'page.cancel': 'Cancel',
      'page.deleteWarning': 'Deleting the registration moves this folder’s sessions out of every folder. They stay hidden here unless “Show sessions that are not loaded” is on.',
      'page.hidden': 'Show sessions that are not loaded',
      'page.hiddenHint': '{count} sessions sit outside the loaded folders (from unloaded folders or no folder at all); they appear under “Ungrouped” in the sidebar.',
      'page.index': 'Index file: {file}',
      'page.indexMeta': 'Updated {updatedAt} · {workspaces} workspaces · {sessions} sessions',
      'page.indexMissing': 'The Host index file is not available yet; counts fall back to the live session list.',
      'page.failed': 'The operation failed: {message}',
    }
    const zh = {
      'section.label': '按目录加载',
      'page.title': '按目录加载工作区',
      'page.intro': '左侧只列出在这里加载的目录及其会话。刷新页面会保留已加载的目录；重新启动时从空开始，只自动加载 DSH 打开的那个会话所在目录，其余目录按需添加或加载。',
      'page.sidebarDelete': '本插件把侧栏的“删除工作区”改为“卸载”：只从左侧移除该目录及其会话，不删除注册，也不会把会话移入“未分组”。',
      'page.add': '添加目录…',
      'page.clear': '全部卸载',
      'page.loadedOf': '已加载 {loaded} / 共 {total} 个目录',
      'page.empty': '还没有注册任何目录。添加需要查看的目录即可开始。',
      'page.stateLoaded': '已加载',
      'page.stateUnloaded': '未加载',
      'page.sessions': '{count} 个会话',
      'page.sessionList': '会话（{count}）',
      'page.noSessions': '这个目录还没有会话。',
      'page.orphanSessions': '无目录的会话（{count}）',
      'page.orphanHint': '不属于任何已注册目录的会话；点击可打开。',
      'page.untitled': '未命名',
      'page.blankHidden': '{count} 个空白会话已隐藏',
      'page.archivedHidden': '{count} 个已归档会话已隐藏',
      'page.defaultHint': '勾选目录上的“启动时自动加载”，DSH 每次启动或刷新页面时都会自动加载该目录。',
      'page.defaultToggle': '启动时自动加载',
      'page.defaultTitle': '始终加载 {path}',
      'page.load': '加载此目录',
      'page.unload': '卸载此目录',
      'page.delete': '删除注册…',
      'page.deleteConfirm': '确认删除注册',
      'page.cancel': '取消',
      'page.deleteWarning': '删除注册会把该目录的会话移出所有目录；除非开启“显示未加载的会话”，否则它们不会出现在左侧。',
      'page.hidden': '显示未加载的会话',
      'page.hiddenHint': '有 {count} 个会话不在已加载的目录中（来自未加载的目录，或不属于任何目录），开启后会显示在侧栏的“未分组”里。',
      'page.index': '索引文件：{file}',
      'page.indexMeta': '更新于 {updatedAt} · {workspaces} 个工作区 · {sessions} 个会话',
      'page.indexMissing': 'Host 索引文件暂不可用，计数回退到实时会话列表。',
      'page.failed': '操作失败：{message}',
    }

    // ---------------------------------------------------------------- helpers

    /** Small observable snapshot store with identity-stable values. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        source: {
          getSnapshot: () => value,
          subscribe: (listener) => {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        },
        read: () => value,
        set(next) {
          if (Object.is(next, value)) return
          value = next
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch (error) {
              console.error('[lazy-workspace-manager] listener failed', error)
            }
          }
        },
      }
    }

    function sameItems(left, right) {
      if (left === right) return true
      if (!left || !right || left.length !== right.length) return false
      for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) return false
      }
      return true
    }

    function isRetained(row) {
      if (!row || !row.retainedBy) return false
      for (const count of Object.values(row.retainedBy)) {
        if (typeof count === 'number' && count > 0) return true
      }
      return false
    }

    /** Whether the main conversation view currently holds this Session open. */
    function isOpenInMainView(row) {
      return Boolean(row && row.retainedBy && typeof row.retainedBy.mainView === 'number' && row.retainedBy.mainView > 0)
    }

    /**
     * Normalize a directory spelling for value comparison.
     * Windows drive paths compare case-insensitively; POSIX paths keep their case.
     * @param value - absolute path candidate.
     * @returns the comparison key, or null when the value is not a usable path.
     */
    function normalizeCwd(value) {
      if (typeof value !== 'string') return null
      let text = value.trim().replace(/[\\/]+$/, '')
      if (text.length === 0) return null
      text = text.replace(/\//g, '\\')
      return /^[a-zA-Z]:\\/.test(text) ? text.toLowerCase() : text
    }

    function messageOf(error) {
      if (!error) return 'unknown error'
      if (typeof error === 'string') return error
      const code = error.rpcError && error.rpcError.code
      const text = error.message || String(error)
      return code ? code + ': ' + text : text
    }

    const EMPTY_STATS = { workspaces: [], loaded: 0, total: 0, hidden: 0, showHidden: false, sessions: [], index: null, defaults: [] }

    /**
     * Accept one Host index value in any of its transport shapes.
     * @param value - injected global or route payload.
     * @returns the normalized index, or null when the value is not an index.
     */
    function normalizeIndex(value) {
      if (!value || typeof value !== 'object' || value.version !== 1) return null
      return {
        version: 1,
        file: typeof value.file === 'string' ? value.file : null,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null,
        workspaces: Array.isArray(value.workspaces) ? value.workspaces : [],
        sessions: Array.isArray(value.sessions) ? value.sessions : [],
      }
    }

    /**
     * Read the Host-maintained index injected into the page.
     * @returns the index value, or null when the Host half is absent.
     */
    function readInjectedIndex() {
      return normalizeIndex(typeof window === 'undefined' ? undefined : window.__DSH_LAZY_WORKSPACE_MANAGER__)
    }

    /**
     * Read the operator preferences injected into the page.
     * @returns `{ defaults }` with the folders marked for automatic loading.
     */
    function readInjectedConfig() {
      const value = typeof window === 'undefined' ? undefined : window.__DSH_LAZY_WORKSPACE_MANAGER_CONFIG__
      const list = value && typeof value === 'object' && Array.isArray(value.defaults) ? value.defaults : []
      return { defaults: list.filter((id) => typeof id === 'string' && id.length > 0) }
    }

    // ------------------------------------------------- folder-scoped loading

    /**
     * Narrow the sidebar's Workspace and Session projections to the folders the
     * operator loaded on this page. Both projections are shared observable
     * sources, so the shipped browser keeps rendering its own UI from them.
     *
     * @param ctx - Client root context.
     * @param index - Host index injected into the page, or null.
     * @param config - Host preferences injected into the page, or null.
     * @returns the settings share and a disposer.
     */
    function installFolderScope(ctx, index, config) {
      let indexValue = index || null
      let indexWorkspaces = indexValue ? indexValue.workspaces : []
      let indexSessions = indexValue ? indexValue.sessions : []
      let indexSignature = indexValue ? JSON.stringify([indexValue.updatedAt, indexValue.workspaces, indexValue.sessions]) : ''
      const workspaceService = ctx.workspaces
      const sessionService = ctx.sessions
      const workspaceSource = workspaceService && workspaceService.list
      const sessionSource = sessionService && sessionService.list
      if (!workspaceSource || !sessionSource) {
        console.warn('[lazy-workspace-manager] workspace/session list sources are missing; staying inactive')
        return {
          stats: createStore(EMPTY_STATS),
          load() {},
          unload() {},
          unloadAll() {},
          setShowHidden() {},
          removeRegistration: async () => undefined,
          applyIndex: () => false,
          applyConfig: () => false,
          setDefault: () => [],
          defaults: () => [],
          onFolderLoaded() {},
          syncOpenSession() {},
          dispose() {},
        }
      }

      const rawWorkspaceSnapshot = workspaceSource.getSnapshot.bind(workspaceSource)
      const rawWorkspaceSubscribe = workspaceSource.subscribe.bind(workspaceSource)
      const rawSessionSnapshot = sessionSource.getSnapshot.bind(sessionSource)
      const rawSessionSubscribe = sessionSource.subscribe.bind(sessionSource)
      const rawCreate = typeof workspaceSource.create === 'function' ? workspaceSource.create.bind(workspaceSource) : undefined
      const rawInitializeDefault = typeof workspaceSource.initializeDefault === 'function' ? workspaceSource.initializeDefault.bind(workspaceSource) : undefined
      const rawDelete = typeof workspaceSource.delete === 'function' ? workspaceSource.delete.bind(workspaceSource) : undefined

      const loaded = new Set()
      const seen = new Set()
      let baseline = false
      let showHidden = false
      let generation = 0
      let queued = false
      let lastOpenSession = null
      let onFolderLoaded = null
      /** Folders the operator marked for automatic loading. */
      const defaults = new Set()
      const initialDefaults = config && Array.isArray(config.defaults) ? config.defaults : []
      for (const workspaceId of initialDefaults) {
        if (typeof workspaceId === 'string' && workspaceId.length > 0) defaults.add(workspaceId)
      }

      const listeners = new Set()
      const stats = createStore(EMPTY_STATS)
      const EMPTY_WORKSPACES = { items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'loading', phase: 'pending', error: null }

      const readRaw = () => {
        try {
          return rawWorkspaceSnapshot()
        } catch (error) {
          console.error('[lazy-workspace-manager] workspace snapshot failed', error)
          return undefined
        }
      }

      const readRawSessions = () => {
        try {
          return rawSessionSnapshot()
        } catch (error) {
          console.error('[lazy-workspace-manager] session snapshot failed', error)
          return { ids: [], byId: {} }
        }
      }

      /**
       * Replace the Host index kept in this page.
       *
       * The page boots with the index the HTML carried; the live route is newer
       * whenever a Session was created or a title folded afterwards. Accepting a
       * value is cheap and idempotent, so the settings page can poll it.
       *
       * @param next - normalized index value, or null.
       * @returns whether the page observed a new record.
       */
      function applyIndex(next) {
        if (!next) return false
        const signature = JSON.stringify([next.updatedAt, next.workspaces, next.sessions])
        if (signature === indexSignature) return false
        indexSignature = signature
        indexValue = next
        indexWorkspaces = next.workspaces
        indexSessions = next.sessions
        generation += 1
        schedule()
        return true
      }

      function publishStats(raw) {
        if (!raw) return
        const workspaces = []
        let loadedCount = 0
        const memberOf = new Map()
        for (const workspace of raw.items) {
          const isLoaded = loaded.has(workspace.workspaceId)
          if (isLoaded) loadedCount += 1
          for (const sessionId of workspace.sessionIds) memberOf.set(sessionId, workspace.workspaceId)
          workspaces.push({
            workspaceId: workspace.workspaceId,
            title: workspace.title,
            path: workspace.path,
            sessionCount: workspace.sessionIds.length,
            loaded: isLoaded,
          })
        }

        // One row per Session, from two sources: the Host index (durable identity,
        // cwd, folded title, folder attribution) and the live client projection
        // (the page's own title/blank/archived view). The live view wins wherever
        // it knows more, so a blank draft is recognized instead of guessed.
        const live = readRawSessions()
        const archived = new Set(raw.archivedSessionIds || [])
        const rows = new Map()
        for (const session of indexSessions) {
          const sessionId = session && typeof session.sessionId === 'string' ? session.sessionId : null
          if (sessionId === null) continue
          const titleAt = typeof session.titleUpdatedAt === 'number' ? session.titleUpdatedAt : null
          const createdAt = typeof session.createdAt === 'number' ? session.createdAt : null
          rows.set(sessionId, {
            sessionId,
            workspaceId: typeof session.folderId === 'string'
              ? session.folderId
              : (typeof session.workspaceId === 'string' ? session.workspaceId : null),
            title: typeof session.title === 'string' && session.title.length > 0 ? session.title : null,
            cwd: typeof session.cwd === 'string' ? session.cwd : null,
            origin: session.origin === 'subagent' ? 'subagent' : null,
            updatedAt: titleAt !== null ? titleAt : (createdAt !== null ? createdAt : 0),
            blank: false,
            archived: archived.has(sessionId),
          })
        }
        for (const sessionId of live.ids) {
          const entry = live.byId ? live.byId[sessionId] : undefined
          if (!entry) continue
          const previous = rows.get(sessionId)
          const liveTitle = typeof entry.title === 'string' && entry.title.length > 0 ? entry.title : null
          const liveUpdated = typeof entry.updatedAt === 'number' ? entry.updatedAt : 0
          rows.set(sessionId, {
            sessionId,
            workspaceId: memberOf.get(sessionId) ?? (previous ? previous.workspaceId : null),
            title: liveTitle !== null ? liveTitle : (previous ? previous.title : null),
            cwd: typeof entry.cwd === 'string' ? entry.cwd : (previous ? previous.cwd : null),
            origin: entry.origin === 'subagent' ? 'subagent' : (previous ? previous.origin : null),
            updatedAt: liveUpdated > 0 ? liveUpdated : (previous ? previous.updatedAt : 0),
            blank: entry.blank === true,
            archived: archived.has(sessionId),
          })
        }
        const sessions = [...rows.values()].sort((left, right) => right.updatedAt - left.updatedAt)

        let hidden = 0
        for (const session of sessions) {
          if (session.blank || session.archived) continue
          if (session.origin === 'subagent') continue
          if (session.workspaceId !== null && loaded.has(session.workspaceId)) continue
          hidden += 1
        }

        stats.set({
          workspaces,
          loaded: loadedCount,
          total: raw.items.length,
          hidden,
          showHidden,
          sessions,
          defaults: [...defaults],
          index: indexValue
            ? {
                file: indexValue.file,
                updatedAt: indexValue.updatedAt,
                workspaces: indexWorkspaces.length,
                sessions: indexSessions.length,
              }
            : null,
        })
        // Never let the auto-load change break the projection it runs inside:
        // publishStats is called from another package's subscription dispatch.
        try {
          followOpenSession(raw)
        } catch (error) {
          console.error('[lazy-workspace-manager] open-Session tracking failed', error)
        }
      }

      function flush() {
        queued = false
        publishStats(readRaw())
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch (error) {
            console.error('[lazy-workspace-manager] subscriber failed', error)
          }
        }
      }

      function schedule() {
        if (queued) return
        queued = true
        queueMicrotask(flush)
      }

      /**
       * Remember the loaded folders for this tab.
       *
       * A page reload is not a new launch: it must keep showing what the operator
       * had loaded, otherwise the sidebar comes back empty and DSH has no Workspace
       * to open a conversation from. `sessionStorage` is the right lifetime — it
       * survives reloads in this tab and is gone in a fresh one, so a real restart
       * still starts from nothing.
       */
      const STORAGE_KEY = 'lazy-workspace-manager:loaded:v1'

      function readStoredFolders() {
        try {
          if (typeof window === 'undefined' || !window.sessionStorage) return []
          const text = window.sessionStorage.getItem(STORAGE_KEY)
          if (typeof text !== 'string' || text.length === 0) return []
          const parsed = JSON.parse(text)
          if (!Array.isArray(parsed)) return []
          return parsed.filter((id) => typeof id === 'string' && id.length > 0)
        } catch (error) {
          return []
        }
      }

      function storeFolders() {
        try {
          if (typeof window === 'undefined' || !window.sessionStorage) return
          window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...loaded]))
        } catch (error) {
          // A browser that refuses storage only loses the reload restoration.
        }
      }

      for (const workspaceId of readStoredFolders()) {
        loaded.add(workspaceId)
        seen.add(workspaceId)
      }

      // Folders the operator marked "load at startup" are loaded before the first
      // render, exactly like the ones restored from this tab.
      for (const workspaceId of defaults) {
        loaded.add(workspaceId)
        seen.add(workspaceId)
      }

      /**
       * Replace the folder preference set.
       * @param value - `{ defaults }` from the Host.
       * @returns whether the set was accepted.
       */
      function applyConfig(value) {
        if (!value || !Array.isArray(value.defaults)) return false
        const next = value.defaults.filter((id) => typeof id === 'string' && id.length > 0)
        defaults.clear()
        for (const workspaceId of next) {
          defaults.add(workspaceId)
          markLoaded(workspaceId)
        }
        generation += 1
        schedule()
        return true
      }

      /**
       * Mark or unmark one folder for automatic loading.
       * @param workspaceId - folder to change.
       * @param value - true to load it on every page load.
       * @returns the complete preference list, for the Host write.
       */
      function setDefault(workspaceId, value) {
        if (typeof workspaceId !== 'string' || workspaceId.length === 0) return [...defaults]
        if (value === true) {
          defaults.add(workspaceId)
          markLoaded(workspaceId)
        } else {
          defaults.delete(workspaceId)
        }
        generation += 1
        schedule()
        return [...defaults]
      }

      const defaultList = () => [...defaults]

      function markLoaded(workspaceId) {
        if (typeof workspaceId !== 'string' || workspaceId.length === 0) return
        seen.add(workspaceId)
        if (loaded.has(workspaceId)) return
        loaded.add(workspaceId)
        storeFolders()
        generation += 1
        schedule()
      }

      function unload(workspaceId) {
        if (!loaded.delete(workspaceId)) return
        storeFolders()
        generation += 1
        schedule()
      }

      function unloadAll() {
        if (loaded.size === 0) return
        loaded.clear()
        storeFolders()
        generation += 1
        schedule()
      }

      function setShowHidden(value) {
        const next = value === true
        if (next === showHidden) return
        showHidden = next
        generation += 1
        schedule()
      }

      /**
       * Find the folder a Session belongs to.
       *
       * Registry ownership wins; otherwise the Host index records the folder the
       * Session's own `cwd` names. The live "Ungrouped" list is exactly what this
       * question must answer, so the lookup never depends on it.
       *
       * @param sessionId - Session to place.
       * @param raw - current raw Workspace projection, when available.
       * @returns the Workspace id, or null when no registered folder owns it.
       */
      function folderOfSession(sessionId, raw) {
        const known = new Set()
        if (raw) {
          for (const workspace of raw.items) {
            known.add(workspace.workspaceId)
            if (Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(sessionId)) return workspace.workspaceId
          }
        }
        for (const workspace of indexWorkspaces) {
          if (workspace && typeof workspace.workspaceId === 'string') known.add(workspace.workspaceId)
        }
        let cwd = null
        for (const session of indexSessions) {
          if (!session || session.sessionId !== sessionId) continue
          if (typeof session.folderId === 'string' && known.has(session.folderId)) return session.folderId
          if (typeof session.workspaceId === 'string' && known.has(session.workspaceId)) return session.workspaceId
          if (typeof session.cwd === 'string') cwd = normalizeCwd(session.cwd)
          break
        }
        if (cwd === null) {
          const live = readRawSessions()
          const row = live.byId ? live.byId[sessionId] : undefined
          if (row && typeof row.cwd === 'string') cwd = normalizeCwd(row.cwd)
        }
        if (cwd === null) return null
        if (raw) {
          for (const workspace of raw.items) {
            if (normalizeCwd(workspace.path) === cwd) return workspace.workspaceId
          }
        }
        for (const workspace of indexWorkspaces) {
          if (workspace && normalizeCwd(workspace.path) === cwd) return workspace.workspaceId
        }
        return null
      }

      /** The Session the main conversation view currently holds open, if any. */
      function openSessionId() {
        const live = readRawSessions()
        for (const sessionId of live.ids) {
          if (isOpenInMainView(live.byId ? live.byId[sessionId] : undefined)) return sessionId
        }
        return null
      }

      /**
       * Load the folder a Session belongs to, when it is registered and not loaded.
       * @param sessionId - the Session that was opened.
       * @param raw - current raw Workspace projection.
       * @returns the loaded Workspace id, or null when nothing had to change.
       */
      function ensureFolderOf(sessionId, raw) {
        const workspaceId = folderOfSession(sessionId, raw)
        if (workspaceId === null || loaded.has(workspaceId)) return null
        markLoaded(workspaceId)
        if (typeof onFolderLoaded === 'function') {
          try {
            onFolderLoaded(workspaceId, sessionId)
          } catch (error) {
            console.error('[lazy-workspace-manager] open-Session folder hook failed', error)
          }
        }
        return workspaceId
      }

      /**
       * Keep the folder of the Session that was just opened loaded.
       *
       * DSH restores one conversation on boot; without this it would belong to an
       * unloaded folder and drop into "Ungrouped", which is the one thing the
       * folder model must not do. Only a change of the open Session counts, so an
       * explicit unload of a folder stays in effect while its Session keeps the
       * main view.
       */
      function followOpenSession(raw) {
        const current = openSessionId()
        if (current === lastOpenSession) return
        lastOpenSession = current
        if (current === null) return
        ensureFolderOf(current, raw)
      }

      /** Record the baseline once, then treat later Workspace rows as operator additions. */
      function absorb(raw) {
        if (!raw || raw.phase !== 'ready') return
        if (!baseline) {
          baseline = true
          for (const workspace of raw.items) seen.add(workspace.workspaceId)
          // The stored set may name a folder that has since been deleted.
          const known = new Set(raw.items.map((workspace) => workspace.workspaceId))
          let pruned = false
          for (const workspaceId of [...loaded]) {
            if (known.has(workspaceId)) continue
            loaded.delete(workspaceId)
            pruned = true
          }
          if (pruned) storeFolders()
          return
        }
        for (const workspace of raw.items) {
          if (seen.has(workspace.workspaceId)) continue
          markLoaded(workspace.workspaceId)
        }
      }

      let workspaceCache = null
      function filteredWorkspaces() {
        const raw = readRaw()
        if (!raw) return EMPTY_WORKSPACES
        if (workspaceCache && workspaceCache.raw === raw && workspaceCache.generation === generation) return workspaceCache.out
        const items = raw.items.filter((workspace) => loaded.has(workspace.workspaceId))
        const previous = workspaceCache && workspaceCache.out
        let out
        if (
          previous
          && sameItems(previous.items, items)
          && previous.phase === raw.phase
          && previous.state === raw.state
          && previous.error === raw.error
          && previous.archivedSessionIds === raw.archivedSessionIds
          && previous.pinnedSessionIds === raw.pinnedSessionIds
        ) {
          out = previous
        } else {
          out = {
            items,
            archivedSessionIds: raw.archivedSessionIds,
            pinnedSessionIds: raw.pinnedSessionIds,
            state: raw.state,
            phase: raw.phase,
            error: raw.error,
          }
        }
        workspaceCache = { raw, generation, out }
        return out
      }

      let sessionCache = null
      function filteredSessions() {
        const raw = rawSessionSnapshot()
        const rawWorkspaces = readRaw()
        if (
          sessionCache
          && sessionCache.raw === raw
          && sessionCache.rawWorkspaces === rawWorkspaces
          && sessionCache.generation === generation
        ) {
          return sessionCache.out
        }
        const allowed = new Set()
        if (rawWorkspaces) {
          for (const workspace of rawWorkspaces.items) {
            if (!loaded.has(workspace.workspaceId)) continue
            for (const sessionId of workspace.sessionIds) allowed.add(sessionId)
          }
        }
        const baseIds = showHidden
          ? raw.ids.slice()
          : raw.ids.filter((sessionId) => allowed.has(sessionId) || isRetained(raw.byId[sessionId]))

        // A Workspace that was just loaded must show its sessions even when the
        // live list has not caught up yet: synthesize the missing rows from the
        // Host index (identity, title, cwd, last activity). The synthesized map
        // is memoized so the snapshot identity stays stable across renders.
        const previous = sessionCache && sessionCache.out
        const extras = []
        for (const session of indexSessions) {
          if (!session || typeof session.sessionId !== 'string') continue
          if (raw.byId[session.sessionId] !== undefined) continue
          if (!session.workspaceId || !loaded.has(session.workspaceId)) continue
          if (baseIds.indexOf(session.sessionId) !== -1) continue
          extras.push(session)
        }
        const extraKey = extras.map((session) => session.sessionId).join('|')
        let ids = baseIds
        let byId = raw.byId
        if (extras.length > 0) {
          const reuse = previous && sessionCache.rawById === raw.byId && sessionCache.extraKey === extraKey
          if (reuse) {
            byId = previous.byId
          } else {
            byId = { ...raw.byId }
            for (const session of extras) {
              byId[session.sessionId] = {
                id: session.sessionId,
                displayTitle: typeof session.title === 'string' && session.title.length > 0
                  ? session.title
                  : (session.cwd || session.sessionId),
                cwd: session.cwd || undefined,
                retainedBy: {},
                blank: false,
                running: false,
                updatedAt: typeof session.titleUpdatedAt === 'number'
                  ? session.titleUpdatedAt
                  : (typeof session.createdAt === 'number' ? session.createdAt : 0),
              }
            }
          }
          ids = baseIds.concat(extras.map((session) => session.sessionId))
        }

        let out
        if (
          previous
          && sameItems(previous.ids, ids)
          && previous.byId === byId
          && previous.phase === raw.phase
          && previous.projectionsBySession === raw.projectionsBySession
        ) {
          out = previous
        } else {
          out = { ids, byId, phase: raw.phase, projectionsBySession: raw.projectionsBySession }
        }
        sessionCache = { raw, rawWorkspaces, generation, rawById: raw.byId, extraKey, out }
        return out
      }

      const previousWorkspaceGet = Object.getOwnPropertyDescriptor(workspaceSource, 'getSnapshot')
      const previousWorkspaceSubscribe = Object.getOwnPropertyDescriptor(workspaceSource, 'subscribe')
      const previousWorkspaceCreate = Object.getOwnPropertyDescriptor(workspaceSource, 'create')
      const previousWorkspaceInitialize = Object.getOwnPropertyDescriptor(workspaceSource, 'initializeDefault')
      const previousWorkspaceDelete = Object.getOwnPropertyDescriptor(workspaceSource, 'delete')
      const previousSessionGet = Object.getOwnPropertyDescriptor(sessionSource, 'getSnapshot')

      const restore = (target, key, descriptor) => {
        try {
          if (descriptor) Object.defineProperty(target, key, descriptor)
          else delete target[key]
        } catch (error) {
          console.error('[lazy-workspace-manager] could not restore ' + key, error)
        }
      }

      const adopt = (result, label) => {
        try {
          const view = result && result.ok && result.value ? result.value.workspace : undefined
          if (view) markLoaded(view.workspaceId)
        } catch (error) {
          console.error('[lazy-workspace-manager] could not adopt the ' + label + ' workspace', error)
        }
        return result
      }

      // A filtering defect must degrade to the unfiltered projection instead of
      // throwing inside another package's render path.
      const safeWorkspaces = () => {
        try {
          return filteredWorkspaces()
        } catch (error) {
          console.error('[lazy-workspace-manager] workspace filtering failed', error)
          return readRaw() || EMPTY_WORKSPACES
        }
      }
      const safeSessions = () => {
        try {
          return filteredSessions()
        } catch (error) {
          console.error('[lazy-workspace-manager] session filtering failed', error)
          return rawSessionSnapshot()
        }
      }

      Object.defineProperty(workspaceSource, 'getSnapshot', { configurable: true, writable: true, value: safeWorkspaces })
      Object.defineProperty(workspaceSource, 'subscribe', {
        configurable: true,
        writable: true,
        value: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
      })
      Object.defineProperty(sessionSource, 'getSnapshot', { configurable: true, writable: true, value: safeSessions })

      if (rawCreate) {
        Object.defineProperty(workspaceSource, 'create', {
          configurable: true,
          writable: true,
          value: async (input) => adopt(await rawCreate(input), 'created'),
        })
      }

      if (rawInitializeDefault) {
        Object.defineProperty(workspaceSource, 'initializeDefault', {
          configurable: true,
          writable: true,
          value: async (...args) => adopt(await rawInitializeDefault(...args), 'default'),
        })
      }

      if (rawDelete) {
        // "Delete workspace" becomes "unload": the registration, the directory,
        // and every session log stay exactly where they are; the folder and its
        // sessions merely leave the sidebar, ready to be loaded again.
        Object.defineProperty(workspaceSource, 'delete', {
          configurable: true,
          writable: true,
          value: async (workspaceId) => {
            unload(workspaceId)
            return { ok: true, value: { deleted: true } }
          },
        })
      }

      // Opening a Session is the one navigation that must never strand a
      // conversation in "Ungrouped". Both navigation entry points route through
      // the Workspace service, so wrapping them loads the folder before the
      // conversation is revealed — including a Session that is already open and
      // therefore produces no new retention event.
      const uiWorkspace = ctx.uiWorkspace
      const previousOpenSession = uiWorkspace ? Object.getOwnPropertyDescriptor(uiWorkspace, 'openSession') : undefined
      const previousOpenWorkspace = uiWorkspace ? Object.getOwnPropertyDescriptor(uiWorkspace, 'openWorkspace') : undefined
      const rawOpenSession = uiWorkspace && typeof uiWorkspace.openSession === 'function'
        ? uiWorkspace.openSession.bind(uiWorkspace)
        : undefined
      const rawOpenWorkspace = uiWorkspace && typeof uiWorkspace.openWorkspace === 'function'
        ? uiWorkspace.openWorkspace.bind(uiWorkspace)
        : undefined

      if (rawOpenSession) {
        try {
          Object.defineProperty(uiWorkspace, 'openSession', {
            configurable: true,
            writable: true,
            value: (target) => {
              try {
                if (typeof target === 'string') {
                  lastOpenSession = target
                  ensureFolderOf(target, readRaw())
                }
              } catch (error) {
                console.error('[lazy-workspace-manager] could not load the folder of the opened Session', error)
              }
              return rawOpenSession(target)
            },
          })
        } catch (error) {
          // A sealed service keeps the retention watcher as the only path.
          console.warn('[lazy-workspace-manager] could not observe Session navigation', error)
        }
      }

      if (rawOpenWorkspace) {
        try {
          Object.defineProperty(uiWorkspace, 'openWorkspace', {
            configurable: true,
            writable: true,
            value: (workspaceId, ...rest) => {
              try {
                if (typeof workspaceId === 'string') markLoaded(workspaceId)
              } catch (error) {
                console.error('[lazy-workspace-manager] could not load the opened workspace', error)
              }
              return rawOpenWorkspace(workspaceId, ...rest)
            },
          })
        } catch (error) {
          console.warn('[lazy-workspace-manager] could not observe Workspace navigation', error)
        }
      }

      absorb(readRaw())
      publishStats(readRaw())

      const disposeRaw = rawWorkspaceSubscribe(() => {
        absorb(readRaw())
        schedule()
      })

      // Session arrivals and summary updates change the hidden-session count,
      // so the settings share must follow that projection too.
      const disposeSessions = rawSessionSubscribe(() => {
        publishStats(readRaw())
      })

      return {
        stats,
        applyIndex,
        applyConfig,
        setDefault,
        defaults: defaultList,
        load: markLoaded,
        /** Called when an opened Session forces its folder into the sidebar. */
        onFolderLoaded(handler) {
          onFolderLoaded = typeof handler === 'function' ? handler : null
        },
        /** Re-check the open Session now (e.g. right after the page opens a Session). */
        syncOpenSession(sessionId) {
          try {
            if (typeof sessionId === 'string' && sessionId.length > 0) {
              // The page knows exactly which Session it just opened; do not wait
              // for the retention projection to arrive before placing it. When the
              // folder is not resolvable yet, leave the marker untouched so the
              // later projection update retries.
              if (folderOfSession(sessionId, readRaw()) === null) return
              lastOpenSession = sessionId
              ensureFolderOf(sessionId, readRaw())
              return
            }
            followOpenSession(readRaw())
          } catch (error) {
            console.error('[lazy-workspace-manager] open-Session tracking failed', error)
          }
        },
        unload,
        unloadAll,
        setShowHidden,
        async removeRegistration(workspaceId) {
          if (!rawDelete) return undefined
          const result = await rawDelete(workspaceId)
          if (result && result.ok === false) {
            const failure = result.error || {}
            throw new Error((failure.code ? failure.code + ': ' : '') + (failure.message || 'workspace delete failed'))
          }
          loaded.delete(workspaceId)
          storeFolders()
          generation += 1
          schedule()
          return result
        },
        dispose() {
          try {
            disposeRaw()
          } catch (error) {
            console.error('[lazy-workspace-manager] subscription disposal failed', error)
          }
          try {
            disposeSessions()
          } catch (error) {
            console.error('[lazy-workspace-manager] session subscription disposal failed', error)
          }
          listeners.clear()
          restore(workspaceSource, 'getSnapshot', previousWorkspaceGet)
          restore(workspaceSource, 'subscribe', previousWorkspaceSubscribe)
          if (rawCreate) restore(workspaceSource, 'create', previousWorkspaceCreate)
          if (rawInitializeDefault) restore(workspaceSource, 'initializeDefault', previousWorkspaceInitialize)
          if (rawDelete) restore(workspaceSource, 'delete', previousWorkspaceDelete)
          restore(sessionSource, 'getSnapshot', previousSessionGet)
          if (uiWorkspace) restore(uiWorkspace, 'openSession', previousOpenSession)
          if (uiWorkspace) restore(uiWorkspace, 'openWorkspace', previousOpenWorkspace)
        },
      }
    }

    // ------------------------------------------------------------------- views

    const CSS = [
      '.lwz-page{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex;padding-top:8px}',
      '.lwz-title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}',
      '.lwz-intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}',
      '.lwz-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}',
      '.lwz-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:4px}',
      '.lwz-spacer{flex:1}',
      '.lwz-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.lwz-btn{box-sizing:border-box;height:32px;padding:0 12px;border-radius:var(--dsw-radius-md);font:inherit;',
      'font-size:13px;line-height:20px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:4px;border:none}',
      '.lwz-btn:disabled{opacity:.4;cursor:default}',
      '.lwz-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.lwz-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.lwz-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.lwz-btn-secondary{border:.5px solid var(--dsw-alias-border-l3);background:0 0;color:var(--dsw-alias-label-primary)}',
      '.lwz-btn-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '.lwz-btn-danger{border:.5px solid var(--dsw-alias-state-error-primary);background:0 0;color:var(--dsw-alias-state-error-primary);height:28px;font-size:12px;padding:0 10px}',
      '.lwz-btn-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}',
      '.lwz-rows{flex-direction:column;gap:8px;margin:12px 0 0;padding:0;list-style:none;display:flex}',
      '.lwz-card{border:.5px solid var(--dsw-alias-settings-card-stroke);background:var(--dsw-alias-settings-card-fill);',
      'border-radius:var(--dsw-radius-xl);align-items:center;gap:12px;padding:12px 14px;display:flex}',
      '.lwz-card-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}',
      '.lwz-name{font-size:14px;font-weight:500;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lwz-path{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lwz-sub{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.lwz-card-actions{display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex:none}',
      '.lwz-icon-btn{box-sizing:border-box;width:28px;height:28px;border-radius:var(--dsw-radius-sm);border:none;background:0 0;',
      'color:var(--dsw-alias-label-tertiary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0}',
      '.lwz-icon-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}',
      '.lwz-icon-btn:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.lwz-switch{position:relative;box-sizing:border-box;flex:none;width:36px;height:20px;padding:0;border:none;border-radius:999px;',
      'background:var(--dsw-alias-border-l3);cursor:pointer;transition:background .15s}',
      '.lwz-switch[aria-checked="true"]{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
      '.lwz-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;',
      'background:var(--dsw-alias-bg-base);transition:transform .15s}',
      '.lwz-switch[aria-checked="true"]::after{transform:translateX(16px)}',
      '.lwz-switch:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.lwz-switch:disabled{opacity:.4;cursor:default}',
      '.lwz-default{display:inline-flex;align-items:center;gap:6px;margin-top:2px;color:var(--dsw-alias-label-tertiary);',
      'font-size:12px;line-height:18px;cursor:pointer;user-select:none}',
      '.lwz-default:has(input:disabled){opacity:.4;cursor:default}',
      '.lwz-default input{width:13px;height:13px;margin:0;accent-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));cursor:inherit}',
      '.lwz-empty{border:1px dashed var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-lg);text-align:center;',
      'padding:12px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.lwz-error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}',
      '.lwz-warning{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary));margin:0;font-size:12px;line-height:18px}',
      '.lwz-toggle-row{display:flex;align-items:center;gap:12px;padding:12px 0 0;border-top:.5px solid var(--dsw-alias-border-l2);margin-top:4px}',
      '.lwz-toggle-main{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}',
      '.lwz-entry{display:flex;flex-direction:column;gap:4px}',
      '.lwz-disclosure{display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-left:26px;padding:2px 6px;',
      'border:0;border-radius:6px;background:0 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;',
      'line-height:18px;cursor:pointer}',
      '.lwz-disclosure:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
      '.lwz-disclosure:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.lwz-session-list{list-style:none;margin:0 0 2px 32px;padding:0;display:flex;flex-direction:column;gap:1px;max-height:260px;overflow:auto}',
      '.lwz-session{display:flex;align-items:center;gap:8px;width:100%;padding:3px 6px;border:0;border-radius:6px;',
      'background:0 0;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer}',
      '.lwz-session:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.lwz-session:focus-visible{outline:none;box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}',
      '.lwz-session-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.lwz-session-meta{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}',
      '.lwz-indent{margin-left:32px}',
      '.lwz-orphans{margin-top:8px;padding-top:8px;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '@media (prefers-reduced-motion:reduce){.lwz-switch,.lwz-switch::after{transition:none}}',
    ].join('')

    function FolderGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, fill: 'none', style: { flex: 'none' } },
        h('path', {
          d: 'M1.75 4.25A1.5 1.5 0 0 1 3.25 2.75h2.6c.4 0 .78.16 1.06.44l.9.9h3.94a1.5 1.5 0 0 1 1.5 1.5v6.16a1.5 1.5 0 0 1-1.5 1.5H3.25a1.5 1.5 0 0 1-1.5-1.5z',
          stroke: 'currentColor',
          strokeWidth: 1.3,
          strokeLinejoin: 'round',
        }),
      )
    }

    function TrashGlyph() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, fill: 'none' },
        h('path', {
          d: 'M3.5 4.5h9M6.5 4.5V3.25h3V4.5M5 4.5l.5 7.25h5L11 4.5',
          stroke: 'currentColor',
          strokeWidth: 1.2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function ChevronGlyph(props) {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 12,
          height: 12,
          'aria-hidden': true,
          fill: 'none',
          style: {
            flex: 'none',
            transform: props && props.open ? 'rotate(90deg)' : 'none',
            transition: 'transform .12s',
          },
        },
        h('path', {
          d: 'M6 3.5L10.5 8L6 12.5',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        className: 'lwz-switch',
        role: 'switch',
        'aria-checked': props.checked ? 'true' : 'false',
        'aria-label': props.label,
        title: props.label,
        disabled: props.disabled === true,
        onClick: () => props.onChange(!props.checked),
      })
    }

    // ------------------------------------------------------------------- apply

    const inject = ['slots', 'locale', 'workspaces', 'sessions', 'uiWorkspace']

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'lazy-workspace-manager: dictionaries')
      const t = ctx.locale.bind(NS)

      /** Ask the Host for the authoritative Session list after a folder starts showing. */
      const refreshSessions = async () => {
        try {
          if (ctx.sessions && typeof ctx.sessions.refresh === 'function') await ctx.sessions.refresh()
        } catch (error) {
          console.warn('[lazy-workspace-manager] session list refresh failed', error)
        }
      }

      let scope
      ctx.effect(() => {
        try {
          scope = installFolderScope(ctx, readInjectedIndex(), readInjectedConfig())
          // Opening a Session loads its folder: the Host must then deliver that
          // folder's Session list, exactly as a manual load does.
          if (scope && typeof scope.onFolderLoaded === 'function') {
            scope.onFolderLoaded(() => void refreshSessions())
          }
        } catch (error) {
          console.error('[lazy-workspace-manager] folder scope could not start', error)
          scope = undefined
        }
        return () => {
          if (scope) scope.dispose()
        }
      }, 'lazy-workspace-manager: folder scope')

      const fallbackStats = createStore(EMPTY_STATS)
      const readStats = () => (scope ? scope.stats.source : fallbackStats.source)

      /**
       * Read the Host's live index.
       *
       * The injected global is a boot snapshot: a Session created afterwards, or a
       * title folded afterwards, only exists in the live route. The settings page
       * therefore polls it while it is open, so counts and titles follow the
       * registry instead of the page load.
       */
      const refreshIndex = async () => {
        if (!scope || typeof scope.applyIndex !== 'function') return
        if (typeof fetch !== 'function') return
        try {
          const response = await fetch('/lazy-workspace-manager/index.json', {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          if (!response || response.ok !== true) return
          scope.applyIndex(normalizeIndex(await response.json()))
        } catch (error) {
          // The boot snapshot stays in charge while the live read is unavailable.
        }
      }
      void refreshIndex()

      /**
       * Read the Host preferences (folders marked for automatic loading).
       *
       * The injected value is a boot snapshot; reading the route keeps an open
       * Settings page consistent with a change made in another tab.
       */
      const refreshConfig = async () => {
        if (!scope || typeof scope.applyConfig !== 'function') return
        if (typeof fetch !== 'function') return
        try {
          const response = await fetch('/lazy-workspace-manager/config.json', {
            cache: 'no-store',
            headers: { accept: 'application/json' },
          })
          if (!response || response.ok !== true) return
          scope.applyConfig(await response.json())
        } catch (error) {
          // The injected value stays in charge while the live read is unavailable.
        }
      }
      void refreshConfig()

      /**
       * Persist the folder preference set.
       * @param list - complete list of Workspace ids to load on every page load.
       * @returns the stored configuration.
       */
      const saveDefaults = async (list) => {
        const response = await fetch('/lazy-workspace-manager/config.json', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ defaults: list }),
        })
        if (!response || response.ok !== true) {
          throw new Error('HTTP ' + (response ? response.status : 'unknown'))
        }
        return response.json()
      }

      function SettingsPage(props) {
        const { useStats, t: translate, addFolder, loadWorkspace, unloadWorkspace, unloadAll, setShowHidden, setDefault, removeRegistration, openSession, close } = props
        const stats = useStats((value) => value)
        const [busy, setBusy] = React.useState(false)
        const [error, setError] = React.useState(null)
        const [pendingDelete, setPendingDelete] = React.useState(null)
        const [expanded, setExpanded] = React.useState({})

        const workspaces = stats && stats.workspaces ? stats.workspaces : []
        const loadedCount = stats && typeof stats.loaded === 'number' ? stats.loaded : 0
        const total = stats && typeof stats.total === 'number' ? stats.total : workspaces.length
        const hidden = stats && typeof stats.hidden === 'number' ? stats.hidden : 0
        const hiddenShown = stats && stats.showHidden === true
        const sessions = stats && Array.isArray(stats.sessions) ? stats.sessions : []
        const defaults = new Set(Array.isArray(stats && stats.defaults) ? stats.defaults : [])

        // Follow the Host record while the page stays open, and make sure the live
        // Session projection (blank flags and titles) is current when it opens.
        React.useEffect(() => {
          void refreshSessions()
          void refreshIndex()
          void refreshConfig()
          if (typeof setInterval !== 'function') return undefined
          const timer = setInterval(() => {
            void refreshIndex()
          }, 20_000)
          return () => clearInterval(timer)
        }, [])

        const run = (task) => {
          if (busy) return
          setBusy(true)
          setError(null)
          Promise.resolve()
            .then(task)
            .catch((reason) => setError(translate('page.failed', { message: messageOf(reason) })))
            .finally(() => setBusy(false))
        }

        const indexInfo = stats && stats.index ? stats.index : null
        const indexUpdated = indexInfo && indexInfo.updatedAt
          ? new Date(indexInfo.updatedAt).toLocaleString()
          : '—'

        const toggleExpanded = (key) => setExpanded((current) => ({ ...current, [key]: current[key] !== true }))

        // The overview mirrors the browser's row visibility: a draft Session that
        // never received a user turn ("blank") has no title and no content worth
        // listing, so it is counted separately instead of padding the list with
        // identical "Untitled" rows.
        const visible = []
        const blankByFolder = new Map()
        const archivedByFolder = new Map()
        for (const session of sessions) {
          if (!session || typeof session.sessionId !== 'string') continue
          if (session.origin === 'subagent') continue
          const folder = typeof session.workspaceId === 'string' ? session.workspaceId : ''
          if (session.archived === true) {
            archivedByFolder.set(folder, (archivedByFolder.get(folder) || 0) + 1)
            continue
          }
          if (session.blank === true) {
            blankByFolder.set(folder, (blankByFolder.get(folder) || 0) + 1)
            continue
          }
          visible.push(session)
        }

        const byWorkspace = new Map()
        const withoutFolder = []
        for (const session of visible) {
          const key = typeof session.workspaceId === 'string' ? session.workspaceId : ''
          if (key === '') {
            withoutFolder.push(session)
            continue
          }
          if (!byWorkspace.has(key)) byWorkspace.set(key, [])
          byWorkspace.get(key).push(session)
        }

        const sessionTitle = (session) => {
          if (typeof session.title === 'string' && session.title.length > 0) return session.title
          return translate('page.untitled')
        }
        const recency = (session) => (typeof session.updatedAt === 'number' ? session.updatedAt : 0)
        const sessionStamp = (session) => {
          const stamp = recency(session)
          return stamp > 0 ? new Date(stamp).toLocaleString() : ''
        }
        const open = (sessionId) => {
          close()
          openSession(sessionId)
        }

        const renderSessionList = (list, key) => {
          if (expanded[key] !== true) return null
          if (list.length === 0) return h('p', { className: 'lwz-hint lwz-indent' }, translate('page.noSessions'))
          return h(
            'ul',
            { className: 'lwz-session-list' },
            list.map((session) => h(
              'li',
              { key: session.sessionId },
              h(
                'button',
                {
                  type: 'button',
                  className: 'lwz-session',
                  title: session.cwd || session.sessionId,
                  onClick: () => open(session.sessionId),
                },
                h('span', { className: 'lwz-session-title' }, sessionTitle(session)),
                h('span', { className: 'lwz-session-meta' }, sessionStamp(session)),
              ),
            )),
          )
        }

        const disclosure = (key, count) => h(
          'button',
          {
            type: 'button',
            className: 'lwz-disclosure',
            'aria-expanded': expanded[key] === true ? 'true' : 'false',
            onClick: () => toggleExpanded(key),
          },
          h(ChevronGlyph, { open: expanded[key] === true }),
          translate('page.sessionList', { count }),
        )

        return h(
          'section',
          { className: 'lwz-page' },
          h('style', null, CSS),
          h('h2', { className: 'lwz-title' }, translate('page.title')),
          h('p', { className: 'lwz-intro' }, translate('page.intro')),
          h('p', { className: 'lwz-hint' }, translate('page.sidebarDelete')),
          h('p', { className: 'lwz-hint' }, translate('page.defaultHint')),
          indexInfo
            ? h('p', { className: 'lwz-hint' }, translate('page.index', { file: indexInfo.file || '—' }))
            : h('p', { className: 'lwz-hint' }, translate('page.indexMissing')),
          indexInfo
            ? h('p', { className: 'lwz-hint' }, translate('page.indexMeta', {
              updatedAt: indexUpdated,
              workspaces: indexInfo.workspaces,
              sessions: indexInfo.sessions,
            }))
            : null,
          h(
            'div',
            { className: 'lwz-toolbar' },
            h(
              'button',
              {
                type: 'button',
                className: 'lwz-btn lwz-btn-primary',
                disabled: busy,
                onClick: () => run(() => addFolder()),
              },
              translate('page.add'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'lwz-btn lwz-btn-secondary',
                disabled: busy || loadedCount === 0,
                onClick: () => run(() => unloadAll()),
              },
              translate('page.clear'),
            ),
            h('span', { className: 'lwz-spacer' }),
            h('span', { className: 'lwz-meta' }, translate('page.loadedOf', { loaded: loadedCount, total })),
          ),
          workspaces.length === 0
            ? h('div', { className: 'lwz-empty' }, translate('page.empty'))
            : h(
                'ul',
                { className: 'lwz-rows' },
                workspaces.map((workspace) => {
                  const list = byWorkspace.get(workspace.workspaceId) || []
                  const blankCount = blankByFolder.get(workspace.workspaceId) || 0
                  const archivedCount = archivedByFolder.get(workspace.workspaceId) || 0
                  return h(
                    'li',
                    { className: 'lwz-entry', key: workspace.workspaceId },
                    h(
                      'div',
                      { className: 'lwz-card' },
                      h(FolderGlyph, null),
                      h(
                        'div',
                        { className: 'lwz-card-main' },
                        h('div', { className: 'lwz-name', title: workspace.title }, workspace.title),
                        h('div', { className: 'lwz-path', title: workspace.path }, workspace.path),
                        h(
                          'div',
                          { className: 'lwz-sub' },
                          translate('page.sessions', { count: list.length })
                            + ' · '
                            + (workspace.loaded ? translate('page.stateLoaded') : translate('page.stateUnloaded'))
                            + (blankCount > 0 ? ' · ' + translate('page.blankHidden', { count: blankCount }) : '')
                            + (archivedCount > 0 ? ' · ' + translate('page.archivedHidden', { count: archivedCount }) : ''),
                        ),
                        h(
                          'label',
                          {
                            className: 'lwz-default',
                            title: translate('page.defaultTitle', { path: workspace.path }),
                          },
                          h('input', {
                            type: 'checkbox',
                            checked: defaults.has(workspace.workspaceId),
                            disabled: busy,
                            onChange: (event) => {
                              const next = event.target.checked
                              run(() => setDefault(workspace.workspaceId, next))
                            },
                          }),
                          translate('page.defaultToggle'),
                        ),
                        pendingDelete === workspace.workspaceId
                          ? h('p', { className: 'lwz-warning' }, translate('page.deleteWarning'))
                          : null,
                      ),
                      h(
                        'div',
                        { className: 'lwz-card-actions' },
                        pendingDelete === workspace.workspaceId
                          ? h(
                              React.Fragment,
                              null,
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lwz-btn lwz-btn-danger',
                                  disabled: busy,
                                  onClick: () => {
                                    setPendingDelete(null)
                                    run(() => removeRegistration(workspace.workspaceId))
                                  },
                                },
                                translate('page.deleteConfirm'),
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'lwz-btn lwz-btn-secondary',
                                  disabled: busy,
                                  style: { height: '28px', fontSize: '12px' },
                                  onClick: () => setPendingDelete(null),
                                },
                                translate('page.cancel'),
                              ),
                            )
                          : h(
                              'button',
                              {
                                type: 'button',
                                className: 'lwz-icon-btn',
                                title: translate('page.delete'),
                                'aria-label': translate('page.delete'),
                                disabled: busy,
                                onClick: () => setPendingDelete(workspace.workspaceId),
                              },
                              h(TrashGlyph, null),
                            ),
                        h(Switch, {
                          checked: workspace.loaded,
                          label: workspace.loaded ? translate('page.unload') : translate('page.load'),
                          disabled: busy,
                          onChange: (next) => run(() => (next ? loadWorkspace(workspace.workspaceId) : unloadWorkspace(workspace.workspaceId))),
                        }),
                      ),
                    ),
                    disclosure('ws:' + workspace.workspaceId, list.length),
                    renderSessionList(list, 'ws:' + workspace.workspaceId),
                  )
                }),
              ),
          h(
            'div',
            { className: 'lwz-entry lwz-orphans' },
            h(
              'div',
              { className: 'lwz-card' },
              h(FolderGlyph, null),
              h(
                'div',
                { className: 'lwz-card-main' },
                h('div', { className: 'lwz-name' }, translate('page.orphanSessions', { count: withoutFolder.length })),
                h(
                  'div',
                  { className: 'lwz-sub' },
                  translate('page.orphanHint')
                    + ((blankByFolder.get('') || 0) > 0
                      ? ' · ' + translate('page.blankHidden', { count: blankByFolder.get('') })
                      : '')
                    + ((archivedByFolder.get('') || 0) > 0
                      ? ' · ' + translate('page.archivedHidden', { count: archivedByFolder.get('') })
                      : ''),
                ),
              ),
            ),
            disclosure('orphans', withoutFolder.length),
            renderSessionList(withoutFolder, 'orphans'),
          ),
          h(
            'div',
            { className: 'lwz-toggle-row' },
            h(
              'div',
              { className: 'lwz-toggle-main' },
              h('div', { className: 'lwz-name' }, translate('page.hidden')),
              h('div', { className: 'lwz-sub' }, translate('page.hiddenHint', { count: hidden })),
            ),
            h(Switch, {
              checked: hiddenShown,
              label: translate('page.hidden'),
              disabled: busy,
              onChange: (next) => setShowHidden(next),
            }),
          ),
          error ? h('p', { className: 'lwz-error', role: 'alert' }, error) : null,
        )
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'lazy-workspace-manager',
        order: 12,
        label: () => t('section.label'),
        locale: NS,
        inject: () => ({
          hooks: { stats: readStats() },
          addFolder: async () => {
            const path = await ctx.uiWorkspace.pickDirectory()
            if (!path) return undefined
            const view = await ctx.workspaces.create({ path })
            await refreshSessions()
            return view
          },
          loadWorkspace: async (workspaceId) => {
            if (scope) scope.load(workspaceId)
            await refreshSessions()
          },
          unloadWorkspace: (workspaceId) => scope && scope.unload(workspaceId),
          unloadAll: () => scope && scope.unloadAll(),
          setShowHidden: (value) => scope && scope.setShowHidden(value),
          /**
           * Mark or unmark one folder for automatic loading.
           *
           * The local choice is applied at once (so the checkbox and the sidebar
           * react), then persisted through the Host. A failed write rolls the
           * local set back so the page never claims a preference that is not saved.
           */
          setDefault: async (workspaceId, value) => {
            if (!scope) return undefined
            const before = scope.defaults()
            const next = scope.setDefault(workspaceId, value)
            try {
              const saved = await saveDefaults(next)
              if (saved) scope.applyConfig(saved)
              return saved
            } catch (error) {
              scope.applyConfig({ defaults: before })
              throw error
            }
          },
          removeRegistration: async (workspaceId) => (scope ? scope.removeRegistration(workspaceId) : undefined),
          openSession: async (sessionId) => {
            const result = await ctx.uiWorkspace.openSession(sessionId)
            if (scope) scope.syncOpenSession(sessionId)
            return result
          },
        }),
      }, SettingsPage))
    }

    return { apply, inject }
  },
})
