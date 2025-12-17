import { CallArgs } from "./callLLM";

let responder: (args: CallArgs) => Promise<string> = async () => {
  throw new Error("callLLM mock responder not set");
};

export const setMockCallLLMResponder = (
  impl: (args: CallArgs) => Promise<string>
) => {
  responder = impl;
};

export const callLLM = async (args: CallArgs): Promise<string> => {
  return responder(args);
};

