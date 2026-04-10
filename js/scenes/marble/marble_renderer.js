(() => {
  function fitCanvasToDisplay(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return {
      ctx,
      dpr,
      cssWidth: Math.max(1, rect.width),
      cssHeight: Math.max(1, rect.height)
    };
  }

  function createView(runtime, cssWidth, cssHeight) {
    const base = Math.min(cssWidth, cssHeight);
    const tileW = Math.max(56, Math.min(110, Math.min(cssWidth / 9.25, cssHeight / 6.4, base / 5.8)));
    const tileH = tileW * 0.5;
    const heightScale = tileH * 0.92;

    return {
      camX: runtime.camera?.x ?? runtime.marble.x,
      camY: runtime.camera?.y ?? runtime.marble.y,
      tileW,
      tileH,
      heightScale,
      screenCx: cssWidth * 0.5,
      screenCy: cssHeight * 0.42
    };
  }

  function worldProject(x, y, z, metrics) {
    return {
      x: (x - y) * (metrics.tileW * 0.5),
      y: (x + y) * (metrics.tileH * 0.5) - z * metrics.heightScale
    };
  }

  function project(x, y, z, view) {
    const p = worldProject(x, y, z, view);
    const cam = worldProject(view.camX, view.camY, 0, view);

    return {
      x: view.screenCx + p.x - cam.x,
      y: view.screenCy + p.y - cam.y
    };
  }

  function beginPoly(ctx, points) {
    if (!points?.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function darken(hex, amount = 0.8) {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);

    const nr = Math.max(0, Math.min(255, Math.round(r * amount)));
    const ng = Math.max(0, Math.min(255, Math.round(g * amount)));
    const nb = Math.max(0, Math.min(255, Math.round(b * amount)));

    return `rgb(${nr}, ${ng}, ${nb})`;
  }

  function getSurfaceColor(surface, trigger) {
    if (!surface || surface.kind === 'void') {
      return '#475569';
    }

    if (trigger?.kind === 'goal') {
      return '#22c55e';
    }

    if (trigger?.kind === 'hazard') {
      return '#ef4444';
    }

    return '#94a3b8';
  }

  function getBlockerColor() {
    return '#334155';
  }

  function renderBackground(ctx, cssWidth, cssHeight) {
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(1, '#070b12');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.globalAlpha = 0.18;

    const glowA = ctx.createRadialGradient(
      cssWidth * 0.25,
      cssHeight * 0.22,
      10,
      cssWidth * 0.25,
      cssHeight * 0.22,
      cssWidth * 0.35
    );
    glowA.addColorStop(0, 'rgba(125,211,252,0.45)');
    glowA.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowB = ctx.createRadialGradient(
      cssWidth * 0.8,
      cssHeight * 0.78,
      10,
      cssWidth * 0.8,
      cssHeight * 0.78,
      cssWidth * 0.28
    );
    glowB.addColorStop(0, 'rgba(192,132,252,0.35)');
    glowB.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.restore();
  }

  function getSurfaceCorners(level, tx, ty) {
    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    const h = window.MarbleLevels.getSurfaceCornerHeights(surface);

    return {
      nw: { x: tx, y: ty, z: h.nw },
      ne: { x: tx + 1, y: ty, z: h.ne },
      se: { x: tx + 1, y: ty + 1, z: h.se },
      sw: { x: tx, y: ty + 1, z: h.sw }
    };
  }

  function getNorthEdgeHeightsForCell(level, tx, ty, fallbackZ) {
    const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
    if (blocker) {
      return { left: blocker.top, right: blocker.top };
    }

    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!surface || surface.kind === 'void') {
      return { left: fallbackZ, right: fallbackZ };
    }

    const h = window.MarbleLevels.getSurfaceCornerHeights(surface);
    return { left: h.nw, right: h.ne };
  }

  function getSouthEdgeHeightsForCell(level, tx, ty, fallbackZ) {
    const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
    if (blocker) {
      return { left: blocker.top, right: blocker.top };
    }

    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!surface || surface.kind === 'void') {
      return { left: fallbackZ, right: fallbackZ };
    }

    const h = window.MarbleLevels.getSurfaceCornerHeights(surface);
    return { left: h.sw, right: h.se };
  }

  function getWestEdgeHeightsForCell(level, tx, ty, fallbackZ) {
    const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
    if (blocker) {
      return { top: blocker.top, bottom: blocker.top };
    }

    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!surface || surface.kind === 'void') {
      return { top: fallbackZ, bottom: fallbackZ };
    }

    const h = window.MarbleLevels.getSurfaceCornerHeights(surface);
    return { top: h.nw, bottom: h.sw };
  }

  function getEastEdgeHeightsForCell(level, tx, ty, fallbackZ) {
    const blocker = window.MarbleLevels.getBlockerCell(level, tx, ty);
    if (blocker) {
      return { top: blocker.top, bottom: blocker.top };
    }

    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!surface || surface.kind === 'void') {
      return { top: fallbackZ, bottom: fallbackZ };
    }

    const h = window.MarbleLevels.getSurfaceCornerHeights(surface);
    return { top: h.ne, bottom: h.se };
  }

  function buildSurfaceTileGeometry(level, tx, ty, view) {
    const surface = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!surface || surface.kind === 'void') return null;

    const trigger = window.MarbleLevels.getTriggerCell(level, tx, ty);
    const corners = getSurfaceCorners(level, tx, ty);
    const top = [
      project(corners.nw.x, corners.nw.y, corners.nw.z, view),
      project(corners.ne.x, corners.ne.y, corners.ne.z, view),
      project(corners.se.x, corners.se.y, corners.se.z, view),
      project(corners.sw.x, corners.sw.y, corners.sw.z, view)
    ];

    const baseColor = getSurfaceColor(surface, trigger);
    const fallbackZ = level.voidFloor ?? -1.5;
    const southNeighbor = getNorthEdgeHeightsForCell(level, tx, ty + 1, fallbackZ);
    const eastNeighbor = getWestEdgeHeightsForCell(level, tx + 1, ty, fallbackZ);

    const southTopAvg = (corners.sw.z + corners.se.z) * 0.5;
    const southBottomAvg = (southNeighbor.left + southNeighbor.right) * 0.5;
    const eastTopAvg = (corners.ne.z + corners.se.z) * 0.5;
    const eastBottomAvg = (eastNeighbor.top + eastNeighbor.bottom) * 0.5;

    let southFace = null;
    let eastFace = null;

    if (southTopAvg > southBottomAvg + 0.01) {
      southFace = [
        project(corners.sw.x, corners.sw.y, corners.sw.z, view),
        project(corners.se.x, corners.se.y, corners.se.z, view),
        project(corners.se.x, corners.se.y, southNeighbor.right, view),
        project(corners.sw.x, corners.sw.y, southNeighbor.left, view)
      ];
    }

    if (eastTopAvg > eastBottomAvg + 0.01) {
      eastFace = [
        project(corners.ne.x, corners.ne.y, corners.ne.z, view),
        project(corners.se.x, corners.se.y, corners.se.z, view),
        project(corners.se.x, corners.se.y, eastNeighbor.bottom, view),
        project(corners.ne.x, corners.ne.y, eastNeighbor.top, view)
      ];
    }

    const avgTopZ = (corners.nw.z + corners.ne.z + corners.se.z + corners.sw.z) * 0.25;

    return {
      tx,
      ty,
      surface,
      trigger,
      baseColor,
      top,
      southFace,
      eastFace,
      avgTopZ
    };
  }

  function buildBlockerCubeGeometry(tx, ty, z0, view) {
    const z1 = z0 + 1;

    return {
      tx,
      ty,
      z0,
      z1,
      top: [
        project(tx, ty, z1, view),
        project(tx + 1, ty, z1, view),
        project(tx + 1, ty + 1, z1, view),
        project(tx, ty + 1, z1, view)
      ],
      southFace: [
        project(tx, ty + 1, z1, view),
        project(tx + 1, ty + 1, z1, view),
        project(tx + 1, ty + 1, z0, view),
        project(tx, ty + 1, z0, view)
      ],
      eastFace: [
        project(tx + 1, ty, z1, view),
        project(tx + 1, ty + 1, z1, view),
        project(tx + 1, ty + 1, z0, view),
        project(tx + 1, ty, z0, view)
      ]
    };
  }

  function renderTileFacePolygon(ctx, points, fillStyle) {
    if (!points) return;
    beginPoly(ctx, points);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function getVisualSupportZ(level, x, y, radius, fallbackZ) {
    const ringA = Math.max(radius * 1.15, 0.28);
    const ringB = Math.max(radius * 2.1, 0.55);
    const dA = ringA * 0.7071;
    const dB = ringB * 0.7071;

    const offsets = [
      [0, 0],
      [ringA, 0],
      [-ringA, 0],
      [0, ringA],
      [0, -ringA],
      [dA, dA],
      [dA, -dA],
      [-dA, dA],
      [-dA, -dA],
      [ringB, 0],
      [-ringB, 0],
      [0, ringB],
      [0, -ringB],
      [dB, dB],
      [dB, -dB],
      [-dB, dB],
      [-dB, -dB]
    ];

    for (const [ox, oy] of offsets) {
      const sample = window.MarbleLevels.sampleVisualSurface(level, x + ox, y + oy);
      if (sample) {
        return sample.z;
      }
    }

    return fallbackZ;
  }

  function getPlayerReferenceZ(runtime) {
    return getVisualSupportZ(
      runtime.level,
      runtime.marble.x,
      runtime.marble.y,
      runtime.marble.supportRadius,
      runtime.marble.z - runtime.marble.collisionRadius
    );
  }

  function renderRelativeHeightCue(ctx, geom, runtime) {
    const playerZ = getPlayerReferenceZ(runtime);
    const diff = geom.avgTopZ - playerZ;

    if (Math.abs(diff) < 0.35) return;

    if (diff > 0) {
      const alpha = Math.min(0.28, 0.07 + diff * 0.045);
      beginPoly(ctx, geom.top);
      ctx.fillStyle = `rgba(96,165,250,${alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(191,219,254,${Math.min(0.55, alpha + 0.12)})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      return;
    }

    const alpha = Math.min(0.22, 0.06 + Math.abs(diff) * 0.035);
    beginPoly(ctx, geom.top);
    ctx.fillStyle = `rgba(245,158,11,${alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(253,224,71,${Math.min(0.42, alpha + 0.08)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function renderSurfaceTop(ctx, geom, runtime) {
    if (!geom) return;

    beginPoly(ctx, geom.top);
    ctx.fillStyle = geom.baseColor;
    ctx.fill();

    renderRelativeHeightCue(ctx, geom, runtime);

    ctx.strokeStyle = 'rgba(241,245,249,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (geom.trigger?.kind === 'hazard') {
      ctx.beginPath();
      ctx.moveTo(geom.top[0].x, geom.top[0].y);
      ctx.lineTo(geom.top[2].x, geom.top[2].y);
      ctx.moveTo(geom.top[1].x, geom.top[1].y);
      ctx.lineTo(geom.top[3].x, geom.top[3].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function renderSurfaceTile(ctx, runtime, tx, ty, view) {
    const geom = buildSurfaceTileGeometry(runtime.level, tx, ty, view);
    if (!geom) return;

    renderTileFacePolygon(ctx, geom.southFace, darken(geom.baseColor, 0.55));
    renderTileFacePolygon(ctx, geom.eastFace, darken(geom.baseColor, 0.7));
    renderSurfaceTop(ctx, geom, runtime);
  }

  function getBlockerTop(level, tx, ty) {
    return window.MarbleLevels.getBlockerTop(level, tx, ty) ?? 0;
  }

  function isBlockerTopBuried(level, tx, ty, blockerTop, fallbackZ) {
    const northTop = Math.max(...Object.values(getSouthEdgeHeightsForCell(level, tx, ty - 1, fallbackZ)));
    const southTop = Math.max(...Object.values(getNorthEdgeHeightsForCell(level, tx, ty + 1, fallbackZ)));
    const eastTop = Math.max(...Object.values(getWestEdgeHeightsForCell(level, tx + 1, ty, fallbackZ)));
    const westTop = Math.max(...Object.values(getEastEdgeHeightsForCell(level, tx - 1, ty, fallbackZ)));
    const eps = 0.01;

    return (
      northTop >= blockerTop - eps &&
      southTop >= blockerTop - eps &&
      eastTop >= blockerTop - eps &&
      westTop >= blockerTop - eps
    );
  }

  function renderBlockerTile(ctx, runtime, tx, ty, view) {
    const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
    if (!blocker) return;

    const fallbackZ = runtime.level.voidFloor ?? -1.5;
    const baseColor = getBlockerColor();
    const blockerTop = blocker.top;
    const southNeighbor = getNorthEdgeHeightsForCell(runtime.level, tx, ty + 1, fallbackZ);
    const eastNeighbor = getWestEdgeHeightsForCell(runtime.level, tx + 1, ty, fallbackZ);
    const southNeighborTop = Math.max(southNeighbor.left, southNeighbor.right);
    const eastNeighborTop = Math.max(eastNeighbor.top, eastNeighbor.bottom);

    for (let z = 0; z < blockerTop; z += 1) {
      const cube = buildBlockerCubeGeometry(tx, ty, z, view);

      if (cube.z1 > southNeighborTop + 0.01) {
        renderTileFacePolygon(ctx, cube.southFace, darken(baseColor, 0.55));
      }

      if (cube.z1 > eastNeighborTop + 0.01) {
        renderTileFacePolygon(ctx, cube.eastFace, darken(baseColor, 0.7));
      }
    }

    if (!isBlockerTopBuried(runtime.level, tx, ty, blockerTop, fallbackZ)) {
      const topCube = buildBlockerCubeGeometry(tx, ty, blockerTop - 1, view);
      beginPoly(ctx, topCube.top);
      ctx.fillStyle = baseColor;
      ctx.fill();
      ctx.strokeStyle = 'rgba(241,245,249,0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function getTileDrawOrder(level) {
    const tiles = [];

    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        tiles.push({ tx, ty, depth: tx + ty });
      }
    }

    tiles.sort((a, b) => {
      if (a.depth !== b.depth) return a.depth - b.depth;
      if (a.ty !== b.ty) return a.ty - b.ty;
      return a.tx - b.tx;
    });

    return tiles;
  }

  function renderTerrain(ctx, runtime, view) {
    const tiles = getTileDrawOrder(runtime.level);

    for (const { tx, ty } of tiles) {
      renderSurfaceTile(ctx, runtime, tx, ty, view);
      renderBlockerTile(ctx, runtime, tx, ty, view);
    }
  }

  function resolveGoalPosition(level) {
    if (level.goal) {
      return level.goal;
    }

    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        const trigger = window.MarbleLevels.getTriggerCell(level, tx, ty);
        if (trigger?.kind === 'goal') {
          return {
            x: tx + 0.5,
            y: ty + 0.5,
            radius: trigger.radius ?? 0.42
          };
        }
      }
    }

    return null;
  }

  function renderGoal(ctx, runtime, view) {
    const goal = resolveGoalPosition(runtime.level);
    if (!goal) return;

    const goalSurface = window.MarbleLevels.sampleVisualSurface(runtime.level, goal.x, goal.y);
    const goalZ = (goalSurface ? goalSurface.z : 0) + 0.25;
    const p = project(goal.x, goal.y, goalZ, view);
    const radius = Math.max(8, view.tileW * goal.radius * 0.42);

    ctx.save();

    const gradient = ctx.createRadialGradient(
      p.x - radius * 0.25,
      p.y - radius * 0.35,
      radius * 0.15,
      p.x,
      p.y,
      radius
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(110,231,183,0.95)');
    gradient.addColorStop(1, 'rgba(34,197,94,0.48)');

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(220,252,231,0.8)';
    ctx.stroke();

    ctx.restore();
  }

  function getMarbleProjection(runtime, view) {
    const marble = runtime.marble;
    const shadowZ = getVisualSupportZ(
      runtime.level,
      marble.x,
      marble.y,
      marble.supportRadius,
      runtime.level.voidFloor ?? -1.5
    );

    const shadow = project(marble.x, marble.y, shadowZ, view);
    const ball = project(marble.x, marble.y, marble.z, view);
    const radius = Math.max(8, view.tileW * marble.renderRadius * 0.9);

    return {
      shadow,
      ball,
      radius,
      shadowZ
    };
  }

  function ensureScratchCanvas(runtime, width, height, dpr) {
    if (!runtime._renderScratch) {
      runtime._renderScratch = {
        marble: document.createElement('canvas'),
        mask: document.createElement('canvas')
      };
    }

    const cssWidth = width / dpr;
    const cssHeight = height / dpr;

    for (const canvas of Object.values(runtime._renderScratch)) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
    }

    return runtime._renderScratch;
  }

  function renderMarbleBody(ctx, projection) {
    const { shadow, ball, radius } = projection;

    ctx.save();

    ctx.beginPath();
    ctx.ellipse(
      shadow.x,
      shadow.y + radius * 0.35,
      radius * 0.95,
      radius * 0.48,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      ball.x - radius * 0.35,
      ball.y - radius * 0.48,
      radius * 0.14,
      ball.x,
      ball.y,
      radius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.2, '#cbd5e1');
    gradient.addColorStop(1, '#64748b');

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ball.x - radius * 0.25, ball.y - radius * 0.32, radius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    ctx.restore();
  }

  function getFaceBounds(points) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }

    return { minX, maxX, minY, maxY };
  }

  function faceIntersectsMarble(face, ball, radius, padX = 1, padY = 1) {
    if (!face) return false;
    const bounds = getFaceBounds(face);
    return !(
      bounds.maxX < ball.x - radius * padX ||
      bounds.minX > ball.x + radius * padX ||
      bounds.maxY < ball.y - radius * padY ||
      bounds.minY > ball.y + radius * padY
    );
  }

  function collectMarbleOccluders(runtime, view, projection) {
    const occluders = [];
    const marble = runtime.marble;
    const marbleBottomZ = marble.z - marble.collisionRadius;
    const { ball, radius } = projection;
    const fallbackZ = runtime.level.voidFloor ?? -1.5;
    const baseColor = getBlockerColor();

    for (let ty = 0; ty < runtime.level.height; ty += 1) {
      for (let tx = 0; tx < runtime.level.width; tx += 1) {
        const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
        if (!blocker) continue;

        const blockerTop = blocker.top;
        const southNeighbor = getNorthEdgeHeightsForCell(runtime.level, tx, ty + 1, fallbackZ);
        const eastNeighbor = getWestEdgeHeightsForCell(runtime.level, tx + 1, ty, fallbackZ);
        const southNeighborTop = Math.max(southNeighbor.left, southNeighbor.right);
        const eastNeighborTop = Math.max(eastNeighbor.top, eastNeighbor.bottom);

        for (let z = 0; z < blockerTop; z += 1) {
          const cube = buildBlockerCubeGeometry(tx, ty, z, view);

          if (marbleBottomZ >= cube.z1 - 0.01) {
            continue;
          }

          if (
            cube.z1 > southNeighborTop + 0.01 &&
            marble.y < ty + 1 - 0.001 &&
            faceIntersectsMarble(cube.southFace, ball, radius, 1.05, 1.1)
          ) {
            occluders.push({ points: cube.southFace, fill: darken(baseColor, 0.55) });
          }

          if (
            cube.z1 > eastNeighborTop + 0.01 &&
            marble.x < tx + 1 - 0.001 &&
            faceIntersectsMarble(cube.eastFace, ball, radius, 1.15, 1.05)
          ) {
            occluders.push({ points: cube.eastFace, fill: darken(baseColor, 0.7) });
          }
        }

        if (
          marbleBottomZ < blockerTop - 0.01 &&
          !isBlockerTopBuried(runtime.level, tx, ty, blockerTop, fallbackZ)
        ) {
          const cube = buildBlockerCubeGeometry(tx, ty, blockerTop - 1, view);
          const closeInWorld = (
            marble.x > tx - marble.renderRadius &&
            marble.x < tx + 1 + marble.renderRadius &&
            marble.y > ty - marble.renderRadius &&
            marble.y < ty + 1 + marble.renderRadius
          );

          if (closeInWorld && faceIntersectsMarble(cube.top, ball, radius, 1.0, 1.15)) {
            occluders.push({ points: cube.top, fill: baseColor });
          }
        }
      }
    }

    return occluders;
  }

  function renderMarbleMasked(ctx, runtime, view, cssWidth, cssHeight, dpr) {
    const projection = getMarbleProjection(runtime, view);
    const scratch = ensureScratchCanvas(runtime, Math.round(cssWidth * dpr), Math.round(cssHeight * dpr), dpr);
    const marbleCtx = scratch.marble.getContext('2d');
    const maskCtx = scratch.mask.getContext('2d');

    renderMarbleBody(marbleCtx, projection);

    const occluders = collectMarbleOccluders(runtime, view, projection);

    if (occluders.length) {
      maskCtx.save();
      maskCtx.fillStyle = '#ffffff';
      for (const occluder of occluders) {
        beginPoly(maskCtx, occluder.points);
        maskCtx.fill();
      }
      maskCtx.restore();

      marbleCtx.save();
      marbleCtx.globalCompositeOperation = 'destination-out';
      marbleCtx.drawImage(scratch.mask, 0, 0, cssWidth, cssHeight);
      marbleCtx.restore();
    }

    ctx.drawImage(scratch.marble, 0, 0, cssWidth, cssHeight);

    for (const occluder of occluders) {
      renderTileFacePolygon(ctx, occluder.points, occluder.fill);
    }
  }

  function renderStatus(ctx, runtime, cssWidth) {
    if (runtime.status === 'running') return;

    ctx.save();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,237,243,0.88)';

    const label = runtime.status === 'completed' ? 'Cleared' : runtime.status === 'failed' ? 'Failed' : runtime.status;
    ctx.fillText(label, cssWidth - 18, 28);
    ctx.restore();
  }

  function draw(runtime, canvas) {
    if (!runtime || !canvas) return;

    const { ctx, dpr, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
    const view = createView(runtime, cssWidth, cssHeight);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    renderBackground(ctx, cssWidth, cssHeight);
    renderTerrain(ctx, runtime, view);
    renderGoal(ctx, runtime, view);
    renderMarbleMasked(ctx, runtime, view, cssWidth, cssHeight, dpr);
    renderStatus(ctx, runtime, cssWidth);
  }

  function render(runtime, canvas) {
    draw(runtime, canvas);
  }

  function prepare(runtime) {
    return runtime;
  }

  window.MarbleRenderer = {
    render,
    prepare
  };
})();
