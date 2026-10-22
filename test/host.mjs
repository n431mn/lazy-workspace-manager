// Behavioural test for the lazy-workspace-manager Host half, run outside DSH.
// It stubs the workspace registry, the session query, the live stores, and the
// web server, then asserts the durable index, the folder attribution, the title
// backfill, and the live route.

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'lazy-workspace-manager-host-'))
process.env.DSH_HOME = home
process.env.DSH_PROFILE = 'web'

const attachCalls = []
const registry = [
  { id: 'w1', path: 'D:\\temp', title: 'temp', createdAt: '2026-10-21T01:00:00.000Z', updatedAt: '2026-10-21T01:00:00.000Z', sessionIds: ['session-a'] },
  { id: 'w2', path: 'D:\\other\\', title: 'other', createdAt: '2026-10-21T01:00:00.000Z', updatedAt: '2026-10-21T01:00:00.000Z', sessionIds: [] },
]
for (const workspace of registry) {
  workspace.attachSession = async (sessionId) => {
    attachCalls.push(workspace.id + ':' + sessionId)
    if (!workspace.sessionIds.includes(sessionId)) workspace.sessionIds.unshift(sessionId)
    return workspace
  }
}

const records = [
  { header: { id: 'session-a', cwd: 'D:\\temp', createdAt: 1000 }, live: true, persisted: true },
  { header: { id: 'session-x', cwd: 'd:\\TEMP', createdAt: 2000 }, live: false, persisted: true },
  { header: { id: 'session-y', cwd: 'D:\\elsewhere', createdAt: 3000 }, live: false, persisted: true },
  { header: { id: 'session-child', cwd: 'D:\\temp', origin: 'subagent', createdAt: 4000 }, live: false, persisted: true },
]

const titles = new Map([
  ['session-x', { title: 'Folded title', updatedAt: 2500 }],
])

const titleCalls = []
const liveSession = {
  id: 'session-a',
  seq: 3,
  header: { id: 'session-a', cwd: 'D:\\temp' },
}

const injected = []
const disposers = []
const routes = new Map()

const fakeCtx = {
  workspaceRegistry: {
    list: () => registry,
    get: (id) => registry.find((workspace) => workspace.id === id),
  },
  get(name) {
    if (name === 'sessionQuery') {
      return {
        listSessions: async () => records,
        readTitleSnapshots: async (ids) => ids.map((sessionId) => {
          const found = titles.get(sessionId)
          return found === undefined
            ? { sessionId, status: 'fulfilled', value: { session: { id: sessionId } } }
            : { sessionId, status: 'fulfilled', value: { session: { id: sessionId }, title: found } }
        }),
      }
    }
    if (name === 'sessions') return { list: () => [liveSession] }
    if (name === 'sessionTitle') {
      return {
        get: () => undefined,
        refresh: async (session) => {
          titleCalls.push(session.id)
          return { title: 'Live fallback title', updatedAt: 5000 }
        },
      }
    }
    return undefined
  },
  effect(callback) {
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return dispose
  },
  on(event, listener) {
    if (event === 'webserver/index-inject') injected.push(listener)
    return () => {}
  },
  inject(_deps, callback) {
    callback({
      effect: fakeCtx.effect,
      webServer: {
        register(registration) {
          routes.set(registration.path, registration)
          return () => {}
        },
      },
    })
  },
}

const module_ = await import(new URL('../index.js', import.meta.url).href)
module_.apply(fakeCtx)

await sleep(120)

const table = []
for (const listener of injected) listener(table)
assert(table.length === 2, 'the index and the preferences are published, got ' + table.length)
const indexRow = table.find((row) => row.name === '__DSH_LAZY_WORKSPACE_MANAGER__')
const configRow = table.find((row) => row.name === '__DSH_LAZY_WORKSPACE_MANAGER_CONFIG__')
assert(indexRow && indexRow.kind === 'global', 'the index row is a global')
assert(configRow && configRow.kind === 'global', 'the preferences row is a global')
assert(Array.isArray(configRow.value.defaults) && configRow.value.defaults.length === 0, 'no folder is marked by default yet')
const indexPath = indexRow.value.file
assert(indexPath === join(home, 'profiles', 'web', 'data', 'lazy-workspace-manager', 'index.json'), 'the index lives in the active profile, got ' + indexPath)

const index = JSON.parse(await readFile(indexPath, 'utf8'))
assert(index.version === 1, 'index version is 1')
assert(index.workspaces.length === 2, 'both registered folders are recorded, got ' + index.workspaces.length)
assert(index.workspaces[0].sessionIds.join(',') === 'session-x,session-a', 'the attached Session joins the folder account, got ' + index.workspaces[0].sessionIds.join(','))

const byId = new Map(index.sessions.map((row) => [row.sessionId, row]))
assert(byId.get('session-a').workspaceId === 'w1', 'an owned Session records its Workspace')
assert(byId.get('session-a').folderId === 'w1', 'an owned Session belongs to its folder')
assert(byId.get('session-x').folderId === 'w1', 'a Session whose cwd is the folder joins it, got ' + JSON.stringify(byId.get('session-x')))
assert(byId.get('session-x').workspaceId === 'w1', 'that Session is attached to the folder in the registry, got ' + JSON.stringify(byId.get('session-x')))
assert(byId.get('session-y').folderId === null, 'another directory keeps no folder')
assert(byId.get('session-child').folderId === 'w1', 'a subagent Session still records the folder it ran in')
assert(attachCalls.includes('w1:session-x'), 'the directory Session is attached, got ' + attachCalls.join(','))
assert(!attachCalls.includes('w1:session-y') && !attachCalls.includes('w1:session-child'), 'unrelated and subagent Sessions are not attached')
assert(byId.get('session-x').title === 'Folded title', 'folded titles land in the index, got ' + JSON.stringify(byId.get('session-x')))
assert(byId.get('session-x').titleUpdatedAt === 2500, 'the title timestamp is recorded')

assert(titleCalls.includes('session-a'), 'an untitled live Session gets the built-in fallback title, got ' + titleCalls.join(','))
assert(!titleCalls.includes('session-x'), 'a Session that already folded a title is left alone')

assert(indexRow.value.sessions.length === index.sessions.length, 'the injected value is the same record')

const route = routes.get('/lazy-workspace-manager/index.json')
assert(route !== undefined, 'the live index route is registered')
assert(route.kind === 'exact', 'the route path is exact, got ' + JSON.stringify(route && route.path))

const first = await respond(route, 'GET')
assert(first.status === 200, 'the route answers 200')
assert(first.headers['content-type'].includes('application/json'), 'the route serves JSON')
assert(first.headers['cache-control'] === 'no-store', 'the route forbids caching')
const payload = JSON.parse(first.body)
assert(payload.version === 1 && payload.sessions.length === index.sessions.length, 'the route serves the index value')
assert(payload.workspaces[0].sessionIds.join(',') === 'session-x,session-a', 'the route carries the folder rows, got ' + payload.workspaces[0].sessionIds.join(','))

const missing = await respond(route, 'POST')
assert(missing.status === 405, 'a non-GET method is refused')

const diagnostics = routes.get('/lazy-workspace-manager/diagnostics')
assert(diagnostics !== undefined, 'the diagnostics route is registered')
const info = JSON.parse((await respond(diagnostics, 'GET')).body)
assert(info.package === 'lazy-workspace-manager', 'diagnostics names the package, got ' + info.package)
assert(info.host.endsWith('index.js') && info.client.endsWith('client.js'), 'diagnostics reports the files this half runs from')
assert(info.clientBundle === null, 'diagnostics tolerates a Host without client-modules')

// Operator preferences: which folders load on every page load.
const configRoute = routes.get('/lazy-workspace-manager/config.json')
assert(configRoute !== undefined, 'the preferences route is registered')
const emptyConfig = JSON.parse((await respond(configRoute, 'GET')).body)
assert(Array.isArray(emptyConfig.defaults) && emptyConfig.defaults.length === 0, 'no folder is marked by default yet')
assert(emptyConfig.file === join(home, 'profiles', 'web', 'data', 'lazy-workspace-manager', 'config.json'), 'preferences live beside the index, got ' + emptyConfig.file)

const savedConfig = JSON.parse((await respond(configRoute, 'POST', { defaults: ['w1', 'w1', 7, ''] })).body)
assert(savedConfig.defaults.join(',') === 'w1', 'duplicates and non-strings are dropped, got ' + JSON.stringify(savedConfig.defaults))
const configFile = JSON.parse(await readFile(emptyConfig.file, 'utf8'))
assert(configFile.defaults.join(',') === 'w1', 'the choice is durable, got ' + JSON.stringify(configFile.defaults))
const reread = JSON.parse((await respond(configRoute, 'GET')).body)
assert(reread.defaults.join(',') === 'w1', 'the live read reflects the write')

const badConfig = await respond(configRoute, 'POST', { defaults: 'nope' })
assert(badConfig.status === 400, 'a malformed preference body is refused, got ' + badConfig.status)
const wrongMethod = await respond(configRoute, 'PUT')
assert(wrongMethod.status === 405, 'a non-GET/POST method is refused, got ' + wrongMethod.status)

for (const dispose of disposers.reverse()) if (typeof dispose === 'function') dispose()
await rm(home, { recursive: true, force: true })

console.log('lazy-workspace-manager host behaviour: all assertions passed')

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function respond(registration, method, body) {
  const captured = { status: 0, headers: {}, body: '' }
  const response = {
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers || {}
      return this
    },
    end(body) {
      if (body !== undefined) captured.body = String(body)
      return this
    },
  }
  const request = { method, url: registration.path }
  if (body !== undefined) {
    request[Symbol.asyncIterator] = async function* iterate() {
      yield Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))
    }
  }
  await registration.handler(request, response)
  return captured
}

function assert(condition, message) {
  if (!condition) throw new Error('FAILED: ' + message)
  console.log('  ok · ' + message)
}
