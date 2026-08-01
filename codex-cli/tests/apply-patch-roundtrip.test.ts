import { describe, it, expect } from "vitest";
import { process_patch } from "../src/utils/agent/apply-patch.js";

// ---------------------------------------------------------------------------
// E3 regression fixture — apply_patch round-trip (metamorphic property).
//
// Rather than asserting one hand-written expected output, this pins an
// invariant: applying a patch and then applying its inverse must restore the
// original tree byte for byte. A round-trip catches asymmetric bugs (a stray
// trailing newline on write, an off-by-one in context matching) that a
// single-direction assertion happily accepts because both sides were written
// from the same mistaken understanding.
// ---------------------------------------------------------------------------

function createInMemoryFs(initial: Record<string, string>) {
  const files: Record<string, string> = { ...initial };
  return {
    files,
    openFn: (p: string): string => {
      const content = files[p];
      if (content === undefined) {
        throw new Error(`no such file: ${p}`);
      }
      return content;
    },
    writeFn: (p: string, c: string): void => {
      files[p] = c;
    },
    removeFn: (p: string): void => {
      delete files[p];
    },
  };
}

describe("apply_patch – round-trip", () => {
  it("restores the original content after applying the inverse update", () => {
    const original = { "a.txt": "alpha\nbravo\ncharlie" };
    const fs = createInMemoryFs(original);

    const forward = `*** Begin Patch
*** Update File: a.txt
@@
-bravo
+BRAVO
*** End Patch`;

    const inverse = `*** Begin Patch
*** Update File: a.txt
@@
-BRAVO
+bravo
*** End Patch`;

    process_patch(forward, fs.openFn, fs.writeFn, fs.removeFn);
    expect(fs.files["a.txt"]).toBe("alpha\nBRAVO\ncharlie");

    process_patch(inverse, fs.openFn, fs.writeFn, fs.removeFn);
    expect(fs.files).toEqual(original);
  });

  it("restores the original tree after add followed by delete", () => {
    const original = { "keep.txt": "untouched" };
    const fs = createInMemoryFs(original);

    const add = `*** Begin Patch
*** Add File: added.txt
+hello
+world
*** End Patch`;

    const remove = `*** Begin Patch
*** Delete File: added.txt
*** End Patch`;

    process_patch(add, fs.openFn, fs.writeFn, fs.removeFn);
    expect(fs.files["added.txt"]).toBe("hello\nworld");

    process_patch(remove, fs.openFn, fs.writeFn, fs.removeFn);
    expect(fs.files).toEqual(original);
  });

  it("leaves untouched files exactly as they were", () => {
    const original = {
      "a.txt": "alpha\nbravo",
      "untouched.txt": "do not rewrite me",
    };
    const fs = createInMemoryFs(original);

    const forward = `*** Begin Patch
*** Update File: a.txt
@@
-bravo
+delta
*** End Patch`;

    process_patch(forward, fs.openFn, fs.writeFn, fs.removeFn);

    expect(fs.files["untouched.txt"]).toBe("do not rewrite me");
  });
});
