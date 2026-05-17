import type { AppState } from '../core/state/AppState';

export interface TopBarElements {
  displayedPresses: HTMLElement;
  pps: HTMLElement;
  autonomyValue: HTMLElement;
  debtValue: HTMLElement;
  regretValue: HTMLElement;
  activeRulesValue?: HTMLElement | null;
  truePressesSub?: HTMLElement | null;
  autonomySub?: HTMLElement | null;
  debtSub?: HTMLElement | null;
  layerSummary?: HTMLElement | null;
  comboSummary?: HTMLElement | null;
}

export interface TopBarBindings {
  root: HTMLElement;
  elements: TopBarElements;
}

export function resolveTopBarBindings(root: ParentNode = document): TopBarBindings | null {
  const container = root.querySelector('.topbar');
  const displayedPresses = root.getElementById?.('displayedPresses') ?? document.getElementById('displayedPresses');
  const pps = root.getElementById?.('pps') ?? document.getElementById('pps');
  const autonomyValue = root.getElementById?.('autonomyValue') ?? document.getElementById('autonomyValue');
  const debtValue = root.getElementById?.('debtValue') ?? document.getElementById('debtValue');
  const regretValue = root.getElementById?.('regretValue') ?? document.getElementById('regretValue');

  if (
    !(container instanceof HTMLElement) ||
    !(displayedPresses instanceof HTMLElement) ||
    !(pps instanceof HTMLElement) ||
    !(autonomyValue instanceof HTMLElement) ||
    !(debtValue instanceof HTMLElement) ||
    !(regretValue instanceof HTMLElement)
  ) {
    return null;
  }

  return {
    root: container,
    elements: {
      displayedPresses,
      pps,
      autonomyValue,
      debtValue,
      regretValue,
      activeRulesValue: document.getElementById('activeRulesValue'),
      truePressesSub: document.getElementById('truePressesSub'),
      autonomySub: document.getElementById('autonomySub'),
      debtSub: document.getElementById('debtSub'),
      layerSummary: document.getElementById('layerSummary'),
      comboSummary: document.getElementById('comboSummary')
    }
  };
}

export class TopBarView {
  public constructor(private readonly bindings: TopBarBindings) {}

  public render(state: AppState): void {
    const { button_idle, marble } = state.scenes;
    const activeScene = state.app.activeScene;

    this.bindings.elements.displayedPresses.textContent = formatNumber(button_idle.totalPresses);
    this.bindings.elements.pps.textContent = activeScene === 'marble' ? 'Real-time scene' : '0';
    this.bindings.elements.autonomyValue.textContent = marble.unlocked ? 'Unlocked' : 'Locked';
    this.bindings.elements.debtValue.textContent = '0';
    this.bindings.elements.regretValue.textContent = '0';

    if (this.bindings.elements.activeRulesValue) {
      this.bindings.elements.activeRulesValue.textContent = activeScene === 'marble' ? '1 / 2' : '0 / 2';
    }

    if (this.bindings.elements.truePressesSub) {
      this.bindings.elements.truePressesSub.textContent = `Active scene: ${state.app.activeScene}`;
    }

    if (this.bindings.elements.autonomySub) {
      this.bindings.elements.autonomySub.textContent = marble.unlocked
        ? `Current level: ${marble.currentLevelId}`
        : 'Still dependent on you';
    }

    if (this.bindings.elements.debtSub) {
      this.bindings.elements.debtSub.textContent = 'Financially irresponsible mode locked';
    }

    if (this.bindings.elements.layerSummary) {
      this.bindings.elements.layerSummary.textContent = marble.clearedLevels.length
        ? `${marble.clearedLevels.length} marble levels cleared`
        : 'No layers yet';
    }

    if (this.bindings.elements.comboSummary) {
      this.bindings.elements.comboSummary.textContent = activeScene === 'marble'
        ? 'Marble runtime active'
        : 'No harmful innovations selected';
    }
  }

  public setHidden(hidden: boolean): void {
    this.bindings.root.hidden = hidden;
  }
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '∞';
  }

  if (Math.abs(value) >= 1_000_000) {
    return value.toExponential(2);
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(value);
}
