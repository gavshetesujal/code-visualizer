// Call-graph tests. Run: node tests/callgraph.test.js (also part of npm test).
const assert = require('assert');
const Module = require('module');
const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'vscode') { const noop = () => ({ appendLine() {}, show() {}, dispose() {} }); return new Proxy({}, { get: () => new Proxy(noop, { get: () => noop }) }); }
  return realLoad.call(this, request, ...rest);
};
const { ProgramSimulator } = require('../out/tracer/ProgramSimulator.js');
const { buildCallGraph } = require('../out/tracer/CallGraph.js');
const fs = require('fs');
const g = (file) => { const code = fs.readFileSync(__dirname + '/cpp/' + file, 'utf8'); return buildCallGraph(ProgramSimulator.simulate(code, code.split('\n'), file, {}, []).steps); };

const m = g('mixed_basic.cpp');
const names = m.nodes.map(n => n.name);
assert(names.includes('main'), 'main is always a node');
console.log('PASS mixed_basic nodes: ' + names.join(','));

// recursion: main -> fact once, fact -> fact twice, with args and return values
const code = `#include <iostream>
using namespace std;
int fact(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * fact(n - 1);
}
int add(int a, int b) { return a + b; }
int main() {
    int s = add(2, 3);
    int f = fact(3);
    cout << s << " " << f << endl;
    return 0;
}
`;
const gr = buildCallGraph(ProgramSimulator.simulate(code, code.split('\n'), 'r.cpp', {}, []).steps);
const edge = (a, b) => gr.edges.find(e => e.from === a && e.to === b);
assert.strictEqual(edge('main', 'add').count, 1);
assert.strictEqual(edge('main', 'fact').count, 1);
assert.strictEqual(edge('fact', 'fact').count, 2);
assert.strictEqual(gr.nodes.find(n => n.name === 'fact').isRecursive, true);
assert.strictEqual(gr.nodes.find(n => n.name === 'add').isRecursive, false);
const addCall = edge('main', 'add').instances[0];
assert.deepStrictEqual(addCall.args, [{ name: 'a', value: '2' }, { name: 'b', value: '3' }]);
assert.strictEqual(addCall.returnValue, '5');
const f3 = edge('main', 'fact').instances[0];
assert.strictEqual(f3.args[0].value, '3');
assert.strictEqual(f3.returnValue, '6');
console.log('PASS recursion + args + return values');
