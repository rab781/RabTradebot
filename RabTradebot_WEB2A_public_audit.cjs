const fs = require('fs');
const path = require('path');

const root = process.cwd();
const publicDir = path.join(root, 'public');
const outPath = path.join(root, 'WEB2A_public_audit.txt');

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function rel(file) {
  return path.relative(root, file);
}

const out = [];
out.push('RabTradebot WEB2-A local public audit');
out.push(`Root: ${root}`);
out.push('READ ONLY: no repository files are modified.');
out.push('');

if (!fs.existsSync(publicDir)) {
  out.push('PUBLIC DIRECTORY: NOT FOUND');
  fs.writeFileSync(outPath, out.join('\n') + '\n', 'utf8');
  console.log(`[WEB2-A audit] Created ${outPath}`);
  process.exit(0);
}

out.push('PUBLIC DIRECTORY: FOUND');
out.push('');

const entries = fs.readdirSync(publicDir, { withFileTypes: true })
  .sort((a, b) => a.name.localeCompare(b.name));

out.push('=== PUBLIC FILE LIST ===');
for (const entry of entries) {
  const full = path.join(publicDir, entry.name);
  if (entry.isDirectory()) {
    out.push(`[DIR ] ${rel(full)}`);
  } else {
    const stat = fs.statSync(full);
    out.push(`[FILE] ${rel(full)} (${stat.size} bytes)`);
  }
}
out.push('');

const indexPath = path.join(publicDir, 'index.html');
const index = safeRead(indexPath);

if (index === null) {
  out.push('=== public/index.html ===');
  out.push('NOT FOUND');
} else {
  const lines = index.split('\n');

  out.push('=== public/index.html SUMMARY ===');
  out.push(`Lines: ${lines.length}`);
  out.push('');

  const titleMatch = index.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  out.push(`Title: ${titleMatch ? titleMatch[1].trim() : '(none)'}`);

  const scripts = [...index.matchAll(/<script[^>]+src=["']([^"']+)["'][^>]*>/gi)]
    .map(m => m[1]);

  const styles = [...index.matchAll(/<link[^>]+href=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi)]
    .map(m => m[1]);

  out.push(`Scripts: ${scripts.length ? scripts.join(', ') : '(none)'}`);
  out.push(`Styles: ${styles.length ? styles.join(', ') : '(none)'}`);
  out.push('');

  const interestingPatterns = [
    /\/api\/[A-Za-z0-9_?=&/:.-]+/g,
    /socket\.io/gi,
    /\bio\s*\(/g,
    /dashboard/gi,
    /portfolio/gi,
    /trades?/gi,
    /signals?/gi,
    /BUY/gi,
    /SELL/gi,
    /PAUSE/gi,
    /STOP/gi,
    /CLOSE/gi,
    /EMERGENCY/gi,
  ];

  out.push('=== INDEX INTERESTING MATCHES ===');
  for (const pattern of interestingPatterns) {
    const matches = [...new Set(index.match(pattern) || [])];
    if (matches.length) {
      out.push(`${pattern}: ${matches.slice(0, 40).join(', ')}`);
    }
  }
  out.push('');

  out.push('=== public/index.html FULL SOURCE ===');
  lines.forEach((line, i) => {
    out.push(`${String(i + 1).padStart(5, ' ')} | ${line}`);
  });
  out.push('');

  // Inspect local referenced assets only.
  const referenced = [...scripts, ...styles]
    .map(src => src.split('?')[0])
    .filter(src => src.startsWith('/') || !/^[a-z]+:\/\//i.test(src))
    .map(src => {
      const cleaned = src.startsWith('/') ? src.slice(1) : src;
      return path.join(publicDir, cleaned);
    });

  for (const asset of [...new Set(referenced)]) {
    const content = safeRead(asset);

    out.push(`=== REFERENCED ASSET: ${rel(asset)} ===`);

    if (content === null) {
      out.push('NOT FOUND');
      out.push('');
      continue;
    }

    const lines = content.split('\n');
    out.push(`Lines: ${lines.length}`);

    const apiMatches = [...new Set(content.match(/\/api\/[A-Za-z0-9_?=&/:.${}-]+/g) || [])];
    out.push(`API refs: ${apiMatches.length ? apiMatches.join(', ') : '(none)'}`);
    out.push(`Socket.IO refs: ${/socket\.io|\bio\s*\(/i.test(content) ? 'YES' : 'NO'}`);
    out.push('');

    const limit = 500;
    out.push(`--- SOURCE (first ${Math.min(lines.length, limit)} lines) ---`);
    lines.slice(0, limit).forEach((line, i) => {
      out.push(`${String(i + 1).padStart(5, ' ')} | ${line}`);
    });

    if (lines.length > limit) {
      out.push(`... ${lines.length - limit} more lines omitted`);
    }

    out.push('');
  }
}

fs.writeFileSync(outPath, out.join('\n') + '\n', 'utf8');

console.log('[WEB2-A public audit] DONE');
console.log(`Created: ${outPath}`);
console.log('Repository source was NOT modified.');
console.log('');
console.log('Upload WEB2A_public_audit.txt to ChatGPT.');
