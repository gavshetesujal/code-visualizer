import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import { DiagnosticLogger } from '../tracer/DiagnosticLogger';

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
  private lastWasCR: boolean = false;
  private inEscapeSequence: boolean = false;

  constructor() {}

  public open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.writeEmitter.fire('\x1b[1;36m=== Code Visualizer Integrated Terminal ===\x1b[0m\r\n');
    DiagnosticLogger.log('TERMINAL_STATUS', 'Visualizer integrated terminal opened');
  }

  public close(): void {
    DiagnosticLogger.log('TERMINAL_STATUS', 'Visualizer integrated terminal closed');
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
    DiagnosticLogger.log('INPUT_PROMPT', `Prompt displayed in terminal for '${varName}'`);
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
    this.lastWasCR = false;
    this.inEscapeSequence = false;
    this.writeEmitter.fire('\x1bc'); // ANSI reset/clear
    this.writeEmitter.fire('\x1b[1;36m=== Code Visualizer Integrated Terminal ===\x1b[0m\r\n');
  }

  /**
   * Handles user keystrokes and raw data chunks in the VS Code terminal panel
   */
  public handleInput(data: string): void {
    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      // Escape sequence filtering (arrow keys, function keys, etc.)
      if (char === '\x1b') {
        this.inEscapeSequence = true;
        continue;
      }
      if (this.inEscapeSequence) {
        if (/[a-zA-Z~]/.test(char)) {
          this.inEscapeSequence = false;
        }
        continue;
      }

      // 1. Enter key handling (\r, \n, or \r\n combinations)
      if (char === '\r') {
        this.lastWasCR = true;
        this.submitCurrentLine();
        continue;
      }

      if (char === '\n') {
        if (this.lastWasCR) {
          // Direct CRLF sequence: skip the trailing \n to avoid duplicate submission
          this.lastWasCR = false;
          continue;
        }
        this.submitCurrentLine();
        continue;
      }

      this.lastWasCR = false;

      // 2. Backspace handling (\x7f or \b)
      if (char === '\x7f' || char === '\b') {
        if (this.inputBuffer.length > 0) {
          this.inputBuffer = this.inputBuffer.slice(0, -1);
          this.writeEmitter.fire('\b \b');
        }
        continue;
      }

      // 3. Ctrl+C handling (\x03)
      if (char === '\x03') {
        this.writeEmitter.fire('^C\r\n');
        this.inputBuffer = '';
        this.terminateRunningProcess();
        DiagnosticLogger.log('TERMINAL_INPUT', 'Ctrl+C received; terminated child process');
        continue;
      }

      // 4. Normal printable input characters and tabs
      if (char >= ' ' || char === '\t') {
        this.inputBuffer += char;
        this.writeEmitter.fire(char);
      }
    }
  }

  private submitCurrentLine() {
    this.writeEmitter.fire('\r\n');
    const submitted = this.inputBuffer.trim();
    this.inputBuffer = '';
    const varTarget = this.awaitingVarName;
    this.awaitingVarName = undefined;

    DiagnosticLogger.log('TERMINAL_INPUT', `User pressed Enter with input: "${submitted}" (waiting var: "${varTarget || 'none'}")`);

    // Forward to running child process stdin if active
    if (this.runningProcess && this.runningProcess.stdin && !this.runningProcess.stdin.destroyed) {
      try {
        this.runningProcess.stdin.write(submitted + '\n');
      } catch (e: any) {
        DiagnosticLogger.log('WARN', `Error writing to child process stdin: ${e.message}`);
      }
    }

    // Deliver to visualizer state handler only when non-empty
    if (this.onLineSubmitted && submitted.length > 0) {
      this.onLineSubmitted(submitted);
    }
  }

  /**
   * Spawns the compiled program or script, streaming its stdout and stderr to the terminal
   */
  public spawnProgram(command: string, args: string[], cwd: string) {
    this.terminateRunningProcess();

    try {
      DiagnosticLogger.log('PROCESS_LAUNCH', `Spawning process: ${command} in ${cwd}`);
      this.runningProcess = child_process.spawn(command, args, { cwd });

      this.runningProcess.stdout?.on('data', (chunk) => {
        const text = chunk.toString().replace(/\r?\n/g, '\r\n');
        this.writeEmitter.fire(text);
        DiagnosticLogger.log('PROCESS_STDOUT', text.trim());
      });

      this.runningProcess.stderr?.on('data', (chunk) => {
        const text = chunk.toString().replace(/\r?\n/g, '\r\n');
        this.writeEmitter.fire(`\x1b[31m${text}\x1b[0m`);
        DiagnosticLogger.log('PROCESS_STDERR', text.trim());
      });

      this.runningProcess.on('close', (code) => {
        if (code !== 0 && code !== null) {
          this.writeEmitter.fire(`\r\n\x1b[33mProgram exited with code ${code}\x1b[0m\r\n`);
        }
        DiagnosticLogger.log('PROCESS_EXIT', `Process exited with code ${code}`);
        this.runningProcess = undefined;
      });

      this.runningProcess.on('error', (err) => {
        this.writeEmitter.fire(`\r\n\x1b[31mExecution error: ${err.message}\x1b[0m\r\n`);
        DiagnosticLogger.log('PROCESS_ERROR', err.message);
        this.runningProcess = undefined;
      });
    } catch (err: any) {
      this.writeEmitter.fire(`\r\n\x1b[31mFailed to launch process: ${err.message}\x1b[0m\r\n`);
      DiagnosticLogger.log('PROCESS_ERROR', err.message);
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
