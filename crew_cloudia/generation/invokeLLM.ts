import { AssembledPrompt } from "./buildSegmentPrompt.js";

export type LLMInvocationConfig = {
  provider: "openai";
  model: string;

  temperature: number;
  max_tokens: number;

  frequency_penalty: number;
  presence_penalty: number;

  stop_sequences: string[] | null;
};

export type LLMInvocationResult =
  | {
      status: "ok";
      text: string;
      model: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  | {
      status: "error";
      error_type: "timeout" | "provider_error" | "invalid_response" | "unknown";
      message: string;
    };

export const CLOUDIA_LLM_CONFIG: LLMInvocationConfig = {
  provider: "openai",
  model: "gpt-4.1-mini",

  temperature: 0.6,
  max_tokens: 800,

  frequency_penalty: 0.2,
  presence_penalty: 0.0,

  stop_sequences: null,
};

export async function invokeLLM(
  prompt: AssembledPrompt,
  config: LLMInvocationConfig = CLOUDIA_LLM_CONFIG
): Promise<LLMInvocationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      status: "error",
      error_type: "provider_error",
      message: "OPENAI_API_KEY is not set",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: prompt.system_prompt },
          { role: "user", content: prompt.user_prompt },
        ],
        temperature: config.temperature,
        max_tokens: config.max_tokens,
        frequency_penalty: config.frequency_penalty,
        presence_penalty: config.presence_penalty,
        stop: config.stop_sequences ?? undefined,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await safeReadError(response);
      return {
        status: "error",
        error_type: "provider_error",
        message: `OpenAI error ${response.status}: ${errorText}`,
      };
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (typeof content !== "string" || content.trim() === "") {
      return {
        status: "error",
        error_type: "invalid_response",
        message: "OpenAI returned empty content",
      };
    }

    return {
      status: "ok",
      text: content,
      model: typeof data?.model === "string" ? data.model : config.model,
      usage: data?.usage,
    };
  } catch (err: any) {
    if (controller.signal.aborted) {
      return {
        status: "error",
        error_type: "timeout",
        message: "LLM invocation timed out",
      };
    }

    return {
      status: "error",
      error_type: "provider_error",
      message: err?.message ?? "OpenAI invocation failed",
    };
  }
  finally {
    clearTimeout(timeout);
  }
}

async function safeReadError(response: any): Promise<string> {
  try {
    const text = await response.text();
    return text || response.statusText || "Unknown provider error";
  } catch {
    return response.statusText || "Unknown provider error";
  }
}

