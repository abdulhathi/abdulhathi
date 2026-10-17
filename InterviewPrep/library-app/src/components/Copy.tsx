import { useState } from 'react';

/** A text block with a Copy button, for profile entries you paste elsewhere. */
export function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers: select the text so the user can copy it by hand.
      const el = document.getElementById(`copy-${label}`) as HTMLTextAreaElement | null;
      el?.select();
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="copy-block">
      <div className="copy-head">
        <span>{label}</span>
        <button type="button" className="chip-btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <textarea id={`copy-${label}`} readOnly value={text} rows={Math.min(12, text.split('\n').length + 1)} aria-label={label} />
    </div>
  );
}
