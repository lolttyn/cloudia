import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve("crew_cloudia/canon/machine/bundles/bundles");

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

async function main() {
  const files = await listJsonFiles(ROOT);
  let totalFindings = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    const findings = findNonAscii(raw);
    if (findings.length === 0) continue;
    totalFindings += findings.length;
    console.log(`file: ${file}`);
    for (const f of findings) {
      console.log(
        `  index ${f.index}: '${f.char}' (${f.char
          .codePointAt(0)
          ?.toString(16)}) ... ${f.snippet}`
      );
    }
    console.log();
  }

  if (totalFindings === 0) {
    console.log("No non-ASCII characters found.");
  } else {
    console.log(`Total non-ASCII characters: ${totalFindings}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

