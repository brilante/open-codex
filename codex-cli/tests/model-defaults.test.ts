import { describe, it, expect } from "vitest";
import {
  BUILT_IN_MODEL_DEFAULTS,
  DEFAULT_MODEL_LIST_TIMEOUT_MS,
  getModelListTimeoutMs,
  resolveModelDefaults,
} from "../src/utils/model-defaults.js";

// ---------------------------------------------------------------------------
// Guards P3. The defect was not "the model strings are wrong" but "the model
// strings can only be changed by shipping a release". These cases pin the
// override path, which is what actually prevents a recurrence.
// ---------------------------------------------------------------------------

describe("resolveModelDefaults", () => {
  it("returns the built-in defaults when no overrides are supplied", () => {
    const openai = resolveModelDefaults("openai");
    expect(openai.agentic).toBe(BUILT_IN_MODEL_DEFAULTS["openai"]?.agentic);
    expect(openai.agentic).not.toBe("");
  });

  it("lets config replace a retired model without a code change", () => {
    const resolved = resolveModelDefaults("openai", {
      openai: { agentic: "some-future-model" },
    });

    expect(resolved.agentic).toBe("some-future-model");
    // Unspecified fields still fall back to the built-ins.
    expect(resolved.fullContext).toBe(
      BUILT_IN_MODEL_DEFAULTS["openai"]?.fullContext,
    );
  });

  it("allows overriding the recommended list", () => {
    const resolved = resolveModelDefaults("openai", {
      openai: { recommended: ["only-this"] },
    });
    expect(resolved.recommended).toEqual(["only-this"]);
  });

  it("ignores empty overrides rather than blanking a default", () => {
    const resolved = resolveModelDefaults("openai", {
      openai: { agentic: "", recommended: [] },
    });
    expect(resolved.agentic).toBe(BUILT_IN_MODEL_DEFAULTS["openai"]?.agentic);
    expect(resolved.recommended.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on the provider key", () => {
    expect(resolveModelDefaults("OpenAI").agentic).toBe(
      resolveModelDefaults("openai").agentic,
    );
  });

  it("returns empty defaults for unknown providers instead of guessing", () => {
    const resolved = resolveModelDefaults("not-a-provider");
    expect(resolved.agentic).toBe("");
    expect(resolved.fullContext).toBe("");
    expect(resolved.recommended).toEqual([]);
  });

  it("supplies defaults for a provider the user configured themselves", () => {
    const resolved = resolveModelDefaults("xai", {
      xai: { agentic: "grok-x", fullContext: "grok-x" },
    });
    expect(resolved.agentic).toBe("grok-x");
  });

  it("does not ship known-retired identifiers", () => {
    // These were the shipped defaults and are all withdrawn or retired.
    const retired = [
      "o4-mini",
      "o3",
      "gemini-2.5-pro-preview-03-25",
      "grok-3-mini-beta",
    ];
    const shipped = Object.values(BUILT_IN_MODEL_DEFAULTS).flatMap((d) => [
      d.agentic,
      d.fullContext,
      ...d.recommended,
    ]);

    for (const dead of retired) {
      expect(shipped).not.toContain(dead);
    }
  });
});

describe("getModelListTimeoutMs", () => {
  it("defaults to a value above typical provider cold-start latency", () => {
    expect(getModelListTimeoutMs({})).toBe(DEFAULT_MODEL_LIST_TIMEOUT_MS);
    // The old hardcoded 2s was the bug; anything at or below it regresses.
    expect(DEFAULT_MODEL_LIST_TIMEOUT_MS).toBeGreaterThan(2_000);
  });

  it("honours the environment override", () => {
    expect(
      getModelListTimeoutMs({ CODEX_MODEL_LIST_TIMEOUT_MS: "12000" }),
    ).toBe(12_000);
  });

  it("falls back on malformed or non-positive values", () => {
    for (const bad of ["", "abc", "0", "-5"]) {
      expect(getModelListTimeoutMs({ CODEX_MODEL_LIST_TIMEOUT_MS: bad })).toBe(
        DEFAULT_MODEL_LIST_TIMEOUT_MS,
      );
    }
  });
});
