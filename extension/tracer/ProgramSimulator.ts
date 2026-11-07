import {
  ExecutionStep,
  VariableBucket,
  LoopContainerState,
  InputRequestState,
  ConditionBranchEvent,
  FunctionCallFrame,
  ArrayMemoryStructure,
  ArrayMemoryCell,
  StructureKind,
  ClassContainerState,
  ClassPathwayArrow,
  ClassObjectInstance,
  ClassMemberVariable,
  ClassMemberFunction
} from '../types';
import { DiagnosticLogger } from './DiagnosticLogger';

export interface SimulationResult {
  steps: ExecutionStep[];
  detectedKind: StructureKind;
  structureTitle: string;
}

interface FunctionDef {
  returnType: string;
  name: string;
  params: { type: string; name: string }[];
  startLine: number;
  bodyLines: { lineNum: number; raw: string; trimmed: string }[];
}

interface ClassDef {
  name: string;
  startLine: number;
  privateVariables: ClassMemberVariable[];
  publicVariables: ClassMemberVariable[];
  privateFunctions: {
    name: string;
    returnType: string;
    access: 'private' | 'public';
    params: { type: string; name: string }[];
    startLine: number;
    bodyLines: { lineNum: number; raw: string; trimmed: string }[];
  }[];
  publicFunctions: {
    name: string;
    returnType: string;
    access: 'private' | 'public';
    params: { type: string; name: string }[];
    startLine: number;
    bodyLines: { lineNum: number; raw: string; trimmed: string }[];
  }[];
}

export class ProgramSimulator {
  /**
   * Strips single-line comments (//), trailing comments, and block comments (/* ... *\/)
   * while strictly preserving:
   * 1. Original 1-based line numbering (for editor highlight synchronization)
   * 2. Quoted strings that contain comment symbols like "http://site.com" or "// text"
   */
  public static cleanSourceLines(lines: string[]): { lineNum: number; raw: string; clean: string; trimmed: string }[] {
    let inBlockComment = false;
    const result: { lineNum: number; raw: string; clean: string; trimmed: string }[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const raw = lines[lineIdx];
      let inString = false;
      let stringChar = '';
      let escapeNext = false;
      const cleanChars: string[] = [];

      for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        const nextCh = i + 1 < raw.length ? raw[i + 1] : '';

        if (inBlockComment) {
          if (ch === '*' && nextCh === '/') {
            inBlockComment = false;
            i++; // skip '/'
          }
          continue;
        }

        if (inString) {
          cleanChars.push(ch);
          if (escapeNext) {
            escapeNext = false;
          } else if (ch === '\\') {
            escapeNext = true;
          } else if (ch === stringChar) {
            inString = false;
          }
          continue;
        }

        // Check for start of string literal
        if (ch === '"' || ch === "'") {
          inString = true;
          stringChar = ch;
          escapeNext = false;
          cleanChars.push(ch);
          continue;
        }

        // Check for start of block comment /*
        if (ch === '/' && nextCh === '*') {
          inBlockComment = true;
          i++; // skip '*'
          continue;
        }

        // Check for single line comment //
        if (ch === '/' && nextCh === '/') {
          break; // Discard rest of the line
        }

        cleanChars.push(ch);
      }

      const clean = cleanChars.join('');
      result.push({
        lineNum: lineIdx + 1,
        raw,
        clean,
        trimmed: clean.trim()
      });
    }

    return result;
  }

  public static canSimulate(code: string): boolean {
    const hasVarDecl = /\b(int|float|double|char|string|bool|long|short)\s+[a-zA-Z_]\w*/.test(code);
    const hasLoop = /\b(for|while|do)\b/.test(code);
    const hasCin = /\bcin\s*>>/.test(code);
    const hasIf = /\bif\s*\(/.test(code);
    const hasAssign = /[a-zA-Z_]\w*\s*=\s*[^=]/.test(code);
    const hasFunc = /\b(int|void|float|double|char|string|bool)\s+[a-zA-Z_]\w*\s*\([^)]*\)/.test(code);
    const hasClass = /\bclass\s+[a-zA-Z_]\w*/.test(code);
    return hasVarDecl || hasLoop || hasCin || hasIf || hasAssign || hasFunc || hasClass;
  }

  /**
   * Adaptive Loop Grouping:
   * Intelligently groups middle iterations (iterations 4 to total - 3) into an interactive collapsible group.
   * Preserves full program execution, variable accuracy, and individual inspection on demand.
   */
  private static applyAdaptiveLoopGrouping(
    steps: ExecutionStep[],
    loopId: string,
    loopType: 'for' | 'while' | 'do-while',
    loopVarName: string,
    lineNum: number,
    iterationStepRanges: { iteration: number; startIndex: number; endIndex: number }[]
  ): void {
    const totalIterations = iterationStepRanges.length;
    // Only group when total iterations >= 8 (ensures at least 2 iterations in the middle: 4 to total - 3)
    if (totalIterations < 8) {
      return;
    }

    const startIter = 4;
    const endIter = totalIterations - 3;
    const totalGrouped = endIter - startIter + 1;

    const firstMiddleRange = iterationStepRanges[startIter - 1]; // 0-indexed (index 3)
    const lastMiddleRange = iterationStepRanges[endIter - 1];    // 0-indexed

    if (!firstMiddleRange || !lastMiddleRange) {
      return;
    }

    const firstMiddleStepIdx = firstMiddleRange.startIndex;
    const lastMiddleStepIdx = lastMiddleRange.endIndex - 1;

    if (firstMiddleStepIdx > lastMiddleStepIdx || firstMiddleStepIdx >= steps.length) {
      return;
    }

    // Smart Handling (Requirement 5):
    // Do not group if any step in middle iterations contains cin (inputRequest) or functionFrame!
    for (let i = firstMiddleStepIdx; i <= lastMiddleStepIdx; i++) {
      const s = steps[i];
      if (s.inputRequest || s.functionFrame) {
        DiagnosticLogger.log('LOOP_GROUPING', `Skipping loop grouping for ${loopId}: interactive event or function call detected in iteration range.`);
        return;
      }
    }

    // Compute variable deltas: compare buckets before iteration 4 vs buckets at end of endIter
    const prevStep = steps[firstMiddleStepIdx - 1];
    const endStep = steps[lastMiddleStepIdx];

    const prevBuckets = prevStep?.buckets || [];
    const endBuckets = endStep?.buckets || [];

    const variableDeltas: { name: string; startVal: string; endVal: string }[] = [];
    endBuckets.forEach(eb => {
      const pb = prevBuckets.find(b => b.name === eb.name);
      const startVal = pb ? pb.value : '';
      const endVal = eb.value;
      if (startVal !== endVal) {
        variableDeltas.push({ name: eb.name, startVal, endVal });
      }
    });

    if (loopVarName && !variableDeltas.some(d => d.name === loopVarName)) {
      const pb = prevBuckets.find(b => b.name === loopVarName);
      const eb = endBuckets.find(b => b.name === loopVarName);
      if (pb && eb) {
        variableDeltas.unshift({ name: loopVarName, startVal: pb.value, endVal: eb.value });
      }
    }

    const groupId = `group_${loopId}_${startIter}_${endIter}`;
    DiagnosticLogger.log('LOOP_GROUPING', `Grouped ${totalGrouped} iterations (${startIter}–${endIter}) into group "${groupId}"`);

    // Create Group Header / Summary Step
    const groupSummaryStep: ExecutionStep = {
      stepIndex: 0,
      totalSteps: 0,
      line: lineNum,
      statement: `Grouped Iterations ${startIter}–${endIter} (${totalGrouped} iterations)`,
      explanation: `Adaptive Loop: Grouped ${totalGrouped} intermediate iterations for clean visualization. Variable changes: ${variableDeltas.map(d => `${d.name}: ${d.startVal} ➔ ${d.endVal}`).join(', ')}. Click "Expand" to inspect each iteration.`,
      callStack: endStep ? endStep.callStack : [],
      heap: [],
      variables: [],
      memoryDump: [],
      output: endStep ? endStep.output : '',
      buckets: endStep ? endStep.buckets : [],
      activeLoop: endStep ? endStep.activeLoop : undefined,
      activeLoops: endStep ? endStep.activeLoops : undefined,
      isGroupHeader: true,
      loopGroup: {
        groupId,
        loopId,
        loopType,
        startIteration: startIter,
        endIteration: endIter,
        totalGroupedIterations: totalGrouped,
        isExpanded: false,
        variableDeltas,
        summaryText: `Iterations ${startIter}–${endIter} (${totalGrouped} iterations grouped)`
      }
    };

    // Mark all steps in the middle iterations as belonging to this group and collapsed
    for (let sIdx = firstMiddleStepIdx; sIdx <= lastMiddleStepIdx; sIdx++) {
      steps[sIdx].belongsToGroupId = groupId;
      steps[sIdx].isGroupCollapsed = true;
    }

    // Insert groupSummaryStep immediately before the first middle step
    steps.splice(firstMiddleStepIdx, 0, groupSummaryStep);

    // Re-index all steps
    steps.forEach((s, idx) => {
      s.stepIndex = idx;
      s.totalSteps = steps.length;
    });
  }

  public static simulate(
    code: string,
    lines: string[],
    fileName: string,
    providedInputs: Record<string, string> = {},
    orderedInputs: string[] = []
  ): SimulationResult {
    const steps: ExecutionStep[] = [];
    const varOrder: string[] = [];
    const varMap = new Map<string, VariableBucket>();
    const arrayMap = new Map<string, ArrayMemoryStructure>();

    let cinCallIndex = 0;
    let isWaitingForInput = false;

    // Cleaned lines with comments stripped and original 1-based line numbers preserved
    const cleanLines = this.cleanSourceLines(lines);

    // 0. Extract class definitions
    const classDefs = this.extractClasses(cleanLines);

    // 1. Extract non-main function definitions
    const functionDefs = this.extractFunctions(cleanLines);

    // 2. Identify main function body
    const mainLines = this.extractMainLines(cleanLines);

    // Active Loop Stack for nested loops
    const activeLoopStack: LoopContainerState[] = [];
    const activeFrameStack: FunctionCallFrame[] = [];
    let callCounter = 0;
    const MAX_RECURSION_DEPTH = 100;

    // Track active object instances and class state
    const objectInstances = new Map<string, ClassObjectInstance>();
    let currentExecutingClass: string | undefined = undefined;
    let currentExecutingObject: string | undefined = undefined;
    let currentExecutingCompartment: 'private' | 'public' | 'none' = 'none';
    let currentHighlightedMember: string | undefined = undefined;
    let activePathwayArrow: ClassPathwayArrow | undefined = undefined;
    let currentAccessViolation: ClassContainerState['accessViolation'] | undefined = undefined;

    const makeClassSnapshot = (overrides?: Partial<ClassContainerState>): ClassContainerState | undefined => {
      if (classDefs.size === 0) return undefined;
      const clsName = currentExecutingClass || Array.from(classDefs.keys())[0];
      const clsDef = classDefs.get(clsName);
      if (!clsDef) return undefined;

      const activeObjName = currentExecutingObject || (objectInstances.size > 0 ? Array.from(objectInstances.keys())[0] : undefined);
      const activeObj = activeObjName ? objectInstances.get(activeObjName) : undefined;

      const privBuckets: VariableBucket[] = clsDef.privateVariables.map(v => {
        const val = activeObj ? (activeObj.memberValues[v.name] ?? v.defaultValue ?? '0') : (v.defaultValue ?? '0');
        const prevVal = activeObj?.previousMemberValues ? activeObj.previousMemberValues[v.name] : undefined;
        return {
          name: v.name,
          value: val,
          type: v.type,
          previousValue: prevVal,
          isModified: activeObj?.isModifiedMember === v.name,
          scope: `${clsName}::private`
        };
      });

      const pubBuckets: VariableBucket[] = clsDef.publicVariables.map(v => {
        const val = activeObj ? (activeObj.memberValues[v.name] ?? v.defaultValue ?? '0') : (v.defaultValue ?? '0');
        const prevVal = activeObj?.previousMemberValues ? activeObj.previousMemberValues[v.name] : undefined;
        return {
          name: v.name,
          value: val,
          type: v.type,
          previousValue: prevVal,
          isModified: activeObj?.isModifiedMember === v.name,
          scope: `${clsName}::public`
        };
      });

      const privFuncs = clsDef.privateFunctions.map(f => ({
        name: f.name,
        signature: `${f.returnType} ${f.name}(${f.params.map(p => `${p.type} ${p.name}`).join(', ')})`,
        isActive: currentHighlightedMember === f.name
      }));

      const pubFuncs = clsDef.publicFunctions.map(f => ({
        name: f.name,
        signature: `${f.returnType} ${f.name}(${f.params.map(p => `${p.type} ${p.name}`).join(', ')})`,
        isActive: currentHighlightedMember === f.name
      }));

      const objectsList: ClassObjectInstance[] = Array.from(objectInstances.values()).map(o => ({
        objectName: o.objectName,
        className: o.className,
        memberValues: { ...o.memberValues },
        previousMemberValues: o.previousMemberValues ? { ...o.previousMemberValues } : undefined,
        isModifiedMember: o.isModifiedMember
      }));

      return {
        className: clsName,
        activeObjectName: activeObjName,
        objects: objectsList,
        highlightedCompartment: currentExecutingCompartment,
        highlightedMember: currentHighlightedMember,
        activePathway: activePathwayArrow ? { ...activePathwayArrow } : undefined,
        privateVariables: privBuckets,
        publicVariables: pubBuckets,
        privateFunctions: privFuncs,
        publicFunctions: pubFuncs,
        accessViolation: currentAccessViolation ? { ...currentAccessViolation } : undefined,
        ...overrides
      };
    };

    const makeBucketsSnapshot = (modifiedName?: string): VariableBucket[] => {
      return varOrder.map(name => {
        const b = varMap.get(name)!;
        return {
          name: b.name,
          value: b.value,
          type: b.type,
          previousValue: b.previousValue,
          isModified: name === modifiedName,
          isNew: b.isNew,
          isEmpty: b.isEmpty,
          scope: b.scope,
          isOutOfScope: b.isOutOfScope,
          pointsTo: b.pointsTo
        };
      });
    };

    const makeArraysSnapshot = (): ArrayMemoryStructure[] => {
      const arrs: ArrayMemoryStructure[] = [];
      arrayMap.forEach(v => {
        arrs.push({
          name: v.name,
          type: v.type,
          cells: v.cells.map(c => ({ ...c }))
        });
      });
      return arrs;
    };

    const makeLoopSnapshot = (): LoopContainerState | undefined => {
      if (activeLoopStack.length === 0) return undefined;
      return JSON.parse(JSON.stringify(activeLoopStack[activeLoopStack.length - 1]));
    };

    const makeLoopsSnapshot = (): LoopContainerState[] => {
      return JSON.parse(JSON.stringify(activeLoopStack));
    };

    const recordStep = (
      line: number,
      stmt: string,
      explanation: string,
      opts: {
        output?: string;
        modifiedVar?: string;
        inputReq?: InputRequestState;
        condEvent?: ConditionBranchEvent;
        funcFrame?: FunctionCallFrame;
        classContainer?: ClassContainerState;
      } = {}
    ) => {
      const stepIdx = steps.length;
      const topFrame = opts.funcFrame || (activeFrameStack.length > 0 ? activeFrameStack[activeFrameStack.length - 1] : undefined);
      steps.push({
        stepIndex: stepIdx,
        totalSteps: 0,
        line,
        statement: stmt,
        explanation,
        callStack: activeFrameStack.length > 0 ? activeFrameStack.map((f, i) => ({
          id: i + 1,
          name: f.callSignature,
          file: fileName,
          line,
          variables: []
        })) : [{
          id: 1,
          name: 'main()',
          file: fileName,
          line,
          variables: []
        }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: opts.output || '',
        buckets: makeBucketsSnapshot(opts.modifiedVar),
        activeLoop: makeLoopSnapshot(),
        activeLoops: makeLoopsSnapshot(),
        inputRequest: opts.inputReq,
        conditionEvent: opts.condEvent,
        functionFrame: topFrame ? JSON.parse(JSON.stringify(topFrame)) : undefined,
        callStackFrames: activeFrameStack.length > 0 ? JSON.parse(JSON.stringify(activeFrameStack)) : undefined,
        arrayStructures: makeArraysSnapshot(),
        classContainer: opts.classContainer !== undefined ? opts.classContainer : (classDefs.size > 0 ? makeClassSnapshot() : undefined)
      });
    };

    // Helper: Substitute variables and array lookups in an expression
    const substituteVariables = (expr: string, frame?: FunctionCallFrame): string => {
      let exp = expr.trim();

      // 1. Resolve array cell access: arr[i], arr[0], etc.
      exp = exp.replace(/([a-zA-Z_]\w*)\s*\[\s*([^\]]+)\s*\]/g, (match, arrName, idxExpr) => {
        if (arrayMap.has(arrName)) {
          const evalIdxStr = evaluateMathExpr(substituteVariables(idxExpr, frame));
          const idx = parseInt(evalIdxStr, 10);
          const arr = arrayMap.get(arrName)!;
          if (idx >= 0 && idx < arr.cells.length) {
            return arr.cells[idx].value;
          }
        }
        return match;
      });

      // 2. Substitute frame-specific variables (local variables and parameters)
      if (frame) {
        frame.localVariables.forEach(v => {
          exp = exp.replace(new RegExp(`\\b${v.name}\\b`, 'g'), v.value || '0');
        });
        frame.parameters.forEach(p => {
          exp = exp.replace(new RegExp(`\\b${p.name}\\b`, 'g'), p.value || '0');
        });
      }

      // 2.5 Resolve member variables of active class object if in class context
      if (currentExecutingObject && objectInstances.has(currentExecutingObject)) {
        const obj = objectInstances.get(currentExecutingObject)!;
        Object.keys(obj.memberValues).forEach(mName => {
          exp = exp.replace(new RegExp(`\\b${mName}\\b`, 'g'), obj.memberValues[mName] ?? '0');
          exp = exp.replace(new RegExp(`this->${mName}\\b`, 'g'), obj.memberValues[mName] ?? '0');
        });
      }

      // Also resolve obj.varName e.g. s.age or s1.age
      objectInstances.forEach((obj, objName) => {
        Object.keys(obj.memberValues).forEach(mName => {
          exp = exp.replace(new RegExp(`\\b${objName}\\.${mName}\\b`, 'g'), obj.memberValues[mName] ?? '0');
        });
      });

      // 3. Substitute global / main variables
      varMap.forEach((v, k) => {
        const simpleName = k.includes(':') ? k.split(':')[1] : k;
        exp = exp.replace(new RegExp(`\\b${simpleName}\\b`, 'g'), v.value || '0');
      });

      return exp;
    };

    // Helper: Pure arithmetic expression evaluation
    const evaluateMathExpr = (exp: string): string => {
      const cleaned = exp.trim();
      if (!cleaned) return '0';
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) return cleaned.slice(1, -1);
      if (cleaned.startsWith("'") && cleaned.endsWith("'")) return cleaned.slice(1, -1);
      if (/^-?\d+(\.\d+)?$/.test(cleaned)) return cleaned;
      if (cleaned === 'true') return 'true';
      if (cleaned === 'false') return 'false';

      try {
        const res = Function(`"use strict"; return (${cleaned});`)();
        return String(res);
      } catch (e) {
        return cleaned;
      }
    };

    // Helper: Evaluate expressions that may contain function calls (e.g. n * factorial(n - 1) or fib(n-1) + fib(n-2))
    const evalExpressionWithCalls = (rawExpr: string, frame?: FunctionCallFrame): string => {
      let expr = rawExpr.trim();

      const callRegex = /\b([a-zA-Z_]\w*)\s*\(([^()]*)\)/;
      let match = expr.match(callRegex);

      let guard = 0;
      while (match && guard < 100) {
        guard++;
        const funcName = match[1];
        const rawArgStr = match[2];

        if (functionDefs.has(funcName)) {
          const argParts = rawArgStr ? rawArgStr.split(',').map(s => s.trim()).filter(Boolean) : [];
          const evaluatedArgs: string[] = [];

          for (const argPart of argParts) {
            evaluatedArgs.push(evalExpressionWithCalls(argPart, frame));
          }

          if (frame) {
            frame.state = 'waiting';
            frame.waitingForCallSignature = `${funcName}(${evaluatedArgs.join(', ')})`;
          }

          const retVal = executeFunction(funcName, evaluatedArgs, undefined, frame);

          if (frame) {
            frame.state = 'active';
            frame.waitingForCallSignature = undefined;
          }

          expr = expr.slice(0, match.index!) + retVal + expr.slice(match.index! + match[0].length);
          match = expr.match(callRegex);
        } else {
          break;
        }
      }

      const substituted = substituteVariables(expr, frame);
      return evaluateMathExpr(substituted);
    };

    // Helper: Execute a function call
    const executeFunction = (
      funcName: string,
      evaluatedArgs: string[],
      assignVar?: string,
      callerFrame?: FunctionCallFrame
    ): string => {
      const targetFunc = functionDefs.get(funcName);
      if (!targetFunc) {
        return '0';
      }

      callCounter++;
      const frameId = `call_${funcName}_${callCounter}`;
      const callDepth = activeFrameStack.length + 1;

      if (callDepth > MAX_RECURSION_DEPTH) {
        recordStep(
          targetFunc.startLine,
          `${funcName}(${evaluatedArgs.join(', ')})`,
          `Execution safeguard: Maximum recursion depth (${MAX_RECURSION_DEPTH}) reached to prevent stack overflow.`
        );
        return '0';
      }

      // Bind parameters
      const paramBuckets: VariableBucket[] = targetFunc.params.map((p, i) => {
        const val = evaluatedArgs[i] !== undefined ? evaluatedArgs[i] : '0';
        return {
          name: p.name,
          value: val,
          type: p.type,
          scope: frameId,
          isNew: true
        };
      });

      const frame: FunctionCallFrame = {
        id: frameId,
        functionName: funcName,
        callSignature: `${funcName}(${evaluatedArgs.join(', ')})`,
        parameters: paramBuckets,
        localVariables: [],
        callDepth,
        state: 'created',
        callerFrameId: callerFrame?.id,
        callerFunctionName: callerFrame ? callerFrame.callSignature : 'main()'
      };

      if (callerFrame) {
        callerFrame.state = 'waiting';
        callerFrame.waitingForCallSignature = frame.callSignature;
      }

      activeFrameStack.push(frame);
      frame.state = 'active';

      // Record function entry step
      recordStep(
        targetFunc.startLine,
        `${targetFunc.returnType} ${funcName}(${targetFunc.params.map((p, i) => `${p.type} ${p.name} = ${evaluatedArgs[i] || '0'}`).join(', ')})`,
        `Function call: entering '${funcName}()' (depth ${callDepth}) with arguments (${evaluatedArgs.join(', ')}).${callerFrame ? ` Caller '${callerFrame.functionName}' is waiting.` : ''}`,
        { funcFrame: frame }
      );

      // Execute function body
      let funcReturnValue = '0';
      let hasExplicitReturn = false;

      const result = executeStatements(targetFunc.bodyLines, frameId, frame);
      if (result && result.hasReturned) {
        hasExplicitReturn = true;
        funcReturnValue = result.returnValue !== undefined ? result.returnValue : '0';
      }

      if (isWaitingForInput) {
        return funcReturnValue;
      }

      if (!hasExplicitReturn && targetFunc.returnType === 'void') {
        funcReturnValue = '';
      }

      // Return transition
      frame.state = 'returning';
      frame.returnValue = funcReturnValue;
      frame.isReturning = true;

      recordStep(
        targetFunc.startLine,
        targetFunc.returnType === 'void' ? `return;` : `return ${funcReturnValue};`,
        `Function '${frame.callSignature}' finished: returned ${funcReturnValue ? funcReturnValue : 'void'} to ${callerFrame ? callerFrame.callSignature : 'main()'}.`,
        { funcFrame: frame }
      );

      // Pop frame (completed)
      frame.state = 'completed';
      activeFrameStack.pop();

      // Resume caller
      if (callerFrame) {
        callerFrame.state = 'active';
        callerFrame.waitingForCallSignature = undefined;
      }

      // If assigned to variable
      if (assignVar) {
        if (callerFrame) {
          let b = callerFrame.localVariables.find(v => v.name === assignVar);
          if (!b) {
            b = { name: assignVar, value: '', scope: callerFrame.id };
            callerFrame.localVariables.push(b);
          }
          b.previousValue = b.value;
          b.value = funcReturnValue;
          b.isModified = true;
          b.isEmpty = false;
        } else {
          if (!varMap.has(assignVar)) {
            varOrder.push(assignVar);
            varMap.set(assignVar, { name: assignVar, value: '', scope: 'main' });
          }
          const b = varMap.get(assignVar)!;
          b.previousValue = b.value;
          b.value = funcReturnValue;
          b.isModified = true;
          b.isEmpty = false;
        }

        recordStep(
          targetFunc.startLine,
          `${assignVar} = ${funcReturnValue};`,
          `Stored returned value ${funcReturnValue} into '${assignVar}'.`,
          { modifiedVar: callerFrame ? undefined : assignVar, funcFrame: callerFrame }
        );
      }

      return funcReturnValue;
    };

    const evalGeneralCondition = (cond: string, frame?: FunctionCallFrame): boolean => {
      try {
        const val = evalExpressionWithCalls(cond, frame);
        return val === 'true' || val === '1' || (parseFloat(val) !== 0 && !isNaN(parseFloat(val)) && val !== 'false');
      } catch (e) {
        return false;
      }
    };

    const evalCout = (stmt: string, frame?: FunctionCallFrame): string => {
      const cleaned = stmt.replace(/^cout\s*<<\s*/, '').replace(/;$/, '');
      const tokens = cleaned.split('<<').map(t => t.trim());
      let out = '';

      for (const tok of tokens) {
        if (tok === 'endl') {
          out += '\n';
        } else if (tok.startsWith('"') && tok.endsWith('"')) {
          out += tok.slice(1, -1);
        } else if (tok.startsWith("'") && tok.endsWith("'")) {
          out += tok.slice(1, -1);
        } else {
          try {
            const val = evalExpressionWithCalls(tok, frame);
            out += val;
          } catch (e) {
            out += tok;
          }
        }
      }

      return out;
    };

    const splitTopLevelCommas = (str: string): string[] => {
      const parts: string[] = [];
      let current = '';
      let parenDepth = 0;
      for (const ch of str) {
        if (ch === '(') parenDepth++;
        else if (ch === ')') parenDepth--;
        if (ch === ',' && parenDepth === 0) {
          parts.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      if (current.trim()) {
        parts.push(current.trim());
      }
      return parts;
    };

    let executeStatements: (
      stmts: { lineNum: number; raw: string; trimmed: string }[],
      scopeName: string,
      currentFrame?: FunctionCallFrame
    ) => { hasReturned: boolean; returnValue?: string };

    const executeClassMemberFunction = (
      targetCls: ClassDef,
      targetObj: ClassObjectInstance,
      targetFunc: ClassDef['privateFunctions'][0] | ClassDef['publicFunctions'][0],
      evaluatedArgs: string[],
      callSig: string,
      isInternalCall: boolean = false,
      callerFrame?: FunctionCallFrame
    ): string => {
      callCounter++;
      const frameId = `cls_call_${targetFunc.name}_${callCounter}`;
      const callDepth = activeFrameStack.length + 1;

      if (callDepth > MAX_RECURSION_DEPTH) {
        recordStep(
          targetFunc.startLine,
          callSig,
          `Execution safeguard: Maximum recursion depth (${MAX_RECURSION_DEPTH}) reached.`
        );
        return '0';
      }

      const prevExecutingClass = currentExecutingClass;
      const prevExecutingObject = currentExecutingObject;
      const prevExecutingCompartment = currentExecutingCompartment;
      const prevHighlightedMember = currentHighlightedMember;

      currentExecutingClass = targetCls.name;
      currentExecutingObject = targetObj.objectName;
      currentExecutingCompartment = targetFunc.access;
      currentHighlightedMember = targetFunc.name;

      // Bind parameters
      const paramBuckets: VariableBucket[] = targetFunc.params.map((p, i) => {
        const val = evaluatedArgs[i] !== undefined ? evaluatedArgs[i] : '0';
        return {
          name: p.name,
          value: val,
          type: p.type,
          scope: `${targetCls.name}::${targetFunc.name}`,
          isNew: true
        };
      });

      const frame: FunctionCallFrame = {
        id: frameId,
        functionName: `${targetCls.name}::${targetFunc.name}`,
        callSignature: `${targetObj.objectName}.${targetFunc.name}(${evaluatedArgs.join(', ')})`,
        parameters: paramBuckets,
        localVariables: [],
        callDepth,
        state: 'active',
        callerFrameId: callerFrame?.id,
        callerFunctionName: callerFrame ? callerFrame.callSignature : 'main()'
      };

      if (callerFrame) {
        callerFrame.state = 'waiting';
        callerFrame.waitingForCallSignature = frame.callSignature;
      }

      activeFrameStack.push(frame);

      recordStep(
        targetFunc.startLine,
        `${targetFunc.returnType} ${targetFunc.name}(${targetFunc.params.map((p, i) => `${p.type} ${p.name} = ${evaluatedArgs[i] || '0'}`).join(', ')})`,
        `Entering ${targetFunc.access.toUpperCase()} member function '${targetFunc.name}()' on object '${targetObj.objectName}' (${targetCls.name}).`,
        { funcFrame: frame }
      );

      // Execute body
      let funcReturnValue = '0';
      let hasExplicitReturn = false;

      const result = executeStatements(targetFunc.bodyLines, `${targetCls.name}_${targetFunc.name}`, frame);
      if (result && result.hasReturned) {
        hasExplicitReturn = true;
        funcReturnValue = result.returnValue !== undefined ? result.returnValue : '0';
      }

      if (isWaitingForInput) {
        return funcReturnValue;
      }

      if (!hasExplicitReturn && targetFunc.returnType === 'void') {
        funcReturnValue = '';
      }

      // Return step
      frame.state = 'returning';
      frame.returnValue = funcReturnValue;
      frame.isReturning = true;

      recordStep(
        targetFunc.startLine,
        targetFunc.returnType === 'void' ? `return;` : `return ${funcReturnValue};`,
        `Member function '${targetFunc.name}()' completed, returning ${funcReturnValue ? funcReturnValue : 'void'}.`,
        { funcFrame: frame }
      );

      frame.state = 'completed';
      activeFrameStack.pop();

      if (callerFrame) {
        callerFrame.state = 'active';
        callerFrame.waitingForCallSignature = undefined;
      }

      currentExecutingClass = prevExecutingClass;
      currentExecutingObject = prevExecutingObject;
      currentExecutingCompartment = prevExecutingCompartment;
      currentHighlightedMember = prevHighlightedMember;

      return funcReturnValue;
    };

    // Statement Execution Engine
    executeStatements = (
      stmts: { lineNum: number; raw: string; trimmed: string }[],
      scopeName: string,
      currentFrame?: FunctionCallFrame
    ): { hasReturned: boolean; returnValue?: string } => {
      let idx = 0;
      while (idx < stmts.length) {
        if (isWaitingForInput) {
          return { hasReturned: false };
        }
        const cur = stmts[idx];
        const trimmed = cur.trimmed;

        if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#') || trimmed.startsWith('using')) {
          idx++;
          continue;
        }

        // Return statement (supports recursive calls like return n * factorial(n - 1);)
        if (trimmed.startsWith('return')) {
          const retMatch = trimmed.match(/^return\s*(.*?);?$/);
          const retRawExpr = retMatch ? retMatch[1].trim() : '';
          let retVal = '';

          if (retRawExpr && retRawExpr !== 'void') {
            retVal = evalExpressionWithCalls(retRawExpr, currentFrame);

            if (currentFrame && (retRawExpr.includes('*') || retRawExpr.includes('+') || retRawExpr.includes('-') || retRawExpr.includes('/'))) {
              const substituted = substituteVariables(retRawExpr, currentFrame);
              currentFrame.calculationDetails = `Calculated: ${substituted} = ${retVal}`;
              recordStep(
                cur.lineNum,
                trimmed,
                `Calculated return value in '${currentFrame.callSignature}': ${retRawExpr} ➔ ${retVal}.`,
                { funcFrame: currentFrame }
              );
            }
          }

          idx++;
          return { hasReturned: true, returnValue: retVal };
        }

        // 0. Class Object Instantiation: e.g. Student s; or Student s1, s2;
        const objDeclMatch = trimmed.match(/^([a-zA-Z_]\w*)\s+([^;()]+);$/);
        if (objDeclMatch && classDefs.has(objDeclMatch[1])) {
          const clsName = objDeclMatch[1];
          const clsDef = classDefs.get(clsName)!;
          const varListStr = objDeclMatch[2];
          const objNames = varListStr.split(',').map(s => s.trim().split(/[\s=]/)[0]).filter(Boolean);

          objNames.forEach(objName => {
            const memberVals: Record<string, string> = {};
            clsDef.privateVariables.forEach(v => { memberVals[v.name] = v.defaultValue || '0'; });
            clsDef.publicVariables.forEach(v => { memberVals[v.name] = v.defaultValue || '0'; });

            const newObj: ClassObjectInstance = {
              objectName: objName,
              className: clsName,
              memberValues: memberVals
            };
            objectInstances.set(objName, newObj);
            currentExecutingObject = objName;
            currentExecutingClass = clsName;

            recordStep(
              cur.lineNum,
              trimmed,
              `Instantiated object '${objName}' of class '${clsName}'. Blueprint initialized with private & public member compartments.`
            );
          });
          idx++;
          continue;
        }

        // 0.1 Class Method Call on Object: e.g. s.display(); or s.calculate();
        const objMethodMatch = trimmed.match(/^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*\((.*?)\)\s*;?$/);
        if (objMethodMatch && objectInstances.has(objMethodMatch[1])) {
          const objName = objMethodMatch[1];
          const methodName = objMethodMatch[2];
          const rawArgs = objMethodMatch[3].trim();
          const obj = objectInstances.get(objName)!;
          const clsDef = classDefs.get(obj.className);

          if (clsDef) {
            const isPrivateFunc = clsDef.privateFunctions.some(f => f.name === methodName);
            const isPrivateVar = clsDef.privateVariables.some(v => v.name === methodName);
            if (isPrivateFunc || isPrivateVar) {
              currentAccessViolation = {
                attemptedMember: methodName,
                attemptedAccess: 'private',
                caller: currentFrame ? currentFrame.functionName : 'main()',
                errorMessage: `Cannot access private member '${methodName}' of class '${clsDef.name}'. External callers are restricted to PUBLIC members.`
              };
              currentExecutingClass = clsDef.name;
              currentExecutingObject = objName;
              currentExecutingCompartment = 'private';
              currentHighlightedMember = methodName;

              recordStep(
                cur.lineNum,
                trimmed,
                `🚫 Access Violation: External call '${objName}.${methodName}()' attempted to enter the PRIVATE compartment. Access blocked! Private members are strictly hidden from external code.`,
                {
                  classContainer: makeClassSnapshot({ accessViolation: currentAccessViolation })
                }
              );
              idx++;
              continue;
            }

            const pubFunc = clsDef.publicFunctions.find(f => f.name === methodName);
            if (pubFunc) {
              currentAccessViolation = undefined;
              currentExecutingClass = clsDef.name;
              currentExecutingObject = objName;
              currentExecutingCompartment = 'public';
              currentHighlightedMember = methodName;

              // Step 1: Pathway entrance through Opening A
              activePathwayArrow = {
                type: 'external-to-public',
                fromLabel: currentFrame ? currentFrame.functionName : 'main()',
                toLabel: `${objName}.${methodName}()`,
                targetCompartment: 'public',
                targetMember: methodName,
                status: 'animating'
              };

              recordStep(
                cur.lineNum,
                trimmed,
                `Access granted: External call '${objName}.${methodName}()' enters through Opening A into the PUBLIC compartment.`,
                {
                  classContainer: makeClassSnapshot({ activePathway: activePathwayArrow })
                }
              );

              // Step 2: Execute function
              const evaluatedArgs = rawArgs ? rawArgs.split(',').map(a => evaluateMathExpr(substituteVariables(a, currentFrame))) : [];
              executeClassMemberFunction(clsDef, obj, pubFunc, evaluatedArgs, `${objName}.${methodName}()`, false, currentFrame);

              // Return transition through Opening A
              activePathwayArrow = {
                type: 'return-to-caller',
                fromLabel: `${objName}.${methodName}()`,
                toLabel: currentFrame ? currentFrame.functionName : 'main()',
                targetCompartment: 'public',
                status: 'completed'
              };
              recordStep(
                cur.lineNum,
                `// Returned from ${objName}.${methodName}()`,
                `Completed execution of '${objName}.${methodName}()', exiting PUBLIC compartment through Opening A back to caller.`,
                {
                  classContainer: makeClassSnapshot({ activePathway: activePathwayArrow })
                }
              );
              activePathwayArrow = undefined;
              currentExecutingCompartment = 'none';
              currentHighlightedMember = undefined;

              idx++;
              continue;
            }
          }
        }

        // 0.2 Internal Class Function Call: e.g. calculate(); inside display()
        if (currentExecutingClass && currentExecutingObject) {
          const internalCallMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\((.*?)\)\s*;?$/);
          if (internalCallMatch && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('if') && !trimmed.startsWith('cout') && !trimmed.startsWith('cin') && !trimmed.startsWith('return')) {
            const funcName = internalCallMatch[1];
            const rawArgs = internalCallMatch[2].trim();
            const clsDef = classDefs.get(currentExecutingClass);
            const obj = objectInstances.get(currentExecutingObject)!;

            if (clsDef) {
              const privFunc = clsDef.privateFunctions.find(f => f.name === funcName);
              const pubFunc = clsDef.publicFunctions.find(f => f.name === funcName);
              const targetFunc = privFunc || pubFunc;

              if (targetFunc) {
                if (targetFunc.access === 'private') {
                  activePathwayArrow = {
                    type: 'public-to-private',
                    fromLabel: currentHighlightedMember || 'public',
                    toLabel: funcName,
                    targetCompartment: 'private',
                    targetMember: funcName,
                    status: 'animating'
                  };
                  recordStep(
                    cur.lineNum,
                    trimmed,
                    `Internal access allowed: '${currentHighlightedMember || 'class'}' calls private function '${funcName}()'. Execution arrow travels UPWARDS through Opening B into the PRIVATE compartment.`,
                    {
                      classContainer: makeClassSnapshot({ activePathway: activePathwayArrow })
                    }
                  );
                }

                const evaluatedArgs = rawArgs ? rawArgs.split(',').map(a => evaluateMathExpr(substituteVariables(a, currentFrame))) : [];
                executeClassMemberFunction(clsDef, obj, targetFunc, evaluatedArgs, `${funcName}()`, true, currentFrame);

                if (targetFunc.access === 'private') {
                  activePathwayArrow = {
                    type: 'return-to-public',
                    fromLabel: funcName,
                    toLabel: currentHighlightedMember || 'display',
                    targetCompartment: 'public',
                    status: 'completed'
                  };
                  recordStep(
                    cur.lineNum,
                    `// Returned from ${funcName}()`,
                    `Returned from private function '${funcName}()' through Opening B back to PUBLIC compartment.`,
                    {
                      classContainer: makeClassSnapshot({ activePathway: activePathwayArrow })
                    }
                  );
                  activePathwayArrow = undefined;
                }

                idx++;
                continue;
              }
            }
          }
        }

        // 0.3 Member Variable Assignment inside class method: e.g. age = age + 1; or age = 20;
        if (currentExecutingClass && currentExecutingObject) {
          const assignMemberMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|%=|=)\s*(.+?);$/);
          if (assignMemberMatch && !trimmed.startsWith('cout') && !trimmed.startsWith('cin')) {
            const mVarName = assignMemberMatch[1];
            const op = assignMemberMatch[2];
            const expr = assignMemberMatch[3].trim();
            const obj = objectInstances.get(currentExecutingObject)!;
            const clsDef = classDefs.get(currentExecutingClass)!;

            const isPriv = clsDef.privateVariables.some(v => v.name === mVarName);
            const isPub = clsDef.publicVariables.some(v => v.name === mVarName);

            if (isPriv || isPub) {
              const oldVal = obj.memberValues[mVarName] ?? '0';
              let newVal = evalExpressionWithCalls(expr, currentFrame);
              if (op === '+=') newVal = String(parseFloat(oldVal) + parseFloat(newVal));
              else if (op === '-=') newVal = String(parseFloat(oldVal) - parseFloat(newVal));
              else if (op === '*=') newVal = String(parseFloat(oldVal) * parseFloat(newVal));
              else if (op === '/=') newVal = String(parseFloat(oldVal) / (parseFloat(newVal) || 1));
              else if (op === '%=') newVal = String(parseFloat(oldVal) % (parseFloat(newVal) || 1));

              if (!obj.previousMemberValues) obj.previousMemberValues = {};
              obj.previousMemberValues[mVarName] = oldVal;
              obj.memberValues[mVarName] = newVal;
              obj.isModifiedMember = mVarName;

              recordStep(
                cur.lineNum,
                trimmed,
                `Updated ${isPriv ? 'private' : 'public'} member variable '${mVarName}' in object '${obj.objectName}' from ${oldVal} to ${newVal}. Value updated in ${isPriv ? 'PRIVATE' : 'PUBLIC'} compartment bucket.`,
                {
                  classContainer: makeClassSnapshot({
                    highlightedCompartment: isPriv ? 'private' : 'public',
                    highlightedMember: mVarName
                  }),
                  funcFrame: currentFrame
                }
              );
              idx++;
              continue;
            }
          }
        }

        // 0.4 Direct Member Variable Access from outside (e.g. s.age = 25; or s.age;)
        const directVarMatch = trimmed.match(/^([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*(=|\+=|-=|\*=|\/=|%=)?\s*(.*?);?$/);
        if (directVarMatch && objectInstances.has(directVarMatch[1])) {
          const objName = directVarMatch[1];
          const mName = directVarMatch[2];
          const obj = objectInstances.get(objName)!;
          const clsDef = classDefs.get(obj.className);
          if (clsDef && clsDef.privateVariables.some(v => v.name === mName)) {
            currentAccessViolation = {
              attemptedMember: mName,
              attemptedAccess: 'private',
              caller: currentFrame ? currentFrame.functionName : 'main()',
              errorMessage: `Cannot access private member variable '${mName}' of class '${clsDef.name}'. Direct external access is forbidden.`
            };
            recordStep(
              cur.lineNum,
              trimmed,
              `🚫 Access Violation: Attempted to access private member '${objName}.${mName}' directly from outside class. Blocked at boundary!`,
              {
                classContainer: makeClassSnapshot({ accessViolation: currentAccessViolation })
              }
            );
            idx++;
            continue;
          }
        }

        // 1. FOR LOOP (supports nested for loops)
        const forMatch = trimmed.match(/^for\s*\(\s*(.*?)\s*;\s*(.*?)\s*;\s*(.*?)\s*\)/);
        if (forMatch) {
          const initPart = forMatch[1];
          const condPart = forMatch[2];
          const updatePart = forMatch[3];

          const { bodyLines, endLineIdx } = this.extractBlockBody(stmts, idx);
          idx = endLineIdx + 1;

          // Parse loop variable & initial value
          let loopVarName = '';
          let loopVarVal = 0;
          const initDeclMatch = initPart.match(/(?:int\s+)?([a-zA-Z_]\w*)\s*=\s*(-?\d+)/);
          if (initDeclMatch) {
            loopVarName = initDeclMatch[1];
            loopVarVal = parseInt(initDeclMatch[2], 10);
          }

          const loopId = `loop_${cur.lineNum}_depth${activeLoopStack.length + 1}`;
          const previousValues: string[] = [];

          const loopState: LoopContainerState = {
            id: loopId,
            loopType: 'for',
            headerText: trimmed,
            variableName: loopVarName || 'i',
            currentValue: String(loopVarVal),
            previousValues: [...previousValues],
            iteration: 1,
            conditionText: condPart,
            conditionPassed: true,
            phase: 'init',
            depth: activeLoopStack.length + 1,
            parentLoopId: activeLoopStack.length > 0 ? activeLoopStack[activeLoopStack.length - 1].id : undefined
          };

          activeLoopStack.push(loopState);

          if (loopVarName) {
            if (!varMap.has(loopVarName)) {
              varOrder.push(loopVarName);
            }
            varMap.set(loopVarName, {
              name: loopVarName,
              value: String(loopVarVal),
              isNew: true,
              isEmpty: false,
              scope: scopeName
            });
          }

          // Step 1: Init
          recordStep(
            cur.lineNum,
            trimmed,
            `Loop initialization: ${initPart}. Initialized '${loopVarName}' to ${loopVarVal}.`,
            { modifiedVar: loopVarName }
          );

          const iterationStepRanges: { iteration: number; startIndex: number; endIndex: number }[] = [];
          const SAFEGUARD_MAX_ITERATIONS = 10000;
          let iteration = 1;

          while (iteration <= SAFEGUARD_MAX_ITERATIONS) {
            const iterStart = steps.length;

            // Step 2: Condition
            const condPassed = this.evalCondition(condPart, loopVarName, loopVarVal, varMap);
            loopState.phase = 'condition';
            loopState.iteration = iteration;
            loopState.conditionPassed = condPassed;
            loopState.currentValue = String(loopVarVal);
            loopState.previousValues = [...previousValues];

            recordStep(
              cur.lineNum,
              `${condPart} [${condPassed ? 'TRUE' : 'FALSE'}]`,
              `Evaluating loop condition '${condPart}': ${loopVarVal} ${condPart.replace(loopVarName, '').trim()} is ${condPassed ? 'TRUE' : 'FALSE'}.`,
              {
                condEvent: {
                  conditionText: condPart,
                  evaluatedResult: condPassed,
                  branchTaken: condPassed ? 'if' : 'skipped',
                  explanation: condPassed ? 'Condition is TRUE. Executing loop body.' : 'Condition is FALSE. Exiting loop.'
                }
              }
            );

            if (!condPassed) {
              // Loop Exit
              loopState.phase = 'exit';
              loopState.isExiting = true;
              recordStep(
                cur.lineNum,
                `Loop finished. Condition '${condPart}' is false.`,
                `Exiting loop after ${iteration - 1} iterations.`
              );
              break;
            }

            // Step 3: Body execution
            loopState.phase = 'body';
            executeStatements(bodyLines, `${scopeName}_loop`);
            if (isWaitingForInput) {
              const iterEnd = steps.length;
              iterationStepRanges.push({ iteration, startIndex: iterStart, endIndex: iterEnd });
              break;
            }

            // Step 4: Update / Increment
            previousValues.push(String(loopVarVal));
            const oldVal = loopVarVal;
            loopVarVal = this.evalUpdate(updatePart, loopVarVal);

            if (loopVarName && varMap.has(loopVarName)) {
              const b = varMap.get(loopVarName)!;
              b.previousValue = String(oldVal);
              b.value = String(loopVarVal);
              b.isModified = true;
            }

            loopState.phase = 'update';
            loopState.currentValue = String(loopVarVal);
            loopState.previousValues = [...previousValues];

            recordStep(
              cur.lineNum,
              updatePart,
              `Update loop variable: ${updatePart}. '${loopVarName}' updated from ${oldVal} to ${loopVarVal}.`,
              { modifiedVar: loopVarName }
            );

            const iterEnd = steps.length;
            iterationStepRanges.push({ iteration, startIndex: iterStart, endIndex: iterEnd });
            iteration++;
          }

          if (iteration > SAFEGUARD_MAX_ITERATIONS) {
            recordStep(
              cur.lineNum,
              `Safeguard limit reached (${SAFEGUARD_MAX_ITERATIONS} iterations)`,
              `Execution safeguard: Loop reached maximum safety threshold of ${SAFEGUARD_MAX_ITERATIONS} iterations to prevent freezing.`
            );
          }

          activeLoopStack.pop();

          // Apply adaptive loop grouping to intermediate iterations
          ProgramSimulator.applyAdaptiveLoopGrouping(
            steps,
            loopId,
            'for',
            loopVarName,
            cur.lineNum,
            iterationStepRanges
          );
          continue;
        }

        // 2. WHILE LOOP
        const whileMatch = trimmed.match(/^while\s*\(\s*(.*?)\s*\)/);
        if (whileMatch && !trimmed.endsWith(';')) {
          const condPart = whileMatch[1];
          const { bodyLines, endLineIdx } = this.extractBlockBody(stmts, idx);
          idx = endLineIdx + 1;

          const condVarMatch = condPart.match(/([a-zA-Z_]\w*)/);
          const loopVarName = condVarMatch ? condVarMatch[1] : 'cond';
          const loopId = `while_${cur.lineNum}_depth${activeLoopStack.length + 1}`;
          const previousValues: string[] = [];

          const loopState: LoopContainerState = {
            id: loopId,
            loopType: 'while',
            headerText: trimmed,
            variableName: loopVarName,
            currentValue: varMap.has(loopVarName) ? varMap.get(loopVarName)!.value : '0',
            previousValues: [...previousValues],
            iteration: 1,
            conditionText: condPart,
            conditionPassed: true,
            phase: 'condition',
            depth: activeLoopStack.length + 1,
            parentLoopId: activeLoopStack.length > 0 ? activeLoopStack[activeLoopStack.length - 1].id : undefined
          };

          activeLoopStack.push(loopState);

          const iterationStepRanges: { iteration: number; startIndex: number; endIndex: number }[] = [];
          const SAFEGUARD_MAX_ITERATIONS = 10000;
          let iteration = 1;

          while (iteration <= SAFEGUARD_MAX_ITERATIONS) {
            const iterStart = steps.length;
            const curValNum = varMap.has(loopVarName) ? parseFloat(varMap.get(loopVarName)!.value) : 0;
            const condPassed = this.evalCondition(condPart, loopVarName, curValNum, varMap);
            loopState.phase = 'condition';
            loopState.iteration = iteration;
            loopState.conditionPassed = condPassed;
            loopState.currentValue = String(curValNum);
            loopState.previousValues = [...previousValues];

            recordStep(
              cur.lineNum,
              `while (${condPart}) [${condPassed ? 'TRUE' : 'FALSE'}]`,
              `While condition '${condPart}' evaluated to ${condPassed ? 'TRUE' : 'FALSE'}.`,
              {
                condEvent: {
                  conditionText: condPart,
                  evaluatedResult: condPassed,
                  branchTaken: condPassed ? 'if' : 'skipped',
                  explanation: condPassed ? 'Condition is TRUE. Executing while loop body.' : 'Condition is FALSE. Exiting while loop.'
                }
              }
            );

            if (!condPassed) {
              loopState.phase = 'exit';
              loopState.isExiting = true;
              recordStep(cur.lineNum, `Loop finished. Condition is false.`, `Exiting while loop.`);
              break;
            }

            previousValues.push(String(curValNum));
            loopState.phase = 'body';
            executeStatements(bodyLines, `${scopeName}_while`);
            const iterEnd = steps.length;
            iterationStepRanges.push({ iteration, startIndex: iterStart, endIndex: iterEnd });
            if (isWaitingForInput) {
              break;
            }

            iteration++;
          }

          if (iteration > SAFEGUARD_MAX_ITERATIONS) {
            recordStep(
              cur.lineNum,
              `Safeguard limit reached (${SAFEGUARD_MAX_ITERATIONS} iterations)`,
              `Execution safeguard: Loop reached maximum safety threshold of ${SAFEGUARD_MAX_ITERATIONS} iterations to prevent freezing.`
            );
          }

          activeLoopStack.pop();

          // Apply adaptive loop grouping to intermediate iterations
          ProgramSimulator.applyAdaptiveLoopGrouping(
            steps,
            loopId,
            'while',
            loopVarName,
            cur.lineNum,
            iterationStepRanges
          );
          continue;
        }

        // 3. DO-WHILE LOOP
        if (trimmed.startsWith('do')) {
          const res = this.extractBlockBody(stmts, idx);
          const bodyLines = res.bodyLines;
          let endLineIdx = res.endLineIdx;
          let whileLine = endLineIdx < stmts.length ? stmts[endLineIdx] : cur;
          let condPart = 'true';
          const doWhileMatch = whileLine.trimmed.match(/while\s*\(\s*(.*?)\s*\)\s*;/);
          if (doWhileMatch) {
            condPart = doWhileMatch[1];
          } else if (endLineIdx + 1 < stmts.length) {
            const nextL = stmts[endLineIdx + 1];
            const m = nextL.trimmed.match(/while\s*\(\s*(.*?)\s*\)\s*;/);
            if (m) {
              condPart = m[1];
              endLineIdx++;
            }
          }
          idx = endLineIdx + 1;

          const condVarMatch = condPart.match(/([a-zA-Z_]\w*)/);
          const loopVarName = condVarMatch ? condVarMatch[1] : 'i';
          const loopId = `dowhile_${cur.lineNum}`;
          const previousValues: string[] = [];

          const loopState: LoopContainerState = {
            id: loopId,
            loopType: 'do-while',
            headerText: `do ... while (${condPart})`,
            variableName: loopVarName,
            currentValue: varMap.has(loopVarName) ? varMap.get(loopVarName)!.value : '0',
            previousValues: [...previousValues],
            iteration: 1,
            conditionText: condPart,
            conditionPassed: true,
            phase: 'body',
            depth: activeLoopStack.length + 1
          };

          activeLoopStack.push(loopState);

          const iterationStepRanges: { iteration: number; startIndex: number; endIndex: number }[] = [];
          const SAFEGUARD_MAX_ITERATIONS = 10000;
          let iteration = 1;

          while (iteration <= SAFEGUARD_MAX_ITERATIONS) {
            const iterStart = steps.length;
            // In C++, do-while executes body first!
            loopState.phase = 'body';
            loopState.iteration = iteration;
            recordStep(cur.lineNum, `do { ... } [Iteration ${iteration}]`, `Executing do-while loop body (Iteration ${iteration}).`);
            executeStatements(bodyLines, `${scopeName}_dowhile`);
            if (isWaitingForInput) {
              const iterEnd = steps.length;
              iterationStepRanges.push({ iteration, startIndex: iterStart, endIndex: iterEnd });
              break;
            }

            // Check condition after body execution
            const curValNum = varMap.has(loopVarName) ? parseFloat(varMap.get(loopVarName)!.value) : 0;
            const condPassed = this.evalGeneralCondition(condPart, varMap);
            previousValues.push(String(curValNum));
            loopState.phase = 'condition';
            loopState.conditionPassed = condPassed;
            loopState.currentValue = String(curValNum);
            loopState.previousValues = [...previousValues];

            recordStep(
              whileLine.lineNum,
              `while (${condPart}) [${condPassed ? 'TRUE' : 'FALSE'}]`,
              `Evaluating do-while condition '${condPart}' after body: ${condPassed ? 'TRUE' : 'FALSE'}.`,
              {
                condEvent: {
                  conditionText: condPart,
                  evaluatedResult: condPassed,
                  branchTaken: condPassed ? 'if' : 'skipped',
                  explanation: condPassed ? 'Condition is TRUE. Repeating do-while loop.' : 'Condition is FALSE. Exiting do-while loop.'
                }
              }
            );

            const iterEnd = steps.length;
            iterationStepRanges.push({ iteration, startIndex: iterStart, endIndex: iterEnd });

            if (!condPassed) {
              loopState.phase = 'exit';
              loopState.isExiting = true;
              recordStep(whileLine.lineNum, `Loop finished. Condition is false.`, `Exiting do-while loop.`);
              break;
            }

            iteration++;
          }

          if (iteration > SAFEGUARD_MAX_ITERATIONS) {
            recordStep(
              cur.lineNum,
              `Safeguard limit reached (${SAFEGUARD_MAX_ITERATIONS} iterations)`,
              `Execution safeguard: Loop reached maximum safety threshold of ${SAFEGUARD_MAX_ITERATIONS} iterations to prevent freezing.`
            );
          }

          activeLoopStack.pop();

          // Apply adaptive loop grouping to intermediate iterations
          ProgramSimulator.applyAdaptiveLoopGrouping(
            steps,
            loopId,
            'do-while',
            loopVarName,
            cur.lineNum,
            iterationStepRanges
          );
          continue;
        }

        // 4. IF / ELSE IF / ELSE BRANCHING
        if (trimmed.startsWith('if')) {
          const ifMatch = trimmed.match(/^if\s*\(\s*(.*?)\s*\)(?:\s*(.+))?$/);
          if (ifMatch) {
            const condPart = ifMatch[1];
            const inlineStmt = ifMatch[2] ? ifMatch[2].trim() : '';
            const condPassed = evalGeneralCondition(condPart, currentFrame);

            let ifBody: { lineNum: number; raw: string; trimmed: string }[] = [];
            let ifEnd = idx;

            if (inlineStmt && !inlineStmt.startsWith('{')) {
              // Single-line if (e.g. if (n <= 1) return 1;)
              ifBody = [{ lineNum: cur.lineNum, raw: inlineStmt, trimmed: inlineStmt }];
              ifEnd = idx;
            } else {
              const extracted = this.extractBlockBody(stmts, idx);
              ifBody = extracted.bodyLines;
              ifEnd = extracted.endLineIdx;
            }

            // Check if followed by else / else if (e.g. "} else {" or "else {")
            let elseBody: { lineNum: number; raw: string; trimmed: string }[] | null = null;
            let elseIfCond = '';
            let elseIfPassed = false;
            let elseIfBody: { lineNum: number; raw: string; trimmed: string }[] | null = null;

            let elseIdx = ifEnd;
            if (elseIdx < stmts.length && !stmts[elseIdx].trimmed.includes('else')) {
              elseIdx++;
            }

            if (elseIdx < stmts.length && stmts[elseIdx].trimmed.includes('else')) {
              const elseLine = stmts[elseIdx].trimmed;
              if (elseLine.includes('else if')) {
                const elseIfMatch = elseLine.match(/else\s+if\s*\(\s*(.*?)\s*\)/);
                if (elseIfMatch) {
                  elseIfCond = elseIfMatch[1];
                  elseIfPassed = !condPassed && evalGeneralCondition(elseIfCond, currentFrame);
                  const { bodyLines, endLineIdx } = this.extractBlockBody(stmts, elseIdx);
                  elseIfBody = bodyLines;
                  idx = endLineIdx + 1;
                }
              } else {
                const { bodyLines, endLineIdx } = this.extractBlockBody(stmts, elseIdx);
                elseBody = bodyLines;
                idx = endLineIdx + 1;
              }
            } else {
              idx = ifEnd + 1;
            }

            // Step for condition evaluation
            recordStep(
              cur.lineNum,
              `if (${condPart}) [${condPassed ? 'TRUE' : 'FALSE'}]`,
              `Evaluated condition '${condPart}': result is ${condPassed ? 'TRUE' : 'FALSE'}. ${condPassed ? 'Taking IF branch.' : 'Skipping IF branch.'}`,
              {
                condEvent: {
                  conditionText: condPart,
                  evaluatedResult: condPassed,
                  branchTaken: condPassed ? 'if' : (elseBody ? 'else' : 'skipped'),
                  explanation: condPassed ? 'Condition is TRUE' : 'Condition is FALSE'
                },
                funcFrame: currentFrame
              }
            );

            if (condPassed) {
              const res = executeStatements(ifBody, `${scopeName}_if`, currentFrame);
              if (res && res.hasReturned) {
                return res;
              }
            } else if (elseIfBody && elseIfPassed) {
              const res = executeStatements(elseIfBody, `${scopeName}_elseif`, currentFrame);
              if (res && res.hasReturned) {
                return res;
              }
            } else if (elseBody) {
              recordStep(
                stmts[idx - 1] ? stmts[idx - 1].lineNum : cur.lineNum,
                `else { ... }`,
                `IF condition was FALSE. Executing ELSE branch.`,
                {
                  condEvent: {
                    conditionText: 'else',
                    evaluatedResult: true,
                    branchTaken: 'else',
                    explanation: 'Executing ELSE branch'
                  },
                  funcFrame: currentFrame
                }
              );
              const res = executeStatements(elseBody, `${scopeName}_else`, currentFrame);
              if (res && res.hasReturned) {
                return res;
              }
            }

            if (isWaitingForInput) {
              return { hasReturned: false };
            }

            continue;
          }
        }

        // 5. USER INPUT (cin >> var1 >> var2)
        if (trimmed.startsWith('cin') || trimmed.includes('cin >>') || trimmed.includes('cin>>')) {
          const inputVars: string[] = [];
          const regex = />>\s*([a-zA-Z_]\w*)/g;
          let m;
          while ((m = regex.exec(trimmed)) !== null) {
            inputVars.push(m[1]);
          }

          for (const inputVar of inputVars) {
            if (!varMap.has(inputVar)) {
              varOrder.push(inputVar);
              varMap.set(inputVar, {
                name: inputVar,
                value: '',
                isEmpty: true,
                isNew: true,
                scope: scopeName
              });
            }

            const b = varMap.get(inputVar)!;
            let submittedVal: string | undefined = undefined;

            if (orderedInputs && orderedInputs.length > 0) {
              if (cinCallIndex < orderedInputs.length) {
                submittedVal = orderedInputs[cinCallIndex];
              }
            } else if (providedInputs[inputVar] !== undefined && providedInputs[inputVar] !== '') {
              submittedVal = providedInputs[inputVar];
            }

            if (submittedVal !== undefined && submittedVal !== '') {
              cinCallIndex++;
              // Apply user's submitted input!
              b.previousValue = b.value || '';
              b.value = submittedVal;
              b.isEmpty = false;
              b.isModified = true;

              DiagnosticLogger.log('INPUT_RECEIVED', `Applied terminal input to variable '${inputVar}'`, {
                value: submittedVal,
                previousValue: b.previousValue,
                cinCallIndex,
                line: cur.lineNum
              });

              recordStep(
                cur.lineNum,
                `cin >> ${inputVar}; [received: ${submittedVal}]`,
                `Received terminal input for '${inputVar}': value ${submittedVal} entered the bucket.`,
                { modifiedVar: inputVar }
              );
            } else {
              // Pause and request input via integrated terminal
              DiagnosticLogger.log('INPUT_REQUEST', `Execution paused waiting for terminal input for '${inputVar}'`, {
                cinCallIndex,
                line: cur.lineNum
              });

              recordStep(
                cur.lineNum,
                `cin >> ${inputVar};`,
                `Program paused: waiting for user input for variable '${inputVar}' in VS Code integrated terminal.`,
                {
                  inputReq: {
                    variableName: inputVar,
                    promptText: `cin >> ${inputVar};`,
                    line: cur.lineNum,
                    isWaiting: true,
                    expectedType: b.type || 'int'
                  }
                }
              );
              isWaitingForInput = true;
              break;
            }
          }

          if (isWaitingForInput) {
            return { hasReturned: false };
          }

          idx++;
          continue;
        }

        // 6. STANDALONE FUNCTION CALL STATEMENT (e.g. countdown(n - 1); or print(x);)
        const standaloneCallMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\((.*?)\)\s*;$/);
        if (standaloneCallMatch && functionDefs.has(standaloneCallMatch[1])) {
          const funcName = standaloneCallMatch[1];
          const rawArgStr = standaloneCallMatch[2];
          const argParts = rawArgStr ? rawArgStr.split(',').map(s => s.trim()).filter(Boolean) : [];
          const evaluatedArgs: string[] = [];
          for (const argPart of argParts) {
            evaluatedArgs.push(evalExpressionWithCalls(argPart, currentFrame));
          }
          executeFunction(funcName, evaluatedArgs, undefined, currentFrame);
          idx++;
          continue;
        }

        // 7. ARRAY DECLARATION (e.g. int arr[4] = {10, 20, 30, 40}; or int nums[3];)
        const arrayDeclMatch = trimmed.match(/^(?:const\s+)?(int|float|double|char|string)\s+([a-zA-Z_]\w*)\s*\[\s*(\d*)\s*\]\s*(?:=\s*\{([^}]*)\})?\s*;$/);
        if (arrayDeclMatch) {
          const elemType = arrayDeclMatch[1];
          const arrName = arrayDeclMatch[2];
          const sizeStr = arrayDeclMatch[3];
          const initList = arrayDeclMatch[4] ? arrayDeclMatch[4].split(',').map(s => s.trim()) : [];

          const count = sizeStr ? parseInt(sizeStr, 10) : initList.length;
          const cells: ArrayMemoryCell[] = [];

          for (let c = 0; c < count; c++) {
            const val = c < initList.length ? initList[c] : '0';
            cells.push({
              index: c,
              label: `${arrName}[${c}]`,
              value: val
            });
          }

          arrayMap.set(arrName, {
            name: arrName,
            type: elemType,
            cells
          });

          recordStep(
            cur.lineNum,
            trimmed,
            `Created array '${arrName}' with ${count} indexed elements [${cells.map(c => c.value).join(', ')}].`
          );

          idx++;
          continue;
        }

        // 8. ARRAY ELEMENT ASSIGNMENT (e.g. arr[1] = 99; or arr[i] = x;)
        const arrAssignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*\[\s*([^\]]+)\s*\]\s*=\s*(.+?);$/);
        if (arrAssignMatch) {
          const arrName = arrAssignMatch[1];
          const idxExpr = arrAssignMatch[2].trim();
          const valExpr = arrAssignMatch[3].trim();

          if (arrayMap.has(arrName)) {
            const arr = arrayMap.get(arrName)!;
            const evalIdx = parseInt(this.evaluateExpression(idxExpr, '=', '0', varMap), 10);
            const evalVal = this.evaluateExpression(valExpr, '=', '0', varMap);

            if (evalIdx >= 0 && evalIdx < arr.cells.length) {
              const cell = arr.cells[evalIdx];
              cell.previousValue = cell.value;
              cell.value = evalVal;
              cell.isModified = true;

              recordStep(
                cur.lineNum,
                trimmed,
                `Updated array element ${arrName}[${evalIdx}] from '${cell.previousValue}' to '${evalVal}'.`
              );
            }
          }

          idx++;
          continue;
        }

        // 9. POINTER DECLARATION (e.g. int *ptr = &a;)
        const ptrMatch = trimmed.match(/^(int|float|double|char)\s*\*\s*([a-zA-Z_]\w*)\s*=\s*&\s*([a-zA-Z_]\w*)\s*;$/);
        if (ptrMatch) {
          const ptrType = ptrMatch[1];
          const ptrName = ptrMatch[2];
          const targetVar = ptrMatch[3];

          if (!varMap.has(ptrName)) {
            varOrder.push(ptrName);
          }
          varMap.set(ptrName, {
            name: ptrName,
            value: `&${targetVar}`,
            type: 'pointer',
            pointsTo: targetVar,
            isNew: true,
            scope: scopeName
          });

          recordStep(
            cur.lineNum,
            trimmed,
            `Created pointer '${ptrName}' pointing to variable bucket '${targetVar}'.`,
            { modifiedVar: ptrName }
          );

          idx++;
          continue;
        }

        // 10. VARIABLE DECLARATION (e.g. int answer = factorial(4); int a = 10; float marks = 85.5;)
        const declMatch = trimmed.match(/^(?:const\s+)?(int|float|double|char|string|bool|long|short|auto)\s+(.+?);$/);
        if (declMatch && !trimmed.includes(') {') && !trimmed.match(/\)\s*\{?$/)) {
          const varType = declMatch[1];
          const varDefs = splitTopLevelCommas(declMatch[2]);
          for (const def of varDefs) {
            const eqIdx = def.indexOf('=');
            const varName = (eqIdx !== -1 ? def.slice(0, eqIdx) : def).trim();
            let initVal = eqIdx !== -1 ? def.slice(eqIdx + 1).trim() : '';

            // Evaluate expression with potential function calls!
            if (initVal) {
              initVal = evalExpressionWithCalls(initVal, currentFrame);
            }

            const isUninitialized = !initVal;
            if (currentFrame) {
              let existing = currentFrame.localVariables.find(v => v.name === varName);
              if (existing) {
                if (initVal) {
                  existing.previousValue = existing.value;
                  existing.value = initVal;
                  existing.isEmpty = false;
                  existing.isModified = true;
                }
              } else {
                currentFrame.localVariables.push({
                  name: varName,
                  value: initVal,
                  type: varType,
                  isEmpty: isUninitialized,
                  isNew: true,
                  scope: currentFrame.id
                });
              }

              recordStep(
                cur.lineNum,
                trimmed,
                isUninitialized
                  ? `In '${currentFrame.callSignature}': created empty local variable '${varName}'.`
                  : `In '${currentFrame.callSignature}': created local variable '${varName}' with value ${initVal}.`,
                { funcFrame: currentFrame }
              );
            } else {
              // Main scope
              if (varMap.has(varName)) {
                const existing = varMap.get(varName)!;
                if (initVal) {
                  existing.previousValue = existing.value;
                  existing.value = initVal;
                  existing.isEmpty = false;
                  existing.isModified = true;
                }
              } else {
                varOrder.push(varName);
                varMap.set(varName, {
                  name: varName,
                  value: initVal,
                  type: varType,
                  isEmpty: isUninitialized,
                  isNew: true,
                  scope: scopeName
                });
              }

              recordStep(
                cur.lineNum,
                trimmed,
                isUninitialized
                  ? `Created empty bucket for variable '${varName}' (uninitialized, waiting for value).`
                  : `Created bucket for variable '${varName}' with value ${initVal}.`,
                { modifiedVar: varName }
              );
            }
          }

          idx++;
          continue;
        }

        // 11. INCREMENT / DECREMENT STATEMENT (e.g. x++; x--; ++x; --x;)
        const incDecMatch = trimmed.match(/^(\+\+|--)?\s*([a-zA-Z_]\w*)\s*(\+\+|--)?;?$/);
        if (incDecMatch && (incDecMatch[1] || incDecMatch[3])) {
          const varName = incDecMatch[2];
          const isInc = (incDecMatch[1] === '++' || incDecMatch[3] === '++');
          let targetBucket: VariableBucket | undefined = undefined;
          if (currentFrame) {
            targetBucket = currentFrame.localVariables.find(v => v.name === varName) || currentFrame.parameters.find(p => p.name === varName);
          }
          if (!targetBucket && varMap.has(varName)) {
            targetBucket = varMap.get(varName);
          }

          if (targetBucket) {
            const oldValNum = parseFloat(targetBucket.value || '0');
            const newValNum = isInc ? oldValNum + 1 : oldValNum - 1;
            targetBucket.previousValue = targetBucket.value;
            targetBucket.value = String(newValNum);
            targetBucket.isModified = true;
            targetBucket.isEmpty = false;

            recordStep(
              cur.lineNum,
              trimmed,
              `${isInc ? 'Incremented' : 'Decremented'} '${varName}' from ${targetBucket.previousValue} to ${targetBucket.value}.`,
              { modifiedVar: currentFrame ? undefined : varName, funcFrame: currentFrame }
            );
            idx++;
            continue;
          }
        }

        // 12. VARIABLE ASSIGNMENT (e.g. a = 20; a = 50; a += 5;)
        const assignMatch = trimmed.match(/^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|%=|=)\s*(.+?);$/);
        if (assignMatch && !trimmed.startsWith('cout') && !trimmed.startsWith('cin')) {
          const varName = assignMatch[1];
          const op = assignMatch[2];
          const expr = assignMatch[3].trim();

          let targetBucket: VariableBucket | undefined = undefined;
          if (currentFrame) {
            targetBucket = currentFrame.localVariables.find(v => v.name === varName) || currentFrame.parameters.find(p => p.name === varName);
          }
          if (!targetBucket && varMap.has(varName)) {
            targetBucket = varMap.get(varName);
          }

          if (targetBucket) {
            const oldVal = targetBucket.value;
            let newVal = evalExpressionWithCalls(expr, currentFrame);

            if (op === '+=') newVal = String(parseFloat(oldVal || '0') + parseFloat(newVal));
            else if (op === '-=') newVal = String(parseFloat(oldVal || '0') - parseFloat(newVal));
            else if (op === '*=') newVal = String(parseFloat(oldVal || '0') * parseFloat(newVal));
            else if (op === '/=') newVal = String(parseFloat(oldVal || '0') / (parseFloat(newVal) || 1));
            else if (op === '%=') newVal = String(parseFloat(oldVal || '0') % (parseFloat(newVal) || 1));

            targetBucket.previousValue = oldVal;
            targetBucket.value = newVal;
            targetBucket.isModified = true;
            targetBucket.isEmpty = false;

            recordStep(
              cur.lineNum,
              trimmed,
              `Updated variable '${varName}': previous value '${oldVal}' moves out, new value '${newVal}' enters.`,
              { modifiedVar: currentFrame ? undefined : varName, funcFrame: currentFrame }
            );
          }

          idx++;
          continue;
        }

        // 13. COUT / OUTPUT
        if (trimmed.startsWith('cout') || trimmed.includes('cout <<') || trimmed.includes('cout<<')) {
          const outputText = evalCout(trimmed, currentFrame);
          recordStep(cur.lineNum, trimmed, `Output: ${outputText.replace('\n', '\\n')}`, { output: outputText, funcFrame: currentFrame });
          idx++;
          continue;
        }

        // Generic statement
        recordStep(cur.lineNum, trimmed, `Executed line ${cur.lineNum}: ${trimmed}`);
        idx++;
      }

      return { hasReturned: false };
    };

    // Execute Main Program
    executeStatements(mainLines, 'main');

    if (steps.length === 0) {
      return {
        steps: [{
          stepIndex: 0,
          totalSteps: 1,
          line: 1,
          statement: 'Waiting for program execution...',
          explanation: 'File has no executable statements.',
          callStack: [],
          heap: [],
          variables: [],
          memoryDump: [],
          output: '',
          buckets: []
        }],
        detectedKind: 'variables',
        structureTitle: 'Program Execution'
      };
    }

    steps.forEach(s => (s.totalSteps = steps.length));

    const detectedKind: StructureKind = classDefs.size > 0 ? 'class' : (functionDefs.size > 0 ? 'workflow' : 'variables');
    const structureTitle = classDefs.size > 0
      ? `Class Blueprint & Objects (${Array.from(classDefs.keys())[0]})`
      : (varOrder.length > 0 ? `Variables & State (${varOrder.length} Buckets)` : 'Program Execution');

    return {
      steps,
      detectedKind,
      structureTitle
    };
  }

  // --- Helper Methods ---

  private static extractClasses(
    lines: { lineNum: number; raw: string; clean?: string; trimmed: string }[]
  ): Map<string, ClassDef> {
    const map = new Map<string, ClassDef>();
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimmed;
      const classMatch = line.match(/^class\s+([a-zA-Z_]\w*)/);
      if (classMatch) {
        const className = classMatch[1];
        const classStartLine = lines[i].lineNum;
        const { bodyLines, endLineIdx } = this.extractBlockBody(lines, i);

        let currentAccess: 'private' | 'public' = 'private'; // default in C++ class
        const privateVariables: ClassMemberVariable[] = [];
        const publicVariables: ClassMemberVariable[] = [];
        const privateFunctions: ClassDef['privateFunctions'] = [];
        const publicFunctions: ClassDef['publicFunctions'] = [];

        let bi = 0;
        while (bi < bodyLines.length) {
          const bLine = bodyLines[bi].trimmed;
          if (!bLine || bLine === '{' || bLine === '}' || bLine === '};' || bLine === ';') {
            bi++;
            continue;
          }

          if (bLine.match(/^private\s*:/)) {
            currentAccess = 'private';
            bi++;
            continue;
          }
          if (bLine.match(/^public\s*:/)) {
            currentAccess = 'public';
            bi++;
            continue;
          }

          // Check for member function
          const funcMatch = bLine.match(/^(?:(?:inline|static|virtual)\s+)?(int|void|float|double|char|string|bool)\s+([a-zA-Z_]\w*)\s*\((.*?)\)(?:\s*const)?\s*\{?$/);
          if (funcMatch) {
            const returnType = funcMatch[1];
            const funcName = funcMatch[2];
            const rawParams = funcMatch[3].trim();
            const funcStartLine = bodyLines[bi].lineNum;
            const params: { type: string; name: string }[] = [];

            if (rawParams && rawParams !== 'void') {
              rawParams.split(',').forEach(p => {
                const parts = p.trim().split(/\s+/);
                if (parts.length >= 2) {
                  params.push({ type: parts[0], name: parts[parts.length - 1].replace(/[&*\[\]]/g, '') });
                }
              });
            }

            const extracted = this.extractBlockBody(bodyLines, bi);
            const memberFunc = {
              name: funcName,
              returnType,
              access: currentAccess,
              params,
              startLine: funcStartLine,
              bodyLines: extracted.bodyLines
            };

            if (currentAccess === 'private') {
              privateFunctions.push(memberFunc);
            } else {
              publicFunctions.push(memberFunc);
            }
            bi = extracted.endLineIdx + 1;
            continue;
          }

          // Check for member variable: e.g. int age = 20; or int age; or double marks;
          const varMatch = bLine.match(/^(int|float|double|char|string|bool)\s+([a-zA-Z_]\w*)(?:\s*=\s*([^;]+))?;/);
          if (varMatch) {
            const varType = varMatch[1];
            const varName = varMatch[2];
            const defVal = varMatch[3] ? varMatch[3].trim() : (varType === 'int' ? '0' : varType === 'string' ? '""' : '0');
            const memberVar: ClassMemberVariable = {
              name: varName,
              type: varType,
              access: currentAccess,
              defaultValue: defVal
            };

            if (currentAccess === 'private') {
              privateVariables.push(memberVar);
            } else {
              publicVariables.push(memberVar);
            }
            bi++;
            continue;
          }

          bi++;
        }

        map.set(className, {
          name: className,
          startLine: classStartLine,
          privateVariables,
          publicVariables,
          privateFunctions,
          publicFunctions
        });

        i = endLineIdx + 1;
        continue;
      }
      i++;
    }
    return map;
  }

  private static extractFunctions(
    lines: { lineNum: number; raw: string; trimmed: string }[]
  ): Map<string, FunctionDef> {
    const map = new Map<string, FunctionDef>();
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimmed;

      // Skip class definitions so member functions are not confused with global functions
      if (line.match(/^class\s+[a-zA-Z_]\w*/)) {
        const { endLineIdx } = this.extractBlockBody(lines, i);
        i = endLineIdx + 1;
        continue;
      }
      const funcMatch = line.match(/^(int|void|float|double|char|string|bool)\s+([a-zA-Z_]\w*)\s*\((.*?)\)\s*\{?$/);
      if (funcMatch && funcMatch[2] !== 'main') {
        const returnType = funcMatch[1];
        const name = funcMatch[2];
        const rawParams = funcMatch[3].trim();
        const params: { type: string; name: string }[] = [];

        if (rawParams && rawParams !== 'void') {
          rawParams.split(',').forEach(p => {
            const pTrim = p.trim();
            const pMatch = pTrim.match(/^(?:const\s+)?([a-zA-Z_]\w*(?:\s*\*|\s*&)?)\s*([a-zA-Z_]\w*)(?:\[\s*\])?$/);
            if (pMatch) {
              const pType = pTrim.includes('[]') ? `${pMatch[1]}[]` : pMatch[1].trim();
              params.push({ type: pType, name: pMatch[2].trim() });
            } else {
              const parts = pTrim.split(/\s+/);
              if (parts.length >= 2) {
                params.push({ type: parts[0], name: parts[parts.length - 1].replace(/[&*\[\]]/g, '') });
              }
            }
          });
        }

        const { bodyLines, endLineIdx } = this.extractBlockBody(lines, i);
        map.set(name, {
          returnType,
          name,
          params,
          startLine: lines[i].lineNum,
          bodyLines
        });
        i = endLineIdx + 1;
        continue;
      }
      i++;
    }
    return map;
  }

  private static extractMainLines(
    lines: { lineNum: number; raw: string; trimmed: string }[]
  ): { lineNum: number; raw: string; trimmed: string }[] {
    let mainIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimmed.match(/^(?:int|void)\s+main\s*\(/)) {
        mainIdx = i;
        break;
      }
    }

    if (mainIdx !== -1) {
      const { bodyLines } = this.extractBlockBody(lines, mainIdx);
      return bodyLines;
    }

    // If no explicit main(), filter out function definitions and use top-level statements
    return lines.filter(l => {
      const t = l.trimmed;
      return t && !t.startsWith('//') && !t.startsWith('/*') && !t.startsWith('*') && !t.startsWith('#') && !t.startsWith('using');
    });
  }

  private static extractBlockBody(
    lines: { lineNum: number; raw: string; clean?: string; trimmed: string }[],
    startIdx: number
  ): { bodyLines: { lineNum: number; raw: string; clean?: string; trimmed: string }[]; endLineIdx: number } {
    const bodyLines: { lineNum: number; raw: string; clean?: string; trimmed: string }[] = [];
    let endLineIdx = startIdx;

    let i = startIdx + 1;
    let braceCount = 0;
    let foundOpenBrace = false;

    if (lines[startIdx].trimmed.includes('{')) {
      braceCount++;
      foundOpenBrace = true;
    }

    while (i < lines.length) {
      const line = lines[i];
      if (!foundOpenBrace) {
        if (line.trimmed === '{') {
          foundOpenBrace = true;
          braceCount = 1;
          i++;
          continue;
        } else if (line.trimmed && !line.trimmed.startsWith('//') && !line.trimmed.startsWith('/*') && !line.trimmed.startsWith('*')) {
          bodyLines.push(line);
          endLineIdx = i;
          return { bodyLines, endLineIdx };
        }
      } else {
        let hitClosing = false;
        // Count braces ONLY outside of string literals using clean code without comments
        const scanText = line.clean !== undefined ? line.clean : line.trimmed;
        let inStr = false;
        let strCh = '';
        let esc = false;
        for (let ci = 0; ci < scanText.length; ci++) {
          const char = scanText[ci];
          if (inStr) {
            if (esc) esc = false;
            else if (char === '\\') esc = true;
            else if (char === strCh) inStr = false;
            continue;
          }
          if (char === '"' || char === "'") {
            inStr = true;
            strCh = char;
            esc = false;
            continue;
          }
          if (char === '}') {
            braceCount--;
            if (braceCount <= 0) {
              endLineIdx = i;
              hitClosing = true;
              break;
            }
          } else if (char === '{') {
            braceCount++;
          }
        }
        if (hitClosing) {
          break;
        }
        // Only include non-comment lines
        if (line.trimmed && !line.trimmed.startsWith('//') && !line.trimmed.startsWith('/*') && !line.trimmed.startsWith('*')) {
          bodyLines.push(line);
        }
      }
      i++;
    }

    return { bodyLines, endLineIdx: Math.max(endLineIdx, i - 1) };
  }

  private static evalCondition(
    cond: string,
    varName: string,
    varVal: number,
    varMap: Map<string, VariableBucket>
  ): boolean {
    try {
      let sanitized = cond.replace(new RegExp(`\\b${varName}\\b`, 'g'), String(varVal));
      varMap.forEach((v, k) => {
        if (k !== varName && v.value) {
          sanitized = sanitized.replace(new RegExp(`\\b${k}\\b`, 'g'), v.value);
        }
      });
      // eslint-disable-next-line no-eval
      return Boolean(Function(`"use strict"; return (${sanitized});`)());
    } catch (e) {
      return false;
    }
  }

  private static evalGeneralCondition(cond: string, varMap: Map<string, VariableBucket>): boolean {
    try {
      let sanitized = cond;
      varMap.forEach((v, k) => {
        if (v.value) {
          sanitized = sanitized.replace(new RegExp(`\\b${k}\\b`, 'g'), v.value);
        }
      });
      // eslint-disable-next-line no-eval
      return Boolean(Function(`"use strict"; return (${sanitized});`)());
    } catch (e) {
      return false;
    }
  }

  private static evalUpdate(updatePart: string, currentVal: number): number {
    const trimmed = updatePart.trim();
    if (trimmed.includes('++')) return currentVal + 1;
    if (trimmed.includes('--')) return currentVal - 1;
    const addMatch = trimmed.match(/\+=\s*(\d+)/);
    if (addMatch) return currentVal + parseInt(addMatch[1], 10);
    const subMatch = trimmed.match(/-=\s*(\d+)/);
    if (subMatch) return currentVal - parseInt(subMatch[1], 10);
    const mulMatch = trimmed.match(/\*=\s*(\d+)/);
    if (mulMatch) return currentVal * parseInt(mulMatch[1], 10);
    return currentVal + 1;
  }

  private static evaluateExpression(
    expr: string,
    op: string,
    oldVal: string,
    varMap: Map<string, VariableBucket>
  ): string {
    let exp = expr.trim();
    if (exp.startsWith('"') && exp.endsWith('"')) return exp.slice(1, -1);
    if (exp.startsWith("'") && exp.endsWith("'")) return exp.slice(1, -1);

    varMap.forEach((v, k) => {
      const val = v.value || '0';
      const simpleName = k.includes(':') ? k.split(':')[1] : k;
      exp = exp.replace(new RegExp(`\\b${simpleName}\\b`, 'g'), val);
    });

    try {
      if (op === '+=') {
        // eslint-disable-next-line no-eval
        const res = Function(`"use strict"; return (${oldVal || 0}) + (${exp});`)();
        return String(res);
      }
      if (op === '-=') {
        const res = Function(`"use strict"; return (${oldVal || 0}) - (${exp});`)();
        return String(res);
      }
      if (op === '*=') {
        const res = Function(`"use strict"; return (${oldVal || 0}) * (${exp});`)();
        return String(res);
      }
      const res = Function(`"use strict"; return (${exp});`)();
      return String(res);
    } catch (e) {
      return expr;
    }
  }

  private static evalCout(stmt: string, varMap: Map<string, VariableBucket>): string {
    const cleaned = stmt.replace(/^cout\s*<<\s*/, '').replace(/;$/, '');
    const tokens = cleaned.split('<<').map(t => t.trim());
    let out = '';

    for (const tok of tokens) {
      if (tok === 'endl') {
        out += '\n';
      } else if (tok.startsWith('"') && tok.endsWith('"')) {
        out += tok.slice(1, -1);
      } else if (tok.startsWith("'") && tok.endsWith("'")) {
        out += tok.slice(1, -1);
      } else if (varMap.has(tok)) {
        out += varMap.get(tok)!.value;
      } else {
        // Try evaluation if expression
        try {
          const val = this.evaluateExpression(tok, '=', '', varMap);
          out += val;
        } catch (e) {
          out += tok;
        }
      }
    }

    return out;
  }
}
