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
    return { ctx, dpr, cssWidth: Math.max(1, rect.width), cssHeight: Math.max(1, rect.height) };
  }

  function createView(runtime, cssWidth, cssHeight) {
    const base = Math.min(cssWidth, cssHeight);
    const tileW = Math.max(54, Math.min(110, Math.min(cssWidth / 10.5, cssHeight / 6.8, base / 5.8)));
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

  function worldProject(x, y, z, view) {
    return {
      x: (x - y) * (view.tileW * 0.5),
      y: (x + y) * (view.tileH * 0.5) - z * view.heightScale
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
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
  }

  function darken(hex, amount = 0.8) {
    const raw = hex.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgb(${Math.round(r * amount)}, ${Math.round(g * amount)}, ${Math.round(b * amount)})`;
  }

  function renderBackground(ctx, cssWidth, cssHeight) {
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, '#0b1323');
    gradient.addColorStop(1, '#04070e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.globalAlpha = 0.16;
    const glowA = ctx.createRadialGradient(cssWidth * 0.24, cssHeight * 0.2, 10, cssWidth * 0.24, cssHeight * 0.2, cssWidth * 0.3);
    glowA.addColorStop(0, 'rgba(125,211,252,0.42)');
    glowA.addColorStop(1, 'rgba(125,211,252,0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    const glowB = ctx.createRadialGradient(cssWidth * 0.78, cssHeight * 0.74, 10, cssWidth * 0.78, cssHeight * 0.74, cssWidth * 0.25);
    glowB.addColorStop(0, 'rgba(192,132,252,0.32)');
    glowB.addColorStop(1, 'rgba(192,132,252,0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    ctx.restore();
  }

  function getSurfaceBaseColor(cell, trigger) {
    if (!cell || cell.kind === 'void') return '#374151';
    if (trigger?.kind === 'goal') return '#22c55e';
    if (cell.landingPad) return '#16a34a';
    if (cell.bounce > 0) return '#38bdf8';
    if (cell.conveyor) return '#0891b2';
    if (cell.crumble) return '#d97706';
    if (cell.friction < 0.8) return '#60a5fa';
    if (cell.friction > 1.15) return '#8b5cf6';
    if (cell.failType) return '#dc2626';
    return '#94a3b8';
  }

  function getActorColor(actor) {
    switch (actor.kind) {
      case window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM:
        return '#64748b';
      case window.MarbleLevels.ACTOR_KINDS.ELEVATOR:
        return '#475569';
      case window.MarbleLevels.ACTOR_KINDS.TIMED_GATE:
        return '#7c2d12';
      case window.MarbleLevels.ACTOR_KINDS.ROTATING_BAR:
      case window.MarbleLevels.ACTOR_KINDS.SWEEPER:
        return '#ef4444';
      default:
        return '#64748b';
    }
  }

  function getShapeSamplePoints(cell, segments = 10) {
    const points = [];
    const S = window.MarbleLevels.SHAPES;
    if (!cell) return points;

    if (cell.shape === S.CURVE_CONVEX_NE) {
      points.push([0, 0], [1, 0]);
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        points.push([1 - Math.cos(angle) * 0.48, Math.sin(angle) * 0.48]);
      }
      points.push([0, 1]);
      return points;
    }
    if (cell.shape === S.CURVE_CONVEX_NW) {
      points.push([0, 0], [1, 1], [0, 1]);
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([Math.sin(angle) * 0.48, Math.cos(angle) * 0.48]);
      }
      return [[1, 0], ...curve, [1, 1], [0, 1], [0, 0]];
    }
    if (cell.shape === S.CURVE_CONVEX_SE) {
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([1 - Math.cos(angle) * 0.48, 1 - Math.sin(angle) * 0.48]);
      }
      return [[0, 0], [1, 0], [1, 1], ...curve.reverse(), [0, 1]];
    }
    if (cell.shape === S.CURVE_CONVEX_SW) {
      const curve = [];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        curve.push([Math.sin(angle) * 0.48, 1 - Math.cos(angle) * 0.48]);
      }
      return [[0, 0], [1, 0], [1, 1], [0, 1], ...curve.reverse()];
    }
    if (cell.shape === S.CURVE_CONCAVE_NE) {
      const points = [[0, 0], [1, 0]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (1 - i / segments);
        points.push([1 - Math.cos(angle) * 0.8, Math.sin(angle) * 0.8]);
      }
      points.push([0, 1]);
      return points;
    }
    if (cell.shape === S.CURVE_CONCAVE_NW) {
      const points = [[1, 0], [1, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        points.push([Math.sin(angle) * 0.8, Math.cos(angle) * 0.8]);
      }
      points.push([0, 0]);
      return points;
    }
    if (cell.shape === S.CURVE_CONCAVE_SE) {
      const points = [[0, 0], [1, 0], [1, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (1 - i / segments);
        points.push([1 - Math.cos(angle) * 0.8, 1 - Math.sin(angle) * 0.8]);
      }
      points.push([0, 1]);
      return points;
    }
    if (cell.shape === S.CURVE_CONCAVE_SW) {
      const points = [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (let i = 0; i <= segments; i += 1) {
        const angle = Math.PI * 0.5 * (i / segments);
        points.push([Math.sin(angle) * 0.8, 1 - Math.cos(angle) * 0.8]);
      }
      return points;
    }

    return [[0, 0], [1, 0], [1, 1], [0, 1]];
  }

  function buildSurfaceTopPolygon(level, runtime, tx, ty, view) {
    const cell = window.MarbleLevels.getSurfaceCell(level, tx, ty);
    if (!cell || cell.kind === 'void') return null;
    const runtimeState = runtime.dynamicState;
    const points = [];
    for (const [u, v] of getShapeSamplePoints(cell, 12)) {
      const sample = window.MarbleLevels.sampleWalkableSurface(level, tx + u, ty + v, { runtime: runtimeState });
      if (!sample || sample.source !== 'surface' || sample.tx !== tx || sample.ty !== ty) continue;
      points.push(project(tx + u, ty + v, sample.z, view));
    }
    return points.length >= 3 ? points : null;
  }

  function renderSurfaceTile(ctx, runtime, tx, ty, view) {
    const cell = window.MarbleLevels.getSurfaceCell(runtime.level, tx, ty);
    if (!cell || cell.kind === 'void') return;

    const top = buildSurfaceTopPolygon(runtime.level, runtime, tx, ty, view);
    if (!top) return;
    const trigger = window.MarbleLevels.getTriggerCell(runtime.level, tx, ty);
    const baseColor = getSurfaceBaseColor(cell, trigger);

    const fillTop = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty, { runtime: runtime.dynamicState });
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

    if (fillTop > southFill + 0.01) {
      const p1 = project(tx, ty + 1, fillTop, view);
      const p2 = project(tx + 1, ty + 1, fillTop, view);
      const p3 = project(tx + 1, ty + 1, southFill, view);
      const p4 = project(tx, ty + 1, southFill, view);
      beginPoly(ctx, [p1, p2, p3, p4]);
      ctx.fillStyle = darken(baseColor, 0.58);
      ctx.fill();
    }

    if (fillTop > eastFill + 0.01) {
      const p1 = project(tx + 1, ty, fillTop, view);
      const p2 = project(tx + 1, ty + 1, fillTop, view);
      const p3 = project(tx + 1, ty + 1, eastFill, view);
      const p4 = project(tx + 1, ty, eastFill, view);
      beginPoly(ctx, [p1, p2, p3, p4]);
      ctx.fillStyle = darken(baseColor, 0.72);
      ctx.fill();
    }

    beginPoly(ctx, top);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,245,249,0.16)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    if (cell.conveyor) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.02, view);
      const dx = cell.conveyor.x * 8;
      const dy = cell.conveyor.y * 8;
      ctx.beginPath();
      ctx.moveTo(center.x - dx, center.y - dy);
      ctx.lineTo(center.x + dx, center.y + dy);
      ctx.strokeStyle = 'rgba(224,242,254,0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    if (cell.crumble) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.02, view);
      ctx.beginPath();
      ctx.moveTo(center.x - 5, center.y - 3);
      ctx.lineTo(center.x + 4, center.y + 1);
      ctx.moveTo(center.x - 2, center.y + 4);
      ctx.lineTo(center.x + 6, center.y - 4);
      ctx.strokeStyle = 'rgba(255,237,213,0.88)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    if (cell.bounce > 0) {
      const center = project(tx + 0.5, ty + 0.5, window.MarbleLevels.getSurfaceTopZ(cell) + 0.03, view);
      ctx.beginPath();
      ctx.arc(center.x, center.y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(186,230,253,0.92)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  function renderBlockerTile(ctx, runtime, tx, ty, view) {
    const blocker = window.MarbleLevels.getBlockerCell(runtime.level, tx, ty);
    if (!blocker) return;
    const baseColor = blocker.transparent ? '#64748b' : '#334155';
    const top = blocker.top;
    const southFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx, ty + 1, { runtime: runtime.dynamicState });
    const eastFill = window.MarbleLevels.getFillTopAtCell(runtime.level, tx + 1, ty, { runtime: runtime.dynamicState });

    if (top > southFill + 0.01) {
      beginPoly(ctx, [
        project(tx, ty + 1, top, view),
        project(tx + 1, ty + 1, top, view),
        project(tx + 1, ty + 1, southFill, view),
        project(tx, ty + 1, southFill, view)
      ]);
      ctx.fillStyle = darken(baseColor, 0.55);
      ctx.fill();
    }

    if (top > eastFill + 0.01) {
      beginPoly(ctx, [
        project(tx + 1, ty, top, view),
        project(tx + 1, ty + 1, top, view),
        project(tx + 1, ty + 1, eastFill, view),
        project(tx + 1, ty, eastFill, view)
      ]);
      ctx.fillStyle = darken(baseColor, 0.7);
      ctx.fill();
    }

    beginPoly(ctx, [
      project(tx, ty, top, view),
      project(tx + 1, ty, top, view),
      project(tx + 1, ty + 1, top, view),
      project(tx, ty + 1, top, view)
    ]);
    ctx.fillStyle = baseColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(241,245,249,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function renderActor(ctx, runtime, actor, view) {
    const actorState = runtime.dynamicState.actors[actor.id];
    if (!actorState || actorState.active === false) return;
    const color = getActorColor(actor);

    if (actor.kind === window.MarbleLevels.ACTOR_KINDS.MOVING_PLATFORM || actor.kind === window.MarbleLevels.ACTOR_KINDS.ELEVATOR) {
      const x = actorState.x;
      const y = actorState.y;
      const z = actorState.topHeight;
      const top = [
        project(x, y, z, view),
        project(x + actor.width, y, z, view),
        project(x + actor.width, y + actor.height, z, view),
        project(x, y + actor.height, z, view)
      ];
      beginPoly(ctx, top);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(241,245,249,0.2)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    } else if (actor.kind === window.MarbleLevels.ACTOR_KINDS.TIMED_GATE) {
      const x = actorState.x;
      const y = actorState.y;
      const z = actor.topHeight;
      beginPoly(ctx, [
        project(x, y, z, view),
        project(x + actor.width, y, z, view),
        project(x + actor.width, y + actor.height, z, view),
        project(x, y + actor.height, z, view)
      ]);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(254,215,170,0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else {
      const cx = actorState.x + actor.width * 0.5;
      const cy = actorState.y + actor.height * 0.5;
      const ex = cx + Math.cos(actorState.angle) * actor.armLength;
      const ey = cy + Math.sin(actorState.angle) * actor.armLength;
      const center = project(cx, cy, actor.topHeight + 0.1, view);
      const end = project(ex, ey, actor.topHeight + 0.1, view);
      ctx.beginPath();
      ctx.moveTo(center.x, center.y);
      ctx.lineTo(end.x, end.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(3, actor.armWidth * view.tileW * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fecaca';
      ctx.fill();
    }
  }

  function getTileDrawOrder(level) {
    const tiles = [];
    for (let ty = 0; ty < level.height; ty += 1) {
      for (let tx = 0; tx < level.width; tx += 1) {
        tiles.push({ tx, ty, depth: tx + ty });
      }
    }
    tiles.sort((a, b) => a.depth - b.depth || a.ty - b.ty || a.tx - b.tx);
    return tiles;
  }

  function renderTerrain(ctx, runtime, view) {
    const tiles = getTileDrawOrder(runtime.level);
    for (const { tx, ty } of tiles) {
      renderSurfaceTile(ctx, runtime, tx, ty, view);
      renderBlockerTile(ctx, runtime, tx, ty, view);
    }
  }

  function renderActors(ctx, runtime, view) {
    const actors = [...runtime.level.actors];
    actors.sort((a, b) => {
      const sa = runtime.dynamicState.actors[a.id];
      const sb = runtime.dynamicState.actors[b.id];
      return (sa.x + sa.y) - (sb.x + sb.y);
    });
    for (const actor of actors) renderActor(ctx, runtime, actor, view);
  }

  function getVisualSupportZ(runtime, x, y, radius, fallbackZ) {
    const offsets = [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]];
    for (const [ox, oy] of offsets) {
      const sample = window.MarbleLevels.sampleVisualSurface(runtime.level, x + ox, y + oy, runtime.dynamicState);
      if (sample) return sample.z;
    }
    return fallbackZ;
  }

  function renderMarble(ctx, runtime, view) {
    const marble = runtime.marble;
    const shadowZ = getVisualSupportZ(runtime, marble.x, marble.y, marble.supportRadius, runtime.level.voidFloor ?? -1.5);
    const shadow = project(marble.x, marble.y, shadowZ, view);
    const ball = project(marble.x, marble.y, marble.z, view);
    const radius = Math.max(8, view.tileW * marble.renderRadius * 0.9);

    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y + radius * 0.35, radius * 0.95, radius * 0.48, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(ball.x - radius * 0.35, ball.y - radius * 0.48, radius * 0.14, ball.x, ball.y, radius);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.22, '#dbeafe');
    gradient.addColorStop(1, '#475569');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function renderGoal(ctx, runtime, view) {
    const goal = runtime.level.goal;
    if (!goal) return;
    const support = window.MarbleLevels.sampleVisualSurface(runtime.level, goal.x, goal.y, runtime.dynamicState);
    const z = (support ? support.z : 0) + 0.22;
    const p = project(goal.x, goal.y, z, view);
    const radius = Math.max(8, view.tileW * goal.radius * 0.42);
    const gradient = ctx.createRadialGradient(p.x - radius * 0.25, p.y - radius * 0.3, radius * 0.15, p.x, p.y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
    gradient.addColorStop(0.35, 'rgba(110,231,183,0.95)');
    gradient.addColorStop(1, 'rgba(34,197,94,0.42)');
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function renderRouteGraph(ctx, runtime, view) {
    if (!runtime.debug.showRouteGraph || !runtime.level.routeGraph) return;
    const nodes = runtime.level.routeGraph.nodes || [];
    const nodeById = Object.fromEntries(nodes.map((node) => [node.id, node]));
    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.6)';
    ctx.lineWidth = 1.4;
    for (const edge of runtime.level.routeGraph.edges || []) {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b || typeof a.x !== 'number' || typeof b.x !== 'number') continue;
      const p1 = project(a.x, a.y, (a.z ?? 0) + 0.1, view);
      const p2 = project(b.x, b.y, (b.z ?? 0) + 0.1, view);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (const node of nodes) {
      if (typeof node.x !== 'number') continue;
      const p = project(node.x, node.y, (node.z ?? 0) + 0.14, view);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(253,224,71,0.88)';
      ctx.fill();
    }
    ctx.restore();
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
    const { ctx, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
    const view = createView(runtime, cssWidth, cssHeight);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    renderBackground(ctx, cssWidth, cssHeight);
    renderTerrain(ctx, runtime, view);
    renderActors(ctx, runtime, view);
    renderGoal(ctx, runtime, view);
    renderMarble(ctx, runtime, view);
    renderRouteGraph(ctx, runtime, view);
    renderStatus(ctx, runtime, cssWidth);
  }

  function prepare(runtime) {
    return runtime;
  }

  window.MarbleRenderer = {
    prepare,
    render: draw
  };
})();