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
    const hasFunc = /\b(int|void|float|double|char|string|bool)\s+[a-zA-Z_]\w*\s*\([^)]*\)\s*\{/.test(code);
    return hasVarDecl || hasLoop || hasCin || hasIf || hasAssign || hasFunc;
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
    let currentFunctionFrame: FunctionCallFrame | undefined = undefined;

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
      steps.push({
        stepIndex: stepIdx,
        totalSteps: 0,
        line,
        statement: stmt,
        explanation,
        callStack: [{
          id: 1,
          name: currentFunctionFrame ? `${currentFunctionFrame.functionName}()` : 'main()',
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
        functionFrame: opts.funcFrame ? JSON.parse(JSON.stringify(opts.funcFrame)) : undefined,
        arrayStructures: makeArraysSnapshot()
      });
    };

    // Statement Execution Engine
    const executeStatements = (
      stmts: { lineNum: number; raw: string; trimmed: string }[],
      scopeName: string
    ) => {
      let idx = 0;
      while (idx < stmts.length) {
        if (isWaitingForInput) {
          return;
        }
        const cur = stmts[idx];
        const trimmed = cur.trimmed;

        if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('using')) {
          idx++;
          continue;
        }

        // Return statement
        if (trimmed.startsWith('return')) {
          const retMatch = trimmed.match(/^return\s*(.*?);?$/);
          const retExpr = retMatch ? retMatch[1].trim() : '';
          let retVal = '';
          if (retExpr && retExpr !== '0') {
            retVal = this.evaluateExpression(retExpr, '=', '', varMap);
          }
          recordStep(cur.lineNum, trimmed, `Return from ${scopeName} ${retVal ? `with value ${retVal}` : ''}.`);
          idx++;
          break;
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

          let iteration = 1;
          const maxIterations = 20;

          while (iteration <= maxIterations) {
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

            iteration++;
          }

          activeLoopStack.pop();
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

          let iteration = 1;
          const maxIterations = 20;

          while (iteration <= maxIterations) {
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
            if (isWaitingForInput) {
              break;
            }

            iteration++;
          }

          activeLoopStack.pop();
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

          let iteration = 1;
          const maxIterations = 20;

          while (iteration <= maxIterations) {
            // In C++, do-while executes body first!
            loopState.phase = 'body';
            loopState.iteration = iteration;
            recordStep(cur.lineNum, `do { ... } [Iteration ${iteration}]`, `Executing do-while loop body (Iteration ${iteration}).`);
            executeStatements(bodyLines, `${scopeName}_dowhile`);
            if (isWaitingForInput) {
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

            if (!condPassed) {
              loopState.phase = 'exit';
              loopState.isExiting = true;
              recordStep(whileLine.lineNum, `Loop finished. Condition is false.`, `Exiting do-while loop.`);
              break;
            }

            iteration++;
          }

          activeLoopStack.pop();
          continue;
        }

        // 4. IF / ELSE IF / ELSE BRANCHING
        if (trimmed.startsWith('if')) {
          const ifMatch = trimmed.match(/^if\s*\(\s*(.*?)\s*\)/);
          if (ifMatch) {
            const condPart = ifMatch[1];
            const condPassed = this.evalGeneralCondition(condPart, varMap);

            const { bodyLines: ifBody, endLineIdx: ifEnd } = this.extractBlockBody(stmts, idx);

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
                  elseIfPassed = !condPassed && this.evalGeneralCondition(elseIfCond, varMap);
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
                }
              }
            );

            if (condPassed) {
              executeStatements(ifBody, `${scopeName}_if`);
            } else if (elseIfBody && elseIfPassed) {
              executeStatements(elseIfBody, `${scopeName}_elseif`);
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
                  }
                }
              );
              executeStatements(elseBody, `${scopeName}_else`);
            }

            if (isWaitingForInput) {
              return;
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

            if (cinCallIndex < orderedInputs.length) {
              submittedVal = orderedInputs[cinCallIndex];
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

              recordStep(
                cur.lineNum,
                `cin >> ${inputVar}; [received: ${submittedVal}]`,
                `Received terminal input for '${inputVar}': value ${submittedVal} entered the bucket.`,
                { modifiedVar: inputVar }
              );
            } else {
              // Pause and request input via integrated terminal
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
            return;
          }

          idx++;
          continue;
        }

        // 6. FUNCTION CALL STATEMENT (e.g. int answer = add(x, y); or answer = add(x, y); or printMessage();)
        const funcCallMatch = trimmed.match(/^(?:(?:int|float|double|char|string|bool|long|short|void|auto)\s+)?(?:([a-zA-Z_]\w*)\s*=\s*)?([a-zA-Z_]\w*)\s*\((.*?)\)\s*;$/);
        if (funcCallMatch && !trimmed.startsWith('cout') && !trimmed.startsWith('cin') && !trimmed.startsWith('for') && !trimmed.startsWith('while') && !trimmed.startsWith('if')) {
          const assignVar = funcCallMatch[1];
          const funcName = funcCallMatch[2];
          const argList = funcCallMatch[3].split(',').map(a => a.trim()).filter(Boolean);

          const targetFunc = functionDefs.get(funcName);
          if (targetFunc) {
            // Evaluate arguments
            const evalArgs = argList.map(a => this.evaluateExpression(a, '=', '', varMap));

            // Create function call frame
            const paramBuckets: VariableBucket[] = targetFunc.params.map((p, i) => ({
              name: p.name,
              value: evalArgs[i] || '0',
              type: p.type,
              scope: funcName,
              isNew: true
            }));

            const frame: FunctionCallFrame = {
              id: `call_${funcName}_${cur.lineNum}`,
              functionName: funcName,
              callSignature: `${funcName}(${evalArgs.join(', ')})`,
              parameters: paramBuckets,
              localVariables: [],
              callDepth: (currentFunctionFrame ? currentFunctionFrame.callDepth + 1 : 1)
            };

            currentFunctionFrame = frame;

            // Step: Function call transition
            recordStep(
              cur.lineNum,
              trimmed,
              `Function call: entering '${funcName}()' with arguments (${evalArgs.join(', ')}).`,
              { funcFrame: frame }
            );

            // Add parameters into variable map under function scope
            paramBuckets.forEach(p => {
              const key = `${funcName}:${p.name}`;
              varMap.set(key, p);
              if (!varOrder.includes(key)) varOrder.push(key);
            });

            // Execute function body lines
            executeStatements(targetFunc.bodyLines, funcName);
            if (isWaitingForInput) {
              return;
            }

            // Determine return value
            let retVal = '0';
            for (const bl of targetFunc.bodyLines) {
              if (bl.trimmed.startsWith('return')) {
                const rm = bl.trimmed.match(/^return\s*(.*?);?$/);
                if (rm && rm[1]) {
                  retVal = this.evaluateExpression(rm[1], '=', '', varMap);
                }
              }
            }

            frame.returnValue = retVal;
            frame.isReturning = true;

            // Step: Return transition
            recordStep(
              cur.lineNum,
              `return ${retVal};`,
              `Function '${funcName}()' finished: returned ${retVal} to caller.`,
              { funcFrame: frame }
            );

            // Clean up function scope variables
            paramBuckets.forEach(p => {
              const key = `${funcName}:${p.name}`;
              p.isOutOfScope = true;
            });

            // Store return value if assigned
            if (assignVar) {
              if (!varMap.has(assignVar)) {
                varOrder.push(assignVar);
                varMap.set(assignVar, { name: assignVar, value: '', scope: scopeName });
              }
              const b = varMap.get(assignVar)!;
              b.previousValue = b.value;
              b.value = retVal;
              b.isModified = true;
              b.isEmpty = false;

              recordStep(
                cur.lineNum,
                `${assignVar} = ${retVal};`,
                `Stored returned value ${retVal} into '${assignVar}'.`,
                { modifiedVar: assignVar }
              );
            }

            currentFunctionFrame = undefined;
            idx++;
            continue;
          }
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

        // 10. VARIABLE DECLARATION (e.g. int a = 10; float marks = 85.5; char grade = 'A'; int age;)
        const declMatch = trimmed.match(/^(?:const\s+)?(int|float|double|char|string|bool|long|short)\s+(.+?);$/);
        if (declMatch && !trimmed.includes('(')) {
          const varType = declMatch[1];
          const varDefs = declMatch[2].split(',');
          for (const def of varDefs) {
            const parts = def.trim().split('=');
            const varName = parts[0].trim();
            let initVal = parts.length > 1 ? parts[1].trim() : '';

            // Evaluate expression if initial value is provided
            if (initVal) {
              initVal = this.evaluateExpression(initVal, '=', '', varMap);
            }

            const isUninitialized = !initVal;
            if (!varMap.has(varName)) {
              varOrder.push(varName);
            }
            varMap.set(varName, {
              name: varName,
              value: initVal,
              type: varType,
              isEmpty: isUninitialized,
              isNew: true,
              scope: scopeName
            });

            recordStep(
              cur.lineNum,
              trimmed,
              isUninitialized
                ? `Created empty bucket for variable '${varName}' (uninitialized, waiting for value).`
                : `Created bucket for variable '${varName}' with value ${initVal}.`,
              { modifiedVar: varName }
            );
          }

          idx++;
          continue;
        }

        // 11. INCREMENT / DECREMENT STATEMENT (e.g. x++; x--; ++x; --x;)
        const incDecMatch = trimmed.match(/^(\+\+|--)?\s*([a-zA-Z_]\w*)\s*(\+\+|--)?;?$/);
        if (incDecMatch && (incDecMatch[1] || incDecMatch[3])) {
          const varName = incDecMatch[2];
          const isInc = (incDecMatch[1] === '++' || incDecMatch[3] === '++');
          if (varMap.has(varName)) {
            const b = varMap.get(varName)!;
            const oldValNum = parseFloat(b.value || '0');
            const newValNum = isInc ? oldValNum + 1 : oldValNum - 1;
            b.previousValue = b.value;
            b.value = String(newValNum);
            b.isModified = true;
            b.isEmpty = false;

            recordStep(
              cur.lineNum,
              trimmed,
              `${isInc ? 'Incremented' : 'Decremented'} '${varName}' from ${b.previousValue} to ${b.value}.`,
              { modifiedVar: varName }
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

          if (varMap.has(varName)) {
            const b = varMap.get(varName)!;
            const oldVal = b.value;
            const newVal = this.evaluateExpression(expr, op, oldVal, varMap);

            b.previousValue = oldVal;
            b.value = newVal;
            b.isModified = true;
            b.isEmpty = false;

            recordStep(
              cur.lineNum,
              trimmed,
              `Updated variable '${varName}': previous value '${oldVal}' moves out, new value '${newVal}' enters.`,
              { modifiedVar: varName }
            );
          }

          idx++;
          continue;
        }

        // 12. COUT / OUTPUT
        if (trimmed.startsWith('cout') || trimmed.includes('cout <<') || trimmed.includes('cout<<')) {
          const outputText = this.evalCout(trimmed, varMap);
          recordStep(cur.lineNum, trimmed, `Output: ${outputText.replace('\n', '\\n')}`, { output: outputText });
          idx++;
          continue;
        }

        // Generic statement
        recordStep(cur.lineNum, trimmed, `Executed line ${cur.lineNum}: ${trimmed}`);
        idx++;
      }
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
            const pMatch = p.trim().match(/([a-zA-Z_]\w*)\s+([a-zA-Z_]\w*)/);
            if (pMatch) {
              params.push({ type: pMatch[1], name: pMatch[2] });
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
