import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideoStore } from './useVideoStore'
import type { SubtitleEntry } from '../types'

describe('useVideoStore - subtitle editing', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.reset()
    })
  })

  const makeEntry = (overrides: Partial<SubtitleEntry> = {}): SubtitleEntry => ({
    id: 'test-id-1',
    index: 1,
    startTimeMs: 1000,
    endTimeMs: 4500,
    text: 'Hello',
    bilingualText: '',
    ...overrides,
  })

  it('should initialize with empty subtitle edit state', () => {
    const { result } = renderHook(() => useVideoStore())
    expect(result.current.subtitleEdit.entries).toEqual([])
    expect(result.current.subtitleEdit.isDirty).toBe(false)
    expect(result.current.subtitleEdit.isBilingual).toBe(false)
    expect(result.current.subtitleEdit.editedFilePath).toBeNull()
    expect(result.current.isEditingSubtitles).toBe(false)
  })

  it('should set subtitle entries and mark dirty', () => {
    const { result } = renderHook(() => useVideoStore())
    const entries = [makeEntry(), makeEntry({ id: 'test-id-2', index: 2, text: 'World' })]

    act(() => {
      result.current.setSubtitleEntries(entries)
    })

    expect(result.current.subtitleEdit.entries).toEqual(entries)
    expect(result.current.subtitleEdit.isDirty).toBe(true)
  })

  it('should update a single subtitle entry', () => {
    const { result } = renderHook(() => useVideoStore())
    const entries = [makeEntry()]

    act(() => {
      result.current.setSubtitleEntries(entries)
    })

    act(() => {
      result.current.updateSubtitleEntry('test-id-1', { text: 'Updated' })
    })

    expect(result.current.subtitleEdit.entries[0].text).toBe('Updated')
    expect(result.current.subtitleEdit.isDirty).toBe(true)
  })

  it('should not affect other entries when updating one', () => {
    const { result } = renderHook(() => useVideoStore())
    const entries = [makeEntry(), makeEntry({ id: 'test-id-2', index: 2, text: 'World' })]

    act(() => {
      result.current.setSubtitleEntries(entries)
    })

    act(() => {
      result.current.updateSubtitleEntry('test-id-1', { text: 'Updated' })
    })

    expect(result.current.subtitleEdit.entries[1].text).toBe('World')
  })

  it('should add a subtitle entry and mark dirty', () => {
    const { result } = renderHook(() => useVideoStore())

    const newEntry = makeEntry()

    act(() => {
      result.current.addSubtitleEntry(newEntry)
    })

    expect(result.current.subtitleEdit.entries).toHaveLength(1)
    expect(result.current.subtitleEdit.entries[0]).toEqual(newEntry)
    expect(result.current.subtitleEdit.isDirty).toBe(true)
  })

  it('should insert a subtitle entry after the given afterId and re-index', () => {
    const { result } = renderHook(() => useVideoStore())
    const entry1 = makeEntry({ id: 'id-1', index: 1, startTimeMs: 1000, endTimeMs: 4500 })
    const entry2 = makeEntry({ id: 'id-2', index: 2, startTimeMs: 5000, endTimeMs: 8000 })

    act(() => {
      result.current.setSubtitleEntries([entry1, entry2])
    })

    const inserted = makeEntry({ id: 'id-new', index: 0, startTimeMs: 4500, endTimeMs: 9500 })
    act(() => {
      result.current.addSubtitleEntry(inserted, 'id-1')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(3)
    expect(entries.map(e => e.id)).toEqual(['id-1', 'id-new', 'id-2'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3])
  })

  it('should append at end when afterId does not match any entry', () => {
    const { result } = renderHook(() => useVideoStore())
    const entry1 = makeEntry({ id: 'id-1', index: 1 })

    act(() => {
      result.current.setSubtitleEntries([entry1])
    })

    const inserted = makeEntry({ id: 'id-new', index: 0, text: 'Tail' })
    act(() => {
      result.current.addSubtitleEntry(inserted, 'missing-id')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(2)
    expect(entries[1].id).toBe('id-new')
  })

  it('should remove a subtitle entry by id', () => {
    const { result } = renderHook(() => useVideoStore())
    const entry1 = makeEntry()
    const entry2 = makeEntry({ id: 'test-id-2', index: 2, text: 'Second' })

    act(() => {
      result.current.setSubtitleEntries([entry1, entry2])
    })

    act(() => {
      result.current.removeSubtitleEntry('test-id-1')
    })

    expect(result.current.subtitleEdit.entries).toHaveLength(1)
    expect(result.current.subtitleEdit.entries[0].id).toBe('test-id-2')
    expect(result.current.subtitleEdit.isDirty).toBe(true)
  })

  it('should toggle bilingual mode', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setBilingualMode(true)
    })

    expect(result.current.subtitleEdit.isBilingual).toBe(true)

    act(() => {
      result.current.setBilingualMode(false)
    })

    expect(result.current.subtitleEdit.isBilingual).toBe(false)
  })

  it('should set language labels', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setPrimaryLanguage('Japanese')
      result.current.setSecondaryLanguage('Korean')
    })

    expect(result.current.subtitleEdit.primaryLanguage).toBe('Japanese')
    expect(result.current.subtitleEdit.secondaryLanguage).toBe('Korean')
  })

  it('should set edited file path and clear dirty', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setSubtitleEntries([makeEntry()])
    })
    expect(result.current.subtitleEdit.isDirty).toBe(true)

    act(() => {
      result.current.setEditedFilePath('/tmp/edited.srt')
    })

    expect(result.current.subtitleEdit.editedFilePath).toBe('/tmp/edited.srt')
    expect(result.current.subtitleEdit.isDirty).toBe(false)
  })

  it('should toggle isEditingSubtitles', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setIsEditingSubtitles(true)
    })
    expect(result.current.isEditingSubtitles).toBe(true)

    act(() => {
      result.current.setIsEditingSubtitles(false)
    })
    expect(result.current.isEditingSubtitles).toBe(false)
  })

  it('should clear subtitle edit state', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setSubtitleEntries([makeEntry()])
      result.current.setBilingualMode(true)
      result.current.setEditedFilePath('/tmp/edited.srt')
      result.current.setIsEditingSubtitles(true)
    })

    act(() => {
      result.current.clearSubtitleEdit()
    })

    expect(result.current.subtitleEdit.entries).toEqual([])
    expect(result.current.subtitleEdit.isDirty).toBe(false)
    expect(result.current.subtitleEdit.isBilingual).toBe(false)
    expect(result.current.subtitleEdit.editedFilePath).toBeNull()
    expect(result.current.isEditingSubtitles).toBe(false)
  })

  it('replaceSubtitleFile drops old cues so re-import cannot keep stale editor content', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setSubtitleFile({ path: '/old.srt', name: 'old.srt' })
      result.current.setSubtitleEntries([makeEntry({ id: 'old', text: 'OLD LINE' })])
      result.current.setEditedFilePath('/old_edited.srt')
      result.current.setIsEditingSubtitles(true)
    })

    act(() => {
      result.current.replaceSubtitleFile(
        { path: '/new.srt', name: 'new.srt' },
        true
      )
    })

    expect(result.current.subtitleFile?.path).toBe('/new.srt')
    expect(result.current.subtitleEdit.entries).toEqual([])
    expect(result.current.subtitleEdit.isDirty).toBe(false)
    expect(result.current.subtitleEdit.editedFilePath).toBeNull()
    expect(result.current.isEditingSubtitles).toBe(true)
  })

  it('hydrateSubtitleEntries loads file content without marking dirty', () => {
    const { result } = renderHook(() => useVideoStore())
    const entries = [makeEntry({ id: 'a', text: 'From disk' })]

    act(() => {
      result.current.hydrateSubtitleEntries(entries)
    })

    expect(result.current.subtitleEdit.entries).toEqual(entries)
    expect(result.current.subtitleEdit.isDirty).toBe(false)
    expect(result.current.subtitleEdit.editedFilePath).toBeNull()
  })

  it('should reset subtitle edit state on full reset', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setSubtitleEntries([makeEntry()])
      result.current.setIsEditingSubtitles(true)
      result.current.setBilingualMode(true)
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.subtitleEdit.entries).toEqual([])
    expect(result.current.isEditingSubtitles).toBe(false)
    expect(result.current.subtitleEdit.isBilingual).toBe(false)
  })
})

describe('useVideoStore - default language values', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.reset()
    })
  })

  it('should default primaryLanguage to Chinese', () => {
    const { result } = renderHook(() => useVideoStore())
    expect(result.current.subtitleEdit.primaryLanguage).toBe('Chinese')
  })

  it('should default secondaryLanguage to Portuguese', () => {
    const { result } = renderHook(() => useVideoStore())
    expect(result.current.subtitleEdit.secondaryLanguage).toBe('Portuguese')
  })

  it('should default secondaryLanguagePosition to after (primary on top)', () => {
    const { result } = renderHook(() => useVideoStore())
    expect(result.current.subtitleEdit.secondaryLanguagePosition).toBe('after')
  })

  it('should restore Chinese/Portuguese/after defaults on reset', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setPrimaryLanguage('English')
      result.current.setSecondaryLanguage('Spanish')
      result.current.setSecondaryLanguagePosition('before')
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.subtitleEdit.primaryLanguage).toBe('Chinese')
    expect(result.current.subtitleEdit.secondaryLanguage).toBe('Portuguese')
    expect(result.current.subtitleEdit.secondaryLanguagePosition).toBe('after')
  })

  it('should restore Chinese/Portuguese/after defaults on clearSubtitleEdit', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.setPrimaryLanguage('English')
      result.current.setSecondaryLanguage('Spanish')
      result.current.setSecondaryLanguagePosition('before')
    })

    act(() => {
      result.current.clearSubtitleEdit()
    })

    expect(result.current.subtitleEdit.primaryLanguage).toBe('Chinese')
    expect(result.current.subtitleEdit.secondaryLanguage).toBe('Portuguese')
    expect(result.current.subtitleEdit.secondaryLanguagePosition).toBe('after')
  })
})

describe('addSubtitleEntry with afterId', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.reset()
    })
  })

  const makeEntry = (overrides: Partial<SubtitleEntry> = {}): SubtitleEntry => ({
    id: 'test-id-1',
    index: 1,
    startTimeMs: 1000,
    endTimeMs: 4500,
    text: 'Hello',
    bilingualText: '',
    ...overrides,
  })

  it('should insert after the first entry in a two-entry list', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 5000 }),
        makeEntry({ id: 'b', index: 2, startTimeMs: 5000, endTimeMs: 10000 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, startTimeMs: 5000, endTimeMs: 10000 }),
        'a'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'new', 'b'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3])
  })

  it('should insert after the last entry', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
        makeEntry({ id: 'c', index: 3 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Tail' }),
        'c'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c', 'new'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4])
  })

  it('should insert in the middle of a three-entry list', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
        makeEntry({ id: 'c', index: 3 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Middle' }),
        'b'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'new', 'c'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4])
  })

  it('should append when afterId is null', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Appended' }),
        null
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'new'])
  })

  it('should append when afterId is undefined', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }))
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'new'])
  })

  it('should append when afterId does not match any entry', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Tail' }),
        'nonexistent-id'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(2)
    expect(entries[1].id).toBe('new')
  })

  it('should insert into an empty list (afterId ignored, entry becomes only entry)', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'First' }),
        'irrelevant-id'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe('new')
  })

  it('should insert into an empty list without afterId', () => {
    const { result } = renderHook(() => useVideoStore())

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }))
    })

    expect(result.current.subtitleEdit.entries).toHaveLength(1)
    expect(result.current.subtitleEdit.entries[0].id).toBe('new')
  })

  it('should mark dirty after insert with afterId', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
      result.current.setEditedFilePath('/tmp/x.srt')
    })
    expect(result.current.subtitleEdit.isDirty).toBe(false)

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0 }),
        'a'
      )
    })

    expect(result.current.subtitleEdit.isDirty).toBe(true)
  })

  it('should re-index correctly when inserting at beginning (after first of 5)', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
        makeEntry({ id: 'c', index: 3 }),
        makeEntry({ id: 'd', index: 4 }),
        makeEntry({ id: 'e', index: 5 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }), 'a')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'new', 'b', 'c', 'd', 'e'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('should re-index correctly when inserting at end (after last of 5)', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
        makeEntry({ id: 'c', index: 3 }),
        makeEntry({ id: 'd', index: 4 }),
        makeEntry({ id: 'e', index: 5 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }), 'e')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'new'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('should re-index correctly when inserting in middle (after 3rd of 5)', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
        makeEntry({ id: 'c', index: 3 }),
        makeEntry({ id: 'd', index: 4 }),
        makeEntry({ id: 'e', index: 5 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }), 'c')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c', 'new', 'd', 'e'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('should handle sequential inserts at different positions', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1 }),
        makeEntry({ id: 'b', index: 2 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new1', index: 0 }), 'a')
    })
    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new2', index: 0 }), 'b')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'new1', 'b', 'new2'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4])
  })

  it('should handle insert after an entry that was itself just inserted', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new1', index: 0 }), 'a')
    })
    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new2', index: 0 }), 'new1')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'new1', 'new2'])
    expect(entries.map(e => e.index)).toEqual([1, 2, 3])
  })

  it('should handle insert after add-without-afterId (append then insert after appended)', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'b', index: 0 }))
    })
    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'c', index: 0 }), 'b')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  it('should preserve bilingual mode when inserting', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1, bilingualText: '你好' })])
      result.current.setBilingualMode(true)
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Hello', bilingualText: '你好' }),
        'a'
      )
    })

    expect(result.current.subtitleEdit.isBilingual).toBe(true)
    expect(result.current.subtitleEdit.entries[1].bilingualText).toBe('你好')
  })

  it('should insert a bilingual entry after a monolingual entry', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1, text: 'Hello', bilingualText: '' }),
        makeEntry({ id: 'b', index: 2, text: 'World', bilingualText: '' }),
      ])
      result.current.setBilingualMode(true)
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, text: 'Test', bilingualText: '測試' }),
        'a'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries[1].text).toBe('Test')
    expect(entries[1].bilingualText).toBe('測試')
  })

  it('should handle insert into a large list (10 entries) in the middle', () => {
    const { result } = renderHook(() => useVideoStore())
    const initial = Array.from({ length: 10 }, (_, i) =>
      makeEntry({ id: `e${i}`, index: i + 1, text: `Entry ${i}` })
    )
    act(() => {
      result.current.setSubtitleEntries(initial)
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'inserted', index: 0, text: 'Inserted' }),
        'e4'
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(11)
    expect(entries[5].id).toBe('inserted')
    expect(entries.map(e => e.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('should not mutate the original entry object passed in', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    const newEntry = makeEntry({ id: 'new', index: 0 })
    const originalIndex = newEntry.index

    act(() => {
      result.current.addSubtitleEntry(newEntry, 'a')
    })

    expect(newEntry.index).toBe(originalIndex)
    expect(result.current.subtitleEdit.entries[1].index).toBe(2)
  })

  it('should handle insert after first entry in a single-entry list', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(makeEntry({ id: 'new', index: 0 }), 'a')
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(2)
    expect(entries.map(e => e.id)).toEqual(['a', 'new'])
    expect(entries.map(e => e.index)).toEqual([1, 2])
  })

  it('should preserve startTimeMs and endTimeMs of inserted entry', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([
        makeEntry({ id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 5000 }),
      ])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0, startTimeMs: 5000, endTimeMs: 10000 }),
        'a'
      )
    })

    const inserted = result.current.subtitleEdit.entries[1]
    expect(inserted.startTimeMs).toBe(5000)
    expect(inserted.endTimeMs).toBe(10000)
  })

  it('should handle insert with empty string afterId (not matched, appends)', () => {
    const { result } = renderHook(() => useVideoStore())
    act(() => {
      result.current.setSubtitleEntries([makeEntry({ id: 'a', index: 1 })])
    })

    act(() => {
      result.current.addSubtitleEntry(
        makeEntry({ id: 'new', index: 0 }),
        ''
      )
    })

    const entries = result.current.subtitleEdit.entries
    expect(entries).toHaveLength(2)
    expect(entries[1].id).toBe('new')
  })
})