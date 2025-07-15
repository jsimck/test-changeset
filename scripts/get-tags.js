#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Script to get all tags that triggered the CI job
 * This script can be run in GitHub Actions and will output the tags
 */

export function getAllTags() {
  try {
    // Get the current tag from GitHub context if available
    const currentTag = process.env.GITHUB_REF_NAME;

    // Get tags for the current commit
    const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const tagsForCurrentCommitOutput = execSync(`git tag --points-at ${currentCommit}`, { encoding: 'utf8' });
    const tagsForCurrentCommit = tagsForCurrentCommitOutput.trim().split('\n').filter(tag => tag.length > 0);

    const result = {
      currentTag: currentTag || null,
      tagsForCurrentCommit: tagsForCurrentCommit,
      currentCommit: currentCommit,
      triggeredBy: process.env.GITHUB_EVENT_NAME || 'unknown'
    };

    // Output as JSON for easy parsing in CI
    console.log(JSON.stringify(result, null, 2));

    // Also output individual values for easy access in bash
    console.log(`\n# Environment variables you can use:`);
    console.log(`CURRENT_TAG=${currentTag || ''}`);
    console.log(`TAGS_FOR_COMMIT=${tagsForCurrentCommit.join(',')}`);

    return result;
  } catch (error) {
    console.error('Error getting tags:', error.message);
    process.exit(1);
  }
}

// If script is run directly (not imported)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  getAllTags();
}
