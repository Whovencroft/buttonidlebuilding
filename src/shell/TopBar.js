/**
 * TopBar controls scene switcher visual state and bindings.
 */
export class TopBar {
  #appRoot;
  #playGameGrid;
  #switchButtonSceneBtn;
  #switchMudSceneBtn;
  #switchGoSceneBtn;
  #switchRetroRpgSceneBtn;
  #switchPlatformerSceneBtn;
  #switchRacingSceneBtn;
  #switchPokemonLikeSceneBtn;
  #switchNumberMunchersSceneBtn;
  #switchPointClickSceneBtn;
  #switchMetroidvaniaSceneBtn;
  #switchJrpgSceneBtn;
  #switchMarbleSceneBtn;
  #switchPhaserSceneBtn;

  constructor({ appRoot, playGameGrid, switchButtonSceneBtn, switchMudSceneBtn, switchGoSceneBtn, switchRetroRpgSceneBtn, switchPlatformerSceneBtn, switchRacingSceneBtn, switchPokemonLikeSceneBtn, switchNumberMunchersSceneBtn, switchPointClickSceneBtn, switchMetroidvaniaSceneBtn, switchJrpgSceneBtn, switchMarbleSceneBtn, switchPhaserSceneBtn }) {
    this.#appRoot = appRoot;
    this.#playGameGrid = playGameGrid;
    this.#switchButtonSceneBtn = switchButtonSceneBtn;
    this.#switchMudSceneBtn = switchMudSceneBtn;
    this.#switchGoSceneBtn = switchGoSceneBtn;
    this.#switchRetroRpgSceneBtn = switchRetroRpgSceneBtn;
    this.#switchPlatformerSceneBtn = switchPlatformerSceneBtn;
    this.#switchRacingSceneBtn = switchRacingSceneBtn;
    this.#switchPokemonLikeSceneBtn = switchPokemonLikeSceneBtn;
    this.#switchNumberMunchersSceneBtn = switchNumberMunchersSceneBtn;
    this.#switchPointClickSceneBtn = switchPointClickSceneBtn;
    this.#switchMetroidvaniaSceneBtn = switchMetroidvaniaSceneBtn;
    this.#switchJrpgSceneBtn = switchJrpgSceneBtn;
    this.#switchMarbleSceneBtn = switchMarbleSceneBtn;
    this.#switchPhaserSceneBtn = switchPhaserSceneBtn;
  }

  bindSceneSwitcher({ onButtonScene, onMudScene, onGoScene, onRetroRpgScene, onPlatformerScene, onRacingScene, onPokemonLikeScene, onNumberMunchersScene, onPointClickScene, onMetroidvaniaScene, onJrpgScene, onMarbleScene, onPhaserScene }) {
    this.#switchButtonSceneBtn?.addEventListener('click', onButtonScene);
    this.#switchMudSceneBtn?.addEventListener('click', onMudScene);
    this.#switchGoSceneBtn?.addEventListener('click', onGoScene);
    this.#switchRetroRpgSceneBtn?.addEventListener('click', onRetroRpgScene);
    this.#switchPlatformerSceneBtn?.addEventListener('click', onPlatformerScene);
    this.#switchRacingSceneBtn?.addEventListener('click', onRacingScene);
    this.#switchPokemonLikeSceneBtn?.addEventListener('click', onPokemonLikeScene);
    this.#switchNumberMunchersSceneBtn?.addEventListener('click', onNumberMunchersScene);
    this.#switchPointClickSceneBtn?.addEventListener('click', onPointClickScene);
    this.#switchMetroidvaniaSceneBtn?.addEventListener('click', onMetroidvaniaScene);
    this.#switchJrpgSceneBtn?.addEventListener('click', onJrpgScene);
    this.#switchMarbleSceneBtn?.addEventListener('click', onMarbleScene);
    this.#switchPhaserSceneBtn?.addEventListener('click', onPhaserScene);
  }

  renderSceneState({ activeSceneId, marbleUnlocked }) {
    const isMarble = activeSceneId === 'marble';
    const isPhaser = activeSceneId === 'phaser_test';
    const isMetroidvania = activeSceneId === 'metroidvania';
    const isJrpg = activeSceneId === 'jrpg';
    const isFullscreenScene = isMarble || isPhaser || isMetroidvania || isJrpg;

    this.#playGameGrid?.classList.toggle('scene-marble-active', isFullscreenScene);
    this.#switchButtonSceneBtn?.classList.toggle('active', activeSceneId === 'button_idle');
    this.#switchMudSceneBtn?.classList.toggle('active', activeSceneId === 'mud');
    this.#switchGoSceneBtn?.classList.toggle('active', activeSceneId === 'go');
    this.#switchRetroRpgSceneBtn?.classList.toggle('active', activeSceneId === 'retro_rpg');
    this.#switchPlatformerSceneBtn?.classList.toggle('active', activeSceneId === 'platformer');
    this.#switchRacingSceneBtn?.classList.toggle('active', activeSceneId === 'racing');
    this.#switchPokemonLikeSceneBtn?.classList.toggle('active', activeSceneId === 'pokemon_like');
    this.#switchNumberMunchersSceneBtn?.classList.toggle('active', activeSceneId === 'number_munchers');
    this.#switchPointClickSceneBtn?.classList.toggle('active', activeSceneId === 'point_click');
    this.#switchMetroidvaniaSceneBtn?.classList.toggle('active', activeSceneId === 'metroidvania');
    this.#switchJrpgSceneBtn?.classList.toggle('active', activeSceneId === 'jrpg');

    if (this.#switchMarbleSceneBtn) {
      this.#switchMarbleSceneBtn.classList.toggle('active', isMarble);
      this.#switchMarbleSceneBtn.disabled = !marbleUnlocked;
      this.#switchMarbleSceneBtn.textContent = marbleUnlocked ? 'Marble Game' : 'Marble Locked';
    }

    if (this.#switchPhaserSceneBtn) {
      this.#switchPhaserSceneBtn.classList.toggle('active', isPhaser);
      this.#switchPhaserSceneBtn.disabled = false;
      this.#switchPhaserSceneBtn.textContent = 'Phaser Test';
    }

    if (this.#appRoot instanceof HTMLElement) {
      this.#appRoot.classList.toggle('app-marble-mode', isFullscreenScene);
    }
  }
}
