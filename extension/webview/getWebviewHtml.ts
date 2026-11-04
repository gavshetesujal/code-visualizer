import * as vscode from 'vscode';
import { SessionData } from '../types';

export function getWebviewHtml(session: SessionData, webview: vscode.Webview): string {
  const sessionJson = JSON.stringify(session);
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Visualizer Canvas</title>
  <style>
    :root {
      --bg: #080c14;
      --canvas-bg: #060910;
      --card-bg: #0d1527;
      --border-dark: #1e293b;
      --cyan-glow: #00f0ff;
      --cyan-border: #00d2ff;
      --blue-accent: #2563eb;
      --blue-btn: #0284c7;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --orange-accent: #f59e0b;
      --green-accent: #10b981;
      --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      user-select: none;
    }

    /* TOP WORKFLOW HEADER */
    .workflow-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 18px;
      background-color: #0b1120;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
      gap: 12px;
      z-index: 10;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 700;
    }

    .brand-icon {
      color: #38bdf8;
      display: flex;
      align-items: center;
    }

    .structure-type-pill {
      background: rgba(56, 189, 248, 0.1);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.25);
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      font-weight: 600;
    }

    /* Playback Controls */
    .playback-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .play-btn {
      background: #0284c7;
      color: #ffffff;
      border: none;
      border-radius: 20px;
      padding: 5px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 0 0 16px rgba(2, 132, 199, 0.4);
      transition: all 0.2s ease;
    }

    .play-btn:hover:not(:disabled) {
      background: #0369a1;
      transform: translateY(-1px);
    }

    .play-btn.is-active {
      background: #e11d48;
      box-shadow: 0 0 16px rgba(225, 29, 72, 0.4);
    }

    .pill-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      border-radius: 20px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
    }

    .pill-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .speed-select {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      border-radius: 20px;
      padding: 3px 6px;
      font-size: 11px;
      cursor: pointer;
      outline: none;
    }

    .speed-select option {
      background: #0f172a;
      color: #fff;
    }

    /* Top Tools */
    .top-tools {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-switch-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-muted);
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .mode-switch-btn.active {
      color: #00f0ff;
      border-color: #00f0ff;
      background: rgba(0, 240, 255, 0.08);
    }

    .tool-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      padding: 4px 6px;
      border-radius: 4px;
      transition: all 0.15s ease;
    }

    .tool-btn:hover, .tool-btn.active {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
    }

    /* MAIN SPLIT: CANVAS ON TOP, TERMINAL ON BOTTOM */
    .workspace-split {
      flex: 1;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
    }

    /* THE CANVAS */
    .canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: grab;
      background-color: var(--canvas-bg);
      background-image: 
        radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
      background-size: 24px 24px;
      min-height: 180px;
    }

    .canvas-container:active {
      cursor: grabbing;
    }

    .canvas-viewport {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      transform-origin: 50% 50%;
      transition: transform 0.05s linear;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .canvas-container.perspective-3d .canvas-viewport {
      transform-style: preserve-3d;
      perspective: 1200px;
    }

    .visual-world {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 800px;
      min-height: 400px;
      transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .canvas-container.perspective-3d .visual-world {
      transform: rotateX(20deg) rotateY(-12deg);
    }

    .flow-row {
      display: flex;
      align-items: center;
      gap: 36px;
      position: relative;
      padding: 50px 30px;
      z-index: 2;
    }

    .node-wrapper {
      display: flex;
      align-items: center;
      position: relative;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* WORKFLOW BLOCK NODE */
    .workflow-block {
      width: 128px;
      height: 104px;
      background: #0d1627;
      border: 1.5px solid #1e293b;
      border-radius: 14px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 10px 12px;
      position: relative;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .workflow-block:hover {
      border-color: rgba(0, 240, 255, 0.5);
      transform: translateY(-2px);
    }

    .workflow-block.is-active {
      border: 2px solid var(--cyan-border);
      box-shadow: 0 0 30px rgba(0, 240, 255, 0.4), inset 0 0 16px rgba(0, 240, 255, 0.15);
      transform: translateY(-6px) scale(1.03);
    }

    .canvas-container.perspective-3d .workflow-block.is-active {
      transform: translateZ(40px) scale(1.05);
      box-shadow: 0 20px 40px rgba(0, 240, 255, 0.5);
    }

    .block-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .block-addr {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #94a3b8;
    }

    .block-tag {
      font-size: 9px;
      background: rgba(255, 255, 255, 0.06);
      color: #cbd5e1;
      padding: 1px 4px;
      border-radius: 3px;
    }

    .block-value {
      font-family: var(--font-family);
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      text-align: center;
      line-height: 1;
    }

    .block-sublabel {
      font-size: 11px;
      color: #64748b;
      text-align: center;
      font-weight: 500;
    }

    /* POINTER OVERLAY */
    .pointer-overlay {
      position: absolute;
      top: -65px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      pointer-events: none;
      z-index: 5;
    }

    .pointer-label {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .pointer-arrow {
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 10px solid #f59e0b;
    }

    /* CALLOUT SPEECH BUBBLE */
    .callout-bubble {
      position: absolute;
      top: -55px;
      left: 50%;
      transform: translateX(-15%);
      background: #00d2ff;
      color: #04101e;
      font-weight: 700;
      font-size: 12px;
      padding: 5px 12px;
      border-radius: 12px;
      white-space: nowrap;
      box-shadow: 0 4px 20px rgba(0, 210, 255, 0.5);
      z-index: 6;
    }

    .callout-bubble::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 20px;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 6px solid #00d2ff;
    }

    /* ARROW CONNECTION */
    .arrow-connection {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      position: relative;
    }

    .arrow-line {
      height: 2px;
      flex: 1;
      background: linear-gradient(90deg, #0284c7, #38bdf8);
      position: relative;
    }

    .arrow-head {
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 8px solid #38bdf8;
      margin-left: -2px;
    }

    .null-connection {
      display: flex;
      align-items: center;
      gap: 6px;
      padding-left: 6px;
    }

    .null-arrow {
      height: 2px;
      width: 35px;
      background: var(--orange-accent);
      position: relative;
    }

    .null-arrow::after {
      content: '';
      position: absolute;
      right: 0;
      top: -4px;
      width: 0;
      height: 0;
      border-top: 5px solid transparent;
      border-bottom: 5px solid transparent;
      border-left: 8px solid var(--orange-accent);
    }

    .null-badge {
      color: var(--orange-accent);
      font-weight: 800;
      font-family: var(--font-mono);
      font-size: 13px;
    }

    /* LIVE EXECUTION CODE INDICATOR */
    .live-code-indicator {
      position: absolute;
      left: 16px;
      top: 16px;
      background: rgba(11, 17, 32, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.3);
      backdrop-filter: blur(10px);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10;
    }

    .live-pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #00f0ff;
      box-shadow: 0 0 8px #00f0ff;
    }

    /* FLOATING CANVAS HUD */
    .canvas-hud {
      position: absolute;
      right: 18px;
      bottom: 18px;
      display: flex;
      flex-direction: column;
      gap: 5px;
      background: rgba(13, 21, 39, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(8px);
      padding: 5px;
      border-radius: 8px;
      z-index: 10;
    }

    .hud-btn {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
    }

    .hud-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    /* RESIZABLE SPLIT BAR */
    .terminal-resizer {
      height: 4px;
      background: rgba(255, 255, 255, 0.05);
      cursor: row-resize;
      transition: background 0.15s ease;
      z-index: 15;
    }

    .terminal-resizer:hover, .terminal-resizer.dragging {
      background: #38bdf8;
    }

    /* INTEGRATED TERMINAL PANEL (VS Code styled) */
    .integrated-terminal {
      height: 220px;
      min-height: 90px;
      max-height: 70vh;
      background: #090d16;
      border-top: 1px solid #1e293b;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      z-index: 15;
      font-family: var(--font-mono);
      transition: height 0.05s ease-out;
    }

    .terminal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 14px;
      background: #0d1527;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
    }

    .terminal-tabs {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .terminal-tab {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #38bdf8;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }

    .terminal-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .term-btn {
      background: transparent;
      border: none;
      color: #64748b;
      cursor: pointer;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .term-btn:hover {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.08);
    }

    /* Terminal Output Log Area */
    .terminal-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px 14px;
      font-size: 12px;
      color: #e2e8f0;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Interactive Terminal Input Line (cin / input prompt) */
    .terminal-input-row {
      display: flex;
      align-items: center;
      padding: 6px 14px;
      background: rgba(0, 0, 0, 0.3);
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      gap: 8px;
    }

    .terminal-prompt-prefix {
      color: #00f0ff;
      font-weight: 700;
      font-size: 13px;
    }

    .terminal-input-field {
      flex: 1;
      background: transparent;
      border: none;
      color: #ffffff;
      font-family: var(--font-mono);
      font-size: 12px;
      outline: none;
    }

    .terminal-input-field::placeholder {
      color: #475569;
    }

    .terminal-enter-badge {
      font-size: 10px;
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 600;
    }

    /* BOTTOM CONTROLS */
    .bottom-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      background-color: #0b1120;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
      gap: 20px;
      z-index: 10;
    }

    .nav-btn-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .nav-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }

    .nav-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.09);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .nav-btn:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    .timeline-container {
      flex: 1;
      display: flex;
      align-items: center;
      position: relative;
      padding: 0 10px;
    }

    .timeline-bar {
      width: 100%;
      height: 4px;
      background: #1e293b;
      border-radius: 2px;
      position: relative;
      cursor: pointer;
    }

    .timeline-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background: #0284c7;
      border-radius: 2px;
      transition: width 0.25s ease;
    }

    .timeline-nodes {
      display: flex;
      justify-content: space-between;
      position: absolute;
      left: 0;
      right: 0;
      top: -5px;
      pointer-events: none;
    }

    .timeline-dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #0b1120;
      border: 2px solid #334155;
      pointer-events: auto;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .timeline-dot.active {
      border-color: #38bdf8;
      background: #38bdf8;
      box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
      transform: scale(1.2);
    }

    .timeline-dot.passed {
      border-color: #0284c7;
      background: #0284c7;
    }

    .step-counter-text {
      font-size: 13px;
      font-weight: 600;
      color: #94a3b8;
      white-space: nowrap;
    }
  </style>
</head>
<body>

  <!-- Top Workflow Navbar -->
  <header class="workflow-header">
    <div class="brand-section">
      <span class="brand-icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </span>
      <span>Code<span style="color:#38bdf8;">Visualizer</span></span>
      <span class="structure-type-pill" id="structureTypePill">Linked List</span>
    </div>

    <!-- Playback Controls -->
    <div class="playback-controls">
      <button class="play-btn" id="playBtn" title="Play automatic execution animation">
        <svg id="playIcon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
        <span id="playBtnText">Play</span>
      </button>

      <button class="pill-btn" id="restartBtn" title="Restart execution session">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="1 4 1 10 7 10"></polyline>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
        </svg>
        <span>Restart</span>
      </button>

      <select class="speed-select" id="speedSelect" title="Execution Speed">
        <option value="0.5">0.5x</option>
        <option value="1.0" selected>1.0x</option>
        <option value="2.0">2.0x</option>
      </select>
    </div>

    <!-- Top Right Perspective & Terminal Toggle -->
    <div class="top-tools">
      <button class="mode-switch-btn active" id="btn2D" title="Flat 2D workflow view">2D</button>
      <button class="mode-switch-btn" id="btn3D" title="Spatial 3D depth view">3D</button>
      <button class="tool-btn active" id="toggleTerminalBtn" title="Toggle Integrated Terminal">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>Terminal</span>
      </button>
    </div>
  </header>

  <!-- Split View: Canvas on Top, Integrated Terminal on Bottom -->
  <div class="workspace-split">
    <!-- Interactive Canvas -->
    <div class="canvas-container" id="canvasContainer">
      <!-- Live Code Indicator (connected to active editor line) -->
      <div class="live-code-indicator" id="liveIndicator">
        <div class="live-pulse-dot"></div>
        <div>
          <span style="color:#38bdf8; font-weight:600;" id="liveStmt">Connecting...</span>
          <span style="color:#94a3b8; margin-left:6px;" id="liveLine">Line 1</span>
        </div>
      </div>

      <!-- Canvas Viewport -->
      <div class="canvas-viewport" id="canvasViewport">
        <div class="visual-world" id="visualWorld">
          <div id="nodesContainer"></div>
        </div>
      </div>

      <!-- Canvas HUD -->
      <div class="canvas-hud">
        <button class="hud-btn" id="zoomInBtn" title="Zoom In">+</button>
        <button class="hud-btn" id="zoomOutBtn" title="Zoom Out">−</button>
        <button class="hud-btn" id="centerBtn" title="Recenter View">⊙</button>
      </div>
    </div>

    <!-- Resizer Divider -->
    <div class="terminal-resizer" id="terminalResizer"></div>

    <!-- Integrated VS Code Style Interactive Terminal -->
    <section class="integrated-terminal" id="integratedTerminal">
      <div class="terminal-header">
        <div class="terminal-tabs">
          <div class="terminal-tab">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="4 17 10 11 4 5"></polyline>
              <line x1="12" y1="19" x2="20" y2="19"></line>
            </svg>
            <span>TERMINAL (stdin / stdout)</span>
          </div>
        </div>
        <div class="terminal-actions">
          <button class="term-btn" id="clearTerminalBtn" title="Clear Terminal">Clear</button>
        </div>
      </div>

      <!-- Live Terminal Output Area -->
      <div class="terminal-body" id="terminalBody"></div>

      <!-- Interactive Input Line (cin, input()) -->
      <div class="terminal-input-row" id="terminalInputRow">
        <span class="terminal-prompt-prefix">❯</span>
        <input 
          type="text" 
          class="terminal-input-field" 
          id="terminalInputField" 
          placeholder="Type input here and press Enter (e.g. choice, node value)..." 
          autocomplete="off"
          spellcheck="false"
        />
        <span class="terminal-enter-badge">↵ Enter</span>
      </div>
    </section>
  </div>

  <!-- Bottom Timeline & Navigation Bar -->
  <footer class="bottom-bar">
    <div class="nav-btn-group">
      <button class="nav-btn" id="backwardBtn" title="Previous execution step">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
        </svg>
        <span>Backward</span>
      </button>

      <button class="nav-btn" id="forwardBtn" title="Next execution step">
        <span>Forward</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
        </svg>
      </button>
    </div>

    <!-- Timeline Scrubber -->
    <div class="timeline-container">
      <div class="timeline-bar" id="timelineBar">
        <div class="timeline-fill" id="timelineFill"></div>
        <div class="timeline-nodes" id="timelineNodes"></div>
      </div>
    </div>

    <!-- Step Counter -->
    <div class="step-counter-text" id="stepCounterText">Step 1 of 1</div>
  </footer>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let session = ${sessionJson};
    let currentStepIndex = session.currentStepIndex || 0;
    let isPlaying = false;

    // Pan & Zoom Camera State
    let zoomLevel = 1.0;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;

    // Terminal History & Inputs Log
    const inputHistory = [];

    // DOM Elements
    const canvasContainer = document.getElementById('canvasContainer');
    const canvasViewport = document.getElementById('canvasViewport');
    const nodesContainer = document.getElementById('nodesContainer');
    const liveStmt = document.getElementById('liveStmt');
    const liveLine = document.getElementById('liveLine');
    const structureTypePill = document.getElementById('structureTypePill');
    const playBtn = document.getElementById('playBtn');
    const playBtnText = document.getElementById('playBtnText');
    const restartBtn = document.getElementById('restartBtn');
    const speedSelect = document.getElementById('speedSelect');
    const backwardBtn = document.getElementById('backwardBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const timelineBar = document.getElementById('timelineBar');
    const timelineFill = document.getElementById('timelineFill');
    const timelineNodes = document.getElementById('timelineNodes');
    const stepCounterText = document.getElementById('stepCounterText');
    const btn2D = document.getElementById('btn2D');
    const btn3D = document.getElementById('btn3D');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const centerBtn = document.getElementById('centerBtn');
    const integratedTerminal = document.getElementById('integratedTerminal');
    const toggleTerminalBtn = document.getElementById('toggleTerminalBtn');
    const terminalBody = document.getElementById('terminalBody');
    const terminalInputField = document.getElementById('terminalInputField');
    const clearTerminalBtn = document.getElementById('clearTerminalBtn');
    const terminalResizer = document.getElementById('terminalResizer');

    // Terminal Resizing
    let isResizingTerminal = false;
    terminalResizer.addEventListener('mousedown', (e) => {
      isResizingTerminal = true;
      terminalResizer.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isResizingTerminal) return;
      const newHeight = window.innerHeight - e.clientY - 45; // subtract footer height
      if (newHeight >= 60 && newHeight <= window.innerHeight * 0.75) {
        integratedTerminal.style.height = newHeight + 'px';
      }
    });

    window.addEventListener('mouseup', () => {
      if (isResizingTerminal) {
        isResizingTerminal = false;
        terminalResizer.classList.remove('dragging');
        document.body.style.cursor = '';
      }
    });

    toggleTerminalBtn.addEventListener('click', () => {
      const isHidden = integratedTerminal.style.display === 'none';
      integratedTerminal.style.display = isHidden ? 'flex' : 'none';
      terminalResizer.style.display = isHidden ? 'block' : 'none';
      toggleTerminalBtn.classList.toggle('active', isHidden);
    });

    clearTerminalBtn.addEventListener('click', () => {
      terminalBody.innerHTML = '';
    });

    // Terminal Input Submission (stdin)
    terminalInputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = terminalInputField.value;
        if (val.trim() === '') return;

        // Print entered input into terminal body
        appendTerminalText(val + '\\n', '#00f0ff');
        inputHistory.push(val);
        terminalInputField.value = '';

        // Send stdin input to backend running process
        vscode.postMessage({
          type: 'terminalInput',
          input: val
        });
      }
    });

    function appendTerminalText(text, color) {
      const span = document.createElement('span');
      if (color) span.style.color = color;
      span.textContent = text;
      terminalBody.appendChild(span);
      terminalBody.scrollTop = terminalBody.scrollHeight;
    }

    // Pan & Zoom
    function updateTransform() {
      canvasViewport.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${zoomLevel})\`;
    }

    canvasContainer.addEventListener('mousedown', (e) => {
      if (e.target.closest('.workflow-block') || e.target.closest('.canvas-hud') || e.target.closest('.live-code-indicator')) return;
      isDragging = true;
      dragStartX = e.clientX - panX;
      dragStartY = e.clientY - panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      updateTransform();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvasContainer.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomLevel = Math.max(0.4, Math.min(2.5, zoomLevel * zoomFactor));
      updateTransform();
    }, { passive: false });

    zoomInBtn.addEventListener('click', () => {
      zoomLevel = Math.min(2.5, zoomLevel * 1.15);
      updateTransform();
    });

    zoomOutBtn.addEventListener('click', () => {
      zoomLevel = Math.max(0.4, zoomLevel * 0.85);
      updateTransform();
    });

    centerBtn.addEventListener('click', () => {
      panX = 0; panY = 0; zoomLevel = 1.0;
      updateTransform();
    });

    // 2D / 3D Switcher
    btn2D.addEventListener('click', () => {
      btn2D.classList.add('active');
      btn3D.classList.remove('active');
      canvasContainer.classList.remove('perspective-3d');
    });

    btn3D.addEventListener('click', () => {
      btn3D.classList.add('active');
      btn2D.classList.remove('active');
      canvasContainer.classList.add('perspective-3d');
    });

    // Timeline Rendering
    function renderTimeline() {
      timelineNodes.innerHTML = '';
      const total = session.steps.length;
      session.steps.forEach((step, idx) => {
        const dot = document.createElement('div');
        dot.className = 'timeline-dot' + (idx === currentStepIndex ? ' active' : (idx < currentStepIndex ? ' passed' : ''));
        dot.title = 'Step ' + (idx + 1) + ': ' + step.statement;
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          setStep(idx);
        });
        timelineNodes.appendChild(dot);
      });

      const pct = (currentStepIndex / Math.max(1, total - 1)) * 100;
      timelineFill.style.width = pct + '%';
    }

    // Canvas & Terminal State Renderer
    function renderState() {
      const step = session.steps[currentStepIndex];
      if (!step) return;

      // Update Live Indicator
      liveStmt.textContent = step.statement;
      liveLine.textContent = 'Line ' + step.line;

      // Update Navigation
      stepCounterText.textContent = 'Step ' + (currentStepIndex + 1) + ' of ' + session.steps.length;
      backwardBtn.disabled = (currentStepIndex === 0);
      forwardBtn.disabled = (currentStepIndex === session.steps.length - 1);
      renderTimeline();

      // Render Visual Structures
      nodesContainer.innerHTML = '';
      const struct = (step.visualStructures && step.visualStructures[0]);
      if (struct) {
        structureTypePill.textContent = struct.title || struct.kind;
        renderRowStructure(struct);
      }

      // Update Integrated Terminal Output
      terminalBody.innerHTML = '';
      if (step.output) {
        appendTerminalText(step.output);
      }

      // If program is actively requesting input (e.g. cin >> choice)
      if (step.isWaitingInput) {
        terminalInputField.placeholder = step.inputPrompt || "Program is waiting for input: enter value and press Enter...";
        terminalInputField.focus();
      }
    }

    function renderRowStructure(struct) {
      const row = document.createElement('div');
      row.className = 'flow-row';

      const blocks = struct.blocks || [];
      const connections = struct.connections || [];
      const pointers = struct.pointers || [];
      const callout = struct.callout;

      blocks.forEach((block, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'node-wrapper';

        const pointer = pointers.find(p => p.targetBlockId === block.id);
        if (pointer) {
          const marker = document.createElement('div');
          marker.className = 'pointer-overlay';
          marker.innerHTML = \`
            <span class="pointer-label" style="color: \${pointer.color || '#f59e0b'};">\${pointer.label}</span>
            <div class="pointer-arrow" style="border-top-color: \${pointer.color || '#f59e0b'};"></div>
          \`;
          wrapper.appendChild(marker);
        }

        if (callout && callout.targetBlockId === block.id) {
          const bubble = document.createElement('div');
          bubble.className = 'callout-bubble';
          bubble.textContent = callout.text;
          wrapper.appendChild(bubble);
        }

        const blockEl = document.createElement('div');
        blockEl.className = 'workflow-block' + (block.isActive ? ' is-active' : '');
        blockEl.innerHTML = \`
          <div class="block-header">
            <span class="block-addr">\${block.address || ''}</span>
            <span class="block-tag">\${block.type || 'data'}</span>
          </div>
          <div class="block-value">\${block.value}</div>
          <div class="block-sublabel">\${block.subLabel || ''}</div>
        \`;
        wrapper.appendChild(blockEl);

        const conn = connections.find(c => c.fromId === block.id);
        if (conn) {
          if (conn.targetLabel === 'NULL' || conn.targetLabel === 'None') {
            const nullEl = document.createElement('div');
            nullEl.className = 'null-connection';
            nullEl.innerHTML = \`
              <div class="null-arrow"></div>
              <span class="null-badge">\${conn.targetLabel}</span>
            \`;
            wrapper.appendChild(nullEl);
          } else {
            const arrowEl = document.createElement('div');
            arrowEl.className = 'arrow-connection';
            arrowEl.innerHTML = \`
              <div class="arrow-line"></div>
              <div class="arrow-head"></div>
            \`;
            wrapper.appendChild(arrowEl);
          }
        } else if (index < blocks.length - 1) {
          const arrowEl = document.createElement('div');
          arrowEl.className = 'arrow-connection';
          arrowEl.innerHTML = \`<div class="arrow-line"></div><div class="arrow-head"></div>\`;
          wrapper.appendChild(arrowEl);
        }

        row.appendChild(wrapper);
      });

      nodesContainer.appendChild(row);
    }

    function setStep(newIndex) {
      if (newIndex < 0 || newIndex >= session.steps.length) return;
      currentStepIndex = newIndex;
      renderState();
      vscode.postMessage({ type: 'stepChange', stepIndex: currentStepIndex });
    }

    backwardBtn.addEventListener('click', () => {
      pausePlayback();
      if (currentStepIndex > 0) setStep(currentStepIndex - 1);
    });

    forwardBtn.addEventListener('click', () => {
      pausePlayback();
      if (currentStepIndex < session.steps.length - 1) setStep(currentStepIndex + 1);
    });

    timelineBar.addEventListener('click', (e) => {
      pausePlayback();
      const rect = timelineBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const targetIndex = Math.round(ratio * (session.steps.length - 1));
      setStep(targetIndex);
    });

    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        pausePlayback();
        vscode.postMessage({ type: 'pause' });
      } else {
        if (currentStepIndex >= session.steps.length - 1) {
          currentStepIndex = 0;
          renderState();
        }
        startPlayback();
        vscode.postMessage({ type: 'play' });
      }
    });

    restartBtn.addEventListener('click', () => {
      pausePlayback();
      setStep(0);
      vscode.postMessage({ type: 'restart' });
    });

    speedSelect.addEventListener('change', (e) => {
      vscode.postMessage({ type: 'speedChange', speed: parseFloat(e.target.value) });
    });

    function startPlayback() {
      isPlaying = true;
      playBtnText.textContent = 'Pause';
      playBtn.classList.add('is-active');
    }

    function pausePlayback() {
      isPlaying = false;
      playBtnText.textContent = 'Play';
      playBtn.classList.remove('is-active');
    }

    // Extension Host Messages
    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'setStep':
          currentStepIndex = msg.stepIndex;
          renderState();
          if (currentStepIndex >= session.steps.length - 1 && isPlaying) {
            pausePlayback();
          }
          break;
        case 'init':
          session = msg.session;
          currentStepIndex = session.currentStepIndex || 0;
          renderState();
          break;
        case 'terminalOutput':
          appendTerminalText(msg.text);
          break;
        case 'terminalWaitInput':
          terminalInputField.placeholder = msg.prompt || "Enter input...";
          terminalInputField.focus();
          break;
      }
    });

    renderState();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
