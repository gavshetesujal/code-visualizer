import { ExecutionStep, SessionData } from '../types';

export class MockDataGenerator {
  public static generateSession(fileName: string, filePath: string, languageId: string): SessionData {
    let steps: ExecutionStep[];

    switch (languageId) {
      case 'c':
        steps = this.generateCSteps();
        break;
      case 'python':
        steps = this.generatePythonSteps();
        break;
      case 'java':
        steps = this.generateJavaSteps();
        break;
      case 'cpp':
      default:
        steps = this.generateCppSteps();
        break;
    }

    return {
      fileName,
      filePath,
      languageId,
      steps,
      currentStepIndex: 0,
      isPrototype: true
    };
  }

  /**
   * Python: Demonstrates adaptive data structures with n8n workflow canvas nodes:
   * Linked List traversal, Array manipulation, and function calls.
   */
  private static generatePythonSteps(): ExecutionStep[] {
    return [
      {
        stepIndex: 0,
        totalSteps: 6,
        line: 1,
        statement: 'head = Node(10); head.next = Node(20) ...',
        explanation: 'Initialize linked list with 4 nodes [10, 20, 30, 40]. HEAD pointer points to Node 1 at 0x1A.',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 1, variables: [] }],
        heap: [{ id: 'list_1', type: 'Node', address: '0x1A', label: 'head', elements: [10, 20, 30, 40] }],
        variables: [
          { name: 'head', type: 'Node*', value: '0x1A', address: '0x1000', isPointer: true, pointsToAddress: '0x1A', scope: 'global' },
          { name: 'curr', type: 'Node*', value: '0x1A', address: '0x1008', isPointer: true, pointsToAddress: '0x1A', scope: 'global' }
        ],
        memoryDump: [
          { address: '0x1A', hexBytes: '0A 00 00 00 2B 00 00 00', decodedValue: 'val: 10, next: 0x2B', variableName: 'Node 1' },
          { address: '0x2B', hexBytes: '14 00 00 00 3C 00 00 00', decodedValue: 'val: 20, next: 0x3C', variableName: 'Node 2' },
          { address: '0x3C', hexBytes: '1E 00 00 00 4D 00 00 00', decodedValue: 'val: 30, next: 0x4D', variableName: 'Node 3' },
          { address: '0x4D', hexBytes: '28 00 00 00 00 00 00 00', decodedValue: 'val: 40, next: NULL', variableName: 'Node 4' }
        ],
        output: '',
        visualStructures: [
          {
            id: 'struct-list',
            title: 'Singly Linked List',
            kind: 'linked-list',
            blocks: [
              { id: 'n1', address: '0x1A', value: 10, subLabel: 'Node 1', type: 'Node', isActive: true, status: 'active', details: { value: 10, next: '0x2B', memory: '0x1A' } },
              { id: 'n2', address: '0x2B', value: 20, subLabel: 'Node 2', type: 'Node', status: 'idle', details: { value: 20, next: '0x3C', memory: '0x2B' } },
              { id: 'n3', address: '0x3C', value: 30, subLabel: 'Node 3', type: 'Node', status: 'idle', details: { value: 30, next: '0x4D', memory: '0x3C' } },
              { id: 'n4', address: '0x4D', value: 40, subLabel: 'Node 4', type: 'Node', status: 'idle', details: { value: 40, next: 'NULL', memory: '0x4D' } }
            ],
            connections: [
              { fromId: 'n1', toId: 'n2', label: 'next', animated: true },
              { fromId: 'n2', toId: 'n3', label: 'next' },
              { fromId: 'n3', toId: 'n4', label: 'next' },
              { fromId: 'n4', targetLabel: 'NULL' }
            ],
            pointers: [
              { targetBlockId: 'n1', label: 'HEAD', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'n1',
              text: 'HEAD initialized at 0x1A'
            }
          }
        ]
      },
      {
        stepIndex: 1,
        totalSteps: 6,
        line: 4,
        statement: 'curr = curr.next',
        explanation: 'Traversing the list: curr pointer advances to Node 2 (value: 20, addr: 0x2B).',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 4, variables: [] }],
        heap: [{ id: 'list_1', type: 'Node', address: '0x2B', label: 'curr', elements: [10, 20, 30, 40] }],
        variables: [
          { name: 'head', type: 'Node*', value: '0x1A', address: '0x1000', isPointer: true, pointsToAddress: '0x1A', scope: 'global' },
          { name: 'curr', type: 'Node*', value: '0x2B', address: '0x1008', isPointer: true, pointsToAddress: '0x2B', scope: 'global', isModified: true }
        ],
        memoryDump: [
          { address: '0x1A', hexBytes: '0A 00 00 00 2B 00 00 00', decodedValue: 'val: 10, next: 0x2B', variableName: 'Node 1' },
          { address: '0x2B', hexBytes: '14 00 00 00 3C 00 00 00', decodedValue: 'val: 20, next: 0x3C', variableName: 'Node 2' },
          { address: '0x3C', hexBytes: '1E 00 00 00 4D 00 00 00', decodedValue: 'val: 30, next: 0x4D', variableName: 'Node 3' },
          { address: '0x4D', hexBytes: '28 00 00 00 00 00 00 00', decodedValue: 'val: 40, next: NULL', variableName: 'Node 4' }
        ],
        output: 'Visited: 10\n',
        visualStructures: [
          {
            id: 'struct-list',
            title: 'Singly Linked List',
            kind: 'linked-list',
            blocks: [
              { id: 'n1', address: '0x1A', value: 10, subLabel: 'Node 1', type: 'Node', status: 'traversed', details: { value: 10, next: '0x2B' } },
              { id: 'n2', address: '0x2B', value: 20, subLabel: 'Node 2', type: 'Node', isActive: true, status: 'active', details: { value: 20, next: '0x3C' } },
              { id: 'n3', address: '0x3C', value: 30, subLabel: 'Node 3', type: 'Node', status: 'idle', details: { value: 30, next: '0x4D' } },
              { id: 'n4', address: '0x4D', value: 40, subLabel: 'Node 4', type: 'Node', status: 'idle', details: { value: 40, next: 'NULL' } }
            ],
            connections: [
              { fromId: 'n1', toId: 'n2', label: 'next' },
              { fromId: 'n2', toId: 'n3', label: 'next', animated: true },
              { fromId: 'n3', toId: 'n4', label: 'next' },
              { fromId: 'n4', targetLabel: 'NULL' }
            ],
            pointers: [
              { targetBlockId: 'n1', label: 'HEAD', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'n2',
              text: 'Traversing the list...'
            }
          }
        ]
      },
      {
        stepIndex: 2,
        totalSteps: 6,
        line: 5,
        statement: 'curr = curr.next',
        explanation: 'Traversing to Node 3 (value: 30) at address 0x3C.',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 5, variables: [] }],
        heap: [{ id: 'list_1', type: 'Node', address: '0x3C', label: 'curr', elements: [10, 20, 30, 40] }],
        variables: [
          { name: 'head', type: 'Node*', value: '0x1A', address: '0x1000', isPointer: true, pointsToAddress: '0x1A', scope: 'global' },
          { name: 'curr', type: 'Node*', value: '0x3C', address: '0x1008', isPointer: true, pointsToAddress: '0x3C', scope: 'global', isModified: true }
        ],
        memoryDump: [
          { address: '0x1A', hexBytes: '0A 00 00 00 2B 00 00 00', decodedValue: 'val: 10, next: 0x2B', variableName: 'Node 1' },
          { address: '0x2B', hexBytes: '14 00 00 00 3C 00 00 00', decodedValue: 'val: 20, next: 0x3C', variableName: 'Node 2' },
          { address: '0x3C', hexBytes: '1E 00 00 00 4D 00 00 00', decodedValue: 'val: 30, next: 0x4D', variableName: 'Node 3' },
          { address: '0x4D', hexBytes: '28 00 00 00 00 00 00 00', decodedValue: 'val: 40, next: NULL', variableName: 'Node 4' }
        ],
        output: 'Visited: 10\nVisited: 20\n',
        visualStructures: [
          {
            id: 'struct-list',
            title: 'Singly Linked List',
            kind: 'linked-list',
            blocks: [
              { id: 'n1', address: '0x1A', value: 10, subLabel: 'Node 1', type: 'Node', status: 'traversed' },
              { id: 'n2', address: '0x2B', value: 20, subLabel: 'Node 2', type: 'Node', status: 'traversed' },
              { id: 'n3', address: '0x3C', value: 30, subLabel: 'Node 3', type: 'Node', isActive: true, status: 'active', details: { value: 30, next: '0x4D' } },
              { id: 'n4', address: '0x4D', value: 40, subLabel: 'Node 4', type: 'Node', status: 'idle' }
            ],
            connections: [
              { fromId: 'n1', toId: 'n2', label: 'next' },
              { fromId: 'n2', toId: 'n3', label: 'next' },
              { fromId: 'n3', toId: 'n4', label: 'next', animated: true },
              { fromId: 'n4', targetLabel: 'NULL' }
            ],
            pointers: [
              { targetBlockId: 'n1', label: 'HEAD', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'n3',
              text: 'Inspecting Node 3 (30)...'
            }
          }
        ]
      },
      {
        stepIndex: 3,
        totalSteps: 6,
        line: 6,
        statement: 'curr = curr.next',
        explanation: 'Reached tail Node 4 (value: 40) at address 0x4D. Next pointer resolves to NULL.',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 6, variables: [] }],
        heap: [{ id: 'list_1', type: 'Node', address: '0x4D', label: 'curr', elements: [10, 20, 30, 40] }],
        variables: [
          { name: 'head', type: 'Node*', value: '0x1A', address: '0x1000', isPointer: true, pointsToAddress: '0x1A', scope: 'global' },
          { name: 'curr', type: 'Node*', value: '0x4D', address: '0x1008', isPointer: true, pointsToAddress: '0x4D', scope: 'global', isModified: true }
        ],
        memoryDump: [
          { address: '0x1A', hexBytes: '0A 00 00 00 2B 00 00 00', decodedValue: 'val: 10, next: 0x2B', variableName: 'Node 1' },
          { address: '0x2B', hexBytes: '14 00 00 00 3C 00 00 00', decodedValue: 'val: 20, next: 0x3C', variableName: 'Node 2' },
          { address: '0x3C', hexBytes: '1E 00 00 00 4D 00 00 00', decodedValue: 'val: 30, next: 0x4D', variableName: 'Node 3' },
          { address: '0x4D', hexBytes: '28 00 00 00 00 00 00 00', decodedValue: 'val: 40, next: NULL', variableName: 'Node 4' }
        ],
        output: 'Visited: 10\nVisited: 20\nVisited: 30\n',
        visualStructures: [
          {
            id: 'struct-list',
            title: 'Singly Linked List',
            kind: 'linked-list',
            blocks: [
              { id: 'n1', address: '0x1A', value: 10, subLabel: 'Node 1', type: 'Node', status: 'traversed' },
              { id: 'n2', address: '0x2B', value: 20, subLabel: 'Node 2', type: 'Node', status: 'traversed' },
              { id: 'n3', address: '0x3C', value: 30, subLabel: 'Node 3', type: 'Node', status: 'traversed' },
              { id: 'n4', address: '0x4D', value: 40, subLabel: 'Node 4', type: 'Node', isActive: true, status: 'active', details: { value: 40, next: 'NULL' } }
            ],
            connections: [
              { fromId: 'n1', toId: 'n2', label: 'next' },
              { fromId: 'n2', toId: 'n3', label: 'next' },
              { fromId: 'n3', toId: 'n4', label: 'next' },
              { fromId: 'n4', targetLabel: 'NULL' }
            ],
            pointers: [
              { targetBlockId: 'n1', label: 'HEAD', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'n4',
              text: 'Tail node reached!'
            }
          }
        ]
      },
      {
        stepIndex: 4,
        totalSteps: 6,
        line: 7,
        statement: 'numbers = [10, 20, 30, 40]',
        explanation: 'Dynamic Array allocated in memory with continuous indexing [0..3].',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 7, variables: [] }],
        heap: [{ id: 'arr_1', type: 'list', address: '0x104b20', label: 'numbers', elements: [10, 20, 30, 40] }],
        variables: [
          { name: 'numbers', type: 'list', value: '[10, 20, 30, 40]', address: '0x104b20', isPointer: true, pointsToAddress: '0x104b20', scope: 'global', isNew: true }
        ],
        memoryDump: [],
        output: 'Visited: 10\nVisited: 20\nVisited: 30\nVisited: 40\n',
        visualStructures: [
          {
            id: 'struct-arr',
            title: 'Contiguous Array: numbers',
            kind: 'array',
            blocks: [
              { id: 'a0', address: 'idx: 0', value: 10, subLabel: 'arr[0]', type: 'int', isActive: true, details: { index: 0, value: 10, offset: '+0x0' } },
              { id: 'a1', address: 'idx: 1', value: 20, subLabel: 'arr[1]', type: 'int', details: { index: 1, value: 20, offset: '+0x4' } },
              { id: 'a2', address: 'idx: 2', value: 30, subLabel: 'arr[2]', type: 'int', details: { index: 2, value: 30, offset: '+0x8' } },
              { id: 'a3', address: 'idx: 3', value: 40, subLabel: 'arr[3]', type: 'int', details: { index: 3, value: 40, offset: '+0xC' } }
            ],
            pointers: [
              { targetBlockId: 'a0', label: 'FRONT', color: '#38bdf8', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'a0',
              text: 'Array memory layout'
            }
          }
        ]
      },
      {
        stepIndex: 5,
        totalSteps: 6,
        line: 9,
        statement: 'print("Traversal and Workflow Complete")',
        explanation: 'Program execution and spatial workflow completed successfully.',
        callStack: [{ id: 1, name: '<module>', file: 'test.py', line: 9, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: 'Visited: 10\nVisited: 20\nVisited: 30\nVisited: 40\nTraversal and Workflow Complete\n',
        visualStructures: [
          {
            id: 'struct-list',
            title: 'Singly Linked List',
            kind: 'linked-list',
            blocks: [
              { id: 'n1', address: '0x1A', value: 10, subLabel: 'Node 1', type: 'Node' },
              { id: 'n2', address: '0x2B', value: 20, subLabel: 'Node 2', type: 'Node' },
              { id: 'n3', address: '0x3C', value: 30, subLabel: 'Node 3', type: 'Node' },
              { id: 'n4', address: '0x4D', value: 40, subLabel: 'Node 4', type: 'Node' }
            ],
            connections: [
              { fromId: 'n1', toId: 'n2', label: 'next' },
              { fromId: 'n2', toId: 'n3', label: 'next' },
              { fromId: 'n3', toId: 'n4', label: 'next' },
              { fromId: 'n4', targetLabel: 'NULL' }
            ],
            pointers: [
              { targetBlockId: 'n1', label: 'HEAD', color: '#f59e0b', direction: 'down' }
            ]
          }
        ]
      }
    ];
  }

  /**
   * C++: Tree / Pointer / Object Workflow
   */
  private static generateCppSteps(): ExecutionStep[] {
    return [
      {
        stepIndex: 0,
        totalSteps: 4,
        line: 13,
        statement: 'TreeNode *root = new TreeNode(20);',
        explanation: 'Root tree node allocated in heap at 0x16fdfe720 with value 20.',
        callStack: [{ id: 1, name: 'main()', file: 'test.cpp', line: 13, variables: [] }],
        heap: [{ id: 't_root', type: 'TreeNode', address: '0x16fdfe720', label: 'root', fields: { val: 20 } }],
        variables: [
          { name: 'root', type: 'TreeNode*', value: '0x16fdfe720', address: '0x16fdfe738', isPointer: true, pointsToAddress: '0x16fdfe720', scope: 'main', isNew: true }
        ],
        memoryDump: [
          { address: '0x16fdfe720', hexBytes: '14 00 00 00 00 00 00 00', decodedValue: 'val: 20', variableName: 'root' }
        ],
        output: '',
        visualStructures: [
          {
            id: 'tree-1',
            title: 'Binary Search Tree',
            kind: 'tree',
            blocks: [
              { id: 'root', address: '0x720', value: 20, subLabel: 'ROOT', type: 'TreeNode', isActive: true, x: 200, y: 50, details: { val: 20, left: 'null', right: 'null' } }
            ],
            pointers: [
              { targetBlockId: 'root', label: 'ROOT', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'root',
              text: 'Allocated root = 20'
            }
          }
        ]
      },
      {
        stepIndex: 1,
        totalSteps: 4,
        line: 14,
        statement: 'root->left = new TreeNode(10);',
        explanation: 'Created left child node with value 10 (addr: 0x710). Linked root->left.',
        callStack: [{ id: 1, name: 'main()', file: 'test.cpp', line: 14, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'tree-1',
            title: 'Binary Search Tree',
            kind: 'tree',
            blocks: [
              { id: 'root', address: '0x720', value: 20, subLabel: 'ROOT', type: 'TreeNode', x: 200, y: 50 },
              { id: 'left', address: '0x710', value: 10, subLabel: 'left', type: 'TreeNode', isActive: true, x: 100, y: 160, details: { val: 10, parent: '0x720' } }
            ],
            connections: [
              { fromId: 'root', toId: 'left', label: 'L', color: '#00f0ff', animated: true }
            ],
            pointers: [
              { targetBlockId: 'root', label: 'ROOT', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'left',
              text: 'Connected root->left = 10'
            }
          }
        ]
      },
      {
        stepIndex: 2,
        totalSteps: 4,
        line: 15,
        statement: 'root->right = new TreeNode(30);',
        explanation: 'Created right child node with value 30 (addr: 0x730). Linked root->right.',
        callStack: [{ id: 1, name: 'main()', file: 'test.cpp', line: 15, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'tree-1',
            title: 'Binary Search Tree',
            kind: 'tree',
            blocks: [
              { id: 'root', address: '0x720', value: 20, subLabel: 'ROOT', type: 'TreeNode', x: 200, y: 50 },
              { id: 'left', address: '0x710', value: 10, subLabel: 'left', type: 'TreeNode', x: 100, y: 160 },
              { id: 'right', address: '0x730', value: 30, subLabel: 'right', type: 'TreeNode', isActive: true, x: 300, y: 160, details: { val: 30, parent: '0x720' } }
            ],
            connections: [
              { fromId: 'root', toId: 'left', label: 'L' },
              { fromId: 'root', toId: 'right', label: 'R', color: '#00f0ff', animated: true }
            ],
            pointers: [
              { targetBlockId: 'root', label: 'ROOT', color: '#f59e0b', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'right',
              text: 'Connected root->right = 30'
            }
          }
        ]
      },
      {
        stepIndex: 3,
        totalSteps: 4,
        line: 18,
        statement: 'traverseInOrder(root);',
        explanation: 'In-order traversal visited nodes: 10 -> 20 -> 30.',
        callStack: [{ id: 1, name: 'main()', file: 'test.cpp', line: 18, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: 'In-order traversal: 10, 20, 30\n',
        visualStructures: [
          {
            id: 'tree-1',
            title: 'Binary Search Tree',
            kind: 'tree',
            blocks: [
              { id: 'root', address: '0x720', value: 20, subLabel: 'ROOT', type: 'TreeNode', isActive: true },
              { id: 'left', address: '0x710', value: 10, subLabel: 'left', type: 'TreeNode' },
              { id: 'right', address: '0x730', value: 30, subLabel: 'right', type: 'TreeNode' }
            ],
            connections: [
              { fromId: 'root', toId: 'left', label: 'L' },
              { fromId: 'root', toId: 'right', label: 'R' }
            ],
            pointers: [
              { targetBlockId: 'root', label: 'VISITED', color: '#38bdf8', direction: 'down' }
            ]
          }
        ]
      }
    ];
  }

  /**
   * Java: Stack / Queue visual representations
   */
  private static generateJavaSteps(): ExecutionStep[] {
    return [
      {
        stepIndex: 0,
        totalSteps: 3,
        line: 5,
        statement: 'Stack<Integer> stack = new Stack<>(); stack.push(10);',
        explanation: 'Pushed element 10 to stack top.',
        callStack: [{ id: 1, name: 'Main.main()', file: 'Main.java', line: 5, variables: [] }],
        heap: [],
        variables: [{ name: 'stack', type: 'Stack', value: '[10]', address: '0x900', scope: 'main' }],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'stack-1',
            title: 'LIFO Stack',
            kind: 'stack',
            blocks: [
              { id: 's1', address: 'slot[0]', value: 10, subLabel: 'top', type: 'int', isActive: true }
            ],
            pointers: [
              { targetBlockId: 's1', label: 'TOP', color: '#f59e0b', direction: 'right' }
            ],
            callout: {
              targetBlockId: 's1',
              text: 'Pushed 10 to Stack'
            }
          }
        ]
      },
      {
        stepIndex: 1,
        totalSteps: 3,
        line: 6,
        statement: 'stack.push(20);',
        explanation: 'Pushed element 20 to stack top.',
        callStack: [{ id: 1, name: 'Main.main()', file: 'Main.java', line: 6, variables: [] }],
        heap: [],
        variables: [{ name: 'stack', type: 'Stack', value: '[10, 20]', address: '0x900', scope: 'main' }],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'stack-1',
            title: 'LIFO Stack',
            kind: 'stack',
            blocks: [
              { id: 's2', address: 'slot[1]', value: 20, subLabel: 'top', type: 'int', isActive: true },
              { id: 's1', address: 'slot[0]', value: 10, subLabel: 'base', type: 'int' }
            ],
            pointers: [
              { targetBlockId: 's2', label: 'TOP', color: '#f59e0b', direction: 'right' }
            ],
            callout: {
              targetBlockId: 's2',
              text: 'Pushed 20 to Top'
            }
          }
        ]
      },
      {
        stepIndex: 2,
        totalSteps: 3,
        line: 8,
        statement: 'int val = stack.pop();',
        explanation: 'Popped 20 from stack top. Remaining element: 10.',
        callStack: [{ id: 1, name: 'Main.main()', file: 'Main.java', line: 8, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: 'Popped value: 20\n',
        visualStructures: [
          {
            id: 'stack-1',
            title: 'LIFO Stack',
            kind: 'stack',
            blocks: [
              { id: 's1', address: 'slot[0]', value: 10, subLabel: 'top', type: 'int', isActive: true }
            ],
            pointers: [
              { targetBlockId: 's1', label: 'TOP', color: '#f59e0b', direction: 'right' }
            ]
          }
        ]
      }
    ];
  }

  /**
   * C: Pointer & Memory Workflow
   */
  private static generateCSteps(): ExecutionStep[] {
    return [
      {
        stepIndex: 0,
        totalSteps: 3,
        line: 13,
        statement: 'int val = 100; int *p = &val;',
        explanation: 'Variable val allocated at 0x700. Pointer p references val.',
        callStack: [{ id: 1, name: 'main()', file: 'main.c', line: 13, variables: [] }],
        heap: [],
        variables: [
          { name: 'val', type: 'int', value: '100', address: '0x700', scope: 'main' },
          { name: 'p', type: 'int*', value: '0x700', address: '0x6f8', isPointer: true, pointsToAddress: '0x700', scope: 'main' }
        ],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'c-pointers',
            title: 'Pointer & Memory Binding',
            kind: 'pointers',
            blocks: [
              { id: 'cp1', address: '0x6f8', value: '0x700', subLabel: 'p (int*)', type: 'pointer', isActive: true },
              { id: 'cp2', address: '0x700', value: '100', subLabel: 'val (int)', type: 'int' }
            ],
            connections: [
              { fromId: 'cp1', toId: 'cp2', label: '*p', color: '#38bdf8', animated: true }
            ],
            pointers: [
              { targetBlockId: 'cp2', label: 'DEREF', color: '#38bdf8', direction: 'down' }
            ],
            callout: {
              targetBlockId: 'cp1',
              text: 'Pointer p references 0x700'
            }
          }
        ]
      },
      {
        stepIndex: 1,
        totalSteps: 3,
        line: 15,
        statement: '*p = 250;',
        explanation: 'Dereferencing pointer *p modifies value at address 0x700 to 250.',
        callStack: [{ id: 1, name: 'main()', file: 'main.c', line: 15, variables: [] }],
        heap: [],
        variables: [
          { name: 'val', type: 'int', value: '250', address: '0x700', scope: 'main', isModified: true }
        ],
        memoryDump: [],
        output: '',
        visualStructures: [
          {
            id: 'c-pointers',
            title: 'Pointer & Memory Binding',
            kind: 'pointers',
            blocks: [
              { id: 'cp1', address: '0x6f8', value: '0x700', subLabel: 'p (int*)', type: 'pointer' },
              { id: 'cp2', address: '0x700', value: '250', subLabel: 'val (int)', type: 'int', isActive: true }
            ],
            connections: [
              { fromId: 'cp1', toId: 'cp2', label: '*p', color: '#00f0ff' }
            ],
            callout: {
              targetBlockId: 'cp2',
              text: 'Memory modified: *p = 250'
            }
          }
        ]
      },
      {
        stepIndex: 2,
        totalSteps: 3,
        line: 18,
        statement: 'printf("Value: %d\\n", val);',
        explanation: 'Finished execution, output printed.',
        callStack: [{ id: 1, name: 'main()', file: 'main.c', line: 18, variables: [] }],
        heap: [],
        variables: [],
        memoryDump: [],
        output: 'Value: 250\n',
        visualStructures: [
          {
            id: 'c-pointers',
            title: 'Pointer & Memory Binding',
            kind: 'pointers',
            blocks: [
              { id: 'cp1', address: '0x6f8', value: '0x700', subLabel: 'p' },
              { id: 'cp2', address: '0x700', value: '250', subLabel: 'val' }
            ],
            connections: [
              { fromId: 'cp1', toId: 'cp2', label: '*p' }
            ]
          }
        ]
      }
    ];
  }
}
