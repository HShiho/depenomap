import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import type { LoadResult } from '../core/graph/loader'
import { GRAPH_ENDPOINT } from '../core/graph/api'
import { createApp } from './app'
import { DEFAULT_PORT } from './config'

const fixturePath = fileURLToPath(
  new URL('../../test-data/dependency-graph.complex.json', import.meta.url),
)

function appFor(graphPath: string) {
  return createApp({ graphPath, port: DEFAULT_PORT })
}

/** このファイルが作った一時ディレクトリ。テストの後に消す */
const tempDirs: string[] = []

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
})

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

/** 一時ファイルに書き出してパスを返す。差し替えの検証では同じパスへ上書きする */
async function writeTemp(content: string): Promise<string> {
  const dir = await makeTempDir('depenomap-server-')
  const path = join(dir, 'graph.json')
  await writeFile(path, content, 'utf8')
  return path
}

async function fetchGraph(app: ReturnType<typeof createApp>) {
  const response = await app.request(GRAPH_ENDPOINT)
  return { response, body: (await response.json()) as LoadResult }
}

describe(`GET ${GRAPH_ENDPOINT}`, () => {
  it('指定した正本 JSON をそのまま返す', async () => {
    const { response, body } = await fetchGraph(appFor(fixturePath))

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    if (!body.ok) return
    expect(body.graph.nodes).toHaveLength(88)
    expect(body.warnings).toHaveLength(0)
  })

  it('差し替えた JSON が中間キャッシュで古いまま返らないようにする', async () => {
    const { response } = await fetchGraph(appFor(fixturePath))

    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('読み込めなくても 200 で返し、理由を本文に載せる', async () => {
    const { response, body } = await fetchGraph(appFor('/存在しない/graph.json'))

    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    if (body.ok) return
    expect(body.errors[0]?.type).toBe('read-failed')
  })

  it('JSON として壊れていても 200 で返す', async () => {
    const { response, body } = await fetchGraph(appFor(await writeTemp('{ not json')))

    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    if (body.ok) return
    expect(body.errors[0]?.type).toBe('invalid-json')
  })

  it('成功しても警告があれば同じ経路で運ぶ', async () => {
    const raw = JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>
    raw.schemaVersion = '1.1.0'
    const { response, body } = await fetchGraph(appFor(await writeTemp(JSON.stringify(raw))))

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.warnings.map((w) => w.type)).toContain('schema-version-differs')
  })

  it('要求のたびに読み直す。差し替えれば再起動なしで次の応答に出る', async () => {
    const raw = JSON.parse(await readFile(fixturePath, 'utf8')) as Record<string, unknown>
    const path = await writeTemp(JSON.stringify(raw))
    const app = appFor(path)

    const before = await fetchGraph(app)
    expect(before.body.ok).toBe(true)
    if (!before.body.ok) return
    expect(before.body.graph.nodes).toHaveLength(88)

    // 同じパスの中身だけを入れ替える。アプリは作り直さない
    const meta = raw.meta as { snapshot: { label: string } }
    meta.snapshot.label = '差し替え後のスナップショット'
    await writeFile(path, JSON.stringify(raw), 'utf8')

    const after = await fetchGraph(app)
    expect(after.body.ok).toBe(true)
    if (!after.body.ok) return
    expect(after.body.graph.meta.snapshot.label).toBe('差し替え後のスナップショット')
    expect(before.body.graph.meta.snapshot.label).not.toBe(after.body.graph.meta.snapshot.label)
  })
})

describe('その他の経路', () => {
  it('clientDir を渡さない dev でも、知らない API は 404', async () => {
    const response = await appFor(fixturePath).request('/api/unknown')

    expect(response.status).toBe(404)
  })
})

/** ビルド済みの画面に見立てたディレクトリを作る */
async function writeClientDir(): Promise<string> {
  const dir = await makeTempDir('depenomap-client-')
  await mkdir(join(dir, 'assets'))
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>画面</title>', 'utf8')
  await writeFile(join(dir, 'assets', 'app.js'), 'export const a = 1', 'utf8')
  return dir
}

/** ブラウザが画面を開くときに送る Accept */
const HTML_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'

describe('画面の配信（本番）', () => {
  it('clientDir を渡すと index.html を返す', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      {
        clientDir: await writeClientDir(),
      },
    )

    const response = await app.request('/')

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<title>画面</title>')
  })

  it('アセットを返す', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      {
        clientDir: await writeClientDir(),
      },
    )

    const response = await app.request('/assets/app.js')

    expect(response.status).toBe(200)
  })

  // ノード ID はファイルパスなので、画面の URL にもドットが入りうる
  it.each(['/nodes/some-file', '/node/src/app/main.ts'])(
    '画面は単一ページなので、直接叩かれた URL にも index.html を返す: %s',
    async (path) => {
      const app = createApp(
        { graphPath: fixturePath, port: DEFAULT_PORT },
        {
          clientDir: await writeClientDir(),
        },
      )

      const response = await app.request(path, { headers: { Accept: HTML_ACCEPT } })

      expect(response.status).toBe(200)
      expect(await response.text()).toContain('<title>画面</title>')
    },
  )

  it('画面を求めていない要求はフォールバックしない', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      {
        clientDir: await writeClientDir(),
      },
    )

    const response = await app.request('/nodes/some-file', { headers: { Accept: '*/*' } })

    expect(response.status).toBe(404)
  })

  it('静的配信より API を先に引き当てる', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      {
        clientDir: await writeClientDir(),
      },
    )

    const response = await app.request(GRAPH_ENDPOINT)

    expect(response.headers.get('Content-Type')).toContain('application/json')
  })

  it('知らない /api/* は 404。画面のフォールバックに巻き込まない', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      { clientDir: await writeClientDir() },
    )

    const response = await app.request('/api/unknown')

    expect(response.status).toBe(404)
  })

  // ブラウザで直接開かれても index.html を返さない。要求元によって変わらない
  it.each([HTML_ACCEPT, '*/*'])(
    '無いアセットは 404。index.html を返さない: Accept %s',
    async (accept) => {
      const app = createApp(
        { graphPath: fixturePath, port: DEFAULT_PORT },
        { clientDir: await writeClientDir() },
      )

      const response = await app.request('/assets/nope.js', { headers: { Accept: accept } })

      expect(response.status).toBe(404)
    },
  )

  it('index.html は毎回問い合わせさせる', async () => {
    const app = createApp(
      { graphPath: fixturePath, port: DEFAULT_PORT },
      { clientDir: await writeClientDir() },
    )

    const response = await app.request('/')

    expect(response.headers.get('Cache-Control')).toBe('no-cache')
  })

  it('clientDir を渡さなければ画面を配信しない。dev では Vite が配信する', async () => {
    const response = await appFor(fixturePath).request('/')

    expect(response.status).toBe(404)
  })
})
