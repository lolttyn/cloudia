import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  InterpretationBundle,
  InterpretationBundleSchema,
} from "../../canon/machine/bundles/interpretation_bundle_schema.js";

export type BundleIndex = Map<string, InterpretationBundle[]>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BUNDLES_DIR = path.resolve(
  __dirname,
  "../../canon/machine/bundles/bundles"
);

let cachedIndex: BundleIndex | null = null;

export function loadInterpretationBundles(): BundleIndex {
  if (cachedIndex) return cachedIndex;

  const entries = fs
    .readdirSync(BUNDLES_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(".json"))
    .map((dirent) => dirent.name)
    .sort((a, b) => a.localeCompare(b));

  if (entries.length === 0) {
    throw new Error(`No interpretation bundles found in ${BUNDLES_DIR}`);
  }

  const index: BundleIndex = new Map();

  for (const file of entries) {
    const fullPath = path.join(BUNDLES_DIR, file);
    const raw = fs.readFileSync(fullPath, "utf-8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err: any) {
      throw new Error(`Failed to parse bundle JSON (${file}): ${err?.message ?? err}`);
    }

    const result = InterpretationBundleSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Bundle schema validation failed for ${file}: ${result.error.message}`
      );
    }

    const bundle = result.data;
    const key = bundle.trigger.signal_key;
    const list = index.get(key) ?? [];
    list.push(bundle);
    index.set(key, list);
  }

  cachedIndex = index;
  return index;
}

