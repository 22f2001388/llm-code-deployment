import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "./config";
import { gemini, aipipe } from "./geminiClient";
import { getMvpPrompt, getPlanPrompt } from "./prompts";
import { makeSchema, CreateRepoData } from "./schemas";
import { githubService } from "./gitHub";
import fetch from "node-fetch";
import * as fs from "fs";

const SECRET_KEY = config.secretKey;
const logDir = "logs";
const appLog = `${logDir}/api.log`;
const reviewLog = `${logDir}/run_details.log`;
const llmClient = config.llmProvider === "aipipe" ? aipipe : gemini;

if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
}
fs.mkdirSync(logDir);
const logStream = fs.createWriteStream(appLog, { flags: "w" });
fs.writeFileSync(reviewLog, "");

const fastify: FastifyInstance = Fastify({
  logger: {
    level: config.logLevel,
    stream: logStream,
  },
});

async function logDetails(title: string, content: any) {
  const timestamp = new Date().toISOString();
  const formattedContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const logEntry = `--- ${title} @ ${timestamp} ---\n\n${formattedContent}\n\n--- END ${title} ---\n\n`;
  await fs.promises.appendFile(reviewLog, logEntry);
}

async function generateRepoDescription(projectName: string): Promise<string> {
  const response = await gemini.generate(
    `Generate a concise, professional GitHub repository description (max 100 characters) for a project named "${projectName}". Return only the description text, nothing else.`,
    "gemini-flash-lite-latest",
    { temperature: 0.7, maxOutputTokens: 100 }
  );
  return response.text.trim();
}

async function createProjectRepo(projectName: string, mvp?: any): Promise<void> {
  const user = await githubService.getAuthenticatedUser();

  const description = mvp?.definition?.core_purpose
    ? mvp.definition.core_purpose.substring(0, 100)
    : await generateRepoDescription(projectName);

  const repoData: CreateRepoData = {
    name: projectName,
    description,
    private: false,
    auto_init: true,
    license_template: "mit"
  };

  const repo = await githubService.createRepository(repoData);
  console.log(`Repository created: ${repo.html_url}`);
}

async function retryWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await primaryFn();
  } catch (primaryError) {
    try {
      return await fallbackFn();
    } catch (fallbackError) {
      throw new Error(
        `Both providers failed. Primary: ${primaryError instanceof Error ? primaryError.message : String(primaryError)}, Fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
      );
    }
  }
}

async function processRequest(data: any, log: any) {
  try {
    await logDetails("Request", data);

    const { nonce, brief, task, id, checks, evaluation_url } = data;
    const name = task || id;
    const projectName = `${nonce}-${name}`;

    const primaryClient = config.llmProvider === "gemini" ? gemini : aipipe;
    const fallbackClient = config.llmProvider === "gemini" ? aipipe : gemini;

    log.info(`${projectName}: Requesting MVP with ${config.llmProvider}`);

    const mvpPrompts = getMvpPrompt(name, brief, checks);
    const mvpResponse = await retryWithFallback(
      () => primaryClient.generate(mvpPrompts[0], "gemini-flash-lite-latest", {
        systemInstruction: mvpPrompts[1],
      }),
      () => fallbackClient.generate(mvpPrompts[0], "gemini-flash-lite-latest", {
        systemInstruction: mvpPrompts[1],
      })
    );

    const mvp = JSON.parse(mvpResponse.text);
    log.info({ message: "MVP parsed successfully", projectName });
    await logDetails(`${projectName}: MVP`, mvp);

    await createProjectRepo(projectName, mvp);

    log.info(`${projectName}: Requesting Plan`);
    const planPrompt = getPlanPrompt(JSON.stringify(mvp, null, 1));

    const rawPlanResponse = await retryWithFallback(
      async () => {
        if (primaryClient === gemini) {
          const planChat = primaryClient.createChat("gemini-2.5-pro", {
            temperature: 0.2,
            maxOutputTokens: 8192,
            thinkingBudget: 8192,
            systemInstruction: planPrompt[1],
          });
          const response = await planChat.sendMessage(planPrompt[0]);
          const planResponse = await primaryClient.generate(planPrompt[1] + "\n\n" + planPrompt[0]);
          return planResponse.text;
        } else {
          const planResponse = await primaryClient.generate(planPrompt[1] + "\n\n" + planPrompt[0]);
          return planResponse.text;
        }
      },
      async () => {
        if (fallbackClient === gemini) {
          const planChat = fallbackClient.createChat("gemini-2.5-pro", {
            temperature: 0.2,
            maxOutputTokens: 8192,
            thinkingBudget: 8192,
            systemInstruction: planPrompt[1],
          });
          const planResponse = await fallbackClient.generate(planPrompt[1] + "\n\n" + planPrompt[0]);
          return planResponse.text;
        } else {
          const planResponse = await fallbackClient.generate(planPrompt[1] + "\n\n" + planPrompt[0], "openai/gpt-5-mini");
          return planResponse.text;
        }
      }
    );

    let plan = rawPlanResponse.replace(/``````/g, "").trim();
    plan = JSON.parse(plan);

    log.info({ message: "Plan parsed successfully", projectName });
    await logDetails(`${projectName}: Plan`, plan);

    await sendCallback(evaluation_url, { success: true, mvp, plan }, log);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error({ error: "LLM processing failed", message: errorMessage });
    await logDetails("Processing Error", errorMessage);
    await sendCallback(data.evaluation_url, { success: false, error: errorMessage }, log);
  }
}

async function sendCallback(url: string, data: any, log: any) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    log.info(`Callback sent to ${url}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error(`Failed to send callback to ${url}: ${errorMessage}`);
    throw error;
  }
}

fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({ message: "API is working" });
});

fastify.post("/make", { schema: makeSchema }, async (request: FastifyRequest, reply: FastifyReply) => {
  const data = request.body as any;

  if (!SECRET_KEY) {
    return reply.status(500).send({ error: "Server secret not configured" });
  }

  if (String(data.secret).trim() !== SECRET_KEY) {
    return reply.status(401).send({ error: "Invalid secret key" });
  }

  reply.status(200).send({
    status: "accepted",
    timestamp: new Date().toISOString(),
  });

  processRequest(data, fastify.log).catch((error) => {
    fastify.log.error("Unhandled error in background processing:", error);
  });
});

process.on("unhandledRejection", (reason, promise) => {
  fastify.log.error({ err: reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  fastify.log.error({ err: error }, "Uncaught Exception");
  process.exit(1);
});

async function gracefulShutdown(signal: string) {
  fastify.log.info(`${signal} received, closing server`);
  await fastify.close();
  logStream.end();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

async function logGitHubDetails() {
  try {
    const [user, repos] = await Promise.all([
      githubService.getAuthenticatedUser(),
      githubService.getUserRepositories(),
    ]);

    fastify.log.info({ msg: "GitHub User Details", user: user.login });
    await logDetails("GitHub User Details", user);

    fastify.log.info({ msg: "GitHub Repositories", count: repos.length });
    await logDetails("GitHub Repositories", repos.map(r => r.full_name));

  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    fastify.log.error({
      error: "Failed to fetch GitHub details in background",
      message: errorMessage,
    });
  }
}

const start = async () => {
  try {
    const PORT = Number(process.env.PORT) || 3000;
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
    logGitHubDetails();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
