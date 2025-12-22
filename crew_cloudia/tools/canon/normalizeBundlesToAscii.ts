import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve("crew_cloudia/canon/machine/bundles/bundles");

const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\u2018/g, "'"], // left single quote
  [/\u2019/g, "'"], // right single quote / apostrophe
  [/\u201c/g, '"'], // left double quote
  [/\u201d/g, '"'], // right double quote
  [/\u2013/g, "-"], // en dash
  [/\u2014/g, "-"], // em dash
  [/\u2026/g, "..."], // ellipsis
  [/\u00a0/g, " "], // non-breaking space
];

type Finding = {
  index: number;
  char: string;
  snippet: string;
};

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".v1.json")) {
      files.push(full);
    }
  }
  return files;
}

function findNonAscii(text: string): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x7f) {
      const start = Math.max(0, i - 20);
      const end = Math.min(text.length, i + 21);
      const snippet = text.slice(start, end).replace(/\n/g, "\\n");
      findings.push({ index: i, char: text[i], snippet });
    }
  }
  return findings;
}

function normalize(text: string): string {
  let out = text;
  for (const [rg, replacement] of REPLACEMENTS) {
    out = out.replace(rg, replacement);
  }
  return out;
}

async function main() {
  const files = await listJsonFiles(ROOT);
  let modified = 0;
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    let next = normalize(raw);

    // If still non-ASCII remains, log and skip writing for manual follow-up.
    const remaining = findNonAscii(next);
    if (remaining.length > 0) {
      console.warn(`Non-ASCII remains after normalization in ${file}`);
      for (const f of remaining) {
        console.warn(
          `  index ${f.index}: '${f.char}' (${f.char
            .codePointAt(0)
            ?.toString(16)}) ... ${f.snippet}`
        );
      }
      continue;
    }

    // Ensure JSON validity before writing.
    try {
      JSON.parse(next);
    } catch (err) {
      console.error(`JSON.parse failed for ${file}:`, err);
      continue;
    }

    if (next !== raw) {
      await fs.writeFile(file, next, "utf8");
      modified++;
    }
  }

  console.log(
    `Scanned ${files.length} files; modified ${modified} files.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

