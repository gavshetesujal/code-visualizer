import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';

/**
 * Native VS Code Integrated Terminal controller using Pseudoterminal.
 * Integrates directly with the bottom VS Code terminal panel.
 * Streams real child process stdout/stderr, captures keystrokes, echoes input,
 * passes entered text to the running process's stdin, and synchronizes with Code Visualizer.
 */
export class VisualizerTerminal implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  private closeEmitter = new vscode.EventEmitter<number>();
  readonly onDidClose: vscode.Event<number> = this.closeEmitter.event;

  private inputBuffer: string = '';
  private runningProcess?: child_process.ChildProcess;
  private onLineSubmitted?: (line: string) => void;
  private awaitingVarName?: string;

  constructor() {}

  public open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.writeEmitter.fire('\x1b[1;36m=== Code Visualizer Integrated Terminal ===\x1b[0m\r\n');
  }

  public close(): void {
    this.terminateRunningProcess();
  }

  /**
   * Register listener for submitted terminal input
   */
  public setOnLineSubmitted(callback: (line: string) => void) {
    this.onLineSubmitted = callback;
  }

  /**
   * Prompts the user in the terminal when cin >> varName is reached
   */
  public promptForInput(varName: string) {
    this.awaitingVarName = varName;
    this.writeEmitter.fire(`\r\n\x1b[1;33m[cin >> ${varName}]: \x1b[0m`);
  }

  /**
   * Print standard text or ANSI styled text to terminal
   */
  public printText(text: string) {
    const formatted = text.replace(/\r?\n/g, '\r\n');
    this.writeEmitter.fire(formatted);
  }

  public printInfo(msg: string) {
    this.writeEmitter.fire(`\r\n\x1b[36m[Visualizer] ${msg}\x1b[0m\r\n`);
  }

  public printError(msg: string) {
    this.writeEmitter.fire(`\r\n\x1b[31m[Error] ${msg}\x1b[0m\r\n`);
  }

  /**
   * Clears terminal screen and reprints header
   */
  public clear() {
    this.terminateRunningProcess();
    this.inputBuffer = '';
    this.awaitingVarName = undefined;
    this.writeEmitter.fire('\x1bc'); // ANSI reset/clear
    this.writeEmitter.fire('\x1b[1;36m=== Code Visualizer Integrated Terminal ===\x1b[0m\r\n');
  }

  /**
   * Handles user keystrokes in the VS Code terminal panel
   */
  public handleInput(data: string): void {
    // 1. Enter key (\r or \n)
    if (data === '\r' || data === '\n') {
      this.writeEmitter.fire('\r\n');
      const submitted = this.inputBuffer.trim();
      this.inputBuffer = '';
      this.awaitingVarName = undefined;

      // Forward to running child process stdin if active
      if (this.runningProcess && this.runningProcess.stdin && !this.runningProcess.stdin.destroyed) {
        try {
          this.runningProcess.stdin.write(submitted + '\n');
        } catch (e) {}
      }

      // Deliver to visualizer state handler
      if (this.onLineSubmitted && submitted.length > 0) {
        this.onLineSubmitted(submitted);
      }
      return;
    }

    // 2. Backspace (\x7f or \b)
    if (data === '\x7f' || data === '\b') {
      if (this.inputBuffer.length > 0) {
        this.inputBuffer = this.inputBuffer.slice(0, -1);
        this.writeEmitter.fire('\b \b');
      }
      return;
    }

    // 3. Ctrl+C (\x03)
    if (data === '\x03') {
      this.writeEmitter.fire('^C\r\n');
      this.inputBuffer = '';
      this.terminateRunningProcess();
      return;
    }

    // 4. Normal printable input characters
    if (data >= ' ' || data === '\t') {
      this.inputBuffer += data;
      this.writeEmitter.fire(data);
    }
  }

  /**
   * Spawns the compiled program or script, streaming its stdout and stderr to the terminal
   */
  public spawnProgram(command: string, args: string[], cwd: string) {
    this.terminateRunningProcess();

    try {
      this.runningProcess = child_process.spawn(command, args, { cwd });

      this.runningProcess.stdout?.on('data', (chunk) => {
        const text = chunk.toString().replace(/\r?\n/g, '\r\n');
        this.writeEmitter.fire(text);
      });

      this.runningProcess.stderr?.on('data', (chunk) => {
        const text = chunk.toString().replace(/\r?\n/g, '\r\n');
        this.writeEmitter.fire(`\x1b[31m${text}\x1b[0m`);
      });

      this.runningProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          this.writeEmitter.fire(`\r\n\x1b[33mProgram exited with code ${code}\x1b[0m\r\n`);
        }
        this.runningProcess = undefined;
      });

      this.runningProcess.on('error', (err) => {
        this.writeEmitter.fire(`\r\n\x1b[31mExecution error: ${err.message}\x1b[0m\r\n`);
        this.runningProcess = undefined;
      });
    } catch (err: any) {
      this.writeEmitter.fire(`\r\n\x1b[31mFailed to launch process: ${err.message}\x1b[0m\r\n`);
    }
  }

  public terminateRunningProcess() {
    if (this.runningProcess) {
      try {
        this.runningProcess.kill();
      } catch (e) {}
      this.runningProcess = undefined;
    }
  }

  public dispose() {
    this.terminateRunningProcess();
    this.writeEmitter.dispose();
    this.closeEmitter.dispose();
  }
}
