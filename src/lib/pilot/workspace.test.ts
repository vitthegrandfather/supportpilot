import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { DEMO_WORKSPACE_ID } from "./types.ts";

describe("workspace isolation contract", () => {
  it("uses a single demo workspace constant for preview queries", () => {
    assert.equal(DEMO_WORKSPACE_ID, "ws_heliodesk_demo");
  });
});
