import * as fs from 'fs';
import * as path from 'path';

const LLM_LOG_DIR = 'llm_logs';

interface LLMLogEntry {
  timestamp: string;
  phase: string;
  model: string;
  promptLength: number;
  prompt: string;
  config: Record<string, any>;
}

export function initLLMLogging() {
  if (fs.existsSync(LLM_LOG_DIR)) {
    fs.rmSync(LLM_LOG_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(LLM_LOG_DIR);
}

export function logLLMCall(entry: LLMLogEntry) {
  const filename = `${entry.phase.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
  const filepath = path.join(LLM_LOG_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(entry, null, 2));

  console.log(`[LLM LOG] ${entry.phase} -> ${filepath}`);
}
