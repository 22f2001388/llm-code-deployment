import { GoogleGenAI } from "@google/genai";
import { config } from "./config";
import {
  GenerateResponse,
  GenerationConfig,
  ModelName,
  CompressionResult
} from "./schemas";

class SmartChat {
  private chat: any;
  private currentModel: ModelName;
  private ai: GoogleGenAI;
  private config?: GenerationConfig;
  private timeout: number;

  constructor(
    ai: GoogleGenAI,
    model: ModelName,
    timeout: number,
    config?: GenerationConfig,
  ) {
    this.ai = ai;
    this.currentModel = model;
    this.config = config;
    this.timeout = timeout;
    this.chat = this.ai.chats.create({
      model,
      config: this.buildConfig(config),
    });
  }

  private buildConfig(config?: GenerationConfig) {
    const baseConfig: any = {
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP,
      topK: config?.topK,
      maxOutputTokens: config?.maxOutputTokens ?? 8192,
      systemInstruction: config?.systemInstruction
        ? { parts: [{ text: config.systemInstruction }] }
        : undefined,
    };

    if (config?.thinkingBudget !== undefined) {
      baseConfig.thinkingConfig = {
        thinkingBudget: config.thinkingBudget,
        includeThoughts: false,
      };
    }

    return baseConfig;
  }

  async sendMessage(
    message: string,
    model?: ModelName,
    messageConfig?: GenerationConfig
  ): Promise<string> {
    if (model && model !== this.currentModel) {
      this.switchModel(model);
    }

    const params: any = { message };
    if (messageConfig) {
      params.config = this.buildConfig(messageConfig);
    }

    const response = await this.executeWithTimeout(
      this.chat.sendMessage(params)
    );

    return (response as any).text ?? "";
  }

  async query(message: string, model?: ModelName): Promise<GenerateResponse> {
    const targetModel = model ?? this.currentModel;

    const response = await this.executeWithTimeout(
      this.ai.models.generateContent({
        model: targetModel,
        contents: message,
        config: this.buildConfig(this.config),
      })
    );

    return this.mapToGenerateResponse(response);
  }

  async compressHistory(
    compressionLevel: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<CompressionResult> {
    const history = this.getHistory();

    if (!history || history.length <= 2) {
      return this.createCompressionResult(false, history, "Not enough history to compress");
    }

    try {
      const summary = await this.generateSummary(history, compressionLevel);
      const compressedHistory = this.buildCompressedHistory(summary, history);

      this.chat = this.ai.chats.create({
        model: this.currentModel,
        history: compressedHistory,
        config: this.buildConfig(this.config),
      });

      return this.createCompressionResult(true, compressedHistory, undefined, summary);
    } catch (error) {
      return this.createCompressionResult(
        false,
        history,
        error instanceof Error ? error.message : 'Unknown compression error'
      );
    }
  }

  async smartCompress(): Promise<CompressionResult> {
    const history = this.getHistory();
    const historyLength = history.length;

    if (historyLength <= 4) {
      return this.createCompressionResult(false, history, "History too short for compression");
    }

    const compressionLevel = this.determineCompressionLevel(historyLength);
    return this.compressHistory(compressionLevel);
  }

  estimateTokenUsage(): { approximateTokens: number; messageCount: number } {
    const history = this.getHistory();
    const totalTokens = history.reduce((acc: number, msg: any) => {
      const text = msg.parts?.[0]?.text || '';
      return acc + Math.ceil(text.length * 0.75);
    }, 0);

    return {
      approximateTokens: totalTokens,
      messageCount: history.length
    };
  }

  shouldCompress(threshold: number = 10): boolean {
    const history = this.getHistory();
    const tokenEstimate = this.estimateTokenUsage();

    return history.length > threshold || tokenEstimate.approximateTokens > 2000;
  }

  getHistory() {
    return this.chat.getHistory();
  }

  getCurrentModel(): ModelName {
    return this.currentModel;
  }

  private switchModel(model: ModelName): void {
    const history = this.chat.getHistory();
    this.chat = null;
    this.currentModel = model;
    this.chat = this.ai.chats.create({
      model,
      history,
      config: this.buildConfig(this.config),
    });
  }

  private async executeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.timeout}ms`)),
          this.timeout,
        ),
      ),
    ]);
  }

  private mapToGenerateResponse(response: any): GenerateResponse {
    return {
      text: response.text ?? "",
      usage: response.usageMetadata
        ? {
          promptTokens: response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        }
        : undefined,
    };
  }

  private getCompressionPrompt(level: 'low' | 'medium' | 'high'): string {
    const prompts = {
      low: 'Please provide a concise summary of the key points from this conversation. Keep most details but remove repetition:',
      medium: 'Summarize this conversation focusing on main decisions, key information, and important context. Be concise but preserve essential details:',
      high: 'Create a very brief summary of this conversation capturing only the most critical information and decisions. Remove all examples and minor details:'
    };
    return prompts[level];
  }

  private formatHistoryAsText(history: any[]): string {
    return history
      .map((msg: any) => `${msg.role}: ${msg.parts?.[0]?.text || ''}`)
      .join('\n');
  }

  private async generateSummary(history: any[], compressionLevel: 'low' | 'medium' | 'high'): Promise<string> {
    const prompt = this.getCompressionPrompt(compressionLevel);
    const historyText = this.formatHistoryAsText(history);

    const compressionResponse = await this.ai.models.generateContent({
      model: "gemini-2.0-flash-lite",
      contents: `${prompt}\n\nConversation History:\n${historyText}\n\nSummary:`,
      config: {
        temperature: 0.1,
        maxOutputTokens: compressionLevel === 'high' ? 500 : 800,
        topP: 0.9,
      }
    });

    const summary = (compressionResponse as any).text?.trim();
    if (!summary) {
      throw new Error("Failed to generate summary");
    }

    return summary;
  }

  private buildCompressedHistory(summary: string, originalHistory: any[]): any[] {
    return [
      {
        role: 'user',
        parts: [{ text: `Compressed conversation context: ${summary}` }]
      },
      {
        role: 'model',
        parts: [{ text: 'I have compressed the conversation history and will continue with this context.' }]
      },
      ...originalHistory.slice(-2)
    ];
  }

  private createCompressionResult(
    success: boolean,
    history: any[],
    error?: string,
    summary?: string
  ): CompressionResult {
    return {
      success,
      compressedHistory: history,
      originalLength: this.getHistory().length,
      compressedLength: history.length,
      error,
      summary
    };
  }

  private determineCompressionLevel(historyLength: number): 'low' | 'medium' | 'high' {
    if (historyLength > 20) return 'high';
    if (historyLength > 10) return 'medium';
    return 'low';
  }
}

class GeminiClient {
  private static instance: GeminiClient;
  private ai: GoogleGenAI;
  private timeout: number;

  private constructor() {
    if (!config.geminiApiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
    this.timeout = 120000;
  }

  static getInstance(): GeminiClient {
    if (!GeminiClient.instance) {
      GeminiClient.instance = new GeminiClient();
    }
    return GeminiClient.instance;
  }

  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  async generate(
    prompt: string,
    model: ModelName = "gemini-flash-latest",
    config?: GenerationConfig,
  ): Promise<GenerateResponse> {
    const response = await this.executeWithTimeout(
      this.ai.models.generateContent({
        model,
        contents: prompt,
        config: this.buildGenerationConfig(config),
      })
    );

    return this.mapToGenerateResponse(response);
  }

  createChat(
    model: ModelName = "gemini-flash-latest",
    config?: GenerationConfig,
  ): SmartChat {
    return new SmartChat(this.ai, model, this.timeout, config);
  }

  private buildGenerationConfig(config?: GenerationConfig) {
    return {
      temperature: config?.temperature ?? 0.7,
      topP: config?.topP,
      topK: config?.topK,
      maxOutputTokens: config?.maxOutputTokens ?? 8192,
      systemInstruction: config?.systemInstruction
        ? { parts: [{ text: config.systemInstruction }] }
        : undefined,
      thinkingConfig:
        config?.thinkingBudget !== undefined
          ? {
            thinkingBudget: config.thinkingBudget,
            includeThoughts: config.includeThoughts ?? false,
          }
          : undefined,
    };
  }

  private async executeWithTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Request timeout after ${this.timeout}ms`)),
          this.timeout,
        ),
      ),
    ]);
  }

  private mapToGenerateResponse(response: any): GenerateResponse {
    return {
      text: response.text ?? "",
      usage: response.usageMetadata
        ? {
          promptTokens: response.usageMetadata.promptTokenCount ?? 0,
          completionTokens: response.usageMetadata.candidatesTokenCount ?? 0,
          totalTokens: response.usageMetadata.totalTokenCount ?? 0,
        }
        : undefined,
    };
  }
}

class AipipeClient {
  private static instance: AipipeClient;
  private token: string;
  private timeout: number;

  private constructor() {
    if (!config.aipipeToken) {
      throw new Error("AIPIPE_TOKEN not set");
    }
    this.token = config.aipipeToken;
    this.timeout = 120000;
  }

  static getInstance(): AipipeClient {
    if (!AipipeClient.instance) {
      AipipeClient.instance = new AipipeClient();
    }
    return AipipeClient.instance;
  }

  setTimeout(ms: number): void {
    this.timeout = ms;
  }

  async generate(
    prompt: string,
    model: string = "openai/gpt-5-nano",
  ): Promise<GenerateResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch("https://aipipe.org/openrouter/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const text = await response.text();
      if (!text || text.trim().length === 0) {
        throw new Error("Empty response from API");
      }

      const data = JSON.parse(text);
      return this.mapToGenerateResponse(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if ((error as Error).name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  private mapToGenerateResponse(response: any): GenerateResponse {
    return {
      text: response.choices?.[0]?.message?.content ?? "",
      usage: response.usage
        ? {
          promptTokens: response.usage.prompt_tokens ?? 0,
          completionTokens: response.usage.completion_tokens ?? 0,
          totalTokens: response.usage.total_tokens ?? 0,
        }
        : undefined,
    };
  }
}

export const gemini = GeminiClient.getInstance();
export const aipipe = AipipeClient.getInstance();
export default { GeminiClient, AipipeClient };