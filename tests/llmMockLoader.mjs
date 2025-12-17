import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mockPath = pathToFileURL(
  path.resolve(__dirname, "../llm/callLLM.mock.ts")
).href;

export async function resolve(specifier, context, nextResolve) {
  if (
    specifier.endsWith("/llm/callLLM") ||
    specifier.endsWith("/llm/callLLM.ts")
  ) {
    return { url: mockPath };
  }
  return nextResolve(specifier, context);
}

