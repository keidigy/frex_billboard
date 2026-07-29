import test from "node:test";
import assert from "node:assert/strict";
import { mustResetPassword } from "../src/lib/password-reset.ts";

test("mustResetPassword requires an explicit reset flag", () => {
  assert.equal(mustResetPassword({ password_reset_required: 1 }), true);
  assert.equal(mustResetPassword({ password_reset_required: 0 }), false);
  assert.equal(mustResetPassword({ password_reset_required: null as unknown as number }), false);
});
