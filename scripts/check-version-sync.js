#!/usr/bin/env node

const fs = require("fs");
const { execFileSync } = require("child_process");

const VERSION_FILES = {
  manifest: "manifest.json",
  popupJs: "popup.js",
  popupHtml: "popup.html",
  changelog: "CHANGELOG.md"
};

const WATCHED_PATTERNS = [
  /^content\.js$/,
  /^popup\.js$/,
  /^popup\.html$/,
  /^background\.js$/,
  /^manifest\.json$/,
  /^get_notion_db\.js$/,
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^docs\//,
  /^scripts\//,
  /^package\.json$/,
  /^\.githooks\//
];

const args = new Set(process.argv.slice(2));
const useStaged = args.has("--staged");

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    }).trim();
  } catch (error) {
    if (options.allowFailure) return "";
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    throw new Error(stderr || error.message);
  }
}

function readFile(path, { staged = false } = {}) {
  if (staged) {
    const stagedContent = runGit(["show", `:${path}`], { allowFailure: true });
    if (stagedContent) return stagedContent;
  }
  return fs.readFileSync(path, "utf8");
}

function readHeadFile(path) {
  return runGit(["show", `HEAD:${path}`], { allowFailure: true });
}

function parseVersion(label, content, pattern) {
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`${label} のバージョン表記が見つかりません。`);
  }
  return match[1];
}

function getVersions({ staged = false } = {}) {
  const manifestJson = JSON.parse(readFile(VERSION_FILES.manifest, { staged }));
  return {
    manifest: manifestJson.version,
    popupJs: parseVersion(
      VERSION_FILES.popupJs,
      readFile(VERSION_FILES.popupJs, { staged }),
      /const\s+VERSION\s*=\s*"v?(\d+\.\d+\.\d+)"/
    ),
    popupHtml: parseVersion(
      VERSION_FILES.popupHtml,
      readFile(VERSION_FILES.popupHtml, { staged }),
      /version\s+(\d+\.\d+\.\d+)/
    ),
    changelog: parseVersion(
      VERSION_FILES.changelog,
      readFile(VERSION_FILES.changelog, { staged }),
      /^## \[(\d+\.\d+\.\d+)\]/m
    )
  };
}

function getHeadManifestVersion() {
  const content = readHeadFile(VERSION_FILES.manifest);
  if (!content) return "";
  return JSON.parse(content).version || "";
}

function getChangedFiles() {
  const diffArgs = useStaged
    ? ["diff", "--cached", "--name-only", "--diff-filter=ACMRT"]
    : ["diff", "--name-only", "HEAD", "--diff-filter=ACMRT"];
  const changed = runGit(diffArgs, { allowFailure: true })
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);

  if (useStaged) return changed;

  const untracked = runGit(["ls-files", "--others", "--exclude-standard"], { allowFailure: true })
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return [...new Set([...changed, ...untracked])];
}

function isWatchedFile(path) {
  return WATCHED_PATTERNS.some(pattern => pattern.test(path));
}

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

function main() {
  const versions = getVersions({ staged: useStaged });
  const uniqueVersions = [...new Set(Object.values(versions))];
  if (uniqueVersions.length !== 1) {
    console.error("バージョン表記が一致していません。");
    for (const [name, version] of Object.entries(versions)) {
      console.error(`- ${name}: ${version}`);
    }
    process.exit(1);
  }

  const currentVersion = versions.manifest;
  const changedFiles = getChangedFiles();
  const watchedChangedFiles = changedFiles.filter(isWatchedFile);
  const headVersion = getHeadManifestVersion();

  if (watchedChangedFiles.length > 0 && headVersion) {
    const versionDiff = compareSemver(currentVersion, headVersion);
    if (versionDiff <= 0) {
      console.error("対象ファイルが変更されていますが、拡張機能のバージョンが上がっていません。");
      console.error(`HEAD: ${headVersion}`);
      console.error(`現在: ${currentVersion}`);
      console.error("変更対象:");
      watchedChangedFiles.forEach(path => console.error(`- ${path}`));
      console.error("manifest.json、popup.js、popup.html、CHANGELOG.md を同じ新バージョンに更新してください。");
      process.exit(1);
    }
  }

  console.log(`バージョンチェックOK: ${currentVersion}`);
}

main();
