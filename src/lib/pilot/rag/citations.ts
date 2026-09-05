import type { RetrievedCitation, RetrievalHit } from "../types";
import { rid } from "../ids";

export function mapCitations(hits: RetrievalHit[], limit = 4): RetrievedCitation[] {
  return hits.slice(0, limit).map((hit, i) => ({
    id: rid("cit"),
    chunkId: hit.chunk.id,
    documentId: hit.chunk.documentId,
    documentTitle: hit.documentTitle,
    section: hit.chunk.section,
    excerpt: excerpt(hit.chunk.text, 420),
    score: Math.round(hit.score * 1000) / 1000,
    marker: i + 1,
    flagged: hit.chunk.flagged,
  }));
}

export function excerpt(text: string, max = 420): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export function sentencesOf(text: string): string[] {
  const raw = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const part of raw) {
    if (/^\[\d+\]/.test(part) && merged.length) merged[merged.length - 1] += ` ${part}`;
    else merged.push(part);
  }
  return merged.filter((s) => s.length > 20);
}

export function verifyCitations(body: string, citations: RetrievedCitation[]): {
  uncited: string[];
  ratio: number;
} {
  const sentences = sentencesOf(body).filter(
    (s) => !/^(hi |hello |thanks |thank you|kind regards|we are sorry)/i.test(s),
  );
  if (!sentences.length) return { uncited: [], ratio: 1 };
  const uncited: string[] = [];
  let cited = 0;
  for (const sentence of sentences) {
    const hasMarker = /\[(\d+)\]/.test(sentence);
    if (hasMarker) {
      cited += 1;
      continue;
    }
    const lowered = sentence.toLowerCase();
    const supported = citations.some((c) => overlap(lowered, c.excerpt.toLowerCase()) >= 0.28);
    if (supported) cited += 1;
    else uncited.push(sentence);
  }
  return { uncited, ratio: cited / sentences.length };
}

function overlap(a: string, b: string): number {
  const at = new Set(a.split(/[^a-z0-9]+/).filter((x) => x.length > 3));
  const bt = b.split(/[^a-z0-9]+/).filter((x) => x.length > 3);
  if (!at.size) return 0;
  let n = 0;
  for (const t of bt) if (at.has(t)) n += 1;
  return n / at.size;
}
