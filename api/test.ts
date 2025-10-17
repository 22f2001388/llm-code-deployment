import { config } from "./config";
import { createServer } from "http";

const BASE_URL = config.baseUrl;
const SECRET_KEY = config.secretKey;
const CALLBACK_PORT = 3001;
const CALLBACK_TIMEOUT = 600000;

if (!SECRET_KEY) {
  console.error("❌ SECRET_KEY not set");
  process.exit(1);
}

class MockServer {
  private server: any;
  private sockets = new Set<any>();
  private resolveCallback: ((data: any) => void) | null = null;

  start(port: number): Promise<void> {
    return new Promise((resolve) => {
      this.server = createServer((req, res) => {
        if (req.method === "POST" && req.url === "/notify") {
          let body = "";
          req.on("data", (chunk) => (body += chunk.toString()));
          req.on("end", () => {
            const data = JSON.parse(body);
            console.log("📨 Callback received:", JSON.stringify(data, null, 2));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true }));
            if (this.resolveCallback) {
              this.resolveCallback(data);
              this.resolveCallback = null;
            }
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      });

      this.server.on("connection", (socket: any) => {
        this.sockets.add(socket);
        socket.on("close", () => this.sockets.delete(socket));
      });

      this.server.listen(port, () => {
        console.log(`✅ Mock server on port ${port}`);
        resolve();
      });
    });
  }

  waitForCallback(timeout: number): Promise<any> {
    return Promise.race([
      new Promise((resolve) => {
        this.resolveCallback = resolve;
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeout)
      ),
    ]);
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.sockets.forEach((socket) => socket.destroy());
      this.sockets.clear();
      if (this.server) {
        this.server.close(() => {
          console.log("✅ Mock server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

async function testEndpoint(url: string, method = "GET", body?: any) {
  const start = Date.now();
  try {
    const options: any = { method, headers: {} };
    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const duration = Date.now() - start;
    const data = await response.json();
    console.log(`\n${method} ${url}: ${response.status} (${duration}ms)`);
    console.log("Response:", data);
    return { success: response.ok, duration, status: response.status };
  } catch (error: any) {
    const duration = Date.now() - start;
    console.log(`\n${method} ${url}: Error (${duration}ms)`);
    console.log("Error:", error.message);
    return { success: false, duration, error: error.message };
  }
}

async function runTests() {
  const mockServer = new MockServer();
  const overallStart = Date.now();

  try {
    await mockServer.start(CALLBACK_PORT);

    const makePayload = {
      email: "student@example.com",
      secret: SECRET_KEY,
      task: "captcha-solver-abc123",
      round: 1,
      nonce: "ab12-cd34-ef56",
      brief: "Create a captcha solver",
      checks: ["Repo has MIT license", "Displays solved text within 15s"],
      evaluation_url: `http://localhost:${CALLBACK_PORT}/notify`,
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

    const [getResult, postResult] = await Promise.all([
      testEndpoint(`${BASE_URL}/`),
      testEndpoint(`${BASE_URL}/make`, "POST", newFormatPayload),
    ]);

    console.log("\n=== Waiting for Callback ===");
    const callbackData = await mockServer.waitForCallback(CALLBACK_TIMEOUT);

    const totalDuration = Date.now() - overallStart;

    console.log("\n=== Summary ===");
    console.log(`Total: ${totalDuration}ms`);
    console.log(`GET /: ${getResult.success ? "PASS" : "FAIL"}`);
    console.log(`POST /make: ${postResult.success ? "PASS" : "FAIL"}`);
    console.log(`Callback: ${callbackData ? "PASS" : "FAIL"}`);

    const allPassed = getResult.success && postResult.success && callbackData;
    console.log(`\nAll Tests: ${allPassed ? "PASS" : "FAIL"}`);

    await mockServer.stop();
    process.exit(allPassed ? 0 : 1);
  } catch (error: any) {
    console.error("Test failed:", error.message);
    await mockServer.stop();
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  process.exit(0);
});

runTests();
