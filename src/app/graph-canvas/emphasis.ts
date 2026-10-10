/**
 * カーソルを合わせたものの関係を浮かび上がらせる（UT-25 / 参照仕様の `emphasize()`）。
 *
 * 合わせたノード（または線）に**直接**繋がるものだけを返す。それ以外は図の上で
 * 後ろへ退くが、**消えはしない**。消すのは選択による絞り込み（UT-14）の役目で、
 * こちらは触れているあいだだけの、可逆な見分けである。
 *
 * 繋がりの先の先までは広げない。広げると、混んだ図ではほぼ全部が浮かび、
 * 見分けにならない。循環（UT-10）の範囲まで広げることもしない — 循環は印と
 * 線種で既に読める。
 *
 * 強さは繋がりの数で変えない（N-1）。浮かぶか退くかの 2 値だけ。
 */

/** 合わせた先。ノードか線か */
export type EmphasisTarget = { kind: 'node'; id: string } | { kind: 'edge'; id: string }

/** 引き当てに要る線の形。描く線（読み替えたあと / UT-30）の ID と両端 */
export interface EmphasisEdge {
  id: string
  from: string
  to: string
}

export interface Emphasis {
  /** 合わせた先そのもの。浮かんだほかのノードと見分けるために返す */
  target: EmphasisTarget
  /** 浮かぶノード。合わせたノード自身を含む */
  nodes: ReadonlySet<string>
  /** 浮かぶ線 */
  edges: ReadonlySet<string>
}

/**
 * 合わせた先に対して、浮かぶノードと線を返す。
 *
 * **渡すのは図に描いているものだけ**（絞り込み・畳みのあと）。正本の全体を渡すと、
 * 絞り込みで消えたものまで浮かぶ対象に数えることになる。
 *
 * 合わせた先が図に無ければ `undefined`（何も強調しない）。合わせたまま図が
 * 組み替わると起きる。そのまま強調を残すと、何にも合わせていないのに全体が
 * 退いた図になる。
 */
export function emphasisOf(
  target: EmphasisTarget | undefined,
  figure: { nodeIds: ReadonlySet<string>; edges: readonly EmphasisEdge[] },
): Emphasis | undefined {
  if (target === undefined) return undefined

  if (target.kind === 'edge') {
    const edge = figure.edges.find((candidate) => candidate.id === target.id)
    if (edge === undefined) return undefined
    return { target, nodes: new Set([edge.from, edge.to]), edges: new Set([edge.id]) }
  }

  if (!figure.nodeIds.has(target.id)) return undefined

  const nodes = new Set([target.id])
  const edges = new Set<string>()
  for (const edge of figure.edges) {
    if (edge.from !== target.id && edge.to !== target.id) continue
    edges.add(edge.id)
    nodes.add(edge.from)
    nodes.add(edge.to)
  }
  return { target, nodes, edges }
}
