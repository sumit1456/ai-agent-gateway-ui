import { useEffect, useRef } from 'react';

export default function BlackHoleParticleField() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return undefined;
    let x = null;
    try {
      x = c.getContext && c.getContext('2d');
    } catch (err) {
      return undefined;
    }
    if (!x) return undefined;
    let W;
    let H;
    let cx;
    let cy;
    let live = true;
    let last = 0;
    let raf = 0;
    let rotation = 0;
    const rotationSpeed = 0.000015; // Even slower for distant effect
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    function init() {
      const r = c.getBoundingClientRect();
      const D = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      c.width = W * D;
      c.height = H * D;
      x.setTransform(D, 0, 0, D, 0, 0);
      cx = W / 2;
      cy = H / 2; // Center the field
    }

    // Distant particle field - particles orbiting at a distance
    const particles = [];
    const particleCount = 60; // Fewer particles for subtlety
    for (let i = 0; i < particleCount; i++) {
      // Radius from center (distant orbit)
      const radius = 80 + Math.random() * 120; // 80-200px from center
      const angle = Math.random() * Math.PI * 2;
      // Very slow orbital speed
      const speed = (Math.random() * 0.00002 + 0.000005) * (Math.random() > 0.5 ? 1 : -1);
      particles.push({
        radius,
        angle,
        speed,
        size: Math.random() * 1.2 + 0.3, // 0.3-1.5px
        brightness: Math.random() * 0.1 + 0.02, // 0.02-0.12 (very subtle)
        hue: Math.random() * 60 + 180, // Blues to purples (space-like)
        drift: Math.random() * 0.00001 // Slow inward drift to show attraction
      });
    }

    function frame(ts) {
      raf = window.requestAnimationFrame(frame);
      if (!live) return;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const step = reduce ? dt * 0.12 : dt;
      rotation += rotationSpeed * step;

      // Clear with transparent black (deep space)
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = 'rgba(0,0,0,0.02)'; // Very subtle clear to allow trailing
      x.fillRect(0, 0, W, H);

      x.save();
      x.translate(cx, cy);
      x.rotate(rotation);
      x.translate(-cx, -cy);

      // Draw particles
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Update position
        p.angle += p.speed * step;
        p.radius -= p.drift * step; // Slow inward drift (attraction)

        // Reset particle if it drifts too close or too far
        if (p.radius < 20) {
          p.radius = 150 + Math.random() * 100; // Reset to distant orbit
          p.angle = Math.random() * Math.PI * 2;
        }
        if (p.radius > 300) {
          p.radius = 50 + Math.random() * 50; // Reset to closer orbit
          p.angle = Math.random() * Math.PI * 2;
        }

        // Calculate position
        const xPos = cx + Math.cos(p.angle) * p.radius;
        const yPos = cy + Math.sin(p.angle) * p.radius;

        // Draw particle
        x.fillStyle = `hsla(${p.hue}, 70%, ${Math.round(p.brightness * 100)}%, ${p.brightness})`;
        x.beginPath();
        x.arc(xPos, yPos, p.size / 2, 0, Math.PI * 2);
        x.fill();
      }

      x.restore();
    }

    init();
    window.addEventListener('resize', init);
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', init);
    };
  }, []);

  return <canvas className="blackhole-particle-field" aria-hidden="true" />;
}