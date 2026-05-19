import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";

const OWNER = "OK-LG";
const REPO = "oklg-agent-hub-fixture";
const REPOSITORY = `${OWNER}/${REPO}`;

function parseIssueNumber(argv) {
  const issueIndex = argv.indexOf("--issue");
  const value = issueIndex === -1 ? null : argv[issueIndex + 1];
  const issueNumber = Number.parseInt(value ?? "", 10);

  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Usage: npm run sandcastle:run -- --issue <issue-number>");
  }

  return issueNumber;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim();
}

async function github(path, options = {}) {
  const token = requiredEnv("GH_TOKEN");
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = body?.message ?? `${response.status} ${response.statusText}`;
    throw new Error(`GitHub API ${path} failed: ${message}`);
  }

  return body;
}

async function createPullRequest(issueNumber, branch) {
  const existing = await github(
    `/repos/${REPOSITORY}/pulls?state=open&head=${OWNER}:${branch}`,
  );

  if (existing.length > 0) {
    return existing[0];
  }

  return github(`/repos/${REPOSITORY}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `Fixture Task: #${issueNumber}`,
      head: branch,
      base: "main",
      body: `Closes #${issueNumber}\n\nAgent Hub fixture loop validation.`,
    }),
  });
}

async function mergePullRequest(issueNumber, pullRequest) {
  return github(`/repos/${REPOSITORY}/pulls/${pullRequest.number}/merge`, {
    method: "PUT",
    body: JSON.stringify({
      commit_title: `Fixture Task: #${issueNumber}`,
      commit_message: `Agent Hub fixture loop validation for #${issueNumber}.`,
      merge_method: "squash",
    }),
  });
}

async function closeIssue(issueNumber, pullRequest) {
  await github(`/repos/${REPOSITORY}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({
      body: `Completed by fixture PR #${pullRequest.number}: ${pullRequest.html_url}`,
    }),
  });
  await github(`/repos/${REPOSITORY}/issues/${issueNumber}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  });
}

async function main() {
  const issueNumber = parseIssueNumber(process.argv.slice(2));
  const token = requiredEnv("GH_TOKEN");
  const branch = `agent-hub-fixture/issue-${issueNumber}-${Date.now()}`;

  exec("git", ["config", "user.name", "Agent Hub Fixture"]);
  exec("git", ["config", "user.email", "agent-hub-fixture@users.noreply.github.com"]);
  exec("git", ["checkout", "-b", branch]);

  mkdirSync("runs", { recursive: true });
  appendFileSync(
    "runs/fixture-loop.log",
    `issue=${issueNumber} branch=${branch} at=${new Date().toISOString()}\n`,
  );

  exec("git", ["add", "runs/fixture-loop.log"]);
  exec("git", ["commit", "-m", `Fixture Task: #${issueNumber}`]);
  exec("git", [
    "push",
    `https://x-access-token:${token}@github.com/${REPOSITORY}.git`,
    `HEAD:${branch}`,
  ]);

  console.log("implement status: complete");

  const pullRequest = await createPullRequest(issueNumber, branch);
  console.log(`pull request: ${pullRequest.html_url}`);
  console.log("review status: approved");

  await mergePullRequest(issueNumber, pullRequest);
  console.log("merge status: merged");

  await closeIssue(issueNumber, pullRequest);
  console.log("issue cleanup status: closed");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`failure reason: ${message}`);
  process.exit(1);
});
