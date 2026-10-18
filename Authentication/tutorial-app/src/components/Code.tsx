import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { highlight, langForFile, type Lang } from '../lib/highlight';
import { snippet, splitSnippetPath } from '../lib/snippets';

function CopyButton({ text, target }: { text: string; target: RefObject<HTMLElement | null> }) {
  const [label, setLabel] = useState('Copy');

  const flash = (value: string) => {
    setLabel(value);
    setTimeout(() => setLabel('Copy'), 1400);
  };

  // Some embedded browsers refuse clipboard access; select the text instead so Cmd+C works.
  const selectText = () => {
    if (!target.current) return;
    const range = document.createRange();
    range.selectNodeContents(target.current);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    flash('Selected');
  };

  const onClick = () => {
    if (!navigator.clipboard?.writeText) return selectText();
    navigator.clipboard.writeText(text).then(() => flash('Copied'), selectText);
  };

  return (
    <button className="copy" type="button" onClick={onClick}>
      {label}
    </button>
  );
}

function CodeFigure({ caption, code, lang, badge }: { caption: ReactNode; code: string; lang: Lang; badge?: ReactNode }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  const ref = useRef<HTMLElement>(null);
  return (
    <figure className="code">
      <figcaption>
        <span className="file">{caption}</span>
        {badge}
        <CopyButton text={code} target={ref} />
      </figcaption>
      <pre>
        <code ref={ref} className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </figure>
  );
}

const trimBlock = (text: string) => text.replace(/^\n+/, '').replace(/\s+$/, '');

export type Change = 'new' | 'updated';
const CHANGE_LABEL: Record<Change, string> = { new: 'New file', updated: 'Updated' };

/**
 * A file from a tested practice project, shown under its path inside the project.
 * `change` marks files that a chapter adds to, or rewrites in, a project you already have.
 */
export function CodeFile({ path, change }: { path: string; change?: Change }) {
  const { topic, stack, file } = splitSnippetPath(path);
  return (
    <CodeFigure
      caption={
        <>
          <span className="proj">
            {topic}/{stack ? `${stack}/` : ''}
          </span>
          {file}
        </>
      }
      code={snippet(path)}
      lang={langForFile(file)}
      badge={change && <span className={`change ${change}`}>{CHANGE_LABEL[change]}</span>}
    />
  );
}

/** An inline snippet that is not a project file. */
export function Code({ title, lang = 'typescript', children }: { title: string; lang?: Lang; children: string }) {
  return <CodeFigure caption={title} code={trimBlock(children)} lang={lang} />;
}

/** Commands to type into a terminal. */
export function Terminal({ title = 'Terminal', children }: { title?: string; children: string }) {
  return <CodeFigure caption={title} code={trimBlock(children)} lang="bash" />;
}
