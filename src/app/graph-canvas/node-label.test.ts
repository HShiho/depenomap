import { describe, expect, it } from 'vitest'

import type { GraphNode } from '@/core/graph/schema'
import { NAME_LIMIT, nameLimitFor, subtitleOf, titleOf, tooltipOf } from './node-label'

function method(owner: string | null, name: string): GraphNode {
  return {
    id: `method:src/x.ts#${owner ?? ''}${name}`,
    kind: 'method',
    parent: 'file:src/x.ts',
    name,
    owner,
    ownerKind: owner === null ? null : 'class',
    loc: { line: 1, column: 1 },
  } as GraphNode
}

function file(path: string): GraphNode {
  return { id: `file:${path}`, kind: 'file', path, name: path.split('/').at(-1)! } as GraphNode
}

describe('見出し', () => {
  it('メソッドは owner.name', () => {
    expect(titleOf(method('TodoController', 'post'))).toBe('TodoController.post')
  })

  it('トップレベル関数は名前だけ', () => {
    expect(titleOf(method(null, 'requireUser'))).toBe('requireUser')
  })

  it('長いときは owner 側を削り、メソッド名は残す', () => {
    const title = titleOf(method('InMemoryTodoRepository', 'findById'))

    expect(title.length).toBeLessThanOrEqual(NAME_LIMIT)
    expect(title.endsWith('.findById')).toBe(true)
  })

  it('同じクラスの別メソッドが、同じ見出しにならない', () => {
    const save = titleOf(method('InMemoryTodoRepository', 'save'))
    const remove = titleOf(method('InMemoryTodoRepository', 'delete'))

    expect(save).not.toBe(remove)
  })

  it('メソッド名だけで上限を超えても、所属で見分けがつく', () => {
    // 実データに無い長さ。ここが落ちると、別クラスの同名メソッドが衝突する
    const long = 'findByOwnerAndStatusAndDueDate'
    const fromInterface = titleOf(method('ITodoRepository', long))
    const fromClass = titleOf(method('TodoRepository', long))
    const topLevel = titleOf(method(null, long))

    // インターフェースと実装は隣り合って出るため、ここが同形だと図が読めない
    expect(fromInterface).not.toBe(fromClass)
    // 所属があること自体も、トップレベル関数と区別がつく形で残る
    expect(fromInterface).not.toBe(topLevel)
    expect(fromClass).not.toBe(topLevel)
  })

  it.each([10, 19, 20, 21, 22, 23, 30, 60])('名前が %i 文字でも上限に収まる', (length) => {
    // 長さで分岐が変わるため、境界をまたいで全部見る
    const name = 'x'.repeat(length)

    expect(titleOf(method('InMemoryTodoRepository', name)).length).toBeLessThanOrEqual(NAME_LIMIT)
    expect(titleOf(method(null, name)).length).toBeLessThanOrEqual(NAME_LIMIT)
    expect(titleOf(file(`${name}.ts`)).length).toBeLessThanOrEqual(NAME_LIMIT)
  })
})

describe('重ねる説明', () => {
  it('切り詰めた見出しの全文を持つ', () => {
    // 図の上では 22 文字に収まるため、ここが唯一の確かめる手段になる
    const long = method('ITodoRepository', 'findByOwnerAndStatusAndDueDate')

    expect(titleOf(long).length).toBeLessThanOrEqual(NAME_LIMIT)
    expect(tooltipOf(long, () => 'src/infra/TodoRepository.ts')).toContain(
      'ITodoRepository.findByOwnerAndStatusAndDueDate',
    )
  })

  it('切り詰めたパスの全文も持つ', () => {
    const deep = file('src/very/deep/nested/path/to/Module.ts')

    expect(subtitleOf(deep, () => undefined)).not.toContain('src/very')
    expect(tooltipOf(deep, () => undefined)).toContain('src/very/deep/nested/path/to/Module.ts')
  })

  it('所属が引けないときは識別子だけにする', () => {
    expect(tooltipOf(method('Todo', 'rename'), () => undefined)).toBe('Todo.rename')
  })

  it('トップレベル関数は名前だけ', () => {
    expect(tooltipOf(method(null, 'requireUser'), () => undefined)).toBe('requireUser')
  })
})

describe('2 行目', () => {
  it('ファイルはそのパス', () => {
    expect(subtitleOf(file('src/domain/Todo.ts'), () => undefined)).toBe('src/domain/Todo.ts')
  })

  it('メソッドは所属ファイルのパス', () => {
    expect(subtitleOf(method('Todo', 'rename'), () => 'src/domain/Todo.ts')).toBe(
      'src/domain/Todo.ts',
    )
  })

  it('所属が引けなくても空文字で済ませる', () => {
    expect(subtitleOf(method('Todo', 'rename'), () => undefined)).toBe('')
  })

  it('長いパスは先頭を落とす。末尾のほうが見分けに効く', () => {
    const subtitle = subtitleOf(file('src/very/deep/nested/path/to/Module.ts'), () => undefined)

    expect(subtitle.startsWith('…')).toBe(true)
    expect(subtitle.endsWith('Module.ts')).toBe(true)
  })
})

describe('印が並ぶときの上限（UT-10）', () => {
  it('印が無ければ据え置き', () => {
    expect(nameLimitFor(undefined)).toBe(NAME_LIMIT)
  })

  it('印が長いほど、見出しは短くなる', () => {
    expect(nameLimitFor('循環（型のみ）')).toBeLessThan(nameLimitFor('循環'))
  })

  it('短い印なら、据え置きのまま', () => {
    // 「循環」だけなら見出しの右端まで届かない
    expect(nameLimitFor('循環')).toBe(NAME_LIMIT)
  })

  it('印がどれだけ長くても、見出しを潰し切らない', () => {
    // 名前が消えると、どのノードなのかが読めなくなり、印だけが残る
    expect(nameLimitFor('循環'.repeat(20))).toBeGreaterThan(0)
  })

  it('上限を渡すと、見出しがそこまで縮む', () => {
    const node = {
      kind: 'file',
      id: 'file:a',
      name: 'VeryLongFileNameHere.ts',
      path: 'src/a.ts',
    } as const

    expect(titleOf(node).length).toBeLessThanOrEqual(NAME_LIMIT)
    expect(titleOf(node, 10).length).toBeLessThanOrEqual(10)
  })
})
