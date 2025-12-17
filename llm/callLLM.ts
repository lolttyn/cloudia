export type CallArgs = {
  model: string;
  systemPrompt: string;
  userPayload: string;
};

export async function callLLM(_args: CallArgs): Promise<string> {
  // Implementation detail:
  // OpenAI, Anthropic, etc.
  // No logic here besides transport.
  throw new Error("callLLM not implemented");
}

