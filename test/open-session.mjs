// Focused behaviour test: the Session the main view has open keeps its folder
// loaded. Covers the boot case (DSH restores one conversation), the cwd fallback
// when the live Workspace row has not caught up, and the explicit-unload case.

let loaded = null
globalThis.window = {
  __ModuleLoader__: { load(spec) { loaded = spec } },
  addEventListener() {},
  removeEventListener() {},
  __DSH_LAZY_WORKSPACE_MANAGER__: {
    version: 1,
    file: 'C:\\Users\\test\\.dsh\\profiles\\web\\data\\lazy-workspace-manager\\index.json',
    updatedAt: '2026-10-21T00:00:00.000Z',
    workspaces: [
      { workspaceId: 'w1', path: 'D:\\temp', title: 'temp', sessionIds: ['s1'] },
      { workspaceId: 'w2', path: 'D:\\WS', title: 'WS', sessionIds: [] },
      { workspaceId: 'w3', path: 'D:\\other', title: 'other', sessionIds: [] },
    ],
    // s2 is recorded by cwd only: the live registry has not attached it yet.
    sessions: [
      { sessionId: 's1', folderId: 'w1', workspaceId: 'w1', cwd: 'D:\\temp', title: 'First', createdAt: 1000 },
      { sessionId: 's2', folderId: 'w2', workspaceId: null, cwd: 'D:\\WS', title: 'Second', createdAt: 2000 },
      { sessionId: 's3', folderId: 'w3', workspaceId: 'w3', cwd: 'D:\\other', title: 'Third', createdAt: 3000 },
    ],
  },
}
globalThis.fetch = async () => ({ ok: true, json: async () => window.__DSH_LAZY_WORKSPACE_MANAGER__ })

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

await import(new URL('../client.js', import.meta.url).href)
const instance = loaded.factory((id) => {
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

// The live registry lists the folders but no membership yet: s2 is only placed
// by its cwd, exactly the state that used to drop it into "Ungrouped".
const workspaceSource = observable({
  items: [
    { workspaceId: 'w1', path: 'D:\\temp', title: 'temp', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
    { workspaceId: 'w2', path: 'D:\\WS', title: 'WS', sessionIds: [], createdAt: '', updatedAt: '' },
    { workspaceId: 'w3', path: 'D:\\other', title: 'other', sessionIds: [], createdAt: '', updatedAt: '' },
  ],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
})
const sessionSource = observable({ ids: [], byId: {}, phase: 'pending', projectionsBySession: {} })

function row(id, cwd, mainView) {
  return {
    id,
    displayTitle: id,
    cwd,
    retainedBy: mainView ? { mainView: 1 } : {},
    blank: false,
    running: false,
    updatedAt: 0,
  }
}

const registrations = []
const dictionaries = {}
const openedSessions = []
const openedWorkspaces = []
let refreshCount = 0
const fakeCtx = {
  locale: {
    register: (name, dicts) => { dictionaries[name] = dicts; return () => {} },
    bind: (name) => (key, vars) => {
      const template = dictionaries[name].zh[key]
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
  sessions: { list: sessionSource, refresh: async () => { refreshCount += 1 } },
  uiWorkspace: {
    pickDirectory: async () => null,
    openSession(sessionId) { openedSessions.push(sessionId) },
    async openWorkspace(workspaceId) { openedWorkspaces.push(workspaceId) },
  },
}

instance.apply(fakeCtx)
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
await flush()

const visible = () => fakeCtx.workspaces.list.getSnapshot().items.map((item) => item.workspaceId).join(',')

// 1. Nothing is open yet: the sidebar stays empty.
sessionSource.push({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
await flush()
assert(visible() === '', 'an empty page keeps every folder unloaded, got ' + visible())

// 2. DSH restores s2 (folder w2, membership not yet in the live row): its folder loads.
sessionSource.push({
  ids: ['s2'],
  byId: { s2: row('s2', 'D:\\WS', true) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
assert(visible() === 'w2', "the restored Session's folder loads by itself, got " + visible())
assert(fakeCtx.sessions.list.getSnapshot().ids.join(',') === 's2', 'the restored Session stays listed under its folder')
assert(refreshCount >= 1, 'loading the folder refreshes the Host Session list, got ' + refreshCount)

// 3. Opening s3 loads w3 as well; w2 stays (its Session is only no longer current).
sessionSource.push({
  ids: ['s2', 's3'],
  byId: { s2: row('s2', 'D:\\WS', false), s3: row('s3', 'D:\\other', true) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
assert(visible() === 'w2,w3', 'opening another Session loads that folder, got ' + visible())

// 4. An explicit unload of the folder holding the open Session is not undone.
const settings = registrations.find((entry) => entry.registration.id === 'lazy-workspace-manager')
const injected = settings.registration.inject()
injected.unloadWorkspace('w3')
await flush()
sessionSource.push({
  ids: ['s2', 's3'],
  byId: { s2: row('s2', 'D:\\WS', false), s3: row('s3', 'D:\\other', true) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
assert(visible() === 'w2', 'an explicit unload stays in effect while the Session stays open, got ' + visible())

// 5. Re-opening a Session of that folder loads it again.
sessionSource.push({
  ids: ['s2', 's3'],
  byId: { s2: row('s2', 'D:\\WS', true), s3: row('s3', 'D:\\other', false) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
sessionSource.push({
  ids: ['s2', 's3'],
  byId: { s2: row('s2', 'D:\\WS', false), s3: row('s3', 'D:\\other', true) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
assert(visible() === 'w2,w3', 're-opening a Session loads its folder again, got ' + visible())

// 6. Opening a Session through the plugin's own action loads its folder at once.
sessionSource.push({
  ids: ['s2', 's3'],
  byId: { s2: row('s2', 'D:\\WS', false), s3: row('s3', 'D:\\other', false) },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
injected.unloadAll()
await flush()
assert(visible() === '', 'unload-all empties the sidebar, got ' + visible())
await injected.openSession('s2')
assert(openedSessions.join(',') === 's2', 'the settings action opens the Session, got ' + openedSessions.join(','))
assert(visible() === 'w2', 'the settings action loads the folder before revealing the Session, got ' + visible())

// 7. A sidebar click (the Workspace service, no retention change) loads it too.
injected.unloadWorkspace('w2')
await flush()
assert(visible() === '', 'the folder is unloaded again, got ' + visible())
fakeCtx.uiWorkspace.openSession('s3')
assert(openedSessions.join(',') === 's2,s3', 'the sidebar click reaches the Workspace service, got ' + openedSessions.join(','))
assert(visible() === 'w3', 'a sidebar click loads the folder of the opened Session, got ' + visible())

// 8. Opening a Workspace itself loads it.
injected.unloadAll()
await flush()
await fakeCtx.uiWorkspace.openWorkspace('w1')
assert(openedWorkspaces.join(',') === 'w1', 'the Workspace open reaches the service, got ' + openedWorkspaces.join(','))
assert(visible() === 'w1', 'opening a Workspace loads it, got ' + visible())

console.log('lazy-workspace-manager open-session behaviour: all assertions passed')

function assert(condition, message) {
  if (!condition) throw new Error('FAILED: ' + message)
  console.log('  ok · ' + message)
}
