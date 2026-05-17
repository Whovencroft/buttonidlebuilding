import type { AppState } from '../core/state/AppState';
import type { SaveService } from '../core/state/SaveService';

export interface SavePanelBindings {
  saveBtn: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  importBtn: HTMLButtonElement;
  resetBtn: HTMLButtonElement;
  saveField: HTMLTextAreaElement;
  saveStatus: HTMLElement;
}

export function resolveSavePanelBindings(root: ParentNode = document): SavePanelBindings | null {
  const saveBtn = root.getElementById?.('saveBtn') ?? document.getElementById('saveBtn');
  const exportBtn = root.getElementById?.('exportBtn') ?? document.getElementById('exportBtn');
  const importBtn = root.getElementById?.('importBtn') ?? document.getElementById('importBtn');
  const resetBtn = root.getElementById?.('resetBtn') ?? document.getElementById('resetBtn');
  const saveField = root.getElementById?.('saveField') ?? document.getElementById('saveField');
  const saveStatus = root.getElementById?.('saveStatus') ?? document.getElementById('saveStatus');

  if (
    !(saveBtn instanceof HTMLButtonElement) ||
    !(exportBtn instanceof HTMLButtonElement) ||
    !(importBtn instanceof HTMLButtonElement) ||
    !(resetBtn instanceof HTMLButtonElement) ||
    !(saveField instanceof HTMLTextAreaElement) ||
    !(saveStatus instanceof HTMLElement)
  ) {
    return null;
  }

  return { saveBtn, exportBtn, importBtn, resetBtn, saveField, saveStatus };
}

export interface SavePanelCallbacks {
  getState: () => AppState;
  replaceState?: (nextState: AppState) => void;
  onHardReset?: () => void;
}

export class SavePanelView {
  public constructor(
    private readonly bindings: SavePanelBindings,
    private readonly saveService: SaveService,
    private readonly callbacks: SavePanelCallbacks
  ) {}

  public attach(): void {
    this.bindings.saveBtn.addEventListener('click', () => {
      void this.handleSave();
    });

    this.bindings.exportBtn.addEventListener('click', () => {
      this.handleExport();
    });

    this.bindings.importBtn.addEventListener('click', () => {
      void this.handleImport();
    });

    this.bindings.resetBtn.addEventListener('click', () => {
      this.callbacks.onHardReset?.();
    });
  }

  public setStatus(message: string): void {
    this.bindings.saveStatus.textContent = message;
  }

  private async handleSave(): Promise<void> {
    await this.saveService.save(this.callbacks.getState());
    this.setStatus(`Saved at ${new Date().toLocaleTimeString()}.`);
  }

  private handleExport(): void {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(this.callbacks.getState()))));
    this.bindings.saveField.value = encoded;
    this.setStatus('Exported current save into the text box.');
  }

  private async handleImport(): Promise<void> {
    const raw = this.bindings.saveField.value.trim();
    if (!raw) {
      this.setStatus('Import failed. Save string is empty.');
      return;
    }

    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(raw)))) as AppState;
      this.callbacks.replaceState?.(decoded);
      await this.saveService.save(decoded);
      this.setStatus('Import succeeded.');
    } catch {
      this.setStatus('Import failed. Save string is not valid.');
    }
  }
}
