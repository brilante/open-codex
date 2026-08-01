import packageJson from "../../package.json";

/**
 * Single source of truth for the version.
 *
 * This used to be a literal carrying the comment "Must be in sync with
 * package.json" — a rule with nothing enforcing it, kept in step by a release
 * script that asked the agent to edit both files. Reading package.json removes
 * the possibility of drift instead of documenting it.
 */
export const CLI_VERSION: string = packageJson.version;
export const ORIGIN = "codex_cli_ts";

export type TerminalChatSession = {
  /** Globally unique session identifier */
  id: string;
  /** The OpenAI username associated with this session */
  user: string;
  /** Version identifier of the Codex CLI that produced the session */
  version: string;
  /** The model used for the conversation */
  model: string;
  /** ISO timestamp noting when the session was persisted */
  timestamp: string;
  /** Optional custom instructions that were active for the run */
  instructions: string;
};

let sessionId = "";

/**
 * Update the globally tracked session identifier.
 * Passing an empty string clears the current session.
 */
export function setSessionId(id: string): void {
  sessionId = id;
}

/**
 * Retrieve the currently active session identifier, or an empty string when
 * no session is active.
 */
export function getSessionId(): string {
  return sessionId;
}

let currentModel = "";

/**
 * Record the model that is currently being used for the conversation.
 * Setting an empty string clears the record so the next agent run can update it.
 */
export function setCurrentModel(model: string): void {
  currentModel = model;
}

/**
 * Return the model that was last supplied to {@link setCurrentModel}.
 * If no model has been recorded yet, an empty string is returned.
 */
export function getCurrentModel(): string {
  return currentModel;
}
