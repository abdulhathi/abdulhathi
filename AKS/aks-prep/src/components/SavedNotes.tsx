import Markdown from './Markdown'

export interface SavedNote {
  id: string
  selection: string
  question: string
  answer: string
  createdAt: string
}

interface Props {
  notes: SavedNote[]
  onDelete: (id: string) => void
}

export default function SavedNotes({ notes, onDelete }: Props) {
  if (notes.length === 0) return null

  return (
    <section className="saved-notes">
      <h2>📌 Saved Notes ({notes.length})</h2>
      {notes.map((note) => (
        <article key={note.id} className="saved-note">
          <div className="saved-note-header">
            <blockquote className="saved-note-selection">“{note.selection}”</blockquote>
            <button
              className="saved-note-delete"
              onClick={() => onDelete(note.id)}
              aria-label="Delete note"
            >
              ✕
            </button>
          </div>
          <p className="saved-note-question">Q: {note.question}</p>
          <div className="saved-note-answer">
            <Markdown content={note.answer} />
          </div>
          <div className="saved-note-date">
            {new Date(note.createdAt).toLocaleString()}
          </div>
        </article>
      ))}
    </section>
  )
}
