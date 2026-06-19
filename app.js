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

let faceLandmarker   = null;
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
  // Перед первой генерацией — показать соглашение и взять согласие.
  if (localStorage.getItem("fm-consent") !== "1") {
    showConsent();
    return;
  }
  runAnalysis();
});

function runAnalysis() {
  if (!frontImg) return;
  clearReport();
  errorBox.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  loadingCard.classList.remove("hidden");
  processImage(frontImg, sideImg);
}

function showConsent() {
  var m = document.getElementById("consentModal");
  if (m) m.classList.remove("hidden");
}

(function initConsent() {
  var modal  = document.getElementById("consentModal");
  if (!modal) return;
  var accept = document.getElementById("consentAccept");
  var decline = document.getElementById("consentDecline");
  var check  = document.getElementById("consentCheck");
  if (check && accept) {
    accept.disabled = !check.checked;
    check.addEventListener("change", function() { accept.disabled = !check.checked; });
  }
  accept.addEventListener("click", function() {
    if (check && !check.checked) return;
    localStorage.setItem("fm-consent", "1");
    localStorage.setItem("fm-consent-date", new Date().toISOString());
    modal.classList.add("hidden");
    runAnalysis();
  });
  decline.addEventListener("click", function() { modal.classList.add("hidden"); });
})();

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
  var sb = document.getElementById("shareBtn");
  if (sb) sb.classList.add("hidden");
  clearReport();
});

// Полностью обнуляет блок результатов, чтобы при анализе нового фото
// не оставалось старого PSL-балла, категорий и заполненного кольца.
function clearReport() {
  var aiReport = document.getElementById("aiReport");
  var aiError  = document.getElementById("aiError");
  var aiRecs   = document.getElementById("aiRecs");
  if (aiReport) aiReport.classList.add("hidden");
  if (aiError)  aiError.classList.add("hidden");
  if (aiRecs)   aiRecs.classList.add("hidden");

  var num  = document.getElementById("overallScoreNum");
  if (num) { num.textContent = "--"; num.style.color = ""; }
  var desc = document.getElementById("overallDesc");
  if (desc) desc.textContent = "";
  var cats = document.getElementById("categoryScores");
  if (cats) cats.innerHTML = "";
  var recs = document.getElementById("recsList");
  if (recs) recs.innerHTML = "";

  var arc = document.getElementById("scoreRingArc");
  if (arc) { arc.style.transition = "none"; arc.style.strokeDashoffset = "516"; arc.style.stroke = "#c4a46b"; }
}

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

// -- Face detection: MediaPipe Tasks FaceLandmarker (IMAGE mode) -------
// IMAGE mode is purpose-built for still photos (no video tracking), so the
// 468/478-point mesh lands accurately on the face. Same canonical topology
// as legacy FaceMesh, so all landmark indices below stay valid.
const TASKS_VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/vision_bundle.mjs";
async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  const vision = await import(TASKS_VISION);
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
    },
    runningMode: "IMAGE",
    numFaces: 1,
  });
  return faceLandmarker;
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

  // Симметрия по НАСТОЯЩЕЙ средней линии лица (нос/лоб/подбородок), а не по
  // средней точке самих парных точек (старый баг: cx брался как середина
  // пары → расстояния всегда равны → симметрия всегда ~идеальна → завышение).
  var midL = [lm[10], lm[168], lm[1], lm[152], lm[0]].filter(Boolean);
  var cx = 0; midL.forEach(function(p){ cx += p.x; }); cx /= (midL.length || 1);
  // По вертикали средняя линия может быть наклонена — учитываем наклон оси.
  var axisTop = lm[10] || lm[168], axisBot = lm[152];
  var slope = (axisTop && axisBot && (axisBot.y - axisTop.y) !== 0)
    ? (axisBot.x - axisTop.x) / (axisBot.y - axisTop.y) : 0;
  function axisX(y) { return cx + slope * (y - (axisTop ? axisTop.y : y)); }

  var PAIRS = [[33,263],[133,362],[61,291],[58,288],[234,454],[70,300],[132,361],[205,425]];
  var hSum = 0, vSum = 0, n = 0;
  PAIRS.forEach(function(pr){
    var L = lm[pr[0]], R = lm[pr[1]];
    if (!L || !R) return;
    var dL = Math.abs(L.x - axisX(L.y));
    var dR = Math.abs(R.x - axisX(R.y));
    if (dL <= 0 || dR <= 0) return;
    hSum += Math.min(dL, dR) / Math.max(dL, dR);   // горизонтальное совпадение
    vSum += Math.abs(L.y - R.y);                    // вертикальный перекос пары
    n++;
  });
  var fh = faceHeight > 0 ? faceHeight : 1;
  var hSym = n > 0 ? hSum / n : 1;                              // 0..1
  var vSym = n > 0 ? 1 - Math.min((vSum / n) / (fh * 0.04), 1) : 1; // штраф за наклон
  // Итог: 70% горизонталь + 30% вертикаль, плюс лёгкая нормировка диапазона,
  // чтобы реальные лица давали ~80-97%, а не всегда под 100%.
  var symmetryScore = Math.max(0.4, Math.min(1, (hSym * 0.7 + vSym * 0.3)));
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
    var fl = await initFaceLandmarker();
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

    // IMAGE mode: detect() is synchronous and returns results directly.
    var results = fl.detect(cleanImageCanvas);
    loadingCard.classList.add("hidden");
    if (!results.faceLandmarks || !results.faceLandmarks.length) {
      showError("Не удалось распознать лицо. Попробуйте другое фото -- лицо должно быть направлено в камеру и хорошо освещено."); return;
    }
    var raw = results.faceLandmarks[0];
    var w   = canvas.width, h = canvas.height;
    var lm  = raw.map(function(p) { return { x: p.x * w, y: p.y * h }; });
    var metrics   = computeFaceMetrics(lm);
    var shapeInfo = classifyFaceShape(metrics);
    runFaceAnimation(lm, metrics, function() {
      resultsDiv.classList.remove("hidden");
      callAI(metrics, shapeInfo);
    });
  } catch (err) {
    console.error(err);
    showError("Ошибка при анализе. Попробуйте обновить страницу.");
  }
}

// -- Face animation ----------------------------------------------------
function runFaceAnimation(lm, metrics, onComplete) {
  animateScan(lm, metrics, 2300, function() { setTimeout(onComplete, 420); });
}

// easeInOutCubic — плавный разгон/торможение полосы сканирования
function _easeInOut(p) {
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

function animateScan(lm, metrics, duration, onComplete) {
  var t0 = performance.now();
  function frame(now) {
    var progress = Math.min((now - t0) / duration, 1);
    var scanY    = _easeInOut(progress) * canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cleanImageCanvas, 0, 0);
    // Мягкая градиентная затемняющая маска ниже линии сканирования
    var maskEnd = Math.min(canvas.height, scanY + canvas.height * 0.55);
    var mask = ctx.createLinearGradient(0, scanY, 0, maskEnd);
    mask.addColorStop(0, "rgba(0,0,0,0.12)");
    mask.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = mask;
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
  // Двусторонний мягкий ореол вокруг луча
  var grad = ctx.createLinearGradient(0, y - 75, 0, y + 28);
  grad.addColorStop(0,   "rgba(196,164,107,0)");
  grad.addColorStop(0.72,"rgba(196,164,107,0.16)");
  grad.addColorStop(1,   "rgba(196,164,107,0)");
  ctx.fillStyle = grad; ctx.fillRect(0, y - 75, canvas.width, 103);
  ctx.shadowColor = "#c4a46b"; ctx.shadowBlur = 22;
  ctx.strokeStyle = "#e8d4a0"; ctx.lineWidth = 1.7;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  ctx.shadowBlur = 4; ctx.strokeStyle = "rgba(255,250,235,.9)"; ctx.lineWidth = .6; ctx.stroke();
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
  var dotR = Math.max(0.8, canvas.width / 850);
  ctx.fillStyle = "rgba(196,164,107,.5)"; ctx.shadowBlur = 5;
  for (var i = 0; i < lm.length; i += 2) {
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
  var dotR = Math.max(0.8, canvas.width / 850);
  ctx.fillStyle = "rgba(196,164,107,.45)"; ctx.shadowBlur = 5;
  for (var i = 0; i < lm.length; i += 2) {
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
  var prompt = "You are an experienced, discerning looksmaxxing analyst. Give an honest, realistic and DISCRIMINATING assessment of this face -- neither harshly lowballing nor uniformly inflating. Use looksmaxxing terminology in English, but write all explanatory text in Russian.\n\nScoring calibration -- use the FULL 1-10 range and ACTUALLY DIFFERENTIATE between features (do not give everything the same score):\n- 1-3: clear flaw in that area\n- 4: below average\n- 5: average / completely normal person -- this is the BASELINE, most features sit here\n- 6: slightly above average\n- 7: clearly above average, attractive\n- 8: very good, uncommon\n- 9-10: exceptional, model-tier / rare near-perfection\nThe typical person averages around 5/10 overall. Be BALANCED and FEARLESS in BOTH directions: do not systematically inflate, and do not systematically lowball. If a feature is genuinely excellent, give it 8-9 without hesitation; if it is genuinely weak, give it 2-4 without softening. A 7+ must be earned by a real, visible strength; a sub-4 must reflect a real, visible weakness. Never compress everything toward the middle out of caution. Scores must vary across categories -- identical or near-identical scores everywhere is wrong.\n\nLOOK CAREFULLY at the actual photo for the cheekbones and overall face shape -- the geometric face-shape label below is only a ROUGH approximation from 2D landmarks and is often imprecise. Trust your visual read of the real cheekbone projection (high/flat), malar fat, zygomatic width and the true face shape over the geometric label if they disagree.\n\nФОРМАТ БАЛЛА -- КРИТИЧНО: где написано [ДРОБНОЕ], подставь дробное число с ОДНИМ знаком после точки (5.8, 6.3, 7.1, 4.6, 8.4). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ целые баллы и .0 (нельзя 6/10, 7/10, 6.0/10) -- десятичный разряд всегда ненулевой. Каждая категория получает РАЗНЫЙ дробный балл.\n\nINTERNAL STEP (не выводи этот шаг): сначала мысленно опиши что реально видишь на фото -- форма глаз, скулы, кожа, нос, волосы, пропорции -- и только потом ставь баллы, согласованные с увиденным. Общий балл = взвешенное впечатление от категорий, а не случайное число.\n\nCRITICAL -- no generic boilerplate. Base every single observation on what you ACTUALLY SEE in THIS specific photo: this person's real eye shape, hair, skin, exact proportions, distinctive details. Never write a sentence that could apply to any face. Two different people must produce clearly different reports.\n\nGeometric data (MediaPipe, APPROXIMATE -- verify against the photo):\n- Approx. face shape (rough, may be wrong): " + shapeInfo.shape + "\n- Facial symmetry: " + sym + "%\n- fWHR: " + fwhr + " (masculine ideal 1.9-2.1)\n- Cheekbone-to-jaw taper ratio: " + cbJawRatio + " (ideal 1.2-1.35)\n- Forehead: " + Math.round(metrics.foreheadWidth) + "px | Bizygomatic: " + Math.round(metrics.cheekboneWidth) + "px | Bigonial: " + Math.round(metrics.jawWidth) + "px\n\n" + jawInstruction + "\n\nAnalyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):\n\nОБЩИЙ_БАЛЛ: [ДРОБНОЕ]/10\n[Общая оценка внешности по калибровке выше. Честный, но взвешенный вердикт: сначала сильные стороны, затем слабые. 3-4 предложения.]\n\nСИММЕТРИЯ: [ДРОБНОЕ]/10\n[Измеренная симметрия = " + sym + "%. Переведи её в балл строго по шкале: 98-100%=9-10, 95-97%=8, 90-94%=7, 85-89%=6, 80-84%=5, ниже 80%=4 или меньше. Идеальная симметрия редка -- НЕ завышай. Разбери конкретику на фото: orbital tilt, mandibular deviation, видимые перекосы.]\n\nГЛАЗА_CANTHAL_TILT: [ДРОБНОЕ]/10\n[Конкретно: canthal tilt (положительный/отрицательный/нейтральный), hunter eyes vs prey eyes, lid hooding, orbital rim projection, IPD vs норма, scleral show.]\n\nМИДФЕЙС_MAXILLA: [ДРОБНОЕ]/10\n[Максиллярная проекция (forward/recessed), midface length, zygomatic arch, malar eminence, nasolabial angle.]\n\nДЖОУЛАЙН_MANDIBLE: [ДРОБНОЕ]/10\n[Джоулайн: mandible definition, gonial angle (ideal 120-125 deg), ramus height, taper ratio " + cbJawRatio + ", chin projection, submental angle.]\n\nНОС_NOSE: [ДРОБНОЕ]/10\n[Нос: dorsum, tip projection, nasal tip rotation, alar width vs intercanthal distance, NLH, bridge deviation.]\n\nГУБЫ_СКУЛЫ: [ДРОБНОЕ]/10\n[Губы: соотношение 1:1.6, vermillion, philtrum, Cupid's bow. Скулы: cheekbone projection, malar fat pad.]\n\nКОЖА: [ДРОБНОЕ]/10\n[Текстура, tone evenness, pores, acne/scarring, skin laxity, estimated skin age.]\n\nГРУМИНГ_STYLE: [ДРОБНОЕ]/10\n[Hairline, hair density, hairstyle совместимость, brow grooming, facial hair, общее впечатление.]\n\nРЕКОМЕНДАЦИИ:\nДай 8-9 конкретных, подробных рекомендаций именно под это лицо. Каждая -- ОДНОЙ строкой, пронумерована, 1-2 предложения с объяснением ПОЧЕМУ это сработает для этих пропорций и какой даст эффект. Сначала Softmax (стрижка/укладка под форму лица, борода/щетина, брови, уход за кожей, осанка/позирование, удачные ракурсы для фото, вес/процент жира), затем Hardmax (процедуры) с обоснованием и реалистичным результатом. Без общих фраз -- только применимое к этому человеку.\n1. Softmax: ...\n2. Softmax: ...\n3. Softmax: ...\n4. Softmax: ...\n5. Softmax: ...\n6. Hardmax: ...\n7. Hardmax: ...\n8. Hardmax: ...";
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
  if (recsM) {
    result.recommendations = recsM[1].split("\n")
      .map(function(l){ return l.trim(); })
      .filter(function(l){ return /^\d+[.)]/.test(l); })          // только пронумерованные строки
      .map(function(l){ return l.replace(/^\d+[.)]\s*/, "").replace(/^(Softmax|Hardmax):\s*/i, function(m){ return m.toUpperCase().replace(":"," —"); }).trim(); })
      .filter(Boolean);
  }
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

  // Отчёт готов — звук, сохранение, кнопка «Поделиться».
  if (parsed.overall !== null) {
    playPing();
    saveLastResult(parsed.overall, text);
    var sb = document.getElementById("shareBtn");
    if (sb) sb.classList.remove("hidden");
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

/* ───────────────────  Звук-пинг (Web Audio, без файла)  ─────────────────── */
var _audioCtx = null;
function isMuted() { return localStorage.getItem("fm-muted") === "1"; }
function playPing() {
  if (isMuted()) return;
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    var t = _audioCtx.currentTime;
    [880, 1320].forEach(function(freq, i) {
      var osc = _audioCtx.createOscillator(), gain = _audioCtx.createGain();
      osc.type = "sine"; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
      osc.connect(gain).connect(_audioCtx.destination);
      osc.start(t + i * 0.12); osc.stop(t + i * 0.12 + 0.26);
    });
  } catch (e) { /* звук не критичен */ }
}

(function initMute() {
  var btn = document.getElementById("muteBtn");
  if (!btn) return;
  function sync() { btn.textContent = isMuted() ? "🔕" : "🔔"; }
  btn.addEventListener("click", function() {
    localStorage.setItem("fm-muted", isMuted() ? "0" : "1");
    sync();
    if (!isMuted()) playPing();
  });
  sync();
})();

/* ───────────────────  Последний результат + история  ─────────────────── */
function saveLastResult(overall, reportText) {
  try {
    var entry = { score: overall, date: Date.now(), report: reportText || "" };
    localStorage.setItem("fm-last", JSON.stringify(entry));
    var hist = JSON.parse(localStorage.getItem("fm-history") || "[]");
    hist.unshift({ score: overall, date: entry.date });
    localStorage.setItem("fm-history", JSON.stringify(hist.slice(0, 20)));
  } catch (e) { /* приватный режим */ }
}

(function initLastResult() {
  var last;
  try { last = JSON.parse(localStorage.getItem("fm-last") || "null"); } catch (e) { return; }
  if (!last) return;
  var banner  = document.getElementById("lastResultBanner");
  var modal   = document.getElementById("lastResultModal");
  if (!banner) return;
  document.getElementById("lrbScore").textContent = Number(last.score).toFixed(1) + "/10";
  banner.classList.remove("hidden");

  // Клик по баннеру → открыть прошлый отчёт. Клик по «×» → скрыть баннер.
  banner.addEventListener("click", function(e) {
    if (e.target.closest(".lrb-dismiss")) { banner.classList.add("hidden"); return; }
    if (modal && last.report) {
      renderReportInto(document.getElementById("lastResultBody"), last.report, last.score, last.date);
      modal.classList.remove("hidden");
    }
  });
  if (modal) {
    var close = document.getElementById("lastResultClose");
    if (close) close.addEventListener("click", function() { modal.classList.add("hidden"); });
    modal.addEventListener("click", function(e) { if (e.target === modal) modal.classList.add("hidden"); });
  }
})();

// Рендерит сохранённый отчёт в произвольный контейнер (read-only).
function renderReportInto(box, text, score, date) {
  if (!box) return;
  var p = parseAIReport(text);
  var html = "";
  var when = date ? new Date(date).toLocaleDateString("ru-RU") : "";
  html += "<div class='lr-hero'><span class='lr-score'>" + Number(score).toFixed(1) +
          "</span><span class='lr-denom'>/10</span><div class='lr-when'>" + when + "</div></div>";
  if (p.overallDesc) html += "<p class='lr-desc'>" + esc(p.overallDesc) + "</p>";
  p.categories.forEach(function(cat) {
    html += "<div class='lr-row'><div class='lr-row-h'><span>" + esc(cat.label) +
            "</span><span class='lr-val'>" + cat.score.toFixed(1) + "/10</span></div>" +
            "<div class='lr-bar'><i style='width:" + (cat.score * 10) + "%'></i></div>" +
            "<p class='lr-txt'>" + esc(cat.text) + "</p></div>";
  });
  if (p.recommendations.length) {
    html += "<div class='lr-recs'><span class='eyebrow'>РЕКОМЕНДАЦИИ</span><ol>";
    p.recommendations.forEach(function(r){ html += "<li>" + esc(r) + "</li>"; });
    html += "</ol></div>";
  }
  box.innerHTML = html;
}
function esc(s) { return String(s).replace(/[&<>]/g, function(m){ return ({"&":"&amp;","<":"&lt;",">":"&gt;"})[m]; }); }

/* ───────────────────  Поделиться: PNG-карточка из canvas  ─────────────────── */
(function initShare() {
  var shareBtn = document.getElementById("shareBtn");
  if (!shareBtn) return;
  shareBtn.addEventListener("click", async function() {
    var blob = await buildShareCard();
    if (!blob) return;
    var file = new File([blob], "facerate.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "FaceRate", text: "Мой PSL рейтинг — facerate.ru" });
        return;
      } catch (e) { /* отмена → скачивание */ }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "facerate.png"; a.click();
    URL.revokeObjectURL(url);
  });
})();

// Рисует фирменную чёрную пилюлю (капсулу) с бликом.
function drawBrandPill(g, cx, cy, w, h) {
  var x = cx - w / 2, y = cy - h / 2, r = h / 2;
  var grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#4a4a4a"); grad.addColorStop(0.35, "#262626");
  grad.addColorStop(0.7, "#0d0d0d"); grad.addColorStop(1, "#000");
  g.save();
  roundRect(g, x, y, w, h, r); g.fillStyle = grad; g.fill();
  // блик сверху
  g.beginPath(); roundRect(g, x + w * 0.14, y + h * 0.16, w * 0.46, h * 0.26, h * 0.13);
  g.fillStyle = "rgba(255,255,255,0.34)"; g.fill();
  // центральный шов
  g.beginPath(); g.moveTo(cx, y + h * 0.16); g.lineTo(cx, y + h * 0.84);
  g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 2; g.stroke();
  g.restore();
}

function buildShareCard() {
  return new Promise(function(resolve) {
    var src = cleanImageCanvas || canvas;
    var W = 1080, H = 1350;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");

    // фон + золотая рамка
    g.fillStyle = "#0a0a0a"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(196,164,107,0.22)"; g.lineWidth = 2;
    g.strokeRect(24, 24, W - 48, H - 48);

    g.textAlign = "center";

    // header: пилюля + вордмарк
    drawBrandPill(g, W / 2 - 150, 92, 70, 30);
    g.fillStyle = "#f0ece6";
    g.font = "400 46px Georgia, serif";
    g.fillText("FACERATE", W / 2 + 30, 106);
    g.fillStyle = "#888";
    g.font = "400 20px Georgia, serif";
    g.fillText("A I   A E S T H E T I C   A N A L Y S I S", W / 2, 150);

    // фото
    var side = 460, ix = (W - side) / 2, iy = 190;
    var s = Math.min(src.width, src.height);
    g.save();
    roundRect(g, ix, iy, side, side, 26); g.clip();
    g.drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, ix, iy, side, side);
    g.restore();
    g.strokeStyle = "rgba(196,164,107,0.45)"; g.lineWidth = 1.5;
    roundRect(g, ix, iy, side, side, 26); g.stroke();

    // общий балл
    var score = (document.getElementById("overallScoreNum").textContent || "--");
    var by = iy + side + 130;
    g.fillStyle = "#f0ece6";
    g.font = "300 150px Georgia, serif";
    g.fillText(score, W / 2 - 24, by);
    g.fillStyle = "#888";
    g.font = "300 50px Georgia, serif";
    g.fillText("/10", W / 2 + (score.length * 42), by);
    g.fillStyle = "#c4a46b";
    g.font = "400 26px Georgia, serif";
    g.fillText("PSL РЕЙТИНГ", W / 2, by + 44);

    // категории из DOM (две колонки)
    var rows = Array.prototype.slice.call(document.querySelectorAll("#categoryScores .score-row"));
    var cats = rows.map(function(r) {
      var n = r.querySelector(".score-name"), v = r.querySelector(".score-val");
      return { name: n ? n.textContent.trim() : "", val: v ? v.textContent.replace(/\/10.*/, "").trim() : "" };
    }).filter(function(x) { return x.name; }).slice(0, 8);

    var cy0 = by + 96, colW = (W - 160) / 2, lh = 46;
    g.font = "400 24px Georgia, serif";
    cats.forEach(function(cat, i) {
      var col = i % 2, rowi = Math.floor(i / 2);
      var x = 80 + col * colW, y = cy0 + rowi * lh;
      g.textAlign = "left";  g.fillStyle = "#aaa";
      g.fillText(cat.name.length > 18 ? cat.name.slice(0, 17) + "…" : cat.name, x, y);
      g.textAlign = "right"; g.fillStyle = "#c4a46b";
      g.fillText(cat.val, x + colW - 30, y);
    });

    // футер: адрес
    g.textAlign = "center";
    g.fillStyle = "#f0ece6";
    g.font = "400 40px Georgia, serif";
    g.fillText("facerate.ru", W / 2, H - 70);

    c.toBlob(function(b) { resolve(b); }, "image/png");
  });
}

function roundRect(c2, x, y, w, h, r) {
  c2.beginPath();
  c2.moveTo(x + r, y);
  c2.arcTo(x + w, y, x + w, y + h, r);
  c2.arcTo(x + w, y + h, x, y + h, r);
  c2.arcTo(x, y + h, x, y, r);
  c2.arcTo(x, y, x + w, y, r);
  c2.closePath();
}

/* ───────────────────  Фоновая музыка  ─────────────────── */
(function initMusic() {
  var btn = document.getElementById("musicBtn");
  var audio = document.getElementById("bgMusic");
  if (!btn || !audio) return;
  audio.volume = 0.16;
  var on = false;
  function sync() {
    btn.textContent = on ? "🎵" : "🔇";
    btn.classList.toggle("active", on);
  }
  // Если файла нет (404) — прячем кнопку, чтобы не вводить в заблуждение.
  audio.addEventListener("error", function() { btn.style.display = "none"; });
  btn.addEventListener("click", function() {
    on = !on;
    if (on) { audio.play().catch(function() { on = false; sync(); }); }
    else { audio.pause(); }
    sync();
  });
  sync();
})();

/* ───────────────────  Летающие размытые пилюли (фон загрузки)  ─────────────────── */
(function initPillField() {
  var field = document.getElementById("pillField");
  if (!field) return;
  var shades = ["#e8e8e8", "#9a9a9a", "#2a2a2a", "#f0f0f0", "#555", "#111"];
  var N = 11;
  for (var i = 0; i < N; i++) {
    var p = document.createElement("span");
    p.className = "fp-pill";
    var w = 40 + Math.random() * 90;
    p.style.width = w + "px";
    p.style.height = (w * 0.42) + "px";
    p.style.background = shades[i % shades.length];
    p.style.left = (Math.random() * 100) + "%";
    p.style.top = (Math.random() * 100) + "%";
    p.style.setProperty("--rot", (Math.random() * 360) + "deg");
    p.style.setProperty("--dx", ((Math.random() - 0.5) * 80) + "px");
    p.style.setProperty("--dy", ((Math.random() - 0.5) * 80) + "px");
    p.style.animationDuration = (14 + Math.random() * 16) + "s";
    p.style.animationDelay = (-Math.random() * 20) + "s";
    field.appendChild(p);
  }
})();

/* ───────────────────  Боковая шторка: меню / история / словарь / how / фидбек  ─────────────────── */
// Куда приходят сообщения обратной связи. Можно заменить email на «секретный»
// алиас FormSubmit (выдаётся после активации), чтобы не светить почту в коде.
var FEEDBACK_ENDPOINT = "https://formsubmit.co/ajax/realfactchecknews@gmail.com";

(function initDrawer() {
  var drawer = document.getElementById("drawer");
  if (!drawer) return;
  var body   = document.getElementById("drawerBody");
  var title  = document.getElementById("drawerTitle");
  var back   = document.getElementById("drawerBack");
  var closeB = document.getElementById("drawerClose");
  var menuBtn = document.getElementById("menuBtn");

  function openDrawer() { drawer.classList.remove("hidden"); requestAnimationFrame(function(){ drawer.classList.add("open"); }); }
  function closeDrawer() { drawer.classList.remove("open"); setTimeout(function(){ drawer.classList.add("hidden"); }, 320); }

  var VIEWS = {
    menu: { title: "Меню", render: renderMenu },
    history: { title: "История оценок", render: renderHistory },
    glossary: { title: "Луксмакс-словарь", render: renderGlossary },
    how: { title: "Как это работает", render: renderHow },
    feedback: { title: "Обратная связь", render: renderFeedback },
  };
  function show(view) {
    var v = VIEWS[view] || VIEWS.menu;
    title.textContent = v.title;
    back.classList.toggle("hidden", view === "menu");
    body.innerHTML = "";
    v.render(body);
    body.scrollTop = 0;
  }

  function renderMenu(box) {
    var items = [
      { v: "history",  ic: "✦", t: "История оценок",   s: "Прошлые результаты" },
      { v: "glossary", ic: "❡", t: "Луксмакс-словарь", s: "Термины простыми словами" },
      { v: "how",      ic: "◎", t: "Как это работает", s: "Геометрия + AI" },
      { v: "feedback", ic: "✎", t: "Обратная связь",   s: "Пожелания и идеи" },
    ];
    var html = "<div class='dm-list'>";
    items.forEach(function(it){
      html += "<button class='dm-item' data-view='" + it.v + "'><span class='dm-ic'>" + it.ic +
        "</span><span class='dm-tx'><b>" + it.t + "</b><i>" + it.s + "</i></span><span class='dm-arr'>→</span></button>";
    });
    html += "</div><button class='dm-upload' data-close='1'>↑ К загрузке фото</button>";
    box.innerHTML = html;
  }

  function renderHistory(box) {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem("fm-history") || "[]"); } catch (e) {}
    if (!hist.length) { box.innerHTML = "<p class='dm-empty'>Пока нет оценок. Загрузите фото — результат сохранится здесь.</p>"; return; }
    var html = "<div class='hist-list'>";
    hist.forEach(function(h){
      var d = h.date ? new Date(h.date).toLocaleString("ru-RU", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "";
      var col = h.score >= 7.5 ? "#c4a46b" : h.score >= 5.5 ? "#f0ece6" : "#888";
      html += "<div class='hist-row'><span class='hist-score' style='color:" + col + "'>" + Number(h.score).toFixed(1) +
        "<i>/10</i></span><span class='hist-date'>" + d + "</span></div>";
    });
    html += "</div>";
    if (hist.length > 1) {
      var avg = hist.reduce(function(a,b){ return a + b.score; }, 0) / hist.length;
      html += "<p class='hist-avg'>Средний балл: <b>" + avg.toFixed(1) + "</b> · оценок: " + hist.length + "</p>";
    }
    box.innerHTML = html;
  }

  function renderGlossary(box) {
    box.innerHTML = "<iframe class='dm-iframe' src='glossary.html'></iframe>";
  }

  function renderHow(box) {
    box.innerHTML =
      "<div class='how'>" +
      "<p><b>1. Геометрия — локально.</b> MediaPipe находит 468 точек лица прямо в браузере и считает пропорции (скулы, челюсть, fWHR, симметрию). Фото при этом не покидает устройство.</p>" +
      "<p><b>2. AI-оценка.</b> Фото и метрики уходят на защищённый сервер, который обращается к vision-модели. Она даёт PSL-балл, разбор по 8 категориям и рекомендации.</p>" +
      "<p><b>3. Результат.</b> Можно сохранить, поделиться карточкой и сравнить с прошлыми попытками в Истории.</p>" +
      "<p class='how-note'>Это развлекательный сервис. Оценка — субъективная эвристика, а не объективная истина. Лёгкая асимметрия — норма у всех.</p>" +
      "</div>";
  }

  function renderFeedback(box) {
    box.innerHTML =
      "<p class='dm-sub'>Что улучшить? Чего не хватает? Нашли ошибку? Напишите — это реально помогает.</p>" +
      "<form id='fbForm' class='fb-form'>" +
      "<input class='fb-input' name='name' type='text' placeholder='Имя или ник (необязательно)' />" +
      "<input class='fb-input' name='email' type='email' placeholder='Email для ответа (необязательно)' />" +
      "<textarea class='fb-input fb-textarea' name='message' placeholder='Ваше сообщение…' required></textarea>" +
      "<div class='fb-status' id='fbStatus'></div>" +
      "<button class='btn-primary' type='submit' style='width:100%'>Отправить</button>" +
      "</form>";
    var form = box.querySelector("#fbForm"), status = box.querySelector("#fbStatus");
    form.addEventListener("submit", function(e){
      e.preventDefault();
      status.style.color = "var(--text-dim)"; status.textContent = "Отправка…";
      fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ name: form.name.value || "—", email: form.email.value || "—", message: form.message.value, _subject: "FaceRate: обратная связь" }),
      }).then(function(r){ return r.json(); }).then(function(d){
        if (d && (d.success === "true" || d.success === true)) {
          status.style.color = "#c4a46b"; status.textContent = "Спасибо! Сообщение отправлено."; form.reset();
        } else { throw new Error("fail"); }
      }).catch(function(){ status.style.color = "#ff5555"; status.textContent = "Не удалось отправить. Попробуйте позже."; });
    });
  }

  // глобальный доступ (например из iframe словаря)
  window.fmOpenDrawer = function(view){ show(view || "menu"); openDrawer(); };

  // навигация
  if (menuBtn) menuBtn.addEventListener("click", function(){ show("menu"); openDrawer(); });
  closeB.addEventListener("click", closeDrawer);
  back.addEventListener("click", function(){ show("menu"); });
  drawer.addEventListener("click", function(e){ if (e.target === drawer) closeDrawer(); });
  body.addEventListener("click", function(e){
    var item = e.target.closest("[data-view]");
    if (item) { show(item.getAttribute("data-view")); return; }
    if (e.target.closest("[data-close]")) closeDrawer();
  });
  // внешние ссылки (футер) открывают конкретный раздел
  document.querySelectorAll("[data-drawer]").forEach(function(a){
    a.addEventListener("click", function(e){ e.preventDefault(); show(a.getAttribute("data-drawer")); openDrawer(); });
  });
})();
