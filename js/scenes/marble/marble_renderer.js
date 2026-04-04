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
      cssWidth: Math.max(1, rect.width),
      cssHeight: Math.max(1, rect.height)
    };
  }

    function createView(runtime, cssWidth, cssHeight) {
    const base = Math.min(cssWidth, cssHeight);

    const tileW = Math.max(
      56,
      Math.min(
        110,
        Math.min(cssWidth / 9.25, cssHeight / 6.4, base / 5.8)
      )
    );

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
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
  }

  function averageY(points) {
    return points.reduce((sum, point) => sum + point.y, 0) / Math.max(1, points.length);
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

  function getNeighborHeights(level, tx, ty, fallbackZ) {
    const cell = window.MarbleLevels.getCell(level, tx, ty);
    if (!cell || cell.kind === 'void') {
      return { nw: fallbackZ, ne: fallbackZ, se: fallbackZ, sw: fallbackZ };
    }
    return window.MarbleLevels.getCellCornerHeights(cell);
  }

  function buildTileGeometry(level, tx, ty, view) {
    const cell = window.MarbleLevels.getCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return null;

    const corners = getTileCorners(level, tx, ty);
    const top = [
      project(corners.nw.x, corners.nw.y, corners.nw.z, view),
      project(corners.ne.x, corners.ne.y, corners.ne.z, view),
      project(corners.se.x, corners.se.y, corners.se.z, view),
      project(corners.sw.x, corners.sw.y, corners.sw.z, view)
    ];

    const baseColor = getTrackColor(cell);
    const voidFloor = level.voidFloor ?? -1.5;

    const southNeighborHeights = getNeighborHeights(level, tx, ty + 1, voidFloor);
    const eastNeighborHeights = getNeighborHeights(level, tx + 1, ty, voidFloor);

    const southTopAvg = (corners.sw.z + corners.se.z) * 0.5;
    const southBottomAvg = (southNeighborHeights.nw + southNeighborHeights.ne) * 0.5;
    const eastTopAvg = (corners.ne.z + corners.se.z) * 0.5;
    const eastBottomAvg = (eastNeighborHeights.nw + eastNeighborHeights.sw) * 0.5;

    let southFace = null;
    let eastFace = null;

    if (southTopAvg > southBottomAvg + 0.01) {
      southFace = [
        project(corners.sw.x, corners.sw.y, corners.sw.z, view),
        project(corners.se.x, corners.se.y, corners.se.z, view),
        project(corners.se.x, corners.se.y, southNeighborHeights.ne, view),
        project(corners.sw.x, corners.sw.y, southNeighborHeights.nw, view)
      ];
    }

    if (eastTopAvg > eastBottomAvg + 0.01) {
      eastFace = [
        project(corners.ne.x, corners.ne.y, corners.ne.z, view),
        project(corners.se.x, corners.se.y, corners.se.z, view),
        project(corners.se.x, corners.se.y, eastNeighborHeights.sw, view),
        project(corners.ne.x, corners.ne.y, eastNeighborHeights.nw, view)
      ];
    }

    return {
      cell,
      baseColor,
      top,
      southFace,
      eastFace
    };
  }

  function renderTileFaces(ctx, geom) {
    if (!geom) return;

    if (geom.southFace) {
      beginPoly(ctx, geom.southFace);
      ctx.fillStyle = darken(geom.baseColor, 0.55);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }

    if (geom.eastFace) {
      beginPoly(ctx, geom.eastFace);
      ctx.fillStyle = darken(geom.baseColor, 0.7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    }
  }

  function renderTileTop(ctx, geom) {
    if (!geom) return;

    beginPoly(ctx, geom.top);
    ctx.fillStyle = geom.baseColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,245,249,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (geom.cell.kind === 'hazard') {
      ctx.beginPath();
      ctx.moveTo(geom.top[0].x, geom.top[0].y);
      ctx.lineTo(geom.top[2].x, geom.top[2].y);
      ctx.moveTo(geom.top[1].x, geom.top[1].y);
      ctx.lineTo(geom.top[3].x, geom.top[3].y);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
    }
  }

  function renderStage(ctx, runtime, view) {
    for (let ty = 0; ty < runtime.level.height; ty += 1) {
      for (let tx = 0; tx < runtime.level.width; tx += 1) {
        const geom = buildTileGeometry(runtime.level, tx, ty, view);
        if (!geom) continue;
        renderTileFaces(ctx, geom);
        renderTileTop(ctx, geom);
      }
    }
  }

  function renderGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    const goalSurface = window.MarbleLevels.sampleCellSurface(
      runtime.level,
      goal.x,
      goal.y
    );
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
    const shadowSurface = window.MarbleLevels.sampleCellSurface(
      runtime.level,
      marble.x,
      marble.y
    );
    const shadowZ = shadowSurface ? shadowSurface.z : runtime.level.voidFloor ?? -1.5;

    const shadow = project(marble.x, marble.y, shadowZ, view);
    const ball = project(marble.x, marble.y, marble.z, view);
    const radius = Math.max(8, view.tileW * marble.radius * 0.9);

    return {
      shadow,
      ball,
      radius,
      shadowZ
    };
  }

  function renderMarble(ctx, runtime, view) {
    const { shadow, ball, radius } = getMarbleProjection(runtime, view);

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

  function faceCanOccludeMarble(face, marbleBall, marbleRadius) {
    if (!face) return false;

    const bounds = getFaceBounds(face);
    const horizontalMargin = marbleRadius * 0.;
    const verticalMargin = marbleRadius * 0.35;

    const overlapsX =
      bounds.maxX >= marbleBall.x - horizontalMargin &&
      bounds.minX <= marbleBall.x + horizontalMargin;

    const faceIsInFront =
      bounds.maxY >= marbleBall.y - verticalMargin;

    return overlapsX && faceIsInFront;
  }

  function renderFrontOccluders(ctx, runtime, view) {
    const { ball, radius } = getMarbleProjection(runtime, view);

    for (let ty = 0; ty < runtime.level.height; ty += 1) {
      for (let tx = 0; tx < runtime.level.width; tx += 1) {
        const geom = buildTileGeometry(runtime.level, tx, ty, view);
        if (!geom) continue;

        if (geom.southFace && faceCanOccludeMarble(geom.southFace, ball, radius)) {
          beginPoly(ctx, geom.southFace);
          ctx.fillStyle = darken(geom.baseColor, 0.55);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.stroke();
        }

        if (geom.eastFace && faceCanOccludeMarble(geom.eastFace, ball, radius)) {
          beginPoly(ctx, geom.eastFace);
          ctx.fillStyle = darken(geom.baseColor, 0.7);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.stroke();
        }
      }
    }
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

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    renderBackground(ctx, cssWidth, cssHeight);

    renderStage(ctx, runtime, view);
    renderGoal(ctx, runtime, view);
    renderMarble(ctx, runtime, view);
    renderFrontOccluders(ctx, runtime, view);
    renderStatus(ctx, runtime, cssWidth);
  }

  function render(runtime, canvas) {
    draw(runtime, canvas);
  }

  function prepare() {}

  window.MarbleRenderer = {
    render,
    prepare
  };
})();