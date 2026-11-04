import { ExecutionStep } from '../types';

export class ExecutionHistory {
  private steps: ExecutionStep[];
  private currentIndex: number;
  private playbackTimer: NodeJS.Timeout | null = null;
  private playbackSpeed: number = 1.0;
  private onStepChanged?: (step: ExecutionStep) => void;
  private expandedGroups: Set<string> = new Set<string>();

  constructor(steps: ExecutionStep[], initialIndex = 0) {
    this.steps = steps;
    // Initialize any explicitly expanded groups from steps
    this.steps.forEach(s => {
      if (s.loopGroup && s.loopGroup.isExpanded) {
        this.expandedGroups.add(s.loopGroup.groupId);
      }
    });

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

  /**
   * Checks whether a step is visible given current group expansion state
   */
  public isStepVisible(step: ExecutionStep): boolean {
    if (!step) return false;
    if (step.belongsToGroupId) {
      return this.expandedGroups.has(step.belongsToGroupId);
    }
    return true;
  }

  public getVisibleSteps(): ExecutionStep[] {
    return this.steps.filter(s => this.isStepVisible(s));
  }

  public getTotalVisibleSteps(): number {
    return this.getVisibleSteps().length;
  }

  public getVisibleIndex(absoluteIndex: number): number {
    let count = 0;
    for (let i = 0; i <= absoluteIndex && i < this.steps.length; i++) {
      if (this.isStepVisible(this.steps[i])) {
        count++;
      }
    }
    return Math.max(1, count);
  }

  public canGoBack(): boolean {
    for (let i = this.currentIndex - 1; i >= 0; i--) {
      if (this.isStepVisible(this.steps[i])) {
        return true;
      }
    }
    return false;
  }

  public canGoForward(): boolean {
    for (let i = this.currentIndex + 1; i < this.steps.length; i++) {
      if (this.isStepVisible(this.steps[i])) {
        return true;
      }
    }
    return false;
  }

  public previous(): ExecutionStep | null {
    if (!this.canGoBack()) {
      return null;
    }
    let target = this.currentIndex - 1;
    while (target >= 0 && !this.isStepVisible(this.steps[target])) {
      target--;
    }
    if (target >= 0) {
      this.currentIndex = target;
      this.notify();
      return this.getCurrentStep();
    }
    return null;
  }

  public next(): ExecutionStep | null {
    if (!this.canGoForward()) {
      this.pause();
      return null;
    }
    let target = this.currentIndex + 1;
    while (target < this.steps.length && !this.isStepVisible(this.steps[target])) {
      target++;
    }
    if (target < this.steps.length) {
      this.currentIndex = target;
      this.notify();
      return this.getCurrentStep();
    }
    return null;
  }

  public goTo(index: number): ExecutionStep {
    const target = Math.max(0, Math.min(index, this.steps.length - 1));
    this.currentIndex = target;
    const step = this.getCurrentStep();
    this.notify();
    return step;
  }

  /**
   * Toggles expansion state of a loop group
   */
  public toggleGroup(groupId: string): boolean {
    if (this.expandedGroups.has(groupId)) {
      this.expandedGroups.delete(groupId);
    } else {
      this.expandedGroups.add(groupId);
    }

    const isExpanded = this.expandedGroups.has(groupId);
    this.steps.forEach(s => {
      if (s.loopGroup && s.loopGroup.groupId === groupId) {
        s.loopGroup.isExpanded = isExpanded;
      }
      if (s.belongsToGroupId === groupId) {
        s.isGroupCollapsed = !isExpanded;
      }
    });

    this.notify();
    return isExpanded;
  }

  public isGroupExpanded(groupId: string): boolean {
    return this.expandedGroups.has(groupId);
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
