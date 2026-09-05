import type { RetrievalHit } from "../types";
import { tokenize } from "./tokenize";

export function rankEvidence(
  hits: RetrievalHit[],
  titleByDoc: Map<string, string>,
  query = "",
): RetrievalHit[] {
  const q = new Set(tokenize(query, true));
  const ranked = hits.map((h) => {
    const documentTitle = titleByDoc.get(h.chunk.documentId) ?? h.documentTitle;
    let score = h.score;
    if (q.size) {
      const titleTok = tokenize(documentTitle, true);
      const hitCount = titleTok.filter((t) => q.has(t)).length;
      score += Math.min(0.12, hitCount * 0.04);
    }
    return { ...h, documentTitle, score };
  });
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.chunk.ordinal - b.chunk.ordinal;
  });
  const seen = new Set<string>();
  const diversified: RetrievalHit[] = [];
  for (const hit of ranked) {
    const key = `${hit.chunk.documentId}:${hit.chunk.section}`;
    if (seen.has(key) && diversified.length >= 2) continue;
    seen.add(key);
    diversified.push(hit);
  }
  return diversified;
}

export function evidenceSufficient(hits: RetrievalHit[], minScore = 0.48, minHits = 1): boolean {
  const strong = hits.filter((h) => h.score >= minScore);
  return strong.length >= minHits;
}
