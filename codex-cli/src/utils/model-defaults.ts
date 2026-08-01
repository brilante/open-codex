/**
 * Single source of truth for per-provider model defaults.
 *
 * ## Why this file exists
 *
 * Model identifiers have a shorter lifespan than release cycles. The previous
 * design hardcoded them in two unrelated places — a `switch` in `config.ts` and
 * a `RECOMMENDED_MODELS` array in `model-utils.ts` — so a provider retiring a
 * model turned into a broken CLI that could only be fixed by shipping a new
 * version. By the time this file was written the shipped defaults (`o4-mini`,
 * `o3`, `gemini-2.5-pro-preview-03-25`, `grok-3-mini-beta`) had already been
 * retired or withdrawn.
 *
 * The fix is not "update the strings" — that just restarts the same clock. The
 * fix is that **the built-in table is a last resort**, overridable from
 * `~/.codex/config.json` without touching code:
 *
 * ```json
 * {
 *   "models": {
 *     "openai": { "agentic": "gpt-5.3-codex", "fullContext": "gpt-5.6-sol" }
 *   }
 * }
 * ```
 *
 * Resolution order: `--model` flag → stored `model` → stored `models.<provider>`
 * → this table.
 */

export type ProviderModelDefaults = {
  /** Model used for the interactive, tool-calling agent loop. */
  agentic: string;
  /** Model used for whole-repo / single-pass mode. */
  fullContext: string;
  /**
   * Models surfaced at the top of the picker. Kept alongside the defaults so
   * there is exactly one list per provider to maintain.
   */
  recommended: Array<string>;
};

/** Per-provider overrides as they may appear in `~/.codex/config.json`. */
export type ModelDefaultsOverrides = Partial<
  Record<string, Partial<ProviderModelDefaults>>
>;

const EMPTY_DEFAULTS: ProviderModelDefaults = {
  agentic: "",
  fullContext: "",
  recommended: [],
};

/**
 * Last-resort defaults, verified against provider documentation on 2026-08-01.
 *
 * Treat every value here as perishable. If a provider is missing or its entry
 * is empty the CLI asks the user to pick a model rather than guessing — a
 * prompt is a better failure than a confusing 404 from a retired model.
 */
export const BUILT_IN_MODEL_DEFAULTS: Readonly<
  Record<string, ProviderModelDefaults>
> = {
  openai: {
    agentic: "gpt-5.3-codex",
    fullContext: "gpt-5.6-sol",
    recommended: [
      "gpt-5.3-codex",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.4-mini",
    ],
  },
  gemini: {
    agentic: "gemini-3.6-flash",
    fullContext: "gemini-3.6-flash",
    recommended: ["gemini-3.6-flash", "gemini-3.5-flash-lite"],
  },
  openrouter: {
    agentic: "openai/gpt-5.3-codex",
    fullContext: "openai/gpt-5.6-sol",
    recommended: ["openai/gpt-5.3-codex", "openai/gpt-5.6-sol"],
  },
  // Deliberately empty: the exact xAI identifier strings could not be verified
  // at the time of writing, and a wrong identifier produces a worse experience
  // than an explicit prompt to choose one. Set `models.xai` in config.json.
  xai: EMPTY_DEFAULTS,
  // Ollama serves whatever the user has pulled locally; there is no sensible
  // universal default. `getAvailableModels()` discovers the real list.
  ollama: EMPTY_DEFAULTS,
};

/**
 * Resolve the defaults for `provider`, layering any user overrides on top of
 * the built-in table. Unknown providers resolve to empty strings, which the
 * caller surfaces as "pick a model" rather than a bogus request.
 */
export function resolveModelDefaults(
  provider: string | undefined,
  overrides?: ModelDefaultsOverrides,
): ProviderModelDefaults {
  const key = (provider ?? "").toLowerCase();
  const builtIn = BUILT_IN_MODEL_DEFAULTS[key] ?? EMPTY_DEFAULTS;
  const override = overrides?.[key];

  if (!override) {
    return builtIn;
  }

  return {
    agentic: override.agentic || builtIn.agentic,
    fullContext: override.fullContext || builtIn.fullContext,
    recommended:
      override.recommended && override.recommended.length > 0
        ? override.recommended
        : builtIn.recommended,
  };
}

/**
 * Timeout for the `/models` listing used to validate a model identifier.
 *
 * Was a hardcoded 2s, which is under the cold-start latency of some
 * OpenAI-compatible providers; on a timeout the list came back empty and the
 * CLI reported a valid model as unknown. Configurable so a slow provider is a
 * settings change, not a patch release.
 */
export const DEFAULT_MODEL_LIST_TIMEOUT_MS = 5_000;

export function getModelListTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env["CODEX_MODEL_LIST_TIMEOUT_MS"];
  const parsed = raw == null ? NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MODEL_LIST_TIMEOUT_MS;
}
