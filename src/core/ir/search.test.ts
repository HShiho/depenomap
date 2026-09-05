import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

import { DependencyGraphSchema, type DependencyGraph } from '../graph/schema'
import { matches, normalize } from './search'
import { buildViewModel } from './view-model'

const fixtureUrl = new URL('../../../test-data/dependency-graph.complex.json', import.meta.url)
const fixture: unknown = JSON.parse(readFileSync(fileURLToPath(fixtureUrl), 'utf8'))

function vmOf(mutate?: (g: DependencyGraph) => void) {
  const graph = v.parse(DependencyGraphSchema, structuredClone(fixture))
  mutate?.(graph)
  return buildViewModel(graph)
}

describe('検索キーの中身（ADR-003）', () => {
  it('ファイルは名前とパスを持つ', () => {
    const key = vmOf().searchKeyOf('file:src/domain/Todo.ts')

    expect(key?.name).toBe('Todo.ts')
    expect(key?.path).toBe('src/domain/Todo.ts')
  })

  it('メソッドは所属ファイルのパスを持つ', () => {
    const key = vmOf().searchKeyOf('method:src/domain/Todo.ts#Todo.complete')

    expect(key?.name).toBe('complete')
    expect(key?.path).toBe('src/domain/Todo.ts')
  })

  it('照合用の文字列は小文字化されている', () => {
    const key = vmOf().searchKeyOf('file:src/domain/Todo.ts')

    expect(key?.normalized).toBe('todo.ts\nsrc/domain/todo.ts')
  })

  it('**対象は検索欄に打てない文字で区切る**（境界をまたいで一致させない）', () => {
    const key = vmOf().searchKeyOf('file:src/domain/Todo.ts')

    // 半角スペースで繋ぐと `Todo.ts src` が名前とパスをまたいで当たる
    expect(key?.normalized).not.toContain(' ')
  })

  it('全ノードが検索キーを持つ', () => {
    const vm = vmOf()
    const all = [...vm.nodes.file, ...vm.nodes.method]

    expect(all.every((n) => vm.searchKeyOf(n.id) !== undefined)).toBe(true)
  })
})

describe('一致方式', () => {
  const key = { normalized: 'todorepository.ts src/infra/todorepository.ts', name: '', path: '' }

  it('部分一致する', () => {
    expect(matches(key, 'Repository')).toBe(true)
  })

  it('大文字小文字を区別しない', () => {
    expect(matches(key, 'REPOSITORY')).toBe(true)
    expect(matches(key, 'repository')).toBe(true)
  })

  it('パスの一部でも引ける', () => {
    expect(matches(key, 'src/infra/')).toBe(true)
  })

  it('含まれない語は一致しない', () => {
    expect(matches(key, 'controller')).toBe(false)
  })

  it.each(['', '   ', '\t'])('空の検索語（%j）は一致しない', (query) => {
    expect(matches(key, query)).toBe(false)
  })

  it('normalize は検索語とキーに同じ処理をかける', () => {
    expect(normalize('TodoRepository')).toBe('todorepository')
  })
})

describe('findByQuery', () => {
  it('部分一致で複数のノードを引く（Repository → 複数）', () => {
    const found = vmOf().findByQuery('Repository', 'file')

    expect(found.length).toBeGreaterThan(1)
    expect(found.map((n) => n.name)).toContain('TodoRepository.ts')
  })

  it('ディレクトリ単位で絞り込める', () => {
    // 粒度を指定した結果は FileNode に絞られるため、kind の絞り直しが要らない
    const found = vmOf().findByQuery('src/domain/', 'file')

    expect(found.every((n) => n.path.startsWith('src/domain/'))).toBe(true)
    expect(found.length).toBeGreaterThan(0)
  })

  it('メソッド粒度の結果は所属ファイルを持つ', () => {
    const vm = vmOf()
    const found = vm.findByQuery('complete', 'method')

    expect(found.every((n) => vm.nodeById.get(n.parent)?.kind === 'file')).toBe(true)
  })

  it('メソッド名で直接引ける（US-02 の粒度）', () => {
    const found = vmOf().findByQuery('complete', 'method')

    expect(found.map((n) => n.name)).toContain('complete')
  })

  it('メソッドは所属ファイルのパスでも引ける', () => {
    const found = vmOf().findByQuery('src/domain/Todo.ts', 'method')

    expect(found.length).toBeGreaterThan(0)
    expect(found.every((n) => n.kind === 'method')).toBe(true)
  })

  it('粒度をまたがない', () => {
    const vm = vmOf()

    expect(vm.findByQuery('Todo.ts', 'file').every((n) => n.kind === 'file')).toBe(true)
    expect(vm.findByQuery('Todo.ts', 'method').every((n) => n.kind === 'method')).toBe(true)
  })

  it('**名前とパスの境界をまたいだ入力は一致しない**', () => {
    const vm = vmOf()

    // `Todo.ts` という名前のファイルは実在するが、`Todo.ts src` は
    // どのノードの中にも現れない文字列である
    expect(vm.findByQuery('Todo.ts', 'file').length).toBeGreaterThan(0)
    expect(vm.findByQuery('Todo.ts src', 'file')).toEqual([])
  })

  it('**粒度を省略すると全ノードが対象になる**（ADR-003）', () => {
    const vm = vmOf()
    const found = vm.findByQuery('Todo.ts')

    // メソッド粒度で見ていてもファイル名で引ける、が ADR-003 の要求
    expect(found.some((n) => n.kind === 'file')).toBe(true)
    expect(found.some((n) => n.kind === 'method')).toBe(true)
    expect(found.length).toBe(
      vm.findByQuery('Todo.ts', 'file').length + vm.findByQuery('Todo.ts', 'method').length,
    )
  })

  it('**粒度を省略した結果は正本 JSON の並びを保つ**（粒度ごとに固めない）', () => {
    // フィクスチャは file がまとまってから method が並ぶため、
    // 粒度で固めた実装と区別がつかない。method を先頭へ移して差を作る
    const vm = vmOf((g) => {
      const method = g.nodes.find((n) => n.kind === 'method')!
      g.nodes = [method, ...g.nodes.filter((n) => n.id !== method.id)]
    })
    const found = vm.findByQuery('.ts')

    expect(found).toHaveLength(88)
    expect(found[0]?.kind).toBe('method')
  })

  it('空の検索語は 0 件（全件ではない）', () => {
    expect(vmOf().findByQuery('', 'file')).toEqual([])
    expect(vmOf().findByQuery('')).toEqual([])
  })

  it('一致しなければ 0 件', () => {
    expect(vmOf().findByQuery('存在しない語', 'file')).toEqual([])
  })

  it('結果は正本 JSON の並びを保つ', () => {
    const vm = vmOf()
    const found = vm.findByQuery('.ts', 'file')

    expect(found.map((n) => n.id)).toEqual(vm.nodes.file.map((n) => n.id))
  })
})
