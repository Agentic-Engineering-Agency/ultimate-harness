#!/usr/bin/env node
// Prints the npm dist-tag a package version publishes to: a SemVer prerelease
// (1.2.3-rc.1) goes to `next`, a release (1.2.3) to `latest`.
//
//   node scripts/npm-dist-tag.mjs                       tag for package.json's version
//   node scripts/npm-dist-tag.mjs --for 0.11.0-rc.1     tag for the given version
//   node scripts/npm-dist-tag.mjs --github-prerelease true
//       also fails unless a GitHub release's pre-release flag matches the version
import { readFileSync } from "node:fs";

const SEMVER = /^\d+\.\d+\.\d+(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : (process.argv[index + 1] ?? "");
}

function fail(message) {
  console.error(`npm-dist-tag: ${message}`);
  process.exit(1);
}

const version = option("--for") ?? JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const match = SEMVER.exec(version);
if (!match) fail(`"${version}" is not a SemVer version`);
const prerelease = match[1] !== undefined;

const githubPrerelease = option("--github-prerelease");
if (githubPrerelease) {
  if (githubPrerelease !== "true" && githubPrerelease !== "false") {
    fail(`--github-prerelease must be true or false, got "${githubPrerelease}"`);
  }
  if ((githubPrerelease === "true") !== prerelease) {
    fail(prerelease
      ? `version ${version} is a prerelease, but the GitHub release is not marked as a pre-release`
      : `version ${version} is not a prerelease, but the GitHub release is marked as a pre-release`);
  }
}

console.log(prerelease ? "next" : "latest");
