// ASCII goldfish, ported from "poly goldfish.html".
// Same technique as kitty-ascii-sharks (MIT, Jaleel-VS): each glyph cell is tested
// against a bent spine, classified, shaded, and drawn from a density ramp.
// Blue koi defaults match ?color=blue: Poly Blue #2E5CFF, 9 fish, cell 11.
// Pointer movement scares the school. A click on open water drops food and ripples.

type RGB = [number, number, number];
type ChainPoint = [number, number];

type Fish = {
  i: number;
  z: number;
  L: number;
  dir: number;
  lane: number;
  amp: number;
  om: number;
  ph: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  swim: number;
  burst: number;
  seed: number;
  alpha: number;
  head: number;
  spd: number;
  chain: ChainPoint[];
};

type Pellet = { x: number; y: number; eaten: boolean; seekers: Fish[] | null };
type Ripple = { x: number; y: number; t0: number };

type Cell = {
  g: string;
  block: boolean;
  a: number;
  col: RGB;
  shade: number;
  eyeBlock: RGB | null;
  koi?: number;
};

const CFG = {
  NUM_FISH: 9,
  FISH_LENGTH: 0.42,
  CELL: 11,
  CELL_H: 1.2,
  FINS: 0.45,
  SPEED: 1,
  OPACITY: 0.95,
  SPINE: 16,
  SWIM_HZ: 1.6,
  CRUISE: 0.9,
  FLEE_R: 0.16,
  FLEE_SPEED: 2.6,
  TURN_RATE: 4.0,
  MAX_BEND: 0.30,
  SEP_R: 0.55,
  BURST_WIGGLE: 0.15,
  BURST_HZ: 1.0,
  FOOD_SEEKERS: 4,
  FOOD_SINK: 0.035,
  EAT_R: 0.35,
  STEER: 2.2,
  RIPPLE_SPEED: 0.22,
  RIPPLE_LIFE: 2.2,
  BUBBLES: 40,
  DARK: false,
  DT: 1 / 60,
};

const TAU = Math.PI * 2;
const SKIN_RAMP = ':;+=tx%S8#@';
const FIN_RAMP = "'.:-~;";
const TAIL_RAMP = "~-=:;'`";
const EDGE_RAMP = ".',`";
const SCALE_GLYPHS = 'o*c';

const TH = {
  pal: [
    [0.024, 0.11, 0.345],
    [0.094, 0.22, 0.784],
    [0.18, 0.361, 1.0],
    [0.525, 0.643, 1.0],
    [0.902, 0.929, 1.0],
  ] as RGB[],
  accent: [1, 1, 1] as RGB,
  accent2: [0.784, 0.839, 1.0] as RGB,
  eye: [0.0, 0.02, 0.08] as RGB,
  eyeBlock: [0.722, 0.784, 1.0] as RGB,
  ridge: 0.0,
  bg: [0.067, 0.071, 0.078] as RGB,
  steps: [
    [0.094, 0.22, 0.784],
    [0.18, 0.361, 1.0],
    [0.525, 0.643, 1.0],
    [0.722, 0.784, 1.0],
  ] as RGB[],
  spot1: [0.302, 0.482, 1.0] as RGB,
  spot2: [0.059, 0.165, 0.62] as RGB,
  bubble: 'rgba(46,92,255,.55)',
  ripple: '46,92,255',
  ripple2: '255,255,255',
  caustic: 'rgba(46,92,255,.18)',
  food: 'rgb(230,236,255)',
};

const PAL = TH.pal;
const SLIM = 1;
const BODY_END = 0.72 + 0.23 * SLIM;
const TAIL_END = 1.32;

const FLAG = { NONE: 0, BODY: 1, EDGE: 2, FIN: 3, TAIL: 4, EYE: 5, SCALE: 6, RIDGE: 7 } as const;

function pal(t: number): RGB {
  t = Math.min(0.999, Math.max(0, t)) * (PAL.length - 1);
  const i = t | 0;
  const f = t - i;
  const a = PAL[i];
  const b = PAL[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function hash12(x: number, y: number) {
  let p3x = (x * 0.1031) % 1;
  let p3y = (y * 0.1031) % 1;
  let p3z = (x * 0.1031) % 1;
  if (p3x < 0) p3x += 1;
  if (p3y < 0) p3y += 1;
  if (p3z < 0) p3z += 1;
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d;
  p3y += d;
  p3z += d;
  const r = ((p3x + p3y) * p3z) % 1;
  return r < 0 ? r + 1 : r;
}

const fr = (x: number) => x - Math.floor(x);
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const ss = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function sdTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const e0x = bx - ax, e0y = by - ay, e1x = cx - bx, e1y = cy - by, e2x = ax - cx, e2y = ay - cy;
  const v0x = px - ax, v0y = py - ay, v1x = px - bx, v1y = py - by, v2x = px - cx, v2y = py - cy;
  const k0 = clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1);
  const k1 = clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1);
  const k2 = clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1);
  const q0x = v0x - e0x * k0, q0y = v0y - e0y * k0;
  const q1x = v1x - e1x * k1, q1y = v1y - e1y * k1;
  const q2x = v2x - e2x * k2, q2y = v2y - e2y * k2;
  const s = Math.sign(e0x * e2y - e0y * e2x);
  const dx = Math.min(q0x * q0x + q0y * q0y, q1x * q1x + q1y * q1y, q2x * q2x + q2y * q2y);
  const dy = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x));
  return -Math.sqrt(dx) * Math.sign(dy);
}

function halfWidth(s: number) {
  if (s < 0 || s > BODY_END) return -1;
  const u = s / BODY_END;
  const Wm = 0.24 - 0.115 * SLIM;
  const k = u < 0.25
    ? Math.sqrt(u / 0.25) * (0.8 + 0.2 * u / 0.25)
    : 1 - 0.82 * Math.pow((u - 0.25) / 0.75, 1.5);
  return Wm * k;
}

function tailHalf(s: number, swim: number) {
  const k = (s - BODY_END) / (TAIL_END - BODY_END);
  if (k < 0 || k > 1) return -1;
  const fan = CFG.FINS * 0.05 + CFG.FINS * 0.45 * Math.pow(k, 0.8) * (1 - 0.35 * k * k);
  const ruffle = 0.03 * Math.sin(k * 18 - swim * 1.5) * k;
  return fan + ruffle;
}

function classify(s: number, y: number, margin: number, swim: number, fi: number): [number, number] {
  const ay = Math.abs(y);
  const hw = halfWidth(s);
  if (hw > 0 && ay <= hw) {
    const n = y / hw;
    if (Math.hypot(s - 0.08, ay - hw * 0.92) < Math.max(0.035, margin * 0.7)) return [FLAG.EYE, n];
    if (ay < Math.max(0.012, margin * 0.5) && s > 0.2 && s < 0.6) return [FLAG.RIDGE, n];
    if (s > 0.15 && s < 0.62 && ay < hw * 0.8 && fr(s * 22 + (fr(ay * 14) < 0.5 ? 0.5 : 0)) < 0.18) return [FLAG.SCALE, n];
    return [FLAG.BODY, n];
  }
  let d = hw > 0 ? ay - hw : 1e9;
  if (s < 0) d = Math.hypot(s, ay);
  const FS = CFG.FINS;
  const fl = FS * 0.04 * Math.sin(swim * 1.7 + fi);
  const pec = sdTri(s, ay, 0.16, halfWidth(0.16) * 0.9, 0.27, halfWidth(0.27) * 0.9, 0.27 + 0.09 * FS + fl, halfWidth(0.27) * 0.9 + (0.38 - 0.22) * FS + fl);
  const pel = sdTri(s, ay, 0.44, halfWidth(0.44) * 0.9, 0.52, halfWidth(0.52) * 0.9, 0.52 + 0.06 * FS, halfWidth(0.52) * 0.9 + (0.17 - 0.13) * FS - fl * 0.5);
  const fin = Math.min(pec, pel);
  if (fin < 0) return [FLAG.FIN, 0.5 * Math.sign(y)];
  d = Math.min(d, fin);
  const th = tailHalf(s, swim);
  if (th > 0) {
    const notch = 0.06 * CFG.FINS * ss(0.3, 1, (s - BODY_END) / (TAIL_END - BODY_END));
    if (ay <= th && ay >= notch) return [FLAG.TAIL, ((ay - notch) / Math.max(1e-3, th - notch)) * Math.sign(y)];
    d = Math.min(d, ay > th ? ay - th : notch - ay);
  } else if (s > TAIL_END) d = Math.min(d, Math.hypot(s - TAIL_END, ay));
  return [d < margin ? FLAG.EDGE : FLAG.NONE, 0];
}

const UI_SELECTOR = 'button, a, input, textarea, select, label, [data-goldfish-ui]';

export function startAsciiGoldfish(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const S: {
    t: number | null;
    fish: Fish[];
    food: Pellet[];
    ripples: Ripple[];
    ptr: [number, number] | null;
    aspect: number;
    pend: [number, number][];
  } = { t: null, fish: [], food: [], ripples: [], ptr: null, aspect: 16 / 9, pend: [] };

  let W = 1;
  let H = 1;
  let DPR = 1;
  let CW = CFG.CELL;
  let CH = CFG.CELL * CFG.CELL_H;
  let alive = true;
  let raf = 0;

  function spawnFish(i: number, aspect: number, t: number, side: number): Fish {
    const z = (i + 1) / CFG.NUM_FISH;
    const L = CFG.FISH_LENGTH * (0.6 + 0.4 * z);
    const h = [hash12(i, 1.7), hash12(i, 9.3), hash12(i, 4.1), hash12(i, 6.6)];
    const pass = Math.floor(t / 7 + h[0] * 10);
    const dir = side || (hash12(pass, i * 7 + 0.5) < 0.5 ? 1 : -1);
    const lane = 0.08 + 0.84 * hash12(pass, i * 3 + 1.5);
    const x = side ? (dir > 0 ? -1.6 * L : aspect + 1.6 * L) : h[0] * aspect;
    const vx = dir * CFG.CRUISE * L * (0.8 + 0.4 * h[2]);
    const f: Fish = {
      i, z, L, dir, lane, amp: 0.03 + 0.04 * h[1], om: 0.4 + 0.5 * h[3], ph: h[3] * TAU,
      x, y: lane, vx, vy: 0, swim: h[3] * TAU, burst: 0, seed: h[3] * 10,
      alpha: CFG.OPACITY * (0.55 + 0.45 * z), head: dir > 0 ? 0 : Math.PI, spd: Math.abs(vx), chain: [],
    };
    const seg = L * TAIL_END / CFG.SPINE;
    for (let k = 0; k <= CFG.SPINE; k++) f.chain.push([x - dir * k * seg, lane]);
    return f;
  }

  function simReset(t: number) {
    S.t = t;
    S.fish = [];
    S.food = [];
    S.ripples = [];
    S.pend = [];
    for (let i = 0; i < CFG.NUM_FISH; i++) S.fish.push(spawnFish(i, S.aspect, t, 0));
  }

  function simStep(dt: number) {
    const t = (S.t ?? 0) + dt;
    const A = S.aspect;
    for (const e of S.pend) {
      S.food.push({ x: e[0], y: e[1], eaten: false, seekers: null });
      S.ripples.push({ x: e[0], y: e[1], t0: t });
    }
    S.pend = [];
    for (const p of S.food) {
      p.y = Math.min(0.97, p.y + CFG.FOOD_SINK * dt);
      if (!p.seekers) {
        p.seekers = S.fish
          .map(f => [Math.hypot(f.x - p.x, f.y - p.y), f] as const)
          .sort((a, b) => a[0] - b[0])
          .slice(0, CFG.FOOD_SEEKERS)
          .map(a => a[1]);
      }
    }
    for (const f of S.fish) {
      let tx = f.dir * CFG.CRUISE * f.L;
      let ty = (f.lane + f.amp * Math.sin(f.om * t + f.ph) - f.y) * 1.5;
      let speedMax = CFG.CRUISE * f.L * 1.3;
      let w = CFG.STEER;
      let fleeing = false;
      let best: Pellet | null = null;
      let bd = 1e9;
      for (const p of S.food) {
        if (!p.eaten && p.seekers?.includes(f)) {
          const d = Math.hypot(p.x - f.x, p.y - f.y);
          if (d < bd) { bd = d; best = p; }
        }
      }
      if (best) {
        const k = 2.2 * f.L / Math.max(bd, 1e-4);
        tx = (best.x - f.x) * k;
        ty = (best.y - f.y) * k;
        speedMax = 2.2 * f.L;
        w = CFG.STEER * 1.6;
        if (bd < CFG.EAT_R * f.L) { best.eaten = true; f.burst = Math.max(f.burst, 0.5); }
      }
      if (S.ptr) {
        const dx = f.x - S.ptr[0];
        const dy = f.y - S.ptr[1];
        const d = Math.hypot(dx, dy);
        if (d < CFG.FLEE_R) {
          const k = Math.pow(1 - d / CFG.FLEE_R, 0.7);
          const fx = dx / Math.max(d, 1e-4) * CFG.FLEE_SPEED * f.L;
          const fy = dy / Math.max(d, 1e-4) * CFG.FLEE_SPEED * f.L;
          tx += (fx - tx) * k;
          ty += (fy - ty) * k;
          speedMax = CFG.FLEE_SPEED * f.L;
          w = CFG.STEER * 2;
          fleeing = true;
          f.burst = Math.max(f.burst, k);
          if (Math.abs(dx) > 0.01) f.dir = Math.sign(dx);
        }
      }
      for (const g of S.fish) {
        if (g === f) continue;
        const dx = f.x - g.x;
        const dy = f.y - g.y;
        const d = Math.hypot(dx, dy);
        const R = CFG.SEP_R * (f.L + g.L);
        if (d < R && d > 1e-5) {
          const k = 1 - d / R;
          tx += dx / d * k * 1.2 * f.L;
          ty += dy / d * k * 1.2 * f.L;
        }
      }
      if (f.y < 0.05) ty += (0.05 - f.y) * 20 * f.L;
      if (f.y > 0.95) ty -= (f.y - 0.95) * 20 * f.L;
      const a = 1 - Math.exp(-w * dt);
      const want = Math.atan2(ty, tx);
      let dh = want - f.head;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const maxTurn = CFG.TURN_RATE * (fleeing ? 1.5 : 1) * dt;
      f.head += clamp(dh * a * 3, -maxTurn, maxTurn);
      const smax = speedMax * (1 + 0.5 * f.burst);
      f.spd += (clamp(Math.hypot(tx, ty), 0.25 * f.L, smax) - f.spd) * a;
      f.vx = Math.cos(f.head) * f.spd;
      f.vy = Math.sin(f.head) * f.spd;
      if (Math.abs(f.vx) > 0.05 * f.L) f.dir = Math.sign(f.vx);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.burst *= Math.exp(-1.3 * dt);
      f.swim += dt * TAU * CFG.SWIM_HZ * (1 + CFG.BURST_HZ * f.burst) * (0.85 + 0.3 * hash12(f.i, 9.3));
      const ch = f.chain;
      const seg = f.L * TAIL_END / CFG.SPINE;
      ch[0][0] = f.x;
      ch[0][1] = f.y;
      for (let k = 1; k < ch.length; k++) {
        let ang = Math.atan2(ch[k][1] - ch[k - 1][1], ch[k][0] - ch[k - 1][0]);
        const ref = k === 1 ? f.head + Math.PI : Math.atan2(ch[k - 1][1] - ch[k - 2][1], ch[k - 1][0] - ch[k - 2][0]);
        const bend = Math.atan2(Math.sin(ang - ref), Math.cos(ang - ref));
        ang = ref + clamp(bend, -CFG.MAX_BEND, CFG.MAX_BEND);
        ch[k][0] = ch[k - 1][0] + Math.cos(ang) * seg;
        ch[k][1] = ch[k - 1][1] + Math.sin(ang) * seg;
      }
      if (f.x < -2 * f.L || f.x > A + 2 * f.L) {
        Object.assign(f, spawnFish(f.i, A, t, f.x < 0 ? 1 : -1));
      }
    }
    S.food = S.food.filter(p => !p.eaten);
    S.ripples = S.ripples.filter(r => t - r.t0 < CFG.RIPPLE_LIFE);
    S.t = t;
  }

  function buildFish(f: Fish) {
    const N = CFG.SPINE;
    const ch = f.chain;
    const q: ChainPoint[] = [];
    const amp = 0.07 * f.L * (1 + CFG.BURST_WIGGLE * f.burst);
    for (let n = 0; n <= N; n++) {
      const a = ch[Math.max(0, n - 1)];
      const b = ch[Math.min(N, n + 1)];
      const dl = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1e-6;
      const dx = (a[0] - b[0]) / dl;
      const dy = (a[1] - b[1]) / dl;
      const s = n / N * TAIL_END;
      const wig = amp * (0.15 + s * s) * Math.sin(f.swim - s * TAU * 0.8);
      q.push([ch[n][0] - dy * wig, ch[n][1] + dx * wig]);
    }
    return { i: f.i, L: f.L, q, swim: f.swim, seed: f.seed, alpha: f.alpha, hx: f.x, hy: f.y };
  }

  function fishCell(
    f: ReturnType<typeof buildFish>,
    cx: number,
    cy: number,
    cellKey: [number, number],
    tau: number,
    margin0: number,
  ): Cell | null {
    if (Math.hypot(cx - f.hx, cy - f.hy) > 1.5 * f.L) return null;
    const N = CFG.SPINE;
    let best = 1e9;
    let bs = 0;
    let by = 0;
    let bpx = 0;
    let bpy = 1;
    for (let k = 0; k < N; k++) {
      const a = f.q[k];
      const b = f.q[k + 1];
      const abx = b[0] - a[0];
      const aby = b[1] - a[1];
      const l2 = Math.max(abx * abx + aby * aby, 1e-10);
      const lo = k === 0 ? -0.8 : 0;
      const hi = k === N - 1 ? 1.5 : 1;
      const hh = clamp(((cx - a[0]) * abx + (cy - a[1]) * aby) / l2, lo, hi);
      const dx = cx - (a[0] + abx * hh);
      const dy = cy - (a[1] + aby * hh);
      const dd = dx * dx + dy * dy;
      if (dd < best) {
        best = dd;
        bs = (k + hh) / N * TAIL_END;
        const il = 1 / Math.sqrt(l2);
        const nx = abx * il;
        const ny = aby * il;
        by = (nx * dy - ny * dx) / f.L;
        bpx = -ny;
        bpy = nx;
      }
    }
    const margin = margin0 / f.L;
    const [flag, n] = classify(bs, by, margin, f.swim, f.seed);
    if (flag === FLAG.NONE) return null;
    const lit = (bpx * -0.45 + bpy * -0.9) * n;
    let shade = clamp(0.55 + 0.3 * lit + 0.2 * (1 - n * n), 0, 1);
    const seed = hash12(cellKey[0] + f.i * 37, cellKey[1]);
    const flick = hash12(cellKey[0] * 1.31, cellKey[1] * 1.31 + Math.floor(tau * 3 + seed * 7));
    let g = ' ';
    let block = true;
    let a = f.alpha;
    let col: RGB = pal(shade);
    let eyeBlock: RGB | null = null;
    switch (flag) {
      case FLAG.BODY:
        g = SKIN_RAMP[clamp(Math.floor((1 - shade) * SKIN_RAMP.length + (flick - 0.5) * 2.5), 0, SKIN_RAMP.length - 1)];
        col = pal(shade);
        break;
      case FLAG.SCALE:
        g = SCALE_GLYPHS[Math.floor(flick * 3) % 3];
        shade *= 0.85;
        col = pal(shade * 0.9);
        break;
      case FLAG.RIDGE:
        g = '#8@'[Math.floor(flick * 3) % 3];
        col = pal(TH.ridge);
        break;
      case FLAG.EYE:
        g = '@';
        col = TH.eye;
        eyeBlock = TH.eyeBlock;
        break;
      case FLAG.FIN:
        g = FIN_RAMP[Math.floor(flick * FIN_RAMP.length)];
        col = pal(0.3 + 0.4 * shade);
        a *= 0.8;
        break;
      case FLAG.TAIL: {
        const k = (bs - BODY_END) / (TAIL_END - BODY_END);
        const band = 0.5 + 0.5 * Math.sin(k * 20 - f.swim * 2 + Math.abs(n) * 4);
        g = TAIL_RAMP[clamp(Math.floor(band * TAIL_RAMP.length), 0, TAIL_RAMP.length - 1)];
        col = pal(0.12 + 0.45 * band + 0.25 * k);
        a *= 0.9 - 0.3 * k;
        break;
      }
      default:
        g = EDGE_RAMP[Math.floor(flick * 4) % 4];
        block = false;
        col = pal(0.4);
        a *= 0.6;
    }
    const q = Math.floor(shade * 3) / 3;
    if (flag === FLAG.BODY || flag === FLAG.SCALE || flag === FLAG.RIDGE) {
      const u = bs * 10 + f.seed * 3.1;
      const v = by * 8 + f.seed * 1.7;
      const sp = Math.sin(u) * Math.sin(v + u * 0.6) + 0.6 * Math.sin(u * 1.9 - f.seed * 5 + v * 1.3);
      const thr = 0.55 - 0.3 * hash12(f.i, 3.3);
      const st = Math.min(3, Math.round(q * 3));
      if (sp > thr) col = st >= 2 ? TH.spot2 : (sp > thr + 0.5 ? TH.spot2 : TH.spot1);
      else col = TH.steps[st];
      g = " .:'`"[Math.floor(flick * 5)];
      a = 1;
      block = true;
    } else if (flag === FLAG.FIN || flag === FLAG.TAIL) {
      const k = flag === FLAG.TAIL ? (bs - BODY_END) / (TAIL_END - BODY_END) : 0.4;
      col = [0.12 - 0.05 * k, 0.22 - 0.08 * k, 0.62 - 0.2 * k];
      a = 0.95 - 0.45 * k;
      block = k < 0.3;
      g = block ? ' .:'[Math.floor(flick * 3)] : "/\\|'"[Math.floor(flick * 4)];
    } else if (flag === FLAG.EDGE) {
      col = [0.12, 0.2, 0.5];
      a = 0.6;
    }
    return { g, block, a, col, shade, eyeBlock, koi: 1 };
  }

  const rgb = (c: RGB, m = 1) => `rgb(${(clamp(c[0] * m, 0, 1) * 255) | 0},${(clamp(c[1] * m, 0, 1) * 255) | 0},${(clamp(c[2] * m, 0, 1) * 255) | 0})`;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = window.devicePixelRatio || 1;
    const cssW = rect.width || window.innerWidth;
    const cssH = rect.height || window.innerHeight;
    W = canvas.width = Math.max(1, Math.round(cssW * DPR));
    H = canvas.height = Math.max(1, Math.round(cssH * DPR));
    CW = CFG.CELL * DPR;
    CH = CW * CFG.CELL_H;
    S.aspect = W / H;
  }

  function canvasRect() {
    return canvas.getBoundingClientRect();
  }

  function overCanvas(clientX: number, clientY: number) {
    const rect = canvasRect();
    return rect.width > 0 && rect.height > 0
      && clientX >= rect.left && clientX <= rect.right
      && clientY >= rect.top && clientY <= rect.bottom;
  }

  function toSim(clientX: number, clientY: number): [number, number] {
    const rect = canvasRect();
    return [(clientX - rect.left) * DPR / H, (clientY - rect.top) * DPR / H];
  }

  function render(t: number) {
    const tau = t * CFG.SPEED;
    if (S.t === null || tau < S.t || tau - S.t > 30) simReset(tau);
    while ((S.t ?? 0) + CFG.DT <= tau) simStep(CFG.DT);
    ctx.fillStyle = rgb(TH.bg);
    ctx.fillRect(0, 0, W, H);
    ctx.font = `bold ${Math.round(CH * 0.8)}px ui-monospace, Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fish = S.fish.slice().sort((a, b) => a.z - b.z).map(buildFish);
    const cols = Math.ceil(W / CW);
    const rows = Math.ceil(H / CH);
    const margin0 = 0.35 * Math.max(CW, CH) / H;
    const key = (x: number, y: number) => `${Math.floor(x * H / CW)},${Math.floor(y * H / CH)}`;
    const over = new Map<string, [string, string]>();
    for (let b = 0; b < CFG.BUBBLES; b++) {
      const hs = hash12(b, 5.5);
      const y = 1.1 - fr(tau * (0.05 + 0.08 * hs) + hash12(b, 8.8));
      const x = hash12(b, 2.2) * S.aspect + 0.01 * Math.sin(tau * 2 + b);
      over.set(key(x, y), [hs < 0.3 ? 'O' : hs < 0.65 ? 'o' : '°', TH.bubble]);
    }
    for (const r of S.ripples) {
      const age = tau - r.t0;
      for (let ring = 0; ring < 3; ring++) {
        const ra = age - ring * 0.28;
        if (ra < 0) continue;
        const rad = 0.01 + ra * CFG.RIPPLE_SPEED;
        const life = 1 - age / CFG.RIPPLE_LIFE;
        const g = life > 0.66 ? 'O' : life > 0.33 ? 'o' : '.';
        const nSteps = Math.max(8, Math.ceil(TAU * rad * H / CW * 1.2));
        for (let s = 0; s < nSteps; s++) {
          const ang = s / nSteps * TAU;
          over.set(
            key(r.x + Math.cos(ang) * rad, r.y + Math.sin(ang) * rad * 0.9),
            [g, `rgba(${ring % 2 ? TH.ripple2 : TH.ripple},${(0.85 * life).toFixed(2)})`],
          );
        }
      }
    }
    for (const p of S.food) over.set(key(p.x, p.y), ['@', TH.food]);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * CW / H;
        const cy = (r + 0.5) * CH / H;
        const px = c * CW;
        const py = r * CH;
        const ov = over.get(`${c},${r}`);
        let out: Cell | null = null;
        for (const f of fish) {
          const s = fishCell(f, cx, cy, [c, r], tau, margin0);
          if (s) out = s;
        }
        if (ov && ov[0] === '@') {
          ctx.fillStyle = ov[1];
          ctx.fillText('@', px + CW / 2, py + CH / 2);
          continue;
        }
        if (out) {
          ctx.globalAlpha = out.a;
          const bc = out.eyeBlock || out.col;
          if (out.block) {
            const gp = out.koi ? Math.max(1, Math.round(CW * 0.1)) : 1;
            ctx.fillStyle = rgb(bc, out.eyeBlock || out.koi ? 1 : 0.85);
            ctx.fillRect(px + gp, py + gp, CW - gp, CH - gp);
          }
          const lum = 0.2126 * out.col[0] + 0.7152 * out.col[1] + 0.0722 * out.col[2];
          ctx.fillStyle = out.eyeBlock
            ? rgb(out.col)
            : out.koi
              ? (out.block ? 'rgba(0,0,0,.45)' : rgb(out.col))
              : lum < 0.22
                ? rgb(out.col.map(v => v + (1 - v) * 0.6) as RGB)
                : rgb(out.col, 0.35);
          ctx.fillText(out.g, px + CW / 2, py + CH / 2);
          ctx.globalAlpha = 1;
          continue;
        }
        if (ov) {
          ctx.fillStyle = ov[1];
          ctx.fillText(ov[0], px + CW / 2, py + CH / 2);
          continue;
        }
        const w = Math.sin(cx * 9 + tau * 0.7) + Math.sin(cy * 11 - tau * 0.5 + Math.sin(cx * 4 + tau * 0.3)) + Math.sin((cx + cy) * 7 + tau * 0.9);
        if (w > 2.1) {
          ctx.fillStyle = TH.caustic;
          ctx.fillText(w > 2.5 ? '~' : '.', px + CW / 2, py + CH / 2);
        }
      }
    }
  }

  function onMove(e: PointerEvent) {
    S.ptr = overCanvas(e.clientX, e.clientY) ? toSim(e.clientX, e.clientY) : null;
  }
  function onLeave() {
    S.ptr = null;
  }
  function onDown(e: PointerEvent) {
    if (!overCanvas(e.clientX, e.clientY)) return;
    const target = e.target;
    if (target instanceof Element && target.closest(UI_SELECTOR)) return;
    S.pend.push(toSim(e.clientX, e.clientY));
  }
  function onUp(e: PointerEvent) {
    if (e.pointerType !== 'mouse') S.ptr = null;
  }

  resize();
  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerleave', onLeave);
  document.addEventListener('mouseleave', onLeave);
  window.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);

  const t0 = performance.now();
  const loop = () => {
    if (!alive) return;
    render((performance.now() - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('mouseleave', onLeave);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointerup', onUp);
  };
}
