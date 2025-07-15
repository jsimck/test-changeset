#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Advanced script to get all tags that triggered the CI job
 * Supports different output formats and filtering options
 */

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    format: 'json', // json, env, csv, list
    filter: null, // regex pattern to filter tags
    output: null, // file to write output to
    includeCommits: false, // include commit hashes
    sortBy: 'version', // version, date, alphabetical
    limit: null, // limit number of tags returned
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--format':
        options.format = args[++i];
        break;
      case '--filter':
        options.filter = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--include-commits':
        options.includeCommits = true;
        break;
      case '--sort-by':
        options.sortBy = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i]);
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
Usage: node scripts/get-tags-advanced.js [options]

Options:
  --format <type>       Output format: json, env, csv, list (default: json)
  --filter <pattern>    Filter tags by regex pattern
  --output <file>       Write output to file instead of stdout
  --include-commits     Include commit hashes for each tag
  --sort-by <method>    Sort method: version, date, alphabetical (default: version)
  --limit <number>      Limit number of tags returned
  --help, -h           Show this help message

Examples:
  node scripts/get-tags-advanced.js --format env
  node scripts/get-tags-advanced.js --filter "^v[0-9]+" --format list
  node scripts/get-tags-advanced.js --sort-by date --limit 5
  node scripts/get-tags-advanced.js --output tags.json --include-commits
`);
}

function execCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (error) {
    return '';
  }
}

function getAllTagsAdvanced(options = {}) {
  try {
    // Get basic info
    const currentTag = process.env.GITHUB_REF_NAME;
    const currentCommit = execCommand('git rev-parse HEAD');

    // Get all tags with optional sorting
    let sortOption = '--sort=-version:refname'; // default
    if (options.sortBy === 'date') {
      sortOption = '--sort=-creatordate';
    } else if (options.sortBy === 'alphabetical') {
      sortOption = '--sort=refname';
    }

    const allTagsOutput = execCommand(`git tag ${sortOption}`);
    let allTags = allTagsOutput ? allTagsOutput.split('\n').filter(tag => tag.length > 0) : [];

    // Apply filter if provided
    if (options.filter) {
      const regex = new RegExp(options.filter);
      allTags = allTags.filter(tag => regex.test(tag));
    }

    // Apply limit if provided
    if (options.limit && options.limit > 0) {
      allTags = allTags.slice(0, options.limit);
    }

    // Get tags for current commit
    const tagsForCurrentCommitOutput = execCommand(`git tag --points-at ${currentCommit}`);
    const tagsForCurrentCommit = tagsForCurrentCommitOutput ?
      tagsForCurrentCommitOutput.split('\n').filter(tag => tag.length > 0) : [];

    // Get commit info for tags if requested
    const tagsWithCommits = [];
    if (options.includeCommits) {
      for (const tag of allTags) {
        const commitHash = execCommand(`git rev-list -n 1 ${tag}`);
        const commitDate = execCommand(`git log -1 --format=%ci ${tag}`);
        const commitMessage = execCommand(`git log -1 --format=%s ${tag}`);
        tagsWithCommits.push({
          tag,
          commit: commitHash,
          date: commitDate,
          message: commitMessage
        });
      }
    }

    const result = {
      currentTag: currentTag || null,
      allTags: allTags,
      tagsForCurrentCommit: tagsForCurrentCommit,
      currentCommit: currentCommit,
      triggeredBy: process.env.GITHUB_EVENT_NAME || 'unknown',
      ...(options.includeCommits && { tagsWithCommits })
    };

    return result;
  } catch (error) {
    console.error('Error getting tags:', error.message);
    process.exit(1);
  }
}

function formatOutput(data, format) {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);

    case 'env':
      return [
        `CURRENT_TAG=${data.currentTag || ''}`,
        `TAGS_FOR_COMMIT=${data.tagsForCurrentCommit.join(',') || ''}`,
        `ALL_TAGS=${data.allTags.join(',') || ''}`,
        `CURRENT_COMMIT=${data.currentCommit || ''}`,
        `TRIGGERED_BY=${data.triggeredBy || ''}`
      ].join('\n');

    case 'csv':
      if (data.tagsWithCommits) {
        const header = 'tag,commit,date,message';
        const rows = data.tagsWithCommits.map(item =>
          `${item.tag},${item.commit},"${item.date}","${item.message.replace(/"/g, '""')}"`
        );
        return [header, ...rows].join('\n');
      } else {
        return data.allTags.join(',');
      }

    case 'list':
      return data.allTags.join('\n');

    default:
      throw new Error(`Unknown format: ${format}`);
  }
}

// Main execution
if (require.main === module) {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const data = getAllTagsAdvanced(options);
  const output = formatOutput(data, options.format);

  if (options.output) {
    const outputPath = path.resolve(options.output);
    fs.writeFileSync(outputPath, output);
    console.log(`Output written to: ${outputPath}`);
  } else {
    console.log(output);
  }
}

module.exports = { getAllTagsAdvanced, formatOutput };
