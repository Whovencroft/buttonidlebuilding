export interface SettingsState {
  musicVolume: number;
  sfxVolume: number;
  reduceMotion: boolean;
  touchControls: boolean;
}

export interface SettingsPanelOptions {
  root?: HTMLElement | null;
  onChange?: (nextState: SettingsState) => void;
}

export class SettingsPanelView {
  private readonly root: HTMLElement;
  private state: SettingsState = {
    musicVolume: 1,
    sfxVolume: 1,
    reduceMotion: false,
    touchControls: true
  };

  public constructor(options: SettingsPanelOptions = {}) {
    this.root = options.root ?? this.createDetachedRoot();
    this.onChange = options.onChange;
  }

  private readonly onChange?: (nextState: SettingsState) => void;

  public render(): void {
    this.root.innerHTML = `
      <div class="card-list">
        <div class="card">
          <div class="card-title">Settings</div>
          <label class="small">Music Volume
            <input type="range" min="0" max="1" step="0.05" data-setting="musicVolume" value="${this.state.musicVolume}" />
          </label>
          <label class="small">SFX Volume
            <input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume" value="${this.state.sfxVolume}" />
          </label>
          <label class="small">
            <input type="checkbox" data-setting="reduceMotion" ${this.state.reduceMotion ? 'checked' : ''} />
            Reduce Motion
          </label>
          <label class="small">
            <input type="checkbox" data-setting="touchControls" ${this.state.touchControls ? 'checked' : ''} />
            Touch Controls
          </label>
        </div>
      </div>
    `;

    for (const input of this.root.querySelectorAll<HTMLInputElement>('[data-setting]')) {
      input.addEventListener('input', () => this.handleInput(input));
      input.addEventListener('change', () => this.handleInput(input));
    }
  }

  public setState(nextState: Partial<SettingsState>): void {
    this.state = { ...this.state, ...nextState };
    this.render();
  }

  public getState(): SettingsState {
    return { ...this.state };
  }

  private handleInput(input: HTMLInputElement): void {
    const setting = input.dataset.setting as keyof SettingsState;
    if (!setting) return;

    const nextValue = input.type === 'checkbox' ? input.checked : Number.parseFloat(input.value);
    this.state = {
      ...this.state,
      [setting]: nextValue
    };

    this.onChange?.(this.getState());
  }

  private createDetachedRoot(): HTMLElement {
    const root = document.createElement('div');
    root.className = 'settings-panel-root';
    return root;
  }
}
