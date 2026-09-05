import type { ClassificationResult, RetrievalHit } from "../types";

export function calculateConfidence(args: {
  hits: RetrievalHit[];
  citedSentenceRatio: number;
  classification: ClassificationResult;
  insufficientEvidence: boolean;
  securitySensitive: boolean;
}): number {
  if (args.insufficientEvidence) {
    return Math.min(0.34, 0.18 + (args.hits[0]?.score ?? 0) * 0.2);
  }
  const top = args.hits[0]?.score ?? 0;
  const mean = args.hits.length
    ? args.hits.reduce((s, h) => s + h.score, 0) / args.hits.length
    : 0;
  let conf = 0.25 + top * 0.45 + mean * 0.15 + args.citedSentenceRatio * 0.2;
  if (args.securitySensitive) conf = Math.min(conf, 0.58);
  if (args.classification.safetyFlags.includes("prompt_injection_in_customer_message")) {
    conf = Math.min(conf, 0.4);
  }
  return Math.max(0.05, Math.min(0.97, round2(conf)));
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
