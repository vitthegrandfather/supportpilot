import { estimateTokens } from "./tokenize";

export interface ChunkDraft {
  ordinal: number;
  section: string;
  page: number | null;
  text: string;
  tokenCount: number;
}

export interface ChunkOptions {
  minTokens?: number;
  maxTokens?: number;
  overlapTokens?: number;
}

const DEFAULTS: Required<ChunkOptions> = {
  minTokens: 500,
  maxTokens: 800,
  overlapTokens: 100,
};

export function extractSections(text: string): { section: string; body: string }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: { section: string; body: string }[] = [];
  let current = "Introduction";
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ section: current, body });
    buf = [];
  };
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line) || /^([A-Z][A-Za-z0-9 /&-]{3,80})$/.exec(line);
    if (heading && line.trim().length < 90) {
      flush();
      current = (heading[2] ?? heading[1]).replace(/^#+\s*/, "").trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ section: "Body", body: text.trim() }];
}

export function chunkDocument(text: string, options: ChunkOptions = {}): ChunkDraft[] {
  const opts = { ...DEFAULTS, ...options };
  const cleaned = cleanupText(text);
  const sections = extractSections(cleaned);
  const chunks: ChunkDraft[] = [];
  let ordinal = 0;

  for (const section of sections) {
    const paragraphs = section.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    let buffer = "";
    const push = (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      ordinal += 1;
      chunks.push({
        ordinal,
        section: section.section,
        page: Math.max(1, Math.ceil(ordinal / 2)),
        text: trimmed,
        tokenCount: estimateTokens(trimmed),
      });
    };

    for (const para of paragraphs) {
      const next = buffer ? `${buffer}\n\n${para}` : para;
      if (estimateTokens(next) > opts.maxTokens && buffer) {
        push(buffer);
        const overlap = overlapTail(buffer, opts.overlapTokens);
        buffer = overlap ? `${overlap}\n\n${para}` : para;
      } else {
        buffer = next;
      }
    }
    if (buffer) {
      if (estimateTokens(buffer) < opts.minTokens && chunks.length) {
        const last = chunks[chunks.length - 1];
        if (last.section === section.section && estimateTokens(last.text + buffer) <= opts.maxTokens + 80) {
          last.text = `${last.text}\n\n${buffer}`.trim();
          last.tokenCount = estimateTokens(last.text);
        } else {
          push(buffer);
        }
      } else {
        push(buffer);
      }
    }
  }

  return chunks.length ? chunks : [{
    ordinal: 1,
    section: "Body",
    page: 1,
    text: cleaned,
    tokenCount: estimateTokens(cleaned),
  }];
}

export function cleanupText(text: string): string {
  return text
    .split("\u0000")
    .join("")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
}

function overlapTail(text: string, overlapTokens: number): string {
  const words = text.split(/\s+/);
  if (words.length <= overlapTokens) return text;
  return words.slice(-overlapTokens).join(" ");
}
