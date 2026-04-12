/**
 * Script: Migrate console.log → structured logger
 * 
 * This script automatically replaces console.log/error/warn calls
 * with the pino-based structured logger across all src/ files.
 * 
 * Usage:
 *   npx ts-node scripts/migrate-console-to-logger.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '..', 'src');
const DRY_RUN = process.argv.includes('--dry-run');

// Files to skip (already use logger, or are debug-only scripts)
const SKIP_FILES = new Set([
    'utils/logger.ts',       // The logger itself
    'debugStrategy.ts',      // Debug scripts can keep console.log
    'debugChart.ts',
]);

// Logger import statement to add
const LOGGER_IMPORT = `import { logger } from '../utils/logger';`;
const LOGGER_IMPORT_DEEP = `import { logger } from '../../utils/logger';`;

interface FileChange {
    filePath: string;
    replacements: number;
    importAdded: boolean;
}

function getRelativePath(filePath: string): string {
    return path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
}

function getLoggerImport(filePath: string): string {
    const rel = getRelativePath(filePath);
    const depth = rel.split('/').length - 1;
    if (depth === 0) return `import { logger } from './utils/logger';`;
    if (depth === 1) return LOGGER_IMPORT;
    if (depth === 2) return LOGGER_IMPORT_DEEP;
    return `import { logger } from '${'../'.repeat(depth)}utils/logger';`;
}

function processFile(filePath: string): FileChange | null {
    const relPath = getRelativePath(filePath);

    if (SKIP_FILES.has(relPath)) {
        return null;
    }

    let content = fs.readFileSync(filePath, 'utf-8');
    let replacements = 0;

    // Replace console.log → logger.info
    const logRegex = /console\.log\(/g;
    const logCount = (content.match(logRegex) || []).length;
    content = content.replace(logRegex, 'logger.info(');
    replacements += logCount;

    // Replace console.error → logger.error
    const errorRegex = /console\.error\(/g;
    const errorCount = (content.match(errorRegex) || []).length;
    content = content.replace(errorRegex, 'logger.error(');
    replacements += errorCount;

    // Replace console.warn → logger.warn
    const warnRegex = /console\.warn\(/g;
    const warnCount = (content.match(warnRegex) || []).length;
    content = content.replace(warnRegex, 'logger.warn(');
    replacements += warnCount;

    if (replacements === 0) {
        return null;
    }

    // Check if logger import already exists
    let importAdded = false;
    const hasLoggerImport = content.includes("from '../utils/logger'") 
        || content.includes("from '../../utils/logger'")
        || content.includes("from './utils/logger'");

    if (!hasLoggerImport) {
        const importLine = getLoggerImport(filePath);
        // Insert after existing imports
        const lastImportIndex = content.lastIndexOf('\nimport ');
        if (lastImportIndex !== -1) {
            const endOfImport = content.indexOf('\n', lastImportIndex + 1);
            content = content.slice(0, endOfImport + 1) + importLine + '\n' + content.slice(endOfImport + 1);
        } else {
            content = importLine + '\n' + content;
        }
        importAdded = true;
    }

    if (!DRY_RUN) {
        fs.writeFileSync(filePath, content, 'utf-8');
    }

    return { filePath: relPath, replacements, importAdded };
}

function walkDir(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkDir(fullPath));
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
            results.push(fullPath);
        }
    }

    return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log(`\n📋 Console → Logger Migration Script`);
console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '✏️  LIVE (writing changes)'}`);
console.log(`   Source Dir: ${SRC_DIR}\n`);

const files = walkDir(SRC_DIR);
const changes: FileChange[] = [];
let totalReplacements = 0;

for (const file of files) {
    const change = processFile(file);
    if (change) {
        changes.push(change);
        totalReplacements += change.replacements;
        const importTag = change.importAdded ? ' (+import)' : '';
        console.log(`  ✅ ${change.filePath}: ${change.replacements} replacements${importTag}`);
    }
}

console.log(`\n─── Summary ───`);
console.log(`  Files modified: ${changes.length}`);
console.log(`  Total replacements: ${totalReplacements}`);

if (DRY_RUN) {
    console.log(`\n⚠️  Dry run complete. Run without --dry-run to apply changes.`);
}
