import React, { useState, useRef, useEffect } from 'react'
import { formatTimestamp, parseTimestamp } from '../utils/timeFormatting'

interface TimestampInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  className?: string
}

const TimestampInput: React.FC<TimestampInputProps> = ({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  className = '',
}) => {
  const [editValue, setEditValue] = useState(formatTimestamp(value))
  const [isEditing, setIsEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditing) {
      setEditValue(formatTimestamp(value))
    }
  }, [value, isEditing])

  const commit = (text: string) => {
    const parsed = parseTimestamp(text)
    if (parsed !== null) {
      let clamped = Math.max(min, parsed)
      if (max !== undefined) clamped = Math.min(max, clamped)
      onChange(clamped)
    }
    setIsEditing(false)
    setEditValue(formatTimestamp(value))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commit(editValue)
      inputRef.current?.blur()
    } else if (e.key === 'Escape') {
      setIsEditing(false)
      setEditValue(formatTimestamp(value))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      adjust(step)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      adjust(-step)
    }
  }

  const adjust = (delta: number) => {
    let next = value + delta
    next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    onChange(next)
  }

  return (
    <div className={`inline-flex flex-col ${className}`}>
      {label && <label className="block text-xs text-gray-500 mb-1">{label}</label>}
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => adjust(-step)}
          className="flex-shrink-0 w-7 h-8 flex items-center justify-center border border-r-0 border-gray-300 rounded-l-md bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-600 select-none"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="text"
          value={isEditing ? editValue : formatTimestamp(value)}
          onChange={(e) => {
            setEditValue(e.target.value)
            if (!isEditing) setIsEditing(true)
          }}
          onFocus={() => {
            setIsEditing(true)
            setEditValue(formatTimestamp(value))
            setTimeout(() => inputRef.current?.select(), 0)
          }}
          onBlur={() => commit(editValue)}
          onKeyDown={handleKeyDown}
          className="w-24 h-8 px-2 border border-gray-300 text-sm text-center font-mono focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
        />
        <button
          type="button"
          onClick={() => adjust(step)}
          className="flex-shrink-0 w-7 h-8 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md bg-gray-50 hover:bg-gray-100 active:bg-gray-200 text-gray-600 select-none"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default TimestampInput
