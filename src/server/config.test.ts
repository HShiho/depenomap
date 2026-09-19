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

  it('3 回以上渡されても、同じ文言を並べない', () => {
    const result = resolveConfig(
      ['--graph', '/a.json', '--graph', '/b.json', '--graph', '/c.json'],
      {},
      CWD,
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
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

describe('解析対象リポジトリの指定（UT-20）', () => {
  it('ホスト側とマウント先を対応づける', () => {
    // 存在を確かめるのはマウント先、エディタへ渡すのはホスト側
    const result = resolveConfig(['--graph', '/g.json', '--repo', '/Users/me/app=/repo'], {}, '/w')

    expect(result.ok && result.config.repo).toEqual({
      hostPath: '/Users/me/app',
      mountPath: '/repo',
    })
  })

  it('マウント先を省くと、ホスト側と同じ場所とみなす', () => {
    // Docker を経由せずに動かすときは両者が一致する
    const result = resolveConfig(['--graph', '/g.json', '--repo', '/Users/me/app'], {}, '/w')

    expect(result.ok && result.config.repo).toEqual({
      hostPath: '/Users/me/app',
      mountPath: '/Users/me/app',
    })
  })

  it('環境変数でも渡せる', () => {
    const result = resolveConfig([], { DEPENOMAP_GRAPH: '/g.json', DEPENOMAP_REPO: '/a=/b' }, '/w')

    expect(result.ok && result.config.repo?.mountPath).toBe('/b')
  })

  it('コマンドラインが環境変数より優先される', () => {
    const result = resolveConfig(
      ['--graph', '/g.json', '--repo', '/from/argv'],
      { DEPENOMAP_REPO: '/from/env' },
      '/w',
    )

    expect(result.ok && result.config.repo?.hostPath).toBe('/from/argv')
  })

  it('渡さなくても起動できる', () => {
    // 図を読むだけなら要らない。エディタで開くときにだけ効く（N-1）
    const result = resolveConfig(['--graph', '/g.json'], {}, '/w')

    expect(result.ok && result.config.repo).toBeUndefined()
  })

  it('相対パスは受け付けない', () => {
    // 作業ディレクトリが違う場所から起動すると、別の場所を指す
    const result = resolveConfig(['--graph', '/g.json', '--repo', 'app=/repo'], {}, '/w')

    expect(result.ok).toBe(false)
    expect(!result.ok && result.messages.join(' ')).toContain('絶対パス')
  })

  it('空の指定は受け付けない', () => {
    const result = resolveConfig(['--graph', '/g.json', '--repo', '/a='], {}, '/w')

    expect(result.ok).toBe(false)
  })

  it('複数回渡されたら失敗する', () => {
    // 後勝ちで黙って上書きすると、どちらが効いたのかが起動コマンドから読めない
    const result = resolveConfig(['--graph', '/g.json', '--repo', '/a', '--repo', '/b'], {}, '/w')

    expect(result.ok).toBe(false)
  })
})

describe('待ち受ける宛先（UT-20）', () => {
  it('既定はループバックだけ', () => {
    // この口には認証が無く、解析対象の構成をそのまま返す
    const result = resolveConfig(['--graph', '/g.json'], {}, '/w')

    expect(result.ok && result.config.host).toBe('127.0.0.1')
  })

  it('明示すれば、そこで待ち受ける', () => {
    // コンテナの中のループバックは外から届かない
    const result = resolveConfig(['--graph', '/g.json', '--host', '0.0.0.0'], {}, '/w')

    expect(result.ok && result.config.host).toBe('0.0.0.0')
  })

  it('環境変数でも渡せる', () => {
    const result = resolveConfig([], { DEPENOMAP_GRAPH: '/g.json', DEPENOMAP_HOST: '::' }, '/w')

    expect(result.ok && result.config.host).toBe('::')
  })
})
