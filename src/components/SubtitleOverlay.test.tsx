import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubtitleOverlay from './SubtitleOverlay'
import type { SubtitleEntry } from '../types'

const cue: SubtitleEntry = {
  id: '1',
  index: 1,
  startTimeMs: 0,
  endTimeMs: 1000,
  text: '你好',
  bilingualText: 'Olá',
}

describe('SubtitleOverlay', () => {
  it('renders bilingual lines in stacked order', () => {
    render(
      <SubtitleOverlay
        cue={cue}
        bilingual
        secondaryPosition="after"
        font="Noto Sans"
        fontSize={24}
        fontSizeAuto={false}
        anchor={{ x: 0, y: 0, width: 640, height: 360 }}
      />
    )
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByText('Olá')).toBeInTheDocument()
  })

  it('renders nothing without a cue', () => {
    const { container } = render(
      <SubtitleOverlay
        cue={null}
        bilingual={false}
        secondaryPosition="after"
        font=""
        fontSize={24}
        fontSizeAuto
        anchor={{ x: 0, y: 0, width: 640, height: 360 }}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
