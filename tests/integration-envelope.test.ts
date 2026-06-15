import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Pure module: no DB/native deps, so it loads safely under `node --test`
// type-stripping. Import with the explicit .ts extension like the other tests.
import { applyEnvelopeTemplate } from "../src/lib/integration-envelope.ts";

describe("applyEnvelopeTemplate", () => {
  it("substitutes both {FILENAME} and {PAYLOAD}", () => {
    const out = applyEnvelopeTemplate(
      "<Doc><FileName>{FILENAME}</FileName><Content>{PAYLOAD}</Content></Doc>",
      { payload: "<x/>", filename: "inv-20260615.xml" },
    );
    assert.equal(
      out,
      "<Doc><FileName>inv-20260615.xml</FileName><Content><x/></Content></Doc>",
    );
  });

  it("defaults an empty template to the payload (content only)", () => {
    assert.equal(applyEnvelopeTemplate("", { payload: "BODY", filename: "f.xml" }), "BODY");
  });

  it("replaces every occurrence of a token", () => {
    assert.equal(
      applyEnvelopeTemplate("{FILENAME}|{FILENAME}|{PAYLOAD}", { payload: "P", filename: "F" }),
      "F|F|P",
    );
  });

  it("leaves unrelated text and unknown tokens intact", () => {
    assert.equal(
      applyEnvelopeTemplate("a {UNKNOWN} {PAYLOAD}", { payload: "P", filename: "F" }),
      "a {UNKNOWN} P",
    );
  });

  it("does not re-substitute token literals contained in the inserted values", () => {
    // Single-pass: filename containing {PAYLOAD} and payload containing {FILENAME}
    // must each be inserted verbatim, not re-scanned.
    assert.equal(
      applyEnvelopeTemplate("{FILENAME}::{PAYLOAD}", { payload: "{FILENAME}", filename: "{PAYLOAD}" }),
      "{PAYLOAD}::{FILENAME}",
    );
  });
});
