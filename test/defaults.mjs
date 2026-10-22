// "Load at startup" behaviour: the Settings page marks folders that must load on
// every page load, the Host stores the choice, and a fresh page honours it.

const storage = new Map()
const sessionStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
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

const config = { version: 1, file: 'C:\\Users\\test\\.dsh\\profiles\\web\\data\\lazy-workspace-manager\\config.json', defaults: ['w2'] }
let failWrites = false
const writes = []

globalThis.fetch = async (url, options = {}) => {
  const path = String(url)
  if (path === '/lazy-workspace-manager/index.json') return { ok: true, status: 200, json: async () => index }
  if (path === '/lazy-workspace-manager/config.json') {
    if ((options.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => config }
    if (failWrites) return { ok: false, status: 500, json: async () => ({ error: 'nope' }) }
    const body = JSON.parse(options.body)
    writes.push(body.defaults)
    config.defaults = body.defaults
    return { ok: true, status: 200, json: async () => config }
  }
  throw new Error('unexpected fetch ' + path)
}

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

globalThis.window = {
  __ModuleLoader__: { load(spec) { globalThis.__spec = spec } },
  __DSH_LAZY_WORKSPACE_MANAGER__: index,
  __DSH_LAZY_WORKSPACE_MANAGER_CONFIG__: config,
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

async function boot(tag) {
  globalThis.__spec = null
  await import(new URL('../client.js', import.meta.url).href + '?defaults=' + tag)
  const instance = globalThis.__spec.factory((id) => {
    if (id === 'react') return fakeReact
    throw new Error('unexpected require ' + id)
  })
  const workspaceSource = observable({ items: workspaceItems, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null })
  const sessionSource = observable({
    ids: ['s1', 's2'],
    byId: {
      s1: { id: 's1', displayTitle: 'First', retainedBy: {}, blank: false, running: false, updatedAt: 0 },
      s2: { id: 's2', displayTitle: 'Second', retainedBy: {}, blank: false, running: false, updatedAt: 0 },
    },
    phase: 'ready',
    projectionsBySession: {},
  })
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
    stats: () => settings.registration.inject().hooks.stats.getSnapshot(),
    component: settings.component,
    props: () => ({ ...settings.registration.inject(), useStats: (selector) => selector(settings.registration.inject().hooks.stats.getSnapshot()), t: (key, vars) => ctx.locale.bind('lazyWorkspaceManager')(key, vars) }),
    dictionaries,
    t: (key, vars) => ctx.locale.bind('lazyWorkspaceManager')(key, vars),
  }
}

const page = await boot('1')
assert(page.visible() === 'w2', 'a folder marked at startup loads on a fresh page, got ' + page.visible())
assert(page.stats().defaults.join(',') === 'w2', 'the page knows which folders are defaults, got ' + JSON.stringify(page.stats().defaults))

// The settings page offers the toggle for every folder and shows the hint.
const text = JSON.stringify(page.component(page.props()))
assert(text.includes(page.dictionaries.lazyWorkspaceManager.zh['page.defaultToggle']), 'the folder card offers the startup toggle')
assert(text.includes(page.dictionaries.lazyWorkspaceManager.zh['page.defaultHint']), 'the page explains the startup option')
const w2Box = findCheckbox(page.component(page.props()), 'w2')
const w1Box = findCheckbox(page.component(page.props()), 'w1')
assert(w2Box && w2Box.props.checked === true, 'the marked folder shows a checked box')
assert(w1Box && w1Box.props.checked === false, 'an unmarked folder shows an unchecked box')

// Marking another folder persists through the Host.
await page.props().setDefault('w1', true)
assert(writes.length === 1 && writes[0].join(',') === 'w2,w1', 'the choice is written to the Host, got ' + JSON.stringify(writes))
assert(page.visible() === 'w1,w2', 'marking a folder loads it immediately, got ' + page.visible())
assert(config.defaults.join(',') === 'w2,w1', 'the Host record holds both folders')

// Unmarking does not unload the folder that is already open.
await page.props().setDefault('w2', false)
assert(config.defaults.join(',') === 'w1', 'unmarking is persisted, got ' + JSON.stringify(config.defaults))
assert(page.visible() === 'w1,w2', 'unmarking leaves the sidebar as it is, got ' + page.visible())

// A failed write rolls the local set back.
failWrites = true
let failed = false
try {
  await page.props().setDefault('w2', true)
} catch (error) {
  failed = true
}
assert(failed, 'a refused write surfaces as an error')
assert(page.stats().defaults.join(',') === 'w1', 'a refused write does not claim the preference, got ' + JSON.stringify(page.stats().defaults))
failWrites = false

// A later page (reload) honours the stored defaults even with empty tab storage.
storage.clear()
const again = await boot('2')
assert(again.visible() === 'w1', 'a fresh page loads the stored default folder, got ' + again.visible())

console.log('lazy-workspace-manager defaults behaviour: all assertions passed')

/** Find the startup checkbox rendered for one folder. */
function findCheckbox(tree, workspaceId) {
  let found = null
  const walk = (node) => {
    if (found !== null || node === null || node === undefined) return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node !== 'object') return
    if (node.type === 'label' && node.props && node.props.className === 'lwz-default') {
      const input = (node.children || []).find((child) => child && child.type === 'input')
      if (input) {
        const key = node.props.title || ''
        if (String(key).includes(workspaceId === 'w1' ? 'D:\\temp' : 'D:\\WS')) found = input
      }
    }
    for (const child of node.children || []) walk(child)
  }
  walk(tree)
  return found
}

function assert(condition, message) {
  if (!condition) throw new Error('FAILED: ' + message)
  console.log('  ok · ' + message)
}
