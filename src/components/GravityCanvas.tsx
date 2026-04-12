import { useRef, useEffect } from 'react';

/**
 * Spacetime Fabric — a persistent grid of nodes representing the fabric of spacetime.
 * Mass (center black hole + cursor) warps the grid. Nothing spawns or disappears.
 * Inspired by the rubber-sheet analogy of general relativity.
 */

const GRID_COLS = 60;
const GRID_ROWS = 40;
const CENTER_MASS = 12000;
const CURSOR_MASS = 4000;
const WARP_SOFTENING = 80; // prevents singularity at center

interface Node {
  restX: number;
  restY: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
}

export function GravityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useRef<Node[][]>([]);
  const mouse = useRef({ x: -9999, y: -9999, active: false });
  const animFrame = useRef(0);
  const dims = useRef({ w: 0, h: 0 });
  const time = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    function buildGrid() {
      const { w, h } = dims.current;
      const spacingX = w / (GRID_COLS - 1);
      const spacingY = h / (GRID_ROWS - 1);
      const grid: Node[][] = [];
      for (let row = 0; row < GRID_ROWS; row++) {
        grid[row] = [];
        for (let col = 0; col < GRID_COLS; col++) {
          const rx = col * spacingX;
          const ry = row * spacingY;
          grid[row][col] = { restX: rx, restY: ry, x: rx, y: ry, prevX: rx, prevY: ry };
        }
      }
      nodes.current = grid;
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      dims.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    };

    resize();
    window.addEventListener('resize', resize);

    const handlePointer = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0]?.clientY : e.clientY;
      if (clientX != null && clientY != null) {
        mouse.current = { x: clientX - rect.left, y: clientY - rect.top, active: true };
      }
    };
    const handlePointerLeave = () => { mouse.current.active = false; };

    canvas.addEventListener('mousemove', handlePointer);
    canvas.addEventListener('touchmove', handlePointer, { passive: true });
    canvas.addEventListener('touchstart', handlePointer, { passive: true });
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('touchend', handlePointerLeave);

    // Warp function: displace a point toward a mass source
    function warp(
      restX: number, restY: number,
      massX: number, massY: number, mass: number
    ): [number, number] {
      const dx = massX - restX;
      const dy = massY - restY;
      const distSq = dx * dx + dy * dy;
      const dist = Math.sqrt(distSq);
      const force = mass / (distSq + WARP_SOFTENING * WARP_SOFTENING);
      return [
        (dx / (dist || 1)) * force,
        (dy / (dist || 1)) * force,
      ];
    }

    const animate = () => {
      const { w, h } = dims.current;
      if (w === 0 || h === 0) { animFrame.current = requestAnimationFrame(animate); return; }
      const cx = w / 2;
      const cy = h / 2;
      time.current += 0.006;
      const grid = nodes.current;

      ctx.clearRect(0, 0, w, h);

      // Update node positions with gravitational warping
      const lerp = 0.12; // smoothing
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          let wx = 0, wy = 0;

          // Central black hole warp
          const [bx, by] = warp(n.restX, n.restY, cx, cy, CENTER_MASS);
          wx += bx;
          wy += by;

          // Cursor warp
          if (mouse.current.active) {
            const [mx, my] = warp(n.restX, n.restY, mouse.current.x, mouse.current.y, CURSOR_MASS);
            wx += mx;
            wy += my;
          }

          const targetX = n.restX + wx;
          const targetY = n.restY + wy;
          n.prevX = n.x;
          n.prevY = n.y;
          n.x += (targetX - n.x) * lerp;
          n.y += (targetY - n.y) * lerp;
        }
      }

      // === Draw grid lines ===
      // Horizontal lines
      for (let row = 0; row < GRID_ROWS; row++) {
        ctx.beginPath();
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          // Calculate strain (how much this node has moved from rest)
          const strain = Math.sqrt(
            (n.x - n.restX) ** 2 + (n.y - n.restY) ** 2
          );
          const distToCenter = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);

          if (col === 0) {
            ctx.moveTo(n.x, n.y);
          } else {
            ctx.lineTo(n.x, n.y);
          }
        }

        // Line color based on average row strain
        const midNode = grid[row][Math.floor(GRID_COLS / 2)];
        const rowDist = Math.sqrt((midNode.restX - cx) ** 2 + (midNode.restY - cy) ** 2);
        const intensity = Math.max(0.02, Math.min(0.12, 0.15 - rowDist / (Math.max(w, h) * 1.2)));
        ctx.strokeStyle = `rgba(140, 110, 80, ${intensity})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // Vertical lines
      for (let col = 0; col < GRID_COLS; col++) {
        ctx.beginPath();
        for (let row = 0; row < GRID_ROWS; row++) {
          const n = grid[row][col];
          if (row === 0) {
            ctx.moveTo(n.x, n.y);
          } else {
            ctx.lineTo(n.x, n.y);
          }
        }

        const midNode = grid[Math.floor(GRID_ROWS / 2)][col];
        const colDist = Math.sqrt((midNode.restX - cx) ** 2 + (midNode.restY - cy) ** 2);
        const intensity = Math.max(0.02, Math.min(0.12, 0.15 - colDist / (Math.max(w, h) * 1.2)));
        ctx.strokeStyle = `rgba(140, 110, 80, ${intensity})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }

      // === Draw nodes (intersection dots) ===
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          const strain = Math.sqrt((n.x - n.restX) ** 2 + (n.y - n.restY) ** 2);
          const distToCenter = Math.sqrt((n.x - cx) ** 2 + (n.y - cy) ** 2);

          // Skip nodes consumed inside the event horizon
          if (distToCenter < 30) continue;

          // Size: bigger when strained (time dilation visualization)
          const baseSize = 0.8;
          const strainSize = Math.min(strain * 0.06, 2.5);
          const r = baseSize + strainSize;

          // Color: shifts warm under strain (gravitational redshift)
          const warmth = Math.min(strain / 40, 1);
          const hue = 40 - warmth * 28; // 40 (neutral) → 12 (burnt orange)
          const sat = 5 + warmth * 65;
          const lum = 55 + warmth * 20;
          const alpha = 0.06 + warmth * 0.35;

          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
          ctx.fill();
        }
      }

      // === Event horizon ===
      const bhGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 55);
      bhGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      bhGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.98)');
      bhGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.4)');
      bhGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, 55, 0, Math.PI * 2);
      ctx.fillStyle = bhGrad;
      ctx.fill();

      // === Photon ring (thin bright ring at edge of event horizon) ===
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const photonPulse = 0.06 + Math.sin(time.current * 3) * 0.015;
      ctx.beginPath();
      ctx.arc(cx, cy, 48, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(200, 140, 70, ${photonPulse})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Outer halo
      const haloGrad = ctx.createRadialGradient(cx, cy, 40, cx, cy, 90);
      haloGrad.addColorStop(0, `rgba(180, 110, 50, ${0.03 + Math.sin(time.current * 2) * 0.01})`);
      haloGrad.addColorStop(0.5, 'rgba(160, 90, 40, 0.01)');
      haloGrad.addColorStop(1, 'rgba(140, 70, 30, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fillStyle = haloGrad;
      ctx.fill();
      ctx.restore();

      // === Cursor gravity well indicator ===
      if (mouse.current.active) {
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const cGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 60);
        cGrad.addColorStop(0, 'rgba(180, 140, 80, 0.04)');
        cGrad.addColorStop(0.5, 'rgba(180, 140, 80, 0.015)');
        cGrad.addColorStop(1, 'rgba(180, 140, 80, 0)');
        ctx.beginPath();
        ctx.arc(mx, my, 60, 0, Math.PI * 2);
        ctx.fillStyle = cGrad;
        ctx.fill();
      }

      animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handlePointer);
      canvas.removeEventListener('touchmove', handlePointer);
      canvas.removeEventListener('touchstart', handlePointer);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      canvas.removeEventListener('touchend', handlePointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
