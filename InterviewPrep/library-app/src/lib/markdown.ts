import { Marked, type Tokens } from 'marked';
import { highlight, langInfo } from './highlight';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// Chapter Markdown is written by us, not by users, so the HTML it produces is trusted.
const marked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang = '' }: Tokens.Code) {
      const fence = lang.split(/\s+/)[0] ?? '';
      const { label } = langInfo(fence);
      if (fence === 'text') {
        return `<figure class="out"><figcaption>${label}</figcaption><pre>${escape(text)}</pre></figure>`;
      }
      return `<figure class="code"><figcaption><span class="file">${escape(label)}</span><button type="button" class="copy">Copy</button></figcaption><pre><code class="hljs">${highlight(text, fence)}</code></pre></figure>`;
    },
    table(token: Tokens.Table) {
      const cell = (c: Tokens.TableCell, tag: 'th' | 'td') => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`;
      const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`;
      const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('');
      return `<div class="table-wrap"><table class="t"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    },
    link({ href, title, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const external = /^https?:/.test(href);
      return `<a href="${escape(href)}"${title ? ` title="${escape(title)}"` : ''}${external ? ' target="_blank" rel="noreferrer"' : ''}>${inner}</a>`;
    },
  },
});

const cache = new Map<string, string>();

export function toHtml(src: string): string {
  let html = cache.get(src);
  if (html === undefined) {
    html = marked.parse(src, { async: false });
    cache.set(src, html);
  }
  return html;
}

/** Markdown for one line (a card title), without the surrounding paragraph. */
export function inlineHtml(src: string): string {
  return marked.parseInline(src, { async: false });
}
