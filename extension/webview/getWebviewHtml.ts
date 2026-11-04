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

    /* FUNCTION CALL FRAME */
    .func-frame-card {
      background: rgba(13, 21, 39, 0.9);
      border: 2px solid #8b5cf6;
      border-radius: 18px;
      padding: 20px 26px;
      margin-bottom: 20px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(139, 92, 246, 0.25);
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-width: 480px;
    }

    .func-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 10px;
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

    .func-depth-badge {
      background: rgba(139, 92, 246, 0.2);
      border: 1px solid #8b5cf6;
      color: #c084fc;
      padding: 2px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
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
      <span class="structure-type-pill" id="structureTypePill">Canvas</span>
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
        <span style="color:#38bdf8; font-weight:600;" id="liveStmt">Connecting...</span>
        <span style="color:#94a3b8; margin-left:6px;" id="liveLine">Line 1</span>
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
    <div class="step-counter-text" id="stepCounterText">Step 1 of 1</div>
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

        // Update Navigation
        stepCounterText.textContent = 'Step ' + (currentStepIndex + 1) + ' of ' + session.steps.length;
        backwardBtn.disabled = (currentStepIndex === 0);
        forwardBtn.disabled = (currentStepIndex === session.steps.length - 1);
        renderTimeline();

        // Render Visual Structures
        nodesContainer.innerHTML = '';
        if (step.buckets || step.activeLoop || step.activeLoops || step.inputRequest || step.conditionEvent || step.functionFrame || (step.arrayStructures && step.arrayStructures.length > 0)) {
          if (step.functionFrame) {
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

      // 2. Function Call Frame
      if (step.functionFrame) {
        const ff = step.functionFrame;
        const frameCard = document.createElement('div');
        frameCard.className = 'func-frame-card';
        frameCard.innerHTML = \`
          <div class="func-header">
            <div class="func-title">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              <span>Function Frame: <strong>\${ff.callSignature}</strong></span>
            </div>
            <span class="func-depth-badge">Call Depth \${ff.callDepth}</span>
          </div>
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
      const nonLoopBuckets = buckets.filter(b => !loopVarNames.includes(b.name) && !b.isOutOfScope);

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
      }
    });

    renderCanvas();
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
