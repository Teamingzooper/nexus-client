import React from 'react';

/**
 * Tiny markdown renderer for the subset of markdown that appears in our
 * CHANGELOG-derived release notes. Not a general-purpose parser — just
 * enough to render the output of scripts/extract-changelog.js cleanly
 * inside the in-app Updates tab.
 *
 * Supports:
 *   - `# Heading`, `## Heading`, `### Heading` (mapped to h3/h4/h5 so they
 *     don't visually compete with the settings headings around them)
 *   - `- item` / `* item` unordered lists
 *   - blank line separates paragraphs
 *   - inline `**bold**`, `*italic*`, and `` `code` ``
 *
 * Everything else is rendered as plain text. React's default escaping
 * handles untrusted content safely — we never dangerouslySetInnerHTML.
 */
export function Markdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <div className="markdown-body">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

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
    // Shift markdown heading levels two ranks down so the release notes
    // headings read as sub-sections of the enclosing panel.
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

/**
 * Replace `**bold**`, `*italic*`, and `` `code` `` with their React
 * equivalents. Other characters pass through untouched — React's default
 * text rendering handles HTML-escaping.
 */
function renderInline(text: string): React.ReactNode[] {
  // Match one of: **bold**, *italic*, `code`. Non-greedy.
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
