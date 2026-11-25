/* sergi.js - kapi vitrini arayuzu. Sifir bagimlilik; file:// altinda calisir (veri script etiketiyle gelir). */
(function () {
  'use strict';
  var S = window.SERGI, KABUK = window.SERGI_KABUK;
  var $ = function (s, k) { return (k || document).querySelector(s); };
  var $$ = function (s, k) { return Array.prototype.slice.call((k || document).querySelectorAll(s)); };
  if (!S || !KABUK) {
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:24px;font:16px system-ui">Veri yüklenemedi (veri/sergi_veri.js, kabuk.js). Önce: python -B arac\\sergi.py derle</p>');
    return;
  }
  var T = S.katalog.teknikler, B = S.katalog.baglamlar, K = S.katalog.kisitlar, P = S.katalog.paletler, NT = T.length;
  var sayi = new Intl.NumberFormat('tr-TR');
  function pad(n, w) { return String(n).padStart(w, '0'); }
  function kid(n) { return 'T' + pad(n, 6); }
  function coz(n) { var i = n - 1, t = i % 50, q = Math.floor(i / 50), c = q % 10, k = Math.floor(q / 10) % 10, p0 = Math.floor(q / 100) % 10; return [t, c, k, (p0 + c + k) % 10]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  var KABUL = S.kabul.map(function (r) { return { no: r[0], sira: r[1], t: r[2], c: r[3], k: r[4], p: r[5], baslik: r[6], aciklama: r[7], yazar: r[8], bayt: r[9], sha: r[10], shard: r[11], gorsel: r[12], r: r[13] }; });
  var KIRADA = new Set(S.kirada), KABULNO = new Map(KABUL.map(function (m) { return [m.no, m]; }));

  /* ---- hareket anahtari: OS "hareketi azalt" diyorsa varsayilan kapali, kullanici gecersiz kilabilir ---- */
  var anahtar = $('#hareket'), mq = window.matchMedia('(prefers-reduced-motion: reduce)'), hareket;
  try { var kayit = localStorage.getItem('sergi_hareket'); hareket = kayit === null ? !mq.matches : kayit === '1'; } catch (e) { hareket = !mq.matches; }
  anahtar.addEventListener('change', function () { hareketKur(anahtar.checked, true); });
  var secildi = false; try { secildi = localStorage.getItem('sergi_hareket') !== null; } catch (e) {}
  var hareketNotu = $('#hareket-notu'), hareketAc = $('#hareket-ac');
  function notuGuncelle() { if (hareketNotu) hareketNotu.hidden = hareket || secildi; }
  if (hareketAc) hareketAc.addEventListener('click', function () { hareketKur(true, true); });
  function hareketKur(v, kaydet) {
    hareket = v; anahtar.checked = v; document.documentElement.classList.toggle('hareketli', v);
    if (kaydet) { secildi = true; try { localStorage.setItem('sergi_hareket', v ? '1' : '0'); } catch (e) {} }
    notuGuncelle(); heroDurum(); canliYenile(); sahneKur();
  }

  /* ---- sayaclar ---- */
  var ty = new Set(KABUL.map(function (m) { return m.t; })).size, by = new Set(KABUL.map(function (m) { return m.c; })).size;
  $('#sayaclar').innerHTML = [[S.sayac.kabul, 'sahne'], [ty, 'teknik'], [sayi.format(S.sayac.toplam), 'kapı']]
    .map(function (x) { return '<div><b>' + x[0] + '</b><span>' + x[1] + '</span></div>'; }).join('');

  /* ---- kahraman: GERCEK kumas (Verlet kisitlari + ruzgar basinci) ----
     Imlec ruzgari yonlendirir, surukleme 360 derece dondurur; ok tuslari ve bosluk da calisir. Kumas, golge ve iplikler hesaplanir; video ya da dongu animasyonu degildir.
     Cizim: WebGL2 (puruzsuz normaller, kumas dokusu, golge); yoksa 2B tuval yedegi. Fizik her iki yolda ayni. */
  var hero = { c: null, g: null, x: null, sec: null, W: 0, H: 0, dpr: 1, raf: 0, gorunur: true, kum: [], ip: null, dp: null, perm: null, qk: null, qa: null, qi: null,
    dar: false, sw: false, canli: 0, hazir: false, yaw: 0.42, pitch: 0.14, yawV: 0, surukle: false, sx: 0, sy: 0, bosta: 9, t: 0, son: 0, birik: 0, kare: 0, ms: 8, iter: 6, yavas: 0,
    rz: { x: 0.25, y: 0.1, z: 0.55 }, hd: { x: 0.25, y: 0.1, z: 0.55 }, esme: 0.4, ix: 0, iy: 0, it: 0 };
  var LW = (function () { var l = Math.sqrt(0.55 * 0.55 + 0.62 * 0.62 + 0.55 * 0.55); return [-0.55 / l, 0.62 / l, 0.55 / l]; })();
  var YER = -2.0;  /* zemin y */
  function hex3(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function kumasYap(nx, ny, s, ox, oy, oz, rot, pal, id) {
    var n = nx * ny, k = { nx: nx, ny: ny, n: n, X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), PX: new Float32Array(n), PY: new Float32Array(n), PZ: new Float32Array(n),
      FX: new Float32Array(n), FY: new Float32Array(n), FZ: new Float32Array(n), CX: new Float32Array(n), CY: new Float32Array(n), CZ: new Float32Array(n), SX: new Float32Array(n), SY: new Float32Array(n),
      HX: new Float32Array(n), HY: new Float32Array(n), NX: new Float32Array(n), NY: new Float32Array(n), NZ: new Float32Array(n), M: new Uint8Array(n), faz: id * 1.7, id: id, fg: pal[3] };
    k.ra = hex3(pal[4]); k.rb = hex3(pal[5]); k.rc = hex3(pal[6]); k.rf = hex3(pal[3]);
    var cr = Math.cos(rot), sr = Math.sin(rot), i, j, a, pin = Math.max(2, Math.round((nx - 1) / 8));
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      a = j * nx + i;
      var x = (i - (nx - 1) / 2) * s, y = -j * s, z = Math.sin(i * 1.3 / (nx / 24) + id) * 0.007 * j * (24 / nx);
      var rx = x * cr + z * sr, rz = -x * sr + z * cr;
      k.X[a] = k.PX[a] = ox + rx; k.Y[a] = k.PY[a] = oy + y; k.Z[a] = k.PZ[a] = oz + rz;
      k.M[a] = (j === 0 && (i % pin === 0 || i === nx - 1)) ? 0 : 1;
    }
    var A = [], B = [], R = [], Kt = [];
    function ek(p, q, rest, kat) { A.push(p); B.push(q); R.push(rest); Kt.push(kat); }
    for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
      a = j * nx + i;
      if (i + 1 < nx) ek(a, a + 1, s, 1);
      if (j + 1 < ny) ek(a, a + nx, s, 1);
      if (i + 1 < nx && j + 1 < ny) { ek(a, a + nx + 1, s * 1.4142, 0.75); ek(a + 1, a + nx, s * 1.4142, 0.75); }
      if (i + 2 < nx) ek(a, a + 2, s * 2, 0.28);
      if (j + 2 < ny) ek(a, a + 2 * nx, s * 2, 0.28);
    }
    k.CA = Uint16Array.from(A); k.CB = Uint16Array.from(B); k.CR = Float32Array.from(R); k.CK = Float32Array.from(Kt);
    return k;
  }
  function kumaslariYap(yuksek) {
    var P4 = P[0], P5 = P[5], P3 = P[3], ko = hero.dar ? 0.55 : 1;   /* dar ekranda kumaslar birbirine yaklasir */
    hero.kum = yuksek
      ? [kumasYap(32, 38, 0.044, -1.25 * ko, 0.14, -1.0, 0.38, P5, 1), kumasYap(36, 44, 0.0435, 0.1 * ko, 0.18, 0.15, 0, P4, 2), kumasYap(30, 34, 0.0445, 1.35 * ko, 0.1, -0.5, -0.35, P3, 3)]
      : [kumasYap(20, 24, 0.07, -1.25 * ko, 0.14, -1.0, 0.38, P5, 1), kumasYap(22, 27, 0.07, 0.1 * ko, 0.18, 0.15, 0, P4, 2), kumasYap(18, 22, 0.072, 1.35 * ko, 0.1, -0.5, -0.35, P3, 3)];
    var tp = 0, i; for (i = 0; i < hero.kum.length; i++) tp += (hero.kum[i].nx - 1) * (hero.kum[i].ny - 1);
    hero.dp = new Float32Array(tp); hero.perm = new Array(tp); hero.qk = new Uint8Array(tp); hero.qa = new Uint16Array(tp); hero.qi = new Uint8Array(tp);
    var q = 0, j, k, a; for (k = 0; k < hero.kum.length; k++) for (j = 0; j < hero.kum[k].ny - 1; j++) for (i = 0; i < hero.kum[k].nx - 1; i++) { hero.qk[q] = k; hero.qa[q] = j * hero.kum[k].nx + i; hero.qi[q] = (i + j) & 1; q++; }
    var n = 42; hero.ip = { n: n, X: new Float32Array(n), Y: new Float32Array(n), Z: new Float32Array(n), VX: new Float32Array(n), VY: new Float32Array(n), VZ: new Float32Array(n) };
    for (a = 0; a < n; a++) ipDoguver(a);
  }
  function ipDoguver(a) { var p = hero.ip; p.X[a] = (Math.random() * 2 - 1) * 3.3; p.Y[a] = Math.random() * 3.2 - 2.1; p.Z[a] = (Math.random() * 2 - 1) * 2.1; p.VX[a] = p.VY[a] = p.VZ[a] = 0; }
  function kumasAdim(k, dt, t) {
    var nx = k.nx, ny = k.ny, X = k.X, Y = k.Y, Z = k.Z, FX = k.FX, FY = k.FY, FZ = k.FZ, w = hero.rz, es = hero.esme, i, j, a, b, c, d;
    FX.fill(0); FY.fill(0); FZ.fill(0);
    for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) {
      a = j * nx + i; b = a + 1; c = a + nx; d = c + 1;
      var ux = X[d] - X[a], uy = Y[d] - Y[a], uz = Z[d] - Z[a], vx = X[c] - X[b], vy = Y[c] - Y[b], vz = Z[c] - Z[b];
      var nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx;
      var inv = 1 / Math.sqrt(nxn * nxn + nyn * nyn + nzn * nzn + 1e-9), qx = (X[a] + X[d]) * 0.5, qy = (Y[a] + Y[d]) * 0.5;
      var g = es * (0.75 + 0.5 * Math.sin(t * 2.1 + qx * 3.1 + qy * 2.3 + k.faz));
      var lx = w.x + g * Math.sin(t * 1.3 + qy * 4.1 + k.faz), ly = w.y + 0.3 * g * Math.sin(t * 0.9 + qx * 2.7), lz = w.z + g * Math.cos(t * 1.1 + qx * 3.3 + k.faz);
      var pn = (nxn * lx + nyn * ly + nzn * lz) * inv;           /* ruzgarin yuzeye dik bileseni */
      pn += (0.55 * Math.sin(qx * 8.5 - t * 2.3 + k.faz) * (0.55 + 0.45 * Math.sin(qy * 2.4 + t * 0.6)) + 0.25 * Math.sin(qy * 10 - t * 3.1 + qx * 2)) * (0.6 + es);  /* kumas dalgasi */
      var kuv = 3.8;                                              /* basinc katsayisi (parcacik basina ivme: cozunurlukten bagimsiz) */
      var fx = nxn * inv * pn * kuv * 0.25, fy = nyn * inv * pn * kuv * 0.25, fz = nzn * inv * pn * kuv * 0.25;
      var kt = 0.9 * 0.25;
      var tx = (lx - nxn * inv * pn) * kt, ty = (ly - nyn * inv * pn) * kt, tz = (lz - nzn * inv * pn) * kt;  /* yuzeye teget surtunme */
      FX[a] += fx + tx; FX[b] += fx + tx; FX[c] += fx + tx; FX[d] += fx + tx;
      FY[a] += fy + ty; FY[b] += fy + ty; FY[c] += fy + ty; FY[d] += fy + ty;
      FZ[a] += fz + tz; FZ[b] += fz + tz; FZ[c] += fz + tz; FZ[d] += fz + tz;
    }
    var dt2 = dt * dt, M = k.M, PX = k.PX, PY = k.PY, PZ = k.PZ, N = k.n, sonum = 0.991;
    for (a = 0; a < N; a++) if (M[a]) {
      var vx2 = (X[a] - PX[a]) * sonum, vy2 = (Y[a] - PY[a]) * sonum, vz2 = (Z[a] - PZ[a]) * sonum;
      PX[a] = X[a]; PY[a] = Y[a]; PZ[a] = Z[a];
      X[a] += vx2 + FX[a] * dt2; Y[a] += vy2 + (FY[a] - 5.2) * dt2; Z[a] += vz2 + FZ[a] * dt2;
      if (Y[a] < YER + 0.02) { Y[a] = YER + 0.02; }
    }
    var CA = k.CA, CB = k.CB, CR = k.CR, CK = k.CK, CN = CA.length, it, e;
    for (it = 0; it < hero.iter; it++) for (e = 0; e < CN; e++) {
      var p = CA[e], q = CB[e], dx = X[q] - X[p], dy = Y[q] - Y[p], dz = Z[q] - Z[p], dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dd < 1e-7) continue;
      var wp = M[p], wq = M[q], su = wp + wq; if (!su) continue;
      var df = (dd - CR[e]) / dd * CK[e], kp = wp / su * df, kq = wq / su * df;
      X[p] += dx * kp; Y[p] += dy * kp; Z[p] += dz * kp; X[q] -= dx * kq; Y[q] -= dy * kq; Z[q] -= dz * kq;
    }
  }
  function heroAdim(dt) {
    hero.t += dt;
    var rz = hero.rz, hd = hero.hd, ks = Math.min(1, dt * 2.6);
    if (hero.bosta > 4) { var t = hero.t; if (hareket || !hero.hazir) { hd.x = 0.25 + 0.35 * Math.sin(t * 0.31); hd.y = 0.1; hd.z = 0.55 + 0.3 * Math.sin(t * 0.23 + 1); } else { hd.x = 0; hd.y = 0.05; hd.z = 0.12; } }
    rz.x += (hd.x - rz.x) * ks; rz.y += (hd.y - rz.y) * ks; rz.z += (hd.z - rz.z) * ks;
    hero.esme += (((hero.bosta > 1.5) ? ((hareket || !hero.hazir) ? 0.4 : 0.1) : hero.esme) - hero.esme) * Math.min(1, dt * 0.9);
    for (var i = 0; i < hero.kum.length; i++) kumasAdim(hero.kum[i], dt, hero.t);
    var p = hero.ip, a, kt = Math.min(1, dt * 0.9);
    for (a = 0; a < p.n; a++) {
      p.VX[a] += (rz.x * 0.32 - p.VX[a]) * kt; p.VY[a] += (rz.y * 0.32 + 0.05 * Math.sin(hero.t + a) - p.VY[a]) * kt; p.VZ[a] += (rz.z * 0.32 - p.VZ[a]) * kt;
      p.X[a] += p.VX[a] * dt; p.Y[a] += p.VY[a] * dt; p.Z[a] += p.VZ[a] * dt;
      if (p.X[a] > 3.6 || p.X[a] < -3.6 || p.Y[a] > 1.4 || p.Y[a] < -2.2 || p.Z[a] > 2.5 || p.Z[a] < -2.5) ipDoguver(a);
    }
  }

  /* --- WebGL2 cizimi --- */
  var HVS = ['#version 300 es', 'layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec2 aUV;',
    'uniform mat3 uR; uniform vec4 uC; uniform vec3 uD; out vec3 vN; out vec3 vP; out vec2 vUV;',
    'void main(){ vec3 c = uR * (aP + vec3(0., 0.8, 0.)); float w = uD.x - c.z;',
    '  gl_Position = vec4(uC.x * c.x + uC.z * w, uC.y * c.y + uC.w * w, uD.y * w + uD.z, w); vN = uR * aN; vP = c; vUV = aUV; }'].join('\n');
  var HFS = ['#version 300 es', 'precision highp float; in vec3 vN; in vec3 vP; in vec2 vUV; out vec4 o;',
    'uniform vec3 uL; uniform float uDist; uniform float uTime; uniform float uSeed; uniform vec3 uCa; uniform vec3 uCb; uniform vec3 uCc; uniform vec3 uCf;',
    'void main(){ vec3 n = normalize(vN); vec3 V = normalize(vec3(0., 0., uDist) - vP); if (dot(n, V) < 0.) n = -n;',
    '  float ndl = dot(n, uL); float dif = ndl > 0. ? ndl : -ndl * 0.5; float nv = clamp(dot(n, V), 0., 1.); float rim = pow(1. - nv, 2.4);',
    '  float u = 0.5 + 0.5 * sin(dot(n, vec3(2.7, 1.9, 1.3)) + uTime * 0.22 + uSeed * 1.7 + vUV.y * 1.5);',
    '  vec3 col = u < 0.5 ? mix(uCc, uCb, u * 2.) : mix(uCb, uCa, u * 2. - 1.);',
    '  float weave = 1. + 0.03 * sin(vUV.x * 300.) * sin(vUV.y * 190.); float curv = length(dFdx(n)) + length(dFdy(n)); float ao = 1. - clamp(curv * 2.4, 0., 0.45);',
    '  vec3 h = normalize(uL + V); float spec = pow(max(dot(n, h), 0.), 34.) * 0.22;',
    '  vec3 c = col * weave * (0.06 + 1.0 * dif) * ao + rim * 0.38 * uCf + spec * uCf; o = vec4(c, 1.); }'].join('\n');
  var HSVS = ['#version 300 es', 'layout(location=0) in vec3 aP; uniform mat3 uR; uniform vec4 uC; uniform vec3 uD; uniform vec4 uLW;',
    'void main(){ vec3 s = aP - uLW.xyz * ((aP.y - uLW.w) / uLW.y); vec3 c = uR * (s + vec3(0., 0.8, 0.)); float w = uD.x - c.z;',
    '  gl_Position = vec4(uC.x * c.x + uC.z * w, uC.y * c.y + uC.w * w, uD.y * w + uD.z, w); }'].join('\n');
  var HSFS = ['#version 300 es', 'precision mediump float; out vec4 o; void main(){ o = vec4(0., 0., 0., 0.2); }'].join('\n');
  var HIVS = ['#version 300 es', 'layout(location=0) in vec3 aP; layout(location=1) in vec4 aK; uniform mat3 uR; uniform vec4 uC; uniform vec3 uD; out vec4 vK;',
    'void main(){ vec3 c = uR * (aP + vec3(0., 0.8, 0.)); float w = uD.x - c.z;',
    '  gl_Position = vec4(uC.x * c.x + uC.z * w, uC.y * c.y + uC.w * w, uD.y * w + uD.z, w); vK = aK; }'].join('\n');
  var HIFS = ['#version 300 es', 'precision mediump float; in vec4 vK; out vec4 o; void main(){ o = vec4(vK.rgb * vK.a, vK.a); }'].join('\n');
  /* GPU yoksa (uzak masaustu, SwiftShader) cozunurluk dusurulur: yumusak ama akici kalir */
  function yazilimMi() {
    try {
      var tc = document.createElement('canvas'), tg = tc.getContext('webgl2'); if (!tg) return false;
      var ri = tg.getExtension('WEBGL_debug_renderer_info'), rn = ri ? String(tg.getParameter(ri.UNMASKED_RENDERER_WEBGL)) : '', yz = /swiftshader|llvmpipe|software|basic render/i.test(rn);
      var ky = tg.getExtension('WEBGL_lose_context'); if (ky) ky.loseContext();
      return yz;
    } catch (e) { return false; }
  }
  function glKur(c) {
    var gl = c.getContext('webgl2', { antialias: !hero.sw, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    if (!gl) return null;
    function sh(t, s) { var o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; }
    function pr(vs, fs, adlar) {
      var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      var u = {}; adlar.forEach(function (ad) { u[ad] = gl.getUniformLocation(p, ad); }); return { p: p, u: u };
    }
    var g = { gl: gl };
    g.kumas = pr(HVS, HFS, ['uR', 'uC', 'uD', 'uL', 'uDist', 'uTime', 'uSeed', 'uCa', 'uCb', 'uCc', 'uCf']);
    g.golge = pr(HSVS, HSFS, ['uR', 'uC', 'uD', 'uLW']);
    g.iplik = pr(HIVS, HIFS, ['uR', 'uC', 'uD']);
    return g;
  }
  function glKumasHazirla() {
    var gl = hero.g.gl;
    hero.kum.forEach(function (K) {
      var n = K.n, nx = K.nx, ny = K.ny, i, j, a, idx = [];
      K.pos = new Float32Array(n * 3); K.nor = new Float32Array(n * 3);
      var uv = new Float32Array(n * 2);
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { a = j * nx + i; uv[a * 2] = i / (nx - 1); uv[a * 2 + 1] = j / (ny - 1); }
      for (j = 0; j < ny - 1; j++) for (i = 0; i < nx - 1; i++) { a = j * nx + i; idx.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx); }
      K.idxN = idx.length; K.vao = gl.createVertexArray(); gl.bindVertexArray(K.vao);
      K.bP = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, K.bP); gl.bufferData(gl.ARRAY_BUFFER, K.pos.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      K.bN = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, K.bN); gl.bufferData(gl.ARRAY_BUFFER, K.nor.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      var bU = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bU); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      var bI = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, Uint16Array.from(idx), gl.STATIC_DRAW);
      /* golge icin yalniz konum */
      K.vaoG = gl.createVertexArray(); gl.bindVertexArray(K.vaoG); gl.bindBuffer(gl.ARRAY_BUFFER, K.bP); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bI);
    });
    var ip = hero.ip; ip.pos = new Float32Array(ip.n * 6); ip.kol = new Float32Array(ip.n * 8);
    ip.vao = gl.createVertexArray(); gl.bindVertexArray(ip.vao);
    ip.bP = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ip.bP); gl.bufferData(gl.ARRAY_BUFFER, ip.pos.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    ip.bK = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ip.bK); gl.bufferData(gl.ARRAY_BUFFER, ip.kol.byteLength, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }
  function heroKamera() {
    var W = hero.W, H = hero.H, cy = Math.cos(hero.yaw), sy = Math.sin(hero.yaw), cp = Math.cos(hero.pitch), sp = Math.sin(hero.pitch), dar = hero.dar;
    var D = dar ? 4.0 : 5.5, F = Math.min(W * 1.12, H * 1.3), cx0 = W * (W < 900 ? 0.5 : 0.69), cy0 = H * (W < 900 ? 0.31 : 0.46), n = 0.5, f = 30;
    return { D: D, F: F, cx0: cx0, cy0: cy0, cy: cy, sy: sy, cp: cp, sp: sp,
      R: new Float32Array([cy, sp * sy, -cp * sy, 0, cp, sp, sy, -sp * cy, cp * cy]),
      C: new Float32Array([F / (W / 2), F / (H / 2), (cx0 - W / 2) / (W / 2), (H / 2 - cy0) / (H / 2)]),
      Dv: new Float32Array([D, (f + n) / (f - n), -2 * f * n / (f - n)]) };
  }
  function heroCizGL() {
    var g = hero.g, gl = g.gl; if (!gl || !hero.kum.length) return;
    var cam = heroKamera(), k, i, j, a;
    gl.viewport(0, 0, hero.c.width, hero.c.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    /* konum ve puruzsuz normaller (komsu farklari) */
    for (k = 0; k < hero.kum.length; k++) {
      var K = hero.kum[k], nx = K.nx, ny = K.ny, X = K.X, Y = K.Y, Z = K.Z, pos = K.pos, nor = K.nor;
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
        a = j * nx + i; pos[a * 3] = X[a]; pos[a * 3 + 1] = Y[a]; pos[a * 3 + 2] = Z[a];
        var ia = j * nx + (i + 1 < nx ? i + 1 : i), ib = j * nx + (i > 0 ? i - 1 : i), ja = (j + 1 < ny ? j + 1 : j) * nx + i, jb = (j > 0 ? j - 1 : j) * nx + i;
        var ux = X[ia] - X[ib], uy = Y[ia] - Y[ib], uz = Z[ia] - Z[ib], vx = X[ja] - X[jb], vy = Y[ja] - Y[jb], vz = Z[ja] - Z[jb];
        var nxn = uy * vz - uz * vy, nyn = uz * vx - ux * vz, nzn = ux * vy - uy * vx, l = 1 / (Math.sqrt(nxn * nxn + nyn * nyn + nzn * nzn) + 1e-9);
        nor[a * 3] = nxn * l; nor[a * 3 + 1] = nyn * l; nor[a * 3 + 2] = nzn * l;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, K.bP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos); gl.bindBuffer(gl.ARRAY_BUFFER, K.bN); gl.bufferSubData(gl.ARRAY_BUFFER, 0, nor);
    }
    /* 1) golgeler: zemine izdusum; MAX karisim: ust uste binen kareler koyulasmaz */
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendEquation(gl.MAX);
    gl.useProgram(g.golge.p); gl.uniformMatrix3fv(g.golge.u.uR, false, cam.R); gl.uniform4fv(g.golge.u.uC, cam.C); gl.uniform3fv(g.golge.u.uD, cam.Dv); gl.uniform4f(g.golge.u.uLW, LW[0], LW[1], LW[2], YER);
    for (k = 0; k < hero.kum.length; k++) { gl.bindVertexArray(hero.kum[k].vaoG); gl.drawElements(gl.TRIANGLES, hero.kum[k].idxN, gl.UNSIGNED_SHORT, 0); }
    gl.blendEquation(gl.FUNC_ADD); gl.disable(gl.BLEND);
    /* 2) kumaslar */
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true);
    var Lx = LW[0] * cam.cy + LW[2] * cam.sy, lz1 = -LW[0] * cam.sy + LW[2] * cam.cy, Ly = LW[1] * cam.cp - lz1 * cam.sp, Lz = LW[1] * cam.sp + lz1 * cam.cp;
    gl.useProgram(g.kumas.p); gl.uniformMatrix3fv(g.kumas.u.uR, false, cam.R); gl.uniform4fv(g.kumas.u.uC, cam.C); gl.uniform3fv(g.kumas.u.uD, cam.Dv);
    gl.uniform3f(g.kumas.u.uL, Lx, Ly, Lz); gl.uniform1f(g.kumas.u.uDist, cam.D); gl.uniform1f(g.kumas.u.uTime, hero.t);
    for (k = 0; k < hero.kum.length; k++) {
      var Q = hero.kum[k];
      gl.uniform1f(g.kumas.u.uSeed, Q.id); gl.uniform3f(g.kumas.u.uCa, Q.ra[0] / 255, Q.ra[1] / 255, Q.ra[2] / 255); gl.uniform3f(g.kumas.u.uCb, Q.rb[0] / 255, Q.rb[1] / 255, Q.rb[2] / 255);
      gl.uniform3f(g.kumas.u.uCc, Q.rc[0] / 255, Q.rc[1] / 255, Q.rc[2] / 255); gl.uniform3f(g.kumas.u.uCf, Q.rf[0] / 255, Q.rf[1] / 255, Q.rf[2] / 255);
      gl.bindVertexArray(Q.vao); gl.drawElements(gl.TRIANGLES, Q.idxN, gl.UNSIGNED_SHORT, 0);
    }
    /* 3) iplikler: ruzgarla suruklenen ince cizgiler (ruzgarin yonunu da gosterir) */
    var ip = hero.ip, cols = [hero.kum[1].ra, hero.kum[0].ra, hero.kum[2].ra, hero.kum[1].rf], pp = ip.pos, kk = ip.kol;
    for (a = 0; a < ip.n; a++) {
      pp[a * 6] = ip.X[a]; pp[a * 6 + 1] = ip.Y[a]; pp[a * 6 + 2] = ip.Z[a]; pp[a * 6 + 3] = ip.X[a] - ip.VX[a] * 0.2; pp[a * 6 + 4] = ip.Y[a] - ip.VY[a] * 0.2; pp[a * 6 + 5] = ip.Z[a] - ip.VZ[a] * 0.2;
      var col = cols[a & 3], al = 0.34; kk[a * 8] = kk[a * 8 + 4] = col[0] / 255; kk[a * 8 + 1] = kk[a * 8 + 5] = col[1] / 255; kk[a * 8 + 2] = kk[a * 8 + 6] = col[2] / 255; kk[a * 8 + 3] = al; kk[a * 8 + 7] = 0.02;
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.useProgram(g.iplik.p); gl.uniformMatrix3fv(g.iplik.u.uR, false, cam.R); gl.uniform4fv(g.iplik.u.uC, cam.C); gl.uniform3fv(g.iplik.u.uD, cam.Dv);
    gl.bindVertexArray(ip.vao); gl.bindBuffer(gl.ARRAY_BUFFER, ip.bP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pp); gl.bindBuffer(gl.ARRAY_BUFFER, ip.bK); gl.bufferSubData(gl.ARRAY_BUFFER, 0, kk);
    gl.drawArrays(gl.LINES, 0, ip.n * 2);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
  }

  /* --- 2B yedek cizim (WebGL2 yoksa) --- */
  function heroCiz2D() {
    var x = hero.x; if (!x || !hero.kum.length) return;
    var W = hero.W, H = hero.H, kum = hero.kum, nk = kum.length, yaw = hero.yaw, pitch = hero.pitch;
    x.setTransform(hero.dpr, 0, 0, hero.dpr, 0, 0); x.clearRect(0, 0, W, H);
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), dar = hero.dar;
    var D = dar ? 4.0 : 5.5, F = Math.min(W * 1.12, H * 1.3), cx0 = W * (W < 900 ? 0.5 : 0.69), cy0 = H * (W < 900 ? 0.31 : 0.46);
    var lx1 = LW[0] * cy + LW[2] * sy, lz1 = -LW[0] * sy + LW[2] * cy, Lx = lx1, Ly = LW[1] * cp - lz1 * sp, Lz = LW[1] * sp + lz1 * cp;
    var k, a, i, j, px, py, pz, yy, x1, z1, y2, z2, w;
    for (k = 0; k < nk; k++) {
      var K = kum[k], n = K.n;
      for (a = 0; a < n; a++) {
        px = K.X[a]; py = K.Y[a]; pz = K.Z[a]; yy = py + 0.8;
        x1 = px * cy + pz * sy; z1 = -px * sy + pz * cy; y2 = yy * cp - z1 * sp; z2 = yy * sp + z1 * cp; w = D - z2;
        K.CX[a] = x1; K.CY[a] = y2; K.CZ[a] = z2; K.SX[a] = cx0 + F * x1 / w; K.SY[a] = cy0 - F * y2 / w;
        var ts = (py - YER) / LW[1], gx = px - LW[0] * ts, gz = pz - LW[2] * ts, gy = YER + 0.8;
        x1 = gx * cy + gz * sy; z1 = -gx * sy + gz * cy; y2 = gy * cp - z1 * sp; z2 = gy * sp + z1 * cp; w = D - z2;
        K.HX[a] = cx0 + F * x1 / w; K.HY[a] = cy0 - F * y2 / w;
      }
    }
    var zf = H * 0.78, gr = x.createRadialGradient(cx0, zf, 0, cx0, zf, Math.min(W, H * 1.6) * 0.5);
    gr.addColorStop(0, 'rgba(232,194,106,0.10)'); gr.addColorStop(1, 'rgba(232,194,106,0)');
    x.save(); x.translate(0, zf); x.scale(1, 0.26); x.translate(0, -zf); x.fillStyle = gr; x.fillRect(0, 0, W, H * 3); x.restore();
    x.fillStyle = 'rgba(0,0,0,0.055)';
    for (k = 0; k < nk; k++) {
      var G = kum[k], nx2 = G.nx;
      for (j = 0; j < G.ny - 1; j++) for (i = 0; i < nx2 - 1; i++) {
        a = j * nx2 + i;
        x.beginPath(); x.moveTo(G.HX[a], G.HY[a]); x.lineTo(G.HX[a + 1], G.HY[a + 1]); x.lineTo(G.HX[a + nx2 + 1], G.HY[a + nx2 + 1]); x.lineTo(G.HX[a + nx2], G.HY[a + nx2]); x.closePath(); x.fill();
      }
    }
    for (k = 0; k < nk; k++) {
      var N0 = kum[k], nxx = N0.nx, nyy = N0.ny, NA = N0.NX, NB = N0.NY, NC = N0.NZ, ii, jj, a0, a1, a2, a3;
      NA.fill(0); NB.fill(0); NC.fill(0);
      for (jj = 0; jj < nyy - 1; jj++) for (ii = 0; ii < nxx - 1; ii++) {
        a0 = jj * nxx + ii; a1 = a0 + 1; a2 = a0 + nxx; a3 = a2 + 1;
        var ux0 = N0.CX[a3] - N0.CX[a0], uy0 = N0.CY[a3] - N0.CY[a0], uz0 = N0.CZ[a3] - N0.CZ[a0], vx0 = N0.CX[a2] - N0.CX[a1], vy0 = N0.CY[a2] - N0.CY[a1], vz0 = N0.CZ[a2] - N0.CZ[a1];
        var c1 = uy0 * vz0 - uz0 * vy0, c2 = uz0 * vx0 - ux0 * vz0, c3 = ux0 * vy0 - uy0 * vx0;
        NA[a0] += c1; NA[a1] += c1; NA[a2] += c1; NA[a3] += c1; NB[a0] += c2; NB[a1] += c2; NB[a2] += c2; NB[a3] += c2; NC[a0] += c3; NC[a1] += c3; NC[a2] += c3; NC[a3] += c3;
      }
    }
    var tot = hero.perm.length, dp = hero.dp, perm = hero.perm, q;
    for (q = 0; q < tot; q++) {
      var kk = kum[hero.qk[q]], aa = hero.qa[q]; dp[q] = kk.CZ[aa] + kk.CZ[aa + 1] + kk.CZ[aa + kk.nx] + kk.CZ[aa + kk.nx + 1]; perm[q] = q;
    }
    perm.sort(function (p1, p2) { return dp[p1] - dp[p2]; });
    var t = hero.t;
    x.lineWidth = 0.9; x.lineJoin = 'round';
    for (var m = 0; m < tot; m++) {
      q = perm[m]; var Q = kum[hero.qk[q]], b0 = hero.qa[q], nx3 = Q.nx, b1 = b0 + 1, b2 = b0 + nx3, b3 = b2 + 1;
      var nx_ = Q.NX[b0] + Q.NX[b1] + Q.NX[b2] + Q.NX[b3], ny_ = Q.NY[b0] + Q.NY[b1] + Q.NY[b2] + Q.NY[b3], nz_ = Q.NZ[b0] + Q.NZ[b1] + Q.NZ[b2] + Q.NZ[b3], nl = Math.sqrt(nx_ * nx_ + ny_ * ny_ + nz_ * nz_) || 1;
      nx_ /= nl; ny_ /= nl; nz_ /= nl; if (nz_ < 0) { nx_ = -nx_; ny_ = -ny_; nz_ = -nz_; }
      var ndl = nx_ * Lx + ny_ * Ly + nz_ * Lz, dif = ndl > 0 ? ndl : -ndl * 0.5, rim = Math.pow(1 - nz_, 2.3);
      var u = 0.5 + 0.5 * Math.sin(nx_ * 2.7 + ny_ * 1.9 + t * 0.22 + hero.qk[q] * 1.7), u2 = u * 2, ra, rb, rc, r, g, bl;
      ra = Q.ra; rb = Q.rb; rc = Q.rc;
      if (u2 < 1) { r = rc[0] + (rb[0] - rc[0]) * u2; g = rc[1] + (rb[1] - rc[1]) * u2; bl = rc[2] + (rb[2] - rc[2]) * u2; } else { var v2 = u2 - 1; r = rb[0] + (ra[0] - rb[0]) * v2; g = rb[1] + (ra[1] - rb[1]) * v2; bl = rb[2] + (ra[2] - rb[2]) * v2; }
      var val = 0.07 + 1.0 * dif, dok = hero.qi[q] ? 1.012 : 0.988;
      r = Math.min(255, (r * val * dok + rim * 0.42 * Q.rf[0]) | 0); g = Math.min(255, (g * val * dok + rim * 0.42 * Q.rf[1]) | 0); bl = Math.min(255, (bl * val * dok + rim * 0.42 * Q.rf[2]) | 0);
      var cs = 'rgb(' + r + ',' + g + ',' + bl + ')'; x.fillStyle = cs; x.strokeStyle = cs;
      x.beginPath(); x.moveTo(Q.SX[b0], Q.SY[b0]); x.lineTo(Q.SX[b1], Q.SY[b1]); x.lineTo(Q.SX[b3], Q.SY[b3]); x.lineTo(Q.SX[b2], Q.SY[b2]); x.closePath(); x.fill(); x.stroke();
    }
    var ip = hero.ip, ci = [kum[1].ra, kum[0].ra, kum[2].ra, kum[1].rf]; x.lineWidth = 1;
    for (a = 0; a < ip.n; a++) {
      var ax = ip.X[a], ay = ip.Y[a] + 0.8, az = ip.Z[a], bx = ax - ip.VX[a] * 0.2, by = ay - ip.VY[a] * 0.2, bz = az - ip.VZ[a] * 0.2;
      var p1 = ax * cy + az * sy, q1 = -ax * sy + az * cy, p2 = ay * cp - q1 * sp, q2 = ay * sp + q1 * cp, w1 = D - q2;
      var p3 = bx * cy + bz * sy, q3 = -bx * sy + bz * cy, p4 = by * cp - q3 * sp, q4 = by * sp + q3 * cp, w2 = D - q4;
      var al = Math.max(0.08, Math.min(0.4, 1.0 - w1 / 8)), col = ci[a & 3];
      x.strokeStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + al.toFixed(2) + ')';
      x.beginPath(); x.moveTo(cx0 + F * p1 / w1, cy0 - F * p2 / w1); x.lineTo(cx0 + F * p3 / w2, cy0 - F * p4 / w2); x.stroke();
    }
  }
  function heroCiz() { if (hero.g) heroCizGL(); else heroCiz2D(); }

  function heroDongu(ts) {
    if (!((hareket || hero.canli > 0) && hero.gorunur)) { hero.raf = 0; if (!hareket) heroCiz(); return; }
    var t0 = performance.now(), dt = hero.son ? Math.min((ts - hero.son) / 1000, 0.05) : 1 / 60; hero.son = ts; hero.bosta += dt; hero.birik += dt; if (!hareket) hero.canli -= dt;
    var n = 0; while (hero.birik >= 1 / 60 && n < 3) { heroAdim(1 / 60); hero.birik -= 1 / 60; n++; } if (n === 3) hero.birik = 0;
    if (!hero.surukle) { hero.yaw += hero.yawV * dt; hero.yawV *= Math.pow(0.05, dt); if (hareket && hero.bosta > 3.5) hero.yaw += 0.16 * dt; }
    heroCiz(); hero.kare++;
    var ms = performance.now() - t0; hero.ms += (ms - hero.ms) * 0.08;
    if (hero.ms > 15) { hero.yavas++; if (hero.yavas > 40) { hero.yavas = 0; if (hero.iter > 3) hero.iter--; else if (hero.dpr > 1) { hero.dpr = 1; heroBoyut(); } } } else if (hero.yavas > 0) hero.yavas--;
    hero.raf = requestAnimationFrame(heroDongu);
  }
  /* hareket azaltilmis olsa bile kullanici eylemi (imlec, surukleme, tus) kumasi gercekten oynatir: eylemden sonra 3,5 sn fizik calisir, sonra durur */
  function heroEtkin() { hero.bosta = 0; if (!hareket) { hero.canli = 3.5; if (!hero.raf && hero.gorunur) { hero.son = 0; hero.raf = requestAnimationFrame(heroDongu); } } }
  function heroDurum() { if (hero.raf) { cancelAnimationFrame(hero.raf); hero.raf = 0; } hero.son = 0; hero.canli = 0; if (hareket && hero.gorunur) hero.raf = requestAnimationFrame(heroDongu); else heroCiz(); }
  function heroBoyut() {
    var c = hero.c; if (!c) return;
    var W = Math.max(2, c.clientWidth), H = Math.max(2, c.clientHeight);
    hero.dpr = Math.min(window.devicePixelRatio || 1, W > 1000 ? 1.5 : 2) * (hero.sw ? 0.6 : 1);
    c.width = Math.round(W * hero.dpr); c.height = Math.round(H * hero.dpr); hero.W = W; hero.H = H; heroCiz();
  }
  function heroImlec(e) {
    var r = hero.sec.getBoundingClientRect(), nx = (e.clientX - r.left) / Math.max(1, r.width), ny = (e.clientY - r.top) / Math.max(1, r.height), now = performance.now();
    var dtm = Math.max(8, now - (hero.it || now)), hiz = Math.sqrt(Math.pow(e.clientX - hero.ix, 2) + Math.pow(e.clientY - hero.iy, 2)) / dtm * 1000;
    if (hero.it) hero.esme = Math.min(2.0, hero.esme + hiz / 1800);
    hero.ix = e.clientX; hero.iy = e.clientY; hero.it = now;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    hero.hd.x = (nx * 2 - 1) * 2.3; hero.hd.z = (0.5 - ny) * 2 * 1.5 + 0.4; hero.hd.y = 0.1 + (0.5 - ny) * 0.5; heroEtkin();
    if (hero.surukle) {
      hero.yaw += (e.clientX - hero.sx) * 0.009; hero.pitch = Math.max(-0.3, Math.min(0.55, hero.pitch + (e.clientY - hero.sy) * 0.004)); hero.yawV = (e.clientX - hero.sx) * 0.9;
      hero.sx = e.clientX; hero.sy = e.clientY; if (!(hareket && hero.gorunur)) heroCiz();
    }
  }
  function heroTut(e) {
    if (e.button > 0 || (e.target.closest && e.target.closest('a,button,input,select,textarea,summary'))) return;
    hero.surukle = true; hero.sx = e.clientX; hero.sy = e.clientY; heroEtkin(); hero.sec.classList.add('tutuluyor');
    try { hero.sec.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function heroBirak(e) { hero.surukle = false; hero.sec.classList.remove('tutuluyor'); try { hero.sec.releasePointerCapture(e.pointerId); } catch (x) {} }
  function heroTus(e) {
    var k = e.key, d = true;
    if (k === 'ArrowLeft') hero.yawV -= 1.3; else if (k === 'ArrowRight') hero.yawV += 1.3;
    else if (k === 'ArrowUp') hero.pitch = Math.max(-0.3, hero.pitch - 0.06); else if (k === 'ArrowDown') hero.pitch = Math.min(0.55, hero.pitch + 0.06);
    else if (k === ' ' || k === 'Enter') { hero.esme = 2.0; hero.hd.x = (Math.random() * 2 - 1) * 2.6; hero.hd.z = (Math.random() * 2 - 1) * 1.8 + 0.5; }
    else d = false;
    if (d) { e.preventDefault(); heroEtkin(); if (!(hareket && hero.gorunur)) { hero.yaw += hero.yawV * 0.05; hero.yawV = 0; heroCiz(); } }
  }
  function heroKur() {
    var c = $('#hero'), sec = $('#giris'); hero.c = c; hero.sec = sec; hero.dar = (c.clientWidth || window.innerWidth) < 700;
    hero.sw = yazilimMi();
    try { hero.g = glKur(c); } catch (e) { hero.g = null; var nc = c.cloneNode(false); c.parentNode.replaceChild(nc, c); c = nc; hero.c = nc; }  /* WebGL derlenemediyse tuvali yenile: 2B baglam alinabilsin */
    if (!hero.g) { hero.x = c.getContext('2d', { alpha: true }); if (!hero.x) { c.style.background = 'radial-gradient(circle at 70% 30%, #3a2f18, #09090d 62%)'; return; } }
    kumaslariYap(!!hero.g); if (hero.g) glKumasHazirla();
    if (!hero.g) hero.iter = 5; else if (hero.sw) hero.iter = 4;
    for (var s = 0; s < 150; s++) heroAdim(1 / 60);
    hero.hazir = true; heroBoyut();
    if ('ResizeObserver' in window) new ResizeObserver(heroBoyut).observe(sec); else window.addEventListener('resize', heroBoyut);
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { hero.gorunur = es[0].isIntersecting; heroDurum(); }).observe(sec);
    sec.addEventListener('pointermove', heroImlec, { passive: true }); sec.addEventListener('pointerdown', heroTut);
    sec.addEventListener('pointerup', heroBirak); sec.addEventListener('pointercancel', heroBirak); c.addEventListener('keydown', heroTus);
    window.__SERGI_HERO = {
      durum: function () { return { yaw: hero.yaw, pitch: hero.pitch, ruzgar: [hero.rz.x, hero.rz.y, hero.rz.z], hedef: [hero.hd.x, hero.hd.y, hero.hd.z], esme: hero.esme, kare: hero.kare, ms: hero.ms, kumas: hero.kum.length, calisiyor: !!hero.raf, canli: hero.canli, iter: hero.iter, dpr: hero.dpr, boy: [hero.W, hero.H], gl: !!hero.g, sw: hero.sw, parca: hero.perm.length }; },
      ileri: function (n) { for (var i = 0; i < n; i++) heroAdim(1 / 60); heroCiz(); }
    };
  }

  /* ---- kapi mozaigi ---- */
  function mozaik() {
    var c = $('#mozaik'), W0 = 250, H0 = 200, S4 = 4; c.width = W0 * S4; c.height = H0 * S4;
    var x = c.getContext('2d'), kc = document.createElement('canvas'); kc.width = W0; kc.height = H0;
    var kx = kc.getContext('2d'), img = kx.createImageData(W0, H0), buf = new Uint32Array(img.data.buffer);
    function u32(h) { var n = parseInt(h.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0; }
    var bos = u32('#16161f');
    for (var i = 0; i < W0 * H0; i++) buf[i] = ((i % W0) + Math.floor(i / W0)) % 2 === 0 ? bos : u32('#14141c');
    kx.putImageData(img, 0, 0);
    x.imageSmoothingEnabled = false; x.drawImage(kc, 0, 0, c.width, c.height);
    function parla(no, renk, boyut) {
      var cx = ((no - 1) % W0) * S4 + S4 / 2, cy = Math.floor((no - 1) / W0) * S4 + S4 / 2;
      x.shadowColor = renk; x.shadowBlur = 14; x.fillStyle = renk; x.fillRect(cx - boyut / 2, cy - boyut / 2, boyut, boyut); x.shadowBlur = 0;
    }
    S.kirada.forEach(function (n) { parla(n, '#ffb347', 12); });
    KABUL.forEach(function (m) { parla(m.no, P[m.p][4], 14); });
    var ip = $('#ipucu'), cer = $('.mozaik-cerceve');
    function goster(e) {
      var r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      if (px < 0 || px >= 1 || py < 0 || py >= 1) { ip.style.display = 'none'; return; }
      var no = Math.floor(py * H0) * W0 + Math.floor(px * W0) + 1, q = coz(no), m = KABULNO.get(no);
      ip.innerHTML = '<b>' + kid(no) + '</b> · ' + (m ? 'KABUL' : KIRADA.has(no) ? 'KİRADA' : 'boş') + '<br>' + esc(T[q[0]][1]) + '<br>' + esc(B[q[1]][1]) + ' · ' + esc(K[q[2]][1]) + ' · ' + esc(P[q[3]][1]) + (m ? '<br>“' + esc(m.baslik) + '” — ' + esc(m.yazar) : '');
      var cr = cer.getBoundingClientRect(); ip.style.display = 'block';
      ip.style.left = Math.min(e.clientX - cr.left + 14, cr.width - 290) + 'px'; ip.style.top = (e.clientY - cr.top + 14) + 'px';
    }
    c.addEventListener('pointermove', goster); c.addEventListener('pointerdown', goster); c.addEventListener('pointerleave', function () { ip.style.display = 'none'; });
    $('#sonraki').innerHTML = S.sonraki.map(function (n) { var q = coz(n); return '<code title="' + esc(T[q[0]][1] + ' · ' + B[q[1]][1] + ' · ' + P[q[3]][1]) + '">' + kid(n) + '</code>'; }).join('');
  }

  /* ---- modul yukleme ve sandbox ---- */
  window.__SERGI_MOD = {}; window.__SERGI_M = function (m) { window.__SERGI_MOD[m.no] = m; };
  var parcalar = {};
  function parcaYukle(n) {
    if (parcalar[n]) return parcalar[n];
    return (parcalar[n] = new Promise(function (ok, hata) {
      var s = document.createElement('script'); s.src = 'veri/m_' + pad(n, 3) + '.js'; s.onload = ok; s.onerror = function () { hata(new Error('veri/m_' + pad(n, 3) + '.js yüklenemedi')); }; document.head.appendChild(s);
    }));
  }
  function modulYukle(meta) { return parcaYukle(meta.shard).then(function () { var m = window.__SERGI_MOD[meta.no]; if (!m) throw new Error('modül bulunamadı'); return m; }); }
  function srcdoc(m, rm) {
    var p = P[m.p], ayar = { palet: { bg: p[2], fg: p[3], a: p[4], b: p[5], c: p[6] }, rm: !!rm, seed: m.no, id: kid(m.no) };
    return KABUK.replace('/*__AYAR__*/null', function () { return JSON.stringify(ayar); }).replace('/*__MODUL__*/', function () { return m.kod; });
  }
  function iframeYap(m, baslik) {
    var f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.title = baslik; f.srcdoc = srcdoc(m, !hareket); return f;
  }

  /* ---- yayin sahnesi: CSS 3B podyum (ornek, canli yayin degil) ---- */
  var sahneIf = null;
  function sahneKur() {
    var el = $('#sahne'), meta = KABUL.filter(function (m) { return T[m.t][0] === 'css-3b-donme'; })[0];
    if (sahneIf) { sahneIf.remove(); sahneIf = null; }
    if (!meta) { if (!$('.sahne-bos', el)) el.insertAdjacentHTML('beforeend', '<p class="sahne-bos" style="position:absolute;inset:0;display:grid;place-items:center;color:#a9a7b3">Sahne modülü henüz kabul edilmedi.</p>'); return; }
    modulYukle(meta).then(function (m) { sahneIf = iframeYap(m, 'Örnek sahne: ' + m.baslik); el.appendChild(sahneIf); });
  }

  /* ---- galeri ---- */
  var secilenT = -1, sayfa = 0, PER = 9, canli = [], MAXC = 6;
  function ilkBos(t) { for (var j = 0; j < 1000; j++) { var n = t + 1 + 50 * j; if (n > 50000) return 0; if (!KABULNO.has(n) && !KIRADA.has(n)) return n; } return 0; }
  function haritaKur() {
    var say = new Array(NT).fill(0); KABUL.forEach(function (m) { say[m.t]++; });
    var el = $('#harita'); el.innerHTML = '';
    T.forEach(function (t, i) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.t = i; b.className = say[i] ? 'dolu' : ''; b.setAttribute('aria-pressed', 'false');
      var sn = ilkBos(i); b.title = t[1] + ' — ' + say[i] + ' kabul' + (sn ? ' · sıradaki boş kapı ' + kid(sn) : '');
      b.innerHTML = '<b>' + say[i] + '</b>' + esc(t[1]);
      b.addEventListener('click', function () { secilenT = secilenT === i ? -1 : i; sayfa = 0; $$('#harita button').forEach(function (x) { x.setAttribute('aria-pressed', String(+x.dataset.t === secilenT)); }); kartlariKur(); });
      el.appendChild(b);
    });
  }
  var fB = $('#f-baglam'), fA = $('#f-ara');
  fB.innerHTML = '<option value="">Tüm bağlamlar</option>' + B.map(function (b, i) { return '<option value="' + i + '">' + esc(b[1]) + '</option>'; }).join('');
  fB.addEventListener('change', function () { sayfa = 0; kartlariKur(); });
  fA.addEventListener('input', function () { sayfa = 0; kartlariKur(); });
  $('#f-temizle').addEventListener('click', function () { fB.value = ''; fA.value = ''; secilenT = -1; sayfa = 0; $$('#harita button').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); }); kartlariKur(); });
  $('#onceki').addEventListener('click', function () { if (sayfa > 0) { sayfa--; kartlariKur(); } });
  $('#sonrakiS').addEventListener('click', function () { sayfa++; kartlariKur(); });
  function liste() {
    var q = fA.value.trim().toLocaleLowerCase('tr'), bg = fB.value;
    return KABUL.filter(function (m) {
      if (secilenT >= 0 && m.t !== secilenT) return false;
      if (bg !== '' && m.c !== +bg) return false;
      if (q && (m.baslik + ' ' + m.aciklama + ' ' + T[m.t][1] + ' ' + m.yazar + ' ' + kid(m.no)).toLocaleLowerCase('tr').indexOf(q) < 0) return false;
      return true;
    });
  }
  var gozlemci = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) { var k = e.target.closest('.kart'); if (e.isIntersecting) kartBaslat(k); else kartDurdur(k); });
  }, { rootMargin: '80px', threshold: 0.2 }) : null;
  function kartlariKur() {
    canli.slice().forEach(kartYokEt); canli = [];
    var L = liste(), toplamS = Math.max(1, Math.ceil(L.length / PER)); if (sayfa >= toplamS) sayfa = toplamS - 1;
    var el = $('#kartlar'); el.innerHTML = '';
    if (!L.length) el.innerHTML = '<div class="bos-sergi">Bu süzgeçte kabul edilmiş modül yok. Sıradaki boş kapı: <span class="mono">' + (secilenT >= 0 ? kid(ilkBos(secilenT) || 0) : kid(S.sonraki[0] || 0)) + '</span></div>';
    L.slice(sayfa * PER, sayfa * PER + PER).forEach(function (m) {
      var p = P[m.p], a = document.createElement('article'); a.className = 'kart'; a.dataset.no = m.no;
      a._meta = m;
      a.innerHTML = '<div class="onizleme"><button class="oynat" type="button">▶ Canlı göster</button></div>' +
        '<div class="kart-alt"><h3>' + esc(m.baslik) + '</h3><p>' + esc(m.aciklama) + '</p>' +
        '<ul class="etiketler"><li class="teknik">' + esc(T[m.t][1]) + '</li><li>' + esc(B[m.c][1]) + '</li>' +
        '<li><span class="renkler" title="' + esc(p[1]) + '"><i style="background:' + p[2] + '"></i><i style="background:' + p[4] + '"></i><i style="background:' + p[5] + '"></i><i style="background:' + p[6] + '"></i></span></li></ul>' +
        '<details class="ayrinti"><summary>Ayrıntı</summary><div class="kart-satir"><span>' + kid(m.no) + '</span><span>' + esc(m.yazar) + '</span><span>' + sayi.format(m.bayt) + ' B</span><span>' + esc(K[m.k][1]) + '</span><span>' + esc(p[1]) + '</span><span title="Gerçek tarayıcıda ekran dolu, hata yok">' + (m.gorsel ? 'tarayıcı hakemi ✓' : 'tarayıcı hakemi yok') + '</span><span title="Modülü yazmayan başka bir GPT ekran görüntüsü ve kaynakla puanladı">' + (m.r ? 'model hakemi ' + String(m.r[0]).replace('.', ',') + '/5 (' + m.r[1] + ')' + (m.r[2] ? '' : ' ⚠ dürüstlük itirazı') : 'model hakemi bekliyor') + '</span></div></details>' +
        '<div class="kart-satir"><button class="kucuk" data-islem="buyut" type="button">Büyüt</button><button class="kucuk" data-islem="kaynak" type="button">Kaynağı gör</button></div></div>';
      $('.oynat', a).addEventListener('click', function () { kartBaslat(a, true); });
      $('[data-islem=buyut]', a).addEventListener('click', function () { buyut(m); });
      $('[data-islem=kaynak]', a).addEventListener('click', function () { kaynakGoster(m); });
      el.appendChild(a); if (gozlemci) gozlemci.observe($('.onizleme', a));
    });
    $('#sayfa-bilgi').textContent = L.length ? (sayfa + 1) + ' / ' + toplamS + ' · ' + L.length + ' modül' : '0 modül';
    $('#onceki').disabled = sayfa === 0; $('#sonrakiS').disabled = sayfa >= toplamS - 1;
  }
  function kartBaslat(k, zorla) {
    if (k._if) { try { k._if.contentWindow.postMessage({ t: 'surdur' }, '*'); } catch (e) {} return; }
    if (!zorla && canli.length >= MAXC && canli.indexOf(k) < 0) { /* en eskiyi bosalt */ }
    modulYukle(k._meta).then(function (m) {
      if (k._if || !k.isConnected) return;
      var on = $('.onizleme', k), f = iframeYap(m, m.baslik); on.appendChild(f); k._if = f;
      var oy = $('.oynat', on); if (oy) oy.hidden = true;
      canli.push(k); while (canli.length > MAXC) kartYokEt(canli.shift());
    }).catch(function (e) { hataGoster(k, e.message); });
  }
  function kartDurdur(k) { if (k && k._if) { try { k._if.contentWindow.postMessage({ t: 'durdur' }, '*'); } catch (e) {} } }
  function kartYokEt(k) { if (!k || !k._if) return; k._if.remove(); k._if = null; var oy = $('.oynat', k); if (oy) oy.hidden = false; var h = $('.hata-bandi', k); if (h) h.remove(); canli = canli.filter(function (x) { return x !== k; }); }
  function canliYenile() { canli.slice().forEach(function (k) { kartYokEt(k); kartBaslat(k); }); }
  function hataGoster(k, ileti) { var on = $('.onizleme', k); if (!on) return; var h = $('.hata-bandi', on); if (!h) { h = document.createElement('div'); h.className = 'hata-bandi'; on.appendChild(h); } h.textContent = 'Modül hatası: ' + ileti; }
  window.addEventListener('message', function (e) {
    var m = e.data || {}; if (m.t !== 'hata') return;
    $$('.kart').forEach(function (k) { if (k._if && k._if.contentWindow === e.source) hataGoster(k, m.m); });
  });

  /* ---- diyaloglar ---- */
  function kapatDugmeleri(d) { $$('[data-kapat]', d).forEach(function (b) { b.addEventListener('click', function () { d.close(); }); }); }
  var dB = $('#dlg-buyuk'), dK = $('#dlg-kaynak'); kapatDugmeleri(dB); kapatDugmeleri(dK);
  dB.addEventListener('close', function () { $('#dlg-b-govde').innerHTML = ''; });
  function buyut(meta) { modulYukle(meta).then(function (m) { $('#dlg-b-baslik').textContent = m.baslik + ' · ' + kid(m.no); var g = $('#dlg-b-govde'); g.innerHTML = ''; g.appendChild(iframeYap(m, m.baslik)); dB.showModal(); }); }
  var gecerliKod = '';
  function kaynakGoster(meta) { modulYukle(meta).then(function (m) { gecerliKod = m.kod; $('#dlg-k-baslik').textContent = kid(m.no) + ' · ' + m.baslik + ' · sha ' + m.sha.slice(0, 8); $('#dlg-k-kod').textContent = m.kod; dK.showModal(); }); }
  $('#k-kopyala').addEventListener('click', function () { if (navigator.clipboard) navigator.clipboard.writeText(gecerliKod).catch(function () {}); });

  /* ---- yayin notu (yalniz tarayicida) ---- */
  var notMetni = '';
  $('#not-form').addEventListener('submit', function (e) {
    e.preventDefault();
    notMetni = 'AFAIR / LIVE · YAYIN NOTU (TASLAK)\nKonu: ' + $('#n-konu').value + '\nBaşlık: ' + ($('#n-baslik').value || '(boş)') + '\n\n' + ($('#n-not').value || '(not yok)') + '\n\nHazırlanma: ' + new Date().toLocaleString('tr-TR') + '\n';
    $('#n-onizleme').textContent = notMetni;
  });
  $('#n-indir').addEventListener('click', function () {
    if (!notMetni) { $('#n-onizleme').textContent = 'Önce "Taslağı hazırla"ya bas.'; return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([notMetni], { type: 'text/plain;charset=utf-8' })); a.download = 'yayin-notu.txt'; document.body.appendChild(a); a.click(); a.remove();
  });

  /* ---- katki ---- */
  $('#tetik').textContent = S.tetik;
  var kopyaDugme = $('#kopyala');
  if (kopyaDugme) kopyaDugme.addEventListener('click', function () {
    var d = $('#kopya-durum');
    function tamam() { d.textContent = 'Kopyalandı.'; }
    function olmadi() { var r = document.createRange(); r.selectNodeContents($('#tetik')); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); d.textContent = 'Seçildi; Ctrl+C ile kopyala.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(S.tetik).then(tamam, olmadi); else olmadi();
  });
  $('#ilerleme-cubuk').style.width = Math.min(100, S.sayac.kabul / 1903 * 100) + '%';
  $('#ilerleme-yazi').textContent = S.sayac.kabul + ' / 1.903 kabul · ' + S.sayac.kirada + ' kirada · ilk boş kapı ' + (S.sonraki[0] ? kid(S.sonraki[0]) : '—');
  $('#alt-bilgi').textContent = 'Son defter olayı ' + S.zaman + ' · defter ' + S.sayac.defter_olay + ' olay (' + (S.sayac.defter_saglam ? 'zincir sağlam' : 'ZİNCİR BOZUK') + ') · ' + S.kutu;

  /* ---- baslat ---- */
  document.documentElement.classList.toggle('hareketli', hareket); anahtar.checked = hareket; notuGuncelle();
  try { heroKur(); } catch (e) { $('#hero').style.background = 'radial-gradient(circle at 70% 30%, #2b3410, #09090d 62%)'; }
  heroDurum(); mozaik(); haritaKur(); kartlariKur(); sahneKur();
})();
