import githubExtension from "@github-tools/eve-extension";
import { githubToken } from "@/lib/github-settings";

// Official GitHub tools extension. The token is read on every call, so a token
// saved or removed in Settings applies without a restart. Write tools keep the
// extension's default always-ask approval.
export default githubExtension({
  token: githubToken,
  include: [
    "getRepository",
    "getRepositoryTree",
    "getFileContent",
    "listBranches",
    "searchCode",
    "searchRepositories",
    "searchIssues",
    "listCommits",
    "compareCommits",
    "listPullRequests",
    "getPullRequestContext",
    "listPullRequestFiles",
    "listIssues",
    "getIssueContext",
    "listWorkflowRuns",
    "getCiFailureContext",
    "listNotifications",
    "createIssue",
    "addIssueComment",
    "addPullRequestComment",
    "createPullRequestReview",
    "createBranch",
    "createOrUpdateFile",
    "createPullRequest",
    "mergePullRequest",
    "rerunWorkflowRun",
  ],
});
