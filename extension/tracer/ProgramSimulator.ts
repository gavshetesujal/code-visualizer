import {
  ExecutionStep,
  VariableBucket,
  LoopContainerState,
  InputRequestState,
  ConditionBranchEvent,
  FunctionCallFrame,
  ArrayMemoryStructure,
  ArrayMemoryCell,
  StructureKind
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

export class ProgramSimulator {
  public static canSimulate(code: string): boolean {
    const hasVarDecl = /\b(int|float|double|char|string|bool|long|short)\s+[a-zA-Z_]\w*/.test(code);
    const hasLoop = /\b(for|while|do)\b/.test(code);
    const hasCin = /\bcin\s*>>/.test(code);
    const hasIf = /\bif\s*\(/.test(code);
    const hasAssign = /[a-zA-Z_]\w*\s*=\s*[^=]/.test(code);
    const hasFunc = /\b(int|void|float|double|char|string|bool)\s+[a-zA-Z_]\w*\s*\([^)]*\)/.test(code);
    return hasVarDecl || hasLoop || hasCin || hasIf || hasAssign || hasFunc;
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

    // Cleaned lines with original 1-based line numbers
    const cleanLines: { lineNum: number; raw: string; trimmed: string }[] = [];
    lines.forEach((l, idx) => {
      cleanLines.push({ lineNum: idx + 1, raw: l, trimmed: l.trim() });
    });

    // 1. Extract non-main function definitions
    const functionDefs = this.extractFunctions(cleanLines);

    // 2. Identify main function body
    const mainLines = this.extractMainLines(cleanLines);

    // Active Loop Stack for nested loops
    const activeLoopStack: LoopContainerState[] = [];
    const activeFrameStack: FunctionCallFrame[] = [];
    let callCounter = 0;
    const MAX_RECURSION_DEPTH = 100;

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
        arrayStructures: makeArraysSnapshot()
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

    // Statement Execution Engine
    const executeStatements = (
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

        if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('using')) {
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

    return {
      steps,
      detectedKind: 'variables',
      structureTitle: varOrder.length > 0 ? `Variables & State (${varOrder.length} Buckets)` : 'Program Execution'
    };
  }

  // --- Helper Methods ---

  private static extractFunctions(
    lines: { lineNum: number; raw: string; trimmed: string }[]
  ): Map<string, FunctionDef> {
    const map = new Map<string, FunctionDef>();
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trimmed;
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
      return t && !t.startsWith('//') && !t.startsWith('#') && !t.startsWith('using');
    });
  }

  private static extractBlockBody(
    lines: { lineNum: number; raw: string; trimmed: string }[],
    startIdx: number
  ): { bodyLines: { lineNum: number; raw: string; trimmed: string }[]; endLineIdx: number } {
    const bodyLines: { lineNum: number; raw: string; trimmed: string }[] = [];
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
        } else if (line.trimmed && !line.trimmed.startsWith('//')) {
          bodyLines.push(line);
          endLineIdx = i;
          return { bodyLines, endLineIdx };
        }
      } else {
        let hitClosing = false;
        for (const char of line.trimmed) {
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
        bodyLines.push(line);
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
