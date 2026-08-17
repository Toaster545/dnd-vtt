import assert from "node:assert/strict";
import test from "node:test";
import { compileSvg, validatePackManifest } from "./compile-lib.mjs";

const manifest = validatePackManifest({
  id: "test-pack",
  version: 1,
  label: "Test Pack",
  enabled: true,
  viewBox: "0 0 100 100",
  colorSlots: ["skin"],
  colors: [
    { id: "skin", label: "Skin", default: "#ffffff", palette: ["#ffffff"] },
  ],
  categories: [
    {
      id: "face",
      label: "Face",
      minSelections: 1,
      maxSelections: 1,
      parts: [{ id: "round", label: "Round", file: "round.svg" }],
    },
  ],
  license: { name: "Test", source: "Test fixture" },
});

test("compiles safe layered SVG and emits a validated color token", () => {
  const result = compileSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g data-avatar-layer="face"><circle data-avatar-color="skin" cx="50" cy="50" r="40" /></g></svg>',
    manifest,
    "face-round",
  );
  assert.match(result.face, /__AVATAR_COLOR_skin__/);
  assert.doesNotMatch(result.face, /data-avatar/);
});

for (const [name, svg] of [
  [
    "script",
    '<svg viewBox="0 0 100 100"><g data-avatar-layer="face"><script>alert(1)</script></g></svg>',
  ],
  [
    "event handler",
    '<svg viewBox="0 0 100 100"><g data-avatar-layer="face"><path onclick="x()" d="M0 0" /></g></svg>',
  ],
  [
    "external URL",
    '<svg viewBox="0 0 100 100"><g data-avatar-layer="face"><path fill="url(https://example.com/x)" d="M0 0" /></g></svg>',
  ],
  [
    "unknown layer",
    '<svg viewBox="0 0 100 100"><g data-avatar-layer="evil"><path d="M0 0" /></g></svg>',
  ],
]) {
  test(`rejects ${name}`, () =>
    assert.throws(() => compileSvg(svg, manifest, name)));
}

test("rejects malformed XML and oversized input", () => {
  assert.throws(() =>
    compileSvg('<svg viewBox="0 0 100 100"><g>', manifest, "malformed"),
  );
  assert.throws(() => compileSvg(" ".repeat(201 * 1024), manifest, "large"));
});

test("rejects duplicate internal SVG ids and incomplete enabled packs", () => {
  assert.throws(() =>
    compileSvg(
      '<svg viewBox="0 0 100 100"><g data-avatar-layer="face"><path id="same" d="M0 0" /><path id="same" d="M1 1" /></g></svg>',
      manifest,
      "duplicate-id",
    ),
  );
  assert.throws(() =>
    validatePackManifest({ ...manifest, categories: [] }, "empty-pack"),
  );
});
