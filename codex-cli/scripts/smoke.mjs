#!/usr/bin/env node
/**
 * E2 smoke scenarios.
 *
 * Two tiers:
 *
 *   offline (default) — no API key, no network. Exercises the built CLI binary
 *                       end to end: it starts, prints help, reports its real
 *                       version, and rejects an unknown provider. Safe for CI.
 *
 *   --provider <name> — additionally performs one real round trip. This is the
 *                       check that catches a retired default model, which no
 *                       amount of unit testing can detect. `ollama` needs no
 *                       key and no egress, so it is the cheapest live tier.
 *
 * Usage:
 *   node scripts/smoke.mjs
 *   node scripts/smoke.mjs --provider ollama --model qwen2.5-coder
 *   node scripts/smoke.mjs --provider ollama --model my-model \
 *     --base-url http://127.0.0.1:1234/v1
 *
 * `--base-url` retargets the `ollama` provider at any OpenAI-compatible
 * endpoint (LM Studio, llama.cpp, vLLM, a remote gateway). Being able to name
 * the endpoint on the command line is what makes this reusable from CI and
 * from a scheduled job, which is the whole point of scripting the scenario.
 */
import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = join(HERE, "..");
const CLI_ENTRY = join(CLI_ROOT, "dist", "cli.js");

const pkg = JSON.parse(readFileSync(join(CLI_ROOT, "package.json"), "utf8"));

const args = process.argv.slice(2);
function flag(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? "PASS" : "FAIL";
  // eslint-disable-next-line no-console
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(cliArgs, { timeoutMs = 30_000, env = {} } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...cliArgs], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

async function main() {
  if (!existsSync(CLI_ENTRY)) {
    record("build present", false, `${CLI_ENTRY} missing — run \`npm run build\``);
    process.exit(1);
  }
  record("build present", true, CLI_ENTRY);

  // --- 1. help renders and documents the corrected provider alias ----------
  const help = await run(["--help"]);
  const helpText = help.stdout + help.stderr;
  record(
    "help renders",
    helpText.includes("Usage") && helpText.includes("--provider"),
    `exit=${help.code}`,
  );
  record(
    "provider alias documented as -p",
    /-p,\s*--provider/.test(helpText),
    "regression guard for the inherited `-m --provider` typo",
  );
  record(
    "help does not advertise a retired default model",
    !/o4-mini|(?<![\w.])o3(?![\w.])/.test(helpText),
    "retired identifiers must not reappear in docs",
  );

  // --- 2. version reflects package.json (single source) --------------------
  const version = await run(["--version"]);
  const versionText = (version.stdout + version.stderr).trim();
  record(
    "version matches package.json",
    versionText.includes(pkg.version),
    `expected ${pkg.version}, got ${versionText.split("\n")[0] || "(empty)"}`,
  );

  // --- 3. quiet mode with an unknown provider fails loudly, not silently ---
  const badProvider = await run(
    ["--provider", "definitely-not-a-provider", "--quiet", "say hi"],
    { env: { OPENAI_API_KEY: "" } },
  );
  record(
    "unknown provider is rejected",
    badProvider.code !== 0,
    `exit=${badProvider.code}`,
  );

  // --- 4. optional live round trip ----------------------------------------
  const provider = flag("--provider");
  if (provider) {
    const model = flag("--model");
    const baseUrl = flag("--base-url");
    const liveArgs = ["--provider", provider, "--quiet"];
    if (model) {
      liveArgs.push("--model", model);
    }
    liveArgs.push("Reply with exactly the word: pong");

    // The CLI resolves a provider's endpoint internally; OLLAMA_BASE_URL is
    // its documented override for OpenAI-compatible local servers.
    const liveEnv = baseUrl ? { OLLAMA_BASE_URL: baseUrl } : {};
    if (baseUrl) {
      // eslint-disable-next-line no-console
      console.log(`       (endpoint: ${baseUrl})`);
    }

    const live = await run(liveArgs, { timeoutMs: 120_000, env: liveEnv });
    const out = (live.stdout + live.stderr).toLowerCase();
    record(
      `live round trip via ${provider}`,
      live.code === 0 && out.includes("pong"),
      `exit=${live.code}`,
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      "[SKIP] live round trip — pass `--provider ollama` to exercise a real model",
    );
  }

  const failed = results.filter((r) => !r.ok);
  // eslint-disable-next-line no-console
  console.log(
    `\n${results.length - failed.length}/${results.length} smoke checks passed`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main();
