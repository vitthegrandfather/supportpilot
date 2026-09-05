import type { Category, ClassificationResult, Priority, Sentiment } from "../types";
import { detectPromptInjection } from "./injection";
import { tokenize } from "./tokenize";

const CATEGORY_TERMS: Record<Category, string[]> = {
  billing: ["charge", "charged", "invoice", "refund", "billing", "payment", "subscription", "annual", "plan", "duplicate", "credit card"],
  account_access: ["password", "login", "sign in", "locked", "2fa", "mfa", "access", "reset"],
  integrations: ["webhook", "api", "zapier", "slack", "integration", "oauth", "sync"],
  privacy: ["gdpr", "delete my data", "erasure", "export", "dsar", "privacy", "personal data"],
  security: ["owner", "ownership", "takeover", "compromised", "phishing", "hacked", "transfer account"],
  outage: ["outage", "production down", "service is down", "unavailable", "status page", "sev1"],
  product: ["feature", "roadmap", "would be nice", "request", "enhancement"],
  cancellation: ["cancel", "cancellation", "close my account", "unsubscribe"],
  other: [],
};

export function classifyTicket(subject: string, body: string): ClassificationResult {
  const text = `${subject}\n${body}`.toLowerCase();
  const tokens = new Set(tokenize(text, true));
  const scores = Object.entries(CATEGORY_TERMS).map(([cat, terms]) => {
    let s = 0;
    for (const term of terms) {
      if (text.includes(term)) s += term.split(" ").length + 1;
    }
    return { category: cat as Category, s };
  });
  scores.sort((a, b) => b.s - a.s);
  const category = scores[0].s > 0 ? scores[0].category : "other";

  let sentiment: Sentiment = "neutral";
  if (/(angry|unacceptable|furious|worst|ridiculous|frustrated|second time)/.test(text)) {
    sentiment = "frustrated";
  } else if (/(please help|issue|problem|cannot|can't|failed|wrong)/.test(text)) {
    sentiment = "negative";
  } else if (/(thanks|thank you|appreciate)/.test(text)) {
    sentiment = "positive";
  }

  let urgency: ClassificationResult["urgency"] = "medium";
  if (/(urgent|immediately|right now|production down|cannot access|locked out|gdpr|security|hacked)/.test(text)) {
    urgency = "high";
  } else if (/(whenever|no rush|curious|wondering)/.test(text)) {
    urgency = "low";
  }

  let suggestedPriority: Priority = "normal";
  if (category === "outage" || category === "security" || urgency === "high") suggestedPriority = "urgent";
  else if (category === "privacy" || category === "billing" || sentiment === "frustrated") suggestedPriority = "high";
  else if (category === "product") suggestedPriority = "low";

  const safetyFlags: string[] = [];
  const inj = detectPromptInjection(`${subject}\n${body}`);
  if (inj.matched) safetyFlags.push("prompt_injection_in_customer_message");
  if (category === "security") safetyFlags.push("security_sensitive");
  if (category === "privacy") safetyFlags.push("privacy_request");
  if (/(ssn|social security|passport|password is|credit card number)/.test(text)) {
    safetyFlags.push("possible_credential_in_message");
  }
  if (tokens.has("owner") || text.includes("ownership")) safetyFlags.push("account_ownership_change");

  const reasoning = `Matched ${category.replace("_", " ")} language with ${sentiment} sentiment and ${urgency} urgency. Priority suggestion follows policy: security, outage, and identity changes default to urgent review.`;

  return {
    category,
    sentiment,
    urgency,
    suggestedPriority,
    reasoning,
    safetyFlags,
  };
}
