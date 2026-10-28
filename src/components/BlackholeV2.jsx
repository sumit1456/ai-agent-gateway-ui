import React, { useEffect, useRef } from 'react';

/* ============================================================================
   CONTROL PANEL — change values here, everything below reads from them.
   Usage: <BlackholeGargantua className="my-canvas" />  (size the canvas with your own CSS)
   Props: className, id, style, positionX (0..1 or fn(width)), positionY (0..1 from bottom),
          rotation (degrees), tilt (radians), transparentBackground
   ========================================================================== */

// ---- Feature toggles (true / false) ------------------------------------------
const SPACE_WRAP_EFFECT = true;   // swirling, smeared stars around the hole (false = plain lensed stars)
const SHADOW_GLOW = true;         // faint lensed glow inside the shadow (false = pure black)
const RING_STREAKS = true;        // gas smeared along its rotation (false = clumpy dots)
const LOWER_RING_FIX = true;      // dim, thin lower image so it doesn't look like a donut
const LOWER_RING_DETAIL = true;   // show the lower disk as rotating gas streams instead of a smooth band
const PHOTON_RING = true;         // thin bright line hugging the shadow
const STARS = false;               // background star field
const WRAP_HAZE = true;          // keep the effect tight; no broad haze layer

// ---- Render quality ------------------------------------------------------------
const RENDER_MODE = 'medium';     // 'high' | 'medium' | 'low' | 'auto'
const RENDER_QUALITY = {
  high: { pixelRatio: 1.25, rayMarchSteps: 170 },
  medium: { pixelRatio: 1.0, rayMarchSteps: 150 },
  low: { pixelRatio: 0.75, rayMarchSteps: 140 },
};
const getRenderMode = () => {
  if (RENDER_MODE !== 'auto') return RENDER_QUALITY[RENDER_MODE] ? RENDER_MODE : 'high';
  if (typeof navigator === 'undefined') return 'high';
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  return cores <= 4 || memory <= 4 ? 'low' : cores <= 8 || memory <= 8 ? 'medium' : 'high';
};
const ACTIVE_QUALITY = RENDER_QUALITY[getRenderMode()];
const MAX_PIXEL_RATIO = ACTIVE_QUALITY.pixelRatio;
const RAY_MARCH_STEPS = ACTIVE_QUALITY.rayMarchSteps; // keep >= 140 to preserve the lensing silhouette

// ---- Size & position -----------------------------------------------------------
const BLACK_HOLE_RADIUS = 0.21;   // ★ SIZE: shadow radius = this x min(0.8 x canvas width, canvas height)
const BLACK_HOLE_SIZE_BASIS_WIDTH_FRACTION = 0.8;
const BLACK_HOLE_SHADOW_RADIUS = 4.06; // calibration (measured). Leave as is.
const BLACK_HOLE_POSITION_X_FRACTION = 0.5;
const BLACK_HOLE_POSITION_X_FRACTION_NARROW = 0.62;
const BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION = 0.5;
const BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION_NARROW = 0.6;
const NARROW_CANVAS_MAX_WIDTH_PX = 700;
const NARROW_VIEWPORT_MAX_WIDTH_PX = 820;
const CAMERA_TILT_RADIANS = 0.13; // 0 = edge-on
const CAMERA_DISTANCE = 30;

// ---- Rings ----------------------------------------------------------------------
const RING_INNER_RADIUS = 2.6;
const DISK_OUTER_RADIUS = 12.0;
const RING_ROTATION_SPEED = 15.5;  // matched to BlackholeImproved's visible ring speed; 0 = frozen
const STREAK_LENGTH = 1.5;        // retain streaks while keeping their movement visible
const DISK_BRIGHTNESS = 1.6;
const DISK_EXPOSURE = 1.5;
const UPPER_RING_THINNING = 0.2; // lower = thicker upper arch
const LOWER_RING_BRIGHTNESS = 1; // match the upper disk's overall brightness
const LOWER_RING_THINNING = UPPER_RING_THINNING; // keep the lower ring's color profile; brightness is controlled separately
const SHADOW_GLOW_STRENGTH = 0.5;

// ---- Space wrap ------------------------------------------------------------------
const WRAP_OPACITY = 1;        // barely visible lensing around the shadow
const WRAP_SPEED = 0.7;          // swirl speed at the hole edge, rad/s
const WRAP_RADIUS = 3;          // keep the wrap close to the black hole
const WRAP_CLOCKWISE = true;

// ---- Planets (drawn by the shader, off by default) ---------------------------------
const PLANETS_ENABLED = false;
const PLANET_ORBIT_SPEED = 0.25;
const PLANET_ORBIT_SPEED_REFERENCE_FRACTION = 0.86;
const PLANET_ORBIT_MAX_WIDTH_FRACTION = 0.48;
const PLANET_ORBIT_CLOCKWISE = true;
const ORBIT_FLATTENING_RATIO = 0.18;
const NEAR_SIDE_SIZE_BOOST = 0.35;
const PLANET_LIGHT_SHIFT = 0.4;
const ORBIT_LINE_VISIBLE = false;
const ORBIT_LINE_WIDTH_PX = 1;
const ORBIT_LINE_COLOR = 'rgba(255,255,255,0.10)';
const PLANETS = [
  { name: 'ember', orbitWidthFraction: 0.74, radiusInShadowRadii: 0.02, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#e0b27a', shadowColor: '#5a3a22' },
  { name: 'ocean', orbitWidthFraction: 0.86, radiusInShadowRadii: 0.03, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#9cc4ee', shadowColor: '#1c3a66' },
  { name: 'rust', orbitWidthFraction: 0.97, radiusInShadowRadii: 0.023, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#d98a70', shadowColor: '#4a2219' },
];

/* ========================================================================== */

const TAU = Math.PI * 2;
const gf = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const gb = (v) => (v ? '1.' : '0.');
const SSR = BLACK_HOLE_SHADOW_RADIUS / Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - BLACK_HOLE_SHADOW_RADIUS * BLACK_HOLE_SHADOW_RADIUS);
const PLANET_COUNT = PLANETS_ENABLED ? PLANETS.length : 0;

const PLANET_UNIFORMS_GLSL = PLANET_COUNT > 0
  ? `uniform vec4 PL[${PLANET_COUNT}];
uniform vec3 PA[${PLANET_COUNT}];
uniform vec3 PB[${PLANET_COUNT}];
uniform vec2 HC;
${ORBIT_LINE_VISIBLE ? `uniform vec2 PO[${PLANET_COUNT}];
uniform vec4 LC;
uniform float LW;` : ''}`
  : '';
const PLANET_GLSL = PLANET_COUNT > 0
  ? `
 vec2 fc=gl_FragCoord.xy;
${ORBIT_LINE_VISIBLE ? ` for(int i=0;i<${PLANET_COUNT};i++){
  vec2 q=(fc-HC)/PO[i];
  float e=abs(length(q)-1.)*min(PO[i].x,PO[i].y);
  outc=mix(outc,LC.rgb,LC.a*(1.-smoothstep(LW*.5-.5,LW*.5+.5,e)));
 }` : ''}
 for(int i=0;i<${PLANET_COUNT};i++){
  float rad=PL[i].z;
  float a=1.-smoothstep(rad-.7,rad+.7,length(fc-PL[i].xy));
  if(a>0.){
   vec2 toHole=HC-PL[i].xy;
   vec2 hl=PL[i].xy+toHole/max(length(toHole),1.)*rad*${gf(PLANET_LIGHT_SHIFT)};
   float t=clamp(length(fc-hl)/rad,0.,1.);
   outc=mix(outc,mix(PA[i],PB[i],t),a);
  }
 }
`
  : '';

const ESCAPED_GLSL = SPACE_WRAP_EFFECT
  ? `
  float r1=max(rho,1.);
  float env=1.-smoothstep(${gf(WRAP_RADIUS)}*.4,${gf(WRAP_RADIUS)},rho);
  float fall=pow(1./r1,1.5);
  float om=${gf(WRAP_SPEED)}*fall*env, sm=.6*fall*env;
  float dirn=${WRAP_CLOCKWISE ? '1.' : '-1.'};
  float acc=0.;
  for(int k=0;k<8;k++){
   float ff=float(k)/7.-.5;
   acc+=sky(rotAxis(d,fw,-dirn*(T*om+ff*sm)),env/r1);
  }
  acc=acc/8.*(1.+sm*10.);
  acc=mix(sky(d,0.),acc,${gf(WRAP_OPACITY)});
  col+=tr*sc*acc*1.1;
  float th=atan(uv.y,uv.x),hz=0.;
  for(int ph=0;ph<2;ph++){
   float phi=fract(T/10.+float(ph)*.5),w=1.-abs(2.*phi-1.);
   float u=((th+dirn*om*10.*phi)/TAU+.5)*9.;
   hz+=w*(.6*vnp(vec2(u,rho*1.1),9.)+.4*vnp(vec2(u*2.,rho*2.5+7.),18.));
  }
  float henv=smoothstep(1.,1.3,rho)*(1.-smoothstep(${gf(WRAP_RADIUS)}*.3,${gf(WRAP_RADIUS)},rho))/pow(r1,.6);
  col+=tr*vec3(1.,.38,.12)*.22*${gf(WRAP_OPACITY)}*${gb(WRAP_HAZE)}*smoothstep(.25,.95,hz)*henv;
`
  : `col+=tr*sc*sky(d,0.)*1.1;`;

const GAS_GLSL = RING_STREAKS
  ? `for(int j=0;j<5;j++){float o=(float(j)-2.)*${gf(STREAK_LENGTH)}*.25;
  n+=.5*vnp(vec2(u+o,rr*9.),CL)+.5*vnp(vec2(u*.7+o,rr*26.+3.),CL*.7);}
 n=n/5.;n=.25+1.5*n*n;`
  : `n=.5*vnp(vec2(u,rr*5.),CL)+.3*vnp(vec2(u*2.,rr*14.),2.*CL)+.2*vnp(vec2(u*.5,rr*30.),CL*.5);`;

const LOWER_GLSL = !LOWER_RING_FIX
  ? ''
  : LOWER_RING_DETAIL
    ? `if(!upper){float streams=.2+1.4*n*n;float gaps=.35+1.3*vnp(vec2(u*.22,rr*7.+n*2.),CL);float bands=.85+.3*sin(u*.45+rr*10.);I*=${gf(LOWER_RING_BRIGHTNESS)}*streams*gaps*bands;}`
    : `if(!upper)I*=${gf(LOWER_RING_BRIGHTNESS)};`;

const VERTEX_SHADER = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 R;
uniform float T,Z,EL,A,TB;
uniform vec2 HP;
${PLANET_UNIFORMS_GLSL}
const float TAU=6.2831853,RIN=${gf(RING_INNER_RADIUS)},ROUT=${gf(DISK_OUTER_RADIUS)},CL=70.;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnp(vec2 p,float per){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float a=mod(i.x,per),b=mod(i.x+1.,per);
 return mix(mix(h21(vec2(a,i.y)),h21(vec2(b,i.y)),f.x),mix(h21(vec2(a,i.y+1.)),h21(vec2(b,i.y+1.)),f.x),f.y);}
vec3 rotAxis(vec3 v,vec3 k,float b){float c=cos(b),s=sin(b);return v*c+cross(k,v)*s+k*dot(k,v)*(1.-c);}
float st(vec3 d,float grid,float dens,float soft){
 vec3 q=d*grid,id=floor(q);float s=h21(id.xy+id.z*7.3);
 if(s<1.-dens)return 0.;
 float bb=(s-(1.-dens))/dens;
 vec3 j=(vec3(h21(id.yz),h21(id.zx),h21(id.xy))-.5)*.3;
 float dist=length(q-(id+.5+j));
 return (1.-smoothstep(0.,.3+.14*clamp(soft,0.,1.),dist))*(.25+.75*bb*bb)/(1.+1.5*soft);}
float sky(vec3 d,float soft){return ${gb(STARS)}*(st(d,90.,.05,soft)+.6*st(d*1.7+3.,160.,.06,soft));}
vec3 ramp(float k){
 vec3 c=mix(vec3(.4,.05,0.),vec3(1.,.4,.05),smoothstep(0.,.5,k));
 c=mix(c,vec3(1.,.8,.45),smoothstep(.4,.85,k));
 return mix(c,vec3(1.,.96,.88),smoothstep(.85,1.,k));}
float gas(float u,float rr){
 float n=0.;
 ${GAS_GLSL}
 return n;}
void main(){
 vec2 uv=(gl_FragCoord.xy-R*HP)/(R.x*Z);
 float ca=cos(A),sa=sin(A);
 uv=mat2(ca,-sa,sa,ca)*uv;
 vec3 ro=${gf(CAMERA_DISTANCE)}*vec3(0.,sin(EL),-cos(EL));
 vec3 fw=-normalize(ro),rt=normalize(cross(vec3(0,1,0),fw)),up=cross(fw,rt);
 vec3 vel=normalize(fw+uv.x*rt+uv.y*up),pos=ro,v0=vel;
 float h2=dot(cross(pos,vel),cross(pos,vel));
 float rho=length(uv)/${gf(SSR)};
 vec3 col=vec3(0.);float tr=1.,nc=0.;bool esc=true;
 for(int i=0;i<${RAY_MARCH_STEPS};i++){
  float r2=dot(pos,pos),r=sqrt(r2);
  if(r<1.){esc=false;break;}
  if(tr<.02)break;
  if(r>${gf(CAMERA_DISTANCE + 15)}&&dot(pos,vel)>0.)break;
  float dt=clamp(.05*r,.015,.45);
  vec3 nv=normalize(vel-1.5*h2*pos/(r2*r2*r)*dt);
  vec3 np=pos+nv*dt;
  if(pos.y*np.y<0.){
   vec3 p=mix(pos,np,pos.y/(pos.y-np.y));
   float rr=length(p.xz);
   if(rr>RIN&&rr<ROUT){
    bool upper=pos.y>0.;
    float k=pow(RIN/rr,.5);
    float u=(atan(p.z,p.x)/TAU+.5)*CL+T*${gf(RING_ROTATION_SPEED)}/pow(rr,1.5)*CL/24.;
    float n=gas(u,rr);
    vec3 vd=normalize(vec3(-p.z,0.,p.x))*sqrt(.5/rr);
    float D=clamp(1./(1.-dot(vd,-nv)),.6,1.9);
    float bf=smoothstep(.15,.6,1.-dot(nv,v0));
    float thin=upper?${gf(UPPER_RING_THINNING)}:${LOWER_RING_FIX ? gf(LOWER_RING_THINNING) : '.9'};
    float I=pow(RIN/rr,1.1+3.*bf*thin)*(.3+.9*n)*pow(D,2.);
    ${LOWER_GLSL}
    float ed=smoothstep(RIN,RIN+.3,rr)*(1.-smoothstep(ROUT-7.,ROUT,rr));
    I*=ed*(1.-.5*nc);
    col+=tr*ramp(clamp(k*D*1.05,0.,1.))*I*${gf(DISK_BRIGHTNESS)};
    nc=1.;
   }
  }
  pos=np;vel=nv;
 }
 if(esc){
  vec3 d=normalize(vel);
  vec3 sc=mix(vec3(.75,.82,1.),vec3(1.,.9,.75),h21(floor(d.xy*90.)));
  ${ESCAPED_GLSL}
 }else{
  float g=${gf(SHADOW_GLOW_STRENGTH)}*${gb(SHADOW_GLOW)};
  float topBias=.55+.45*clamp(uv.y/${gf(SSR)},-1.,1.);
  col+=tr*g*(vec3(.05,.08,.11)*pow(rho,2.)*topBias+vec3(.5,.28,.16)*pow(rho,7.)*.12);
 }
 if(rho>=1.){
  float g=(exp(-(rho-1.)/.018)*.9+exp(-(rho-1.)/.14)*.18)*${gb(PHOTON_RING)};
  col+=vec3(1.,.82,.58)*g*tr;
 }
 col=1.-exp(-col*${gf(DISK_EXPOSURE)});
 col*=1.-.35*dot(uv*.9,uv*.9)*(1.-TB);
 vec3 outc=col+(h21(gl_FragCoord.xy+T)-.5)/120.*(1.-TB);
${PLANET_GLSL}
 float alpha=mix(1.0,esc?1.0-exp(-max(max(outc.r,outc.g),outc.b)*3.0):1.0,TB);
 gl_FragColor=vec4(outc*alpha,alpha);
}
`;

export default function BlackholeGargantua({
  className = '',
  id = 'bh',
  style,
  positionX,
  positionY,
  rotation = 1,
  tilt = CAMERA_TILT_RADIANS,
  transparentBackground = false,
} = {}) {
  const canvasRef = useRef(null);
  const propsRef = useRef({});
  propsRef.current = { positionX, positionY, rotation, tilt, transparentBackground };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let gl = null;
    try { gl = canvas.getContext('webgl'); } catch (err) { gl = null; }
    if (!gl) { console.error('BlackholeGargantua: WebGL not supported'); return undefined; }

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('BlackholeGargantua shader error:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return undefined;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('BlackholeGargantua link error:', gl.getProgramInfoLog(program));
      return undefined;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const U = (n) => gl.getUniformLocation(program, n);
    const uR = U('R'), uT = U('T'), uZ = U('Z'), uEL = U('EL'), uHP = U('HP'), uA = U('A'), uTB = U('TB');
    const uPL = PLANET_COUNT > 0 ? U('PL') : null;
    const uPA = PLANET_COUNT > 0 ? U('PA') : null;
    const uPB = PLANET_COUNT > 0 ? U('PB') : null;
    const uHC = PLANET_COUNT > 0 ? U('HC') : null;
    const uPO = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? U('PO') : null;
    const uLC = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? U('LC') : null;
    const uLW = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? U('LW') : null;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    const colorCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const parseColor = (css) => {
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = '#000000';
      colorCtx.fillStyle = css;
      colorCtx.fillRect(0, 0, 1, 1);
      const d = colorCtx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    };

    const planets = PLANETS.map((p) => ({ ...p, angle: p.startAngleRadians == null ? Math.random() * TAU : p.startAngleRadians }));
    const n = Math.max(PLANET_COUNT, 1);
    const planetData = new Float32Array(n * 4);
    const litData = new Float32Array(n * 3);
    const shadowData = new Float32Array(n * 3);
    const orbitData = new Float32Array(n * 2);

    let W = 1, H = 1, pr = 1, fx = 0.5, fy = 0.5, holeX = 0, holeY = 0, shadowPx = 1, zoom = 1;
    let lineRgba = [1, 1, 1, 0.1];
    let planetColors = [];

    const readTheme = () => {
      const css = getComputedStyle(canvas);
      const read = (name, fb) => css.getPropertyValue(name).trim() || fb;
      lineRgba = parseColor(read('--blackhole-orbit-line-color', ORBIT_LINE_COLOR));
      planetColors = PLANETS.map((p, i) => ({
        lit: parseColor(read(`--blackhole-planet-${i + 1}-lit-color`, p.litColor)).slice(0, 3),
        shadow: parseColor(read(`--blackhole-planet-${i + 1}-shadow-color`, p.shadowColor)).slice(0, 3),
      }));
    };

    const place = () => {
      const { positionX: px, positionY: py } = propsRef.current;
      const tx = typeof px === 'function'
        ? px(W)
        : px ?? (window.innerWidth <= NARROW_VIEWPORT_MAX_WIDTH_PX
          ? BLACK_HOLE_POSITION_X_FRACTION_NARROW
          : BLACK_HOLE_POSITION_X_FRACTION);
      fx = Math.max(0.1, Math.min(0.995, tx));
      fy = py ?? (W < NARROW_CANVAS_MAX_WIDTH_PX
        ? BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION_NARROW
        : BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION);
      holeX = W * fx;
      holeY = H * (1 - fy);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      pr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      const w = Math.max(1, Math.round(W * pr));
      const h = Math.max(1, Math.round(H * pr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      gl.viewport(0, 0, w, h);
      place();
      shadowPx = BLACK_HOLE_RADIUS * Math.min(W * BLACK_HOLE_SIZE_BASIS_WIDTH_FRACTION, H);
      zoom = shadowPx / (W * SSR);
      readTheme();
    };
    resize();

    const onBoxResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - W) < 0.5 && Math.abs(rect.height - H) < 0.5) return;
      if (pr !== 1 && Math.abs(rect.width - canvas.width) < 0.5 && Math.abs(rect.height - canvas.height) < 0.5) return;
      resize();
    };
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onBoxResize);
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', resize);

    const updatePlanets = (dt) => {
      if (PLANET_COUNT === 0) return;
      const dir = PLANET_ORBIT_CLOCKWISE ? 1 : -1;
      const items = planets.map((planet, i) => {
        const flat = planet.flatteningRatio == null ? ORBIT_FLATTENING_RATIO : planet.flatteningRatio;
        const half = planet.orbitWidthFraction * PLANET_ORBIT_MAX_WIDTH_FRACTION * W;
        const speed = (PLANET_ORBIT_SPEED * planet.speedMultiplier) / Math.pow(planet.orbitWidthFraction / PLANET_ORBIT_SPEED_REFERENCE_FRACTION, 1.5);
        planet.angle += dir * speed * dt;
        const s = Math.sin(planet.angle);
        return { i, planet, colors: planetColors[i], flat, half, x: holeX + Math.cos(planet.angle) * half, y: holeY + s * half * flat, near: s };
      });
      items.slice().sort((a, b) => a.near - b.near).forEach((it, k) => {
        const radius = Math.max(1, it.planet.radiusInShadowRadii * shadowPx * (1 + NEAR_SIDE_SIZE_BOOST * it.near));
        planetData[k * 4] = it.x * pr;
        planetData[k * 4 + 1] = (H - it.y) * pr;
        planetData[k * 4 + 2] = radius * pr;
        planetData[k * 4 + 3] = 0;
        litData.set(it.colors.lit, k * 3);
        shadowData.set(it.colors.shadow, k * 3);
      });
      items.forEach((it) => {
        orbitData[it.i * 2] = Math.max(1, it.half * pr);
        orbitData[it.i * 2 + 1] = Math.max(1, it.half * it.flat * pr);
      });
    };

    let raf = 0, visible = true, elapsed = 0, last = 0;
    const frame = (ts) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = ts;
      const delta = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      if (!visible) return;
      const step = delta * (reduceMotion ? 0.1 : 1);
      elapsed += step;
      place();
      updatePlanets(step);
      const p = propsRef.current;
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, elapsed);
      gl.uniform1f(uZ, zoom);
      gl.uniform1f(uEL, p.tilt);
      gl.uniform2f(uHP, fx, fy);
      gl.uniform1f(uA, (p.rotation * Math.PI) / 180);
      gl.uniform1f(uTB, p.transparentBackground ? 1 : 0);
      if (PLANET_COUNT > 0) {
        gl.uniform4fv(uPL, planetData);
        gl.uniform3fv(uPA, litData);
        gl.uniform3fv(uPB, shadowData);
        gl.uniform2f(uHC, holeX * pr, (H - holeY) * pr);
        if (ORBIT_LINE_VISIBLE) {
          gl.uniform2fv(uPO, orbitData);
          gl.uniform4f(uLC, lineRgba[0], lineRgba[1], lineRgba[2], lineRgba[3]);
          gl.uniform1f(uLW, ORBIT_LINE_WIDTH_PX * pr);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    raf = requestAnimationFrame(frame);

    let io = null;
    try {
      io = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; });
      io.observe(canvas);
    } catch (err) { visible = true; }

    return () => {
      cancelAnimationFrame(raf);
      if (io) io.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    };
  }, []);

  return <canvas id={id} className={className} style={style} ref={canvasRef} aria-hidden="true" />;
}
