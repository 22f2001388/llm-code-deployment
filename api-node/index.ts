import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import pino from "pino";
import { safeParse } from "valibot";
import { RequestSchema } from "./schemas.js";
import fetch from "node-fetch";
import CircuitBreaker from "opossum";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const SECRET_KEY = process.env.SECRET_KEY?.trim();
const CALLBACK_TIMEOUT = Number(process.env.CALLBACK_TIMEOUT) || 10000;
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: process.env.NODE_ENV !== "production" ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname",
      translateTime: "yyyy-mm-dd HH:MM:ss",
      messageFormat: "\n{msg}\n"
    }
  } : undefined
});

const app = express();

app.disable("x-powered-by");
app.disable("etag");

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.json = ((originalJson) => {
    return function (body: any) {
      const duration = Date.now() - start;
      logger.info({
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration
      });
      return originalJson.call(this, body);
    };
  })(res.json.bind(res));
  
  next();
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "API is working" });
});

app.post("/make", async (req: Request, res: Response) => {
  try {
    const parsed = safeParse(RequestSchema, req.body);
    if (!parsed.success) {
      logger.warn({ error: "Invalid request body", details: parsed.issues });
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.issues,
      });
    }
    
    const data = parsed.output;
    
    if (!SECRET_KEY) {
      logger.error("Server secret not configured");
      return res.status(500).json({ error: "Server secret not configured" });
    }
    
    if (String(data.secret ?? "").trim() !== SECRET_KEY) {
      logger.warn({ error: "Invalid secret key attempt" });
      return res.status(401).json({ error: "Invalid secret key" });
    }
    
    res.status(200).json({ response: "Request received and being processed" });
    
    const repoName = `${data.task}-${data.nonce}`.replace(/\s+/g, "-");
    const timestamp = new Date().toISOString();
    
    const callbacks = [
      {
        url: data.evaluationurl,
        payload: {
          status: "success",
          repo_name: repoName,
          nonce: data.nonce,
          timestamp,
        },
      },
    ];
    
    setImmediate(() => {
      processCallbacks(callbacks);
    });
    
  } catch (err) {
    logger.error({ error: (err as Error).message, stack: (err as Error).stack });
    return res.status(500).json({
      error: process.env.NODE_ENV === "production" 
        ? "Internal server error" 
        : (err as Error).message,
    });
  }
});

interface CallbackConfig {
  url: string;
  payload: Record<string, unknown>;
  timeout?: number;
  maxRetries?: number;
}

const circuitBreakerOptions = {
  timeout: CALLBACK_TIMEOUT,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  name: "callback-circuit"
};

const callbackCircuitBreaker = new CircuitBreaker(
  async (url: string, payload: Record<string, unknown>, timeout: number) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response;
  },
  circuitBreakerOptions
);

callbackCircuitBreaker.on("open", () => {
  logger.warn({ circuit: "callback", state: "open", message: "Circuit breaker opened" });
});

callbackCircuitBreaker.on("halfOpen", () => {
  logger.info({ circuit: "callback", state: "half-open", message: "Circuit breaker half-open" });
});

callbackCircuitBreaker.on("close", () => {
  logger.info({ circuit: "callback", state: "closed", message: "Circuit breaker closed" });
});

callbackCircuitBreaker.fallback(() => {
  logger.warn({ circuit: "callback", message: "Fallback triggered" });
  throw new Error("Service unavailable - circuit open");
});

function processCallbacks(callbacks: CallbackConfig[]): void {
  for (let i = 0; i < callbacks.length; i++) {
    const config = callbacks[i];
    sendCallback(
      config.url,
      config.payload,
      config.timeout,
      config.maxRetries,
      i
    ).catch(err => {
      logger.error({ 
        callback_index: i, 
        error: err.message,
        url: config.url
      });
    });
  }
}

async function sendCallback(
  url: string,
  payload: Record<string, unknown>,
  timeout = CALLBACK_TIMEOUT,
  maxRetries = MAX_RETRIES,
  callbackIndex: number,
  attempt = 0
): Promise<void> {
  const startTime = Date.now();
  
  try {
    logger.info({ 
      callback_index: callbackIndex,
      attempt: attempt + 1, 
      url,
      action: "callback_attempt"
    });
    
    await callbackCircuitBreaker.fire(url, payload, timeout);
    
    const duration = Date.now() - startTime;
    logger.info({ 
      callback_index: callbackIndex,
      attempt: attempt + 1,
      url,
      duration_ms: duration,
      action: "callback_success"
    });
    
  } catch (err) {
    const error = err as Error;
    const duration = Date.now() - startTime;
    const isTimeout = error.name === "TimeoutError" || error.name === "AbortError";
    const isRetryable = isTimeout || error.message.startsWith("HTTP 5");
    
    logger.error({
      callback_index: callbackIndex,
      attempt: attempt + 1,
      url,
      error: error.message,
      duration_ms: duration,
      is_timeout: isTimeout,
      is_retryable: isRetryable,
      action: "callback_error"
    });
    
    if (isRetryable && attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      logger.info({
        callback_index: callbackIndex,
        retry_after_ms: delay,
        action: "callback_retry_scheduled"
      });
      await new Promise(resolve => setTimeout(resolve, delay));
      return sendCallback(url, payload, timeout, maxRetries, callbackIndex, attempt + 1);
    }
    
    throw error;
  }
}

app.use((err: unknown, _req: Request, res: Response, _next: unknown) => {
  logger.error({ error: (err as Error).message, stack: (err as Error).stack });
  
  res.status(500).json({ 
    error: process.env.NODE_ENV === "production" 
      ? "Internal server error" 
      : (err as Error).message 
  });
});

if (process.env.NODE_ENV !== "production") {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => {});
}

export default app;
