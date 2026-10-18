import { baseUrl, findApp } from '../apps';
import { findPlan, type Block, type BlockKind, type PlanLink } from '../plans';
import { appHref, planHref } from '../lib/route';
import { clock, countable, countdown, dayLabel, momentLabel, useDone, useNow, whereAmI, type Slot } from '../lib/schedule';

const KIND_LABEL: Record<BlockKind, string> = { study: 'Study', practice: 'Practice', break: 'Break', event: 'Prep', test: 'Milestone' };

const blockDomId = (id: string) => `block-${id}`;
const show = (id: string) => document.getElementById(blockDomId(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });

/** A timed preparation plan: countdowns, what to do now, and each day's blocks with a tick box. */
export function PlanPage({ planId }: { planId?: string }) {
  const plan = findPlan(planId);
  const now = useNow();
  const { done, toggle, reset } = useDone(plan.id);
  const { current, next } = whereAmI(plan, now);
  const all = plan.days.flatMap((d) => countable(d.blocks));
  const doneCount = all.filter((b) => done.has(b.id)).length;

  return (
    <div className="plan">
      <header className="plan-head">
        <p className="kicker">Prep plan</p>
        <h1>{plan.title}</h1>
        <p className="lede">{plan.summary}</p>
        <p className="muted plan-zone">All times are {plan.zoneLabel}.</p>
      </header>

      <section className="milestones" aria-label="Countdowns">
        {plan.milestones.map((m) => {
          const left = countdown(new Date(m.at), now);
          return (
            <article key={m.id} className={left ? 'milestone' : 'milestone is-past'}>
              <p className="ms-label">{m.label}</p>
              <p className="ms-left">{left ? `in ${left}` : 'Passed'}</p>
              <p className="ms-when">
                {momentLabel(m.at)}
                {m.note && <span className="muted"> · {m.note}</span>}
              </p>
            </article>
          );
        })}
      </section>

      <NowBanner current={current} next={next} />

      <div className="plan-progress">
        <p>
          <strong>{doneCount}</strong> of {all.length} blocks done
        </p>
        <div className="bar" role="progressbar" aria-label="Plan progress" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={doneCount}>
          <i style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%` }} />
        </div>
        {doneCount > 0 && (
          <button type="button" className="btn ghost" onClick={() => window.confirm('Clear every tick on this plan?') && reset()}>
            Clear ticks
          </button>
        )}
      </div>

      {plan.notes.length > 0 && (
        <ul className="plan-notes">
          {plan.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {plan.days.map((day) => {
        const ticks = countable(day.blocks);
        const dayDone = ticks.filter((b) => done.has(b.id)).length;
        const headingId = `day-${day.date}`;
        return (
          <section key={day.date} className="plan-day" aria-labelledby={headingId}>
            <div className="day-head">
              <h2 id={headingId}>
                {dayLabel(day.date)} <span className="day-focus">{day.focus}</span>
              </h2>
              <p className="day-count">
                {dayDone} of {ticks.length} done
              </p>
            </div>
            <ol className="blocks">
              {day.blocks.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  isNow={current?.block.id === block.id}
                  isPast={new Date(`${day.date}T${block.end}:00${plan.utcOffset}`) <= now}
                  done={done.has(block.id)}
                  onToggle={() => toggle(block.id)}
                />
              ))}
            </ol>
          </section>
        );
      })}

      <p className="muted plan-foot">
        Ticks are saved in this browser. Plans live in <code>StudyHub/src/plans.ts</code>; this one is at <a href={planHref(plan.id)}>{planHref(plan.id)}</a>.
      </p>
    </div>
  );
}

function NowBanner({ current, next }: { current?: Slot; next?: Slot }) {
  if (!current && !next) return <p className="now-banner done">The plan is complete. Good luck!</p>;
  return (
    <div className="now-banner" aria-live="polite">
      {current && (
        <p>
          <span className="now-tag">Now</span> {clock(current.block.start)}–{clock(current.block.end)} · <strong>{current.block.title}</strong>
          <button type="button" className="btn ghost" onClick={() => show(current.block.id)}>
            Show it
          </button>
        </p>
      )}
      {next && (
        <p>
          <span className="now-tag next">Next</span> {current?.day.date === next.day.date ? '' : `${dayLabel(next.day.date).split(',')[0]} `}
          {clock(next.block.start)} · <strong>{next.block.title}</strong>
          {!current && (
            <button type="button" className="btn ghost" onClick={() => show(next.block.id)}>
              Show it
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function BlockRow({ block, isNow, isPast, done, onToggle }: { block: Block; isNow: boolean; isPast: boolean; done: boolean; onToggle: () => void }) {
  const cls = ['block', `k-${block.kind}`, isNow && 'is-now', isPast && !isNow && 'is-past', done && 'is-done'].filter(Boolean).join(' ');
  return (
    <li id={blockDomId(block.id)} className={cls} aria-current={isNow ? 'time' : undefined}>
      <div className="block-time">
        <span>{clock(block.start)}</span>
        <span className="muted">{clock(block.end)}</span>
      </div>
      <div className="block-body">
        <div className="block-head">
          {block.kind !== 'break' && (
            <input type="checkbox" checked={done} onChange={onToggle} aria-label={`Done: ${block.title}`} />
          )}
          <h3>{block.title}</h3>
          <span className={`kind kind-${block.kind}`}>{KIND_LABEL[block.kind]}</span>
          {isNow && <span className="now-tag">Now</span>}
        </div>
        {block.points && (
          <ul className="block-points">
            {block.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {block.links && (
          <ul className="block-links">
            {block.links.map((l) => (
              <li key={l.label}>
                <PlanLinkView link={l} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function PlanLinkView({ link }: { link: PlanLink }) {
  if ('url' in link)
    return (
      <a href={link.url} target="_blank" rel="noreferrer">
        {link.label} <span aria-hidden="true">↗</span>
      </a>
    );
  const app = findApp(link.app);
  if (!app) return <span>{link.label}</span>;
  if ('path' in link)
    return (
      <a href={baseUrl(app) + link.path} target="_blank" rel="noreferrer" title={`Opens ${app.name} in a new tab (start it here first)`}>
        {link.label} <span aria-hidden="true">↗</span>
      </a>
    );
  return <a href={appHref(app.id, link.page)}>{link.label}</a>;
}
