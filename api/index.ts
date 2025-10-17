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
const appLog = `${logDir}/api.log`
const reviewLog = `${logDir}/run_details.log`

if (fs.existsSync(logDir)) {
  fs.rmSync(logDir, { recursive: true, force: true });
}
fs.mkdirSync(logDir);
const logStream = fs.createWriteStream(`${appLog}`, { flags: "w" });
fs.closeSync(fs.openSync(`${reviewLog}`, 'w'));

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
  await fs.promises.appendFile(`${reviewLog}`, logEntry);
}

async function processRequest(data: any, log: any) {
  try {
    await logDetails("Request Data", data);

    const { nonce, brief, task, checks, evaluation_url } = data;
    const projectName = `${nonce}-${task}`;
    await logDetails("Project Name", projectName);

    log.info(`${projectName}: Requesting Gemini for MVP`);
    // const mvpPrompts = getMvpPrompt(task, brief, checks);
    // const mvpResponse = await gemini.generate(mvpPrompts[0], "gemini-flash-lite-latest", {
    //   systemInstruction: mvpPrompts[1],
    // });
    // const mvp = JSON.parse(mvpResponse.text);
    const mvp = {
      "definition": {
        "name": "Captcha Solver MVP (ABC123)",
        "type": "Web App (Single Page)",
        "core_purpose": "To accept a captcha image URL and return a solved text string rapidly.",
        "target_demo": "A web page with an input field for a URL, a 'Solve' button, and a display area for the resulting text."
      },
      "essential_features": [
        {
          "feature": "URL Input Field",
          "description": "A text input where the user pastes the captcha image URL (e.g., ?url=https...image.png)."
        },
        {
          "feature": "Solve Initiation",
          "description": "A button that triggers the solving process upon click."
        },
        {
          "feature": "Placeholder Solver Logic",
          "description": "Simulated backend logic that returns a hardcoded or derived 'solved' text based on the input URL structure, ensuring the 15-second check passes instantly."
        },
        {
          "feature": "Result Display",
          "description": "An area to show the 'solved' text or an error message."
        },
        {
          "feature": "License Display",
          "description": "A footer or dedicated section explicitly stating the project uses the MIT License."
        }
      ],
      "scope": {
        "included": [
          "Frontend UI for URL input and result display.",
          "Client-side function simulating a backend API call.",
          "Instantaneous return of a placeholder solution to meet the time constraint.",
          "Basic layout structure (HTML/CSS)."
        ],
        "placeholder_content": [
          "The actual image processing/OCR logic is entirely mocked.",
          "The solved text will be a static string (e.g., 'MOCK_SOLVED_ABC123') or derived from the input URL to simulate success."
        ]
      },
      "technology_stack": [
        "HTML5",
        "CSS3 (Basic Flexbox for responsiveness)",
        "JavaScript (Vanilla JS for rapid prototyping)"
      ],
      "project_structure": [
        "index.html (Main page structure and logic)",
        "style.css (Basic styling)",
        "solver.js (JavaScript logic and placeholder solver function)"
      ],
      "demo_scenarios": [
        {
          "scenario": "Successful Simulated Solve",
          "user_action": "User enters a valid-looking URL into the input field and clicks 'Solve'.",
          "expected_result": "The result area displays the placeholder solved text (e.g., 'CAPTCHA_SOLVED: 78F2A') within 1 second."
        },
        {
          "scenario": "License Visibility Check",
          "user_action": "User navigates to the page.",
          "expected_result": "The page clearly displays text indicating the project is under the MIT License."
        },
        {
          "scenario": "Empty Input Handling",
          "user_action": "User clicks 'Solve' without entering a URL.",
          "expected_result": "The result area displays an error message like 'Please provide a URL.'"
        }
      ],
      "success_criteria": [
        "A single HTML file structure can be opened in a browser.",
        "The page successfully accepts a URL input.",
        "Clicking 'Solve' triggers the placeholder logic and displays output immediately (well under 15 seconds).",
        "The page explicitly mentions the MIT License."
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
    //   systemInstruction: planPrompt[1]
    // })
    // const rawPlanResponse = await planChat.sendMessage(planPrompt[0]);
    // let plan = rawPlanResponse
    //   .replace(/```json\n/g, "")
    //   .replace(/\n```/g, "")
    //   .trim();
    // plan = JSON.parse(plan);
    const plan = {
      "execution_strategy": {
        "approach": "client-side-app",
        "entry_point": "/index.html"
      },
      "file_manifest": [
        {
          "path": "/.gitignore",
          "purpose": "Specifies intentionally untracked files to ignore.",
          "depends_on": [],
          "contains": {}
        },
        {
          "path": "/LICENSE.txt",
          "purpose": "Contains the project's license information (MIT).",
          "depends_on": [],
          "contains": {}
        },
        {
          "path": "/index.html",
          "purpose": "The main HTML file that defines the structure of the web application.",
          "depends_on": [],
          "contains": {
            "dom_elements": [
              "form#captcha-form",
              "input#url-input",
              "button#solve-button",
              "div#loader",
              "div#result-display"
            ]
          }
        },
        {
          "path": "/style.css",
          "purpose": "Provides styling for the web application to ensure a clean and responsive layout.",
          "depends_on": [
            "/index.html"
          ],
          "contains": {
            "css_selectors": [
              "body",
              ".container",
              "form",
              "input[type='text']",
              "button",
              ".loader",
              ".hidden"
            ]
          }
        },
        {
          "path": "/app.js",
          "purpose": "Contains the client-side logic for handling user input, simulating the API call, and updating the UI.",
          "depends_on": [
            "/index.html"
          ],
          "contains": {
            "functions": [
              "mockCaptchaSolver(url)",
              "handleFormSubmit(event)",
              "init()"
            ],
            "constants": [
              "MOCK_SOLVED_TEXT",
              "MOCK_API_DELAY_MS"
            ]
          }
        }
      ],
      "implementation_sequence": [
        {
          "phase": 0,
          "name": "Project Initialization",
          "file_to_generate": "/LICENSE.txt",
          "dependencies": [],
          "validation_checkpoint": "Verify that LICENSE.txt exists and contains the specified license text."
        },
        {
          "phase": 0,
          "name": "Project Initialization",
          "file_to_generate": "/.gitignore",
          "dependencies": [],
          "validation_checkpoint": "Verify that .gitignore exists and contains standard ignores."
        },
        {
          "phase": 1,
          "name": "HTML Structure Definition",
          "file_to_generate": "/index.html",
          "dependencies": [],
          "validation_checkpoint": "The file /index.html should exist and be parsable as HTML, containing the main structural elements like a form and result div."
        },
        {
          "phase": 2,
          "name": "CSS Styling",
          "file_to_generate": "/style.css",
          "dependencies": [
            "/index.html"
          ],
          "validation_checkpoint": "The file /style.css should exist and contain valid CSS rules for the elements defined in index.html."
        },
        {
          "phase": 3,
          "name": "Core Application Logic",
          "file_to_generate": "/app.js",
          "dependencies": [
            "/index.html"
          ],
          "validation_checkpoint": "The file /app.js should exist and contain valid JavaScript, including the function definitions for form handling and the mock solver."
        },
        {
          "phase": 4,
          "name": "Final Integration",
          "file_to_update": "/index.html",
          "dependencies": [
            "/style.css",
            "/app.js"
          ],
          "validation_checkpoint": "The file /index.html must contain a <link> tag for /style.css in the <head> and a <script> tag for /app.js before the closing </body> tag."
        }
      ],
      "code_generation_instructions": [
        {
          "file": "/LICENSE.txt",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "The file must contain the full text of the MIT License.",
            "The copyright year should be the current year.",
            "The copyright holder should be a placeholder like '[fullname]'."
          ],
          "placeholder_data": {
            "type": "MIT"
          }
        },
        {
          "file": "/.gitignore",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "Create a text file named .gitignore.",
            "Add entries for common files and directories to ignore, such as 'node_modules', '.env', and OS-specific files like '.DS_Store'."
          ]
        },
        {
          "file": "/index.html",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "Use HTML5 doctype.",
            "Set the viewport for responsiveness: <meta name='viewport' content='width=device-width, initial-scale=1.0'>.",
            "Create a main container div.",
            "Inside the container, create a <form> with id 'captcha-form'.",
            "The form must contain an <input type='text'> with id 'url-input', a placeholder 'Enter Captcha Image URL', and be required.",
            "The form must contain a <button type='submit'> with id 'solve-button' and text 'Solve'.",
            "Below the form, create a <div id='loader' class='loader hidden'></div> for the loading indicator.",
            "Below the loader, create a <div id='result-display'></div> to show the solved text."
          ],
          "integration_points": [
            "A <link rel='stylesheet' href='style.css'> tag must be placed inside the <head>.",
            "A <script src='app.js' defer></script> tag must be placed just before the closing </body> tag."
          ]
        },
        {
          "file": "/style.css",
          "template_strategy": "from_scratch",
          "key_requirements": [
            "Apply a simple box-sizing reset: * { box-sizing: border-box; }.",
            "Style 'body' with a clean font (e.g., sans-serif) and a light background color.",
            "Create a '.container' class to center the content on the page using Flexbox: display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh;.",
            "Style the form elements ('input', 'button') for better usability and appearance (e.g., padding, border, width).",
            "Create a '.loader' class for a simple CSS loading spinner.",
            "Create a '.hidden' utility class with 'display: none;' to toggle visibility of elements like the loader."
          ]
        },
        {
          "file": "/app.js",
          "template_strategy": "combine_patterns",
          "key_requirements": [
            "Define constants for the mock response and delay to avoid magic numbers.",
            "Implement the `mockCaptchaSolver` function. It must accept one argument, `url`. It must return a `Promise`. Inside the promise, use `setTimeout` to simulate a network delay. After the delay, the promise should resolve with the `MOCK_SOLVED_TEXT` constant.",
            "Implement the `handleFormSubmit` function. It must be an `async` function that accepts the `event` object. It must call `event.preventDefault()`. It should get the DOM elements for the loader and result display. It must clear any previous results and show the loader. It should then `await` the result of `mockCaptchaSolver`. Finally, it must hide the loader and display the result in the result display element.",
            "Add a DOMContentLoaded event listener to get the form element and attach the `handleFormSubmit` function to its 'submit' event."
          ],
          "placeholder_data": {
            "variables": [
              "MOCK_SOLVED_TEXT",
              "MOCK_API_DELAY_MS"
            ],
            "sample_values": [
              "CAPTCHA_SOLVED_ABC123",
              "2500"
            ],
            "mock_responses": [
              "{ \"solution\": \"CAPTCHA_SOLVED_ABC123\" }"
            ]
          },
          "integration_points": [
            "Uses `document.getElementById` to select 'captcha-form', 'url-input', 'loader', and 'result-display' from index.html.",
            "The main logic is triggered by the 'submit' event on the 'captcha-form' element."
          ]
        }
      ],
      "verification_checklist": [
        {
          "target_file": "/LICENSE.txt",
          "check": "File exists and is not empty.",
          "validation_method": "file_exists"
        },
        {
          "target_file": "/LICENSE.txt",
          "check": "File content contains the string 'MIT License'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "File contains a <form> element with id 'captcha-form'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "File contains an <input> element with id 'url-input'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "File contains a <div> element with id 'result-display'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "File contains the tag <link rel=\"stylesheet\" href=\"style.css\">.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "File contains the tag <script src=\"app.js\" defer>.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/app.js",
          "check": "File content contains the function definition for 'mockCaptchaSolver'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/app.js",
          "check": "File content contains the function definition for 'handleFormSubmit'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/app.js",
          "check": "File content contains 'addEventListener(\"submit\"'.",
          "validation_method": "content_contains"
        },
        {
          "target_file": "/index.html",
          "check": "The application loads and runs without any JavaScript errors in the browser console.",
          "validation_method": "runs_without_error"
        }
      ],
      "fallback_strategies": [
        {
          "if_fails": "Implementing the asynchronous Promise-based `mockCaptchaSolver` with `setTimeout` is too complex.",
          "then_do": "Implement `mockCaptchaSolver` as a simple synchronous function that immediately returns the hardcoded string. The `handleFormSubmit` function will no longer need to be `async` or use `await`.",
          "simplified_version": true
        },
        {
          "if_fails": "CSS Flexbox layout for centering content is not working as expected.",
          "then_do": "Use a simpler CSS layout method. Set a `max-width` on the container and use `margin: 0 auto;` to center it horizontally. Vertical centering can be omitted for the MVP.",
          "simplified_version": true
        }
      ],
      "hosting_compatibility": {
        "platform": "github-pages",
        "is_static_only": true,
        "requires_build_step": false
      }
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
