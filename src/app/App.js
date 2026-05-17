import { createSceneRegistry, registerScenes } from './registry.js';
import { getSceneHostRoots } from '../core/scene/SceneHost.js';
import { SceneManager } from '../core/scene/SceneManager.js';
import { SaveService } from '../core/state/SaveService.js';
import { InputService } from '../core/input/InputService.js';
import { ShellView } from '../shell/ShellView.js';
import { AssetService } from '../core/assets/AssetService.js';
import { CORE_ASSET_MANIFEST } from '../core/assets/AssetManifest.js';
import { AudioService } from '../core/audio/AudioService.js';
import { ChapterGraph } from '../progression/ChapterGraph.js';
import { UnlockService } from '../progression/UnlockService.js';
import { RewardService } from '../progression/RewardService.js';
import { EndingService } from '../progression/EndingService.js';
import { TransitionService } from '../core/transitions/TransitionService.js';
import { runButtonToMarbleTransition } from '../core/transitions/scripted/ButtonToMarble.js';
import { PlatformService } from '../core/platform/PlatformService.js';
import { SafeArea } from '../mobile/SafeArea.js';
import { TouchOverlay } from '../mobile/TouchOverlay.js';

/**
 * Modular host application that owns shell/runtime lifecycle and delegates
 * persistence to SaveService.
 */
export class App {
  #config = null;
  #state = null;
  #saveService = null;
  #elements = null;
  #inputService = null;
  #sceneManager = null;
  #assetService = null;
  #audioService = null;
  #shellView = null;
  #chapterGraph = null;
  #unlockService = null;
  #rewardService = null;
  #endingService = null;
  #transitionService = null;
  #platformService = null;
  #safeArea = null;
  #touchOverlay = null;
  #frameHandle = null;
  #saveHandle = null;
  #lastFrame = performance.now();
  #initialized = false;

  async init() {
    if (this.#initialized) return;
    this.#initialized = true;

    this.#config = JSON.parse(document.getElementById('gameData').textContent);
    this.#saveService = new SaveService({
      saveKey: this.#config.meta.saveKey,
      config: this.#config
    });

    this.#state = this.#saveService.load();
    this.#elements = this.#collectElements();
    this.#shellView = new ShellView(this.#elements);

    // Purpose: host-owned asset/audio services for reusable scene resources.
    this.#assetService = new AssetService();
    this.#audioService = new AudioService();
    // Purpose: lightweight built-in cue keeps shell audio path active without asset dependency.
    this.#audioService.registerCue('scene_switch', 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=');
    await this.#assetService.preload(CORE_ASSET_MANIFEST);

    // Purpose: progression flow is host-owned and data-driven.
    this.#chapterGraph = new ChapterGraph();
    this.#unlockService = new UnlockService();
    this.#rewardService = new RewardService();
    this.#endingService = new EndingService({
      chapterGraph: this.#chapterGraph,
      unlockService: this.#unlockService,
      rewardService: this.#rewardService
    });

    // Purpose: transition orchestration is host-owned and scriptable.
    this.#transitionService = new TransitionService();
    this.#transitionService.register('button_to_marble', runButtonToMarbleTransition);

    // Purpose: platform abstraction owns pause/resume hooks and mobile detection.
    this.#platformService = new PlatformService();
    this.#platformService.bindLifecycle({
      onPause: () => this.saveNow(),
      onResume: () => {
        this.#lastFrame = performance.now();
        this.#sceneManager?.render({ state: this.#state });
        this.#renderShell();
      }
    });

    // Purpose: apply safe-area environment insets into host CSS vars.
    this.#safeArea = new SafeArea();
    this.#safeArea.apply();
    window.addEventListener('resize', this.#onViewportChange);
    window.addEventListener('orientationchange', this.#onViewportChange);

    // Purpose: centralize input ownership at host level for scene consumption.
    this.#inputService = new InputService();
    this.#inputService.attach();

    // Purpose: on-screen touch controls keep marble playable on mobile web.
    this.#touchOverlay = new TouchOverlay(this.#inputService);
    this.#touchOverlay.mount(this.#elements.appRoot || document.body);

    const roots = getSceneHostRoots();
    this.#sceneManager = new SceneManager({
      host: roots.sceneHost,
      onSceneChanged: ({ currentSceneId }) => {
        this.#state.app.activeScene = currentSceneId;
        this.#renderShell();
      }
    });

    const api = this.#buildSceneApi();
    const scenes = await createSceneRegistry(api);
    registerScenes(this.#sceneManager, scenes);

    this.#attachShellEvents();
    this.#renderShell();
    this.#sceneManager.notifyStateLoaded({ state: this.#state });
    this.switchScene(this.#state.app.activeScene, { force: true, silentSave: true });
    this.#sceneManager.render({ state: this.#state });

    this.#lastFrame = performance.now();
    this.#frameHandle = requestAnimationFrame((timestamp) => this.#frame(timestamp));
    this.#saveHandle = window.setInterval(() => this.saveNow(), 5000);
  }

  destroy() {
    if (this.#frameHandle) {
      cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = null;
    }

    if (this.#saveHandle) {
      clearInterval(this.#saveHandle);
      this.#saveHandle = null;
    }

    this.#platformService?.unbindLifecycle();
    window.removeEventListener('resize', this.#onViewportChange);
    window.removeEventListener('orientationchange', this.#onViewportChange);
    this.#touchOverlay?.setVisible(false);
    this.#inputService?.clearVirtualActions();
    this.#inputService?.detach();
  }

  getState() {
    return this.#state;
  }

  saveNow(showStatus = false) {
    this.#state.session.lastTick = Date.now();
    this.#state.session.lastSave = Date.now();
    this.#state = this.#saveService.save(this.#state);

    if (this.#elements.autosaveStatus) {
      this.#elements.autosaveStatus.textContent = `Autosave: ${new Date(this.#state.session.lastSave).toLocaleTimeString()}`;
    }

    if (showStatus && this.#elements.saveStatus) {
      this.#elements.saveStatus.textContent = `Saved at ${new Date(this.#state.session.lastSave).toLocaleTimeString()}.`;
    }
  }

  switchScene(sceneId, options = {}) {
    if (!this.#sceneManager) return;

    if (sceneId === 'marble' && !this.#state.scenes.marble.unlocked && !options.force) {
      if (this.#elements.saveStatus) {
        this.#elements.saveStatus.textContent = 'The marble game is still locked.';
      }
      return;
    }

    this.#state.ui.activeTab = 'play';
    this.#state.app.activeScene = sceneId;

    this.#sceneManager.setActiveScene(sceneId, { state: this.#state, ...options });
    this.#audioService.playCue('scene_switch');
    this.#renderShell();

    if (!options.silentSave) {
      this.saveNow();
    }
  }

  applyMarbleReward(result) {
    const outcome = this.#endingService.handleEnding(this.#state, {
      sceneId: 'marble',
      endingId: 'marble_complete',
      reward: result?.reward || null
    });

    if (result?.levelId && !this.#state.scenes.marble.clearedLevels.includes(result.levelId)) {
      this.#state.scenes.marble.clearedLevels.push(result.levelId);
    }

    if (result?.levelId) {
      const existingBest = this.#state.scenes.marble.bestTimes[result.levelId];
      if (!existingBest || result.bestTimeMs < existingBest) {
        this.#state.scenes.marble.bestTimes[result.levelId] = result.bestTimeMs;
      }
    }

    if (outcome.unlockedScenes.includes('marble')) {
      this.#state.scenes.marble.unlocked = true;
    }

    this.saveNow();
  }

  beginEndingTransitionToMarble() {
    if (this.#transitionService.isActive()) return;

    const outcome = this.#endingService.handleEnding(this.#state, {
      sceneId: 'button_idle',
      endingId: 'button_idle_complete'
    });

    this.#state.scenes.marble.currentLevelId = this.#state.scenes.marble.currentLevelId || 'training_run';
    this.saveNow();

    void this.#transitionService.run('button_to_marble', {
      appRoot: this.#elements.appRoot,
      durationMs: 350,
      onSwitchToMarble: async () => {
        this.switchScene(outcome.nextSceneId || 'marble', { force: true, silentSave: true });
      }
    });
  }

  isEndingTransitionActive() {
    return this.#transitionService?.isActive() || false;
  }

  #buildSceneApi() {
    return {
      config: this.#config,
      elements: this.#elements,
      getState: () => this.getState(),
      saveNow: (showStatus = false) => this.saveNow(showStatus),
      switchScene: (sceneId, options = {}) => this.switchScene(sceneId, options),
      applyMarbleReward: (result) => this.applyMarbleReward(result),
      beginEndingTransitionToMarble: () => this.beginEndingTransitionToMarble(),
      isEndingTransitionActive: () => this.isEndingTransitionActive(),
      inputService: this.#inputService,
      assetService: this.#assetService,
      audioService: this.#audioService,
      setSaveStatus: (text) => {
        if (this.#elements.saveStatus) {
          this.#elements.saveStatus.textContent = text;
        }
      }
    };
  }

  #collectElements() {
    const byId = (id) => document.getElementById(id);

    return {
      appRoot: document.querySelector('.app'),
      tabs: byId('tabs'),
      autosaveStatus: byId('autosaveStatus'),
      saveStatus: byId('saveStatus'),
      saveBtn: byId('saveBtn'),
      exportBtn: byId('exportBtn'),
      importBtn: byId('importBtn'),
      resetBtn: byId('resetBtn'),
      fakeCrashBtn: byId('fakeCrashBtn'),
      saveField: byId('saveField'),
      playGameGrid: byId('playGameGrid'),
      sceneHost: byId('sceneHost'),
      buttonIdleSceneRoot: byId('buttonIdleSceneRoot'),
      marbleSceneRoot: byId('marbleSceneRoot'),
      switchButtonSceneBtn: byId('switchButtonSceneBtn'),
      switchMudSceneBtn: byId('switchMudSceneBtn'),
      switchGoSceneBtn: byId('switchGoSceneBtn'),
      switchRetroRpgSceneBtn: byId('switchRetroRpgSceneBtn'),
      switchPlatformerSceneBtn: byId('switchPlatformerSceneBtn'),
      switchRacingSceneBtn: byId('switchRacingSceneBtn'),
      switchPokemonLikeSceneBtn: byId('switchPokemonLikeSceneBtn'),
      switchNumberMunchersSceneBtn: byId('switchNumberMunchersSceneBtn'),
      switchPointClickSceneBtn: byId('switchPointClickSceneBtn'),
      switchMetroidvaniaSceneBtn: byId('switchMetroidvaniaSceneBtn'),
      switchJrpgSceneBtn: byId('switchJrpgSceneBtn'),
      switchMarbleSceneBtn: byId('switchMarbleSceneBtn'),
      switchPhaserSceneBtn: byId('switchPhaserSceneBtn'),
      displayedPresses: byId('displayedPresses'),
      truePressesSub: byId('truePressesSub'),
      pps: byId('pps'),
      manualValue: byId('manualValue'),
      autonomyValue: byId('autonomyValue'),
      autonomySub: byId('autonomySub'),
      debtValue: byId('debtValue'),
      debtSub: byId('debtSub'),
      regretValue: byId('regretValue'),
      layerSummary: byId('layerSummary'),
      activeRulesValue: byId('activeRulesValue'),
      comboSummary: byId('comboSummary'),
      buttonModeLabel: byId('buttonModeLabel'),
      buttonNote: byId('buttonNote'),
      mainButton: byId('mainButton'),
      buttonSandbox: byId('buttonSandbox'),
      fakeButtonLayer: byId('fakeButtonLayer'),
      popupZone: byId('popupZone'),
      autonomyEndingModal: byId('autonomyEndingModal'),
      endingBody: byId('endingBody'),
      endingObserveBtn: byId('endingObserveBtn'),
      endingReassertBtn: byId('endingReassertBtn'),
      endingPrestigeBtn: byId('endingPrestigeBtn'),
      dumbDownBtn: byId('dumbDownBtn'),
      dumbDownFormula: byId('dumbDownFormula'),
      dumbDownDesc: byId('dumbDownDesc'),
      larcenyValue: byId('larcenyValue'),
      upgradeList: byId('upgradeList'),
      moduleList: byId('moduleList'),
      activeLoadoutList: byId('activeLoadoutList'),
      comboList: byId('comboList'),
      layerList: byId('layerList'),
      resourceList: byId('resourceList'),
      formulaList: byId('formulaList'),
      frameworkNotes: byId('frameworkNotes'),
      configPreview: byId('configPreview'),
      recentLog: byId('recentLog'),
      messageBar: byId('messageBar'),
      clockStatus: byId('clockStatus'),
      versionStatus: byId('versionStatus'),
      automationSummary: byId('automationSummary'),
      efficiencyValue: byId('efficiencyValue'),
      formulaEfficiency: byId('formulaEfficiency'),
      inflationValue: byId('inflationValue'),
      formulaInflation: byId('formulaInflation'),
      idleMeter: byId('idleMeter'),
      idleStatus: byId('idleStatus'),
      idleDesc: byId('idleDesc'),
      loadoutSummary: byId('loadoutSummary'),
      sessionStats: byId('sessionStats')
    };
  }


  #renderShell() {
    const activeSceneId = this.#sceneManager ? this.#sceneManager.getActiveSceneId() : 'button_idle';

    this.#shellView.render({
      configTabs: this.#config.tabs,
      activeTab: this.#state.ui.activeTab,
      onTabChange: (nextTab) => {
        this.#state.ui.activeTab = nextTab;
        this.#renderShell();
      },
      activeSceneId,
      marbleUnlocked: !!this.#state.scenes.marble.unlocked
    });

    const shouldShowTouch = this.#platformService?.isMobile() && activeSceneId === 'marble';
    this.#touchOverlay?.setVisible(!!shouldShowTouch);
  }


  #attachShellEvents() {
    this.#shellView.bindSceneSwitcher({
      onButtonScene: () => this.switchScene('button_idle', { force: true }),
      onMudScene: () => this.switchScene('mud', { force: true }),
      onGoScene: () => this.switchScene('go', { force: true }),
      onRetroRpgScene: () => this.switchScene('retro_rpg', { force: true }),
      onPlatformerScene: () => this.switchScene('platformer', { force: true }),
      onRacingScene: () => this.switchScene('racing', { force: true }),
      onPokemonLikeScene: () => this.switchScene('pokemon_like', { force: true }),
      onNumberMunchersScene: () => this.switchScene('number_munchers', { force: true }),
      onPointClickScene: () => this.switchScene('point_click', { force: true }),
      onMetroidvaniaScene: () => this.switchScene('metroidvania', { force: true }),
      onJrpgScene: () => this.switchScene('jrpg', { force: true }),
      onMarbleScene: () => this.switchScene('marble'),
      onPhaserScene: () => this.switchScene('phaser_test', { force: true })
    });

    this.#shellView.bindSavePanel({
      onSave: () => this.saveNow(true),
      onExport: () => {
        if (!this.#elements.saveField) return;
        this.#elements.saveField.value = this.#saveService.encode(this.#state);
        this.#elements.saveStatus.textContent = 'Exported save string to the text box.';
      },
      onImport: () => {
        try {
          if (!this.#elements.saveField) return;
          const raw = this.#elements.saveField.value.trim();
          if (!raw) {
            this.#elements.saveStatus.textContent = 'Import failed. Save string is not valid.';
            return;
          }

          this.#state = this.#saveService.decode(raw);
          this.#state.stats.imports = (this.#state.stats.imports || 0) + 1;
          this.#sceneManager.notifyStateLoaded({ state: this.#state });
          this.switchScene(this.#state.app.activeScene, { force: true, silentSave: true });
          this.#elements.saveStatus.textContent = 'Import succeeded.';
        } catch (error) {
          console.error(error);
          this.#elements.saveStatus.textContent = 'Import failed. Save string is not valid.';
        }
      },
      onReset: () => {
        this.#state = this.#saveService.createFreshState();
        this.#sceneManager.notifyStateLoaded({ state: this.#state });
        this.switchScene('button_idle', { force: true, silentSave: true });
        this.saveNow(true);
      }
    });

    window.addEventListener('beforeunload', () => this.saveNow());
  }

  #onViewportChange = () => {
    // Purpose: recompute safe-area CSS vars after viewport or orientation shifts.
    this.#safeArea?.apply();
  };

  #frame(timestamp) {
    let dt = (timestamp - this.#lastFrame) / 1000;
    this.#lastFrame = timestamp;

    if (!Number.isFinite(dt) || dt <= 0) {
      dt = 1 / 60;
    }

    dt = Math.min(dt, 1);
    this.#sceneManager.update(dt, { state: this.#state });
    this.#inputService.endFrame();
    this.#frameHandle = requestAnimationFrame((nextTimestamp) => this.#frame(nextTimestamp));
  }
}
