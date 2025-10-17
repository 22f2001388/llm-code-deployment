import { gemini, aipipe } from "./geminiClient";
import { githubService } from "./gitHub";
import { config } from "./config";
import { OrchestratorContext, VerificationResult } from "./schemas";

const CLIENT_MAP = { gemini, aipipe };
const PRIMARY_CLIENT = CLIENT_MAP[config.llmProvider];
const FALLBACK_CLIENT = config.llmProvider === "gemini" ? aipipe : gemini;
const MAX_ATTEMPTS = 3;
const GITHUB_SYNC_DELAY = 2000;

const LLM_MODELS = {
  FLASH: "gemini-flash-latest",
  PRO: "gemini-2.5-pro",
  FALLBACK: "openai/gpt-5-mini",
} as const;

const LLM_CONFIGS = {
  CODE_GEN: { temperature: 0.3, maxOutputTokens: 8192 },
  REVIEW: { temperature: 0.2, maxOutputTokens: 500 },
  REPLAN: { temperature: 0.4, maxOutputTokens: 8192 },
} as const;

class Orchestrator {
  async execute(ctx: OrchestratorContext): Promise<void> {
    ctx.log.info(`[${ctx.projectName}] Starting orchestration (Attempt ${ctx.attempt})`);

    const phases = this.groupByPhase(ctx.plan.implementation_sequence);

    for (const [phaseNum, tasks] of phases.entries()) {
      await this.executePhase(phaseNum, tasks, ctx);
    }

    ctx.log.info(`[${ctx.projectName}] Orchestration complete`);
  }

  private groupByPhase(sequence: any[]): Map<number, any[]> {
    return sequence.reduce((phases, task) => {
      const phase = task.phase;
      if (!phases.has(phase)) phases.set(phase, []);
      phases.get(phase)!.push(task);
      return phases;
    }, new Map<number, any[]>());
  }

  private async executePhase(phaseNum: number, tasks: any[], ctx: OrchestratorContext): Promise<void> {
    ctx.log.info(`[${ctx.projectName}] Phase ${phaseNum}: ${tasks[0].name}`);

    for (const task of tasks) {
      await this.executeTask(task, ctx);
    }
  }

  private async executeTask(task: any, ctx: OrchestratorContext): Promise<void> {
    const filePath = task.file_to_generate || task.file_to_update;

    if (!filePath) {
      ctx.log.warn(`Task has no file specified, skipping`);
      return;
    }

    ctx.log.info(`[${ctx.projectName}] Generating: ${filePath}`);

    const instruction = ctx.plan.code_generation_instructions.find((inst: any) => inst.file === filePath);
    const content = await this.generateFileContent(filePath, instruction, ctx);

    ctx.generatedFiles.set(filePath, content);

    await githubService.commitMultipleFiles(
      ctx.owner,
      ctx.projectName,
      [{
        path: filePath,
        content,
        operation: task.file_to_update ? "update" : "create",
      }],
      `${task.name}: ${filePath} (attempt ${ctx.attempt})`
    );

    ctx.log.info(`[${ctx.projectName}] Committed: ${filePath}`);
  }

  private async generateFileContent(filePath: string, instruction: any, ctx: OrchestratorContext): Promise<string> {
    const prompt = this.buildPrompt(filePath, instruction, ctx);

    const response = await this.callLLMWithFallback(
      () => PRIMARY_CLIENT.generate(prompt, LLM_MODELS.FLASH, LLM_CONFIGS.CODE_GEN),
      () => FALLBACK_CLIENT.generate(prompt, LLM_MODELS.FLASH, LLM_CONFIGS.CODE_GEN),
      ctx
    );

    return this.cleanContent(response.text);
  }

  private async callLLMWithFallback<T>(
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>,
    ctx: OrchestratorContext
  ): Promise<T> {
    try {
      return await primaryFn();
    } catch (error) {
      ctx.log.warn(`Primary client failed, trying fallback`);
      return await fallbackFn();
    }
  }

  private buildPrompt(filePath: string, instruction: any, ctx: OrchestratorContext): string {
    const { definition } = ctx.mvp;
    const manifest = ctx.plan.file_manifest.find((m: any) => m.path === filePath);
    const dependencies = this.getDependencyContents(filePath, ctx);

    return `Generate the complete content for: ${filePath}

Project: ${definition.name}
Purpose: ${definition.core_purpose}
${this.formatInstruction(instruction)}
${this.formatManifest(manifest)}
${this.formatDependencies(dependencies)}

--- Output Instructions ---
Return ONLY the raw file content. No markdown code blocks, no explanations.`;
  }

  private formatInstruction(instruction: any): string {
    if (!instruction) return "";

    const parts = [`\n--- File Instructions ---`, `Strategy: ${instruction.template_strategy}`];

    if (instruction.key_requirements?.length) {
      parts.push(`\nRequirements:\n${instruction.key_requirements.map((req: string) => `- ${req}`).join("\n")}`);
    }

    if (instruction.placeholder_data) {
      parts.push(`\nPlaceholder Data:\n${JSON.stringify(instruction.placeholder_data, null, 2)}`);
    }

    if (instruction.logic_pattern) {
      parts.push(`\nLogic Pattern:\n${instruction.logic_pattern}`);
    }

    if (instruction.integration_points?.length) {
      parts.push(`\nIntegration Points:\n${instruction.integration_points.map((p: string) => `- ${p}`).join("\n")}`);
    }

    return parts.join("\n");
  }

  private formatManifest(manifest: any): string {
    if (!manifest?.contains) return "";

    const parts = ["\n--- File Manifest ---"];
    const { functions, constants, imports } = manifest.contains;

    if (functions?.length) parts.push(`Functions: ${functions.join(", ")}`);
    if (constants?.length) parts.push(`Constants: ${constants.join(", ")}`);
    if (imports?.length) parts.push(`Imports: ${imports.join(", ")}`);

    return parts.join("\n");
  }

  private formatDependencies(dependencies: Array<{ path: string; content: string }>): string {
    if (!dependencies.length) return "";

    return `\n--- Dependency Files ---\n${dependencies.map((dep) => `\n${dep.path}:\n${dep.content}`).join("\n")}`;
  }

  private getDependencyContents(filePath: string, ctx: OrchestratorContext): Array<{ path: string; content: string }> {
    const manifest = ctx.plan.file_manifest.find((m: any) => m.path === filePath);

    if (!manifest?.depends_on?.length) return [];

    return manifest.depends_on
      .map((dep: string) => ({ path: dep, content: ctx.generatedFiles.get(dep) || "" }))
      .filter((dep: any) => dep.content);
  }

  private cleanContent(rawContent: string): string {
    return rawContent.trim().replace(/``````/g, "");
  }

  async verifyDeployment(ctx: OrchestratorContext): Promise<VerificationResult> {
    ctx.log.info(`[${ctx.projectName}] Starting LLM verification`);

    const repoSnapshot = this.buildRepoSnapshot(ctx);
    const reviewDecision = await this.getLLMReview(repoSnapshot, ctx);

    const result: VerificationResult = {
      success: reviewDecision.approved,
      errors: reviewDecision.approved ? [] : [`LLM Review Failed: ${reviewDecision.reason}`],
      warnings: [],
      reviewReason: reviewDecision.reason,
    };

    ctx.log[reviewDecision.approved ? "info" : "error"](
      `[${ctx.projectName}] LLM Review: ${reviewDecision.approved ? "APPROVED" : "REJECTED"}`
    );

    return result;
  }

  private buildRepoSnapshot(ctx: OrchestratorContext): string {
    const files = Array.from(ctx.generatedFiles.entries());

    return `# Repository Structure
\`\`\`
${files.map(([path]) => path).join("\n")}
\`\`\`

# File Contents
${files.map(([path, content]) => `## ${path}\n\`\`\`\n${content}\n\`\`\`\n`).join("\n")}`;
  }

  private async getLLMReview(repoSnapshot: string, ctx: OrchestratorContext): Promise<{ approved: boolean; reason: string }> {
    const { definition, essential_features, technology_stack } = ctx.mvp;

    const prompt = `You are a code reviewer. Review this repository against the project requirements.

# Project Requirements
Name: ${definition.name}
Purpose: ${definition.core_purpose}
Type: ${definition.type}

# Expected Features
${essential_features.map((f: any) => `- ${f.feature}: ${f.description}`).join("\n")}

# Technology Stack
${technology_stack.join(", ")}

# Expected Files
${ctx.plan.file_manifest.map((f: any) => `- ${f.path}: ${f.purpose}`).join("\n")}

# Actual Repository
${repoSnapshot}

# Review Criteria
1. All required files are present
2. Files contain valid, non-empty content
3. Code structure matches the plan
4. No placeholder/dummy code in production files
5. Files integrate correctly (imports, references)

# Instructions
Respond with ONLY a JSON object in this format:
{
  "approved": true/false,
  "reason": "brief reason for approval or rejection"
}

Be strict but fair. Reject if critical issues exist.`;

    try {
      const response = await this.callLLMWithFallback(
        () => PRIMARY_CLIENT.generate(prompt, LLM_MODELS.FLASH, LLM_CONFIGS.REVIEW),
        () => FALLBACK_CLIENT.generate(prompt, LLM_MODELS.FLASH, LLM_CONFIGS.REVIEW),
        ctx
      );

      const review = JSON.parse(this.cleanContent(response.text));

      return {
        approved: review.approved === true,
        reason: review.reason || "No reason provided",
      };
    } catch (error) {
      ctx.log.error(`[${ctx.projectName}] LLM review failed: ${error}`);
      return { approved: false, reason: "LLM review process failed" };
    }
  }

  async replanWithFeedback(mvp: any, previousPlan: any, feedback: string, log: any): Promise<any> {
    log.info(`Replanning with feedback: ${feedback}`);

    const replanPrompt = `You are an implementation planner. The previous plan was rejected during code review.

# Original MVP
${JSON.stringify(mvp, null, 2)}

# Previous Plan (REJECTED)
${JSON.stringify(previousPlan, null, 2)}

# Rejection Reason
${feedback}

# Instructions
Generate a NEW, IMPROVED plan that addresses the rejection reason.
- Fix the specific issues mentioned in the rejection
- Keep the same MVP requirements
- Adjust file structure, implementation strategy, or code generation instructions as needed
- Be more specific and detailed in code generation instructions

Use the same JSON structure as the original plan.
Return ONLY the JSON plan, no explanations.`;

    const response = await this.callLLMWithFallback(
      () => PRIMARY_CLIENT.generate(replanPrompt, LLM_MODELS.FLASH, LLM_CONFIGS.REPLAN),
      () => FALLBACK_CLIENT.generate(replanPrompt, LLM_MODELS.FLASH, LLM_CONFIGS.REPLAN),
      { log }
    );

    return JSON.parse(this.cleanContent(response.text));
  }
}

export async function executeOrchestrator(
  projectName: string,
  owner: string,
  initialPlan: any,
  mvp: any,
  log: any
): Promise<{ deploymentUrl: string; verification: VerificationResult; attempts: number }> {
  const orchestrator = new Orchestrator();

  let currentPlan = initialPlan;
  let attempt = 1;

  while (attempt <= MAX_ATTEMPTS) {
    log.info(`[${projectName}] Attempt ${attempt}/${MAX_ATTEMPTS}`);

    const ctx: OrchestratorContext = {
      projectName,
      owner,
      plan: currentPlan,
      mvp,
      log,
      generatedFiles: new Map(),
      attempt,
    };

    await orchestrator.execute(ctx);

    log.info(`[${projectName}] Waiting for GitHub sync`);
    await new Promise((resolve) => setTimeout(resolve, GITHUB_SYNC_DELAY));

    log.info(`[${projectName}] Fetching repository files`);
    await Promise.allSettled(
      Array.from(ctx.generatedFiles.keys()).map(async (filePath) => {
        try {
          const remoteContent = await githubService.getFileContent(owner, projectName, filePath);
          ctx.generatedFiles.set(filePath, remoteContent);
        } catch (error) {
          log.error(`[${projectName}] Failed to fetch ${filePath} from repo`);
        }
      })
    );

    log.info(`[${projectName}] Requesting LLM review`);
    const verification = await orchestrator.verifyDeployment(ctx);

    if (verification.success) {
      log.info(`[${projectName}] LLM Review: APPROVED on attempt ${attempt}`);

      let deploymentUrl = "";
      const isStaticSite =
        currentPlan.dependency_resolution?.hosting_compatibility?.platform === "github-pages" ||
        currentPlan.execution_strategy?.approach === "static-spa";

      if (isStaticSite) {
        log.info(`[${projectName}] Deploying to GitHub Pages`);
        deploymentUrl = await githubService.enableAndDeployPages(owner, projectName);
        log.info(`[${projectName}] Deployed to: ${deploymentUrl}`);
      }

      return { deploymentUrl, verification, attempts: attempt };
    }

    log.warn(`[${projectName}] LLM Review: REJECTED on attempt ${attempt}`);
    verification.errors.forEach((err) => log.error(`  - ${err}`));

    if (attempt < MAX_ATTEMPTS) {
      log.info(`[${projectName}] Replanning for attempt ${attempt + 1}`);
      currentPlan = await orchestrator.replanWithFeedback(
        mvp,
        currentPlan,
        verification.reviewReason || "Unknown issue",
        log
      );
      attempt++;
    } else {
      log.error(`[${projectName}] Max attempts reached, deployment failed`);
      throw new Error(`Deployment failed after ${MAX_ATTEMPTS} attempts: ${verification.errors.join("; ")}`);
    }
  }

  throw new Error("Orchestration failed");
}
