# Security Policy

## Scope and status

This repository is a personal maintenance fork of
[`ymichael/open-codex`](https://github.com/ymichael/open-codex), which is itself
a fork of the original OpenAI Codex CLI. Upstream is no longer maintained.

**Reports about this fork do not reach OpenAI.** The previous `SECURITY` contact
(`security@openai.com`) was inherited from the original project and is not an
appropriate destination for issues in this codebase.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/brilante/open-codex/security/advisories/new)
on this repository. Please do not open a public issue for an exploitable defect.

This is a personal project maintained on a best-effort basis. There is no
response-time guarantee and no bug bounty.

## Threat model you should assume

This tool executes model-authored shell commands on your machine. That is its
purpose, not a defect. The safety boundary is the **approval mode**:

| Mode                | Behaviour                                                          |
| ------------------- | ------------------------------------------------------------------ |
| `suggest` (default) | Every command is shown and requires approval.                      |
| `auto-edit`         | File edits are applied automatically; commands still prompt.       |
| `full-auto`         | Commands run without prompting, inside a sandbox where one exists. |

Sandbox availability is **platform-dependent**:

- **macOS** — commands run under Seatbelt (`sandbox-exec`).
- **Linux** — there is no sandbox implementation. `full-auto` is refused unless
  you are inside a container or you set `CODEX_UNSAFE_ALLOW_NO_SANDBOX=1`.
- **Windows** — no sandbox; commands run unconfined.

Treat `full-auto` outside a container as equivalent to running an unreviewed
script with your own privileges. Prefer
`./codex-cli/scripts/run_in_container.sh` for unattended work.

## Handling of your data

Prompts, file contents, and command output are sent to whichever provider you
configure (`openai`, `gemini`, `openrouter`, `xai`, or a local `ollama`
instance). Retention and training policies are the provider's, not this
project's — consult their terms. Running against a local `ollama` endpoint keeps
data on your machine.

API keys are read from environment variables and are never written to the
repository or transmitted anywhere other than the configured provider endpoint.

## Dependency posture

CI fails the build if any dependency shipped at runtime carries a known
advisory (`npm audit --omit=dev`). Advisories confined to the development
toolchain are reported but do not block, since they are not distributed to
users.
