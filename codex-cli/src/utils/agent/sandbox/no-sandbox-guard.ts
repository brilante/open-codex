import { access, readFile } from "fs/promises";

/**
 * Opt-in escape hatch for running `--full-auto` on a Linux host that offers no
 * kernel-level isolation.
 *
 * This is deliberately a *second* lock: the user must already have asked for
 * full-auto (which is what causes a sandbox to be requested) **and** set this
 * variable. Requiring two independent signals means neither a stray shell
 * alias nor a copy-pasted command line can silently disable the protection.
 */
export const UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR = "CODEX_UNSAFE_ALLOW_NO_SANDBOX";

const TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

/** Filesystem markers dropped by common container runtimes. */
const CONTAINER_MARKER_FILES = ["/.dockerenv", "/run/.containerenv"];

/** Runtime names that show up in PID 1's cgroup membership inside a container. */
const CONTAINER_CGROUP_PATTERN = /docker|containerd|kubepods|lxc|podman/i;

export function isUnsafeOptInEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env[UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR];
  return typeof raw === "string" && TRUTHY_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Best-effort detection of an OS-level container (Docker, Podman, Kubernetes,
 * LXC).
 *
 * Note this is intentionally *not* the same question as "am I on Linux".  The
 * original implementation probed for `/proc/1/cgroup` and treated a successful
 * read as proof of containment, but that file exists on every Linux system —
 * host included — so full-auto ran unisolated on bare-metal Linux.
 */
export async function isContainerized(): Promise<boolean> {
  const markerPresence = await Promise.all(
    CONTAINER_MARKER_FILES.map((marker) =>
      access(marker).then(
        () => true,
        () => false,
      ),
    ),
  );
  if (markerPresence.some(Boolean)) {
    return true;
  }

  try {
    const cgroup = await readFile("/proc/1/cgroup", "utf8");
    return CONTAINER_CGROUP_PATTERN.test(cgroup);
  } catch {
    return false;
  }
}

export type SandboxDecision =
  | { allowed: true }
  | { allowed: false; message: string };

/**
 * Decide whether unsandboxed full-auto execution may proceed on Linux.
 *
 * Pure function of the two facts that matter so it can be exercised directly
 * by tests without touching the real filesystem or environment.
 */
export function checkLinuxUnsandboxedExecution(args: {
  containerized: boolean;
  optIn: boolean;
}): SandboxDecision {
  if (args.containerized || args.optIn) {
    return { allowed: true };
  }

  return {
    allowed: false,
    message: [
      "Refusing to run in full-auto without a sandbox.",
      "",
      "This host is Linux and does not appear to be inside a container, and no",
      "kernel-level sandbox (such as macOS Seatbelt) is available here. Running",
      "model-authored commands with automatic approval would give them",
      "unrestricted access to your machine.",
      "",
      "Choose one of:",
      "  1. Run inside the provided container:  ./codex-cli/scripts/run_in_container.sh",
      "  2. Use a safer approval mode:          --approval-mode suggest  (or auto-edit)",
      `  3. Accept the risk explicitly:         ${UNSAFE_ALLOW_NO_SANDBOX_ENV_VAR}=1 codex --full-auto ...`,
    ].join("\n"),
  };
}
