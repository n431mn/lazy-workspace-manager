// Behavioural test for the lazy-workspace-manager Client half, run outside the page.
// It stubs the browser module loader, React, and the two shared projection
// sources, then asserts the folder-scoped sidebar and the settings page share.

let loaded = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      loaded = spec
    },
  },
  addEventListener() {},
  removeEventListener() {},
  __DSH_LAZY_WORKSPACE_MANAGER__: {
    version: 1,
    file: 'C:\\Users\\test\\.dsh\\profiles\\web\\data\\lazy-workspace-manager\\index.json',
    updatedAt: '2026-10-21T00:00:00.000Z',
    workspaces: [
      { workspaceId: 'w1', path: 'D:\\work\\existing', title: 'existing', sessionIds: ['s1', 's9'] },
      { workspaceId: 'w2', path: 'D:\\work\\other', title: 'other', sessionIds: ['s2'] },
      { workspaceId: 'w3', path: 'D:\\work\\third', title: 'third', sessionIds: ['s3'] },
      { workspaceId: 'w4', path: 'D:\\work\\fourth', title: 'fourth', sessionIds: ['s4'] },
    ],
    sessions: [
      { sessionId: 's1', workspaceId: 'w1', origin: null, title: 'First folder chat', cwd: 'D:\\work\\existing', createdAt: 1760000000000 },
      { sessionId: 's2', workspaceId: 'w2', origin: null, title: 'Second chat', cwd: 'D:\\work\\other', createdAt: 1760000000000 },
      { sessionId: 's3', workspaceId: 'w3', origin: null, title: 'Third chat', cwd: 'D:\\work\\third', createdAt: 1760000000000 },
      { sessionId: 's4', workspaceId: 'w4', origin: null, title: 'Fourth chat', cwd: 'D:\\work\\fourth', createdAt: 1760000000000 },
      { sessionId: 's5', workspaceId: null, origin: null, title: 'Loose chat', cwd: 'D:\\misc', createdAt: 1760000000000 },
      { sessionId: 's7', workspaceId: null, origin: null, title: null, cwd: null, createdAt: 1760000000000 },
      { sessionId: 's8', workspaceId: 'w9', origin: 'subagent', title: 'Child chat', createdAt: 1760000000000 },
      { sessionId: 's9', workspaceId: 'w1', origin: null, title: 'Indexed only', cwd: 'D:\\work\\existing', createdAt: 1760000000000, titleUpdatedAt: 1760000500000 },
    ],
  },
}

const fakeReact = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: 'fragment',
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: (callback) => {
    const cleanup = callback()
    if (typeof cleanup === 'function') effects.push(cleanup)
  },
}
const effects = []

// The live index route: the page boots with the injected snapshot and then asks
// the Host for the current record.
const fetchCalls = []
let fetchPayload = null
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url))
  return { ok: true, json: async () => fetchPayload }
}

const module_ = await import(new URL('../client.js', import.meta.url).href)

if (!loaded || loaded.id !== 'lazy-workspace-manager') throw new Error('module id not registered')

const instance = loaded.factory((id) => {
  if (id === 'react') return fakeReact
  throw new Error('unexpected require: ' + id)
})

// ------------------------------------------------------------------ fixtures

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

const workspaceSource = observable({ items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'loading', phase: 'pending', error: null })
const sessionSource = observable({ ids: [], byId: {}, phase: 'pending', projectionsBySession: {} })

const calls = { created: 0, deleted: [], defaulted: 0 }

workspaceSource.create = async (input) => {
  calls.created += 1
  // Existing registration resolving idempotently: the model merges the row but
  // never produces a "new" id, exactly the case the wrapper must cover.
  return { ok: true, value: { workspace: { workspaceId: 'w1', path: input.path, title: 'existing', sessionIds: [], createdAt: '', updatedAt: '' } } }
}
workspaceSource.initializeDefault = async () => {
  calls.defaulted += 1
  return { ok: true, value: { workspace: { workspaceId: 'w2', path: 'D:\\work\\other', title: 'other', sessionIds: ['s2'], createdAt: '', updatedAt: '' } } }
}
workspaceSource.delete = async (workspaceId) => {
  calls.deleted.push(workspaceId)
  return { ok: true, value: { deleted: true } }
}

const workspaceViews = [
  { workspaceId: 'w1', path: 'D:\\work\\existing', title: 'existing', sessionIds: ['s1'], createdAt: '', updatedAt: '' },
  { workspaceId: 'w2', path: 'D:\\work\\other', title: 'other', sessionIds: ['s2'], createdAt: '', updatedAt: '' },
  { workspaceId: 'w3', path: 'D:\\work\\third', title: 'third', sessionIds: ['s3'], createdAt: '', updatedAt: '' },
]

function summary(id, retained) {
  return { id, displayTitle: id, retainedBy: retained === undefined ? {} : { mainView: retained }, blank: false, running: false, updatedAt: 0 }
}

const registrations = []
const disposers = []
const dictionaries = {}
const fakeCtx = {
  locale: {
    register: (name, dicts) => {
      dictionaries[name] = dicts
      return () => {}
    },
    bind: (name) => (key, vars) => {
      const dict = dictionaries[name]
      if (!dict) throw new Error('locale not registered: ' + name)
      if (!(key in dict.en) || !(key in dict.zh)) throw new Error('missing locale key: ' + key)
      const template = dict.zh[key]
      return vars ? template.replace(/\{(\w+)\}/g, (_match, namePart) => String(vars[namePart])) : template
    },
  },
  slots: {
    inject: (_name, callback) => {
      const result = callback()
      disposers.push(() => result && result())
      return () => {}
    },
    register: (registration, component) => {
      registrations.push({ registration, component })
      return () => {}
    },
  },
  effect: (callback) => {
    const dispose = callback()
    disposers.push(dispose)
    return dispose
  },
  workspaces: {
    list: workspaceSource,
    create: async (input) => (await workspaceSource.create(input)).value.workspace,
    initializeDefault: async () => (await workspaceSource.initializeDefault()).value.workspace,
    delete: async (workspaceId) => {
      const result = await workspaceSource.delete(workspaceId)
      if (!result.ok) throw new Error('delete failed')
    },
  },
  sessions: { list: sessionSource },
  uiWorkspace: { pickDirectory: async () => 'D:\\work\\existing' },
}

instance.apply(fakeCtx)

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
await flush()
assert(fetchCalls.length >= 1 && fetchCalls[0] === '/lazy-workspace-manager/index.json', 'the page reads the live Host index on boot, got ' + fetchCalls.join(','))

// 1. Baseline with three registered Workspaces: the sidebar must stay empty.
workspaceSource.push({ items: workspaceViews, archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null })
sessionSource.push({
  ids: ['s1', 's2', 's3'],
  byId: { s1: summary('s1'), s2: summary('s2'), s3: summary('s3') },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()

const emptyWorkspaces = fakeCtx.workspaces.list.getSnapshot()
const emptySessions = fakeCtx.sessions.list.getSnapshot()
assert(emptyWorkspaces.items.length === 0, 'startup shows no workspace, got ' + emptyWorkspaces.items.length)
assert(emptyWorkspaces.phase === 'ready', 'phase passes through')
assert(emptySessions.ids.length === 0, 'startup lists no session, got ' + emptySessions.ids.length)
assert(Object.keys(emptySessions.byId).length === 3, 'byId stays complete for lookups')

// 2. Adding an already-registered folder loads only that Workspace and its sessions.
const view = await fakeCtx.workspaces.create({ path: 'D:\\work\\existing' })
await flush()
assert(view.workspaceId === 'w1', 'create returns the workspace view')
const afterAdd = fakeCtx.workspaces.list.getSnapshot()
assert(afterAdd.items.length === 1 && afterAdd.items[0].workspaceId === 'w1', 'only the added folder is visible')
const addedSessions = fakeCtx.sessions.list.getSnapshot()
assert(addedSessions.ids.join(',') === 's1,s9', 'the loaded folder lists its live session and the index-only one, got ' + addedSessions.ids.join(','))
assert(addedSessions.byId.s9 && addedSessions.byId.s9.displayTitle === 'Indexed only', 'the index-only row carries its title')

// 3. The settings entry is the plugin's one surface, and its share lists everything.
const settingsEntry = registrations.find((entry) => entry.registration.id === 'lazy-workspace-manager')
assert(settingsEntry, 'settings section registered')
assert(settingsEntry.registration.name === 'settings.section', 'registered into settings.section')
const injected = settingsEntry.registration.inject()
const stats = injected.hooks.stats.getSnapshot()
assert(stats.total === 3 && stats.loaded === 1, 'panel sees 1 of 3 folders loaded, got ' + JSON.stringify(stats))
assert(stats.workspaces.map((row) => row.loaded).join(',') === 'true,false,false', 'unloaded folders are still listed')
assert(settingsEntry.registration.label() === dictionaries.lazyWorkspaceManager.zh['section.label'], 'nav label is localized')

// 4. Unloading the folder empties the sidebar again but keeps the registration.
injected.unloadWorkspace('w1')
await flush()
assert(fakeCtx.workspaces.list.getSnapshot().items.length === 0, 'unloaded folder leaves the sidebar')
assert(fakeCtx.sessions.list.getSnapshot().ids.length === 0, 'its sessions leave the sidebar')
assert(injected.hooks.stats.getSnapshot().workspaces.length === 3, 'the folder stays registered')

// 5. The sidebar's "Delete workspace" unloads instead of deleting.
injected.loadWorkspace('w2')
await flush()
await fakeCtx.workspaces.delete('w2')
await flush()
assert(calls.deleted.length === 0, 'delete did not reach the Host')
assert(fakeCtx.workspaces.list.getSnapshot().items.length === 0, 'the deleted workspace left the sidebar')
assert(injected.hooks.stats.getSnapshot().workspaces.length === 3, 'deleting kept the registration')

// 6. A retained (open) session stays listed; a brand-new Workspace auto-loads.
workspaceSource.push({
  items: [...workspaceViews, { workspaceId: 'w4', path: 'D:\\work\\fourth', title: 'fourth', sessionIds: ['s4'], createdAt: '', updatedAt: '' }],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  state: 'idle',
  phase: 'ready',
  error: null,
})
sessionSource.push({
  ids: ['s1', 's2', 's3', 's4', 's5'],
  byId: { s1: summary('s1', 1), s2: summary('s2'), s3: summary('s3'), s4: summary('s4'), s5: summary('s5') },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
const final = fakeCtx.workspaces.list.getSnapshot()
const finalIds = final.items.map((item) => item.workspaceId).join(',')
assert(
  finalIds === 'w1,w4',
  "the open Session's folder loads by itself and a newly registered folder auto-loads, got " + finalIds,
)
const finalSessions = fakeCtx.sessions.list.getSnapshot()
assert(
  finalSessions.ids.join(',') === 's1,s4,s9',
  'the open Session, the new folder, and the index-only Session of the open folder stay, got ' + finalSessions.ids.join(','),
)

// 7. The count is built from the Host index plus live arrivals.
const hiddenStats = injected.hooks.stats.getSnapshot()
assert(hiddenStats.hidden === 4, 'four sessions sit outside the two loaded folders (index included), got ' + hiddenStats.hidden)
assert(hiddenStats.index && hiddenStats.index.sessions === 8, 'the index inventory reaches the page, got ' + JSON.stringify(hiddenStats.index))
assert(Array.isArray(hiddenStats.sessions) && hiddenStats.sessions.length === 8, 'the index session rows reach the settings overview')
assert(hiddenStats.index.file.includes('lazy-workspace-manager'), 'the index path is reported')
const titledRow = hiddenStats.sessions.find((row) => row.sessionId === 's1')
assert(titledRow && titledRow.title === 'First folder chat', 'overview rows carry the folded index title, got ' + JSON.stringify(titledRow))
const looseRow = hiddenStats.sessions.find((row) => row.sessionId === 's5')
assert(looseRow && looseRow.workspaceId === null, 'a folderless session keeps no folder attribution')
const childRow = hiddenStats.sessions.find((row) => row.sessionId === 's8')
assert(childRow && childRow.origin === 'subagent', 'subagent rows are marked so the overview can skip them')
sessionSource.push({
  ids: ['s1', 's2', 's3', 's4', 's5', 's6'],
  byId: {
    s1: summary('s1', 1), s2: summary('s2'), s3: summary('s3'),
    s4: summary('s4'), s5: summary('s5'), s6: summary('s6'),
  },
  phase: 'ready',
  projectionsBySession: {},
})
await flush()
assert(injected.hooks.stats.getSnapshot().hidden === 5, 'the count follows a session-only change, got ' + injected.hooks.stats.getSnapshot().hidden)

// 8. The switch reveals every session the sidebar hides.
injected.setShowHidden(true)
await flush()
assert(
  fakeCtx.sessions.list.getSnapshot().ids.join(',') === 's1,s2,s3,s4,s5,s6,s9',
  'the switch reveals unloaded-folder and folderless sessions, got ' + fakeCtx.sessions.list.getSnapshot().ids.join(','),
)
injected.setShowHidden(false)
await flush()
assert(fakeCtx.sessions.list.getSnapshot().ids.join(',') === 's1,s4,s9', 'the switch hides them again')

// 8. First-use default initialization also reveals its already-registered folder.
await fakeCtx.workspaces.initializeDefault()
await flush()
assert(
  fakeCtx.workspaces.list.getSnapshot().items.map((item) => item.workspaceId).join(',') === 'w1,w2,w4',
  'initializeDefault reveals its folder, got ' + fakeCtx.workspaces.list.getSnapshot().items.map((item) => item.workspaceId).join(','),
)

// 9. An explicit registration delete still reaches the Host (the settings escape hatch).
await injected.removeRegistration('w3')
await flush()
assert(calls.deleted.join(',') === 'w3', 'explicit delete reaches the Host, got ' + calls.deleted.join(','))
assert(injected.hooks.stats.getSnapshot().workspaces.length === 4, 'the registration list is unchanged locally until the Host pushes')

// 10. The settings page renders from the injected share without a crash, then
//     follows the live Host index: a title folded and a blank draft arrive late.
sessionSource.push({
  ids: [...fakeCtx.sessions.list.getSnapshot().ids, 's10', 's11'],
  byId: {
    ...fakeCtx.sessions.list.getSnapshot().byId,
    s10: { ...summary('s10'), title: 'Freshly indexed' },
    s11: { ...summary('s11'), blank: true },
  },
  phase: 'ready',
  projectionsBySession: {},
})
fetchPayload = {
  ...window.__DSH_LAZY_WORKSPACE_MANAGER__,
  updatedAt: '2026-10-21T02:00:00.000Z',
  sessions: [
    ...window.__DSH_LAZY_WORKSPACE_MANAGER__.sessions,
    { sessionId: 's10', workspaceId: 'w4', folderId: 'w4', origin: null, title: 'Freshly indexed', cwd: 'D:\\work\\fourth', createdAt: 1760000600000 },
    { sessionId: 's11', workspaceId: 'w4', folderId: 'w4', origin: null, title: null, cwd: 'D:\\work\\fourth', createdAt: 1760000700000 },
  ],
}
await flush()
const t = fakeCtx.locale.bind('lazyWorkspaceManager')
const useStatsFrom = (source) => (selector) => selector(source.getSnapshot())
const pageProps = { ...injected, useStats: useStatsFrom(injected.hooks.stats), t }
const tree = settingsEntry.component(pageProps)
await flush()
const liveStats = injected.hooks.stats.getSnapshot()
assert(liveStats.index.updatedAt === '2026-10-21T02:00:00.000Z', 'the open page adopts the live index, got ' + JSON.stringify(liveStats.index))
const lateRow = liveStats.sessions.find((row) => row.sessionId === 's10')
assert(lateRow && lateRow.title === 'Freshly indexed' && lateRow.workspaceId === 'w4', 'a later folded title and its folder arrive, got ' + JSON.stringify(lateRow))
const draftRow = liveStats.sessions.find((row) => row.sessionId === 's11')
assert(draftRow && draftRow.blank === true, 'a blank draft is recognized from the live projection')
const text = JSON.stringify(settingsEntry.component(pageProps))
assert(text.includes(dictionaries.lazyWorkspaceManager.zh['page.title']), 'settings page shows its title')
assert(text.includes('D:\\\\work\\\\fourth') || text.includes('D:\\work\\fourth'), 'settings page lists a folder path')
assert(text.includes(dictionaries.lazyWorkspaceManager.zh['page.hidden']), 'settings page offers the not-loaded switch')
assert(text.includes('lazy-workspace-manager') && text.includes('index.json'), 'settings page shows the index file path')
assert(text.includes(dictionaries.lazyWorkspaceManager.zh['page.sessionList'].split('（')[0]), 'settings page offers a session list per folder')
assert(text.includes(dictionaries.lazyWorkspaceManager.zh['page.orphanSessions'].split('（')[0]), 'settings page offers the folderless session list')
assert(
  text.includes(dictionaries.lazyWorkspaceManager.zh['page.blankHidden'].replace('{count}', '1')),
  'a folder reports its hidden blank drafts instead of listing them',
)
assert(!text.includes('"s11"'), 'the blank draft is not rendered as a session row')

// 11. Disposal restores the shared sources untouched.
for (const stop of effects) stop()
for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose()
const restored = fakeCtx.workspaces.list.getSnapshot()
assert(restored.items.length === 4, 'disposal restores the full projection, got ' + restored.items.length)

console.log('lazy-workspace-manager client behaviour: all assertions passed')

function assert(condition, message) {
  if (!condition) throw new Error('FAILED: ' + message)
  console.log('  ok · ' + message)
}
