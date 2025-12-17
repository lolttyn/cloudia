import { z } from "zod";
import { AgentDefinition } from "./core/AgentDefinition";

export const echoTestAgent: AgentDefinition<
  { message: string },
  { echoed: string }
> = {
  name: "echoTestAgent",
  description: "Echoes the provided message as echoed field.",
  model: "test-model",
  systemPrompt:
    "You are an echo agent. Given the user payload JSON, return JSON with shape { \"echoed\": string } where echoed repeats the input message exactly. Respond with JSON only.",
  inputSchema: z.object({
    message: z.string(),
  }),
  outputSchema: z.object({
    echoed: z.string(),
  }),
};

