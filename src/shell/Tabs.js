/**
 * Tabs manages shell tab button rendering and selection events.
 */
export class Tabs {
  #tabsRoot;

  constructor(tabsRoot) {
    this.#tabsRoot = tabsRoot;
  }

  render(configTabs, activeTab, onTabChange) {
    if (!this.#tabsRoot) return;

    this.#tabsRoot.innerHTML = configTabs.map((tab) => `
      <button class="tab-btn ${activeTab === tab.id ? 'active' : ''}" data-tab-target="${tab.id}">${tab.label}</button>
    `).join('');

    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.tab === activeTab);
    });

    for (const button of this.#tabsRoot.querySelectorAll('.tab-btn')) {
      button.addEventListener('click', () => onTabChange(button.dataset.tabTarget));
    }
  }
}
