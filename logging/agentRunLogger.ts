export function logAgentRun({
  agentName,
  input,
  output,
}: {
  agentName: string;
  input: unknown;
  output: unknown;
}) {
  console.log(`[AGENT:${agentName}]`, {
    input,
    output,
  });
}

