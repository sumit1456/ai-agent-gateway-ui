import React, { useEffect, useRef, useState } from 'react';

/* ============================================================================
   CONTROL PANEL — change values here, everything below reads from them.

   QUICK FIND (search for these words):
     black hole size / black hole radius ... BLACK_HOLE_SIZE_ZOOM, BLACK_HOLE_SHADOW_RADIUS
     black hole position ................... BLACK_HOLE_POSITION_*
     ring rotation speed ................... RING_ROTATION_SPEED, RING_ROTATION_DIRECTION,
                                             UPPER_RING_ROTATION_SPEED_MULTIPLIER,
                                             LOWER_RING_ROTATION_SPEED_MULTIPLIER
     upper ring thickness .................. UPPER_RING_THINNING
     lower ring thickness .................. LOWER_RING_THINNING
     ring brightness / ring clumps ......... DISK_BRIGHTNESS, RING_CLUMP_*
     planet size / planet orbit speed ...... PLANETS, PLANET_ORBIT_SPEED
     canvas size / aspect ratio ............ CANVAS_ASPECT_RATIO

   Units: shader "world" units use the black hole radius (event horizon) = 1,
   so RING_INNER_RADIUS = 2.6 means "2.6 black hole radii from the centre".

   CSS overrides (no JS edit needed) — set these on the component's className:
     --blackhole-aspect-ratio           e.g. 21 / 9   (canvas height follows its width)
     --blackhole-height                 e.g. 70vh     (fixed height; overrides the aspect ratio)
     --blackhole-background-color       e.g. #000
     --blackhole-orbit-line-color       e.g. rgba(255,255,255,.12)
     --blackhole-planet-1-lit-color     (also -2-, -3-, ...)
     --blackhole-planet-1-shadow-color
   ========================================================================== */

// ---- Canvas size --------------------------------------------------------------
const CANVAS_ASPECT_RATIO = '16 / 9';          // CANVAS SIZE: width / height. Height follows width so the black hole, rings and planets scale together
const CANVAS_BACKGROUND_COLOR = '#040409';
const MAX_PIXEL_RATIO = 1.25;                  // render sharpness cap (lower = faster)

// ---- Black hole size & position -----------------------------------------------
const BLACK_HOLE_SIZE_ZOOM = 0.5;              // BLACK HOLE SIZE: bigger = bigger black hole radius on screen; rings and planets scale with it
//   (on-screen black hole radius in px ≈ BLACK_HOLE_SHADOW_RADIUS / CAMERA_DISTANCE * BLACK_HOLE_SIZE_ZOOM * canvas width)
const BLACK_HOLE_SHADOW_RADIUS = 2.6;          // BLACK HOLE RADIUS (apparent dark shadow, in world units). Only used to size planets; the shadow itself comes from the physics
const BLACK_HOLE_POSITION_X_FRACTION = 0.5;    // black hole position: 0 = left edge, 1 = right edge
const BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION = 0.68; // black hole position: 0 = bottom, 1 = top

// ---- Camera -----------------------------------------------------------------
const CAMERA_TILT_RADIANS = 0.1;               // 0 = edge-on, 1.57 = looking straight down (low = NASA-style flat view)
const CAMERA_DISTANCE = 30;                    // distance from the black hole (also affects black hole size, so adjust BLACK_HOLE_SIZE_ZOOM after)

// ---- Rings (accretion disk) shape -------------------------------------------
const RING_INNER_RADIUS = 2.6;                 // inner edge of the glowing ring, in black hole radii
const DISK_OUTER_RADIUS = 16.0;                // outer edge of the ring, in black hole radii: wider = longer flat tails + taller upper ring
const DISK_OUTER_FADE_WIDTH = 7.0;             // how gradually the outer edge fades away
const DISK_BRIGHTNESS_FALLOFF = 0.9;           // lower = outer ring stays bright (broader upper ring)

// ---- Ring thickness (upper ring = arch over the top, lower ring = half ring underneath) ----
const UPPER_RING_THINNING = 0.0;               // UPPER RING THICKNESS: 0 = thickest, ~1 = thinner, 2+ = thin line
const LOWER_RING_THINNING = 0.0;               // LOWER RING THICKNESS: 0 = thickest, ~1 = thinner, 2+ = almost invisible

// ---- Ring rotation ------------------------------------------------------------
const RING_ROTATION_SPEED = 3.8;               // RING ROTATION SPEED for the whole ring (0 = frozen, higher = faster; inner part always spins faster)
const RING_ROTATION_DIRECTION = 1.0;           // 1 or -1: flips the rotation direction and which side is bright (Doppler)
const UPPER_RING_ROTATION_SPEED_MULTIPLIER = 1.0; // extra ring rotation speed for the upper ring only (and the flat front band)
const LOWER_RING_ROTATION_SPEED_MULTIPLIER = 1.0; // extra ring rotation speed for the lower ring only (1 = same, 2 = twice as fast)
const RING_CLUMP_COUNT = 120;                   // whole number: how many bright/dark clumps travel around the ring. Higher = finer, makes rotation easier to see
//   (the lower ring is stretched by lensing, so low values look "stuck")
const RING_CLUMP_BASE_BRIGHTNESS = 0.35;       // brightness between clumps (0 = clumps fully dark between)
const RING_CLUMP_CONTRAST = 1.2;               // how strongly clumps stand out (0 = smooth ring, nothing visibly rotates)

// ---- Ring brightness & quality ---------------------------------------------------
const DISK_BRIGHTNESS = 1.7;                   // overall ring glow
const DISK_EXPOSURE = 1.5;                     // higher = hotter / more washed out
const RAY_MARCH_STEPS = 170;                   // lower = faster, may clip the lensing

// ring colour ramp, cool -> white-hot  [r, g, b] 0..1
const DISK_COLOR_COOL = [0.45, 0.05, 0.0];
const DISK_COLOR_WARM = [1.0, 0.42, 0.04];
const DISK_COLOR_GOLD = [1.0, 0.82, 0.45];
const DISK_COLOR_WHITE_HOT = [1.0, 0.97, 0.9];

// ---- Stars & space ----------------------------------------------------------
const STAR_DENSITY_THRESHOLD = 0.9985;         // closer to 1 = fewer stars (0.998 = more)
const STAR_BRIGHTNESS = 0.9;
const STAR_COLOR = [0.8, 0.85, 1.0];
const SPACE_TINT_COLOR = [0.016, 0.016, 0.036];

// ---- Planets & planet orbit rotation (drawn on an overlay canvas) ------------
const PLANETS_ENABLED = true;
const PLANET_ORBIT_SPEED = 0.25;               // PLANET ORBIT ROTATION SPEED, global (rad/s at the canvas edge; inner orbits are faster)
const PLANET_ORBIT_CLOCKWISE = true;
const ORBIT_FLATTENING_RATIO = 0.18;           // 1 = circle, small = flat like the ring (kept rounder than the tilt so orbits stay readable)
const NEAR_SIDE_SIZE_BOOST = 0.35;             // planets grow by this much on the viewer-facing side
const PLANET_LIGHT_SHIFT = 0.4;                // 0..1, highlight shift toward the black hole

const ORBIT_LINE_VISIBLE = false;              // true = draw a faint line along each planet's orbit
const ORBIT_LINE_WIDTH_PX = 1;
const ORBIT_LINE_COLOR = 'rgba(255,255,255,0.10)';

const PLANETS = [
  // orbitWidthFraction : orbit half-width as a share of the distance from the black hole to the nearest
  //                      canvas edge (1 = touches the edge, 0.9 = just inside)
  // radiusInShadowRadii: PLANET SIZE as a share of the black hole radius (shadow radius); scales with black hole size
  // speedMultiplier    : per-planet orbit rotation speed on top of PLANET_ORBIT_SPEED
  // startAngleRadians  : null = random
  // flatteningRatio    : null = use ORBIT_FLATTENING_RATIO
  { name: 'ember', orbitWidthFraction: 0.74, radiusInShadowRadii: 0.03, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#e0b27a', shadowColor: '#5a3a22' },
  { name: 'ocean', orbitWidthFraction: 0.86, radiusInShadowRadii: 0.045, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#9cc4ee', shadowColor: '#1c3a66' },
  { name: 'rust', orbitWidthFraction: 0.97, radiusInShadowRadii: 0.035, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#d98a70', shadowColor: '#4a2219' },
];

/* ========================================================================== */

const TAU = Math.PI * 2;
const glslFloat = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glslVec3 = (c) => `vec3(${c.map(glslFloat).join(',')})`;

const VERTEX_SHADER = `
  attribute vec2 a;
  void main() { gl_Position = vec4(a, 0., 1.); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 R;
uniform float T;
const float TAU=${glslFloat(6.2831853)};
const float RIN=${glslFloat(RING_INNER_RADIUS)},ROUT=${glslFloat(DISK_OUTER_RADIUS)};
const float ROT=${glslFloat(RING_ROTATION_DIRECTION)};
const float CL=${glslFloat(Math.round(RING_CLUMP_COUNT))};
const float UPSPIN=${glslFloat(UPPER_RING_ROTATION_SPEED_MULTIPLIER)},LOSPIN=${glslFloat(LOWER_RING_ROTATION_SPEED_MULTIPLIER)};
const float UPTHIN=${glslFloat(UPPER_RING_THINNING)},LOTHIN=${glslFloat(LOWER_RING_THINNING)};
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnp(vec2 p,float per){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=mod(i.x,per),b=mod(i.x+1.,per);
 return mix(mix(h21(vec2(a,i.y)),h21(vec2(b,i.y)),f.x),mix(h21(vec2(a,i.y+1.)),h21(vec2(b,i.y+1.)),f.x),f.y);}
vec3 ramp(float k){
 vec3 c=mix(${glslVec3(DISK_COLOR_COOL)},${glslVec3(DISK_COLOR_WARM)},smoothstep(0.,.5,k));
 c=mix(c,${glslVec3(DISK_COLOR_GOLD)},smoothstep(.45,.85,k));
 return mix(c,${glslVec3(DISK_COLOR_WHITE_HOT)},smoothstep(.85,1.,k));}
void main(){
 vec2 uv=(gl_FragCoord.xy-R*vec2(${glslFloat(BLACK_HOLE_POSITION_X_FRACTION)},${glslFloat(BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION)}))/(R.x*${glslFloat(BLACK_HOLE_SIZE_ZOOM)});
 float el=${glslFloat(CAMERA_TILT_RADIANS)};
 vec3 ro=${glslFloat(CAMERA_DISTANCE)}*vec3(0.,sin(el),-cos(el));
 vec3 fw=-normalize(ro),rt=normalize(cross(vec3(0,1,0),fw)),up=cross(fw,rt);
 vec3 vel=normalize(fw+(uv.x*rt+uv.y*up)*1.0),pos=ro;
 float h2=dot(cross(pos,vel),cross(pos,vel));vec3 v0=vel;
 vec3 col=vec3(0.);float tr=1.,nc=0.;bool esc=true;
 for(int i=0;i<${RAY_MARCH_STEPS};i++){
  float r2=dot(pos,pos),r=sqrt(r2);
  if(r<1.){esc=false;break;}
  if(tr<.02)break;
  if(r>${glslFloat(CAMERA_DISTANCE + 15)}&&dot(pos,vel)>0.)break;
  float dt=clamp(.05*r,.015,.45);
  vec3 nv=normalize(vel-1.5*h2*pos/(r2*r2*r)*dt);
  vec3 np=pos+nv*dt;
  if(pos.y*np.y<0.){
   vec3 p=mix(pos,np,pos.y/(pos.y-np.y));
   float rr=length(p.xz);
   if(rr>RIN&&rr<ROUT){
    float k=pow(RIN/rr,.55);
    bool upperRing=pos.y>0.; // ray came down onto the ring from above = upper ring / front band; from below = lower ring
    float spin=upperRing?UPSPIN:LOSPIN;
    float u=(atan(p.z,p.x)/TAU+.5)*CL+T*2.5/pow(rr,1.5)*ROT*${glslFloat(RING_ROTATION_SPEED)}*spin*CL/24.;
    float n=.6*vnp(vec2(u,rr*6.),CL)+.4*vnp(vec2(u*2.,rr*15.),2.*CL);
    vec3 vd=normalize(vec3(-p.z,0.,p.x))*sqrt(.5/rr)*ROT;
    float D=clamp(1./(1.-dot(vd,-nv)),.35,2.6);
    float bf=smoothstep(.15,.6,1.-dot(nv,v0));
    float I=pow(RIN/rr,${glslFloat(DISK_BRIGHTNESS_FALLOFF)}+3.5*bf*(upperRing?UPTHIN:LOTHIN))*(${glslFloat(RING_CLUMP_BASE_BRIGHTNESS)}+${glslFloat(RING_CLUMP_CONTRAST)}*n)*pow(D,2.2);
    float ed=smoothstep(RIN,RIN+.25,rr)*(1.-smoothstep(ROUT-${glslFloat(DISK_OUTER_FADE_WIDTH)},ROUT,rr));
    I*=ed*(1.-.6*nc);
    col+=tr*ramp(clamp(k*D*1.05,0.,1.))*I*${glslFloat(DISK_BRIGHTNESS)};
    tr*=1.-.97*ed;nc=1.;
   }
  }
  pos=np;vel=nv;
 }
 if(esc){
  vec3 d=floor(normalize(vel)*420.);
  float s=h21(d.xy+d.z*7.3);
  col+=tr*${glslVec3(STAR_COLOR)}*smoothstep(${glslFloat(STAR_DENSITY_THRESHOLD)},1.,s)*${glslFloat(STAR_BRIGHTNESS)};
 }
 col=1.-exp(-col*${glslFloat(DISK_EXPOSURE)});
 gl_FragColor=vec4(col+${glslVec3(SPACE_TINT_COLOR)}*tr,1.);
}
`;

export default function BlackholeImproved({ className = '', style = {} }) {
  const wrapperRef = useRef(null);
  const glCanvasRef = useRef(null);
  const planetCanvasRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const glCanvas = glCanvasRef.current;
    const planetCanvas = planetCanvasRef.current;
    if (!wrapper || !glCanvas || !planetCanvas) return undefined;

    const gl = glCanvas.getContext('webgl');
    if (!gl) {
      setErrorMessage('WebGL not supported');
      return undefined;
    }

    // ---- compile shaders ---------------------------------------------------
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        setErrorMessage(gl.getShaderInfoLog(shader) || 'Shader compile failed');
        return null;
      }
      return shader;
    };
    const vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setErrorMessage(gl.getProgramInfoLog(program) || 'Program link failed');
      return undefined;
    }
    gl.useProgram(program);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    const resolutionUniform = gl.getUniformLocation(program, 'R');
    const timeUniform = gl.getUniformLocation(program, 'T');

    const planetCtx = planetCanvas.getContext('2d');
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    // ---- planets state -----------------------------------------------------
    const planets = PLANETS.map((planet) => ({
      ...planet,
      angle: planet.startAngleRadians == null ? Math.random() * TAU : planet.startAngleRadians,
    }));

    let canvasWidth = 1;
    let canvasHeight = 1;
    let pixelRatio = 1;
    let holeX = 0;
    let holeY = 0;
    let shadowRadiusPx = 1;
    let orbitLineColor = ORBIT_LINE_COLOR;
    let planetColors = [];

    // read CSS custom properties (fall back to the constants above)
    const readCssTheme = () => {
      const css = getComputedStyle(wrapper);
      const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
      orbitLineColor = read('--blackhole-orbit-line-color', ORBIT_LINE_COLOR);
      planetColors = PLANETS.map((planet, i) => ({
        lit: read(`--blackhole-planet-${i + 1}-lit-color`, planet.litColor),
        shadow: read(`--blackhole-planet-${i + 1}-shadow-color`, planet.shadowColor),
      }));
    };

    const resize = () => {
      pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvasWidth = Math.max(1, wrapper.clientWidth);
      canvasHeight = Math.max(1, wrapper.clientHeight);
      [glCanvas, planetCanvas].forEach((canvas) => {
        canvas.width = Math.round(canvasWidth * pixelRatio);
        canvas.height = Math.round(canvasHeight * pixelRatio);
      });
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      planetCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      holeX = canvasWidth * BLACK_HOLE_POSITION_X_FRACTION;
      holeY = canvasHeight * (1 - BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION);
      shadowRadiusPx = (BLACK_HOLE_SHADOW_RADIUS / CAMERA_DISTANCE) * canvasWidth * BLACK_HOLE_SIZE_ZOOM;
      readCssTheme();
    };
    resize();

    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(wrapper);
    } else {
      window.addEventListener('resize', resize);
    }

    // ---- planets drawing ---------------------------------------------------
    const drawPlanets = (deltaSeconds) => {
      planetCtx.clearRect(0, 0, canvasWidth, canvasHeight);
      if (!PLANETS_ENABLED) return;

      const nearestEdgeDistance = Math.min(holeX, canvasWidth - holeX);
      const direction = PLANET_ORBIT_CLOCKWISE ? 1 : -1; // canvas y points down, so +angle = clockwise

      const drawList = planets.map((planet, i) => {
        const flattening = planet.flatteningRatio == null ? ORBIT_FLATTENING_RATIO : planet.flatteningRatio;
        const orbitHalfWidth = planet.orbitWidthFraction * nearestEdgeDistance;
        // Keplerian-style: inner orbits move faster
        const angularSpeed = (PLANET_ORBIT_SPEED * planet.speedMultiplier) / Math.pow(planet.orbitWidthFraction, 1.5);
        planet.angle += direction * angularSpeed * deltaSeconds;
        const sine = Math.sin(planet.angle);
        return {
          planet,
          colors: planetColors[i],
          flattening,
          orbitHalfWidth,
          x: holeX + Math.cos(planet.angle) * orbitHalfWidth,
          y: holeY + sine * orbitHalfWidth * flattening,
          nearness: sine, // -1 far side (top), +1 near side (bottom)
        };
      });

      if (ORBIT_LINE_VISIBLE) {
        planetCtx.strokeStyle = orbitLineColor;
        planetCtx.lineWidth = ORBIT_LINE_WIDTH_PX;
        drawList.forEach((item) => {
          planetCtx.beginPath();
          planetCtx.ellipse(holeX, holeY, item.orbitHalfWidth, item.orbitHalfWidth * item.flattening, 0, 0, TAU);
          planetCtx.stroke();
        });
      }

      drawList.sort((a, b) => a.nearness - b.nearness); // far side first
      drawList.forEach((item) => {
        const radius = Math.max(1, item.planet.radiusInShadowRadii * shadowRadiusPx * (1 + NEAR_SIDE_SIZE_BOOST * item.nearness));
        const towardHoleX = holeX - item.x;
        const towardHoleY = holeY - item.y;
        const towardHoleLength = Math.hypot(towardHoleX, towardHoleY) || 1;
        const gradient = planetCtx.createRadialGradient(
          item.x + (towardHoleX / towardHoleLength) * radius * PLANET_LIGHT_SHIFT,
          item.y + (towardHoleY / towardHoleLength) * radius * PLANET_LIGHT_SHIFT,
          0,
          item.x,
          item.y,
          radius
        );
        gradient.addColorStop(0, item.colors.lit);
        gradient.addColorStop(1, item.colors.shadow);
        planetCtx.fillStyle = gradient;
        planetCtx.beginPath();
        planetCtx.arc(item.x, item.y, radius, 0, TAU);
        planetCtx.fill();
      });
    };

    // ---- animation loop ----------------------------------------------------
    let animationFrameId = 0;
    let isVisible = true;
    let elapsedSeconds = 0; // running clock for the shader
    let lastTimestamp = 0;

    const frame = (timestamp) => {
      animationFrameId = requestAnimationFrame(frame);
      if (!lastTimestamp) lastTimestamp = timestamp;
      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.05);
      lastTimestamp = timestamp;
      if (!isVisible) return;

      const step = delta * (prefersReducedMotion ? 0.1 : 1);
      elapsedSeconds += step;

      gl.uniform2f(resolutionUniform, glCanvas.width, glCanvas.height);
      gl.uniform1f(timeUniform, elapsedSeconds);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      drawPlanets(step);
    };
    animationFrameId = requestAnimationFrame(frame);

    let intersectionObserver = null;
    try {
      intersectionObserver = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
      });
      intersectionObserver.observe(wrapper);
    } catch (err) {
      isVisible = true;
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (intersectionObserver) intersectionObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      else window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(vertexBuffer);
    };
  }, []);

  const fullSizeLayer = { position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' };

  return (
    <div
      ref={wrapperRef}
      className={`blackhole ${className}`.trim()}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `var(--blackhole-aspect-ratio, ${CANVAS_ASPECT_RATIO})`,
        height: 'var(--blackhole-height, auto)',
        background: `var(--blackhole-background-color, ${CANVAS_BACKGROUND_COLOR})`,
        overflow: 'hidden',
        ...style,
      }}
    >
      <canvas ref={glCanvasRef} className="blackhole__gl-canvas" style={fullSizeLayer} aria-hidden="true" />
      <canvas
        ref={planetCanvasRef}
        className="blackhole__planet-canvas"
        style={{ ...fullSizeLayer, pointerEvents: 'none' }}
        aria-hidden="true"
      />
      {errorMessage && (
        <div className="blackhole__error" style={{ position: 'absolute', zIndex: 2, color: '#eee', font: '14px system-ui', padding: 16 }}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}