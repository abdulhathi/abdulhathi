import { Component, lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { findChapter, findStack, LIBRARY, type Chapter } from './chapters';
import { DoneToggle, Pager, ThemeToggle } from './components/ChapterControls';
import { ChapterView } from './components/ChapterView';
import { Home } from './components/Home';
import { Interview, interviewScope } from './components/Interview';
import { PathPage } from './components/PathPage';
import { ProfileKitPage } from './components/ProfileKitPage';
import { ProjectPage } from './components/ProjectPage';
import { Sidebar } from './components/Sidebar';
import { TrackPage } from './components/TrackPage';
import { Drill } from './pages/Drill';
import { Mock } from './pages/Mock';
import { WeakSpots } from './pages/WeakSpots';
import { PathProgressProvider } from './lib/pathProgress';
import { ProgressProvider } from './lib/progress';
import { RatingsProvider } from './lib/ratings';
import { resolve } from './lib/resolve';
import { hrefFor, splitRoute, useRawRoute } from './lib/route';
import { useLayout } from './lib/layout';
import { useTheme } from './lib/theme';
import { TrackProvider, useActiveTrack } from './lib/track';
import { useVoice, VoiceProvider } from './lib/voice';
import { WordHelper } from './components/WordHelper';
import { PRIORITY_LABEL, type Track } from './tracks';
import { problemsOf } from './lib/md';

// The editor (CodeMirror) loads only when a code page opens.
const CodePage = lazy(() => import('./components/CodePage').then((m) => ({ default: m.CodePage })));

export default function App() {
  return (
    <TrackProvider>
      <ProgressProvider>
        <RatingsProvider>
          <VoiceProvider>
            <PathProgressProvider>
              <Library />
              <Words />
            </PathProgressProvider>
          </VoiceProvider>
        </RatingsProvider>
      </ProgressProvider>
    </TrackProvider>
  );
}

/** Select a word or sentence anywhere: translate it to Tamil, hear it, or have Claude explain it in context. */
function Words() {
  const { settings } = useVoice();
  return <WordHelper target="ta" headers={WORD_HEADERS} model={settings.model} />;
}
const WORD_HEADERS = { 'X-Interview-Library': '1' };

const PAGES: Record<string, ComponentType> = { mock: Mock, drill: Drill, progress: WeakSpots };

const problemTitle = (chapterId: string, problemId: string) => {
  const c = findChapter(chapterId);
  return (c && problemsOf(c.doc).find((p) => p.id === problemId)?.title.replace(/[`*]/g, '')) ?? problemId;
};

/** Previous and next: through the active track's order when the chapter is in it, otherwise through its stack. */
function neighbours(chapter: Chapter, track: Track | undefined) {
  const trackOrder = track ? [...track.start, ...track.plan.map(([id]) => id)] : [];
  const order = trackOrder.includes(chapter.id) ? trackOrder : LIBRARY.filter((c) => c.stack === chapter.stack).map((c) => c.id);
  const i = order.indexOf(chapter.id);
  return { prev: findChapter(order[i - 1] ?? ''), next: findChapter(order[i + 1] ?? '') };
}

function Library() {
  const raw = useRawRoute();
  const { id, anchor } = splitRoute(raw);
  const { track, setTrack } = useActiveTrack();
  const view = resolve(id, anchor, track);
  const { mode, cycle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const layout = useLayout();
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const chapter = view.kind === 'chapter' ? view.chapter : undefined;
  const key =
    view.kind === 'chapter' ? chapter!.id
    : view.kind === 'page' ? view.page.id
    : view.kind === 'track' ? `track-${view.track.id}`
    : view.kind === 'path' || view.kind === 'project' ? `${view.kind}-${view.path.id}`
    : view.kind === 'interview' ? `interview-${view.scopeId}`
    : view.kind === 'code' ? `code-${view.chapterId}-${view.problemId}`
    : view.kind;
  const title =
    view.kind === 'chapter' ? chapter!.title
    : view.kind === 'page' ? view.page.title
    : view.kind === 'track' ? `${view.track.company} track`
    : view.kind === 'path' ? `${view.path.title} learning path`
    : view.kind === 'project' ? `${view.path.title} portfolio project`
    : view.kind === 'interview' ? `Voice interview: ${interviewScope(view.scopeId)?.title ?? view.scopeId}`
    : view.kind === 'kit' ? 'Profile kit'
    : view.kind === 'code' ? `Code: ${problemTitle(view.chapterId, view.problemId)}`
    : view.kind === 'missing' ? 'Page not found'
    : 'Interview Library';

  // A track's own chapters belong to it: reading one makes that track active.
  useEffect(() => {
    if (chapter?.track && chapter.track !== track?.id) setTrack(chapter.track);
  }, [chapter, track, setTrack]);

  // An old or generic link: show the canonical address, keeping the anchor.
  useEffect(() => {
    if (chapter && id !== chapter.id && id !== 'track') {
      window.history.replaceState(null, '', hrefFor(chapter.id, anchor || undefined));
    }
  }, [chapter, id, anchor]);

  // On every page change: start at the top, close the phone menu, and move keyboard focus to the new title.
  useEffect(() => {
    document.title = view.kind === 'home' ? 'Interview Library' : `${title} · Interview Library`;
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
  }, [key, title, view.kind]);

  const Page = view.kind === 'page' ? PAGES[view.page.id] : undefined;
  const { prev, next } = chapter ? neighbours(chapter, track) : { prev: undefined, next: undefined };

  return (
    <div className={['page', view.kind === 'code' && 'code-view', layout.menuHidden && 'menu-hidden', layout.width === 'full' && 'full'].filter(Boolean).join(' ')}>
      <aside className="rail">
        <div className="rail-head">
          <a className="brand" href="#/">Interview Library</a>
          <div className="rail-actions">
            <ThemeToggle mode={mode} onCycle={cycle} />
            <button type="button" className="chip-btn desk-only" onClick={layout.toggleWidth} title="Use the whole screen, or a narrower column that is easier to read">
              Width: {layout.width === 'full' ? 'Full' : 'Reading'}
            </button>
            <button type="button" className="chip-btn desk-only" aria-expanded={!layout.menuHidden} aria-controls="chapter-nav" onClick={layout.toggleMenu} title="Hide or show the menu (shortcut: [ )">
              {layout.menuHidden ? 'Show menu' : 'Hide menu'}
            </button>
            <button type="button" className="chip-btn menu-btn" aria-expanded={menuOpen} aria-controls="chapter-nav" onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? 'Close' : 'Menu'}
            </button>
          </div>
        </div>
        <div id="chapter-nav" className={menuOpen ? 'rail-body open' : 'rail-body'}>
          <Sidebar current={chapter?.id ?? (view.kind === 'page' ? view.page.id : view.kind === 'path' || view.kind === 'project' ? `path:${view.path.id}` : view.kind === 'interview' ? `path:${view.scopeId}` : view.kind === 'kit' ? 'profile-kit' : '')} />
        </div>
      </aside>

      <main>
        {view.kind === 'home' ? (
          <Home />
        ) : (
          <article className={view.kind === 'code' ? 'chapter wide' : 'chapter'} key={key}>
            <header className="ch-head prose">
              <p className="eyebrow">
                {chapter ? (
                  <>
                    <b>{chapter.num}</b> · {chapter.kind === 'track' ? `${track?.company ?? ''} track · Start here` : chapter.group}
                  </>
                ) : view.kind === 'track' ? (
                  <b>{view.track.role}</b>
                ) : view.kind === 'code' ? (
                  <b>Code editor</b>
                ) : view.kind === 'path' || view.kind === 'project' || view.kind === 'interview' || view.kind === 'kit' ? (
                  <b>Learning paths</b>
                ) : (
                  <b>{view.kind === 'page' ? 'Practice' : 'Interview Library'}</b>
                )}
              </p>
              <h1 className="ch-title" ref={heading} tabIndex={-1}>
                {title}
              </h1>
              {chapter && <p className="goal">{chapter.goal}</p>}
              {view.kind === 'page' && <p className="goal">{view.page.goal}</p>}
              {chapter && chapter.kind !== 'track' && <TrackNote chapter={chapter} track={track} />}
            </header>
            {view.kind === 'missing' && (
              <p className="md prose">
                There is no page called “{view.id}”. Go to the <a href="#/">library home</a>.
              </p>
            )}
            {view.kind === 'track' && <TrackPage track={view.track} />}
            {view.kind === 'path' && <PathPage path={view.path} />}
            {view.kind === 'project' && <ProjectPage path={view.path} />}
            {view.kind === 'interview' && <Interview scopeId={view.scopeId} />}
            {view.kind === 'kit' && <ProfileKitPage />}
            {view.kind === 'code' && (
              <Suspense fallback={<p className="loading">Loading the editor…</p>}>
                <CodePage chapterId={view.chapterId} problemId={view.problemId} />
              </Suspense>
            )}
            {Page && <Page />}
            {chapter && (
              <ChapterBoundary id={chapter.id}>
                <ChapterView chapter={chapter} />
                {chapter.kind !== 'track' && <DoneToggle id={chapter.id} />}
                <Pager prev={prev} next={next} />
              </ChapterBoundary>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

/** Where this chapter sits in the active track, and why it matters for that job. */
function TrackNote({ chapter, track }: { chapter: Chapter; track: Track | undefined }) {
  if (!track) return null;
  const item = track.plan.find(([id]) => id === chapter.id);
  const stack = chapter.stack ? findStack(chapter.stack)?.title : '';
  if (!item) {
    return (
      <p className="track-note off">
        Not in your <a href={hrefFor('track', track.id)}>{track.company} plan</a> · {stack}
      </p>
    );
  }
  const [, priority, why] = item;
  return (
    <p className={`track-note p-${priority}`}>
      <a href={hrefFor('track', track.id)}>{track.company}</a> · <b>{PRIORITY_LABEL[priority]}</b>
      {why ? ` · ${why}` : ''}
    </p>
  );
}

/** If a chapter fails to render, say so instead of leaving a blank page. */
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
