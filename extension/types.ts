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
  | 'variables'
  | 'class';

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
  type?: string;
  previousValue?: string;
  isModified?: boolean;
  isNew?: boolean;
  isEmpty?: boolean;
  scope?: string;
  isOutOfScope?: boolean;
  pointsTo?: string; // pointer target variable name (e.g. "a" if int *ptr = &a)
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
  depth?: number;
  parentLoopId?: string;
}

export interface InputRequestState {
  variableName: string;
  promptText: string;
  line: number;
  submittedValue?: string;
  isWaiting: boolean;
  expectedType?: string;
}

export interface ConditionBranchEvent {
  conditionText: string;
  evaluatedResult: boolean;
  branchTaken: 'if' | 'else-if' | 'else' | 'skipped';
  explanation: string;
}

export interface FunctionCallFrame {
  id: string;
  functionName: string;
  callSignature: string;
  parameters: VariableBucket[];
  localVariables: VariableBucket[];
  returnValue?: string;
  returnTargetVar?: string;
  isReturning?: boolean;
  callDepth: number;
  state: 'created' | 'active' | 'waiting' | 'returning' | 'completed';
  callerFrameId?: string;
  callerFunctionName?: string;
  waitingForCallSignature?: string;
  calculationDetails?: string;
}

export interface LoopIterationGroup {
  groupId: string;
  loopId: string;
  loopType: 'for' | 'while' | 'do-while';
  startIteration: number;
  endIteration: number;
  totalGroupedIterations: number;
  isExpanded: boolean;
  variableDeltas: { name: string; startVal: string; endVal: string }[];
  summaryText: string;
}

export interface ArrayMemoryCell {
  index: number;
  label: string; // e.g. "arr[0]"
  value: string;
  isModified?: boolean;
  previousValue?: string;
}

export interface ArrayMemoryStructure {
  name: string;
  type: string;
  cells: ArrayMemoryCell[];
}

export type ClassAccessSpecifier = 'private' | 'protected' | 'public';
export type InheritanceAccessMode = 'public' | 'protected' | 'private';

export interface BaseClassInheritance {
  baseClassName: string;
  accessMode: InheritanceAccessMode;
}

export interface ClassMemberVariable {
  name: string;
  type: string;
  access: ClassAccessSpecifier;
  defaultValue?: string;
  declaringClass?: string;
}

export interface ClassMemberFunction {
  name: string;
  returnType: string;
  access: ClassAccessSpecifier;
  params: { type: string; name: string }[];
  startLine: number;
  declaringClass?: string;
}

export interface InheritedMemberInfo {
  name: string;
  originalClassName: string;
  originalAccess: ClassAccessSpecifier;
  effectiveAccess: 'private' | 'protected' | 'public' | 'inaccessible';
  kind: 'variable' | 'function';
  typeOrReturnType: string;
  signature?: string;
  value?: string;
  previousValue?: string;
  isModified?: boolean;
  isActive?: boolean;
}

export interface InheritanceRelationship {
  childClassName: string;
  parentClassName: string;
  accessMode: InheritanceAccessMode;
  isActive?: boolean;
  statusLabel?: string;
}

export interface SingleClassViewState {
  className: string;
  isParent?: boolean;
  isChild?: boolean;
  baseClasses?: BaseClassInheritance[];
  hierarchyTier?: number;
  privateVariables: VariableBucket[];
  protectedVariables: VariableBucket[];
  publicVariables: VariableBucket[];
  privateFunctions: { name: string; signature: string; isActive?: boolean }[];
  protectedFunctions: { name: string; signature: string; isActive?: boolean }[];
  publicFunctions: { name: string; signature: string; isActive?: boolean }[];
  inheritedMembers?: InheritedMemberInfo[];
  highlightedCompartment?: 'private' | 'protected' | 'public' | 'none';
  highlightedMember?: string;
}

export interface ClassObjectInstance {
  objectName: string;
  className: string;
  memberValues: Record<string, string>;
  previousMemberValues?: Record<string, string>;
  isModifiedMember?: string;
}

export interface ClassPathwayArrow {
  type:
    | 'external-to-public'
    | 'public-to-private'
    | 'return-to-public'
    | 'return-to-caller'
    | 'child-to-parent'
    | 'parent-to-child'
    | 'return-to-child';
  fromLabel: string;
  toLabel: string;
  targetCompartment?: 'public' | 'protected' | 'private';
  targetMember?: string;
  targetClass?: string;
  status: 'animating' | 'active' | 'completed';
}

export interface ClassContainerState {
  className: string;
  activeObjectName?: string;
  objects: ClassObjectInstance[];
  highlightedCompartment?: 'private' | 'protected' | 'public' | 'none';
  highlightedMember?: string;
  activePathway?: ClassPathwayArrow;
  privateVariables: VariableBucket[];
  protectedVariables?: VariableBucket[];
  publicVariables: VariableBucket[];
  privateFunctions: { name: string; signature: string; isActive?: boolean }[];
  protectedFunctions?: { name: string; signature: string; isActive?: boolean }[];
  publicFunctions: { name: string; signature: string; isActive?: boolean }[];
  classes?: SingleClassViewState[];
  inheritanceRelationships?: InheritanceRelationship[];
  inheritedMembers?: InheritedMemberInfo[];
  accessViolation?: {
    attemptedMember: string;
    attemptedAccess: 'private' | 'protected';
    caller: string;
    errorMessage: string;
  };
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
  activeLoops?: LoopContainerState[];
  inputRequest?: InputRequestState;
  conditionEvent?: ConditionBranchEvent;
  functionFrame?: FunctionCallFrame;
  callStackFrames?: FunctionCallFrame[];
  arrayStructures?: ArrayMemoryStructure[];
  loopGroup?: LoopIterationGroup;
  isGroupHeader?: boolean;
  belongsToGroupId?: string;
  isGroupCollapsed?: boolean;
  iterationIndex?: number;
  classContainer?: ClassContainerState;
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
  | { type: 'submitInput'; variableName: string; value: string; stepIndex: number }
  | { type: 'toggleGroupExpand'; groupId: string };

export type ExtensionToWebviewMessage =
  | { type: 'init'; session: SessionData }
  | { type: 'setStep'; stepIndex: number }
  | { type: 'appendStep'; step: ExecutionStep }
  | { type: 'groupToggled'; groupId: string; isExpanded: boolean };
