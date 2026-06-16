import { describe, it, expect } from 'vitest'
import { parseSrt, serializeSrt, msToSrtTime, formatMsDisplay, parseSrtTimeInput } from './srtParser'

describe('parseSrt', () => {
  it('should parse a simple SRT file', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
Hello, how are you?

2
00:00:05,000 --> 00:00:08,000
I'm fine, thank you.`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(2)
    expect(entries[0].index).toBe(1)
    expect(entries[0].startTimeMs).toBe(1000)
    expect(entries[0].endTimeMs).toBe(4500)
    expect(entries[0].text).toBe('Hello, how are you?')
    expect(entries[0].bilingualText).toBe('')
  })

  it('should handle multi-line subtitle text', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
First line
Second line`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('First line\nSecond line')
  })

  it('should parse timestamps with comma or dot separator', () => {
    const content = `1
00:01:30,500 --> 00:02:00,000
Comma separator

2
00:02:30.500 --> 00:03:00.000
Dot separator`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(2)
    expect(entries[0].startTimeMs).toBe(90500)
    expect(entries[1].startTimeMs).toBe(150500)
  })

  it('should handle CRLF line endings', () => {
    const content = '1\r\n00:00:01,000 --> 00:00:04,500\r\nHello'
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('Hello')
  })

  it('should handle CR line endings', () => {
    const content = '1\r00:00:01,000 --> 00:00:04,500\rHello'
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('Hello')
  })

  it('should skip malformed blocks with missing timestamp line', () => {
    const content = `1
Hello, no timestamp line here`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(0)
  })

  it('should skip blocks with non-numeric index', () => {
    const content = `abc
00:00:01,000 --> 00:00:04,500
Should be skipped`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(0)
  })

  it('should handle hours correctly', () => {
    const content = `1
01:30:45,250 --> 02:00:00,000
Long video`
    const entries = parseSrt(content)
    expect(entries[0].startTimeMs).toBe(5445250)
    expect(entries[0].endTimeMs).toBe(7200000)
  })

  it('should generate unique IDs for entries', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
First

2
00:00:05,000 --> 00:00:08,000
Second`

    const entries = parseSrt(content)
    expect(entries[0].id).toBeDefined()
    expect(entries[1].id).toBeDefined()
    expect(entries[0].id).not.toBe(entries[1].id)
  })
})

describe('serializeSrt', () => {
  const entries = [
    { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: 'Hello', bilingualText: '你好' },
    { id: 'b', index: 2, startTimeMs: 5000, endTimeMs: 8000, text: 'Goodbye', bilingualText: '再见' },
  ]

  it('should serialize entries to SRT format', () => {
    const result = serializeSrt(entries, false)
    expect(result).toContain('1\n00:00:01,000 --> 00:00:04,500\nHello')
    expect(result).toContain('2\n00:00:05,000 --> 00:00:08,000\nGoodbye')
  })

  it('should serialize bilingual entries when bilingual is true', () => {
    const result = serializeSrt(entries, true)
    expect(result).toContain('Hello\n你好')
    expect(result).toContain('Goodbye\n再见')
  })

  it('should not include bilingual text when bilingual is false', () => {
    const result = serializeSrt(entries, false)
    expect(result).not.toContain('你好')
    expect(result).not.toContain('再见')
  })

  it('should not include bilingual text when bilingualText is empty even in bilingual mode', () => {
    const monoEntries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: 'Hello', bilingualText: '' },
    ]
    const result = serializeSrt(monoEntries, true)
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\nHello')
  })

  it('should place secondary language after primary by default (secondaryPosition=after)', () => {
    const result = serializeSrt(entries, true, 'after')
    expect(result).toContain('Hello\n你好')
    expect(result).toContain('Goodbye\n再见')
  })

  it('should place secondary language before primary when secondaryPosition=before', () => {
    const result = serializeSrt(entries, true, 'before')
    expect(result).toContain('你好\nHello')
    expect(result).toContain('再见\nGoodbye')
  })

  it('should default to after when secondaryPosition is omitted', () => {
    const result = serializeSrt(entries, true)
    expect(result).toContain('Hello\n你好')
  })

  it('should re-index entries sequentially', () => {
    const outOfOrder = [
      { id: 'b', index: 5, startTimeMs: 5000, endTimeMs: 8000, text: 'Second', bilingualText: '' },
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: 'First', bilingualText: '' },
    ]
    const result = serializeSrt(outOfOrder, false)
    expect(result.startsWith('1\n')).toBe(true)
    expect(result).toContain('\n\n2\n')
  })

  it('should preserve multi-line text', () => {
    const multiLine = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: 'Line one\nLine two', bilingualText: '' },
    ]
    const result = serializeSrt(multiLine, false)
    expect(result).toContain('Line one\nLine two')
  })
})

describe('msToSrtTime', () => {
  it('should format zero milliseconds', () => {
    expect(msToSrtTime(0)).toBe('00:00:00,000')
  })

  it('should format simple seconds', () => {
    expect(msToSrtTime(5000)).toBe('00:00:05,000')
  })

  it('should format minutes and seconds', () => {
    expect(msToSrtTime(125500)).toBe('00:02:05,500')
  })

  it('should format hours', () => {
    expect(msToSrtTime(5445250)).toBe('01:30:45,250')
  })

  it('should pad all components to correct width', () => {
    expect(msToSrtTime(3661500)).toBe('01:01:01,500')
  })
})

describe('formatMsDisplay', () => {
  it('should format milliseconds in short format when under 1 hour', () => {
    expect(formatMsDisplay(65000)).toBe('1:05.000')
  })

  it('should format milliseconds in long format when 1+ hours', () => {
    expect(formatMsDisplay(5445250)).toBe('1:30:45.250')
  })

  it('should handle zero', () => {
    expect(formatMsDisplay(0)).toBe('0:00.000')
  })
})

describe('parseSrtTimeInput', () => {
  it('should parse SRT format with comma', () => {
    expect(parseSrtTimeInput('00:01:30,500')).toBe(90500)
  })

  it('should parse SRT format with dot', () => {
    expect(parseSrtTimeInput('00:01:30.500')).toBe(90500)
  })

  it('should parse short format MM:SS.mmm', () => {
    expect(parseSrtTimeInput('1:30.500')).toBe(90500)
  })

  it('should parse plain seconds', () => {
    expect(parseSrtTimeInput('90.5')).toBe(90500)
  })

  it('should return null for invalid input', () => {
    expect(parseSrtTimeInput('')).toBeNull()
    expect(parseSrtTimeInput('abc')).toBeNull()
  })

  it('should return null for negative seconds', () => {
    expect(parseSrtTimeInput('-5')).toBeNull()
  })

  it('should parse timestamps with hours', () => {
    expect(parseSrtTimeInput('01:30:45,250')).toBe(5445250)
  })
})