import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import dotenv from "dotenv";
import { sendPrompt } from "./geminiClient";
import { getPlanPrompt } from "./prompts";
import { makeSchema } from "./schemas";
import fetch from "node-fetch";
import * as fs from "fs";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const SECRET_KEY = process.env.SECRET_KEY?.trim();

const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}


const logStream = fs.createWriteStream('logs/api.log', { flags: 'w' });

const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    stream: logStream
  }
});

async function logDetails(title: string, content: any) {
  const timestamp = new Date().toISOString();
  const formattedContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const logEntry = `--- ${title} @ ${timestamp} ---\n${formattedContent}`;
  await fs.promises.appendFile('logs/run_details.log', logEntry);
}

async function processRequest(data: any, log: any) {
  try {
    // Clear run_details.log at the start of each request
    await fs.promises.writeFile('logs/run_details.log', '');

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

    await logDetails("Full JSON Plan", jsonPlan);

    log.info({ 
      message: "Structured JSON plan parsed successfully",
      projectName: jsonPlan.project_name,
      technologyStack: jsonPlan.technology_stack,
      directoryCount: jsonPlan.project_structure?.filter((item: any) => item.type === 'directory').length ?? 0,
      fileCount: jsonPlan.project_structure?.filter((item: any) => item.type === 'file').length ?? 0,
      stepCount: jsonPlan.implementation_steps?.length ?? 0,
      geminiResponseTime: `${geminiResponseTime}ms`
    });

    await logDetails("Project Structure", jsonPlan.project_structure.map((item: any) => `
${item.type === 'directory' ? '📁' : '📄'} ${item.path} - ${item.description}${item.content_hint ? `\n   💡 ${item.content_hint}` : ''}`).join(''));

    if (jsonPlan.implementation_steps) {
      const stepResults = [];
      for (const step of jsonPlan.implementation_steps) {
        log.info(`Executing step ${step.id}: ${step.description}`);
        try {
          let fileContents = '';
          for (const file of step.target_files) {
            try {
              const content = await fs.promises.readFile(file, 'utf-8');
              fileContents += `--- file: ${file} ---\n${content}\n--- endfile ---\n\n`;
            } catch (error) {
              fileContents += `--- file: ${file} ---\nThis file is new and does not have any content yet.\n--- endfile ---\n\n`;
            }
          }

          let isUpdate = false;
          for (const file of step.target_files) {
            try {
              await fs.promises.access(file, fs.constants.F_OK);
              isUpdate = true;
              break;
            } catch (error) {
              // File does not exist
            }
          }

          const model = isUpdate ? 'gemini-flash-latest' : 'gemini-flash-lite-latest';
          log.info(`Using model: ${model}`);

          const promptWithContext = `Here is the current content of the files you need to modify:\n\n${fileContents}${step.llm_prompt}`;

          const stepResponse = await sendPrompt(promptWithContext, model);
          await logDetails(`Step ${step.id} Content`, stepResponse);

          const fileUpdates = stepResponse.split('--- file: ');
          for (const update of fileUpdates) {
            if (update.trim()) {
              const [filePath, ...contentParts] = update.split(' ---\n');
              const newContent = contentParts.join(' ---\n').replace(/--- endfile ---/g, '').trim();
              await fs.promises.writeFile(filePath.trim(), newContent);
            }
          }

          log.info(`Step ${step.id} completed successfully`);
          stepResults.push({ id: step.id, success: true, response: stepResponse });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          log.error(`Step ${step.id} failed:`, error);
          stepResults.push({ id: step.id, success: false, error: errorMessage });
        }
      }
      await logDetails("Step Results", stepResults);
      await sendCallback(evaluation_url, { success: true, plan: jsonPlan, stepResults }, log);
    } else {
      await sendCallback(evaluation_url, { success: true, plan: jsonPlan, stepResults: [] }, log);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error({ 
      error: "Gemini processing failed",
      message: errorMessage
    });
    await logDetails("Processing Error", errorMessage);
    await sendCallback(data.evaluation_url, { success: false, error: errorMessage }, log);
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