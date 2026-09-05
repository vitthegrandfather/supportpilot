import type { ClassificationResult, RetrievedCitation } from "../types";

export interface GenerationRequest {
  subject: string;
  customerName: string;
  customerMessage: string;
  classification: ClassificationResult;
  citations: RetrievedCitation[];
  insufficientEvidence: boolean;
  knowledgeGaps: string[];
  safetyFlags: string[];
}

export interface GenerationProvider {
  readonly name: string;
  generate(req: GenerationRequest): { body: string; notes: string[] };
}

export class SandboxGenerationProvider implements GenerationProvider {
  readonly name = "sandbox-extractive-v1";

  generate(req: GenerationRequest): { body: string; notes: string[] } {
    const notes: string[] = [];
    const first = req.customerName.split(" ")[0] ?? "there";

    if (req.safetyFlags.includes("security_sensitive") || req.safetyFlags.includes("account_ownership_change")) {
      notes.push("security_review_required");
      return {
        notes,
        body: [
          `Hi ${first},`,
          ``,
          `Thank you for writing in. Requests that change account ownership or recovery controls are treated as security-sensitive and cannot be completed from this conversation alone. [${cite(req, "Account Verification")}]`,
          ``,
          `We will not provide steps that transfer ownership, disable two-factor authentication, or reassign billing authority until the registered owner completes verification: a matching government ID, confirmation from the account recovery email, and the last four digits of the payment method on file. [${cite(req, "Account Verification")}]`,
          ``,
          `A specialist will review this ticket before any change is made. If you are the registered owner, reply with the verification items listed in the Account Verification Policy — do not send full card numbers or passwords.`,
          ``,
          `Kind regards,`,
          `HelioDesk Support`,
        ].join("\n"),
      };
    }

    if (req.insufficientEvidence || req.citations.length === 0) {
      notes.push("insufficient_evidence");
      const gaps = req.knowledgeGaps.length
        ? req.knowledgeGaps.map((g) => `• ${g}`).join("\n")
        : "• The indexed policies do not cover this request.";
      return {
        notes,
        body: [
          `Hi ${first},`,
          ``,
          `Thank you for the question. I do not have enough approved policy evidence in the knowledge base to answer this reliably, so I am not going to guess at a commitment or invent a process.`,
          ``,
          `What is missing from the indexed sources:`,
          gaps,
          ``,
          `I am escalating this to a specialist who can confirm the official position. You will receive a follow-up from a human operator; no change has been made to your account.`,
          ``,
          `Kind regards,`,
          `HelioDesk Support`,
        ].join("\n"),
      };
    }

    const facts = pickFacts(req.citations, req.customerMessage, 5);
    const factLines = facts.map((f) => `${f.text} [${f.marker}]`);
    const opener = classifyOpener(req);

    return {
      notes,
      body: [
        `Hi ${first},`,
        ``,
        opener,
        ``,
        ...factLines.map((line) => line),
        ``,
        `If anything here does not match what you see on the account, reply with the invoice or event IDs involved and an operator will continue the investigation. This draft is not a live change to billing or access.`,
        ``,
        `Kind regards,`,
        `HelioDesk Support`,
      ].join("\n"),
    };
  }
}

function cite(req: GenerationRequest, titlePart: string): number {
  const found = req.citations.find((c) => c.documentTitle.toLowerCase().includes(titlePart.toLowerCase()));
  return found?.marker ?? req.citations[0]?.marker ?? 1;
}

function classifyOpener(req: GenerationRequest): string {
  if (req.classification.category === "billing") {
    return "I reviewed your billing ticket against the current Billing and Refund Policy and the Payment Investigation Procedure. Here is what those sources allow us to do.";
  }
  if (req.classification.category === "cancellation") {
    return "I checked the Subscription Cancellation Policy for the options that apply to your plan.";
  }
  if (req.classification.category === "privacy") {
    return "I looked up the Data Privacy and Deletion Procedure so this reply stays within the published process.";
  }
  if (req.classification.category === "integrations") {
    return "I compared the symptoms you described with the Integration Troubleshooting Guide.";
  }
  if (req.classification.category === "outage") {
    return "I checked this against the Service-Level Agreement and current incident handling rules.";
  }
  return "I retrieved the internal policies that apply to this request. The statements below are limited to those sources.";
}

function pickFacts(
  citations: RetrievedCitation[],
  query: string,
  n: number,
): { text: string; marker: number }[] {
  const q = query.toLowerCase();
  const out: { text: string; marker: number }[] = [];
  const seen = new Set<string>();
  for (const cit of citations) {
    const sentences = cit.excerpt.split(/(?<=[.!?])\s+/);
    const ranked = sentences
      .map((s) => ({ s: s.trim(), score: sentenceScore(s, q) }))
      .filter((x) => x.s.length > 40)
      .filter((x) => !/^(use this|open the|search the|do not |operators? must|explain the|attach |tell the customer|ask for |collect every|advise the)/i.test(x.s))
      .filter((x) => !/do not raise the limit|from a support ticket/i.test(x.s))
      .sort((a, b) => b.score - a.score);
    for (const item of ranked.slice(0, 2)) {
      const key = item.s.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: item.s.replace(/\[(\d+)\]/g, "").trim(), marker: cit.marker });
      if (out.length >= n) return out;
    }
  }
  if (!out.length && citations[0]) {
    out.push({ text: citations[0].excerpt.split(/(?<=[.!?])\s+/)[0] ?? citations[0].excerpt, marker: 1 });
  }
  return out;
}

function sentenceScore(sentence: string, query: string): number {
  const st = new Set(sentence.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const qt = query.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  let n = 0;
  for (const t of qt) if (st.has(t)) n += 1;
  return n;
}

/** Adapter surface for a hosted LLM. Preview never calls it. */
export class OpenAIGenerationAdapter implements GenerationProvider {
  readonly name = "openai-adapter";
  constructor(private readonly _apiKey?: string) {}
  generate(_req: GenerationRequest): { body: string; notes: string[] } {
    throw new Error("Hosted generation providers are disabled in this demo.");
  }
}
