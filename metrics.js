/**
 * metrics.js
 *
 * Вычисление геометрических метрик лица на основе 468 точек
 * MediaPipe Face Mesh. Все вычисления чисто геометрические:
 * расстояния, соотношения, отражение относительно оси.
 *
 * Никакая модель привлекательности/желательности не используется.
 * Индексы ключевых точек соответствуют публичной карте landmarks
 * MediaPipe Face Mesh (468-point topology).
 */

// Ключевые индексы landmarks (MediaPipe Face Mesh canonical topology)
const LM = {
  foreheadTop: 10,      // верхняя точка лба (граница волос, ориентировочно)
  glabella: 9,           // межбровная точка
  noseBase: 2,           // основание носа
  chin: 152,              // нижняя точка подбородка

  leftCheekbone: 234,     // левая скуловая точка (со стороны зрителя)
  rightCheekbone: 454,    // правая скуловая точка

  leftJaw: 58,            // левая точка нижней челюсти (угол)
  rightJaw: 288,          // правая точка нижней челюсти (угол)

  leftForehead: 21,       // левый край лба
  rightForehead: 251,     // правый край лба

  leftEyeOuter: 33,
  rightEyeOuter: 263,
  leftEyeInner: 133,
  rightEyeInner: 362,

  faceTop: 10,
  faceBottom: 152,
  faceLeft: 234,
  faceRight: 454,

  noseTip: 1,
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Вычисляет полный набор геометрических метрик по landmarks.
 * landmarks — массив {x, y} в пикселях исходного изображения.
 */
function computeFaceMetrics(landmarks) {
  const p = (i) => landmarks[i];

  // --- Пропорции третей лица ---
  const topThird = dist(p(LM.foreheadTop), p(LM.glabella));
  const midThird = dist(p(LM.glabella), p(LM.noseBase));
  const bottomThird = dist(p(LM.noseBase), p(LM.chin));
  const thirdsTotal = topThird + midThird + bottomThird;

  const thirdsRatio = [
    topThird / thirdsTotal,
    midThird / thirdsTotal,
    bottomThird / thirdsTotal,
  ];

  // --- Ширина зон лица ---
  const foreheadWidth = dist(p(LM.leftForehead), p(LM.rightForehead));
  const cheekboneWidth = dist(p(LM.leftCheekbone), p(LM.rightCheekbone));
  const jawWidth = dist(p(LM.leftJaw), p(LM.rightJaw));

  // --- Общие габариты лица ---
  const faceHeight = dist(p(LM.faceTop), p(LM.faceBottom));
  const faceWidth = cheekboneWidth;
  const widthHeightRatio = faceWidth / faceHeight;

  // --- Симметрия ---
  // Строим вертикальную ось как линию через переносицу (glabella) и подбородок,
  // затем сравниваем расстояния зеркальных пар точек до этой оси.
  const axisTop = p(LM.glabella);
  const axisBottom = p(LM.chin);

  const symmetryPairs = [
    [LM.leftEyeOuter, LM.rightEyeOuter],
    [LM.leftEyeInner, LM.rightEyeInner],
    [LM.leftCheekbone, LM.rightCheekbone],
    [LM.leftJaw, LM.rightJaw],
    [LM.leftForehead, LM.rightForehead],
  ];

  const distToAxis = (pt) => {
    // расстояние от точки до прямой axisTop-axisBottom
    const x1 = axisTop.x, y1 = axisTop.y;
    const x2 = axisBottom.x, y2 = axisBottom.y;
    const num = Math.abs((x2 - x1) * (pt.y - y1) - (y2 - y1) * (pt.x - x1));
    const den = Math.hypot(x2 - x1, y2 - y1) || 1;
    return num / den;
  };

  let symmetryDiffs = [];
  symmetryPairs.forEach(([li, ri]) => {
    const dl = distToAxis(p(li));
    const dr = distToAxis(p(ri));
    const maxD = Math.max(dl, dr) || 1;
    symmetryDiffs.push(Math.abs(dl - dr) / maxD);
  });

  const avgAsymmetry = symmetryDiffs.reduce((a, b) => a + b, 0) / symmetryDiffs.length;
  const symmetryScore = Math.max(0, 1 - avgAsymmetry); // 1 = идеально симметрично

  return {
    thirdsRatio,
    foreheadWidth,
    cheekboneWidth,
    jawWidth,
    faceWidth,
    faceHeight,
    widthHeightRatio,
    symmetryScore,
  };
}

/**
 * Классифицирует форму лица на основе соотношений ширины зон и высоты.
 * Это эвристика на стандартных правилах стайлинга, а не ML-классификатор.
 */
function classifyFaceShape(metrics) {
  const { foreheadWidth, cheekboneWidth, jawWidth, faceHeight } = metrics;

  const fh = foreheadWidth;
  const cb = cheekboneWidth;
  const jw = jawWidth;
  const height = faceHeight;

  const widths = [fh, cb, jw];
  const maxWidth = Math.max(...widths);
  const heightToWidth = height / maxWidth;

  const jawToForehead = jw / fh;
  const cheekDominance = cb / Math.max(fh, jw);

  // Очень упрощённая, но прозрачная эвристика
  if (heightToWidth > 1.55) {
    return {
      shape: "удлинённое (oblong)",
      desc: "лицо заметно длиннее, чем шире, ширина лба/скул/челюсти схожа",
    };
  }
  if (cheekDominance > 1.12) {
    return {
      shape: "сердцевидное (heart)",
      desc: "скулы шире лба и заметно шире челюсти, подбородок сужается",
    };
  }
  if (jawToForehead > 1.08) {
    return {
      shape: "треугольное / грушевидное",
      desc: "челюсть шире лба",
    };
  }
  if (heightToWidth < 1.15 && Math.abs(fh - jw) / fh < 0.08) {
    return {
      shape: "квадратное (square)",
      desc: "лоб и челюсть примерно одной ширины, лицо компактное по высоте",
    };
  }
  if (heightToWidth < 1.25 && Math.abs(cb - fh) / fh < 0.08 && Math.abs(cb - jw) / cb < 0.1) {
    return {
      shape: "круглое (round)",
      desc: "ширина лба, скул и челюсти схожа, лицо невысокое относительно ширины",
    };
  }
  return {
    shape: "овальное (oval)",
    desc: "сбалансированные пропорции, скулы немного шире лба и челюсти",
  };
}
