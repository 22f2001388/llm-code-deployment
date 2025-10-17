export const makeSchema = {
  body: {
    type: "object",
    required: [
      "email",
      "secret",
      "task",
      "round",
      "nonce",
      "brief",
      "checks",
      "evaluation_url",
    ],
    properties: {
      email: { type: "string" },
      secret: { type: "string" },
      task: { type: "string" },
      round: { type: "number" },
      nonce: { type: "string" },
      brief: { type: "string" },
      checks: {
        type: "array",
        items: { type: "string" },
      },
      evaluation_url: { type: "string" },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
          },
          required: ["name", "url"],
        },
      },
    },
  },
  response: {
    202: {
      type: "object",
      properties: {
        message: { type: "string" },
        timestamp: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export type ModelName =
  | "gemini-2.5-pro"
  | "gemini-flash-latest"
  | "gemini-flash-lite-latest";

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  thinkingBudget?: number;
  includeThoughts?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateResponse {
  text: string;
  usage?: TokenUsage;
}

export interface CompressionResult {
  success: boolean;
  compressedHistory: any[];
  originalLength: number;
  compressedLength: number;
  summary?: string;
  error?: string;
}