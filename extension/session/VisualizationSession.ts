import * as vscode from 'vscode';
import * as path from 'path';
import { SessionData, WebviewToExtensionMessage } from '../types';
import { ExecutionHistory } from '../timeline/ExecutionHistory';
import { MockDataGenerator } from '../timeline/MockDataGenerator';
import { getWebviewHtml } from '../webview/getWebviewHtml';

export class VisualizationSession {
  private static activeSessions = new Map<string, VisualizationSession>();

  public readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly documentUri: vscode.Uri;
  private readonly history: ExecutionHistory;
  private readonly sessionData: SessionData;
  private lineDecoration: vscode.TextEditorDecorationType;

  private constructor(context: vscode.ExtensionContext, editor: vscode.TextEditor) {
    this.context = context;
    this.documentUri = editor.document.uri;

    const fileName = path.basename(editor.document.fileName);
    const langId = editor.document.languageId;

    this.sessionData = MockDataGenerator.generateSession(
      fileName,
      editor.document.fileName,
      langId
    );

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
  }

  public static createOrReveal(context: vscode.ExtensionContext, editor: vscode.TextEditor): VisualizationSession {
    const key = editor.document.uri.toString();
    const existing = this.activeSessions.get(key);

    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      existing.syncEditorDecoration();
      return existing;
    }

    const session = new VisualizationSession(context, editor);
    this.activeSessions.set(key, session);
    return session;
  }

  public static getActiveSession(documentUri: vscode.Uri): VisualizationSession | undefined {
    return this.activeSessions.get(documentUri.toString());
  }

  private setupListeners() {
    this.history.setOnStepChangedListener(step => {
      this.syncEditorDecoration();
      this.panel.webview.postMessage({
        type: 'setStep',
        stepIndex: step.stepIndex
      });
    });

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
        }
      },
      undefined,
      this.context.subscriptions
    );

    // Keep line decorations in sync if the user switches active editor tabs
    vscode.window.onDidChangeActiveTextEditor(
      editor => {
        if (editor && editor.document.uri.toString() === this.documentUri.toString()) {
          this.syncEditorDecoration();
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

  public dispose() {
    this.history.dispose();

    // Clear line decorations from all visible editors
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
