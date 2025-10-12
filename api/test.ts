import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SECRET_KEY = process.env.SECRET_KEY;
const CALLBACK_PORT = 3001;

let callbackReceived = false;

function startCallbackReceiver(timeout: number): Promise<any> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());
    const server = app.listen(CALLBACK_PORT, () => {
      console.log(`Callback receiver listening on http://localhost:${CALLBACK_PORT}/notify\n`);
    });

    const timeoutId = setTimeout(() => {
      if (!callbackReceived) {
        console.log("\n=== Callback Timeout ===");
        console.log("No callback received within the timeout period.");
        server.close();
        resolve(null);
      }
    }, timeout);

    app.post("/notify", (req, res) => {
      console.log("\n=== Callback Received ===");
      console.log("Body:", JSON.stringify(req.body, null, 2));
      callbackReceived = true;
      res.status(200).json({ received: true });
      server.close();
      clearTimeout(timeoutId);
      resolve(req.body);
    });
  });
}

const makePayload = {
  email: "student@example.com",
  secret: SECRET_KEY,
  task: "captcha-solver-abc123",
  round: 1,
  nonce: "ab12-cd34-ef56",
  brief: "Create a captcha solver that handles ?url=https...image.png",
  checks: ["Repo has MIT license", "Page displays solved text within 15 seconds"],
  evaluation_url: `http://localhost:${CALLBACK_PORT}/notify`,
};

async function testEndpoint(url: string, method: string = "GET", body: any = null) {
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
    return { success: false, duration, error: (error as Error).message, status: response?.status };
  }
}

async function runTests() {
  console.log("Starting endpoint tests...");
  console.log("Base URL:", BASE_URL);
  
  const overallStartTime = Date.now();
  
  const callbackPromise = startCallbackReceiver(500000);
  
  // Allow time for the callback server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const getTest = await testEndpoint(`${BASE_URL}/`);
  const postTest = await testEndpoint(`${BASE_URL}/make`, "POST", makePayload);
  
  console.log("\n=== Waiting for Callback ===");
  const callbackResult = await callbackPromise;
  
  const overallDuration = Date.now() - overallStartTime;
  
  console.log("\n=== Test Summary ===");
  console.log(`Total Duration: ${overallDuration}ms`);
  console.log(`GET /: ${getTest.success ? 'PASS' : 'FAIL'} (${getTest.duration}ms, status ${getTest.status})`);
  console.log(`POST /make: ${postTest.success ? 'PASS' : 'FAIL'} (${postTest.duration}ms, status ${postTest.status})`);
  console.log(`Callback: ${callbackResult ? 'PASS' : 'FAIL'}`);

  const allTestsPassed = getTest.success && postTest.success && callbackResult;
  console.log(`\nAll Tests: ${allTestsPassed ? 'PASS' : 'FAIL'}`);
  
  process.exit(allTestsPassed ? 0 : 1);
}

runTests();
