const WORKER_URL = "https://face-metrics-ai.realfactchecknews.workers.dev";

// MediaPipe Face Mesh connection groups
const FACE_OVAL  = [[10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10]]];
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
  "Positive canthal tilt → hunter eyes. The most sought-after eye shape in looksmaxxing — signals dominance and sexual dimorphism.",
  "fWHR 1.9–2.1: optimal facial width-to-height ratio. Correlates with perceived dominance and masculine structure.",
  "Facial symmetry above 90% is present in fewer than 4% of the global population. Every percentage point counts.",
  "Ideal gonial angle 120–125° defines a sharp, well-defined mandible. Too acute looks harsh; too obtuse — recessed.",
  "Forward maxillary projection creates midface harmony, optimal lip support, and prevents the hollow under-eye look.",
  "Bizygomatic-to-bigonial taper ratio 1.2–1.35 signals superior facial structure — wide cheekbones, tapered jaw.",
  "Interpupillary distance 62–65mm is the ideal orbital spacing. Too wide or too narrow alters face perception significantly.",
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
  "LM:468","SYM:0.918","fWHR:1.847","CANT:+2.1°","NPC:0.726",
  "CBR:1.314","IPD:63.2mm","PSL:pending","GAN:124.3°","NLA:91°",
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

// ── Landing sequence ─────────────────────────────────────────────────────
function startLanding() {
  const el = document.getElementById("landingSection");
  if (!el) return;
  el.classList.add("landing-visible");
  setTimeout(countUpStats, 200);
  setTimeout(() => {
    typeWriter(document.getElementById("landQuote"), "“Every measurement tells a story.”", 38);
  }, 500);
  setTimeout(() => {
    showFact(0);
    factTimer = setInterval(() => {
      factIdx = (factIdx + 1) % FACTS.length;
      showFact(factIdx);
    }, 4200);
  }, 1400);
}

function countUpStats() {
  document.querySelectorAll(".lst-num[data-target]").forEach(el => {
    const target    = parseFloat(el.dataset.target);
    const isDecimal = el.dataset.decimal === "1";
    const suffix    = el.dataset.suffix || "";
    const duration  = 1500;
    const t0        = performance.now();
    function tick(now) {
      const p = Math.min((now - t0) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
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
  let i = 0; el.textContent = "";
  (function tick() {
    if (i < text.length) { el.textContent += text[i++]; setTimeout(tick, speed); }
  })();
}

function showFact(idx) {
  const el = document.getElementById("landFact");
  if (!el) return;
  el.classList.remove("fact-in");
  setTimeout(() => { el.textContent = FACTS[idx]; el.classList.add("fact-in"); }, 320);
}

function transitionToAnalysis() {
  if (factTimer) clearInterval(factTimer);
  const el = document.getElementById("landingSection");
  if (!el) return;
  el.classList.add("landing-exit");
  el.addEventListener("transitionend", () => {
    el.remove();
    document.body.classList.add("post-landing");
  }, { once: true });
}

// ── Bootstrap ──────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("introOverlay");
  if (overlay) {
    setTimeout(() => {
      overlay.classList.add("intro-exit");
      overlay.addEventListener("transitionend", () => {
        overlay.remove();
        startLanding();
      }, { once: true });
    }, 2800);
  } else {
    startLanding();
  }
  const beginBtn = document.getElementById("beginBtn");
  if (beginBtn) beginBtn.addEventListener("click", transitionToAnalysis);
});

// ── Upload: front photo ────────────────────────────────────────────────
chooseFileBtn.addEventListener("click", e => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener("change", e => { if (e.target.files[0]) loadFrontFile(e.target.files[0]); });
frontArea.addEventListener("click", () => { if (!frontImg) fileInput.click(); });
["dragover","dragenter"].forEach(evt => frontArea.addEventListener(evt, e => { e.preventDefault(); frontArea.classList.add("dragover"); }));
["dragleave","drop"].forEach(evt    => frontArea.addEventListener(evt, e => { e.preventDefault(); frontArea.classList.remove("dragover"); }));
frontArea.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) loadFrontFile(f); });

document.getElementById("frontRemove").addEventListener("click", e => {
  e.stopPropagation();
  frontImg = null;
  document.getElementById("frontThumb").classList.add("hidden");
  document.getElementById("frontPlaceholder").classList.remove("hidden");
  analyzeBtn.classList.add("hidden");
  fileInput.value = "";
});

function loadFrontFile(file) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
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

// ── Upload: side profile photo ───────────────────────────────────────────
chooseSideBtn.addEventListener("click", e => { e.stopPropagation(); sideInput.click(); });
sideInput.addEventListener("change", e => { if (e.target.files[0]) loadSideFile(e.target.files[0]); });
sideArea.addEventListener("click", () => { if (!sideImg) sideInput.click(); });
["dragover","dragenter"].forEach(evt => sideArea.addEventListener(evt, e => { e.preventDefault(); sideArea.classList.add("dragover"); }));
["dragleave","drop"].forEach(evt    => sideArea.addEventListener(evt, e => { e.preventDefault(); sideArea.classList.remove("dragover"); }));
sideArea.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) loadSideFile(f); });

document.getElementById("sideRemove").addEventListener("click", e => {
  e.stopPropagation();
  sideImg = null;
  document.getElementById("sideThumb").classList.add("hidden");
  document.getElementById("sidePlaceholder").classList.remove("hidden");
  sideInput.value = "";
});

function loadSideFile(file) {
  if (!file.type.startsWith("image/")) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      sideImg = img;
      document.getElementById("sideThumbImg").src = ev.target.result;
      document.getElementById("sidePlaceholder").classList.add("hidden");
      document.getElementById("sideThumb").classList.remove("hidden");
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Analyze ──────────────────────────────────────────────────────────────
analyzeBtn.addEventListener("click", () => {
  if (!frontImg) return;
  errorBox.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  loadingCard.classList.remove("hidden");
  processImage(frontImg, sideImg);
});

resetBtn.addEventListener("click", () => {
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

// ── AI HUD animation ────────────────────────────────────────────────────
function startAIHUD(hasSide) {
  const card      = document.getElementById("aiLoading");
  const phaseEl   = document.getElementById("hudPhase");
  const fillEl    = document.getElementById("hudBarFill");
  const pctEl     = document.getElementById("hudBarPct");
  const streamEl  = document.getElementById("hudStream");
  const sideLabel = document.getElementById("hudSideLabel");

  card.classList.remove("hidden");
  streamEl.innerHTML = "";
  sideLabel.textContent = hasSide ? "+ PROFILE" : "";
  sideLabel.style.display = hasSide ? "" : "none";

  fillEl.style.transition = "none";
  fillEl.style.width = "0%";
  pctEl.textContent = "0%";

  const t0 = performance.now();
  const TOTAL = 22000;

  function tickBar(now) {
    const t   = Math.min((now - t0) / TOTAL, 1);
    const pct = Math.round(t < 0.72 ? (t / 0.72) * 84 : 84 + ((t - 0.72) / 0.28) * 8);
    fillEl.style.transition = "width .8s linear";
    fillEl.style.width = pct + "%";
    pctEl.textContent  = pct + "%";
    if (pct < 92) _hudRAF = requestAnimationFrame(tickBar);
  }
  requestAnimationFrame(() => requestAnimationFrame(tickBar));

  let phaseIdx = 0;
  function nextPhase() {
    phaseEl.style.opacity = "0";
    setTimeout(() => {
      phaseEl.textContent  = AI_PHASES[phaseIdx % AI_PHASES.length];
      phaseEl.style.opacity = "1";
      const line = document.createElement("span");
      line.className = "hud-stream-line" + (Math.random() > 0.5 ? " hl" : "");
      const tok  = HUD_TOKENS[phaseIdx % HUD_TOKENS.length];
      line.textContent = `[${String(phaseIdx + 1).padStart(2, "0")}] ${AI_PHASES[phaseIdx % AI_PHASES.length]}  ${tok}`;
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
  const fillEl = document.getElementById("hudBarFill");
  const pctEl  = document.getElementById("hudBarPct");
  if (fillEl) { fillEl.style.transition = "width .3s ease"; fillEl.style.width = "100%"; }
  if (pctEl)  pctEl.textContent = "100%";
  setTimeout(() => {
    const card = document.getElementById("aiLoading");
    if (card) card.classList.add("hidden");
  }, 380);
}

// ── FaceMesh ─────────────────────────────────────────────────────────────
function initFaceMesh() {
  if (faceMesh) return faceMesh;
  faceMesh = new FaceMesh({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
  });
  faceMesh.setOptions({ maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:.5, minTrackingConfidence:.5 });
  return faceMesh;
}

// ── Process image ─────────────────────────────────────────────────────
async function processImage(img, sideImage) {
  try {
    const mesh = initFaceMesh();
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

    mesh.onResults(results => {
      loadingCard.classList.add("hidden");
      if (!results.multiFaceLandmarks || !results.multiFaceLandmarks.length) {
        showError("Не удалось распознать лицо. Попробуйте другое фото — лицо должно быть направлено в камеру и хорошо освещено."); return;
      }
      const raw = results.multiFaceLandmarks[0];
      const w   = canvas.width, h = canvas.height;
      const lm  = raw.map(p => ({ x: p.x * w, y: p.y * h }));
      const metrics   = computeFaceMetrics(lm);
      const shapeInfo = classifyFaceShape(metrics);
      runFaceAnimation(lm, metrics, () => {
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

// ── Face animation ─────────────────────────────────────────────────────
function runFaceAnimation(lm, metrics, onComplete) {
  animateScan(lm, metrics, 1400, () => setTimeout(onComplete, 400));
}

function animateScan(lm, metrics, duration, onComplete) {
  const t0 = performance.now();
  function frame(now) {
    const progress = Math.min((now - t0) / duration, 1);
    const scanY    = progress * canvas.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cleanImageCanvas, 0, 0);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(0, scanY, canvas.width, canvas.height - scanY);
    drawMeshUpTo(lm, scanY);
    drawScanLine(scanY);
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
  const grad = ctx.createLinearGradient(0, Math.max(0, y - 60), 0, y);
  grad.addColorStop(0, "rgba(196,164,107,0)"); grad.addColorStop(1, "rgba(196,164,107,0.18)");
  ctx.fillStyle = grad; ctx.fillRect(0, Math.max(0, y - 60), canvas.width, 62);
  ctx.shadowColor = "#c4a46b"; ctx.shadowBlur = 16;
  ctx.strokeStyle = "#c4a46b"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  ctx.shadowBlur = 3; ctx.strokeStyle = "rgba(255,245,210,.85)"; ctx.lineWidth = .5; ctx.stroke();
  ctx.restore();
}

function drawMeshUpTo(lm, scanY) {
  ctx.save(); ctx.shadowColor = "rgba(196,164,107,.55)"; ctx.shadowBlur = 5;
  MESH_GROUPS.forEach(({ conns, alpha, lw }) => {
    ctx.strokeStyle = `rgba(196,164,107,${alpha})`;
    ctx.lineWidth   = Math.max(.4, canvas.width / 1200 * lw);
    conns.forEach(([a, b]) => {
      const pa = lm[a], pb = lm[b];
      if (!pa || !pb || pa.y >= scanY || pb.y >= scanY) return;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  });
  const dotR = Math.max(1, canvas.width / 700);
  ctx.fillStyle = "rgba(196,164,107,.55)"; ctx.shadowBlur = 6;
  for (let i = 0; i < lm.length; i += 4) {
    if (lm[i] && lm[i].y < scanY) { ctx.beginPath(); ctx.arc(lm[i].x, lm[i].y, dotR, 0, Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

function drawFullMesh(lm) {
  ctx.save(); ctx.shadowColor = "rgba(196,164,107,.5)"; ctx.shadowBlur = 5;
  MESH_GROUPS.forEach(({ conns, alpha, lw }) => {
    ctx.strokeStyle = `rgba(196,164,107,${alpha})`;
    ctx.lineWidth   = Math.max(.4, canvas.width / 1200 * lw);
    conns.forEach(([a, b]) => {
      const pa = lm[a], pb = lm[b]; if (!pa || !pb) return;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    });
  });
  const dotR = Math.max(1, canvas.width / 700);
  ctx.fillStyle = "rgba(196,164,107,.5)"; ctx.shadowBlur = 6;
  for (let i = 0; i < lm.length; i += 4) {
    if (!lm[i]) continue;
    ctx.beginPath(); ctx.arc(lm[i].x, lm[i].y, dotR, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

function animateMeasurements(lm, metrics, onComplete) {
  const snap = document.createElement("canvas");
  snap.width = canvas.width; snap.height = canvas.height;
  snap.getContext("2d").drawImage(canvas, 0, 0);
  const t0 = performance.now(), dur = 550;
  function frame(now) {
    const alpha = Math.min((now - t0) / dur, 1);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(snap, 0, 0);
    ctx.globalAlpha = alpha;
    drawMeasurementLabels(lm, metrics);
    ctx.globalAlpha = 1;
    if (alpha < 1) requestAnimationFrame(frame); else onComplete();
  }
  requestAnimationFrame(frame);
}

function drawMeasurementLabels(lm, metrics) {
  const p   = i => lm[i];
  const fs  = Math.max(10, Math.round(canvas.width * .018));
  const lw  = Math.max(.5, canvas.width / 1400);
  const pad = canvas.width * .018;
  ctx.save();
  ctx.font = `${fs}px 'SF Mono','Cascadia Code',Consolas,monospace`;
  ctx.fillStyle = "#c4a46b"; ctx.strokeStyle = "rgba(196,164,107,.6)";
  ctx.lineWidth = lw; ctx.shadowColor = "rgba(196,164,107,.9)"; ctx.shadowBlur = 10;
  ctx.textBaseline = "middle";
  const sym  = Math.round(metrics.symmetryScore * 100);
  const fwhr = metrics.widthHeightRatio.toFixed(2);
  const lcb = p(234), rcb = p(454), ljaw = p(58), rjaw = p(288), fore = p(10);
  ctx.textAlign = "center";
  ctx.fillText(`fWHR  ${fwhr}`, canvas.width / 2, Math.max(fore.y - fs * 2.5, fs * 1.6));
  const cbY = (lcb.y + rcb.y) / 2;
  ctx.beginPath(); ctx.moveTo(lcb.x - pad, cbY); ctx.lineTo(rcb.x + pad, cbY); ctx.stroke();
  [[lcb.x - pad, cbY],[rcb.x + pad, cbY]].forEach(([bx,by]) => { ctx.beginPath(); ctx.moveTo(bx, by-4); ctx.lineTo(bx, by+4); ctx.stroke(); });
  ctx.fillText("BIZYGOMATIC", (lcb.x + rcb.x) / 2, cbY - fs * 1.3);
  const jawMidY = Math.min(Math.max(ljaw.y, rjaw.y) + fs * 1.6, canvas.height - fs);
  ctx.fillText(`SYM  ${sym}%`, (ljaw.x + rjaw.x) / 2, jawMidY);
  ctx.restore();
}

// ── AI call ────────────────────────────────────────────────────────────
async function callAI(metrics, shapeInfo) {
  const aiReport    = document.getElementById("aiReport");
  const aiError     = document.getElementById("aiError");
  const aiErrorText = document.getElementById("aiErrorText");
  const hasSide     = !!cleanSideCanvas;

  startAIHUD(hasSide);
  aiReport.classList.add("hidden");
  aiError.classList.add("hidden");

  const sym        = Math.round(metrics.symmetryScore * 100);
  const fwhr       = metrics.widthHeightRatio.toFixed(2);
  const cbJawRatio = (metrics.cheekboneWidth / metrics.jawWidth).toFixed(2);

  const jawInstruction = hasSide
    ? "A side profile photo is included on the RIGHT side of the image. Use it to accurately assess jawline definition, gonial angle, chin projection, ramus height, and nasal profile."
    : "CRITICAL: Only frontal view available — no side profile provided. For ДЖОУЛАЙН_MANDIBLE: score only what is visible frontally (bigonial width, taper, chin width from front). Add the note '— side view not provided, frontal estimate only.' Do NOT assign a jaw score above 6.0/10 based on frontal alone.";

  const prompt = `You are a brutally honest looksmaxxing analyst. Analyze this face photo in detail. Use looksmaxxing terminology in English, but write all explanatory text in Russian. Be direct and specific — no sugarcoating.

Geometric data (MediaPipe):
- Face shape: ${shapeInfo.shape}
- Facial symmetry: ${sym}%
- fWHR: ${fwhr} (masculine ideal 1.9-2.1)
- Cheekbone-to-jaw taper ratio: ${cbJawRatio} (ideal 1.2-1.35)
- Forehead: ${Math.round(metrics.foreheadWidth)}px | Bizygomatic: ${Math.round(metrics.cheekboneWidth)}px | Bigonial: ${Math.round(metrics.jawWidth)}px

${jawInstruction}

Analyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):

ОБЩИЙ_БАЛЛ: X/10
[Общий PSL рейтинг. Честный вердикт с указанием на сильные и слабые стороны. 3-4 предложения.]

СИММЕТРИЯ: X/10
[Детальный анализ: facial symmetry %, orbital tilt, mandibular deviation, влияние на внешность.]

ГЛАЗА_CANTHAL_TILT: X/10
[Конкретно: canthal tilt (положительный/отрицательный/нейтральный), hunter eyes vs prey eyes, lid hooding, orbital rim projection, IPD vs норма, scleral show.]

МИДФЕЙС_MAXILLA: X/10
[Максиллярная проекция (forward/recessed), midface length, zygomatic arch, malar eminence, nasolabial angle.]

ДЖОУЛАЙН_MANDIBLE: X/10
[Джоулайн: mandible definition, gonial angle (ideal 120-125°), ramus height, taper ratio ${cbJawRatio}, chin projection, submental angle.]

НОС_NOSE: X/10
[Нос: dorsum, tip projection, nasal tip rotation, alar width vs intercanthal distance, NLH, bridge deviation.]

ГУБЫ_СКУЛЫ: X/10
[Губы: соотношение 1:1.6, vermillion, philtrum, Cupid's bow. Скулы: cheekbone projection, malar fat pad.]

КОЖА: X/10
[Текстура, tone evenness, pores, acne/scarring, skin laxity, estimated skin age.]

ГРУМИНГ_STYLE: X/10
[Hairline, hair density, hairstyle совместимость, brow grooming, facial hair, общее впечатление.]

РЕКОМЕНДАЦИИ:
1. [Softmax: конкретный совет]
2. [Softmax: конкретный совет]
3. [Softmax: конкретный совет]
4. [Hardmax: процедура + обоснование]
5. [Hardmax: процедура + обоснование]`;

  try {
    const res = await fetch(WORKER_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt, image: canvasToBase64() })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    stopAIHUD();
    renderAIReport(data.text || "Пустой ответ.");
    aiReport.classList.remove("hidden");
  } catch (err) {
    stopAIHUD();
    aiErrorText.textContent = `Ошибка: ${err.message}`;
    aiError.classList.remove("hidden");
  }
}

// ── Image helpers ─────────────────────────────────────────────────────
function canvasToBase64(maxSize = 900) {
  if (cleanSideCanvas) {
    return compositeToBase64(cleanImageCanvas || canvas, cleanSideCanvas, maxSize);
  }
  const src   = cleanImageCanvas || canvas;
  const scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  const off   = document.createElement("canvas");
  off.width   = Math.round(src.width  * scale);
  off.height  = Math.round(src.height * scale);
  off.getContext("2d").drawImage(src, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", .75).split(",")[1];
}

function compositeToBase64(frontCvs, sideCvs, maxW = 900) {
  const h      = Math.max(frontCvs.height, sideCvs.height);
  const totalW = frontCvs.width + sideCvs.width + 4;
  const scale  = Math.min(1, maxW / totalW);
  const out    = document.createElement("canvas");
  out.width    = Math.round(totalW * scale);
  out.height   = Math.round(h      * scale);
  const c = out.getContext("2d");
  c.fillStyle = "#000";
  c.fillRect(0, 0, out.width, out.height);
  const fw = Math.round(frontCvs.width  * scale);
  const fh = Math.round(frontCvs.height * scale);
  c.drawImage(frontCvs, 0, Math.round((out.height - fh) / 2), fw, fh);
  c.strokeStyle = "rgba(196,164,107,.5)";
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(fw + 2, 0); c.lineTo(fw + 2, out.height); c.stroke();
  const sw = Math.round(sideCvs.width  * scale);
  const sh = Math.round(sideCvs.height * scale);
  c.drawImage(sideCvs, fw + 4, Math.round((out.height - sh) / 2), sw, sh);
  return out.toDataURL("image/jpeg", .75).split(",")[1];
}

// ── Report rendering ──────────────────────────────────────────────────
function parseAIReport(text) {
  const result = { overall: null, overallDesc: "", categories: [], recommendations: [] };
  const overallM = text.match(/ОБЩИЙ_БАЛЛ:\s*(\d+(?:\.\d+)?)\/10\s*\n([\s\S]*?)(?=\n[Ѐ-ӿ_A-Z]+:|$)/);
  if (overallM) { result.overall = parseFloat(overallM[1]); result.overallDesc = overallM[2].trim(); }
  const cats = [
    { key:"СИММЕТРИЯ",          label:"Симметрия" },
    { key:"ГЛАЗА_CANTHAL_TILT", label:"Canthal Tilt / Eyes" },
    { key:"МИДФЕЙС_MAXILLA",    label:"Midface / Maxilla" },
    { key:"ДЖОУЛАЙН_MANDIBLE",  label:"Jawline / Mandible" },
    { key:"НОС_NOSE",              label:"Nose" },
    { key:"ГУБЫ_СКУЛЫ",        label:"Губы / Скулы" },
    { key:"КОЖА",               label:"Skin" },
    { key:"ГРУМИНГ_STYLE",      label:"Grooming / Style" },
  ];
  cats.forEach(({ key, label }) => {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m   = text.match(new RegExp(`${esc}:\\s*(\\d+(?:\\.\\d+)?)\\/10\\s*\\n([\\s\\S]*?)(?=\\n[\\u0400-\\u04FF_A-Z]+:|$)`));
    if (m) result.categories.push({ label, score: parseFloat(m[1]), text: m[2].trim() });
  });
  const recsM = text.match(/РЕКОМЕНДАЦИИ:\s*\n([\s\S]+?)$/);
  if (recsM) result.recommendations = recsM[1].split("\n").map(l => l.replace(/^\d+\.\s*/,"").trim()).filter(Boolean);
  return result;
}

function renderAIReport(text) {
  const parsed  = parseAIReport(text);
  const scoreEl = document.getElementById("overallScoreNum");
  document.getElementById("overallDesc").textContent = parsed.overallDesc;
  if (parsed.overall !== null) animateCount(scoreEl, parsed.overall, 1600);
  else scoreEl.textContent = "—";

  const catContainer = document.getElementById("categoryScores");
  catContainer.innerHTML = "";
  if (parsed.categories.length > 0) {
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow"; eyebrow.textContent = "ДЕТАЛЬНЫЙ АНАЛИЗ";
    catContainer.appendChild(eyebrow);
    parsed.categories.forEach(({ label, score, text }, idx) => {
      const row = document.createElement("div"); row.className = "score-row";
      const header = document.createElement("div"); header.className = "score-row-header";
      header.innerHTML = `<span class="score-name">${label}</span><span class="score-val">${score.toFixed(1)}<span style="color:var(--text-dim);font-size:.75em">/10</span></span>`;
      const track = document.createElement("div"); track.className = "score-bar-track";
      const fill  = document.createElement("div"); fill.className  = "score-bar-fill"; fill.style.width = "0%";
      track.appendChild(fill);
      const desc = document.createElement("p"); desc.className = "score-text"; desc.textContent = text;
      row.appendChild(header); row.appendChild(track); row.appendChild(desc);
      catContainer.appendChild(row);
      setTimeout(() => { row.classList.add("visible"); requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = `${score*10}%`; })); }, idx * 90 + 150);
    });
  } else {
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;font-size:.85rem;color:var(--text-dim);line-height:1.7;font-family:inherit;";
    pre.textContent = text; catContainer.appendChild(pre);
  }

  const aiRecs = document.getElementById("aiRecs"), recsList = document.getElementById("recsList");
  recsList.innerHTML = "";
  if (parsed.recommendations.length > 0) {
    parsed.recommendations.forEach(rec => { const li = document.createElement("li"); li.textContent = rec; recsList.appendChild(li); });
    aiRecs.classList.remove("hidden");
  }
}

function animateCount(el, target, duration) {
  const t0 = performance.now();
  function tick(now) {
    const p = Math.min((now - t0) / duration, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (e * target).toFixed(1);
    if (p < 1) requestAnimationFrame(tick); else el.textContent = target.toFixed(1);
  }
  requestAnimationFrame(tick);
}
