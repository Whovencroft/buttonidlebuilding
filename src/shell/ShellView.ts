import type { AppState } from '../core/state/AppState';
import { TopBarView, resolveTopBarBindings } from './TopBar';
import { createDefaultTabsView, type TabsView } from './Tabs';
import { OverlayLayer } from './OverlayLayer';

export interface StatusBarBindings {
  messageBar: HTMLElement;
  autosaveStatus?: HTMLElement | null;
  clockStatus?: HTMLElement | null;
  versionStatus?: HTMLElement | null;
}

export function resolveStatusBarBindings(root: ParentNode = document): StatusBarBindings | null {
  const messageBar = root.getElementById?.('messageBar') ?? document.getElementById('messageBar');
  if (!(messageBar instanceof HTMLElement)) {
    return null;
  }

  return {
    messageBar,
    autosaveStatus: document.getElementById('autosaveStatus'),
    clockStatus: document.getElementById('clockStatus'),
    versionStatus: document.getElementById('versionStatus')
  };
}

export class ShellView {
  private readonly topBar: TopBarView | null;
  private readonly tabs: TabsView | null;
  private readonly overlay: OverlayLayer;
  private readonly statusBar: StatusBarBindings | null;

  public constructor() {
    const topBarBindings = resolveTopBarBindings();
    this.topBar = topBarBindings ? new TopBarView(topBarBindings) : null;
    this.tabs = createDefaultTabsView();
    this.overlay = new OverlayLayer();
    this.statusBar = resolveStatusBarBindings();
  }

  public render(state: AppState): void {
    this.topBar?.render(state);
    this.tabs?.render(state);

    if (this.statusBar) {
      this.statusBar.messageBar.textContent =
        state.app.activeScene === 'marble'
          ? 'The marble scene is active.'
          : 'You could stop anytime. The button disagrees.';

      if (this.statusBar.clockStatus) {
        this.statusBar.clockStatus.textContent = `Tick: ${new Date().toLocaleTimeString()}`;
      }

      if (this.statusBar.versionStatus) {
        this.statusBar.versionStatus.textContent = 'Framework vNext';
      }
    }

    document.documentElement.dataset.activeScene = state.app.activeScene;
  }

  public setAutosaveStatus(message: string): void {
    if (this.statusBar?.autosaveStatus) {
      this.statusBar.autosaveStatus.textContent = message;
    }
  }

  public showOverlay(title: string, body: string): void {
    this.overlay.show({ title, body });
  }

  public hideOverlay(): void {
    this.overlay.hide();
  }

  public destroy(): void {
    this.overlay.destroy();
  }
}
