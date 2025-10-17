import dotenv from "dotenv";
import * as fs from "fs/promises";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';

dotenv.config();

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const SECRET_KEY = process.env.SECRET_KEY;

// Validate essential environment variables early
if (!SECRET_KEY) {
  console.error("❌ ERROR: SECRET_KEY environment variable is required");
  process.exit(9);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Mock evaluation server to receive callbacks
class MockEvaluationServer {
  constructor(port = 3001) {
    this.port = port;
    this.server = null;
    this.receivedCallbacks = [];
    this.callbackPromise = null;
    this.callbackResolve = null;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.callbackPromise = new Promise((res) => {
        this.callbackResolve = res;
      });

      this.server = createServer((req, res) => {
        if (req.method === 'POST' && req.url === '/notify') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              this.receivedCallbacks.push({
                timestamp: new Date().toISOString(),
                data: data
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: 'callback received' }));

              console.log('📨 Received callback:', JSON.stringify(data, null, 2));

              // Resolve the promise when we receive a callback
              if (this.callbackResolve) {
                this.callbackResolve(data);
                this.callbackResolve = null;
              }
            } catch (error) {
              console.error('Error processing callback:', error);
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });

      this.server.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Mock evaluation server listening on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async waitForCallback(timeout = 60000) {
    if (!this.callbackPromise) {
      this.callbackPromise = new Promise((res) => {
        this.callbackResolve = res;
      });
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout waiting for callback')), timeout);
    });

    return Promise.race([this.callbackPromise, timeoutPromise]);
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('✅ Mock evaluation server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  getCallbacks() {
    return this.receivedCallbacks;
  }

  clearCallbacks() {
    this.receivedCallbacks = [];
  }
}

const mockServer = new MockEvaluationServer();

/**
 * Improved function to wait for log updates with async file operations
 * @param {number} timeout - Timeout in milliseconds (default: 20 minutes)
 * @returns {Promise<{success: boolean, reason: string}>}
 */
async function waitForLogUpdate(timeout = 600000) {
  const runDetailsPath = join(__dirname, "logs", "run_details.log");
  const apiLogPath = join(__dirname, "logs", "api.log");

  return new Promise((resolve) => {
    let lastSize = 0;
    let timeoutId;

    const checkInterval = setInterval(async () => {
      try {
        // Check for errors in api.log
        try {
          const apiLogContent = await fs.readFile(apiLogPath, "utf-8");
          if (apiLogContent.includes('"level":50') || apiLogContent.includes('"level":"error"')) {
            clearInterval(checkInterval);
            clearTimeout(timeoutId);
            resolve({ success: false, reason: "Error detected in api.log" });
            return;
          }
        } catch (error) {
          // File might not exist yet, which is fine
        }

        // Check for plan completion in run_details.log
        try {
          const stats = await fs.stat(runDetailsPath);
          if (stats.size > lastSize) {
            lastSize = stats.size;
            const content = await fs.readFile(runDetailsPath, "utf-8");
            if (content.includes("Plan @")) {
              clearInterval(checkInterval);
              clearTimeout(timeoutId);
              resolve({ success: true, reason: "Plan logged successfully" });
            }
          }
        } catch (error) {
          // File might not exist yet, which is expected initially
        }
      } catch (error) {
        console.error("Unexpected error during log check:", error.message);
      }
    }, 500);

    timeoutId = setTimeout(() => {
      clearInterval(checkInterval);
      resolve({ success: false, reason: "Timeout waiting for log update" });
    }, timeout);
  });
}

// Payload definitions
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

const newFormatPayload = {
  secret: SECRET_KEY,
  id: "sum-of-sales",
  nonce: "ab12-cd34-ef56",
  brief: "Publish a single-page site that fetches data.csv from attachments, sums its sales column, sets the title to \"Sales Summary 12345\", displays the total inside #total-sales, and loads Bootstrap 5 from jsdelivr.",
  attachments: [
    {
      name: "data.csv",
      url: "data:text/csv;base64,cHJvZHVjdCxzYWxlcwpJdGVtQSwxMAo=",
    },
  ],
  checks: [
    { js: "document.title === `Sales Summary 12345`" },
    { js: "!!document.querySelector(\"link[href*='bootstrap']\")" },
    { js: "Math.abs(parseFloat(document.querySelector(\"#total-sales\").textContent) - 10) < 0.01" },
  ],
  evaluation_url: "http://localhost:3001/notify",
};

/**
 * Modernized test endpoint function with improved error handling
 * @param {string} url - The endpoint URL to test
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {object} body - Request body for POST requests
 * @returns {Promise<object>} Test result object
 */
async function testEndpoint(url, method = "GET", body = null) {
  const startTime = Date.now();

  try {
    const options = {
      method,
      headers: {}
    };

    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const duration = Date.now() - startTime;

    // Check for HTTP error status codes
    if (!response.ok) {
      return {
        success: false,
        duration,
        status: response.status,
        error: `HTTP Error: ${response.status} ${response.statusText}`
      };
    }

    const data = await response.json();

    console.log(`\n=== ${method} ${url} ===`);
    console.log("Status:", response.status);
    console.log("Duration:", duration, "ms");
    console.log("Response:", data);

    return {
      success: true,
      duration,
      status: response.status,
      data
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`\n=== ${method} ${url} ===`);
    console.log("Error:", error.message);
    console.log("Duration:", duration, "ms");

    return {
      success: false,
      duration,
      error: error.message,
      status: null
    };
  }
}

/**
 * Check log files using async file operations
 * @returns {Promise<boolean>} True if logs directory and api.log exist
 */
async function checkLogFiles() {
  console.log("\n=== Checking Log Files ===");

  try {
    const logDirExists = await fs.access("logs").then(() => true).catch(() => false);
    const apiLogExists = await fs.access("logs/api.log").then(() => true).catch(() => false);
    const runDetailsExists = await fs.access("logs/run_details.log").then(() => true).catch(() => false);

    console.log(`'logs' directory exists: ${logDirExists}`);
    console.log(`'logs/api.log' exists: ${apiLogExists}`);
    console.log(`'logs/run_details.log' exists: ${runDetailsExists}`);

    return logDirExists && apiLogExists;
  } catch (error) {
    console.error("Error checking log files:", error.message);
    return false;
  }
}

/**
 * Check if plan generation was successful
 * @returns {Promise<boolean>} True if both MVP and Plan are logged
 */
async function checkPlanGeneration() {
  console.log("\n=== Checking Plan Generation ===");

  try {
    await fs.access("logs/run_details.log");

    // Brief pause to ensure file is written
    await new Promise(resolve => setTimeout(resolve, 1000));

    const logContent = await fs.readFile("logs/run_details.log", "utf-8");
    const hasMVP = logContent.includes("MVP @");
    const hasPlan = logContent.includes("Plan @");

    console.log(`MVP logged: ${hasMVP}`);
    console.log(`Plan logged: ${hasPlan}`);

    return hasMVP && hasPlan;
  } catch (error) {
    console.log("run_details.log not found or inaccessible:", error.message);
    return false;
  }
}

/**
 * Check if callback was received successfully
 * @returns {Promise<{success: boolean, callbackData: any}>}
 */
async function checkCallbackReceived() {
  console.log("\n=== Checking Callback Reception ===");

  try {
    console.log("Waiting for callback from evaluation URL...");
    const callbackData = await mockServer.waitForCallback(60000);

    console.log("✅ Callback received successfully");
    console.log("Callback data:", JSON.stringify(callbackData, null, 2));

    return {
      success: true,
      callbackData: callbackData
    };
  } catch (error) {
    console.log("❌ Callback not received:", error.message);
    const callbacks = mockServer.getCallbacks();
    if (callbacks.length > 0) {
      console.log("But we have received callbacks:", callbacks);
    }
    return {
      success: false,
      callbackData: null
    };
  }
}

/**
 * Main test runner function
 */
async function runTests() {
  console.log("Starting endpoint tests...");
  console.log("Base URL:", BASE_URL);

  // Start mock evaluation server
  try {
    await mockServer.start();
    console.log("✅ Mock evaluation server started successfully");
  } catch (error) {
    console.error("❌ Failed to start mock evaluation server:", error.message);
    console.log("Continuing tests without callback verification...");
  }

  const overallStartTime = Date.now();

  try {
    const getTest = await testEndpoint(`${BASE_URL}/`);
    const postTestOld = await testEndpoint(`${BASE_URL}/make`, "POST", makePayload);

    console.log("\n=== Waiting for Processing to Complete ===");
    const logUpdateResult = await waitForLogUpdate(600000);
    console.log(`Result: ${logUpdateResult.reason}`);

    // Check for callback
    const callbackCheck = await checkCallbackReceived();

    const logsCheck = await checkLogFiles();
    const planCheck = await checkPlanGeneration();

    const overallDuration = Date.now() - overallStartTime;

    // Test Summary
    console.log("\n=== Test Summary ===");
    console.log(`Total Duration: ${overallDuration}ms`);
    console.log(`GET /: ${getTest.success ? "PASS" : "FAIL"} (${getTest.duration}ms, status ${getTest.status})`);
    console.log(`POST /make (Old Format): ${postTestOld.success ? "PASS" : "FAIL"} (${postTestOld.duration}ms, status ${postTestOld.status})`);
    console.log(`Log files created: ${logsCheck ? "PASS" : "FAIL"}`);
    console.log(`Plan generation: ${planCheck ? "PASS" : "FAIL"}`);
    console.log(`Processing completion: ${logUpdateResult.success ? "PASS" : "FAIL"} (${logUpdateResult.reason})`);
    console.log(`Callback received: ${callbackCheck.success ? "PASS" : "FAIL"}`);

    const allTestsPassed = getTest.success &&
      postTestOld.success &&
      logsCheck &&
      planCheck &&
      logUpdateResult.success &&
      callbackCheck.success;

    console.log(`\nAll Tests: ${allTestsPassed ? "PASS" : "FAIL"}`);

    // Cleanup
    await mockServer.stop();

    process.exit(allTestsPassed ? 0 : 1);

  } catch (error) {
    console.error("Unexpected error during test execution:", error);
    await mockServer.stop();
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  await mockServer.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  await mockServer.stop();
  process.exit(0);
});

// Start the tests
runTests();