import * as vscode from 'vscode';

/**
 * Diagnostic Logger for Code Visualizer.
 * Provides synchronized, timestamped tracing of terminal input events,
 * execution pauses, resumption snapshots, and state synchronization.
 */
export class DiagnosticLogger {
  private static channel?: vscode.OutputChannel;

  public static initialize(context: vscode.ExtensionContext) {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel('Code Visualizer Diagnostics');
      context.subscriptions.push(this.channel);
    }
  }

  public static log(category: string, message: string, details?: any) {
    const now = new Date();
    const timeStr = `${now.toTimeString().split(' ')[0]}.${String(now.getMilliseconds()).padStart(3, '0')}`;
    let formatted = `[${timeStr}] [${category.padEnd(16)}] ${message}`;

    if (details !== undefined) {
      try {
        const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
        formatted += ` | Details: ${detailsStr}`;
      } catch (e) {
        formatted += ` | [Object]`;
      }
    }

    // Always log to debug console
    console.log(formatted);

    // Stream to VS Code Output Channel
    if (this.channel) {
      this.channel.appendLine(formatted);
    }
  }

  public static show() {
    this.channel?.show(true);
  }
}
