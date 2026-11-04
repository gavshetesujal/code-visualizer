import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import { SessionData, WebviewToExtensionMessage } from '../types';
import { ExecutionHistory } from '../timeline/ExecutionHistory';
import { RealExecutionEngine } from '../tracer/RealExecutionEngine';
import { getWebviewHtml } from '../webview/getWebviewHtml';
import { VisualizerTerminal } from './VisualizerTerminal';
import { DiagnosticLogger } from '../tracer/DiagnosticLogger';

export class VisualizationSession {
  private static activeSessions = new Map<string, VisualizationSession>();

  public readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private documentUri: vscode.Uri;
  private history: ExecutionHistory;
  private sessionData: SessionData;
  private lineDecoration: vscode.TextEditorDecorationType;
  private terminalPty?: VisualizerTerminal;
  private executionTerminal?: vscode.Terminal;
  private providedInputs: Record<string, string> = {};
  private orderedInputs: string[] = [];
  private wasPlaying: boolean = false;
  private isProcessingInput: boolean = false;
  private inputQueue: string[] = [];

  private constructor(
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
    initialData: SessionData
  ) {
    this.context = context;
    DiagnosticLogger.initialize(context);
    this.documentUri = editor.document.uri;
    this.sessionData = initialData;

    const fileName = path.basename(editor.document.fileName);

    this.history = new ExecutionHistory(this.sessionData.steps, 0);

    // Glowing cyan line highlight decoration for native VS Code code editor
    this.lineDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(0, 240, 255, 0.12)',
      borderWidth: '0 0 0 4px',
      borderStyle: 'solid',
      borderColor: '#00f0ff',
      overviewRulerColor: '#00f0ff',
      overviewRulerLane: vscode.OverviewRulerLane.Full
    });

    // Create split webview beside native editor, preserving editor focus
    this.panel = vscode.window.createWebviewPanel(
      'codeVisualizer',
      `Visualize: ${fileName}`,
      {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true
      },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    this.panel.webview.html = getWebviewHtml(this.sessionData, this.panel.webview);

    this.setupListeners();
    this.syncEditorDecoration();
    this.runInIntegratedTerminal(editor.document);
  }

  public static async createOrReveal(
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor
  ): Promise<VisualizationSession> {
    const key = editor.document.uri.toString();
    const existing = this.activeSessions.get(key);

    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      existing.syncEditorDecoration();
      return existing;
    }

    // Execute and analyze the actual selected file
    const sessionData = await RealExecutionEngine.executeAndTrace(editor.document);
    const session = new VisualizationSession(context, editor, sessionData);
    this.activeSessions.set(key, session);
    return session;
  }

  public static getActiveSession(documentUri: vscode.Uri): VisualizationSession | undefined {
    return this.activeSessions.get(documentUri.toString());
  }

  /**
   * Switches to a new active editor file, completely clearing any previous stale states
   */
  public async switchToFile(editor: vscode.TextEditor) {
    this.documentUri = editor.document.uri;
    const fileName = path.basename(editor.document.fileName);

    this.panel.title = `Visualize: ${fileName}`;
    this.orderedInputs = [];
    this.providedInputs = {};
    if (this.terminalPty) {
      this.terminalPty.clear();
    }

    this.sessionData = await RealExecutionEngine.executeAndTrace(
      editor.document,
      [],
      this.providedInputs,
      this.orderedInputs
    );

    this.history.dispose();
    this.history = new ExecutionHistory(this.sessionData.steps, 0);

    // Send fresh session context to webview (clears old nodes & titles)
    this.panel.webview.postMessage({
      type: 'init',
      session: this.sessionData
    });

    this.setupHistoryListener();
    this.syncEditorDecoration();
    this.runInIntegratedTerminal(editor.document);
  }

  /**
   * Runs the program in the existing native VS Code integrated terminal using Pseudoterminal
   */
  private runInIntegratedTerminal(document: vscode.TextDocument) {
    const filePath = document.fileName;
    const fileDir = path.dirname(filePath);
    const langId = document.languageId;
    const terminalName = 'Code Visualizer';

    if (!this.terminalPty) {
      this.terminalPty = new VisualizerTerminal();
      this.terminalPty.setOnLineSubmitted((line) => {
        this.handleTerminalInput(line);
      });

      this.executionTerminal = vscode.window.createTerminal({
        name: terminalName,
        pty: this.terminalPty
      });
    }

    this.executionTerminal?.show(true);

    if (langId === 'python') {
      this.terminalPty.spawnProgram('python3', [filePath], fileDir);
    } else if (langId === 'cpp') {
      const outBin = path.join(fileDir, `.vis_${path.basename(filePath, '.cpp')}`);
      this.terminalPty.printInfo(`Compiling ${path.basename(filePath)} with clang++...`);
      child_process.exec(`clang++ -std=c++17 "${filePath}" -o "${outBin}"`, { cwd: fileDir }, (err, stdout, stderr) => {
        if (err) {
          this.terminalPty?.printError(`Compilation failed:\r\n${stderr || err.message}`);
          this.terminalPty?.printInfo('Visual simulation is running. You can enter input here when prompted.');
        } else {
          this.terminalPty?.printInfo(`Launching ${path.basename(outBin)}...`);
          this.terminalPty?.spawnProgram(outBin, [], fileDir);
        }
      });
    } else if (langId === 'c') {
      const outBin = path.join(fileDir, `.vis_${path.basename(filePath, '.c')}`);
      this.terminalPty.printInfo(`Compiling ${path.basename(filePath)} with clang...`);
      child_process.exec(`clang "${filePath}" -o "${outBin}"`, { cwd: fileDir }, (err, stdout, stderr) => {
        if (err) {
          this.terminalPty?.printError(`Compilation failed:\r\n${stderr || err.message}`);
          this.terminalPty?.printInfo('Visual simulation is running. You can enter input here when prompted.');
        } else {
          this.terminalPty?.printInfo(`Launching ${path.basename(outBin)}...`);
          this.terminalPty?.spawnProgram(outBin, [], fileDir);
        }
      });
    } else if (langId === 'java') {
      const className = path.basename(filePath, '.java');
      this.terminalPty.printInfo(`Compiling ${path.basename(filePath)} with javac...`);
      child_process.exec(`javac "${filePath}"`, { cwd: fileDir }, (err, stdout, stderr) => {
        if (err) {
          this.terminalPty?.printError(`Compilation failed:\r\n${stderr || err.message}`);
        } else {
          this.terminalPty?.spawnProgram('java', [className], fileDir);
        }
      });
    }
  }

  private setupListeners() {
    this.setupHistoryListener();

    this.panel.webview.onDidReceiveMessage(
      async (msg: WebviewToExtensionMessage) => {
        switch (msg.type) {
          case 'ready':
            this.syncEditorDecoration();
            // Check if initial step is waiting for input
            const initialStep = this.history.getCurrentStep();
            if (initialStep && initialStep.inputRequest && initialStep.inputRequest.isWaiting) {
              this.terminalPty?.promptForInput(initialStep.inputRequest.variableName);
              this.executionTerminal?.show(false);
            }
            break;
          case 'stepChange':
            this.wasPlaying = false;
            this.history.goTo(msg.stepIndex);
            DiagnosticLogger.log('NAVIGATION', `Webview stepChange to index ${msg.stepIndex}`);
            break;
          case 'play':
            this.wasPlaying = true;
            this.history.play();
            DiagnosticLogger.log('PLAYBACK', 'Visualizer playback started');
            break;
          case 'pause':
            this.wasPlaying = false;
            this.history.pause();
            DiagnosticLogger.log('PLAYBACK', 'Visualizer playback paused');
            break;
          case 'restart':
            await this.restartSession();
            break;
          case 'speedChange':
            this.history.setSpeed(msg.speed);
            break;
          case 'selectNode':
            if (msg.line) {
              this.highlightSpecificLine(msg.line);
            }
            break;
          case 'submitInput':
            // Deprecated fallback from webview
            this.handleTerminalInput(msg.value);
            break;
          case 'toggleGroupExpand':
            const isExp = this.history.toggleGroup(msg.groupId);
            DiagnosticLogger.log('LOOP_GROUPING', `Toggled group "${msg.groupId}": isExpanded=${isExp}`);
            this.panel.webview.postMessage({
              type: 'groupToggled',
              groupId: msg.groupId,
              isExpanded: isExp
            });
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Automatically switch and reload whenever user switches editor file tabs
    vscode.window.onDidChangeActiveTextEditor(
      async editor => {
        if (editor && editor.document.uri.scheme === 'file') {
          const supported = ['c', 'cpp', 'python', 'java'];
          if (supported.includes(editor.document.languageId)) {
            if (editor.document.uri.toString() !== this.documentUri.toString()) {
              await this.switchToFile(editor);
            } else {
              this.syncEditorDecoration();
            }
          }
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.dispose();
      },
      undefined,
      this.context.subscriptions
    );
  }

  private async restartSession() {
    this.orderedInputs = [];
    this.providedInputs = {};
    if (this.terminalPty) {
      this.terminalPty.clear();
    }

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === this.documentUri.toString()
    );

    if (editor) {
      this.sessionData = await RealExecutionEngine.executeAndTrace(
        editor.document,
        [],
        this.providedInputs,
        this.orderedInputs
      );
      this.history.dispose();
      this.history = new ExecutionHistory(this.sessionData.steps, 0);
      this.setupHistoryListener();

      this.panel.webview.postMessage({
        type: 'init',
        session: this.sessionData
      });
      this.syncEditorDecoration();
      this.runInIntegratedTerminal(editor.document);
    } else {
      this.history.restart();
    }
  }

  private highlightSpecificLine(lineNumber: number) {
    const editors = vscode.window.visibleTextEditors.filter(
      e => e.document.uri.toString() === this.documentUri.toString()
    );
    for (const editor of editors) {
      const line = Math.max(0, lineNumber - 1);
      const range = new vscode.Range(line, 0, line, 0);
      editor.setDecorations(this.lineDecoration, [range]);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  private syncEditorDecoration() {
    const step = this.history.getCurrentStep();
    if (!step) return;

    this.highlightSpecificLine(step.line);
  }

  private setupHistoryListener() {
    this.history.setOnStepChangedListener(step => {
      this.syncEditorDecoration();
      this.panel.webview.postMessage({
        type: 'setStep',
        stepIndex: step.stepIndex
      });

      // When reaching cin >> varName, pause visualizer and request input in VS Code terminal
      if (step.inputRequest && step.inputRequest.isWaiting) {
        DiagnosticLogger.log('INPUT_REQUEST', `Pausing for terminal input at line ${step.line}: "${step.statement}"`, {
          variable: step.inputRequest.variableName
        });
        this.history.pause();
        if (this.terminalPty) {
          this.terminalPty.promptForInput(step.inputRequest.variableName);
        }
        if (this.executionTerminal) {
          this.executionTerminal.show(false);
        }
      }
    });
  }

  /**
   * Handles user input entered through the native VS Code integrated terminal.
   * Queues requests sequentially to eliminate race conditions from rapid typing or multi-line pastes.
   */
  private async handleTerminalInput(input: string) {
    this.inputQueue.push(input);
    if (this.isProcessingInput) {
      DiagnosticLogger.log('INPUT_QUEUE', `Input queued while busy: "${input}"`);
      return;
    }

    this.isProcessingInput = true;
    try {
      while (this.inputQueue.length > 0) {
        const nextInput = this.inputQueue.shift()!;
        await this.processSingleTerminalInput(nextInput);
      }
    } finally {
      this.isProcessingInput = false;
    }
  }

  private async processSingleTerminalInput(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;

    DiagnosticLogger.log('INPUT_RECEIVED', `Processing terminal input: "${trimmed}"`);

    // Support single token or multiple space-separated tokens (e.g. cin >> a >> b)
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      this.orderedInputs.push(t);
    }

    DiagnosticLogger.log('INPUT_QUEUE', `Current ordered inputs (${this.orderedInputs.length}): [${this.orderedInputs.join(', ')}]`);

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === this.documentUri.toString()
    );

    if (!editor) {
      DiagnosticLogger.log('WARN', 'Active editor not found during input processing');
      return;
    }

    // Step index that was waiting for input prior to re-tracing
    const previousWaitingIndex = this.history.getCurrentIndex();

    // Re-execute and trace with new inputs
    this.sessionData = await RealExecutionEngine.executeAndTrace(
      editor.document,
      [],
      this.providedInputs,
      this.orderedInputs
    );

    DiagnosticLogger.log(
      'EXECUTION_RESUME',
      `Re-traced execution with ${this.orderedInputs.length} inputs. Generated ${this.sessionData.steps.length} steps.`
    );

    // Target step is the step that received the input (previousWaitingIndex)
    let targetStepIndex = previousWaitingIndex;
    if (targetStepIndex >= this.sessionData.steps.length) {
      targetStepIndex = this.sessionData.steps.length - 1;
    }

    // Explicitly update sessionData.currentStepIndex so webview initializes at targetStepIndex, NOT step 0!
    this.sessionData.currentStepIndex = targetStepIndex;

    this.history.dispose();
    this.history = new ExecutionHistory(this.sessionData.steps, targetStepIndex);
    this.setupHistoryListener();

    // Post fresh session to webview
    this.panel.webview.postMessage({
      type: 'init',
      session: this.sessionData
    });
    this.syncEditorDecoration();

    DiagnosticLogger.log(
      'SNAPSHOT_SYNC',
      `Synchronized webview at step ${targetStepIndex} / ${this.sessionData.steps.length - 1}: "${this.sessionData.steps[targetStepIndex]?.statement}"`
    );

    // If the target step or subsequent step requires the NEXT input:
    const targetStep = this.sessionData.steps[targetStepIndex];
    if (targetStep && targetStep.inputRequest && targetStep.inputRequest.isWaiting) {
      this.history.pause();
      this.terminalPty?.promptForInput(targetStep.inputRequest.variableName);
      this.executionTerminal?.show(false);
    } else if (this.wasPlaying) {
      // Resume auto playback if user was in Play mode before input pause
      setTimeout(() => {
        if (this.wasPlaying && this.history.canGoForward()) {
          this.history.next();
          this.history.play();
        }
      }, 500);
    }
  }

  public dispose() {
    this.history.dispose();

    if (this.terminalPty) {
      this.terminalPty.dispose();
      this.terminalPty = undefined;
    }

    if (this.executionTerminal) {
      this.executionTerminal.dispose();
      this.executionTerminal = undefined;
    }

    const editors = vscode.window.visibleTextEditors.filter(
      e => e.document.uri.toString() === this.documentUri.toString()
    );
    for (const editor of editors) {
      editor.setDecorations(this.lineDecoration, []);
    }
    this.lineDecoration.dispose();

    VisualizationSession.activeSessions.delete(this.documentUri.toString());
  }
}
