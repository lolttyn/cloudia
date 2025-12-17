import { runAgent } from "../agents/core/runAgent";
import { echoTestAgent } from "../agents/echoTestAgent";
import { setMockCallLLMResponder } from "../llm/callLLM.mock";

const header = (label: string) => console.log(`\n=== ${label} ===`);

async function main() {
  // 1) Non-JSON output -> should throw at JSON.parse
  header("Non-JSON output should throw");
  setMockCallLLMResponder(async () => "not-json");
  try {
    await runAgent(echoTestAgent, { message: "hello" });
    console.error("Expected failure did not occur");
  } catch (err) {
    console.log("Caught expected error:", String(err));
  }

  // 2) JSON with wrong shape -> should throw schema validation error
  header("Wrong-shape JSON should throw");
  setMockCallLLMResponder(async () => JSON.stringify({ wrong: "shape" }));
  try {
    await runAgent(echoTestAgent, { message: "world" });
    console.error("Expected failure did not occur");
  } catch (err) {
    console.log("Caught expected error:", String(err));
  }

  // 3) Correct JSON shape -> should succeed and log
  header("Correct JSON should succeed");
  setMockCallLLMResponder(async (_args) =>
    JSON.stringify({ echoed: "echoed message" })
  );
  const success = await runAgent(echoTestAgent, { message: "echoed message" });
  console.log("Success output:", success);
}

main().catch((err) => {
  console.error("Unexpected failure in test runner:", err);
  process.exitCode = 1;
});

