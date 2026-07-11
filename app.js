const WORKER_URL = "https://api.facerate.online";

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
    tGlossary: "Looksmax glossary", tGlossarySub: "Terms explained simply",
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
    accLoSub: "Subscribe to the <a href='https://t.me/wwwfacerateru' target='_blank' rel='noopener'>channel</a> = 1 free analysis per day",
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
    footLegal: "<a href='terms-en.html' style='color:#888;text-decoration:none'>Terms of use</a>&nbsp;·&nbsp;<a href='privacy-en.html' style='color:#888;text-decoration:none'>Privacy policy</a>",
    // dynamic
    pwReady: "Your report is ready",
    pwLoginSub: "Log in with Telegram to unlock the result. One tap — no phone number, no password.",
    pwLoginBtn: "<span class='tg-ic'>✈</span> Log in with Telegram",
    pwSubTitle: "Unlock your result for free",
    pwSubSub: "Subscribing to our channel gives you 1 free analysis every day.",
    pwSubBtn: "<span class='tg-ic'>✈</span> Subscribe to the channel",
    pwSubCheck: "I subscribed — show my result",
    pwPayTitle: "Free analysis used for today",
    pwPaySub: "Pay with Telegram Stars in two taps. Or come back tomorrow for a free one.",
    pwPaid: "I paid — show my result",
    pwChecking: "Checking…",
    packP1: "1 analysis", packP5: "5 analyses", packD1: "Day unlimited", packM1: "Month unlimited",
    waitTg: "Waiting for Telegram…",
    loginBtn: "<span class='tg-ic'>✈</span> Log in with Telegram",
    chipSub: "subscribe to channel → 1 free/day", chipFree: "free today: ", chipCredits: "credits: ",
    chipUnlim: "👑 Unlimited until ",
    gateHint: "After subscribing, come back and press “Analyze” again.",
    invoiceCreating: "Creating invoice…", invoiceOpening: "Opening Telegram…", invoiceErr: "Error, try again", netErr: "Network unavailable",
    pwPickMethod: "Choose payment method", pwPickPack: "Choose a package", payStars: "⭐ Telegram Stars", payCard: "💳 Card (RUB)", paySbp: "📲 SBP (RUB)", payCrypto: "🪙 Crypto", pwBack: "← Back",
    histEmpty: "No scores yet. Upload a photo — the result will be saved here.",
    histAvg: "Average score: ", histCount: " · analyses: ",
    howHtml: "<div class='how'>" +
      "<p class='how-intro'>FaceRate turns one photo into a structured, numbers-first breakdown of your facial geometry — the same landmark math used in anthropometry and clinical photogrammetry, just automated and instant.</p>" +
      "<div class='how-steps'>" +
      "<div class='how-step'><div class='how-step-num'>1</div><div class='how-step-body'><h4>On-device face mapping</h4><p>468 facial landmarks are detected right in your browser via MediaPipe — cheekbone width, jaw width, fWHR, canthal tilt, symmetry score, face shape. Nothing leaves your device at this step.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>2</div><div class='how-step-body'><h4>AI interpretation</h4><p>Your photo and the measured geometry are sent to a vision model, which reads the numbers in context — proportion, harmony, gender-typical markers — the way a trained eye would, not just raw math.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>3</div><div class='how-step-body'><h4>Full report</h4><p>An overall PSL-style score, an 8-category breakdown (symmetry, eyes/canthal tilt, midface, jawline, nose, lips/cheekbones, skin, grooming), and 8-9 concrete, actionable recommendations.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>4</div><div class='how-step-body'><h4>Track & compare</h4><p>Every score is saved to your history so you can track progress over time, share a result card, or run a head-to-head \"Who Moggs\" comparison against a friend.</p></div></div>" +
      "</div>" +
      "<div class='how-tech'><span>468 landmarks</span><span>On-device geometry</span><span>MediaPipe</span><span>Vision AI</span><span>8 score categories</span></div>" +
      "<p class='how-note'>Entertainment only. The score is a subjective AI heuristic, not objective truth — treat it accordingly. Mild asymmetry is normal for every human face.</p></div>",
    fbSub: "What should we improve? What's missing? Found a bug? Tell us — it really helps.",
    fbName: "Name or nick (optional)", fbEmail: "Email for reply (optional)", fbMsg: "Your message…",
    fbSend: "Send", fbSending: "Sending…", fbOk: "Thank you! Message sent.", fbErr: "Could not send. Try later.",
    labelSym: "Symmetry", labelLips: "Lips / Cheekbones",
    shareCardTag: "PSL RATING · facerate.ru", shareText: "My PSL rating — facerate.ru",
    errNoFace: "Could not detect a face. Try another photo — the face should look at the camera in good lighting.",
    errGeneric: "Analysis error. Try refreshing the page.",
    emptyAnswer: "Empty response.",
    gateRestricted: "Access restricted.", errPrefix: "Error: ",
    tCompare: "Who Moggs?", tCompareSub: "Face-off: compare two faces",
    cmpTitle: "Who Moggs?", cmpSub: "Upload two faces — AI decides who mogs whom. 1 credit.",
    cmpRun: "FACE-OFF", cmpLoading: "DECIDING WHO MOGS…", cmpAgain: "↻ New face-off",
    cmpNeedTwo: "Add both photos first.", cmpNoFaceA: "No face detected in photo A.",
    cmpNoFaceB: "No face detected in photo B.", cmpErrGen: "Something went wrong, try again.",
    cmpMogs: "MOGS", cmpVerdict: "VERDICT", cmpMogged: "MOGGED",
    cmpShareText: "Who Moggs? — facerate.ru",
  },
  ru: {
    begin: "НАЧАТЬ АНАЛИЗ",
    menuTitle: "Меню",
    tHistory: "История оценок", tHistorySub: "Прошлые результаты",
    tGlossary: "Луксмакс-словарь", tGlossarySub: "Термины простыми словами",
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
    accLoSub: "Подписка на <a href='https://t.me/wwwfacerateru' target='_blank' rel='noopener'>канал</a> = 1 бесплатный анализ в день",
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
    footLegal: "<a href='terms.html' style='color:#888;text-decoration:none'>Пользовательское соглашение</a>&nbsp;·&nbsp;<a href='privacy.html' style='color:#888;text-decoration:none'>Политика конфиденциальности</a>",
    pwReady: "Твой отчёт готов",
    pwLoginSub: "Войди через Telegram, чтобы открыть результат. Один тап — без номера и пароля.",
    pwLoginBtn: "<span class='tg-ic'>✈</span> Войти через Telegram",
    pwSubTitle: "Открой результат бесплатно",
    pwSubSub: "Подписка на наш канал даёт 1 бесплатный анализ каждый день.",
    pwSubBtn: "<span class='tg-ic'>✈</span> Подписаться на канал",
    pwSubCheck: "Я подписался — показать результат",
    pwPayTitle: "Бесплатный анализ на сегодня использован",
    pwPaySub: "Оплата звёздами Telegram в два тапа. Или возвращайся завтра за бесплатным.",
    pwPaid: "Я оплатил — показать результат",
    pwChecking: "Проверяю…",
    packP1: "1 анализ", packP5: "5 анализов", packD1: "Безлимит на день", packM1: "Безлимит на месяц",
    waitTg: "Жду подтверждения в Telegram…",
    loginBtn: "<span class='tg-ic'>✈</span> Войти через Telegram",
    chipSub: "подпишись на канал → 1 free/день", chipFree: "бесплатных сегодня: ", chipCredits: "кредиты: ",
    chipUnlim: "👑 Безлимит до ",
    gateHint: "После подписки вернись и нажми «Анализировать» ещё раз.",
    invoiceCreating: "Создаю счёт…", invoiceOpening: "Открываю Telegram…", invoiceErr: "Ошибка, ещё раз", netErr: "Сеть недоступна",
    pwPickMethod: "Выбери способ оплаты", pwPickPack: "Выбери пакет", payStars: "⭐ Telegram Stars", payCard: "💳 Картой (₽)", paySbp: "📲 СБП (₽)", payCrypto: "🪙 Криптой", pwBack: "← Назад",
    histEmpty: "Пока нет оценок. Загрузите фото — результат сохранится здесь.",
    histAvg: "Средний балл: ", histCount: " · оценок: ",
    howHtml: "<div class='how'>" +
      "<p class='how-intro'>FaceRate превращает одну фотографию в структурированный, основанный на цифрах разбор геометрии лица — те же принципы, что в антропометрии и клинической фотограмметрии, только автоматизированные и мгновенные.</p>" +
      "<div class='how-steps'>" +
      "<div class='how-step'><div class='how-step-num'>1</div><div class='how-step-body'><h4>Разметка лица на устройстве</h4><p>468 точек лица определяются прямо в браузере через MediaPipe — ширина скул, ширина челюсти, fWHR, кантальный наклон, симметрия, форма лица. Фото на этом шаге никуда не отправляется.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>2</div><div class='how-step-body'><h4>Интерпретация ИИ</h4><p>Фото и измеренная геометрия отправляются vision-модели, которая читает цифры в контексте — пропорции, гармонию, гендерно-типичные маркеры — так, как это сделал бы натренированный взгляд, а не просто голая математика.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>3</div><div class='how-step-body'><h4>Полный отчёт</h4><p>Общий PSL-балл, разбор по 8 категориям (симметрия, глаза/кантальный наклон, мидфейс, джоулайн, нос, губы/скулы, кожа, груминг) и 8-9 конкретных, применимых рекомендаций.</p></div></div>" +
      "<div class='how-step'><div class='how-step-num'>4</div><div class='how-step-body'><h4>Прогресс и сравнение</h4><p>Каждый результат сохраняется в историю, чтобы отслеживать прогресс, делиться карточкой результата или устроить дуэль «Who Moggs» с другом.</p></div></div>" +
      "</div>" +
      "<div class='how-tech'><span>468 точек лица</span><span>Геометрия на устройстве</span><span>MediaPipe</span><span>Vision AI</span><span>8 категорий оценки</span></div>" +
      "<p class='how-note'>Только развлечение. Балл — субъективная эвристика ИИ, а не объективная истина. Лёгкая асимметрия — норма для любого лица.</p></div>",
    fbSub: "Что улучшить? Чего не хватает? Нашли ошибку? Напишите — это реально помогает.",
    fbName: "Имя или ник (необязательно)", fbEmail: "Email для ответа (необязательно)", fbMsg: "Ваше сообщение…",
    fbSend: "Отправить", fbSending: "Отправка…", fbOk: "Спасибо! Сообщение отправлено.", fbErr: "Не удалось отправить. Попробуйте позже.",
    labelSym: "Симметрия", labelLips: "Губы / Скулы",
    shareCardTag: "PSL РЕЙТИНГ · facerate.ru", shareText: "Мой PSL рейтинг — facerate.ru",
    errNoFace: "Не удалось распознать лицо. Попробуйте другое фото — лицо должно быть направлено в камеру.",
    errGeneric: "Ошибка при анализе. Попробуйте обновить страницу.",
    emptyAnswer: "Пустой ответ.",
    gateRestricted: "Доступ ограничен.", errPrefix: "Ошибка: ",
    tCompare: "Who Moggs?", tCompareSub: "Дуэль: сравни два лица",
    cmpTitle: "Who Moggs?", cmpSub: "Загрузи два лица — ИИ решит, кто кого моггает. 1 кредит.",
    cmpRun: "ДУЭЛЬ", cmpLoading: "РЕШАЮ, КТО МОГГАЕТ…", cmpAgain: "↻ Новая дуэль",
    cmpNeedTwo: "Сначала добавь оба фото.", cmpNoFaceA: "На фото A не найдено лицо.",
    cmpNoFaceB: "На фото B не найдено лицо.", cmpErrGen: "Что-то пошло не так, попробуй ещё раз.",
    cmpMogs: "МОГГАЕТ", cmpVerdict: "ВЕРДИКТ", cmpMogged: "MOGGED",
    cmpShareText: "Who Moggs? — facerate.ru",
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
  ];
  var HTML = [
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
  // Перед первой генерацией — показать соглашение и взять согласие.
  if (localStorage.getItem("fm-consent-v2") !== "1") {
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
    runAnalysis();
  });
  decline.addEventListener("click", function() { modal.classList.add("hidden"); });
})();

resetBtn.addEventListener("click", function() {
  uploadSection.classList.remove("hidden");
  analysisView.classList.add("hidden");
  document.body.classList.remove("analyzing");
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
      showError(t("errNoFace")); return;
    }
    var raw = results.faceLandmarks[0];
    var w   = canvas.width, h = canvas.height;
    var lm  = raw.map(function(p) { return { x: p.x * w, y: p.y * h }; });
    // Рамка лица в пикселях (не нормализованных 0..1!) для правильного кропа share-карточки.
    (function(){
      var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
      for (var i = 0; i < lm.length; i++) {
        if (lm[i].x < minx) minx = lm[i].x; if (lm[i].x > maxx) maxx = lm[i].x;
        if (lm[i].y < miny) miny = lm[i].y; if (lm[i].y > maxy) maxy = lm[i].y;
      }
      window._fmFaceBox = { x: minx, y: miny, w: maxx - minx, h: maxy - miny };
    })();
    var metrics   = computeFaceMetrics(lm);
    var shapeInfo = classifyFaceShape(metrics);
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
    ? "Тебе даны ДВА отдельных изображения: первое -- фронтальное фото, второе -- ПРОФИЛЬ (вид сбоку). ОБЯЗАТЕЛЬНО используй второе фото (профиль) для оценки gonial angle, ramus height, chin projection, submental angle и профиля носа (dorsum, проекция кончика). В разделах ДЖОУЛАЙН_MANDIBLE и НОС_NOSE явно опирайся на то, что видно на профиле."
    : "Дано только фронтальное фото -- профиль не приложен. Для ДЖОУЛАЙН_MANDIBLE оцени честно то, что видно анфас: bigonial width, jaw taper, chin width и фронтальную чёткость. Добавь короткую пометку '" + (lang() === "ru" ? "-- оценка по анфас, профиль не предоставлен." : "-- frontal-only estimate, no profile provided.") + "' Будь чуть консервативнее (gonial angle и проекция подбородка не полностью видны), но НЕ занижай искусственно -- хорошо очерченная челюсть анфас может получить 7-8.";
  var maxillaInstruction = hasSide
    ? "Для МИДФЕЙС_MAXILLA используй ВТОРОЕ изображение (профиль) -- сагиттальная проекция максиллы (forward/recessed) оценивается уверенно и конкретно именно по профилю: положение верхней челюсти относительно линии от лба до подбородка, nasolabial angle сбоку, projection скул сбоку."
    : "Для МИДФЕЙС_MAXILLA профиля нет -- сагиттальную проекцию (forward/recessed) по одному анфас-фото оценить НАДЁЖНО НЕЛЬЗЯ, это принципиально профильный признак. НЕ пиши 'recessed maxilla' или любой другой уверенный вердикт по умолчанию, если не видишь для этого чётких анфас-признаков (явно плоская, вдавленная средняя зона, сильно отрицательный nasolabial angle, скулы визуально не выступают). Если по анфас ничего настораживающего не видно -- пиши нейтрально-положительно (нормальная проекция, ничего примечательного) и НЕ занижай балл наугад. Если решаешь оценить -- обязательно добавь пометку '" + (lang() === "ru" ? "-- приблизительно, по одному анфас-фото без профиля." : "-- approximate, frontal-only, no profile.") + "'";
  var prompt = "You are an experienced, discerning looksmaxxing analyst. Give an honest, realistic and DISCRIMINATING assessment of this face -- neither harshly lowballing nor uniformly inflating. Use looksmaxxing terminology in English." + (lang() === "ru" ? " Write all explanatory text in Russian." : " Write ALL explanatory text and recommendations in ENGLISH (the section hints below are in Russian -- they are only hints; your actual text must be English). Keep the metric label keys (ОБЩИЙ_БАЛЛ, СИММЕТРИЯ etc.) EXACTLY as given -- do not translate the keys.") + "\n\nScoring calibration -- use the FULL 1-10 range and ACTUALLY DIFFERENTIATE between features (do not give everything the same score):\n- 1-3: clear flaw in that area\n- 4: below average\n- 5: exactly average\n- 6: slightly above average\n- 7: clearly above average, attractive\n- 8: very good, uncommon\n- 9-10: exceptional, model-tier / rare near-perfection\nРеальные лица занимают весь диапазон ~3.0-8.0. НЕ ставь всем по умолчанию 5.5-6 -- это запрещено и это главная ошибка. СНАЧАЛА реши КОНКРЕТНО для этого лица: выше оно среднего или ниже и насколько, и поставь общий балл смело (явно непривлекательное 3-4, обычное 5-6, привлекательное 7-8.5, модельное 9+). Be BALANCED and FEARLESS in BOTH directions: do not systematically inflate, and do not systematically lowball. If a feature is genuinely excellent, give it 8-9 without hesitation; if it is genuinely weak, give it 2-4 without softening. A 7+ must be earned by a real, visible strength; a sub-4 must reflect a real, visible weakness. Never compress everything toward the middle out of caution. Scores must vary across categories -- identical or near-identical scores everywhere is wrong.\n\nОБЯЗАТЕЛЬНЫЙ РАЗБРОС: среди 8 категорий разница между самой высокой и самой низкой оценкой ДОЛЖНА быть не меньше 2.5 балла. Запрещено, чтобы все категории были в диапазоне 5-6. Общий балл НЕ привязан к 5: некрасивое лицо честно получает 3-4, очень красивое -- 7-9. НЕ ставь по умолчанию ~5.5-6 каждому человеку -- это главная ошибка, реши КОНКРЕТНО для этого лица выше оно среднего или ниже и насколько.\n\nКРАТКОСТЬ И БЕЗ ПОВТОРОВ: каждое описание под меткой -- РОВНО 1-3 предложения ТОЛЬКО про этот параметр. НЕ копируй текст между секциями, НЕ повторяй общий вывод в категориях, НЕ дублируй один и тот же анализ.\n\nLOOK CAREFULLY at the actual photo for the cheekbones and overall face shape -- the geometric face-shape label below is only a ROUGH approximation from 2D landmarks and is OFTEN WRONG (it's computed from a handful of 2D points and easily thrown off by head angle/tilt). Determine the real face shape and cheekbone projection ONLY from what you visually see in the photo -- treat the geometric label as unreliable background noise, not a hint to lean on. If your visual read disagrees with the label, IGNORE the label completely and go with what you see.\n\nSKIN -- DO NOT INVENT BLEMISHES: only mention acne, scarring, redness or pores if you can ACTUALLY SEE them in the photo. If the skin looks clear/clean, say exactly that (e.g. «чистая, ровная кожа») and score accordingly high -- never default to mentioning acne/imperfections as a generic checklist item when none are visible. Photo quality/lighting/compression can hide minor texture -- when in doubt, don't invent a flaw that isn't clearly visible.\n\nФОРМАТ БАЛЛА -- КРИТИЧНО: вместо 0.0 ставь дробное число с ОДНИМ знаком после точки (5.8, 6.3, 7.1, 4.6, 8.4). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ целые баллы и .0 (нельзя 6/10, 7/10, 6.0/10) -- десятичный разряд всегда ненулевой. Каждая категория получает РАЗНЫЙ дробный балл. В ОТВЕТЕ НЕ ПИШИ квадратные скобки [ ], слова-плейсхолдеры или текст подсказок -- описания под каждой меткой замени СВОИМ готовым текстом про это фото.\n\nINTERNAL STEP (не выводи этот шаг): сначала мысленно опиши что реально видишь на фото -- форма глаз, скулы, кожа, нос, волосы, пропорции -- и только потом ставь баллы, согласованные с увиденным. Общий балл = взвешенное впечатление от категорий, а не случайное число.\n\nCRITICAL -- no generic boilerplate. Base every single observation on what you ACTUALLY SEE in THIS specific photo: this person's real eye shape, hair, skin, exact proportions, distinctive details. Never write a sentence that could apply to any face. Two different people must produce clearly different reports.\n\nGeometric data (MediaPipe, APPROXIMATE -- verify against the photo):\n- Approx. face shape (rough, may be wrong): " + shapeInfo.shape + "\n- Facial symmetry: " + sym + "%\n- fWHR: " + fwhr + " (masculine ideal 1.9-2.1)\n- Cheekbone-to-jaw taper ratio: " + cbJawRatio + " (ideal 1.2-1.35)\n- Forehead: " + Math.round(metrics.foreheadWidth) + "px | Bizygomatic: " + Math.round(metrics.cheekboneWidth) + "px | Bigonial: " + Math.round(metrics.jawWidth) + "px\n\n" + jawInstruction + "\n\n" + maxillaInstruction + "\n\nAnalyze each category in detail. Reply STRICTLY in this format (no markdown, no asterisks, plain text only):\n\nОБЩИЙ_БАЛЛ: 0.0/10\nОбщая оценка внешности по калибровке выше. Честный, но взвешенный вердикт: сначала сильные стороны, затем слабые. 3-4 предложения.\n\nСИММЕТРИЯ: 0.0/10\nИзмеренная симметрия (грубое 2D-приближение по landmarks) = " + sym + "%. Эта цифра ШУМНАЯ: даже небольшой поворот или наклон головы на фото, ракурс и качество съёмки занижают её у объективно симметричных лиц -- это не точное 3D-измерение истинной анатомии. Используй её как ОРИЕНТИР по смягчённой шкале, а не жёсткую формулу: 92-100%=8-10, 85-91%=7, 78-84%=6, 70-77%=5, 60-69%=4, ниже 60%=3 или меньше. Если по фото видно, что голова слегка повёрнута/наклонена (а лицо на вид ровное) -- смело скорректируй балл ВВЕРХ от того, что даёт формула. Но если асимметрия видна визуально и без поворота головы (явный перекос глаз/челюсти/носа) -- НЕ завышай, ставь честно низко. Разбери конкретику на фото: orbital tilt, mandibular deviation, видимые перекосы.\n\nГЛАЗА_CANTHAL_TILT: 0.0/10\nКонкретно: canthal tilt (положительный/отрицательный/нейтральный), hunter eyes vs prey eyes, lid hooding, orbital rim projection, IPD vs норма, scleral show.\n\nМИДФЕЙС_MAXILLA: 0.0/10\nМаксиллярная проекция (forward/recessed), midface length, zygomatic arch, malar eminence, nasolabial angle.\n\nДЖОУЛАЙН_MANDIBLE: 0.0/10\nДжоулайн: mandible definition, gonial angle (ideal 120-125 deg), ramus height, taper ratio " + cbJawRatio + ", chin projection, submental angle.\n\nНОС_NOSE: 0.0/10\nНос: dorsum, tip projection, nasal tip rotation, alar width vs intercanthal distance, NLH, bridge deviation.\n\nГУБЫ_СКУЛЫ: 0.0/10\nГубы: соотношение 1:1.6, vermillion, philtrum, Cupid's bow. Скулы: cheekbone projection, malar fat pad.\n\nКОЖА: 0.0/10\nТекстура, ровность тона, поры, упругость, примерный skin age -- НО акне/рубцы/покраснения упоминай ТОЛЬКО если реально видны на фото; если кожа чистая, так и напиши и не занижай балл на пустом месте.\n\nГРУМИНГ_STYLE: 0.0/10\nHairline, hair density, hairstyle совместимость, brow grooming, facial hair, общее впечатление.\n\nРЕКОМЕНДАЦИИ:\nДай 8-9 конкретных, подробных рекомендаций именно под это лицо. Каждая -- ОДНОЙ строкой, пронумерована, 1-2 предложения с объяснением ПОЧЕМУ это сработает для этих пропорций и какой даст эффект. Сначала Softmax (стрижка/укладка под форму лица, борода/щетина, брови, уход за кожей, осанка/позирование, удачные ракурсы для фото, вес/процент жира -- ТОЛЬКО если по фото реально видна лишняя мягкость/одутловатость лица, и если советуешь похудение то ТОЛЬКО в реалистичных пределах 2-5 кг или 3-5% жира, НИКОГДА не пиши цифры больше 5 кг -- это физически меняет лицо намного меньше, чем кажется, и большие цифры выглядят абсурдно; если лицо и так без видимой жировой отёчности, вообще не упоминай похудение), затем Hardmax (процедуры) с обоснованием и реалистичным результатом. Без общих фраз -- только применимое к этому человеку.\n1. Softmax: ...\n2. Softmax: ...\n3. Softmax: ...\n4. Softmax: ...\n5. Softmax: ...\n6. Hardmax: ...\n7. Hardmax: ...\n8. Hardmax: ...";
  // Дерзкий режим: заменяем персону на роаст-аналитика (границы сохраняем).
  if (isEdgyTone()) {
    prompt = prompt.replace(
      "You are an experienced, discerning looksmaxxing analyst. Give an honest, realistic and DISCRIMINATING assessment of this face -- neither harshly lowballing nor uniformly inflating.",
      "You are a sharp-tongued PSL-forum looksmaxxing analyst. РЕЖИМ: ДЕРЗКИЙ РОАСТ. Пиши хлёстко, иронично и мемно, как жёсткий разбор на PSL-форуме: без дежурных комплиментов, без смягчений, можно подколы и сарказм про черты лица, стрижку и стиль. При этом оценки должны оставаться ЧЕСТНЫМИ и точными (не занижай ради шутки), и ЖЁСТКИЕ ГРАНИЦЫ: никаких оскорблений по национальности/религии/полу/болезням, без пожеланий вреда, без выдуманных фактов."
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
      body: JSON.stringify({ prompt: prompt, images: images, token: acc ? acc.token : null })
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    var data = await res.json();
    stopAIHUD();
    if (data.error) { showGate(data); return; }
    renderAIReport(data.text || t("emptyAnswer"));
    aiReport.classList.remove("hidden");
    // Обновляем чип квоты по факту списания.
    if (typeof data.creditsLeft !== "undefined") updateQuotaChip(data.freeLeft, data.creditsLeft, data.subscribed);
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
    var pkLabels = { p1: t("packP1"), p5: t("packP5"), d1: t("packD1"), m1: t("packM1") };
    ["p1","d1","m1"].forEach(function(p){
      var pk = (data.packs || {})[p]; if (!pk) return;
      var b = document.createElement("button");
      b.className = "btn-primary"; b.type = "button";
      b.textContent = pkLabels[p] + " — " + pk.stars + "⭐";
      b.addEventListener("click", function(){ buyPack(p, b); });
      box.appendChild(b);
    });
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
  maxSize = maxSize || 900;
  var scale = Math.min(1, maxSize / Math.max(src.width, src.height));
  var off = document.createElement("canvas");
  off.width = Math.round(src.width * scale); off.height = Math.round(src.height * scale);
  off.getContext("2d").drawImage(src, 0, 0, off.width, off.height);
  return off.toDataURL("image/jpeg", .82).split(",")[1];
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
  window._fmParsed = parsed; // для share-карточки
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
  }

  // Отчёт готов — звук, сохранение, кнопка «Поделиться».
  if (parsed.overall !== null) {
    playPing();
    saveLastResult(parsed.overall, text);
    var sb = document.getElementById("shareBtn");
    if (sb) sb.classList.remove("hidden");
    var tb = document.getElementById("tgCardBtn");
    if (tb) tb.classList.remove("hidden");
    var cb = document.getElementById("toCompareBtn");
    if (cb) cb.classList.remove("hidden");
    autoSendTgCard();
  }
}

// Молча шлёт карточку отчёта в Telegram сразу после анализа, если юзер залогинен через ТГ —
// без клика по кнопке. Кнопка #tgCardBtn остаётся как ручной повтор (напр. если авто-отправка не прошла).
function autoSendTgCard() {
  var acc = getAccount();
  if (!acc) return;
  buildShareCard().then(function(blob) {
    var fr = new FileReader();
    fr.onload = function() {
      var b64 = String(fr.result).split(",")[1];
      fetch(WORKER_URL + "/sendcard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: acc.token, image: b64 }),
      }).catch(function() {});
    };
    fr.readAsDataURL(blob);
  });
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
    var px = 120, py = 195, pw = W - 240, ph = 500, pr = 26;
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
    var scoreFont = "180px Georgia, serif", denomFont = "58px Georgia, serif";
    g.font = scoreFont; var wS = g.measureText(score).width;
    g.font = denomFont; var wD = g.measureText("/10").width;
    var sx = W / 2 - (wS + 14 + wD) / 2;
    var sg = g.createLinearGradient(0, by - 140, 0, by);
    sg.addColorStop(0, "#f0dfae"); sg.addColorStop(1, "#b3924f");
    g.font = scoreFont; g.fillStyle = sg; g.fillText(score, sx, by);
    g.font = denomFont; g.fillStyle = "#6f6858"; g.fillText("/10", sx + wS + 14, by - 8);
    g.textAlign = "center";
    g.font = "27px Georgia, serif"; ls(10); g.fillStyle = GOLD;
    g.fillText("OVERALL PSL SCORE", W / 2, by + 52); ls(0);
    // разделитель с ромбом
    var dy = by + 88;
    var lg = g.createLinearGradient(W / 2 - 260, 0, W / 2 + 260, 0);
    lg.addColorStop(0, "rgba(196,164,107,0)"); lg.addColorStop(0.5, "rgba(196,164,107,0.8)"); lg.addColorStop(1, "rgba(196,164,107,0)");
    g.strokeStyle = lg; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W / 2 - 260, dy); g.lineTo(W / 2 + 260, dy); g.stroke();
    g.save(); g.translate(W / 2, dy); g.rotate(Math.PI / 4);
    g.fillStyle = GOLD_HI; g.fillRect(-5, -5, 10, 10); g.restore();

    // ── Категории: 2 колонки, бары ──
    var cats = (parsed.categories || []).slice(0, 8);
    var cy0 = dy + 60, rowH = 92, colW = 425;
    var cols = [{ x: 105 }, { x: 105 + colW + 30 }];
    g.textBaseline = "alphabetic";
    cats.forEach(function(cat, i) {
      var col = cols[i % 2], row = Math.floor(i / 2);
      var x = col.x, y = cy0 + row * rowH;
      // ромб-буллет
      g.save(); g.translate(x + 9, y + 2); g.rotate(Math.PI / 4);
      g.strokeStyle = GOLD; g.lineWidth = 2; g.strokeRect(-6, -6, 12, 12); g.restore();
      // название + балл на ОДНОЙ линии (название слева, балл справа)
      g.textBaseline = "alphabetic";
      g.textAlign = "left"; g.font = "27px Georgia, serif"; g.fillStyle = TXT; ls(1);
      var name = cat.label.length > 20 ? cat.label.slice(0, 19) + "…" : cat.label;
      g.fillText(name, x + 32, y + 10); ls(0);
      g.textAlign = "right"; g.font = "31px Georgia, serif"; g.fillStyle = "#ecdaa8";
      g.fillText(cat.score.toFixed(1), x + colW - 18, y + 11);
      // бар под ними
      var bw = colW - 50, bx = x + 32, byy = y + 34;
      g.fillStyle = "#1d1912"; roundRect(g, bx, byy, bw, 7, 3.5); g.fill();
      var fillW = Math.max(8, bw * Math.min(cat.score, 10) / 10);
      var bg2 = g.createLinearGradient(bx, 0, bx + fillW, 0);
      bg2.addColorStop(0, "#8a6c38"); bg2.addColorStop(1, GOLD_HI);
      g.fillStyle = bg2; roundRect(g, bx, byy, fillW, 7, 3.5); g.fill();
      g.beginPath(); g.arc(bx + fillW, byy + 3.5, 5, 0, Math.PI * 2); g.fillStyle = GOLD_HI; g.fill();
    });

    // ── Summary + POTENTIAL ──
    var sy = cy0 + Math.ceil(cats.length / 2) * rowH + 18;
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
    how: { titleKey: "tHow", render: renderHow },
  };

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

function renderAccount(status) {
  var out = document.getElementById("accLoggedOut");
  var inn = document.getElementById("accLoggedIn");
  if (!out || !inn) return;
  if (!status || !status.user) {
    out.classList.remove("hidden"); inn.classList.add("hidden");
    mountTgWidget();
    return;
  }
  out.classList.add("hidden"); inn.classList.remove("hidden");
  var av = document.getElementById("accAvatar");
  if (status.user.photo_url) { av.src = status.user.photo_url; av.style.display = ""; }
  else av.style.display = "none";
  document.getElementById("accName").textContent =
    status.user.username ? "@" + status.user.username : (status.user.first_name || "Пользователь");
  updateQuotaChip(status.freeLeft, status.credits, status.subscribed, status.unlimUntil);
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

function startTgLogin(btn) {
  var code = crypto.randomUUID();
  // window.open СИНХРОННО в клике — иначе мобильные браузеры режут попап.
  window.open("https://t.me/" + TG_BOT_USERNAME + "?start=" + code, "_blank");
  if (btn) { btn.disabled = true; btn.innerHTML = "<span class='tg-spin'></span> " + t("waitTg"); }
  if (_authPollTimer) clearInterval(_authPollTimer);
  var tries = 0;
  _authPollTimer = setInterval(function() {
    tries++;
    if (tries > 60) { // ~2.5 мин
      clearInterval(_authPollTimer); _authPollTimer = null;
      if (btn) { btn.disabled = false; btn.innerHTML = t("loginBtn"); }
      return;
    }
    fetch(WORKER_URL + "/authpoll", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code }),
    }).then(function(r){ return r.json(); }).then(function(st){
      if (st && st.token) {
        clearInterval(_authPollTimer); _authPollTimer = null;
        saveAccount(st);
        renderAccount(st);
        onLoginSuccess(st);
        window.location.reload();
      }
    }).catch(function(){});
  }, 2500);
}

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
  if (b1) b1.addEventListener("click", function(){ buyPack("p1"); });
  if (b5) b5.addEventListener("click", function(){ buyPack("p5"); });
  var lo = document.getElementById("accLogout");
  if (lo) lo.addEventListener("click", function(){ clearAccount(); renderAccount(null); });
  // Дерзкий режим — запоминаем выбор.
  var cb = document.getElementById("toneEdgy");
  if (cb) {
    cb.checked = localStorage.getItem("fm-tone") === "edgy";
    cb.addEventListener("change", function(){ localStorage.setItem("fm-tone", cb.checked ? "edgy" : "soft"); });
  }
  refreshAccount();
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
    title.textContent = t("pwPayTitle");
    sub.textContent = t("pwPaySub");
    var packs = (st && st.packs) || {
      p1: { stars: 29, rub: 49 }, p5: { stars: 99, rub: 149 },
      d1: { stars: 99, rub: 149 }, m1: { stars: 499, rub: 749 },
    };
    var methods = (st && st.methods) || ["stars"];
    var packNames = { p1: t("packP1"), p5: t("packP5"), d1: "🔥 " + t("packD1"), m1: "👑 " + t("packM1") };
    var methodNames = { stars: t("payStars"), rub: t("payCard"), sbp: t("paySbp"), crypto: t("payCrypto") };
    // Шаг 2: тарифы под выбранный способ (цена в его валюте).
    function showPacks(method) {
      actions.innerHTML = "";
      title.textContent = t("pwPickPack"); sub.textContent = methodNames[method] || "";
      function packBtn(id) {
        var p = packs[id]; if (!p) return;
        var price = method === "stars" ? (p.stars + "⭐") : (((method === "rub" || method === "sbp") && p.lavaRub ? p.lavaRub : p.rub) + "₽");
        var top = id === "m1" ? " <i class='pw-hit'>top</i>" : "";
        btn(packNames[id] + " — " + price + top, "pw-btn pw-btn-main", function(b){ buyPack(id, b, method); });
      }
      packBtn("p1"); packBtn("p5"); packBtn("d1"); packBtn("m1");
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
        $(imgEl).src = e.target.result;
        $(ph).classList.add("hidden"); $(slot).classList.remove("hidden");
        var res = await detectFace(img);
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
    // Гейт: те же квоты/кредиты, что и анализ (1 кредит).
    _afterGate = doCompare;
    fetchStatus(false).then(function(st){
      if (st.error === "auth"){ showPaywall("auth"); return; }
      renderAccount(st);
      if ((st.unlimUntil && st.unlimUntil > Date.now()) || st.freeLeft > 0 || st.credits > 0){ hidePaywall(); doCompare(); }
      else if (!st.subscribed) showPaywall("sub");
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
    return "You are a savage looksmaxxing judge. You are given TWO separate face photos: the FIRST image is person A, the SECOND image is person B. IMPORTANT: if A and B are clearly the same person (same face, possibly different angle/lighting/crop), give them IDENTICAL or near-identical SCORE_A/SCORE_B and identical CAT_ scores (within 0.1), and say so explicitly as the first sentence of VERDICT (e.g. \"Same face\" / «Это одно и то же лицо»). Rate each on the PSL 1-10 scale (one decimal, be discriminating, real spread). For each person, identify their 3 most defining facial traits (specific, visual, comparative — e.g. sharp jawline, hooded eyes, high cheekbones, weak chin, wide-set eyes). Then decide who MOGS the other (higher overall aesthetics) and WHY, referencing the actual traits that separate them. Be brutally honest and witty. " + langLine +
      "\n\nAlso rate BOTH A and B on these 8 categories: Symmetry, Canthal Tilt/Eyes, Midface/Maxilla, Jawline/Mandible, Nose, Lips/Cheekbones, Skin, Grooming/Style. One decimal each (never .0), real spread between categories per person (do not give every category the same score) — this must be consistent with the overall SCORE_A/SCORE_B.\n\nReply STRICTLY in this plain format, nothing else:\nSCORE_A: 0.0\nTRAITS_A: trait one; trait two; trait three\nSCORE_B: 0.0\nTRAITS_B: trait one; trait two; trait three\nWINNER: A\nVERDICT: a sharp 2-3 sentence comparison explaining exactly why the winner mogs the loser, grounded in the specific traits of both faces (not a generic one-liner).\n" + catLines;
  }

  function doCompare(){
    $("cmpSetup").classList.add("hidden");
    $("cmpLoading").classList.remove("hidden");
    var acc = getAccount();
    var images = [oneToBase64(A.canvas), oneToBase64(B.canvas)];
    fetch(WORKER_URL, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ prompt: comparePrompt(), images: images, token: acc ? acc.token : null })
    }).then(function(r){ return r.json(); }).then(function(d){
      if (d.error){ $("cmpLoading").classList.add("hidden"); showGate(d); $("compareSection").scrollIntoView({behavior:"smooth"}); return; }
      var parsed = parseCompare(d.text || "");
      if (parsed.a === null || parsed.b === null){ $("cmpLoading").classList.add("hidden"); showSetup(); cmpErr(t("cmpErrGen")); return; }
      if (typeof d.creditsLeft !== "undefined") updateQuotaChip(d.freeLeft, d.creditsLeft, d.subscribed, d.unlimUntil);
      lastResult = parsed;
      renderCmpCats(parsed);
      buildCompareCard(parsed).then(function(){
        $("cmpLoading").classList.add("hidden");
        $("cmpResult").classList.remove("hidden");
      });
    }).catch(function(){ $("cmpLoading").classList.add("hidden"); showSetup(); cmpErr(t("cmpErrGen")); });
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
  function drawFaceCell(g, face, cx, cy, size){
    var src = face.canvas, box = face.box;
    g.save(); roundRect(g, cx, cy, size, size, 22); g.clip();
    if (box){
      var fcx = box.x + box.w/2, fcy = box.y + box.h*0.42;
      var rh = box.h*2.05, rw = rh; // квадрат
      if (rw > src.width){ rw = src.width; rh = rw; }
      if (rh > src.height){ rh = src.height; rw = rh; }
      var rx = Math.max(0, Math.min(fcx - rw/2, src.width - rw));
      var ry = Math.max(0, Math.min(fcy - rh/2, src.height - rh));
      g.drawImage(src, rx, ry, rw, rh, cx, cy, size, size);
      g.restore();
      var eyeSrcY = box.y + box.h*0.40;
      return cy + (eyeSrcY - ry)/rh * size;
    } else {
      var s = Math.min(src.width, src.height);
      g.drawImage(src, (src.width-s)/2, (src.height-s)/2, s, s, cx, cy, size, size);
      g.restore();
      return cy + size*0.42;
    }
  }

  function buildCompareCard(res){
    return new Promise(function(resolve){
      var W = 1080, H = 2080;
      var c = document.createElement("canvas"); c.width=W; c.height=H;
      var cv = $("cmpCanvas"); cv.width=W; cv.height=H;
      var g = cv.getContext("2d");
      var GOLD="#c4a46b", GOLD_HI="#e8cf96", DIM="#8a7f6a";
      function ls(px){ try{ g.letterSpacing=px+"px"; }catch(e){} }

      g.fillStyle="#050505"; g.fillRect(0,0,W,H);
      var glow=g.createRadialGradient(W/2,0,80,W/2,0,850);
      glow.addColorStop(0,"rgba(196,164,107,0.10)"); glow.addColorStop(1,"rgba(196,164,107,0)");
      g.fillStyle=glow; g.fillRect(0,0,W,850);
      g.strokeStyle="rgba(196,164,107,0.35)"; g.lineWidth=2; roundRect(g,22,22,W-44,H-44,30); g.stroke();

      // шапка — заголовок всегда на английском, независимо от языка сайта
      g.textAlign="left"; g.textBaseline="alphabetic"; g.font="bold 56px Georgia,serif"; ls(3);
      var bw=g.measureText("FACERATE").width, pw=74, gp=22, sx=(W-(pw+gp+bw))/2;
      drawBrandPill(g, sx+pw/2, 86, pw, 32);
      var bg=g.createLinearGradient(0,58,0,104); bg.addColorStop(0,"#f4ead2"); bg.addColorStop(1,"#cbb789");
      g.fillStyle=bg; g.fillText("FACERATE", sx+pw+gp, 104); ls(0);
      g.textAlign="center"; g.font="26px Georgia,serif"; ls(8); g.fillStyle=GOLD;
      g.fillText("WHO MOGGS?", W/2, 150); ls(0);

      // две ячейки
      var size=390, gap=60, y=210;
      var xA=(W-size*2-gap)/2, xB=xA+size+gap;
      var eyeA=drawFaceCell(g, A, xA, y, size);
      var eyeB=drawFaceCell(g, B, xB, y, size);
      var winA = res.winner==="A";
      // рамки: победитель — золото, проигравший — тускло
      g.lineWidth=4; g.strokeStyle=winA?GOLD_HI:"rgba(120,120,120,0.5)"; roundRect(g,xA,y,size,size,22); g.stroke();
      g.lineWidth=4; g.strokeStyle=!winA?GOLD_HI:"rgba(120,120,120,0.5)"; roundRect(g,xB,y,size,size,22); g.stroke();
      // бейджи A/B
      [["A",xA],["B",xB]].forEach(function(k){
        g.fillStyle="rgba(0,0,0,0.7)"; roundRect(g,k[1]+14,y+14,54,40,10); g.fill();
        g.fillStyle=GOLD_HI; g.font="26px Georgia,serif"; g.textAlign="center"; g.fillText(k[0], k[1]+41, y+42);
      });
      // MOGGED плашка на глазах проигравшего (всегда на английском)
      var loserX = winA ? xB : xA, loserEyeY = winA ? eyeB : eyeA;
      var barH=54, barPad=26;
      g.fillStyle="#000"; g.fillRect(loserX+barPad, loserEyeY-barH/2, size-barPad*2, barH);
      g.fillStyle="#ff2d2d"; g.font="bold 34px Georgia,serif"; g.textAlign="center"; ls(3);
      g.fillText("MOGGED", loserX+size/2, loserEyeY+12); ls(0);

      // баллы под ячейками
      function scoreUnder(x, val, win){
        g.textAlign="center";
        g.font="300 88px Georgia,serif";
        g.fillStyle = win ? GOLD_HI : "#9a9084";
        g.fillText(Number(val).toFixed(1), x+size/2, y+size+96);
      }
      scoreUnder(xA, res.a, winA); scoreUnder(xB, res.b, !winA);

      // характеристики лица под баллом — до 3 коротких строк на каждого
      function traitsUnder(x, traits, win){
        g.textAlign="center"; g.font="24px Georgia,serif";
        g.fillStyle = win ? "#d8c9a3" : "#8a8378";
        var ty = y+size+140;
        (traits||[]).forEach(function(tr, i){
          var line = tr.length > 30 ? tr.slice(0,29)+"…" : tr;
          g.fillText(line, x+size/2, ty+i*32);
        });
      }
      traitsUnder(xA, res.traitsA, winA); traitsUnder(xB, res.traitsB, !winA);

      // VS в центре между
      g.fillStyle=DIM; g.font="italic 40px Georgia,serif"; g.textAlign="center";
      g.fillText("vs", W/2, y+size/2+14);

      // заголовок вердикта: "A MOGS B" — всегда на английском
      var winLabel = res.winner + " MOGS " + (winA?"B":"A");
      var vy = y+size+340;
      g.font="bold 72px Georgia,serif"; ls(2);
      var vg=g.createLinearGradient(0,vy-60,0,vy); vg.addColorStop(0,"#f0dfae"); vg.addColorStop(1,"#b3924f");
      g.fillStyle=vg; g.fillText(winLabel, W/2, vy); ls(0);

      // эйбров + строка вердикта (перенос, до 5 строк)
      g.font="20px Georgia,serif"; ls(6); g.fillStyle=GOLD; g.fillText("VERDICT", W/2, vy+46); ls(0);
      g.font="34px Georgia,serif"; g.fillStyle="#c9bfad";
      wrapText(g, res.verdict, W/2, vy+92, W-200, 46, 5);

      // компактный список из 8 категорий: A слева, B справа, имя по центру
      if (res.cats && res.cats.length){
        var cy0 = vy + 330;
        g.textAlign="center"; g.font="22px Georgia,serif"; ls(6); g.fillStyle=GOLD;
        g.fillText("BREAKDOWN", W/2, cy0); ls(0);
        var rowH = 54, colW = 300;
        res.cats.forEach(function(cat, i){
          var ry = cy0 + 46 + i*rowH;
          var winCatA = cat.a >= cat.b;
          g.font="26px Georgia,serif";
          g.textAlign="left"; g.fillStyle = winCatA ? GOLD_HI : "#8a8378";
          g.fillText(cat.a.toFixed(1), W/2 - colW, ry);
          g.textAlign="right"; g.fillStyle = !winCatA ? GOLD_HI : "#8a8378";
          g.fillText(cat.b.toFixed(1), W/2 + colW, ry);
          g.textAlign="center"; g.font="20px Georgia,serif"; g.fillStyle="#9a9084";
          g.fillText(cat.label, W/2, ry);
          if (i < res.cats.length - 1){
            g.strokeStyle="rgba(196,164,107,0.12)"; g.lineWidth=1;
            g.beginPath(); g.moveTo(W/2-colW+40, ry+18); g.lineTo(W/2+colW-40, ry+18); g.stroke();
          }
        });
      }

      // футер
      g.font="42px Georgia,serif"; ls(2);
      var fg=g.createLinearGradient(0,H-92,0,H-52); fg.addColorStop(0,"#eddcab"); fg.addColorStop(1,"#b3924f");
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
