// Preview the settings page against the LIVE profile record.
// It reads the Host index and the durable projection cache, rebuilds the two
// shared projections the page consumes, and prints the rendered text of the
// folder cards so the counts and hidden blank drafts are visible.

import { readFile, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const profile = join(homedir(), '.dsh')
const index = JSON.parse(await readFile(join(profile, 'profiles', 'web', 'data', 'lazy-workspace-manager', 'index.json'), 'utf8'))
const registry = JSON.parse(await readFile(join(profile, 'storages', 'workspace.json'), 'utf8'))
const archivedSessionIds = registry.global.archivedSessionIds || []
const cacheDir = join(profile, 'storages', 'session_projcache', 'sessions')
const cacheFiles = new Set(await readdir(cacheDir))

const blankFlags = new Map()
for (const file of cacheFiles) {
  const id = file.replace(/^session-/, '').replace(/\.json$/, '')
  const text = await readFile(join(cacheDir, file), 'utf8')
  const row = JSON.parse(text).record?.rows?.sessionListMetadata
  if (row && row.val && typeof row.val.blank === 'boolean') blankFlags.set('session-' + id, row.val.blank)
}

const workspaces = index.workspaces
const sessions = index.sessions

globalThis.window = {
  __ModuleLoader__: { load(spec) { globalThis.__spec = spec } },
  __DSH_LAZY_WORKSPACE_MANAGER__: index,
  addEventListener() {},
  removeEventListener() {},
}

const effects = []
globalThis.fetch = async () => ({ ok: true, json: async () => index })

const effectsList = effects
const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (callback) => {
    const cleanup = callback()
    if (typeof cleanup === 'function') effectsList.push(cleanup)
  },
}

await import(new URL('../client.js', import.meta.url).href)
const instance = globalThis.__spec.factory((id) => {
  if (id === 'react') return fakeReact
  throw new Error('unexpected require ' + id)
})

function observable(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    push(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

const workspaceItems = workspaces.map((workspace) => ({
  workspaceId: workspace.workspaceId,
  path: workspace.path,
  title: workspace.title,
  sessionIds: workspace.sessionIds,
  createdAt: workspace.createdAt,
  updatedAt: workspace.updatedAt,
}))

const workspaceSource = observable({ items: workspaceItems, archivedSessionIds, pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null })
const sessionSource = observable({
  ids: sessions.map((row) => row.sessionId),
  byId: Object.fromEntries(sessions.map((row) => [row.sessionId, {
    id: row.sessionId,
    displayTitle: row.title || row.sessionId,
    title: row.title || undefined,
    cwd: row.cwd || undefined,
    blank: blankFlags.has(row.sessionId) ? blankFlags.get(row.sessionId) : false,
    retainedBy: {},
    running: false,
    updatedAt: typeof row.titleUpdatedAt === 'number' ? row.titleUpdatedAt : (row.createdAt || 0),
  }])),
  phase: 'ready',
  projectionsBySession: {},
})

const registrations = []
const dictionaries = {}
const fakeCtx = {
  locale: {
    register: (name, dicts) => { dictionaries[name] = dicts; return () => {} },
    bind: (name) => (key, vars) => {
      const dict = dictionaries[name]
      if (!dict) throw new Error('locale not registered')
      const template = dict.zh[key]
      if (template === undefined) throw new Error('missing key ' + key)
      return vars ? template.replace(/\{(\w+)\}/g, (_m, part) => String(vars[part])) : template
    },
  },
  slots: {
    inject: (_name, callback) => {
      const dispose = callback()
      return () => { if (typeof dispose === 'function') dispose() }
    },
    register: (registration, component) => {
      registrations.push({ registration, component })
      return () => {}
    },
  },
  effect: (callback) => {
    const dispose = callback()
    return typeof dispose === 'function' ? dispose : () => {}
  },
  workspaces: { list: workspaceSource },
  sessions: { list: sessionSource, refresh: async () => {} },
  uiWorkspace: { pickDirectory: async () => null, openSession: () => {} },
}

instance.apply(fakeCtx)

const registration = registrations.find((entry) => entry.registration.id === 'lazy-workspace-manager')
const injected = registration.registration.inject()

// Load the folder whose record the screenshot showed.
const temp = workspaceItems.find((item) => item.path === 'D:\\temp')
injected.loadWorkspace(temp.workspaceId)
await new Promise((resolve) => setTimeout(resolve, 20))

const stats = injected.hooks.stats.getSnapshot()
const t = fakeCtx.locale.bind('lazyWorkspaceManager')
const tree = registration.component({ ...injected, useStats: (selector) => selector(injected.hooks.stats.getSnapshot()), t })

function flatten(node, out) {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (Array.isArray(node)) { for (const child of node) flatten(child, out); return }
  if (typeof node === 'object' && Array.isArray(node.children)) for (const child of node.children) flatten(child, out)
}

const text = []
flatten(tree, text)
console.log('=== rendered settings page (text nodes) ===')
for (const line of text) console.log(line)
console.log('=== record ===')
console.log('sessions=' + stats.sessions.length + ' hidden=' + stats.hidden + ' loaded=' + stats.loaded + '/' + stats.total)
const blanks = stats.sessions.filter((row) => row.blank)
console.log('blank rows=' + blanks.length + ' titled=' + stats.sessions.filter((row) => row.title).length)
for (const stop of effects) stop()
