/**
 * SavePanel owns save/export/import/reset button bindings.
 */
export class SavePanel {
  #saveBtn;
  #exportBtn;
  #importBtn;
  #resetBtn;

  constructor({ saveBtn, exportBtn, importBtn, resetBtn }) {
    this.#saveBtn = saveBtn;
    this.#exportBtn = exportBtn;
    this.#importBtn = importBtn;
    this.#resetBtn = resetBtn;
  }

  bindActions({ onSave, onExport, onImport, onReset }) {
    this.#saveBtn?.addEventListener('click', onSave);
    this.#exportBtn?.addEventListener('click', onExport);
    this.#importBtn?.addEventListener('click', onImport);
    this.#resetBtn?.addEventListener('click', onReset);
  }
}
