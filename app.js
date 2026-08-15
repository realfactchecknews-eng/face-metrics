// На localhost можно перенаправить запросы на свой воркер:
//   localStorage.setItem('fmWorker', 'https://<адрес из wrangler dev>')
// На боевом домене подмена игнорируется.
const WORKER_URL = (location.hostname === "localhost" || location.hostname === "127.0.0.1")
  && localStorage.getItem("fmWorker") || "https://api.facerate.online";

// Просим воркер запинить провайдера. Без этого OpenRouter отдаёт одинаковые запросы
// разным бэкендам, и одно фото возвращало разные тиры: 4.8 / 5.6 / 6.5 на пяти прогонах
// против 5.1-5.2 с пином. Флаг остался отдельным, чтобы старый закэшированный app.js
// у кого-то на руках вёл себя ровно как раньше, а не непредсказуемо.
const STABLE_SCORE = true;

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

/* ═══════════════════  i18n: английский по умолчанию, RU опционально  ═══════════════════ */
var I18N = {
  en: {
    begin: "START ANALYSIS",
    menuTitle: "Menu",
    tHistory: "Score history", tHistorySub: "Your past results",
    tProgress: "Coaching", tProgressSub: "Progress checks and plan",
    tGlossary: "Looksmax glossary", tGlossarySub: "Terms explained simply",
    tArticles: "Terms & articles", tArticlesSub: "PSL, fWHR, canthal tilt",
    tHow: "How it works", tHowSub: "Geometry + AI",
    tFeedback: "Feedback", tFeedbackSub: "Ideas & requests",
    goAnalysis: "Go to analysis",
    back: "← Back",
    front: "FRONT", profile: "PROFILE", required: "required", optional: "optional",
    frontTitle: "Frontal photo", frontHint: "Face straight · Even lighting",
    sideTitle: "Profile photo", sideHint: "For accurate jawline scoring", sideHint2: "↑ analysis accuracy",
    chooseFile: "Choose file", addFile: "Add",
    analyze: "ANALYZE",
    tone: "🔞 Savage mode — brutal roast, no sugar-coating",
    accLoTitle: "Log in with Telegram",
    accLoSub: "Subscribe to the <a href='https://t.me/wwwfacerateru' target='_blank' rel='noopener'>channel</a> = 1 free analysis per week",
    lastLabel: "LAST RESULT", lastCta: "Open report →",
    toMenu: "← Menu", reset: "Upload another",
    scanning: "Scanning face geometry…",
    scoreEyebrow: "OVERALL SCORE · PSL RATING",
    recsEyebrow: "LOOKSMAXXING RECOMMENDATIONS",
    detailEyebrow: "DETAILED BREAKDOWN",
    pwEyebrow: "SCAN COMPLETE",
    lastReportEyebrow: "PREVIOUS REPORT",
    share: "Share result",
    tgCard: "📩 Send card to Telegram", tgCardSending: "Sending…", tgCardOk: "✅ Sent! Check your Telegram", tgCardErr: "Failed — try again",
    consentTitle: "Terms of Use",
    consentBody: "<p>By pressing “I agree” you confirm that:</p><ul>" +
      "<li>you are <b>18 or older</b>;</li>" +
      "<li>this service is <b>for entertainment</b>; its scores are a subjective AI heuristic, <b>not</b> medical, psychological or any professional diagnosis, and not objective truth;</li>" +
      "<li>face geometry is computed in your browser, but <b>the photo itself is sent</b> to a third-party AI service to generate the report; the service does not store photos after processing;</li>" +
      "<li>you upload <b>only your own image</b> or a photo of a person <b>who gave consent</b>; no photos of minors or third parties without consent;</li>" +
      "<li>you consent to processing of the uploaded image for these purposes and may stop using the service at any time;</li>" +
      "<li>you use the service at your own risk; <b>the administration is not liable</b> for your decisions or any consequences based on the results.</li></ul>" +
      "<p class='consent-full-link'><a href='terms-en.html' target='_blank' rel='noopener'>Full terms →</a><br/><a href='privacy-en.html' target='_blank' rel='noopener'>Privacy policy →</a></p>",
    consentCheck: "I have read and accept the terms",
    consentAccept: "I agree", consentDecline: "Cancel",
    tipsEyebrow: "FOR AN ACCURATE READING", tipsTitle: "How to take the photo",
    tipsGo: "Got it", tipsBack: "Back",
    tipsNote: "A bad angle will not ruin the whole report — some measurements will simply be marked as unreliable.",
    tipsList:
      "<li><b>Camera at eye level.</b> Shooting from above shortens the face, from below stretches it. That skews proportions more than the real difference between people.</li>" +
      "<li><b>Face the camera straight on.</b> A turned head mechanically lowers the symmetry score.</li>" +
      "<li><b>Keep 40-60 cm of distance.</b> Any closer and perspective distorts the nose and cheekbones.</li>" +
      "<li><b>Even, diffused light.</b> Hard shadows fake cheekbones and a jawline; backlight eats the features.</li>" +
      "<li><b>Nothing covering the face.</b> Hair off the forehead, no glasses, hat or mask.</li>" +
      "<li><b>Neutral expression, mouth closed.</b> A smile changes both the cheeks and the eyes.</li>" +
      "<li><b>No filters or beauty mode.</b> They edit exactly what we measure.</li>",
    footLegal: "<a href='terms-en.html' style='color:#888;text-decoration:none'>Terms of use</a>&nbsp;·&nbsp;<a href='privacy-en.html' style='color:#888;text-decoration:none'>Privacy policy</a>",
    // dynamic
    pwReady: "Your report is ready",
    pwLoginSub: "Log in with Telegram to unlock the result. One tap — no phone number, no password.",
    pwLoginBtn: "<span class='tg-ic'>✈</span> Log in with Telegram",
    pwSubTitle: "Unlock your result for free",
    pwSubSub: "Subscribing to our channel gives you 1 free analysis every week.",
    pwSubBtn: "<span class='tg-ic'>✈</span> Subscribe to the channel",
    pwSubCheck: "I subscribed — show my result",
    pwPayTitle: "Free analysis used for this week",
    pwPaySub: "Pay with Telegram Stars in two taps. Or come back next week for a free one.",
    pwPaid: "I paid — show my result",
    pwChecking: "Checking…",
    packP1: "1 analysis", packP5: "5 analyses", packH1: "Hour unlimited", packD1: "Day unlimited", packM1: "Month unlimited",
    waitTg: "Waiting for Telegram…",
    waitTgHint: "Usually 10–30 sec, sometimes up to a minute — don't close this page",
    loginBtn: "<span class='tg-ic'>✈</span> Log in with Telegram",
    chipSub: "subscribe to channel → 1 free/week", chipFree: "free this week: ", chipCredits: "credits: ",
    chipUnlim: "👑 Unlimited until ",
    gateHint: "After subscribing, come back and press “Analyze” again.",
    invoiceCreating: "Creating invoice…", invoiceOpening: "Opening Telegram…", invoiceErr: "Error, try again", netErr: "Network unavailable",
    pwPickMethod: "Choose payment method", pwPickPack: "Choose a package", payStars: "⭐ Telegram Stars", payCard: "💳 Card (RUB)", paySbp: "📲 SBP (RUB)", payCrypto: "🪙 Crypto", pwBack: "← Back",
    teaserTitle: "Full report locked", teaserBody: "This free report shows only 3 of 8 categories. Unlock the full breakdown (Jaw, Maxilla, Nose, Lips/Cheekbones, Grooming) plus personal recommendations.", teaserBtn: "Unlock full report",
    histEmpty: "No scores yet. Upload a photo — the result will be saved here.",
    histAvg: "Average score: ", histCount: " · analyses: ",
    howHtml: "<div class='how'>" +
      "<div class='how-hero'><img src='how-scan.jpg' alt='AI face landmark scanning' loading='lazy' /></div>" +
      "<p class='how-intro'>FaceRate turns one photo into a structured, numbers-first breakdown of your facial geometry — the same landmark math used in anthropometry and clinical photogrammetry, just automated and instant.</p>" +
      "<div class='how-steps'>" +
      "<div class='how-step'><div class='how-step-num'>1</div><div class='how-step-body'><h4>On-device face mapping</h4><p>468 facial landmarks are detected right in your browser via MediaPipe — cheekbone width, jaw width, fWHR, canthal tilt, symmetry score, face shape. Nothing leaves your device at this step.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>2</div><div class='how-step-body'><h4>AI interpretation</h4><p>Your photo and the measured geometry are sent to a vision model, which reads the numbers in context — proportion, harmony, gender-typical markers — the way a trained eye would, not just raw math.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>3</div><div class='how-step-body'><h4>Full report</h4><p>An overall PSL-style score, an 8-category breakdown (symmetry, eyes/canthal tilt, midface, jawline, nose, lips/cheekbones, skin, grooming), and 8-9 concrete, actionable recommendations.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>4</div><div class='how-step-body'><h4>Track & compare</h4><p>Every score is saved to your history so you can track progress over time, share a result card, or run a head-to-head \"Who Moggs\" comparison against a friend.</p></div></div>" +
      "</div>" +
      "<p class='how-note'>Entertainment only. The score is a subjective AI heuristic, not objective truth — treat it accordingly. Mild asymmetry is normal for every human face.</p></div>",
    articlesHtml: "<div class='how'><p class='how-intro'>Deep-dive articles on the terms and concepts behind the score.</p>" +
      "<div class='art-list'>" +
      "<a class='art-item' href='psl-shkala.html' target='_blank' rel='noopener'><b>PSL scale</b><span>What the 1–10 score actually means</span></a>" +
      "<a class='art-item' href='psl-tiers.html' target='_blank' rel='noopener'><b>PSL tiers: Sub-3 to True Adam</b><span>Full tier scale from looksmax.org, and PSL vs Appeal</span></a>" +
      "<a class='art-item' href='fwhr.html' target='_blank' rel='noopener'><b>fWHR</b><span>Facial width-to-height ratio explained</span></a>" +
      "<a class='art-item' href='canthal-tilt.html' target='_blank' rel='noopener'><b>Canthal tilt</b><span>How to read and measure eye tilt</span></a>" +
      "<a class='art-item' href='glossary.html' target='_blank' rel='noopener'><b>Full glossary</b><span>Every looksmaxxing term, explained simply</span></a>" +
      "<a class='art-item' href='faq.html' target='_blank' rel='noopener'><b>FAQ</b><span>Common questions about the analysis, payments and privacy</span></a>" +
      "</div></div>",
    fbSub: "What should we improve? What's missing? Found a bug? Tell us — it really helps.",
    fbName: "Name or nick (optional)", fbEmail: "Email for reply (optional)", fbMsg: "Your message…",
    fbSend: "Send", fbSending: "Sending…", fbOk: "Thank you! Message sent.", fbErr: "Could not send. Try later.",
    labelSym: "Symmetry", labelLips: "Lips / Cheekbones",
    shareCardTag: "PSL RATING · facerate.ru", shareText: "My PSL rating — facerate.ru",
    errNoFace: "Could not detect a face. Try another photo — the face should look at the camera in good lighting.",
    errGeneric: "Analysis error. Try refreshing the page.",
    emptyAnswer: "Empty response.",
    cashbackToast: "🎁 Cashback! +1 free analysis for spending 3 credits.",
    gateRestricted: "Access restricted.", errPrefix: "Error: ",
    tCompare: "Who Moggs?", tCompareSub: "Face-off: compare two faces",
    cmpTitle: "Who Moggs?", cmpSub: "Upload two faces — AI decides who mogs whom. 1 credit.",
    cmpRun: "FACE-OFF", cmpLoading: "DECIDING WHO MOGS…", cmpAgain: "↻ New face-off",
    cmpNeedTwo: "Add both photos first.", cmpNoFaceA: "No face detected in photo A.",
    cmpNoFaceB: "No face detected in photo B.", cmpErrGen: "Something went wrong, try again.",
    cmpMogs: "MOGS", cmpVerdict: "VERDICT", cmpMogged: "MOGGED",
    cmpShareText: "got mogged on facerate.ru 💀 think you'd do better? try it yourself 👇",
  },
  ru: {
    begin: "НАЧАТЬ АНАЛИЗ",
    menuTitle: "Меню",
    tHistory: "История оценок", tHistorySub: "Прошлые результаты",
    tProgress: "Ведение", tProgressSub: "Замеры прогресса и план",
    tGlossary: "Луксмакс-словарь", tGlossarySub: "Термины простыми словами",
    tArticles: "Термины и статьи", tArticlesSub: "PSL, fWHR, canthal tilt",
    tHow: "Как это работает", tHowSub: "Геометрия + AI",
    tFeedback: "Обратная связь", tFeedbackSub: "Пожелания и идеи",
    goAnalysis: "Перейти к анализу",
    back: "← Назад",
    front: "ФРОНТ", profile: "ПРОФИЛЬ", required: "обязательно", optional: "опционально",
    frontTitle: "Фронтальное фото", frontHint: "Лицо прямо · Равномерный свет",
    sideTitle: "Фото профиля", sideHint: "Для точной оценки челюсти", sideHint2: "↑ точность анализа",
    chooseFile: "Выбрать файл", addFile: "Добавить",
    analyze: "АНАЛИЗИРОВАТЬ",
    tone: "🔞 Дерзкий режим — жёсткий разбор без соплей",
    accLoTitle: "Войди через Telegram",
    accLoSub: "Подписка на <a href='https://t.me/wwwfacerateru' target='_blank' rel='noopener'>канал</a> = 1 бесплатный анализ в неделю",
    lastLabel: "ПРОШЛЫЙ РЕЗУЛЬТАТ", lastCta: "Открыть отчёт →",
    toMenu: "← Меню", reset: "Загрузить другое",
    scanning: "Сканирование геометрии лица…",
    scoreEyebrow: "ОБЩАЯ ОЦЕНКА · PSL РЕЙТИНГ",
    recsEyebrow: "РЕКОМЕНДАЦИИ ПО ЛУКСМАКСИНГУ",
    detailEyebrow: "ДЕТАЛЬНЫЙ АНАЛИЗ",
    pwEyebrow: "СКАНИРОВАНИЕ ЗАВЕРШЕНО",
    lastReportEyebrow: "ПРОШЛЫЙ ОТЧЁТ",
    share: "Поделиться результатом",
    tgCard: "📩 Карточку в Telegram", tgCardSending: "Отправляю…", tgCardOk: "✅ Готово! Проверь Telegram", tgCardErr: "Не вышло — ещё раз",
    consentTitle: "Пользовательское соглашение",
    consentBody: "<p>Нажимая «Принимаю», вы подтверждаете, что:</p><ul>" +
      "<li>вам <b>исполнилось 18 лет</b>;</li>" +
      "<li>сервис носит <b>развлекательный характер</b>, его оценки — субъективная эвристика нейросети, а <b>не</b> диагноз и не объективная истина;</li>" +
      "<li>геометрия считается в браузере, но <b>фото отправляется</b> на сторонний AI-сервис для формирования отчёта; фото не хранится после обработки;</li>" +
      "<li>вы загружаете <b>только своё изображение</b> либо фото человека, <b>давшего согласие</b>; без фото несовершеннолетних и третьих лиц без согласия;</li>" +
      "<li>вы даёте согласие на обработку изображения и можете прекратить использование в любой момент;</li>" +
      "<li>вы используете сервис на свой риск; <b>администрация не несёт ответственности</b> за ваши решения и последствия.</li></ul>" +
      "<p class='consent-full-link'><a href='terms.html' target='_blank' rel='noopener'>Полный текст соглашения →</a><br/><a href='privacy.html' target='_blank' rel='noopener'>Политика конфиденциальности →</a></p>",
    consentCheck: "Я прочитал(а) и принимаю условия",
    consentAccept: "Принимаю", consentDecline: "Отмена",
    tipsEyebrow: "ЧТОБЫ ЗАМЕР БЫЛ ТОЧНЫМ", tipsTitle: "Как сфотографироваться",
    tipsGo: "Всё понятно", tipsBack: "Назад",
    tipsNote: "Плохой ракурс не сломает разбор целиком — часть замеров просто будет помечена как ненадёжная.",
    tipsList:
      "<li><b>Камера на уровне глаз.</b> Съёмка сверху укорачивает лицо, снизу — вытягивает. Это сильнее влияет на пропорции, чем реальная разница между людьми.</li>" +
      "<li><b>Лицо анфас, взгляд в камеру.</b> Поворот головы механически занижает симметрию.</li>" +
      "<li><b>Расстояние 40-60 см.</b> Слишком близко — перспектива искажает нос и скулы.</li>" +
      "<li><b>Ровный рассеянный свет.</b> Жёсткие тени подделывают скулы и линию челюсти, контровой свет съедает черты.</li>" +
      "<li><b>Ничего не перекрывает лицо.</b> Волосы со лба, без очков, шапки и маски.</li>" +
      "<li><b>Нейтральное выражение, рот закрыт.</b> Улыбка меняет и щёки, и глаза.</li>" +
      "<li><b>Без фильтров и бьюти-режима.</b> Они правят ровно то, что мы измеряем.</li>",
    footLegal: "<a href='terms.html' style='color:#888;text-decoration:none'>Пользовательское соглашение</a>&nbsp;·&nbsp;<a href='privacy.html' style='color:#888;text-decoration:none'>Политика конфиденциальности</a>",
    pwReady: "Твой отчёт готов",
    pwLoginSub: "Войди через Telegram, чтобы открыть результат. Один тап — без номера и пароля.",
    pwLoginBtn: "<span class='tg-ic'>✈</span> Войти через Telegram",
    pwSubTitle: "Открой результат бесплатно",
    pwSubSub: "Подписка на наш канал даёт 1 бесплатный анализ каждую неделю.",
    pwSubBtn: "<span class='tg-ic'>✈</span> Подписаться на канал",
    pwSubCheck: "Я подписался — показать результат",
    pwPayTitle: "Бесплатный анализ на этой неделе использован",
    pwPaySub: "Оплата звёздами Telegram в два тапа. Или возвращайся на следующей неделе за бесплатным.",
    pwPaid: "Я оплатил — показать результат",
    pwChecking: "Проверяю…",
    packP1: "1 анализ", packP5: "5 анализов", packH1: "Безлимит на час", packD1: "Безлимит на день", packM1: "Безлимит на месяц",
    waitTg: "Жду подтверждения в Telegram…",
    waitTgHint: "Обычно 10–30 сек, иногда до минуты — не закрывайте страницу",
    loginBtn: "<span class='tg-ic'>✈</span> Войти через Telegram",
    chipSub: "подпишись на канал → 1 free/неделю", chipFree: "бесплатных на неделе: ", chipCredits: "кредиты: ",
    chipUnlim: "👑 Безлимит до ",
    gateHint: "После подписки вернись и нажми «Анализировать» ещё раз.",
    invoiceCreating: "Создаю счёт…", invoiceOpening: "Открываю Telegram…", invoiceErr: "Ошибка, ещё раз", netErr: "Сеть недоступна",
    pwPickMethod: "Выбери способ оплаты", pwPickPack: "Выбери пакет", payStars: "⭐ Telegram Stars", payCard: "💳 Картой (₽)", paySbp: "📲 СБП (₽)", payCrypto: "🪙 Криптой", pwBack: "← Назад",
    teaserTitle: "Полный разбор закрыт", teaserBody: "В бесплатном отчёте показаны только 3 категории из 8. Открой полный разбор (Джоулайн, Максилла, Нос, Губы/Скулы, Груминг) и персональные рекомендации.", teaserBtn: "Открыть полный разбор",
    histEmpty: "Пока нет оценок. Загрузите фото — результат сохранится здесь.",
    histAvg: "Средний балл: ", histCount: " · оценок: ",
    howHtml: "<div class='how'>" +
      "<div class='how-hero'><img src='how-scan.jpg' alt='Сканирование лица нейросетью' loading='lazy' /></div>" +
      "<p class='how-intro'>FaceRate превращает одну фотографию в структурированный, основанный на цифрах разбор геометрии лица — те же принципы, что в антропометрии и клинической фотограмметрии, только автоматизированные и мгновенные.</p>" +
      "<div class='how-steps'>" +
      "<div class='how-step'><div class='how-step-num'>1</div><div class='how-step-body'><h4>Разметка лица на устройстве</h4><p>468 точек лица определяются прямо в браузере через MediaPipe — ширина скул, ширина челюсти, fWHR, кантальный наклон, симметрия, форма лица. Фото на этом шаге никуда не отправляется.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>2</div><div class='how-step-body'><h4>Интерпретация ИИ</h4><p>Фото и измеренная геометрия отправляются vision-модели, которая читает цифры в контексте — пропорции, гармонию, гендерно-типичные маркеры — так, как это сделал бы натренированный взгляд, а не просто голая математика.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>3</div><div class='how-step-body'><h4>Полный отчёт</h4><p>Общий PSL-балл, разбор по 8 категориям (симметрия, глаза/кантальный наклон, мидфейс, джоулайн, нос, губы/скулы, кожа, груминг) и 8-9 конкретных, применимых рекомендаций.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>4</div><div class='how-step-body'><h4>Прогресс и сравнение</h4><p>Каждый результат сохраняется в историю, чтобы отслеживать прогресс, делиться карточкой результата или устроить дуэль «Who Moggs» с другом.</p></div></div>" +
      "</div>" +
      "<p class='how-note'>Только развлечение. Балл — субъективная эвристика ИИ, а не объективная истина. Лёгкая асимметрия — норма для любого лица.</p></div>",
    articlesHtml: "<div class='how'><p class='how-intro'>Подробные статьи про термины и понятия, лежащие в основе оценки.</p>" +
      "<div class='art-list'>" +
      "<a class='art-item' href='psl-shkala.html' target='_blank' rel='noopener'><b>PSL-шкала</b><span>Что реально значит балл от 1 до 10</span></a>" +
      "<a class='art-item' href='psl-tiers.html' target='_blank' rel='noopener'><b>PSL-тиры: от Sub-3 до True Adam</b><span>Полная шкала тиров с looksmax.org + PSL vs Appeal</span></a>" +
      "<a class='art-item' href='fwhr.html' target='_blank' rel='noopener'><b>fWHR</b><span>Соотношение ширины и высоты лица</span></a>" +
      "<a class='art-item' href='canthal-tilt.html' target='_blank' rel='noopener'><b>Canthal tilt</b><span>Как читать и измерять наклон глаз</span></a>" +
      "<a class='art-item' href='glossary.html' target='_blank' rel='noopener'><b>Полный словарь</b><span>Все термины луксмаксинга простыми словами</span></a>" +
      "<a class='art-item' href='faq.html' target='_blank' rel='noopener'><b>FAQ</b><span>Частые вопросы про анализ, оплату и приватность</span></a>" +
      "</div></div>",
    fbSub: "Что улучшить? Чего не хватает? Нашли ошибку? Напишите — это реально помогает.",
    fbName: "Имя или ник (необязательно)", fbEmail: "Email для ответа (необязательно)", fbMsg: "Ваше сообщение…",
    fbSend: "Отправить", fbSending: "Отправка…", fbOk: "Спасибо! Сообщение отправлено.", fbErr: "Не удалось отправить. Попробуйте позже.",
    labelSym: "Симметрия", labelLips: "Губы / Скулы",
    shareCardTag: "PSL РЕЙТИНГ · facerate.ru", shareText: "Мой PSL рейтинг — facerate.ru",
    errNoFace: "Не удалось распознать лицо. Попробуйте другое фото — лицо должно быть направлено в камеру.",
    errGeneric: "Ошибка при анализе. Попробуйте обновить страницу.",
    emptyAnswer: "Пустой ответ.",
    cashbackToast: "🎁 Кешбэк! +1 бесплатный анализ за 3 потраченных кредита.",
    gateRestricted: "Доступ ограничен.", errPrefix: "Ошибка: ",
    tCompare: "Who Moggs?", tCompareSub: "Дуэль: сравни два лица",
    cmpTitle: "Who Moggs?", cmpSub: "Загрузи два лица — ИИ решит, кто кого моггает. 1 кредит.",
    cmpRun: "ДУЭЛЬ", cmpLoading: "РЕШАЮ, КТО МОГГАЕТ…", cmpAgain: "↻ Новая дуэль",
    cmpNeedTwo: "Сначала добавь оба фото.", cmpNoFaceA: "На фото A не найдено лицо.",
    cmpNoFaceB: "На фото B не найдено лицо.", cmpErrGen: "Что-то пошло не так, попробуй ещё раз.",
    cmpMogs: "МОГГАЕТ", cmpVerdict: "ВЕРДИКТ", cmpMogged: "MOGGED",
    cmpShareText: "меня обмогали на facerate.ru 💀 слабо сделать лучше? попробуй сам 👇",
  },
};

function lang() { return localStorage.getItem("fm-lang") || "en"; }
function t(key) { return (I18N[lang()] && I18N[lang()][key]) || I18N.en[key] || key; }
function setLang(l) { localStorage.setItem("fm-lang", l); applyLang(); }

// Применяет язык к статичному DOM (селектор → ключ; html-ключи через innerHTML).
function applyLang() {
  var TXT = [
    ["#beginBtn .btn-begin-inner span:first-child", "begin"],
    [".menu-title", "menuTitle"],
    [".menu-tile[data-view='history'] .mt-tx b", "tHistory"], [".menu-tile[data-view='history'] .mt-tx i", "tHistorySub"],
    [".menu-tile[data-view='glossary'] .mt-tx b", "tGlossary"], [".menu-tile[data-view='glossary'] .mt-tx i", "tGlossarySub"],
    [".menu-tile[data-view='articles'] .mt-tx b", "tArticles"], [".menu-tile[data-view='articles'] .mt-tx i", "tArticlesSub"],
    [".menu-tile[data-view='how'] .mt-tx b", "tHow"], [".menu-tile[data-view='how'] .mt-tx i", "tHowSub"],
    [".menu-tile[data-view='feedback'] .mt-tx b", "tFeedback"], [".menu-tile[data-view='feedback'] .mt-tx i", "tFeedbackSub"],
    ["#menuGoBtn span:first-child", "goAnalysis"],
    ["#menuCompareBtn span:first-child", "tCompare"],
    ["#fsBack", "back"],
    [".upload-slot:nth-child(1) .slot-eyebrow", "front"], [".upload-slot:nth-child(2) .slot-eyebrow", "profile"],
    [".slot-required", "required"], [".slot-optional", "optional"],
    ["#frontPlaceholder .upload-title", "frontTitle"], ["#frontPlaceholder .upload-hint", "frontHint"],
    ["#chooseFileBtn", "chooseFile"],
    ["#sidePlaceholder .upload-title", "sideTitle"],
    ["#chooseSideBtn", "addFile"],
    ["#analyzeBtn .btn-analyze-text", "analyze"],
    [".tone-label", "tone"],
    ["#accLoggedOut .acc-lo-text b", "accLoTitle"],
    [".lrb-label", "lastLabel"], [".lrb-cta", "lastCta"],
    ["#toMenuBtn", "toMenu"], ["#uploadToMenuBtn", "toMenu"], ["#resetBtn", "reset"],
    ["#loading p", "scanning"],
    [".score-hero .eyebrow", "scoreEyebrow"],
    ["#aiRecs .eyebrow", "recsEyebrow"],
    ["#paywall .pw-box > .eyebrow", "pwEyebrow"],
    ["#lastResultModal .eyebrow", "lastReportEyebrow"],
    ["#shareBtn", "share"], ["#tgCardBtn", "tgCard"],
    ["#consentModal .consent-title", "consentTitle"],
    [".consent-check-row span", "consentCheck"],
    ["#consentAccept", "consentAccept"], ["#consentDecline", "consentDecline"],
    ["#tipsEyebrow", "tipsEyebrow"], ["#tipsTitle", "tipsTitle"],
    ["#tipsNote", "tipsNote"], ["#tipsGo", "tipsGo"], ["#tipsBack", "tipsBack"],
  ];
  var HTML = [
    ["#tipsList", "tipsList"],
    ["#accLoggedOut .acc-lo-text i", "accLoSub"],
    ["#consentModal .consent-body", "consentBody"],
    ["#mainFooter .container > p:last-child", "footLegal"],
  ];
  TXT.forEach(function(p){ var el = document.querySelector(p[0]); if (el) el.textContent = t(p[1]); });
  HTML.forEach(function(p){ var el = document.querySelector(p[0]); if (el) el.innerHTML = t(p[1]); });
  // Универсальный перевод по data-i18n
  document.querySelectorAll("[data-i18n]").forEach(function(el){ el.textContent = t(el.getAttribute("data-i18n")); });
  // hints профиля (их два <p>)
  var hints = document.querySelectorAll("#sidePlaceholder .upload-hint");
  if (hints[0]) hints[0].textContent = t("sideHint");
  if (hints[1]) hints[1].textContent = t("sideHint2");
  // переключатель
  var lb = document.getElementById("langBtn");
  if (lb) lb.textContent = lang() === "en" ? "RU" : "EN";
  document.documentElement.lang = lang();
  // футер-ссылки пересобраны — перевесить обработчики data-view
  document.querySelectorAll("#mainFooter [data-view]").forEach(function(a){
    a.addEventListener("click", function(e){ e.preventDefault(); if (window.fmOpenView) window.fmOpenView(a.getAttribute("data-view")); });
  });
}

(function initLang() {
  applyLang();
  var lb = document.getElementById("langBtn");
  if (lb) lb.addEventListener("click", function(){ setLang(lang() === "en" ? "ru" : "en"); });
})();

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
  var f = FM_FAST_LOAD ? 0.35 : 1; // короче при повторном заходе за последние ~12 минут
  el.classList.add("landing-visible");
  setTimeout(countUpStats, 200 * f);
  setTimeout(function() {
    typeWriter(document.getElementById("landQuote"), "“Every measurement tells a story.”", FM_FAST_LOAD ? 14 : 38);
  }, 500 * f);
  setTimeout(function() {
    showFact(0);
    factTimer = setInterval(function() {
      factIdx = (factIdx + 1) % FACTS.length;
      showFact(factIdx);
    }, 4200);
  }, 1400 * f);
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
// Если юзер уже был на сайте в последние ~12 минут — интро/лендинг короче,
// чтобы не заставлять смотреть одну и ту же анимацию заново при обновлении
// страницы. Через 12+ минут снова показываем полную версию.
var FM_RECENT_VISIT_MS = 12 * 60 * 1000;
var FM_FAST_LOAD = (function() {
  var last = parseInt(localStorage.getItem("fm-last-visit") || "0", 10);
  var recent = (Date.now() - last) < FM_RECENT_VISIT_MS;
  localStorage.setItem("fm-last-visit", String(Date.now()));
  return recent;
})();

// Ссылки со статей (fwhr.html и т.п.) ведут на index.html#analyze —
// сразу показываем экран загрузки фото, без интро/лендинга/меню.
function jumpToAnalysis() {
  var landing = document.getElementById("landingSection");
  if (landing && landing.parentNode) landing.remove();
  var menu = document.getElementById("menuScreen");
  if (menu) menu.classList.add("hidden");
  document.body.classList.add("entered", "post-landing");
  if (history.replaceState) history.replaceState(null, "", location.pathname + location.search);
}

function runIntro() {
  var overlay = document.getElementById("introOverlay");
  var skipToAnalysis = location.hash === "#analyze";
  var delay = skipToAnalysis ? 0 : (FM_FAST_LOAD ? 500 : 2800);
  if (overlay) {
    setTimeout(function() {
      overlay.classList.add("intro-exit");
      overlay.addEventListener("transitionend", function() {
        overlay.remove();
        if (skipToAnalysis) jumpToAnalysis(); else startLanding();
      }, { once: true });
    }, delay);
  } else {
    if (skipToAnalysis) jumpToAnalysis(); else startLanding();
  }
}

window.addEventListener("DOMContentLoaded", function() {
  var gate = document.getElementById("langGate");
  if (gate) {
    if (localStorage.getItem("fm-lang-picked") === "1") {
      gate.remove();
      runIntro();
    } else {
      var btns = gate.querySelectorAll(".lg-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener("click", function(e) {
          var chosen = e.currentTarget.getAttribute("data-lang");
          localStorage.setItem("fm-lang-picked", "1");
          setLang(chosen);
          gate.classList.add("lg-exit");
          gate.addEventListener("transitionend", function() {
            gate.remove();
            runIntro();
          }, { once: true });
        });
      }
    }
  } else {
    runIntro();
  }
  var beginBtn = document.getElementById("beginBtn");
  if (beginBtn) beginBtn.addEventListener("click", enterMenu);
});

// Лендинг → полноэкранное меню.
function enterMenu() {
  var landing = document.getElementById("landingSection");
  var menu = document.getElementById("menuScreen");
  document.body.classList.add("entered");
  if (landing) {
    landing.classList.add("landing-exit");
    setTimeout(function(){ if (landing.parentNode) landing.remove(); }, 700);
  }
  if (menu) {
    menu.classList.remove("hidden");
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ menu.classList.add("in"); }); });
  }
}

// Меню → экран анализа (загрузка фото).
function goToAnalysis() {
  var menu = document.getElementById("menuScreen");
  if (menu) { menu.classList.remove("in"); setTimeout(function(){ menu.classList.add("hidden"); }, 420); }
  document.body.classList.add("post-landing");
}

// Экран анализа → меню.
function backToMenu() {
  document.getElementById("analysisView").classList.add("hidden");
  document.getElementById("uploadSection").classList.remove("hidden");
  document.body.classList.remove("analyzing", "post-landing");
  var menu = document.getElementById("menuScreen");
  if (menu) { menu.classList.remove("hidden"); requestAnimationFrame(function(){ menu.classList.add("in"); }); }
}

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
      var tr = document.getElementById("toneRow");
      if (tr) tr.classList.remove("hidden");
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
  // Соглашение, затем памятка по съёмке, затем сам анализ — см. runWithGates.
  if (runWithGates(runAnalysis)) runAnalysis();
});

function runAnalysis() {
  if (!frontImg) return;
  clearReport();
  errorBox.classList.add("hidden");
  resultsDiv.classList.add("hidden");
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  document.body.classList.add("analyzing");
  loadingCard.classList.remove("hidden");
  processImage(frontImg, sideImg);
}

// Кнопки навигации меню/анализа
(function wireNav(){
  var go = document.getElementById("menuGoBtn");
  if (go) go.addEventListener("click", goToAnalysis);
  var toMenu = document.getElementById("toMenuBtn");
  if (toMenu) toMenu.addEventListener("click", backToMenu);
  var uploadToMenu = document.getElementById("uploadToMenuBtn");
  if (uploadToMenu) uploadToMenu.addEventListener("click", backToMenu);
})();

// Кнопка «покачивается» в сторону курсора, но остаётся на месте (без сдвига).
function magnetize(el, maxTilt) {
  if (!el) return;
  maxTilt = maxTilt || 3;
  el.addEventListener("mousemove", function(e) {
    var r = el.getBoundingClientRect();
    var mx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);   // -1..1
    var my = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);  // -1..1
    var rotate = Math.max(-maxTilt, Math.min(maxTilt, mx * maxTilt));
    var scale = 1 + Math.min(Math.abs(my), 1) * 0.015;
    el.style.transform = "rotate(" + rotate + "deg) scale(" + scale + ")";
  });
  el.addEventListener("mouseleave", function() {
    el.style.transform = "";
  });
}
magnetize(document.getElementById("menuGoBtn"));
magnetize(document.getElementById("menuCompareBtn"));

function showConsent() {
  var m = document.getElementById("consentModal");
  if (m) m.classList.remove("hidden");
}

/* ═══════════ Соглашение и памятка по съёмке: строгая очередь ═══════════
   Два окна никогда не показываются одновременно. Порядок всегда один:
   сначала соглашение (если ещё не принято), потом памятка (если её ещё не
   видели), и только затем сам запуск. Куда идти дальше, помнит _afterGates —
   поэтому и анализ, и дуэль пользуются одним и тем же механизмом. */
var TIPS_KEY = "fm-tips-v1";
var _afterGates = null;

function gatesPassed() {
  return localStorage.getItem("fm-consent-v2") === "1" &&
         localStorage.getItem(TIPS_KEY) === "1";
}

// Вызывать вместо прямого запуска. Возвращает true, если можно идти дальше.
function runWithGates(next) {
  _afterGates = next;
  if (localStorage.getItem("fm-consent-v2") !== "1") { showConsent(); return false; }
  if (localStorage.getItem(TIPS_KEY) !== "1")        { showTips();    return false; }
  return true;
}

function showTips() {
  var m = document.getElementById("tipsModal");
  if (!m) { finishGates(); return; }
  m.classList.remove("hidden");
}

function finishGates() {
  var next = _afterGates;
  _afterGates = null;
  if (typeof next === "function") next();
}

(function initTips() {
  var modal = document.getElementById("tipsModal");
  if (!modal) return;
  var go = document.getElementById("tipsGo");
  var back = document.getElementById("tipsBack");
  if (go) go.addEventListener("click", function () {
    localStorage.setItem(TIPS_KEY, "1");
    modal.classList.add("hidden");
    finishGates();
  });
  // «Назад» закрывает памятку и НЕ запускает анализ: человек мог захотеть
  // переснять фото. Флаг при этом не ставим — покажем ещё раз.
  if (back) back.addEventListener("click", function () {
    modal.classList.add("hidden");
    _afterGates = null;
  });
})();

// Ссылка «как фотографироваться» — открывает памятку принудительно, без запуска.
window.fmShowTips = function () {
  _afterGates = null;
  var m = document.getElementById("tipsModal");
  if (m) m.classList.remove("hidden");
};

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
    localStorage.setItem("fm-consent-v2", "1");
    localStorage.setItem("fm-consent-date", new Date().toISOString());
    modal.classList.add("hidden");
    // Дальше по очереди: памятка по съёмке, потом то, что ждало (анализ или дуэль).
    if (localStorage.getItem(TIPS_KEY) !== "1") showTips();
    else finishGates();
  });
  decline.addEventListener("click", function() { modal.classList.add("hidden"); _afterGates = null; });
})();

resetBtn.addEventListener("click", function() {
  localStorage.removeItem("fm-view");
  uploadSection.classList.remove("hidden");
  analysisView.classList.add("hidden");
  document.body.classList.remove("analyzing");
  resultsDiv.classList.add("hidden");
  loadingCard.classList.add("hidden");
  errorBox.classList.add("hidden");
  fileInput.value = ""; sideInput.value = "";
  cleanImageCanvas = null; cleanSideCanvas = null; window.cleanImageCanvas = null;
  frontImg = null; sideImg = null;
  document.getElementById("frontThumb").classList.add("hidden");
  document.getElementById("frontPlaceholder").classList.remove("hidden");
  document.getElementById("sideThumb").classList.add("hidden");
  document.getElementById("sidePlaceholder").classList.remove("hidden");
  analyzeBtn.classList.add("hidden");
  var sb = document.getElementById("shareBtn");
  if (sb) sb.classList.add("hidden");
  var tb = document.getElementById("tgCardBtn");
  if (tb) tb.classList.add("hidden");
  var cb = document.getElementById("toCompareBtn");
  if (cb) cb.classList.add("hidden");
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
  hideTeaserUpsell();

  var num  = document.getElementById("overallScoreNum");
  if (num) { num.textContent = "--"; num.style.color = ""; }
  var desc = document.getElementById("overallDesc");
  if (desc) desc.textContent = "";
  var cats = document.getElementById("categoryScores");
  if (cats) cats.innerHTML = "";
  var radar = document.getElementById("radarBlock");
  if (radar) radar.classList.add("hidden");
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
// cardId по умолчанию — основной анализ (#aiLoading); передаётся "cmpLoading" для Who Moggs —
// та же анимация, другой контейнер (подэлементы находятся по классу, а не id, т.к. на странице
// одновременно есть обе HUD-карточки и id должны быть уникальны).
function startAIHUD(hasSide, cardId) {
  var card      = document.getElementById(cardId || "aiLoading");
  var phaseEl   = card.querySelector(".hud-phase");
  var fillEl    = card.querySelector(".hud-bar-fill");
  var pctEl     = card.querySelector(".hud-bar-pct");
  var streamEl  = card.querySelector(".hud-stream");
  var sideLabel = card.querySelector(".hud-label-side");

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

function stopAIHUD(cardId) {
  if (_hudRAF)        { cancelAnimationFrame(_hudRAF); _hudRAF = null; }
  if (_hudPhaseTimer) { clearTimeout(_hudPhaseTimer); _hudPhaseTimer = null; }
  var card   = document.getElementById(cardId || "aiLoading");
  var fillEl = card ? card.querySelector(".hud-bar-fill") : null;
  var pctEl  = card ? card.querySelector(".hud-bar-pct") : null;
  if (fillEl) { fillEl.style.transition = "width .3s ease"; fillEl.style.width = "100%"; }
  if (pctEl)  pctEl.textContent = "100%";
  setTimeout(function() {
    if (card) card.classList.add("hidden");
  }, 380);
}

// -- Face detection: MediaPipe Tasks FaceLandmarker (IMAGE mode) -------
// IMAGE mode is purpose-built for still photos (no video tracking), so the
// 468/478-point mesh lands accurately on the face. Same canonical topology
// as legacy FaceMesh, so all landmark indices below stay valid.
const TASKS_VISION = "./vendor/mediapipe/vision_bundle.mjs";
async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  const vision = await import(TASKS_VISION);
  const fileset = await vision.FilesetResolver.forVisionTasks(
    "./vendor/mediapipe/wasm"
  );
  faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: "./vendor/mediapipe/face_landmarker.task",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    // Матрица положения головы. Нужна, чтобы знать, как человек держал камеру:
    // наклон вверх-вниз искажает все вертикальные отношения сильнее, чем реальная
    // разница между людьми, и без поправки замер об этом молчит.
    outputFacialTransformationMatrixes: true,
  });
  return faceLandmarker;
}

// Разбор матрицы 4x4 (по столбцам) в углы поворота головы, в градусах.
// Столбцы матрицы — это оси головы, выраженные в системе камеры: нулевой
// столбец смотрит вправо по лицу, второй — вперёд из лица. Считаем углы прямо
// по ним, а не через последовательность Эйлера: у той порядок осей неоднозначен
// и легко перепутать знак.
function headPose(matrixData) {
  if (!matrixData || matrixData.length < 16) return null;
  var m  = matrixData;
  var xh = { x: m[0], y: m[1], z: m[2]  };   // ось «вправо» по лицу
  var zh = { x: m[8], y: m[9], z: m[10] };   // ось «вперёд» из лица
  var deg = 180 / Math.PI;
  var yaw   = Math.atan2(zh.x, zh.z) * deg;                                  // поворот вбок
  var pitch = Math.atan2(-zh.y, Math.hypot(zh.x, zh.z)) * deg;               // наклон вверх-вниз
  var roll  = Math.atan2(xh.y, xh.x) * deg;                                  // завал вбок
  // Суммарное отклонение от анфаса: угол между осью лица и осью камеры.
  // Не зависит ни от порядка осей, ни от знаков — удобно как мера доверия.
  var offFrontal = Math.acos(Math.max(-1, Math.min(1, zh.z / (Math.hypot(zh.x, zh.y, zh.z) || 1)))) * deg;
  return { yaw: yaw, pitch: pitch, roll: roll, offFrontal: offFrontal };
}

// -- Face metrics ------------------------------------------------------
function _dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Нормализованные координаты MediaPipe -> пиксели кадра. Основной поток делает
// это сам сразу после detect(); helper нужен стенду _geom.html, который работает
// с сырым результатом. Без перевода x и y измеряются в разных единицах и любое
// отношение «высота к ширине» врёт на соотношение сторон кадра.
function _toPixels(lm, w, h) {
  return lm.map(function (p) { return { x: p.x * w, y: p.y * h, z: p.z }; });
}

// Ширину скул берём по 227/447, а не по 234/454. Точки 234/454 лежат почти у
// ушей и на 2.4 условных единицы ДАЛЬШЕ от камеры, чем виски и челюсть. На
// селфи с вытянутой руки перспектива увеличивает ближнее и сжимает дальнее,
// поэтому скулы «худели» и любое лицо получало широкий лоб при узкой челюсти —
// то есть форму heart. Пара 227/447 сидит на той же глубине, что и виски
// (z -0.05 против +0.10), и на той же высоте, что 234/454. Отношение лоб/скулы
// с ней меняется на 0.5% в диапазоне 25-100 см вместо прежних 8%.
var LM_CHEEK_L = 227, LM_CHEEK_R = 447;

function computeFaceMetrics(lm) {
  var cheekboneWidth = _dist(lm[LM_CHEEK_L], lm[LM_CHEEK_R]);
  var jawWidth       = _dist(lm[58],  lm[288]);
  var foreheadWidth  = _dist(lm[21],  lm[251]);
  var faceHeight     = _dist(lm[10],  lm[152]);
  // fWHR по канону: ширина скул делится на высоту от ВЕРХНЕГО ВЕКА до верхней губы.
  // Раньше высота бралась от глабеллы (точка 9) — она сидит заметно выше века,
  // знаменатель выходил больше, и отношение всегда занижалось: у эталонного лица
  // получалось 1.45 при том, что промпт называл модели нормой 1.9-2.1. То есть
  // любое лицо выглядело для неё резко ниже нормы. По верхним векам (159/386)
  // эталон даёт 1.885, что и есть каноническое значение.
  var lidY  = (lm[159].y + lm[386].y) / 2;
  var fwhrH = Math.abs(lm[13].y - lidY);
  var widthHeightRatio = fwhrH > 0 ? cheekboneWidth / fwhrH : 1.9;

  // Симметрия по НАСТОЯЩЕЙ средней линии лица (нос/лоб/подбородок), а не по
  // средней точке самих парных точек (старый баг: cx брался как середина
  // пары → расстояния всегда равны → симметрия всегда ~идеальна → завышение).
  //
  // Перед замером разворачиваем лицо в вертикаль. Раньше поправку на наклон
  // головы получала только горизонтальная часть (через slope), а вертикальная
  // считала |L.y - R.y| как есть — и наклон сам по себе давал огромный перекос
  // по каждой паре. Идеально симметричная модель, наклонённая на 5 градусов,
  // получала 47%, на 10 градусов — 40%, то есть упиралась в пол шкалы. При этом
  // человек просто держал телефон под углом.
  var axisTop = lm[10] || lm[168], axisBot = lm[152];
  var ang = (axisTop && axisBot) ? Math.atan2(axisBot.x - axisTop.x, axisBot.y - axisTop.y) : 0;
  var ca = Math.cos(ang), sa = Math.sin(ang);
  var pivot = axisBot || { x: 0, y: 0 };
  function upright(p) {
    var dx = p.x - pivot.x, dy = p.y - pivot.y;
    // Поворот вокруг подбородка: ось лица становится строго вертикальной.
    return { x: pivot.x + dx * ca - dy * sa, y: pivot.y + dx * sa + dy * ca };
  }
  var U = lm.map(upright);

  var midL = [U[10], U[168], U[1], U[152], U[0]].filter(Boolean);
  var cx = 0; midL.forEach(function(p){ cx += p.x; }); cx /= (midL.length || 1);

  var PAIRS = [[33,263],[133,362],[61,291],[58,288],[LM_CHEEK_L,LM_CHEEK_R],[70,300],[132,361],[205,425]];
  var hSum = 0, vSum = 0, n = 0;
  PAIRS.forEach(function(pr){
    var L = U[pr[0]], R = U[pr[1]];
    if (!L || !R) return;
    var dL = Math.abs(L.x - cx);
    var dR = Math.abs(R.x - cx);
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

  // Позу головы сюда не считаем: она приходит из матрицы MediaPipe и
  // проставляется в metrics.pose в processImage — там она точнее.
  return { cheekboneWidth: cheekboneWidth, jawWidth: jawWidth, foreheadWidth: foreheadWidth, faceHeight: faceHeight, widthHeightRatio: widthHeightRatio, symmetryScore: symmetryScore, pose: null };
}


/* ═══════════ Геометрия, которую считаем сами ═══════════
   Пропорции и тир не спрашиваем у модели: это арифметика по 468 точкам.
   Считая их на клиенте, мы (а) не платим за токены, (б) получаем одинаковый
   ответ для одного и того же лица, а не новый каждый раз. Так же устроено
   у конкурентов с ценой в три рубля за анализ. */

// [ключ, подпись RU, подпись EN, среднее по эталону, направление]
//
// Средние значения сняты с эталонной модели лица MediaPipe (canonical_face_model),
// спроецированной с 50 см — типичное расстояние для селфи.
//
// Направление важнее самих чисел. Раньше коридор был симметричен вокруг среднего,
// и любое отклонение считалось минусом — но это логика антропометрии, а не
// лукизма. Половина отношений направленные: длинные глаза относительно промежутка
// между ними или скулы шире лба — это преимущество, а не дефект, хотя от среднего
// они отклоняются сильно.
//
//   'lower'  — чем меньше, тем выигрышнее
//   'higher' — чем больше, тем выигрышнее
//   'mid'    — выигрышна середина, плохи оба края
//
// Челюсть: широкая идёт в плюс всегда, по решению владельца (13.08.2026).
// Отношение тут скулы/челюсть, поэтому «шире челюсть» — это МЕНЬШЕЕ значение,
// то есть направление 'lower'. Строго говоря, признак половой: массивная
// челюсть читается как мужская черта, сужение к подбородку — как женская, а
// пол приложение не спрашивает. Но аудитория у нас мужская, и для неё широкая
// челюсть — однозначно желаемое.
// Шестой столбец — меряется ли отношение по вертикали. Такие строки портит
// наклон камеры, и на сильно задранном кадре вердикт по ним не выдаём.
var PROP_DEFS = [
  ['lenWidth',  'Длина лица к ширине',   'Face length to width',   1.337, 'mid',    true],
  ['noseFace',  'Длина носа к лицу',     'Nose to face length',    0.312, 'lower',  true],
  ['eyeGap',    'Расстояние между глаз', 'Intercanthal ratio',     1.468, 'lower',  false],
  ['lipsFace',  'Ширина губ к лицу',     'Mouth to face width',    0.371, 'higher', true],
  ['foreCheek', 'Ширина лба к скулам',   'Forehead to cheekbones', 0.974, 'lower',  false],
  ['cheekJaw',  'Ширина челюсти к скулам','Jaw to cheekbones',     0.888, 'higher', false],
];

// За этим наклоном вертикальные отношения уже описывают ракурс, а не лицо:
// на снимке с наклоном 23.8° длина носа дала 0.362 против 0.30-0.33 на ровных
// кадрах того же человека.
// 10, а не 15: на замере 15.08 кадр с наклоном 7.9° прошёл без пометки, хотя длина
// лица там уже была занижена на 4% — порог стоял выше реальной погрешности.
var PITCH_LIMIT = 10;

// Поправку на наклон камеры я пробовал и УБРАЛ. Оставляю запись, чтобы не
// потратить время на неё второй раз.
//
// Идея была такая: повернуть эталонную модель MediaPipe с шагом 3 градуса,
// записать, во сколько раз уезжает каждое вертикальное отношение, и делить на
// этот множитель. На самой модели работало идеально — разброс длины лица падал
// с 12% до 0.4%, fWHR с 20% до 0.1%.
//
// На живых лицах (три ракурса одного человека, 13.08.2026) не сработало:
//   длина лица  разброс 8.2% -> 8.4%   поправка вдвое сильнее нужной
//   fWHR        разброс 13%  -> 19%    поправка ушла В ПРОТИВОПОЛОЖНУЮ сторону
// Причин две. Модель поворачивается вокруг центра лица, а живой человек — вокруг
// шеи, и заодно меняет расстояние до камеры. А fWHR меряется до края верхнего
// века: когда человек задирает голову, он ещё и шире открывает глаза, и это
// движение века больше самого эффекта наклона.
//
// Поза головы всё равно считается (headPose) и уходит модели в промпт — знать
// про кривой ракурс полезно, даже если чинить его этим способом нельзя.

function computeProportions(lm, pose) {
  var faceH  = _dist(lm[10], lm[152]);
  var cheekW = _dist(lm[LM_CHEEK_L], lm[LM_CHEEK_R]);
  var jawW   = _dist(lm[58], lm[288]);
  var foreW  = _dist(lm[21], lm[251]);
  var noseL  = _dist(lm[168], lm[2]);
  var inter  = _dist(lm[133], lm[362]);
  var eyeL   = _dist(lm[33], lm[133]);
  var eyeR   = _dist(lm[362], lm[263]);
  var eyeAvg = (eyeL + eyeR) / 2;
  var lipsW  = _dist(lm[61], lm[291]);
  var raw = {
    lenWidth:  cheekW ? faceH / cheekW : 0,
    noseFace:  faceH ? noseL / faceH : 0,
    eyeGap:    eyeAvg ? inter / eyeAvg : 0,
    lipsFace:  cheekW ? lipsW / cheekW : 0,
    foreCheek: cheekW ? foreW / cheekW : 0,
    // Челюсть к скулам, а не наоборот: так больше значит шире челюсть, и
    // направление «больше — лучше» читается без выворачивания наизнанку.
    cheekJaw:  cheekW ? jawW / cheekW : 0,
  };
  var ru = lang() === 'ru';
  // Порог заметности: 10% от среднего.
  //
  // Раньше стояло 6%, но это оказалось внутри собственного шума замера. Проверка
  // на трёх ракурсах одного лица (13.08.2026) показала: даже отношения, на которые
  // ракурс влиять не должен — лоб/скулы, челюсть/скулы, расстояние между глаз —
  // разъезжаются между снимками на 4.5-5.9%. Это складывается из точности самого
  // MediaPipe, мимики и освещения, и убрать это нельзя. При пороге 6% человек
  // получал «Сильную сторону» на одном фото и «Норму» на другом, хотя лицо
  // то же самое. 10% гарантируют, что вердикт описывает лицо, а не съёмку.
  var NEAR = 0.10;
  var WORD = {
    plus:  ru ? 'Сильная сторона' : 'Strength',
    norm:  ru ? 'Норма'           : 'Average',
    minus: ru ? 'Слабое место'    : 'Weak spot',
  };
  var tilted = pose && Math.abs(pose.pitch) > PITCH_LIMIT;
  return PROP_DEFS.map(function (d) {
    var v = raw[d[0]], avg = d[3], dir = d[4];
    var rel = avg ? (v - avg) / avg : 0;   // относительное отклонение от среднего
    var level;
    // Кадр снят сверху или снизу — вертикальные отношения врут, молчим.
    if (tilted && d[5]) {
      return { label: ru ? d[1] : d[2], value: v, avg: avg, level: 'plain',
               verdict: ru ? 'Мешает ракурс' : 'Angle in the way' };
    }
    if (Math.abs(rel) < NEAR)      level = 'norm';
    else if (dir === 'mid')        level = Math.abs(rel) < NEAR * 2 ? 'norm' : 'minus';
    else if (dir === 'lower')      level = rel < 0 ? 'plus' : 'minus';
    else /* higher */              level = rel > 0 ? 'plus' : 'minus';
    return { label: ru ? d[1] : d[2], value: v, avg: avg, verdict: WORD[level], level: level };
  });
}

// Тир по общему баллу. Шкала та же, что на странице psl-tiers.html, чтобы
// человек не встретил в отчёте одно название, а в статье другое.
// Тир по общему баллу — ровно та шкала, что описана в psl-tiers.html:
// тир равен ЦЕЛОЙ ЧАСТИ балла. Раньше здесь стояли границы по половинкам
// (8.5, 7.5, 6.5...) и выдуманный тир Sub-5, которого нет ни в статье, ни на
// looksmax.org: человек читал в отчёте одно название, а в статье другое.
var PSL_TIERS = [
  [9.5, 'trueadam', 'True Adam'],
  [9.0, 'adamlite', 'Adam-lite'],
  [8.0, 'chad',     'Chad'],
  [7.0, 'chadlite', 'Chad-Lite'],
  [6.0, 'htn',      'HTN'],
  [5.0, 'mtn',      'MTN'],
  [4.0, 'ltn',      'LTN'],
  [0,   'sub3',     'Sub-3'],
];

function pslTier(score) {
  for (var i = 0; i < PSL_TIERS.length; i++) {
    if (score >= PSL_TIERS[i][0]) return { key: PSL_TIERS[i][1], label: PSL_TIERS[i][2] };
  }
  return { key: 'sub3', label: 'Sub-3' };
}

// Короткие подписи для лучей диаграммы: полные названия категорий по краям
// восьмиугольника не помещаются и налезают друг на друга.
var RADAR_SHORT = {
  ru: ['Симметрия', 'Глаза', 'Мидфейс', 'Челюсть', 'Нос', 'Губы', 'Кожа', 'Груминг'],
  en: ['Symmetry', 'Eyes', 'Midface', 'Jawline', 'Nose', 'Lips', 'Skin', 'Grooming'],
};

// Восьмиугольник по баллам категорий. Своих данных не считает — берёт те же
// значения, что и полосы ниже, поэтому расходиться с ними не может.
function renderRadar(cats) {
  var host = document.getElementById('radarBlock');
  var cv   = document.getElementById('radarCanvas');
  if (!host || !cv || !cats || cats.length < 3) return;

  var ru = lang() === 'ru';
  var names = RADAR_SHORT[ru ? 'ru' : 'en'];
  var vals = cats.slice(0, 8).map(function (c) { return Math.max(0, Math.min(10, c.score)); });
  var n = vals.length;

  var g = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  var cx = W / 2, cy = H / 2 + 6, R = W * 0.325;
  g.clearRect(0, 0, W, H);

  // Угол i-го луча: начинаем сверху и идём по часовой стрелке.
  function ang(i) { return -Math.PI / 2 + (i / n) * Math.PI * 2; }
  function pt(i, r) { return [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r]; }

  // Сетка: кольца по 2 балла + лучи.
  g.lineWidth = 1;
  for (var ring = 1; ring <= 5; ring++) {
    var rr = R * ring / 5;
    g.beginPath();
    for (var i = 0; i <= n; i++) { var p = pt(i % n, rr); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }
    g.strokeStyle = ring === 5 ? 'rgba(196,164,107,.32)' : 'rgba(255,255,255,.07)';
    g.stroke();
  }
  for (var j = 0; j < n; j++) {
    var e = pt(j, R);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(e[0], e[1]);
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.stroke();
  }

  // Сама фигура.
  g.beginPath();
  vals.forEach(function (v, i) {
    var p = pt(i, R * v / 10);
    i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]);
  });
  g.closePath();
  var fill = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  fill.addColorStop(0, 'rgba(232,207,150,.34)');
  fill.addColorStop(1, 'rgba(196,164,107,.12)');
  g.fillStyle = fill; g.fill();
  g.strokeStyle = '#e8cf96'; g.lineWidth = 2; g.stroke();

  // Точки на вершинах.
  vals.forEach(function (v, i) {
    var p = pt(i, R * v / 10);
    g.beginPath(); g.arc(p[0], p[1], 4, 0, Math.PI * 2);
    g.fillStyle = '#e8cf96'; g.fill();
  });

  // Подписи с баллами. Выравнивание зависит от того, слева луч или справа,
  // иначе текст наезжает на фигуру.
  g.font = '400 19px "Cormorant Garamond", Georgia, serif';
  g.textBaseline = 'middle';
  vals.forEach(function (v, i) {
    var a = ang(i), lx = cx + Math.cos(a) * (R + 34), ly = cy + Math.sin(a) * (R + 30);
    var cosA = Math.cos(a);
    g.textAlign = Math.abs(cosA) < 0.25 ? 'center' : (cosA > 0 ? 'left' : 'right');
    g.fillStyle = 'rgba(240,236,230,.72)';
    g.fillText(names[i] || '', lx, ly - 11);
    g.fillStyle = '#e8cf96';
    g.font = '400 21px "Cormorant Garamond", Georgia, serif';
    g.fillText(v.toFixed(1), lx, ly + 12);
    g.font = '400 19px "Cormorant Garamond", Georgia, serif';
  });

  var ttl = document.getElementById('radarTitle');
  if (ttl) ttl.textContent = ru ? 'Профиль лица' : 'Face profile';
  host.classList.remove('hidden');
}

function renderProportions(lm, pose) {
  var host = document.getElementById('propBlock');
  if (!host || !lm) return;
  var rows = computeProportions(lm, pose);
  host.innerHTML =
    '<span class="eyebrow">' + (lang() === 'ru' ? 'Пропорции' : 'Proportions') + '</span>' +
    rows.map(function (r) {
      // Рядом с числом — среднее по эталонному лицу: без него человек не знает,
      // много это или мало, и вердикт выглядит взявшимся из воздуха.
      return '<div class="prop-row"><span class="prop-name">' + r.label + '</span>' +
             '<span class="prop-val">' + r.value.toFixed(2) +
             '<i class="prop-ref">' + (lang() === 'ru' ? 'среднее ' : 'avg ') +
             r.avg.toFixed(2) + '</i></span>' +
             '<span class="prop-tag ' + r.level + '">' + r.verdict + '</span></div>';
    }).join('') +
    '<p class="prop-note">' + (lang() === 'ru'
      ? 'Посчитано по 468 точкам лица.'
      : 'Measured from 468 facial landmarks.') + '</p>';
  host.classList.remove('hidden');
}

function classifyFaceShape(metrics) {
  // Пороги отсчитываются от эталонного лица MediaPipe, спроецированного с 50 см:
  // лоб/скулы 0.974, челюсть/скулы 0.888, длина/ширина 1.337. Форма — это
  // отклонение ОТ этих величин, а не абсолютные числа из учебников.
  //
  // Старая версия ставила порог heart на «лоб >= 0.98 от скул». С прежними
  // точками скул это условие выполнялось ровно на дистанции 30-45 см, то есть
  // на любом селфи, и heart получали практически все.
  var cb   = metrics.cheekboneWidth || 1;
  var jaw  = metrics.jawWidth       || 1;
  var fore = metrics.foreheadWidth  || 1;
  var lengthRatio = metrics.faceHeight / cb;   // эталон 1.34
  var foreCb = fore / cb;                       // эталон 0.97
  var jawCb  = jaw  / cb;                       // эталон 0.89

  var shape;
  if      (lengthRatio >= 1.50)                       shape = "oblong";   // заметно длиннее эталона
  else if (foreCb >= 1.02 && jawCb <= 0.85)           shape = "heart";    // лоб шире обычного, челюсть уже
  else if (foreCb <= 0.93 && jawCb <= 0.85)           shape = "diamond";  // скулы шире и лба, и челюсти
  else if (jawCb >= 0.95)                             shape = "square";   // челюсть почти вровень со скулами
  else if (lengthRatio <= 1.20 && jawCb >= 0.90)      shape = "round";    // короткое и мягкое
  else                                                shape = "oval";     // сбалансированное (по умолчанию)
  return { shape: shape };
}

// -- Process image -----------------------------------------------------
async function processImage(img, sideImage) {
  try {
    var fl = await initFaceLandmarker();
    canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    cleanImageCanvas = document.createElement("canvas");
    window.cleanImageCanvas = cleanImageCanvas;   // нужен рендеру видео (sharevideo.js)
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
      showError(t("errNoFace")); return;
    }
    var raw = results.faceLandmarks[0];
    var w   = canvas.width, h = canvas.height;
    // z у MediaPipe примерно в том же масштабе, что x, поэтому множитель тот же.
    // Нужен, чтобы оценить поворот головы.
    var lm  = raw.map(function(p) { return { x: p.x * w, y: p.y * h, z: p.z * w }; });
    // Рамка лица в пикселях (не нормализованных 0..1!) для правильного кропа share-карточки.
    (function(){
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (var i = 0; i < lm.length; i++) {
        if (lm[i].x < minx) minx = lm[i].x; if (lm[i].x > maxx) maxx = lm[i].x;
        if (lm[i].y < miny) miny = lm[i].y; if (lm[i].y > maxy) maxy = lm[i].y;
      }
      window._fmFaceBox = { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
    })();
    // lm уже в пикселях кадра (см. raw.map выше), поэтому замеряем прямо по нему.
    var metrics   = computeFaceMetrics(lm);
    var mats = results.facialTransformationMatrixes;
    metrics.pose = (mats && mats[0]) ? headPose(mats[0].data) : null;
    var shapeInfo = classifyFaceShape(metrics);
    window._fmLandmarks = lm;          // карточка, блок пропорций и рендер видео
    window._fmMetrics   = metrics;
    runFaceAnimation(lm, metrics, function() {
      resultsDiv.classList.remove("hidden");
      gateThenAI(metrics, shapeInfo);
    });
  } catch (err) {
    console.error(err);
    showError(t("errGeneric"));
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
/* ═══════════ Общая калибровка балла ═══════════
   Один и тот же текст уходит и в обычный анализ, и в Who Moggs. Раньше
   калибровка была только в обычном анализе, а в сравнении стояло голое
   «оцени по шкале PSL 1-10» — модель там скатывалась к своей обычной
   завышенной оценке, и одно и то же лицо получало заметно разные баллы
   в двух режимах. Тиры тоже прописаны прямо здесь, чтобы балл и подпись
   под ним не расходились. */
var PSL_SCALE_PROMPT =
  "PSL SCORING SCALE -- use the FULL 1-10 range and ACTUALLY DIFFERENTIATE (do not give everything the same score). "
  + "The score maps onto these tiers, and the tier shown to the user is the WHOLE part of the score, so the decimal must be deliberate:\n"
  + "- 0-3.9 Sub-3: pronounced structural disproportion in several areas at once\n"
  + "- 4-4.9 LTN: clear weakness in one or two areas, no severe disproportion\n"
  + "- 5-5.9 MTN: the centre of the bell curve, ordinary, no marked strengths or weaknesses -- most people belong here\n"
  + "- 6-6.9 HTN: above average, decent harmony, short of elite\n"
  + "- 7-7.9 Chad-Lite: several strong features coincide, stands out in a crowd\n"
  + "- 8-8.9 Chad: model-tier features, consistent across every key category\n"
  + "- 9-9.4 Adam-lite: extremely rare, near-perfect consistency of proportion and symmetry\n"
  + "- 9.5-10 True Adam: essentially theoretical\n"
  + "MOST ordinary faces honestly land in 4.0-6.0. Defaulting everyone to 5.5-6 is a failure. "
  + "When torn between two adjacent scores for an ORDINARY face, pick the lower one -- but this rule applies in the middle of the range only, NEVER at the top. "
  + "\n\nTHE 6.0 GATE -- crossing from MTN into HTN is a real claim, not a rounding choice. Before you write any score of 6.0 or higher, answer this to yourself: walking down a busy street, would this face be noticeably better looking than roughly three out of every four people you pass? If the honest answer is no, the score belongs in the 5s. "
  + "An unremarkable but perfectly pleasant face -- clean skin, nothing wrong with it, nothing that turns a head -- is 5.2-5.7, NOT 6.5. "
  + "6.5-6.8 is not a polite landing zone for faces you don't want to judge harshly; it is reserved for people who visibly stand out. "
  + "As a sanity check on your own calibration: out of a hundred random photos from the street, expect roughly 10 below 4.5, 45 in the 5s, 25 in the 6s, 15 in the 7s, and 5 at 8 or above. If you find yourself putting most ordinary uploads in the 6s, you are a full tier too generous.\n"
  + "\nWORKED MIDDLE ANCHORS -- match the face in front of you against these before choosing a number:\n"
  + "- A young man in a phone selfie, clean skin, even symmetry, straight nose, nothing structurally wrong, but soft jaw definition and flat cheekbones, and nobody would look twice: 5.3. Clean skin and the absence of flaws do NOT earn a 6 -- an absence of weaknesses is exactly what MTN means.\n"
  + "- The same face plus one genuine standout feature -- real gonial definition, or hunter eyes with positive tilt, or high projected cheekbones: 6.2. ONE clear structural strength is what buys entry to the 6s.\n"
  + "- Two or three such strengths coinciding, the person friends call good-looking: 7.1.\n"
  + "- Agency-signable bone structure across the board: 8.2.\n"
  + "Note where the jump happens: 5 to 6 requires a NAMED structural strength you can point to in this photo, not merely tidy skin, decent grooming, or the lack of anything ugly. If you cannot name that one feature in a single phrase, the face is a 5.\n"
  + "\n\nTOP-END ANCHORS -- these matter as much as the harshness above, and getting them wrong is just as bad a failure:\n"
  + "- A face that could realistically be signed by a fashion agency -- sharp defined jawline, prominent cheekbones, hunter eyes, clean skin, strong harmony -- is 7.5-8.5 overall. It MUST NOT land in the 5s. If you find yourself scoring an obviously model-tier face below 7, you have made a mistake: re-check and raise it.\n"
  + "- An actual working professional model belongs at 8+.\n"
  + "- Someone clearly the most attractive person in a large room is 7+.\n"
  + "Underrating a genuinely beautiful face is exactly as wrong as inflating an ordinary one. Both destroy the tool's credibility.\n\n"
  + "WEIGHTING -- the overall score is NOT a plain average of the categories. Bone structure and harmony (jawline, midface, eyes, symmetry, overall proportion) dominate it. Skin, grooming and styling are SURFACE traits: they can move the overall by a few tenths, never by whole points. A structurally elite face with a bad haircut is still an elite face and still scores 7.5+.\n\n"
  + "GROOMING IS NOT FASHION TASTE: score the STATE of grooming (hair health, brow tidiness, beard upkeep, skin care), not whether the style is to your taste. A deliberately messy or long editorial haircut is a STYLE CHOICE, not a defect -- do not punish it. Reserve low grooming scores for genuine neglect.\n\n"
  + "Use one decimal place (5.8, 6.3, 4.6, 8.4). If two categories genuinely deserve the same number, give them the same number -- do NOT nudge a score up or down just to make it look distinct.";

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

  // Какое именно лицо оценивать. На фото рядом может стоять второй человек, и
  // модель тогда не знает, кого разбирать: в одном прогоне брала одного, в
  // другом — другого, отсюда и расхождение баллов. Рамку даёт детектор, она
  // всегда указывает на то же лицо, по которому посчитана вся геометрия.
  var targetFaceNote = "";
  // cleanImageCanvas по имени, а не через window: переменная объявлена через let
  // и свойством window не становится — иначе сюда попадал пустой canvas 300x150
  // и проценты выходили трёхзначными.
  var fb = window._fmFaceBox;
  var ic = (typeof cleanImageCanvas !== 'undefined' && cleanImageCanvas) ? cleanImageCanvas : canvas;
  if (fb && ic && ic.width) {
    var cxPct = Math.round((fb.x + fb.w / 2) / ic.width * 100);
    var cyPct = Math.round((fb.y + fb.h / 2) / ic.height * 100);
    var wPct  = Math.round(fb.w / ic.width * 100);
    targetFaceNote = "WHICH FACE TO ANALYSE: exactly one face is being measured here -- its centre sits at "
      + cxPct + "% of the image width and " + cyPct + "% of its height, and it spans about "
      + wPct + "% of the width. If anyone else is visible in the photo, ignore them completely: "
      + "every score and every observation must describe ONLY that one face.";
  }

  // Как человек держал камеру. Наклон вверх-вниз искажает все вертикальные
  // отношения (длина лица, fWHR, длина носа) на величину до 15-25% — это больше,
  // чем реальная разница между разными людьми. Поворот вбок механически занижает
  // симметрию. Завал вбок мы компенсируем сами, о нём модели знать не нужно.
  var P = metrics.pose;
  var poseNote = "";
  if (P) {
    poseNote = " -- HEAD POSE, read this before judging symmetry or any vertical proportion: turned sideways "
      + Math.round(Math.abs(P.yaw)) + " deg, tipped up/down " + Math.round(Math.abs(P.pitch))
      + " deg, total deviation from a straight-on shot " + Math.round(P.offFrontal) + " deg."
      + " Sideways turn mechanically lowers the symmetry number (roughly -13 points at 10 deg, -35 at 15) without any real asymmetry -- add that back."
      + " Up/down tip compresses or stretches face length, fWHR and nose length by up to 15-25%."
      + (P.offFrontal > 15
          ? " THIS SHOT IS WELL OFF FRONTAL: treat the geometric numbers as unreliable and judge those traits from the photo itself."
          : " This shot is close enough to frontal for the numbers to be trustworthy.");
  }
  var jawInstruction = hasSide
    ? "You are given TWO separate images: the first is the frontal photo, the second is the PROFILE (side view). You MUST use the second photo (profile) to assess gonial angle, ramus height, chin projection, submental angle and nose profile (dorsum, tip projection). In the ДЖОУЛАЙН_MANDIBLE and НОС_NOSE sections, explicitly rely on what is visible in the profile."
    : "Only a frontal photo is given -- no profile is attached. For ДЖОУЛАЙН_MANDIBLE, honestly assess what IS visible from the front: bigonial width, jaw taper, chin width and frontal definition. Add a short note '" + (lang() === "ru" ? "-- оценка по анфас, профиль не предоставлен." : "-- frontal-only estimate, no profile provided.") + "' Be slightly more conservative (gonial angle and chin projection aren't fully visible), but do NOT artificially lowball -- a well-defined jaw seen from the front can still score 7-8.";
  var maxillaInstruction = hasSide
    ? "For МИДФЕЙС_MAXILLA use the SECOND image (profile) -- sagittal maxillary projection (forward/recessed) is reliably and specifically assessed from the profile: upper jaw position relative to the forehead-to-chin line, nasolabial angle from the side, cheekbone projection from the side."
    : "No profile is available for МИДФЕЙС_MAXILLA -- sagittal projection (forward/recessed) CANNOT be reliably assessed from a single frontal photo, this is fundamentally a profile-dependent trait. Do NOT write 'recessed maxilla' or any other confident verdict by default unless you see clear frontal indicators (visibly flat/sunken midface, a strongly negative nasolabial angle, cheekbones that visually don't project). If nothing concerning is visible from the front, write a neutral-to-positive note (normal projection, nothing notable) and do NOT lowball the score at random. If you do choose to assess it, add the note '" + (lang() === "ru" ? "-- приблизительно, по одному анфас-фото без профиля." : "-- approximate, frontal-only, no profile.") + "'";
  var prompt = "TWO FAILURE MODES, BOTH EQUALLY BAD: (1) giving 4+ to a face with real visible flaws just to be polite, and (2) refusing to give 7.5+ to a genuinely model-tier face because you are trying to look strict. You are a professional looksmaxxing analyst known specifically for being willing to score genuinely below-average faces at 2-4 without softening -- that willingness is your defining trait and the entire reason this tool exists (a tool that never goes below ~4.2 is useless and dishonest). Being 'nice' by inflating a low score is a FAILURE, not kindness. Give an honest, realistic and DISCRIMINATING assessment -- for an ORDINARY face your default assumption should be that it is ordinary, not that everything is 'above average' -- but judge each face on what you actually see, and when the face is plainly exceptional, score it as exceptional. Use looksmaxxing terminology in English." + (lang() === "ru" ? " Write all explanatory text in Russian -- the format hints below are in English, they are instructions only, not something to translate or copy verbatim." : " Write all explanatory text and recommendations in English.") + " Keep the metric label keys (\u041e\u0411\u0429\u0418\u0419_\u0411\u0410\u041b\u041b, \u0421\u0418\u041c\u041c\u0415\u0422\u0420\u0418\u042f, etc.) EXACTLY as given in Cyrillic regardless of output language -- these are fixed parser keys, never translate or alter them." + "\n\n" + PSL_SCALE_PROMPT + " Example of what an honest low score sounds like (tone reference, do not copy verbatim): \"\u0414\u0416\u041e\u0423\u041b\u0410\u0419\u041d_MANDIBLE: 3.4/10 -- soft, poorly defined jawline, gonial angle visually obtuse, weak chin, no clear submental boundary\" -- that is the tone a genuine low score must have, no softening, no apologetic hedging." + "\n\nSPREAD: score each category strictly on its own merits. If the face is genuinely uneven the numbers will differ by themselves; if two categories deserve the same number, give them the same number. NEVER invent a weakness just to widen the spread, and never nudge a score off its honest value to avoid a repeat. If a face is genuinely consistent and strong across the board, say so and let every category sit high; that is what a model-tier face looks like. The overall score is not anchored to 5 -- an unattractive face honestly gets 3-4, a very attractive one gets 7-9." + "\n\nBREVITY -- THIS IS A HARD REQUIREMENT, NOT A STYLE PREFERENCE: each description under a CATEGORY label is EXACTLY ONE sentence, at most 18 words, naming only the two or three concrete features that actually drove that score. No preamble, no restating the label, no hedging clauses, no closing summary. This terseness applies ONLY to the 8 category lines -- the recommendations section stays detailed. Do not copy text between sections, do not repeat the overall verdict inside categories, do not duplicate the same observation twice." + "\n\nLOOK CAREFULLY at the actual photo for the cheekbones and overall face shape -- the geometric face-shape label below is only a ROUGH approximation from 2D landmarks and is OFTEN WRONG (it's computed from a handful of 2D points and easily thrown off by head angle/tilt). Determine the real face shape and cheekbone projection ONLY from what you visually see in the photo -- treat the geometric label as unreliable background noise, not a hint to lean on. If your visual read disagrees with the label, IGNORE the label completely and go with what you see." + "\n\nSKIN -- DO NOT INVENT BLEMISHES: only mention acne, scarring, redness or pores if you can ACTUALLY SEE them in the photo. If the skin looks clear/clean, say exactly that and score accordingly high -- never default to mentioning acne/imperfections as a generic checklist item when none are visible. Photo quality/lighting/compression can hide minor texture -- when in doubt, don't invent a flaw that isn't clearly visible." + "\n\nLIGHTING/ANGLE CAUTION: harsh side/back lighting or a steep up/down camera angle can create dramatic shadows that IMITATE a strong jawline/gonial angle/maxilla projection or hooded/hunter eyes, even when the underlying bone structure is average -- mentally picture the same face under neutral frontal lighting before scoring jaw/maxilla/eyes, and don't let shadow alone justify a high score. This cuts both ways -- don't deliberately lowball a face just because it's dramatically lit either, if the strong features are genuinely visible independent of the lighting, score them fairly." + "\n\nSCORE FORMAT -- CRITICAL: instead of 0.0, use a decimal number with EXACTLY ONE digit after the point (5.8, 6.3, 7.1, 4.6, 8.4, and 6.0 is allowed too). Categories MAY share the same number when they honestly deserve it. The number you write next to ОБЩИЙ_БАЛЛ is the one shown to the user, and it must be consistent with your eight category scores -- if every category sits near 5, the overall cannot be 7. Do NOT write square brackets [ ], placeholder words, or hint text in your reply -- replace the hint under each label with your own finished text about this photo." + "\n\nINTERNAL STEP (do not output this step): first mentally describe what you actually see in the photo -- eye shape, cheekbones, skin, nose, hair, proportions -- and only then assign scores consistent with what you observed. The overall score is a weighted impression of the categories, not a random number." + "\n\nCRITICAL -- no generic boilerplate. Base every single observation on what you ACTUALLY SEE in THIS specific photo: this person's real eye shape, hair, skin, exact proportions, distinctive details. Never write a sentence that could apply to any face. Two different people must produce clearly different reports." + "\n\n" + targetFaceNote + "\n\nGeometric data (MediaPipe, APPROXIMATE -- verify against the photo):\n- Approx. face shape (rough, may be wrong): " + shapeInfo.shape + "\n- Facial symmetry: " + sym + "%" + poseNote + "\n- fWHR: " + fwhr + " (masculine ideal 1.9-2.1)\n- Cheekbone-to-jaw taper ratio: " + cbJawRatio + " (measured on our landmark set, where an average face is 1.13; above ~1.20 means a notably tapered jaw, below ~1.05 a wide/square one)\n- Widths relative to bizygomatic (=1.00): forehead " + (metrics.foreheadWidth / (metrics.cheekboneWidth || 1)).toFixed(2) + ", bigonial " + (metrics.jawWidth / (metrics.cheekboneWidth || 1)).toFixed(2) + " -- for reference, an average face measures forehead 0.97 and bigonial 0.89 on these same points\n- Face length to bizygomatic width: " + (metrics.faceHeight / (metrics.cheekboneWidth || 1)).toFixed(2) + " (average face: 1.34)" + "\n\n" + jawInstruction + "\n\n" + maxillaInstruction + "\n\nAnalyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):\n\n\u041f\u0415\u0420\u0426\u0415\u041d\u0422\u0418\u041b\u042c: NN\nWrite ONLY an integer 0-99 and nothing else on this line. HIGHER MEANS BETTER LOOKING. Out of 100 random men of this person's age passing on a busy street, how many would MOST people judge WORSE looking than him -- that is, how many does he BEAT? 50 means dead average, he beats half of them. 90 means he beats nine out of ten. 10 means nine out of ten beat him. Sanity check before you write it: 50 is the honest answer for a perfectly ordinary man, and by definition half of all men score under 50. Judge the face only, ignoring photo quality and styling. Decide this number FIRST, before any score below.\n\n\u041e\u0411\u0429\u0418\u0419_\u0411\u0410\u041b\u041b: 0.0/10\nOverall appearance verdict per the calibration above. Honest but balanced: strengths first, then weaknesses. Exactly 2-3 sentences.\n\n\u0421\u0418\u041c\u041c\u0415\u0422\u0420\u0418\u042f: 0.0/10\nMeasured symmetry (rough 2D landmark approximation) = " + sym + "%. This number is NOISY: even a slight head turn/tilt, camera angle and photo quality understate it for objectively symmetric faces -- it is not a precise 3D measurement of true anatomy. Use it as a SOFT guide, not a rigid formula: 92-100%=8-10, 85-91%=7, 78-84%=6, 70-77%=5, 60-69%=4, below 60%=3 or lower. If the photo shows a slightly turned/tilted head (while the face looks even) -- feel free to adjust the score UP from what the formula gives. But if asymmetry is visible without any head turn (a clear eye/jaw/nose misalignment) -- do NOT inflate, score honestly low. Cite specifics from the photo: orbital tilt, mandibular deviation, visible skew." + "\n\n\u0413\u041b\u0410\u0417\u0410_CANTHAL_TILT: 0.0/10\nName only the 2-3 most decisive of: canthal tilt (positive/negative/neutral), hunter vs prey eyes, lid hooding, orbital rim projection, IPD vs norm, scleral show.\n\n\u041c\u0418\u0414\u0424\u0415\u0419\u0421_MAXILLA: 0.0/10\nName only the 2-3 most decisive of: maxillary projection (forward/recessed), midface length, zygomatic arch, malar eminence, nasolabial angle.\n\n\u0414\u0416\u041e\u0423\u041b\u0410\u0419\u041d_MANDIBLE: 0.0/10\nName only the 2-3 most decisive of: mandible definition, gonial angle (ideal 120-125 deg), ramus height, taper ratio " + cbJawRatio + ", chin projection, submental angle.\n\n\u041d\u041e\u0421_NOSE: 0.0/10\nName only the 2-3 most decisive of: dorsum, tip projection, nasal tip rotation, alar width vs intercanthal distance, NLH, bridge deviation.\n\n\u0413\u0423\u0411\u042b_\u0421\u041a\u0423\u041b\u042b: 0.0/10\nName only the 2-3 most decisive of: lip ratio ~1:1.6, vermillion, philtrum, Cupid's bow, cheekbone projection, malar fat pad.\n\n\u041a\u041e\u0416\u0410: 0.0/10\nTexture, tone evenness, pores, elasticity, approximate skin age -- but only mention acne/scarring/redness if ACTUALLY visible in the photo; if the skin is clear, say so and don't lowball for no reason.\n\n\u0413\u0420\u0423\u041c\u0418\u041d\u0413_STYLE: 0.0/10\nName only the 2-3 most decisive of: hairline, hair density, hairstyle fit, brow grooming, facial hair." + "\n\n\u0420\u0415\u041a\u041e\u041c\u0415\u041d\u0414\u0410\u0426\u0418\u0418:\nGive 8-9 specific, detailed recommendations tailored to this exact face. Each on ONE numbered line, 1-2 sentences explaining WHY it will work for these proportions and what effect it gives. Softmax first (haircut/style matched to face shape, beard/stubble, brows, skincare, posture/posing, flattering photo angles, body fat -- ONLY if the photo actually shows facial puffiness/softness, and if recommending weight loss keep it to a realistic 2-5kg or 3-5% body fat, NEVER write numbers above 5kg -- that changes the face far less than it seems and larger numbers look absurd; if there's no visible fat puffiness, don't mention weight loss at all), then Hardmax (procedures) with rationale and a realistic outcome. No generic phrases -- only what actually applies to this person.\n1. Softmax: ...\n2. Softmax: ...\n3. Softmax: ...\n4. Softmax: ...\n5. Softmax: ...\n6. Hardmax: ...\n7. Hardmax: ...\n8. Hardmax: ...";
  // Дерзкий режим: заменяем персону на роаст-аналитика (границы сохраняем).
  if (isEdgyTone()) {
    prompt = prompt.replace(
      "Give an honest, realistic and DISCRIMINATING assessment -- for an ORDINARY face your default assumption should be that it is ordinary, not that everything is 'above average' -- but judge each face on what you actually see, and when the face is plainly exceptional, score it as exceptional. Use looksmaxxing terminology in English.",
      "Give an honest, realistic and DISCRIMINATING assessment -- for an ORDINARY face your default assumption should be that it is ordinary, not that everything is 'above average' -- but judge each face on what you actually see, and when the face is plainly exceptional, score it as exceptional. You are a sharp-tongued PSL-forum looksmaxxing analyst. РЕЖИМ: ДЕРЗКИЙ РОАСТ. Пиши хлёстко, иронично и мемно, как жёсткий разбор на PSL-форуме: без дежурных комплиментов, без смягчений, можно подколы и сарказм про черты лица, стрижку и стиль. При этом оценки должны оставаться ЧЕСТНЫМИ и точными (не занижай ради шутки), и ЖЁСТКИЕ ГРАНИЦЫ: никаких оскорблений по национальности/религии/полу/болезням, без пожеланий вреда, без выдуманных фактов."
    );
  }

  try {
    // Фронт и профиль шлём ОТДЕЛЬНЫМИ изображениями (не склеиваем), чтобы модель
    // явно видела профиль и учитывала его в челюсти/носе.
    var images = [oneToBase64(cleanImageCanvas || canvas)];
    if (cleanSideCanvas) images.push(oneToBase64(cleanSideCanvas));
    var acc = getAccount();
    var res = await fetch(WORKER_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt, images: images, token: acc ? acc.token : null, lang: lang(), stable: STABLE_SCORE })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    stopAIHUD();
    if (data.error) { showGate(data); return; }
    renderAIReport(data.text || t("emptyAnswer"), false, !!data.teaser);
    aiReport.classList.remove("hidden");
    // Обновляем чип квоты по факту списания.
    if (typeof data.creditsLeft !== "undefined") updateQuotaChip(data.freeLeft, data.creditsLeft, data.subscribed);
    if (data.cashback) showCashbackToast();
  } catch (err) {
    stopAIHUD();
    aiErrorText.textContent = t("errPrefix") + err.message;
    aiError.classList.remove("hidden");
  }
}

// Показ «гейта»: вход / подписка / оплата — вместо отчёта.
function showGate(data) {
  var aiError = document.getElementById("aiError");
  var aiErrorText = document.getElementById("aiErrorText");
  aiErrorText.textContent = data.text || t("gateRestricted");
  var old = aiError.querySelector(".gate-actions");
  if (old) old.remove();
  var box = document.createElement("div");
  box.className = "gate-actions";
  if (data.error === "auth") {
    var b = document.createElement("button");
    b.className = "btn-primary"; b.type = "button"; b.innerHTML = t("pwLoginBtn");
    b.addEventListener("click", function(){ backToUploadTop(); });
    box.appendChild(b);
  } else if (data.error === "sub") {
    var a = document.createElement("a");
    a.className = "btn-primary gate-link"; a.href = "https://t.me/wwwfacerateru"; a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = t("pwSubBtn");
    box.appendChild(a);
    var hint = document.createElement("p");
    hint.className = "gate-hint"; hint.textContent = t("gateHint");
    box.appendChild(hint);
  } else if (data.error === "pay") {
    // Полный выбор способа оплаты (не только Stars) и всегда свежие цены — берём прямо
    // из ответа сервера (data.packs/data.methods), а не из захардкоженных чисел.
    showPaywall("pay", data);
    return;
  }
  aiError.appendChild(box);
  aiError.classList.remove("hidden");
}

function backToUploadTop() {
  document.getElementById("analysisView").classList.add("hidden");
  document.getElementById("uploadSection").classList.remove("hidden");
  document.body.classList.remove("analyzing");
  var bar = document.getElementById("accountBar");
  if (bar) { bar.scrollIntoView({ behavior: "smooth", block: "center" }); bar.classList.add("acc-pulse"); setTimeout(function(){ bar.classList.remove("acc-pulse"); }, 1600); }
}

// Одно изображение (canvas) → base64 jpeg, с даунскейлом до maxSize.
function oneToBase64(src, maxSize) {
  // 672px вместо 900px: Grok режет картинку на тайлы 448x448 (256 токенов/тайл, макс 6 тайлов
  // = 1792 токена). При 900px портретное фото почти всегда упирается в потолок 6 тайлов;
  // при 672px обычно укладывается в 4 тайла (1280 токенов) без заметной потери детализации
  // лица для анализа. Экономия ~512 токенов на КАЖДОЕ фото (х2 при фронт+профиль).
  maxSize = maxSize || 672;
  var scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  var off = document.createElement("canvas");
  off.width = Math.round(src.width * scale); off.height = Math.round(src.height * scale);
  off.getContext("2d").drawImage(src, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", .82).split(",")[1];
}

function compositeToBase64(frontCvs, sideCvs, maxW) {
  // 672 вместо 900 по той же причине, что и в oneToBase64: композит широкий, и на
  // 900px он гарантированно упирался в потолок 6 тайлов (1792 токена). На 672px
  // укладывается в 4 тайла — минус ~512 токенов на каждом парном анализе.
  // Качество поднято с .75 до .82, чтобы компенсировать уменьшение: лиц тут два,
  // и на каждое приходится вдвое меньше ширины, чем на одиночном фото.
  maxW = maxW || 672;
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
  return out.toDataURL("image/jpeg", .82).split(",")[1];
}

/* Веса общего балла. Кости и гармония тянут 80%, кожа и груминг — 20%: они
   поправимы за месяц и не должны двигать балл на целый тир. Сумма = 1.
   Раньше общий балл модель называла сама «по впечатлению», и он гулял даже
   когда категории почти совпадали. */
var OVERALL_WEIGHTS = {
  "СИММЕТРИЯ": 0.12, "ГЛАЗА_CANTHAL_TILT": 0.16, "МИДФЕЙС_MAXILLA": 0.15,
  "ДЖОУЛАЙН_MANDIBLE": 0.16, "НОС_NOSE": 0.11, "ГУБЫ_СКУЛЫ": 0.10,
  "КОЖА": 0.11, "ГРУМИНГ_STYLE": 0.09,
};

// Считает общий балл из категорий. Возвращает null, если пришли не все восемь
// (тизер отдаёт только три — там веса дали бы перекос в сторону кожи).
function computeOverall(byKey) {
  var sum = 0, w = 0;
  for (var k in OVERALL_WEIGHTS) {
    if (typeof byKey[k] !== "number") return null;
    sum += byKey[k] * OVERALL_WEIGHTS[k];
    w += OVERALL_WEIGHTS[k];
  }
  return Math.round(sum / w * 10) / 10;
}

/* Перцентиль → балл. Модели плохо держат абсолютную шкалу (у каждой она своя и
   обычно завышена), но «сколько людей из ста выглядят лучше» оценивают куда ровнее:
   это вопрос про мир, а не про наши тиры. Раскладка повторяет ту, что мы описываем
   модели. pct = скольких человек из ста он ОБХОДИТ, больше — лучше. Кривая посажена
   на баллы Grok по восьми замерным лицам: обычное лицо (pct около 50) должно давать
   5.2-5.4, а не 6 с лишним, иначе тир HTN перестаёт что-либо значить.
   Верх намеренно поджат: 8.0 — это уже модельный уровень, выше 8.5 почти никто не
   должен доходить. Посажено на перцентили gemini-3.7-flash по восьми замерным лицам
   (24 прогона, разброс нулевой): молодой Дикаприо 97 и Жорик 98 дают 8.2-8.3,
   обычное лицо 46-53 даёт 5.1-5.3, заведомо слабое 12 даёт 4.2. */
var PCT_ANCHORS = [
  [0, 3.0], [12, 4.2], [30, 4.8], [46, 5.1], [53, 5.3],
  [65, 5.7], [74, 6.1], [86, 7.0], [93, 7.7], [97, 8.2], [100, 8.6],
];
function scoreFromPercentile(pct) {
  if (typeof pct !== "number" || isNaN(pct)) return null;
  pct = Math.max(0, Math.min(100, pct));
  for (var i = 1; i < PCT_ANCHORS.length; i++) {
    var a = PCT_ANCHORS[i - 1], b = PCT_ANCHORS[i];
    if (pct <= b[0]) {
      var k = (pct - a[0]) / (b[0] - a[0]);
      return Math.round((a[1] + (b[1] - a[1]) * k) * 10) / 10;
    }
  }
  return 3.5;
}

function parseAIReport(text) {
  var result = { overall: null, overallDesc: "", categories: [], recommendations: [] };
  var pctM = text.match(/ПЕРЦЕНТИЛЬ:\s*(\d{1,3})/);
  if (pctM) {
    result.percentile = parseInt(pctM[1], 10);
    result.overallFromPct = scoreFromPercentile(result.percentile);
  }
  var overallM = text.match(/ОБЩИЙ_БАЛЛ:\s*(\d+(?:\.\d+)?)\/(10)\s*\n([\s\S]*?)(?=\n[Ѐ-ӿ_A-Z]+:|$)/);
  if (overallM) { result.overall = parseFloat(overallM[1]); result.overallDesc = overallM[3].trim(); }
  var byKey = {};
  var cats = [
    { key:"СИММЕТРИЯ",          label:t("labelSym") },
    { key:"ГЛАЗА_CANTHAL_TILT", label:"Canthal Tilt / Eyes" },
    { key:"МИДФЕЙС_MAXILLA",    label:"Midface / Maxilla" },
    { key:"ДЖОУЛАЙН_MANDIBLE",  label:"Jawline / Mandible" },
    { key:"НОС_NOSE",              label:"Nose" },
    { key:"ГУБЫ_СКУЛЫ",        label:t("labelLips") },
    { key:"КОЖА",               label:"Skin" },
    { key:"ГРУМИНГ_STYLE",      label:"Grooming / Style" },
  ];
  cats.forEach(function(cat) {
    var esc = cat.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var m = text.match(new RegExp(esc + ":\\s*(\\d+(?:\\.\\d+)?)\\/(10)\\s*\\n([\\s\\S]*?)(?=\\n[\\u0400-\\u04FF_A-Z]+:|$)"));
    if (m) {
      result.categories.push({ label: cat.label, score: parseFloat(m[1]), text: m[3].trim() });
      byKey[cat.key] = parseFloat(m[1]);
    }
  });
  // Показываем балл самой модели. Замер 15.08: с выключенными рассуждениями он вышел
  // 5.4 во всех девяти прогонах одного лица, включая три разных ракурса — воспроизводится
  // намертво. Взвешенный пересчёт, наоборот, гулял 5.4-6.0, потому что собирал дрожь
  // категорий, и держался ВЫШЕ модельного: модель сама делает поправку на общую гармонию,
  // которую средневзвешенное теряет. Оставляем его сверкой в консоли.
  result.overallComputed = computeOverall(byKey);
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

function renderAIReport(text, skipSideEffects, isTeaser) {
  var parsed  = parseAIReport(text);
  // Модель иногда возвращает шаблон с нулями вместо оценок — так она отказывается,
  // когда на фото нечего разбирать. Раньше это доезжало до экрана как честный 0.0/10
  // с нулевыми полосками. Показываем понятную ошибку.
  if (parsed.overall === 0 || (parsed.categories.length && parsed.categories.every(function(c){ return c.score === 0; }))) {
    var eb = document.getElementById("aiError");
    document.getElementById("aiErrorText").textContent = t("errPrefix") + t("errNoFace");
    eb.classList.remove("hidden");
    document.getElementById("aiReport").classList.add("hidden");
    return;
  }
  window._fmParsed = parsed; // для share-карточки
  // overallComputed остаётся в window._fmParsed для сверки с консоли, но сам в неё
  // не пишется: это отчёт пользователя, а не наш стенд.
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
  renderProportions(window._fmLandmarks, window._fmMetrics && window._fmMetrics.pose);
  renderRadar(parsed.categories);
  var tierEl = document.getElementById("tierBadge");
  if (tierEl) {
    if (parsed.overall !== null) {
      var tier = pslTier(parsed.overall);
      tierEl.textContent = tier.label;
      tierEl.className = "tier-badge " + tier.key;
      tierEl.hidden = false;
    } else { tierEl.hidden = true; }
  }
  var catContainer = document.getElementById("categoryScores");
  catContainer.innerHTML = "";
  if (parsed.categories.length > 0) {
    var eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow"; eyebrow.textContent = t("detailEyebrow");
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
    var vb = document.getElementById("videoBtn");
    if (vb) vb.classList.remove("hidden");
  }

  // Отчёт готов — звук, сохранение, кнопка «Поделиться».
  // skipSideEffects=true при восстановлении сохранённого отчёта после рефреша страницы —
  // звук/сохранение/автоотправка карточки в ТГ уже случились при первом рендере, повтор
  // приводит к дублю (и пустой карточке, т.к. фото уже не в памяти после рефреша).
  if (parsed.overall !== null && !skipSideEffects) {
    playPing();
    saveLastResult(parsed.overall, text, isTeaser);
    autoSendTgCard();
  }
  if (parsed.overall !== null) {
    var sb = document.getElementById("shareBtn");
    if (sb) sb.classList.remove("hidden");
    var tb = document.getElementById("tgCardBtn");
    if (tb) tb.classList.remove("hidden");
    var cb = document.getElementById("toCompareBtn");
    if (cb) cb.classList.remove("hidden");
  }
  // Бесплатный тир получает урезанный отчёт (3 из 8 категорий, без рекомендаций) —
  // показываем карточку с призывом купить полный разбор вместо оставшихся категорий.
  window._fmTeaser = !!isTeaser; // для share-карточки (замочек на балле)
  if (isTeaser) showTeaserUpsell(); else hideTeaserUpsell();
}

function showTeaserUpsell() {
  var box = document.getElementById("teaserUpsell");
  if (!box) return;
  box.innerHTML = "<div class=\"teaser-upsell-lock\">🔒</div>" +
    "<p class=\"teaser-upsell-title\">" + t("teaserTitle") + "</p>" +
    "<p class=\"teaser-upsell-body\">" + t("teaserBody") + "</p>" +
    "<button class=\"teaser-upsell-btn\" type=\"button\">" + t("teaserBtn") + "</button>";
  box.classList.remove("hidden");
  var btn = box.querySelector(".teaser-upsell-btn");
  if (btn) btn.addEventListener("click", function() {
    var acc = getAccount(); if (!acc) return;
    fetch(WORKER_URL + "/me", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: acc.token }),
    }).then(function(r){ return r.json(); }).then(function(st){
      if (!st.error) showPaywall("pay", st);
    }).catch(function(){});
  });
}

function hideTeaserUpsell() {
  var box = document.getElementById("teaserUpsell");
  if (box) { box.classList.add("hidden"); box.innerHTML = ""; }
}

// Молча шлёт карточку отчёта в Telegram сразу после анализа, если юзер залогинен через ТГ —
// без клика по кнопке. Кнопка #tgCardBtn остаётся как ручной повтор (напр. если авто-отправка не прошла).
// Отправка готовой картинки в личку боту. Одна на оба режима: обычный анализ и
// Who Moggs — иначе легко забыть добавить отправку во второй.
function sendCardToTg(blob) {
  var acc = getAccount();
  if (!acc || !blob) return;
  var fr = new FileReader();
  fr.onload = function() {
    var b64 = String(fr.result).split(",")[1];
    fetch(WORKER_URL + "/sendcard", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: acc.token, image: b64 }),
    }).catch(function() {});
  };
  fr.readAsDataURL(blob);
}

function autoSendTgCard() {
  if (!getAccount()) return;
  buildShareCard().then(sendCardToTg);
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
// Единый звук: вкл = музыка + пинг. "fm-sound"==="1" → звук включён.
function soundOn() { return localStorage.getItem("fm-sound") === "1"; }
function isMuted() { return !soundOn(); }
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


/* ───────────────────  Последний результат + история  ─────────────────── */
function saveLastResult(overall, reportText, teaser) {
  try {
    var entry = { score: overall, date: Date.now(), report: reportText || "", teaser: !!teaser };
    localStorage.setItem("fm-last", JSON.stringify(entry));
    localStorage.setItem("fm-view", "analysis");
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

// При рефреше страницы — восстанавливаем экран результатов если пользователь там был
(function restoreAnalysisView() {
  if (localStorage.getItem("fm-view") !== "analysis") return;
  var last;
  try { last = JSON.parse(localStorage.getItem("fm-last") || "null"); } catch (e) { return; }
  if (!last || !last.report) return;
  uploadSection.classList.add("hidden");
  analysisView.classList.remove("hidden");
  resultsDiv.classList.remove("hidden");
  var aiReport = document.getElementById("aiReport");
  if (aiReport) aiReport.classList.remove("hidden");
  renderAIReport(last.report, true, !!last.teaser);
  var sb = document.getElementById("shareBtn");
  if (sb) sb.classList.remove("hidden");
  var tb = document.getElementById("tgCardBtn");
  if (tb) tb.classList.remove("hidden");
  var cb = document.getElementById("toCompareBtn");
  if (cb) cb.classList.remove("hidden");
  var banner = document.getElementById("lastResultBanner");
  if (banner) banner.classList.add("hidden");
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
    html += "<div class='lr-recs'><span class='eyebrow'>" + (lang() === "ru" ? "РЕКОМЕНДАЦИИ" : "RECOMMENDATIONS") + "</span><ol>";
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
        await navigator.share({ files: [file], title: "FaceRate", text: t("shareText") });
        return;
      } catch (e) { /* отмена → скачивание */ }
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "facerate.png"; a.click();
    URL.revokeObjectURL(url);
  });
})();

(function initToCompare() {
  var btn = document.getElementById("toCompareBtn");
  if (!btn) return;
  btn.addEventListener("click", function() {
    if (window.fmOpenCompare) window.fmOpenCompare();
  });
})();

// Рисует фирменную чёрную пилюлю (капсулу) с бликом.
// Золотая фирменная пилюля (капсула) для карточки.
(function initTgCard() {
  var b = document.getElementById("tgCardBtn");
  if (!b) return;
  b.addEventListener("click", function() {
    var acc = getAccount();
    if (!acc) { backToUploadTop(); return; }
    b.disabled = true; b.textContent = t("tgCardSending");
    buildShareCard().then(function(blob) {
      var fr = new FileReader();
      fr.onload = function() {
        var b64 = String(fr.result).split(",")[1];
        fetch(WORKER_URL + "/sendcard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: acc.token, image: b64 }),
        }).then(function(r){ return r.json(); }).then(function(d) {
          b.disabled = false;
          b.textContent = d.ok ? t("tgCardOk") : t("tgCardErr");
          setTimeout(function(){ b.textContent = t("tgCard"); }, 3500);
        }).catch(function() { b.disabled = false; b.textContent = t("tgCardErr"); });
      };
      fr.readAsDataURL(blob);
    });
  });
})();

function drawBrandPill(g, cx, cy, w, h) {
  var x = cx - w / 2, y = cy - h / 2, r = h / 2;
  var grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "#e8cf96"); grad.addColorStop(0.45, "#c4a46b");
  grad.addColorStop(1, "#7a5f30");
  g.save();
  roundRect(g, x, y, w, h, r); g.fillStyle = grad; g.fill();
  // блик
  g.beginPath(); roundRect(g, x + w * 0.12, y + h * 0.14, w * 0.5, h * 0.3, h * 0.15);
  g.fillStyle = "rgba(255,255,255,0.5)"; g.fill();
  // шов
  g.beginPath(); g.moveTo(cx, y + h * 0.15); g.lineTo(cx, y + h * 0.85);
  g.strokeStyle = "rgba(40,28,10,0.55)"; g.lineWidth = 2; g.stroke();
  g.restore();
}

// Люкс-карточка результата 1080×1560: бренд, фото с сеткой и брекетами,
// крупный балл, бары категорий, summary + POTENTIAL, facerate.ru.
function buildShareCard() {
  // Сначала дожидаемся иконок: без этого они не успевают загрузиться и
  // не попадают в готовый PNG.
  return loadCatIcons().then(function () { return _buildShareCard(); });
}

function _buildShareCard() {
  return new Promise(function(resolve) {
    var src = cleanImageCanvas || canvas;
    var parsed = window._fmParsed || { overall: null, overallDesc: "", categories: [] };
    var W = 1080, H = 1680;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var g = c.getContext("2d");
    var GOLD = "#c4a46b", GOLD_HI = "#e8cf96", DIM = "#8a7f6a", TXT = "#e8e2d6";

    function ls(px) { try { g.letterSpacing = px + "px"; } catch (e) {} }

    // фон: почти чёрный + мягкое золотое свечение сверху
    g.fillStyle = "#050505"; g.fillRect(0, 0, W, H);
    var glow = g.createRadialGradient(W / 2, 0, 80, W / 2, 0, 900);
    glow.addColorStop(0, "rgba(196,164,107,0.10)"); glow.addColorStop(1, "rgba(196,164,107,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, 900);
    // внешняя золотая рамка
    g.strokeStyle = "rgba(196,164,107,0.35)"; g.lineWidth = 2;
    roundRect(g, 22, 22, W - 44, H - 44, 30); g.stroke();

    // ── Шапка: пилюля + FACERATE ──
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.font = "bold 66px Georgia, 'Times New Roman', serif"; ls(4);
    var brandW = g.measureText("FACERATE").width;
    var pillW = 84, gap = 26;
    var startX = (W - (pillW + gap + brandW)) / 2;
    drawBrandPill(g, startX + pillW / 2, 96, pillW, 36);
    var brandGrad = g.createLinearGradient(0, 60, 0, 115);
    brandGrad.addColorStop(0, "#f4ead2"); brandGrad.addColorStop(1, "#cbb789");
    g.fillStyle = brandGrad;
    g.fillText("FACERATE", startX + pillW + gap, 118);
    ls(0);
    g.textAlign = "center";
    g.font = "24px Georgia, serif"; ls(9);
    g.fillStyle = DIM;
    g.fillText("AI AESTHETIC ANALYSIS", W / 2, 158); ls(0);

    // ── Фото со скруглением, сеткой точек и брекетами ──
    // ph уменьшена с 500 до 400: подпись балла, плашка тира и строки категорий с
    // иконками стали выше, и без этого блок сводки наезжал на футер.
    var px = 120, py = 195, pw = W - 240, ph = 400, pr = 26;
    g.save();
    roundRect(g, px, py, pw, ph, pr); g.clip();
    // Кроп с привязкой к лицу (если рамка есть) — иначе cover по центру.
    var fb = window._fmFaceBox;
    if (fb && fb.w > 0 && fb.h > 0) {
      var boxAR = pw / ph;
      // Центр лица чуть выше геометрического (акцент на глаза/скулы).
      var fcx = fb.x + fb.w / 2, fcy = fb.y + fb.h * 0.42;
      // Желаемая высота кропа: лицо + запас на волосы и шею. AR = как у окна.
      var rh = fb.h * 2.15, rw = rh * boxAR;
      // Не больше самого фото (сохраняем пропорцию, без искажений).
      if (rw > src.width)  { rw = src.width;  rh = rw / boxAR; }
      if (rh > src.height) { rh = src.height; rw = rh * boxAR; }
      // Центрируем на лице и держим в пределах изображения.
      var rx = Math.max(0, Math.min(fcx - rw / 2, src.width - rw));
      var ry = Math.max(0, Math.min(fcy - rh / 2, src.height - rh));
      g.drawImage(src, rx, ry, rw, rh, px, py, pw, ph);
    } else {
      var scale = Math.max(pw / src.width, ph / src.height);
      var dw = src.width * scale, dh = src.height * scale;
      g.drawImage(src, px + (pw - dw) / 2, py + (ph - dh) * 0.35, dw, dh);
    }
    // затемнение краёв
    var vg = g.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.35, px + pw / 2, py + ph / 2, ph * 0.95);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = vg; g.fillRect(px, py, pw, ph);
    // сетка точек
    g.fillStyle = "rgba(196,164,107,0.14)";
    for (var gy = py + 22; gy < py + ph - 10; gy += 34) {
      for (var gx = px + 22; gx < px + pw - 10; gx += 34) {
        g.beginPath(); g.arc(gx, gy, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();
    g.strokeStyle = "rgba(196,164,107,0.4)"; g.lineWidth = 1.5;
    roundRect(g, px, py, pw, ph, pr); g.stroke();
    // угловые брекеты
    var bl = 38, bo = 14;
    g.strokeStyle = "rgba(196,164,107,0.9)"; g.lineWidth = 3; g.lineCap = "round";
    [[px - bo, py - bo, 1, 1], [px + pw + bo, py - bo, -1, 1], [px - bo, py + ph + bo, 1, -1], [px + pw + bo, py + ph + bo, -1, -1]].forEach(function(k) {
      g.beginPath();
      g.moveTo(k[0] + k[2] * bl, k[1]); g.lineTo(k[0], k[1]); g.lineTo(k[0], k[1] + k[3] * bl);
      g.stroke();
    });

    // ── Общий балл ──
    var score = parsed.overall !== null ? parsed.overall.toFixed(1) : (document.getElementById("overallScoreNum").textContent || "--");
    var by = py + ph + 175;
    g.textAlign = "left";
    // 150px вместо 180: на 180 цифра перетягивала на себя всю карточку и
    // оставляла мало воздуха между фото и плашкой тира.
    var scoreFont = "124px Georgia, serif", denomFont = "44px Georgia, serif";
    g.font = scoreFont; var wS = g.measureText(score).width;
    g.font = denomFont; var wD = g.measureText("/10").width;
    var sx = W / 2 - (wS + 14 + wD) / 2;
    var sg = g.createLinearGradient(0, by - 140, 0, by);
    sg.addColorStop(0, "#f0dfae"); sg.addColorStop(1, "#b3924f");
    g.font = scoreFont; g.fillStyle = sg; g.fillText(score, sx, by);
    g.font = denomFont; g.fillStyle = "#6f6858"; g.fillText("/10", sx + wS + 14, by - 8);
    g.textAlign = "center";
    g.font = "26px Georgia, serif"; ls(10); g.fillStyle = GOLD;
    g.fillText("OVERALL PSL SCORE", W / 2, by + 48); ls(0);

    // ── Плашка тира ──
    // Балл сам по себе мало что говорит; тир — это то, что человек несёт в чат.
    // Верхние ступени светлее и со свечением, нижняя — приглушённо-красная.
    var tier = pslTier(parsed.overall !== null ? parsed.overall : 0);
    var TIER_COLOR = {
      trueadam: "#f7ecd2", adamlite: "#f2e4bd", chad: "#e8d4a0",
      chadlite: "#e8d4a0", htn: GOLD_HI, mtn: GOLD, ltn: GOLD, sub3: "#d9a08f",
    };
    var tCol = TIER_COLOR[tier.key] || GOLD;
    var tLabel = tier.label.toUpperCase();
    g.font = "31px Georgia, serif"; ls(7);
    var tW = g.measureText(tLabel).width + 68;
    var tH = 54, tX = W / 2 - tW / 2, tY = by + 74;
    var tGlow = g.createLinearGradient(tX, tY, tX + tW, tY + tH);
    tGlow.addColorStop(0, "rgba(196,164,107,0.05)");
    tGlow.addColorStop(0.5, "rgba(232,212,160,0.16)");
    tGlow.addColorStop(1, "rgba(196,164,107,0.05)");
    g.fillStyle = tGlow; roundRect(g, tX, tY, tW, tH, tH / 2); g.fill();
    g.strokeStyle = tCol; g.lineWidth = 1.6;
    roundRect(g, tX, tY, tW, tH, tH / 2); g.stroke();
    g.save(); g.shadowColor = tCol; g.shadowBlur = 22;
    g.fillStyle = tCol; g.textBaseline = "middle";
    g.fillText(tLabel, W / 2, tY + tH / 2 + 2); g.restore(); ls(0);
    g.textBaseline = "alphabetic";

    // Под плашкой — либо подпись «PSL TIER», либо (на бесплатном тизере) замочек.
    // Слот один и тот же, поэтому высота карточки в обоих режимах одинаковая.
    if (window._fmTeaser) {
      g.font = "22px Georgia, serif"; ls(2); g.fillStyle = GOLD_HI;
      g.fillText("🔒 " + (lang() === "ru" ? "ПОЛНЫЙ РАЗБОР НА FACERATE.RU" : "FULL REPORT ON FACERATE.RU"), W / 2, tY + tH + 34); ls(0);
    } else {
      g.font = "18px Georgia, serif"; ls(6); g.fillStyle = DIM;
      g.fillText("PSL TIER", W / 2, tY + tH + 30); ls(0);
    }

    // Разделитель: тонкая линия с ярким горячим центром, как в макете.
    var dy = tY + tH + 66;
    var lg = g.createLinearGradient(W / 2 - 300, 0, W / 2 + 300, 0);
    lg.addColorStop(0, "rgba(196,164,107,0)"); lg.addColorStop(0.5, "rgba(232,212,160,0.95)");
    lg.addColorStop(1, "rgba(196,164,107,0)");
    g.strokeStyle = lg; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(W / 2 - 300, dy); g.lineTo(W / 2 + 300, dy); g.stroke();
    // Свечение даём тенью на самой линии: заливка прямоугольником поверх чёрного
    // читалась как серое пятно, а не как блик.
    g.save(); g.shadowColor = "rgba(255,240,200,0.9)"; g.shadowBlur = 16;
    g.beginPath(); g.moveTo(W / 2 - 70, dy); g.lineTo(W / 2 + 70, dy);
    g.strokeStyle = "rgba(255,244,214,0.95)"; g.lineWidth = 1.4; g.stroke(); g.restore();

    // ── Категории: 2 колонки, бары ──
    // На тизере (бесплатный урезанный отчёт) parsed.categories содержит только 3 из 8 —
    // остальные 5 рисуем как размытые/закрытые плашки с замочком вместо того, чтобы просто
    // их не показывать (наглядно видно, что скрыто, а не просто "меньше строк").
    var FULL_CAT_LABELS = [t("labelSym"), "Canthal Tilt / Eyes", "Midface / Maxilla", "Jawline / Mandible", "Nose", t("labelLips"), "Skin", "Grooming / Style"];
    var realCats = parsed.categories || [];
    var cats = window._fmTeaser
      ? FULL_CAT_LABELS.map(function(label){
          var found = realCats.filter(function(c){ return c.label === label; })[0];
          return found ? { label: label, score: found.score, locked: false } : { label: label, score: null, locked: true };
        })
      : realCats.slice(0, 8).map(function(c){ return { label: c.label, score: c.score, locked: false }; });
    // Иконки идут в том же порядке, что и FULL_CAT_LABELS.
    var CAT_ICONS = ["sym", "eyes", "midface", "jaw", "nose", "lips", "skin", "hair"];
    var cy0 = dy + 62, rowH = 92, colW = 400;
    // Колонки заполняются СТОЛБЦАМИ, а не строками: сначала все четыре строки
    // левой колонки, потом правой — так же, как в макете.
    var perCol = Math.ceil(cats.length / 2);
    var cols = [{ x: 96 }, { x: W - 96 - colW }];
    g.textBaseline = "alphabetic";

    // Вертикальная нить между колонками с горячей точкой посередине.
    var midX = W / 2, colTop = cy0 - 26, colBot = cy0 + perCol * rowH - 34;
    var vg2 = g.createLinearGradient(0, colTop, 0, colBot);
    vg2.addColorStop(0, "rgba(196,164,107,0)"); vg2.addColorStop(0.5, "rgba(196,164,107,0.5)");
    vg2.addColorStop(1, "rgba(196,164,107,0)");
    g.strokeStyle = vg2; g.lineWidth = 1;
    g.beginPath(); g.moveTo(midX, colTop); g.lineTo(midX, colBot); g.stroke();

    cats.forEach(function(cat, i) {
      var col = cols[Math.floor(i / perCol)], row = i % perCol;
      var x = col.x, y = cy0 + row * rowH;
      var icon = CAT_ICONS[FULL_CAT_LABELS.indexOf(cat.label)] || "sym";
      var iconR = 30, textX = x + 74, valW = 92;
      var bw = colW - 74 - valW, bx = textX, byy = y + 20;

      if (cat.locked) {
        drawCatIcon(g, icon, x + iconR, y - 2, iconR * 1.9, "#4a4438");
        g.save();
        try { g.filter = "blur(3px)"; } catch (e) {}
        g.textAlign = "left"; g.font = "25px Georgia, serif"; g.fillStyle = "#555";
        g.fillText(cat.label, textX, y - 2);
        g.fillStyle = "#242018"; roundRect(g, bx, byy, bw, 4, 2); g.fill();
        g.textAlign = "right"; g.font = "30px Georgia, serif"; g.fillStyle = "#555";
        g.fillText("6.5", x + colW, y + 8);
        g.restore();
        g.textAlign = "center"; g.font = "24px Georgia, serif"; g.fillStyle = GOLD_HI;
        g.fillText("🔒", bx + bw / 2, y + 6);
        return;
      }

      drawCatIcon(g, icon, x + iconR, y - 2, iconR * 1.9, GOLD);
      // Название над полосой, балл — справа, крупно.
      g.textAlign = "left"; g.font = "25px Georgia, serif"; g.fillStyle = TXT; ls(0.5);
      g.fillText(cat.label.length > 19 ? cat.label.slice(0, 18) + "…" : cat.label, textX, y - 2); ls(0);
      // Тонкая полоса: тёмная дорожка + золотая заливка по баллу.
      g.fillStyle = "rgba(255,255,255,0.07)"; roundRect(g, bx, byy, bw, 3, 1.5); g.fill();
      var fillW = Math.max(6, bw * Math.min(cat.score, 10) / 10);
      var bg2 = g.createLinearGradient(bx, 0, bx + fillW, 0);
      bg2.addColorStop(0, "rgba(138,108,56,0.85)"); bg2.addColorStop(1, GOLD_HI);
      g.fillStyle = bg2; roundRect(g, bx, byy, fillW, 3, 1.5); g.fill();
      g.save(); g.shadowColor = GOLD_HI; g.shadowBlur = 9;
      g.beginPath(); g.arc(bx + fillW, byy + 1.5, 3.2, 0, Math.PI * 2);
      g.fillStyle = GOLD_HI; g.fill(); g.restore();
      g.textAlign = "right"; g.font = "29px Georgia, serif"; g.fillStyle = "#ecdaa8";
      g.fillText(cat.score.toFixed(1), x + colW, y + 12);
    });

    // ── Summary + POTENTIAL ──
    var sy = cy0 + perCol * rowH + 4;
    var sh = 128;
    g.fillStyle = "rgba(255,255,255,0.025)";
    roundRect(g, 90, sy, W - 180, sh, 18); g.fill();
    g.strokeStyle = "rgba(196,164,107,0.22)"; g.lineWidth = 1;
    roundRect(g, 90, sy, W - 180, sh, 18); g.stroke();
    // стрелка-глиф
    g.strokeStyle = GOLD; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(122, sy + 78); g.lineTo(142, sy + 58); g.lineTo(154, sy + 68); g.lineTo(176, sy + 44); g.stroke();
    g.beginPath(); g.moveTo(176, sy + 44); g.lineTo(176, sy + 56); g.moveTo(176, sy + 44); g.lineTo(164, sy + 44); g.stroke();
    // текст
    g.textAlign = "left";
    g.font = "22px Georgia, serif"; ls(6); g.fillStyle = GOLD;
    g.fillText("ANALYSIS SUMMARY", 205, sy + 46); ls(0);
    var ov = parsed.overall || 0;
    var potential = ov >= 7.5 ? "HIGH" : ov >= 6 ? "GOOD" : ov >= 4.5 ? "MODERATE" : "LOW";
    var summary = (parsed.overallDesc || "").replace(/\s+/g, " ").trim();
    // бейдж POTENTIAL — геометрия нужна заранее, чтобы текст summary не залезал под него
    var bwd = 185, bx2 = W - 90 - 24 - bwd, by2 = sy + 24;
    var textMaxW = bx2 - 205 - 24;
    g.font = "23px Georgia, serif"; g.fillStyle = "#b6ac9a";
    var words = summary.split(" "), sLines = [], line = "";
    for (var wi = 0; wi < words.length; wi++) {
      var test = line ? line + " " + words[wi] : words[wi];
      if (g.measureText(test).width > textMaxW && line) { sLines.push(line); line = words[wi]; } else line = test;
    }
    if (line) sLines.push(line);
    if (sLines.length > 2) {
      var last = sLines[1];
      while (g.measureText(last + "…").width > textMaxW && last.length > 1) last = last.slice(0, -1);
      sLines = [sLines[0], last + "…"];
    }
    sLines.forEach(function(l, i) { g.fillText(l, 205, sy + 80 + i * 28); });
    g.strokeStyle = "rgba(196,164,107,0.55)"; g.lineWidth = 1.5;
    roundRect(g, bx2, by2, bwd, sh - 48, 12); g.stroke();
    g.textAlign = "center";
    g.font = "17px Georgia, serif"; ls(5); g.fillStyle = DIM;
    g.fillText("POTENTIAL", bx2 + bwd / 2, by2 + 32); ls(0);
    g.font = "30px Georgia, serif"; ls(3); g.fillStyle = GOLD_HI;
    g.fillText(potential, bx2 + bwd / 2, by2 + 66); ls(0);

    // ── Футер ──
    g.font = "46px Georgia, serif"; ls(2);
    var fg = g.createLinearGradient(0, H - 100, 0, H - 55);
    fg.addColorStop(0, "#eddcab"); fg.addColorStop(1, "#b3924f");
    g.fillStyle = fg;
    g.fillText("facerate.ru", W / 2, H - 66); ls(0);
    g.font = "20px Georgia, serif"; ls(6); g.fillStyle = "#6f6858";
    g.fillText("Ascend & Forget", W / 2, H - 34); ls(0);

    c.toBlob(function(b) { resolve(b); }, "image/png");
  });
}

/* ═══════════ Иконки категорий для карточки ═══════════
   Готовые PNG в assets/icons/ (белые линии на прозрачном фоне, 256x256).
   Раньше эти же иконки рисовались путями прямо здесь — выходило грубо, потому
   что аккуратная кривая руками на канвасе не набирается. Цвет накладываем сами
   через source-in, поэтому одна и та же картинка годится и для золотой строки,
   и для приглушённой закрытой на тизере. */
var CAT_ICON_FILES = {
  sym: 'sym', eyes: 'eyes', midface: 'midface', jaw: 'jaw',
  nose: 'nose', lips: 'lips', skin: 'skin', hair: 'hair',
};
var _catIcons = null, _catIconTint = {};

// Грузим все восемь разом. Возвращаем промис, чтобы карточка не начала рисоваться
// раньше, чем картинки готовы: иначе иконки просто не попадут в PNG.
function loadCatIcons() {
  if (_catIcons) return Promise.resolve(_catIcons);
  var keys = Object.keys(CAT_ICON_FILES);
  return Promise.all(keys.map(function (k) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () { res([k, im]); };
      im.onerror = function () { res([k, null]); };   // без иконки строка всё равно рисуется
      im.src = 'assets/icons/' + CAT_ICON_FILES[k] + '.png';
    });
  })).then(function (pairs) {
    _catIcons = {};
    pairs.forEach(function (p) { _catIcons[p[0]] = p[1]; });
    return _catIcons;
  });
}

// Перекрашенная копия иконки. Кэшируем: одна и та же пара «иконка + цвет»
// встречается по восемь раз на карточку.
function tintedIcon(key, color) {
  var ck = key + '|' + color;
  if (_catIconTint[ck]) return _catIconTint[ck];
  var im = _catIcons && _catIcons[key];
  if (!im) return null;
  var c = document.createElement('canvas');
  c.width = im.width; c.height = im.height;
  var x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  _catIconTint[ck] = c;
  return c;
}

function drawCatIcon(g, key, cx, cy, s, color) {
  var ic = tintedIcon(key, color);
  if (!ic) return;
  g.drawImage(ic, cx - s / 2, cy - s / 2, s, s);
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

/* ───────────────────  Единая кнопка звука (музыка + пинг)  ─────────────────── */
(function initSound() {
  var btn = document.getElementById("musicBtn");
  var audio = document.getElementById("bgMusic");
  if (!btn) return;
  if (audio) audio.volume = 0.16;
  function sync() {
    var on = soundOn();
    btn.textContent = on ? "🔊" : "🔇";
    btn.classList.toggle("active", on);
  }
  btn.addEventListener("click", function() {
    var turnOn = !soundOn();
    localStorage.setItem("fm-sound", turnOn ? "1" : "0");
    if (audio) {
      if (turnOn) { audio.play().catch(function(){}); }
      else { audio.pause(); }
    }
    sync();
    if (turnOn) playPing();
  });
  // Если звук был включён ранее — попробовать возобновить музыку.
  if (soundOn() && audio) audio.play().catch(function(){});
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
(function initViews() {
  var view  = document.getElementById("fsView");
  if (!view) return;
  var body  = document.getElementById("fsBody");
  var title = document.getElementById("fsTitle");
  var back  = document.getElementById("fsBack");

  function openView(name) {
    var v = VIEWS[name]; if (!v) return;
    title.textContent = t(v.titleKey);
    body.classList.toggle("fs-body-full", name === "glossary"); // iframe во всю ширину
    body.innerHTML = ""; v.render(body); body.scrollTop = 0;
    view.classList.remove("hidden");
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ view.classList.add("in"); }); });
  }
  function closeView() { view.classList.remove("in"); setTimeout(function(){ view.classList.add("hidden"); }, 360); }

  var VIEWS = {
    history: { titleKey: "tHistory", render: renderHistory },
    glossary: { titleKey: "tGlossary", render: renderGlossary },
    articles: { titleKey: "tArticles", render: renderArticles },
    how: { titleKey: "tHow", render: renderHow },
    progress: { titleKey: "tProgress", render: renderProgress },
  };

  // Раздел «Ведение» живёт скрытым в конце index.html и переезжает сюда целиком,
  // чтобы не дублировать разметку и не терять состояние между открытиями.
  // Держим ссылку в замыкании: openView() делает body.innerHTML = "" перед
  // отрисовкой, и без неё раздел уничтожался бы при втором открытии.
  var pgSection = null;
  function renderProgress(box) {
    if (!pgSection) pgSection = document.getElementById("progressSection");
    if (!pgSection) { box.innerHTML = "<p class='dm-empty'>Раздел недоступен.</p>"; return; }
    pgSection.hidden = false;
    box.appendChild(pgSection);
    if (window.pgOpen) window.pgOpen();
  }

  function renderHistory(box) {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem("fm-history") || "[]"); } catch (e) {}
    if (!hist.length) { box.innerHTML = "<p class='dm-empty'>" + t("histEmpty") + "</p>"; return; }
    var html = "<div class='hist-list'>";
    hist.forEach(function(h){
      var d = h.date ? new Date(h.date).toLocaleString(lang() === "ru" ? "ru-RU" : "en-US", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "";
      var col = h.score >= 7.5 ? "#c4a46b" : h.score >= 5.5 ? "#f0ece6" : "#888";
      html += "<div class='hist-row'><span class='hist-score' style='color:" + col + "'>" + Number(h.score).toFixed(1) +
        "<i>/10</i></span><span class='hist-date'>" + d + "</span></div>";
    });
    html += "</div>";
    if (hist.length > 1) {
      var avg = hist.reduce(function(a,b){ return a + b.score; }, 0) / hist.length;
      html += "<p class='hist-avg'>" + t("histAvg") + "<b>" + avg.toFixed(1) + "</b>" + t("histCount") + hist.length + "</p>";
    }
    box.innerHTML = html;
  }

  function renderGlossary(box) {
    box.innerHTML = "<iframe class='dm-iframe' src='" + (lang() === "ru" ? "glossary.html" : "glossary-en.html") + "'></iframe>";
  }

  function renderHow(box) {
    box.innerHTML = t("howHtml");
  }

  function renderArticles(box) {
    box.innerHTML = t("articlesHtml");
  }

  // глобальный доступ (например из iframe словаря)
  window.fmOpenView = function(name){ openView(name); };
  window.fmOpenDrawer = window.fmOpenView; // обратная совместимость

  // навигация
  back.addEventListener("click", closeView);
  // плитки меню + ссылки футера с data-view
  document.querySelectorAll("[data-view]").forEach(function(el){
    el.addEventListener("click", function(e){
      e.preventDefault();
      var name = el.getAttribute("data-view");
      if (name === "feedback") { location.href = "feedback.html"; return; }
      openView(name);
    });
  });

  // Большая 3D-пилюля в меню: левитация + наклон за курсором.
  var stage = document.getElementById("menuScreen");
  var wrap  = document.getElementById("menuPillWrap");
  if (stage && wrap) {
    stage.addEventListener("mousemove", function(e){
      var r = stage.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width - 0.5;   // -0.5..0.5
      var py = (e.clientY - r.top) / r.height - 0.5;
      wrap.style.setProperty("--ry", (px * 50).toFixed(1) + "deg");
      wrap.style.setProperty("--rx", (-py * 32).toFixed(1) + "deg");
    });
    stage.addEventListener("mouseleave", function(){
      wrap.style.setProperty("--ry", "0deg");
      wrap.style.setProperty("--rx", "0deg");
    });
  }

  // Размытые пилюли на фоне меню
  var field = document.getElementById("menuBgPills");
  if (field) {
    var shades = ["#e8e8e8","#9a9a9a","#2a2a2a","#f0f0f0","#555","#111"];
    for (var i = 0; i < 12; i++) {
      var p = document.createElement("span"); p.className = "fp-pill";
      var w = 50 + Math.random() * 110;
      p.style.width = w + "px"; p.style.height = (w * 0.42) + "px";
      p.style.background = shades[i % shades.length];
      p.style.left = (Math.random() * 100) + "%"; p.style.top = (Math.random() * 100) + "%";
      p.style.setProperty("--rot", (Math.random() * 360) + "deg");
      p.style.setProperty("--dx", ((Math.random() - 0.5) * 90) + "px");
      p.style.setProperty("--dy", ((Math.random() - 0.5) * 90) + "px");
      p.style.animationDuration = (16 + Math.random() * 16) + "s";
      p.style.animationDelay = (-Math.random() * 20) + "s";
      field.appendChild(p);
    }
  }
})();

/* ───────────────────  Аккаунт: Telegram Login + квоты + Stars  ─────────────────── */
var TG_BOT_USERNAME = "faceratepay_bot";

function getAccount() {
  try { return JSON.parse(localStorage.getItem("fm-tg") || "null"); } catch (e) { return null; }
}
function saveAccount(status) {
  localStorage.setItem("fm-tg", JSON.stringify({ token: status.token, user: status.user }));
}
function clearAccount() { localStorage.removeItem("fm-tg"); }

function isEdgyTone() {
  var cb = document.getElementById("toneEdgy");
  return cb ? cb.checked : false;
}

function showCashbackToast() {
  var el = document.createElement("div");
  el.textContent = t("cashbackToast");
  el.style.cssText = "position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);"
    + "background:#161311;border:1px solid #c4a46b;color:#f0ece6;padding:12px 20px;border-radius:10px;"
    + "font-family:'Cormorant Garamond',serif;font-size:1.05rem;z-index:9999;opacity:0;"
    + "transition:opacity .35s ease,transform .35s ease;text-align:center;max-width:90vw;";
  document.body.appendChild(el);
  requestAnimationFrame(function() {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });
  setTimeout(function() {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(20px)";
    setTimeout(function() { el.remove(); }, 400);
  }, 4200);
}

function updateQuotaChip(freeLeft, credits, subscribed, unlimUntil) {
  var q = document.getElementById("accQuota");
  if (!q) return;
  if (unlimUntil && unlimUntil > Date.now()) {
    q.textContent = t("chipUnlim") + new Date(unlimUntil).toLocaleString(lang() === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    return;
  }
  var parts = [];
  if (!subscribed) parts.push(t("chipSub"));
  else parts.push(t("chipFree") + freeLeft);
  parts.push(t("chipCredits") + credits);
  q.textContent = parts.join(" · ");
}

var _lastAccountStatus = null;
function renderAccount(status) {
  var out = document.getElementById("accLoggedOut");
  var inn = document.getElementById("accLoggedIn");
  if (!out || !inn) return;
  if (!status || !status.user) {
    _lastAccountStatus = null;
    out.classList.remove("hidden"); inn.classList.add("hidden");
    mountTgWidget();
    return;
  }
  _lastAccountStatus = status;
  out.classList.add("hidden"); inn.classList.remove("hidden");
  var av = document.getElementById("accAvatar");
  if (status.user.photo_url) { av.src = status.user.photo_url; av.style.display = ""; }
  else av.style.display = "none";
  document.getElementById("accName").textContent =
    status.user.username ? "@" + status.user.username : (status.user.first_name || "Пользователь");
  updateQuotaChip(status.freeLeft, status.credits, status.subscribed, status.unlimUntil);
  // Числа на быстрых кнопках покупки — всегда из живого ответа сервера, не хардкод.
  if (status.packs) {
    var b1 = document.getElementById("buyP1"), b5 = document.getElementById("buyP5");
    if (b1 && status.packs.p1) b1.textContent = "+1 · " + status.packs.p1.stars + "⭐";
    if (b5 && status.packs.p5) b5.textContent = "+5 · " + status.packs.p5.stars + "⭐";
  }
}

// Виджет входа Telegram (скрипт вставляется динамически в контейнер).
// Вход через сообщение боту: открываем t.me/бот?start=КОД (одно нажатие Start
// в Telegram, без номера телефона), затем поллим /authpoll до привязки.
var _authPollTimer = null;
function mountTgWidget() {
  var wrap = document.getElementById("tgLoginWrap");
  if (!wrap || wrap.childElementCount) return;
  var b = document.createElement("button");
  b.type = "button";
  b.className = "tg-login-btn";
  b.innerHTML = t("loginBtn");
  b.addEventListener("click", function(){ startTgLogin(b); });
  wrap.appendChild(b);
}

// Внутри встроенного браузера Telegram window.open("_blank") часто просто
// закрывает мини-браузер (переход перехватывается самим Telegram) и убивает
// JS-контекст вместе с поллингом. Поэтому там переходим через location.href
// в текущей вкладке и переживаем возможную перезагрузку через localStorage.
function isTgInAppBrowser() {
  return /Telegram/i.test(navigator.userAgent) || !!window.TelegramWebviewProxy;
}

var TG_LOGIN_PENDING_KEY = "fm-login-pending";
var TG_LOGIN_PENDING_MAX_MS = 5 * 60 * 1000; // 5 минут — окно на возврат из Telegram

function startTgLogin(btn) {
  var code = crypto.randomUUID();
  localStorage.setItem(TG_LOGIN_PENDING_KEY, JSON.stringify({ code: code, ts: Date.now() }));
  if (isTgInAppBrowser()) {
    location.href = "https://t.me/" + TG_BOT_USERNAME + "?start=" + code;
  } else {
    // window.open СИНХРОННО в клике — иначе мобильные браузеры режут попап.
    window.open("https://t.me/" + TG_BOT_USERNAME + "?start=" + code, "_blank");
  }
  pollTgLogin(code, btn);
}

function pollTgLogin(code, btn) {
  if (btn) {
    btn.disabled = true;
    btn.style.flexDirection = "column";
    btn.style.gap = "2px";
    btn.innerHTML = "<span><span class='tg-spin'></span> " + t("waitTg") + "</span>" +
      "<small style='display:block;font-weight:400;font-size:0.72em;opacity:0.8;letter-spacing:normal'>" + t("waitTgHint") + "</small>";
  }
  if (_authPollTimer) clearInterval(_authPollTimer);
  var tries = 0;
  function tick() {
    tries++;
    if (tries > 200) { // ~5 мин — покрывает возврат из встроенного браузера ТГ
      clearInterval(_authPollTimer); _authPollTimer = null;
      localStorage.removeItem(TG_LOGIN_PENDING_KEY);
      if (btn) { btn.disabled = false; btn.style.flexDirection = ""; btn.style.gap = ""; btn.innerHTML = t("loginBtn"); }
      return;
    }
    fetch(WORKER_URL + "/authpoll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    }).then(function(r){ return r.json(); }).then(function(st){
      if (st && st.token) {
        clearInterval(_authPollTimer); _authPollTimer = null;
        localStorage.removeItem(TG_LOGIN_PENDING_KEY);
        saveAccount(st);
        renderAccount(st);
        onLoginSuccess(st);
        window.location.reload();
      }
    }).catch(function(){});
  }
  // Первый опрос НЕ делаем сразу: в этот момент юзер только уходит в Telegram,
  // нажать Start ещё не успел, а промах KV кеширует имя ключа в колокации.
  // Ждём полторы секунды — за это время переключение обычно уже произошло.
  _authPollTimer = setInterval(tick, 1500);
}

// Если страницу пересобрало (вернулись из встроенного браузера ТГ) — докручиваем
// незавершённый логин автоматически, без повторного нажатия кнопки.
function resumeTgLoginIfPending() {
  if (getAccount() || _authPollTimer) return;
  var raw = localStorage.getItem(TG_LOGIN_PENDING_KEY);
  if (!raw) return;
  var pending; try { pending = JSON.parse(raw); } catch (e) { return; }
  if (!pending || !pending.code || Date.now() - pending.ts > TG_LOGIN_PENDING_MAX_MS) {
    localStorage.removeItem(TG_LOGIN_PENDING_KEY);
    return;
  }
  var wrap = document.getElementById("tgLoginWrap");
  var btn = wrap ? wrap.querySelector(".tg-login-btn") : null;
  pollTgLogin(pending.code, btn);
}
document.addEventListener("visibilitychange", function() {
  if (document.visibilityState === "visible") resumeTgLoginIfPending();
});

// Если логин случился, пока открыт пейволл — сразу перепроверяем доступ.
function onLoginSuccess(st) {
  var pw = document.getElementById("paywall");
  if (pw && !pw.classList.contains("hidden")) pwRecheck();
}

function refreshAccount() {
  var acc = getAccount();
  if (!acc) { renderAccount(null); return; }
  fetch(WORKER_URL + "/me", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: acc.token }),
  }).then(function(r){ return r.json(); }).then(function(st){
    if (st.error) { clearAccount(); renderAccount(null); return; }
    renderAccount(st);
  }).catch(function(){ renderAccount({ user: acc.user, freeLeft: "?", credits: "?", subscribed: true }); });
}

// Покупка кредитов: воркер создаёт Stars-инвойс, открываем в Telegram.
// location.href вместо window.open — попап после fetch блокируется на мобилах
// (из-за этого кнопки покупки казались «некликабельными»).
function buyPack(pack, btn, payMethod) {
  var acc = getAccount();
  if (!acc) { backToUploadTop(); return; }
  if (btn) { btn.disabled = true; btn.textContent = t("invoiceCreating"); }
  fetch(WORKER_URL + "/buy", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: acc.token, pack: pack, lang: lang(), method: payMethod || "stars" }),
  }).then(function(r){ return r.json(); }).then(function(d){
    if (btn) btn.disabled = false;
    if (d.error || !d.link) { if (btn) btn.textContent = t("invoiceErr"); return; }
    if (btn) btn.textContent = t("invoiceOpening");
    window.location.href = d.link;
    // Поллим баланс — после возврата из Telegram чип обновится сам.
    var tries = 0;
    var iv = setInterval(function(){
      refreshAccount();
      var pw = document.getElementById("paywall");
      if (pw && !pw.classList.contains("hidden")) pwRecheck(true);
      if (++tries >= 24) clearInterval(iv);
    }, 5000);
  }).catch(function(){ if (btn) { btn.disabled = false; btn.textContent = t("netErr"); } });
}

(function initAccount() {
  var b1 = document.getElementById("buyP1");
  var b5 = document.getElementById("buyP5");
  var bw = document.getElementById("buyWallet");
  if (b1) b1.addEventListener("click", function(){ buyPack("p1"); });
  if (b5) b5.addEventListener("click", function(){ buyPack("p5"); });
  if (bw) bw.addEventListener("click", function(){
    if (_lastAccountStatus) { showPaywall("pay", _lastAccountStatus); return; }
    var acc = getAccount(); if (!acc) return;
    fetch(WORKER_URL + "/me", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: acc.token }),
    }).then(function(r){ return r.json(); }).then(function(st){
      if (!st.error) showPaywall("pay", st);
    }).catch(function(){});
  });
  var lo = document.getElementById("accLogout");
  if (lo) lo.addEventListener("click", function(){ clearAccount(); renderAccount(null); });
  // Дерзкий режим — запоминаем выбор.
  var cb = document.getElementById("toneEdgy");
  if (cb) {
    cb.checked = localStorage.getItem("fm-tone") === "edgy";
    cb.addEventListener("change", function(){ localStorage.setItem("fm-tone", cb.checked ? "edgy" : "soft"); });
  }
  refreshAccount();
  resumeTgLoginIfPending();
})();

/* ───────────────────  Гейт перед генерацией: пейволл  ─────────────────── */
var _pendingAnalysis = null;   // {metrics, shapeInfo} — ждёт прохода гейта
var _afterGate = null;         // что запустить после успешного гейта (анализ или сравнение)
var _gateBusy = false;

function fetchStatus(fresh) {
  var acc = getAccount();
  if (!acc) return Promise.resolve({ error: "auth" });
  return fetch(WORKER_URL + "/me", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: acc.token, fresh: fresh ? 1 : 0 }),
  }).then(function(r){ return r.json(); });
}

// Скан завершён → проверяем доступ; есть — генерим, нет — красивый пейволл.
function gateThenAI(metrics, shapeInfo) {
  _pendingAnalysis = { metrics: metrics, shapeInfo: shapeInfo };
  _afterGate = startAI;
  fetchStatus(false).then(function(st) {
    if (st.error === "auth") { showPaywall("auth"); return; }
    if (st.error) { showPaywall("auth"); return; }
    renderAccount(st);
    if ((st.unlimUntil && st.unlimUntil > Date.now()) || st.freeLeft > 0 || st.credits > 0) { hidePaywall(); runAfterGate(); }
    else if (!st.subscribed) showPaywall("sub");
    else showPaywall("pay", st);
  }).catch(function(){ runAfterGate(); }); // сеть легла — пусть решает воркер
}

function runAfterGate() { var f = _afterGate; _afterGate = null; (f || startAI)(); }

function startAI() {
  if (!_pendingAnalysis) return;
  var p = _pendingAnalysis; _pendingAnalysis = null;
  callAI(p.metrics, p.shapeInfo);
}

function showPaywall(state, st) {
  var pw = document.getElementById("paywall");
  var title = document.getElementById("pwTitle");
  var sub = document.getElementById("pwSub");
  var actions = document.getElementById("pwActions");
  if (!pw) { startAI(); return; }
  actions.innerHTML = "";

  function btn(label, cls, fn) {
    var b = document.createElement("button");
    b.type = "button"; b.className = cls; b.innerHTML = label;
    b.addEventListener("click", function(){ fn(b); });
    actions.appendChild(b);
    return b;
  }

  if (state === "auth") {
    title.textContent = t("pwReady");
    sub.textContent = t("pwLoginSub");
    btn(t("pwLoginBtn"), "pw-btn pw-btn-main", function(b){ startTgLogin(b); });
  } else if (state === "sub") {
    title.textContent = t("pwSubTitle");
    sub.textContent = t("pwSubSub");
    var a = document.createElement("a");
    a.className = "pw-btn pw-btn-main"; a.href = "https://t.me/wwwfacerateru";
    a.target = "_blank"; a.rel = "noopener";
    a.innerHTML = t("pwSubBtn");
    actions.appendChild(a);
    btn(t("pwSubCheck"), "pw-btn pw-btn-ghost", function(b){
      b.textContent = t("pwChecking"); pwRecheck();
    });
  } else { // pay
    var packs = (st && st.packs) || {
      p1: { stars: 45, rub: 70, lavaRub: 70, oldStars: 39, oldRub: 62, oldLavaRub: 62 },
      p5: { stars: 99, rub: 149, lavaRub: 149, oldStars: 99, oldRub: 149, oldLavaRub: 149 },
      h1: { stars: 139, rub: 199, lavaRub: 199, oldStars: 139, oldRub: 199, oldLavaRub: 199 },
      d1: { stars: 219, rub: 299, lavaRub: 299, oldStars: 219, oldRub: 299, oldLavaRub: 299 },
      m1: { stars: 749, rub: 999, lavaRub: 999, oldStars: 749, oldRub: 999, oldLavaRub: 999 },
    };
    var saleEndsAt = (st && st.saleEndsAt) || 0;
    // Таймер до конца недельной акции — на самом видном месте под заголовком.
    function saleCountdownText() {
      if (!saleEndsAt || saleEndsAt <= Date.now()) return "";
      var ms = saleEndsAt - Date.now();
      var days = Math.floor(ms / 86400000), hours = Math.floor((ms % 86400000) / 3600000);
      var left = days > 0 ? (days + "д " + hours + "ч") : (hours + "ч " + Math.floor((ms % 3600000) / 60000) + "м");
      return "🔥 Цены недели! До повышения: " + left;
    }
    title.textContent = t("pwPayTitle");
    sub.textContent = saleCountdownText() || t("pwPaySub");
    var methods = (st && st.methods) || ["stars"];
    var packNames = { p1: t("packP1"), p5: t("packP5"), h1: "⏱ " + t("packH1"), d1: "🔥 " + t("packD1"), m1: "👑 " + t("packM1") };
    var methodNames = { stars: t("payStars"), rub: t("payCard"), sbp: t("paySbp"), crypto: t("payCrypto") };
    // Шаг 2: тарифы под выбранный способ (цена в его валюте).
    function showPacks(method) {
      actions.innerHTML = "";
      title.textContent = t("pwPickPack"); sub.textContent = methodNames[method] || "";
      function rawPrice(p) {
        return method === "stars" ? p.stars : (((method === "rub" || method === "sbp") && p.lavaRub) ? p.lavaRub : p.rub);
      }
      function rawOldPrice(p) {
        return method === "stars" ? p.oldStars : (((method === "rub" || method === "sbp") && p.oldLavaRub) ? p.oldLavaRub : p.oldRub);
      }
      function packBtn(id) {
        var p = packs[id]; if (!p) return;
        var unit = method === "stars" ? "⭐" : "₽";
        var price = rawPrice(p) + unit;
        var top = id === "m1" ? (" <i class='pw-hit'>" + (saleEndsAt && saleEndsAt > Date.now() ? "🔥 хит скидки" : "top") + "</i>") : "";
        var was = "";
        // Зачёркнутая ОБЫЧНАЯ цена (до недельной акции), пока акция активна.
        var oldPrice = rawOldPrice(p);
        if (saleEndsAt && saleEndsAt > Date.now() && oldPrice && oldPrice > rawPrice(p)) {
          was = " <s class='pw-was'>" + oldPrice + unit + "</s>";
        }
        btn(packNames[id] + " — " + was + " " + price + top, "pw-btn pw-btn-main", function(b){ buyPack(id, b, method); });
      }
      packBtn("p1"); packBtn("p5"); packBtn("h1"); packBtn("d1"); packBtn("m1");
      btn(t("pwBack"), "pw-btn pw-btn-ghost", function(){ showPaywall("pay", st); });
    }
    // Шаг 1: выбор способа оплаты (только доступные).
    if (methods.indexOf("stars") >= 0) btn(t("payStars"), "pw-btn pw-btn-main", function(){ showPacks("stars"); });
    if (methods.indexOf("rub") >= 0) btn(t("payCard"), "pw-btn pw-btn-main", function(){ showPacks("rub"); });
    if (methods.indexOf("sbp") >= 0) btn(t("paySbp"), "pw-btn pw-btn-main", function(){ showPacks("sbp"); });
    if (methods.indexOf("crypto") >= 0) btn(t("payCrypto"), "pw-btn pw-btn-main", function(){ showPacks("crypto"); });
    btn(t("pwPaid"), "pw-btn pw-btn-ghost", function(b){
      b.textContent = t("pwChecking"); pwRecheck();
    });
  }

  pw.classList.remove("hidden");
  requestAnimationFrame(function(){ requestAnimationFrame(function(){ pw.classList.add("in"); }); });
}

function hidePaywall() {
  var pw = document.getElementById("paywall");
  if (!pw) return;
  pw.classList.remove("in");
  setTimeout(function(){ pw.classList.add("hidden"); }, 350);
}

// Перепроверка доступа (свежая проверка подписки) → генерим или обновляем пейволл.
function pwRecheck(silent) {
  if (_gateBusy) return;
  _gateBusy = true;
  fetchStatus(true).then(function(st) {
    _gateBusy = false;
    if (st.error) { if (!silent) showPaywall("auth"); return; }
    renderAccount(st);
    if ((st.unlimUntil && st.unlimUntil > Date.now()) || st.freeLeft > 0 || st.credits > 0) { hidePaywall(); runAfterGate(); }
    else if (!silent) showPaywall(!st.subscribed ? "sub" : "pay", st);
  }).catch(function(){ _gateBusy = false; });
}

(function initPaywall() {
  var x = document.getElementById("pwClose");
  if (x) x.addEventListener("click", function(){
    hidePaywall();
    _pendingAnalysis = null;
    backToUploadTop();
  });
})();

/* ═══════════════════  WHO MOGS: сравнение двух лиц  ═══════════════════ */
(function initCompare(){
  var A = null, B = null; // { canvas, box } — чистый canvas + рамка лица (норм.)
  var lastResult = null;  // { a, b, winner, verdict }

  function $(id){ return document.getElementById(id); }

  // Открыть/закрыть режим сравнения (из меню).
  window.fmOpenCompare = function(){
    var menu = $("menuScreen");
    if (menu){ menu.classList.remove("in"); setTimeout(function(){ menu.classList.add("hidden"); }, 420); }
    document.body.classList.add("post-landing", "compare-mode");
    $("uploadSection").classList.add("hidden");
    $("analysisView").classList.add("hidden");
    var cs = $("compareSection"); cs.classList.remove("hidden");
    showSetup();
  };
  function backToMenuFromCompare(){
    document.body.classList.remove("compare-mode");
    $("compareSection").classList.add("hidden");
    $("uploadSection").classList.remove("hidden"); // fmOpenCompare прячет его — иначе обычный анализ остаётся пустым
    document.body.classList.remove("post-landing");
    var menu = $("menuScreen");
    if (menu){ menu.classList.remove("hidden"); requestAnimationFrame(function(){ menu.classList.add("in"); }); }
  }

  function showSetup(){ $("cmpSetup").classList.remove("hidden"); $("cmpResult").classList.add("hidden"); $("cmpLoading").classList.add("hidden"); }

  // Детекция лица на изображении → {canvas, box(норм)} или null.
  async function detectFace(img){
    var fl = await initFaceLandmarker();
    var cv = document.createElement("canvas");
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    cv.getContext("2d").drawImage(img, 0, 0);
    var res = fl.detect(cv);
    if (!res.faceLandmarks || !res.faceLandmarks.length) return { canvas: cv, box: null };
    var raw = res.faceLandmarks[0], minx=1e9,miny=1e9,maxx=-1e9,maxy=-1e9;
    for (var i=0;i<raw.length;i++){ var p=raw[i]; if(p.x<minx)minx=p.x; if(p.x>maxx)maxx=p.x; if(p.y<miny)miny=p.y; if(p.y>maxy)maxy=p.y; }
    return { canvas: cv, box: { x:minx*cv.width, y:miny*cv.height, w:(maxx-minx)*cv.width, h:(maxy-miny)*cv.height } };
  }

  function loadInto(which, file){
    if (!file || !file.type.startsWith("image/")) return;
    var reader = new FileReader();
    reader.onload = function(e){
      var img = new Image();
      img.onload = async function(){
        var slot = which === "A" ? "cmpThumbA" : "cmpThumbB";
        var ph   = which === "A" ? "cmpPhA" : "cmpPhB";
        var imgEl= which === "A" ? "cmpImgA" : "cmpImgB";
        var scan = which === "A" ? "cmpScanA" : "cmpScanB";
        $(imgEl).src = e.target.result;
        $(ph).classList.add("hidden"); $(slot).classList.remove("hidden");
        $(scan).classList.remove("hidden"); // MediaPipe init + detect может занять время на первом фото — виден прогресс
        var res = await detectFace(img);
        $(scan).classList.add("hidden");
        if (which === "A") A = res; else B = res;
        cmpErr("");
        if (A && B) $("cmpRunBtn").classList.remove("hidden");
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function cmpErr(msg){ var e=$("cmpErr"); if(!msg){ e.classList.add("hidden"); e.textContent=""; } else { e.textContent=msg; e.classList.remove("hidden"); } }

  function runCompare(){
    if (!A || !B){ cmpErr(t("cmpNeedTwo")); return; }
    if (!A.box){ cmpErr(t("cmpNoFaceA")); return; }
    if (!B.box){ cmpErr(t("cmpNoFaceB")); return; }
    cmpErr("");
    // Соглашение и памятка — те же, что у обычного анализа. Раньше дуэль их
    // не спрашивала вовсе, хотя грузят сюда чаще чужое лицо, чем своё.
    if (!runWithGates(runCompare)) return;
    // Гейт: Who Moggs НЕ входит в бесплатную квоту (freeLeft) — только безлимит или платные кредиты.
    _afterGate = doCompare;
    fetchStatus(false).then(function(st){
      if (st.error === "auth"){ showPaywall("auth"); return; }
      renderAccount(st);
      if ((st.unlimUntil && st.unlimUntil > Date.now()) || st.credits > 0){ hidePaywall(); doCompare(); }
      else showPaywall("pay", st);
    }).catch(function(){ doCompare(); });
  }

  // Короткие ключи категорий для промпта/парсинга сравнения + метки для отображения.
  var CMP_CATS = [
    { key:"SYM",      label:t("labelSym") },
    { key:"EYES",     label:"Canthal Tilt / Eyes" },
    { key:"MAXILLA",  label:"Midface / Maxilla" },
    { key:"MANDIBLE", label:"Jawline / Mandible" },
    { key:"NOSE",     label:"Nose" },
    { key:"LIPS",     label:t("labelLips") },
    { key:"SKIN",     label:"Skin" },
    { key:"GROOM",    label:"Grooming / Style" },
  ];

  function comparePrompt(){
    var ru = lang() === "ru";
    var langLine = ru
      ? "Пиши TRAITS_A, TRAITS_B и VERDICT на русском. ВАЖНО: глагол «моггать» в этом контексте пишется «моггает» (наст. время) или «могнул» (прош. время) — форма «моггит» ГРАММАТИЧЕСКИ НЕВЕРНА и запрещена, никогда её не используй. Используй англоязычные луксмаксерские термины ПРЯМО ВНУТРИ русского текста (canthal tilt, gonial angle, zygomatic arch, maxilla, philtrum, malar fat pad, hunter eyes/prey eyes и т.п.) — не переводи их на русский, это профессиональный жаргон."
      : "Write TRAITS_A, TRAITS_B and VERDICT in English.";
    var catLines = CMP_CATS.map(function(c){ return "CAT_" + c.key + ": A=0.0 B=0.0"; }).join("\n");
    return "You are a savage looksmaxxing judge. You are given TWO separate face photos: the FIRST image is person A, the SECOND image is person B. IMPORTANT -- do NOT confuse 'same face type/aesthetic' with 'same person': two DIFFERENT people can share a similar look (e.g. both have hunter eyes, positive canthal tilt, sharp jawline) and MUST still get DIFFERENT scores reflecting their individual differences in nose shape, skin, proportions, hair, exact bone structure etc. DEFAULT TO TWO DIFFERENT PEOPLE. Same hair colour, same age, same lighting, same room, same general type -- none of that makes it one person, and neither does a similar overall vibe. Declare the same individual ONLY when you can point to at least TWO matching unique markers: an identically placed mole or scar, an identical nose shape down to the tip and bridge, an identical eyebrow shape, an identical hairline pattern. If you are anything less than certain, treat them as two different people. Even when it IS clearly the same person in two shots, the two photos still differ in angle, lighting and expression, so the CAT_ scores must still differ by a couple of tenths and TRAITS_A must NOT repeat TRAITS_B word for word -- describe what is visible in each photo separately. Copying the same three traits into both lists is always wrong. LIGHTING/ANGLE CAUTION: harsh side/back lighting or a steep up/down camera angle can create dramatic shadows that IMITATE strong jawline/gonial angle/maxilla projection or hooded/hunter eyes, even when the underlying bone structure is average -- mentally picture the same face under neutral frontal lighting before scoring jaw/maxilla/eyes, and don't let shadow alone justify a high score. This cuts both ways -- don't deliberately lowball a face just because it's dramatically lit either, if the strong features are genuinely visible independent of the lighting, score them fairly. \n\n" + PSL_SCALE_PROMPT + "\n\n For each person, identify their 3 most defining facial traits (specific, visual, comparative — e.g. sharp jawline, hooded eyes, high cheekbones, weak chin, wide-set eyes). ABSOLUTE, NOT RELATIVE: score each face exactly as you would if it were the only photo in front of you. The same face must get the same number whether it is compared with a model or with an ordinary person. Never lower one face to make the winner look stronger, and never raise one to keep the duel close -- the gap has to fall out of two independent honest scores. If both photos contain more than one person, judge only the face that fills most of the frame. Then decide who MOGS the other (higher overall aesthetics) and WHY, referencing the actual traits that separate them. Be brutally honest and witty. " + langLine +
      "\n\nAlso rate BOTH A and B on these 8 categories: Symmetry, Canthal Tilt/Eyes, Midface/Maxilla, Jawline/Mandible, Nose, Lips/Cheekbones, Skin, Grooming/Style. One decimal each (never .0), real spread between categories per person (do not give every category the same score) — this must be consistent with the overall SCORE_A/SCORE_B.\n\nReply STRICTLY in this plain format, nothing else:\nSCORE_A: 0.0\nTRAITS_A: trait one; trait two; trait three\nSCORE_B: 0.0\nTRAITS_B: trait one; trait two; trait three\nWINNER: A\nVERDICT: a sharp 2-3 sentence comparison explaining exactly why the winner mogs the loser, grounded in the specific traits of both faces (not a generic one-liner).\n" + catLines;
  }

  function doCompare(){
    $("cmpSetup").classList.add("hidden");
    startAIHUD(false, "cmpLoading");
    var acc = getAccount();
    var images = [oneToBase64(A.canvas), oneToBase64(B.canvas)];
    fetch(WORKER_URL, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      // stable обязателен и здесь: без него дуэль осталась бы на старых рассуждениях
      // и незапиненном провайдере, и баллы двух режимов снова разъехались бы.
      body: JSON.stringify({ prompt: comparePrompt(), images: images, token: acc ? acc.token : null, compare: true, stable: STABLE_SCORE })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (d.error){ stopAIHUD("cmpLoading"); showGate(d); $("compareSection").scrollIntoView({behavior:"smooth"}); return; }
      var parsed = parseCompare(d.text || "");
      if (parsed.a === null || parsed.b === null){ stopAIHUD("cmpLoading"); showSetup(); cmpErr(t("cmpErrGen")); return; }
      if (typeof d.creditsLeft !== "undefined") updateQuotaChip(d.freeLeft, d.creditsLeft, d.subscribed, d.unlimUntil);
      lastResult = parsed;
      renderCmpCats(parsed);
      buildCompareCard(parsed).then(function(){
        stopAIHUD("cmpLoading");
        $("cmpResult").classList.remove("hidden");
        // Карточку сравнения шлём в бота так же, как карточку обычного анализа.
        var cv = $("cmpCanvas");
        if (cv && cv.toBlob) cv.toBlob(function(b){ sendCardToTg(b); }, "image/png");
      });
    }).catch(function(){ stopAIHUD("cmpLoading"); showSetup(); cmpErr(t("cmpErrGen")); });
  }

  function parseCompare(txt){
    function num(re){ var m = txt.match(re); return m ? parseFloat(m[1]) : null; }
    function traits(re){
      var m = txt.match(re);
      if (!m) return [];
      return m[1].split(";").map(function(s){ return s.trim(); }).filter(Boolean).slice(0,3);
    }
    var a = num(/SCORE_A:\s*(\d+(?:\.\d+)?)/i);
    var b = num(/SCORE_B:\s*(\d+(?:\.\d+)?)/i);
    var traitsA = traits(/TRAITS_A:\s*([^\n]+)/i);
    var traitsB = traits(/TRAITS_B:\s*([^\n]+)/i);
    var wm = txt.match(/WINNER:\s*([AB])/i);
    var vm = txt.match(/VERDICT:\s*([\s\S]+?)(?:\n\s*CAT_|\n\s*\n|$)/i);
    var winner = wm ? wm[1].toUpperCase() : (a!==null&&b!==null ? (a>=b?"A":"B") : "A");
    var cats = CMP_CATS.map(function(c){
      var m = txt.match(new RegExp("CAT_" + c.key + ":\\s*A=(\\d+(?:\\.\\d+)?)\\s*B=(\\d+(?:\\.\\d+)?)", "i"));
      return m ? { label:c.label, a:parseFloat(m[1]), b:parseFloat(m[2]) } : null;
    }).filter(Boolean);
    return { a:a, b:b, traitsA:traitsA, traitsB:traitsB, winner:winner, verdict: vm ? vm[1].replace(/\s+/g," ").trim() : "", cats:cats };
  }

  // Отрисовка построчного сравнения по 8 категориям (A vs B) в DOM.
  function renderCmpCats(res){
    var box = $("cmpCatScores");
    if (!box) return;
    box.innerHTML = "";
    if (!res.cats || !res.cats.length) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    var eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow"; eyebrow.textContent = t("detailEyebrow");
    box.appendChild(eyebrow);
    res.cats.forEach(function(cat){
      var row = document.createElement("div"); row.className = "cmp-cat-row";
      var name = document.createElement("div"); name.className = "cmp-cat-name"; name.textContent = cat.label;
      var bars = document.createElement("div"); bars.className = "cmp-cat-bars";
      var valA = document.createElement("span"); valA.className = "cmp-cat-val"; valA.textContent = cat.a.toFixed(1);
      var trackA = document.createElement("div"); trackA.className = "cmp-cat-track";
      var fillA = document.createElement("div"); fillA.className = "cmp-cat-fill cmp-cat-fill-a" + (cat.a >= cat.b ? " cmp-cat-fill-win" : "");
      fillA.style.width = (cat.a * 10) + "%"; trackA.appendChild(fillA);
      var trackB = document.createElement("div"); trackB.className = "cmp-cat-track";
      var fillB = document.createElement("div"); fillB.className = "cmp-cat-fill cmp-cat-fill-b" + (cat.b > cat.a ? " cmp-cat-fill-win" : "");
      fillB.style.width = (cat.b * 10) + "%"; trackB.appendChild(fillB);
      var valB = document.createElement("span"); valB.className = "cmp-cat-val"; valB.textContent = cat.b.toFixed(1);
      bars.appendChild(valA); bars.appendChild(trackA); bars.appendChild(trackB); bars.appendChild(valB);
      row.appendChild(name); row.appendChild(bars);
      box.appendChild(row);
    });
  }

  // Рисует лицо в квадратную ячейку, возвращает Y-координату глаз в ячейке.
  // Кадр лица в ячейку произвольных пропорций. Возвращает y линии глаз в
  // координатах карточки — по ней ставится плашка MOGGED.
  function drawFaceCell(g, face, cx, cy, w, h){
    var src = face.canvas, box = face.box;
    g.save(); roundRect(g, cx, cy, w, h, 20); g.clip();
    if (box){
      var ar = w / h;
      var fcx = box.x + box.w/2, fcy = box.y + box.h*0.44;
      var rh = box.h*2.15, rw = rh*ar;
      if (rw > src.width){ rw = src.width; rh = rw/ar; }
      if (rh > src.height){ rh = src.height; rw = rh*ar; }
      var rx = Math.max(0, Math.min(fcx - rw/2, src.width - rw));
      var ry = Math.max(0, Math.min(fcy - rh/2, src.height - rh));
      g.drawImage(src, rx, ry, rw, rh, cx, cy, w, h);
      // низ кадра притушен, чтобы балл под фото не спорил с картинкой
      var sh = g.createLinearGradient(0, cy+h*0.62, 0, cy+h);
      sh.addColorStop(0,"rgba(5,5,5,0)"); sh.addColorStop(1,"rgba(5,5,5,.55)");
      g.fillStyle = sh; g.fillRect(cx, cy, w, h);
      g.restore();
      var eyeSrcY = box.y + box.h*0.40;
      return cy + (eyeSrcY - ry)/rh * h;
    }
    var k = Math.max(w/src.width, h/src.height);
    var dw = src.width*k, dh = src.height*k;
    g.drawImage(src, cx + (w-dw)/2, cy + (h-dh)*0.3, dw, dh);
    g.restore();
    return cy + h*0.42;
  }

  // Панель с золотой рамкой — общий приём всей карточки: черты, вердикт и
  // разбор лежат в одинаковых блоках, поэтому лист читается как единое целое.
  function cmpPanel(g, x, y, w, h){
    g.save();
    g.fillStyle = "rgba(255,255,255,0.018)";
    roundRect(g, x, y, w, h, 18); g.fill();
    g.strokeStyle = "rgba(196,164,107,0.28)"; g.lineWidth = 1.4;
    roundRect(g, x, y, w, h, 18); g.stroke();
    g.restore();
  }

  function buildCompareCard(res){
    return loadCatIcons().then(function(){ return _buildCompareCard(res); });
  }

  // Точка входа для локальной проверки вёрстки карточки: подставляет два фото и
  // готовый разбор, ничего не отправляя в воркер и не списывая кредит.
  // В обычном потоке не используется.
  // Кнопка «Видео дуэли»: тот же рендер в браузере, что и у обычного анализа,
  // но своя композиция кадра — см. svbDrawFrame в sharevideo.js.
  document.addEventListener('click', async function (e) {
    var btn = e.target.closest('#cmpVideoBtn');
    if (!btn || btn.disabled) return;
    if (!lastResult || !A || !B) return;
    var label = $('cmpVideoBtnText');
    var was = label ? label.textContent : '';
    btn.disabled = true;
    try {
      var blob = await window.svMakeCompareVideo(A, B, lastResult, function (pr) {
        if (label) label.textContent = 'Собираю видео… ' + Math.round(pr * 100) + '%';
      });
      window.svDownload(blob);
      if (label) label.textContent = 'Готово, файл скачан';
    } catch (err) {
      if (label) label.textContent = 'Не получилось: ' + err.message;
    }
    setTimeout(function () { if (label) label.textContent = was; }, 3500);
    btn.disabled = false;
  });

  window._fmTestCompareCard = function(imgA, imgB, res){
    function wrap(img){
      var cv = document.createElement("canvas");
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      cv.getContext("2d").drawImage(img, 0, 0);
      return { canvas: cv, box: null };
    }
    A = wrap(imgA); B = wrap(imgB);
    return buildCompareCard(res);
  };

  function _buildCompareCard(res){
    return new Promise(function(resolve){
      var W = 1080, H = 2080;
      var cv = $("cmpCanvas"); cv.width=W; cv.height=H;
      var g = cv.getContext("2d");
      var GOLD="#c4a46b", GOLD_HI="#e8cf96", DIM="#8a7f6a", WIN="#ecdaa8", LOSE="#8a8378";
      function ls(px){ try{ g.letterSpacing=px+"px"; }catch(e){} }

      g.fillStyle="#050505"; g.fillRect(0,0,W,H);
      var glow=g.createRadialGradient(W/2,0,80,W/2,0,850);
      glow.addColorStop(0,"rgba(196,164,107,0.10)"); glow.addColorStop(1,"rgba(196,164,107,0)");
      g.fillStyle=glow; g.fillRect(0,0,W,850);
      g.strokeStyle="rgba(196,164,107,0.35)"; g.lineWidth=2; roundRect(g,22,22,W-44,H-44,30); g.stroke();

      // ── шапка (всегда на английском, независимо от языка сайта) ──
      g.textAlign="left"; g.textBaseline="alphabetic"; g.font="bold 58px Georgia,serif"; ls(4);
      var bw=g.measureText("FACERATE").width, pw=74, gp=22, sx=(W-(pw+gp+bw))/2;
      drawBrandPill(g, sx+pw/2, 88, pw, 32);
      var bg=g.createLinearGradient(0,58,0,108); bg.addColorStop(0,"#f4ead2"); bg.addColorStop(1,"#cbb789");
      g.fillStyle=bg; g.fillText("FACERATE", sx+pw+gp, 106); ls(0);
      g.textAlign="center"; g.font="24px Georgia,serif"; ls(9); g.fillStyle=GOLD;
      g.fillText("WHO MOGGS?", W/2, 152); ls(0);

      var winA = res.winner === "A";

      // ── два портрета ──
      var cw=396, ch=486, gap=76, y=196;
      var xA=(W-cw*2-gap)/2, xB=xA+cw+gap;
      var eyeA=drawFaceCell(g, A, xA, y, cw, ch);
      var eyeB=drawFaceCell(g, B, xB, y, cw, ch);
      [[xA,winA],[xB,!winA]].forEach(function(k){
        g.lineWidth = k[1] ? 3 : 2;
        g.strokeStyle = k[1] ? GOLD_HI : "rgba(120,120,120,0.45)";
        roundRect(g,k[0],y,cw,ch,20); g.stroke();
      });
      [["A",xA],["B",xB]].forEach(function(k){
        g.fillStyle="rgba(0,0,0,0.72)"; roundRect(g,k[1]+16,y+16,52,44,10); g.fill();
        g.strokeStyle="rgba(196,164,107,.45)"; g.lineWidth=1; roundRect(g,k[1]+16,y+16,52,44,10); g.stroke();
        g.fillStyle=GOLD_HI; g.font="27px Georgia,serif"; g.textAlign="center";
        g.fillText(k[0], k[1]+42, y+47);
      });
      // MOGGED — по линии глаз проигравшего, всегда на английском
      var tieBar = Math.abs(res.a - res.b) < 0.05;
      if (!tieBar) {
        var loserX = winA ? xB : xA, loserEyeY = winA ? eyeB : eyeA;
        var barH=56, barPad=24;
        g.fillStyle="#000"; g.fillRect(loserX+barPad, loserEyeY-barH/2, cw-barPad*2, barH);
        g.fillStyle="#ff2d2d"; g.font="bold 34px Georgia,serif"; g.textAlign="center"; ls(4);
        g.fillText("MOGGED", loserX+cw/2, loserEyeY+12); ls(0);
      }

      // VS в круге между портретами
      var vsY = y + ch/2;
      g.save();
      g.fillStyle="#050505"; g.beginPath(); g.arc(W/2, vsY, 38, 0, Math.PI*2); g.fill();
      g.shadowColor="rgba(232,207,150,.5)"; g.shadowBlur=18;
      g.strokeStyle=GOLD; g.lineWidth=1.4; g.beginPath(); g.arc(W/2, vsY, 38, 0, Math.PI*2); g.stroke();
      g.restore();
      g.fillStyle=GOLD_HI; g.font="italic 34px Georgia,serif"; g.textAlign="center";
      g.fillText("vs", W/2, vsY+12);

      // ── баллы под портретами ──
      var scoreY = y + ch + 92;
      [[xA,res.a,winA],[xB,res.b,!winA]].forEach(function(k){
        g.textAlign="center"; g.font="300 92px Georgia,serif";
        g.fillStyle = k[2] ? GOLD_HI : "#9a9084";
        g.fillText(Number(k[1]).toFixed(1), k[0]+cw/2, scoreY);
      });

      // ── черты: панель с иконками, по одной строке ──
      // Иконки идут по кругу из общего набора: у сравнения нет привязки черты
      // к категории, важен только ритм списка.
      var ICON_CYCLE = ["sym","eyes","jaw","midface","lips","hair","skin","nose"];
      var trY = scoreY + 34, trH = 208;
      [[xA,res.traitsA,winA],[xB,res.traitsB,!winA]].forEach(function(k){
        cmpPanel(g, k[0], trY, cw, trH);
        var list = (k[1]||[]).slice(0,5);
        g.textAlign="left"; g.textBaseline="middle";
        list.forEach(function(tr,i){
          var ry = trY + 34 + i*36;
          drawCatIcon(g, ICON_CYCLE[i % ICON_CYCLE.length], k[0]+40, ry, 30,
                      k[2] ? GOLD : "#6f695e");
          g.font="23px Georgia,serif";
          g.fillStyle = k[2] ? "#d8c9a3" : "#8a8378";
          var line = tr;
          while (g.measureText(line).width > cw-96 && line.length > 4) line = line.slice(0,-2);
          if (line !== tr) line += "…";
          g.fillText(line, k[0]+66, ry);
        });
        g.textBaseline="alphabetic";
      });

      // ── вердикт ──
      var vY = trY + trH + 34, vH = 300;
      cmpPanel(g, 60, vY, W-120, vH);
      g.textAlign="center";
      g.font="20px Georgia,serif"; ls(8); g.fillStyle=GOLD;
      g.fillText("VERDICT", W/2, vY+44); ls(0);
      // Если баллы совпали до десятой, «A MOGS B» звучит абсурдно рядом с двумя
      // одинаковыми числами. Показываем ничью — это честнее, чем назначать победителя.
      var tie = Math.abs(res.a - res.b) < 0.05;
      var winLabel = tie ? "DEAD EVEN" : (res.winner + " MOGS " + (winA ? "B" : "A"));
      g.font="bold 66px Georgia,serif"; ls(3);
      var vg=g.createLinearGradient(0,vY+56,0,vY+112);
      vg.addColorStop(0,"#f4ead2"); vg.addColorStop(1,"#b3924f");
      g.fillStyle=vg; g.fillText(winLabel, W/2, vY+110); ls(0);
      g.font="27px Georgia,serif"; g.fillStyle="#bdb3a2";
      wrapText(g, res.verdict, W/2, vY+164, W-220, 38, 4);

      // ── разбор по категориям ──
      if (res.cats && res.cats.length){
        var CAT_ICON_ORDER = ["sym","eyes","midface","jaw","nose","lips","skin","hair"];
        var rows = res.cats.slice(0,8);
        var rowH = 56, bY = vY + vH + 34, bH = 66 + rows.length*rowH;
        cmpPanel(g, 60, bY, W-120, bH);
        g.textAlign="center"; g.font="20px Georgia,serif"; ls(8); g.fillStyle=GOLD;
        g.fillText("BREAKDOWN", W/2, bY+42); ls(0);
        rows.forEach(function(cat,i){
          var ry = bY + 92 + i*rowH;
          var aWins = cat.a >= cat.b;
          drawCatIcon(g, CAT_ICON_ORDER[i] || "sym", 128, ry-8, 30, GOLD);
          g.textAlign="left"; g.font="28px Georgia,serif";
          g.fillStyle = aWins ? WIN : LOSE;
          g.fillText(cat.a.toFixed(1), 176, ry);
          g.textAlign="right"; g.fillStyle = aWins ? LOSE : WIN;
          g.fillText(cat.b.toFixed(1), W-128, ry);
          g.textAlign="center"; g.font="23px Georgia,serif"; g.fillStyle="#a49a8c";
          g.fillText(cat.label, W/2, ry);
          if (i < rows.length-1){
            g.strokeStyle="rgba(196,164,107,0.10)"; g.lineWidth=1;
            g.beginPath(); g.moveTo(150, ry+20); g.lineTo(W-150, ry+20); g.stroke();
          }
        });
      }

      // ── футер ──
      g.textAlign="center"; g.font="40px Georgia,serif"; ls(3);
      var fg=g.createLinearGradient(0,H-92,0,H-52);
      fg.addColorStop(0,"#eddcab"); fg.addColorStop(1,"#b3924f");
      g.fillStyle=fg; g.fillText("facerate.ru", W/2, H-58); ls(0);

      resolve();
    });
  }

  function wrapText(g, text, cx, y, maxW, lh, maxLines){
    var words=(text||"").split(" "), line="", lines=[];
    for (var i=0;i<words.length;i++){
      var test=line?line+" "+words[i]:words[i];
      if (g.measureText(test).width>maxW && line){ lines.push(line); line=words[i]; } else line=test;
    }
    if (line) lines.push(line);
    lines.slice(0, maxLines || 3).forEach(function(l,i){ g.fillText(l, cx, y+i*lh); });
  }

  function shareBlob(){ return new Promise(function(res){ $("cmpCanvas").toBlob(function(b){ res(b); }, "image/png"); }); }

  // ── wiring ──
  document.addEventListener("DOMContentLoaded", function(){
    var tile=$("menuCompareBtn"); if(tile) tile.addEventListener("click", function(){ window.fmOpenCompare(); });
    $("cmpBackBtn").addEventListener("click", backToMenuFromCompare);
    $("cmpAgainBtn").addEventListener("click", function(){ A=null;B=null; $("cmpImgA").src=""; $("cmpImgB").src="";
      $("cmpThumbA").classList.add("hidden"); $("cmpPhA").classList.remove("hidden");
      $("cmpThumbB").classList.add("hidden"); $("cmpPhB").classList.remove("hidden");
      $("cmpRunBtn").classList.add("hidden"); cmpErr(""); showSetup(); });
    $("cmpSlotA").addEventListener("click", function(){ if(!A) $("cmpInputA").click(); });
    $("cmpSlotB").addEventListener("click", function(){ if(!B) $("cmpInputB").click(); });
    $("cmpInputA").addEventListener("change", function(e){ if(e.target.files[0]) loadInto("A", e.target.files[0]); });
    $("cmpInputB").addEventListener("change", function(e){ if(e.target.files[0]) loadInto("B", e.target.files[0]); });
    $("cmpRunBtn").addEventListener("click", runCompare);
    $("cmpShareBtn").addEventListener("click", async function(){
      var blob=await shareBlob(); var file=new File([blob],"facerate-mogs.png",{type:"image/png"});
      if (navigator.canShare && navigator.canShare({files:[file]})){ try{ await navigator.share({files:[file], text:t("cmpShareText")}); return; }catch(e){} }
      var url=URL.createObjectURL(blob); var a=document.createElement("a"); a.href=url; a.download="facerate-mogs.png"; a.click(); URL.revokeObjectURL(url);
    });
    $("cmpTgBtn").addEventListener("click", async function(b){
      var btn=this, acc=getAccount(); if(!acc){ backToUploadTop(); return; }
      btn.disabled=true; btn.textContent=t("tgCardSending");
      var blob=await shareBlob(); var fr=new FileReader();
      fr.onload=function(){
        fetch(WORKER_URL+"/sendcard",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({token:acc.token, image:String(fr.result).split(",")[1]})})
        .then(function(r){return r.json();}).then(function(d){ btn.disabled=false; btn.textContent=d.ok?t("tgCardOk"):t("tgCardErr"); setTimeout(function(){btn.textContent=t("tgCard");},3500); })
        .catch(function(){ btn.disabled=false; btn.textContent=t("tgCardErr"); });
      };
      fr.readAsDataURL(blob);
    });
  });
})();


/* ════════════ ВЕДЕНИЕ ════════════ */
/* ═══════════════════════════════════════════════════════════════
   FaceRate · Ведение — фронтенд
   ---------------------------------------------------------------
   Дописать в конец app.js. Данные приходят из POST /progress,
   замер уходит обычным POST / с флагом measure:true.
   Фото нигде не сохраняются: ни на сервере, ни в браузере.
   ═══════════════════════════════════════════════════════════════ */

// ─── состояние раздела ───
let PG = null;              // ответ /progress
let POINTS = [];            // [{t, overall, cats, quality}]
let CATS_HIST = {};         // {название: [баллы по замерам]}
let CURRENT_WEEK = 1;
let pgLoaded = false;

const CAT_RU = {
  'СИММЕТРИЯ': 'Симметрия', 'ГЛАЗА_CANTHAL_TILT': 'Глаза',
  'МИДФЕЙС_MAXILLA': 'Мидфейс', 'ДЖОУЛАЙН_MANDIBLE': 'Джоулайн',
  'НОС_NOSE': 'Нос', 'ГУБЫ_СКУЛЫ': 'Губы/скулы',
  'КОЖА': 'Кожа', 'ГРУМИНГ_STYLE': 'Груминг',
};

const PARAMS = [
  { k:'СИММЕТРИЯ', n:'Симметрия', v:7.1, prev:7.0,
    what:'Насколько совпадают половины лица. Считается по 468 точкам, которые ставит анализатор.',
    ctrl:'Частично. Костная асимметрия не меняется, но заметная часть перекоса - это отёк, привычка спать на одном боку и наклон головы.',
    todo:['Спать на спине - сон лицом в подушку годами усиливает асимметрию','Убрать соль и алкоголь: односторонний отёк читается как перекос','Проверить осанку и положение головы за компьютером'] },
  { k:'ГЛАЗА_CANTHAL_TILT', n:'Глаза · canthal tilt', v:6.4, prev:6.0,
    what:'Наклон линии от внутреннего угла глаза к внешнему. Положительный наклон считается более эстетичным.',
    ctrl:'Сам наклон - генетика. Но восприятие взгляда сильно зависит от отёка, тёмных кругов и формы бровей.',
    todo:['7–9 часов сна: недосып даёт отёк верхнего века и «падающий» взгляд','Брови: убрать монобровь, не истончать сверху','Тёмные круги - сначала понять причину (глава 02 гайда)'] },
  { k:'МИДФЕЙС_MAXILLA', n:'Мидфейс · maxilla', v:5.9, prev:5.9,
    what:'Длина средней трети лица относительно ширины. Короткий мидфейс воспринимается лучше.',
    ctrl:'Почти нет - это кость. Визуально работает только через объём волос и процент жира.',
    todo:['Не гнаться за этим параметром - он самый «генетический» из восьми','Стрижка с объёмом сверху зрительно укорачивает среднюю треть','Снижение жира делает скулы читаемыми, и мидфейс воспринимается компактнее'] },
  { k:'ДЖОУЛАЙН_MANDIBLE', n:'Джоулайн · mandible', v:6.2, prev:5.5,
    what:'Читаемость линии челюсти и угла нижней челюсти.',
    ctrl:'Высоко. Сам угол - кость, но видимость челюсти почти целиком определяется жиром, отёком и осанкой.',
    todo:['Дефицит 300–500 ккал и белок 1.6–2 г/кг - главный рычаг','Убрать алкоголь: эффект на отёк виден за 3–5 дней','Chin tuck и монитор на уровне глаз','Жвачка и тренажёры - не делать, они расширяют низ лица'] },
  { k:'НОС_NOSE', n:'Нос', v:6.0, prev:6.1,
    what:'Пропорции носа относительно остального лица.',
    ctrl:'Без хирурга - нет. Но на фото параметр очень чувствителен к оптике.',
    todo:['Снимать основной камерой с 1.5–2 м - селфи увеличивает нос','Поворот на 15–30° вместо строгого анфаса','Если балл скачет между замерами - почти всегда дело в ракурсе'] },
  { k:'ГУБЫ_СКУЛЫ', n:'Губы и скулы', v:6.6, prev:6.4,
    what:'Наполненность губ и выраженность скуловой области.',
    ctrl:'Частично: сухость губ и отёк скул управляемы, форма - нет.',
    todo:['Бальзам для губ - потрескавшиеся губы это минус балл за неухоженность','Скулы проявляются при снижении жира, отдельно их «накачать» нельзя'] },
  { k:'КОЖА', n:'Кожа', v:6.8, prev:5.9,
    what:'Текстура, ровность тона, воспаления, постакне.',
    ctrl:'Максимально. Самый быстро меняющийся параметр из восьми.',
    todo:['Очищение → увлажнение → SPF каждое утро','Один актив за раз, оценивать не раньше месяца','Кистозное акне и рубцы - к дерматологу, дома не решается'] },
  { k:'ГРУМИНГ_STYLE', n:'Груминг и стиль', v:7.0, prev:6.2,
    what:'Стрижка, борода, брови, общая ухоженность и подача.',
    ctrl:'Полностью. Самая быстрая отдача во всём гайде.',
    todo:['Стрижка под форму лица, с референсами - не «как обычно»','Триммер: нос, уши, шея - раз в 2 недели','Одежда по размеру важнее бренда'] },
];

const WEEKS = [
  { n:1,  t:'Сон и вода', task:'Фиксированное время отбоя, 7–9 часов, 2–2.5 л воды равномерно за день.', why:'Отёк - самое быстрое, что можно убрать. Эффект виден за 3–5 дней.', check:'Пять ночей подряд лёг в одно и то же время (±30 мин).', tip:'У тебя отмечена отёчность верхнего века - начни именно с этого, эффект на балл за глаза будет заметнее всего.', ch:'04', cht:'Сон, вода, соль, алкоголь', pg:'10' },
  { n:2,  t:'Кожа: базовая рутина', task:'Очищение утром и вечером, увлажнение, SPF 30+ каждое утро. Активы пока не трогаем.', why:'Без базы активы не работают, а с сожжённым барьером кожа выглядит хуже, чем до начала.', check:'SPF нанесён 7 дней из 7.', tip:'В анализе отмечены расширенные поры в T-зоне - тебе подойдёт гель-крем, а не плотный крем.', ch:'02', cht:'Кожа: фундамент всего', pg:'5' },
  { n:3,  t:'Питание', task:'Посчитать норму калорий, выставить дефицит 300–500 ккал, белок 1.6–2 г/кг. Убрать алкоголь.', why:'Процент жира - главный рычаг для челюсти и скул.', check:'Взвесился в один и тот же день недели, утром.', tip:'Джоулайн - твой самый управляемый параметр из низких. Именно эта неделя даст по нему больше всего.', ch:'03', cht:'Процент жира и лицо', pg:'8' },
  { n:4,  t:'Груминг', task:'Стрижка у хорошего мастера с 3–4 референсами. Брови. Триммер. Записаться на гигиену к стоматологу.', why:'Самая быстрая отдача: восприятие меняется за один визит.', check:'Стрижка сделана, референсы показаны мастеру.', tip:'Форма лица определена как ромб - проси объём на лбу и у подбородка, но не на уровне скул.', ch:'05', cht:'Груминг: волосы, борода, брови', pg:'11' },
  { n:5,  t:'Первый актив', task:'Ниацинамид или ретинол 2 раза в неделю, только на ночь. Наблюдать 2–3 недели.', why:'Кожа обновляется за 28 дней, раньше оценивать бессмысленно.', check:'Ни одного вечера с двумя активами сразу.', tip:'При твоём постакне азелаиновая кислота даст больше, чем ретинол на старте.', ch:'02', cht:'Кожа: активы', pg:'7' },
  { n:6,  t:'Силовые', task:'3 тренировки в неделю с акцентом на плечи и спину. Плюс 8–10 тыс. шагов ежедневно.', why:'Сохраняет мышцы в дефиците и расширяет силуэт.', check:'3 тренировки и средние 8 тыс. шагов за неделю.', tip:'', ch:'08', cht:'Тело и одежда', pg:'15' },
  { n:7,  t:'Осанка', task:'Chin tuck ежедневно, растяжка грудных, монитор на уровень глаз.', why:'Поза вперёд головой прячет челюсть и укорачивает шею.', check:'Chin tuck 3 подхода в день, 5 дней из 7.', tip:'У тебя отмечен небольшой наклон головы вправо - он даёт часть штрафа за симметрию.', ch:'07', cht:'Осанка, шея, линия челюсти', pg:'14' },
  { n:8,  t:'Контрольная точка', task:'Повторить фото в тех же условиях, сделать замер и сравнить с днём 0.', why:'Здесь обычно кажется, что ничего не изменилось - а фото показывает обратное.', check:'Замер сделан, сравнение открыто.', weak:true, tip:'Джоулайн у тебя сейчас самый низкий параметр - 5.2. Держи дефицит 400 ккал, жир на щеках прячет угол челюсти.', ch:'09', cht:'Фотогеничность', pg:'16' },
  { n:9,  t:'Гардероб', task:'Разбор шкафа: убрать всё не по размеру. Собрать базу из 8–10 однотонных вещей.', why:'Посадка вещей влияет на общее впечатление сильнее большинства деталей лица.', check:'В шкафу не осталось вещей не по размеру.', tip:'', ch:'08', cht:'Тело и одежда', pg:'15' },
  { n:10, t:'Второй актив', task:'Если кожа приняла первый - добавить кислоту в другие дни. При раздражении - откатиться.', why:'Наслаивать активы можно только по одному и только на спокойной коже.', check:'Нет покраснения и шелушения третий день подряд.', tip:'', ch:'02', cht:'Кожа: активы', pg:'7' },
  { n:11, t:'Фото-навык', task:'Отработать ракурсы из главы 09. Найти рабочий угол и свет. Обновить аватарки.', why:'Половина «плохой внешности на фото» - это оптика и свет.', check:'Есть серия из 20+ кадров, выбран рабочий ракурс.', tip:'Балл за нос у тебя скачет между замерами - почти наверняка это дистанция съёмки.', ch:'09', cht:'Фотогеничность', pg:'16' },
  { n:12, t:'Долгосрочное', task:'Консультация ортодонта при вопросах к прикусу. Дерматолог, если акне не ушло.', why:'Через 90 дней есть режим, в который такие истории встраиваются.', check:'Записан хотя бы на одну консультацию.', tip:'', ch:'06', cht:'Зубы и улыбка', pg:'13' },
  { n:13, t:'Финальный замер', task:'Фото в тех же условиях, вес, замер. Сравнение всех трёх точек.', why:'Сравнение с собой в день 0 - единственная честная метрика.', check:'Три точки сравнены, решение по второму циклу принято.', tip:'', ch:'12', cht:'План на 90 дней', pg:'20' },
];

const CHAPTERS = [
  ['01','Словарь луксмаксера','PSL, mogging, canthal tilt, fWHR'],
  ['02','Кожа: фундамент всего','Рутина из 4 шагов'],
  ['03','Процент жира и лицо','Главный рычаг софтмаксинга'],
  ['04','Сон, вода, соль, алкоголь','Отёчность - главный вор внешности'],
  ['05','Груминг','Волосы, борода, брови'],
  ['06','Зубы и улыбка','Недооценённый параметр'],
  ['07','Осанка, шея, челюсть','Что работает, а что фольклор'],
  ['08','Тело и одежда','Плечи, посадка, силуэт'],
  ['09','Фотогеничность','Почему селфи врут'],
  ['10','Мифы и опасные практики','Мьюинг, bone smashing, жвачка'],
  ['11','Методы из TikTok','Тейп, йохимбин, тэллоу, мочегонки'],
  ['12','План на 90 дней','Понедельная разбивка'],
  ['13','Чек-листы и трекер','Ежедневный и еженедельный'],
  ['14','На чём это основано','Исследования и позиции организаций'],
];

/* ═══════════ ГРАФИК ═══════════ */
const DAY = 864e5;
const fmtD = iso => { const d = new Date(iso); return String(d.getDate()).padStart(2,'0') + '.' + String(d.getMonth()+1).padStart(2,'0'); };
const MON = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
const fmtLong = iso => { const d = new Date(iso); return d.getDate() + ' ' + MON[d.getMonth()]; };
let chartCat = null;
let shareA = 0, shareB = 0;
let confirmed = false;
const shotImg = [null, null];
const GOLD = '#c4a46b', GOLD_HI = '#e8d4a0', BG = '#0a0a0a';

function drawChart(){
  const host = document.getElementById('chart');
  const W = host.clientWidth || 700, H = 210;
  const padL = 36, padR = 18, padT = 26, padB = 34;

  const series = chartCat ? CATS_HIST[chartCat] : POINTS.map(p => p.overall);
  const t0 = new Date(POINTS[0].t).getTime();
  const tN = new Date(POINTS[POINTS.length-1].t).getTime();
  const span = Math.max(1, tN - t0);

  const vals = series.slice();
  let lo = Math.floor(Math.min(...vals) * 2) / 2 - .5;
  let hi = Math.ceil(Math.max(...vals) * 2) / 2 + .5;
  if (hi - lo < 1.5) { hi = lo + 1.5; }

  // Если все замеры пришлись на один день, раскладке по времени не за что
  // зацепиться: точки схлопываются в одну, а подписи дат печатаются друг
  // на друге («08.0808.08»). В этом случае разносим точки по порядку.
  const sameDay = (tN - t0) < DAY;
  const x = i => sameDay
    ? padL + (POINTS.length < 2 ? .5 : i / (POINTS.length - 1)) * (W - padL - padR)
    : padL + (new Date(POINTS[i].t).getTime() - t0) / span * (W - padL - padR);
  const y = v => padT + (hi - v) / (hi - lo) * (H - padT - padB);

  // горизонтальные линии сетки
  let grid = '';
  for (let v = Math.ceil(lo*2)/2; v <= hi; v += .5){
    const isInt = Math.abs(v - Math.round(v)) < .01;
    grid += `<line class="grid" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W-padR}" y2="${y(v).toFixed(1)}"${isInt?'':' opacity=".45"'}/>`;
    if (isInt) grid += `<text class="lbl" x="4" y="${(y(v)+3.5).toFixed(1)}">${v}</text>`;
  }

  const pts = series.map((v,i) => [x(i), y(v)]);
  const d = pts.map((p,i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = d + ` L${pts[pts.length-1][0].toFixed(1)} ${H-padB} L${pts[0][0].toFixed(1)} ${H-padB} Z`;

  // подписи дат: первую и последнюю всегда, промежуточные - если не наезжают
  let marks = '', lastLabelX = -999, lastLabelTxt = '';
  pts.forEach((p,i) => {
    const P = POINTS[i], diff = P.q !== 'СОПОСТАВИМО';
    marks += `<circle class="dot${diff?' warn':''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="4.5" style="animation-delay:${(1+i*.12).toFixed(2)}s"><title>${fmtLong(P.t)} - ${series[i].toFixed(1)}${P.note?' · '+P.note:''}</title></circle>`;
    marks += `<text class="val" x="${p[0].toFixed(1)}" y="${(p[1]-13).toFixed(1)}" text-anchor="middle">${series[i].toFixed(1)}</text>`;
    const txt = fmtD(P.t);
    const room = i === 0 || p[0] - lastLabelX > 62;
    if (txt !== lastLabelTxt && (room || i === pts.length-1)){
      const anch = i === 0 ? 'start' : i === pts.length-1 ? 'end' : 'middle';
      marks += `<text class="lbl" x="${p[0].toFixed(1)}" y="${H-14}" text-anchor="${anch}">${txt}</text>`;
      lastLabelX = p[0]; lastLabelTxt = txt;
    }
  });

  const totalDays = Math.round((tN - t0) / DAY);

  host.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
       <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0%" stop-color="#c4a46b" stop-opacity=".22"/>
         <stop offset="100%" stop-color="#c4a46b" stop-opacity="0"/>
       </linearGradient></defs>
       ${grid}
       <path class="area" d="${area}"/>
       <path class="ln" d="${d}" style="--len:${(W*1.8).toFixed(0)}"/>
       ${marks}
     </svg>`;

  const dl = series[series.length-1] - series[0];
  document.getElementById('mCount').textContent = POINTS.length;
  document.getElementById('mDelta').textContent = (dl >= 0 ? '+' : '') + dl.toFixed(1);
  document.getElementById('mSpan').textContent = totalDays + ' дн.';
}

function roundRect(c, x, y, w, h, r){
  c.beginPath();
  c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r);
  c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath();
}

function drawPhoto(c, img, x, y, w, h){
  c.save(); roundRect(c, x, y, w, h, 20); c.clip();
  if (img && img.complete && img.naturalWidth){
    const s = Math.max(w/img.naturalWidth, h/img.naturalHeight);
    const dw = img.naturalWidth*s, dh = img.naturalHeight*s;
    c.drawImage(img, x+(w-dw)/2, y+(h-dh)/2, dw, dh);
  } else {
    const g = c.createLinearGradient(x, y, x, y+h);
    g.addColorStop(0, '#1a1a1a'); g.addColorStop(1, '#101010');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(196,164,107,.35)';
    c.font = '300 26px "Cormorant Garamond", serif';
    c.textAlign = 'center';
    c.fillText('фото', x+w/2, y+h/2);
  }
  c.restore();
  c.strokeStyle = 'rgba(196,164,107,.45)'; c.lineWidth = 2;
  roundRect(c, x, y, w, h, 20); c.stroke();
}

function buildShare(){
  const cv = document.getElementById('shareCanvas');
  const c = cv.getContext('2d');
  const W = cv.width, H = cv.height;

  const A = POINTS[shareA], B = POINTS[shareB];
  const dl = +(B.overall - A.overall).toFixed(1);
  const days = Math.round((new Date(B.t) - new Date(A.t)) / DAY);

  c.fillStyle = BG; c.fillRect(0, 0, W, H);

  // рамка
  c.strokeStyle = 'rgba(196,164,107,.5)'; c.lineWidth = 3;
  roundRect(c, 26, 26, W-52, H-52, 28); c.stroke();

  // шапка
  c.textAlign = 'center';
  c.fillStyle = GOLD; c.font = '400 24px -apple-system, sans-serif';
  c.letterSpacing = '10px';
  c.fillText('F A C E R A T E', W/2, 104);
  c.letterSpacing = '0px';

  c.fillStyle = '#f0ece6'; c.font = '300 62px "Cormorant Garamond", serif';
  c.fillText(days + ' дней', W/2, 190);

  // фото
  const pw = 438, ph = 632, gap = 40;
  const x0 = (W - pw*2 - gap)/2, y0 = 250;
  drawPhoto(c, shotImg[0], x0, y0, pw, ph);
  drawPhoto(c, shotImg[1], x0+pw+gap, y0, pw, ph);

  // разделитель-ромб
  c.save(); c.translate(W/2, y0+ph/2); c.rotate(Math.PI/4);
  c.strokeStyle = GOLD; c.lineWidth = 2; c.strokeRect(-11, -11, 22, 22); c.restore();

  // подписи под фото
  const cap = (cx, p, label) => {
    c.fillStyle = 'rgba(255,255,255,.42)'; c.font = '400 20px -apple-system, sans-serif';
    c.letterSpacing = '4px';
    c.fillText(label.toUpperCase(), cx, y0+ph+48);
    c.letterSpacing = '0px';
    c.fillStyle = GOLD_HI; c.font = '300 54px "Cormorant Garamond", serif';
    c.fillText(p.overall.toFixed(1), cx, y0+ph+112);
    c.fillStyle = 'rgba(255,255,255,.36)'; c.font = '400 21px -apple-system, sans-serif';
    c.fillText(fmtLong(p.t), cx, y0+ph+146);
  };
  cap(x0+pw/2, A, 'было');
  cap(x0+pw+gap+pw/2, B, 'стало');

  // дельта
  const dy = y0+ph+232;
  const txt = (dl > 0 ? '+' : '') + dl.toFixed(1);
  c.font = '300 96px "Cormorant Garamond", serif';
  const tw = c.measureText(txt).width;
  c.fillStyle = 'rgba(196,164,107,.09)';
  roundRect(c, W/2-tw/2-52, dy-74, tw+104, 108, 54); c.fill();
  c.strokeStyle = 'rgba(196,164,107,.4)'; c.lineWidth = 2;
  roundRect(c, W/2-tw/2-52, dy-74, tw+104, 108, 54); c.stroke();
  c.fillStyle = dl >= 0 ? GOLD_HI : '#d98d7a';
  c.fillText(txt, W/2, dy);

  c.fillStyle = 'rgba(255,255,255,.4)'; c.font = '400 22px -apple-system, sans-serif';
  c.letterSpacing = '5px';
  c.fillText(Math.abs(dl) === 1 ? 'БАЛЛ' : 'БАЛЛА', W/2, dy+52);
  c.letterSpacing = '0px';

  // низ
  c.strokeStyle = 'rgba(196,164,107,.3)'; c.lineWidth = 1;
  c.beginPath(); c.moveTo(W/2-70, H-136); c.lineTo(W/2+70, H-136); c.stroke();
  c.fillStyle = GOLD; c.font = '400 25px -apple-system, sans-serif';
  c.letterSpacing = '4px';
  c.fillText('facerate.ru', W/2, H-88);
  c.letterSpacing = '0px';
  c.fillStyle = 'rgba(255,255,255,.28)'; c.font = '400 19px -apple-system, sans-serif';
  c.fillText('AI-анализ внешности по фото', W/2, H-56);

  document.getElementById('sharePrev').src = cv.toDataURL('image/png');
}

function renderPick(){
  const opts = POINTS.map((p,i) => `<option value="${i}">${fmtLong(p.t)} · ${p.overall.toFixed(1)}</option>`).join('');
  document.getElementById('pickRow').innerHTML =
    `<select class="chip" id="selA" onchange="shareA=+this.value;buildShare()">${opts}</select>
     <select class="chip" id="selB" onchange="shareB=+this.value;buildShare()">${opts}</select>`;
  document.getElementById('selA').value = shareA;
  document.getElementById('selB').value = shareB;
}

function downloadShare(){
  const a = document.createElement('a');
  a.download = 'facerate-progress.png';
  a.href = document.getElementById('shareCanvas').toDataURL('image/png');
  a.click();
}

function renderChips(){
  const host = document.getElementById('chips');
  const names = ['Общий балл', ...Object.keys(CATS_HIST)];
  host.innerHTML = names.map(n =>
    `<button class="chip${(chartCat===null&&n==='Общий балл')||chartCat===n?' on':''}" data-c="${n}">${n}</button>`
  ).join('');
}

function renderParams(){
  document.getElementById('params').innerHTML = PARAMS.map((p,i) => {
    // До первого замера баллов ещё нет — а это состояние КАЖДОГО нового покупателя.
    // Раньше здесь падало на p.v.toFixed(), и исключение убивало все следующие
    // отрисовки: вкладки «Параметры», «План» и «Гайд» оставались пустыми.
    const has = typeof p.v === 'number';
    const hasPrev = typeof p.prev === 'number';
    const d = has && hasPrev ? +(p.v - p.prev).toFixed(1) : null;
    const cls = d === null ? 'same' : d > 0 ? 'up' : d < 0 ? 'down' : 'same';
    const sign = d === null ? '' : d > 0 ? '+' + d : d < 0 ? String(d) : '0';
    return `<details class="par" style="--i:${i}">
      <summary>
        <span class="pname">${p.n}</span>
        ${sign ? `<span class="delta ${cls}">${sign}</span>` : ''}
        <span class="pscore">${has ? p.v.toFixed(1) : '—'}</span>
        <span class="chev"></span>
      </summary>
      <div class="pbody">
        ${has ? `<div class="pbar"><i data-w="${p.v * 10}"></i></div>` : ''}
        <div class="psec"><h4>Что это</h4><p>${p.what}</p></div>
        <div class="psec"><h4>Насколько управляемо</h4><p>${p.ctrl}</p></div>
        <div class="psec"><h4>Что делать</h4><ul>${p.todo.map(t=>`<li>${t}</li>`).join('')}</ul></div>
      </div>
    </details>`;
  }).join('');

  document.querySelectorAll('.par').forEach(d => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      const bar = d.querySelector('.pbar i');
      requestAnimationFrame(() => { bar.style.width = bar.dataset.w + '%'; });
    });
  });
}

function renderWeeks(){
  document.getElementById('weeks').innerHTML = WEEKS.map((w,i) => {
    const st = w.n < CURRENT_WEEK ? 'done' : w.n === CURRENT_WEEK ? 'now' : '';
    return `<details class="week ${st}" style="--i:${i}" ${w.n===CURRENT_WEEK?'open':''}>
      <summary>
        <span class="wnum">${w.n < CURRENT_WEEK ? '✓' : w.n}</span>
        <span class="wtitle">${w.t}</span>
        ${w.n===CURRENT_WEEK?'<span class="wtag">Сейчас</span>':''}
      </summary>
      <div class="wbody">
        <div class="wl">Задание</div><p>${w.task}</p>
        <div class="wl">Зачем</div><p>${w.why}</p>
        <div class="wl">Как понять, что сделано</div><p>${w.check}</p>
        <a class="chlink" href="#" data-n="${w.ch}"><span class="chn2">${w.ch}</span><span>Глава ${w.ch} «${w.cht}» &middot; стр. ${w.pg}</span></a>
        ${w.tip ? `<div class="tipbox"><div class="tl">${w.weak ? 'Твоё слабое место сейчас' : 'Лично тебе - из твоего анализа'}</div><p>${w.tip}</p></div>` : ''}
      </div>
    </details>`;
  }).join('');
}

function renderChapters(){
  document.getElementById('chapters').innerHTML = CHAPTERS.map(([n,t,s],i) =>
    `<div class="ch" data-n="${n}" style="--i:${i}"><span class="chn">${n}</span><span class="cht"><b>${t}</b><span>${s}</span></span></div>`
  ).join('');
}

function renderWeekNow(){
  const w = WEEKS[CURRENT_WEEK-1];
  const badge = document.getElementById('weekBadge');
  if (badge) badge.textContent = 'Неделя ' + CURRENT_WEEK;
  document.getElementById('weekNow').innerHTML =
    `<div class="wl" style="font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin:0 0 5px">Задание</div>
     <p style="font-size:13.5px;color:#c4c0b9">${w.task}</p>
     <div class="wl" style="font-size:9.5px;letter-spacing:.22em;text-transform:uppercase;color:var(--accent);margin:12px 0 5px">Как понять, что сделано</div>
     <p style="font-size:13.5px;color:#c4c0b9">${w.check}</p>
     <a class="chlink" href="#" data-n="${w.ch}"><span class="chn2">${w.ch}</span><span>Глава ${w.ch} «${w.cht}» &middot; стр. ${w.pg}</span></a>
     ${w.tip?`<div class="tipbox"><div class="tl">Лично тебе - из твоего анализа</div><p>${w.tip}</p></div>`:''}`;
}

function moveInk(btn){
  const ink = document.getElementById('ink');
  ink.style.left = btn.offsetLeft + 'px';
  ink.style.width = btn.offsetWidth + 'px';
}

function toggleConfirm(e){
  e.preventDefault();
  confirmed = !confirmed;
  document.getElementById('confirm').classList.toggle('ok', confirmed);
  pgSyncGo();
}

function closeShot(){ document.getElementById('mask').classList.remove('on'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeShot(); });

function doMeasure(){
  closeShot();
  const host = document.getElementById('dynHost');
  const rows = [
    ['Кожа', +0.9, 'меньше воспалений, тон ровнее'],
    ['Джоулайн', +0.7, 'линия челюсти читается заметно чётче'],
    ['Груминг', +0.8, 'стрижка и брови в порядке'],
    ['Глаза', +0.4, 'ушла отёчность верхнего века'],
    ['Нос', -0.1, 'скорее разница ракурса, чем реальное изменение'],
  ];
  host.innerHTML = `<div class="dyn">
    <h4>Динамика · сравнение с замером 32 дня назад</h4>
    ${rows.map((r,i) => {
      const cls = r[1] > 0 ? 'up' : r[1] < 0 ? 'down' : 'same';
      const sign = r[1] > 0 ? '+' + r[1] : r[1];
      return `<div class="dline" style="--i:${i}">
        <span class="delta ${cls}">${sign}</span>
        <span class="dn"><b style="font-weight:600">${r[0]}</b> - ${r[2]}</span>
      </div>`;
    }).join('')}
    <p style="margin-top:16px;font-size:13.5px;color:#c4c0b9">
      Основной сдвиг дала кожа и снижение отёка - это ровно те параметры, которые меняются первыми.
      Костная база не изменилась и не изменится, так что дальше рост будет медленнее.
      До следующего замера сосредоточься на дефиците калорий: джоулайн у тебя ещё не на потолке.
    </p>
    <p style="margin-top:12px;font-size:12px;color:#8a8a8a">
      Фото снято при том же свете, что и прошлое - сравнение корректное.
    </p>
  </div>`;
  host.scrollIntoView({ behavior:'smooth', block:'center' });
  document.getElementById('mNext').textContent = 'через 10 дн.';
}

function loadShot(input, slot){
  const f = input.files && input.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  const im = new Image();
  im.onload = () => { shotImg[slot] = im; URL.revokeObjectURL(url); buildShare(); };
  im.src = url;
  input.closest('.filebtn').classList.add('set');
}

/* ═══════════ ЗАГРУЗКА ═══════════ */

async function pgLoad(){
  const acc = getAccount();               // app.js:2047
  const tok = acc && acc.token;
  if (!tok) return pgShowLocked();

  let d;
  try {
    const r = await fetch(WORKER_URL + '/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: tok }),
    });
    d = await r.json();
  } catch { return pgShowLocked(); }

  if (d.error || !d.guide) return pgShowLocked(d.pack);

  PG = d;
  CURRENT_WEEK = d.week || 1;

  // Раскладываем замеры в форму, удобную графику.
  POINTS = (d.points || []).map((p) => ({
    t: new Date(p.t).toISOString().slice(0, 10),
    overall: p.overall, cats: p.cats || {}, q: p.quality || '',
  }));
  CATS_HIST = {};
  for (const [key, ru] of Object.entries(CAT_RU)) {
    const series = (d.points || []).map((p) => (p.cats || {})[key]);
    if (series.some((v) => typeof v === 'number')) CATS_HIST[ru] = series;
  }

  // Баллы последнего замера в справку по параметрам.
  const last = (d.points || [])[d.points.length - 1];
  const prev = (d.points || [])[d.points.length - 2];
  PARAMS.forEach((p) => {
    p.v = last?.cats?.[p.k];
    p.prev = prev?.cats?.[p.k];
  });

  pgShowUnlocked();
}

function pgShowLocked(pack){
  document.getElementById('pgLocked').hidden = false;
  document.getElementById('pgUnlocked').hidden = true;

  const box = document.getElementById('pgSoon');
  if (!box) return;
  box.className = 'pg-buy';
  box.innerHTML = '';

  // Счёт выставляется на Telegram-профиль, поэтому без входа покупать некуда.
  if (!getAccount()) {
    const hint = document.createElement('p');
    hint.className = 'pg-buy-hint';
    hint.textContent = 'Войди через Telegram вверху страницы - счёт придёт в бота.';
    box.appendChild(hint);
    return;
  }

  // Цены приходят из воркера (PACKS.guide), чтобы не разъезжались с ботом.
  const p = pack || {};
  const rub = p.rub || 299, stars = p.stars || 199;
  const tag = (cur, old, unit) =>
    (old && old > cur ? '<s>' + old + unit + '</s> ' : '') + cur + unit;

  if (p.launch) {
    const note = document.createElement('div');
    note.className = 'pg-buy-note';
    note.textContent = 'Цена запуска';
    box.appendChild(note);
  }

  const mk = (cls, label, method) => {
    const b = document.createElement('button');
    b.className = cls;
    b.innerHTML = label;
    b.addEventListener('click', () => buyPack('guide', b, method));
    box.appendChild(b);
  };
  mk('pg-buy-btn', 'Купить картой - ' + tag(rub, p.oldRub, '₽'), 'rub');
  mk('pg-buy-btn ghost', 'Telegram Stars - ' + tag(stars, p.oldStars, '⭐'), 'stars');
}

function pgShowUnlocked(){
  document.getElementById('pgLocked').hidden = true;
  document.getElementById('pgUnlocked').hidden = false;

  // Индексы коллажа выставляем ПОСЛЕ загрузки: по умолчанию первый и последний замер.
  shareA = 0;
  shareB = Math.max(0, POINTS.length - 1);

  // Каждую отрисовку зовём отдельно: раньше исключение в первой (нет баллов до
  // первого замера) убивало все следующие, и три вкладки оставались пустыми.
  const safe = (name, fn) => { try { fn(); } catch (e) { console.log('progress render ' + name, e.message); } };
  safe('params', renderParams); safe('weeks', renderWeeks);
  safe('chapters', renderChapters); safe('weekNow', renderWeekNow);
  safe('chips', renderChips);
  if (POINTS.length >= 2) { renderPick(); buildShare(); }
  else { pgHideShare(); }
  if (POINTS.length) drawChart(); else pgEmptyChart();

  const left = PG.cooldownLeft || 0;
  const days = Math.ceil(left / 864e5);
  const btn = document.getElementById('measureBtn');
  if (btn) {
    // Кнопку НЕ блокируем во время кулдауна: иначе досрочный замер за анализ
    // недостижим — модалку не открыть, и предложение сервера не показать.
    btn.disabled = false;
    btn.textContent = left > 0
      ? 'Сделать замер досрочно'
      : (POINTS.length ? 'Сделать замер' : 'Сделать первый замер');
  }
  const note = document.getElementById('measureNote');
  if (note) {
    note.textContent = left > 0
      ? 'Бесплатный замер будет доступен через ' + days + ' ' +
        (days === 1 ? 'день' : days < 5 ? 'дня' : 'дней') +
        '. Раньше срока — за 1 анализ.'
      : 'Один замер в 10 дней. Чаще нет смысла: за меньший срок разница между фото это шум, а не ты.';
  }
  const nx = document.getElementById('mNext');
  if (nx) nx.textContent = left > 0 ? 'через ' + Math.ceil(left / 864e5) + ' дн.' : 'доступен';

  moveInk(document.querySelector('.tab.on'));
  pgLoaded = true;
}

// Коллаж нужен минимум двум замерам: сравнивать одно фото с собой бессмысленно.
function pgHideShare(){
  const c = document.getElementById('shareCard');
  if (!c) return;
  c.innerHTML = '<div class="card-t">Коллаж до и после</div>' +
    '<div class="card-s">Появится после второго замера — сравнивать пока не с чем.</div>';
}

function pgEmptyChart(){
  document.getElementById('chart').innerHTML =
    '<div class="empty"><div class="ei"><svg viewBox="0 0 24 24">' +
    '<path d="M3 17l6-6 4 4 8-8"/></svg></div>' +
    'Замеров пока нет. Сделай первый — он станет точкой отсчёта.</div>';
  ['mCount','mSpan','mDelta'].forEach((id) => {
    const e = document.getElementById(id); if (e) e.textContent = '—';
  });
}

/* ═══════════ ЗАМЕР ═══════════ */

let measureFile = null;

function pgPickMeasure(input){
  const f = input.files && input.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    // Обязательно через oneToBase64: сырой файл с телефона это несколько мегабайт
    // в base64, запрос не доходил и фронт показывал «Сеть не ответила».
    // 672px + jpeg .82 — те же параметры, что у обычного анализа.
    const im = new Image();
    im.onload = () => {
      try { measureFile = oneToBase64(im, 672); }
      catch { measureFile = rd.result.split(',')[1]; }
      pgSyncGo();
    };
    im.src = rd.result;

    const prev = document.getElementById('measurePrev');
    if (prev) { prev.src = rd.result; prev.style.display = 'block'; }
    const lbl = input.closest('.filebtn'); if (lbl) lbl.classList.add('set');
    pgSyncGo();
  };
  rd.readAsDataURL(f);
}

// Отправить можно только когда выбрано фото И поставлена галочка.
function pgSyncGo(){
  const b = document.getElementById('goBtn');
  if (b) b.disabled = !(measureFile && confirmed);
}

async function doMeasure(forcePay){
  if (!measureFile) { alert('Сначала выбери фото'); return; }
  if (!forcePay) closeShot();

  const host = document.getElementById('dynHost');
  host.innerHTML = '<div class="card"><div class="card-s">Замер идёт, это 20-40 секунд…</div></div>';

  let d;
  try {
    const r = await fetch(WORKER_URL + '/', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: (getAccount() || {}).token, measure: true, image: measureFile,
        forcePay: forcePay === true,
        metrics: window.__lastMetrics || '',
      }),
    });
    // Воркер на часть ошибок отвечает простым текстом, а не JSON — читаем как
    // текст и разбираем сами, иначе падает JSON.parse и причина теряется.
    const raw = await r.text();
    try { d = JSON.parse(raw); }
    catch { d = { error: 'server', text: raw.slice(0, 200) || ('HTTP ' + r.status) }; }
  } catch (e) {
    host.innerHTML = '<div class="card"><div class="card-s">Запрос не дошёл: ' +
      (e && e.message ? e.message : 'сеть недоступна') +
      '. Попробуй ещё раз — если повторится, напиши в поддержку.</div></div>';
    return;
  }

  // Досрочный замер: сервер предлагает сделать его за 1 анализ.
  if (d.error === 'progwait' && d.canPay) {
    host.innerHTML =
      '<div class="card"><div class="card-t">Ещё рано</div>' +
      '<div class="card-s">' + (d.text || '').replace(/\n/g, '<br>') + '</div>' +
      '<button class="btn" onclick="doMeasure(true)">Сделать сейчас за 1 анализ</button>' +
      '<div class="privnote" style="margin-top:12px">На счету ' + d.creditsLeft +
      '. Замер по расписанию, через ' + d.daysLeft + ' дн., останется бесплатным.</div></div>';
    return;
  }

  if (d.error) {
    host.innerHTML = '<div class="card"><div class="card-s">' + (d.text || d.error) + '</div></div>';
    return;
  }

  measureFile = null;
  renderMeasure(d.text || '');
  pgLoad();                                  // перечитываем историю и график
}

// Разбираем отчёт и показываем ДИНАМИКУ отдельным блоком.
function renderMeasure(text){
  const host = document.getElementById('dynHost');
  const sec = (name) => {
    const re = new RegExp(name + '\\s*:\\s*([\\s\\S]*?)(?=\\n[А-ЯЁ_]{4,}\\s*:|$)');
    const m = text.match(re); return m ? m[1].trim() : '';
  };
  const shot = sec('СПОСОБ_СЪЁМКИ');
  const dyn  = sec('ДИНАМИКА');
  const recs = sec('РЕКОМЕНДАЦИИ').split('\n')
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').replace(/^\[([А-ЯЁA-Z_]+)\]\s*/, ''))
    .filter((l) => l.length > 8);

  host.innerHTML =
    '<div class="dyn"><h4>Динамика</h4>' +
    '<p style="font-size:13.5px;color:#c4c0b9;white-space:pre-line">' + dyn + '</p>' +
    (shot ? '<p style="margin-top:12px;font-size:12px;color:#8a8a8a;white-space:pre-line">' +
            shot + '</p>' : '') +
    (recs.length ? '<h4 style="margin-top:18px">Что делать до следующего замера</h4>' +
      recs.map((r, i) => '<div class="dline" style="--i:' + i + '"><span class="dn">' + r + '</span></div>').join('')
      : '') +
    '</div>';
  host.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ═══════════ ВКЛАДКИ ═══════════ */

// Делегируем на document: app.js подключается ДО разметки раздела (она в конце
// index.html), поэтому прямой addEventListener на #tabs навешивался на null.
document.addEventListener('click', (e) => {
  const b = e.target.closest('#progressSection .tab'); if (!b) return;
  document.querySelectorAll('#progressSection .tab').forEach((t) => t.classList.toggle('on', t === b));
  document.querySelectorAll('#progressSection .panel').forEach((p) => p.classList.toggle('on', p.id === b.dataset.p));
  moveInk(b);
});

// Переключение параметра на графике. При нарезке демо этот обработчик потерялся:
// я вытаскивал код по именам функций, а он был анонимным слушателем.
document.addEventListener('click', (e) => {
  const c = e.target.closest('#progressSection .chip'); if (!c) return;
  chartCat = c.dataset.c === 'Общий балл' ? null : c.dataset.c;
  renderChips();
  if (POINTS.length) drawChart();
});

function openShot(){
  measureFile = null;
  const lbl = document.getElementById('measureFileLabel');
  if (lbl) lbl.classList.remove('set');
  const prev = document.getElementById('measurePrev');
  if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
  confirmed = false;
  document.getElementById('confirm').classList.remove('ok');
  document.getElementById('goBtn').disabled = true;
  document.getElementById('mask').classList.add('on');
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeShot(); });

// Раздел грузится лениво — только когда человек открыл его в меню.
// Видимостью управляет renderProgress(), сюда приходим уже показанными.
// Имя именно window.pgOpen: renderProgress зовёт его через window, и когда
// функция называлась openProgress, вызов молча пропускался, pgLoad не стартовал
// и обе карточки оставались скрытыми — раздел выглядел пустым.
window.pgOpen = function(){
  if (!pgLoaded) pgLoad();
  else moveInk(document.querySelector('#progressSection .tab.on'));
};

window.addEventListener('resize', () => {
  if (!pgLoaded) return;
  if (POINTS.length) drawChart();
  moveInk(document.querySelector('.tab.on'));
});

/* ═══════════ ВЕБ-ВЕРСИЯ ГАЙДА ═══════════ */
// Текст глав лежит в guide-web.json (собран из guide.html) и грузится один раз,
// когда человек впервые открывает главу. Раньше оглавление было мёртвым:
// пункты выглядели кликабельными, но за ними ничего не было.
let GUIDE_TEXT = null;
let guideLoading = false;

async function loadGuideText(){
  if (GUIDE_TEXT || guideLoading) return GUIDE_TEXT;
  guideLoading = true;
  try {
    const r = await fetch('guide-web.json');
    GUIDE_TEXT = await r.json();
  } catch { GUIDE_TEXT = null; }
  guideLoading = false;
  return GUIDE_TEXT;
}

// Ссылка «Глава NN» из задания недели: переключает на вкладку «Гайд» и
// раскрывает нужную главу. Раньше это был <a href="#"> без обработчика,
// то есть кнопка выглядела кликабельной, но не делала ничего.
document.addEventListener('click', (e) => {
  const a = e.target.closest('#progressSection .chlink'); if (!a) return;
  e.preventDefault();
  const n = a.dataset.n;
  const tab = document.querySelector('#progressSection .tab[data-p="p4"]');
  if (tab) tab.click();
  const row = document.querySelector('#chapters .ch[data-n="' + n + '"]');
  if (!row) return;
  if (!row.classList.contains('open')) row.click();
  setTimeout(() => row.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
});

document.addEventListener('click', async (e) => {
  const row = e.target.closest('#chapters .ch'); if (!row) return;
  const n = row.dataset.n;

  // повторный клик — закрыть
  const opened = row.nextElementSibling;
  if (opened && opened.classList.contains('chbody')) {
    opened.remove(); row.classList.remove('open'); return;
  }
  document.querySelectorAll('#chapters .chbody').forEach((b) => b.remove());
  document.querySelectorAll('#chapters .ch.open').forEach((c) => c.classList.remove('open'));

  row.classList.add('open');
  const box = document.createElement('div');
  box.className = 'chbody';
  box.innerHTML = '<p style="color:#8a8a8a">Загружаю…</p>';
  row.after(box);

  const data = await loadGuideText();
  const ch = data && data.find((c) => c.n === n);
  box.innerHTML = ch
    ? ch.html
    : '<p style="color:#8a8a8a">Текст главы не загрузился. Полная версия — в PDF, он у тебя в боте.</p>';
  row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

// Кнопка «Скачать видео»: рендер целиком в браузере, см. sharevideo.js
document.addEventListener('click', async function (e) {
  var btn = e.target.closest('#videoBtn');
  if (!btn || btn.disabled) return;
  var label = document.getElementById('videoBtnText');
  var was = label ? label.textContent : '';
  btn.disabled = true;
  try {
    var blob = await window.svMakeVideo(function (p) {
      if (label) label.textContent = 'Собираю видео… ' + Math.round(p * 100) + '%';
    });
    window.svDownload(blob);
    if (label) label.textContent = 'Готово, файл скачан';
    setTimeout(function () { if (label) label.textContent = was; }, 3000);
  } catch (err) {
    if (label) label.textContent = 'Не получилось: ' + err.message;
    setTimeout(function () { if (label) label.textContent = was; }, 4000);
  }
  btn.disabled = false;
});
