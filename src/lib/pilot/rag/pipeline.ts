import type {
  ClassificationResult,
  KnowledgeChunk,
  KnowledgeDocument,
  ReplyDraft,
  RetrievalHit,
} from "../types";
import { rid, nextPublicId } from "../ids";
import { SandboxEmbeddingProvider, type EmbeddingProvider } from "./embedding";
import { retrieve } from "./retrieval";
import { evidenceSufficient, rankEvidence } from "./ranking";
import { classifyTicket } from "./classification";
import { calculateConfidence } from "./confidence";
import { decideEscalation, identifyGaps } from "./escalation";
import { mapCitations, verifyCitations } from "./citations";
import { detectPromptInjection, stripInjectedChunks } from "./injection";
import {
  SandboxGenerationProvider,
  type GenerationProvider,
} from "../providers/generation";

export const PIPELINE_STAGES = [
  { id: "classify", label: "Classifying ticket" },
  { id: "retrieve", label: "Retrieving knowledge" },
  { id: "rank", label: "Ranking evidence" },
  { id: "draft", label: "Drafting response" },
  { id: "citations", label: "Verifying citations" },
  { id: "policy", label: "Checking escalation policy" },
] as const;

export interface PipelineInput {
  ticketId: string;
  publicId: string;
  subject: string;
  customerName: string;
  customerMessage: string;
  documents: KnowledgeDocument[];
  chunks: KnowledgeChunk[];
  draftSeq: number;
}

export interface PipelineOutput {
  draft: ReplyDraft;
  classification: ClassificationResult;
  hits: RetrievalHit[];
  safetyEvents: { type: string; detail: string }[];
  uncitedSentences: string[];
}

export function runGroundedPipeline(
  input: PipelineInput,
  embedding: EmbeddingProvider = new SandboxEmbeddingProvider(),
  generation: GenerationProvider = new SandboxGenerationProvider(),
): PipelineOutput {
  const safetyEvents: { type: string; detail: string }[] = [];
  const customerInj = detectPromptInjection(`${input.subject}\n${input.customerMessage}`);
  if (customerInj.matched) {
    safetyEvents.push({
      type: "customer_prompt_injection",
      detail: `Customer message matched: ${customerInj.patterns.join(", ")}`,
    });
  }

  const classification = classifyTicket(input.subject, input.customerMessage);
  const titleByDoc = new Map(input.documents.map((d) => [d.id, d.title]));

  const { kept, flagged } = stripInjectedChunks(input.chunks);
  for (const f of flagged) {
    safetyEvents.push({
      type: "document_prompt_injection",
      detail: `Excluded chunk ${f.ordinal} (${titleByDoc.get(f.documentId) ?? f.documentId}): ${f.flagReason}`,
    });
  }

  const readyChunks = kept.filter((c) => {
    const doc = input.documents.find((d) => d.id === c.documentId);
    return doc && doc.status === "ready";
  });

  const query = `${input.subject}\n${input.customerMessage}`;
  const rawHits = retrieve(query, readyChunks, embedding, 8).map((h) => ({
    ...h,
    documentTitle: titleByDoc.get(h.chunk.documentId) ?? "Unknown document",
  }));
  const hits = rankEvidence(rawHits, titleByDoc, query);
  const knowledgeGaps = identifyGaps(query, hits);
  const insufficient = !evidenceSufficient(hits) || knowledgeGaps.length > 0;
  const citations = insufficient ? [] : mapCitations(hits.filter((h) => h.score >= 0.4 && !h.chunk.flagged), 4);

  const generated = generation.generate({
    subject: input.subject,
    customerName: input.customerName,
    customerMessage: input.customerMessage,
    classification,
    citations,
    insufficientEvidence: insufficient,
    knowledgeGaps,
    safetyFlags: classification.safetyFlags,
  });

  const { uncited, ratio } = verifyCitations(generated.body, citations);
  const securitySensitive = classification.safetyFlags.some((f) =>
    f.includes("security") || f.includes("ownership"),
  );
  const confidence = calculateConfidence({
    hits,
    citedSentenceRatio: ratio,
    classification,
    insufficientEvidence: insufficient,
    securitySensitive,
  });
  const decision = decideEscalation({
    confidence,
    classification,
    insufficientEvidence: insufficient,
    knowledgeGaps,
  });

  const now = new Date().toISOString();
  const draft: ReplyDraft = {
    id: rid("drf"),
    publicId: nextPublicId("DRF", input.draftSeq),
    ticketId: input.ticketId,
    state: decision.escalate && insufficient ? "blocked" : "generated",
    body: generated.body,
    originalBody: generated.body,
    confidence,
    classification,
    citations,
    knowledgeGaps,
    escalate: decision.escalate,
    escalateReason: decision.reason,
    insufficientEvidence: insufficient,
    createdAt: now,
    updatedAt: now,
    approvedBy: null,
    approvedAt: null,
    sentAt: null,
  };

  return {
    draft,
    classification,
    hits,
    safetyEvents,
    uncitedSentences: uncited,
  };
}
