#!/usr/bin/env node

/**
 * Script to clean up JavaScript files that were compiled in-place.
 * These files should be in the dist directory instead.
 */

const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

// Directories to scan for .js files that should be removed
const sourceDirs = ['src'];

// Patterns of files to keep even if they are .js
const keepPatterns = [
  // Keep configuration files
  'config.js',
  // Add more patterns here if needed
];

/**
 * Check if a file should be kept
 */
function shouldKeepFile(filePath) {
  return keepPatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Recursively scan a directory and find all .js files that correspond to .ts files
 */
async function scanDirectory(directory) {
  let filesToDelete = [];

  const items = await readdir(directory);

  for (const item of items) {
    const fullPath = path.join(directory, item);
    const stats = await stat(fullPath);

    if (stats.isDirectory()) {
      // Recursively scan subdirectories
      const subDirFiles = await scanDirectory(fullPath);
      filesToDelete = [...filesToDelete, ...subDirFiles];
    } else if (item.endsWith('.js')) {
      // Check if there's a corresponding .ts file
      const tsFile = fullPath.replace('.js', '.ts');
      const tsFileExists = fs.existsSync(tsFile);

      if (tsFileExists && !shouldKeepFile(fullPath)) {
        filesToDelete.push(fullPath);

        // Also delete the source map if it exists
        const mapFile = `${fullPath}.map`;
        if (fs.existsSync(mapFile)) {
          filesToDelete.push(mapFile);
        }
      }
    }
  }

  return filesToDelete;
}

/**
 * Main function
 */
async function main() {
  try {
    let allFilesToDelete = [];

    // Scan all source directories
    for (const dir of sourceDirs) {
      const fullDir = path.join(process.cwd(), dir);
      if (fs.existsSync(fullDir)) {
        const files = await scanDirectory(fullDir);
        allFilesToDelete = [...allFilesToDelete, ...files];
      }
    }

    if (allFilesToDelete.length === 0) {
      console.log('No files to delete.');
      return;
    }

    console.log(`Found ${allFilesToDelete.length} files to delete:`);
    allFilesToDelete.forEach(file => console.log(`- ${path.relative(process.cwd(), file)}`));

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\nProceed with deletion? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        console.log('\nDeleting files...');

        for (const file of allFilesToDelete) {
          try {
            await unlink(file);
            console.log(`Deleted: ${path.relative(process.cwd(), file)}`);
          } catch (err) {
            console.error(`Error deleting ${file}:`, err);
          }
        }

        console.log('\nCleanup complete!');
      } else {
        console.log('\nOperation cancelled.');
      }

      readline.close();
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
main();
