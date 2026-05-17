/**
 * TransitionService registers and runs host-owned scripted transitions.
 */
export class TransitionService {
  #transitions = new Map();
  #active = false;

  register(id, runner) {
    this.#transitions.set(id, runner);
  }

  isActive() {
    return this.#active;
  }

  async run(id, context = {}) {
    const runner = this.#transitions.get(id);
    if (typeof runner !== 'function') {
      throw new Error(`Unknown transition: ${id}`);
    }

    if (this.#active) {
      return;
    }

    this.#active = true;

    try {
      await runner(context);
    } finally {
      this.#active = false;
    }
  }
}
