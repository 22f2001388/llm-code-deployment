import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import dotenv from "dotenv";
import { sendPrompt } from "./geminiClient.ts";
import * as fs from "fs/promises";
import * as path from "path";

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
    
    // Enhanced prompt with explicit directory structure requirements
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
    "build_tools": ["bundler", "package_manager"],
    "dependencies": ["key_packages_with_versions"]
  },
  "project_structure": [
    {"path": "directory_path/", "type": "directory", "description": "purpose_of_directory"},
    {"path": "file_path.extension", "type": "file", "description": "purpose_of_file", "content_hint": "what_should_be_in_this_file"}
  ],
  "implementation_steps": [
    {
      "id": 1,
      "step_type": "setup|file_creation|code_implementation|configuration|testing",
      "description": "specific_action_to_perform",
      "llm_prompt": "detailed_prompt_to_send_to_llm_for_this_step_including_all_necessary_context",
      "target_files": ["file_path1", "file_path2"],
      "dependencies": [step_ids],
      "validation_criteria": ["how_to_verify_success"],
      "estimated_time_minutes": number
    }
  ],
  "success_criteria": ["measurable_criterion1", "measurable_criterion2"]
}

CRITICAL REQUIREMENTS FOR DIRECTORY STRUCTURE:
- List EVERY directory and file needed for the complete project
- Include ALL nested directories (src/, src/components/, public/, etc.)
- Specify type as "directory" for folders and "file" for files
- For files, include a "content_hint" describing what should be in the file
- Ensure the structure represents the complete folder hierarchy
- Include configuration files, asset directories, and all source code paths

CRITICAL REQUIREMENTS FOR IMPLEMENTATION STEPS:
- Choose the optimal technology stack with specific versions
- Each step must include a detailed LLM prompt that can be executed independently
- Steps should be atomic and self-contained
- Include file paths, dependencies between steps, and validation criteria
- NEVER include repository, GitHub, deployment, or infrastructure steps
- Focus only on project development and implementation

GUIDELINES FOR LLM PROMPTS:
- Each prompt should contain all context needed to generate the required files/code
- Include specific requirements, expected functionality, and technical constraints
- Reference the chosen technology stack and versions
- Make prompts clear and actionable for code generation
- Specify exact file content requirements

Return ONLY the raw JSON without any additional text or markdown.

JSON OUTPUT:
`;

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
    
    // Log the complete plan details
    fastify.log.info({ 
      message: "Structured JSON plan parsed successfully",
      projectName: jsonPlan.project_name,
      technologyStack: jsonPlan.technology_stack,
      directoryCount: jsonPlan.project_structure ? jsonPlan.project_structure.filter((item: any) => item.type === 'directory').length : 0,
      fileCount: jsonPlan.project_structure ? jsonPlan.project_structure.filter((item: any) => item.type === 'file').length : 0,
      stepCount: jsonPlan.implementation_steps ? jsonPlan.implementation_steps.length : 0,
      geminiResponseTime: `${geminiResponseTime}ms`
    });

    // Log the complete directory structure
    if (jsonPlan.project_structure) {
      fastify.log.info("Complete Project Structure:");
      jsonPlan.project_structure.forEach((item: any) => {
        if (item.type === 'directory') {
          fastify.log.info(`📁 ${item.path} - ${item.description}`);
        } else {
          fastify.log.info(`📄 ${item.path} - ${item.description}`);
          if (item.content_hint) {
            fastify.log.info(`   💡 ${item.content_hint}`);
          }
        }
      });
    }

    // Process implementation steps
    if (jsonPlan.implementation_steps) {
      for (const step of jsonPlan.implementation_steps) {
        fastify.log.info(`Executing step ${step.id}: ${step.description}`);
        fastify.log.info(`Step type: ${step.step_type}`);
        fastify.log.info(`Target files: ${step.target_files.join(', ')}`);
        fastify.log.info(`LLM Prompt: ${step.llm_prompt.substring(0, 100)}...`);
        
        // Here you would execute the step by sending step.llm_prompt to Gemini
        // and then create the actual files based on the response
        try {
          const stepResponse = await sendPrompt(step.llm_prompt, "gemini-2.5-pro");
          print(stepResponse);
          fastify.log.info(`Step ${step.id} completed successfully`);
          // Process stepResponse to create actual files
        } catch (error) {
          fastify.log.error(`Step ${step.id} failed:`, error);
        }
      }
    }
    
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