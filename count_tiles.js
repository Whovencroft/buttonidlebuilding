global.window = {};
global.document = { createElement: () => ({ getContext: () => ({}) }) };
require('./js/scenes/marble/marble_levels.js');
const ML = window.MarbleLevels;
const levels = ML.getAllLevels();
const lvl = levels.find(l => l.id === 'canal_run');
let crumble = 0, slope = 0, flat = 0, funnel = 0, total = 0;
for (let y = 0; y < lvl.height; y++) {
  for (let x = 0; x < lvl.width; x++) {
    const c = ML.getSurfaceCell(lvl, x, y);
    if (!c || c.kind === 'void') continue;
    total++;
    if (c.crumble) crumble++;
    if (c.shape === 'funnel') funnel++;
    else if (c.shape && c.shape !== 'flat') slope++;
    else flat++;
  }
}
console.log('Total:', total, 'Flat:', flat, 'Slope:', slope, 'Crumble:', crumble, 'Funnel:', funnel);
console.log('Individual meshes (slope + crumble + funnel):', slope + crumble + funnel);
console.log('Actors:', lvl.actors.length);
