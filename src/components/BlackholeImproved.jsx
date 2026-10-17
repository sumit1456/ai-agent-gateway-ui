import React, { useEffect, useRef } from 'react';

/* ============================================================================
   CONTROL PANEL — change values here, everything below reads from them.

   QUICK FIND (search for these words):
     BLACK HOLE RADIUS / SIZE (one knob) ... BLACK_HOLE_RADIUS  <- scales rings, halo and planet size together (same rule as hr = Math.min(W*0.8,H)*0.02)
     distortion halo (swirling space) ...... DISTORTION_*, STAR_SMEAR_*, STAR_BLUR_*, HAZE_*, RIM_GLOW_*
     black hole position ................... BLACK_HOLE_POSITION_*
     ring rotation speed ................... RING_ROTATION_SPEED, RING_ROTATION_DIRECTION,
                                             UPPER_RING_ROTATION_SPEED_MULTIPLIER,
                                             LOWER_RING_ROTATION_SPEED_MULTIPLIER
     upper ring thickness .................. UPPER_RING_THINNING
     lower ring thickness .................. LOWER_RING_THINNING
     ring brightness / ring clumps ......... DISK_BRIGHTNESS, RING_CLUMP_*
     planet size / orbit size / speed ...... PLANETS, PLANET_ORBIT_SPEED
     canvas size ........................... plain CSS on the <canvas> (className or #bh). The black hole scales to whatever size you give it

   Units: shader "world" units use the black hole radius (event horizon) = 1,
   so RING_INNER_RADIUS = 2.6 means "2.6 black hole radii from the centre".

   CSS: the component is ONE <canvas id="bh" className={className}>, exactly like the canvas version.
   Size it with your own CSS (width / height / position ...), e.g.  #bh { width: 100%; height: 320px; }
   Colours can be overridden in CSS too (set on the canvas or any parent):
     --blackhole-orbit-line-color       e.g. rgba(255,255,255,.12)
     --blackhole-planet-1-lit-color     (also -2-, -3-, ...)
     --blackhole-planet-1-shadow-color
   ========================================================================== */

// ---- Render quality ------------------------------------------------------------
// Set to 'high', 'medium', 'low', or 'auto'. Auto uses device hints at startup.
const RENDER_MODE = 'low';
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
const ACTIVE_RENDER_QUALITY = RENDER_QUALITY[getRenderMode()];
const MAX_PIXEL_RATIO = ACTIVE_RENDER_QUALITY.pixelRatio; // lower values shade fewer pixels

// ---- Black hole size & position -----------------------------------------------
const BLACK_HOLE_RADIUS = 0.3;              // ★ BLACK HOLE RADIUS / SIZE: this x min(0.8 x canvas width, canvas height).
//   Same rule as the canvas version (hr = Math.min(W * 0.8, H) * 0.02): 0.02 here = the same radius as 0.02 there.
//   Rings, distortion halo and planet size scale with it. To make everything smaller you can also just shrink the canvas in CSS.
const BLACK_HOLE_SIZE_BASIS_WIDTH_FRACTION = 0.8; // the 0.8 in the rule above
const BLACK_HOLE_SHADOW_RADIUS = 4.06;         // calibration (measured): apparent shadow radius in world units. Leave as is.
const BLACK_HOLE_POSITION_X_FRACTION = 0.5;    // black hole position: 0 = left edge, 1 = right edge
const BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION = 0.63; // black hole position: 0 = bottom, 1 = top (0.63 = 37% down from the top, like the canvas version)
const BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION_NARROW = 0.7; // same, used when the canvas is narrower than the width below (30% down)
const NARROW_CANVAS_MAX_WIDTH_PX = 700;        // canvas narrower than this counts as "narrow" (phones)

// ---- Camera -----------------------------------------------------------------
const CAMERA_TILT_RADIANS = 0.1;               // 0 = edge-on, 1.57 = looking straight down (low = NASA-style flat view)
const CAMERA_DISTANCE = 30;                    // distance from the black hole (changing it does not change the on-screen black hole size; that is BLACK_HOLE_RADIUS)

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
const RING_CLUMP_COUNT = 60;                   // whole number: how many bright/dark clumps travel around the ring. Higher = finer, makes rotation easier to see
//   (the lower ring is stretched by lensing, so low values look "stuck")
const RING_CLUMP_BASE_BRIGHTNESS = 0.35;       // brightness between clumps (0 = clumps fully dark between)
const RING_CLUMP_CONTRAST = 1.2;               // how strongly clumps stand out (0 = smooth ring, nothing visibly rotates)

// ---- Ring brightness & quality ---------------------------------------------------
const DISK_BRIGHTNESS = 1.7;                   // overall ring glow
const DISK_EXPOSURE = 1.5;                     // higher = hotter / more washed out
const RAY_MARCH_STEPS = ACTIVE_RENDER_QUALITY.rayMarchSteps; // keep >= 140 to preserve the lensing silhouette

// ring colour ramp, cool -> white-hot  [r, g, b] 0..1
const DISK_COLOR_COOL = [0.45, 0.05, 0.0];
const DISK_COLOR_WARM = [1.0, 0.42, 0.04];
const DISK_COLOR_GOLD = [1.0, 0.82, 0.45];
const DISK_COLOR_WHITE_HOT = [1.0, 0.97, 0.9];

// ---- Stars & space ----------------------------------------------------------
// ---- Distortion halo (transparent swirling space around the black hole) --------
const DISTORTION_EFFECT_ENABLED = false;        // true / false: turn the whole distortion effect on or off (off = plain static stars, no swirl, no haze, no glow)
const DISTORTION_OPACITY = 0.35;               // 0..1: how visible the distortion is. Lower = more transparent (0.35 = subtle, 1 = full strength)
const DISTORTION_HALO_RADIUS = 8.0;            // how far the swirl reaches, in black hole radii (must be > 0)
const DISTORTION_ROTATION_SPEED = 0.35;        // DISTORTION ROTATION SPEED at the black hole edge, rad/s (0 = frozen). Farther out is slower
const DISTORTION_CLOCKWISE = true;
const DISTORTION_FALLOFF_POWER = 1.5;          // higher = swirl fades faster with distance (1.5 = Kepler-like)
const STAR_SMEAR_ANGLE = 0.6;                  // star trail length: radians of rotation smeared at the black hole edge (0 = round dots)
const STAR_SMEAR_SAMPLES = 10;                 // trail smoothness (whole number >= 2; higher = smoother but slower)
const STAR_TRAIL_BRIGHTNESS = 1.4;             // keeps long star trails visible
const STAR_BLUR_NEAR_BLACK_HOLE = 0.9;         // 0 = sharp stars everywhere, 1 = stars turn soft/blurry near the black hole
const HAZE_STRENGTH = 0.34;                    // transparent swirling haze opacity (0 = off)
const HAZE_COLOR = [0.45, 0.55, 0.9];
const HAZE_PATCH_COUNT = 9;                    // whole number: patches around the ring (fewer = bigger clouds)
const HAZE_RADIAL_FREQUENCY = 1.1;             // higher = thinner concentric bands
const HAZE_CYCLE_SECONDS = 10;                 // how often the haze pattern refreshes (keeps it from winding up)
const RIM_GLOW_STRENGTH = 0.55;                // thin bright glow hugging the black hole edge (0 = off)
const RIM_GLOW_WIDTH = 0.12;                   // in black hole radii
const RIM_GLOW_COLOR = [1.0, 0.8, 0.55];

// ---- Stars & space ----------------------------------------------------------
const STAR_DENSITY = 0;                     // share of sky cells holding a star (higher = more stars)
const STAR_GRID = 110;                         // star cells per radian (lower = bigger stars)
const STAR_BRIGHTNESS = 0.9;
const STAR_COLOR = [0.8, 0.85, 1.0];
const SPACE_TINT_COLOR = [0.016, 0.016, 0.036];

// ---- Planets & planet orbit rotation (drawn inside the same canvas) -----------
const PLANETS_ENABLED = false;
const PLANET_ORBIT_SPEED = 0.25;               // PLANET ORBIT ROTATION SPEED, global (rad/s for an orbit at PLANET_ORBIT_SPEED_REFERENCE_FRACTION; inner orbits are faster)
const PLANET_ORBIT_SPEED_REFERENCE_FRACTION = 0.86; // the orbitWidthFraction that moves at exactly PLANET_ORBIT_SPEED
const PLANET_ORBIT_MAX_WIDTH_FRACTION = 0.48;  // an orbit with orbitWidthFraction 1 reaches this share of the canvas width on each side of the black hole
const PLANET_ORBIT_CLOCKWISE = true;
const ORBIT_FLATTENING_RATIO = 0.18;           // 1 = circle, small = flat like the ring (kept rounder than the tilt so orbits stay readable)
const NEAR_SIDE_SIZE_BOOST = 0.35;             // planets grow by this much on the viewer-facing side
const PLANET_LIGHT_SHIFT = 0.4;                // 0..1, highlight shift toward the black hole

const ORBIT_LINE_VISIBLE = false;              // true = draw a faint line along each planet's orbit
const ORBIT_LINE_WIDTH_PX = 1;
const ORBIT_LINE_COLOR = 'rgba(255,255,255,0.10)';

const PLANETS = [
  // orbitWidthFraction : orbit half-width as a share of the canvas half-width (like the canvas version). 1 = near the edge. Scales with the canvas
  // radiusInShadowRadii: PLANET SIZE as a share of the black hole radius (scales with BLACK_HOLE_RADIUS)
  // speedMultiplier    : per-planet orbit rotation speed on top of PLANET_ORBIT_SPEED
  // startAngleRadians  : null = random
  // flatteningRatio    : null = use ORBIT_FLATTENING_RATIO
  { name: 'ember', orbitWidthFraction: 0.74, radiusInShadowRadii: 0.02, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#e0b27a', shadowColor: '#5a3a22' },
  { name: 'ocean', orbitWidthFraction: 0.86, radiusInShadowRadii: 0.03, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#9cc4ee', shadowColor: '#1c3a66' },
  { name: 'rust', orbitWidthFraction: 0.97, radiusInShadowRadii: 0.023, speedMultiplier: 1, startAngleRadians: null, flatteningRatio: null, litColor: '#d98a70', shadowColor: '#4a2219' },
];

/* ========================================================================== */

const TAU = Math.PI * 2;
const glslFloat = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const glslVec3 = (c) => `vec3(${c.map(glslFloat).join(',')})`;

// ---- DERIVED (don't edit): everything below follows from BLACK_HOLE_RADIUS ----
const SHADOW_SCREEN_RADIUS = BLACK_HOLE_SHADOW_RADIUS / Math.sqrt(CAMERA_DISTANCE * CAMERA_DISTANCE - BLACK_HOLE_SHADOW_RADIUS * BLACK_HOLE_SHADOW_RADIUS);
const PLANET_COUNT = PLANETS_ENABLED ? PLANETS.length : 0;

// planets are drawn by the shader itself (so the component can be a single <canvas>)
const PLANET_UNIFORMS_GLSL = PLANET_COUNT > 0
  ? `uniform vec4 PL[${PLANET_COUNT}];   // planet x, y (device px, y up), radius px
uniform vec3 PA[${PLANET_COUNT}];   // lit colour
uniform vec3 PB[${PLANET_COUNT}];   // shadow colour
uniform vec2 HC;                    // black hole centre, device px
${ORBIT_LINE_VISIBLE ? `uniform vec2 PO[${PLANET_COUNT}];   // orbit ellipse half-axes, device px
uniform vec4 LC;                    // orbit line colour (rgb) + opacity
uniform float LW;                   // orbit line width, device px` : ''}`
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
   vec2 hl=PL[i].xy+toHole/max(length(toHole),1.)*rad*${glslFloat(PLANET_LIGHT_SHIFT)};
   float t=clamp(length(fc-hl)/rad,0.,1.);
   outc=mix(outc,mix(PA[i],PB[i],t),a);
  }
 }
`
  : '';

const ESCAPED_RAY_GLSL = DISTORTION_EFFECT_ENABLED
  ? `
 if(esc){
  vec3 dir=normalize(vel);
  float rho=length(uv)*${glslFloat(1 / SHADOW_SCREEN_RADIUS)};
  float r1=max(rho,1.);
  float halo=${glslFloat(Math.max(DISTORTION_HALO_RADIUS, 0.01))};
  float env=1.-smoothstep(halo*.4,halo,rho);
  float fall=pow(1./r1,${glslFloat(DISTORTION_FALLOFF_POWER)});
  float omega=${glslFloat(DISTORTION_ROTATION_SPEED)}*fall*env;
  float smear=${glslFloat(STAR_SMEAR_ANGLE)}*fall*env;
  float soft=${glslFloat(STAR_BLUR_NEAR_BLACK_HOLE)}*env/r1;
  float dirn=${DISTORTION_CLOCKWISE ? '1.' : '-1.'};
  float acc=0.;
  for(int k=0;k<${Math.max(2, Math.round(STAR_SMEAR_SAMPLES))};k++){
   float f=float(k)/${glslFloat(Math.max(2, Math.round(STAR_SMEAR_SAMPLES)) - 1)}-.5;
   float beta=-dirn*(T*omega+f*smear);
   acc+=starAt(rotAxis(dir,fw,beta),soft);
  }
  acc=acc/${glslFloat(Math.max(2, Math.round(STAR_SMEAR_SAMPLES)))}*(1.+${glslFloat(STAR_TRAIL_BRIGHTNESS)}*smear*8.);
  acc=mix(starAt(dir,0.),acc,${glslFloat(DISTORTION_OPACITY)}); // blend plain stars with the swirling ones
  vec3 add=acc*${glslVec3(STAR_COLOR)}*${glslFloat(STAR_BRIGHTNESS)};
  float th=atan(uv.y,uv.x);
  float hz=0.;
  for(int ph=0;ph<2;ph++){
   float phi=fract(T/${glslFloat(HAZE_CYCLE_SECONDS)}+float(ph)*.5);
   float w=1.-abs(2.*phi-1.);
   float a=th+dirn*omega*${glslFloat(HAZE_CYCLE_SECONDS)}*phi;
   float u=(a/TAU+.5)*${glslFloat(Math.round(HAZE_PATCH_COUNT))};
   hz+=w*(.6*vnp(vec2(u,rho*${glslFloat(HAZE_RADIAL_FREQUENCY)}),${glslFloat(Math.round(HAZE_PATCH_COUNT))})+.4*vnp(vec2(u*2.,rho*${glslFloat(HAZE_RADIAL_FREQUENCY * 2.3)}+7.),${glslFloat(2 * Math.round(HAZE_PATCH_COUNT))}));
  }
  float henv=smoothstep(1.,1.3,rho)*(1.-smoothstep(halo*.3,halo,rho))/pow(r1,.6);
  add+=${glslVec3(HAZE_COLOR)}*${glslFloat(HAZE_STRENGTH * DISTORTION_OPACITY)}*smoothstep(.25,.95,hz)*henv;
  add+=${glslVec3(RIM_GLOW_COLOR)}*${glslFloat(RIM_GLOW_STRENGTH * DISTORTION_OPACITY)}*exp(-max(rho-1.,0.)/${glslFloat(RIM_GLOW_WIDTH)})*step(1.,rho);
  col+=tr*add;
 }
`
  : `
 if(esc){
  col+=tr*${glslVec3(STAR_COLOR)}*${glslFloat(STAR_BRIGHTNESS)}*starAt(normalize(vel),0.);
 }
`;

const VERTEX_SHADER = `
  attribute vec2 a;
  void main() { gl_Position = vec4(a, 0., 1.); }
`;

const FRAGMENT_SHADER = `
precision highp float;
uniform vec2 R;
uniform float T;
uniform float Z;
uniform vec2 HP;
${PLANET_UNIFORMS_GLSL}
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
vec3 rotAxis(vec3 v,vec3 k,float b){float c=cos(b),s=sin(b);return v*c+cross(k,v)*s+k*dot(k,v)*(1.-c);}
float starAt(vec3 d,float soft){
 vec3 q=d*${glslFloat(STAR_GRID)};vec3 id=floor(q);
 float s=h21(id.xy+id.z*7.3);
 if(s<1.-${glslFloat(STAR_DENSITY)})return 0.;
 float b=clamp((s-(1.-${glslFloat(STAR_DENSITY)}))/${glslFloat(STAR_DENSITY)},0.,1.);
 vec3 j=(vec3(h21(id.yz),h21(id.zx),h21(id.xy))-.5)*.2;
 float dist=length(q-(id+.5+j));
 float rad=.28+.14*clamp(soft,0.,1.);
 return (1.-smoothstep(0.,rad,dist))*(.4+.6*b)/(1.+1.5*soft);
}
vec3 ramp(float k){
 vec3 c=mix(${glslVec3(DISK_COLOR_COOL)},${glslVec3(DISK_COLOR_WARM)},smoothstep(0.,.5,k));
 c=mix(c,${glslVec3(DISK_COLOR_GOLD)},smoothstep(.45,.85,k));
 return mix(c,${glslVec3(DISK_COLOR_WHITE_HOT)},smoothstep(.85,1.,k));}
void main(){
 vec2 uv=(gl_FragCoord.xy-R*HP)/(R.x*Z);
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
 ${ESCAPED_RAY_GLSL}
 col=1.-exp(-col*${glslFloat(DISK_EXPOSURE)});
 vec3 outc=col+${glslVec3(SPACE_TINT_COLOR)}*tr;
${PLANET_GLSL}
 gl_FragColor=vec4(outc,1.);
}
`;

// One <canvas id="bh" className={className}> — same shape as the canvas version, so any CSS you wrote
// for that one (#bh, .your-class, width / height / position) works here unchanged.
export default function BlackholeImproved({ className = '', id = 'bh', style } = {}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let gl = null;
    try {
      gl = canvas.getContext('webgl');
    } catch (err) {
      gl = null;
    }
    if (!gl) {
      console.error('BlackholeImproved: WebGL not supported');
      return undefined;
    }

    // ---- compile shaders ---------------------------------------------------
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('BlackholeImproved shader error:', gl.getShaderInfoLog(shader));
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
      console.error('BlackholeImproved link error:', gl.getProgramInfoLog(program));
      return undefined;
    }
    gl.useProgram(program);

    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uResolution = gl.getUniformLocation(program, 'R');
    const uTime = gl.getUniformLocation(program, 'T');
    const uZoom = gl.getUniformLocation(program, 'Z');
    const uHolePosition = gl.getUniformLocation(program, 'HP');
    const uPlanets = PLANET_COUNT > 0 ? gl.getUniformLocation(program, 'PL') : null;
    const uLitColors = PLANET_COUNT > 0 ? gl.getUniformLocation(program, 'PA') : null;
    const uShadowColors = PLANET_COUNT > 0 ? gl.getUniformLocation(program, 'PB') : null;
    const uHoleCentre = PLANET_COUNT > 0 ? gl.getUniformLocation(program, 'HC') : null;
    const uOrbits = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? gl.getUniformLocation(program, 'PO') : null;
    const uLineColor = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? gl.getUniformLocation(program, 'LC') : null;
    const uLineWidth = PLANET_COUNT > 0 && ORBIT_LINE_VISIBLE ? gl.getUniformLocation(program, 'LW') : null;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

    // any css colour -> [r, g, b, a] in 0..1
    const colorContext = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const parseColor = (css) => {
      colorContext.clearRect(0, 0, 1, 1);
      colorContext.fillStyle = '#000000';
      colorContext.fillStyle = css;
      colorContext.fillRect(0, 0, 1, 1);
      const d = colorContext.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    };

    // ---- planets state -----------------------------------------------------
    const planets = PLANETS.map((planet) => ({
      ...planet,
      angle: planet.startAngleRadians == null ? Math.random() * TAU : planet.startAngleRadians,
    }));
    const planetData = new Float32Array(Math.max(PLANET_COUNT, 1) * 4);
    const litData = new Float32Array(Math.max(PLANET_COUNT, 1) * 3);
    const shadowData = new Float32Array(Math.max(PLANET_COUNT, 1) * 3);
    const orbitData = new Float32Array(Math.max(PLANET_COUNT, 1) * 2);

    let canvasWidth = 1;
    let canvasHeight = 1;
    let pixelRatio = 1;
    let holeFractionX = BLACK_HOLE_POSITION_X_FRACTION;
    let holeFractionY = BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION;
    let holeX = 0;
    let holeY = 0;
    let shadowRadiusPx = 1; // black hole radius in css px
    let zoomValue = 1;
    let orbitLineRgba = [1, 1, 1, 0.1];
    let planetColors = [];

    // read CSS custom properties (fall back to the constants at the top)
    const readCssTheme = () => {
      const css = getComputedStyle(canvas);
      const read = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
      orbitLineRgba = parseColor(read('--blackhole-orbit-line-color', ORBIT_LINE_COLOR));
      planetColors = PLANETS.map((planet, i) => ({
        lit: parseColor(read(`--blackhole-planet-${i + 1}-lit-color`, planet.litColor)).slice(0, 3),
        shadow: parseColor(read(`--blackhole-planet-${i + 1}-shadow-color`, planet.shadowColor)).slice(0, 3),
      }));
    };

    // size everything from the canvas' own CSS size (like the canvas version's init())
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      canvasWidth = Math.max(1, rect.width);
      canvasHeight = Math.max(1, rect.height);
      const w = Math.max(1, Math.round(canvasWidth * pixelRatio));
      const h = Math.max(1, Math.round(canvasHeight * pixelRatio));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      gl.viewport(0, 0, w, h);
      holeFractionX = BLACK_HOLE_POSITION_X_FRACTION;
      holeFractionY =
        canvasWidth < NARROW_CANVAS_MAX_WIDTH_PX
          ? BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION_NARROW
          : BLACK_HOLE_POSITION_Y_FROM_BOTTOM_FRACTION;
      holeX = canvasWidth * holeFractionX;
      holeY = canvasHeight * (1 - holeFractionY);
      // one rule for everything: black hole radius in css px = BLACK_HOLE_RADIUS x min(width x 0.8, height)
      const sizeBasis = Math.min(canvasWidth * BLACK_HOLE_SIZE_BASIS_WIDTH_FRACTION, canvasHeight);
      shadowRadiusPx = BLACK_HOLE_RADIUS * sizeBasis;
      zoomValue = shadowRadiusPx / (canvasWidth * SHADOW_SCREEN_RADIUS);
      readCssTheme();
    };
    resize();

    // react to CSS size changes too, but ignore the resize our own width/height attributes cause
    const onBoxResize = () => {
      const rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - canvasWidth) < 0.5 && Math.abs(rect.height - canvasHeight) < 0.5) return;
      if (pixelRatio !== 1 && Math.abs(rect.width - canvas.width) < 0.5 && Math.abs(rect.height - canvas.height) < 0.5) return;
      resize();
    };
    let resizeObserver = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(onBoxResize);
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', resize);

    // ---- planets: update positions and fill the uniform arrays -------------------
    const updatePlanets = (deltaSeconds) => {
      if (PLANET_COUNT === 0) return;
      const direction = PLANET_ORBIT_CLOCKWISE ? 1 : -1; // screen y points down, so +angle = clockwise

      const items = planets.map((planet, i) => {
        const flattening = planet.flatteningRatio == null ? ORBIT_FLATTENING_RATIO : planet.flatteningRatio;
        const orbitHalfWidth = planet.orbitWidthFraction * PLANET_ORBIT_MAX_WIDTH_FRACTION * canvasWidth;
        // Keplerian-style: inner orbits move faster
        const angularSpeed =
          (PLANET_ORBIT_SPEED * planet.speedMultiplier) /
          Math.pow(planet.orbitWidthFraction / PLANET_ORBIT_SPEED_REFERENCE_FRACTION, 1.5);
        planet.angle += direction * angularSpeed * deltaSeconds;
        const sine = Math.sin(planet.angle);
        return {
          index: i,
          planet,
          colors: planetColors[i],
          flattening,
          orbitHalfWidth,
          x: holeX + Math.cos(planet.angle) * orbitHalfWidth,
          y: holeY + sine * orbitHalfWidth * flattening,
          nearness: sine, // -1 far side (top), +1 near side (bottom)
        };
      });

      items.slice().sort((a, b) => a.nearness - b.nearness).forEach((item, k) => { // far side first
        const radius = Math.max(1, item.planet.radiusInShadowRadii * shadowRadiusPx * (1 + NEAR_SIDE_SIZE_BOOST * item.nearness));
        planetData[k * 4] = item.x * pixelRatio;
        planetData[k * 4 + 1] = (canvasHeight - item.y) * pixelRatio;
        planetData[k * 4 + 2] = radius * pixelRatio;
        planetData[k * 4 + 3] = 0;
        litData.set(item.colors.lit, k * 3);
        shadowData.set(item.colors.shadow, k * 3);
      });
      items.forEach((item) => {
        orbitData[item.index * 2] = Math.max(1, item.orbitHalfWidth * pixelRatio);
        orbitData[item.index * 2 + 1] = Math.max(1, item.orbitHalfWidth * item.flattening * pixelRatio);
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
      updatePlanets(step);

      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform1f(uTime, elapsedSeconds);
      gl.uniform1f(uZoom, zoomValue);
      gl.uniform2f(uHolePosition, holeFractionX, holeFractionY);
      if (PLANET_COUNT > 0) {
        gl.uniform4fv(uPlanets, planetData);
        gl.uniform3fv(uLitColors, litData);
        gl.uniform3fv(uShadowColors, shadowData);
        gl.uniform2f(uHoleCentre, holeX * pixelRatio, (canvasHeight - holeY) * pixelRatio);
        if (ORBIT_LINE_VISIBLE) {
          gl.uniform2fv(uOrbits, orbitData);
          gl.uniform4f(uLineColor, orbitLineRgba[0], orbitLineRgba[1], orbitLineRgba[2], orbitLineRgba[3]);
          gl.uniform1f(uLineWidth, ORBIT_LINE_WIDTH_PX * pixelRatio);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    animationFrameId = requestAnimationFrame(frame);

    let intersectionObserver = null;
    try {
      intersectionObserver = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
      });
      intersectionObserver.observe(canvas);
    } catch (err) {
      isVisible = true;
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (intersectionObserver) intersectionObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      gl.deleteBuffer(vertexBuffer);
    };
  }, []);

  return <canvas id={id} className={className} style={style} ref={canvasRef} aria-hidden="true" />;
}
