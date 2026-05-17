/**
 * TouchOverlay adds simple on-screen controls for marble movement.
 */
export class TouchOverlay {
  #root = null;
  #inputService;

  constructor(inputService) {
    this.#inputService = inputService;
  }

  mount(container = document.body) {
    if (this.#root) return;

    const root = document.createElement('div');
    root.className = 'touch-overlay';
    root.innerHTML = `
      <button data-action="move_up">↑</button>
      <button data-action="move_left">←</button>
      <button data-action="move_down">↓</button>
      <button data-action="move_right">→</button>
    `;

    const setAction = (action, active) => {
      this.#inputService.setVirtualAction(action, active);
    };

    for (const button of root.querySelectorAll('button')) {
      const action = button.dataset.action;
      if (!action) continue;

      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        setAction(action, true);
      });
      button.addEventListener('pointerup', () => setAction(action, false));
      button.addEventListener('pointercancel', () => setAction(action, false));
      button.addEventListener('pointerleave', () => setAction(action, false));
    }

    container.appendChild(root);
    this.#root = root;
  }

  setVisible(visible) {
    if (!this.#root) return;
    this.#root.classList.toggle('active', visible);
    if (!visible) {
      this.#inputService.clearVirtualActions();
    }
  }
}
