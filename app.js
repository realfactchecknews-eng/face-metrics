/**
 * app.js
 *
 * Связывает UI, MediaPipe Face Mesh и модули metrics.js / recommendations.js.
 * Вся обработка происходит локально в браузере пользователя. Изображение
 * никуда не отправляется по сети — MediaPipe Face Mesh выполняется
 * полностью on-device (WASM), сетевой запрос идёт только один раз при
 * первой загрузке модели с CDN (кэшируется браузером).
 *
 * Никакие данные не сохраняются: после обработки кадра и закрытия
 * страницы изображение и landmarks удаляются из памяти.
 */

const fileInput = document.getElementById("fileInput");
const chooseFileBtn = document.getElementById("chooseFileBtn");
const uploadArea = document.getElementById("uploadArea");
const previewWrap = document.getElementById("previewWrap");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const resetBtn = document.getElementById("resetBtn");
const loadingBox = document.getElementById("loading");
const resultsBox = document.getElementById("results");
const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");

let faceMesh = null;

function initFaceMesh() {
  if (faceMesh) return faceMesh;
  faceMesh = new FaceMesh({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
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
  const file = e.target.files[0];
  if (file) handleFile(file);
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
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

resetBtn.addEventListener("click", () => {
  previewWrap.classList.add("hidden");
  resultsBox.classList.add("hidden");
  errorBox.classList.add("hidden");
  uploadArea.classList.remove("hidden");
  fileInput.value = "";
});

function showError(msg) {
  errorText.textContent = msg;
  errorBox.classList.remove("hidden");
  loadingBox.classList.add("hidden");
}

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showError("Пожалуйста, загрузите файл изображения (JPG, PNG).");
    return;
  }

  errorBox.classList.add("hidden");
  resultsBox.classList.add("hidden");
  uploadArea.classList.add("hidden");
  loadingBox.classList.remove("hidden");

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
      loadingBox.classList.add("hidden");

      if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        showError("Не удалось распознать лицо на фото. Попробуйте другое изображение — лицо должно быть направлено прямо в камеру и хорошо освещено.");
        previewWrap.classList.remove("hidden");
        return;
      }

      const rawLandmarks = results.multiFaceLandmarks[0];
      const w = canvas.width;
      const h = canvas.height;

      // Переводим нормализованные координаты (0..1) в пиксели исходного изображения
      const landmarks = rawLandmarks.map((p) => ({ x: p.x * w, y: p.y * h }));

      drawLandmarkOverlay(landmarks);

      const metrics = computeFaceMetrics(landmarks);
      const shapeInfo = classifyFaceShape(metrics);
      const recs = buildRecommendations(shapeInfo);

      renderResults(metrics, shapeInfo, recs);

      previewWrap.classList.remove("hidden");
      resultsBox.classList.remove("hidden");

      // Очищаем landmarks из памяти — данные нигде не сохраняются
      rawLandmarks.length = 0;
    });

    await mesh.send({ image: canvas });
  } catch (err) {
    console.error(err);
    showError("Произошла ошибка при анализе изображения. Попробуйте обновить страницу и повторить попытку.");
  }
}

function drawLandmarkOverlay(landmarks) {
  ctx.save();
  ctx.fillStyle = "rgba(108, 140, 255, 0.7)";
  landmarks.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, canvas.width / 400), 0, 2 * Math.PI);
    ctx.fill();
  });
  ctx.restore();
}

function renderResults(metrics, shapeInfo, recs) {
  document.getElementById("faceShape").textContent = shapeInfo.shape;

  const symEl = document.getElementById("symmetryScore");
  symEl.textContent = getSymmetryNote(metrics.symmetryScore);

  const [top, mid, bottom] = metrics.thirdsRatio.map((v) => Math.round(v * 100));
  document.getElementById("thirdsRatio").textContent = `${top}% / ${mid}% / ${bottom}%`;

  document.getElementById("widthHeightRatio").textContent =
    metrics.widthHeightRatio.toFixed(2) + " (ширина / высота)";

  document.getElementById("zoneWidths").textContent =
    `лоб ${Math.round(metrics.foreheadWidth)} · скулы ${Math.round(metrics.cheekboneWidth)} · челюсть ${Math.round(metrics.jawWidth)} (px)`;

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
