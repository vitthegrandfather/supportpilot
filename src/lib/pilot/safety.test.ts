import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { csvSafe, escapeHtml, redactSecrets, sanitizeFilename, SlidingWindowLimiter, validateUpload } from "./safety.ts";
import { errorEnvelope, ApiError } from "./errors.ts";

describe("safety helpers", () => {
  it("sanitizes filenames and rejects disallowed types", () => {
    assert.equal(sanitizeFilename("../../etc/passwd.txt"), "passwd.txt");
    assert.ok(validateUpload("notes.exe", "application/octet-stream", 12));
    assert.equal(validateUpload("policy.md", "text/markdown", 100), null);
  });
  it("escapes HTML and redacts secrets", () => {
    assert.equal(escapeHtml("<script>"), `\u0026lt;script\u0026gt;`);
    assert.match(redactSecrets("token=sk-abcdefghijklmnop"), /redacted/);
  });
  it("guards CSV formula injection", () => {
    assert.equal(csvSafe("=CMD()"), "'=CMD()");
  });
  it("rate-limits a sliding window", () => {
    const lim = new SlidingWindowLimiter(2, 1000);
    assert.equal(lim.allow("a", 0), true);
    assert.equal(lim.allow("a", 1), true);
    assert.equal(lim.allow("a", 2), false);
    assert.equal(lim.allow("a", 2000), true);
  });
  it("builds error envelopes", () => {
    const { status, body } = errorEnvelope(
      new ApiError("insufficient_evidence", "The knowledge base does not contain enough evidence to draft a reliable answer.", 409),
      "req_test",
    );
    assert.equal(status, 409);
    assert.equal(body.error.code, "insufficient_evidence");
    assert.equal(body.error.request_id, "req_test");
  });
});
