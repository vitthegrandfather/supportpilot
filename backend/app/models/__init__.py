"""SQLAlchemy models."""

from app.models.audit import AuditEvent, ProviderConfiguration, SafetyEvent
from app.models.drafts import ReplyDraft, RetrievalRun, RetrievedCitation
from app.models.identity import Customer, Operator, UserAccount, Workspace
from app.models.knowledge import DocumentEvent, KnowledgeChunk, KnowledgeDocument
from app.models.tickets import ConversationMessage, EscalationRecord, InternalNote, Ticket

__all__ = [
    "AuditEvent",
    "ConversationMessage",
    "Customer",
    "DocumentEvent",
    "EscalationRecord",
    "InternalNote",
    "KnowledgeChunk",
    "KnowledgeDocument",
    "Operator",
    "ProviderConfiguration",
    "ReplyDraft",
    "RetrievalRun",
    "RetrievedCitation",
    "SafetyEvent",
    "Ticket",
    "UserAccount",
    "Workspace",
]


def load_models() -> None:
    """Import side-effect for Alembic metadata."""
    return None
