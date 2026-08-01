import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// E3 regression fixture — streaming tool_call accumulation.
//
// A tool call does not arrive whole. The provider streams it as a sequence of
// deltas whose `function.name` and `function.arguments` fragments must be
// concatenated in order. This is the thinnest-covered, highest-consequence
// path in the agent loop: if accumulation breaks, the model's command is
// silently truncated and a *different* command runs.
//
// Two provider dialects are pinned:
//
//   "openai"  – `type: "function"` present on the opening delta only.
//   "bare"    – `type` never sent at all. Ollama and OpenRouter behave this
//               way, and it is the case that breaks if an SDK migration
//               introduces a `type === "function"` narrowing to satisfy the v7
//               union. Such a narrowing compiles cleanly and then drops every
//               fragment, so only a fixture catches it.
// ---------------------------------------------------------------------------

type Dialect = "openai" | "bare";

/** Fragments that together spell `shell` / `{"cmd":["echo","hi"]}`. */
function buildChunks(dialect: Dialect): Array<any> {
  const opening: any = {
    id: "call_stream_acc",
    function: { name: "sh", arguments: '{"cmd":["echo",' },
  };
  if (dialect === "openai") {
    opening.type = "function";
  }

  return [
    {
      choices: [{ delta: { role: "assistant", tool_calls: [opening] } }],
    },
    {
      choices: [
        {
          delta: {
            tool_calls: [{ function: { name: "ell", arguments: '"hi"]' } }],
          },
        },
      ],
    },
    {
      choices: [{ delta: { tool_calls: [{ function: { arguments: "}" } }] } }],
    },
    {
      choices: [{ delta: {}, finish_reason: "tool_calls" }],
    },
  ];
}

const streamState: { dialect: Dialect } = { dialect: "openai" };

vi.mock("openai", () => {
  let invocation = 0;

  class FakeOpenAI {
    public chat = {
      completions: {
        create: async () => {
          invocation += 1;
          if (invocation % 2 === 1) {
            const chunks = buildChunks(streamState.dialect);
            return new (class {
              public controller = { abort: vi.fn() };
              async *[Symbol.asyncIterator]() {
                for (const chunk of chunks) {
                  yield chunk;
                }
              }
            })();
          }
          // Even turns carry the tool result; nothing more to stream.
          return new (class {
            public controller = { abort: vi.fn() };
            async *[Symbol.asyncIterator]() {
              /* no items */
            }
          })();
        },
      },
    };
  }

  class APIConnectionError extends Error {}

  class APIConnectionTimeoutError extends APIConnectionError {}

  return {
    __esModule: true,
    default: FakeOpenAI,
    APIConnectionError,
    APIConnectionTimeoutError,
  };
});

// Capture what the exec layer is ultimately asked to run. This is the honest
// end of the chain: it only receives a well-formed command if every fragment
// was accumulated *and* the resulting JSON parsed.
const execState: { args?: any } = {};

vi.mock("../src/utils/agent/handle-exec-command.js", () => ({
  __esModule: true,
  handleExecCommand: async (args: any) => {
    execState.args = args;
    return { outputText: "hi", metadata: {} };
  },
}));

vi.mock("../src/approvals.js", () => ({
  __esModule: true,
  alwaysApprovedCommands: new Set<string>(),
  canAutoApprove: () => ({ type: "auto-approve", runInSandbox: false } as any),
  isSafeCommand: () => null,
}));

vi.mock("../src/format-command.js", () => ({
  __esModule: true,
  formatCommandForDisplay: (c: Array<string>) => c.join(" "),
}));

vi.mock("../src/utils/agent/log.js", () => ({
  __esModule: true,
  log: () => {},
  isLoggingEnabled: () => false,
}));

import { AgentLoop } from "../src/utils/agent/agent-loop.js";

async function runWithDialect(dialect: Dialect): Promise<any> {
  streamState.dialect = dialect;
  execState.args = undefined;

  const agent = new AgentLoop({
    model: "any",
    instructions: "",
    approvalPolicy: { mode: "auto" } as any,
    onItem: () => {},
    onLoading: () => {},
    getCommandConfirmation: async () => ({ review: "yes" } as any),
    onReset: () => {},
  });

  await agent.run([
    { role: "user", content: [{ type: "text", text: "run it" }] },
  ] as any);

  await new Promise((r) => setTimeout(r, 20));
  return execState.args;
}

describe("AgentLoop – streaming tool_call accumulation", () => {
  it("concatenates fragments when the provider sends type on the opening delta", async () => {
    const args = await runWithDialect("openai");

    // If any fragment were dropped the JSON would not parse and `cmd` would be
    // absent — a truncated command rather than a loud failure.
    expect(args).toBeDefined();
    expect(args?.cmd).toEqual(["echo", "hi"]);
  });

  it("concatenates fragments when the provider never sends type", async () => {
    const args = await runWithDialect("bare");

    expect(args).toBeDefined();
    expect(args?.cmd).toEqual(["echo", "hi"]);
  });
});
