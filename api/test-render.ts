import fetch from "node-fetch";
import * as readline from "readline";

const BASE_URL = "https://llm-code-deployment-jf5b.onrender.com";
const SECRET_KEY = "0199bd3c-0c4e-7289-8f36-dee0e1d30893";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function testHealth() {
  console.log("=== Test 1: GET / ===");
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/`);
  const duration = Date.now() - start;
  const data = await response.json();

  console.log(`Status: ${response.status} (${duration}ms)`);
  console.log(`Response: ${JSON.stringify(data)}\n`);
}

async function testMakeEndpoint(webhookUrl: string) {
  console.log("=== Test 2: POST /make ===");

  const payload = {
    secret: SECRET_KEY,
    id: "test-001",
    nonce: "abc123",
    brief: "Create a simple HTML page with <h1>Hello World</h1>",
    attachments: [],
    checks: [{ js: "document.querySelector('h1')?.textContent === 'Hello World'" }],
    evaluation_url: webhookUrl,
  };

  console.log(`\nSending request to ${BASE_URL}/make...`);
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/make`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const duration = Date.now() - start;
  const data = await response.json();

  console.log(`Status: ${response.status} (${duration}ms)`);
  console.log(`Response: ${JSON.stringify(data, null, 2)}`);

  if (response.status === 200) {
    console.log(`\n✅ Request accepted! Check ${webhookUrl} in ~10 minutes`);
  } else {
    console.log("\n❌ Request failed");
  }
}

async function main() {
  await testHealth();

  console.log("Get webhook URL from https://webhook.site\n");

  rl.question("Paste webhook.site URL: ", async (webhookUrl) => {
    await testMakeEndpoint(webhookUrl.trim());
    rl.close();
  });
}

main().catch(console.error);
