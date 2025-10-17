export const getMvpPrompt = (
  task: string,
  brief: string,
  checks: string[],
) => [`You are an MVP specification assistant. For the given product idea, output an implementable spec that:

SCOPE:
- Include all explicitly requested features
- Fill unstated details with practical defaults (styling, data, edge cases)
- Choose the simplest implementation that satisfies requirements
- For the blockers assume them in a easy to implement and make MVP fast
REQUESTED:
- Task: ${task}
- Brief: ${brief}
- Checks: ${checks}
CONSTRAINTS:
- Working prototype with core functionality only
- Basic responsive styling by default
- Prioritize demonstrable features over complex logic
- Include placeholders but don't hardcode
REQUIRED JSON OUTPUT:
{
  "definition": {
    "name": "string",
    "type": "string (e.g., web app, desktop tool, API)",
    "core_purpose": "string",
    "target_demo": "string"
  },
  "essential_features": [
    {
      "feature": "string",
      "description": "string",
    }
  ],
  "scope": {
    "included": ["string - what will work"],
    "placeholder_content": ["string - what uses dummy data"]
  },
  "technology_stack": ["list - of technologies required to build this mvp"],
  "project_structure": ["proper structure"],
  "demo_scenarios": [
    {
      "scenario": "string",
      "user_action": "string",
      "expected_result": "string"
    }
  ],
  "success_criteria": ["string - what proves MVP works"],
}
Build for rapid demonstration of core value.`,
    "You are an MVP expert who thinks in terms of working prototypes. Always assume the user wants a functional demo with placeholder content rather than a full production system. Your JSON response must be complete and implementable. Never ask for more requirements - make reasonable MVP assumptions. Your response must be a single, valid JSON object. Do not include any markdown formatting (e.g., ```json) or extra text."];

export const getPlanPrompt = (
  mvp: string) => [`You are an autonomous code generation project architect. Generate a complete, self-executing implementation plan from this MVP.

MVP:
${mvp}
YOUR GOAL: Generate ONE complete implementation plan.
REQUIRED JSON OUTPUT:
{
  "execution_strategy": {
    "approach": "static-spa|static-multi-page|client-side-app",
    "entry_point": "string - main file to start execution",
  },
  "file_manifest": [
    {
      "path": "string",
      "purpose": "string - what this file does",
      "depends_on": ["string - files that must exist first"],
      "contains": {
        "functions": ["string - function names to implement"],
        "constants": ["string - constants to define"],
        "imports": ["string - what to import"],
        "exports": ["string - what to export"]
      }
    }
  ],
  "implementation_sequence": [
    {
      "phase": "number",
      "name": "string - phase name",
      "file_to_generate": "string - file path",
      "file_to_update": "string - file path",
      "dependencies": ["string - file path"],
      "validation_checkpoint": "string - how to verify this phase works",
    }
  ],
  "code_generation_instructions": [
    {
      "file": "string",
      "template_strategy": "from_scratch|adapt_example|combine_patterns",
      "key_requirements": ["string - must-have features"],
      "placeholder_data": {
        "variables": ["string"],
        "sample_values": ["string"],
        "mock_responses": ["string"]
      },
      "integration_points": ["string - how it connects to other files"]
    }
  ],
  "verification_checklist": [
    {
      "target_file": "string or null",
      "check": "string - can be from original checks or better",
      "validation_method": "file_exists|content_contains|runs_without_error",
    }
  ],
  "dependency_resolution": {
    "external_libraries": [
      {
        "name": "string",
        "version": "string or latest",
        "installation_command": "string",
        "import_statement": "string"
      }
    ],
  "fallback_strategies": [
    {
      "if_fails": "string - what might go wrong",
      "then_do": "string - alternative approach",
      "simplified_version": "boolean"
    },
  "hosting_compatibility": {
      "platform": "github-pages",
      "is_static_only": true,
      "requires_build_step": "boolean",
      "build_output_directory": "string - e.g., dist, build, public"
    }
  ]
}
GITHUB PAGES CONSTRAINT:
Output must be static-only (HTML/CSS/JS). No server execution. For dynamic features, use client-side JS or external APIs only. I want the project to be deployed on github pages.

CRITICAL REQUIREMENTS:
1. Every file must have sufficient implementation instructions
2. Include complete placeholder data and sample values
3. Specify exact function signatures and logic patterns
4. Provide fallback strategies for complex features
5. Make all checks automatable without manual inspection
6. Ensure dependencies are explicit and ordered correctly
7. The plan must provide clear guidance for building a minimal, maintainable MVP that implements all specified functionality through dynamic, configurable solutions—no hardcoded values.
8. First phase should be 0 and it should contain the initialization like gitignore and LICENSE.
9. For LICENSE don't share placeholder_data only return one word type (ex. "MIT" or "Apache")
IMPORTANT: Omit any key-value pairs from the output that are empty or have no data. Only include keys that contain relevant information.`,
    'You are a senior technical architect specializing in autonomous AI implementation. Your plans must be so detailed that an AI agent with no domain knowledge can execute them perfectly. Include exact code patterns, complete data structures, and explicit integration logic. Never assume the implementer knows common patterns - spell everything out. Your response must be a single, valid JSON object. Do not include any markdown formatting (e.g., ```json) or extra text.'];