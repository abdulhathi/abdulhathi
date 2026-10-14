import { useMemo, type MouseEvent } from 'react';
import { toHtml } from '../lib/markdown';

// Copy buttons are plain HTML inside the rendered Markdown, so one delegated handler serves them all.
function onCopy(e: MouseEvent<HTMLDivElement>) {
  const button = (e.target as HTMLElement).closest('button.copy');
  if (!button) return;
  const code = button.closest('figure')?.querySelector('code');
  if (!code) return;
  const flash = (label: string) => {
    button.textContent = label;
    setTimeout(() => (button.textContent = 'Copy'), 1400);
  };
  const select = () => {
    const range = document.createRange();
    range.selectNodeContents(code);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    flash('Selected');
  };
  if (!navigator.clipboard?.writeText) return select();
  navigator.clipboard.writeText(code.textContent ?? '').then(() => flash('Copied'), select);
}

export function Markdown({ src, className = 'md' }: { src: string; className?: string }) {
  const html = useMemo(() => toHtml(src), [src]);
  if (!src) return null;
  return <div className={className} onClick={onCopy} dangerouslySetInnerHTML={{ __html: html }} />;
}
