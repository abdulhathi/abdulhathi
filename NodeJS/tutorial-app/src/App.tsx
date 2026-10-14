import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, findChapter } from './chapters';
import { DoneToggle, Pager, ThemeToggle } from './components/ChapterControls';
import { Hero } from './components/Hero';
import { Sidebar } from './components/Sidebar';
import { ProgressProvider } from './lib/progress';
import { hrefFor, useRoute } from './lib/route';
import { useTheme } from './lib/theme';

export default function App() {
  return (
    <ProgressProvider>
      <Tutorial />
    </ProgressProvider>
  );
}

function Tutorial() {
  const chapter = findChapter(useRoute());
  const index = CHAPTERS.indexOf(chapter);
  const { mode, cycle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // On every chapter change: start at the top, close the phone menu, and move
  // keyboard focus to the new title (but not on the initial page load).
  useEffect(() => {
    document.title = `${chapter.title} · Node.js Lab`;
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [chapter]);

  const Title = chapter.id === 'welcome' ? 'h2' : 'h1';
  const { Body } = chapter;

  return (
    <div className="page">
      <aside className="rail">
        <div className="rail-head">
          <a className="brand" href={hrefFor(CHAPTERS[0].id)}>Node.js Lab</a>
          <div className="rail-actions">
            <ThemeToggle mode={mode} onCycle={cycle} />
            <button
              type="button"
              className="chip-btn menu-btn"
              aria-expanded={menuOpen}
              aria-controls="chapter-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? 'Close' : 'Chapters'}
            </button>
          </div>
        </div>
        <div id="chapter-nav" className={menuOpen ? 'rail-body open' : 'rail-body'}>
          <Sidebar current={chapter.id} />
        </div>
      </aside>

      <main>
        {chapter.id === 'welcome' && <Hero />}
        <article className="chapter" key={chapter.id}>
          <header className="ch-head prose">
            <p className="eyebrow">
              <b>{chapter.num}</b> · {chapter.group}
              {chapter.project && (
                <>
                  {' · '}
                  <code>projects/{chapter.project}</code>
                </>
              )}
            </p>
            <Title className="ch-title" ref={heading} tabIndex={-1}>
              {chapter.title}
            </Title>
            {chapter.goal && <p className="goal">{chapter.goal}</p>}
          </header>
          <Body />
          {chapter.trackable && <DoneToggle id={chapter.id} />}
          <Pager prev={CHAPTERS[index - 1]} next={CHAPTERS[index + 1]} />
        </article>
      </main>
    </div>
  );
}
