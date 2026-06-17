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
      const recs = buildRecommendations(shapeInfo);

      renderBaseResults(metrics, shapeInfo, recs);
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

function renderBaseResults(metrics, shapeInfo, recs) {
  document.getElementById("faceShape").textContent = shapeInfo.shape;
  document.getElementById("symmetryScore").textContent = getSymmetryNote(metrics.symmetryScore);
  const [top, mid, bottom] = metrics.thirdsRatio.map((v) => Math.round(v * 100));
  document.getElementById("thirdsRatio").textContent = `${top}% / ${mid}% / ${bottom}%`;
  document.getElementById("widthHeightRatio").textContent = metrics.widthHeightRatio.toFixed(2);
  document.getElementById("zoneWidths").textContent =
    `лоб ${Math.round(metrics.foreheadWidth)} · скулы ${Math.round(metrics.cheekboneWidth)} · челюсть ${Math.round(metrics.jawWidth)} px`;

  const haircutList = document.getElementById("haircutList");
  haircutList.innerHTML = "";
  recs.haircuts.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    haircutList.appendChild(li);
  });

  const styleList = document.getElementById("styleList");
  styleList.innerHTML = "";
  recs.styleNotes.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    styleList.appendChild(li);
  });
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

  const [top, mid, bottom] = metrics.thirdsRatio.map((v) => Math.round(v * 100));
  const sym = Math.round(metrics.symmetryScore * 100);
  const fwhr = metrics.widthHeightRatio.toFixed(2);

  const prompt = `You are a brutal, honest looksmaxxing analyst. Analyze this face photo and the geometric data below. Give a detailed, direct assessment using looksmaxxing terminology. Do NOT be soft — give real scores.

Geometric data (MediaPipe Face Mesh):
- Face shape: ${shapeInfo.shape}
- Symmetry: ${sym}% (${sym >= 90 ? 'high' : sym >= 75 ? 'moderate asymmetry' : 'notable asymmetry'})
- Facial thirds (forehead / midface / lower): ${top}% / ${mid}% / ${bottom}% (ideal = 33/33/33)
- fWHR (facial width-to-height ratio): ${fwhr} (ideal masculine = 1.9-2.1, feminine = 1.6-1.8)
- Forehead width: ${Math.round(metrics.foreheadWidth)}px, bizygomatic (cheekbones): ${Math.round(metrics.cheekboneWidth)}px, bigonial (jaw): ${Math.round(metrics.jawWidth)}px
- Cheekbone-to-jaw ratio: ${(metrics.cheekboneWidth / metrics.jawWidth).toFixed(2)} (ideal = 1.2-1.35 for tapered jaw)

Analyze and score the following. Be specific. Use looksmaxxing terms: canthal tilt, hunter/prey eyes, maxillary projection, mandible, gonial angle, ramus height, bizygomatic width, submental angle, mewing potential, PSL rating, mogging potential, softmax/hardmax recommendations.

Reply STRICTLY in this format (no markdown, no asterisks, no bullet points, plain text only):

ОБЩИЙ_БАЛЛ: X/10
[Оценка PSL рейтинга. 2-3 предложения.]

СИММЕТРИЯ: X/10
[Анализ симметрии, отклонения осей, влияние на внешность.]

ПРОПОРЦИИ: X/10
[Трети лица, fWHR, соотношение скул/челюсть, сравнение с идеальными значениями.]

ЧЕРТЫ_ЛИЦА: X/10
[Подробно: canthal tilt (положительный/отрицательный/нейтральный), hunter/prey eyes, maxillary projection (выступающая/утопленная), mandible и gonial angle, cheekbone projection, подбородок, губы.]

КОЖА: X/10
[Текстура, тон, поры, состояние. Процент кожи vs возраста.]

СТИЛЬ_И_УХОД: X/10
[Волосы (стрижка, густота, линия роста), брови, уход за лицом, борода (если есть). Балл за соответствие внешности.]

РЕКОМЕНДАЦИИ:
1. [Конкретный softmax-совет: стрижка, брови, скинкер, mewing, поза или вес — с обоснованием]
2. [Конкретный совет с обоснованием]
3. [Конкретный совет с обоснованием]
4. [Конкретный совет с обоснованием]
5. [Конкретный совет с обоснованием]`;

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

  const overallM = text.match(/ОБЩИЙ_БАЛЛ:\s*(\d+(?:\.\d+)?)\/10\s*\n([\s\S]*?)(?=\n[Ѐ-ӿ_]+:|$)/);
  if (overallM) {
    result.overall = parseFloat(overallM[1]);
    result.overallDesc = overallM[2].trim();
  }

  const cats = [
    { key: "СИММЕТРИЯ", label: "Симметрия" },
    { key: "ПРОПОРЦИИ", label: "Пропорции" },
    { key: "ЧЕРТЫ_ЛИЦА", label: "Черты лица" },
    { key: "КОЖА", label: "Кожа" },
    { key: "СТИЛЬ_И_УХОД", label: "Стиль и уход" },
  ];

  cats.forEach(({ key, label }) => {
    const re = new RegExp(`${key}:\\s*(\\d+(?:\\.\\d+)?)\\/10\\s*\\n([\\s\\S]*?)(?=\\n[\\u0400-\\u04FF_]+:|$)`);
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
