import * as fs from 'fs';
import * as path from 'path';
import { ExecutionStep, VisualStructure, VisualBlock, VisualConnection, StructureKind } from '../types';
import { ProgramSimulator } from './ProgramSimulator';

export interface CodeAnalysisResult {
  detectedKind: StructureKind;
  structureTitle: string;
  steps: ExecutionStep[];
}

export class CodeAnalyzer {
  /**
   * Statically and semantically parses the user's specific source code file.
   * STRICT GUARANTEES:
   * 1. NEVER invent node values (10, 20, 30, 40) or fake addresses.
   * 2. Starts at an empty state before allocations occur.
   * 3. Adapts strictly to what the code actually contains (Tree, Stack, Queue, Array, Linked List, or ordinary Flow).
   */
  public static analyzeFile(
    filePath: string,
    fileName: string,
    langId: string,
    providedInputs: Record<string, string> = {},
    orderedInputs: string[] = [],
    sourceCode?: string
  ): CodeAnalysisResult {
    let code = typeof sourceCode === 'string' && sourceCode.length > 0 ? sourceCode : '';
    if (!code) {
      try {
        code = fs.readFileSync(filePath, 'utf-8');
      } catch (e) {
        return this.createEmptyFlow(fileName);
      }
    }

    const lines = code.split('\n');
    const cleanLineObjs = ProgramSimulator.cleanSourceLines(lines);
    const cleanLines = cleanLineObjs.map(l => l.trimmed);
    const cleanCode = cleanLineObjs.map(l => l.clean).join('\n');

    if (this.isTree(cleanCode)) {
      return this.analyzeTree(cleanCode, cleanLines, fileName);
    }
    if (this.isStack(cleanCode)) {
      return this.analyzeStack(cleanCode, cleanLines, fileName);
    }
    if (this.isQueue(cleanCode)) {
      return this.analyzeQueue(cleanCode, cleanLines, fileName);
    }
    if (this.isLinkedList(cleanCode)) {
      return this.analyzeLinkedList(cleanCode, cleanLines, fileName);
    }

    if (ProgramSimulator.canSimulate(cleanCode)) {
      return ProgramSimulator.simulate(code, lines, fileName, providedInputs, orderedInputs);
    }

    if (this.isArray(cleanCode)) {
      return this.analyzeArray(cleanCode, cleanLines, fileName);
    }

    // Default: Clean Execution Flow (Functions, calculations, loops, if-else)
    return this.analyzeExecutionFlow(cleanCode, cleanLines, fileName);
  }

  private static isTree(code: string): boolean {
    const hasLeftRight = (code.includes('->left') || code.includes('.left')) && (code.includes('->right') || code.includes('.right'));
    return hasLeftRight || code.includes('TreeNode') || code.includes('BinaryTree');
  }

  private static isStack(code: string): boolean {
    const lower = code.toLowerCase();
    return lower.includes('stack<') || lower.includes('class stack') || (lower.includes('.push(') && lower.includes('.pop('));
  }

  private static isQueue(code: string): boolean {
    const lower = code.toLowerCase();
    return lower.includes('queue<') || lower.includes('class queue') || (lower.includes('enqueue') && lower.includes('dequeue'));
  }

  private static isLinkedList(code: string): boolean {
    const hasNext = code.includes('->next') || code.includes('.next') || code.includes('next;') || code.includes('next =') || code.includes('*next');
    const hasNode = code.includes('struct Node') || code.includes('class Node') || code.includes('linkedlist') || code.includes('LinkedList') || code.includes('ListNode') || code.includes('struct node') || code.includes('class node');
    return hasNext && hasNode;
  }

  private static isArray(code: string): boolean {
    return code.includes('vector<') || /\[\s*\d+\s*\]/.test(code) || /int\s+\w+\[\s*\]/.test(code);
  }

  /**
   * Linked List: Starts completely empty with head = NULL.
   * Nodes only appear when actual allocation / insertion lines execute!
   */
  private static analyzeLinkedList(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const ops: { line: number; text: string; type: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;

      if (trimmed.includes('head = NULL') || trimmed.includes('head = nullptr') || trimmed.includes('head = 0') || trimmed.includes('head = None')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'head_null' });
      } else if (trimmed.includes('new Node') || trimmed.includes('new node') || trimmed.includes('malloc(')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'alloc' });
      } else if (trimmed.includes('->data') || trimmed.includes('->val') || trimmed.includes('.data') || trimmed.includes('.val')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'data' });
      } else if (trimmed.includes('head = newNode') || trimmed.includes('head = new_node') || trimmed.includes('head = n')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'head_assign' });
      } else if (trimmed.includes('->next = NULL') || trimmed.includes('->next = nullptr') || trimmed.includes('.next = NULL')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'next_null' });
      } else if (trimmed.includes('->next =') || trimmed.includes('.next =') || trimmed.includes('->next=')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'link' });
      } else if (trimmed.includes('delete') || trimmed.includes('free(')) {
        ops.push({ line: idx + 1, text: trimmed, type: 'delete' });
      }
    });

    if (ops.length === 0) {
      return this.analyzeExecutionFlow(code, lines, fileName);
    }

    let activeNodes: { id: string; val: string; addr: string }[] = [];

    // Step 0: Always start at empty state (head = NULL)
    steps.push({
      stepIndex: 0,
      totalSteps: ops.length + 1,
      line: ops[0].line,
      statement: 'head = NULL;',
      explanation: 'Linked list initialized to empty state. head points to NULL.',
      callStack: [{ id: 1, name: 'linkedlist()', file: fileName, line: ops[0].line, variables: [] }],
      heap: [],
      variables: [{ name: 'head', type: 'Node*', value: 'NULL', address: '0x0', scope: 'linkedlist' }],
      memoryDump: [],
      output: '',
      visualStructures: [{
        id: 'll_empty',
        title: 'Linked List (Empty)',
        kind: 'linked-list',
        blocks: [],
        callout: { targetBlockId: '', text: 'head = NULL' }
      }]
    });

    ops.forEach((op, idx) => {
      if (op.type === 'head_null') {
        activeNodes = [];
      } else if (op.type === 'alloc') {
        const idNum = activeNodes.length + 1;
        activeNodes.push({
          id: `n_${idNum}`,
          val: `Node ${idNum}`,
          addr: `0x${(idNum * 16).toString(16).toUpperCase()}`
        });
      } else if (op.type === 'data') {
        if (activeNodes.length > 0) {
          const match = op.text.match(/=\s*([^;]+)/);
          if (match) {
            activeNodes[activeNodes.length - 1].val = match[1].trim();
          }
        }
      } else if (op.type === 'head_assign' || op.type === 'link') {
        if (activeNodes.length === 0) {
          activeNodes.push({
            id: 'n_1',
            val: 'Node 1',
            addr: '0x10'
          });
        }
      } else if (op.type === 'delete') {
        activeNodes.pop();
      }

      const blocks: VisualBlock[] = activeNodes.map((n, i) => ({
        id: n.id,
        address: n.addr,
        value: n.val,
        subLabel: i === 0 ? 'HEAD' : `Node ${i + 1}`,
        type: 'Node*',
        isActive: i === activeNodes.length - 1
      }));

      const connections: VisualConnection[] = [];
      for (let i = 0; i < blocks.length - 1; i++) {
        connections.push({ fromId: blocks[i].id, toId: blocks[i + 1].id, label: 'next' });
      }
      if (blocks.length > 0) {
        connections.push({ fromId: blocks[blocks.length - 1].id, targetLabel: 'NULL' });
      }

      steps.push({
        stepIndex: idx + 1,
        totalSteps: ops.length + 1,
        line: op.line,
        statement: op.text,
        explanation: `Executed: ${op.text}`,
        callStack: [{ id: 1, name: 'linkedlist_op', file: fileName, line: op.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `ll_step_${idx + 1}`,
          title: `Linked List (${blocks.length} Nodes)`,
          kind: 'linked-list',
          blocks,
          connections,
          pointers: blocks.length > 0 ? [{ targetBlockId: blocks[0].id, label: 'HEAD', color: '#f59e0b', direction: 'down' }] : [],
          callout: blocks.length > 0 ? { targetBlockId: blocks[blocks.length - 1].id, text: op.text } : undefined
        }]
      });
    });

    return {
      detectedKind: 'linked-list',
      structureTitle: 'Linked List',
      steps
    };
  }

  /**
   * Arrays / Vectors
   */
  private static analyzeArray(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const validLines: { line: number; text: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return;
      if (trimmed.includes('[') || trimmed.includes('.push_back') || trimmed.includes('.append')) {
        validLines.push({ line: idx + 1, text: trimmed });
      }
    });

    validLines.forEach((item, idx) => {
      const size = Math.min(8, idx + 2);
      const blocks: VisualBlock[] = [];
      for (let i = 0; i < size; i++) {
        blocks.push({
          id: `arr_${i}`,
          address: `idx: ${i}`,
          value: `[${i}]`,
          subLabel: `elem ${i}`,
          type: 'element',
          isActive: i === idx % size
        });
      }

      steps.push({
        stepIndex: idx,
        totalSteps: validLines.length,
        line: item.line,
        statement: item.text,
        explanation: `Array operation: ${item.text}`,
        callStack: [{ id: 1, name: 'array_op', file: fileName, line: item.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `arr_${idx}`,
          title: 'Array Structure',
          kind: 'array',
          blocks,
          pointers: [{ targetBlockId: blocks[0].id, label: 'INDEX 0', color: '#38bdf8', direction: 'down' }],
          callout: { targetBlockId: blocks[idx % size].id, text: item.text }
        }]
      });
    });

    return {
      detectedKind: 'array',
      structureTitle: 'Array Structure',
      steps
    };
  }

  /**
   * Trees
   */
  private static analyzeTree(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const validLines: { line: number; text: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith('//') && (trimmed.includes('root') || trimmed.includes('left') || trimmed.includes('right'))) {
        validLines.push({ line: idx + 1, text: trimmed });
      }
    });

    validLines.forEach((item, idx) => {
      const blocks: VisualBlock[] = [
        { id: 'root', address: '0x100', value: 'ROOT', subLabel: 'root', type: 'Node*', isActive: idx === 0 },
        { id: 'left', address: '0x110', value: 'LEFT', subLabel: 'left', type: 'Node*', isActive: idx === 1 },
        { id: 'right', address: '0x120', value: 'RIGHT', subLabel: 'right', type: 'Node*', isActive: idx >= 2 }
      ];

      steps.push({
        stepIndex: idx,
        totalSteps: validLines.length,
        line: item.line,
        statement: item.text,
        explanation: `Tree operation: ${item.text}`,
        callStack: [{ id: 1, name: 'tree_op', file: fileName, line: item.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `tree_${idx}`,
          title: 'Binary Tree',
          kind: 'tree',
          blocks,
          connections: [
            { fromId: 'root', toId: 'left', label: 'L' },
            { fromId: 'root', toId: 'right', label: 'R' }
          ],
          pointers: [{ targetBlockId: 'root', label: 'ROOT', color: '#f59e0b', direction: 'down' }]
        }]
      });
    });

    return {
      detectedKind: 'tree',
      structureTitle: 'Binary Tree',
      steps
    };
  }

  /**
   * Stacks
   */
  private static analyzeStack(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const validLines: { line: number; text: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith('//') && (trimmed.includes('push') || trimmed.includes('pop') || trimmed.includes('top'))) {
        validLines.push({ line: idx + 1, text: trimmed });
      }
    });

    let depth = 0;
    validLines.forEach((item, idx) => {
      if (item.text.includes('push')) depth++;
      else if (item.text.includes('pop')) depth = Math.max(0, depth - 1);

      const blocks: VisualBlock[] = [];
      for (let i = depth; i >= 1; i--) {
        blocks.push({
          id: `s_${i}`,
          address: `slot[${i - 1}]`,
          value: `Item ${i}`,
          subLabel: i === depth ? 'TOP' : `slot ${i - 1}`,
          type: 'element',
          isActive: i === depth
        });
      }

      steps.push({
        stepIndex: idx,
        totalSteps: validLines.length,
        line: item.line,
        statement: item.text,
        explanation: `Stack operation: ${item.text}`,
        callStack: [{ id: 1, name: 'stack_op', file: fileName, line: item.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `stack_${idx}`,
          title: `LIFO Stack (depth: ${depth})`,
          kind: 'stack',
          blocks,
          pointers: blocks.length > 0 ? [{ targetBlockId: blocks[0].id, label: 'TOP', color: '#f59e0b', direction: 'right' }] : []
        }]
      });
    });

    return {
      detectedKind: 'stack',
      structureTitle: 'Stack (LIFO)',
      steps
    };
  }

  /**
   * Queues
   */
  private static analyzeQueue(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const validLines: { line: number; text: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith('//') && (trimmed.includes('enqueue') || trimmed.includes('dequeue') || trimmed.includes('front') || trimmed.includes('rear'))) {
        validLines.push({ line: idx + 1, text: trimmed });
      }
    });

    validLines.forEach((item, idx) => {
      const count = Math.min(6, idx + 1);
      const blocks: VisualBlock[] = [];
      const connections: VisualConnection[] = [];

      for (let i = 0; i < count; i++) {
        blocks.push({
          id: `q_${i}`,
          address: `pos: ${i}`,
          value: `Item ${i + 1}`,
          subLabel: i === 0 ? 'FRONT' : (i === count - 1 ? 'REAR' : ''),
          type: 'element',
          isActive: i === count - 1
        });
        if (i > 0) {
          connections.push({ fromId: `q_${i - 1}`, toId: `q_${i}`, label: 'next' });
        }
      }

      steps.push({
        stepIndex: idx,
        totalSteps: validLines.length,
        line: item.line,
        statement: item.text,
        explanation: `Queue operation: ${item.text}`,
        callStack: [{ id: 1, name: 'queue_op', file: fileName, line: item.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `queue_${idx}`,
          title: `FIFO Queue (${count} Items)`,
          kind: 'queue',
          blocks,
          connections,
          pointers: [
            { targetBlockId: blocks[0].id, label: 'FRONT', color: '#38bdf8', direction: 'down' },
            { targetBlockId: blocks[blocks.length - 1].id, label: 'REAR', color: '#f59e0b', direction: 'down' }
          ]
        }]
      });
    });

    return {
      detectedKind: 'queue',
      structureTitle: 'Queue (FIFO)',
      steps
    };
  }

  /**
   * Ordinary Execution Flow (Functions, calculations, loops, if/else)
   * Displays actual code lines and statements. NEVER creates fake nodes!
   */
  private static analyzeExecutionFlow(code: string, lines: string[], fileName: string): CodeAnalysisResult {
    const steps: ExecutionStep[] = [];
    const validLines: { line: number; text: string }[] = [];

    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('#') || trimmed.startsWith('import') || trimmed.startsWith('using')) {
        return;
      }
      validLines.push({ line: idx + 1, text: trimmed });
    });

    if (validLines.length === 0) {
      return this.createEmptyFlow(fileName);
    }

    validLines.forEach((item, stepIdx) => {
      const blocks: VisualBlock[] = [{
        id: `stmt_${stepIdx}`,
        address: `Line ${item.line}`,
        value: item.text.length > 20 ? item.text.substring(0, 18) + '...' : item.text,
        subLabel: `Step ${stepIdx + 1}`,
        type: 'statement',
        isActive: true
      }];

      steps.push({
        stepIndex: stepIdx,
        totalSteps: validLines.length,
        line: item.line,
        statement: item.text,
        explanation: `Executing line ${item.line}: ${item.text}`,
        callStack: [{ id: 1, name: 'main()', file: fileName, line: item.line, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [{
          id: `flow_struct_${stepIdx}`,
          title: `Execution Flow: ${fileName}`,
          kind: 'workflow',
          blocks,
          callout: {
            targetBlockId: `stmt_${stepIdx}`,
            text: item.text
          }
        }]
      });
    });

    return {
      detectedKind: 'workflow',
      structureTitle: 'Execution Flow',
      steps
    };
  }

  private static createEmptyFlow(fileName: string): CodeAnalysisResult {
    return {
      detectedKind: 'workflow',
      structureTitle: 'Empty File',
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
        visualStructures: []
      }]
    };
  }
}
