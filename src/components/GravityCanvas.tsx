import { useRef, useEffect } from 'react';

/**
 * Spacetime Fabric — a persistent grid of nodes representing the fabric of spacetime.
 * Mass (cursor) warps the grid. On mobile, an autonomous "ghost cursor" wanders
 * the canvas simulating the hover effect. Touch overrides to finger position.
 */

const GRID_COLS = 50;
const GRID_ROWS = 35;
const CENTER_MASS = 0;
const CURSOR_MASS = 36000;
const WARP_SOFTENING = 80;

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
  // Autonomous cursor for mobile
  const autoMouse = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const isTouching = useRef(false);
  const isMobileRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    // Detect mobile/tablet via viewport width
    isMobileRef.current = window.innerWidth <= 1024;

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
      isMobileRef.current = window.innerWidth <= 1024;
      buildGrid();
      // Initialize auto cursor to center
      autoMouse.current.x = rect.width / 2;
      autoMouse.current.y = rect.height / 2;
      pickNewTarget();
    };

    function pickNewTarget() {
      const { w, h } = dims.current;
      const margin = 0.15;
      autoMouse.current.targetX = w * margin + Math.random() * w * (1 - 2 * margin);
      autoMouse.current.targetY = h * margin + Math.random() * h * (1 - 2 * margin);
    }

    resize();
    window.addEventListener('resize', resize);

    // Desktop mouse events
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true };
    };
    const handleMouseLeave = () => { mouse.current.active = false; };

    // Touch events — override autonomous cursor
    const handleTouchStart = (e: TouchEvent) => {
      isTouching.current = true;
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      if (t) {
        mouse.current = { x: t.clientX - rect.left, y: t.clientY - rect.top, active: true };
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches[0];
      if (t) {
        mouse.current = { x: t.clientX - rect.left, y: t.clientY - rect.top, active: true };
      }
    };
    const handleTouchEnd = () => {
      isTouching.current = false;
      mouse.current.active = false;
      // Snap auto cursor to where finger was so the transition is smooth
      autoMouse.current.x = mouse.current.x;
      autoMouse.current.y = mouse.current.y;
      pickNewTarget();
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEnd);

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

    // Timer to pick new autonomous target
    let targetTimer = 0;

    const animate = () => {
      const { w, h } = dims.current;
      if (w === 0 || h === 0) { animFrame.current = requestAnimationFrame(animate); return; }
      const cx = w / 2;
      const cy = h / 2;
      time.current += 0.006;
      const grid = nodes.current;

      ctx.clearRect(0, 0, w, h);

      // ─── Autonomous cursor movement on mobile (when not touching) ───
      let effectiveMouseActive = mouse.current.active;
      let effectiveMouseX = mouse.current.x;
      let effectiveMouseY = mouse.current.y;

      if (isMobileRef.current && !isTouching.current) {
        const am = autoMouse.current;
        // Smooth ease toward target
        const speed = 0.008;
        am.x += (am.targetX - am.x) * speed;
        am.y += (am.targetY - am.y) * speed;

        // Pick new target when close enough
        const distToTarget = Math.sqrt((am.targetX - am.x) ** 2 + (am.targetY - am.y) ** 2);
        targetTimer++;
        if (distToTarget < 30 || targetTimer > 600) {
          pickNewTarget();
          targetTimer = 0;
        }

        effectiveMouseActive = true;
        effectiveMouseX = am.x;
        effectiveMouseY = am.y;
      }

      // Update node positions
      const lerp = 0.18;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          let wx = 0, wy = 0;

          const [bx, by] = warp(n.restX, n.restY, cx, cy, CENTER_MASS);
          wx += bx;
          wy += by;

          if (effectiveMouseActive) {
            const [mx, my] = warp(n.restX, n.restY, effectiveMouseX, effectiveMouseY, CURSOR_MASS);
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

      // Draw horizontal lines
      for (let row = 0; row < GRID_ROWS; row++) {
        ctx.beginPath();
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          if (col === 0) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        }
        const midNode = grid[row][Math.floor(GRID_COLS / 2)];
        const rowDist = Math.sqrt((midNode.restX - cx) ** 2 + (midNode.restY - cy) ** 2);
        const intensity = Math.max(0.06, Math.min(0.45, 0.5 - rowDist / (Math.max(w, h) * 0.8)));
        ctx.strokeStyle = `rgba(80, 120, 180, ${intensity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw vertical lines
      for (let col = 0; col < GRID_COLS; col++) {
        ctx.beginPath();
        for (let row = 0; row < GRID_ROWS; row++) {
          const n = grid[row][col];
          if (row === 0) ctx.moveTo(n.x, n.y);
          else ctx.lineTo(n.x, n.y);
        }
        const midNode = grid[Math.floor(GRID_ROWS / 2)][col];
        const colDist = Math.sqrt((midNode.restX - cx) ** 2 + (midNode.restY - cy) ** 2);
        const intensity = Math.max(0.06, Math.min(0.45, 0.5 - colDist / (Math.max(w, h) * 0.8)));
        ctx.strokeStyle = `rgba(80, 120, 180, ${intensity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Draw nodes
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const n = grid[row][col];
          const strain = Math.sqrt((n.x - n.restX) ** 2 + (n.y - n.restY) ** 2);

          const baseSize = 1.2;
          const strainSize = Math.min(strain * 0.12, 4);
          const r = baseSize + strainSize;

          const warmth = Math.min(strain / 20, 1);
          const hue = 210 + warmth * 15;
          const sat = 15 + warmth * 55;
          const lum = 50 + warmth * 25;
          const alpha = 0.15 + warmth * 0.6;

          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
          ctx.fill();

          if (warmth > 0.3) {
            const glowGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
            glowGrad.addColorStop(0, `hsla(${hue}, ${sat}%, ${lum}%, ${warmth * 0.15})`);
            glowGrad.addColorStop(1, `hsla(${hue}, ${sat}%, ${lum}%, 0)`);
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2);
            ctx.fillStyle = glowGrad;
            ctx.fill();
          }
        }
      }

      // Gravity well indicator (only when touch is active, not for autonomous)
      if (isTouching.current && mouse.current.active) {
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const cGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
        cGrad.addColorStop(0, 'rgba(80, 140, 220, 0.1)');
        cGrad.addColorStop(0.4, 'rgba(80, 140, 220, 0.04)');
        cGrad.addColorStop(1, 'rgba(70, 130, 200, 0)');
        ctx.beginPath();
        ctx.arc(mx, my, 90, 0, Math.PI * 2);
        ctx.fillStyle = cGrad;
        ctx.fill();
      } else if (!isMobileRef.current && mouse.current.active) {
        // Desktop cursor well
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const cGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 90);
        cGrad.addColorStop(0, 'rgba(80, 140, 220, 0.1)');
        cGrad.addColorStop(0.4, 'rgba(80, 140, 220, 0.04)');
        cGrad.addColorStop(1, 'rgba(70, 130, 200, 0)');
        ctx.beginPath();
        ctx.arc(mx, my, 90, 0, Math.PI * 2);
        ctx.fillStyle = cGrad;
        ctx.fill();
      }

      animFrame.current = requestAnimationFrame(animate);
    };

    animFrame.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrame.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
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
