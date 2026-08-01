import { describe, it, expect } from "vitest";
import {
  UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR,
  checkLinuxUnsandboxedExecution,
  isUnsafeOptInEnabled,
} from "../src/utils/agent/sandbox/no-sandbox-guard.js";

// ---------------------------------------------------------------------------
// Guards the C4 "safe defaults" rule: on Linux there is no sandbox
// implementation, so full-auto must not run unisolated by accident.
//
// The decision is a pure function of two facts, which keeps this test free of
// filesystem and environment stubbing.
// ---------------------------------------------------------------------------

describe("checkLinuxUnsandboxedExecution", () => {
  it("blocks on a bare Linux host with no opt-in", () => {
    const decision = checkLinuxUnsandboxedExecution({
      containerized: false,
      optIn: false,
    });

    expect(decision.allowed).toBe(false);
    // The message has to be actionable — it is the only thing the user sees.
    if (!decision.allowed) {
      expect(decision.message).toContain(UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR);
      expect(decision.message).toMatch(/approval-mode/);
    }
  });

  it("allows inside a container", () => {
    expect(
      checkLinuxUnsandboxedExecution({ containerized: true, optIn: false })
        .allowed,
    ).toBe(true);
  });

  it("allows when the operator opted in explicitly", () => {
    expect(
      checkLinuxUnsandboxedExecution({ containerized: false, optIn: true })
        .allowed,
    ).toBe(true);
  });
});

describe("isUnsafeOptInEnabled", () => {
  const truthy = ["1", "true", "TRUE", "yes", "on", " 1 "];
  const falsy = [undefined, "", "0", "false", "no", "off", "maybe"];

  for (const value of truthy) {
    it(`treats ${JSON.stringify(value)} as opt-in`, () => {
      expect(
        isUnsafeOptInEnabled({
          [UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR]: value,
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    });
  }

  for (const value of falsy) {
    it(`does not treat ${JSON.stringify(value)} as opt-in`, () => {
      const env = (
        value === undefined ? {} : { [UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR]: value }
      ) as NodeJS.ProcessEnv;
      expect(isUnsafeOptInEnabled(env)).toBe(false);
    });
  }
});
