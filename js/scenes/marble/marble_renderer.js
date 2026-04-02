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

  function getViewport(level, cssWidth, cssHeight) {
    const padding = 24;

    const usableWidth = Math.max(1, cssWidth - padding * 2);
    const usableHeight = Math.max(1, cssHeight - padding * 2);

    const scale = Math.min(
      usableWidth / level.width,
      usableHeight / level.height
    );

    const drawWidth = level.width * scale;
    const drawHeight = level.height * scale;

    const offsetX = (cssWidth - drawWidth) / 2;
    const offsetY = (cssHeight - drawHeight) / 2;

    return {
      scale,
      offsetX,
      offsetY,
      drawWidth,
      drawHeight
    };
  }

  function projectRect(rect, view) {
    return {
      x: view.offsetX + rect.x * view.scale,
      y: view.offsetY + rect.y * view.scale,
      w: rect.w * view.scale,
      h: rect.h * view.scale
    };
  }

  function projectCircle(circle, view) {
    return {
      x: view.offsetX + circle.x * view.scale,
      y: view.offsetY + circle.y * view.scale,
      radius: circle.radius * view.scale
    };
  }

  function drawRoundedRect(ctx, x, y, w, h, radius) {
    const r = Math.min(radius, w / 2, h / 2);

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderBackground(ctx, cssWidth, cssHeight) {
    const gradient = ctx.createLinearGradient(0, 0, 0, cssHeight);
    gradient.addColorStop(0, '#111823');
    gradient.addColorStop(1, '#0b1017');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.globalAlpha = 0.25;

    const glowA = ctx.createRadialGradient(
      cssWidth * 0.22,
      cssHeight * 0.22,
      10,
      cssWidth * 0.22,
      cssHeight * 0.22,
      cssWidth * 0.35
    );
    glowA.addColorStop(0, 'rgba(125, 211, 252, 0.35)');
    glowA.addColorStop(1, 'rgba(125, 211, 252, 0)');
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const glowB = ctx.createRadialGradient(
      cssWidth * 0.78,
      cssHeight * 0.76,
      10,
      cssWidth * 0.78,
      cssHeight * 0.76,
      cssWidth * 0.28
    );
    glowB.addColorStop(0, 'rgba(192, 132, 252, 0.28)');
    glowB.addColorStop(1, 'rgba(192, 132, 252, 0)');
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.restore();
  }

  function renderArena(ctx, level, view) {
    ctx.save();

    drawRoundedRect(
      ctx,
      view.offsetX,
      view.offsetY,
      view.drawWidth,
      view.drawHeight,
      14
    );
    ctx.fillStyle = '#0f1722';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    ctx.restore();
  }

  function renderFailZones(ctx, runtime, view) {
    ctx.save();

    for (const zone of runtime.level.failZones) {
      const r = projectRect(zone, view);

      drawRoundedRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.fillStyle = 'rgba(251, 113, 133, 0.22)';
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.55)';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(r.x + 8, r.y + 8);
      ctx.lineTo(r.x + r.w - 8, r.y + r.h - 8);
      ctx.moveTo(r.x + r.w - 8, r.y + 8);
      ctx.lineTo(r.x + 8, r.y + r.h - 8);
      ctx.strokeStyle = 'rgba(251, 113, 133, 0.28)';
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderWalls(ctx, runtime, view) {
    ctx.save();

    for (const wall of runtime.level.walls) {
      const r = projectRect(wall, view);

      drawRoundedRect(ctx, r.x, r.y, r.w, r.h, 8);
      ctx.fillStyle = '#334155';
      ctx.fill();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderGoal(ctx, runtime, view) {
    const goal = projectCircle(runtime.level.goal, view);

    ctx.save();

    const gradient = ctx.createRadialGradient(
      goal.x - goal.radius * 0.25,
      goal.y - goal.radius * 0.25,
      goal.radius * 0.1,
      goal.x,
      goal.y,
      goal.radius
    );
    gradient.addColorStop(0, 'rgba(110, 231, 183, 0.95)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.55)');

    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(209, 250, 229, 0.85)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(goal.x, goal.y, goal.radius * 0.55, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();

    ctx.restore();
  }

  function renderMarble(ctx, runtime, view) {
    const marble = projectCircle(runtime.marble, view);

    ctx.save();

    const shadowY = marble.y + marble.radius * 0.45;
    ctx.beginPath();
    ctx.ellipse(
      marble.x,
      shadowY,
      marble.radius * 0.9,
      marble.radius * 0.45,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();

    const gradient = ctx.createRadialGradient(
      marble.x - marble.radius * 0.35,
      marble.y - marble.radius * 0.45,
      marble.radius * 0.12,
      marble.x,
      marble.y,
      marble.radius
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.2, '#cbd5e1');
    gradient.addColorStop(1, '#64748b');

    ctx.beginPath();
    ctx.arc(marble.x, marble.y, marble.radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(
      marble.x - marble.radius * 0.28,
      marble.y - marble.radius * 0.32,
      marble.radius * 0.18,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    ctx.restore();
  }

  function renderStatusOverlay(ctx, runtime, cssWidth) {
    if (runtime.status === 'running') return;

    ctx.save();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230, 237, 243, 0.9)';

    const text =
      runtime.status === 'failed'
        ? 'Failed'
        : runtime.status === 'completed'
          ? 'Cleared'
          : runtime.status;

    ctx.fillText(text, cssWidth - 18, 28);
    ctx.restore();
  }

  function render(runtime, canvas) {
    if (!runtime || !canvas) return;

    const { ctx, cssWidth, cssHeight } = fitCanvasToDisplay(canvas);
    const view = getViewport(runtime.level, cssWidth, cssHeight);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    renderBackground(ctx, cssWidth, cssHeight);
    renderArena(ctx, runtime.level, view);
    renderFailZones(ctx, runtime, view);
    renderWalls(ctx, runtime, view);
    renderGoal(ctx, runtime, view);
    renderMarble(ctx, runtime, view);
    renderStatusOverlay(ctx, runtime, cssWidth);
  }

  window.MarbleRenderer = {
    render
  };
})();