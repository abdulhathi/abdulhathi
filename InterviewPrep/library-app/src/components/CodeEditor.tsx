import { indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { PostgreSQL, sql, SQLite } from '@codemirror/lang-sql';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useEffect, useRef, useSyncExternalStore } from 'react';

export type EditorLanguage = 'python' | 'ts' | 'tsx' | 'sql' | 'sql-postgres';

function languageExtension(lang: EditorLanguage): Extension {
  switch (lang) {
    case 'python':
      return python();
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'sql':
      return sql({ dialect: SQLite });
    case 'sql-postgres':
      return sql({ dialect: PostgreSQL });
  }
}

const sizeTheme = (px: number) => EditorView.theme({ '&': { fontSize: `${px}px` } });

/** Dark when the page is dark: an explicit data-theme, or the system setting when there is none. */
function useDark() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
      mq?.addEventListener('change', onChange);
      const obs = new MutationObserver(onChange);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      return () => {
        mq?.removeEventListener('change', onChange);
        obs.disconnect();
      };
    },
    () => {
      const t = document.documentElement.dataset.theme;
      return t ? t === 'dark' : Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    },
    () => false,
  );
}

type Props = {
  value: string;
  onChange?: (value: string) => void;
  language: EditorLanguage;
  readOnly?: boolean;
  label: string;
  /** Extra key bindings, e.g. Mod-Enter to run. */
  onRun?: () => void;
  onTest?: () => void;
  minHeight?: number;
  /** Font size in pixels; changing it re-renders the editor in place. */
  fontSize?: number;
};

/** A CodeMirror 6 editor: syntax highlighting, bracket matching, autocompletion, Tab to indent. */
export function CodeEditor({ value, onChange, language, readOnly = false, label, onRun, onTest, minHeight = 320, fontSize = 14 }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const lang = useRef(new Compartment());
  const size = useRef(new Compartment());
  const handlers = useRef({ onChange, onRun, onTest });
  handlers.current = { onChange, onRun, onTest };
  const dark = useDark();

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([
            { key: 'Mod-Enter', run: () => (handlers.current.onRun?.(), true) },
            { key: 'Mod-Shift-Enter', run: () => (handlers.current.onTest?.(), true) },
            indentWithTab,
          ]),
          lang.current.of(languageExtension(language)),
          theme.current.of(dark ? oneDark : []),
          size.current.of(sizeTheme(fontSize)),
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ 'aria-label': label }),
          EditorView.theme({ '&': { minHeight: `${minHeight}px` }, '.cm-scroller': { fontFamily: 'var(--mono)' }, '.cm-content': { minHeight: `${minHeight}px` } }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; value, language and theme changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, label, minHeight]);

  // Replace the document only when it changed from outside (reset, problem switch), not while typing.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) });
  }, [dark]);

  useEffect(() => {
    view.current?.dispatch({ effects: lang.current.reconfigure(languageExtension(language)) });
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({ effects: size.current.reconfigure(sizeTheme(fontSize)) });
  }, [fontSize]);

  return <div className={readOnly ? 'code-editor read-only' : 'code-editor'} ref={host} />;
}
