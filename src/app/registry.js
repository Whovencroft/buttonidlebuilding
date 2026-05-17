import { SCENE_KIND } from '../core/scene/SceneTypes.js';
import { createButtonIdleScene } from '../scenes/button_idle/ButtonIdleScene.js';
import { createMarbleScene } from '../scenes/marble/MarbleScene.js';
import { createPhaserTestScene } from '../scenes/phaser_test/PhaserTestScene.js';
import { createMudScene } from '../scenes/mud/MudScene.js';
import { createRetroRpgScene } from '../scenes/retro_rpg/RetroRpgScene.js';
import { createPlatformerScene } from '../scenes/platformer/PlatformerScene.js';
import { createRacingScene } from '../scenes/racing/RacingScene.js';
import { createGoScene } from '../scenes/go/GoScene.js';
import { createNumberMunchersScene } from '../scenes/number_munchers/NumberMunchersScene.js';
import { createPokemonLikeScene } from '../scenes/pokemon_like/PokemonLikeScene.js';
import { createPointClickScene } from '../scenes/point_click/PointClickScene.js';
import { createTowerDefenseScene } from '../scenes/tower_defense/TowerDefenseScene.js';
import { createMetroidvaniaScene } from '../scenes/metroidvania/MetroidvaniaScene.js';
import { createJrpgScene } from '../scenes/jrpg/JrpgScene.js';

/**
 * Creates current playable scene definitions while preserving scene IDs.
 */
export async function createSceneRegistry(api) {
  const scenes = [];

  const buttonScene = await createButtonIdleScene(api);
  scenes.push({
    ...buttonScene,
    id: 'button_idle',
    kind: SCENE_KIND.DOM,
    rootId: 'buttonIdleSceneRoot'
  });

  const marbleScene = await createMarbleScene(api);
  scenes.push({
    ...marbleScene,
    id: 'marble',
    kind: SCENE_KIND.CANVAS,
    rootId: 'marbleSceneRoot'
  });

  const phaserTestScene = createPhaserTestScene(api);
  scenes.push({
    ...phaserTestScene,
    id: 'phaser_test',
    kind: SCENE_KIND.PHASER,
    rootId: 'phaserTestSceneRoot'
  });

  // Purpose: register future-scene scaffolds so milestone work can proceed scene-by-scene.
  scenes.push(
    { ...createMudScene(), id: 'mud', kind: SCENE_KIND.DOM, rootId: 'mudSceneRoot' },
    { ...createRetroRpgScene(), id: 'retro_rpg', kind: SCENE_KIND.PHASER, rootId: 'retroRpgSceneRoot' },
    { ...createPlatformerScene(), id: 'platformer', kind: SCENE_KIND.PHASER, rootId: 'platformerSceneRoot' },
    { ...createRacingScene(), id: 'racing', kind: SCENE_KIND.PHASER, rootId: 'racingSceneRoot' },
    { ...createGoScene(), id: 'go', kind: SCENE_KIND.CANVAS, rootId: 'goSceneRoot' },
    { ...createNumberMunchersScene(), id: 'number_munchers', kind: SCENE_KIND.CANVAS, rootId: 'numberMunchersSceneRoot' },
    { ...createPokemonLikeScene(), id: 'pokemon_like', kind: SCENE_KIND.PHASER, rootId: 'pokemonLikeSceneRoot' },
    { ...createPointClickScene(), id: 'point_click', kind: SCENE_KIND.DOM, rootId: 'pointClickSceneRoot' },
    { ...createTowerDefenseScene(), id: 'tower_defense', kind: SCENE_KIND.PHASER, rootId: 'towerDefenseSceneRoot' },
    { ...createMetroidvaniaScene(), id: 'metroidvania', kind: SCENE_KIND.PHASER, rootId: 'metroidvaniaSceneRoot' },
    { ...createJrpgScene(), id: 'jrpg', kind: SCENE_KIND.PHASER, rootId: 'jrpgSceneRoot' }
  );

  return scenes;
}

/**
 * Registers all current scene definitions with the scene manager.
 */
export function registerScenes(sceneManager, scenes) {
  for (const scene of scenes) {
    sceneManager.registerScene(scene);
  }
}
