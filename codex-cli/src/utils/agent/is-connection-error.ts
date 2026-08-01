import { APIConnectionError } from "openai";

/**
 * Transport-level errno values surfaced by Node's networking stack.
 */
export const NETWORK_ERRNOS: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
]);

/**
 * Error class names the OpenAI SDK uses for connection failures.
 *
 * `APIConnectionTimeoutError` extends `APIConnectionError`, so an `instanceof`
 * test against the base class already covers it; the names are only consulted
 * by the structural fallback below.
 */
const CONNECTION_ERROR_NAMES: ReadonlySet<string> = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
]);

/**
 * `instanceof` that cannot throw.
 *
 * The constructor is `undefined` whenever a test substitutes a minimal mock for
 * the `openai` module, and `x instanceof undefined` is a TypeError.
 */
function isInstanceOfSafely(error: unknown, ctor: unknown): boolean {
  if (typeof ctor !== "function") {
    return false;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return error instanceof (ctor as new (...args: any) => Error);
  } catch {
    return false;
  }
}

/**
 * Structural fallback for cases where `instanceof` cannot work:
 *
 *  - the process resolved two copies of the `openai` package, so the thrown
 *    error's prototype chain points at a *different* class object;
 *  - a test threw a lightweight stub that only sets `name`.
 */
function hasConnectionErrorName(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    name?: unknown;
    constructor?: { name?: unknown };
  };

  // Check both signals rather than preferring one. A subclass declared as
  // `class Foo extends Error {}` without assigning `this.name` inherits the
  // string "Error" from Error.prototype, so keying off `name` alone would mask
  // the constructor name and miss the duplicate-install case entirely.
  return [candidate.name, candidate.constructor?.name].some(
    (name) => typeof name === "string" && CONNECTION_ERROR_NAMES.has(name),
  );
}

/**
 * True when `error` is a connection failure raised by the OpenAI SDK.
 *
 * This replaces an earlier inline lookup of `(OpenAI as any).APIConnectionError`
 * that resolved the class lazily and fell back to `false` when the export was
 * missing. That fallback made the failure silent: whenever the export moved —
 * as it does across SDK majors — every connection error was classified as
 * non-retryable and the retry loop stopped working with no diagnostic. Pulling
 * the class in as a real import means a future move becomes a build error, and
 * the structural fallback keeps the predicate correct for duplicated installs
 * and test stubs.
 */
export function isConnectionError(error: unknown): boolean {
  return (
    isInstanceOfSafely(error, APIConnectionError) ||
    hasConnectionErrorName(error)
  );
}

/**
 * True when `error` carries a transport-level errno, either directly or nested
 * under `cause` (the SDK wraps the underlying socket failure there).
 */
export function hasNetworkErrno(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; cause?: unknown };

  if (
    typeof candidate.code === "string" &&
    NETWORK_ERRNOS.has(candidate.code)
  ) {
    return true;
  }

  if (candidate.cause && typeof candidate.cause === "object") {
    const causeCode = (candidate.cause as { code?: unknown }).code;
    if (typeof causeCode === "string" && NETWORK_ERRNOS.has(causeCode)) {
      return true;
    }
  }

  return false;
}
