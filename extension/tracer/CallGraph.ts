import { ExecutionStep } from '../types';

/** One call of a function: its arguments, return value and the steps where it starts and returns. */
export interface CallInstance {
  frameId: string;
  caller: string;
  callee: string;
  args: { name: string; value: string }[];
  returnValue?: string;
  startStep: number;
  returnStep?: number;
  depth: number;
}

export interface CallGraphNode {
  name: string;
  calls: number;
  firstStep: number;
  isRecursive: boolean;
}

export interface CallGraphEdge {
  from: string;
  to: string;
  count: number;
  instances: CallInstance[];
}

export interface CallGraph {
  nodes: CallGraphNode[];
  edges: CallGraphEdge[];
  instances: CallInstance[];
}

function baseName(sig: string | undefined): string {
  if (!sig) { return 'main'; }
  const m = /^[\w:~]+/.exec(sig.trim());
  return m ? m[0] : sig;
}

/**
 * Builds a "who calls whom" graph from the simulated steps (a source simulation, not a real trace).
 * main is always included as the root, even when the program never calls another function.
 */
export function buildCallGraph(steps: ExecutionStep[]): CallGraph {
  const byFrame = new Map<string, CallInstance>();
  const order: CallInstance[] = [];
  const nameOfFrame = new Map<string, string>();

  for (const step of steps) {
    for (const f of step.callStackFrames || []) {
      nameOfFrame.set(f.id, baseName(f.functionName));
    }
    for (const f of step.callStackFrames || []) {
      let inst = byFrame.get(f.id);
      if (!inst) {
        const callerByFrame = f.callerFrameId ? nameOfFrame.get(f.callerFrameId) : undefined;
        inst = {
          frameId: f.id,
          caller: callerByFrame || baseName(f.callerFunctionName),
          callee: baseName(f.functionName),
          args: (f.parameters || []).map(p => ({ name: p.name, value: String(p.value) })),
          startStep: step.stepIndex,
          depth: f.callDepth
        };
        byFrame.set(f.id, inst);
        order.push(inst);
      }
      if (f.returnValue !== undefined && inst.returnValue === undefined) {
        inst.returnValue = String(f.returnValue);
        inst.returnStep = step.stepIndex;
      }
    }
  }

  const nodes = new Map<string, CallGraphNode>();
  const touch = (name: string, step: number) => {
    let n = nodes.get(name);
    if (!n) { n = { name, calls: 0, firstStep: step, isRecursive: false }; nodes.set(name, n); }
    return n;
  };
  touch('main', 0);
  const edges = new Map<string, CallGraphEdge>();
  for (const inst of order) {
    touch(inst.caller, inst.startStep);
    touch(inst.callee, inst.startStep).calls++;
    if (inst.caller === inst.callee) { nodes.get(inst.callee)!.isRecursive = true; }
    const key = `${inst.caller}->${inst.callee}`;
    let e = edges.get(key);
    if (!e) { e = { from: inst.caller, to: inst.callee, count: 0, instances: [] }; edges.set(key, e); }
    e.count++;
    e.instances.push(inst);
  }
  return { nodes: Array.from(nodes.values()), edges: Array.from(edges.values()), instances: order };
}
