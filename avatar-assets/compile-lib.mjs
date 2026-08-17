import { createRequire } from "node:module";
import path from "node:path";

const requireFromFrontend = createRequire(
  path.resolve(import.meta.dirname, "..", "dnd_vtt_frontend", "package.json"),
);
const { SaxesParser } = requireFromFrontend("saxes");

export const AVATAR_LAYERS = [
  "hairBack",
  "face",
  "tattoos",
  "details",
  "eyes",
  "eyebrows",
  "nose",
  "mouth",
  "facialHair",
  "hairFront",
  "piercings",
  "accessories",
  "foreground",
];

const ALLOWED_ELEMENTS = new Set([
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
]);
const ALLOWED_ATTRIBUTES = new Set([
  "id",
  "d",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "points",
  "transform",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "opacity",
  "clip-path",
  "mask",
  "offset",
  "stop-color",
  "stop-opacity",
  "href",
  "data-avatar-layer",
  "data-avatar-color",
]);
const SAFE_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const SAFE_VALUE = /^[^<>&"']{0,4096}$/;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function fail(message, context) {
  throw new Error(`${context}: ${message}`);
}

export function validatePackManifest(manifest, context = "avatar catalog") {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    fail("must be an object", context);
  if (!SAFE_ID.test(manifest.id ?? ""))
    fail("id must be a stable lowercase identifier", context);
  if (!Number.isInteger(manifest.version) || manifest.version < 1)
    fail("version must be a positive integer", context);
  if (typeof manifest.label !== "string" || !manifest.label.trim())
    fail("label is required", context);
  if (!/^\d+(?:\.\d+)?(?: \d+(?:\.\d+)?){3}$/.test(manifest.viewBox ?? "")) {
    fail("viewBox must contain four non-negative numbers", context);
  }
  if (
    !Array.isArray(manifest.colorSlots) ||
    !manifest.colorSlots.every((slot) => SAFE_ID.test(slot))
  ) {
    fail("colorSlots must contain stable identifiers", context);
  }
  if (
    !Array.isArray(manifest.colors) ||
    manifest.colors.length !== manifest.colorSlots.length
  ) {
    fail("colors must define every color slot", context);
  }
  for (const color of manifest.colors) {
    if (
      !manifest.colorSlots.includes(color.id) ||
      typeof color.label !== "string" ||
      !/^#[0-9a-f]{6}$/i.test(color.default) ||
      !Array.isArray(color.palette) ||
      !color.palette.every((value) => /^#[0-9a-f]{6}$/i.test(value))
    ) {
      fail(`invalid color definition ${color.id ?? "(missing)"}`, context);
    }
  }
  if (!Array.isArray(manifest.categories))
    fail("categories must be an array", context);
  if (manifest.enabled && manifest.categories.length === 0)
    fail("enabled packs must contain at least one category", context);

  const categoryIds = new Set();
  const partIds = new Set();
  for (const category of manifest.categories) {
    if (!SAFE_ID.test(category.id ?? "") || categoryIds.has(category.id))
      fail("category ids must be unique", context);
    categoryIds.add(category.id);
    if (
      !Number.isInteger(category.minSelections) ||
      !Number.isInteger(category.maxSelections) ||
      category.minSelections < 0 ||
      category.maxSelections < category.minSelections ||
      category.maxSelections > 8
    ) {
      fail(`invalid selection bounds for ${category.id}`, context);
    }
    if (!Array.isArray(category.parts))
      fail(`parts must be an array for ${category.id}`, context);
    if (category.parts.length < category.minSelections)
      fail(
        `category ${category.id} does not contain enough required parts`,
        context,
      );
    const categoryPartIds = new Set(category.parts.map((part) => part.id));
    for (const part of category.parts) {
      const fullId = `${category.id}:${part.id}`;
      if (!SAFE_ID.test(part.id ?? "") || partIds.has(fullId))
        fail(`duplicate or invalid part ${fullId}`, context);
      partIds.add(fullId);
      if (typeof part.label !== "string" || !part.label.trim())
        fail(`part ${fullId} needs a label`, context);
      for (const key of ["occupies", "conflictsWith"]) {
        if (
          part[key] !== undefined &&
          (!Array.isArray(part[key]) ||
            !part[key].every((value) => SAFE_ID.test(value)))
        ) {
          fail(`${key} must contain stable identifiers for ${fullId}`, context);
        }
      }
      if (
        part.conflictsWith?.some(
          (id) => !categoryPartIds.has(id) || id === part.id,
        )
      ) {
        fail(`conflictsWith references an invalid part for ${fullId}`, context);
      }
      if (
        typeof part.file !== "string" ||
        path.isAbsolute(part.file) ||
        part.file.includes("..") ||
        !part.file.endsWith(".svg")
      ) {
        fail(`part ${fullId} has an unsafe file path`, context);
      }
    }
  }
  if (
    !manifest.license ||
    typeof manifest.license.name !== "string" ||
    typeof manifest.license.source !== "string"
  ) {
    fail("license name and source are required", context);
  }
  return manifest;
}

export function compileSvg(svg, manifest, partContext = "avatar SVG") {
  if (Buffer.byteLength(svg, "utf8") > 200 * 1024)
    fail("asset exceeds 200 KB", partContext);
  if (/<!DOCTYPE|<!ENTITY/i.test(svg))
    fail("DOCTYPE and entities are not allowed", partContext);

  const fragments = Object.fromEntries(
    AVATAR_LAYERS.map((layer) => [layer, ""]),
  );
  const prefix = `${manifest.id}-${partContext.replace(/[^a-z0-9_-]/gi, "-").toLowerCase()}-`;
  let depth = 0;
  let currentLayer = null;
  let layerDepth = -1;
  let fragment = "";
  let rootSeen = false;
  let parserError = null;
  const internalIds = new Set();

  const parser = new SaxesParser({ xmlns: false, fragment: false });
  parser.on("error", (error) => {
    parserError = error;
  });
  parser.on("doctype", () => fail("DOCTYPE is not allowed", partContext));
  parser.on("processinginstruction", () =>
    fail("processing instructions are not allowed", partContext),
  );
  parser.on("opentag", (node) => {
    const name = node.name;
    if (depth === 0) {
      if (name !== "svg" || rootSeen)
        fail("must contain one svg root", partContext);
      rootSeen = true;
      const viewBox = node.attributes.viewBox?.value ?? node.attributes.viewBox;
      if (viewBox !== manifest.viewBox)
        fail(`viewBox must be ${manifest.viewBox}`, partContext);
      depth += 1;
      return;
    }
    if (!ALLOWED_ELEMENTS.has(name))
      fail(`element <${name}> is not allowed`, partContext);

    const rawAttributes = Object.fromEntries(
      Object.entries(node.attributes).map(([key, attribute]) => [
        key,
        attribute.value ?? attribute,
      ]),
    );
    if (depth === 1) {
      if (name !== "g") fail("svg children must be layer groups", partContext);
      const layer = rawAttributes["data-avatar-layer"];
      if (!AVATAR_LAYERS.includes(layer))
        fail(`unknown layer ${layer ?? "(missing)"}`, partContext);
      if (fragments[layer])
        fail(`layer ${layer} may appear only once per asset`, partContext);
      currentLayer = layer;
      layerDepth = depth;
    } else if (!currentLayer) {
      fail("content must be inside a layer group", partContext);
    }

    const colorSlot = rawAttributes["data-avatar-color"];
    if (colorSlot && !manifest.colorSlots.includes(colorSlot))
      fail(`unknown color slot ${colorSlot}`, partContext);
    const serializedAttributes = [];
    for (const [key, rawValue] of Object.entries(rawAttributes)) {
      if (
        !ALLOWED_ATTRIBUTES.has(key) ||
        key.toLowerCase().startsWith("on") ||
        key === "style"
      ) {
        fail(`attribute ${key} is not allowed`, partContext);
      }
      if (
        key === "data-avatar-layer" ||
        key === "data-avatar-color" ||
        (colorSlot && key === "fill")
      )
        continue;
      let value = String(rawValue);
      if (
        !SAFE_VALUE.test(value) ||
        /javascript:|data:|https?:|\/\//i.test(value)
      )
        fail(`unsafe ${key} value`, partContext);
      if (key === "id") {
        if (!SAFE_ID.test(value) || internalIds.has(value))
          fail(`duplicate or invalid SVG id ${value}`, partContext);
        internalIds.add(value);
        value = `${prefix}${value}`;
      }
      value = value
        .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
        .replace(/^#(.+)$/, `#${prefix}$1`);
      serializedAttributes.push(`${key}="${escapeXml(value)}"`);
    }
    if (colorSlot)
      serializedAttributes.push(`fill="__AVATAR_COLOR_${colorSlot}__"`);
    fragment += `<${name}${serializedAttributes.length ? ` ${serializedAttributes.join(" ")}` : ""}>`;
    depth += 1;
  });
  parser.on("text", (text) => {
    if (currentLayer) fragment += escapeXml(text);
    else if (text.trim())
      fail("text is only allowed inside layer groups", partContext);
  });
  parser.on("closetag", (node) => {
    depth -= 1;
    if (node.name === "svg") return;
    if (currentLayer) fragment += `</${node.name}>`;
    if (currentLayer && depth === layerDepth) {
      fragments[currentLayer] = fragment;
      currentLayer = null;
      layerDepth = -1;
      fragment = "";
    }
  });
  parser.write(svg).close();
  if (parserError) fail(`malformed XML (${parserError.message})`, partContext);
  if (!rootSeen || depth !== 0 || currentLayer)
    fail("malformed or unclosed SVG", partContext);
  if (!Object.values(fragments).some(Boolean))
    fail("must contain at least one layer", partContext);
  return Object.fromEntries(
    Object.entries(fragments).filter(([, value]) => value),
  );
}
