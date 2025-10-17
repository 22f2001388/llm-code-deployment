import dotenv from "dotenv";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

export const config = {
  secretKey: process.env.SECRET_KEY?.trim(),
  githubToken: process.env.GITHUB_TOKEN?.trim(),
  geminiApiKey: process.env.GEMINI_API_KEY,
  aipipeToken: process.env.AIPIPE_TOKEN,
  llmProvider: process.env.LLM_PROVIDER || "gemini",
  port: Number(process.env.PORT) || 3000,
  logLevel: process.env.LOG_LEVEL || "info",
  nodeEnv: process.env.NODE_ENV,
  baseUrl: process.env.BASE_URL || "http://localhost:3000",
};
