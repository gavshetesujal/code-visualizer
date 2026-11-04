import { ExecutionStep } from '../types';

export class ExecutionHistory {
  private steps: ExecutionStep[];
  private currentIndex: number;
  private playbackTimer: NodeJS.Timeout | null = null;
  private playbackSpeed: number = 1.0;
  private onStepChanged?: (step: ExecutionStep) => void;

  constructor(steps: ExecutionStep[], initialIndex = 0) {
    this.steps = steps;
    this.currentIndex = Math.max(0, Math.min(initialIndex, steps.length - 1));
  }

  public setOnStepChangedListener(listener: (step: ExecutionStep) => void) {
    this.onStepChanged = listener;
  }

  public getCurrentStep(): ExecutionStep {
    return this.steps[this.currentIndex];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getTotalSteps(): number {
    return this.steps.length;
  }

  public canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  public canGoForward(): boolean {
    return this.currentIndex < this.steps.length - 1;
  }

  public previous(): ExecutionStep | null {
    if (!this.canGoBack()) {
      return null;
    }
    this.currentIndex--;
    const step = this.getCurrentStep();
    this.notify();
    return step;
  }

  public next(): ExecutionStep | null {
    if (!this.canGoForward()) {
      this.pause();
      return null;
    }
    this.currentIndex++;
    const step = this.getCurrentStep();
    this.notify();
    return step;
  }

  public goTo(index: number): ExecutionStep {
    const target = Math.max(0, Math.min(index, this.steps.length - 1));
    this.currentIndex = target;
    const step = this.getCurrentStep();
    this.notify();
    return step;
  }

  public restart(): ExecutionStep {
    this.pause();
    this.currentIndex = 0;
    const step = this.getCurrentStep();
    this.notify();
    return step;
  }

  public play() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
    }

    if (!this.canGoForward()) {
      this.currentIndex = 0;
      this.notify();
    }

    const intervalMs = Math.round(1000 / this.playbackSpeed);
    this.playbackTimer = setInterval(() => {
      if (this.canGoForward()) {
        this.next();
      } else {
        this.pause();
      }
    }, intervalMs);
  }

  public pause() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }
  }

  public isPlaying(): boolean {
    return this.playbackTimer !== null;
  }

  public setSpeed(speed: number) {
    this.playbackSpeed = Math.max(0.25, Math.min(speed, 5.0));
    if (this.isPlaying()) {
      this.play();
    }
  }

  public getSpeed(): number {
    return this.playbackSpeed;
  }

  public dispose() {
    this.pause();
  }

  private notify() {
    if (this.onStepChanged) {
      this.onStepChanged(this.getCurrentStep());
    }
  }
}

