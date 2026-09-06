import { describe, expect, it } from 'vitest'

import { DEFAULT_PORT, GRAPH_PATH_ENV, PORT_ENV, resolveConfig } from './config'

const CWD = '/work/depenomap'

describe('正本 JSON のパス', () => {
  it('--graph の相対パスを作業ディレクトリ起点で絶対パスにする', () => {
    const result = resolveConfig(['--graph', 'test-data/graph.json'], {}, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.graphPath).toBe('/work/depenomap/test-data/graph.json')
  })

  it('絶対パスはそのまま使う', () => {
    const result = resolveConfig(['--graph', '/srv/graph.json'], {}, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.graphPath).toBe('/srv/graph.json')
  })

  it('--graph=path の形も受ける', () => {
    const result = resolveConfig(['--graph=/srv/graph.json'], {}, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.graphPath).toBe('/srv/graph.json')
  })

  it('環境変数でも指定できる', () => {
    const result = resolveConfig([], { [GRAPH_PATH_ENV]: '/srv/graph.json' }, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.graphPath).toBe('/srv/graph.json')
  })

  it('コマンドラインが環境変数より優先される', () => {
    const result = resolveConfig(
      ['--graph', '/srv/argv.json'],
      { [GRAPH_PATH_ENV]: '/srv/env.json' },
      CWD,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.graphPath).toBe('/srv/argv.json')
  })

  it('指定が無ければ失敗する。既定のパスへ勝手に落とさない', () => {
    const result = resolveConfig([], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toContain('--graph')
  })

  it('argv を受け取れない経路（dev）では、効かない --graph を案内しない', () => {
    const result = resolveConfig([], {}, CWD, { acceptsArgv: false })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages[0]).toContain(GRAPH_PATH_ENV)
    expect(result.messages[0]).not.toContain('--graph')
  })

  it('空文字は未指定として扱う', () => {
    const result = resolveConfig([], { [GRAPH_PATH_ENV]: '' }, CWD)

    expect(result.ok).toBe(false)
  })

  it('値の無い --graph は失敗する', () => {
    const result = resolveConfig(['--graph'], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages.some((m) => m.includes('値が指定されていない'))).toBe(true)
  })

  it('次のオプションを値と取り違えない', () => {
    const result = resolveConfig(['--graph', '--port', '3000'], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages.some((m) => m.includes('値が指定されていない'))).toBe(true)
  })
})

describe('待ち受けポート', () => {
  it('指定が無ければ既定値を使う', () => {
    const result = resolveConfig(['--graph', '/srv/graph.json'], {}, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.port).toBe(DEFAULT_PORT)
  })

  it('--port を受ける', () => {
    const result = resolveConfig(['--graph', '/srv/graph.json', '--port', '8080'], {}, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.port).toBe(8080)
  })

  it('環境変数でも指定できる', () => {
    const result = resolveConfig(['--graph', '/srv/graph.json'], { [PORT_ENV]: '8080' }, CWD)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.config.port).toBe(8080)
  })

  it.each(['abc', '80.5', '-1'])('数値でなければ失敗する: %s', (raw) => {
    const result = resolveConfig(['--graph', '/srv/graph.json', '--port', raw], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages.some((m) => m.includes('ポート'))).toBe(true)
  })

  it.each(['0', '65536'])('範囲外は失敗する: %s', (raw) => {
    const result = resolveConfig(['--graph', '/srv/graph.json', '--port', raw], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages.some((m) => m.includes('1〜65535'))).toBe(true)
  })
})

describe('解釈できない入力', () => {
  it('知らないオプションは無視せず失敗させる', () => {
    const result = resolveConfig(
      ['--graph', '/srv/graph.json', '--grpah', '/srv/typo.json'],
      {},
      CWD,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages.some((m) => m.includes('--grpah'))).toBe(true)
  })

  it('同じオプションを 2 回渡されたら失敗させる。後勝ちで黙って上書きしない', () => {
    const result = resolveConfig(['--graph', '/a.json', '--graph', '/b.json'], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    // 2 つ目の値を読み飛ばすので、値がオプション名として拾われない
    expect(result.messages).toEqual(['--graph が複数回指定されている'])
  })

  it('重複した --port の値も読み飛ばす', () => {
    const result = resolveConfig(['--port', '80', '--port', '90', '--graph', '/a.json'], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages).toEqual(['--port が複数回指定されている'])
  })

  it('不備は 1 つ目で止めず、すべて集めて返す', () => {
    const result = resolveConfig(['--port', 'abc', '--unknown'], {}, CWD)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.messages).toHaveLength(3)
  })
})
