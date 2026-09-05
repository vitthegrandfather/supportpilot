"""Grounded reply pipeline: classify → retrieve → rank → draft → cite → escalate."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.ids import next_public_id, rid
from app.providers.base import EmbeddingProvider, GenerationProvider
from app.providers.sandbox import SandboxEmbeddingProvider, SandboxGenerationProvider
from app.rag.citations import map_citations, verify_citations
from app.rag.classification import classify_ticket
from app.rag.confidence import calculate_confidence
from app.rag.escalation import decide_escalation, identify_gaps
from app.rag.injection import detect_prompt_injection, strip_injected_chunks
from app.rag.ranking import evidence_sufficient, rank_evidence
from app.rag.retrieval import retrieve

PIPELINE_STAGES = [
    {"id": "classify", "label": "Classifying ticket"},
    {"id": "retrieve", "label": "Retrieving knowledge"},
    {"id": "rank", "label": "Ranking evidence"},
    {"id": "draft", "label": "Drafting response"},
    {"id": "citations", "label": "Verifying citations"},
    {"id": "policy", "label": "Checking escalation policy"},
]


def _chunk_as_dict(chunk: Any) -> dict[str, Any]:
    if isinstance(chunk, dict):
        return chunk
    return {
        "id": chunk.id,
        "document_id": chunk.document_id,
        "workspace_id": getattr(chunk, "workspace_id", ""),
        "ordinal": chunk.ordinal,
        "section": chunk.section,
        "page": chunk.page,
        "text": chunk.text,
        "embedding": chunk.embedding,
        "token_count": getattr(chunk, "token_count", 0),
        "flagged": chunk.flagged,
        "flag_reason": getattr(chunk, "flag_reason", None),
    }


def run_grounded_pipeline(
    input_data: dict[str, Any],
    embedding: EmbeddingProvider | None = None,
    generation: GenerationProvider | None = None,
) -> dict[str, Any]:
    embedding = embedding or SandboxEmbeddingProvider()
    generation = generation or SandboxGenerationProvider()
    safety_events: list[dict[str, str]] = []
    subject = input_data["subject"]
    customer_message = input_data["customer_message"]
    customer_inj = detect_prompt_injection(f"{subject}\n{customer_message}")
    if customer_inj.matched:
        safety_events.append(
            {
                "type": "customer_prompt_injection",
                "detail": f"Customer message matched: {', '.join(customer_inj.patterns)}",
            }
        )

    classification = classify_ticket(subject, customer_message)
    documents = input_data.get("documents") or []
    title_by_doc = {
        (d["id"] if isinstance(d, dict) else d.id): (d["title"] if isinstance(d, dict) else d.title) for d in documents
    }

    raw_chunks = [_chunk_as_dict(c) for c in (input_data.get("chunks") or [])]
    kept, flagged = strip_injected_chunks(raw_chunks)
    for item in flagged:
        doc_id = item["document_id"]
        safety_events.append(
            {
                "type": "document_prompt_injection",
                "detail": (
                    f"Excluded chunk {item['ordinal']} ({title_by_doc.get(doc_id, doc_id)}): {item.get('flag_reason')}"
                ),
            }
        )

    ready_ids = {
        (d["id"] if isinstance(d, dict) else d.id)
        for d in documents
        if (d["status"] if isinstance(d, dict) else d.status) == "ready"
    }
    ready_chunks = [c for c in kept if c["document_id"] in ready_ids]

    query = f"{subject}\n{customer_message}"
    raw_hits = retrieve(query, ready_chunks, embedding, 8)
    for hit in raw_hits:
        chunk = hit["chunk"]
        hit["document_title"] = title_by_doc.get(chunk["document_id"], "Unknown document")
    hits = rank_evidence(raw_hits, title_by_doc, query)
    knowledge_gaps = identify_gaps(query, hits)
    insufficient = (not evidence_sufficient(hits)) or bool(knowledge_gaps)
    citations = (
        []
        if insufficient
        else map_citations([h for h in hits if h["score"] >= 0.4 and not h["chunk"].get("flagged")], 4)
    )

    generated = generation.generate(
        {
            "subject": subject,
            "customer_name": input_data.get("customer_name", "there"),
            "customer_message": customer_message,
            "classification": classification,
            "citations": citations,
            "insufficient_evidence": insufficient,
            "knowledge_gaps": knowledge_gaps,
            "safety_flags": classification["safety_flags"],
        }
    )

    verification = verify_citations(generated["body"], citations)
    flags = classification["safety_flags"]
    security_sensitive = any("security" in f or "ownership" in f for f in flags)
    confidence = calculate_confidence(
        hits=hits,
        cited_sentence_ratio=float(verification["ratio"]),
        classification=classification,
        insufficient_evidence=insufficient,
        security_sensitive=security_sensitive,
    )
    decision = decide_escalation(
        confidence=confidence,
        classification=classification,
        insufficient_evidence=insufficient,
        knowledge_gaps=knowledge_gaps,
    )
    now = datetime.now(timezone.utc).isoformat()
    state = "blocked" if decision["escalate"] and insufficient else "generated"
    draft = {
        "id": rid("drf"),
        "public_id": next_public_id("DRF", int(input_data.get("draft_seq") or 1)),
        "ticket_id": input_data["ticket_id"],
        "state": state,
        "body": generated["body"],
        "original_body": generated["body"],
        "confidence": confidence,
        "classification": classification,
        "citations": citations,
        "knowledge_gaps": knowledge_gaps,
        "escalate": decision["escalate"],
        "escalate_reason": decision["reason"],
        "insufficient_evidence": insufficient,
        "created_at": now,
        "updated_at": now,
        "approved_by": None,
        "approved_at": None,
        "sent_at": None,
    }
    return {
        "draft": draft,
        "classification": classification,
        "hits": hits,
        "safety_events": safety_events,
        "uncited_sentences": verification["uncited"],
        "recommended_queue": decision["queue"],
    }
