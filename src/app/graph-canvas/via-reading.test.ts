import { describe, expect, it } from 'vitest'

import type { GraphEdge } from '@/core/graph/schema'
import { readEdges } from './via-reading'

const call = (over: Partial<GraphEdge> = {}): GraphEdge =>
  ({
    id: 'e1',
    kind: 'call',
    granularity: 'method',
    from: 'm:Use.exec',
    to: 'm:IRepo.save',
    resolution: 'via-interface',
    sourceOrder: 0,
    implementations: ['m:RepoA.save', 'm:RepoB.save'],
    ...over,
  }) as GraphEdge

const plainCall = call({ id: 'e2', to: 'm:Direct.run', resolution: 'static', implementations: [] })
const everything = () => true

describe('経由の読み替え（UT-30 / UT-07 の見直し）', () => {
  it('interface 宛で読むと、正本のエッジをそのまま描く', () => {
    // UT-07 の決定（型検査器の答えを正とする）が既定のまま残る
    const read = readEdges([call()], 'interface', everything)

    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ id: 'e1', to: 'm:IRepo.save', retargeted: false })
  })

  it('実装宛で読むと、実装の数だけ線が分かれる', () => {
    // 代表を 1 つ選ぶ基準を持たない（正本が言っていない判断になる / UT-30 の決定）
    const read = readEdges([call()], 'implementation', everything)

    expect(read.map((edge) => edge.to)).toEqual(['m:RepoA.save', 'm:RepoB.save'])
    expect(read.every((edge) => edge.retargeted)).toBe(true)
  })

  it('分かれた線も、元のエッジを指し続ける', () => {
    // 循環の判定や説明は正本のエッジに紐づく
    const read = readEdges([call()], 'implementation', everything)

    expect(read.map((edge) => edge.sourceId)).toEqual(['e1', 'e1'])
    expect(new Set(read.map((edge) => edge.id)).size).toBe(2)
  })

  it('経由でない呼び出しは、読み方によらず変わらない', () => {
    for (const reading of ['interface', 'implementation'] as const) {
      expect(readEdges([plainCall], reading, everything)).toEqual([
        {
          id: 'e2',
          sourceId: 'e2',
          from: plainCall.from,
          to: 'm:Direct.run',
          edge: plainCall,
          retargeted: false,
        },
      ])
    }
  })

  it('経由でない呼び出しは、implementations を持っていても読み替えない', () => {
    /*
     * スキーマは `implementations` を `resolution` と独立に許す（整合性検査も
     * 両者を結び付けていない）。**読み替えてよいのは経由の呼び出しだけ**で、
     * これは IR のたどり方（`traversal.ts`）と同じ規則
     */
    const staticWithImpls = call({
      id: 'e3',
      resolution: 'static',
      to: 'm:Direct.run',
      implementations: ['m:RepoA.save'],
    })

    const read = readEdges([staticWithImpls], 'implementation', everything)

    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ to: 'm:Direct.run', retargeted: false })
  })

  it('実装が図にいなければ、読み替えない', () => {
    /*
     * 読み替えた先が描けないと、線ごと消えて**呼び出しの事実が失われる**。
     * 絞り込み（UT-14）や粒度の切り替えで、実装が図から外れることがある
     */
    const read = readEdges([call()], 'implementation', (id) => id !== 'm:RepoA.save')

    expect(read.map((edge) => edge.to)).toEqual(['m:RepoB.save'])
  })

  it('実装が 1 件も図にいなければ、型検査器の答えに落ちる', () => {
    // IR の規則（`implementations` が引けなければ `to`）と同じ
    const read = readEdges([call()], 'implementation', () => false)

    expect(read).toHaveLength(1)
    expect(read[0]).toMatchObject({ to: 'm:IRepo.save', retargeted: false })
  })

  it('実装を持たない経由も、型検査器の答えに落ちる', () => {
    const read = readEdges([call({ implementations: [] })], 'implementation', everything)

    expect(read[0]).toMatchObject({ to: 'm:IRepo.save', retargeted: false })
  })

  it('読み方を戻せば、元の線に戻る', () => {
    // どちらか一方に潰さない（スキーマ §3 / UT-02 と同じ立場）
    const edges = [call(), plainCall]

    expect(readEdges(edges, 'interface', everything)).toEqual(
      readEdges(
        readEdges(edges, 'implementation', everything).map((read) => read.edge),
        'interface',
        everything,
      ).filter((read, index, all) => all.findIndex((other) => other.id === read.id) === index),
    )
  })
})
