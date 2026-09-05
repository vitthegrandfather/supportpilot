import type { ClassificationResult, RetrievalHit } from "../types";

export const CONFIDENCE_ESCALATE_BELOW = 0.55;
export const CONFIDENCE_AUTO_APPROVE_MIN = 0.86;

export function decideEscalation(args: {
  confidence: number;
  classification: ClassificationResult;
  insufficientEvidence: boolean;
  knowledgeGaps: string[];
}): { escalate: boolean; reason: string | null; queue: string } {
  const flags = args.classification.safetyFlags;
  if (flags.includes("security_sensitive") || flags.includes("account_ownership_change")) {
    return {
      escalate: true,
      reason: "Security-sensitive request requires Trust & Safety review before any account change.",
      queue: "trust_safety",
    };
  }
  if (flags.includes("privacy_request") && args.classification.category === "privacy") {
    if (args.insufficientEvidence) {
      return {
        escalate: true,
        reason: "Privacy request with incomplete policy evidence. Route to Privacy Operations.",
        queue: "privacy_ops",
      };
    }
  }
  if (args.insufficientEvidence) {
    return {
      escalate: true,
      reason: "Knowledge base does not contain enough evidence to draft a reliable answer.",
      queue: "tier2_policy",
    };
  }
  if (args.confidence < CONFIDENCE_ESCALATE_BELOW) {
    return {
      escalate: true,
      reason: `Confidence ${args.confidence.toFixed(2)} is below the ${CONFIDENCE_ESCALATE_BELOW} review threshold.`,
      queue: "human_review",
    };
  }
  if (args.knowledgeGaps.length > 0) {
    return {
      escalate: true,
      reason: `Open knowledge gaps: ${args.knowledgeGaps.join("; ")}`,
      queue: "knowledge_ops",
    };
  }
  return { escalate: false, reason: null, queue: "inbox" };
}

export function identifyGaps(query: string, hits: RetrievalHit[]): string[] {
  const gaps: string[] = [];
  if (!hits.length) {
    gaps.push("No indexed passages matched this question.");
    return gaps;
  }
  if ((hits[0]?.score ?? 0) < 0.48) {
    gaps.push("Top retrieved passages are only weakly related to the customer question.");
  }
  const q = query.toLowerCase();
  const titles = hits.map((h) => `${h.documentTitle} ${h.chunk.section}`.toLowerCase()).join(" ");
  const probes: [RegExp, string][] = [
    [/government|fedramp|public sector/, "No public-sector or government tenant policy is indexed."],
    [/white-glove|white glove|concierge onboarding/, "No white-glove onboarding policy is indexed."],
    [/hipaa/, "No HIPAA-specific processing policy is indexed."],
    [/soc 2|soc2/, "No SOC 2 evidence package procedure is indexed."],
  ];
  for (const [re, gap] of probes) {
    if (re.test(q) && !re.test(titles)) gaps.push(gap);
  }
  return gaps;
}
