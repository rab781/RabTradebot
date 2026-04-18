const fs = require('fs');

const files = [
  'scripts/repro_feature_engineering_perf.ts',
  'scripts/quick-ml-test.ts',
  'scripts/production-training.ts',
  'scripts/optimized-training.ts',
  'scripts/extensive-ml-test.ts',
  'scripts/debug-openclaw.ts',
  'scripts/advanced-training.ts'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf-8');
  content = content.replace(/\(c:\s*any\)/g, '(c: [number, string, string, string, string, string, number, string, number, string, string, string] | any)');
  content = content.replace(/import \{ OHLCVCandle \} from/g, 'import { OHLCVCandle } from');
  fs.writeFileSync(file, content);
});
console.log("Replaced");
