import React from 'react'
import type { Rect } from '../utils/cropGeometry'
import { overlayFontSizePx, overlayLines } from '../utils/playback'
import type { SecondaryLanguagePosition, SubtitleEntry } from '../types'

interface SubtitleOverlayProps {
  cue: SubtitleEntry | null
  bilingual: boolean
  secondaryPosition: SecondaryLanguagePosition
  font: string
  fontSize: number
  fontSizeAuto: boolean
  anchor: Rect
}

const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  cue,
  bilingual,
  secondaryPosition,
  font,
  fontSize,
  fontSizeAuto,
  anchor,
}) => {
  if (!cue || anchor.width <= 0 || anchor.height <= 0) return null

  const lines = overlayLines(cue, bilingual, secondaryPosition)
  if (lines.length === 0) return null

  const px = overlayFontSizePx(anchor.height, fontSizeAuto, fontSize)

  return (
    <div
      className="pointer-events-none absolute z-20 flex items-end justify-center px-3 pb-3"
      style={{
        left: anchor.x,
        top: anchor.y,
        width: anchor.width,
        height: anchor.height,
      }}
    >
      <div
        className="max-w-[92%] text-center font-medium leading-tight whitespace-pre-wrap"
        style={{
          fontFamily: font || 'sans-serif',
          fontSize: `${px}px`,
          color: '#fff',
          textShadow:
            '0 0 4px #000, 0 0 4px #000, 1px 1px 2px #000, -1px -1px 2px #000',
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}

export default SubtitleOverlay
