// Reload behaviour: a page refresh must keep the folders the operator loaded.
// Each "page load" imports the client half under a fresh URL so the module graph
// is rebuilt exactly as the browser would, while `sessionStorage` persists.

const storage = new Map()
const sessionStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
}

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

const index = {
  version: 1,
  file: 'C:\\Users\\test\\.dsh\\profiles\\web\\data\\lazy-workspace-manager\\index.json',
  updatedAt: '2026-10-21T00:00:00.000Z',
  workspaces: [
    { workspaceId: 'w1', path: 'D:\\temp', title: 'temp', sessionIds: ['s1'] },
    { workspaceId: 'w2', path: 'D:\\WS', title: 'WS', sessionIds: ['s2'] },
  ],
  sessions: [
    { sessionId: 's1', folderId: 'w1', workspaceId: 'w1', cwd: 'D:\\temp', title: 'First', createdAt: 1000 },
    { sessionId: 's2', folderId: 'w2', workspaceId: 'w2', cwd: 'D:\\WS', title: 'Second', createdAt: 2000 },
  ],
}

globalThis.fetch = async () => ({ ok: true, json: async () => index })
globalThis.window = {
  __ModuleLoader__: { load(spec) { globalThis.__spec = spec } },
  __DSH_LAZY_WORKSPACE_MANAGER__: index,
  sessionStorage,
  addEventListener() {},
  removeEventListener() {},
}

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

const workspaceItems = [
  { workspaceId: 'w1', path: 'D:\\temp', title: 'temp', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
  { workspaceId: 'w2', path: 'D:\\WS', title: 'WS', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
]

/**
 * Boot one page: a fresh module instance against fresh shared projections, using
 * the same sessionStorage.
 * @param tag - unique suffix so the import is not served from the module cache.
 * @returns the installed scope helpers.
 */
async function boot(tag) {
  globalThis.__spec = null
  await import(new URL('../client.js', import.meta.url).href + '?reload=' + tag)
  const instance = globalThis.__spec.factory((id) => {
    if (id === 'react') return fakeReact
    throw new Error('unexpected require ' + id)
  })
  const workspaceSource = observable({ items: workspaceItems, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null })
  const sessionSource = observable({ ids: ['s1', 's2'], byId: { s1: summary('s1'), s2: summary('s2') }, phase: 'ready', projectionsBySession: {} })
  const registrations = []
  const dictionaries = {}
  const ctx = {
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
    sessions: { list: sessionSource, refresh: async () => {} },
    uiWorkspace: { pickDirectory: async () => null, openSession() {}, openWorkspace() {} },
  }
  instance.apply(ctx)
  await new Promise((resolve) => setTimeout(resolve, 10))
  const settings = registrations.find((entry) => entry.registration.id === 'lazy-workspace-manager')
  return {
    visible: () => workspaceSource.getSnapshot().items.map((item) => item.workspaceId).join(','),
    sessions: () => sessionSource.getSnapshot().ids.join(','),
    settings,
    ctx,
  }
}

function summary(id) {
  return { id, displayTitle: id, retainedBy: {}, blank: false, running: false, updatedAt: 0 }
}

const first = await boot('1')
assert(first.visible() === '', 'a first page starts with no folder loaded, got ' + first.visible())
first.settings.registration.inject().loadWorkspace('w1')
await new Promise((resolve) => setTimeout(resolve, 10))
assert(first.visible() === 'w1', 'loading a folder shows it, got ' + first.visible())
assert(storage.get('lazy-workspace-manager:loaded:v1') === '["w1"]', 'the loaded folder is remembered for this tab, got ' + storage.get('lazy-workspace-manager:loaded:v1'))

// A refresh is a new module graph over the same tab storage.
const second = await boot('2')
assert(second.visible() === 'w1', 'a refresh keeps the folder that was loaded, got ' + second.visible())
assert(second.sessions() === 's1', 'the refreshed page lists that folder Sessions, got ' + second.sessions())

// Unloading is remembered too.
second.settings.registration.inject().unloadWorkspace('w1')
await new Promise((resolve) => setTimeout(resolve, 10))
assert(storage.get('lazy-workspace-manager:loaded:v1') === '[]', 'unloading clears the stored set, got ' + storage.get('lazy-workspace-manager:loaded:v1'))
const third = await boot('3')
assert(third.visible() === '', 'a refresh after unloading stays empty, got ' + third.visible())

// A stored id for a folder that no longer exists is dropped, not shown.
storage.set('lazy-workspace-manager:loaded:v1', JSON.stringify(['w1', 'w-gone']))
const fourth = await boot('4')
assert(fourth.visible() === 'w1', 'a deleted folder is pruned from the stored set, got ' + fourth.visible())
assert(storage.get('lazy-workspace-manager:loaded:v1') === '["w1"]', 'the pruned set is written back, got ' + storage.get('lazy-workspace-manager:loaded:v1'))

console.log('lazy-workspace-manager reload behaviour: all assertions passed')

function assert(condition, message) {
  if (!condition) throw new Error('FAILED: ' + message)
  console.log('  ok · ' + message)
}
