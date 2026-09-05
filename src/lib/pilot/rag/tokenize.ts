const STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "in",
  "on",
  "for",
  "is",
  "are",
  "was",
  "be",
  "as",
  "at",
  "by",
  "it",
  "this",
  "that",
  "with",
  "from",
  "we",
  "you",
  "your",
  "our",
  "if",
  "not",
  "can",
  "will",
  "please",
  "have",
  "has",
]);

export function tokenize(text: string, keepStop = false): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && (keepStop || !STOP.has(t)));
}

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
