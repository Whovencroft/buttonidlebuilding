(() => {
  const stageCacheByKey = new Map();

  function resolveCssSize(source) {
    if (!source) return { width: 0, height: 0 };

    if (
      typeof source.width === 'number' &&
      typeof source.height === 'number'
    ) {
      return {
        width: Math.max(0, source.width),
        height: Math.max(0, source.height)
      };
    }

    if (typeof source.getBoundingClientRect === 'function') {
      const rect = source.getBoundingClientRect();
      return {
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height)
      };
    }

    return { width: 0, height: 0 };
  }

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
      cssWidth: Math.max(1, rect.width),
      cssHeight: Math.max(1, rect.height)
    };
  }

  function createView(runtime, cssWidth, cssHeight) {
    const tileW = Math.max(104, Math.min(188, cssWidth / 4.6));
    const tileH = tileW * 0.5;
    const heightScale = tileH * 1.02;

    return {
      camX: runtime.camera?.x ?? runtime.marble.x,
      camY: runtime.camera?.y ?? runtime.marble.y,
      tileW,
      tileH,
      heightScale,
      screenCx: cssWidth * 0.5,
      screenCy: cssHeight * 0.56
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
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function getTileCorners(level, tx, ty) {
    const cell = window.MarbleLevels.getCell(level, tx, ty);
    const h = window.MarbleLevels.getCellCornerHeights(cell);

    return {
      nw: { x: tx, y: ty, z: h.nw },
      ne: { x: tx + 1, y: ty, z: h.ne },
      se: { x: tx + 1, y: ty + 1, z: h.se },
      sw: { x: tx, y: ty + 1, z: h.sw }
    };
  }

  function getTrackColor(cell) {
    if (!cell) return '#475569';

    switch (cell.kind) {
      case 'goal':
        return '#22c55e';
      case 'hazard':
        return '#ef4444';
      case 'wall':
        return '#475569';
      default:
        return '#94a3b8';
    }
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

  function getLevelMaxHeight(level) {
    let maxH = 0;

    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        const cell = window.MarbleLevels.getCell(level, tx, ty);
        if (!cell || cell.kind === 'void') continue;
        const heights = window.MarbleLevels.getCellCornerHeights(cell);
        maxH = Math.max(maxH, heights.nw, heights.ne, heights.se, heights.sw);
      }
    }

    return maxH;
  }

  function renderStaticTile(ctx, level, tx, ty, metrics, worldToCache) {
    const cell = window.MarbleLevels.getCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return;

    const corners = getTileCorners(level, tx, ty);
    const top = [
      worldToCache(worldProject(corners.nw.x, corners.nw.y, corners.nw.z, metrics)),
      worldToCache(worldProject(corners.ne.x, corners.ne.y, corners.ne.z, metrics)),
      worldToCache(worldProject(corners.se.x, corners.se.y, corners.se.z, metrics)),
      worldToCache(worldProject(corners.sw.x, corners.sw.y, corners.sw.z, metrics))
    ];

    const baseColor = getTrackColor(cell);
    const southNeighbor = window.MarbleLevels.getCell(level, tx, ty + 1);
    const eastNeighbor = window.MarbleLevels.getCell(level, tx + 1, ty);
    const voidFloor = level.voidFloor ?? -1.5;

    const southNeighborHeights =
      southNeighbor && southNeighbor.kind !== 'void'
        ? window.MarbleLevels.getCellCornerHeights(southNeighbor)
        : { nw: voidFloor, ne: voidFloor, se: voidFloor, sw: voidFloor };

    const eastNeighborHeights =
      eastNeighbor && eastNeighbor.kind !== 'void'
        ? window.MarbleLevels.getCellCornerHeights(eastNeighbor)
        : { nw: voidFloor, ne: voidFloor, se: voidFloor, sw: voidFloor };

    const southTopAvg = (corners.sw.z + corners.se.z) * 0.5;
    const southBottomAvg = (southNeighborHeights.nw + southNeighborHeights.ne) * 0.5;
    const eastTopAvg = (corners.ne.z + corners.se.z) * 0.5;
    const eastBottomAvg = (eastNeighborHeights.nw + eastNeighborHeights.sw) * 0.5;

    if (southTopAvg > southBottomAvg + 0.01) {
      const southFace = [
        worldToCache(worldProject(corners.sw.x, corners.sw.y, corners.sw.z, metrics)),
        worldToCache(worldProject(corners.se.x, corners.se.y, corners.se.z, metrics)),
        worldToCache(worldProject(corners.se.x, corners.se.y, southNeighborHeights.ne, metrics)),
        worldToCache(worldProject(corners.sw.x, corners.sw.y, southNeighborHeights.nw, metrics))
      ];

      beginPoly(ctx, southFace);
      ctx.fillStyle = darken(baseColor, 0.55);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }

    if (eastTopAvg > eastBottomAvg + 0.01) {
      const eastFace = [
        worldToCache(worldProject(corners.ne.x, corners.ne.y, corners.ne.z, metrics)),
        worldToCache(worldProject(corners.se.x, corners.se.y, corners.se.z, metrics)),
        worldToCache(worldProject(corners.se.x, corners.se.y, eastNeighborHeights.sw, metrics)),
        worldToCache(worldProject(corners.ne.x, corners.ne.y, eastNeighborHeights.nw, metrics))
      ];

      beginPoly(ctx, eastFace);
      ctx.fillStyle = darken(baseColor, 0.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }

    beginPoly(ctx, top);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,245,249,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (cell.kind === 'hazard') {
      ctx.beginPath();
      ctx.moveTo(top[0].x, top[0].y);
      ctx.lineTo(top[2].x, top[2].y);
      ctx.moveTo(top[1].x, top[1].y);
      ctx.lineTo(top[3].x, top[3].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
    }
  }

  function renderStaticGoal(ctx, level, metrics, worldToCache) {
    const goal = level.goal;
    const p = worldToCache(worldProject(goal.x, goal.y, 1.25, metrics));
    const radius = Math.max(8, metrics.tileW * goal.radius * 0.42);

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

  function buildStageCache(level, metrics) {
    const padding = Math.ceil(metrics.tileW * 2);
    const maxH = getLevelMaxHeight(level);

    const minX = -(level.height + 3) * (metrics.tileW * 0.5);
    const maxX = (level.width + 3) * (metrics.tileW * 0.5);
    const minY = -(maxH + 5) * metrics.heightScale - metrics.tileH * 3;
    const maxY = (level.width + level.height + 4) * (metrics.tileH * 0.5) + metrics.tileH * 6;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(maxX - minX + padding * 2));
    canvas.height = Math.max(1, Math.ceil(maxY - minY + padding * 2));

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    function worldToCache(point) {
      return {
        x: point.x - minX + padding,
        y: point.y - minY + padding
      };
    }

    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        renderStaticTile(ctx, level, tx, ty, metrics, worldToCache);
      }
    }

    renderStaticGoal(ctx, level, metrics, worldToCache);

    return {
      canvas,
      minX,
      minY,
      padding
    };
  }

  function getStageCache(runtime, cssWidth, cssHeight) {
    const metrics = createView(runtime, cssWidth, cssHeight);
    const key =
      `${runtime.level.id}|` +
      `${Math.round(metrics.tileW * 100)}|` +
      `${Math.round(metrics.tileH * 100)}|` +
      `${Math.round(metrics.heightScale * 100)}`;

    let cache = stageCacheByKey.get(key);
    if (!cache) {
      cache = buildStageCache(runtime.level, metrics);
      stageCacheByKey.set(key, cache);
    }

    return cache;
  }

  function renderMarble(ctx, runtime, view) {
    const marble = runtime.marble;
    const shadowSurface = window.MarbleLevels.sampleCellSurface(
      runtime.level,
      marble.x,
      marble.y
    );
    const shadowZ = shadowSurface ? shadowSurface.z : runtime.level.voidFloor ?? -1.5;

    const shadow = project(marble.x, marble.y, shadowZ, view);
    const ball = project(marble.x, marble.y, marble.z, view);
    const radius = Math.max(8, view.tileW * marble.radius * 0.9);

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
    ctx.arc(
      ball.x - radius * 0.25,
      ball.y - radius * 0.32,
      radius * 0.2,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    ctx.restore();
  }

  function renderStatus(ctx, runtime, cssWidth) {
    if (runtime.status === 'running') return;

    ctx.save();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,237,243,0.88)';

    const label =
      runtime.status === 'completed'
        ? 'Cleared'
        : runtime.status === 'failed'
          ? 'Failed'
          : runtime.status;

    ctx.fillText(label, cssWidth - 18, 28);
    ctx.restore();
  }

  function draw(runtime, canvas) {
    if (!runtime || !canvas) return;

    const { ctx, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
    const view = createView(runtime, cssWidth, cssHeight);
    const cache = getStageCache(runtime, cssWidth, cssHeight);
    const cam = worldProject(view.camX, view.camY, 0, view);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    renderBackground(ctx, cssWidth, cssHeight);

    const stageX = view.screenCx - cam.x + cache.minX - cache.padding;
    const stageY = view.screenCy - cam.y + cache.minY - cache.padding;
    ctx.drawImage(cache.canvas, stageX, stageY);

    renderMarble(ctx, runtime, view);
    renderStatus(ctx, runtime, cssWidth);
  }

  function render(runtime, canvas) {
    draw(runtime, canvas);
  }

  function prepare(runtime, source) {
    if (!runtime) return;
    const size = resolveCssSize(source);
    if (size.width < 16 || size.height < 16) return;
    getStageCache(runtime, size.width, size.height);
  }

  window.MarbleRenderer = {
    render,
    prepare
  };
})();