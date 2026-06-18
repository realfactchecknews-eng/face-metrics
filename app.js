const WORKER_URL = "https://face-metrics-ai.realfactchecknews.workers.dev";

// MediaPipe Face Mesh connection groups
const FACE_OVAL  = [[10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10]];
const LEFT_EYE   = [[263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],[362,398],[398,384],[384,385],[385,386],[386,387],[387,388],[388,466],[466,263]];
const RIGHT_EYE  = [[33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[133,173],[173,157],[157,158],[158,159],[159,160],[160,161],[161,246],[246,33]];
const LEFT_BROW  = [[276,283],[283,282],[282,295],[295,285],[300,293],[293,334],[334,296],[296,336]];
const RIGHT_BROW = [[46,53],[53,52],[52,65],[65,55],[70,63],[63,105],[105,66],[66,107]];
const LIPS       = [[61,185],[185,40],[40,39],[39,37],[37,0],[0,267],[267,269],[269,270],[270,409],[409,291],[291,375],[375,321],[321,405],[405,314],[314,17],[17,84],[84,181],[181,91],[91,146],[146,61]];
const NOSE       = [[168,6],[6,197],[197,195],[195,5],[5,4],[4,1],[1,2],[2,98],[98,97]];

const MESH_GROUPS = [
  { conns: FACE_OVAL,  alpha: 0.65, lw: 1.2 },
  { conns: LEFT_EYE,  alpha: 0.75, lw: 0.9 },
  { conns: RIGHT_EYE, alpha: 0.75, lw: 0.9 },
  { conns: LEFT_BROW, alpha: 0.60, lw: 0.8 },
  { conns: RIGHT_BROW,alpha: 0.60, lw: 0.8 },
  { conns: LIPS,      alpha: 0.65, lw: 0.9 },
  { conns: NOSE,      alpha: 0.55, lw: 0.7 },
];

const FACTS = [
  "Positive canthal tilt -> hunter eyes. The most sought-after eye shape in looksmaxxing -- signals dominance and sexual dimorphism.",
  "fWHR 1.9-2.1: optimal facial width-to-height ratio. Correlates with perceived dominance and masculine structure.",
  "Facial symmetry above 90% is present in fewer than 4% of the global population. Every percentage point counts.",
  "Ideal gonial angle 120-125 degrees defines a sharp, well-defined mandible. Too acute looks harsh; too obtuse -- recessed.",
  "Forward maxillary projection creates midface harmony, optimal lip support, and prevents the hollow under-eye look.",
  "Bizygomatic-to-bigonial taper ratio 1.2-1.35 signals superior facial structure -- wide cheekbones, tapered jaw.",
  "Interpupillary distance 62-65mm is the ideal orbital spacing. Too wide or too narrow alters face perception significantly.",
];

const AI_PHASES = [
  "INITIALIZING NEURAL SCAN",
  "DETECTING FACE GEOMETRY",
  "COMPUTING SYMMETRY MATRIX",
  "EVALUATING CANTHAL TILT",
  "ANALYZING MAXILLARY PROJECTION",
  "MEASURING GONIAL VECTORS",
  "CROSS-REFERENCING GOLDEN RATIO",
  "ASSESSING SKIN PHENOTYPE",
  "CALCULATING PSL COEFFICIENTS",
  "MAPPING BIZYGOMATIC RATIO",
  "GENERATING LOOKSMAX REPORT",
];

const HUD_TOKENS = [
  "LM:468","SYM:0.918","fWHR:1.847","CANT:+2.1deg","NPC:0.726",
  "CBR:1.314","IPD:63.2mm","PSL:pending","GAN:124.3deg","NLA:91deg",
  "MSR:0.974","malar+","0xF2A4B1","0xA3C788","0xD1B9","0x8E2F4C",
];

// DOM refs
const fileInput     = document.getElementById("fileInput");
const sideInput     = document.getElementById("sideInput");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const chooseSideBtn = document.getElementById("chooseSideBtn");
const frontArea     = document.getElementById("frontArea");
const sideArea      = document.getElementById("sideArea");
const analyzeBtn    = document.getElementById("analyzeBtn");
const uploadSection = document.getElementById("uploadSection");
const analysisView  = document.getElementById("analysisView");
const canvas        = document.getElementById("canvas");
const ctx           = canvas.getContext("2d");
const resetBtn      = document.getElementById("resetBtn");
const loadingCard   = document.getElementById("loading");
const resultsDiv    = document.getElementById("results");
const errorBox      = document.getElementById("errorBox");
const errorText     = document.getElementById("errorText");

let faceMesh         = null;
let frontImg         = null;
let sideImg          = null;
let cleanImageCanvas = null;
let cleanSideCanvas  = null;
let factTimer        = null;
let factIdx          = 0;
let _hudRAF          = null;
let _hudPhaseTimer   = null;

// -- Landing sequence ---------------------------------------------------
function startLanding() {
  var el = document.getElementById("landingSection");
  if (!el) return;
  el.classList.add("landing-visible");
  setTimeout(countUpStats, 200);
  setTimeout(function() {
    typeWriter(document.getElementById("landQuote"), "“Every measurement tells a story.”", 38);
  }, 500);
  setTimeout(function() {
    showFact(0);
    factTimer = setInterval(function() {
      factIdx = (factIdx + 1) % FACTS.length;
      showFact(factIdx);
    }, 4200);
  }, 1400);
}

function countUpStats() {
  document.querySelectorAll(".lst-num[data-target]").forEach(function(el) {
    var target    = parseFloat(el.dataset.target);
    var isDecimal = el.dataset.decimal === "1";
    var suffix    = el.dataset.suffix || "";
    var duration  = 1500;
    var t0        = performance.now();
    function tick(now) {
      var p = Math.min((now - t0) / duration, 1);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = isDecimal
        ? (e * target).toFixed(3) + suffix
        : Math.round(e * target) + suffix;
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = (isDecimal ? target.toFixed(3) : target) + suffix;
    }
    requestAnimationFrame(tick);
  });
}

function typeWriter(el, text, speed) {
  if (!el) return;
  var i = 0; el.textContent = "";
  (function tick() {
    if (i < text.length) { el.textContent += text[i++]; setTimeout(tick, speed); }
  })();
}

function showFact(idx) {
  var el = document.getElementById("landFact");
  if (!el) return;
  el.classList.remove("fact-in");
  setTimeout(function() { el.textContent = FACTS[idx]; el.classList.add("fact-in"); }, 320);
}

function transitionToAnalysis() {
  if (factTimer) clearInterval(factTimer);
  var bpScene = document.getElementById("bpScene");
  var landing = document.getElementById("landingSection");

  // Fallback: if the pill/landing aren't present, just reveal the main app.
  if (!bpScene || !landing) {
    if (landing && landing.parentNode) landing.remove();
    document.body.classList.add("post-landing");
    return;
  }

  var GROW_DUR = 3600; // pill slowly rotates + grows
  var OPEN_DUR = 1000; // pill opens
  var EXIT_DUR = 650;  // dark landing fades out / main scene fades in

  // 1. Fade everything around the pill so only the pill is in focus.
  landing.classList.add("landing-focus");

  // Measure how far the pill is from the centre of the screen, so the grow
  // animation can drift it to the exact centre regardless of screen size.
  var wrap = document.getElementById("bpPillWrap");
  if (wrap) {
    var rect = wrap.getBoundingClientRect();
    var pillCenterY = rect.top + rect.height / 2;
    var shift = Math.round(window.innerHeight / 2 - pillCenterY);
    bpScene.style.setProperty("--pill-shift", shift + "px");
  }

  // 2. Pill slowly rotates, grows and drifts to the centre.
  bpScene.classList.add("pill-animated");

  // 3. After it has grown, the pill opens.
  setTimeout(function() {
    bpScene.classList.add("pill-split");

    // 4. Only after the pill has fully opened do we reveal the main scene.
    //    The dark landing fades away and the main app fades in underneath.
    setTimeout(function() {
      document.body.classList.add("post-landing");
      landing.classList.add("landing-exit");
      setTimeout(function() {
        if (landing.parentNode) landing.remove();
      }, EXIT_DUR + 100);
    }, OPEN_DUR);
  }, GROW_DUR);
}

// -- Bootstrap ----------------------------------------------------------
window.addEventListener("DOMContentLoaded", function() {
  var overlay = document.getElementById("introOverlay");
  if (overlay) {
    setTimeout(function() {
      overlay.classList.add("intro-exit");
      overlay.addEventListener("transitionend", function() {
        overlay.remove();
        startLanding();
      }, { once: true });
    }, 2800);
  } else {
    startLanding();
  }
  var beginBtn = document.getElementById("beginBtn");
  if (beginBtn) beginBtn.addEventListener("click", transitionToAnalysis);
});

// -- Upload: front photo -----------------------------------------------
chooseFileBtn.addEventListener("click", function(e) { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener("change", function(e) { if (e.target.files[0]) loadFrontFile(e.target.files[0]); });
frontArea.addEventListener("click", function() { if (!frontImg) fileInput.click(); });
["dragover","dragenter"].forEach(function(evt) { frontArea.addEventListener(evt, function(e) { e.preventDefault(); frontArea.classList.add("dragover"); }); });
["dragleave","drop"].forEach(function(evt) { frontArea.addEventListener(evt, function(e) { e.preventDefault(); frontArea.classList.remove("dragover"); }); });
frontArea.addEventListener("drop", function(e) { var f = e.dataTransfer.files[0]; if (f) loadFrontFile(f); });

document.getElementById("frontRemove").addEventListener("click", function(e) {
  e.stopPropagation();
  frontImg = null;
  document.getElementById("frontThumb").classList.add("hidden");
  document.getElementById("frontPlaceholder").classList.remove("hidden");
  analyzeBtn.classList.add("hidden");
  fileInput.value = "";
});

function loadFrontFile(file) {
  if (!file.type.startsWith("image/")) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      frontImg = img;
      document.getElementById("frontThumbImg").src = ev.target.result;
      document.getElementById("frontPlaceholder").classList.add("hidden");
      document.getElementById("frontThumb").classList.remove("hidden");
      analyzeBtn.classList.remove("hidden");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// -- Upload: side profile photo ----------------------------------------
chooseSideBtn.addEventListener("click", function(e) { e.stopPropagation(); sideInput.click(); });
sideInput.addEventListener("change", function(e) { if (e.target.files[0]) loadSideFile(e.target.files[0]); });
sideArea.addEventListener("click", function() { if (!sideImg) sideInput.click(); });
["dragover","dragenter"].forEach(function(evt) { sideArea.addEventListener(evt, function(e) { e.preventDefault(); sideArea.classList.add("dragover"); }); });
["dragleave","drop"].forEach(function(evt) { sideArea.addEventListener(evt, function(e) { e.preventDefault(); sideArea.classList.remove("dragover"); }); });
sideArea.addEventListener("drop", function(e) { var f = e.dataTransfer.files[0]; if (f) loadSideFile(f); });

document.getElementById("sideRemove").addEventListener("click", function(e) {
  e.stopPropagation();
  sideImg = null;
  document.getElementById("sideThumb").classList.add("hidden");
  document.getElementById("sidePlaceholder").classList.remove("hidden");
  sideInput.value = "";
});

function loadSideFile(file) {
  if (!file.type.startsWith("image/")) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      sideImg = img;
      document.getElementById("sideThumbImg").src = ev.target.result;
      document.getElementById("sidePlaceholder").classList.add("hidden");
      document.getElementById("sideThumb").classList.remove("hidden");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// -- Analyze -----------------------------------------------------------
analyzeBtn.addEventListener("click", function() {
  if (!frontImg) return;
  errorBox.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  loadingCard.classList.remove("hidden");
  processImage(frontImg, sideImg);
});

resetBtn.addEventListener("click", function() {
  uploadSection.classList.remove("hidden");
  analysisView.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  loadingCard.classList.add("hidden");
  errorBox.classList.add("hidden");
  fileInput.value = ""; sideInput.value = "";
  cleanImageCanvas = null; cleanSideCanvas = null;
  frontImg = null; sideImg = null;
  document.getElementById("frontThumb").classList.add("hidden");
  document.getElementById("frontPlaceholder").classList.remove("hidden");
  document.getElementById("sideThumb").classList.add("hidden");
  document.getElementById("sidePlaceholder").classList.remove("hidden");
  analyzeBtn.classList.add("hidden");
});

function showError(msg) {
  errorText.textContent = msg;
  errorBox.classList.remove("hidden");
  loadingCard.classList.add("hidden");
  analysisView.classList.remove("hidden");
}

// -- AI HUD animation --------------------------------------------------
function startAIHUD(hasSide) {
  var card      = document.getElementById("aiLoading");
  var phaseEl   = document.getElementById("hudPhase");
  var fillEl    = document.getElementById("hudBarFill");
  var pctEl     = document.getElementById("hudBarPct");
  var streamEl  = document.getElementById("hudStream");
  var sideLabel = document.getElementById("hudSideLabel");

  card.classList.remove("hidden");
  streamEl.innerHTML = "";
  sideLabel.textContent = hasSide ? "+ PROFILE" : "";
  sideLabel.style.display = hasSide ? "" : "none";

  fillEl.style.transition = "none";
  fillEl.style.width = "0%";
  pctEl.textContent = "0%";

  var t0 = performance.now();
  var TOTAL = 22000;

  function tickBar(now) {
    var t   = Math.min((now - t0) / TOTAL, 1);
    var pct = Math.round(t < 0.72 ? (t / 0.72) * 84 : 84 + ((t - 0.72) / 0.28) * 8);
    fillEl.style.transition = "width .8s linear";
    fillEl.style.width = pct + "%";
    pctEl.textContent  = pct + "%";
    if (pct < 92) _hudRAF = requestAnimationFrame(tickBar);
  }
  requestAnimationFrame(function() { requestAnimationFrame(tickBar); });

  var phaseIdx = 0;
  function nextPhase() {
    phaseEl.style.opacity = "0";
    setTimeout(function() {
      phaseEl.textContent   = AI_PHASES[phaseIdx % AI_PHASES.length];
      phaseEl.style.opacity = "1";
      var line = document.createElement("span");
      line.className = "hud-stream-line" + (Math.random() > 0.5 ? " hl" : "");
      var tok  = HUD_TOKENS[phaseIdx % HUD_TOKENS.length];
      line.textContent = "[" + String(phaseIdx + 1).padStart(2, "0") + "] " + AI_PHASES[phaseIdx % AI_PHASES.length] + "  " + tok;
      streamEl.appendChild(line);
      while (streamEl.children.length > 3) streamEl.removeChild(streamEl.firstChild);
      phaseIdx++;
    }, 180);
    _hudPhaseTimer = setTimeout(nextPhase, 2100);
  }
  phaseEl.textContent   = AI_PHASES[0];
  phaseEl.style.opacity = "1";
  _hudPhaseTimer = setTimeout(nextPhase, 2100);
}

function stopAIHUD() {
  if (_hudRAF)        { cancelAnimationFrame(_hudRAF); _hudRAF = null; }
  if (_hudPhaseTimer) { clearTimeout(_hudPhaseTimer); _hudPhaseTimer = null; }
  var fillEl = document.getElementById("hudBarFill");
  var pctEl  = document.getElementById("hudBarPct");
  if (fillEl) { fillEl.style.transition = "width .3s ease"; fillEl.style.width = "100%"; }
  if (pctEl)  pctEl.textContent = "100%";
  setTimeout(function() {
    var card = document.getElementById("aiLoading");
    if (card) card.classList.add("hidden");
  }, 380);
}

// -- FaceMesh ----------------------------------------------------------
function initFaceMesh() {
  if (faceMesh) return faceMesh;
  faceMesh = new FaceMesh({
    locateFile: function(f) { return "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + f; },
  });
  faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:.5, minTrackingConfidence:.5 });
  return faceMesh;
}

// -- Face metrics ------------------------------------------------------
function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function computeFaceMetrics(lm) {
  var cheekboneWidth = _dist(lm[234], lm[454]);
  var jawWidth       = _dist(lm[58],  lm[288]);
  var foreheadWidth  = _dist(lm[21],  lm[251]);
  var faceHeight     = _dist(lm[10],  lm[152]);
  var fwhrH = _dist(lm[9], lm[13]);
  var widthHeightRatio = fwhrH > 0 ? cheekboneWidth / fwhrH : 1.8;
  var cx      = (lm[234].x + lm[454].x) / 2;
  var cbLeft  = Math.abs(lm[234].x - cx);
  var cbRight = Math.abs(lm[454].x - cx);
  var cbSym   = cbLeft > 0 && cbRight > 0 ? Math.min(cbLeft, cbRight) / Math.max(cbLeft, cbRight) : 1;
  var jawLeft  = Math.abs(lm[58].x  - cx);
  var jawRight = Math.abs(lm[288].x - cx);
  var jawSym   = jawLeft > 0 && jawRight > 0 ? Math.min(jawLeft, jawRight) / Math.max(jawLeft, jawRight) : 1;
  var symmetryScore = (cbSym + jawSym) / 2;
  return { cheekboneWidth: cheekboneWidth, jawWidth: jawWidth, foreheadWidth: foreheadWidth, faceHeight: faceHeight, widthHeightRatio: widthHeightRatio, symmetryScore: symmetryScore };
}

function classifyFaceShape(metrics) {
  // Точки 234/454 — это самые широкие точки контура (у ушей), поэтому скулы
  // почти всегда чуть шире лба и челюсти: cbJaw/cbFore обычно лежат в ~1.0-1.25.
  // Пороги подобраны под этот реальный диапазон, а дефолт — oval (сбалансированное),
  // а не round, иначе в round проваливалось бы большинство лиц.
  var cb   = metrics.cheekboneWidth || 1;
  var jaw  = metrics.jawWidth       || 1;
  var fore = metrics.foreheadWidth  || 1;
  var lengthRatio = metrics.faceHeight / cb;   // >=1.55 длинное, <1.4 короткое
  var cbJaw  = cb / jaw;                        // насколько скулы шире челюсти
  var cbFore = cb / fore;                       // насколько скулы шире лба

  var shape;
  if      (lengthRatio >= 1.55 && cbJaw < 1.12 && cbFore < 1.15) shape = "oblong";   // длинное, равномерной ширины
  else if (fore >= cb * 0.98 && jaw <= cb * 0.9)                 shape = "heart";    // широкий лоб, узкая челюсть
  else if (cbJaw >= 1.15 && cbFore >= 1.1)                       shape = "diamond";  // скулы заметно шире лба и челюсти
  else if (lengthRatio < 1.4 && jaw >= cb * 0.93)               shape = "square";   // короткое, сильная челюсть
  else if (lengthRatio < 1.4 && cbJaw < 1.12)                   shape = "round";    // короткое, мягкий контур
  else                                                           shape = "oval";     // сбалансированное (по умолчанию)
  return { shape: shape };
}

// -- Process image -----------------------------------------------------
async function processImage(img, sideImage) {
  try {
    var mesh = initFaceMesh();
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    cleanImageCanvas = document.createElement("canvas");
    cleanImageCanvas.width  = canvas.width;
    cleanImageCanvas.height = canvas.height;
    cleanImageCanvas.getContext("2d").drawImage(img, 0, 0);

    if (sideImage) {
      cleanSideCanvas = document.createElement("canvas");
      cleanSideCanvas.width  = sideImage.naturalWidth;
      cleanSideCanvas.height = sideImage.naturalHeight;
      cleanSideCanvas.getContext("2d").drawImage(sideImage, 0, 0);
    } else {
      cleanSideCanvas = null;
    }

    mesh.onResults(function(results) {
      loadingCard.classList.add("hidden");
      if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
        showError("He удалось распознать лицо. Попробуйте другое фото -- лицо должно быть направлено в камеру и хорошо освещено."); return;
      }
      var raw = results.multiFaceLandmarks[0];
      var w   = canvas.width, h = canvas.height;
      var lm  = raw.map(function(p) { return { x: p.x * w, y: p.y * h }; });
      var metrics   = computeFaceMetrics(lm);
      var shapeInfo = classifyFaceShape(metrics);
      runFaceAnimation(lm, metrics, function() {
        resultsDiv.classList.remove("hidden");
        callAI(metrics, shapeInfo);
      });
      raw.length = 0;
    });
    await mesh.send({ image: canvas });
  } catch (err) {
    console.error(err);
    showError("Ошибка при анализе. Попробуйте обновить страницу.");
  }
}

// -- Face animation ----------------------------------------------------
function runFaceAnimation(lm, metrics, onComplete) {
  animateScan(lm, metrics, 1600, function() { setTimeout(onComplete, 400); });
}

function animateScan(lm, metrics, duration, onComplete) {
  var t0 = performance.now();
  function frame(now) {
    var progress = Math.min((now - t0) / duration, 1);
    var scanY    = progress * canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cleanImageCanvas, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.48)";
    ctx.fillRect(0, scanY, canvas.width, canvas.height - scanY);
    drawMeshUpTo(lm, scanY);
    drawScanLine(scanY);
    drawScannerCrosshairs(lm, scanY);
    if (progress < 1) { requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cleanImageCanvas, 0, 0);
    drawFullMesh(lm);
    animateMeasurements(lm, metrics, onComplete);
  }
  requestAnimationFrame(frame);
}

function drawScanLine(y) {
  if (y <= 0 || y >= canvas.height) return;
  ctx.save();
  var grad = ctx.createLinearGradient(0, Math.max(0, y - 60), 0, y);
  grad.addColorStop(0, "rgba(196,164,107,0)"); grad.addColorStop(1, "rgba(196,164,107,0.18)");
  ctx.fillStyle = grad; ctx.fillRect(0, Math.max(0, y - 60), canvas.width, 62);
  ctx.shadowColor = "#c4a46b"; ctx.shadowBlur = 16;
  ctx.strokeStyle = "#c4a46b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  ctx.shadowBlur = 3; ctx.strokeStyle = "rgba(255,245,210,.85)"; ctx.lineWidth = .5; ctx.stroke();
  ctx.restore();
}

function drawScannerCrosshairs(lm, scanY) {
  var targets = [33, 263, 1, 152, 234, 454, 58, 288, 10, 94];
  var cs = Math.max(7, canvas.width * 0.013);
  ctx.save();
  ctx.lineWidth = Math.max(0.6, canvas.width / 900);
  ctx.shadowColor = "rgba(196,164,107,0.9)";
  ctx.shadowBlur = 10;
  targets.forEach(function(idx) {
    var p = lm[idx];
    if (!p || p.y >= scanY - cs * 0.5) return;
    var alpha = Math.min(1, (scanY - p.y) / (cs * 4));
    ctx.strokeStyle = "rgba(196,164,107," + (0.85 * alpha) + ")";
    ctx.beginPath(); ctx.moveTo(p.x - cs, p.y); ctx.lineTo(p.x + cs, p.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x, p.y - cs); ctx.lineTo(p.x, p.y + cs); ctx.stroke();
    var bs = cs * 0.42;
    ctx.beginPath();
    ctx.moveTo(p.x - cs, p.y - cs + bs); ctx.lineTo(p.x - cs, p.y - cs); ctx.lineTo(p.x - cs + bs, p.y - cs);
    ctx.moveTo(p.x + cs - bs, p.y - cs); ctx.lineTo(p.x + cs, p.y - cs); ctx.lineTo(p.x + cs, p.y - cs + bs);
    ctx.moveTo(p.x - cs, p.y + cs - bs); ctx.lineTo(p.x - cs, p.y + cs); ctx.lineTo(p.x - cs + bs, p.y + cs);
    ctx.moveTo(p.x + cs - bs, p.y + cs); ctx.lineTo(p.x + cs, p.y + cs); ctx.lineTo(p.x + cs, p.y + cs - bs);
    ctx.stroke();
  });
  ctx.restore();
}

function drawMeshUpTo(lm, scanY) {
  ctx.save(); ctx.shadowColor = "rgba(196,164,107,.55)"; ctx.shadowBlur = 5;
  MESH_GROUPS.forEach(function(g) {
    ctx.strokeStyle = "rgba(196,164,107," + g.alpha + ")";
    ctx.lineWidth   = Math.max(.4, canvas.width / 1200 * g.lw);
    g.conns.forEach(function(pair) {
      var pa = lm[pair[0]], pb = lm[pair[1]];
      if (!pa || !pb || pa.y >= scanY || pb.y >= scanY) return;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  });
  var dotR = Math.max(1, canvas.width / 700);
  ctx.fillStyle = "rgba(196,164,107,.55)"; ctx.shadowBlur = 6;
  for (var i = 0; i < lm.length; i += 4) {
    if (lm[i] && lm[i].y < scanY) { ctx.beginPath(); ctx.arc(lm[i].x, lm[i].y, dotR, 0, Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

function drawFullMesh(lm) {
  ctx.save(); ctx.shadowColor = "rgba(196,164,107,.5)"; ctx.shadowBlur = 5;
  MESH_GROUPS.forEach(function(g) {
    ctx.strokeStyle = "rgba(196,164,107," + g.alpha + ")";
    ctx.lineWidth   = Math.max(.4, canvas.width / 1200 * g.lw);
    g.conns.forEach(function(pair) {
      var pa = lm[pair[0]], pb = lm[pair[1]]; if (!pa || !pb) return;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  });
  var dotR = Math.max(1, canvas.width / 700);
  ctx.fillStyle = "rgba(196,164,107,.5)"; ctx.shadowBlur = 6;
  for (var i = 0; i < lm.length; i += 4) {
    if (!lm[i]) continue;
    ctx.beginPath(); ctx.arc(lm[i].x, lm[i].y, dotR, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function animateMeasurements(lm, metrics, onComplete) {
  var snap = document.createElement("canvas");
  snap.width = canvas.width; snap.height = canvas.height;
  snap.getContext("2d").drawImage(canvas, 0, 0);
  var PHASE_DUR = 460;
  var NUM = 4;
  var t0  = performance.now();
  var totalDur = PHASE_DUR * NUM;
  function drawPhase(idx, alpha) {
    ctx.globalAlpha = alpha;
    if (idx === 0) drawCanthalLine(lm);
    if (idx === 1) drawBizygomaticLine(lm);
    if (idx === 2) drawFWHRLabel(lm, metrics);
    if (idx === 3) drawJawSymLine(lm, metrics);
    ctx.globalAlpha = 1;
  }
  function frame(now) {
    var elapsed = now - t0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snap, 0, 0);
    for (var i = 0; i < NUM; i++) {
      var ps = i * PHASE_DUR, pe = ps + PHASE_DUR;
      var alpha = elapsed >= pe ? 1 : elapsed >= ps ? (elapsed - ps) / PHASE_DUR : 0;
      if (alpha > 0) drawPhase(i, Math.min(alpha * 2.5, 1));
    }
    if (elapsed < totalDur) { requestAnimationFrame(frame); }
    else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(snap, 0, 0);
      for (var j = 0; j < NUM; j++) drawPhase(j, 1);
      setTimeout(onComplete, 320);
    }
  }
  requestAnimationFrame(frame);
}

function drawCanthalLine(lm) {
  var le = lm[33], re = lm[263];
  if (!le || !re) return;
  var angle = Math.atan2(re.y - le.y, re.x - le.x) * 180 / Math.PI;
  var fs = Math.max(9, canvas.width * 0.015);
  ctx.save();
  ctx.strokeStyle = "rgba(196,164,107,0.72)";
  ctx.lineWidth = Math.max(0.7, canvas.width / 1200);
  ctx.setLineDash([Math.max(3, canvas.width / 280), Math.max(4, canvas.width / 180)]);
  ctx.shadowColor = "rgba(196,164,107,.8)"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(le.x, le.y); ctx.lineTo(re.x, re.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = fs + "px 'SF Mono',Consolas,monospace";
  ctx.fillStyle = "rgba(196,164,107,0.88)"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.shadowBlur = 12;
  ctx.fillText("CANT " + (angle >= 0 ? "+" : "") + angle.toFixed(1) + "°", (le.x + re.x) / 2, Math.max(Math.min(le.y, re.y) - fs * 0.6, fs * 1.2));
  ctx.restore();
}

function drawBizygomaticLine(lm) {
  var lcb = lm[234], rcb = lm[454];
  if (!lcb || !rcb) return;
  var midY = (lcb.y + rcb.y) / 2;
  var pad  = canvas.width * 0.02, tick = canvas.height * 0.013;
  var fs   = Math.max(9, canvas.width * 0.014);
  ctx.save();
  ctx.strokeStyle = "rgba(196,164,107,0.62)";
  ctx.lineWidth = Math.max(0.7, canvas.width / 1200);
  ctx.shadowColor = "rgba(196,164,107,.7)"; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(lcb.x - pad, midY); ctx.lineTo(rcb.x + pad, midY); ctx.stroke();
  [[lcb.x - pad, midY],[rcb.x + pad, midY]].forEach(function(pt) {
    ctx.beginPath(); ctx.moveTo(pt[0], pt[1]-tick); ctx.lineTo(pt[0], pt[1]+tick); ctx.stroke();
  });
  ctx.font = fs + "px 'SF Mono',Consolas,monospace";
  ctx.fillStyle = "rgba(196,164,107,0.82)"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.shadowBlur = 10;
  ctx.fillText("BIZYGOMATIC", (lcb.x + rcb.x) / 2, midY - tick - 3);
  ctx.restore();
}

function drawFWHRLabel(lm, metrics) {
  var fore = lm[10]; if (!fore) return;
  var fs = Math.max(11, canvas.width * 0.018);
  ctx.save();
  ctx.font = "bold " + fs + "px 'SF Mono',Consolas,monospace";
  ctx.fillStyle = "rgba(196,164,107,0.92)"; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(196,164,107,.95)"; ctx.shadowBlur = 16;
  ctx.fillText("fWHR  " + metrics.widthHeightRatio.toFixed(2), canvas.width / 2, Math.max(fore.y - fs * 2.2, fs * 1.4));
  ctx.restore();
}

function drawJawSymLine(lm, metrics) {
  var ljaw = lm[58], rjaw = lm[288]; if (!ljaw || !rjaw) return;
  var midY = Math.max(ljaw.y, rjaw.y) + canvas.height * 0.025;
  if (midY > canvas.height - 12) midY = (ljaw.y + rjaw.y) / 2;
  var pad  = canvas.width * 0.014, tick = canvas.height * 0.011;
  var fs   = Math.max(9, canvas.width * 0.013);
  ctx.save();
  ctx.strokeStyle = "rgba(196,164,107,0.52)";
  ctx.lineWidth = Math.max(0.6, canvas.width / 1400);
  ctx.shadowColor = "rgba(196,164,107,.6)"; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(ljaw.x - pad, midY); ctx.lineTo(rjaw.x + pad, midY); ctx.stroke();
  [[ljaw.x - pad, midY],[rjaw.x + pad, midY]].forEach(function(pt) {
    ctx.beginPath(); ctx.moveTo(pt[0], pt[1]-tick); ctx.lineTo(pt[0], pt[1]+tick); ctx.stroke();
  });
  ctx.font = fs + "px 'SF Mono',Consolas,monospace";
  ctx.fillStyle = "rgba(196,164,107,0.78)"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.shadowBlur = 8;
  ctx.fillText("SYM  " + Math.round(metrics.symmetryScore * 100) + "%", (ljaw.x + rjaw.x) / 2, midY + tick + 4);
  ctx.restore();
}

// -- AI call -----------------------------------------------------------
async function callAI(metrics, shapeInfo) {
  var aiReport    = document.getElementById("aiReport");
  var aiError     = document.getElementById("aiError");
  var aiErrorText = document.getElementById("aiErrorText");
  var hasSide     = !!cleanSideCanvas;
  startAIHUD(hasSide);
  aiReport.classList.add("hidden");
  aiError.classList.add("hidden");
  var sym        = Math.round(metrics.symmetryScore * 100);
  var fwhr       = metrics.widthHeightRatio.toFixed(2);
  var cbJawRatio = (metrics.cheekboneWidth / metrics.jawWidth).toFixed(2);
  var jawInstruction = hasSide
    ? "A side profile photo is included on the RIGHT side of the image. Use it to accurately assess jawline definition, gonial angle, chin projection, ramus height, and nasal profile."
    : "Only a frontal view is available -- no side profile provided. For ДЖОУЛАЙН_MANDIBLE, judge what IS visible from the front fairly: bigonial width, jaw taper, chin width and frontal definition. Add the short note '-- оценка по анфас, профиль не предоставлен.' Be slightly conservative because gonial angle and chin projection are not fully visible, but do NOT artificially cap or lowball the score -- a well-defined jaw visible from the front can still score 7-8.";
  var prompt = "You are an experienced, discerning looksmaxxing analyst. Give an honest, realistic and DISCRIMINATING assessment of this face -- neither harshly lowballing nor uniformly inflating. Use looksmaxxing terminology in English, but write all explanatory text in Russian.\n\nScoring calibration -- use the FULL 1-10 range and ACTUALLY DIFFERENTIATE between features (do not give everything the same score):\n- 1-3: clear flaw in that area\n- 4: below average\n- 5: average / completely normal person -- this is the BASELINE, most features sit here\n- 6: slightly above average\n- 7: clearly above average, attractive\n- 8: very good, uncommon\n- 9-10: exceptional, model-tier / rare near-perfection\nThe typical person averages around 5/10 overall. Do NOT inflate: a 7+ must be earned by a genuinely strong, visible feature. Scores must vary across categories -- identical or near-identical scores everywhere is wrong.\n\nCRITICAL -- no generic boilerplate. Base every single observation on what you ACTUALLY SEE in THIS specific photo: this person's real eye shape, hair, skin, exact proportions, distinctive details. Never write a sentence that could apply to any face. Two different people must produce clearly different reports.\n\nGeometric data (MediaPipe):\n- Face shape: " + shapeInfo.shape + "\n- Facial symmetry: " + sym + "%\n- fWHR: " + fwhr + " (masculine ideal 1.9-2.1)\n- Cheekbone-to-jaw taper ratio: " + cbJawRatio + " (ideal 1.2-1.35)\n- Forehead: " + Math.round(metrics.foreheadWidth) + "px | Bizygomatic: " + Math.round(metrics.cheekboneWidth) + "px | Bigonial: " + Math.round(metrics.jawWidth) + "px\n\n" + jawInstruction + "\n\nAnalyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):\n\nОБЩИЙ_БАЛЛ: X/10\n[Общая оценка внешности по калибровке выше. Честный, но взвешенный вердикт: сначала сильные стороны, затем слабые. 3-4 предложения.]\n\nСИММЕТРИЯ: X/10\n[Измеренная симметрия = " + sym + "%. Переведи её в балл строго по шкале: 98-100%=9-10, 95-97%=8, 90-94%=7, 85-89%=6, 80-84%=5, ниже 80%=4 или меньше. Идеальная симметрия редка -- НЕ завышай. Разбери конкретику на фото: orbital tilt, mandibular deviation, видимые перекосы.]\n\nГЛАЗА_CANTHAL_TILT: X/10\n[Конкретно: canthal tilt (положительный/отрицательный/нейтральный), hunter eyes vs prey eyes, lid hooding, orbital rim projection, IPD vs норма, scleral show.]\n\nМИДФЕЙС_MAXILLA: X/10\n[Максиллярная проекция (forward/recessed), midface length, zygomatic arch, malar eminence, nasolabial angle.]\n\nДЖОУЛАЙН_MANDIBLE: X/10\n[Джоулайн: mandible definition, gonial angle (ideal 120-125 deg), ramus height, taper ratio " + cbJawRatio + ", chin projection, submental angle.]\n\nНОС_NOSE: X/10\n[Нос: dorsum, tip projection, nasal tip rotation, alar width vs intercanthal distance, NLH, bridge deviation.]\n\nГУБЫ_СКУЛЫ: X/10\n[Губы: соотношение 1:1.6, vermillion, philtrum, Cupid's bow. Скулы: cheekbone projection, malar fat pad.]\n\nКОЖА: X/10\n[Текстура, tone evenness, pores, acne/scarring, skin laxity, estimated skin age.]\n\nГРУМИНГ_STYLE: X/10\n[Hairline, hair density, hairstyle совместимость, brow grooming, facial hair, общее впечатление.]\n\nРЕКОМЕНДАЦИИ:\n1. [Softmax: конкретный совет]\n2. [Softmax: конкретный совет]\n3. [Softmax: конкретный совет]\n4. [Hardmax: процедура + обоснование]\n5. [Hardmax: процедура + обоснование]";
  try {
    var res = await fetch(WORKER_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt, image: canvasToBase64() })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    stopAIHUD();
    renderAIReport(data.text || "Пустой ответ.");
    aiReport.classList.remove("hidden");
  } catch (err) {
    stopAIHUD();
    aiErrorText.textContent = "Ошибка: " + err.message;
    aiError.classList.remove("hidden");
  }
}

function canvasToBase64(maxSize) {
  maxSize = maxSize || 900;
  if (cleanSideCanvas) return compositeToBase64(cleanImageCanvas || canvas, cleanSideCanvas, maxSize);
  var src = cleanImageCanvas || canvas;
  var scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  var off = document.createElement("canvas");
  off.width = Math.round(src.width * scale); off.height = Math.round(src.height * scale);
  off.getContext("2d").drawImage(src, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", .75).split(",")[1];
}

function compositeToBase64(frontCvs, sideCvs, maxW) {
  maxW = maxW || 900;
  var h = Math.max(frontCvs.height, sideCvs.height);
  var totalW = frontCvs.width + sideCvs.width + 4;
  var scale = Math.min(1, maxW / totalW);
  var out = document.createElement("canvas");
  out.width = Math.round(totalW * scale); out.height = Math.round(h * scale);
  var c = out.getContext("2d");
  c.fillStyle = "#000"; c.fillRect(0, 0, out.width, out.height);
  var fw = Math.round(frontCvs.width * scale), fh = Math.round(frontCvs.height * scale);
  c.drawImage(frontCvs, 0, Math.round((out.height - fh) / 2), fw, fh);
  c.strokeStyle = "rgba(196,164,107,.5)"; c.lineWidth = 1;
  c.beginPath(); c.moveTo(fw + 2, 0); c.lineTo(fw + 2, out.height); c.stroke();
  var sw = Math.round(sideCvs.width * scale), sh = Math.round(sideCvs.height * scale);
  c.drawImage(sideCvs, fw + 4, Math.round((out.height - sh) / 2), sw, sh);
  return out.toDataURL("image/jpeg", .75).split(",")[1];
}

function parseAIReport(text) {
  var result = { overall: null, overallDesc: "", categories: [], recommendations: [] };
  var overallM = text.match(/ОБЩИЙ_БАЛЛ:\s*(\d+(?:\.\d+)?)\/(10)\s*\n([\s\S]*?)(?=\n[Ѐ-ӿ_A-Z]+:|$)/);
  if (overallM) { result.overall = parseFloat(overallM[1]); result.overallDesc = overallM[3].trim(); }
  var cats = [
    { key:"СИММЕТРИЯ",          label:"Симметрия" },
    { key:"ГЛАЗА_CANTHAL_TILT", label:"Canthal Tilt / Eyes" },
    { key:"МИДФЕЙС_MAXILLA",    label:"Midface / Maxilla" },
    { key:"ДЖОУЛАЙН_MANDIBLE",  label:"Jawline / Mandible" },
    { key:"НОС_NOSE",              label:"Nose" },
    { key:"ГУБЫ_СКУЛЫ",        label:"Губы / Скулы" },
    { key:"КОЖА",               label:"Skin" },
    { key:"ГРУМИНГ_STYLE",      label:"Grooming / Style" },
  ];
  cats.forEach(function(cat) {
    var esc = cat.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var m = text.match(new RegExp(esc + ":\\s*(\\d+(?:\\.\\d+)?)\\/(10)\\s*\\n([\\s\\S]*?)(?=\\n[\\u0400-\\u04FF_A-Z]+:|$)"));
    if (m) result.categories.push({ label: cat.label, score: parseFloat(m[1]), text: m[3].trim() });
  });
  var recsM = text.match(/РЕКОМЕНДАЦИИ:\s*\n([\s\S]+?)$/);
  if (recsM) result.recommendations = recsM[1].split("\n").map(function(l){ return l.replace(/^\d+\.\s*/,"").trim(); }).filter(Boolean);
  return result;
}

function renderAIReport(text) {
  var parsed  = parseAIReport(text);
  var scoreEl = document.getElementById("overallScoreNum");
  document.getElementById("overallDesc").textContent = parsed.overallDesc;
  var flash = document.createElement("div");
  flash.className = "results-reveal-flash";
  document.body.appendChild(flash);
  flash.addEventListener("animationend", function() { flash.remove(); });
  if (parsed.overall !== null) {
    animateCount(scoreEl, parsed.overall, 1800);
    setTimeout(function() {
      var arc = document.getElementById("scoreRingArc");
      if (arc) {
        var target = 516 - (parsed.overall / 10) * 516;
        arc.style.transition = "stroke-dashoffset 2s cubic-bezier(0.16,1,0.3,1)";
        arc.style.strokeDashoffset = String(target);
        var col = parsed.overall >= 7.5 ? "#c4a46b" : parsed.overall >= 5.5 ? "#f0ece6" : "#888";
        scoreEl.style.color = col;
        arc.style.stroke = col;
      }
    }, 120);
  } else { scoreEl.textContent = "--"; }
  var catContainer = document.getElementById("categoryScores");
  catContainer.innerHTML = "";
  if (parsed.categories.length > 0) {
    var eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow"; eyebrow.textContent = "ДЕТАЛЬНЫЙ АНАЛИЗ";
    catContainer.appendChild(eyebrow);
    parsed.categories.forEach(function(cat, idx) {
      var row = document.createElement("div"); row.className = "score-row";
      var header = document.createElement("div"); header.className = "score-row-header";
      header.innerHTML = "<span class=\"score-name\">" + cat.label + "</span><span class=\"score-val\">" + cat.score.toFixed(1) + "<span style=\"color:var(--text-dim);font-size:.75em\">/10</span></span>";
      var track = document.createElement("div"); track.className = "score-bar-track";
      var fill  = document.createElement("div"); fill.className = "score-bar-fill"; fill.style.width = "0%";
      track.appendChild(fill);
      var desc = document.createElement("p"); desc.className = "score-text"; desc.textContent = cat.text;
      row.appendChild(header); row.appendChild(track); row.appendChild(desc);
      catContainer.appendChild(row);
      setTimeout(function() {
        row.classList.add("visible");
        requestAnimationFrame(function() { requestAnimationFrame(function() { fill.style.width = (cat.score * 10) + "%"; }); });
      }, idx * 100 + 200);
    });
  } else {
    var pre = document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;font-size:.85rem;color:var(--text-dim);line-height:1.7;font-family:inherit;";
    pre.textContent = text; catContainer.appendChild(pre);
  }
  var aiRecs = document.getElementById("aiRecs"), recsList = document.getElementById("recsList");
  recsList.innerHTML = "";
  if (parsed.recommendations.length > 0) {
    parsed.recommendations.forEach(function(rec) {
      var li = document.createElement("li"); li.textContent = rec; recsList.appendChild(li);
    });
    aiRecs.classList.remove("hidden");
  }
}

function animateCount(el, target, duration) {
  var t0 = performance.now();
  function tick(now) {
    var p = Math.min((now - t0) / duration, 1);
    var e = 1 - Math.pow(1 - p, 3);
    el.textContent = (e * target).toFixed(1);
    if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toFixed(1);
  }
  requestAnimationFrame(tick);
}
