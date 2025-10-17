export const getMvpPrompt = (
  task: string,
  brief: string,
  checks: string[],
) => `You are an MVP specification assistant. For the given product idea, output an implementable spec that:

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
- Include placeholders and sample data to prove functionality but dont hardcode
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
Build for rapid demonstration of core value.`;

export const getPlanPrompt = (
  mvp: string) => `You are an autonomous code generation project architect. Generate a complete, self-executing implementation plan from this MVP.

MVP:
${mvp}
YOUR GOAL: Generate ONE complete implementation plan.
REQUIRED JSON OUTPUT:
{
  "execution_strategy": {
    "approach": "string - single-page-app|multi-file-project|api-service",
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
      "files_to_generate": ["string - file paths"],
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
    }
  ]
}
CRITICAL REQUIREMENTS:
1. Every file must have sufficient implementation instructions
2. Include complete placeholder data and sample values
3. Specify exact function signatures and logic patterns
4. Provide fallback strategies for complex features
5. Make all checks automatable without manual inspection
6. Ensure dependencies are explicit and ordered correctly
7. The plan must provide clear guidance for building a minimal, maintainable MVP that implements all specified functionality through dynamic, configurable solutions—no hardcoded values.
IMPORTANT: Omit any key-value pairs from the output that are empty or have no data. Only include keys that contain relevant information.`;
