import { ExecutionStep, VariableBucket, LoopContainerState, InputRequestState, StructureKind } from '../types';

export interface SimulationResult {
  steps: ExecutionStep[];
  detectedKind: StructureKind;
  structureTitle: string;
}

export class ProgramSimulator {
  /**
   * Checks whether the given code has variables, loops, or cin operations
   * that should be visualized with Variable Buckets, Loop Containers, and Input Prompts.
   */
  public static canSimulate(code: string): boolean {
    const hasVarDecl = /\b(int|float|double|char|string|bool|long|short)\s+[a-zA-Z_]\w*/.test(code);
    const hasLoop = /\b(for|while|do)\b/.test(code);
    const hasCin = /\bcin\s*>>/.test(code);
    const hasAssign = /[a-zA-Z_]\w*\s*=\s*[^=]/.test(code);
    return hasVarDecl || hasLoop || hasCin || hasAssign;
  }

  public static simulate(code: string, lines: string[], fileName: string): SimulationResult {
    const steps: ExecutionStep[] = [];
    const varOrder: string[] = [];
    const varMap = new Map<string, VariableBucket>();

    // Cleaned lines with original 1-based line numbers
    const cleanLines: { lineNum: number; raw: string; trimmed: string }[] = [];
    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      cleanLines.push({ lineNum: idx + 1, raw: l, trimmed });
    });

    let currentLoopState: LoopContainerState | undefined = undefined;

    const makeBucketsSnapshot = (modifiedName?: string): VariableBucket[] => {
      return varOrder.map(name => {
        const b = varMap.get(name)!;
        return {
          name: b.name,
          value: b.value,
          previousValue: b.previousValue,
          isModified: name === modifiedName,
          isNew: b.isNew,
          isEmpty: b.isEmpty
        };
      });
    };

    // Find main function entry or start from line 1
    let lineIdx = 0;
    while (lineIdx < cleanLines.length) {
      const current = cleanLines[lineIdx];
      const trimmed = current.trimmed;

      // Skip empty, comments, preprocessor, using directives
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('using ') || trimmed.startsWith('return ') && !trimmed.includes('return 0') && !trimmed.includes('return;')) {
        lineIdx++;
        continue;
      }

      // Check if entering main function
      if (trimmed.includes('main(') || trimmed.includes('main ()')) {
        lineIdx++;
        continue;
      }

      // 1. FOR LOOP
      const forMatch = trimmed.match(/^for\s*\(\s*(.*?)\s*;\s*(.*?)\s*;\s*(.*?)\s*\)/);
      if (forMatch) {
        const initPart = forMatch[1];
        const condPart = forMatch[2];
        const updatePart = forMatch[3];

        // Parse loop body lines
        const { bodyLines, endLineIdx } = this.extractBlockBody(cleanLines, lineIdx);

        // Simulate the loop in actual C++ execution order:
        // 1. Init
        let loopVarName = '';
        let loopVarVal = 0;
        const initDeclMatch = initPart.match(/(?:int\s+)?([a-zA-Z_]\w*)\s*=\s*(-?\d+)/);
        if (initDeclMatch) {
          loopVarName = initDeclMatch[1];
          loopVarVal = parseInt(initDeclMatch[2], 10);
        }

        const loopId = `loop_${current.lineNum}`;
        const previousValues: string[] = [];

        // 1. Init Step
        currentLoopState = {
          id: loopId,
          loopType: 'for',
          headerText: current.trimmed,
          variableName: loopVarName || 'i',
          currentValue: String(loopVarVal),
          previousValues: [...previousValues],
          iteration: 1,
          conditionText: condPart,
          conditionPassed: true,
          phase: 'init'
        };

        // Also track loop variable in bucket if declared
        if (loopVarName && !varMap.has(loopVarName)) {
          varOrder.push(loopVarName);
          varMap.set(loopVarName, {
            name: loopVarName,
            value: String(loopVarVal),
            isNew: true,
            isEmpty: false
          });
        }

        steps.push({
          stepIndex: steps.length,
          totalSteps: 0,
          line: current.lineNum,
          statement: current.trimmed,
          explanation: `Loop initialization: ${initPart}. Initialized '${loopVarName}' to ${loopVarVal}.`,
          callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
          heap: [],
          variables: [],
          memoryDump: [],
          output: '',
          buckets: makeBucketsSnapshot(loopVarName),
          activeLoop: { ...currentLoopState }
        });

        // Loop iteration execution
        let iteration = 1;
        const maxIterations = 20; // safety guard

        while (iteration <= maxIterations) {
          // 2. Condition Step
          const condPassed = this.evalCondition(condPart, loopVarName, loopVarVal);
          currentLoopState.phase = 'condition';
          currentLoopState.iteration = iteration;
          currentLoopState.conditionPassed = condPassed;
          currentLoopState.currentValue = String(loopVarVal);
          currentLoopState.previousValues = [...previousValues];

          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: `${condPart} (${condPassed ? 'true' : 'false'})`,
            explanation: `Evaluating condition '${condPart}': ${loopVarVal} ${condPart.replace(loopVarName, '').trim()} is ${condPassed ? 'TRUE' : 'FALSE'}.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(),
            activeLoop: { ...currentLoopState }
          });

          if (!condPassed) {
            // Loop exits!
            currentLoopState.phase = 'exit';
            currentLoopState.isExiting = true;
            steps.push({
              stepIndex: steps.length,
              totalSteps: 0,
              line: current.lineNum,
              statement: `Loop finished. Condition '${condPart}' is false.`,
              explanation: `Exiting loop: '${condPart}' evaluated to false.`,
              callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
              heap: [],
              variables: [],
              memoryDump: [],
              output: '',
              buckets: makeBucketsSnapshot(),
              activeLoop: { ...currentLoopState }
            });
            break;
          }

          // 3. Body Execution
          for (const bLine of bodyLines) {
            if (!bLine.trimmed || bLine.trimmed === '{' || bLine.trimmed === '}') continue;

            // Handle cout inside loop
            let outputText = '';
            if (bLine.trimmed.startsWith('cout')) {
              outputText = this.evalCout(bLine.trimmed, varMap, loopVarName, loopVarVal);
            }

            // Handle variable assignment inside loop
            this.handleAssignment(bLine.trimmed, varMap, varOrder, loopVarName, loopVarVal);

            currentLoopState.phase = 'body';
            steps.push({
              stepIndex: steps.length,
              totalSteps: 0,
              line: bLine.lineNum,
              statement: bLine.trimmed,
              explanation: `Loop body execution: ${bLine.trimmed}`,
              callStack: [{ id: 1, name: 'main()', file: fileName, line: bLine.lineNum, variables: [] }],
              heap: [],
              variables: [],
              memoryDump: [],
              output: outputText,
              buckets: makeBucketsSnapshot(),
              activeLoop: { ...currentLoopState }
            });
          }

          // 4. Update / Increment Step
          previousValues.push(String(loopVarVal));
          const oldVal = loopVarVal;
          loopVarVal = this.evalUpdate(updatePart, loopVarVal);
          
          if (loopVarName && varMap.has(loopVarName)) {
            const b = varMap.get(loopVarName)!;
            b.previousValue = String(oldVal);
            b.value = String(loopVarVal);
            b.isModified = true;
          }

          currentLoopState.phase = 'update';
          currentLoopState.currentValue = String(loopVarVal);
          currentLoopState.previousValues = [...previousValues];

          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: updatePart,
            explanation: `Increment loop variable: ${updatePart}. '${loopVarName}' updated from ${oldVal} to ${loopVarVal}.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(loopVarName),
            activeLoop: { ...currentLoopState }
          });

          iteration++;
        }

        currentLoopState = undefined;
        lineIdx = endLineIdx + 1;
        continue;
      }

      // 2. WHILE LOOP
      const whileMatch = trimmed.match(/^while\s*\(\s*(.*?)\s*\)/);
      if (whileMatch && !trimmed.endsWith(';')) {
        const condPart = whileMatch[1];
        const { bodyLines, endLineIdx } = this.extractBlockBody(cleanLines, lineIdx);

        // Identify condition variable
        const condVarMatch = condPart.match(/([a-zA-Z_]\w*)/);
        const loopVarName = condVarMatch ? condVarMatch[1] : 'cond';
        const loopId = `while_${current.lineNum}`;
        const previousValues: string[] = [];

        currentLoopState = {
          id: loopId,
          loopType: 'while',
          headerText: current.trimmed,
          variableName: loopVarName,
          currentValue: varMap.has(loopVarName) ? varMap.get(loopVarName)!.value : '0',
          previousValues: [...previousValues],
          iteration: 1,
          conditionText: condPart,
          conditionPassed: true,
          phase: 'condition'
        };

        let iteration = 1;
        const maxIterations = 20;

        while (iteration <= maxIterations) {
          const curValNum = varMap.has(loopVarName) ? parseFloat(varMap.get(loopVarName)!.value) : 0;
          const condPassed = this.evalCondition(condPart, loopVarName, curValNum);
          currentLoopState.phase = 'condition';
          currentLoopState.iteration = iteration;
          currentLoopState.conditionPassed = condPassed;
          currentLoopState.currentValue = String(curValNum);
          currentLoopState.previousValues = [...previousValues];

          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: `while (${condPart}) [${condPassed ? 'true' : 'false'}]`,
            explanation: `While condition '${condPart}' evaluated to ${condPassed ? 'TRUE' : 'FALSE'}.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(),
            activeLoop: { ...currentLoopState }
          });

          if (!condPassed) {
            currentLoopState.phase = 'exit';
            currentLoopState.isExiting = true;
            steps.push({
              stepIndex: steps.length,
              totalSteps: 0,
              line: current.lineNum,
              statement: `Loop finished. Condition is false.`,
              explanation: `Exiting while loop.`,
              callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
              heap: [],
              variables: [],
              memoryDump: [],
              output: '',
              buckets: makeBucketsSnapshot(),
              activeLoop: { ...currentLoopState }
            });
            break;
          }

          // Execute body lines
          for (const bLine of bodyLines) {
            if (!bLine.trimmed || bLine.trimmed === '{' || bLine.trimmed === '}') continue;
            let outputText = '';
            if (bLine.trimmed.startsWith('cout')) {
              outputText = this.evalCout(bLine.trimmed, varMap, loopVarName, curValNum);
            }
            const modified = this.handleAssignment(bLine.trimmed, varMap, varOrder, loopVarName, curValNum);
            if (modified === loopVarName) {
              previousValues.push(String(curValNum));
            }

            steps.push({
              stepIndex: steps.length,
              totalSteps: 0,
              line: bLine.lineNum,
              statement: bLine.trimmed,
              explanation: `Executing: ${bLine.trimmed}`,
              callStack: [{ id: 1, name: 'main()', file: fileName, line: bLine.lineNum, variables: [] }],
              heap: [],
              variables: [],
              memoryDump: [],
              output: outputText,
              buckets: makeBucketsSnapshot(modified),
              activeLoop: { ...currentLoopState }
            });
          }

          iteration++;
        }

        currentLoopState = undefined;
        lineIdx = endLineIdx + 1;
        continue;
      }

      // 3. USER INPUT (`cin >> var1 >> var2`)
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
              isNew: true
            });
          }

          // Step requesting input (paused, waiting for input)
          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: `cin >> ${inputVar};`,
            explanation: `Waiting for user input for variable '${inputVar}'.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(),
            inputRequest: {
              variableName: inputVar,
              promptText: `cin >> ${inputVar};`,
              line: current.lineNum,
              isWaiting: true
            }
          });
        }

        lineIdx++;
        continue;
      }

      // 4. VARIABLE DECLARATION (e.g. int a = 10; float marks = 85.5; char grade = 'A'; double salary = 45000.75; int age;)
      const declMatch = trimmed.match(/^(?:const\s+)?(int|float|double|char|string|bool|long|short)\s+(.+?);$/);
      if (declMatch) {
        const varDefs = declMatch[2].split(',');
        for (const def of varDefs) {
          const parts = def.trim().split('=');
          const varName = parts[0].trim();
          let initVal = parts.length > 1 ? parts[1].trim() : '';

          // Format clean literal representation
          if (initVal.startsWith('"') && initVal.endsWith('"')) {
            initVal = initVal.slice(1, -1);
          } else if (initVal.startsWith("'") && initVal.endsWith("'")) {
            initVal = initVal.slice(1, -1);
          }

          const isUninitialized = !initVal;
          if (!varMap.has(varName)) {
            varOrder.push(varName);
          }
          varMap.set(varName, {
            name: varName,
            value: initVal,
            isEmpty: isUninitialized,
            isNew: true
          });

          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: current.trimmed,
            explanation: isUninitialized
              ? `Declared variable '${varName}' (uninitialized, waiting for value).`
              : `Created bucket for variable '${varName}' with value ${initVal}.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(varName)
          });
        }

        lineIdx++;
        continue;
      }

      // 5. VARIABLE ASSIGNMENT (e.g. a = 20; a = 50; a += 5;)
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

          steps.push({
            stepIndex: steps.length,
            totalSteps: 0,
            line: current.lineNum,
            statement: current.trimmed,
            explanation: `Updated '${varName}': previous value '${oldVal}' moves out, new value '${newVal}' enters.`,
            callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
            heap: [],
            variables: [],
            memoryDump: [],
            output: '',
            buckets: makeBucketsSnapshot(varName)
          });
        }

        lineIdx++;
        continue;
      }

      // 6. COUT / OUTPUT
      if (trimmed.startsWith('cout') || trimmed.includes('cout <<') || trimmed.includes('cout<<')) {
        const outputText = this.evalCout(trimmed, varMap);
        steps.push({
          stepIndex: steps.length,
          totalSteps: 0,
          line: current.lineNum,
          statement: current.trimmed,
          explanation: `Program output: ${outputText}`,
          callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
          heap: [],
          variables: [],
          memoryDump: [],
          output: outputText,
          buckets: makeBucketsSnapshot()
        });
        lineIdx++;
        continue;
      }

      // Generic statement
      if (trimmed !== '{' && trimmed !== '}' && !trimmed.startsWith('//')) {
        steps.push({
          stepIndex: steps.length,
          totalSteps: 0,
          line: current.lineNum,
          statement: current.trimmed,
          explanation: `Executed line ${current.lineNum}: ${current.trimmed}`,
          callStack: [{ id: 1, name: 'main()', file: fileName, line: current.lineNum, variables: [] }],
          heap: [],
          variables: [],
          memoryDump: [],
          output: '',
          buckets: makeBucketsSnapshot()
        });
      }

      lineIdx++;
    }

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

    const detectedKind: StructureKind = 'variables';
    const structureTitle = varOrder.length > 0 ? `Variables & State (${varOrder.length} Buckets)` : 'Program Execution';

    return {
      steps,
      detectedKind,
      structureTitle
    };
  }

  private static extractBlockBody(
    cleanLines: { lineNum: number; raw: string; trimmed: string }[],
    startIdx: number
  ): { bodyLines: { lineNum: number; raw: string; trimmed: string }[]; endLineIdx: number } {
    const bodyLines: { lineNum: number; raw: string; trimmed: string }[] = [];
    let endLineIdx = startIdx;

    // Check if next line is '{' or '{' is on the same line
    let i = startIdx + 1;
    let braceCount = 0;
    let foundOpenBrace = false;

    if (cleanLines[startIdx].trimmed.includes('{')) {
      braceCount++;
      foundOpenBrace = true;
    }

    while (i < cleanLines.length) {
      const line = cleanLines[i];
      if (!foundOpenBrace) {
        if (line.trimmed === '{') {
          foundOpenBrace = true;
          braceCount = 1;
          i++;
          continue;
        } else if (line.trimmed && !line.trimmed.startsWith('//')) {
          // Single line body without braces
          bodyLines.push(line);
          endLineIdx = i;
          return { bodyLines, endLineIdx };
        }
      } else {
        if (line.trimmed.includes('{')) braceCount++;
        if (line.trimmed.includes('}')) {
          braceCount--;
          if (braceCount <= 0) {
            endLineIdx = i;
            break;
          }
        }
        if (line.trimmed !== '{' && line.trimmed !== '}') {
          bodyLines.push(line);
        }
      }
      i++;
    }

    return { bodyLines, endLineIdx: Math.max(endLineIdx, i - 1) };
  }

  private static evalCondition(cond: string, varName: string, varVal: number): boolean {
    try {
      const sanitized = cond.replace(new RegExp(`\\b${varName}\\b`, 'g'), String(varVal));
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
    // If simple literal
    let exp = expr.trim();
    if (exp.startsWith('"') && exp.endsWith('"')) return exp.slice(1, -1);
    if (exp.startsWith("'") && exp.endsWith("'")) return exp.slice(1, -1);

    // Replace variable names with their values
    varMap.forEach((v, k) => {
      const val = v.value || '0';
      exp = exp.replace(new RegExp(`\\b${k}\\b`, 'g'), val);
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
      // Direct assignment '='
      const res = Function(`"use strict"; return (${exp});`)();
      return String(res);
    } catch (e) {
      return expr;
    }
  }

  private static handleAssignment(
    stmt: string,
    varMap: Map<string, VariableBucket>,
    varOrder: string[],
    loopVar?: string,
    loopVal?: number
  ): string | undefined {
    const match = stmt.match(/^([a-zA-Z_]\w*)\s*(\+=|-=|\*=|\/=|%=|=)\s*(.+?);$/);
    if (!match) return undefined;

    const varName = match[1];
    const op = match[2];
    let expr = match[3].trim();

    if (loopVar) {
      expr = expr.replace(new RegExp(`\\b${loopVar}\\b`, 'g'), String(loopVal));
    }

    if (!varMap.has(varName)) {
      varOrder.push(varName);
      varMap.set(varName, { name: varName, value: '' });
    }

    const b = varMap.get(varName)!;
    const oldVal = b.value;
    const newVal = this.evaluateExpression(expr, op, oldVal, varMap);

    b.previousValue = oldVal;
    b.value = newVal;
    b.isModified = true;
    b.isEmpty = false;
    return varName;
  }

  private static evalCout(
    stmt: string,
    varMap: Map<string, VariableBucket>,
    loopVar?: string,
    loopVal?: number
  ): string {
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
      } else if (loopVar && tok === loopVar) {
        out += String(loopVal);
      } else if (varMap.has(tok)) {
        out += varMap.get(tok)!.value;
      } else {
        out += tok;
      }
    }

    return out;
  }
}
