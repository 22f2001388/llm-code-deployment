export const makeSchema = {
  body: {
    type: "object",
    properties: {
      // Old properties, now optional
      email: { type: "string" },
      secret: { type: "string" },
      task: { type: "string" },
      round: { type: "number" },
      nonce: { type: "string" },
      evaluation_url: { type: "string" },

      // New property
      id: { type: "string" },

      // Common properties
      brief: { type: "string" },
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
      checks: {
        type: "array",
        items: {
          oneOf: [
            { type: "string" },
            {
              type: "object",
              properties: {
                js: { type: "string" },
              },
              required: ["js"],
            },
          ],
        },
      },

      // New round2 property
      round2: {
        type: "array",
        items: {
          type: "object",
          properties: {
            brief: { type: "string" },
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
            checks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  js: { type: "string" },
                },
                required: ["js"],
              },
            },
          },
          required: ["brief", "checks"],
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