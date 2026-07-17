import type { AppMode, QualityMode } from '../types'

export interface ExportQualityInput {
  mode: AppMode
  cropEnabled: boolean
  brightness: number
  hasSubtitle: boolean
  qualityMode: QualityMode
}

/**
 * True when filters force a re-encode for trim (crop / brightness / burn-in).
 * Multi-cut only forces re-encode when crop is enabled.
 * Merge never "has filters" in the UI sense — backend probes and may stream-copy.
 */
export function requiresReencodeFilters(input: Pick<
  ExportQualityInput,
  'mode' | 'cropEnabled' | 'brightness' | 'hasSubtitle'
>): boolean {
  if (input.mode === 'trim') {
    return input.cropEnabled || input.brightness !== 0 || input.hasSubtitle
  }
  if (input.mode === 'multi-cut') {
    return input.cropEnabled
  }
  // merge: re-encode only when sources are incompatible (decided at runtime by backend)
  return false
}

/** Whether the Exact copy radio should be selectable. */
export function canSelectStreamCopy(input: Pick<
  ExportQualityInput,
  'mode' | 'cropEnabled' | 'brightness' | 'hasSubtitle'
>): boolean {
  if (input.mode === 'merge') {
    // Always offer "prefer quality / auto" — copy is decided by probe at runtime.
    return true
  }
  return !requiresReencodeFilters(input)
}

/** Whether to show the CRF slider (user can influence re-encode quality). */
export function showCrfControls(input: ExportQualityInput): boolean {
  if (input.mode === 'trim') {
    return input.qualityMode === 'reencode' || requiresReencodeFilters(input)
  }
  if (input.mode === 'multi-cut') {
    return input.cropEnabled
  }
  // merge: CRF used when backend falls back to re-encode
  return true
}

/** Human-readable quality summary for the export panel. */
export function qualitySummaryLabel(input: ExportQualityInput): string {
  if (input.mode === 'merge') {
    return 'Stream copy when sources match; re-encode only if needed'
  }
  if (input.mode === 'multi-cut') {
    return input.cropEnabled
      ? 'Frame-accurate re-encode (crop)'
      : 'Exact copy (keyframe cuts)'
  }
  if (input.qualityMode === 'copy' && !requiresReencodeFilters(input)) {
    return 'Exact copy'
  }
  return 'Re-encode'
}
