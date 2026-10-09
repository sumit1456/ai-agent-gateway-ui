import { useEffect, useRef } from 'react';

export default function Particles({ density = 90 }) {
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

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const COLORS = ['255,154,60', '139,92,246', '236,235,245'];
    let W = 0;
    let H = 0;
    let P = [];
    let raf = 0;
    let live = true;
    let last = 0;

    function init() {
      const r = c.getBoundingClientRect();
      const D = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      c.width = W * D;
      c.height = H * D;
      x.setTransform(D, 0, 0, D, 0, 0);
      const n = Math.max(40, Math.min(density, Math.round((W * H) / 11000)));
      P = [];
      for (let i = 0; i < n; i += 1) {
        const orange = Math.random() < 0.3;
        P.push({
          x: Math.random() * W,
          y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.14 - 0.03,
          r: Math.random() * 1.6 + 0.6,
          color: COLORS[orange ? 0 : Math.random() < 0.3 ? 1 : 2],
          alpha: Math.random() * 0.35 + 0.15,
          phase: Math.random() * 6.283,
          spin: Math.random() * 0.6 + 0.2,
        });
      }
      x.fillStyle = 'rgba(4,4,9,1)';
      x.fillRect(0, 0, W, H);
    }

    function frame(ts) {
      raf = window.requestAnimationFrame(frame);
      if (!live) return;
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      const step = reduce ? dt * 0.1 : dt;

      x.clearRect(0, 0, W, H);
      for (let i = 0; i < P.length; i += 1) {
        const p = P[i];
        p.x += p.vx * step * 60;
        p.y += p.vy * step * 60;
        if (p.x < -4) p.x = W + 4;
        else if (p.x > W + 4) p.x = -4;
        if (p.y < -4) p.y = H + 4;
        else if (p.y > H + 4) p.y = -4;

        const twinkle = 0.65 + 0.35 * Math.sin((ts / 1000) * p.spin + p.phase);
        x.fillStyle = `rgba(${p.color},${(p.alpha * twinkle).toFixed(3)})`;
        x.beginPath();
        x.arc(p.x, p.y, p.r, 0, 6.283);
        x.fill();
      }
    }

    let io;
    const onResize = () => init();
    init();
    window.addEventListener('resize', onResize);
    try {
      io = new IntersectionObserver((e) => {
        live = e[0].isIntersecting;
      });
      io.observe(c);
    } catch (err) {
      live = true;
    }
    last = performance.now();
    raf = window.requestAnimationFrame(frame);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
    };
  }, [density]);

  return <canvas className="particles-canvas" ref={canvasRef} aria-hidden="true" />;
}
