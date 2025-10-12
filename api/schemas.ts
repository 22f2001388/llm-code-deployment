export const makeSchema = {
  body: {
    type: "object",
    required: ["email", "secret", "task", "round", "nonce", "brief", "checks", "evaluation_url"],
    properties: {
      email: { type: "string" },
      secret: { type: "string" },
      task: { type: "string" },
      round: { type: "number" },
      nonce: { type: "string" },
      brief: { type: "string" },
      checks: {
        type: "array",
        items: { type: "string" }
      },
      evaluation_url: { type: "string", format: "uri" },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" }
          },
          required: ["name", "url"]
        }
      }
    }
  },
  response: {
    202: {
      type: "object",
      properties: {
        message: { type: "string" },
        timestamp: { type: "string" }
      }
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" }
      }
    }
  }
};