import { useState } from 'react'
import { CheckIcon, CopyIcon } from './icons'

interface MarkdownMessageProps {
  content: string
}

interface CodeBlockProps {
  language: string
  code: string
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'text'}</span>
        <button
          type="button"
          className="code-block-copy-btn"
          onClick={handleCopy}
          title="Copy code"
        >
          {copied ? (
            <>
              <CheckIcon size={12} className="copy-success" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <CopyIcon size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

function renderInline(text: string): React.ReactNode[] {
  // Parse inline elements: `code`, **bold**, *italic*
  const tokens: React.ReactNode[] = []
  let remaining = text
  let keyIdx = 0

  while (remaining.length > 0) {
    // Inline code `...`
    const codeMatch = remaining.match(/^`([^`]+)`/)
    if (codeMatch) {
      tokens.push(
        <code key={`code_${keyIdx++}`} className="inline-code">
          {codeMatch[1]}
        </code>
      )
      remaining = remaining.slice(codeMatch[0].length)
      continue
    }

    // Bold **...**
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/)
    if (boldMatch) {
      tokens.push(<strong key={`bold_${keyIdx++}`}>{boldMatch[1]}</strong>)
      remaining = remaining.slice(boldMatch[0].length)
      continue
    }

    // Italic *...*
    const italicMatch = remaining.match(/^\*([^*]+)\*/)
    if (italicMatch) {
      tokens.push(<em key={`italic_${keyIdx++}`}>{italicMatch[1]}</em>)
      remaining = remaining.slice(italicMatch[0].length)
      continue
    }

    // Normal text segment up to next special char
    const nextSpecial = remaining.search(/[`*]/)
    if (nextSpecial === -1) {
      tokens.push(remaining)
      break
    } else if (nextSpecial === 0) {
      tokens.push(remaining[0])
      remaining = remaining.slice(1)
    } else {
      tokens.push(remaining.slice(0, nextSpecial))
      remaining = remaining.slice(nextSpecial)
    }
  }

  return tokens
}

/**
 * Lightweight, safe markdown message renderer supporting streaming text,
 * code blocks with syntax styling and copy functionality, headers, lists, and inline formatting.
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  if (!content) return null

  // Split into fenced code blocks and text segments
  const segments: React.ReactNode[] = []
  const lines = content.split('\n')
  let inCodeBlock = false
  let codeLang = ''
  let codeBuffer: string[] = []
  let textBuffer: string[] = []
  let segIdx = 0

  const flushTextBuffer = () => {
    if (textBuffer.length === 0) return
    const text = textBuffer.join('\n')
    textBuffer = []

    const textLines = text.split('\n')
    let currentList: React.ReactNode[] = []

    const flushList = () => {
      if (currentList.length > 0) {
        segments.push(
          <ul key={`ul_${segIdx++}`} className="markdown-list">
            {currentList}
          </ul>
        )
        currentList = []
      }
    }

    for (const line of textLines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('# ')) {
        flushList()
        segments.push(<h2 key={`h1_${segIdx++}`} className="markdown-h1">{renderInline(trimmed.slice(2))}</h2>)
      } else if (trimmed.startsWith('## ')) {
        flushList()
        segments.push(<h3 key={`h2_${segIdx++}`} className="markdown-h2">{renderInline(trimmed.slice(3))}</h3>)
      } else if (trimmed.startsWith('### ')) {
        flushList()
        segments.push(<h4 key={`h3_${segIdx++}`} className="markdown-h3">{renderInline(trimmed.slice(4))}</h4>)
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        currentList.push(<li key={`li_${segIdx++}`}>{renderInline(trimmed.slice(2))}</li>)
      } else if (/^\d+\.\s/.test(trimmed)) {
        const itemText = trimmed.replace(/^\d+\.\s/, '')
        currentList.push(<li key={`li_${segIdx++}`}>{renderInline(itemText)}</li>)
      } else if (trimmed.length > 0) {
        flushList()
        segments.push(<p key={`p_${segIdx++}`} className="markdown-p">{renderInline(trimmed)}</p>)
      }
    }
    flushList()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        flushTextBuffer()
        inCodeBlock = true
        codeLang = line.trim().slice(3).trim()
        codeBuffer = []
      } else {
        inCodeBlock = false
        segments.push(
          <CodeBlock
            key={`code_${segIdx++}`}
            language={codeLang}
            code={codeBuffer.join('\n')}
          />
        )
        codeBuffer = []
        codeLang = ''
      }
    } else if (inCodeBlock) {
      codeBuffer.push(line)
    } else {
      textBuffer.push(line)
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    segments.push(
      <CodeBlock
        key={`code_${segIdx++}`}
        language={codeLang}
        code={codeBuffer.join('\n')}
      />
    )
  } else {
    flushTextBuffer()
  }

  return <div className="markdown-body">{segments}</div>
}
