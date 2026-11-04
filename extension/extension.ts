import * as vscode from 'vscode';
import { VisualizationSession } from './session/VisualizationSession';
import { DiagnosticLogger } from './tracer/DiagnosticLogger';

const SUPPORTED_LANGUAGES = ['c', 'cpp', 'python', 'java'];

export function activate(context: vscode.ExtensionContext) {
  DiagnosticLogger.initialize(context);

  // Dedicated Visualize command (triggered from the existing Run dropdown)
  const visualizeCommand = vscode.commands.registerCommand(
    'codeVisualizer.visualize',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage(
          'Code Visualizer: Please open a source file to visualize.'
        );
        return;
      }

      const langId = editor.document.languageId;
      if (!SUPPORTED_LANGUAGES.includes(langId)) {
        vscode.window.showWarningMessage(
          `Code Visualizer: Language '${langId}' is not supported for visualization yet. Supported languages: C, C++, Python, Java.`
        );
        return;
      }

      // Initialize or reveal the split visualization session
      VisualizationSession.createOrReveal(context, editor);
    }
  );

  context.subscriptions.push(visualizeCommand);
}

export function deactivate() {}
