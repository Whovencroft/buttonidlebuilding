import { TopBar } from './TopBar.js';
import { Tabs } from './Tabs.js';
import { SavePanel } from './SavePanel.js';
import { OverlayLayer } from './OverlayLayer.js';
import { SettingsPanel } from './SettingsPanel.js';

/**
 * ShellView composes shell modules and provides one host-facing shell API.
 */
export class ShellView {
  #tabs;
  #topBar;
  #savePanel;
  #overlayLayer;
  #settingsPanel;

  constructor(elements) {
    this.#tabs = new Tabs(elements.tabs);
    this.#topBar = new TopBar({
      appRoot: elements.appRoot,
      playGameGrid: elements.playGameGrid,
      switchButtonSceneBtn: elements.switchButtonSceneBtn,
      switchMudSceneBtn: elements.switchMudSceneBtn,
      switchGoSceneBtn: elements.switchGoSceneBtn,
      switchRetroRpgSceneBtn: elements.switchRetroRpgSceneBtn,
      switchPlatformerSceneBtn: elements.switchPlatformerSceneBtn,
      switchRacingSceneBtn: elements.switchRacingSceneBtn,
      switchPokemonLikeSceneBtn: elements.switchPokemonLikeSceneBtn,
      switchNumberMunchersSceneBtn: elements.switchNumberMunchersSceneBtn,
      switchPointClickSceneBtn: elements.switchPointClickSceneBtn,
      switchMetroidvaniaSceneBtn: elements.switchMetroidvaniaSceneBtn,
      switchJrpgSceneBtn: elements.switchJrpgSceneBtn,
      switchMarbleSceneBtn: elements.switchMarbleSceneBtn,
      switchPhaserSceneBtn: elements.switchPhaserSceneBtn
    });
    this.#savePanel = new SavePanel({
      saveBtn: elements.saveBtn,
      exportBtn: elements.exportBtn,
      importBtn: elements.importBtn,
      resetBtn: elements.resetBtn
    });
    this.#overlayLayer = new OverlayLayer();
    this.#settingsPanel = new SettingsPanel();
  }

  bindSceneSwitcher(handlers) {
    this.#topBar.bindSceneSwitcher(handlers);
  }

  bindSavePanel(handlers) {
    this.#savePanel.bindActions(handlers);
  }

  render({ configTabs, activeTab, onTabChange, activeSceneId, marbleUnlocked }) {
    this.#tabs.render(configTabs, activeTab, onTabChange);
    this.#topBar.renderSceneState({ activeSceneId, marbleUnlocked });
    this.#settingsPanel.render();
    this.#overlayLayer.hide();
  }
}
