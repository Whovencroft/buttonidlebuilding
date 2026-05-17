import type { AppState } from '../core/state/AppState';

export interface TabDefinition {
  id: string;
  label: string;
  panelSelector?: string;
}

export interface TabsViewOptions {
  root: HTMLElement;
  tabs: TabDefinition[];
  onTabSelected?: (tabId: string) => void;
}

export class TabsView {
  private activeTabId: string;

  public constructor(private readonly options: TabsViewOptions) {
    this.activeTabId = this.options.tabs[0]?.id ?? 'play';
  }

  public render(_state?: AppState): void {
    this.options.root.innerHTML = this.options.tabs
      .map((tab) => {
        const active = tab.id === this.activeTabId;
        return `<button class="tab-btn ${active ? 'active' : ''}" data-tab-target="${tab.id}">${tab.label}</button>`;
      })
      .join('');

    for (const button of this.options.root.querySelectorAll<HTMLButtonElement>('[data-tab-target]')) {
      button.addEventListener('click', () => {
        this.setActiveTab(button.dataset.tabTarget ?? this.activeTabId);
      });
    }

    this.syncPanels();
  }

  public setActiveTab(tabId: string): void {
    this.activeTabId = tabId;
    this.render();
    this.options.onTabSelected?.(tabId);
  }

  public getActiveTab(): string {
    return this.activeTabId;
  }

  private syncPanels(): void {
    const allPanels = document.querySelectorAll<HTMLElement>('.tab-panel');
    for (const panel of allPanels) {
      panel.classList.toggle('active', panel.dataset.tab === this.activeTabId);
    }
  }
}

export function resolveDefaultTabsRoot(): HTMLElement | null {
  const root = document.getElementById('tabs');
  return root instanceof HTMLElement ? root : null;
}

export function createDefaultTabsView(onTabSelected?: (tabId: string) => void): TabsView | null {
  const root = resolveDefaultTabsRoot();
  if (!root) return null;

  return new TabsView({
    root,
    tabs: [
      { id: 'play', label: 'Game' },
      { id: 'rules', label: 'Rules' },
      { id: 'layers', label: 'Layers' },
      { id: 'save', label: 'Save / Config' }
    ],
    onTabSelected
  });
}
