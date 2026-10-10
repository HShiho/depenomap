import { describe, expect, it } from 'vitest'

import { emphasisOf, type EmphasisEdge } from './emphasis'

/*
 *   a → b → c
 *   a → c
 *   d（孤立）
 *   b → b（自己ループ）
 */
const nodeIds = new Set(['a', 'b', 'c', 'd'])
const edges: EmphasisEdge[] = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bb', from: 'b', to: 'b' },
]

describe('ノードに合わせたとき', () => {
  it('そのノードと、直接繋がるノード・線が浮かぶ', () => {
    const emphasis = emphasisOf({ kind: 'node', id: 'a' }, { nodeIds, edges })

    expect(emphasis?.nodes).toEqual(new Set(['a', 'b', 'c']))
    expect(emphasis?.edges).toEqual(new Set(['ab', 'ac']))
  })

  it('向きを問わない。依存元も依存先も浮かぶ', () => {
    const emphasis = emphasisOf({ kind: 'node', id: 'c' }, { nodeIds, edges })

    expect(emphasis?.nodes).toEqual(new Set(['a', 'b', 'c']))
    expect(emphasis?.edges).toEqual(new Set(['bc', 'ac']))
  })

  it('繋がりの先の先までは広げない', () => {
    // b → c はあるが、c を合わせても b の先（なし）や a の先へは伸ばさない
    const emphasis = emphasisOf({ kind: 'node', id: 'b' }, { nodeIds, edges })

    expect(emphasis?.nodes).toEqual(new Set(['a', 'b', 'c']))
    // a → c は b を通らない
    expect(emphasis?.edges.has('ac')).toBe(false)
  })

  it('自己ループも、そのノードの線として浮かぶ', () => {
    const emphasis = emphasisOf({ kind: 'node', id: 'b' }, { nodeIds, edges })

    expect(emphasis?.edges.has('bb')).toBe(true)
  })

  it('繋がりが無ければ、そのノードだけが浮かぶ', () => {
    const emphasis = emphasisOf({ kind: 'node', id: 'd' }, { nodeIds, edges })

    expect(emphasis?.nodes).toEqual(new Set(['d']))
    expect(emphasis?.edges).toEqual(new Set())
  })

  it('合わせた先そのものを返す（ほかの浮かんだノードと見分けるため）', () => {
    const emphasis = emphasisOf({ kind: 'node', id: 'a' }, { nodeIds, edges })

    expect(emphasis?.target).toEqual({ kind: 'node', id: 'a' })
  })
})

describe('線に合わせたとき', () => {
  it('その線と、両端のノードだけが浮かぶ', () => {
    const emphasis = emphasisOf({ kind: 'edge', id: 'bc' }, { nodeIds, edges })

    expect(emphasis?.nodes).toEqual(new Set(['b', 'c']))
    expect(emphasis?.edges).toEqual(new Set(['bc']))
  })
})

describe('合わせた先が図に無いとき', () => {
  /*
   * 合わせたまま図が組み替わる（粒度・絞り込み・畳み）と、合わせた先が消える。
   * そのまま残すと、何にも合わせていないのに全体が退いた図になる。
   */
  it('ノードが図に無ければ、何も強調しない', () => {
    expect(emphasisOf({ kind: 'node', id: 'gone' }, { nodeIds, edges })).toBeUndefined()
  })

  it('線が図に無ければ、何も強調しない', () => {
    expect(emphasisOf({ kind: 'edge', id: 'gone' }, { nodeIds, edges })).toBeUndefined()
  })

  it('何にも合わせていなければ、何も強調しない', () => {
    expect(emphasisOf(undefined, { nodeIds, edges })).toBeUndefined()
  })
})
