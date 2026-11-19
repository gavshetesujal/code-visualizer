// Regression tests for the C++ simulator. Run: npm test
// For every tests/cpp/*.cpp: (1) the simulator's output text must equal what the real compiled program prints (needs g++),
// (2) the final value of each main() variable named in a "// EXPECT name=value" comment must match.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const Module = require('module');

// The simulator only imports 'vscode' for logging; stub it so the tests run outside VS Code.
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') {
    const noop = () => ({ appendLine() {}, show() {}, dispose() {} });
    return new Proxy({}, { get: () => new Proxy(noop, { get: () => noop }) });
  }
  return realLoad.call(this, request, ...rest);
};
const { ProgramSimulator } = require('../out/tracer/ProgramSimulator.js');

// `node tests/run.js` runs tests/cpp (must all pass). `node tests/run.js --known-gaps` runs tests/known-gaps: programs the simulator
// does not handle yet; they are expected to fail until the gap is fixed, and are listed so the gaps stay visible.
const knownGaps = process.argv.includes('--known-gaps');
const dir = path.join(__dirname, knownGaps ? 'known-gaps' : 'cpp');
const only = process.argv.slice(2).find(a => !a.startsWith('--'));
let failed = 0, passed = 0;
const hasGpp = spawnSync('g++', ['--version']).status === 0;

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.cpp') && (!only || f.includes(only))).sort()) {
  const full = path.join(dir, file);
  const code = fs.readFileSync(full, 'utf8');
  const problems = [];
  const result = ProgramSimulator.simulate(code, code.split('\n'), file, {}, []);
  const steps = result.steps;
  const simOut = steps.map(s => s.output || '').join('');
  const last = steps[steps.length - 1];
  const finalVars = {};
  for (const b of (last && last.buckets) || []) finalVars[b.name] = b.value;

  if (hasGpp) {
    const exe = path.join('/tmp', 'cvtest_' + file + '.out');
    const c = spawnSync('g++', ['-std=c++17', '-o', exe, full]);
    if (c.status !== 0) problems.push('g++ could not compile the test file');
    else {
      const realOut = spawnSync(exe).stdout.toString();
      if (realOut !== simOut) problems.push(`output differs\n      real:      ${JSON.stringify(realOut)}\n      simulated: ${JSON.stringify(simOut)}`);
    }
  }
  for (const m of code.matchAll(/^\/\/ EXPECT (\w+)=(.*)$/gm)) {
    if (finalVars[m[1]] !== m[2].trim()) problems.push(`variable ${m[1]}: expected ${m[2].trim()}, simulator shows ${finalVars[m[1]]}`);
  }
  // "// EXPECT_LINE return 3;=7": a step whose statement is `return 3;` must be highlighted on source line 7
  for (const m of code.matchAll(/^\/\/ EXPECT_LINE (.+)=(\d+)$/gm)) {
    const hit = steps.filter(s => s.statement === m[1].trim());
    if (!hit.length) problems.push(`no step with statement "${m[1].trim()}"`);
    else if (!hit.some(s => String(s.line) === m[2])) problems.push(`step "${m[1].trim()}" is on line ${hit.map(s => s.line).join('/')}, expected ${m[2]}`);
  }
  if (problems.length) { failed++; console.log(`FAIL ${file}\n    - ${problems.join('\n    - ')}`); }
  else { passed++; console.log(`PASS ${file}`); }
}
console.log(`\n${passed} passed, ${failed} failed${hasGpp ? '' : ' (g++ not found: output comparison skipped)'}`);
process.exit(knownGaps ? 0 : (failed ? 1 : 0));
