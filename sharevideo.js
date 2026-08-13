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
var SV_FPS = 25, SV_SECONDS = 7;
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

// Сетка точек поверх фото: проявляется и гаснет, как при сканировании.
function svMesh(c, lm, box, p) {
  if (!lm || !box.w) return;
  var a = svPhase(p, .06, .22) * (1 - svPhase(p, .34, .52));
  if (a <= 0.01) return;
  c.save();
  c.globalAlpha = a * .7;
  c.fillStyle = SV_GOLD;
  var keys = Object.keys(lm);
  for (var i = 0; i < keys.length; i += 2) {
    var pt = lm[keys[i]];
    if (!pt) continue;
    c.fillRect(box.x + pt.x * box.w - 1, box.y + pt.y * box.h - 1, 2, 2);
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
  var grow = svPhase(p, .28, .62);
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
    var appear = svPhase(p, .5 + i * .04, .62 + i * .04);
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
  svMesh(c, data.landmarks, box, p);

  if (data.tier) {
    var ta = svPhase(p, .2, .3);
    if (ta > 0) {
      c.save();
      c.globalAlpha = ta;
      var tw = 118, tx = SV_W / 2 - tw / 2, ty = box.y + box.h - 50;
      c.fillStyle = 'rgba(10,10,10,.65)'; c.strokeStyle = SV_GOLD; c.lineWidth = 1;
      svRoundRect(c, tx, ty, tw, 32, 16); c.fill(); c.stroke();
      c.restore();
      svSpaced(c, data.tier, SV_W / 2, ty + 21, '400 13px "Inter", system-ui, sans-serif', SV_GOLD_HI, 3, ta);
    }
  }

  // Общий балл: цифра набегает, кольцо заполняется
  var shown = (data.overall || 0) * svPhase(p, .28, .62);
  svSpaced(c, 'ОБЩАЯ ОЦЕНКА', SV_W / 2, 578, '300 12px "Inter", system-ui, sans-serif',
           'rgba(196,164,107,.85)', 4, svPhase(p, .24, .34));
  svScoreRing(c, SV_W / 2, 638, 48, data.overall || 0, p);
  svText(c, shown.toFixed(1), SV_W / 2, 653,
         '400 50px "Cormorant Garamond", Georgia, serif', SV_TEXT, 'center', svPhase(p, .26, .36));

  svBars(c, data.categories || [], p);

  var fa = svPhase(p, .8, .9);
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
    photo: window.cleanImageCanvas || document.getElementById('canvas'),
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
