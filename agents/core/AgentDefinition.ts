import { ZodSchema } from "zod";

export interface AgentDefinition<I, O> {
  name: string;
  description: string;

  model: string;

  systemPrompt: string;

  inputSchema: ZodSchema<I>;
  outputSchema: ZodSchema<O>;
}

