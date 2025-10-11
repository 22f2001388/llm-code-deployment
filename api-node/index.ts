import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import dotenv from "dotenv";
import { sendPrompt } from "./geminiClient.ts";

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

// Health check route
fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({ message: "API is working" });
});

// Main endpoint
fastify.post("/make", {
  schema: {
    body: {
      type: "object",
      required: ["email", "secret", "task", "round", "nonce", "brief", "checks", "evaluationurl"],
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
        evaluationurl: { type: "string", format: "uri" },
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
  }
}, async (request: FastifyRequest, reply: FastifyReply) => {
  const data = request.body as any;
  
  if (!SECRET_KEY) {
    return reply.status(500).send({ error: "Server secret not configured" });
  }
  
  if (String(data.secret ?? "").trim() !== SECRET_KEY) {
    return reply.status(401).send({ error: "Invalid secret key" });
  }
  
  // Send response immediately
  await reply.status(202).send({
    message: "Request accepted for processing",
    timestamp: new Date().toISOString()
  });

  // Process with Gemini after response is sent
  try {
    const brief = data.brief;
    const task = data.task;
    const checks = data.checks;
    
    // Curated prompt for consistent JSON format
    const geminiPrompt = `
You are a senior full-stack developer and project architect. Create a detailed, executable development plan for this project:

PROJECT TASK: ${task}
PROJECT BRIEF: ${brief}
PROJECT REQUIREMENTS: ${checks.join(', ')}

Generate a comprehensive JSON development plan with this exact structure:
{
  "project_name": "descriptive_project_name",
  "technology_stack": {
    "frontend": ["primary_framework", "supporting_libraries"],
    "backend": ["server_technology", "apis"],
    "styling": ["css_framework", "ui_libraries"],
    "build_tools": ["bundler", "package_manager"]
  },
  "project_structure": [
    {"path": "file_or_directory_path", "type": "file|directory", "description": "purpose"}
  ],
  "implementation_steps": [
    {
      "id": 1,
      "step_type": "setup|file_creation|code_implementation|configuration|testing",
      "description": "specific_action_to_perform",
      "llm_prompt": "detailed_prompt_to_send_to_llm_for_this_step",
      "target_files": ["file_path1", "file_path2"],
      "dependencies": [step_ids],
      "validation_criteria": ["how_to_verify_success"],
      "estimated_time_minutes": number
    }
  ],
  "success_criteria": ["measurable_criterion1", "measurable_criterion2"]
}

CRITICAL REQUIREMENTS:
- Choose the optimal technology stack based on project requirements
- Design complete project structure with all necessary files
- Each implementation step must include a detailed LLM prompt that can be executed independently
- Steps should be atomic and self-contained
- Include file paths, dependencies between steps, and validation criteria
- NEVER include repository, GitHub, deployment, or infrastructure steps
- Focus only on project development and implementation

GUIDELINES FOR LLM PROMPTS:
- Each prompt should contain all context needed to generate the required files/code
- Include specific requirements, expected functionality, and technical constraints
- Reference the technology stack you've chosen
- Make prompts clear and actionable for code generation

Return ONLY the raw JSON without any additional text or markdown.

JSON OUTPUT:`;

    fastify.log.info("Sending brief to Gemini for structured plan...");
    
    // Start timing the Gemini request
    const geminiStartTime = Date.now();

    const geminiResponse = await sendPrompt(
      geminiPrompt,
      "gemini-2.5-pro"
    );
    
    // Calculate response time
    const geminiEndTime = Date.now();
    const geminiResponseTime = geminiEndTime - geminiStartTime;
    // Strip any markdown code block markers
    let cleanJson = geminiResponse
      .replace(/```json\s*/g, '')
      .replace(/\s*```/g, '')
      .replace(/^JSON:\s*/i, '')
      .trim();

    fastify.log.info(`Gemini response received in ${geminiResponseTime}ms`);
    
    // Parse and validate the JSON
    const jsonPlan = JSON.parse(cleanJson);
    console.log(`Gemini response: ${geminiResponse}`);
    console.log(`Json response: ${cleanJson}`);
    fastify.log.info({ 
      message: "Structured JSON plan parsed successfully",
      stepCount: jsonPlan.steps ? jsonPlan.steps.length : 0,
      totalTime: jsonPlan.total_estimated_time_minutes,
      geminiResponseTime: `${geminiResponseTime}ms`
    });
    
  } catch (error) {
    fastify.log.error({ 
      error: "Gemini processing failed",
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
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