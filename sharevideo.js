/* ═══════════════════════════════════════════════════════════════════════
   Видео с результатом анализа, целиком в браузере.

   Кадры рисуются на canvas и кодируются через WebCodecs (VideoEncoder),
   склеиваются в mp4 библиотекой mp4-muxer. Сервер об этом ничего не знает:
   ни рендера, ни хранения, ни трафика. Так же устроен «батл» у nivx.ru.

   Где WebCodecs нет (Safari до 16.4, старые Android) — откат на
   MediaRecorder с captureStream: качество хуже и контейнер может выйти
   webm, но файл всё равно получается.

   mp4-muxer лежит локально в vendor/: jsdelivr периодически недоступен в
   РФ, из-за этого мы уже переносили к себе MediaPipe (см. README).
   ═══════════════════════════════════════════════════════════════════════ */

var SV_W = 540, SV_H = 960;       // вертикаль под сторис и репост в тг
// 30 кадров вместо 25: на 25 движение кольца и бегущей цифры заметно дёргалось.
// 8 секунд вместо 7 — фазы перестали налезать друг на друга.
var SV_FPS = 30, SV_SECONDS = 8;
var SV_FRAMES = SV_FPS * SV_SECONDS;

var SV_GOLD = '#c4a46b', SV_GOLD_HI = '#e8d4a0', SV_BG = '#0a0a0a', SV_TEXT = '#f4efe7';

function svEase(t) { return t < 0 ? 0 : t > 1 ? 1 : 1 - Math.pow(1 - t, 3); }

// Кусок анимации: возвращает 0..1 для окна [from, to] в долях всего ролика.
function svPhase(p, from, to) { return svEase((p - from) / (to - from)); }

function svRoundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function svCorners(c, p) {
  var m = 22, len = 42;
  c.save();
  c.strokeStyle = SV_GOLD; c.globalAlpha = 0.55 * svPhase(p, 0, .08); c.lineWidth = 1.5;
  [[m, m, 1, 1], [SV_W - m, m, -1, 1], [m, SV_H - m, 1, -1], [SV_W - m, SV_H - m, -1, -1]]
    .forEach(function (k) {
      c.beginPath();
      c.moveTo(k[0] + k[2] * len, k[1]); c.lineTo(k[0], k[1]); c.lineTo(k[0], k[1] + k[3] * len);
      c.stroke();
    });
  c.restore();
}

// Фото пользователя: вписываем по центру верхней части кадра.
function svPhoto(c, img, p) {
  if (!img) return { x: 0, y: 0, w: 0, h: 0 };
  var boxW = SV_W - 96, boxH = 400, bx = 48, by = 100;
  var k = Math.min(boxW / img.width, boxH / img.height);
  var w = img.width * k, h = img.height * k;
  var x = bx + (boxW - w) / 2, y = by + (boxH - h) / 2;
  c.save();
  c.globalAlpha = svPhase(p, .02, .16);
  svRoundRect(c, x, y, w, h, 14); c.clip();
  c.drawImage(img, x, y, w, h);
  // лёгкое затемнение снизу, чтобы бейдж тира читался поверх фото
  var g = c.createLinearGradient(0, y + h * .6, 0, y + h);
  g.addColorStop(0, 'rgba(10,10,10,0)'); g.addColorStop(1, 'rgba(10,10,10,.75)');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.restore();
  c.save();
  c.globalAlpha = 0.5 * svPhase(p, .02, .16);
  c.strokeStyle = 'rgba(196,164,107,.5)'; c.lineWidth = 1;
  svRoundRect(c, x, y, w, h, 14); c.stroke();
  c.restore();
  return { x: x, y: y, w: w, h: h };
}

// Положение линии сканирования: 0..1 по высоте фото. Возвращает null, когда
// сканирование ещё не началось или уже закончилось.
function svScanY(p) {
  var t = (p - SV_SCAN_FROM) / (SV_SCAN_TO - SV_SCAN_FROM);
  if (t < 0 || t > 1) return null;
  // Плавный разгон и торможение — линия не дёргается на старте и в конце.
  return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
var SV_SCAN_FROM = .07, SV_SCAN_TO = .40;

// Золотая линия сканирования с затемнением ниже неё — как на самом сайте.
function svScan(c, box, p) {
  var s = svScanY(p);
  if (s === null || !box.w) return;
  var y = box.y + s * box.h;
  c.save();
  svRoundRect(c, box.x, box.y, box.w, box.h, 14); c.clip();
  // ниже линии кадр притушен: видно, что часть ещё «не обработана»
  var shade = c.createLinearGradient(0, y, 0, Math.min(y + box.h * .5, box.y + box.h));
  shade.addColorStop(0, 'rgba(0,0,0,.45)'); shade.addColorStop(1, 'rgba(0,0,0,.12)');
  c.fillStyle = shade; c.fillRect(box.x, y, box.w, box.h);
  // свечение вокруг самой линии
  var glow = c.createLinearGradient(0, y - 26, 0, y + 6);
  glow.addColorStop(0, 'rgba(196,164,107,0)'); glow.addColorStop(1, 'rgba(196,164,107,.30)');
  c.fillStyle = glow; c.fillRect(box.x, y - 26, box.w, 32);
  c.shadowColor = SV_GOLD_HI; c.shadowBlur = 14;
  c.strokeStyle = SV_GOLD_HI; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(box.x, y); c.lineTo(box.x + box.w, y); c.stroke();
  c.restore();
}

// Сетка поверх фото. Точки приходят в ПИКСЕЛЯХ исходного снимка, поэтому
// приводим их к рамке через размеры самого фото: раньше здесь умножали на
// ширину рамки, будто координаты нормализованы, и сетка улетала за кадр —
// в готовом ролике её просто не было видно.
function svMesh(c, lm, box, p, photo) {
  if (!lm || !box.w || !photo || !photo.width) return;
  var a = svPhase(p, .07, .2) * (1 - svPhase(p, .46, .62));
  if (a <= 0.01) return;
  var kx = box.w / photo.width, ky = box.h / photo.height;
  var scan = svScanY(p);
  var limitY = scan === null ? 1 : scan;   // во время скана рисуем только выше линии
  function px(i) {
    var pt = lm[i];
    if (!pt) return null;
    var ry = (pt.y / photo.height);
    if (scan !== null && ry > limitY) return null;
    return [box.x + pt.x * kx, box.y + ry * box.h];
  }
  c.save();
  c.globalAlpha = a * .85;
  // Линии сетки по тем же группам, что рисует анализ на сайте.
  if (typeof MESH_GROUPS !== 'undefined') {
    c.lineWidth = .7;
    MESH_GROUPS.forEach(function (grp) {
      c.strokeStyle = 'rgba(196,164,107,' + (grp.alpha * .75) + ')';
      c.beginPath();
      grp.conns.forEach(function (pair) {
        var A = px(pair[0]), B = px(pair[1]);
        if (!A || !B) return;
        c.moveTo(A[0], A[1]); c.lineTo(B[0], B[1]);
      });
      c.stroke();
    });
  }
  // Точки поверх линий — придают «замеру» плотность.
  c.fillStyle = 'rgba(232,212,160,.75)';
  for (var i = 0; i < lm.length; i += 3) {
    var q = px(i);
    if (q) c.fillRect(q[0] - .9, q[1] - .9, 1.8, 1.8);
  }
  c.restore();
}

function svText(c, s, x, y, font, color, align, alpha) {
  c.save();
  c.font = font; c.fillStyle = color; c.textAlign = align || 'center';
  c.globalAlpha = alpha === undefined ? 1 : alpha;
  c.fillText(s, x, y);
  c.restore();
}

// Разрядка: у canvas нет letter-spacing, рисуем по символу.
function svSpaced(c, s, x, y, font, color, gap, alpha) {
  c.save();
  c.font = font; c.fillStyle = color; c.textAlign = 'left';
  c.globalAlpha = alpha === undefined ? 1 : alpha;
  var total = 0, i;
  for (i = 0; i < s.length; i++) total += c.measureText(s[i]).width + gap;
  var cx = x - total / 2;
  for (i = 0; i < s.length; i++) {
    c.fillText(s[i], cx, y);
    cx += c.measureText(s[i]).width + gap;
  }
  c.restore();
}

function svScoreRing(c, cx, cy, r, value, p) {
  var grow = svPhase(p, .46, .72);
  c.save();
  c.lineWidth = 5; c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,.08)';
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = value >= 7.5 ? SV_GOLD_HI : value >= 5.5 ? SV_TEXT : '#9a9a9a';
  c.beginPath();
  c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (value / 10) * grow);
  c.stroke();
  c.restore();
}

function svBars(c, cats, p) {
  var top = 722, rowH = 34, w = SV_W - 104, x = 52;
  cats.slice(0, 5).forEach(function (cat, i) {
    var appear = svPhase(p, .62 + i * .045, .74 + i * .045);
    if (appear <= 0) return;
    var y = top + i * rowH;
    svText(c, cat.label, x, y, '400 16px "Inter", system-ui, sans-serif', 'rgba(230,226,219,.75)', 'left', appear);
    svText(c, cat.score.toFixed(1), x + w, y, '400 18px "Cormorant Garamond", Georgia, serif', SV_GOLD_HI, 'right', appear);
    c.save();
    c.globalAlpha = appear;
    c.fillStyle = 'rgba(255,255,255,.07)';
    svRoundRect(c, x, y + 8, w, 2.5, 1.5); c.fill();
    c.fillStyle = SV_GOLD;
    svRoundRect(c, x, y + 8, w * (cat.score / 10) * appear, 2.5, 1.5); c.fill();
    c.restore();
  });
}

function svDrawFrame(c, data, frame) {
  var p = frame / SV_FRAMES;

  c.fillStyle = SV_BG; c.fillRect(0, 0, SV_W, SV_H);
  // мягкое золотое свечение сверху
  var g = c.createRadialGradient(SV_W / 2, 200, 30, SV_W / 2, 200, 520);
  g.addColorStop(0, 'rgba(196,164,107,.10)'); g.addColorStop(1, 'rgba(196,164,107,0)');
  c.fillStyle = g; c.fillRect(0, 0, SV_W, SV_H);

  svCorners(c, p);
  svSpaced(c, 'FACERATE · ASCEND & FORGET', SV_W / 2, 66,
           '300 13px "Inter", system-ui, sans-serif', SV_GOLD, 4, svPhase(p, 0, .1));

  var box = svPhoto(c, data.photo, p);
  svMesh(c, data.landmarks, box, p, data.photo);
  svScan(c, box, p);

  // Плашка тира появляется после того, как сканирование дошло до низа кадра.
  if (data.tier) {
    var ta = svPhase(p, .42, .54);
    if (ta > 0) {
      c.save();
      c.globalAlpha = ta;
      c.font = '400 15px "Inter", system-ui, sans-serif';
      var tw = c.measureText(data.tier).width + 3 * data.tier.length + 46;
      var tx = SV_W / 2 - tw / 2, ty = box.y + box.h - 54, th = 36;
      c.fillStyle = 'rgba(10,10,10,.72)';
      svRoundRect(c, tx, ty, tw, th, th / 2); c.fill();
      c.shadowColor = SV_GOLD_HI; c.shadowBlur = 16 * ta;
      c.strokeStyle = SV_GOLD_HI; c.lineWidth = 1.2;
      svRoundRect(c, tx, ty, tw, th, th / 2); c.stroke();
      c.restore();
      svSpaced(c, data.tier, SV_W / 2, ty + 23,
               '400 15px "Inter", system-ui, sans-serif', SV_GOLD_HI, 3, ta);
    }
  }

  // Общий балл: цифра набегает, кольцо заполняется
  var shown = (data.overall || 0) * svPhase(p, .46, .72);
  svSpaced(c, 'ОБЩАЯ ОЦЕНКА', SV_W / 2, 578, '300 12px "Inter", system-ui, sans-serif',
           'rgba(196,164,107,.85)', 4, svPhase(p, .44, .52));
  svScoreRing(c, SV_W / 2, 638, 48, data.overall || 0, p);
  svText(c, shown.toFixed(1), SV_W / 2, 653,
         '400 50px "Cormorant Garamond", Georgia, serif', SV_TEXT, 'center', svPhase(p, .45, .53));

  svBars(c, data.categories || [], p);

  var fa = svPhase(p, .86, .95);
  svSpaced(c, 'FACERATE.RU', SV_W / 2, SV_H - 52,
           '300 13px "Inter", system-ui, sans-serif', SV_GOLD, 5, fa);
}

/* ── Кодирование ───────────────────────────────────────────────────── */

async function svEncodeWebCodecs(canvas, data, onProgress) {
  var lib = window.Mp4Muxer;
  if (!lib) throw new Error('mp4-muxer не загружен');
  var muxer = new lib.Muxer({
    target: new lib.ArrayBufferTarget(),
    video: { codec: 'avc', width: SV_W, height: SV_H },
    fastStart: 'in-memory',
  });
  var encoder = new VideoEncoder({
    output: function (chunk, meta) { muxer.addVideoChunk(chunk, meta); },
    error: function (e) { throw e; },
  });
  encoder.configure({ codec: 'avc1.42001f', width: SV_W, height: SV_H, bitrate: 2.4e6, framerate: SV_FPS });

  var c = canvas.getContext('2d');
  var us = 1e6 / SV_FPS;
  for (var i = 0; i < SV_FRAMES; i++) {
    svDrawFrame(c, data, i);
    var vf = new VideoFrame(canvas, { timestamp: Math.round(i * us), duration: Math.round(us) });
    encoder.encode(vf, { keyFrame: i % SV_FPS === 0 });
    vf.close();
    if (i % 10 === 0) {
      if (onProgress) onProgress(i / SV_FRAMES);
      await new Promise(function (r) { setTimeout(r, 0); });   // не морозим вкладку
    }
  }
  await encoder.flush();
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: 'video/mp4' });
}

async function svEncodeRecorder(canvas, data, onProgress) {
  var mime = 'video/webm';
  ['video/mp4;codecs=h264', 'video/webm;codecs=vp9', 'video/webm'].some(function (m) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) { mime = m; return true; }
    return false;
  });
  var stream = canvas.captureStream(SV_FPS);
  var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2.4e6 });
  var parts = [];
  rec.ondataavailable = function (e) { if (e.data.size) parts.push(e.data); };
  var done = new Promise(function (res) { rec.onstop = res; });
  rec.start();
  var c = canvas.getContext('2d');
  for (var i = 0; i < SV_FRAMES; i++) {
    svDrawFrame(c, data, i);
    if (onProgress && i % 10 === 0) onProgress(i / SV_FRAMES);
    await new Promise(function (r) { setTimeout(r, 1000 / SV_FPS); });
  }
  rec.stop();
  await done;
  return new Blob(parts, { type: mime });
}

async function svLoadMuxer() {
  if (window.Mp4Muxer) return true;
  return new Promise(function (res) {
    var s = document.createElement('script');
    s.src = 'vendor/mp4muxer/mp4-muxer.min.js';
    s.onload = function () { res(!!window.Mp4Muxer); };
    s.onerror = function () { res(false); };
    document.head.appendChild(s);
  });
}

// Собирает данные из уже отрисованного отчёта.
function svCollect() {
  var parsed = window._fmParsed;
  if (!parsed) return null;
  return {
    // Именно cleanImageCanvas по имени, а не через window: в app.js он объявлен
    // через let и свойством window не становится, так что window.cleanImageCanvas
    // всегда undefined. Раньше из-за этого сюда попадал #canvas — тот, на котором
    // уже нарисованы сетка и подписи замера, и ролик показывал их поверх фото,
    // а собственная анимация сетки ложилась вторым слоем.
    photo: (typeof cleanImageCanvas !== 'undefined' && cleanImageCanvas)
             ? cleanImageCanvas : document.getElementById('canvas'),
    landmarks: window._fmLandmarks || null,
    overall: parsed.overall,
    categories: parsed.categories || [],
    tier: (typeof pslTier === 'function' && parsed.overall !== null) ? pslTier(parsed.overall).label : '',
  };
}

async function svMakeVideo(onProgress) {
  var data = svCollect();
  if (!data) throw new Error('нет разбора');
  var canvas = document.createElement('canvas');
  canvas.width = SV_W; canvas.height = SV_H;

  var canWebCodecs = false;
  if (typeof VideoEncoder === 'function' && VideoEncoder.isConfigSupported) {
    try {
      var sup = await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: SV_W, height: SV_H });
      canWebCodecs = !!(sup && sup.supported) && await svLoadMuxer();
    } catch (e) { canWebCodecs = false; }
  }
  if (canWebCodecs) {
    try { return await svEncodeWebCodecs(canvas, data, onProgress); }
    catch (e) { console.log('WebCodecs не справился, откат на MediaRecorder:', e.message); }
  }
  return await svEncodeRecorder(canvas, data, onProgress);
}

function svDownload(blob) {
  var ext = blob.type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'facerate-' + Date.now() + '.' + ext;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
}
window.svMakeVideo = svMakeVideo;
window.svDownload = svDownload;
window.svDrawFrame = svDrawFrame;
