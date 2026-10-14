import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateNeonPair } from "../scripts/check-neon-config.mjs";

const pooled = "postgresql://user:secret@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require";
const direct = "postgresql://user:secret@ep-example.us-east-2.aws.neon.tech/neondb?sslmode=require";
describe("Neon environment settings (without connecting)", () => {
  it("accepts matching pooled and direct endpoints", () => {
    assert.deepEqual(validateNeonPair(pooled, direct), []);
  });
  it("rejects absent, mismatched, or insecure URLs", () => {
    assert.ok(validateNeonPair("", direct).length > 0);
    assert.ok(validateNeonPair(direct, pooled).length > 0);
    assert.ok(validateNeonPair(pooled, direct.replace("ep-example.", "ep-other.")).length > 0);
    assert.ok(validateNeonPair(pooled.replace("sslmode=require", "sslmode=disable"), direct).length > 0);
  });
  it("rejects shadow DB pointing at the same Neon endpoint", () => {
    assert.ok(validateNeonPair(pooled, direct, { shadow: direct }).length > 0);
    assert.deepEqual(validateNeonPair(pooled, direct, {
      shadow: "postgresql://user:secret@ep-shadow.us-east-2.aws.neon.tech/neondb?sslmode=require",
    }), []);
  });
});
