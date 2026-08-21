import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { serializeSrt, msToSrtTime, parseSrtTimeInput } from '../utils/srtParser'
import { findActiveCue } from '../utils/playback'
import type { SubtitleEntry } from '../types'

const SrtTimeField: React.FC<{
  valueMs: number
  onCommit: (ms: number) => void
  onFocus?: () => void
}> = ({ valueMs, onCommit, onFocus }) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(msToSrtTime(valueMs))

  useEffect(() => {
    if (!editing) setDraft(msToSrtTime(valueMs))
  }, [valueMs, editing])

  return (
    <input
      type="text"
      value={editing ? draft : msToSrtTime(valueMs)}
      onFocus={() => {
        setEditing(true)
        setDraft(msToSrtTime(valueMs))
        onFocus?.()
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const ms = parseSrtTimeInput(draft)
        if (ms !== null) onCommit(ms)
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur()
        }
      }}
      className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm font-mono"
    />
  )
}

const SubtitleEditor: React.FC = () => {
  const subtitleFile = useVideoStore((s) => s.subtitleFile)
  const subtitleEdit = useVideoStore((s) => s.subtitleEdit)
  const currentTime = useVideoStore((s) => s.currentTime)
  const activeCueId = useVideoStore((s) => {
    const cue = findActiveCue(s.subtitleEdit.entries, Math.round(s.currentTime * 1000))
    return cue?.id ?? null
  })
  const setSubtitleEntries = useVideoStore((s) => s.setSubtitleEntries)
  const updateSubtitleEntry = useVideoStore((s) => s.updateSubtitleEntry)
  const addSubtitleEntry = useVideoStore((s) => s.addSubtitleEntry)
  const removeSubtitleEntry = useVideoStore((s) => s.removeSubtitleEntry)
  const setBilingualMode = useVideoStore((s) => s.setBilingualMode)
  const setPrimaryLanguage = useVideoStore((s) => s.setPrimaryLanguage)
  const setSecondaryLanguage = useVideoStore((s) => s.setSecondaryLanguage)
  const setSecondaryLanguagePosition = useVideoStore((s) => s.setSecondaryLanguagePosition)
  const setEditedFilePath = useVideoStore((s) => s.setEditedFilePath)
  const clearSubtitleEdit = useVideoStore((s) => s.clearSubtitleEdit)
  const requestSeek = useVideoStore((s) => s.requestSeek)
  const setCueStartFromPlayhead = useVideoStore((s) => s.setCueStartFromPlayhead)
  const setCueEndFromPlayhead = useVideoStore((s) => s.setCueEndFromPlayhead)

  const [exporting, setExporting] = useState(false)
  const [currentEditingId, setCurrentEditingId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!activeCueId) return
    const el = scrollRef.current?.querySelector(`[data-entry-id="${activeCueId}"]`)
    if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeCueId])

  const handleTimeChange = (id: string, field: 'startTimeMs' | 'endTimeMs', ms: number) => {
    updateSubtitleEntry(id, { [field]: ms })
  }

  const handleAddEntry = () => {
    const entries = subtitleEdit.entries
    const currentIdx = currentEditingId
      ? entries.findIndex(e => e.id === currentEditingId)
      : -1

    let startTimeMs: number
    let endTimeMs: number
    let afterId: string | null = null

    if (currentIdx >= 0) {
      const current = entries[currentIdx]
      startTimeMs = current.endTimeMs
      endTimeMs = startTimeMs + 5000
      afterId = current.id
    } else if (entries.length > 0) {
      const last = entries[entries.length - 1]
      startTimeMs = last.endTimeMs
      endTimeMs = startTimeMs + 5000
    } else {
      startTimeMs = Math.round(currentTime * 1000)
      endTimeMs = startTimeMs + 5000
    }

    const newId = crypto.randomUUID()
    const newEntry: SubtitleEntry = {
      id: newId,
      index: 0,
      startTimeMs,
      endTimeMs,
      text: '',
      bilingualText: '',
    }
    addSubtitleEntry(newEntry, afterId)
    setCurrentEditingId(newId)
    requestSeek(startTimeMs / 1000)
    setTimeout(() => {
      const el = scrollRef.current?.querySelector(`[data-entry-id="${newId}"]`)
      if (el && typeof (el as HTMLElement).scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 50)
  }

  const handleExport = async () => {
    if (subtitleEdit.entries.length === 0) return
    setExporting(true)
    try {
      const content = serializeSrt(subtitleEdit.entries, subtitleEdit.isBilingual, subtitleEdit.secondaryLanguagePosition)
      const path = await tauriAPI.writeSubtitleFile(content, subtitleFile?.path ?? null)
      setEditedFilePath(path)
    } catch {
      // Silently fail; user can retry
    } finally {
      setExporting(false)
    }
  }

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= subtitleEdit.entries.length) return
    const newEntries = [...subtitleEdit.entries]
    const [moved] = newEntries.splice(fromIndex, 1)
    newEntries.splice(toIndex, 0, moved)
    const reindexed = newEntries.map((e, i) => ({ ...e, index: i + 1 }))
    setSubtitleEntries(reindexed)
  }, [subtitleEdit.entries, setSubtitleEntries])

  const targetCueId = currentEditingId ?? activeCueId

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Subtitle Editor</h2>
          {subtitleEdit.isDirty && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5" />
              Unsaved
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={clearSubtitleEdit}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-1"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!targetCueId}
            onClick={() => targetCueId && setCueStartFromPlayhead(targetCueId)}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            title="Set selected/active cue start to playhead"
          >
            Cue start
          </button>
          <button
            type="button"
            disabled={!targetCueId}
            onClick={() => targetCueId && setCueEndFromPlayhead(targetCueId)}
            className="px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            title="Set selected/active cue end to playhead"
          >
            Cue end
          </button>
          <button
            onClick={handleAddEntry}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-primary-500 hover:bg-primary-600 text-white"
          >
            Add Entry
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || subtitleEdit.entries.length === 0}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export SRT'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={subtitleEdit.isBilingual}
            onChange={(e) => setBilingualMode(e.target.checked)}
            className="w-4 h-4 text-primary-500 rounded border-gray-300 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">Bilingual</span>
        </label>
        {subtitleEdit.isBilingual && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Primary</label>
              <input
                type="text"
                value={subtitleEdit.primaryLanguage}
                onChange={(e) => setPrimaryLanguage(e.target.value)}
                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Secondary</label>
              <input
                type="text"
                value={subtitleEdit.secondaryLanguage}
                onChange={(e) => setSecondaryLanguage(e.target.value)}
                className="w-24 px-2 py-1 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500">Position</label>
              <select
                value={subtitleEdit.secondaryLanguagePosition}
                onChange={(e) => setSecondaryLanguagePosition(e.target.value as 'before' | 'after')}
                className="px-2 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="after">{subtitleEdit.primaryLanguage} on top</option>
                <option value="before">{subtitleEdit.secondaryLanguage} on top</option>
              </select>
            </div>
          </>
        )}
      </div>

      {subtitleFile && subtitleEdit.entries.length === 0 && (
        <div className="text-sm text-gray-400 py-4 text-center">
          No subtitle entries. Click &quot;Add Entry&quot; to create one, or load a subtitle file.
        </div>
      )}

      <div ref={scrollRef} className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
        {subtitleEdit.entries.map((entry, idx) => {
          const isActive = entry.id === activeCueId
          const isSelected = entry.id === currentEditingId
          return (
            <div
              key={entry.id}
              data-entry-id={entry.id}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => {
                setCurrentEditingId(entry.id)
                requestSeek(entry.startTimeMs / 1000)
              }}
              className={`border rounded-md p-3 cursor-pointer ${
                isActive
                  ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-200'
                  : isSelected
                    ? 'border-gray-300 bg-white'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <span className="text-xs font-medium text-gray-500 w-6 text-center">{entry.index}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReorder(idx, idx - 1)
                    }}
                    disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  >
                    ▲
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleReorder(idx, idx + 1)
                    }}
                    disabled={idx === subtitleEdit.entries.length - 1}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                  >
                    ▼
                  </button>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Start</label>
                    <SrtTimeField
                      valueMs={entry.startTimeMs}
                      onFocus={() => setCurrentEditingId(entry.id)}
                      onCommit={(ms) => handleTimeChange(entry.id, 'startTimeMs', ms)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">End</label>
                    <SrtTimeField
                      valueMs={entry.endTimeMs}
                      onFocus={() => setCurrentEditingId(entry.id)}
                      onCommit={(ms) => handleTimeChange(entry.id, 'endTimeMs', ms)}
                    />
                  </div>
                  <div className={subtitleEdit.isBilingual ? 'col-span-1' : 'col-span-2'}>
                    <label className="block text-xs text-gray-500 mb-0.5">
                      {subtitleEdit.isBilingual ? subtitleEdit.primaryLanguage : 'Text'}
                    </label>
                    <textarea
                      value={entry.text}
                      onChange={(e) => updateSubtitleEntry(entry.id, { text: e.target.value })}
                      onFocus={() => setCurrentEditingId(entry.id)}
                      onClick={(e) => e.stopPropagation()}
                      rows={2}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm resize-none"
                    />
                  </div>
                  {subtitleEdit.isBilingual && (
                    <div className="col-span-1">
                      <label className="block text-xs text-gray-500 mb-0.5">{subtitleEdit.secondaryLanguage}</label>
                      <textarea
                        value={entry.bilingualText}
                        onChange={(e) => updateSubtitleEntry(entry.id, { bilingualText: e.target.value })}
                        onFocus={() => setCurrentEditingId(entry.id)}
                        onClick={(e) => e.stopPropagation()}
                        rows={2}
                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm resize-none"
                      />
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    removeSubtitleEntry(entry.id)
                  }}
                  className="text-red-500 hover:text-red-700 text-lg font-bold px-1 py-0.5 mt-4 leading-none"
                >
                  ×
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default SubtitleEditor
