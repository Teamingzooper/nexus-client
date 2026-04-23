import React from 'react';

/**
 * Tiny renderer for the subset of formatting that appears in release notes.
 * Handles two shapes:
 *
 * 1. **Markdown** (what's in CHANGELOG.md) — headings, bullet lists, inline
 *    bold/italic/code. This is what the dev path feeds in.
 *
 * 2. **HTML** (what electron-updater returns in production) — GitHub's
 *    releases atom feed ships pre-rendered HTML in <content type="html">,
 *    so the `releaseNotes` electron-updater surfaces for a GitHub release
 *    is already `<p>…<strong>…</strong>…<code>…</code>…</p>`. If we feed
 *    that through the markdown parser, the tags render as literal text.
 *
 * The input is auto-detected: if it contains a recognizable HTML tag we
 * parse it with DOMParser and map elements onto an allow-listed set of
 * React elements. Everything else goes through the markdown parser.
 *
 * Security note: we never use `dangerouslySetInnerHTML`. Tags outside the
 * allow-list are stripped but their children are kept, so unknown wrappers
 * degrade to plain text rather than injecting attributes we didn't vet.
 */
export function Markdown({ source }: { source: string }) {
  if (looksLikeHtml(source)) {
    return <div className="markdown-body">{renderHtml(source)}</div>;
  }
  const blocks = parseBlocks(source);
  return (
    <div className="markdown-body">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

const HTML_TAG_RE =
  /<\/?(p|ul|ol|li|strong|b|em|i|code|pre|a|h[1-6]|br|hr|blockquote|div|span)\b[^>]*>/i;

function looksLikeHtml(source: string): boolean {
  return HTML_TAG_RE.test(source);
}

// HTML element → React element tag. `null` in the second slot means "strip
// the wrapper, keep children" — used to filter out anything we don't want.
// Heading levels get shifted two ranks down so release-note headings read
// as sub-sections of the enclosing panel, mirroring the markdown path.
const TAG_MAP: Record<string, string> = {
  p: 'p',
  div: 'div',
  span: 'span',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  code: 'code',
  pre: 'pre',
  h1: 'h3',
  h2: 'h4',
  h3: 'h5',
  h4: 'h5',
  h5: 'h6',
  h6: 'h6',
  br: 'br',
  hr: 'hr',
  blockquote: 'blockquote',
  a: 'a',
};

const VOID_TAGS = new Set(['br', 'hr']);

function renderHtml(source: string): React.ReactNode[] {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const ctr = { n: 0 };
  return renderNodeList(doc.body.childNodes, ctr);
}

function renderNodeList(
  nodes: NodeListOf<ChildNode> | ArrayLike<Node>,
  ctr: { n: number },
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < (nodes as NodeListOf<ChildNode>).length; i++) {
    const node = (nodes as NodeListOf<ChildNode>)[i];
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent;
      if (t) out.push(t);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const mapped = TAG_MAP[tag];
    const children = renderNodeList(el.childNodes, ctr);
    if (!mapped) {
      // Unknown tag — strip the wrapper, keep children.
      out.push(...children);
      continue;
    }
    if (VOID_TAGS.has(mapped)) {
      out.push(React.createElement(mapped, { key: ctr.n++ }));
      continue;
    }
    if (mapped === 'a') {
      const href = el.getAttribute('href') ?? '';
      // Defense in depth: strip anything that isn't http(s). Release notes
      // from GitHub should only contain http links, but we don't want a
      // stray `javascript:` URL sneaking through if the feed is ever
      // abused.
      const safeHref = /^https?:\/\//i.test(href) ? href : undefined;
      out.push(
        React.createElement(
          'a',
          {
            key: ctr.n++,
            href: safeHref,
            target: '_blank',
            rel: 'noopener noreferrer',
          },
          ...children,
        ),
      );
      continue;
    }
    out.push(React.createElement(mapped, { key: ctr.n++ }, ...children));
  }
  return out;
}

// ─────────────────────────────────────────────── Markdown (dev / fallback) ──

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    if (text) blocks.push({ kind: 'paragraph', text });
    paragraph = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    blocks.push({ kind: 'list', items: list });
    list = [];
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, ''); // trim trailing whitespace only

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2].trim() });
      continue;
    }

    const listItem = /^\s*[-*]\s+(.+)$/.exec(line);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();

  return blocks;
}

function renderBlock(block: Block, key: number): React.ReactNode {
  if (block.kind === 'heading') {
    if (block.level === 1) return <h3 key={key}>{renderInline(block.text)}</h3>;
    if (block.level === 2) return <h4 key={key}>{renderInline(block.text)}</h4>;
    return <h5 key={key}>{renderInline(block.text)}</h5>;
  }
  if (block.kind === 'list') {
    return (
      <ul key={key}>
        {block.items.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  }
  return <p key={key}>{renderInline(block.text)}</p>;
}

function renderInline(text: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > lastIndex) parts.push(text.slice(lastIndex, start));
    if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      parts.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = start + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
