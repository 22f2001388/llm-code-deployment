import { gemini, aipipe } from "./geminiClient";
import { githubService } from "./gitHub";
import { config } from "./config";
import { FileOperation, OrchestratorContext } from "./schemas";

class Orchestrator {
  private primaryClient = config.llmProvider === "gemini" ? gemini : aipipe;
  private fallbackClient = config.llmProvider === "gemini" ? aipipe : gemini;

  async execute(ctx: OrchestratorContext): Promise<void> {
    ctx.log.info(`[${ctx.projectName}] Starting orchestration`);

    const phases = this.groupByPhase(ctx.plan.implementation_sequence);

    for (const [phaseNum, tasks] of phases.entries()) {
      await this.executePhase(phaseNum, tasks, ctx);
    }

    ctx.log.info(`[${ctx.projectName}] Orchestration complete`);
  }

  private groupByPhase(sequence: any[]): Map<number, any[]> {
    const phases = new Map<number, any[]>();

    for (const task of sequence) {
      const phase = task.phase;
      if (!phases.has(phase)) {
        phases.set(phase, []);
      }
      phases.get(phase)!.push(task);
    }

    return new Map([...phases.entries()].sort((a, b) => a[0] - b[0]));
  }

  private async executePhase(
    phaseNum: number,
    tasks: any[],
    ctx: OrchestratorContext
  ): Promise<void> {
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

    const instruction = this.findInstruction(filePath, ctx.plan);
    const content = await this.generateFileContent(filePath, instruction, ctx);

    ctx.generatedFiles.set(filePath, content);

    const operation: FileOperation = {
      path: filePath,
      content,
      operation: task.file_to_update ? "update" : "create",
    };

    await githubService.commitMultipleFiles(
      ctx.owner,
      ctx.projectName,
      [operation],
      `${task.name}: ${filePath}`
    );

    ctx.log.info(`[${ctx.projectName}] Committed: ${filePath}`);
  }

  private findInstruction(filePath: string, plan: any): any {
    return plan.code_generation_instructions.find(
      (inst: any) => inst.file === filePath
    );
  }

  private async generateFileContent(
    filePath: string,
    instruction: any,
    ctx: OrchestratorContext
  ): Promise<string> {
    const prompt = this.buildPrompt(filePath, instruction, ctx);

    try {
      const response = await this.primaryClient.generate(
        prompt,
        "gemini-flash-latest",
        {
          temperature: 0.3,
          maxOutputTokens: 8192,
        }
      );

      return this.cleanContent(response.text);
    } catch (error) {
      ctx.log.warn(`Primary client failed, trying fallback`);

      const response = await this.fallbackClient.generate(
        prompt,
        "gemini-flash-latest",
        {
          temperature: 0.3,
          maxOutputTokens: 8192,
        }
      );

      return this.cleanContent(response.text);
    }
  }

  private buildPrompt(
    filePath: string,
    instruction: any,
    ctx: OrchestratorContext
  ): string {
    const sections: string[] = [];

    sections.push(`Generate the complete content for: ${filePath}`);
    sections.push(`\nProject: ${ctx.mvp.definition.name}`);
    sections.push(`Purpose: ${ctx.mvp.definition.core_purpose}`);

    if (instruction) {
      sections.push(`\n--- File Instructions ---`);
      sections.push(`Strategy: ${instruction.template_strategy}`);

      if (instruction.key_requirements?.length) {
        sections.push(`\nRequirements:`);
        instruction.key_requirements.forEach((req: string) =>
          sections.push(`- ${req}`)
        );
      }

      if (instruction.placeholder_data) {
        sections.push(`\nPlaceholder Data:`);
        sections.push(JSON.stringify(instruction.placeholder_data, null, 2));
      }

      if (instruction.logic_pattern) {
        sections.push(`\nLogic Pattern:`);
        sections.push(instruction.logic_pattern);
      }

      if (instruction.integration_points?.length) {
        sections.push(`\nIntegration Points:`);
        instruction.integration_points.forEach((point: string) =>
          sections.push(`- ${point}`)
        );
      }
    }

    const manifest = ctx.plan.file_manifest.find(
      (m: any) => m.path === filePath
    );

    if (manifest?.contains) {
      sections.push(`\n--- File Manifest ---`);
      if (manifest.contains.functions?.length) {
        sections.push(
          `Functions: ${manifest.contains.functions.join(", ")}`
        );
      }
      if (manifest.contains.constants?.length) {
        sections.push(
          `Constants: ${manifest.contains.constants.join(", ")}`
        );
      }
      if (manifest.contains.imports?.length) {
        sections.push(`Imports: ${manifest.contains.imports.join(", ")}`);
      }
    }

    const dependencies = this.getDependencyContents(filePath, ctx);
    if (dependencies.length) {
      sections.push(`\n--- Dependency Files ---`);
      dependencies.forEach((dep) =>
        sections.push(`\n${dep.path}:\n${dep.content}`)
      );
    }

    sections.push(
      `\n--- Output Instructions ---`
    );
    sections.push(
      `Return ONLY the raw file content. No markdown code blocks, no explanations.`
    );

    return sections.join("\n");
  }

  private getDependencyContents(
    filePath: string,
    ctx: OrchestratorContext
  ): Array<{ path: string; content: string }> {
    const manifest = ctx.plan.file_manifest.find(
      (m: any) => m.path === filePath
    );

    if (!manifest?.depends_on?.length) return [];

    return manifest.depends_on
      .map((dep: string) => ({
        path: dep,
        content: ctx.generatedFiles.get(dep) || "",
      }))
      .filter((dep: any) => dep.content);
  }

  private cleanContent(rawContent: string): string {
    let cleaned = rawContent.trim();
    return cleaned.replace(/``````/g, "").trim();
  }
}

export async function executeOrchestrator(
  projectName: string,
  owner: string,
  plan: any,
  mvp: any,
  log: any
): Promise<void> {
  const orchestrator = new Orchestrator();

  const ctx: OrchestratorContext = {
    projectName,
    owner,
    plan,
    mvp,
    log,
    generatedFiles: new Map(),
  };

  await orchestrator.execute(ctx);
}
