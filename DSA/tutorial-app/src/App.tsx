import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import { CHAPTERS, findChapter, PRACTICE_PAGES, type Chapter } from './chapters';
import { DoneToggle, Pager, ThemeToggle } from './components/ChapterControls';
import { Hero } from './components/Hero';
import { Sidebar } from './components/Sidebar';
import { Drill } from './pages/Drill';
import { Review } from './pages/Review';
import { Tracker } from './pages/Tracker';
import { ProblemProvider } from './lib/problems';
import { ProgressProvider } from './lib/progress';
import { hrefFor, useRoute } from './lib/route';
import { useTheme } from './lib/theme';

export default function App() {
  return (
    <ProgressProvider>
      <ProblemProvider>
        <Lab />
      </ProblemProvider>
    </ProgressProvider>
  );
}

const PAGES: Record<string, ComponentType> = { tracker: Tracker, drill: Drill, review: Review };

// One lazy component per chapter, created once, so revisiting a chapter does not reload it.
const bodies = new Map<string, LazyExoticComponent<ComponentType>>();
function bodyFor(ch: Chapter) {
  let body = bodies.get(ch.id);
  if (!body) {
    body = lazy(ch.load);
    bodies.set(ch.id, body);
  }
  return body;
}

function Lab() {
  const route = useRoute();
  const page = PRACTICE_PAGES.find((p) => p.id === route);
  const chapter = page ? undefined : (findChapter(route) ?? CHAPTERS[0]);
  const key = page?.id ?? chapter!.id;
  const title = page?.title ?? chapter!.title;
  const { mode, cycle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // On every page change: start at the top, close the phone menu, and move
  // keyboard focus to the new title (but not on the initial page load).
  useEffect(() => {
    document.title = `${title} · DSA Lab`;
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [key, title]);

  const isWelcome = chapter?.id === 'welcome';
  const Title = isWelcome ? 'h2' : 'h1';
  const index = chapter ? CHAPTERS.indexOf(chapter) : -1;
  const Page = page ? PAGES[page.id] : undefined;
  const Body = chapter ? bodyFor(chapter) : undefined;

  return (
    <div className="page">
      <aside className="rail">
        <div className="rail-head">
          <a className="brand" href={hrefFor(CHAPTERS[0].id)}>DSA Lab</a>
          <div className="rail-actions">
            <ThemeToggle mode={mode} onCycle={cycle} />
            <button
              type="button"
              className="chip-btn menu-btn"
              aria-expanded={menuOpen}
              aria-controls="chapter-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        <div id="chapter-nav" className={menuOpen ? 'rail-body open' : 'rail-body'}>
          <Sidebar current={key} />
        </div>
      </aside>

      <main>
        {isWelcome && <Hero />}
        <article className="chapter" key={key}>
          <header className="ch-head prose">
            <p className="eyebrow">
              {chapter ? (
                <>
                  <b>{chapter.num}</b> · {chapter.group}
                </>
              ) : (
                <b>Practice</b>
              )}
            </p>
            <Title className="ch-title" ref={heading} tabIndex={-1}>
              {title}
            </Title>
            <p className="goal">{page?.goal ?? chapter!.goal}</p>
          </header>
          {Page && <Page />}
          {Body && chapter && (
            <ChapterBoundary id={chapter.id}>
              <Suspense fallback={<p className="loading">Loading chapter…</p>}>
                <Body />
              </Suspense>
              {chapter.kind !== 'reference' && <DoneToggle id={chapter.id} />}
              <Pager prev={CHAPTERS[index - 1]} next={CHAPTERS[index + 1]} />
            </ChapterBoundary>
          )}
        </article>
      </main>
    </div>
  );
}

/** If a chapter fails to load or render, say so instead of leaving a blank page. */
class ChapterBoundary extends Component<{ id: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="box warn" role="alert">
          <span className="box-label">This chapter could not load</span>
          <p>{this.state.error.message}</p>
          <p>Reload the page to try again.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
