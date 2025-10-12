import { GoogleGenAI } from '@google/genai';

// Initialize the client once to reuse it, which is efficient for multiple requests.
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Sends a prompt to the Gemini model and returns the complete text response.
 * Optimized for latency with automatic deep thinking for gemini-2.5-pro.
 * @param prompt The user's text prompt.
 * @param model The Gemini model to use (e.g., 'gemini-2.0-flash', 'gemini-2.5-pro')
 * @returns The model's generated text response.
 */
export async function sendPrompt(
  prompt: string, 
  model: string = 'gemini-flash-lite-latest'
): Promise<string> {
  try {
    // Base configuration for all models
    const requestConfig: any = {
      model: model,
      contents: prompt,
    };

    // Apply deep thinking configuration only for gemini-2.5-pro
    if (model === 'gemini-2.5-pro') {
      requestConfig.config = {
        thinkingConfig: {
          thinkingBudget: -1, // Enables dynamic deep thinking
          includeThoughts: false // We don't want thoughts in the final output
        }
      };
    } else {
      // For other models, disable thinking to optimize latency
      requestConfig.config = {
        thinkingConfig: {
          thinkingBudget: 0 // Disables thinking for faster responses
        }
      };
    }

    const response = await ai.models.generateContent(requestConfig);

    // Safely extract the text response
    const generatedText = response.text;
    
    if (!generatedText) {
      throw new Error('No text was generated in the response.');
    }
    
    return generatedText;

  } catch (error) {
    console.error('Error calling the Gemini API:', error);
    throw error;
  }
}
