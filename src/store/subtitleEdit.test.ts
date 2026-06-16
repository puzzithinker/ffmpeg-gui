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