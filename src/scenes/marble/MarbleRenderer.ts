import type { MarbleRuntimeState } from './MarbleRuntime';

export interface MarbleRenderer {
  render(runtime: MarbleRuntimeState): void;
  resize(): void;
}

export function createMarbleRenderer(canvas: HTMLCanvasElement): MarbleRenderer {
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create a 2D context for the marble canvas.');
  }

  function resize(): void {
    const width = Math.max(320, canvas.clientWidth || 960);
    const height = Math.max(240, canvas.clientHeight || 540);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function render(runtime: MarbleRuntimeState): void {
    resize();

    const width = canvas.width;
    const height = canvas.height;
    const cellWidth = width / runtime.level.width;
    const cellHeight = height / runtime.level.height;

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#020617';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 1;
    for (let x = 0; x <= runtime.level.width; x += 1) {
      context.beginPath();
      context.moveTo(x * cellWidth, 0);
      context.lineTo(x * cellWidth, height);
      context.stroke();
    }

    for (let y = 0; y <= runtime.level.height; y += 1) {
      context.beginPath();
      context.moveTo(0, y * cellHeight);
      context.lineTo(width, y * cellHeight);
      context.stroke();
    }

    context.fillStyle = '#6ee7b7';
    context.beginPath();
    context.arc(runtime.level.goal.x * cellWidth, runtime.level.goal.y * cellHeight, Math.min(cellWidth, cellHeight) * 0.28, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#7dd3fc';
    context.beginPath();
    context.arc(runtime.marble.x * cellWidth, runtime.marble.y * cellHeight, runtime.marble.radius * Math.min(cellWidth, cellHeight), 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#E2E8F0';
    context.font = '14px system-ui, sans-serif';
    context.fillText(`Level: ${runtime.level.name}`, 12, 22);
    context.fillText(`Time: ${(runtime.timerMs / 1000).toFixed(2)}s`, 12, 42);
    context.fillText(`Status: ${runtime.status}`, 12, 62);
  }

  return {
    render,
    resize
  };
}
