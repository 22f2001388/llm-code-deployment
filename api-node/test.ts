import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SECRET_KEY = process.env.SECRET_KEY;
const CALLBACK_PORT = 3001;

let callbackReceived = false;
let callbackData: any = null;

function startCallbackReceiver(): Promise<any> {
  return new Promise((resolve) => {
    const app = express();
    app.use(express.json());

    app.post("/notify", (req, res) => {
      console.log("\n=== Callback Received ===");
      console.log("Headers:", req.headers);
      console.log("Body:", JSON.stringify(req.body, null, 2));
      
      callbackReceived = true;
      callbackData = req.body;
      
      res.status(200).json({ received: true });
      
      resolve(req.body);
    });

    const server = app.listen(CALLBACK_PORT, () => {
      console.log(`Callback receiver listening on http://localhost:${CALLBACK_PORT}/notify\n`);
    });

    setTimeout(() => {
      if (!callbackReceived) {
        console.log("\n=== Callback Timeout ===");
        console.log("No callback received within timeout period");
        server.close();
        resolve(null);
      }
    }, 15000);
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
    "Page displays solved text within 15 seconds"
  ],
  evaluationurl: `http://localhost:${CALLBACK_PORT}/notify`,
  attachments: [
    {
      name: "sample.png",
      url: "data:image/png;base64,iVBORw..."
    }
  ]
};

async function testGetEndpoint() {
  const startTime = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/`);
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    console.log("\n=== GET / Endpoint ===");
    console.log("Status:", response.status);
    console.log("Duration:", duration, "ms");
    console.log("Response:", data);
    console.log("Success:", response.ok);
    
    return { success: response.ok, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log("\n=== GET / Endpoint ===");
    console.log("Error:", (error as Error).message);
    console.log("Duration:", duration, "ms");
    
    return { success: false, duration, error: (error as Error).message };
  }
}

async function testMakeEndpoint() {
  const startTime = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/make`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload)
    });
    const data = await response.json();
    const duration = Date.now() - startTime;
    
    console.log("\n=== POST /make Endpoint ===");
    console.log("Status:", response.status);
    console.log("Duration:", duration, "ms");
    console.log("Response:", data);
    console.log("Success:", response.ok);
    
    return { success: response.ok, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log("\n=== POST /make Endpoint ===");
    console.log("Error:", (error as Error).message);
    console.log("Duration:", duration, "ms");
    
    return { success: false, duration, error: (error as Error).message };
  }
}

async function runParallelTests() {
  console.log("Starting parallel endpoint tests...");
  console.log("Base URL:", BASE_URL);
  console.log("Using SECRET_KEY from env:", SECRET_KEY ? "✓" : "✗");
  
  const overallStartTime = Date.now();
  
  const callbackPromise = startCallbackReceiver();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const results = await Promise.all([
    testGetEndpoint(),
    testMakeEndpoint()
  ]);
  
  console.log("\n=== Waiting for Callback ===");
  const callback = await callbackPromise;
  
  const overallDuration = Date.now() - overallStartTime;
  
  console.log("\n=== Test Summary ===");
  console.log("Total Duration:", overallDuration, "ms");
  console.log("GET / Result:", results[0].success ? "PASS" : "FAIL");
  console.log("POST /make Result:", results[1].success ? "PASS" : "FAIL");
  console.log("Callback Result:", callback ? "PASS" : "FAIL");
  console.log("All Tests:", results.every(r => r.success) && callback ? "PASS" : "FAIL");
  
  process.exit(0);
}

runParallelTests();
