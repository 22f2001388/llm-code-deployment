import dotenv from "dotenv";
import fetch from "node-fetch";
import * as fs from "fs";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SECRET_KEY = process.env.SECRET_KEY;

function waitForLogUpdate(timeout: number = 60000): Promise<{ success: boolean, reason: string }> {
  return new Promise((resolve) => {
    const runDetailsPath = "logs/run_details.log";
    const apiLogPath = "logs/api.log";
    let lastSize = 0;

    const checkInterval = setInterval(() => {
      if (fs.existsSync(apiLogPath)) {
        const apiLogContent = fs.readFileSync(apiLogPath, "utf-8");
        if (apiLogContent.includes('"level":50') || apiLogContent.includes('"level":"error"')) {
          clearInterval(checkInterval);
          clearTimeout(timeoutId);
          resolve({ success: false, reason: "Error detected in api.log" });
          return;
        }
      }

      if (fs.existsSync(runDetailsPath)) {
        const stats = fs.statSync(runDetailsPath);
        if (stats.size > lastSize) {
          lastSize = stats.size;
          const content = fs.readFileSync(runDetailsPath, "utf-8");
          if (content.includes("Plan @")) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve({ success: true, reason: "Plan logged successfully" });
          }
        }
      }
    }, 500);

    const timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      resolve({ success: false, reason: "Timeout waiting for log update" });
    }, timeout);
  });
}

const makePayload = {
  email: "student@example.com",
  secret: SECRET_KEY,
  task: "captcha-solver-abc123",
  round: 1,
  nonce: "ab12-cd34-ef56",
  brief: "Create a captcha solver that handles ?url=https...image.png",
  checks: [
    "Repo has MIT license",
    "Page displays solved text within 15 seconds",
  ],
  evaluation_url: "http://localhost:3001/notify",
};

async function testEndpoint(
  url: string,
  method: string = "GET",
  body: any = null,
) {
  const startTime = Date.now();
  let response: any;
  try {
    const options: any = { method, headers: {} };
    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    response = await fetch(url, options);
    const data = await response.json();
    const duration = Date.now() - startTime;
    console.log(`\n=== ${method} ${url} ===`);
    console.log("Status:", response.status);
    console.log("Duration:", duration, "ms");
    console.log("Response:", data);
    return { success: response.ok, duration, status: response.status };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\n=== ${method} ${url} ===`);
    console.log("Error:", (error as Error).message);
    console.log("Duration:", duration, "ms");
    return {
      success: false,
      duration,
      error: (error as Error).message,
      status: response?.status,
    };
  }
}

async function checkLogFiles() {
  console.log("\n=== Checking Log Files ===");
  const logDirExists = fs.existsSync("logs");
  const apiLogExists = fs.existsSync("logs/api.log");
  const runDetailsExists = fs.existsSync("logs/run_details.log");
  console.log(`'logs' directory exists: ${logDirExists}`);
  console.log(`'logs/api.log' exists: ${apiLogExists}`);
  console.log(`'logs/run_details.log' exists: ${runDetailsExists}`);
  return logDirExists && apiLogExists;
}

async function checkPlanGeneration() {
  console.log("\n=== Checking Plan Generation ===");
  const runDetailsPath = "logs/run_details.log";

  if (!fs.existsSync(runDetailsPath)) {
    console.log("run_details.log not found");
    return false;
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const logContent = fs.readFileSync(runDetailsPath, "utf-8");
  const hasMVP = logContent.includes("MVP @");
  const hasPlan = logContent.includes("Plan @");

  console.log(`MVP logged: ${hasMVP}`);
  console.log(`Plan logged: ${hasPlan}`);

  return hasMVP && hasPlan;
}

async function runTests() {
  console.log("Starting endpoint tests...");
  console.log("Base URL:", BASE_URL);

  const overallStartTime = Date.now();

  const getTest = await testEndpoint(`${BASE_URL}/`);
  const postTest = await testEndpoint(`${BASE_URL}/make`, "POST", makePayload);

  console.log("\n=== Waiting for Processing to Complete ===");
  const logUpdateResult = await waitForLogUpdate(60000);
  console.log(`Result: ${logUpdateResult.reason}`);

  const logsCheck = await checkLogFiles();
  const planCheck = await checkPlanGeneration();

  const overallDuration = Date.now() - overallStartTime;

  console.log("\n=== Test Summary ===");
  console.log(`Total Duration: ${overallDuration}ms`);
  console.log(
    `GET /: ${getTest.success ? "PASS" : "FAIL"} (${getTest.duration}ms, status ${getTest.status})`,
  );
  console.log(
    `POST /make: ${postTest.success ? "PASS" : "FAIL"} (${postTest.duration}ms, status ${postTest.status})`,
  );
  console.log(`Log files created: ${logsCheck ? "PASS" : "FAIL"}`);
  console.log(`Plan generation: ${planCheck ? "PASS" : "FAIL"}`);
  console.log(`Processing completion: ${logUpdateResult.success ? "PASS" : "FAIL"} (${logUpdateResult.reason})`);

  const allTestsPassed = getTest.success && postTest.success && logsCheck && planCheck && logUpdateResult.success;
  console.log(`\nAll Tests: ${allTestsPassed ? "PASS" : "FAIL"}`);

  process.exit(allTestsPassed ? 0 : 1);
}

runTests();
