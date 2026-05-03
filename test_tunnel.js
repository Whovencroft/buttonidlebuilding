// Simulate browser environment for marble_levels.js
global.window = global;
global.document = { createElement: () => ({ getContext: () => ({}) }) };
require('./js/scenes/marble/marble_levels.js');

const ML = window.MarbleLevels;
const level = ML.getLevelById('practice_green');

// Check the trigger at 78,20
const trigger = ML.getTriggerCell(level, 78, 20);
console.log('Trigger at 78,20:', JSON.stringify(trigger));

// Check the surface at 78,20
const surface = ML.getSurfaceCell(level, 78, 20);
console.log('Surface at 78,20:', JSON.stringify({shape: surface?.shape, baseHeight: surface?.baseHeight, kind: surface?.kind}));

// Check the actor
const actors = level.actors.filter(a => a.kind === 'tunnel');
console.log('Tunnel actors:', JSON.stringify(actors.map(a => ({id: a.id, path: a.tunnelPath, x: a.x, y: a.y}))));

// Check surrounding tiles
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    const tx = 78 + dx;
    const ty = 20 + dy;
    const cell = ML.getSurfaceCell(level, tx, ty);
    if (cell) {
      const t = ML.getTriggerCell(level, tx, ty);
      if (cell.shape === 'funnel' || t) {
        console.log(`  (${tx},${ty}): shape=${cell.shape}, baseH=${cell.baseHeight}, trigger=${t?.kind || 'none'}`);
      }
    }
  }
}
