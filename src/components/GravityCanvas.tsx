import { useRef, useEffect, useCallback } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  life: number;
  maxLife: number;
}

const PARTICLE_COUNT = 220;
const BLACK_HOLE_RADIUS = 60;
const GRAVITY_STRENGTH = 800;
const MOUSE_GRAVITY = 400;
const FRICTION = 0.992;
const SPAWN_MARGIN = 200;

export function GravityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: -9999, y: -9999, active: false });
  const animFrame = useRef<number>(0);
  const dims = useRef({ w: 0, h: 0 });

  const spawnParticle = useCallback((): Particle => {
    const w = dims.current.w;
    const h = dims.current.h;
    const cx = w / 2;
    const cy = h / 2;
    
    // Spawn from edges
    const side = Math.random();
    let x: number, y: number;
    if (side < 0.25) { x = -SPAWN_MARGIN; y = Math.random() * (h + SPAWN_MARGIN * 2) - SPAWN_MARGIN; }
    else if (side < 0.5) { x = w + SPAWN_MARGIN; y = Math.random() * (h + SPAWN_MARGIN * 2) - SPAWN_MARGIN; }
    else if (side < 0.75) { x = Math.random() * (w + SPAWN_MARGIN * 2) - SPAWN_MARGIN; y = -SPAWN_MARGIN; }
    else { x = Math.random() * (w + SPAWN_MARGIN * 2) - SPAWN_MARGIN; y = h + SPAWN_MARGIN; }

    // Initial velocity toward center with some randomness
    const angle = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 1.2;
    const speed = 0.3 + Math.random() * 0.8;

    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 0.6 + Math.random() * 1.8,
      opacity: 0.15 + Math.random() * 0.5,
      life: 0,
      maxLife: 400 + Math.random() * 600,
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      dims.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    // Init particles
    particles.current = Array.from({ length: PARTICLE_COUNT }, () => {
      const p = spawnParticle();
      // Scatter some initially across the canvas
      if (Math.random() < 0.6) {
        p.x = Math.random() * dims.current.w;
        p.y = Math.random() * dims.current.h;
        p.life = Math.random() * p.maxLife * 0.5;
      }
      return p;
    });

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

    const animate = () => {
      const { w, h } = dims.current;
      const cx = w / 2;
      const cy = h / 2;

      ctx.clearRect(0, 0, w, h);

      // Draw gravitational lensing rings
      for (let i = 3; i >= 1; i--) {
        const r = BLACK_HOLE_RADIUS + i * 18;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(120, 120, 120, ${0.03 * i})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Draw black hole
      const bhGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, BLACK_HOLE_RADIUS);
      bhGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      bhGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.95)');
      bhGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, BLACK_HOLE_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = bhGrad;
      ctx.fill();

      // Update & draw particles
      for (let i = 0; i < particles.current.length; i++) {
        const p = particles.current[i];
        p.life++;

        // Gravity toward center
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSafe = Math.max(dist, 20);
        const gForce = GRAVITY_STRENGTH / (distSafe * distSafe);
        p.vx += (dx / dist) * gForce;
        p.vy += (dy / dist) * gForce;

        // Mouse/touch gravity (attraction, subtle warp)
        if (mouse.current.active) {
          const mdx = mouse.current.x - p.x;
          const mdy = mouse.current.y - p.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          const mDistSafe = Math.max(mDist, 30);
          const mForce = MOUSE_GRAVITY / (mDistSafe * mDistSafe);
          p.vx += (mdx / mDist) * mForce;
          p.vy += (mdy / mDist) * mForce;
        }

        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.x += p.vx;
        p.y += p.vy;

        // Respawn if consumed by black hole or too old
        if (dist < BLACK_HOLE_RADIUS * 0.4 || p.life > p.maxLife) {
          particles.current[i] = spawnParticle();
          continue;
        }

        // Calculate visual properties
        const fadeIn = Math.min(p.life / 60, 1);
        const fadeOut = p.life > p.maxLife - 80 ? (p.maxLife - p.life) / 80 : 1;
        const proximity = Math.max(0, 1 - dist / (Math.max(w, h) * 0.6));
        const brightness = proximity * 0.4 + 0.6;
        const alpha = p.opacity * fadeIn * fadeOut * brightness;

        // Stretch based on velocity (like spaghettification)
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const stretch = Math.min(speed * 2, 6);
        const angle = Math.atan2(p.vy, p.vx);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius + stretch, p.radius * 0.7, 0, 0, Math.PI * 2);
        
        // Warm color near center, cool far away
        const hue = proximity > 0.5 ? 12 + proximity * 10 : 30 + (1 - proximity) * 20;
        const sat = proximity > 0.6 ? 40 + proximity * 30 : 5;
        const lum = 50 + proximity * 30;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
        ctx.fill();
        ctx.restore();
      }

      // Draw subtle event horizon glow
      const ehGrad = ctx.createRadialGradient(cx, cy, BLACK_HOLE_RADIUS * 0.8, cx, cy, BLACK_HOLE_RADIUS * 1.8);
      ehGrad.addColorStop(0, 'rgba(180, 100, 50, 0.04)');
      ehGrad.addColorStop(0.5, 'rgba(180, 100, 50, 0.015)');
      ehGrad.addColorStop(1, 'rgba(180, 100, 50, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, BLACK_HOLE_RADIUS * 1.8, 0, Math.PI * 2);
      ctx.fillStyle = ehGrad;
      ctx.fill();

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
  }, [spawnParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
