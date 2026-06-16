import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useVideoStore } from '../store/useVideoStore'
import { tauriAPI } from '../lib/tauri-api'
import { parseSrt, serializeSrt, msToSrtTime, parseSrtTimeInput } from '../utils/srtParser'
import type { SubtitleEntry } from '../types'

const SubtitleEditor: React.FC = () => {
  const {
    subtitleFile,
    subtitleEdit,
    setSubtitleEntries,
    updateSubtitleEntry,
    addSubtitleEntry,
    removeSubtitleEntry,
    setBilingualMode,
    setPrimaryLanguage,
    setSecondaryLanguage,
    setEditedFilePath,
    clearSubtitleEdit,
  } = useVideoStore()

  const [exporting, setExporting] = useState(false)
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadSubtitle = async () => {
      if (subtitleFile && subtitleEdit.entries.length === 0) {
        setLoading(true)
        try {
          const content = await tauriAPI.readSubtitleFile(subtitleFile.path)
          const entries = parseSrt(content)
          setSubtitleEntries(entries)
        } catch {
          // Silently fail; user can load manually
        } finally {
          setLoading(false)
        }
      }
    }
    loadSubtitle()
  }, [subtitleFile, subtitleEdit.entries.length, setSubtitleEntries])

  const handleTimeChange = (id: string, field: 'startTimeMs' | 'endTimeMs', value: string) => {
    const ms = parseSrtTimeInput(value)
    if (ms !== null) {
      if (field === 'startTimeMs') {
        updateSubtitleEntry(id, { startTimeMs: ms })
      } else {
        updateSubtitleEntry(id, { endTimeMs: ms })
      }
    }
  }

  const handleAddEntry = () => {
    const entries = subtitleEdit.entries
    let startTimeMs = 0
    let endTimeMs = 5000
    if (entries.length > 0) {
      const last = entries[entries.length - 1]
      startTimeMs = last.endTimeMs
      endTimeMs = startTimeMs + 5000
    }
    const newEntry: SubtitleEntry = {
      id: crypto.randomUUID(),
      index: entries.length + 1,
      startTimeMs,
      endTimeMs,
      text: '',
      bilingualText: '',
    }
    addSubtitleEntry(newEntry)
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  const handleExport = async () => {
    if (subtitleEdit.entries.length === 0) return
    setExporting(true)
    try {
      const content = serializeSrt(subtitleEdit.entries, subtitleEdit.isBilingual)
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
        <div className="flex items-center gap-2">
          <button
            onClick={clearSubtitleEdit}
            className="text-gray-500 hover:text-gray-700 text-sm font-medium px-2 py-1"
          >
            Clear
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
          </>
        )}
      </div>

      {loading && (
        <div className="text-sm text-gray-500 py-4">Loading subtitle file...</div>
      )}

      {!loading && subtitleEdit.entries.length === 0 && (
        <div className="text-sm text-gray-400 py-4 text-center">
          No subtitle entries. Click "Add Entry" to create one, or load a subtitle file.
        </div>
      )}

      <div ref={scrollRef} className="max-h-[500px] overflow-y-auto space-y-2 pr-1">
        {subtitleEdit.entries.map((entry, idx) => (
          <div key={entry.id} className="border border-gray-200 rounded-md p-3 bg-gray-50">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-1">
                <span className="text-xs font-medium text-gray-500 w-6 text-center">{entry.index}</span>
                <button
                  onClick={() => handleReorder(idx, idx - 1)}
                  disabled={idx === 0}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleReorder(idx, idx + 1)}
                  disabled={idx === subtitleEdit.entries.length - 1}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-xs leading-none"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Start</label>
                  <input
                    type="text"
                    defaultValue={msToSrtTime(entry.startTimeMs)}
                    onBlur={(e) => handleTimeChange(entry.id, 'startTimeMs', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">End</label>
                  <input
                    type="text"
                    defaultValue={msToSrtTime(entry.endTimeMs)}
                    onBlur={(e) => handleTimeChange(entry.id, 'endTimeMs', e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm font-mono"
                  />
                </div>
                <div className={subtitleEdit.isBilingual ? 'col-span-1' : 'col-span-2'}>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    {subtitleEdit.isBilingual ? subtitleEdit.primaryLanguage : 'Text'}
                  </label>
                  <textarea
                    value={entry.text}
                    onChange={(e) => updateSubtitleEntry(entry.id, { text: e.target.value })}
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
                      rows={2}
                      className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm resize-none"
                    />
                  </div>
                )}
              </div>
              <button
                onClick={() => removeSubtitleEntry(entry.id)}
                className="text-red-500 hover:text-red-700 text-lg font-bold px-1 py-0.5 mt-4 leading-none"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SubtitleEditor
