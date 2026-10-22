/**
 * Host half of the lazy-workspace-manager bundle.
 *
 * It owns one durable index file that records every registered Workspace and
 * every Session the Host knows about, so neither half has to rescan volatile
 * projections to answer "what exists". The file is recomputed from the
 * workspace registry and the session query service on startup and on a fixed
 * interval; it is only rewritten when its content actually changed, so a file
 * that is already current stays untouched.
 *
 * The current index is injected into the Web page as
 * `window.__DSH_LAZY_WORKSPACE_MANAGER__` through the `webserver/index-inject` table,
 * which is re-emitted on every index render. It is also served live at
 * `/lazy-workspace-manager/index.json`, so an open page can refresh the record instead
 * of keeping the snapshot that happened to be in the HTML it loaded.
 *
 * Two facts about the shipped registry shape the index:
 *
 * - the registry only owns Sessions created through a Workspace, while a Session
 *   whose stored `cwd` is the Workspace directory is the same conversation in the
 *   operator's directory-based model; the index therefore records `folderId` (the
 *   owning Workspace, else the Workspace whose path equals the Session `cwd`) and
 *   attaches such a Session to its folder, so the sidebar and this record agree;
 * - a Session that never received a user turn stays "Untitled" forever unless the
 *   optional session-titles bundle is installed, so the index materializes the
 *   built-in deterministic fallback title for untitled live Sessions.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

/** Hard dependency: the durable workspace registry is the index's backbone. */
export const inject = ['workspaceRegistry']

/** How often the index is compared against the live registry. */
const REFRESH_INTERVAL_MS = 30_000

/**
 * Resolve the active profile name from the environment or the CLI arguments.
 * `dsh web` and `dsh --profile web` both name a profile.
 * @returns the profile name, or undefined for a profile-less boot.
 */
function profileName() {
  if (process.env.DSH_PROFILE) return process.env.DSH_PROFILE
  const args = process.argv.slice(2)
  const flag = args.indexOf('--profile')
  if (flag >= 0 && args[flag + 1]) return args[flag + 1]
  const first = args[0]
  if (first && !first.startsWith('-')) return first
  return undefined
}

/**
 * Resolve the index file location for the running profile.
 * @returns absolute path of `lazy-workspace-manager/index.json`.
 */
function indexFilePath() {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const profile = profileName()
  const base = profile ? join(home, 'profiles', profile, 'data') : join(home, 'data')
  return join(base, 'lazy-workspace-manager', 'index.json')
}

/**
 * The operator's own preferences, next to the index.
 * @returns absolute path of `lazy-workspace-manager/config.json`.
 */
function configFilePath() {
  return join(dirname(indexFilePath()), 'config.json')
}

/**
 * Normalize a directory spelling for value comparison.
 *
 * Two spellings name the same folder when they differ only in separator style,
 * a trailing separator, or (on Windows) letter case. This is a comparison key
 * only: the index keeps the raw spelling for display.
 *
 * @param value - absolute path candidate.
 * @returns the comparison key, or null when the value is not a usable path.
 */
function normalizeCwd(value) {
  if (typeof value !== 'string') return null
  let text = value.trim().replace(/\//g, '\\').replace(/\\+$/, '')
  if (text.length === 0) return null
  if (process.platform === 'win32') text = text.toLowerCase()
  return text
}

/**
 * Read one Workspace registry row into the index shape.
 * @param workspace - registry entity or record.
 * @returns plain JSON workspace row.
 */
function workspaceRow(workspace) {
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    sessionIds: Array.from(workspace.sessionIds ?? []),
  }
}

/**
 * Read one SessionRecord into the index shape.
 * @param record - session query record.
 * @returns plain JSON session row.
 */
function sessionRow(record) {
  const header = record && record.header ? record.header : {}
  return {
    sessionId: header.id,
    cwd: header.cwd ?? null,
    parentSessionId: header.parentSession ?? null,
    origin: header.origin ?? null,
    createdAt: typeof header.createdAt === 'number' ? header.createdAt : null,
    live: record.live === true,
    persisted: record.persisted === true,
  }
}

/**
 * The package this file belongs to.
 *
 * A local plugin is installed from a directory the operator controls, so it may
 * be relocated (for example out of a scratch folder). Everything derived from
 * that location must be derived from this file's own URL rather than a path
 * captured elsewhere.
 */
const PACKAGE_NAME = 'lazy-workspace-manager'
const CLIENT_FILE = fileURLToPath(new URL('./client.js', import.meta.url))

/**
 * Make a relocated install take effect without restarting the Host.
 *
 * `client-modules` caches each package's resolved client bundle path the first
 * time it scans the Loader row, keyed by Loader identity rather than by the file
 * it points at. A profile link that starts naming a new directory (the whole
 * point of installing outside a working tree) would otherwise keep serving the
 * old path — the browser then loses the Settings page until the Host restarts.
 * Dropping this package's cached resolution and re-scanning its row is a no-op
 * when nothing moved and the fix when it did.
 *
 * Every access is guarded: another build may keep these elsewhere, and a failed
 * repair must never fail the plugin.
 *
 * @param modules - the Host `clientModules` service.
 */
function rescanClientBundle(modules) {
  try {
    if (!modules || typeof modules.clientPath !== 'function') return
    let current
    try {
      current = modules.clientPath(PACKAGE_NAME)
    } catch (error) {
      return
    }
    if (typeof current !== 'string' || current.length === 0) return
    if (resolve(current) === resolve(CLIENT_FILE)) return
    console.log('[lazy-workspace-manager] client bundle moved: ' + current + ' → ' + CLIENT_FILE)
    const cache = modules.pkgMeta
    if (cache && typeof cache.keys === 'function' && typeof cache.delete === 'function') {
      for (const key of [...cache.keys()]) {
        if (String(key).includes(PACKAGE_NAME)) cache.delete(key)
      }
    }
    const table = modules.table
    if (table && typeof table.delete === 'function') table.delete(PACKAGE_NAME)
    if (modules.dirty && typeof modules.dirty.add === 'function') modules.dirty.add(PACKAGE_NAME)
    if (typeof modules.flush === 'function') {
      modules.flush((error) => console.warn('[lazy-workspace-manager] client bundle rescan failed', error))
    }
  } catch (error) {
    console.warn('[lazy-workspace-manager] client bundle path check failed', error)
  }
}

/**
 * Host half: keep the index file current and publish it to the page.
 * @param ctx - Host context.
 */
export function apply(ctx) {
  const file = indexFilePath()
  const configFile = configFilePath()
  let current = null
  let serialized = ''
  let refreshing = false
  let timer = null
  let refreshedAt = 0
  /** Folders the operator wants loaded on every page load. */
  let defaults = []
  /** Session id → the Session seq whose title attempt was already made. */
  const titleAttempts = new Map()

  /**
   * Read the operator preferences file.
   *
   * A missing or malformed file is not an error: the plugin then simply has no
   * folders marked for automatic loading, which is the shipped default.
   */
  async function loadConfig() {
    try {
      const parsed = JSON.parse(await readFile(configFile, 'utf8'))
      const list = Array.isArray(parsed.defaults) ? parsed.defaults : []
      defaults = [...new Set(list.filter((id) => typeof id === 'string' && id.length > 0))]
    } catch (error) {
      if (error && error.code !== 'ENOENT') console.warn('[lazy-workspace-manager] config read failed', error)
    }
  }

  /**
   * Replace the operator preferences file.
   * @param list - Workspace ids to load on every page load.
   * @returns the stored configuration.
   */
  async function saveConfig(list) {
    const next = [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && id.length > 0))]
    defaults = next
    const text = JSON.stringify({ version: 1, defaults: next, updatedAt: new Date().toISOString() }, null, 2)
    await mkdir(dirname(configFile), { recursive: true })
    const temporary = configFile + '.tmp'
    await writeFile(temporary, text, 'utf8')
    await rename(temporary, configFile)
    return next
  }

  function configValue() {
    return { version: 1, file: configFile, defaults: [...defaults] }
  }

  /**
   * Materialize the built-in fallback title for untitled live Sessions.
   *
   * The deterministic first-prompt fallback belongs to `sessionTitle`; only the
   * optional session-titles bundle schedules it automatically. Without that
   * bundle every live conversation stays "Untitled", which is exactly what the
   * settings overview is asked to name, so the index asks for the fallback
   * itself — once per Session seq, and only while no title exists.
   */
  async function backfillTitles() {
    const store = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    const titles = typeof ctx.get === 'function' ? ctx.get('sessionTitle') : undefined
    if (!store || !titles || typeof titles.refresh !== 'function') return
    const attempts = []
    let live = []
    try {
      live = store.list()
    } catch (error) {
      console.warn('[lazy-workspace-manager] live session listing failed', error)
      return
    }
    const alive = new Set(live.map((session) => session.id))
    for (const id of titleAttempts.keys()) if (!alive.has(id)) titleAttempts.delete(id)
    for (const session of live) {
      const attempt = titleAttempts.get(session.id)
      if (attempt === session.seq) continue
      try {
        const existing = titles.get(session)
        if (existing && typeof existing.title === 'string' && existing.title.length > 0) {
          titleAttempts.set(session.id, session.seq)
          continue
        }
      } catch (error) {
        // A title fold failure must not stop the index.
      }
      titleAttempts.set(session.id, session.seq)
      attempts.push(Promise.resolve()
        .then(() => titles.refresh(session))
        .catch((error) => console.warn('[lazy-workspace-manager] title refresh failed for ' + session.id, error)))
    }
    if (attempts.length === 0) return
    // Never let a slow provider hold the index: the fallback path is synchronous,
    // a registered provider is allowed a short head start and the next refresh
    // folds whatever it eventually appended.
    await Promise.race([
      Promise.allSettled(attempts),
      new Promise((resolve) => {
        const handle = setTimeout(resolve, 1_500)
        if (typeof handle.unref === 'function') handle.unref()
      }),
    ])
  }

  /**
   * Build one complete index value from the registry and the session query.
   * Every read is defensive: a failing source degrades that section of the
   * index instead of failing the plugin.
   * @returns the index value.
   */
  async function snapshot() {
    await backfillTitles()

    const workspaces = []
    try {
      for (const workspace of ctx.workspaceRegistry.list()) workspaces.push(workspaceRow(workspace))
    } catch (error) {
      console.warn('[lazy-workspace-manager] workspace registry read failed', error)
    }

    const sessions = []
    const query = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : undefined
    if (query && typeof query.listSessions === 'function') {
      try {
        for (const record of await query.listSessions()) {
          const row = sessionRow(record)
          if (row.sessionId) sessions.push(row)
        }
      } catch (error) {
        console.warn('[lazy-workspace-manager] session listing failed', error)
      }
    }

    const known = new Map(sessions.map((session) => [session.sessionId, session]))
    for (const workspace of workspaces) {
      for (const sessionId of workspace.sessionIds) {
        const existing = known.get(sessionId)
        if (existing) {
          existing.workspaceId = workspace.workspaceId
          continue
        }
        const row = { sessionId, workspaceId: workspace.workspaceId, cwd: null, parentSessionId: null, origin: null, createdAt: null, live: false, persisted: false }
        known.set(sessionId, row)
        sessions.push(row)
      }
    }
    for (const session of sessions) {
      if (session.workspaceId === undefined) session.workspaceId = null
      if (session.title === undefined) session.title = null
      if (session.titleUpdatedAt === undefined) session.titleUpdatedAt = null
    }

    // Titles are folded from the durable logs once per refresh and kept in the
    // index so the settings overview can list every Session by name without
    // the page having to scan session projections itself.
    if (query && typeof query.readTitleSnapshots === 'function' && sessions.length > 0) {
      const ids = sessions.map((session) => session.sessionId)
      for (let offset = 0; offset < ids.length; offset += 200) {
        try {
          const results = await query.readTitleSnapshots(ids.slice(offset, offset + 200))
          for (const result of results || []) {
            if (!result || result.status !== 'fulfilled') continue
            const observation = result.value || {}
            const title = observation.title
            if (!title || typeof title.title !== 'string') continue
            const row = known.get(result.sessionId)
            if (!row) continue
            row.title = title.title
            row.titleUpdatedAt = typeof title.updatedAt === 'number' ? title.updatedAt : null
          }
        } catch (error) {
          console.warn('[lazy-workspace-manager] title folding failed', error)
        }
      }
    }

    // The registry only owns Sessions created through a Workspace. A Session
    // whose stored `cwd` is a registered directory is the same conversation in
    // the operator's directory-based model, so record which folder it belongs to:
    // the owning Workspace when the registry knows one, else the Workspace whose
    // path equals the Session cwd. Subagent Sessions inherit their parent's cwd
    // and are filtered by the reader.
    const byPath = new Map()
    for (const workspace of workspaces) {
      const key = normalizeCwd(workspace.path)
      if (key !== null && !byPath.has(key)) byPath.set(key, workspace.workspaceId)
    }
    for (const session of sessions) {
      const owning = typeof session.workspaceId === 'string' ? session.workspaceId : null
      session.folderId = owning ?? byPath.get(normalizeCwd(session.cwd)) ?? null
    }

    // The registry's one-time history bootstrap attached the Sessions that existed
    // when it first ran; every later Session created outside the Workspace UI (a
    // CLI boot in that directory, another client) stayed ungrouped even though its
    // stored cwd is the folder. Attach those now — the registry validates the cwd
    // itself and refuses anything that no longer resolves, so a stale directory
    // stays merely discoverable through the index.
    const attached = []
    const registry = ctx.workspaceRegistry
    if (typeof registry.get === 'function') {
      for (const session of sessions) {
        if (session.workspaceId !== null) continue
        if (session.origin === 'subagent') continue
        if (typeof session.folderId !== 'string') continue
        const entity = registry.get(session.folderId)
        if (!entity || typeof entity.attachSession !== 'function') continue
        try {
          await entity.attachSession(session.sessionId)
          session.workspaceId = session.folderId
          attached.push(session)
        } catch (error) {
          // A cwd that no longer resolves, or a fork of another folder, stays out.
        }
      }
    }
    if (attached.length > 0) {
      const rows = new Map(workspaces.map((workspace) => [workspace.workspaceId, workspace]))
      for (const session of attached) {
        const workspace = rows.get(session.folderId)
        if (workspace && !workspace.sessionIds.includes(session.sessionId)) {
          workspace.sessionIds.unshift(session.sessionId)
        }
      }
      console.log('[lazy-workspace-manager] attached ' + attached.length + ' directory Session(s) to their folder')
    }

    return {
      version: 1,
      file,
      updatedAt: new Date().toISOString(),
      workspaces,
      sessions,
    }
  }

  /**
   * Compare the index with the live sources and rewrite the file when stale.
   * @param reason - diagnostic tag for the refresh trigger.
   */
  async function refresh(reason) {
    if (refreshing) return current
    refreshing = true
    refreshedAt = Date.now()
    try {
      const next = await snapshot()
      current = next
      const text = JSON.stringify(next, null, 2)
      if (text === serialized) return current
      await mkdir(dirname(file), { recursive: true })
      const temporary = file + '.tmp'
      await writeFile(temporary, text, 'utf8')
      await rename(temporary, file)
      serialized = text
      console.log('[lazy-workspace-manager] index updated (' + reason + '): ' + next.workspaces.length + ' workspaces, ' + next.sessions.length + ' sessions')
    } catch (error) {
      console.warn('[lazy-workspace-manager] index refresh failed', error)
    } finally {
      refreshing = false
    }
    return current
  }

  /**
   * Hand out an index value no older than `maxAgeMs`, refreshing when needed.
   * A concurrent refresh is not awaited: it answers with the value it will
   * publish anyway on the next tick.
   * @param maxAgeMs - acceptable age of the current value.
   * @returns the freshest available index value, possibly null before boot.
   */
  async function fresh(maxAgeMs) {
    if (current !== null && Date.now() - refreshedAt <= maxAgeMs) return current
    await refresh('request')
    if (current !== null) return current
    const deadline = Date.now() + 2_000
    while (current === null && Date.now() < deadline) {
      await new Promise((resolve) => {
        const handle = setTimeout(resolve, 50)
        if (typeof handle.unref === 'function') handle.unref()
      })
    }
    return current
  }

  ctx.effect(() => {
    void loadConfig()
    void refresh('startup')
    timer = setInterval(() => void refresh('interval'), REFRESH_INTERVAL_MS)
    if (typeof timer.unref === 'function') timer.unref()
    return () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
  }, 'lazy-workspace-manager: index maintenance')

  // A profile link may start naming a different directory than the one the Host
  // scanned at startup. Re-check once the Loader row is mounted, so the browser
  // gets this half from wherever the package actually lives now.
  ctx.inject(['clientModules'], (clientCtx) => {
    const modules = clientCtx.clientModules
    if (!modules) return
    const handle = setTimeout(() => rescanClientBundle(modules), 0)
    if (typeof handle.unref === 'function') handle.unref()
  })

  ctx.on('webserver/index-inject', (table) => {
    if (!Array.isArray(table)) return
    table.push({
      kind: 'global',
      name: '__DSH_LAZY_WORKSPACE_MANAGER__',
      value: current || { version: 1, file, updatedAt: null, workspaces: [], sessions: [] },
    })
    table.push({
      kind: 'global',
      name: '__DSH_LAZY_WORKSPACE_MANAGER_CONFIG__',
      value: configValue(),
    })
  })

  // Live read of the same record the page was booted with, so an open Settings
  // page observes new Sessions and folded titles without a reload.
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/lazy-workspace-manager/index.json',
      handler: async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' }).end()
          return
        }
        let value = null
        try {
          value = await fresh(3_000)
        } catch (error) {
          console.warn('[lazy-workspace-manager] index read failed', error)
        }
        const body = JSON.stringify(value || { version: 1, file, updatedAt: null, workspaces: [], sessions: [] })
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body),
        })
        if (req.method === 'HEAD') res.end()
        else res.end(body)
      },
    }), 'lazy-workspace-manager: index route')

    // Operator preferences: which folders load on every page load. Read and
    // written here so the choice survives browsers, ports, and restarts.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/lazy-workspace-manager/config.json',
      handler: async (req, res) => {
        const send = (status, value) => {
          const body = JSON.stringify(value)
          res.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'content-length': Buffer.byteLength(body),
          })
          if (req.method === 'HEAD') res.end()
          else res.end(body)
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
          send(200, configValue())
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'GET, HEAD, POST' }).end()
          return
        }
        let payload
        try {
          let size = 0
          const chunks = []
          for await (const chunk of req) {
            size += chunk.length
            if (size > 64 * 1024) throw new Error('body too large')
            chunks.push(chunk)
          }
          const text = Buffer.concat(chunks).toString('utf8')
          payload = text.length === 0 ? {} : JSON.parse(text)
        } catch (error) {
          send(400, { error: 'invalid JSON body' })
          return
        }
        if (!payload || !Array.isArray(payload.defaults)) {
          send(400, { error: 'defaults must be an array of workspace ids' })
          return
        }
        try {
          await saveConfig(payload.defaults)
          send(200, configValue())
        } catch (error) {
          console.warn('[lazy-workspace-manager] config write failed', error)
          send(500, { error: 'could not save preferences' })
        }
      },
    }), 'lazy-workspace-manager: config route')

    // Where this plugin is actually installed, so a relocation can be verified
    // without guessing which copy the page is running.
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: '/lazy-workspace-manager/diagnostics',
      handler: (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          res.writeHead(405, { allow: 'GET, HEAD' }).end()
          return
        }
        const modules = typeof ctx.get === 'function' ? ctx.get('clientModules') : undefined
        let clientPath = null
        try {
          clientPath = modules && typeof modules.clientPath === 'function' ? modules.clientPath(PACKAGE_NAME) : null
        } catch (error) {
          clientPath = null
        }
        const body = JSON.stringify({
          version: 1,
          package: PACKAGE_NAME,
          host: fileURLToPath(import.meta.url),
          client: CLIENT_FILE,
          clientBundle: clientPath,
          indexFile: file,
          configFile,
          defaultFolders: defaults.length,
          updatedAt: current ? current.updatedAt : null,
        })
        res.writeHead(200, {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
          'content-length': Buffer.byteLength(body),
        })
        if (req.method === 'HEAD') res.end()
        else res.end(body)
      },
    }), 'lazy-workspace-manager: diagnostics route')
  })
}
