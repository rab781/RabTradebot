/**
 * Script: Fix pino logger call signatures after migration
 * 
 * Transforms patterns like:
 *   logger.error('some message', error)
 *   logger.warn('some message', (error as any)?.message || error)
 * 
 * Into pino-compatible:
 *   logger.error({ err: error }, 'some message')
 *   logger.warn({ err: error }, 'some message')
 * 
 * Usage:
 *   npx ts-node scripts/fix-logger-signatures.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_DIR = path.resolve(__dirname, '..', 'src');
const DRY_RUN = process.argv.includes('--dry-run');

interface FileChange {
    filePath: string;
    replacements: number;
}

function getRelativePath(filePath: string): string {
    return path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
}

function fixLoggerSignatures(content: string): { result: string; count: number } {
    let count = 0;
    let result = content;

    // Pattern 1: logger.error('message', error)  → logger.error({ err: error }, 'message')
    // Pattern 2: logger.error('message:', error)  → logger.error({ err: error }, 'message:')
    // Pattern 3: logger.error(`template ${var}:`, error) → logger.error({ err: error }, `template ${var}:`)
    // Pattern 4: logger.warn('msg', (error as any)?.message || error) → logger.warn({ err: error }, 'msg')
    
    // Match: logger.(error|warn)( stringArg , errorArg );
    // The string argument can be 'single-quoted', `template`, or "double-quoted"
    const patterns = [
        // logger.error('message', error);
        {
            regex: /logger\.(error|warn)\(('(?:[^'\\]|\\.)*'),\s*(?:\(error as (?:any|Error)\)\?\.\s*message\s*\|\|\s*)?(\w+(?:\.\w+)*)\)/g,
            replace: (match: string, level: string, msg: string, errVar: string) => {
                count++;
                return `logger.${level}({ err: ${errVar} }, ${msg})`;
            }
        },
        // logger.error(`message`, error);
        {
            regex: /logger\.(error|warn)\((`(?:[^`\\]|\\.)*`),\s*(?:\(error as (?:any|Error)\)\?\.\s*message\s*\|\|\s*)?(\w+(?:\.\w+)*)\)/g,
            replace: (match: string, level: string, msg: string, errVar: string) => {
                count++;
                return `logger.${level}({ err: ${errVar} }, ${msg})`;
            }
        },
        // logger.error("message", error);
        {
            regex: /logger\.(error|warn)\(("(?:[^"\\]|\\.)*"),\s*(?:\(error as (?:any|Error)\)\?\.\s*message\s*\|\|\s*)?(\w+(?:\.\w+)*)\)/g,
            replace: (match: string, level: string, msg: string, errVar: string) => {
                count++;
                return `logger.${level}({ err: ${errVar} }, ${msg})`;
            }
        },
    ];

    for (const pattern of patterns) {
        result = result.replace(pattern.regex, pattern.replace);
    }

    return { result, count };
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

console.log(`\n📋 Fix Logger Signatures Script`);
console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN' : '✏️  LIVE'}\n`);

const files = walkDir(SRC_DIR);
const changes: FileChange[] = [];
let totalFixes = 0;

for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const { result, count } = fixLoggerSignatures(content);
    
    if (count > 0) {
        const relPath = getRelativePath(file);
        changes.push({ filePath: relPath, replacements: count });
        totalFixes += count;
        console.log(`  ✅ ${relPath}: ${count} fixes`);
        
        if (!DRY_RUN) {
            fs.writeFileSync(file, result, 'utf-8');
        }
    }
}

console.log(`\n─── Summary ───`);
console.log(`  Files fixed: ${changes.length}`);
console.log(`  Total fixes: ${totalFixes}`);

if (DRY_RUN) {
    console.log(`\n⚠️  Dry run. Run without --dry-run to apply.`);
}
