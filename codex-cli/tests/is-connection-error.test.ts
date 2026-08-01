import { describe, it, expect } from "vitest";
import { APIConnectionError, APIConnectionTimeoutError } from "openai";
import {
  hasNetworkErrno,
  isConnectionError,
} from "../src/utils/agent/is-connection-error.js";

// ---------------------------------------------------------------------------
// Guards P4. The previous implementation resolved the SDK error class lazily
// and fell back to `false` when the export was missing, so a class move across
// an SDK major silently disabled every retry. These cases pin both the happy
// path and the duck-typed fallbacks that keep the predicate honest when
// `instanceof` cannot work.
// ---------------------------------------------------------------------------

describe("isConnectionError", () => {
  it("recognises a real APIConnectionError", () => {
    expect(isConnectionError(new APIConnectionError({ message: "boom" }))).toBe(
      true,
    );
  });

  it("recognises APIConnectionTimeoutError via its base class", () => {
    expect(isConnectionError(new APIConnectionTimeoutError({}))).toBe(true);
  });

  it("recognises a duplicate-install error by class name", () => {
    // Simulates a second copy of the SDK in node_modules: same shape, but a
    // different class object, so `instanceof` is false.
    class APIConnectionError2 extends Error {}
    Object.defineProperty(APIConnectionError2, "name", {
      value: "APIConnectionError",
    });
    const err = new APIConnectionError2("boom");
    expect(isConnectionError(err)).toBe(true);
  });

  it("recognises a stub that only sets name", () => {
    expect(isConnectionError({ name: "APIConnectionTimeoutError" })).toBe(true);
  });

  it("rejects unrelated errors and non-objects", () => {
    expect(isConnectionError(new Error("nope"))).toBe(false);
    expect(isConnectionError({ name: "TypeError" })).toBe(false);
    expect(isConnectionError(null)).toBe(false);
    expect(isConnectionError(undefined)).toBe(false);
    expect(isConnectionError("APIConnectionError")).toBe(false);
  });
});

describe("hasNetworkErrno", () => {
  it("detects a transport errno on the error itself", () => {
    expect(hasNetworkErrno({ code: "ECONNRESET" })).toBe(true);
    expect(hasNetworkErrno({ code: "ENOTFOUND" })).toBe(true);
  });

  it("detects a transport errno nested under cause", () => {
    expect(hasNetworkErrno({ cause: { code: "ECONNREFUSED" } })).toBe(true);
  });

  it("ignores unrelated codes and malformed shapes", () => {
    expect(hasNetworkErrno({ code: "ENOENT" })).toBe(false);
    expect(hasNetworkErrno({ cause: { code: "ENOENT" } })).toBe(false);
    expect(hasNetworkErrno({ cause: null })).toBe(false);
    expect(hasNetworkErrno({ code: 42 })).toBe(false);
    expect(hasNetworkErrno(null)).toBe(false);
  });
});
