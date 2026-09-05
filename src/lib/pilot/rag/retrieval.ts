import type { KnowledgeChunk, RetrievalHit } from "../types";
import { cosine, type EmbeddingProvider } from "./embedding";
import { tokenize } from "./tokenize";

export function lexicalScore(query: string, text: string): number {
  const q = new Set(tokenize(query, true));
  const d = tokenize(text, true);
  if (!q.size || !d.length) return 0;
  let overlap = 0;
  const df = new Map<string, number>();
  for (const t of d) df.set(t, (df.get(t) ?? 0) + 1);
  for (const t of q) {
    const c = df.get(t) ?? 0;
    if (c > 0) overlap += 1 + Math.log(1 + c);
  }
  return overlap / Math.sqrt(q.size);
}

export function retrieve(
  query: string,
  chunks: KnowledgeChunk[],
  provider: EmbeddingProvider,
  k = 6,
): RetrievalHit[] {
  const qVec = provider.embed(query) as number[];
  const scored: RetrievalHit[] = [];
  for (const chunk of chunks) {
    if (chunk.flagged) continue;
    const cos = cosine(qVec, chunk.embedding);
    const lex = lexicalScore(query, chunk.text);
    const score = 0.62 * ((cos + 1) / 2) + 0.38 * Math.min(1, lex / 4);
    scored.push({
      chunk,
      documentTitle: "",
      score,
      lexical: lex,
      cosine: cos,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
