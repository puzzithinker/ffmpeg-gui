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

  it('should split CJK + Latin lines into text and bilingualText', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
這次培訓不僅僅是一項技術計劃
Esta formação é mais do que um programa técnico`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('這次培訓不僅僅是一項技術計劃')
    expect(entries[0].bilingualText).toBe('Esta formação é mais do que um programa técnico')
  })

  it('should route Latin-only lines to bilingualText when file is bilingual', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
Portuguese only line`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(2)
    expect(entries[1].text).toBe('')
    expect(entries[1].bilingualText).toBe('Portuguese only line')
  })

  it('should route CJK-only lines to text when file is bilingual', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
只有中文`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(2)
    expect(entries[1].text).toBe('只有中文')
    expect(entries[1].bilingualText).toBe('')
  })

  it('should preserve same-script multi-line text as a single text field', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
First line
Second line`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('First line\nSecond line')
    expect(entries[0].bilingualText).toBe('')
  })

  it('should preserve CJK-only multi-line text as a single text field', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
第一行
第二行`
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('第一行\n第二行')
    expect(entries[0].bilingualText).toBe('')
  })
})

describe('parseSrt - bilingual detection with various foreign languages', () => {
  const makeBilingualSrt = (cjk: string, foreign: string): string =>
    `1\n00:00:01,000 --> 00:00:04,500\n${cjk}\n${foreign}`

  it('should split Chinese + Portuguese', () => {
    const entries = parseSrt(makeBilingualSrt('這次培訓', 'Esta formação é técnica'))
    expect(entries[0].text).toBe('這次培訓')
    expect(entries[0].bilingualText).toBe('Esta formação é técnica')
  })

  it('should split Chinese + English', () => {
    const entries = parseSrt(makeBilingualSrt('你好世界', 'Hello world'))
    expect(entries[0].text).toBe('你好世界')
    expect(entries[0].bilingualText).toBe('Hello world')
  })

  it('should split Chinese + Spanish', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'Hola mundo, ¿cómo estás?'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Hola mundo, ¿cómo estás?')
  })

  it('should split Chinese + French', () => {
    const entries = parseSrt(makeBilingualSrt('你好', "Bonjour le monde, comment ça va ?"))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Bonjour le monde, comment ça va ?')
  })

  it('should split Chinese + German (with umlauts)', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'Guten Tag, wie geht es Ihnen?'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Guten Tag, wie geht es Ihnen?')
  })

  it('should split Chinese + Italian', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'Ciao mondo, come stai?'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Ciao mondo, come stai?')
  })

  it('should split Chinese + Russian (Cyrillic, non-CJK non-Latin)', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'Привет, мир'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Привет, мир')
  })

  it('should split Chinese + Arabic (RTL, non-CJK)', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'مرحبا بالعالم'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('مرحبا بالعالم')
  })

  it('should split Chinese + Vietnamese (Latin with diacritics)', () => {
    const entries = parseSrt(makeBilingualSrt('你好', 'Xin chào thế giới'))
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Xin chào thế giới')
  })

  it('should split Chinese + mixed foreign languages across entries', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
再見
Adeus, até logo`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Hello')
    expect(entries[1].text).toBe('再見')
    expect(entries[1].bilingualText).toBe('Adeus, até logo')
  })
})

describe('parseSrt - CJK script variants as primary', () => {
  it('should detect Japanese Kanji as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
今回は技術的な訓練です
This is a technical training`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('今回は技術的な訓練です')
    expect(entries[0].bilingualText).toBe('This is a technical training')
  })

  it('should detect Japanese Hiragana as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
これはひらがなのテストです
This is a hiragana test`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('これはひらがなのテストです')
    expect(entries[0].bilingualText).toBe('This is a hiragana test')
  })

  it('should detect Japanese Katakana as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
これはカタカナのテストです
This is a katakana test`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('これはカタカナのテストです')
    expect(entries[0].bilingualText).toBe('This is a katakana test')
  })

  it('should detect Korean Hangul as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
이것은 기술 교육입니다
This is a technical training`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('이것은 기술 교육입니다')
    expect(entries[0].bilingualText).toBe('This is a technical training')
  })

  it('should detect simplified Chinese as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
这是一次技术培训
This is a technical training`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('这是一次技术培训')
    expect(entries[0].bilingualText).toBe('This is a technical training')
  })

  it('should detect traditional Chinese as CJK primary', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
這是一次技術培訓
This is a technical training`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('這是一次技術培訓')
    expect(entries[0].bilingualText).toBe('This is a technical training')
  })

  it('should treat Chinese + Japanese (both CJK) as monolingual', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
こんにちは`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好\nこんにちは')
    expect(entries[0].bilingualText).toBe('')
  })

  it('should treat Chinese + Korean (both CJK) as monolingual', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
안녕하세요`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好\n안녕하세요')
    expect(entries[0].bilingualText).toBe('')
  })
})

describe('parseSrt - half-done bilingual files', () => {
  it('should route Latin-only entries to bilingualText when file has at least one bilingual entry', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
Portuguese only line without Chinese`

    const entries = parseSrt(content)
    expect(entries[1].text).toBe('')
    expect(entries[1].bilingualText).toBe('Portuguese only line without Chinese')
  })

  it('should route CJK-only entries to text when file has at least one bilingual entry', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
只有中文沒有外文`

    const entries = parseSrt(content)
    expect(entries[1].text).toBe('只有中文沒有外文')
    expect(entries[1].bilingualText).toBe('')
  })

  it('should handle mix of bilingual, CJK-only, and Latin-only entries', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
只有中文

3
00:00:09,000 --> 00:00:12,000
English only

4
00:00:13,000 --> 00:00:16,000
再見
Goodbye`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(4)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Hello')
    expect(entries[1].text).toBe('只有中文')
    expect(entries[1].bilingualText).toBe('')
    expect(entries[2].text).toBe('')
    expect(entries[2].bilingualText).toBe('English only')
    expect(entries[3].text).toBe('再見')
    expect(entries[3].bilingualText).toBe('Goodbye')
  })

  it('should handle consecutive Latin-only entries (missing Chinese block)', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
Latin only one

3
00:00:09,000 --> 00:00:12,000
Latin only two

4
00:00:13,000 --> 00:00:16,000
Latin only three`

    const entries = parseSrt(content)
    expect(entries[1].text).toBe('')
    expect(entries[1].bilingualText).toBe('Latin only one')
    expect(entries[2].text).toBe('')
    expect(entries[2].bilingualText).toBe('Latin only two')
    expect(entries[3].text).toBe('')
    expect(entries[3].bilingualText).toBe('Latin only three')
  })

  it('should handle consecutive CJK-only entries (missing foreign block)', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
中文一

3
00:00:09,000 --> 00:00:12,000
中文二`

    const entries = parseSrt(content)
    expect(entries[1].text).toBe('中文一')
    expect(entries[1].bilingualText).toBe('')
    expect(entries[2].text).toBe('中文二')
    expect(entries[2].bilingualText).toBe('')
  })

  it('should handle entry with no text lines in a bilingual file (index + timestamp only)', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000

3
00:00:09,000 --> 00:00:12,000
再見
Goodbye`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(3)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Hello')
    expect(entries[1].text).toBe('')
    expect(entries[1].bilingualText).toBe('')
    expect(entries[2].text).toBe('再見')
    expect(entries[2].bilingualText).toBe('Goodbye')
  })

  it('should NOT detect bilingual when no single entry has both CJK and Latin', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好

2
00:00:05,000 --> 00:00:08,000
Hello`

    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('')
    expect(entries[1].text).toBe('Hello')
    expect(entries[1].bilingualText).toBe('')
  })

  it('should parse the actual half-done bilingual sample file structure', () => {
    const content = `1
00:00:08,435 --> 00:00:11,000
這次培訓不僅僅是一項技術計劃
Esta formação é mais do que um programa técnico

2
00:00:11,000 --> 00:00:17,952
更是對我們團隊能力建設的戰略投資
É um investimento estratégico na capacitação das nossas equipas

15
00:01:26,785 --> 00:01:35,560
Acompanhe o programa de financiamento entre países.

16
00:01:35,560 --> 00:01:43,103
Acompanhando a pesquisa em áreas de segurança.`

    const entries = parseSrt(content)
    expect(entries).toHaveLength(4)
    expect(entries[0].text).toBe('這次培訓不僅僅是一項技術計劃')
    expect(entries[0].bilingualText).toBe('Esta formação é mais do que um programa técnico')
    expect(entries[1].text).toBe('更是對我們團隊能力建設的戰略投資')
    expect(entries[1].bilingualText).toBe('É um investimento estratégico na capacitação das nossas equipas')
    expect(entries[2].text).toBe('')
    expect(entries[2].bilingualText).toBe('Acompanhe o programa de financiamento entre países.')
    expect(entries[3].text).toBe('')
    expect(entries[3].bilingualText).toBe('Acompanhando a pesquisa em áreas de segurança.')
  })
})

describe('parseSrt - multi-line bilingual combinations', () => {
  it('should split 2 CJK lines + 1 Latin line', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
第一行
第二行
English line`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('第一行\n第二行')
    expect(entries[0].bilingualText).toBe('English line')
  })

  it('should split 1 CJK line + 2 Latin lines', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
English line one
English line two`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('English line one\nEnglish line two')
  })

  it('should split 2 CJK lines + 2 Latin lines', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
中文一
中文二
English one
English two`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('中文一\n中文二')
    expect(entries[0].bilingualText).toBe('English one\nEnglish two')
  })

  it('should split 3 CJK lines + 2 Latin lines', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
中文一
中文二
中文三
English one
English two`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('中文一\n中文二\n中文三')
    expect(entries[0].bilingualText).toBe('English one\nEnglish two')
  })

  it('should preserve order of CJK lines relative to each other', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
中文甲
中文乙
English`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('中文甲\n中文乙')
  })

  it('should preserve order of Latin lines relative to each other', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
English first
English second`
    const entries = parseSrt(content)
    expect(entries[0].bilingualText).toBe('English first\nEnglish second')
  })

  it('should handle interleaved CJK and Latin lines (CJK collected to text, Latin to bilingualText)', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
English one
再見
English two`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好\n再見')
    expect(entries[0].bilingualText).toBe('English one\nEnglish two')
  })
})

describe('parseSrt - bilingual edge cases', () => {
  it('should treat a line with mixed CJK + Latin characters as CJK', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
Hello 你好
Pure English line`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('Hello 你好')
    expect(entries[0].bilingualText).toBe('Pure English line')
  })

  it('should not detect bilingual from a single entry with 1 text line', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('')
  })

  it('should not detect bilingual when all entries are CJK-only', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
世界

2
00:00:05,000 --> 00:00:08,000
再見
世界`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好\n世界')
    expect(entries[0].bilingualText).toBe('')
    expect(entries[1].text).toBe('再見\n世界')
    expect(entries[1].bilingualText).toBe('')
  })

  it('should not detect bilingual when all entries are Latin-only', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
Hello
World

2
00:00:05,000 --> 00:00:08,000
Goodbye
World`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('Hello\nWorld')
    expect(entries[0].bilingualText).toBe('')
  })

  it('should handle special characters in bilingual text', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好 <世界>
Hello & "world" <test>`

    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好 <世界>')
    expect(entries[0].bilingualText).toBe('Hello & "world" <test>')
  })

  it('should handle numbers-only line as non-CJK in bilingual file', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
123456

2
00:00:05,000 --> 00:00:08,000
再見
Hello`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('123456')
  })

  it('should handle empty content without crashing', () => {
    const entries = parseSrt('')
    expect(entries).toHaveLength(0)
  })

  it('should handle content with only whitespace', () => {
    const entries = parseSrt('   \n\n  \n\n  ')
    expect(entries).toHaveLength(0)
  })

  it('should handle BOM character at start of file (parseInt strips BOM as whitespace)', () => {
    const content = '\uFEFF1\n00:00:01,000 --> 00:00:04,500\n你好\nHello'
    const entries = parseSrt(content)
    expect(entries).toHaveLength(1)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('Hello')
  })

  it('should detect bilingual from any entry in the file, not just the first', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好

2
00:00:05,000 --> 00:00:08,000
世界
World

3
00:00:09,000 --> 00:00:12,000
再見`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe('你好')
    expect(entries[0].bilingualText).toBe('')
    expect(entries[1].text).toBe('世界')
    expect(entries[1].bilingualText).toBe('World')
    expect(entries[2].text).toBe('再見')
    expect(entries[2].bilingualText).toBe('')
  })

  it('should handle very long bilingual text', () => {
    const longCjk = '這是一段很長的中文文字'.repeat(20)
    const longForeign = 'This is a very long English text. '.repeat(20)
    const content = `1\n00:00:01,000 --> 00:00:04,500\n${longCjk}\n${longForeign}`
    const entries = parseSrt(content)
    expect(entries[0].text).toBe(longCjk)
    expect(entries[0].bilingualText).toBe(longForeign)
  })

  it('should handle entry with only a number as text in bilingual file', () => {
    const content = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
42`
    const entries = parseSrt(content)
    expect(entries[1].text).toBe('')
    expect(entries[1].bilingualText).toBe('42')
  })
})

describe('parseSrt - round-trip serialize/parse', () => {
  it('should preserve bilingual data through serialize → parse cycle (after position)', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
再見
Goodbye`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed).toHaveLength(2)
    expect(reparsed[0].text).toBe('你好')
    expect(reparsed[0].bilingualText).toBe('Hello')
    expect(reparsed[1].text).toBe('再見')
    expect(reparsed[1].bilingualText).toBe('Goodbye')
  })

  it('should preserve bilingual data through serialize → parse cycle (before position)', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
你好
Hello`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'before')
    const reparsed = parseSrt(serialized)

    expect(reparsed[0].text).toBe('你好')
    expect(reparsed[0].bilingualText).toBe('Hello')
  })

  it('should preserve half-done bilingual through serialize → parse (empty text field)', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
Latin only`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed[1].text).toBe('')
    expect(reparsed[1].bilingualText).toBe('Latin only')
  })

  it('should preserve half-done bilingual through serialize → parse (empty bilingualText field)', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

2
00:00:05,000 --> 00:00:08,000
只有中文`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed[1].text).toBe('只有中文')
    expect(reparsed[1].bilingualText).toBe('')
  })

  it('should preserve multi-line CJK and Latin through serialize → parse', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
中文一
中文二
English one
English two`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed[0].text).toBe('中文一\n中文二')
    expect(reparsed[0].bilingualText).toBe('English one\nEnglish two')
  })

  it('should preserve timestamps through serialize → parse', () => {
    const original = `1
00:01:23,456 --> 00:02:34,789
你好
Hello`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed[0].startTimeMs).toBe(83456)
    expect(reparsed[0].endTimeMs).toBe(154789)
  })

  it('should re-index sequentially through serialize → parse', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
你好
Hello

3
00:00:09,000 --> 00:00:12,000
再見
Goodbye`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, true, 'after')
    const reparsed = parseSrt(serialized)

    expect(reparsed[0].index).toBe(1)
    expect(reparsed[1].index).toBe(2)
  })

  it('should round-trip monolingual file without bilingualText', () => {
    const original = `1
00:00:01,000 --> 00:00:04,500
Hello world`
    const entries = parseSrt(original)
    const serialized = serializeSrt(entries, false)
    const reparsed = parseSrt(serialized)

    expect(reparsed[0].text).toBe('Hello world')
    expect(reparsed[0].bilingualText).toBe('')
  })

  it('should not produce extra blank lines when text is empty but bilingualText is non-empty (after)', () => {
    const entries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: '', bilingualText: 'Latin only' },
    ]
    const result = serializeSrt(entries, true, 'after')
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\nLatin only')
    expect(result).not.toContain('\n\n')
  })

  it('should not produce extra blank lines when text is empty but bilingualText is non-empty (before)', () => {
    const entries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: '', bilingualText: 'Latin only' },
    ]
    const result = serializeSrt(entries, true, 'before')
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\nLatin only')
    expect(result).not.toContain('\n\n')
  })

  it('should not produce extra blank lines when bilingualText is empty but text is non-empty', () => {
    const entries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: '你好', bilingualText: '' },
    ]
    const result = serializeSrt(entries, true, 'after')
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\n你好')
  })

  it('should serialize both lines when both text and bilingualText are non-empty (after)', () => {
    const entries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: '你好', bilingualText: 'Hello' },
    ]
    const result = serializeSrt(entries, true, 'after')
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\n你好\nHello')
  })

  it('should serialize both lines when both text and bilingualText are non-empty (before)', () => {
    const entries = [
      { id: 'a', index: 1, startTimeMs: 1000, endTimeMs: 4500, text: '你好', bilingualText: 'Hello' },
    ]
    const result = serializeSrt(entries, true, 'before')
    expect(result).toBe('1\n00:00:01,000 --> 00:00:04,500\nHello\n你好')
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