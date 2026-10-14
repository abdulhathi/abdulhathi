import { useEffect, useRef, useState } from 'react'
import Markdown from './Markdown'
import type { Topic } from '../topics'

export interface AskResult {
  selection: string
  question: string
  answer: string
}

interface Props {
  selection: string
  position: { x: number; y: number }
  topic: Topic
  onStore: (result: AskResult) => void
  onClose: () => void
}

export default function AskPopup({ selection, position, topic, onStore, onClose }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [onClose])

  const ask = async () => {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selection,
          question: q,
          topicTitle: topic.title,
          topicContent: topic.content,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      setAnswer(data.answer)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  // Clamp so the popup never overflows the viewport
  const width = 420
  const left = Math.min(Math.max(position.x - width / 2, 12), window.innerWidth - width - 12)
  const top = Math.min(position.y, window.innerHeight - 120)

  return (
    <div ref={popupRef} className="ask-popup" style={{ left, top }}>
      <div className="ask-popup-header">
        <span className="ask-popup-selection" title={selection}>
          “{selection.length > 90 ? selection.slice(0, 90) + '…' : selection}”
        </span>
        <button className="ask-popup-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div className="ask-popup-input-row">
        <textarea
          ref={inputRef}
          rows={2}
          placeholder="Ask a question about the selected text…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="ask-btn" onClick={ask} disabled={loading || !question.trim()}>
          {loading ? 'Asking…' : 'Ask'}
        </button>
      </div>

      {error && <div className="ask-error">{error}</div>}

      {answer && (
        <div className="ask-answer">
          <Markdown content={answer} />
          <button
            className="store-btn"
            onClick={() => onStore({ selection, question: question.trim(), answer })}
          >
            💾 Store
          </button>
        </div>
      )}
    </div>
  )
}
