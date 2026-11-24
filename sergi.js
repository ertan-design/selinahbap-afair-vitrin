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
  function hareketKur(v, kaydet) {
    hareket = v; anahtar.checked = v; document.documentElement.classList.toggle('hareketli', v);
    if (kaydet) { try { localStorage.setItem('sergi_hareket', v ? '1' : '0'); } catch (e) {} }
    heroDurum(); canliYenile(); sahneKur();
  }

  /* ---- sayaclar ---- */
  var ty = new Set(KABUL.map(function (m) { return m.t; })).size, by = new Set(KABUL.map(function (m) { return m.c; })).size;
  $('#sayaclar').innerHTML = [['kabul', S.sayac.kabul], ['inceleme', S.sayac.inceleme || 0], ['kirada', S.sayac.kirada], ['teknik', ty + '/' + NT], ['bağlam', by + '/10'], ['kapı', sayi.format(S.sayac.toplam)]]
    .map(function (x) { return '<div><b>' + x[1] + '</b><span>' + x[0] + '</span></div>'; }).join('');

  /* ---- kahraman: WebGL2 alan carpitma ---- */
  var hero = { gl: null, u: null, raf: 0, gorunur: true, t0: performance.now() };
  function heroKur() {
    var c = $('#hero'), gl = c.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) { c.style.background = 'radial-gradient(circle at 70% 30%, #2b3410, #09090d 62%)'; return; }
    var vs = '#version 300 es\nvoid main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}';
    var fs = '#version 300 es\nprecision highp float;uniform vec2 R;uniform float T;out vec4 o;' +
      'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}' +
      'float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}' +
      'float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*n(p);p*=2.02;a*=.5;}return s;}' +
      'void main(){vec2 u=(gl_FragCoord.xy-.5*R)/R.y*2.4;float t=T*.07;vec2 q=vec2(fbm(u+t),fbm(u+vec2(5.2,1.3)-t));' +
      'vec2 r=vec2(fbm(u+3.*q+vec2(1.7,9.2)+t*1.3),fbm(u+3.*q+vec2(8.3,2.8)-t));float f=fbm(u+3.*r);' +
      'vec3 Z=vec3(.035,.035,.05),A=vec3(.62,.86,.16),B=vec3(.92,.28,.46),C=vec3(.6,.48,.2);' +
      'vec3 col=mix(Z,A,clamp(f*1.5,0.,1.));col=mix(col,B,clamp(length(q)*.95,0.,1.)*.75);col=mix(col,C,clamp(r.x,0.,1.)*.45);col*=.6;o=vec4(col,1);}';
    function derle(t, s) { var sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; }
    var pr = gl.createProgram(); gl.attachShader(pr, derle(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, derle(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    hero.gl = gl; hero.u = { R: gl.getUniformLocation(pr, 'R'), T: gl.getUniformLocation(pr, 'T') }; heroBoyut();
    window.addEventListener('resize', heroBoyut);
    new IntersectionObserver(function (es) { hero.gorunur = es[0].isIntersecting; heroDurum(); }).observe($('#giris'));
  }
  function heroBoyut() {
    var c = $('#hero'), g = hero.gl; if (!g) return;
    c.width = Math.max(2, Math.floor(c.clientWidth * 0.5)); c.height = Math.max(2, Math.floor(c.clientHeight * 0.5));
    g.viewport(0, 0, c.width, c.height); g.uniform2f(hero.u.R, c.width, c.height); heroCiz(3000);
  }
  function heroCiz(t) { if (!hero.gl) return; hero.gl.uniform1f(hero.u.T, t / 1000); hero.gl.drawArrays(hero.gl.TRIANGLES, 0, 3); }
  function heroDongu() { if (!(hareket && hero.gorunur)) { hero.raf = 0; return; } heroCiz(performance.now() - hero.t0); hero.raf = requestAnimationFrame(heroDongu); }
  function heroDurum() { if (hero.raf) { cancelAnimationFrame(hero.raf); hero.raf = 0; } if (hareket && hero.gorunur) hero.raf = requestAnimationFrame(heroDongu); else heroCiz(3000); }

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
      a.innerHTML = '<div class="onizleme"><button class="oynat" type="button">▶ Canlı göster · ' + esc(T[m.t][1]) + '</button></div>' +
        '<div class="kart-alt"><h3>' + esc(m.baslik) + '</h3><p>' + esc(m.aciklama) + '</p>' +
        '<ul class="etiketler"><li class="teknik">' + esc(T[m.t][1]) + '</li><li>' + esc(B[m.c][1]) + '</li><li>' + esc(K[m.k][1]) + '</li>' +
        '<li><span class="renkler" title="' + esc(p[1]) + '"><i style="background:' + p[2] + '"></i><i style="background:' + p[4] + '"></i><i style="background:' + p[5] + '"></i><i style="background:' + p[6] + '"></i></span> ' + esc(p[1]) + '</li></ul>' +
        '<div class="kart-satir"><span>' + kid(m.no) + '</span><span>' + esc(m.yazar) + '</span><span>' + sayi.format(m.bayt) + ' B</span><span title="Gerçek tarayıcıda ekran dolu, hata yok">' + (m.gorsel ? 'tarayıcı hakemi ✓' : 'tarayıcı hakemi yok') + '</span><span title="Modülü yazmayan başka bir GPT ekran görüntüsü ve kaynakla puanladı">' + (m.r ? 'model hakemi ' + String(m.r[0]).replace('.', ',') + '/5 (' + m.r[1] + ')' + (m.r[2] ? '' : ' ⚠ dürüstlük itirazı') : 'model hakemi bekliyor') + '</span></div>' +
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
  $('#alt-bilgi').textContent = 'Derleme ' + S.zaman + ' · defter ' + S.sayac.defter_olay + ' olay (' + (S.sayac.defter_saglam ? 'zincir sağlam' : 'ZİNCİR BOZUK') + ') · ' + S.kutu;

  /* ---- baslat ---- */
  document.documentElement.classList.toggle('hareketli', hareket); anahtar.checked = hareket;
  try { heroKur(); } catch (e) { $('#hero').style.background = 'radial-gradient(circle at 70% 30%, #2b3410, #09090d 62%)'; }
  heroDurum(); mozaik(); haritaKur(); kartlariKur(); sahneKur();
})();
