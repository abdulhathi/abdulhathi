import { useCallback, useEffect, useMemo, useState } from 'react'
import { topics, type Topic } from './topics'
import Markdown from './components/Markdown'
import AskPopup, { type AskResult } from './components/AskPopup'
import SavedNotes, { type SavedNote } from './components/SavedNotes'

const STORAGE_KEY = 'aks-worker-academy-progress'
const NOTES_KEY = 'aks-worker-academy-notes'

function loadProgress(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function loadNotes(): Record<string, SavedNote[]> {
  try {
    return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export default function App() {
  const [activeId, setActiveId] = useState<string>(() => {
    const hash = window.location.hash.slice(1)
    return topics.some((t) => t.id === hash) ? hash : topics[0].id
  })
  const [progress, setProgress] = useState<Record<string, boolean>>(loadProgress)
  const [notes, setNotes] = useState<Record<string, SavedNote[]>>(loadNotes)
  const [popup, setPopup] = useState<{ selection: string; x: number; y: number } | null>(null)

  const active: Topic = useMemo(
    () => topics.find((t) => t.id === activeId) ?? topics[0],
    [activeId],
  )

  useEffect(() => {
    window.location.hash = activeId
    document.querySelector('.content')?.scrollTo(0, 0)
  }, [activeId])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  }, [progress])

  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
  }, [notes])

  useEffect(() => {
    setPopup(null)
  }, [activeId])

  const toggleDone = (id: string) =>
    setProgress((p) => ({ ...p, [id]: !p[id] }))

  const onContentMouseUp = () => {
    // Let the browser finalize the selection before reading it
    setTimeout(() => {
      const sel = window.getSelection()
      const text = sel?.toString().trim() ?? ''
      if (!sel || sel.isCollapsed || !text) return
      const rect = sel.getRangeAt(0).getBoundingClientRect()
      setPopup({
        selection: text,
        x: rect.left + rect.width / 2,
        y: rect.bottom + 10,
      })
    }, 0)
  }

  const closePopup = useCallback(() => setPopup(null), [])

  const storeNote = (result: AskResult) => {
    const note: SavedNote = {
      id: crypto.randomUUID(),
      ...result,
      createdAt: new Date().toISOString(),
    }
    setNotes((n) => ({ ...n, [activeId]: [...(n[activeId] ?? []), note] }))
    setPopup(null)
  }

  const deleteNote = (id: string) =>
    setNotes((n) => ({
      ...n,
      [activeId]: (n[activeId] ?? []).filter((note) => note.id !== id),
    }))

  const doneCount = topics.filter((t) => progress[t.id]).length
  const activeIndex = topics.findIndex((t) => t.id === active.id)
  const prev = topics[activeIndex - 1]
  const next = topics[activeIndex + 1]

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>AKS Worker Academy</h1>
          <p className="subtitle">.NET 9 · Docker · AKS · Azure DevOps</p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${(doneCount / topics.length) * 100}%` }}
            />
          </div>
          <p className="progress-text">
            {doneCount} / {topics.length} completed
          </p>
        </div>
        <nav>
          {topics.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${t.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(t.id)}
            >
              <span className="nav-check">{progress[t.id] ? '✓' : t.order}</span>
              <span className="nav-title">
                {t.title}
                <span className={`badge badge-${t.difficulty.toLowerCase()}`}>
                  {t.difficulty}
                </span>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          One small background worker, taken all the way:
          <br />
          code → container → cluster → CI/CD pipeline.
        </div>
      </aside>

      <main className="content">
        <div className="topic-header">
          <div className="topic-meta">
            <span className={`badge badge-${active.difficulty.toLowerCase()}`}>
              {active.difficulty}
            </span>
            <span className="time">⏱ {active.estimatedTime}</span>
          </div>
          <label className="done-toggle">
            <input
              type="checkbox"
              checked={!!progress[active.id]}
              onChange={() => toggleDone(active.id)}
            />
            Mark as completed
          </label>
        </div>

        <div onMouseUp={onContentMouseUp}>
          <Markdown content={active.content} />
        </div>

        <SavedNotes notes={notes[activeId] ?? []} onDelete={deleteNote} />

        {popup && (
          <AskPopup
            selection={popup.selection}
            position={{ x: popup.x, y: popup.y }}
            topic={active}
            onStore={storeNote}
            onClose={closePopup}
          />
        )}

        <div className="pager">
          {prev ? (
            <button className="pager-btn" onClick={() => setActiveId(prev.id)}>
              ← {prev.title}
            </button>
          ) : (
            <span />
          )}
          {next ? (
            <button className="pager-btn" onClick={() => setActiveId(next.id)}>
              {next.title} →
            </button>
          ) : (
            <span />
          )}
        </div>
      </main>
    </div>
  )
}
