import { describe, it, expect, beforeEach, vi } from 'vitest'

// The inbox actions talk to Supabase and to Anthropic. The Supabase client is replaced with an
// in-memory fake below whose tables and storage buckets are real state, so these tests assert what
// the action actually decided to write (which library, which section, which bucket object) rather
// than which mock methods it happened to call. Only the outbound AI call and Next's cache
// invalidation are stubbed, because neither is part of the behavior under test.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => fake.client }))
vi.mock('@/app/(app)/projects/[projectId]/vault/actions', () => ({
  ingestGeneralDocument: vi.fn(async () => {}),
}))

import { stageInboxUpload, confirmInboxItem } from './actions'

type Row = Record<string, unknown>

// Join filters like .eq('libraries.user_id', id) on library_sections need the parent row.
const JOIN_RESOLVERS: Record<string, (row: Row, tables: Record<string, Row[]>) => Row | undefined> = {
  libraries: (row, tables) => (tables.libraries ?? []).find((l) => l.id === row.library_id),
}

class FakeSupabase {
  tables: Record<string, Row[]> = {}
  objects = new Map<string, Blob>()
  failInserts = new Set<string>()
  userId = 'user-1'
  private counter = 0

  auth = {
    getUser: async () => ({ data: { user: { id: this.userId } } }),
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: Blob) => {
        this.objects.set(`${bucket}/${path}`, body)
        return { error: null }
      },
      download: async (path: string) => {
        const blob = this.objects.get(`${bucket}/${path}`)
        return blob ? { data: blob, error: null } : { data: null, error: { message: 'not found' } }
      },
      remove: async (paths: string[]) => {
        for (const p of paths) this.objects.delete(`${bucket}/${p}`)
        return { error: null }
      },
    }),
  }

  seed(table: string, rows: Row[]) {
    this.tables[table] = (this.tables[table] ?? []).concat(rows)
  }

  rows(table: string): Row[] {
    return this.tables[table] ?? []
  }

  putObject(bucket: string, path: string, blob: Blob) {
    this.objects.set(`${bucket}/${path}`, blob)
  }

  nextId(table: string): string {
    this.counter += 1
    return `${table}-generated-${this.counter}`
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }

  get client(): never {
    return this as unknown as never
  }
}

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown }> {
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row = {}
  private filters: [string, unknown][] = []
  private inFilters: [string, unknown[]][] = []
  private wantSingle = false

  constructor(private db: FakeSupabase, private table: string) {}

  select() {
    return this
  }

  order() {
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push([column, value])
    return this
  }

  in(column: string, values: unknown[]) {
    this.inFilters.push([column, values])
    return this
  }

  insert(payload: Row) {
    this.op = 'insert'
    this.payload = payload
    return this
  }

  update(payload: Row) {
    this.op = 'update'
    this.payload = payload
    return this
  }

  single() {
    this.wantSingle = true
    return this
  }

  private matches(row: Row): boolean {
    for (const [column, value] of this.filters) {
      if (column.includes('.')) {
        const [relation, relColumn] = column.split('.')
        const parent = JOIN_RESOLVERS[relation]?.(row, this.db.tables)
        if (!parent || parent[relColumn] !== value) return false
      } else if (row[column] !== value) {
        return false
      }
    }
    for (const [column, values] of this.inFilters) {
      if (!values.includes(row[column])) return false
    }
    return true
  }

  private run(): { data: unknown; error: unknown } {
    const rows = (this.db.tables[this.table] ??= [])

    if (this.op === 'insert') {
      if (this.db.failInserts.has(this.table)) {
        return { data: null, error: { message: `insert into ${this.table} failed` } }
      }
      const created = { id: this.db.nextId(this.table), ...this.payload }
      rows.push(created)
      return { data: this.wantSingle ? created : [created], error: null }
    }

    const matched = rows.filter((row) => this.matches(row))

    if (this.op === 'update') {
      for (const row of matched) Object.assign(row, this.payload)
      return { data: matched, error: null }
    }

    if (this.wantSingle) {
      return matched.length === 1
        ? { data: matched[0], error: null }
        : { data: null, error: { message: 'no rows returned' } }
    }
    return { data: matched, error: null }
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected)
  }
}

let fake: FakeSupabase

function templateFormData(overrides: Record<string, string> = {}): FormData {
  const values: Record<string, string> = {
    libraryName: 'Templates',
    sectionName: 'Unsorted',
    sectionDescription: 'Anything not filed yet',
    existingLibraryId: 'lib-1',
    existingSectionId: 'sec-1',
    proposedLibraryName: 'Templates',
    proposedSectionName: 'Unsorted',
    ...overrides,
  }
  const formData = new FormData()
  for (const [key, value] of Object.entries(values)) formData.set(key, value)
  return formData
}

function seedPendingTemplate() {
  fake.seed('libraries', [{ id: 'lib-1', user_id: 'user-1', name: 'Templates' }])
  fake.seed('library_sections', [
    { id: 'sec-1', library_id: 'lib-1', name: 'Unsorted', description: 'Anything not filed yet' },
  ])
  fake.seed('inbox_items', [
    {
      id: 'item-1',
      user_id: 'user-1',
      file_name: 'office-dcf.xlsx',
      storage_path: 'user-1/staged-office-dcf.xlsx',
      detected_type: 'candidate_template',
      status: 'pending_review',
    },
  ])
  fake.putObject('inbox', 'user-1/staged-office-dcf.xlsx', new Blob(['xlsx bytes']))
}

beforeEach(() => {
  fake = new FakeSupabase()
  vi.clearAllMocks()
})

describe('confirmInboxItem — the user can overrule the proposed destination', () => {
  it('files into the proposed section when the user leaves both names untouched', async () => {
    seedPendingTemplate()

    await confirmInboxItem('item-1', templateFormData())

    expect(fake.rows('libraries')).toHaveLength(1)
    expect(fake.rows('library_sections')).toHaveLength(1)
    expect(fake.rows('templates')[0].section_id).toBe('sec-1')
  })

  it('creates a new section under the same library when only the section name was edited', async () => {
    seedPendingTemplate()

    await confirmInboxItem('item-1', templateFormData({ sectionName: 'Office Decks' }))

    expect(fake.rows('libraries')).toHaveLength(1)
    const sections = fake.rows('library_sections')
    expect(sections).toHaveLength(2)
    const created = sections.find((s) => s.name === 'Office Decks')!
    expect(created.library_id).toBe('lib-1')
    expect(fake.rows('templates')[0].section_id).toBe(created.id)
  })

  it('creates a new library when the library name was edited', async () => {
    seedPendingTemplate()

    await confirmInboxItem('item-1', templateFormData({ libraryName: 'BOV Library' }))

    const libraries = fake.rows('libraries')
    expect(libraries).toHaveLength(2)
    const newLibrary = libraries.find((l) => l.name === 'BOV Library')!
    expect(newLibrary.user_id).toBe('user-1')
  })

  it('never reuses the proposed section id once the library fell through to create-new, even when the section name still matches', async () => {
    seedPendingTemplate()

    // The section name is left exactly as proposed; only the library name changed. sec-1 belongs to
    // lib-1, so reusing it would file the template into the old library under a brand new one.
    await confirmInboxItem('item-1', templateFormData({ libraryName: 'BOV Library' }))

    const newLibrary = fake.rows('libraries').find((l) => l.name === 'BOV Library')!
    const sections = fake.rows('library_sections')
    expect(sections).toHaveLength(2)
    const created = sections.find((s) => s.id !== 'sec-1')!
    expect(created.library_id).toBe(newLibrary.id)
    expect(created.name).toBe('Unsorted')
    expect(fake.rows('templates')[0].section_id).toBe(created.id)
    expect(fake.rows('templates')[0].section_id).not.toBe('sec-1')
  })

  it('treats casing and surrounding whitespace as leaving the proposal untouched', async () => {
    seedPendingTemplate()

    await confirmInboxItem(
      'item-1',
      templateFormData({ libraryName: '  templates ', sectionName: 'UNSORTED' })
    )

    expect(fake.rows('libraries')).toHaveLength(1)
    expect(fake.rows('library_sections')).toHaveLength(1)
    expect(fake.rows('templates')[0].section_id).toBe('sec-1')
  })

  it('still refuses an existing library id that belongs to someone else', async () => {
    seedPendingTemplate()
    fake.seed('libraries', [{ id: 'lib-other', user_id: 'someone-else', name: 'Theirs' }])

    await expect(
      confirmInboxItem(
        'item-1',
        templateFormData({
          existingLibraryId: 'lib-other',
          libraryName: 'Theirs',
          proposedLibraryName: 'Theirs',
        })
      )
    ).rejects.toThrow(/Library not found/)
  })
})

describe('stageInboxUpload — file type allowlist', () => {
  it('rejects a file type the app cannot parse, before anything reaches storage', async () => {
    const formData = new FormData()
    formData.set('file', new File(['MZ binary'], 'payload.exe', { type: 'application/octet-stream' }))

    await expect(stageInboxUpload(formData)).rejects.toThrow(/supported/)

    expect(fake.objects.size).toBe(0)
    expect(fake.rows('inbox_items')).toHaveLength(0)
  })

  it('rejects a file whose content type is allowed-looking but whose extension is not', async () => {
    const formData = new FormData()
    formData.set('file', new File(['#!/bin/sh'], 'run.sh', { type: 'application/x-sh' }))

    await expect(stageInboxUpload(formData)).rejects.toThrow(/supported/)
    expect(fake.rows('inbox_items')).toHaveLength(0)
  })

  it('accepts a PDF and stages it', async () => {
    const formData = new FormData()
    formData.set('file', new File(['%PDF-1.7'], 'offering-memo.pdf', { type: 'application/pdf' }))

    await stageInboxUpload(formData)

    const items = fake.rows('inbox_items')
    expect(items).toHaveLength(1)
    expect(items[0].detected_type).toBe('general_document')
    expect(fake.objects.size).toBe(1)
  })
})
