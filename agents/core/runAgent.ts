import { AgentDefinition } from "./AgentDefinition";
import { callLLM } from "../../llm/callLLM";
import { logAgentRun } from "../../logging/agentRunLogger";

export async function runAgent<I, O>(
  agent: AgentDefinition<I, O>,
  input: I
): Promise<O> {
  // 1. Validate input
  const validatedInput = agent.inputSchema.parse(input);

  // 2. Call model
  const raw = await callLLM({
    model: agent.model,
    systemPrompt: agent.systemPrompt,
    userPayload: JSON.stringify(validatedInput),
  });

  // 3. Parse output
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Agent ${agent.name} returned non-JSON output`);
  }

  // 4. Validate output (with agent context)
  let output: O;
  try {
    output = agent.outputSchema.parse(parsed);
  } catch (err) {
    throw new Error(
      `Agent ${agent.name} output failed schema validation: ${String(err)}`
    );
  }

  // 5. Log only trusted data
  logAgentRun({
    agentName: agent.name,
    input: validatedInput,
    output,
  });

  return output;
}

