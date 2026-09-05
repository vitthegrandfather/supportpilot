import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  canApprove,
  canEdit,
  canSimulatedSend,
  draftStateLabel,
  isLowConfidenceEscalation,
  nextStateOnEdit,
  parseCitationMarkers,
} from "./draft-flow.ts";

describe("draft generation state", () => {
  it("labels generated vs edited vs approved vs simulated sent", () => {
    assert.equal(draftStateLabel("generated"), "AI-generated draft");
    assert.equal(draftStateLabel("edited"), "Human-edited draft");
    assert.equal(draftStateLabel("approved"), "Approved reply");
    assert.equal(draftStateLabel("simulated_sent"), "Simulated sent reply");
  });
  it("allows edit then approve then simulated send", () => {
    assert.equal(canEdit("generated"), true);
    assert.equal(nextStateOnEdit("generated"), "edited");
    assert.equal(canApprove("edited", false), true);
    assert.equal(canSimulatedSend("edited"), false);
    assert.equal(canSimulatedSend("approved"), true);
  });
  it("blocks approval when evidence is insufficient", () => {
    assert.equal(canApprove("generated", true), false);
    assert.equal(canApprove("blocked", false), false);
  });
});

describe("citation opening", () => {
  it("extracts unique citation markers from a grounded body", () => {
    const body = "Reversal posts within five business days. [1]\nCompare processor IDs. [2]\nSee [1] again.";
    assert.deepEqual(parseCitationMarkers(body), [1, 2]);
  });
});

describe("low-confidence escalation", () => {
  it("detects the low-confidence / insufficient-evidence path", () => {
    assert.equal(isLowConfidenceEscalation(0.31, true, true), true);
    assert.equal(isLowConfidenceEscalation(0.91, false, false), false);
  });
});
