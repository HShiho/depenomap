/**
 * 起動パラメータの解釈。UT-03 が公開する契約のひとつ。
 *
 * 正本 JSON はビルドに焼き込まず、**起動時にパスで指定する**（ADR-004）。
 * したがって「どのグラフを見ているか」は起動コマンドにしか現れない。
 * 指定が無ければ起動しない（`main.ts` / dev プラグインの両方で同じ扱い）。
 *
 * 解釈だけをここに置き、プロセスの終了やログ出力は呼び出し側に任せる。
 * dev（Vite プラグイン）と本番（Node）で同じ規則を使うためであり、
 * 単体テストからも副作用なしに叩けるようにするためである。
 */

import { isAbsolute, resolve } from 'node:path'

/**
 * 待ち受けポートの既定値。
 *
 * Vite の dev server と同じ番号にしてある。dev でも本番でも
 * `http://localhost:5173` で開ける形にし、手順書の分岐を減らす。
 * 両方を同時に立てる場合は片方に `--port` を渡す。
 */
export const DEFAULT_PORT = 5173

/** 正本 JSON のパスを渡す環境変数。dev（Vite）は argv を使えないためこちらで受ける */
export const GRAPH_PATH_ENV = 'DEPENOMAP_GRAPH'

/** 待ち受けポートを渡す環境変数 */
export const PORT_ENV = 'DEPENOMAP_PORT'

export interface ServerConfig {
  /**
   * 正本 JSON の**絶対パス**。相対指定は解釈時に作業ディレクトリを起点として解決する。
   * 絶対パスに畳んでおくのは、読み込みが起動後のどの時点でも同じ場所を指すようにするため
   */
  graphPath: string
  port: number
}

/**
 * 不備は 1 つ見つけた時点で止めず、全部集めて返す。
 * パスとポートを両方間違えたときに 2 回起動し直させない（UT-01 のローダと同じ方針）。
 */
export type ConfigResult = { ok: true; config: ServerConfig } | { ok: false; messages: string[] }

/** 解釈できる起動オプション。ここに無いものを受け取ったら黙って捨てずに失敗させる */
const KNOWN_OPTIONS = ['--graph', '--port'] as const
type KnownOption = (typeof KNOWN_OPTIONS)[number]

function isKnownOption(value: string): value is KnownOption {
  return (KNOWN_OPTIONS as readonly string[]).includes(value)
}

/**
 * `--graph path` と `--graph=path` の両方を受ける。
 *
 * 知らないオプションは無視せずエラーにする。`--grpah` の打ち間違いを
 * 無言で捨てると「指定したのに反映されない」という調べにくい形になる。
 */
function parseArgv(argv: string[]): {
  values: Partial<Record<KnownOption, string>>
  errors: string[]
} {
  const values: Partial<Record<KnownOption, string>> = {}
  const errors: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    const eq = arg.indexOf('=')
    const name = eq === -1 ? arg : arg.slice(0, eq)

    if (!isKnownOption(name)) {
      errors.push(`不明な起動オプション: ${arg}`)
      continue
    }

    /*
     * 同じオプションを 2 回渡されたら失敗させる。後勝ちで黙って上書きすると、
     * どちらが効いたのかが起動コマンドから読めない。打ち間違いを無言で捨てない
     * のと同じ理由である。
     */
    if (values[name] !== undefined) {
      errors.push(`${name} が複数回指定されている`)
      continue
    }

    if (eq !== -1) {
      values[name] = arg.slice(eq + 1)
      continue
    }

    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) {
      errors.push(`${name} に値が指定されていない`)
      continue
    }
    values[name] = next
    i++
  }

  return { values, errors }
}

function parsePort(raw: string): { ok: true; port: number } | { ok: false; message: string } {
  if (!/^\d+$/.test(raw)) {
    return { ok: false, message: `ポートは数値で指定する: ${raw}` }
  }
  const port = Number(raw)
  if (port < 1 || port > 65535) {
    return { ok: false, message: `ポートは 1〜65535 の範囲で指定する: ${raw}` }
  }
  return { ok: true, port }
}

export interface ResolveOptions {
  /**
   * コマンドラインでも受け取れる経路か（既定は受け取れる）。
   * dev は Vite に argv を取られるため `false` を渡す。案内する指定方法を、
   * その経路で実際に効くものだけにするために要る。
   */
  acceptsArgv?: boolean
}

/**
 * 起動パラメータを解釈する。
 *
 * 優先順位はコマンドライン > 環境変数。dev は Vite に argv を取られるため
 * 環境変数しか使えず、本番はどちらでも書ける。同じ規則を 1 か所に持つ。
 */
export function resolveConfig(
  argv: string[],
  env: Record<string, string | undefined>,
  cwd: string,
  options: ResolveOptions = {},
): ConfigResult {
  const { acceptsArgv = true } = options
  const { values, errors } = parseArgv(argv)

  const rawGraph = values['--graph'] ?? env[GRAPH_PATH_ENV]
  if (rawGraph === undefined || rawGraph === '') {
    // 効かない指定方法を案内しない。dev で `--graph` を勧めても Vite が取ってしまう
    const how = acceptsArgv ? `--graph <path> または ${GRAPH_PATH_ENV}` : GRAPH_PATH_ENV
    errors.push(`正本 JSON のパスが指定されていない（${how}）`)
  }

  const rawPort = values['--port'] ?? env[PORT_ENV]
  let port = DEFAULT_PORT
  if (rawPort !== undefined && rawPort !== '') {
    const parsed = parsePort(rawPort)
    if (parsed.ok) port = parsed.port
    else errors.push(parsed.message)
  }

  if (errors.length > 0 || rawGraph === undefined || rawGraph === '') {
    return { ok: false, messages: errors }
  }

  return {
    ok: true,
    config: {
      graphPath: isAbsolute(rawGraph) ? rawGraph : resolve(cwd, rawGraph),
      port,
    },
  }
}
