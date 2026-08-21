import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePlaybackShortcuts } from './usePlaybackShortcuts'
import { useVideoStore } from '../store/useVideoStore'

function press(key: string, target?: HTMLElement) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  if (target) {
    target.dispatchEvent(event)
  } else {
    window.dispatchEvent(event)
  }
}

describe('usePlaybackShortcuts', () => {
  beforeEach(() => {
    useVideoStore.getState().reset()
    useVideoStore.setState({
      videoFile: { path: '/a.mp4', name: 'a.mp4', duration: 20 },
      trimSettings: { startTime: 0, endTime: 20 },
      currentTime: 5,
      mode: 'trim',
    })
  })

  it('I and O mark trim in/out', () => {
    renderHook(() => usePlaybackShortcuts())
    press('i')
    expect(useVideoStore.getState().trimSettings.startTime).toBe(5)
    useVideoStore.setState({ currentTime: 9 })
    press('o')
    expect(useVideoStore.getState().trimSettings.endTime).toBe(9)
  })

  it('ignores shortcuts while typing in an input', () => {
    renderHook(() => usePlaybackShortcuts())
    const input = document.createElement('input')
    document.body.appendChild(input)
    press('i', input)
    expect(useVideoStore.getState().trimSettings.startTime).toBe(0)
    input.remove()
  })

  it('I/O mark multi-cut segments', () => {
    useVideoStore.setState({ mode: 'multi-cut', currentTime: 1 })
    renderHook(() => usePlaybackShortcuts())
    press('I')
    useVideoStore.setState({ currentTime: 4 })
    press('O')
    expect(useVideoStore.getState().segments).toHaveLength(1)
    expect(useVideoStore.getState().segments[0]).toMatchObject({
      startTime: 1,
      endTime: 4,
    })
  })
})
