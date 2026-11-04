export interface VariableState {
  name: string;
  type: string;
  value: string;
  address: string;
  isPointer?: boolean;
  pointsToAddress?: string;
  isNew?: boolean;
  isModified?: boolean;
  scope: string;
}

export interface StackFrame {
  id: number;
  name: string;
  file: string;
  line: number;
  variables: VariableState[];
}

export interface HeapObject {
  id: string;
  type: string;
  address: string;
  label: string;
  fields?: Record<string, string | number>;
  elements?: (string | number)[];
}

export interface MemoryEntry {
  address: string;
  hexBytes: string;
  decodedValue: string;
  variableName?: string;
}

// Adaptive Visual Block definitions matching n8n workflow canvas + 2D/3D representations
export interface VisualBlock {
  id: string;
  address?: string; // e.g. "0x1A", "0x2B", "0x104b20", "idx: 0"
  value: string | number; // e.g. "10", "20", "val"
  subLabel?: string; // e.g. "Node 1", "head", "arr[0]", "root"
  type?: string; // "int", "Node*", "list", "dict", "str"
  isActive?: boolean; // glowing cyan highlight
  highlightColor?: string;
  x?: number;
  y?: number;
  z?: number;
  status?: 'active' | 'created' | 'modified' | 'traversed' | 'idle';
  details?: Record<string, string | number>;
}

export interface VisualConnection {
  fromId: string;
  toId?: string;
  label?: string;
  targetLabel?: string;
  color?: string;
  dashed?: boolean;
  animated?: boolean;
}

export interface VisualPointerMarker {
  targetBlockId: string;
  label: string; // e.g. "HEAD", "curr", "ptr", "top", "front", "rear", "pivot"
  color?: string;
  direction?: 'down' | 'up' | 'left' | 'right';
}

export interface VisualCallout {
  targetBlockId: string;
  text: string;
}

export type StructureKind = 
  | 'linked-list' 
  | 'array' 
  | 'stack' 
  | 'queue' 
  | 'tree' 
  | 'graph' 
  | 'workflow' 
  | 'pointers' 
  | 'objects' 
  | 'variables';

export interface VisualStructure {
  id: string;
  title?: string;
  kind: StructureKind;
  blocks: VisualBlock[];
  connections?: VisualConnection[];
  pointers?: VisualPointerMarker[];
  callout?: VisualCallout;
}

export interface VariableBucket {
  name: string;
  value: string;
  previousValue?: string;
  isModified?: boolean;
  isNew?: boolean;
  isEmpty?: boolean;
}

export interface LoopContainerState {
  id: string;
  loopType: 'for' | 'while' | 'do-while';
  headerText: string;
  variableName: string;
  currentValue: string;
  previousValues: string[];
  iteration: number;
  conditionText: string;
  conditionPassed: boolean;
  phase: 'init' | 'condition' | 'body' | 'update' | 'exit';
  isExiting?: boolean;
}

export interface InputRequestState {
  variableName: string;
  promptText: string;
  line: number;
  submittedValue?: string;
  isWaiting: boolean;
}

export interface ExecutionStep {
  stepIndex: number;
  totalSteps: number;
  line: number; // 1-based source line for synchronization
  statement: string;
  explanation: string;
  callStack: StackFrame[];
  heap: HeapObject[];
  variables: VariableState[];
  memoryDump: MemoryEntry[];
  output: string;
  visualStructures?: VisualStructure[];
  buckets?: VariableBucket[];
  activeLoop?: LoopContainerState;
  inputRequest?: InputRequestState;
}

export interface SessionData {
  fileName: string;
  filePath: string;
  languageId: string;
  steps: ExecutionStep[];
  currentStepIndex: number;
  isPrototype: boolean;
}

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'stepChange'; stepIndex: number }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'restart' }
  | { type: 'speedChange'; speed: number }
  | { type: 'selectNode'; nodeId: string; line?: number }
  | { type: 'submitInput'; variableName: string; value: string; stepIndex: number };

export type ExtensionToWebviewMessage =
  | { type: 'init'; session: SessionData }
  | { type: 'setStep'; stepIndex: number }
  | { type: 'appendStep'; step: ExecutionStep };
