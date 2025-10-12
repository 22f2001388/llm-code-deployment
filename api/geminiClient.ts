import { GoogleGenAI, GenerationConfig } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const modelConfigs: Record<string, GenerationConfig> = {
  'gemini-2.5-pro': {
    thinkingConfig: {
      thinkingBudget: -1, // Enables dynamic deep thinking
      includeThoughts: false
    }
  },
  'gemini-flash-lite-latest': {
    thinkingConfig: {
      thinkingBudget: 0 // Disables thinking for faster responses
    }
  }
};

export async function sendPrompt(
  prompt: string,
  model: string = 'gemini-flash-lite-latest',
  timeout: number = 120000 // Default timeout of 120 seconds
): Promise<string> {
  try {
    const requestConfig = {
      model: model,
      contents: prompt,
      ...modelConfigs[model]
    };

    const response = await Promise.race([
      ai.models.generateContent(requestConfig),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout))
    ]) as any;

    const generatedText = response.text;

    if (!generatedText) {
      throw new Error('No text was generated in the response.');
    }

    return generatedText;
  } catch (error) {
    // Re-throw the error to be handled by the caller
    throw error;
  }
}
