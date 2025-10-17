import * as https from 'https';
import { config } from "./config";
import { } from "./schemas"; import {
  GitHubUser,
  GitHubRepo,
  CreateRepoData,
  FileOperation,
  RepositoryFile,
  GitHubBranch,
  GitHubPages,
  PagesBuild,
  PagesSource,
} from "./schemas";

class HttpClient {
  constructor(private token: string) { }

  private getRequestOptions(method: string, requestData?: string): https.RequestOptions {
    return {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'User-Agent': 'TypeScript-GitHub-API',
        'Accept': 'application/vnd.github.v3+json',
        ...(requestData && {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData)
        })
      }
    };
  }

  async request<T>(
    url: string,
    method: string = 'GET',
    data?: any
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const requestData = data ? JSON.stringify(data) : undefined;

      const options = this.getRequestOptions(method, requestData);

      const request = https.request(url, options, (response) => {
        let responseData = '';

        response.on('data', (chunk) => {
          responseData += chunk;
        });

        response.on('end', () => {
          try {
            if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
              if (response.statusCode === 204 || (response.statusCode === 200 && responseData === '')) {
                resolve(undefined as T);
              } else {
                resolve(JSON.parse(responseData));
              }
            } else {
              reject(new Error(`HTTP ${response.statusCode}: ${responseData}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      request.on('error', reject);

      if (requestData) {
        request.write(requestData);
      }

      request.end();
    });
  }

  async graphqlRequest<T>(query: string, variables: any): Promise<T> {
    const graphqlData = {
      query,
      variables,
    };
    return this.request<T>('https://api.github.com/graphql', 'POST', graphqlData);
  }
}

export class GitHubService {
  private baseURL = 'https://api.github.com';
  private cachedUser: GitHubUser | null = null;
  private cachedRepos: GitHubRepo[] | null = null;

  constructor(private httpClient: HttpClient) { }

  async getBranchDetails(owner: string, repo: string, branch: string): Promise<GitHubBranch> {
    return this.httpClient.request<GitHubBranch>(
      `${this.baseURL}/repos/${owner}/${repo}/branches/${branch}`
    );
  }

  async getAuthenticatedUser(): Promise<GitHubUser> {
    if (this.cachedUser) {
      return this.cachedUser;
    }
    const user = await this.httpClient.request<GitHubUser>(`${this.baseURL}/user`);
    this.cachedUser = user;
    return user;
  }

  async getUserRepositories(): Promise<GitHubRepo[]> {
    if (this.cachedRepos) {
      return this.cachedRepos;
    }
    const repos = await this.httpClient.request<GitHubRepo[]>(
      `${this.baseURL}/user/repos?sort=updated&per_page=100`
    );
    this.cachedRepos = repos;
    return repos;
  }

  async getRepositoriesByUsername(username: string): Promise<GitHubRepo[]> {
    return this.httpClient.request<GitHubRepo[]>(
      `${this.baseURL}/users/${username}/repos?sort=updated&per_page=100`
    );
  }

  async getRepositoryDetails(owner: string, repo: string): Promise<GitHubRepo> {
    return this.httpClient.request<GitHubRepo>(
      `${this.baseURL}/repos/${owner}/${repo}`
    );
  }

  async createRepository(repoData: CreateRepoData): Promise<GitHubRepo> {
    const newRepo = await this.httpClient.request<GitHubRepo>(
      `${this.baseURL}/user/repos`, 'POST', repoData
    );
    return newRepo;
  }



  private async getRepositoryNodeId(owner: string, repo: string): Promise<string> {
    const repoDetails = await this.getRepositoryDetails(owner, repo);
    return repoDetails.node_id;
  }

  private async getBranchOid(owner: string, repo: string): Promise<string> {
    const branchDetails = await this.getBranchDetails(owner, repo, "main");
    return branchDetails.commit.sha;
  }

  async commitMultipleFiles(
    owner: string,
    repo: string,
    fileOperations: FileOperation[],
    commitMessage: string
  ): Promise<any> {
    const repositoryId = await this.getRepositoryNodeId(owner, repo);
    const branchOid = await this.getBranchOid(owner, repo);

    const fileChanges = {
      additions: fileOperations
        .filter(op => op.operation === 'create' || op.operation === 'update')
        .map(op => ({
          path: op.path,
          contents: Buffer.from(op.content!).toString('base64'),
        })),
      deletions: fileOperations
        .filter(op => op.operation === 'delete')
        .map(op => ({
          path: op.path,
        })),
    };

    const mutation = `
      mutation($input: CreateCommitOnBranchInput!) {
        createCommitOnBranch(input: $input) {
          commit {
            url
          }
        }
      }
    `;

    const variables = {
      input: {
        branch: {
          repositoryNameWithOwner: `${owner}/${repo}`,
          branchName: "main",
        },
        message: {
          headline: commitMessage,
        },
        fileChanges,
        expectedHeadOid: branchOid,
      },
    };

    return this.httpClient.graphqlRequest(mutation, variables);
  }

  async listRepositoryFiles(
    owner: string,
    repo: string,
    path: string = ''
  ): Promise<RepositoryFile[]> {
    const branchDetails = await this.getBranchDetails(owner, repo, "main");
    const treeSha = branchDetails.commit.sha;

    const url = `${this.baseURL}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`;
    const treeResponse = await this.httpClient.request<any>(url);

    const files: RepositoryFile[] = [];

    for (const item of treeResponse.tree) {
      if (item.type === 'blob' && item.path.startsWith(path)) {
        files.push({
          name: item.path.split('/').pop(),
          path: item.path,
          sha: item.sha,
          size: item.size || 0,
          download_url: `https://raw.githubusercontent.com/${owner}/${repo}/main/${item.path}`,
          html_url: `https://github.com/${owner}/${repo}/blob/main/${item.path}`,
        });
      }
    }
    return files;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string
  ): Promise<string> {
    const url = `${this.baseURL}/repos/${owner}/${repo}/contents/${path}?ref=main`;
    const response = await this.httpClient.request<any>(url);
    const content = Buffer.from(response.content, 'base64').toString('utf-8');
    return content;
  }





  async getPagesInfo(owner: string, repo: string): Promise<GitHubPages> {
    return this.httpClient.request<GitHubPages>(
      `${this.baseURL}/repos/${owner}/${repo}/pages`
    );
  }

  async getPagesBuilds(owner: string, repo: string): Promise<PagesBuild[]> {
    return this.httpClient.request<PagesBuild[]>(
      `${this.baseURL}/repos/${owner}/${repo}/pages/builds`
    );
  }

  async getLatestPagesBuild(owner: string, repo: string): Promise<PagesBuild> {
    return this.httpClient.request<PagesBuild>(
      `${this.baseURL}/repos/${owner}/${repo}/pages/builds/latest`
    );
  }

  async enablePages(owner: string, repo: string, source: PagesSource): Promise<GitHubPages> {
    return this.httpClient.request<GitHubPages>(
      `${this.baseURL}/repos/${owner}/${repo}/pages`,
      'POST',
      { source }
    );
  }

  async updatePages(owner: string, repo: string, source: PagesSource): Promise<GitHubPages> {
    return this.httpClient.request<GitHubPages>(
      `${this.baseURL}/repos/${owner}/${repo}/pages`,
      'PUT',
      { source }
    );
  }

  async disablePages(owner: string, repo: string): Promise<void> {
    return this.httpClient.request<void>(
      `${this.baseURL}/repos/${owner}/${repo}/pages`,
      'DELETE'
    );
  }

  async requestPagesBuild(owner: string, repo: string): Promise<PagesBuild> {
    return this.httpClient.request<PagesBuild>(
      `${this.baseURL}/repos/${owner}/${repo}/pages/builds`,
      'POST'
    );
  }

  async enableAndDeployPages(
    owner: string,
    repo: string,
    branch: string = "main",
    path: string = "/"
  ): Promise<string> {
    try {
      await this.enablePages(owner, repo, {
        branch,
        path,
      });

      const maxAttempts = 20;
      const delayMs = 3000;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        try {
          const pagesInfo = await this.getPagesInfo(owner, repo);

          if (pagesInfo.status === "built" && pagesInfo.html_url) {
            return pagesInfo.html_url;
          }
        } catch (error) {
          continue;
        }
      }

      const pagesInfo = await this.getPagesInfo(owner, repo);
      const username = owner.toLowerCase();
      const repoName = repo.toLowerCase();
      return pagesInfo.html_url || `https://${username}.github.io/${repoName}/`;
    } catch (error) {
      if (error instanceof Error && error.message.includes("409")) {
        const pagesInfo = await this.getPagesInfo(owner, repo);
        return pagesInfo.html_url;
      }
      throw error;
    }
  }
}

if (!config.githubToken) {
  console.error("GITHUB_TOKEN not set");
}

const httpClient = new HttpClient(config.githubToken || '');
export const githubService = new GitHubService(httpClient);
