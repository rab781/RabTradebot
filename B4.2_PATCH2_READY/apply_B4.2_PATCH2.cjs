const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const mode = process.argv[2] || '--check';
if (!['--check', '--apply'].includes(mode)) {
  console.error('Usage: node apply_B4.2_PATCH2.cjs --check|--apply');
  process.exit(2);
}

const repoRoot = process.cwd();
const packageRoot = __dirname;
const payloadRoot = path.join(packageRoot, 'payload');

const expected = {
  "src/services/realTradingEngine.ts": "2345060854792c6ae59245f49a02824f8437b8149cb8ad96d69b3ef8c8be03dc",
  "src/services/execution/spotExecutionBroker.ts": "4e018948e9cad53cf2430fbe3da809bec745b10d54e48a2f0eadd160aa0e2750",
  "tests/fase1-live-engine.test.ts": "f4b7888d3a6a06914e3a5b144cdc61221d43aa8447a9e3aa26afe87a1e8bc3ba"
};
const desired = {
  "src/services/realTradingEngine.ts": "71286f798b56209a2ff19feedeef2c645c382652b9a2e8e6c48f412fedd647df",
  "src/services/execution/spotExecutionBroker.ts": "ade9555d37ce4fe16ce6a3343a5bce50ae833f14d9727dc9293a3ef303910ed0",
  "src/services/execution/spotOnlyExecutionRouter.ts": "f7cbce1c4a9f738df32e8de814a4da2377e946a91db797553463e243facdb932",
  "tests/fase1-live-engine.test.ts": "6db25056e63adae0cb45dfdad185b07277fc541c50c96b03b0035c8e72c42b11",
  "tests/realTradingEngine.b4-2-router.test.ts": "3a4d506c2d9709e2963cd0640ace3aae75a6148a3c39cb1c9361208055fb8335",
  "tests/spotExecutionBroker.b4-2-reconciliation.test.ts": "6773c617ca5a55571c610e332cda41e21a3d6c7c6c7aa3feaab385ac44bf2b4c"
};

const newFiles = new Set([
  'src/services/execution/spotOnlyExecutionRouter.ts',
  'tests/realTradingEngine.b4-2-router.test.ts',
  'tests/spotExecutionBroker.b4-2-reconciliation.test.ts',
]);

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function repoPath(rel) {
  return path.join(repoRoot, ...rel.split('/'));
}

function payloadPath(rel) {
  return path.join(payloadRoot, ...rel.split('/'));
}

function fail(message) {
  console.error('\nB4.2 PATCH 2 PRECHECK FAILED');
  console.error(message);
  console.error('No repository files were modified.');
  process.exit(1);
}

if (!fs.existsSync(path.join(repoRoot, 'src')) || !fs.existsSync(path.join(repoRoot, 'tests'))) {
  fail(`Run this command from the RabTradebot repository root. Current directory: ${repoRoot}`);
}

for (const [rel, hash] of Object.entries(expected)) {
  const target = repoPath(rel);
  if (!fs.existsSync(target)) fail(`Required file missing: ${rel}`);
  const actual = sha256(target);
  if (actual !== hash && actual !== desired[rel]) {
    fail(
      `Source mismatch: ${rel}\n` +
      `Expected snapshot hash: ${hash}\n` +
      `Current hash:           ${actual}\n` +
      `This installer was built from the ZIP snapshot you uploaded; refusing to overwrite a different source.`
    );
  }
}

for (const rel of Object.keys(desired)) {
  const source = payloadPath(rel);
  if (!fs.existsSync(source)) fail(`Installer payload missing: ${rel}`);
  const payloadHash = sha256(source);
  if (payloadHash !== desired[rel]) {
    fail(`Installer payload integrity mismatch for ${rel}`);
  }

  const target = repoPath(rel);
  if (newFiles.has(rel) && fs.existsSync(target)) {
    const actual = sha256(target);
    if (actual !== desired[rel]) {
      fail(`New-file target already exists with different content: ${rel}`);
    }
  }
}

console.log('B4.2 PATCH 2 preflight PASS');
console.log(`Mode: ${mode}`);
console.log('Changes:');
console.log('  - RealTradingEngine market entry/exit -> ExecutionRouter');
console.log('  - Production router -> SpotExecutionBroker + parked Futures fail-closed broker');
console.log('  - Spot PARTIALLY_FILLED/incomplete quantity -> requiresReconciliation=true');
console.log('  - Exit reconciliation -> LIVE_EXIT_PENDING_RECONCILIATION quarantine');
console.log('  - Tests updated/added for routing, Spot inventory, Futures fail-closed, reconciliation');

if (mode === '--check') {
  console.log('\nCHECK ONLY: no files written.');
  console.log('Next: node .\\B4.2_PATCH2_READY\\apply_B4.2_PATCH2.cjs --apply');
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(repoRoot, `.b42-patch2-backup-${stamp}`);
fs.mkdirSync(backupRoot, { recursive: true });

for (const rel of Object.keys(expected)) {
  const target = repoPath(rel);
  const actual = sha256(target);
  if (actual === desired[rel]) continue;

  const backup = path.join(backupRoot, ...rel.split('/'));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

for (const rel of Object.keys(desired)) {
  const source = payloadPath(rel);
  const target = repoPath(rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);

  const actual = sha256(target);
  if (actual !== desired[rel]) {
    console.error(`Post-write verification failed: ${rel}`);
    process.exit(3);
  }
}

console.log('\nB4.2 PATCH 2 APPLIED + VERIFIED');
console.log(`Backup: ${backupRoot}`);
console.log('\nRun next:');
console.log('  git diff --check');
console.log('  git status');
console.log('  npx jest --runInBand tests/executionRouter.phase-b4.test.ts tests/b4-2-safety.test.ts tests/spotExecutionBroker.b4-2-reconciliation.test.ts tests/realTradingEngine.b4-2-router.test.ts tests/fase1-live-engine.test.ts');
console.log('  npm run build');
console.log('  npx jest --runInBand');
