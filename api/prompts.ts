export const getPlanPrompt = (task: string, brief: string, checks: string[]) => `
You are a senior full-stack developer and project architect. Create a detailed, executable development plan for this project:

PROJECT TASK: ${task}
PROJECT BRIEF: ${brief}
PROJECT REQUIREMENTS: ${checks.join(', ')}

Generate a comprehensive JSON development plan with this exact structure:
{
  "project_name": "descriptive_project_name",
  "technology_stack": {
    "frontend": ["primary_framework", "supporting_libraries"],
    "backend": ["server_technology", "apis"],
    "styling": ["css_framework", "ui_libraries"],
    "build_tools": ["bundler", "package_manager"],
    "dependencies": ["key_packages_with_versions"]
  },
  "project_structure": [
    {"path": "directory_path/", "type": "directory", "description": "purpose_of_directory"},
    {"path": "file_path.extension", "type": "file", "description": "purpose_of_file", "content_hint": "what_should_be_in_this_file"}
  ],
  "implementation_steps": [
    {
      "id": 1,
      "step_type": "setup|file_creation|code_implementation|configuration|testing",
      "description": "specific_action_to_perform",
      "llm_prompt": "detailed_prompt_to_send_to_llm_for_this_step_including_all_necessary_context",
      "target_files": ["file_path1", "file_path2"],
      "dependencies": [step_ids],
      "validation_criteria": ["how_to_verify_success"],
      "estimated_time_minutes": number
    }
  ],
  "success_criteria": ["measurable_criterion1", "measurable_criterion2"]
}

CRITICAL REQUIREMENTS FOR DIRECTORY STRUCTURE:
- List EVERY directory and file needed for the complete project
- Include ALL nested directories (src/, src/components/, public/, etc.)
- Specify type as "directory" for folders and "file" for files
- For files, include a "content_hint" describing what should be in the file
- Ensure the structure represents the complete folder hierarchy
- Include configuration files, asset directories, and all source code paths

CRITICAL REQUIREMENTS FOR IMPLEMENTATION STEPS:
- Choose the optimal technology stack with specific versions
- Each step must include a detailed LLM prompt that can be executed independently
- Steps should be atomic and self-contained
- Include file paths, dependencies between steps, and validation criteria
- NEVER include repository, GitHub, deployment, or infrastructure steps
- Focus only on project development and implementation

GUIDELINES FOR LLM PROMPTS:
- Each prompt should contain all context needed to generate the required files/code
- Include specific requirements, expected functionality, and technical constraints
- Reference the chosen technology stack and versions
- Make prompts clear and actionable for code generation
- Specify exact file content requirements

Return ONLY the raw JSON without any additional text or markdown.

JSON OUTPUT:
`;
