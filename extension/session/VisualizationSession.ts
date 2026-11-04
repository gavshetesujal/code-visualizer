import * as vscode from 'vscode';
import * as path from 'path';
import { SessionData, WebviewToExtensionMessage } from '../types';
import { ExecutionHistory } from '../timeline/ExecutionHistory';
import { RealExecutionEngine } from '../tracer/RealExecutionEngine';
import { getWebviewHtml } from '../webview/getWebviewHtml';

export class VisualizationSession {
  private static activeSessions = new Map<string, VisualizationSession>();

  public readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private documentUri: vscode.Uri;
  private history: ExecutionHistory;
  private sessionData: SessionData;
  private lineDecoration: vscode.TextEditorDecorationType;
  private executionTerminal?: vscode.Terminal;
  private providedInputs: Record<string, string> = {};

  private constructor(
    context: vscode.ExtensionContext,
    editor: vscode.TextEditor,
    initialData: SessionData
  ) {
    this.context = context;
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
    this.sessionData = await RealExecutionEngine.executeAndTrace(editor.document);

    this.history.dispose();
    this.history = new ExecutionHistory(this.sessionData.steps, 0);

    // Send fresh session context to webview (clears old nodes & titles)
    this.panel.webview.postMessage({
      type: 'init',
      session: this.sessionData
    });

    this.syncEditorDecoration();
    this.runInIntegratedTerminal(editor.document);
  }

  /**
   * Runs the program in the existing native VS Code integrated terminal
   */
  private runInIntegratedTerminal(document: vscode.TextDocument) {
    const filePath = document.fileName;
    const fileDir = path.dirname(filePath);
    const langId = document.languageId;

    const terminalName = 'Code Visualizer';
    this.executionTerminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!this.executionTerminal) {
      this.executionTerminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: fileDir
      });
    }

    this.executionTerminal.show(true);

    if (langId === 'python') {
      this.executionTerminal.sendText(`python3 "${filePath}"`);
    } else if (langId === 'cpp') {
      const outBin = `./.vis_${path.basename(filePath, '.cpp')}`;
      this.executionTerminal.sendText(`clang++ -std=c++17 "${filePath}" -o ${outBin} && ${outBin}`);
    } else if (langId === 'c') {
      const outBin = `./.vis_${path.basename(filePath, '.c')}`;
      this.executionTerminal.sendText(`clang "${filePath}" -o ${outBin} && ${outBin}`);
    } else if (langId === 'java') {
      const className = path.basename(filePath, '.java');
      this.executionTerminal.sendText(`javac "${filePath}" && java ${className}`);
    }
  }

  private setupListeners() {
    this.setupHistoryListener();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewToExtensionMessage) => {
        switch (msg.type) {
          case 'ready':
            this.syncEditorDecoration();
            break;
          case 'stepChange':
            this.history.goTo(msg.stepIndex);
            break;
          case 'play':
            this.history.play();
            break;
          case 'pause':
            this.history.pause();
            break;
          case 'restart':
            this.history.restart();
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
            this.handleUserInput(msg.variableName, msg.value, msg.stepIndex);
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
    });
  }

  private async handleUserInput(varName: string, value: string, stepIndex: number) {
    if (this.executionTerminal) {
      this.executionTerminal.sendText(value);
    }
    this.providedInputs[varName] = value;

    const editor = vscode.window.visibleTextEditors.find(
      e => e.document.uri.toString() === this.documentUri.toString()
    );

    if (editor) {
      this.sessionData = await RealExecutionEngine.executeAndTrace(
        editor.document,
        [],
        this.providedInputs
      );
    }

    this.history.dispose();
    const nextIdx = Math.min(this.sessionData.steps.length - 1, stepIndex + 1);
    this.history = new ExecutionHistory(this.sessionData.steps, nextIdx);
    this.setupHistoryListener();

    this.panel.webview.postMessage({
      type: 'init',
      session: this.sessionData
    });
    this.syncEditorDecoration();
  }

  public dispose() {
    this.history.dispose();

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
