import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { config } from "./config";
import { gemini, aipipe } from "./geminiClient";
import { getMvpPrompt, getPlanPrompt, getReadmePrompt } from "./prompts";
import { makeSchema, RepoResult } from "./schemas";
import { githubService } from "./gitHub";
import { executeOrchestrator } from "./orchestrator";
import fetch from "node-fetch";
import * as fs from "fs";

const SECRET_KEY = config.secretKey;
const LOG_DIR = "logs";
const APP_LOG = `${LOG_DIR}/api.log`;
const REVIEW_LOG = `${LOG_DIR}/run_details.log`;

const CLIENT_MAP = { gemini, aipipe };
const PRIMARY_CLIENT = CLIENT_MAP[config.llmProvider];
const FALLBACK_CLIENT = config.llmProvider === "gemini" ? aipipe : gemini;

const initLogs = () => {
  if (fs.existsSync(LOG_DIR)) {
    fs.rmSync(LOG_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(LOG_DIR);
  fs.writeFileSync(REVIEW_LOG, "");
  return fs.createWriteStream(APP_LOG, { flags: "w" });
};

const logStream = initLogs();

const fastify: FastifyInstance = Fastify({
  logger: { level: config.logLevel, stream: logStream },
});

const logDetails = async (title: string, content: any) => {
  const entry = `--- ${title} @ ${new Date().toISOString()} ---\n\n${typeof content === "string" ? content : JSON.stringify(content, null, 2)
    }\n\n--- END ${title} ---\n\n`;
  await fs.promises.appendFile(REVIEW_LOG, entry);
};

const withLogging = async <T>(
  operationName: string,
  fn: () => Promise<T>,
  logRequest?: any
): Promise<T> => {
  const startTime = Date.now();

  await logDetails(`${operationName} - Request`, {
    timestamp: new Date().toISOString(),
    ...(logRequest && { payload: logRequest })
  });

  try {
    const result = await fn();

    await logDetails(`${operationName} - Response`, {
      timestamp: new Date().toISOString(),
      duration: `${Date.now() - startTime}ms`,
      result: typeof result === 'string' && result.length > 1000
        ? `${result.substring(0, 1000)}... (truncated)`
        : result
    });

    return result;
  } catch (error) {
    await logDetails(`${operationName} - Error`, {
      timestamp: new Date().toISOString(),
      duration: `${Date.now() - startTime}ms`,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};

const generateReadme = async (plan: any, mvp: any): Promise<string> => {
  const prompt = getReadmePrompt(mvp, plan);

  return withLogging(
    "Generate README",
    async () => {
      const response = await gemini.generate(prompt, "gemini-2.5-pro", {
        temperature: 0.3,
        maxOutputTokens: 3000,
      });
      return response.text.trim();
    },
    { model: "gemini-2.5-pro", promptLength: prompt.length }
  );
};

const generateRepoDescription = async (projectName: string): Promise<string> => {
  const prompt = `Generate a concise, professional GitHub repository description (max 100 characters) for a project named "${projectName}". Return only the description text, nothing else.`;

  return withLogging(
    "Generate Repo Description",
    async () => {
      const response = await gemini.generate(prompt, "gemini-flash-lite-latest", {
        temperature: 0.7,
        maxOutputTokens: 100
      });
      return response.text.trim();
    },
    { projectName }
  );
};

const createProjectRepo = async (
  projectName: string,
  mvp: any,
  plan: any
): Promise<RepoResult> => {
  const user = await withLogging(
    "GitHub Get User",
    () => githubService.getAuthenticatedUser()
  );

  const description = mvp?.definition?.core_purpose
    ? mvp.definition.core_purpose.substring(0, 100)
    : await generateRepoDescription(projectName);

  const repo = await withLogging(
    "GitHub Create Repository",
    () => githubService.createRepository({
      name: projectName,
      description,
      private: false,
      auto_init: false,
      license_template: "mit",
    }),
    { projectName, description }
  );

  const readme = await generateReadme(plan, mvp);

  await withLogging(
    "GitHub Commit Files",
    () => githubService.commitMultipleFiles(user.login, projectName, [
      { operation: "create", path: "README.md", content: readme },
    ], "Initial commit: Add README"),
    { owner: user.login, repo: projectName, filesCount: 1 }
  );

  return { url: repo.html_url, owner: user.login, name: projectName };
};

const retryWithFallback = async <T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> => {
  try {
    return await primaryFn();
  } catch (primaryError) {
    const fallbackResult = await fallbackFn();
    return fallbackResult;
  }
};

const generateWithClient = async (client: any, prompts: string[], model: string, opts?: any) => {
  const [userPrompt, systemInstruction] = prompts;

  return withLogging(
    `LLM Generate - ${model}`,
    () => client.generate(userPrompt, model, { ...opts, systemInstruction }),
    { model, promptLength: userPrompt.length }
  );
};

const generatePlan = async (mvp: any) => {
  const planPrompt = getPlanPrompt(JSON.stringify(mvp, null, 1));

  const rawPlan = await retryWithFallback(
    () => withLogging(
      "LLM Generate Plan - Primary",
      () => PRIMARY_CLIENT.generate(planPrompt[1] + "\n\n" + planPrompt[0]),
      { provider: config.llmProvider }
    ),
    () => withLogging(
      "LLM Generate Plan - Fallback",
      () => FALLBACK_CLIENT.generate(planPrompt[1] + "\n\n" + planPrompt[0], "openai/gpt-5-mini"),
      { provider: config.llmProvider === "gemini" ? "aipipe" : "gemini" }
    )
  );

  return JSON.parse(rawPlan.replace(/``````/g, "").trim());
};

const processRequest = async (data: any, log: any) => {
  try {
    await logDetails("Request", data);

    const { nonce, brief, task, id, checks, evaluation_url } = data;
    const projectName = `${nonce}-${task || id}`;

    log.info(`${projectName}: Requesting MVP with ${config.llmProvider}`);

    const mvpResponse = await retryWithFallback(
      () => generateWithClient(PRIMARY_CLIENT, getMvpPrompt(task || id, brief, checks), "gemini-flash-lite-latest"),
      () => generateWithClient(FALLBACK_CLIENT, getMvpPrompt(task || id, brief, checks), "gemini-flash-lite-latest")
    );

    const mvp = JSON.parse(mvpResponse.text);
    log.info({ message: "MVP parsed successfully", projectName });
    await logDetails(`${projectName}: MVP`, mvp);

    log.info(`${projectName}: Requesting Plan`);
    const plan = await generatePlan(mvp);

    log.info({ message: "Plan parsed successfully", projectName });
    await logDetails(`${projectName}: Plan`, plan);

    log.info(`[${projectName}] Creating repository`);
    const repoResult = await createProjectRepo(projectName, mvp, plan);

    log.info(`[${projectName}] Executing orchestrator`);
    const { deploymentUrl } = await executeOrchestrator(projectName, repoResult.owner, plan, mvp, log);

    const callbackPayload: any = {
      success: true,
      repository: { url: repoResult.url, owner: repoResult.owner, name: repoResult.name },
    };

    if (deploymentUrl) {
      callbackPayload.deployment = { url: deploymentUrl, platform: "github-pages" };
    }

    await sendCallback(evaluation_url, callbackPayload, log);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error({ error: "LLM processing failed", message: errorMessage });
    await logDetails("Processing Error", errorMessage);
    await sendCallback(data.evaluation_url, { success: false, error: errorMessage }, log);
  }
};

const sendCallback = async (url: string, data: any, log: any) => {
  await withLogging(
    "Send Callback",
    async () => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      log.info(`Callback sent to ${url}`);
      return response;
    },
    { url, payload: data }
  );
};

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

  reply.status(200).send({ status: "accepted", timestamp: new Date().toISOString() });

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

const gracefulShutdown = async (signal: string) => {
  fastify.log.info(`${signal} received, closing server`);
  await fastify.close();
  logStream.end();
  process.exit(0);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const logGitHubDetails = async () => {
  try {
    const [user, repos] = await Promise.all([
      withLogging("GitHub Get User Details", () => githubService.getAuthenticatedUser()),
      withLogging("GitHub Get Repositories", () => githubService.getUserRepositories()),
    ]);

    fastify.log.info({ msg: "GitHub User Details", user: user.login });
    await logDetails("GitHub User Details", user);

    fastify.log.info({ msg: "GitHub Repositories", count: repos.length });
    await logDetails("GitHub Repositories", repos.map(r => r.full_name));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    fastify.log.error({ error: "Failed to fetch GitHub details in background", message: errorMessage });
  }
};

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
