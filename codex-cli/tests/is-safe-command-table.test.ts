import { describe, it, expect } from "vitest";
import { isSafeCommand } from "../src/approvals.js";

// ---------------------------------------------------------------------------
// E3 regression fixture — isSafeCommand expectation table.
//
// This function is an auto-approval allow-list: anything it blesses runs
// without asking the user. A table makes the full contract legible in one
// place, and — more importantly — pins the negative cases. Silent widening of
// this allow-list is the failure mode that matters; upstream shipped a fix for
// exactly that (`find -exec` was auto-approved).
// ---------------------------------------------------------------------------

type Row = { command: Array<string>; safe: boolean; note: string };

const TABLE: Array<Row> = [
  // --- plainly read-only ---------------------------------------------------
  { command: ["ls"], safe: true, note: "list directory" },
  { command: ["ls", "-la"], safe: true, note: "list with flags" },
  { command: ["pwd"], safe: true, note: "print working directory" },
  { command: ["cd", "src"], safe: true, note: "change directory" },
  { command: ["true"], safe: true, note: "no-op" },
  { command: ["echo", "hello"], safe: true, note: "echo" },
  { command: ["cat", "file.txt"], safe: true, note: "read file" },
  { command: ["head", "-n", "5", "f"], safe: true, note: "file head" },
  { command: ["tail", "-n", "5", "f"], safe: true, note: "file tail" },
  { command: ["wc", "-l", "f"], safe: true, note: "word count" },
  { command: ["which", "node"], safe: true, note: "locate command" },
  { command: ["grep", "-n", "foo", "f"], safe: true, note: "grep" },
  { command: ["rg", "foo"], safe: true, note: "ripgrep" },

  // --- git read-only subcommands ------------------------------------------
  { command: ["git", "status"], safe: true, note: "git status" },
  { command: ["git", "branch"], safe: true, note: "git branch" },
  { command: ["git", "log"], safe: true, note: "git log" },
  { command: ["git", "diff"], safe: true, note: "git diff" },
  { command: ["git", "show"], safe: true, note: "git show" },

  // --- git mutations must NOT be auto-approved -----------------------------
  { command: ["git", "push"], safe: false, note: "git push mutates remote" },
  { command: ["git", "commit"], safe: false, note: "git commit writes" },
  { command: ["git", "reset", "--hard"], safe: false, note: "git reset" },
  { command: ["git", "checkout", "."], safe: false, note: "git checkout" },

  // --- find: safe only without process-spawning / writing options ----------
  { command: ["find", ".", "-name", "*.ts"], safe: true, note: "plain find" },
  {
    command: ["find", ".", "-exec", "rm", "{}", ";"],
    safe: false,
    note: "-exec spawns processes",
  },
  {
    command: ["find", ".", "-execdir", "sh", "-c", "x"],
    safe: false,
    note: "-execdir spawns processes",
  },
  { command: ["find", ".", "-delete"], safe: false, note: "-delete removes" },
  {
    command: ["find", ".", "-ok", "rm", "{}"],
    safe: false,
    note: "-ok spawns",
  },
  {
    command: ["find", ".", "-fprint", "out.txt"],
    safe: false,
    note: "-fprint writes a file",
  },

  // --- sed: only the narrow print-subset form ------------------------------
  { command: ["sed", "-n", "1,5p", "f"], safe: true, note: "sed print range" },
  { command: ["sed", "-n", "3p", "f"], safe: true, note: "sed print line" },
  {
    command: ["sed", "-i", "s/a/b/", "f"],
    safe: false,
    note: "sed -i edits in place",
  },
  {
    command: ["sed", "-n", "1,5p", "f", "extra"],
    safe: false,
    note: "unexpected extra argument",
  },

  // --- cargo: only `check` -------------------------------------------------
  { command: ["cargo", "check"], safe: true, note: "cargo check" },
  { command: ["cargo", "run"], safe: false, note: "cargo run executes" },

  // --- outright dangerous / unknown ---------------------------------------
  { command: ["rm", "-rf", "/"], safe: false, note: "destructive" },
  { command: ["curl", "http://x"], safe: false, note: "network egress" },
  { command: ["bash", "-c", "echo hi"], safe: false, note: "arbitrary shell" },
  { command: ["node", "script.js"], safe: false, note: "arbitrary runtime" },
  { command: ["unknown-binary"], safe: false, note: "unknown command" },
];

describe("isSafeCommand – expectation table", () => {
  for (const { command, safe, note } of TABLE) {
    const label = command.join(" ");
    it(`${
      safe ? "auto-approves" : "withholds approval for"
    } \`${label}\` (${note})`, () => {
      const result = isSafeCommand(command);
      if (safe) {
        expect(result, `expected \`${label}\` to be safe`).not.toBeNull();
        expect(typeof result?.reason).toBe("string");
        expect(typeof result?.group).toBe("string");
      } else {
        expect(result, `expected \`${label}\` NOT to be safe`).toBeNull();
      }
    });
  }
});
