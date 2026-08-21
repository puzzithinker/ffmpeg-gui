import { useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { applyDroppedPaths } from '../lib/media'

function tauriFilePath(file: File): string | null {
  const path = (file as File & { path?: string }).path
  return path && path.length > 0 ? path : null
}

export function useFileDrop(): boolean {
  const [active, setActive] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | null = null
    let cancelled = false

    const setup = async () => {
      try {
        const unlistenFn = await getCurrentWindow().onDragDropEvent((event) => {
          if (event.payload.type === 'over') {
            setActive(true)
          } else if (event.payload.type === 'drop') {
            setActive(false)
            void applyDroppedPaths(event.payload.paths)
          } else {
            setActive(false)
          }
        })
        if (cancelled) {
          unlistenFn()
          return
        }
        unlisten = unlistenFn
      } catch {
        // Running outside Tauri (tests / Vite-only) — HTML5 drop still works if paths exist.
      }
    }

    void setup()

    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes('Files')) return
      event.preventDefault()
      setActive(true)
    }
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget) return
      setActive(false)
    }
    const onDrop = (event: DragEvent) => {
      event.preventDefault()
      setActive(false)
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return
      const paths = Array.from(files)
        .map(tauriFilePath)
        .filter((p): p is string => p != null)
      if (paths.length > 0) {
        void applyDroppedPaths(paths)
      }
    }

    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)

    return () => {
      cancelled = true
      if (unlisten) unlisten()
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return active
}
