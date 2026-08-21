import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SubtitleEditor from './SubtitleEditor'
import { useVideoStore } from '../store/useVideoStore'

describe('SubtitleEditor', () => {
  beforeEach(() => {
    useVideoStore.getState().reset()
    useVideoStore.setState({
      videoFile: { path: '/a.mp4', name: 'a.mp4', duration: 30 },
      subtitleFile: { path: '/a.srt', name: 'a.srt' },
      currentTime: 1.5,
    })
    useVideoStore.getState().hydrateSubtitleEntries([
      {
        id: 'c1',
        index: 1,
        startTimeMs: 0,
        endTimeMs: 1000,
        text: 'First',
        bilingualText: '',
      },
      {
        id: 'c2',
        index: 2,
        startTimeMs: 1000,
        endTimeMs: 3000,
        text: 'Second',
        bilingualText: '',
      },
    ])
  })

  it('highlights the cue at the playhead', () => {
    render(<SubtitleEditor />)
    const active = document.querySelector('[data-active="true"]') as HTMLElement
    expect(active).toHaveAttribute('data-entry-id', 'c2')
    expect(active.textContent).toContain('Second')
  })

  it('clicking a cue seeks to its start', () => {
    render(<SubtitleEditor />)
    fireEvent.click(document.querySelector('[data-entry-id="c1"]') as HTMLElement)
    expect(useVideoStore.getState().currentTime).toBe(0)
  })

  it('Cue start writes the playhead into the active cue', () => {
    render(<SubtitleEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Cue start' }))
    expect(useVideoStore.getState().subtitleEdit.entries[1].startTimeMs).toBe(1500)
    expect(useVideoStore.getState().subtitleEdit.isDirty).toBe(true)
  })
})
