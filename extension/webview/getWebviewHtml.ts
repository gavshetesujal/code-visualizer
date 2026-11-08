import * as vscode from 'vscode';
import { SessionData } from '../types';

export function getWebviewHtml(session: SessionData, webview: vscode.Webview): string {
  const sessionJson = JSON.stringify(session).replace(/</g, '\\u003c');
  const nonce = getNonce();

  const initialStep = (session.steps && session.steps[session.currentStepIndex || 0]) || null;
  const initialStmt = initialStep ? initialStep.statement.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Waiting for program execution...';
  const initialLine = initialStep ? `Line ${initialStep.line}` : '';
  const initialStepCount = session.steps && session.steps.length > 0
    ? `Step ${(session.currentStepIndex || 0) + 1} of ${session.steps.length}`
    : 'Step 0 of 0';
  const initialPill = initialStep
    ? (initialStep.callStackFrames && initialStep.callStackFrames.length > 0
        ? (initialStep.callStackFrames.length > 1 ? 'Recursion' : 'Function')
        : (initialStep.activeLoop || initialStep.activeLoops ? 'Loop Visualization' : 'Variable State'))
    : 'Canvas';

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

    /* TOP WORKFLOW HEADER (n8n inspired) */
    .workflow-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 20px;
      background-color: #0b1120;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
      gap: 12px;
      z-index: 10;
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 10px;
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
      padding: 3px 8px;
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
      padding: 6px 18px;
      font-size: 13px;
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
      padding: 5px 14px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
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
      padding: 4px 8px;
      font-size: 12px;
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
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .mode-switch-btn.active {
      color: #00f0ff;
      border-color: #00f0ff;
      background: rgba(0, 240, 255, 0.08);
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.2);
    }

    /* MAIN INTERACTIVE WORKFLOW CANVAS */
    .canvas-container {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: grab;
      background-color: var(--canvas-bg);
      background-image: 
        radial-gradient(circle, rgba(255, 255, 255, 0.08) 1px, transparent 1px);
      background-size: 24px 24px;
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
      min-height: 500px;
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
      padding: 60px 40px;
      z-index: 2;
    }

    .node-wrapper {
      display: flex;
      align-items: center;
      position: relative;
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    /* MODERN N8N WORKFLOW BLOCK */
    .workflow-block {
      width: 130px;
      height: 108px;
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
      font-weight: 500;
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

    /* POINTER OVERLAY (HEAD) */
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

    /* SPEECH BUBBLE CALLOUT */
    .callout-bubble {
      position: absolute;
      top: -55px;
      left: 50%;
      transform: translateX(-15%);
      background: #00d2ff;
      color: #04101e;
      font-weight: 700;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 14px;
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

    /* EMPTY STATE ON CANVAS */
    .empty-canvas-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 260px;
      padding: 40px;
      text-align: center;
      gap: 16px;
    }

    .empty-canvas-icon {
      color: #334155;
    }

    .empty-canvas-msg {
      font-size: 14px;
      font-weight: 500;
      color: #64748b;
      letter-spacing: 0.3px;
    }

    .empty-ll-card {
      display: inline-flex;
      align-items: center;
      gap: 14px;
      background: rgba(13, 21, 39, 0.85);
      border: 1px dashed rgba(56, 189, 248, 0.4);
      padding: 16px 28px;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    }

    .empty-pointer-badge {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: var(--orange-accent);
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .empty-null-badge {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #f87171;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 800;
      padding: 4px 12px;
      border-radius: 6px;
    }

    /* VARIABLE BUCKET DESIGN */
    .buckets-grid {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: center;
      gap: 28px;
      padding: 24px;
      z-index: 2;
    }

    .var-bucket {
      width: 136px;
      height: 136px;
      background: linear-gradient(180deg, rgba(15, 23, 42, 0.75) 0%, rgba(13, 21, 39, 0.95) 100%);
      border: 2px solid #334155;
      border-top: none;
      border-radius: 0 0 16px 16px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5), inset 0 -4px 12px rgba(0, 0, 0, 0.3);
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .var-bucket::before {
      content: '';
      position: absolute;
      top: -4px;
      left: -4px;
      right: -4px;
      height: 6px;
      background: #475569;
      border-radius: 4px;
    }

    .var-bucket.is-modified {
      border-color: #00f0ff;
      box-shadow: 0 0 25px rgba(0, 240, 255, 0.35), inset 0 0 15px rgba(0, 240, 255, 0.15);
      transform: translateY(-4px);
    }

    .var-bucket.is-modified::before {
      background: #00f0ff;
      box-shadow: 0 0 10px #00f0ff;
    }

    .var-bucket.is-waiting-input {
      border-color: #f59e0b;
      box-shadow: 0 0 30px rgba(245, 158, 11, 0.4), inset 0 0 15px rgba(245, 158, 11, 0.15);
      animation: pulseBucket 1.8s infinite ease-in-out;
    }

    .var-bucket.is-waiting-input::before {
      background: #f59e0b;
      box-shadow: 0 0 12px #f59e0b;
    }

    @keyframes pulseBucket {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.04); }
    }

    .bucket-name-tag {
      position: absolute;
      top: -26px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #38bdf8;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      padding: 2px 12px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
      letter-spacing: 0.5px;
    }

    .var-bucket.is-modified .bucket-name-tag {
      border-color: #00f0ff;
      color: #00f0ff;
      box-shadow: 0 0 10px rgba(0, 240, 255, 0.4);
    }

    .var-bucket.is-waiting-input .bucket-name-tag {
      border-color: #f59e0b;
      color: #f59e0b;
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.4);
    }

    .bucket-value-container {
      position: relative;
      width: 100%;
      height: 70px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .bucket-current-val {
      font-family: var(--font-family);
      font-size: 32px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1;
      text-align: center;
    }

    /* Transition Animations for Value changes */
    .value-enter {
      animation: dropIn 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    .value-exit {
      position: absolute;
      font-family: var(--font-family);
      font-size: 28px;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.4);
      animation: floatOut 0.45s cubic-bezier(0.55, 0.055, 0.675, 0.19) forwards;
    }

    @keyframes dropIn {
      0% {
        opacity: 0;
        transform: translateY(-40px) scale(0.6);
      }
      70% {
        opacity: 1;
        transform: translateY(4px) scale(1.08);
      }
      100% {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes floatOut {
      0% {
        opacity: 0.7;
        transform: translateY(0) scale(1);
      }
      100% {
        opacity: 0;
        transform: translateY(-45px) scale(0.7);
      }
    }

    .bucket-empty-placeholder {
      font-family: var(--font-mono);
      font-size: 11px;
      color: #64748b;
      border: 1px dashed #334155;
      padding: 6px 10px;
      border-radius: 6px;
      font-weight: 500;
    }

    /* LOOP CONTAINER */
    .loop-container {
      background: rgba(13, 22, 39, 0.85);
      border: 2px solid #1e3a8a;
      border-radius: 20px;
      padding: 24px 30px;
      min-width: 540px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(30, 58, 138, 0.25);
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 18px;
      margin-bottom: 20px;
    }

    .loop-container.is-active-loop {
      border-color: #38bdf8;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 35px rgba(56, 189, 248, 0.35);
    }

    .loop-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 12px;
    }

    .loop-title {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      color: #f8fafc;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .loop-badge {
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid #38bdf8;
      color: #38bdf8;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .loop-phase-pill {
      background: #0f172a;
      border: 1px solid #334155;
      color: #f59e0b;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .loop-cycle-track {
      position: absolute;
      right: -36px;
      top: 50%;
      transform: translateY(-50%);
      width: 60px;
      height: 120px;
      pointer-events: none;
    }

    .cycle-path {
      stroke: #38bdf8;
      stroke-width: 2.5;
      stroke-dasharray: 6 4;
      animation: cycleFlow 1.5s linear infinite;
      fill: none;
    }

    @keyframes cycleFlow {
      from { stroke-dashoffset: 20; }
      to { stroke-dashoffset: 0; }
    }

    /* LOOP HISTORY */
    .loop-history-section {
      background: rgba(11, 17, 32, 0.7);
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }

    .history-label {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
    }

    .history-chips-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .history-chip {
      background: #1e293b;
      border: 1px solid #334155;
      color: #94a3b8;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 6px;
    }

    .history-arrow {
      color: #64748b;
      font-size: 11px;
    }

    .history-current-chip {
      background: rgba(56, 189, 248, 0.2);
      border: 1.5px solid #38bdf8;
      color: #38bdf8;
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 6px;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    }

    /* TERMINAL WAITING BADGE (Points to native VS Code integrated terminal) */
    .terminal-waiting-badge {
      background: rgba(15, 23, 42, 0.95);
      border: 1.5px solid #f59e0b;
      border-radius: 10px;
      padding: 10px 18px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(245, 158, 11, 0.25);
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fbbf24;
      font-size: 13px;
      font-weight: 600;
      margin: 12px auto;
      z-index: 10;
      animation: pulseTerminalWait 2s infinite ease-in-out;
    }

    @keyframes pulseTerminalWait {
      0%, 100% {
        border-color: #f59e0b;
        box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
      }
      50% {
        border-color: #fbbf24;
        box-shadow: 0 0 22px rgba(245, 158, 11, 0.45);
      }
    }

    /* ADAPTIVE LOOP GROUP CARD */
    .loop-group-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98));
      border: 1.5px solid #6366f1;
      border-radius: 12px;
      padding: 16px 22px;
      width: 480px;
      max-width: 90vw;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), 0 0 22px rgba(99, 102, 241, 0.3);
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: fadeIn 0.3s ease-out;
    }

    .loop-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid rgba(99, 102, 241, 0.25);
      padding-bottom: 10px;
    }

    .loop-group-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(99, 102, 241, 0.2);
      color: #818cf8;
      border: 1px solid #6366f1;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .loop-group-title {
      font-size: 13px;
      font-weight: 600;
      color: #f1f5f9;
      flex: 1;
    }

    .expand-group-btn {
      background: #4f46e5;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.2s;
    }

    .expand-group-btn:hover {
      background: #6366f1;
      box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
      transform: translateY(-1px);
    }

    .loop-group-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .loop-group-desc {
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.4;
    }

    .group-deltas-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 4px 0;
    }

    .group-delta-item {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 5px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 12px;
    }

    .delta-var-name {
      color: #38bdf8;
      font-weight: 600;
    }

    .delta-start-val {
      color: #94a3b8;
    }

    .delta-arrow {
      color: #6366f1;
      font-weight: 700;
    }

    .delta-end-val {
      color: #10b981;
      font-weight: 700;
    }

    .expanded-iter-pill {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid #6366f1;
      color: #a5b4fc;
      border-radius: 20px;
      padding: 4px 14px;
      font-size: 11px;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    /* CONDITION EVALUATION BANNER */
    .cond-eval-banner {
      background: rgba(15, 23, 42, 0.85);
      border: 1.5px solid #334155;
      border-radius: 12px;
      padding: 10px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }

    .cond-eval-banner.is-true {
      border-color: #10b981;
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.25);
    }

    .cond-eval-banner.is-false {
      border-color: #f59e0b;
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.25);
    }

    .cond-pill {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }

    .cond-pill.true {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid #10b981;
    }

    .cond-pill.false {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid #f59e0b;
    }

    .cond-text {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 600;
      color: #f8fafc;
    }

    .cond-action-text {
      font-size: 12px;
      color: #94a3b8;
    }

    /* RECURSIVE CALL STACK & FUNCTION FRAMES */
    .call-stack-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
      width: 520px;
      max-width: 95vw;
      animation: fadeIn 0.3s ease-out;
    }

    .call-stack-header {
      background: rgba(15, 23, 42, 0.95);
      border: 1.5px solid #8b5cf6;
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(139, 92, 246, 0.2);
    }

    .call-stack-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #c084fc;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .stack-breadcrumb-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      font-family: var(--font-mono);
      font-size: 11px;
    }

    .stack-crumb {
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 7px;
      border-radius: 4px;
    }

    .stack-crumb.is-active {
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      border: 1px solid rgba(56, 189, 248, 0.35);
      font-weight: 700;
    }

    .crumb-arrow {
      color: #8b5cf6;
      font-size: 10px;
    }

    .call-stack-frames-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .func-frame-card {
      background: rgba(13, 21, 39, 0.92);
      border: 2px solid #8b5cf6;
      border-radius: 16px;
      padding: 18px 22px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 24px rgba(139, 92, 246, 0.2);
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: all 0.25s ease;
    }

    .func-frame-card.is-waiting {
      border-color: rgba(245, 158, 11, 0.45);
      background: rgba(13, 21, 39, 0.75);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      opacity: 0.88;
    }

    .func-frame-card.is-active-frame {
      border-color: #38bdf8;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 28px rgba(56, 189, 248, 0.25);
    }

    .func-frame-card.is-returning-frame {
      border-color: #10b981;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 28px rgba(16, 185, 129, 0.3);
    }

    .func-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 10px;
      gap: 10px;
      flex-wrap: wrap;
    }

    .func-title {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      color: #c084fc;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .frame-state-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .frame-state-badge.is-active {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid #38bdf8;
    }

    .frame-state-badge.is-waiting {
      background: rgba(245, 158, 11, 0.15);
      color: #f59e0b;
      border: 1px solid #f59e0b;
    }

    .frame-state-badge.is-returning {
      background: rgba(16, 185, 129, 0.15);
      color: #10b981;
      border: 1px solid #10b981;
    }

    .func-depth-badge {
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid #8b5cf6;
      color: #c084fc;
      padding: 2px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
    }

    .func-calc-banner {
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid #6366f1;
      color: #a5b4fc;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .func-return-banner {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #34d399;
      padding: 8px 14px;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stack-connector-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #8b5cf6;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      margin: -4px 0;
    }

    /* ARRAY MEMORY CELLS */
    .array-container {
      background: rgba(11, 17, 32, 0.85);
      border: 1.5px solid #1e293b;
      border-radius: 16px;
      padding: 18px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 20px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
    }

    .array-title {
      font-family: var(--font-mono);
      font-size: 13px;
      font-weight: 700;
      color: #38bdf8;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .array-cells-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .array-cell {
      width: 72px;
      height: 72px;
      background: #0f172a;
      border: 1.5px solid #334155;
      border-radius: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      padding: 6px 4px;
      position: relative;
      transition: all 0.25s ease;
    }

    .array-cell.is-modified {
      border-color: #00f0ff;
      box-shadow: 0 0 16px rgba(0, 240, 255, 0.4);
      transform: translateY(-2px);
    }

    .cell-index {
      font-family: var(--font-mono);
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
    }

    .cell-value {
      font-family: var(--font-family);
      font-size: 20px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1;
    }

    .ptr-tag {
      position: absolute;
      bottom: -22px;
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid #f59e0b;
      color: #f59e0b;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      white-space: nowrap;
    }

    /* LIVE EXECUTION CODE INDICATOR */
    .live-code-indicator {
      position: absolute;
      left: 16px;
      top: 16px;
      background: rgba(11, 17, 32, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.3);
      backdrop-filter: blur(10px);
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 10;
    }

    .live-pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00f0ff;
      box-shadow: 0 0 10px #00f0ff;
    }

    /* FLOATING CANVAS HUD */
    .canvas-hud {
      position: absolute;
      right: 20px;
      bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: rgba(13, 21, 39, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      backdrop-filter: blur(8px);
      padding: 6px;
      border-radius: 8px;
      z-index: 10;
    }

    .hud-btn {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      font-weight: 600;
    }

    .hud-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    /* BOTTOM CONTROLS */
    .bottom-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background-color: #0b1120;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      flex-shrink: 0;
      gap: 20px;
      z-index: 10;
    }

    .nav-btn-group {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .nav-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-main);
      border-radius: 6px;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
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

    /* ========================================================= */
    /* C++ CLASS VISUALIZATION CONTAINER & PATHWAYS              */
    /* ========================================================= */

    .class-container-root {
      position: relative;
      width: 100%;
      max-width: 680px;
      margin-bottom: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .class-blueprint-box {
      background: rgba(13, 21, 39, 0.95);
      border: 2px solid #3b82f6;
      border-radius: 18px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65), 0 0 35px rgba(59, 130, 246, 0.2);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      transition: all 0.3s ease;
    }

    .class-blueprint-box.is-violation {
      border-color: #ef4444;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 45px rgba(239, 68, 68, 0.4);
      animation: alertPulse 1.2s infinite;
    }

    @keyframes alertPulse {
      0%, 100% { border-color: #ef4444; }
      50% { border-color: #f87171; box-shadow: 0 0 50px rgba(239, 68, 68, 0.6); }
    }

    .class-header-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      background: rgba(30, 58, 138, 0.25);
      border-bottom: 1.5px solid rgba(59, 130, 246, 0.25);
      gap: 12px;
      flex-wrap: wrap;
    }

    .class-identity-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 800;
      color: #60a5fa;
      letter-spacing: 0.5px;
    }

    .class-instances-bar {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .class-instance-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 4px 10px;
      border-radius: 6px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #94a3b8;
      font-weight: 600;
    }

    .class-instance-chip.is-active {
      background: rgba(56, 189, 248, 0.2);
      border-color: #38bdf8;
      color: #38bdf8;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    }

    /* COMPARTMENTS */
    .compartment-private {
      background: rgba(239, 68, 68, 0.03);
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      transition: all 0.3s ease;
    }

    .compartment-private.is-active-compartment {
      background: rgba(239, 68, 68, 0.08);
    }

    .compartment-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .compartment-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 800;
      padding: 3px 10px;
      border-radius: 6px;
      letter-spacing: 0.8px;
    }

    .badge-private {
      background: rgba(239, 68, 68, 0.15);
      border: 1px solid rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    .badge-public {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #34d599;
    }

    .compartment-access-rule {
      font-size: 11px;
      font-family: var(--font-mono);
      color: #64748b;
    }

    /* OPENING B: INTERNAL DIVIDER PATHWAY */
    .divider-opening-b-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      height: 32px;
      margin: 0;
    }

    .divider-left-line, .divider-right-line {
      flex: 1;
      height: 2px;
      background: rgba(59, 130, 246, 0.3);
    }

    .opening-b-gateway {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #0f172a;
      border: 1.5px dashed #60a5fa;
      border-radius: 8px;
      padding: 4px 14px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      color: #93c5fd;
      letter-spacing: 0.5px;
      z-index: 5;
      transition: all 0.3s ease;
    }

    .opening-b-gateway.is-active-gateway {
      border: 2px solid #38bdf8;
      background: rgba(56, 189, 248, 0.2);
      color: #ffffff;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.6);
      transform: scale(1.05);
    }

    /* PUBLIC COMPARTMENT & OPENING A */
    .compartment-public-wrap {
      position: relative;
      display: flex;
    }

    /* OPENING A NOTCH ON LEFT BORDER */
    .opening-a-notch {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      background: #0b1120;
      border: 1.5px dashed #10b981;
      border-left: none;
      border-radius: 0 8px 8px 0;
      padding: 6px 10px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 800;
      color: #34d599;
      letter-spacing: 0.5px;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 6px;
      box-shadow: 2px 0 10px rgba(16, 185, 129, 0.2);
      transition: all 0.3s ease;
    }

    .opening-a-notch.is-active-entrance {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.25);
      color: #ffffff;
      box-shadow: 4px 0 20px rgba(56, 189, 248, 0.7);
      transform: translateY(-50%) scale(1.06);
    }

    .compartment-public {
      flex: 1;
      background: rgba(16, 185, 129, 0.03);
      padding: 20px 24px 20px 42px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      transition: all 0.3s ease;
    }

    .compartment-public.is-active-compartment {
      background: rgba(16, 185, 129, 0.08);
    }

    /* MEMBER FUNCTIONS AREA */
    .member-funcs-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .member-funcs-title {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    .member-funcs-grid {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .class-func-card {
      background: rgba(15, 23, 42, 0.9);
      border: 1.5px solid #334155;
      border-radius: 8px;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #cbd5e1;
      transition: all 0.25s ease;
    }

    .class-func-card.is-active-func {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      color: #ffffff;
      box-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
      transform: translateY(-2px);
    }

    .func-access-pill {
      font-size: 9px;
      font-weight: 800;
      padding: 2px 5px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .func-access-pill.private {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    .func-access-pill.public {
      background: rgba(16, 185, 129, 0.2);
      color: #34d599;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    /* PATHWAY ARROW BANNER */
    .pathway-flow-banner {
      background: rgba(15, 23, 42, 0.95);
      border: 1.5px solid #38bdf8;
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: #e2e8f0;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
      animation: bannerSlideIn 0.3s ease;
    }

    @keyframes bannerSlideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .pathway-icon-pill {
      background: #38bdf8;
      color: #0b1120;
      padding: 3px 8px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 11px;
      white-space: nowrap;
    }

    /* ACCESS VIOLATION ALERT */
    .access-violation-alert {
      background: rgba(239, 68, 68, 0.15);
      border: 2px solid #ef4444;
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      color: #fca5a5;
      font-family: var(--font-mono);
      font-size: 12px;
      box-shadow: 0 0 30px rgba(239, 68, 68, 0.4);
      animation: alertPulse 1.2s infinite;
    }

    .violation-title {
      font-size: 13px;
      font-weight: 800;
      color: #f87171;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* INHERITANCE VISUALIZATION STYLES */
    .inheritance-hierarchy-view {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 24px;
      width: 100%;
      max-width: 960px;
      margin-bottom: 24px;
    }

    .hierarchy-tier-row {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      gap: 28px;
      width: 100%;
      flex-wrap: wrap;
    }

    .inheritance-connector-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 4px 0;
    }

    .inheritance-arrow-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 18px;
      border-radius: 20px;
      background: rgba(15, 23, 42, 0.95);
      border: 1.5px solid #8b5cf6;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      color: #c4b5fd;
      letter-spacing: 0.5px;
      box-shadow: 0 0 15px rgba(139, 92, 246, 0.3);
      transition: all 0.3s ease;
    }

    .inheritance-arrow-badge.is-active-connector {
      border-color: #38bdf8;
      background: rgba(56, 189, 248, 0.2);
      color: #ffffff;
      box-shadow: 0 0 25px rgba(56, 189, 248, 0.7);
      transform: scale(1.05);
      animation: connectorPulse 1.2s infinite;
    }

    @keyframes connectorPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(56, 189, 248, 0.5); }
      50% { box-shadow: 0 0 35px rgba(56, 189, 248, 0.9); }
    }

    .class-role-badge {
      font-family: var(--font-mono);
      font-size: 9px;
      font-weight: 800;
      padding: 3px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.6px;
    }

    .class-role-badge.parent {
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid rgba(139, 92, 246, 0.5);
      color: #c4b5fd;
    }

    .class-role-badge.child {
      background: rgba(56, 189, 248, 0.2);
      border: 1px solid rgba(56, 189, 248, 0.5);
      color: #38bdf8;
    }

    /* PROTECTED COMPARTMENT */
    .compartment-protected {
      background: rgba(245, 158, 11, 0.03);
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      position: relative;
      transition: all 0.3s ease;
      border-top: 1px solid rgba(245, 158, 11, 0.2);
    }

    .compartment-protected.is-active-compartment {
      background: rgba(245, 158, 11, 0.08);
    }

    .badge-protected {
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #fbbf24;
    }

    .func-access-pill.protected {
      background: rgba(245, 158, 11, 0.2);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .func-access-pill.inaccessible {
      background: rgba(100, 116, 139, 0.2);
      color: #94a3b8;
      border: 1px solid rgba(100, 116, 139, 0.4);
      text-decoration: line-through;
    }

    /* INHERITED MEMBERS SECTION (INSIDE CHILD CLASS) */
    .inherited-members-section {
      background: rgba(30, 41, 59, 0.35);
      border-top: 1.5px dashed rgba(139, 92, 246, 0.35);
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .inherited-members-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      color: #a78bfa;
    }

    .origin-tag {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(139, 92, 246, 0.25);
      border: 1px solid rgba(139, 92, 246, 0.4);
      color: #c4b5fd;
      margin-left: 6px;
    }
  </style>
</head>
<body>

  <!-- Top Workflow Navbar -->
  <header class="workflow-header">
    <div class="brand-section">
      <span class="brand-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
      </span>
      <span>Code<span style="color:#38bdf8;">Visualizer</span></span>
      <span class="structure-type-pill" id="structureTypePill">${initialPill}</span>
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
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
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

    <!-- Top Tools: 2D / 3D Switcher -->
    <div class="top-tools">
      <button class="mode-switch-btn active" id="btn2D" title="Flat 2D workflow view">2D</button>
      <button class="mode-switch-btn" id="btn3D" title="Spatial 3D depth view">3D</button>
    </div>
  </header>

  <!-- Interactive n8n Canvas -->
  <main class="canvas-container" id="canvasContainer">
    <!-- Live Code Synchronization Indicator (connected to active editor line) -->
    <div class="live-code-indicator" id="liveIndicator">
      <div class="live-pulse-dot"></div>
      <div>
        <span style="color:#38bdf8; font-weight:600;" id="liveStmt">${initialStmt}</span>
        <span style="color:#94a3b8; margin-left:6px;" id="liveLine">${initialLine}</span>
      </div>
    </div>

    <!-- Zoomable & Pannable Viewport -->
    <div class="canvas-viewport" id="canvasViewport">
      <div class="visual-world" id="visualWorld">
        <div id="nodesContainer"></div>
      </div>
    </div>

    <!-- Floating Canvas HUD (Zoom in, Zoom out, Center) -->
    <div class="canvas-hud">
      <button class="hud-btn" id="zoomInBtn" title="Zoom In">+</button>
      <button class="hud-btn" id="zoomOutBtn" title="Zoom Out">−</button>
      <button class="hud-btn" id="centerBtn" title="Recenter View">⊙</button>
    </div>
  </main>

  <!-- Bottom Timeline & Navigation Bar -->
  <footer class="bottom-bar">
    <div class="nav-btn-group">
      <button class="nav-btn" id="backwardBtn" title="Previous step">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="19 20 9 12 19 4 19 20"></polygon>
          <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2"></line>
        </svg>
        <span>Backward</span>
      </button>

      <button class="nav-btn" id="forwardBtn" title="Next step">
        <span>Forward</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 4 15 12 5 20 5 4"></polygon>
          <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
        </svg>
      </button>
    </div>

    <!-- Timeline Scrubber with Dots -->
    <div class="timeline-container">
      <div class="timeline-bar" id="timelineBar">
        <div class="timeline-fill" id="timelineFill"></div>
        <div class="timeline-nodes" id="timelineNodes"></div>
      </div>
    </div>

    <!-- Step Counter (e.g. Step 2 of 5) -->
    <div class="step-counter-text" id="stepCounterText">${initialStepCount}</div>
  </footer>

  <script nonce="${nonce}">
    window.onerror = function(msg, url, line, col, error) {
      console.error('Visualizer Webview Error:', msg, 'at line', line, 'col', col, error);
      const nc = document.getElementById('nodesContainer');
      if (nc) {
        nc.innerHTML = '<div style="color:#ef4444; background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:8px; padding:16px; margin:20px; font-family:monospace; font-size:12px;"><strong>Visualizer Error:</strong> ' + msg + ' (Line ' + line + ')</div>';
      }
    };

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
      const visibleSteps = (session.steps || []).filter(s => !s.isGroupCollapsed);
      const totalVisible = visibleSteps.length;
      let activeVisibleIndex = 0;

      session.steps.forEach((step, idx) => {
        if (step.isGroupCollapsed) return;

        const isCurrent = (idx === currentStepIndex);
        const isPassed = (idx < currentStepIndex);
        if (isCurrent || isPassed) {
          activeVisibleIndex++;
        }

        const dot = document.createElement('div');
        dot.className = 'timeline-dot' + (isCurrent ? ' active' : (isPassed ? ' passed' : ''));
        if (step.loopGroup) {
          dot.style.borderColor = '#6366f1';
          if (isCurrent) dot.style.boxShadow = '0 0 10px #6366f1';
        }
        dot.title = 'Step ' + (step.stepIndex + 1) + ': ' + step.statement;
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          setStep(idx);
        });
        timelineNodes.appendChild(dot);
      });

      const pct = totalVisible > 1 ? ((activeVisibleIndex - 1) / (totalVisible - 1)) * 100 : 0;
      timelineFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    }

    // Adaptive Canvas Renderer
    function renderCanvas() {
      try {
        const step = session.steps && session.steps[currentStepIndex];
        if (!step) {
          liveStmt.textContent = 'Waiting for execution...';
          liveLine.textContent = '';
          stepCounterText.textContent = 'Step 0 of 0';
          backwardBtn.disabled = true;
          forwardBtn.disabled = true;
          structureTypePill.textContent = 'Waiting';
          renderEmptyCanvas('Waiting for program execution...');
          return;
        }

        // Update Live Indicator
        liveStmt.textContent = step.statement;
        liveLine.textContent = 'Line ' + step.line;

        // Update Navigation (excluding collapsed steps)
        const visibleSteps = (session.steps || []).filter(s => !s.isGroupCollapsed);
        const visibleTotal = visibleSteps.length;
        let visibleCurrent = 0;
        for (let i = 0; i <= currentStepIndex && i < session.steps.length; i++) {
          if (!session.steps[i].isGroupCollapsed) visibleCurrent++;
        }
        visibleCurrent = Math.max(1, visibleCurrent);

        stepCounterText.textContent = 'Step ' + visibleCurrent + ' of ' + visibleTotal;

        let hasPrev = false;
        for (let i = currentStepIndex - 1; i >= 0; i--) {
          if (!session.steps[i].isGroupCollapsed) { hasPrev = true; break; }
        }
        let hasNext = false;
        for (let i = currentStepIndex + 1; i < session.steps.length; i++) {
          if (!session.steps[i].isGroupCollapsed) { hasNext = true; break; }
        }
        backwardBtn.disabled = !hasPrev;
        forwardBtn.disabled = !hasNext;
        renderTimeline();

        // Render Visual Structures
        nodesContainer.innerHTML = '';
        if (step.loopGroup || step.belongsToGroupId || step.callStackFrames || step.functionFrame || step.buckets || step.activeLoop || step.activeLoops || step.inputRequest || step.conditionEvent || (step.arrayStructures && step.arrayStructures.length > 0)) {
          if (step.loopGroup) {
            structureTypePill.textContent = 'Grouped Loop (' + step.loopGroup.totalGroupedIterations + ' iterations)';
          } else if (step.belongsToGroupId) {
            structureTypePill.textContent = 'Expanded Iteration ' + (step.iterationIndex !== undefined ? '#' + step.iterationIndex : '');
          } else if (step.callStackFrames && step.callStackFrames.length > 0) {
            const topF = step.callStackFrames[step.callStackFrames.length - 1];
            structureTypePill.textContent = (step.callStackFrames.length > 1 ? 'Recursion: ' : 'Function: ') + topF.functionName + '() [Depth ' + step.callStackFrames.length + ']';
          } else if (step.functionFrame) {
            structureTypePill.textContent = 'Function: ' + step.functionFrame.functionName + '()';
          } else if (step.activeLoop || (step.activeLoops && step.activeLoops.length > 0)) {
            structureTypePill.textContent = 'Loop Visualization';
          } else if (step.conditionEvent) {
            structureTypePill.textContent = 'Condition Branch';
          } else if (step.arrayStructures && step.arrayStructures.length > 0) {
            structureTypePill.textContent = 'Array Memory';
          } else {
            structureTypePill.textContent = 'Variable State';
          }
          renderBucketsAndLoop(step);
        } else {
          const struct = (step.visualStructures && step.visualStructures[0]);
          if (struct) {
            structureTypePill.textContent = struct.title || struct.kind;
            renderRowStructure(struct);
          } else {
            structureTypePill.textContent = 'Execution Flow';
            renderEmptyCanvas('Waiting for program execution...');
          }
        }
      } catch (err) {
        console.error('Error during renderCanvas:', err);
      }
    }

    function renderBucketsAndLoop(step) {
      if (step.inputRequest && step.inputRequest.isWaiting) {
        if (isPlaying) {
          pausePlayback();
          vscode.postMessage({ type: 'pause' });
        }
      }

      const mainWrapper = document.createElement('div');
      mainWrapper.style.display = 'flex';
      mainWrapper.style.flexDirection = 'column';
      mainWrapper.style.alignItems = 'center';
      mainWrapper.style.gap = '20px';

      // 0. Adaptive Loop Group Card
      if (step.loopGroup) {
        const group = step.loopGroup;
        const groupCard = document.createElement('div');
        groupCard.className = 'loop-group-card';
        groupCard.innerHTML = \`
          <div class="loop-group-header">
            <div class="loop-group-badge">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              <span>\${group.loopType.toUpperCase()} LOOP</span>
            </div>
            <div class="loop-group-title">\${group.summaryText}</div>
            <button class="expand-group-btn" id="expandGroupBtn">
              \${group.isExpanded ? 'Collapse Group' : 'Expand Iterations (' + group.totalGroupedIterations + ')'}
            </button>
          </div>
          <div class="loop-group-body">
            <div class="loop-group-desc">\${step.explanation || 'Intermediate loop iterations grouped for clean visualization.'}</div>
            <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform:uppercase; margin-top:4px;">Variable State Changes:</div>
            <div class="group-deltas-grid">
              \${group.variableDeltas.map(d => \`
                <div class="group-delta-item">
                  <span class="delta-var-name">\${d.name}</span>
                  <span class="delta-start-val">\${d.startVal}</span>
                  <span class="delta-arrow">➔</span>
                  <span class="delta-end-val">\${d.endVal}</span>
                </div>
              \`).join('')}
            </div>
          </div>
        \`;

        const expandBtn = groupCard.querySelector('#expandGroupBtn');
        if (expandBtn) {
          expandBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            vscode.postMessage({ type: 'toggleGroupExpand', groupId: group.groupId });
          });
        }
        mainWrapper.appendChild(groupCard);
      }

      // Indicator pill for individual expanded iteration
      if (step.belongsToGroupId) {
        const iterPill = document.createElement('div');
        iterPill.className = 'expanded-iter-pill';
        iterPill.innerHTML = \`
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
          <span>Expanded Loop Iteration \${step.iterationIndex !== undefined ? '#' + step.iterationIndex : ''}</span>
        \`;
        mainWrapper.appendChild(iterPill);
      }

      // 1. Condition & Branching Banner
      if (step.conditionEvent) {
        const cond = step.conditionEvent;
        const banner = document.createElement('div');
        banner.className = 'cond-eval-banner ' + (cond.evaluatedResult ? 'is-true' : 'is-false');
        banner.innerHTML = \`
          <span class="cond-pill \${cond.evaluatedResult ? 'true' : 'false'}">\${cond.evaluatedResult ? 'TRUE' : 'FALSE'}</span>
          <span class="cond-text">\${cond.conditionText}</span>
          <span class="cond-action-text">➔ \${cond.explanation || (cond.evaluatedResult ? 'Executing branch' : 'Skipping branch')}</span>
        \`;
        mainWrapper.appendChild(banner);
      }

      // 1.5 C++ Class Blueprint & Object State
      if (step.classContainer) {
        const cls = step.classContainer;
        const classRoot = document.createElement('div');
        classRoot.className = 'class-container-root';

        // Access Violation Alert
        if (cls.accessViolation) {
          const v = cls.accessViolation;
          const alertEl = document.createElement('div');
          alertEl.className = 'access-violation-alert';
          alertEl.innerHTML = \`
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
            <div>
              <div class="violation-title">🚫 ACCESS VIOLATION / COMPILATION ERROR</div>
              <div>\${v.errorMessage}</div>
              <div style="font-size:11px; color:#fca5a5; margin-top:4px;">Attempted external access to <strong>'\${v.attemptedMember}'</strong> from <strong>'\${v.caller}'</strong> was blocked at the class boundary.</div>
            </div>
          \`;
          classRoot.appendChild(alertEl);
        }

        // Active Pathway Banner
        if (cls.activePathway) {
          const p = cls.activePathway;
          const bannerEl = document.createElement('div');
          bannerEl.className = 'pathway-flow-banner';
          let pathwayText = '';
          let iconText = '';
          if (p.type === 'external-to-public') {
            iconText = '➔ OPENING A';
            pathwayText = \`External Call: '\${p.toLabel}' enters through Opening A into the PUBLIC compartment.\`;
          } else if (p.type === 'public-to-private') {
            iconText = '▲ OPENING B';
            pathwayText = \`Internal Call: '\${p.fromLabel}()' calls private '\${p.toLabel}()' upwards through Divider Opening B into the PRIVATE compartment.\`;
          } else if (p.type === 'return-to-public') {
            iconText = '▼ OPENING B';
            pathwayText = \`Return Transition: '\${p.fromLabel}()' returns value back through Divider Opening B into PUBLIC compartment.\`;
          } else if (p.type === 'return-to-caller') {
            iconText = '⬅ OPENING A';
            pathwayText = \`Exit Transition: '\${p.fromLabel}' finishes, exiting through Opening A back to caller '\${p.toLabel}'.\`;
          } else if (p.type === 'child-to-parent') {
            iconText = '▲ INHERITANCE';
            pathwayText = \`Inheritance Dispatch: Call to '\${p.fromLabel}()' delegates along inheritance path up to '\${p.targetClass || 'Base'}::\${p.toLabel}()'.\`;
          } else if (p.type === 'parent-to-child') {
            iconText = '▼ PARENT TO CHILD';
            pathwayText = \`Inherited Execution: '\${p.fromLabel}' accessing object '\${cls.activeObjectName || 'instance'}' derived state.\`;
          } else if (p.type === 'return-to-child') {
            iconText = '▼ INHERITANCE RETURN';
            pathwayText = \`Inherited Method Finished: '\${p.fromLabel}()' returns along inheritance path back to derived class '\${p.toLabel}'.\`;
          }

          bannerEl.innerHTML = \`
            <span class="pathway-icon-pill">\${iconText}</span>
            <span>\${pathwayText}</span>
          \`;
          classRoot.appendChild(bannerEl);
        }

        const createClassBox = (view, isRootMultiView) => {
          const isCurrentClassActive = (cls.activePathway && cls.activePathway.targetClass === view.className) || (view.className === cls.className);
          const isGatewayBActive = isCurrentClassActive && cls.activePathway && (cls.activePathway.type === 'public-to-private' || cls.activePathway.type === 'return-to-public');
          const isEntranceAActive = isCurrentClassActive && cls.activePathway && (cls.activePathway.type === 'external-to-public' || cls.activePathway.type === 'return-to-caller');

          const boxEl = document.createElement('div');
          boxEl.className = 'class-blueprint-box' + (cls.accessViolation && (cls.accessViolation.caller === view.className || cls.className === view.className) ? ' is-violation' : '');
          if (isRootMultiView) {
            boxEl.style.minWidth = '320px';
            boxEl.style.maxWidth = '460px';
            boxEl.style.flex = '1 1 340px';
          }

          // Header Bar
          let instancesHtml = '';
          if (cls.objects && cls.objects.length > 0) {
            const applicableObjs = cls.objects.filter(o => o.className === view.className);
            if (applicableObjs.length > 0) {
              instancesHtml = \`
                <div class="class-instances-bar">
                  <span style="font-size:11px; color:#64748b; font-weight:700; font-family:var(--font-mono);">OBJECTS:</span>
                  \${applicableObjs.map(obj => \`
                    <span class="class-instance-chip \${obj.objectName === cls.activeObjectName ? 'is-active' : ''}">
                      <span style="width:6px; height:6px; border-radius:50%; background:\${obj.objectName === cls.activeObjectName ? '#38bdf8' : '#64748b'};"></span>
                      <span>\${obj.objectName}</span>
                      \${obj.objectName === cls.activeObjectName ? '<span style="font-size:9px; opacity:0.8;">(active)</span>' : ''}
                    </span>
                  \`).join('')}
                </div>
              \`;
            }
          }

          let roleBadgeHtml = '';
          if (view.isParent) {
            roleBadgeHtml += '<span class="class-role-badge parent">PARENT CLASS</span>';
          }
          if (view.isChild) {
            roleBadgeHtml += '<span class="class-role-badge child">CHILD CLASS</span>';
          }

          let modeBadgeHtml = '';
          if (view.highlightedCompartment === 'private') {
            modeBadgeHtml = '<span class="compartment-badge badge-private">● ACTIVE: PRIVATE</span>';
          } else if (view.highlightedCompartment === 'protected') {
            modeBadgeHtml = '<span class="compartment-badge badge-protected">● ACTIVE: PROTECTED</span>';
          } else if (view.highlightedCompartment === 'public') {
            modeBadgeHtml = '<span class="compartment-badge badge-public">● ACTIVE: PUBLIC</span>';
          } else {
            modeBadgeHtml = '<span style="color:#64748b; font-size:11px; font-family:var(--font-mono); font-weight:600;">ACCESS: IDLE</span>';
          }

          let baseClsChips = '';
          if (view.baseClasses && view.baseClasses.length > 0) {
            baseClsChips = \`
              <div style="font-size:11px; color:#94a3b8; font-family:var(--font-mono); margin-left:4px;">
                : \${view.baseClasses.map(b => \`<span style="color:#a78bfa; font-weight:700;">\${b.accessMode} \${b.baseClassName}</span>\`).join(', ')}
              </div>
            \`;
          }

          boxEl.innerHTML = \`
            <div class="class-header-bar">
              <div class="class-identity-badge">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                <span>CLASS: <strong>\${view.className}</strong></span>
                \${baseClsChips}
                \${roleBadgeHtml}
              </div>
              \${instancesHtml}
              <div>\${modeBadgeHtml}</div>
            </div>
          \`;

          // UPPER COMPARTMENT: PRIVATE
          const privEl = document.createElement('div');
          privEl.className = 'compartment-private' + (view.highlightedCompartment === 'private' ? ' is-active-compartment' : '');

          let privBucketsHtml = '';
          if (view.privateVariables && view.privateVariables.length > 0) {
            privBucketsHtml = \`
              <div style="display:flex; flex-direction:column; gap:6px;">
                <div class="member-funcs-title">Private Member Variables:</div>
                <div class="buckets-grid" style="padding:4px 0; justify-content:flex-start;">
                  \${view.privateVariables.map(b => {
                    const hasPrev = (b.previousValue !== undefined && b.previousValue !== b.value && b.previousValue !== '');
                    return \`
                      <div class="var-bucket \${b.isModified ? 'is-modified' : ''}">
                        <span class="bucket-name-tag">\${b.name}</span>
                        <div class="bucket-value-container">
                          \${hasPrev ? \`<div class="value-exit">\${b.previousValue}</div>\` : ''}
                          <div class="bucket-current-val \${b.isModified ? 'value-enter' : ''}">\${b.value}</div>
                        </div>
                      </div>
                    \`;
                  }).join('')}
                </div>
              </div>
            \`;
          }

          let privFuncsHtml = '';
          if (view.privateFunctions && view.privateFunctions.length > 0) {
            privFuncsHtml = \`
              <div class="member-funcs-section">
                <div class="member-funcs-title">Private Member Functions:</div>
                <div class="member-funcs-grid">
                  \${view.privateFunctions.map(f => \`
                    <div class="class-func-card \${f.name === view.highlightedMember ? 'is-active-func' : ''}">
                      <span class="func-access-pill private">private</span>
                      <span><strong>\${f.signature}</strong></span>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \`;
          }

          privEl.innerHTML = \`
            <div class="compartment-header">
              <div class="compartment-badge badge-private">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span>PRIVATE COMPARTMENT</span>
              </div>
              <span class="compartment-access-rule">🔒 Internal class access only (Direct external access forbidden)</span>
            </div>
            \${privBucketsHtml}
            \${privFuncsHtml}
          \`;
          boxEl.appendChild(privEl);

          // MIDDLE COMPARTMENT: PROTECTED (if any protected members exist in this class)
          if ((view.protectedVariables && view.protectedVariables.length > 0) || (view.protectedFunctions && view.protectedFunctions.length > 0)) {
            const protEl = document.createElement('div');
            protEl.className = 'compartment-protected' + (view.highlightedCompartment === 'protected' ? ' is-active-compartment' : '');

            let protBucketsHtml = '';
            if (view.protectedVariables && view.protectedVariables.length > 0) {
              protBucketsHtml = \`
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div class="member-funcs-title">Protected Member Variables:</div>
                  <div class="buckets-grid" style="padding:4px 0; justify-content:flex-start;">
                    \${view.protectedVariables.map(b => {
                      const hasPrev = (b.previousValue !== undefined && b.previousValue !== b.value && b.previousValue !== '');
                      return \`
                        <div class="var-bucket \${b.isModified ? 'is-modified' : ''}">
                          <span class="bucket-name-tag">\${b.name}</span>
                          <div class="bucket-value-container">
                            \${hasPrev ? \`<div class="value-exit">\${b.previousValue}</div>\` : ''}
                            <div class="bucket-current-val \${b.isModified ? 'value-enter' : ''}">\${b.value}</div>
                          </div>
                        </div>
                      \`;
                    }).join('')}
                  </div>
                </div>
              \`;
            }

            let protFuncsHtml = '';
            if (view.protectedFunctions && view.protectedFunctions.length > 0) {
              protFuncsHtml = \`
                <div class="member-funcs-section">
                  <div class="member-funcs-title">Protected Member Functions:</div>
                  <div class="member-funcs-grid">
                    \${view.protectedFunctions.map(f => \`
                      <div class="class-func-card \${f.name === view.highlightedMember ? 'is-active-func' : ''}">
                        <span class="func-access-pill protected">protected</span>
                        <span><strong>\${f.signature}</strong></span>
                      </div>
                    \`).join('')}
                  </div>
                </div>
              \`;
            }

            protEl.innerHTML = \`
              <div class="compartment-header">
                <div class="compartment-badge badge-protected">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  <span>PROTECTED COMPARTMENT</span>
                </div>
                <span class="compartment-access-rule">🛡️ Accessible by this class and derived classes only</span>
              </div>
              \${protBucketsHtml}
              \${protFuncsHtml}
            \`;
            boxEl.appendChild(protEl);
          }

          // DIVIDER WITH OPENING B
          const dividerEl = document.createElement('div');
          dividerEl.className = 'divider-opening-b-wrap';
          dividerEl.innerHTML = \`
            <div class="divider-left-line"></div>
            <div class="opening-b-gateway \${isGatewayBActive ? 'is-active-gateway' : ''}">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg>
              <span>OPENING B: Internal Divider Gateway</span>
            </div>
            <div class="divider-right-line"></div>
          \`;
          boxEl.appendChild(dividerEl);

          // LOWER COMPARTMENT: PUBLIC WITH OPENING A
          const pubWrap = document.createElement('div');
          pubWrap.className = 'compartment-public-wrap';

          // Opening A Notch on left wall
          const notchA = document.createElement('div');
          notchA.className = 'opening-a-notch' + (isEntranceAActive ? ' is-active-entrance' : '');
          notchA.innerHTML = \`
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
            <span>OPENING A (Public Entrance)</span>
          \`;
          pubWrap.appendChild(notchA);

          const pubEl = document.createElement('div');
          pubEl.className = 'compartment-public' + (view.highlightedCompartment === 'public' ? ' is-active-compartment' : '');

          let pubBucketsHtml = '';
          if (view.publicVariables && view.publicVariables.length > 0) {
            pubBucketsHtml = \`
              <div style="display:flex; flex-direction:column; gap:6px;">
                <div class="member-funcs-title">Public Member Variables:</div>
                <div class="buckets-grid" style="padding:4px 0; justify-content:flex-start;">
                  \${view.publicVariables.map(b => {
                    const hasPrev = (b.previousValue !== undefined && b.previousValue !== b.value && b.previousValue !== '');
                    return \`
                      <div class="var-bucket \${b.isModified ? 'is-modified' : ''}">
                        <span class="bucket-name-tag">\${b.name}</span>
                        <div class="bucket-value-container">
                          \${hasPrev ? \`<div class="value-exit">\${b.previousValue}</div>\` : ''}
                          <div class="bucket-current-val \${b.isModified ? 'value-enter' : ''}">\${b.value}</div>
                        </div>
                      </div>
                    \`;
                  }).join('')}
                </div>
              </div>
            \`;
          }

          let pubFuncsHtml = '';
          if (view.publicFunctions && view.publicFunctions.length > 0) {
            pubFuncsHtml = \`
              <div class="member-funcs-section">
                <div class="member-funcs-title">Public Member Functions:</div>
                <div class="member-funcs-grid">
                  \${view.publicFunctions.map(f => \`
                    <div class="class-func-card \${f.name === view.highlightedMember ? 'is-active-func' : ''}">
                      <span class="func-access-pill public">public</span>
                      <span><strong>\${f.signature}</strong></span>
                    </div>
                  \`).join('')}
                </div>
              </div>
            \`;
          }

          pubEl.innerHTML = \`
            <div class="compartment-header">
              <div class="compartment-badge badge-public">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
                <span>PUBLIC COMPARTMENT</span>
              </div>
              <span class="compartment-access-rule">🔓 External calls enter via Opening A</span>
            </div>
            \${pubBucketsHtml}
            \${pubFuncsHtml}
          \`;
          pubWrap.appendChild(pubEl);
          boxEl.appendChild(pubWrap);

          // INHERITED MEMBERS SECTION (if any inherited members)
          if (view.inheritedMembers && view.inheritedMembers.length > 0) {
            const inhEl = document.createElement('div');
            inhEl.className = 'inherited-members-section';

            const inhVars = view.inheritedMembers.filter(m => m.kind === 'variable');
            const inhFuncs = view.inheritedMembers.filter(m => m.kind === 'function');

            let inhVarsHtml = '';
            if (inhVars.length > 0) {
              inhVarsHtml = \`
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div class="member-funcs-title">Inherited Member Variables:</div>
                  <div class="buckets-grid" style="padding:4px 0; justify-content:flex-start;">
                    \${inhVars.map(iv => {
                      const hasPrev = (iv.previousValue !== undefined && iv.previousValue !== iv.value && iv.previousValue !== '');
                      return \`
                        <div class="var-bucket \${iv.isModified ? 'is-modified' : ''}">
                          <div style="display:flex; align-items:center; justify-content:center; gap:2px;">
                            <span class="bucket-name-tag">\${iv.name}</span>
                            <span class="origin-tag">from \${iv.originalClassName}</span>
                          </div>
                          <div class="bucket-value-container">
                            \${hasPrev ? \`<div class="value-exit">\${iv.previousValue}</div>\` : ''}
                            <div class="bucket-current-val \${iv.isModified ? 'value-enter' : ''}">\${iv.value ?? '0'}</div>
                          </div>
                          <div style="font-size:9px; color:#94a3b8; font-family:var(--font-mono); margin-top:2px;">effective: \${iv.effectiveAccess}</div>
                        </div>
                      \`;
                    }).join('')}
                  </div>
                </div>
              \`;
            }

            let inhFuncsHtml = '';
            if (inhFuncs.length > 0) {
              inhFuncsHtml = \`
                <div class="member-funcs-section">
                  <div class="member-funcs-title">Inherited Member Functions:</div>
                  <div class="member-funcs-grid">
                    \${inhFuncs.map(ifn => \`
                      <div class="class-func-card \${ifn.isActive ? 'is-active-func' : ''}">
                        <span class="func-access-pill \${ifn.effectiveAccess}">\${ifn.effectiveAccess}</span>
                        <span><strong>\${ifn.signature}</strong></span>
                        <span class="origin-tag">from \${ifn.originalClassName}</span>
                      </div>
                    \`).join('')}
                  </div>
                </div>
              \`;
            }

            inhEl.innerHTML = \`
              <div class="inherited-members-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline></svg>
                <span>INHERITED MEMBERS (From Ancestor Classes)</span>
              </div>
              \${inhVarsHtml}
              \${inhFuncsHtml}
            \`;
            boxEl.appendChild(inhEl);
          }

          return boxEl;
        };

        if (cls.classes && cls.classes.length > 1) {
          const hierarchyView = document.createElement('div');
          hierarchyView.className = 'inheritance-hierarchy-view';

          // Group classes by hierarchy tier (Tier 0 = root parents at top, Tier 1 = derived, Tier 2 = grandchildren)
          const tierMap = new Map();
          cls.classes.forEach(c => {
            const tier = c.hierarchyTier || 0;
            if (!tierMap.has(tier)) tierMap.set(tier, []);
            tierMap.get(tier).push(c);
          });

          const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);

          sortedTiers.forEach((tier, tIdx) => {
            // Render connector arrow pointing from child (lower tier) to parent (upper tier)
            if (tIdx > 0) {
              const rels = cls.inheritanceRelationships || [];
              const connectorEl = document.createElement('div');
              connectorEl.className = 'inheritance-connector-block';

              const activeRel = rels.find(r => r.isActive);
              const isConnectorActive = Boolean(activeRel) || Boolean(cls.activePathway && (cls.activePathway.type === 'child-to-parent' || cls.activePathway.type === 'return-to-child'));

              const relLabel = activeRel
                ? \`▲ INHERITS FROM: \${activeRel.childClassName} ➔ \${activeRel.parentClassName} (\${activeRel.accessMode}) ▲\`
                : (rels.length > 0 ? \`▲ INHERITANCE: \${rels.map(r => \`\${r.childClassName} : \${r.accessMode} \${r.parentClassName}\`).join(', ')} ▲\` : '▲ INHERITS FROM BASE CLASS ▲');

              connectorEl.innerHTML = \`
                <div class="inheritance-arrow-badge \${isConnectorActive ? 'is-active-connector' : ''}">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                  <span>\${relLabel}</span>
                </div>
              \`;
              hierarchyView.appendChild(connectorEl);
            }

            const tierRow = document.createElement('div');
            tierRow.className = 'hierarchy-tier-row';
            const tierClasses = tierMap.get(tier);
            tierClasses.forEach(cView => {
              tierRow.appendChild(createClassBox(cView, true));
            });
            hierarchyView.appendChild(tierRow);
          });

          classRoot.appendChild(hierarchyView);
        } else {
          // Single class fallback
          const defaultView = (cls.classes && cls.classes[0]) || {
            className: cls.className,
            privateVariables: cls.privateVariables,
            protectedVariables: cls.protectedVariables || [],
            publicVariables: cls.publicVariables,
            privateFunctions: cls.privateFunctions,
            protectedFunctions: cls.protectedFunctions || [],
            publicFunctions: cls.publicFunctions,
            inheritedMembers: cls.inheritedMembers,
            highlightedCompartment: cls.highlightedCompartment,
            highlightedMember: cls.highlightedMember
          };
          classRoot.appendChild(createClassBox(defaultView, false));
        }
        mainWrapper.appendChild(classRoot);
      }

      // 2. Recursive Call Stack & Function Frames
      if (step.callStackFrames && step.callStackFrames.length > 0) {
        const frames = step.callStackFrames;
        const stackWrapper = document.createElement('div');
        stackWrapper.className = 'call-stack-container';

        // Stack Header with Breadcrumb Trail
        const stackHeader = document.createElement('div');
        stackHeader.className = 'call-stack-header';
        stackHeader.innerHTML = \`
          <div class="call-stack-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            <span>RECURSIVE CALL STACK (Depth \${frames.length})</span>
          </div>
          <div class="stack-breadcrumb-row">
            \${frames.map((f, i) => \`
              <span class="stack-crumb \${i === frames.length - 1 ? 'is-active' : ''}">\${f.callSignature}</span>
              \${i < frames.length - 1 ? '<span class="crumb-arrow">➔</span>' : ''}
            \`).join('')}
          </div>
        \`;
        stackWrapper.appendChild(stackHeader);

        const framesList = document.createElement('div');
        framesList.className = 'call-stack-frames-list';

        // Render frames from top (innermost/active) to bottom (caller)
        frames.slice().reverse().forEach((frame, rIdx) => {
          const frameCard = document.createElement('div');
          let stateClass = 'is-active-frame';
          if (frame.state === 'waiting') stateClass = 'is-waiting';
          else if (frame.state === 'returning') stateClass = 'is-returning-frame';

          frameCard.className = \`func-frame-card \${stateClass}\`;

          let stateBadgeHtml = '';
          if (frame.state === 'active') {
            stateBadgeHtml = '<span class="frame-state-badge is-active">● ACTIVE</span>';
          } else if (frame.state === 'waiting') {
            stateBadgeHtml = \`<span class="frame-state-badge is-waiting">⏳ WAITING for \${frame.waitingForCallSignature || 'child call'}</span>\`;
          } else if (frame.state === 'returning') {
            stateBadgeHtml = '<span class="frame-state-badge is-returning">✓ RETURNING</span>';
          }

          frameCard.innerHTML = \`
            <div class="func-header">
              <div class="func-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                <span>Frame: <strong>\${frame.callSignature}</strong></span>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                \${stateBadgeHtml}
                <span class="func-depth-badge">Depth \${frame.callDepth}</span>
              </div>
            </div>

            \${frame.calculationDetails ? \`
              <div class="func-calc-banner">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>
                <span>\${frame.calculationDetails}</span>
              </div>
            \` : ''}

            \${frame.returnValue !== undefined && frame.state === 'returning' ? \`
              <div class="func-return-banner">
                <span>✓ Return Value:</span>
                <strong>\${frame.returnValue}</strong>
                <span style="font-size:11px; font-weight:normal; color:#a7f3d0; margin-left:6px;">➔ to \${frame.callerFunctionName || 'caller'}</span>
              </div>
            \` : ''}

            <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform: uppercase; letter-spacing: 0.5px;">Parameters:</div>
            <div class="buckets-grid" style="padding: 4px 0;">
              \${frame.parameters.map(p => \`
                <div class="var-bucket is-modified">
                  <span class="bucket-name-tag">\${p.name}</span>
                  <div class="bucket-value-container">
                    <div class="bucket-current-val value-enter">\${p.value}</div>
                  </div>
                </div>
              \`).join('')}
            </div>

            \${frame.localVariables && frame.localVariables.length > 0 ? \`
              <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform: uppercase; letter-spacing: 0.5px; margin-top:6px;">Local Variables:</div>
              <div class="buckets-grid" style="padding: 4px 0;">
                \${frame.localVariables.map(l => \`
                  <div class="var-bucket \${l.isModified ? 'is-modified' : ''}">
                    <span class="bucket-name-tag">\${l.name}</span>
                    <div class="bucket-value-container">
                      <div class="bucket-current-val \${l.isModified ? 'value-enter' : ''}">\${l.value}</div>
                    </div>
                  </div>
                \`).join('')}
              </div>
            \` : ''}
          \`;

          framesList.appendChild(frameCard);

          if (rIdx < frames.length - 1) {
            const connector = document.createElement('div');
            connector.className = 'stack-connector-indicator';
            connector.innerHTML = '<span>▲ returns to caller</span>';
            framesList.appendChild(connector);
          }
        });

        stackWrapper.appendChild(framesList);
        mainWrapper.appendChild(stackWrapper);
      } else if (step.functionFrame) {
        const ff = step.functionFrame;
        const frameCard = document.createElement('div');
        frameCard.className = 'func-frame-card is-active-frame';
        frameCard.innerHTML = \`
          <div class="func-header">
            <div class="func-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              <span>Function Frame: <strong>\${ff.callSignature}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="func-depth-badge">Call Depth \${ff.callDepth}</span>
            </div>
          </div>
          \${ff.calculationDetails ? \`
            <div class="func-calc-banner">
              <span>\${ff.calculationDetails}</span>
            </div>
          \` : ''}
          \${ff.returnValue !== undefined ? \`<div class="func-return-banner"><span>✓ Return Value:</span><strong>\${ff.returnValue}</strong></div>\` : ''}
          <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform: uppercase; letter-spacing: 0.5px;">Parameters:</div>
          <div class="buckets-grid" style="padding: 10px 0;">
            \${ff.parameters.map(p => \`
              <div class="var-bucket is-modified">
                <span class="bucket-name-tag">\${p.name}</span>
                <div class="bucket-value-container">
                  <div class="bucket-current-val value-enter">\${p.value}</div>
                </div>
              </div>
            \`).join('')}
          </div>
          \${ff.localVariables && ff.localVariables.length > 0 ? \`
            <div style="font-size:11px; color:#94a3b8; font-weight:600; text-transform: uppercase; letter-spacing: 0.5px; margin-top:6px;">Local Variables:</div>
            <div class="buckets-grid" style="padding: 4px 0;">
              \${ff.localVariables.map(l => \`
                <div class="var-bucket \${l.isModified ? 'is-modified' : ''}">
                  <span class="bucket-name-tag">\${l.name}</span>
                  <div class="bucket-value-container">
                    <div class="bucket-current-val \${l.isModified ? 'value-enter' : ''}">\${l.value}</div>
                  </div>
                </div>
              \`).join('')}
            </div>
          \` : ''}
        \`;
        mainWrapper.appendChild(frameCard);
      }

      // 3. Array Memory Structures
      if (step.arrayStructures && step.arrayStructures.length > 0) {
        step.arrayStructures.forEach(arr => {
          const arrEl = document.createElement('div');
          arrEl.className = 'array-container';
          arrEl.innerHTML = \`
            <div class="array-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
              <span>Array: <strong>\${arr.name} [\${arr.cells.length}]</strong></span>
            </div>
            <div class="array-cells-row">
              \${arr.cells.map(c => \`
                <div class="array-cell \${c.isModified ? 'is-modified' : ''}">
                  <span class="cell-index">[\${c.index}]</span>
                  <span class="cell-value \${c.isModified ? 'value-enter' : ''}">\${c.value}</span>
                </div>
              \`).join('')}
            </div>
          \`;
          mainWrapper.appendChild(arrEl);
        });
      }

      // 4. Dedicated Loop Containers (supports nested loops!)
      const loopsToRender = (step.activeLoops && step.activeLoops.length > 0)
        ? step.activeLoops
        : (step.activeLoop ? [step.activeLoop] : []);

      loopsToRender.forEach((loop, lIdx) => {
        const loopEl = document.createElement('div');
        loopEl.className = 'loop-container is-active-loop';
        if (loop.depth && loop.depth > 1) {
          loopEl.style.marginLeft = (loop.depth - 1) * 24 + 'px';
          loopEl.style.borderColor = '#818cf8';
        }

        const trackSvg = \`
          <svg class="loop-cycle-track" viewBox="0 0 60 120">
            <path class="cycle-path" d="M 10 10 C 50 10, 50 110, 10 110" />
            <polyline points="15,105 10,110 15,115" stroke="#38bdf8" stroke-width="2.5" fill="none" />
          </svg>
        \`;

        let phaseLabel = loop.phase.toUpperCase();
        if (loop.phase === 'condition') {
          phaseLabel = \`Condition: \${loop.conditionText} (\${loop.conditionPassed ? 'true' : 'false'})\`;
        } else if (loop.phase === 'update') {
          phaseLabel = \`Update: \${loop.variableName}++\`;
        } else if (loop.phase === 'init') {
          phaseLabel = \`Init: \${loop.variableName} = \${loop.currentValue}\`;
        } else if (loop.phase === 'exit') {
          phaseLabel = 'Loop Finished (Exit)';
        }

        let historyChipsHtml = '';
        if (loop.previousValues && loop.previousValues.length > 0) {
          historyChipsHtml = loop.previousValues.map(v => \`<span class="history-chip">\${v}</span>\`).join('<span class="history-arrow">➔</span>');
        } else {
          historyChipsHtml = '<span style="color:#64748b; font-size:11px;">(none yet)</span>';
        }

        const isWaitingLoopVar = step.inputRequest && step.inputRequest.isWaiting && step.inputRequest.variableName === loop.variableName;

        loopEl.innerHTML = \`
          \${trackSvg}
          <div class="loop-header">
            <div class="loop-title">
              <span class="loop-badge">\${loop.loopType.toUpperCase()} LOOP \${loop.depth && loop.depth > 1 ? '(INNER)' : ''}</span>
              <span>\${loop.headerText}</span>
            </div>
            <div class="loop-phase-pill">
              <span>●</span>
              <span>\${phaseLabel}</span>
            </div>
          </div>

          <div style="display:flex; align-items:center; justify-content:center; gap:30px; padding: 10px 0;">
            <div class="var-bucket \${loop.phase === 'update' ? 'is-modified' : ''} \${isWaitingLoopVar ? 'is-waiting-input' : ''}">
              <span class="bucket-name-tag">\${loop.variableName}</span>
              <div class="bucket-value-container">
                <div class="bucket-current-val \${loop.phase === 'update' ? 'value-enter' : ''}">\${isWaitingLoopVar && !loop.currentValue ? 'awaiting input...' : loop.currentValue}</div>
              </div>
            </div>
          </div>

          <div class="loop-history-section">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="history-label">Previous values:</span>
              <div class="history-chips-row">\${historyChipsHtml}</div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="history-label">Current:</span>
              <span class="history-current-chip">\${loop.currentValue}</span>
            </div>
          </div>
        \`;

        mainWrapper.appendChild(loopEl);
      });

      // 5. Variable Buckets (outside loop or all global/local variables)
      const buckets = step.buckets || [];
      const loopVarNames = loopsToRender.map(l => l.variableName);
      let nonLoopBuckets = buckets.filter(b => !loopVarNames.includes(b.name) && !b.isOutOfScope);
      if (step.classContainer) {
        // Exclude class member variables and object names from generic outer buckets
        const clsVarNames = new Set([
          ...step.classContainer.privateVariables.map(v => v.name),
          ...step.classContainer.publicVariables.map(v => v.name),
          ...step.classContainer.objects.map(o => o.objectName)
        ]);
        nonLoopBuckets = nonLoopBuckets.filter(b => !clsVarNames.has(b.name));
      }

      if (nonLoopBuckets.length > 0) {
        const grid = document.createElement('div');
        grid.className = 'buckets-grid';

        nonLoopBuckets.forEach(b => {
          const isWaitingThisInput = step.inputRequest && step.inputRequest.isWaiting && step.inputRequest.variableName === b.name;
          const bucketEl = document.createElement('div');
          bucketEl.className = 'var-bucket' 
            + (b.isModified ? ' is-modified' : '') 
            + (isWaitingThisInput ? ' is-waiting-input' : '');

          let valHtml = '';
          if (b.isEmpty || !b.value) {
            valHtml = \`<div class="bucket-empty-placeholder">\${isWaitingThisInput ? 'awaiting input...' : 'empty'}</div>\`;
          } else {
            const hasPrev = (b.previousValue !== undefined && b.previousValue !== b.value && b.previousValue !== '');
            valHtml = \`
              \${hasPrev ? \`<div class="value-exit">\${b.previousValue}</div>\` : ''}
              <div class="bucket-current-val \${b.isModified ? 'value-enter' : ''}">\${b.value}</div>
            \`;
          }

          bucketEl.innerHTML = \`
            <span class="bucket-name-tag">\${b.name}</span>
            <div class="bucket-value-container">
              \${valHtml}
            </div>
            \${b.pointsTo ? \`<span class="ptr-tag">➔ &\${b.pointsTo}</span>\` : ''}
          \`;
          grid.appendChild(bucketEl);
        });

        mainWrapper.appendChild(grid);
      }

      // 3. User Input (cin) Notification Badge (points to native VS Code terminal)
      if (step.inputRequest && step.inputRequest.isWaiting) {
        const terminalBadge = document.createElement('div');
        terminalBadge.className = 'terminal-waiting-badge';
        terminalBadge.innerHTML = \`
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="4 17 10 11 4 5"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
          <span>Waiting for terminal input for <strong>cin &gt;&gt; \${step.inputRequest.variableName}</strong> in VS Code Integrated Terminal</span>
        \`;
        mainWrapper.appendChild(terminalBadge);
      }

      nodesContainer.appendChild(mainWrapper);
    }

    function renderEmptyCanvas(msg) {
      nodesContainer.innerHTML = \`
        <div class="empty-canvas-container">
          <svg class="empty-canvas-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <div class="empty-canvas-msg">\${msg || 'Waiting for program execution...'}</div>
        </div>
      \`;
    }

    function renderRowStructure(struct) {
      const blocks = struct.blocks || [];
      const connections = struct.connections || [];
      const pointers = struct.pointers || [];
      const callout = struct.callout;

      // Empty state (e.g. head = NULL before allocations occur)
      if (blocks.length === 0) {
        if (struct.kind === 'linked-list' || (callout && callout.text && callout.text.includes('NULL'))) {
          const wrapper = document.createElement('div');
          wrapper.className = 'empty-ll-card';
          wrapper.innerHTML = \`
            <div class="empty-pointer-badge">HEAD</div>
            <div class="arrow-connection">
              <div class="arrow-line"></div>
              <div class="arrow-head"></div>
            </div>
            <div class="empty-null-badge">NULL</div>
            \${callout && callout.text ? \`<span style="font-size: 12px; color: #94a3b8; margin-left: 8px;">(\${callout.text})</span>\` : ''}
          \`;
          nodesContainer.appendChild(wrapper);
        } else {
          renderEmptyCanvas(callout && callout.text ? callout.text : 'Waiting for program execution...');
        }
        return;
      }

      const row = document.createElement('div');
      row.className = 'flow-row';

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
      renderCanvas();
      vscode.postMessage({ type: 'stepChange', stepIndex: currentStepIndex });
    }

    backwardBtn.addEventListener('click', () => {
      pausePlayback();
      for (let i = currentStepIndex - 1; i >= 0; i--) {
        if (!session.steps[i].isGroupCollapsed) {
          setStep(i);
          break;
        }
      }
    });

    forwardBtn.addEventListener('click', () => {
      pausePlayback();
      for (let i = currentStepIndex + 1; i < session.steps.length; i++) {
        if (!session.steps[i].isGroupCollapsed) {
          setStep(i);
          break;
        }
      }
    });

    timelineBar.addEventListener('click', (e) => {
      pausePlayback();
      const rect = timelineBar.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, clickX / rect.width));
      const visibleSteps = (session.steps || []).filter(s => !s.isGroupCollapsed);
      if (visibleSteps.length === 0) return;
      const targetVisibleIdx = Math.round(ratio * (visibleSteps.length - 1));
      const targetStep = visibleSteps[targetVisibleIdx];
      if (targetStep) {
        setStep(targetStep.stepIndex);
      }
    });

    playBtn.addEventListener('click', () => {
      if (isPlaying) {
        pausePlayback();
        vscode.postMessage({ type: 'pause' });
      } else {
        if (currentStepIndex >= session.steps.length - 1) {
          currentStepIndex = 0;
          renderCanvas();
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
          renderCanvas();
          if (currentStepIndex >= session.steps.length - 1 && isPlaying) {
            pausePlayback();
          }
          break;
        case 'init':
          session = msg.session;
          currentStepIndex = session.currentStepIndex || 0;
          renderCanvas();
          break;
        case 'appendStep':
          session.steps.push(msg.step);
          session.steps.forEach(s => s.totalSteps = session.steps.length);
          currentStepIndex = session.steps.length - 1;
          renderCanvas();
          break;
        case 'groupToggled':
          (session.steps || []).forEach(s => {
            if (s.loopGroup && s.loopGroup.groupId === msg.groupId) {
              s.loopGroup.isExpanded = msg.isExpanded;
            }
            if (s.belongsToGroupId === msg.groupId) {
              s.isGroupCollapsed = !msg.isExpanded;
            }
          });
          renderCanvas();
          break;
      }
    });

    try {
      renderCanvas();
      vscode.postMessage({ type: 'ready' });
    } catch (e) {
      console.error('Fatal visualizer init error:', e);
      if (liveStmt) liveStmt.textContent = 'Active (Ready)';
      if (nodesContainer) {
        nodesContainer.innerHTML = '<div style="color:#38bdf8; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.3); border-radius:8px; padding:16px; margin:20px; font-family:monospace; font-size:12px;">Visualizer active. Use navigation controls or Play to inspect execution.</div>';
      }
      try { vscode.postMessage({ type: 'ready' }); } catch (_) {}
    }
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
