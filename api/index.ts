import Fastify, {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import dotenv from "dotenv";
import { gemini } from "./geminiClient";
import { getMvpPrompt, getPlanPrompt } from "./prompts";
import { makeSchema } from "./schemas";
import fetch from "node-fetch";
import * as fs from "fs";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

const SECRET_KEY = process.env.SECRET_KEY?.trim();

const logDir = "logs";

if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
}

fs.mkdirSync(logDir);

const logStream = fs.createWriteStream(`${logDir}/api.log`, { flags: "w" });
const detailStream = fs.createWriteStream(`${logDir}/run_details.log`, { flags: "w" });

const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    stream: logStream,
  },
});

async function logDetails(title: string, content: any) {
  const timestamp = new Date().toISOString();
  const formattedContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
  const logEntry = `--- ${title} @ ${timestamp} ---\n\n${formattedContent}\n\n--- END ${title} ---\n\n`;
  await fs.promises.appendFile(`${logDir}/run_details.log`, logEntry);
}

async function processRequest(data: any, log: any) {
  try {
    await fs.promises.writeFile(`${logDir}/run_details.log`, "");
    await logDetails("Request Data", data);

    const { nonce, brief, task, checks, evaluation_url } = data;
    const projectName = `${nonce}-${task}`;
    await logDetails("Project Name", projectName);

    log.info(`${projectName}: Requesting Gemini for MVP`);
    // const mvpPrompt = getMvpPrompt(task, brief, checks);
    // const mvpResponse = await gemini.generate(mvpPrompt, "gemini-flash-lite-latest", {
    //   systemInstruction: "You are an MVP expert who thinks in terms of working prototypes. Always assume the user wants a functional demo with placeholder content rather than a full production system. Your JSON response must be complete and implementable. Never ask for more requirements - make reasonable MVP assumptions. Your response must be a single, valid JSON object. Do not include any markdown formatting (e.g., ```json) or extra text.",
    // });
    // const mvp = JSON.parse(mvpResponse.text);
    const mvp = {
      "definition": {
        "name": "CaptchaSolverMVP",
        "type": "Web App (Frontend + Mock Backend)",
        "core_purpose": "To accept a captcha image URL and return a solved text string, demonstrating the core concept of URL processing and solving within time constraints.",
        "target_demo": "A simple web page with an input field for the URL and a result display area."
      },
      "essential_features": [
        {
          "feature": "URL Input Interface",
          "description": "A form element allowing the user to input a URL pointing to a CAPTCHA image (e.g., ?url=https://example.com/captcha.png)."
        },
        {
          "feature": "Mock Solving Endpoint",
          "description": "A backend route (/solve) that accepts the URL parameter. For the MVP, this will return a hardcoded success response immediately, simulating a fast solve."
        },
        {
          "feature": "Result Display",
          "description": "Display the solved text returned from the mock backend to the user."
        },
        {
          "feature": "License Verification Check",
          "description": "A visible indication (e.g., footer text) confirming the project uses an MIT license."
        }
      ],
      "scope": {
        "included": [
          "Frontend form for URL submission.",
          "Asynchronous request to a local mock API endpoint.",
          "Mock API returns a fixed, valid result ('CAPTCHA_SOLVED_123') within 1 second to meet the 15-second constraint.",
          "Basic responsive CSS (centered layout, clear input/output)."
        ],
        "placeholder_content": [
          "The actual image fetching/OCR logic is entirely mocked.",
          "Sample input URL: 'https://placeholder.com/captcha_abc123.png'.",
          "The solved text returned is always 'MVP_SOLVED_XYZ'."
        ]
      },
      "technology_stack": [
        "HTML5",
        "CSS3 (Basic Flexbox/Grid)",
        "JavaScript (for form handling and fetch API)",
        "Node.js/Express (for simple mock backend serving static response)"
      ],
      "project_structure": [
        "/captcha-solver-mvp",
        "├── /public",
        "│   ├── index.html",
        "│   └── styles.css",
        "├── /server",
        "│   └── server.js (Mock API logic)",
        "└── package.json"
      ],
      "demo_scenarios": [
        {
          "scenario": "Successful Mock Solve",
          "user_action": "User enters a valid-looking URL into the input field and clicks 'Solve'.",
          "expected_result": "The application displays the message 'Captcha Solved Successfully!' and the result text: 'MVP_SOLVED_XYZ' within 2 seconds."
        },
        {
          "scenario": "License Confirmation",
          "user_action": "User views the main page.",
          "expected_result": "The footer or a dedicated section clearly states 'License: MIT'."
        },
        {
          "scenario": "Invalid URL Format Handling (Basic)",
          "user_action": "User submits an empty field.",
          "expected_result": "A client-side validation message appears (e.g., 'Please enter a URL')."
        }
      ],
      "success_criteria": [
        "A working HTML page is accessible.",
        "The page allows input of a URL parameter.",
        "Submitting the form triggers a simulated asynchronous process.",
        "The simulated process returns a result ('MVP_SOLVED_XYZ') in under 15 seconds (simulated time < 2s).",
        "The project root directory contains a LICENSE file stating MIT."
      ]
    }

    log.info({
      message: "MVP parsed successfully",
      projectName: projectName
    });
    await logDetails(`${projectName}: MVP`, mvp);

    log.info(`${projectName}: Requesting Gemini for Plan`);
    // const planPrompt = getPlanPrompt(JSON.stringify(mvp, null, 1));
    // const planChat = gemini.createChat("gemini-2.5-pro", {
    //   temperature: 0.2,
    //   maxOutputTokens: 8192,
    //   thinkingBudget: 8192,
    //   systemInstruction: 'You are a senior technical architect specializing in autonomous AI implementation. Your plans must be so detailed that an AI agent with no domain knowledge can execute them perfectly. Include exact code patterns, complete data structures, and explicit integration logic. Never assume the implementer knows common patterns - spell everything out. Your response must be a single, valid JSON object. Do not include any markdown formatting (e.g., ```json) or extra text.'
    // })
    // const rawPlanResponse = await planChat.sendMessage(planPrompt);
    // let plan = rawPlanResponse
    //   .replace(/```json\n/g, "")
    //   .replace(/\n```/g, "")
    //   .trim();
    // plan = JSON.parse(plan);
    const plan = {
      "execution_strategy": {
        "approach": "multi-file-project",
        "entry_point": "server/server.js"
      },
      "file_manifest": [
        {
          "path": "package.json",
          "purpose": "Defines project metadata, dependencies, and scripts for running the application.",
          "depends_on": [],
          "contains": {
            "functions": [],
            "constants": [],
            "imports": [],
            "exports": []
          }
        },
        {
          "path": "LICENSE",
          "purpose": "Contains the full text of the MIT License to comply with project requirements.",
          "depends_on": [],
          "contains": {
            "functions": [],
            "constants": [],
            "imports": [],
            "exports": []
          }
        },
        {
          "path": "server/server.js",
          "purpose": "Runs a Node.js/Express web server. It serves the static frontend files and provides the mock '/solve' API endpoint.",
          "depends_on": [
            "package.json"
          ],
          "contains": {
            "functions": [
              "startServer()",
              "setupMiddleware()",
              "defineRoutes()"
            ],
            "constants": [
              "PORT",
              "STATIC_ASSETS_PATH",
              "MOCK_SOLVE_DELAY_MS",
              "MOCK_RESPONSE_PAYLOAD"
            ],
            "imports": [
              "express",
              "path"
            ],
            "exports": []
          }
        },
        {
          "path": "public/index.html",
          "purpose": "The main user interface of the web application. Contains the form for URL submission and the area to display results.",
          "depends_on": [
            "public/styles.css"
          ],
          "contains": {
            "functions": [
              "handleFormSubmit(event)"
            ],
            "constants": [
              "API_ENDPOINT"
            ],
            "imports": [],
            "exports": []
          }
        },
        {
          "path": "public/styles.css",
          "purpose": "Provides styling for the HTML elements in index.html to ensure a clean, centered, and responsive layout.",
          "depends_on": [],
          "contains": {
            "functions": [],
            "constants": [],
            "imports": [],
            "exports": []
          }
        }
      ],
      "implementation_sequence": [
        {
          "phase": 1,
          "name": "Project Initialization",
          "files_to_generate": [
            "package.json",
            "LICENSE"
          ],
          "validation_checkpoint": "Execute 'npm install'. The command must complete without errors, creating a 'node_modules' directory."
        },
        {
          "phase": 2,
          "name": "Backend Mock Server Implementation",
          "files_to_generate": [
            "server/server.js"
          ],
          "validation_checkpoint": "Execute 'node server/server.js'. The server must start and log a message. A GET request to 'http://localhost:3000/solve?url=test' using a tool like curl must return the mock JSON payload after a 1-second delay."
        },
        {
          "phase": 3,
          "name": "Frontend Static UI Implementation",
          "files_to_generate": [
            "public/index.html",
            "public/styles.css"
          ],
          "validation_checkpoint": "With the server from Phase 2 running, open 'http://localhost:3000' in a web browser. The page must display a centered form with an input field, a 'Solve' button, a result area, and a footer with the license text."
        },
        {
          "phase": 4,
          "name": "Frontend Logic and API Integration",
          "files_to_generate": [
            "public/index.html"
          ],
          "validation_checkpoint": "On the web page, enter 'https://placeholder.com/captcha_abc123.png' and click 'Solve'. The result area should first show a 'Solving...' message, then update to display 'Captcha Solved Successfully! Result: MVP_SOLVED_XYZ'. Submitting an empty form should trigger the browser's default validation message."
        }
      ],
      "code_generation_instructions": [
        {
          "file": "package.json",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "Set 'name' to 'captcha-solver-mvp'.",
            "Set 'version' to '1.0.0'.",
            "Set 'main' to 'server/server.js'.",
            "Add a 'start' script: 'node server/server.js'.",
            "Add 'express' to dependencies."
          ],
          "placeholder_data": {
            "variables": [],
            "sample_values": [
              "{\"name\": \"captcha-solver-mvp\", \"version\": \"1.0.0\", \"description\": \"MVP for a captcha solving service.\", \"main\": \"server/server.js\", \"scripts\": {\"start\": \"node server/server.js\"}, \"dependencies\": {\"express\": \"^4.18.2\"}}"
            ],
            "mock_responses": []
          },
          "integration_points": [
            "Used by 'npm install' to fetch dependencies.",
            "Used by 'npm start' to run the application."
          ]
        },
        {
          "file": "LICENSE",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "The file must contain the full, standard text of the MIT License.",
            "The copyright year should be the current year.",
            "The copyright holder should be 'Project Contributors'."
          ],
          "placeholder_data": {
            "variables": [
              "[year]",
              "[fullname]"
            ],
            "sample_values": [
              "MIT License\n\nCopyright (c) [year] [fullname]\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: ... (rest of MIT license text)"
            ],
            "mock_responses": []
          },
          "integration_points": []
        },
        {
          "file": "server/server.js",
          "template_strategy": "combine_patterns",
          "key_requirements": [
            "Import 'express' and 'path'.",
            "Define constants: PORT (e.g., 3000), MOCK_SOLVE_DELAY_MS (e.g., 1000), MOCK_RESPONSE_PAYLOAD.",
            "Instantiate an express app: `const app = express();`.",
            "Use `express.static` middleware to serve files from the '../public' directory. Use `path.join(__dirname, '../public')` to create an absolute path.",
            "Define a GET route for '/solve'.",
            "The route handler must accept `req` and `res`.",
            "Inside the handler, check if `req.query.url` exists. If not, send a 400 error.",
            "Use `setTimeout` to delay the response by `MOCK_SOLVE_DELAY_MS`.",
            "Inside the timeout callback, send the `MOCK_RESPONSE_PAYLOAD` as a JSON response: `res.json(MOCK_RESPONSE_PAYLOAD)`.",
            "Start the server with `app.listen(PORT, ...)` and log a confirmation message."
          ],
          "placeholder_data": {
            "variables": [
              "PORT",
              "MOCK_SOLVE_DELAY_MS",
              "MOCK_RESPONSE_PAYLOAD"
            ],
            "sample_values": [
              "const PORT = process.env.PORT || 3000;",
              "const MOCK_SOLVE_DELAY_MS = 1000;",
              "const MOCK_RESPONSE_PAYLOAD = { status: 'success', solution: 'MVP_SOLVED_XYZ' };"
            ],
            "mock_responses": []
          },
          "integration_points": [
            "Serves `public/index.html` on the root route '/'",
            "Responds to fetch requests from the script in `public/index.html` at the '/solve' endpoint."
          ]
        },
        {
          "file": "public/index.html",
          "template_strategy": "combine_patterns",
          "key_requirements": [
            "Standard HTML5 boilerplate (`<!DOCTYPE html>`, `<html>`, `<head>`, `<body>`).",
            "Link to `styles.css` in the `<head>`.",
            "Body must contain a `<main>` element.",
            "Inside `<main>`, create a `<form id=\"captchaForm\">`.",
            "The form must contain an `<input type=\"url\" id=\"captchaUrlInput\" placeholder=\"Enter captcha image URL\" required>` and a `<button type=\"submit\" id=\"solveButton\">Solve</button>`.",
            "Below the form, create a `<div id=\"resultContainer\"></div>`.",
            "Create a `<footer>` with the text 'License: MIT'.",
            "Add a `<script>` tag before the closing `</body>` tag.",
            "Inside the script:",
            "  - Get references to the form, input, button, and result container elements using `document.getElementById`.",
            "  - Add a 'submit' event listener to the form.",
            "  - The event handler function `handleFormSubmit(event)` must call `event.preventDefault()`.",
            "  - Inside the handler, set `resultContainer.innerHTML = '<p>Solving...</p>';` and disable the submit button.",
            "  - Get the URL value from the input: `const url = captchaUrlInput.value;`.",
            "  - Construct the API endpoint URL: `const apiEndpoint = `/solve?url=${encodeURIComponent(url)}`;`.",
            "  - Use `fetch(apiEndpoint)` to make the request.",
            "  - Chain `.then(response => response.json())` to parse the JSON.",
            "  - Chain `.then(data => { ... })` to handle the successful response. Inside, check if `data.status === 'success'` and update `resultContainer.innerHTML` with the solution: `resultContainer.innerHTML = `<p class='success'>Captcha Solved Successfully! Result: ${data.solution}</p>`;`.",
            "  - Chain `.catch(error => { ... })` to handle errors. Update `resultContainer.innerHTML` with an error message.",
            "  - Use a `finally { ... }` block to re-enable the submit button."
          ],
          "placeholder_data": {
            "variables": [],
            "sample_values": [],
            "mock_responses": []
          },
          "integration_points": [
            "Loads `public/styles.css` for styling.",
            "The embedded JavaScript makes a GET request to the `/solve` endpoint on `server/server.js`."
          ]
        },
        {
          "file": "public/styles.css",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "Use a universal box-sizing rule: `* { box-sizing: border-box; }`.",
            "Style `body` to be a flex container to center content: `display: flex; justify-content: center; align-items: center; min-height: 100vh;`.",
            "Style the main container/form wrapper with a `max-width`, `padding`, and `border` for a clean look.",
            "Style the `input` and `button` elements to have consistent padding, font-size, and margins.",
            "Style the `resultContainer` with a minimum height and some top margin.",
            "Create utility classes for success and error messages (e.g., `.success { color: green; }`, `.error { color: red; }`).",
            "Style the `footer` to be unobtrusive (e.g., small font size, muted color)."
          ],
          "placeholder_data": {
            "variables": [],
            "sample_values": [],
            "mock_responses": []
          },
          "integration_points": [
            "Linked from `public/index.html` to style the UI."
          ]
        }
      ],
      "verification_checklist": [
        {
          "target_file": "package.json",
          "check": "File exists in the project root.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "LICENSE",
          "check": "File exists in the project root.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "server/server.js",
          "check": "File exists in the 'server' directory.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "public/index.html",
          "check": "File exists in the 'public' directory.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "public/styles.css",
          "check": "File exists in the 'public' directory.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "package.json",
          "check": "Contains '\"express\":' as a dependency.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "package.json",
          "check": "Contains '\"start\": \"node server/server.js\"' script.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "LICENSE",
          "check": "Contains the string 'MIT License'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "server/server.js",
          "check": "Contains the string `app.get('/solve'`. ",
          "validation_method": "content_contains"
        },
        {
          "target_file": "public/index.html",
          "check": "Contains the string 'id=\"captchaForm\"'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "public/index.html",
          "check": "Contains the string `fetch('/solve?url=`. ",
          "validation_method": "content_contains"
        },
        {
          "target_file": "public/index.html",
          "check": "Contains the string 'License: MIT'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": null,
          "check": "Command 'npm install' completes successfully.",
          "validation_method": "runs_without_error"
        },
        {
          "target_file": "server/server.js",
          "check": "Command 'npm start' or 'node server/server.js' starts the server and does not exit immediately.",
          "validation_method": "runs_without_error"
        }
      ],
      "dependency_resolution": {
        "external_libraries": [
          {
            "name": "express",
            "version": "^4.18.2",
            "installation_command": "npm install express@^4.18.2",
            "import_statement": "const express = require('express');"
          }
        ]
      },
      "fallback_strategies": [
        {
          "if_fails": "Express server setup proves too complex or has dependency issues.",
          "then_do": "Use Node.js's built-in 'http' module. Create a server with `http.createServer` and manually parse the URL and query parameters to handle the '/solve' route and serve the 'index.html' file.",
          "simplified_version": true
        },
        {
          "if_fails": "The `fetch` API in the browser-side JavaScript is not working as expected or needs to support older browsers.",
          "then_do": "Replace the `fetch` call with a traditional `XMLHttpRequest` object to make the asynchronous API call.",
          "simplified_version": false
        },
        {
          "if_fails": "CSS Flexbox layout is not rendering correctly.",
          "then_do": "Revert to a simpler CSS centering method. For the main container, use `max-width` and `margin: 20px auto;` to center it horizontally. Use `text-align: center;` on parent elements for text.",
          "simplified_version": true
        }
      ]
    }

    log.info({
      message: "Plan parsed successfully",
      projectName: projectName
    });
    await logDetails(`${projectName}: Plan`, plan);
    return;

    await logDetails(
      "Project Structure",
      jsonPlan.project_structure
        .map(
          (item: any) => `
${item.type === "directory" ? "📁" : "📄"} ${item.path} - ${item.description}${item.content_hint ? `\n   💡 ${item.content_hint}` : ""}`,
        )
        .join(""),
    );

    if (jsonPlan.implementation_steps) {
      const stepResults = [];
      for (const step of jsonPlan.implementation_steps) {
        log.info(`Executing step ${step.id}: ${step.description}`);
        try {
          let fileContents = "";
          for (const file of step.target_files) {
            try {
              const content = await fs.promises.readFile(file, "utf-8");
              fileContents += `--- file: ${file} ---\n${content}\n--- endfile ---\n\n`;
            } catch (error) {
              fileContents += `--- file: ${file} ---
This file is new and does not have any content yet.
--- endfile ---
\n`;
            }
          }

          let isUpdate = false;
          for (const file of step.target_files) {
            try {
              await fs.promises.access(file, fs.constants.F_OK);
              isUpdate = true;
              break;
            } catch (error) { }
          }

          const model = isUpdate
            ? "gemini-flash-latest"
            : "gemini-flash-lite-latest";
          log.info(`Using model: ${model}`);

          const promptWithContext = `Here is the current content of the files you need to modify:\n\n${fileContents}${step.llm_prompt}`;

          const stepResponse = await sendPrompt(promptWithContext, model);
          await logDetails(`Step ${step.id} Content`, stepResponse);

          const fileUpdates = stepResponse.split("--- file: ");
          for (const update of fileUpdates) {
            if (update.trim()) {
              const [filePath, ...contentParts] = update.split(" ---\n");
              const newContent = contentParts
                .join(" ---\n")
                .replace(/--- endfile ---/g, "")
                .trim();
              await fs.promises.writeFile(filePath.trim(), newContent);
            }
          }

          log.info(`Step ${step.id} completed successfully`);
          stepResults.push({
            id: step.id,
            success: true,
            response: stepResponse,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          log.error(`Step ${step.id} failed:`, error);
          stepResults.push({
            id: step.id,
            success: false,
            error: errorMessage,
          });
        }
      }
      await logDetails("Step Results", stepResults);
      await sendCallback(
        evaluation_url,
        { success: true, plan: jsonPlan, stepResults },
        log,
      );
    } else {
      await sendCallback(
        evaluation_url,
        { success: true, plan: jsonPlan, stepResults: [] },
        log,
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error({
      error: "Gemini processing failed",
      message: errorMessage,
    });
    await logDetails("Processing Error", errorMessage);
    await sendCallback(
      data.evaluation_url,
      { success: false, error: errorMessage },
      log,
    );
  }
}

async function sendCallback(url: string, data: any, log: any) {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    log.info(`Callback sent to ${url}`);
  } catch (error) {
    log.error(`Failed to send callback to ${url}:`, error);
  }
}

fastify.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
  return reply.send({ message: "API is working" });
});

fastify.post(
  "/make",
  { schema: makeSchema },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const data = request.body as any;

    if (!SECRET_KEY) {
      return reply.status(500).send({ error: "Server secret not configured" });
    }

    if (String(data.secret).trim() !== SECRET_KEY) {
      return reply.status(401).send({ error: "Invalid secret key" });
    }

    reply.status(202).send({
      status: "accepted",
      timestamp: new Date().toISOString(),
    });

    processRequest(data, fastify.log);
  },
);

const start = async () => {
  try {
    const PORT = Number(process.env.PORT) || 3000;
    await fastify.listen({ port: PORT, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
