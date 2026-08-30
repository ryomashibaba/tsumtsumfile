import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { TSUM_TYPES } from "./config.js";
import { getCoverSourceRect } from "./tsumImages.js";

const EXPECTED_ARTWORK_IDS = [
  "coronationElsa",
  "captainLightyear",
  "namine",
  "gaston",
  "guidingMoana",
  "perfumeAlice",
  "jamilViper",
  "snowQueenElsa",
  "liliaVanrouge",
  "judyNick",
  "judyNickJudy",
  "judyNickNickMate",
  "jafarGenie",
  "genie",
  "pumbaa",
  "grogu",
  "mandalorian",
  "grim"
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function getSources(type) {
  return type.imageSources || (type.imageSrc ? [type.imageSrc] : []);
}

test("all supported Tsum artwork points to a valid versioned PNG", async () => {
  const typesById = new Map(TSUM_TYPES.map((type) => [type.id, type]));
  const uniqueSources = new Set();

  for (const id of EXPECTED_ARTWORK_IDS) {
    const type = typesById.get(id);
    assert.ok(type, `Missing Tsum type: ${id}`);

    const sources = getSources(type);
    assert.ok(sources.length > 0, `Missing artwork mapping: ${id}`);

    for (const source of sources) {
      const sourceUrl = new URL(source, import.meta.url);
      assert.equal(sourceUrl.searchParams.get("v"), "tsum-images-5", `Stale artwork version: ${id}`);

      const filePath = fileURLToPath(new URL(sourceUrl.pathname, import.meta.url));
      const data = await readFile(filePath);
      assert.ok(data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE), `Invalid PNG: ${source}`);
      uniqueSources.add(filePath);
    }
  }

  assert.equal(uniqueSources.size, 17);
});

test("characters without supplied artwork keep their fallback rendering", () => {
  const typesById = new Map(TSUM_TYPES.map((type) => [type.id, type]));

  assert.deepEqual(getSources(typesById.get("coingain")), []);
  assert.deepEqual(getSources(typesById.get("namineSora")), []);
});

test("cover source rectangles center-crop inconsistent artwork dimensions into a square", () => {
  assert.deepEqual(
    getCoverSourceRect({ naturalWidth: 338, naturalHeight: 261 }, 64, 64),
    { x: 38.5, y: 0, width: 261, height: 261 }
  );
  assert.deepEqual(
    getCoverSourceRect({ naturalWidth: 487, naturalHeight: 512 }, 64, 64),
    { x: 0, y: 12.5, width: 487, height: 487 }
  );
});
