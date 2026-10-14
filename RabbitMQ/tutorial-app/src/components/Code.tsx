import { useMemo, useRef, useState, type RefObject } from 'react';
import { highlight, langForFile, type Lang } from '../lib/highlight';
import { snippet } from '../lib/snippets';

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

function CodeFigure({ caption, code, lang }: { caption: string; code: string; lang: Lang }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  const ref = useRef<HTMLElement>(null);
  return (
    <figure className="code">
      <figcaption>
        <span className="file">{caption}</span>
        <CopyButton text={code} target={ref} />
      </figcaption>
      <pre>
        <code ref={ref} className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </figure>
  );
}

const trimBlock = (text: string) => text.replace(/^\n+/, '').replace(/\s+$/, '');

/** A file from the tested ShopFlow project, shown under its real path. */
export function CodeFile({ path }: { path: string }) {
  return <CodeFigure caption={path} code={snippet(path)} lang={langForFile(path)} />;
}

/** An inline snippet that is not a project file. */
export function Code({ title, lang = 'typescript', children }: { title: string; lang?: Lang; children: string }) {
  return <CodeFigure caption={title} code={trimBlock(children)} lang={lang} />;
}

/** Commands to type into a terminal. */
export function Terminal({ title = 'Terminal', children }: { title?: string; children: string }) {
  return <CodeFigure caption={title} code={trimBlock(children)} lang="bash" />;
}
