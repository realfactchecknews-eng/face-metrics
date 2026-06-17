const WORKER_URL = "https://face-metrics-ai.realfactchecknews.workers.dev";

const fileInput = document.getElementById("fileInput");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const uploadArea = document.getElementById("uploadArea");
const uploadSection = document.getElementById("uploadSection");
const analysisView = document.getElementById("analysisView");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const resetBtn = document.getElementById("resetBtn");
const loadingCard = document.getElementById("loading");
const resultsDiv = document.getElementById("results");
const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");

let faceMesh = null;

function initFaceMesh() {
  if (faceMesh) return faceMesh;
  faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
  });
  faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  return faceMesh;
}

chooseFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  if (e.target.files[0]) handleFile(e.target.files[0]);
});

["dragover", "dragenter"].forEach((evt) =>
  uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((evt) =>
  uploadArea.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
  })
);
uploadArea.addEventListener("drop", (e) => {
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

resetBtn.addEventListener("click", () => {
  uploadSection.classList.remove("hidden");
  analysisView.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  loadingCard.classList.add("hidden");
  errorBox.classList.add("hidden");
  fileInput.value = "";
});

function showError(msg) {
  errorText.textContent = msg;
  errorBox.classList.remove("hidden");
  loadingCard.classList.add("hidden");
  analysisView.classList.remove("hidden");
}

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showError("Пожалуйста, загрузите файл изображения (JPG, PNG).");
    return;
  }
  errorBox.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  loadingCard.classList.remove("hidden");

  const img = new Image();
  const reader = new FileReader();
  reader.onload = (e) => {
    img.onload = () => processImage(img);
    img.onerror = () => showError("Не удалось загрузить изображение.");
    img.src = e.target.result;
  };
  reader.onerror = () => showError("Не удалось прочитать файл.");
  reader.readAsDataURL(file);
}

async function processImage(img) {
  try {
    const mesh = initFaceMesh();
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    mesh.onResults((results) => {
      loadingCard.classList.add("hidden");

      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        showError("Не удалось распознать лицо. Попробуйте другое фото — лицо должно быть направлено в камеру и хорошо освещено.");
        return;
      }

      const rawLandmarks = results.multiFaceLandmarks[0];
      const w = canvas.width, h = canvas.height;
      const landmarks = rawLandmarks.map((p) => ({ x: p.x * w, y: p.y * h }));

      drawLandmarkOverlay(landmarks);

      const metrics = computeFaceMetrics(landmarks);
      const shapeInfo = classifyFaceShape(metrics);

      resultsDiv.classList.remove("hidden");
      callAI(metrics, shapeInfo);

      rawLandmarks.length = 0;
    });

    await mesh.send({ image: canvas });
  } catch (err) {
    console.error(err);
    showError("Ошибка при анализе. Попробуйте обновить страницу.");
  }
}

function drawLandmarkOverlay(landmarks) {
  ctx.save();
  ctx.fillStyle = "rgba(240, 236, 230, 0.45)";
  landmarks.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, canvas.width / 500), 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.restore();
}

function canvasToBase64(maxSize = 640) {
  const off = document.createElement("canvas");
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  off.width = Math.round(canvas.width * scale);
  off.height = Math.round(canvas.height * scale);
  off.getContext("2d").drawImage(canvas, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", 0.75).split(",")[1];
}

async function callAI(metrics, shapeInfo) {
  const aiLoading = document.getElementById("aiLoading");
  const aiReport = document.getElementById("aiReport");
  const aiError = document.getElementById("aiError");
  const aiErrorText = document.getElementById("aiErrorText");

  aiLoading.classList.remove("hidden");
  aiReport.classList.add("hidden");
  aiError.classList.add("hidden");

  const sym = Math.round(metrics.symmetryScore * 100);
  const fwhr = metrics.widthHeightRatio.toFixed(2);
  const cbJawRatio = (metrics.cheekboneWidth / metrics.jawWidth).toFixed(2);

  const prompt = `You are a brutally honest looksmaxxing analyst. Analyze this face photo in detail. Use looksmaxxing terminology in English, but write all explanatory text in Russian. Be direct and specific — no sugarcoating.

Geometric data (MediaPipe):
- Face shape: ${shapeInfo.shape}
- Facial symmetry: ${sym}%
- fWHR: ${fwhr} (masculine ideal 1.9-2.1)
- Cheekbone-to-jaw taper ratio: ${cbJawRatio} (ideal 1.2-1.35)
- Forehead: ${Math.round(metrics.foreheadWidth)}px | Bizygomatic: ${Math.round(metrics.cheekboneWidth)}px | Bigonial: ${Math.round(metrics.jawWidth)}px

Analyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):

ОБЩИЙ_БАЛЛ: X/10
[Общий PSL рейтинг. Честный вердикт с указанием на сильные и слабые стороны. 3-4 предложения.]

СИММЕТРИЯ: X/10
[Детальный анализ: facial symmetry %, orbital tilt, mandibular deviation, влияние на внешность.]

ГЛАЗА_CANTHAL_TILT: X/10
[Конкретно: canthal tilt (положительный/отрицательный/нейтральный), hunter eyes vs prey eyes, lid hooding (есть/нет), orbital rim projection, eyelid exposure, IPD (interpupillary distance) vs норма, scleral show. Что это даёт визуально.]

МИДФЕЙС_MAXILLA: X/10
[Максиллярная проекция (forward/recessed), midface length, zygomatic arch prominence, malar eminence, nasolabial angle, влияние на размещение губ и носа.]

ДЖОУЛАЙН_MANDIBLE: X/10
[Джоулайн: mandible definition, gonial angle (оценка угла — ideal 120-125°), ramus height, bigonial width vs bizygomatic (taper ratio ${cbJawRatio}), chin projection и shape, submental angle, neck-jawline transition.]

НОС_NOSE: X/10
[Нос: dorsum height/width (broad/narrow/ideal), tip projection (over/under projected), nasal tip rotation, columella show, alar width vs intercanthal distance, nose-lip harmony (NLH), bridge deviation.]

ГУБЫ_СКУЛЫ: X/10
[Губы: соотношение верхней/нижней (ideal 1:1.6), vermillion border четкость, philtrum length, Cupid’s bow, labiomental fold глубина. Скулы: cheekbone projection, malar fat pad, bizygomatic dominance.]

КОЖА: X/10
[Кожа: skin texture (ровная/пористая/рубцовая), tone evenness, visible pores, acne/scarring, skin laxity, estimated skin age vs actual, приоритеты skincare.]

ГРУМИНГ_STYLE: X/10
[Груминг: hairline integrity (залысина/норма), hair density, hairstyle совместимость с формой лица, brow grooming (арх и толщина), facial hair assessment если есть, общее впечатление от внешности.]

РЕКОМЕНДАЦИИ:
1. [Softmax: конкретный совет с обоснованием]
2. [Softmax: конкретный совет с обоснованием]
3. [Softmax: конкретный совет с обоснованием]
4. [Hardmax: процедура + обоснование]
5. [Hardmax: процедура + обоснование]`;

  try {
    const image = canvasToBase64(640);
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    aiLoading.classList.add("hidden");
    renderAIReport(data.text || "Пустой ответ.");
    aiReport.classList.remove("hidden");
  } catch (err) {
    aiLoading.classList.add("hidden");
    aiErrorText.textContent = `Ошибка: ${err.message}`;
    aiError.classList.remove("hidden");
  }
}

function parseAIReport(text) {
  const result = { overall: null, overallDesc: "", categories: [], recommendations: [] };

  const overallM = text.match(/ОБЩИЙ_БАЛЛ:\s*(\d+(?:\.\d+)?)\/10\s*\n([\s\S]*?)(?=\n[Ѐ-ӿ_A-Z]+:|$)/);
  if (overallM) {
    result.overall = parseFloat(overallM[1]);
    result.overallDesc = overallM[2].trim();
  }

  const cats = [
    { key: "СИММЕТРИЯ",        label: "Симметрия" },
    { key: "ГЛАЗА_CANTHAL_TILT",  label: "Canthal Tilt / Eyes" },
    { key: "МИДФЕЙС_MAXILLA",    label: "Midface / Maxilla" },
    { key: "ДЖОУЛАЙН_MANDIBLE",  label: "Jawline / Mandible" },
    { key: "НОС_NOSE",              label: "Nose" },
    { key: "ГУБЫ_СКУЛЫ",        label: "Губы / Скулы" },
    { key: "КОЖА",                label: "Skin" },
    { key: "ГРУМИНГ_STYLE",      label: "Grooming / Style" },
  ];

  cats.forEach(({ key, label }) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${escaped}:\\s*(\\d+(?:\\.\\d+)?)\\/10\\s*\\n([\\s\\S]*?)(?=\\n[\\u0400-\\u04FF_A-Z]+:|$)`);
    const m = text.match(re);
    if (m) result.categories.push({ label, score: parseFloat(m[1]), text: m[2].trim() });
  });

  const recsM = text.match(/РЕКОМЕНДАЦИИ:\s*\n([\s\S]+?)$/);
  if (recsM) {
    result.recommendations = recsM[1]
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
  }

  return result;
}

function renderAIReport(text) {
  const parsed = parseAIReport(text);

  document.getElementById("overallScoreNum").textContent =
    parsed.overall !== null ? parsed.overall.toFixed(1) : "—";
  document.getElementById("overallDesc").textContent = parsed.overallDesc;

  const catContainer = document.getElementById("categoryScores");
  catContainer.innerHTML = "";

  if (parsed.categories.length > 0) {
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "ДЕТАЛЬНЫЙ АНАЛИЗ";
    catContainer.appendChild(eyebrow);

    parsed.categories.forEach(({ label, score, text }) => {
      const row = document.createElement("div");
      row.className = "score-row";

      const header = document.createElement("div");
      header.className = "score-row-header";
      header.innerHTML = `<span class="score-name">${label}</span><span class="score-val">${score.toFixed(1)}<span style="color:var(--text-dim);font-size:.75em">/10</span></span>`;

      const track = document.createElement("div");
      track.className = "score-bar-track";
      const fill = document.createElement("div");
      fill.className = "score-bar-fill";
      fill.style.width = "0%";
      track.appendChild(fill);

      const desc = document.createElement("p");
      desc.className = "score-text";
      desc.textContent = text;

      row.appendChild(header);
      row.appendChild(track);
      row.appendChild(desc);
      catContainer.appendChild(row);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        fill.style.width = `${score * 10}%`;
      }));
    });
  } else {
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space:pre-wrap;font-size:0.85rem;color:var(--text-dim);line-height:1.7;font-family:inherit;";
    pre.textContent = text;
    catContainer.appendChild(pre);
  }

  const aiRecs = document.getElementById("aiRecs");
  const recsList = document.getElementById("recsList");
  recsList.innerHTML = "";
  if (parsed.recommendations.length > 0) {
    parsed.recommendations.forEach((rec) => {
      const li = document.createElement("li");
      li.textContent = rec;
      recsList.appendChild(li);
    });
    aiRecs.classList.remove("hidden");
  }
}
