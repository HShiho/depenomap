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

    expect(key?.normalized).toBe('todo.ts src/domain/todo.ts')
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
    const found = vmOf().findByQuery('src/domain/', 'file')

    expect(found.every((n) => n.kind === 'file' && n.path.startsWith('src/domain/'))).toBe(true)
    expect(found.length).toBeGreaterThan(0)
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

  it('空の検索語は 0 件（全件ではない）', () => {
    expect(vmOf().findByQuery('', 'file')).toEqual([])
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
