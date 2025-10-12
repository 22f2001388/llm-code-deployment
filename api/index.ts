import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import dotenv from "dotenv";
import { sendPrompt } from "./geminiClient";
import { getPlanPrompt } from "./prompts";
import { makeSchema } from "./schemas";
import fetch from "node-fetch";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const SECRET_KEY = process.env.SECRET_KEY?.trim();

const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV !== "production" ? {
      target: "pino-pretty",
      options: {
        colorize: true,
        ignore: "pid,hostname",
        translateTime: "yyyy-mm-dd HH:MM:ss",
      }
    } : undefined
  }
});

async function processRequest(data: any, log: any) {
  try {
    const { brief, task, checks, evaluation_url } = data;
    const geminiPrompt = getPlanPrompt(task, brief, checks);

    log.info("Sending brief to Gemini for structured plan...");
    const geminiStartTime = Date.now();
    const geminiResponse = await sendPrompt(geminiPrompt, "gemini-2.5-pro");
    const geminiResponseTime = Date.now() - geminiStartTime;

    let cleanJson = geminiResponse
      .replace(/```json\s*/g, '')
      .replace(/\s*```/g, '')
      .replace(/^JSON:\s*/i, '')
      .trim();

    log.info(`Gemini response received in ${geminiResponseTime}ms`);
    const jsonPlan = JSON.parse(cleanJson);

    log.info({ 
      message: "Structured JSON plan parsed successfully",
      projectName: jsonPlan.project_name,
      technologyStack: jsonPlan.technology_stack,
      directoryCount: jsonPlan.project_structure?.filter((item: any) => item.type === 'directory').length ?? 0,
      fileCount: jsonPlan.project_structure?.filter((item: any) => item.type === 'file').length ?? 0,
      stepCount: jsonPlan.implementation_steps?.length ?? 0,
      geminiResponseTime: `${geminiResponseTime}ms`
    });

    console.log("Complete Project Structure:");
    jsonPlan.project_structure.forEach((item: any) => {
      if (item.type === 'directory') {
        console.log(`📁 ${item.path} - ${item.description}`);
      } else {
        console.log(`📄 ${item.path} - ${item.description}`);
        if (item.content_hint) {
          console.log(`   💡 ${item.content_hint}`);
        }
      }
    });

    if (jsonPlan.implementation_steps) {
      const stepPromises = jsonPlan.implementation_steps.map(async (step: any) => {
        log.info(`Executing step ${step.id}: ${step.description}`);
        try {
          const stepResponse = await sendPrompt(step.llm_prompt, "gemini-flash-lite-latest");
          console.log(`Step ${step.id} content:`, stepResponse);
          log.info(`Step ${step.id} completed successfully`);
          return { id: step.id, success: true, response: stepResponse };
        } catch (error) {
          log.error(`Step ${step.id} failed:`, error);
          return { id: step.id, success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      });
      const stepResults = await Promise.all(stepPromises);
      await sendCallback(evaluation_url, { success: true, plan: jsonPlan, stepResults }, log);
    } else {
      await sendCallback(evaluation_url, { success: true, plan: jsonPlan, stepResults: [] }, log);
    }

  } catch (error) {
    log.error({ 
      error: "Gemini processing failed",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
    await sendCallback(data.evaluation_url, { success: false, error: error instanceof Error ? error.message : 'Unknown error' }, log);
  }
}

async function sendCallback(url: string, data: any, log: any) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    log.info(`Callback sent to ${url}`);
  } catch (error) {
    log.error(`Failed to send callback to ${url}:`, error);
  }
}

// Health check route
fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({ message: "API is working" });
});

// Main endpoint
fastify.post("/make", { schema: makeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
  const data = request.body as any;
  
  if (!SECRET_KEY) {
    return reply.status(500).send({ error: "Server secret not configured" });
  }
  
  if (String(data.secret ?? "").trim() !== SECRET_KEY) {
    return reply.status(401).send({ error: "Invalid secret key" });
  }
  
  reply.status(202).send({
    message: "Request accepted for processing",
    timestamp: new Date().toISOString()
  });

  processRequest(data, fastify.log);
});

// Start server
const start = async () => {
  try {
    const PORT = Number(process.env.PORT) || 3000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();