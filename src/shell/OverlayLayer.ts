export interface OverlayMessage {
  title: string;
  body: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
  dismissLabel?: string;
}

export class OverlayLayer {
  private readonly root: HTMLElement;
  private readonly card: HTMLElement;
  private readonly titleNode: HTMLElement;
  private readonly bodyNode: HTMLElement;
  private readonly dismissButton: HTMLButtonElement;

  public constructor() {
    this.root = document.createElement('div');
    this.root.className = 'shell-overlay-layer';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="shell-overlay-layer__backdrop"></div>
      <div class="shell-overlay-layer__card">
        <div class="shell-overlay-layer__title"></div>
        <div class="shell-overlay-layer__body"></div>
        <button type="button" class="shell-overlay-layer__dismiss">Close</button>
      </div>
    `;

    document.body.appendChild(this.root);

    const card = this.root.querySelector('.shell-overlay-layer__card');
    const title = this.root.querySelector('.shell-overlay-layer__title');
    const body = this.root.querySelector('.shell-overlay-layer__body');
    const dismiss = this.root.querySelector('.shell-overlay-layer__dismiss');

    if (
      !(card instanceof HTMLElement) ||
      !(title instanceof HTMLElement) ||
      !(body instanceof HTMLElement) ||
      !(dismiss instanceof HTMLButtonElement)
    ) {
      throw new Error('OverlayLayer failed to initialize.');
    }

    this.card = card;
    this.titleNode = title;
    this.bodyNode = body;
    this.dismissButton = dismiss;

    this.dismissButton.addEventListener('click', () => this.hide());
  }

  public show(message: OverlayMessage): void {
    this.root.hidden = false;
    this.card.dataset.tone = message.tone ?? 'default';
    this.titleNode.textContent = message.title;
    this.bodyNode.textContent = message.body;
    this.dismissButton.textContent = message.dismissLabel ?? 'Close';
  }

  public hide(): void {
    this.root.hidden = true;
  }

  public destroy(): void {
    this.root.remove();
  }
}
