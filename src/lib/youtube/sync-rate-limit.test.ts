import test from "node:test";
import assert from "node:assert/strict";
import { getPublicSyncRateLimit } from "./sync-rate-limit";

test("allows a public sync when the IP has no recent attempts", () => {
  const result = getPublicSyncRateLimit([], "2026-05-12T12:00:00.000Z");
  assert.equal(result.blocked, false);
  assert.equal(result.remainingAttempts, 2);
});

test("allows a second public sync within the window", () => {
  const result = getPublicSyncRateLimit(["2026-05-12T06:30:00.000Z"], "2026-05-12T12:00:00.000Z");
  assert.equal(result.blocked, false);
  assert.equal(result.remainingAttempts, 1);
});

test("blocks a third public sync within twelve hours for the same IP", () => {
  const result = getPublicSyncRateLimit(
    ["2026-05-12T01:00:00.000Z", "2026-05-12T06:30:00.000Z"],
    "2026-05-12T12:00:00.000Z"
  );
  assert.equal(result.blocked, true);
  assert.equal(result.retryAt, "2026-05-12T13:00:00.000Z");
});

test("drops attempts that are outside the twelve hour window", () => {
  const result = getPublicSyncRateLimit(
    ["2026-05-11T10:00:00.000Z", "2026-05-12T06:30:00.000Z"],
    "2026-05-12T12:00:00.000Z"
  );
  assert.equal(result.blocked, false);
  assert.equal(result.remainingAttempts, 1);
});
