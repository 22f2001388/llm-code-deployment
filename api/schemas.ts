export const makeSchema = {
  body: {
    type: "object",
    properties: {
      // Old properties, now optional
      email: { type: "string" },
      secret: { type: "string" },
      task: { type: "string" },
      round: { type: "number" },
      nonce: { type: "string" },
      evaluation_url: { type: "string" },

      // New property
      id: { type: "string" },

      // Common properties
      brief: { type: "string" },
      attachments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
          },
          required: ["name", "url"],
        },
      },
      checks: {
        type: "array",
        items: {
          oneOf: [
            { type: "string" },
            {
              type: "object",
              properties: {
                js: { type: "string" },
              },
              required: ["js"],
            },
          ],
        },
      },

      // New round2 property
      round2: {
        type: "array",
        items: {
          type: "object",
          properties: {
            brief: { type: "string" },
            attachments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  url: { type: "string" },
                },
                required: ["name", "url"],
              },
            },
            checks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  js: { type: "string" },
                },
                required: ["js"],
              },
            },
          },
          required: ["brief", "checks"],
        },
      },
    },
  },
  response: {
    202: {
      type: "object",
      properties: {
        message: { type: "string" },
        timestamp: { type: "string" },
      },
    },
    400: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    401: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
    500: {
      type: "object",
      properties: {
        error: { type: "string" },
      },
    },
  },
};

export type ModelName =
  | "gemini-2.5-pro"
  | "gemini-flash-latest"
  | "gemini-flash-lite-latest"
  | "openai/gpt-5-mini";

export interface GenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
  thinkingBudget?: number;
  includeThoughts?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GenerateResponse {
  text: string;
  usage?: TokenUsage;
}

export interface CompressionResult {
  success: boolean;
  compressedHistory: any[];
  originalLength: number;
  compressedLength: number;
  summary?: string;
  error?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  public_repos: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepo {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  url: string;
  language: string | null;
  forks_count: number;
  stargazers_count: number;
  watchers_count: number;
  open_issues_count: number;
  size: number;
  default_branch: string;
  has_issues: boolean;
  has_projects: boolean;
  has_downloads: boolean;
  has_wiki: boolean;
  has_pages: boolean;
  archived: boolean;
  disabled: boolean;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  license: {
    key: string;
    name: string;
    spdx_id: string;
    url: string | null;
  } | null;
}

export interface CreateRepoData {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
  license_template?: string;
}

export interface CommitFileResult {
  commit: {
    sha: string;
    html_url: string;
  };
  content: {
    path: string;
    html_url: string;
  };
}

export interface FileOperation {
  path: string;
  content?: string;
  operation: 'create' | 'update' | 'delete';
}

export interface RepositoryFile {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string;
  html_url: string;
}

export interface GitHubBranch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
  protected: boolean;
}



export interface GitHubPages {
  url: string;
  status: string;
  cname: string | null;
  custom_404: boolean;
  html_url: string;
  build_type: string;
  source: {
    branch: string;
    path: string;
  } | null;
  public: boolean;
}

export interface PagesBuild {
  url: string;
  status: string;
  error: {
    message: string | null;
  };
  pusher: {
    login: string;
  } | null;
  commit: string;
  duration: number;
  created_at: string;
  updated_at: string;
}

export interface PagesSource {
  branch: string;
  path: '/' | '/docs';
}

export interface DeleteResult {
  success: boolean;
  filePath: string;
  result?: any;
  error?: string;
}

export type OperationType = 'create' | 'update' | 'delete';