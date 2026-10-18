import { useEffect, useRef, useState } from 'react';
import { CHAPTERS, findChapter } from './chapters';
import { DoneToggle, Pager, ThemeToggle } from './components/ChapterControls';
import { Hero } from './components/Hero';
import { Sidebar } from './components/Sidebar';
import { WordHelper } from './components/WordHelper';
import { useLayout } from './lib/layout';
import { ProgressProvider } from './lib/progress';
import { hrefFor, useRoute } from './lib/route';
import { StackProvider } from './lib/stack';
import { useTheme } from './lib/theme';

export default function App() {
  return (
    <ProgressProvider>
      <StackProvider>
        <Tutorial />
        {/* Select a word or sentence anywhere: translate it to Tamil, hear it, or have Claude explain it in context. */}
        <WordHelper target="ta" headers={WORD_HEADERS} />
      </StackProvider>
    </ProgressProvider>
  );
}

const WORD_HEADERS = { 'X-Auth-Lab': '1' };

function Tutorial() {
  const chapter = findChapter(useRoute());
  const index = CHAPTERS.indexOf(chapter);
  const { mode, cycle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const layout = useLayout();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // On every chapter change: start at the top, close the phone menu, and move
  // keyboard focus to the new title (but not on the initial page load).
  useEffect(() => {
    document.title = `${chapter.title} · Auth Lab`;
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
    <div className={['page', layout.menuHidden && 'menu-hidden', layout.width === 'full' && 'full'].filter(Boolean).join(' ')}>
      <aside className="rail">
        <div className="rail-head">
          <a className="brand" href={hrefFor(CHAPTERS[0].id)}>Auth Lab</a>
          <div className="rail-actions">
            <ThemeToggle mode={mode} onCycle={cycle} />
            <button type="button" className="chip-btn desk-only" onClick={layout.toggleWidth} title="Use the whole screen, or a narrower column that is easier to read">
              Width: {layout.width === 'full' ? 'Full' : 'Reading'}
            </button>
            <button type="button" className="chip-btn desk-only" aria-expanded={!layout.menuHidden} aria-controls="chapter-nav" onClick={layout.toggleMenu} title="Hide or show the menu (shortcut: [ )">
              {layout.menuHidden ? 'Show menu' : 'Hide menu'}
            </button>
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
              {chapter.topic && (
                <>
                  {' · '}
                  <code>projects/{chapter.topic}</code>
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
