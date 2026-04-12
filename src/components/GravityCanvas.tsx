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
  orbitBias: number; // tangential velocity bias for orbital paths
  trail: { x: number; y: number; alpha: number }[];
}

const PARTICLE_COUNT = 350;
const BLACK_HOLE_RADIUS = 50;
const GRAVITY_STRENGTH = 600;
const MOUSE_GRAVITY = 500;
const MOUSE_REPEL_RADIUS = 80;
const FRICTION = 0.995;
const SPAWN_MARGIN = 250;
const TRAIL_LENGTH = 8;
const GRID_LINE_COUNT = 16;

export function GravityCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);
  const mouse = useRef({ x: -9999, y: -9999, active: false });
  const animFrame = useRef<number>(0);
  const dims = useRef({ w: 0, h: 0 });
  const time = useRef(0);

  const spawnParticle = useCallback((scattered = false): Particle => {
    const w = dims.current.w;
    const h = dims.current.h;
    const cx = w / 2;
    const cy = h / 2;

    let x: number, y: number;
    if (scattered) {
      // Distribute across canvas but away from center
      const angle = Math.random() * Math.PI * 2;
      const dist = BLACK_HOLE_RADIUS * 2 + Math.random() * Math.max(w, h) * 0.5;
      x = cx + Math.cos(angle) * dist;
      y = cy + Math.sin(angle) * dist;
    } else {
      const side = Math.random();
      if (side < 0.25) { x = -SPAWN_MARGIN; y = Math.random() * (h + SPAWN_MARGIN * 2) - SPAWN_MARGIN; }
      else if (side < 0.5) { x = w + SPAWN_MARGIN; y = Math.random() * (h + SPAWN_MARGIN * 2) - SPAWN_MARGIN; }
      else if (side < 0.75) { x = Math.random() * (w + SPAWN_MARGIN * 2) - SPAWN_MARGIN; y = -SPAWN_MARGIN; }
      else { x = Math.random() * (w + SPAWN_MARGIN * 2) - SPAWN_MARGIN; y = h + SPAWN_MARGIN; }
    }

    const angle = Math.atan2(cy - y, cx - x) + (Math.random() - 0.5) * 1.5;
    const speed = 0.2 + Math.random() * 0.6;
    const orbitBias = 0.3 + Math.random() * 0.7; // how much tangential vs radial

    return {
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 0.4 + Math.random() * 2.2,
      opacity: 0.1 + Math.random() * 0.55,
      life: scattered ? Math.random() * 300 : 0,
      maxLife: 500 + Math.random() * 800,
      orbitBias,
      trail: [],
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true })!;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      dims.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    particles.current = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(true));

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
      if (w === 0 || h === 0) { animFrame.current = requestAnimationFrame(animate); return; }
      const cx = w / 2;
      const cy = h / 2;
      time.current += 0.008;

      ctx.clearRect(0, 0, w, h);

      // === SPACETIME GRID (warped by gravity) ===
      ctx.save();
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.04)';
      ctx.lineWidth = 0.5;

      const gridSpacing = Math.max(w, h) / GRID_LINE_COUNT;
      // Horizontal lines
      for (let i = -GRID_LINE_COUNT; i <= GRID_LINE_COUNT * 2; i++) {
        ctx.beginPath();
        const baseY = i * gridSpacing;
        for (let gx = 0; gx <= w; gx += 8) {
          const dx = gx - cx;
          const dy = baseY - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const warp = dist < 400 ? (BLACK_HOLE_RADIUS * 120) / (dist * dist + 200) : 0;
          const warpedY = baseY + (dy / (dist || 1)) * warp;
          if (gx === 0) ctx.moveTo(gx, warpedY);
          else ctx.lineTo(gx, warpedY);
        }
        ctx.stroke();
      }
      // Vertical lines
      for (let i = -GRID_LINE_COUNT; i <= GRID_LINE_COUNT * 2; i++) {
        ctx.beginPath();
        const baseX = i * gridSpacing;
        for (let gy = 0; gy <= h; gy += 8) {
          const dx = baseX - cx;
          const dy = gy - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const warp = dist < 400 ? (BLACK_HOLE_RADIUS * 120) / (dist * dist + 200) : 0;
          const warpedX = baseX + (dx / (dist || 1)) * warp;
          if (gy === 0) ctx.moveTo(warpedX, gy);
          else ctx.lineTo(warpedX, gy);
        }
        ctx.stroke();
      }
      ctx.restore();

      // === ACCRETION DISK ===
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const diskRadius = BLACK_HOLE_RADIUS * 2.5;
      for (let ring = 0; ring < 3; ring++) {
        const r = BLACK_HOLE_RADIUS * 1.1 + ring * 20;
        const baseAlpha = 0.02 - ring * 0.005;
        const rotation = time.current * (0.3 - ring * 0.08);
        ctx.beginPath();
        ctx.ellipse(cx, cy, r + Math.sin(time.current + ring) * 3, r * 0.25, rotation, 0, Math.PI * 2);
        const diskGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r * 1.2);
        diskGrad.addColorStop(0, `rgba(200, 120, 50, ${baseAlpha * 2})`);
        diskGrad.addColorStop(0.5, `rgba(180, 80, 30, ${baseAlpha})`);
        diskGrad.addColorStop(1, 'rgba(150, 60, 20, 0)');
        ctx.strokeStyle = diskGrad;
        ctx.lineWidth = 8 - ring * 2;
        ctx.stroke();
      }
      ctx.restore();

      // === GRAVITATIONAL LENSING RINGS ===
      for (let i = 5; i >= 1; i--) {
        const r = BLACK_HOLE_RADIUS + i * 14;
        const pulse = 1 + Math.sin(time.current * 2 + i * 0.5) * 0.02;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(140, 100, 70, ${0.015 * i})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // === PHOTON SPHERE ===
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const photonR = BLACK_HOLE_RADIUS * 1.5;
      const photonGrad = ctx.createRadialGradient(cx, cy, photonR - 3, cx, cy, photonR + 6);
      photonGrad.addColorStop(0, 'rgba(200, 140, 70, 0)');
      photonGrad.addColorStop(0.4, `rgba(200, 140, 70, ${0.03 + Math.sin(time.current * 3) * 0.01})`);
      photonGrad.addColorStop(0.6, `rgba(220, 160, 80, ${0.02 + Math.sin(time.current * 3 + 1) * 0.01})`);
      photonGrad.addColorStop(1, 'rgba(200, 140, 70, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, photonR + 6, 0, Math.PI * 2);
      ctx.fillStyle = photonGrad;
      ctx.fill();
      ctx.restore();

      // === BLACK HOLE (event horizon) ===
      const bhGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, BLACK_HOLE_RADIUS * 1.2);
      bhGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      bhGrad.addColorStop(0.6, 'rgba(0, 0, 0, 1)');
      bhGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.7)');
      bhGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, BLACK_HOLE_RADIUS * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = bhGrad;
      ctx.fill();

      // === PARTICLES ===
      for (let i = 0; i < particles.current.length; i++) {
        const p = particles.current[i];
        p.life++;

        // Store trail point
        if (p.life % 2 === 0) {
          p.trail.push({ x: p.x, y: p.y, alpha: p.opacity * 0.3 });
          if (p.trail.length > TRAIL_LENGTH) p.trail.shift();
        }

        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const distSafe = Math.max(dist, 15);

        // Radial gravity
        const gForce = GRAVITY_STRENGTH / (distSafe * distSafe);
        const radialX = (dx / dist) * gForce;
        const radialY = (dy / dist) * gForce;

        // Tangential force for orbital motion
        const tangentX = (-dy / dist) * gForce * p.orbitBias;
        const tangentY = (dx / dist) * gForce * p.orbitBias;

        p.vx += radialX * (1 - p.orbitBias * 0.5) + tangentX;
        p.vy += radialY * (1 - p.orbitBias * 0.5) + tangentY;

        // Mouse interaction — close = repel, medium = orbit, far = attract
        if (mouse.current.active) {
          const mdx = mouse.current.x - p.x;
          const mdy = mouse.current.y - p.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          const mDistSafe = Math.max(mDist, 20);

          if (mDist < MOUSE_REPEL_RADIUS) {
            // Repel close particles outward
            const repelForce = (MOUSE_REPEL_RADIUS - mDist) * 0.008;
            p.vx -= (mdx / mDistSafe) * repelForce;
            p.vy -= (mdy / mDistSafe) * repelForce;
          } else if (mDist < 250) {
            // Orbital swirl around cursor
            const mForce = MOUSE_GRAVITY / (mDistSafe * mDistSafe);
            const mTangentX = (-mdy / mDistSafe) * mForce * 0.6;
            const mTangentY = (mdx / mDistSafe) * mForce * 0.6;
            p.vx += (mdx / mDistSafe) * mForce * 0.4 + mTangentX;
            p.vy += (mdy / mDistSafe) * mForce * 0.4 + mTangentY;
          } else {
            const mForce = MOUSE_GRAVITY * 0.5 / (mDistSafe * mDistSafe);
            p.vx += (mdx / mDistSafe) * mForce;
            p.vy += (mdy / mDistSafe) * mForce;
          }
        }

        p.vx *= FRICTION;
        p.vy *= FRICTION;
        p.x += p.vx;
        p.y += p.vy;

        // Respawn
        if (dist < BLACK_HOLE_RADIUS * 0.35 || p.life > p.maxLife ||
            p.x < -SPAWN_MARGIN * 2 || p.x > w + SPAWN_MARGIN * 2 ||
            p.y < -SPAWN_MARGIN * 2 || p.y > h + SPAWN_MARGIN * 2) {
          particles.current[i] = spawnParticle();
          continue;
        }

        // Visual calculations
        const fadeIn = Math.min(p.life / 80, 1);
        const fadeOut = p.life > p.maxLife - 120 ? (p.maxLife - p.life) / 120 : 1;
        const proximity = Math.max(0, 1 - dist / (Math.max(w, h) * 0.55));
        const alpha = p.opacity * fadeIn * fadeOut * (proximity * 0.5 + 0.5);

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const stretch = Math.min(speed * 3, 10);
        const moveAngle = Math.atan2(p.vy, p.vx);

        // Draw trail
        if (p.trail.length > 1 && speed > 0.5) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          for (let t = 0; t < p.trail.length - 1; t++) {
            const tp = p.trail[t];
            const trailAlpha = (t / p.trail.length) * alpha * 0.15 * (speed / 3);
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, p.radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 140, 80, ${Math.min(trailAlpha, 0.08)})`;
            ctx.fill();
          }
          ctx.restore();
        }

        // Draw particle
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(moveAngle);

        // Glow for fast/close particles
        if (speed > 1.5 || proximity > 0.6) {
          const glowR = (p.radius + stretch) * 2.5;
          const glowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
          const glowAlpha = Math.min(alpha * 0.12 * (proximity + speed * 0.1), 0.1);
          glowGrad.addColorStop(0, `rgba(200, 130, 60, ${glowAlpha})`);
          glowGrad.addColorStop(1, 'rgba(200, 130, 60, 0)');
          ctx.beginPath();
          ctx.ellipse(0, 0, glowR, glowR * 0.6, 0, 0, Math.PI * 2);
          ctx.fillStyle = glowGrad;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.ellipse(0, 0, p.radius + stretch, Math.max(p.radius * 0.5, 0.3), 0, 0, Math.PI * 2);

        // Color: orange-hot near center, cool silver far away
        const hue = proximity > 0.5 ? 15 + proximity * 15 : 30 + (1 - proximity) * 15;
        const sat = proximity > 0.5 ? 50 + proximity * 40 : 3 + proximity * 15;
        const lum = 45 + proximity * 35;
        ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha})`;
        ctx.fill();
        ctx.restore();
      }

      // === EVENT HORIZON GLOW ===
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const ehR = BLACK_HOLE_RADIUS * 2.2;
      const ehGrad = ctx.createRadialGradient(cx, cy, BLACK_HOLE_RADIUS * 0.7, cx, cy, ehR);
      const ehPulse = 0.025 + Math.sin(time.current * 2) * 0.008;
      ehGrad.addColorStop(0, `rgba(200, 110, 40, ${ehPulse})`);
      ehGrad.addColorStop(0.4, `rgba(180, 90, 30, ${ehPulse * 0.5})`);
      ehGrad.addColorStop(1, 'rgba(160, 70, 20, 0)');
      ctx.beginPath();
      ctx.arc(cx, cy, ehR, 0, Math.PI * 2);
      ctx.fillStyle = ehGrad;
      ctx.fill();
      ctx.restore();

      // === MOUSE WARP INDICATOR ===
      if (mouse.current.active) {
        const mx = mouse.current.x;
        const my = mouse.current.y;
        const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, MOUSE_REPEL_RADIUS);
        mGrad.addColorStop(0, 'rgba(200, 150, 80, 0.015)');
        mGrad.addColorStop(0.5, 'rgba(200, 150, 80, 0.008)');
        mGrad.addColorStop(1, 'rgba(200, 150, 80, 0)');
        ctx.beginPath();
        ctx.arc(mx, my, MOUSE_REPEL_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = mGrad;
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
  }, [spawnParticle]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ touchAction: 'none' }}
    />
  );
}
