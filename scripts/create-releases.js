#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

/**
 * Script to create GitHub releases for tagged packages
 * Parses tags like package-name@1.0.0, finds matching packages, and creates releases
 */

async function createReleases() {
  try {
    // Import @actions/github (ES module)
    const { getOctokit, context } = await import('@actions/github');

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.error('GITHUB_TOKEN environment variable is required');
      process.exit(1);
    }

    const octokit = getOctokit(token);

    // Get tags for current commit
    const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const tagsOutput = execSync(`git tag --points-at ${currentCommit}`, { encoding: 'utf8' }).trim();

    if (!tagsOutput) {
      console.log('No tags found for current commit');
      return;
    }

    const tags = tagsOutput.split('\n').filter(tag => tag.length > 0);
    console.log('Found tags:', tags);

    // Read root package.json to get workspace patterns
    const rootPackageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const workspaces = rootPackageJson.workspaces || [];

    console.log('Workspace patterns:', workspaces);

    // Find all package.json files in workspaces
    const packagePaths = [];
    for (const pattern of workspaces) {
      const packageJsonPattern = path.join(pattern, 'package.json');
      const matches = glob.sync(packageJsonPattern);
      packagePaths.push(...matches);
    }

    console.log('Found packages:', packagePaths);

    // Parse tags and match with packages
    for (const tag of tags) {
      console.log(`\nProcessing tag: ${tag}`);

      // Parse tag format: package-name@version
      const match = tag.match(/^(.+)@(.+)$/);
      if (!match) {
        console.log(`Skipping tag ${tag} - doesn't match package@version format`);
        continue;
      }

      const [, packageName, version] = match;
      console.log(`Parsed: package=${packageName}, version=${version}`);

      // Find matching package
      const matchingPackage = packagePaths.find(packagePath => {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        return pkg.name === packageName && pkg.version === version;
      });

      if (!matchingPackage) {
        console.log(`No matching package found for ${packageName}@${version}`);
        continue;
      }

      console.log(`Found matching package: ${matchingPackage}`);

      // Extract changelog for this version
      const packageDir = path.dirname(matchingPackage);
      const changelogPath = path.join(packageDir, 'CHANGELOG.md');

      let releaseNotes = '';
      if (fs.existsSync(changelogPath)) {
        releaseNotes = extractChangelogForVersion(changelogPath, version);
        console.log('Extracted changelog:', releaseNotes.substring(0, 100) + '...');
      } else {
        console.log('No CHANGELOG.md found, using default release notes');
        releaseNotes = `Release ${version} of ${packageName}`;
      }

      // Create GitHub release
      try {
        const release = await octokit.rest.repos.createRelease({
          owner: context.repo.owner,
          repo: context.repo.repo,
          tag_name: tag,
          name: `${packageName} ${version}`,
          body: releaseNotes,
          draft: false,
          prerelease: isPrerelease(version)
        });

        console.log(`✅ Created release for ${tag}: ${release.data.html_url}`);
      } catch (error) {
        if (error.status === 422 && error.message.includes('already_exists')) {
          console.log(`⚠️  Release for ${tag} already exists`);
        } else {
          console.error(`❌ Failed to create release for ${tag}:`, error.message);
        }
      }
    }

  } catch (error) {
    console.error('Error creating releases:', error.message);
    process.exit(1);
  }
}

function extractChangelogForVersion(changelogPath, version) {
  const content = fs.readFileSync(changelogPath, 'utf8');
  const lines = content.split('\n');

  let inVersionSection = false;
  let releaseNotes = [];

  for (const line of lines) {
    // Look for version header (## 1.0.0 or ## [1.0.0])
    if (line.match(new RegExp(`^##\\s+\\[?${escapeRegex(version)}\\]?`))) {
      inVersionSection = true;
      continue;
    }

    // Stop when we hit the next version or end
    if (inVersionSection && line.match(/^##\s+/)) {
      break;
    }

    if (inVersionSection) {
      releaseNotes.push(line);
    }
  }

  return releaseNotes.join('\n').trim() || `Release ${version}`;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPrerelease(version) {
  return /-(alpha|beta|rc|pre)/i.test(version);
}

// Run the script
if (require.main === module) {
  createReleases();
}

module.exports = { createReleases };
