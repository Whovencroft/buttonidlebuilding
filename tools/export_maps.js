#!/usr/bin/env node
/**
 * Export each marble level as a CSV map file.
 * 
 * Each cell contains: "TYPE z=HEIGHT (x,y)"
 * Types: track, ramp_N/S/E/W, bounce, ice, conveyor_N/S/E/W, crumble, void
 * Special markers: START, GOAL
 * 
 * Below the grid: actor/platform info with waypoints.
 */

global.window = {};
require('/home/ubuntu/buttonidlebuilding/js/scenes/marble/marble_levels.js');
const ML = window.MarbleLevels;
const fs = require('fs');
const path = require('path');

const outDir = '/home/ubuntu/buttonidlebuilding/MAPS';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const allMeta = ML.getAllLevels();

for (let li = 0; li < allMeta.length; li++) {
  const level = ML.getLevelById(allMeta[li].id);
  if (!level || !level.surface) { console.log(`Skipping ${allMeta[li].id} - no surface`); continue; }
  const rows = level.surface.length;
  const cols = level.surface[0]?.length || 0;
  if (!rows || !cols) continue;

  const startX = Math.floor(level.start?.x ?? -1);
  const startY = Math.floor(level.start?.y ?? -1);
  const goalX = level.goal ? Math.floor(level.goal.x) : -1;
  const goalY = level.goal ? Math.floor(level.goal.y) : -1;

  // Find goal trigger positions
  const goalTriggers = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const t = level.triggers[y]?.[x];
      if (t && (t.kind === 'goal' || t.kind === 'secret_goal')) {
        goalTriggers.push({ x, y, kind: t.kind });
      }
    }
  }

  // Build CSV rows
  const csvRows = [];

  // Header row: column indices
  const headerRow = ['y\\x'];
  for (let x = 0; x < cols; x++) headerRow.push(String(x));
  csvRows.push(headerRow);

  // Grid rows
  for (let y = 0; y < rows; y++) {
    const row = [String(y)];
    for (let x = 0; x < cols; x++) {
      const cell = ML.getSurfaceCell(level, x, y);
      if (!cell || cell.kind === 'void') {
        row.push('');
        continue;
      }

      // Determine tile type string
      let type = cell.kind; // 'track'
      if (cell.shape && cell.shape !== 'flat') {
        // Ramp direction from shape: slope_n, slope_s, slope_e, slope_w
        type = cell.shape.replace('slope_', 'ramp_').toUpperCase();
        if (type === cell.shape.toUpperCase()) type = cell.shape;
      } else if (cell.bounce > 0) {
        type = 'bounce';
      } else if (cell.conveyor) {
        // Conveyor uses x,y vector components
        const cx = cell.conveyor.x || 0;
        const cy = cell.conveyor.y || 0;
        let cDir = '';
        if (Math.abs(cx) >= Math.abs(cy)) cDir = cx > 0 ? 'E' : 'W';
        else cDir = cy > 0 ? 'S' : 'N';
        type = `conveyor_${cDir}`;
      } else if (cell.crumble) {
        type = 'crumble';
      } else if (cell.friction !== null && cell.friction < 0.5) {
        type = 'ice';
      } else {
        type = 'track';
      }

      // Check for special markers
      let marker = '';
      if (x === startX && y === startY) marker = ' [START]';
      const isGoal = goalTriggers.some(g => g.x === x && g.y === y);
      if (isGoal) marker = ' [GOAL]';

      const z = Number.isInteger(cell.baseHeight) ? cell.baseHeight : cell.baseHeight.toFixed(1);
      const cellText = `${type} z=${z}${marker}`;
      row.push(cellText);
    }
    csvRows.push(row);
  }

  // Add blank separator rows
  csvRows.push([]);
  csvRows.push([]);

  // Add level info
  csvRows.push(['LEVEL INFO']);
  csvRows.push(['ID', level.id]);
  csvRows.push(['Name', level.name]);
  csvRows.push(['Grid Size', `${cols}x${rows}`]);
  csvRows.push(['Start', `(${level.start?.x}, ${level.start?.y})`]);
  csvRows.push(['Goal', level.goal ? `(${level.goal.x}, ${level.goal.y})` : 'none']);
  csvRows.push(['Time Limit', level.timeLimit ? `${level.timeLimit}s` : 'none']);
  csvRows.push([]);

  // Add actors section
  if (level.actors && level.actors.length > 0) {
    csvRows.push(['ACTORS / PLATFORMS']);
    csvRows.push(['ID', 'Kind', 'Position (x,y,z)', 'Movement Info']);

    for (const actor of level.actors) {
      const pos = `(${actor.x}, ${actor.y}, z=${actor.z ?? 0})`;
      let movement = '';

      if (actor.kind === 'moving_platform' && actor.path?.points?.length >= 2) {
        const pts = actor.path.points.map(p => `(${p.x}, ${p.y}, z=${p.z ?? actor.z ?? 0})`).join(' -> ');
        movement = `path: ${pts} | speed: ${actor.path.speed} | type: ${actor.path.type}`;
      } else if (actor.kind === 'elevator' && actor.travel) {
        movement = `elevator: z=${actor.travel.min} to z=${actor.travel.max} | speed: ${actor.travel.speed} | cycle: ${actor.travel.cycle}s`;
      } else if (actor.kind === 'sweeper' || actor.kind === 'rotating_bar') {
        movement = `rotation speed: ${actor.rotationSpeed ?? 'default'} | arm length: ${actor.armLength ?? 'default'}`;
      } else if (actor.kind === 'timed_gate') {
        movement = `open: ${actor.data?.openTime ?? '?'}s | closed: ${actor.data?.closeTime ?? '?'}s`;
      } else if (actor.kind === 'tunnel') {
        if (actor.tunnelPath?.length >= 2) {
          const entry = actor.tunnelPath[0];
          const exit = actor.tunnelPath[actor.tunnelPath.length - 1];
          movement = `entry: (${entry.x}, ${entry.y}, z=${entry.z}) -> exit: (${exit.x}, ${exit.y}, z=${exit.z})`;
        }
      }

      csvRows.push([actor.id || 'unnamed', actor.kind, pos, movement]);
    }
  }

  // Convert to CSV string (escape commas and quotes in cell values)
  const csvContent = csvRows.map(row => {
    return row.map(cell => {
      const s = String(cell ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');

  const filename = `${String(li).padStart(2, '0')}_${level.id}.csv`;
  fs.writeFileSync(path.join(outDir, filename), csvContent + '\n');
  console.log(`Exported: ${filename} (${cols}x${rows})`);
}

console.log(`\nDone! ${allMeta.length} maps exported to ${outDir}`);
