const { execSync } = require('child_process');
const out = execSync('npx vitest run src/pages/Schedule/SchedulePage.duration.test.tsx --reporter=verbose', {
  cwd: 'c:/FACILOAD/apps/web',
  encoding: 'utf8',
  maxBuffer: 1 << 22,
  timeout: 120000,
});
const lines = out.split('\n').filter(l => l.includes('✓') || l.includes('✗') || l.includes('×') || l.includes('FAIL') || l.includes('Tests ') || l.includes('AssertionError') || l.includes('Expected:') || l.includes('Received:') || l.includes('Expected '));
lines.forEach(l => console.log(l));
