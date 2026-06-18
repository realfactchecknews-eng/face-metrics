# face-metrics — Project Context for Claude

## What this is
Static web app deployed on GitHub Pages (`gh-pages` branch).
URL: `https://realfactchecknews-eng.github.io/face-metrics/`
Deploy: push to `master` → GitHub Actions (`peaceiris/actions-gh-pages@v4`) → `gh-pages`.

## SECURITY CONSTRAINT (hard rule)
**DO NOT touch `realfactchecknews-eng/burmalda_tycoon` repo. Ever.**

## Architecture
- **Frontend**: pure HTML/CSS/JS, no build step, no framework
- **Face detection**: MediaPipe Tasks `FaceLandmarker`, `runningMode: "IMAGE"`,
  loaded via dynamic `import()` of `@mediapipe/tasks-vision` (CDN). On-device,
  468/478 landmarks. (Replaced the old video-oriented `@mediapipe/face_mesh`.)
- **AI**: Cloudflare Worker proxy → OpenRouter API (vision). Model id is in
  `worker.js` (`model:` field). Currently `qwen/qwen2.5-vl-72b-instruct`
  (chosen because Gemini/GPT-4o tend to refuse looksmaxxing/appearance rating).
  - Worker URL: `https://face-metrics-ai.realfactchecknews.workers.dev` (also `WORKER_URL` in `app.js`)
  - `OPENROUTER_API_KEY` is a Cloudflare Worker secret — **never put it in frontend**
  - Worker deploys SEPARATELY: `wrangler deploy` (NOT via GitHub Pages)
- **Privacy note**: landmarks are on-device, but the PHOTO itself is sent (base64)
  to the Worker → OpenRouter for the AI report. The image does leave the device.
- **Fonts**: Google Fonts — Cormorant Garamond 300/400
- **Gold accent**: `#c4a46b` (`--accent` CSS variable)

## Key files
| File | Purpose |
|------|---------|
| `index.html` | Full app markup |
| `style.css` | All styles |
| `app.js` | All JS logic |
| `worker.js` + `wrangler.toml` | Cloudflare Worker (AI proxy); deploy with `wrangler deploy` |
| `metrics.js`, `recommendations.js` | DEAD CODE — not loaded in index.html, logic lives in app.js |

See `README.md` for the full, up-to-date project overview.

## Current features (as of last session)
1. **Intro overlay** (2.8s) → **Landing page** (facts, stats counters, typewriter quote) → **Analysis section**
2. **Two-column upload grid**: front photo (required) + side/profile photo (optional)
3. **MediaPipe scan animation**: gold scan line, mesh overlay, measurement labels (fWHR, BIZYGOMATIC, SYM%)
4. **AI HUD loading animation**: corner brackets, pulsing dot, cycling phases, asymptotic progress bar, data stream log
5. **Jaw scoring caveat**: if no side photo → AI told to judge jaw fairly from the front and add "оценка по анфас" note (the old hard 6.0/10 cap was REMOVED)
6. **Composite image for AI**: when both photos provided, front+side combined side-by-side with gold divider
7. **Score cards**: overall score (animated count-up), category bars with text, recommendations list

## Key DOM IDs
- Upload: `frontArea`, `sideArea`, `fileInput`, `sideInput`, `chooseFileBtn`, `chooseSideBtn`
- Thumbnails: `frontThumb`, `frontThumbImg`, `frontPlaceholder`, `frontRemove` (same pattern for `side*`)
- `analyzeBtn` — hidden until front photo loaded
- Analysis: `uploadSection`, `analysisView`, `canvas`, `loading`, `results`, `errorBox`, `errorText`
- AI HUD: `aiLoading` (`.ai-hud-card`), `hudPhase`, `hudBarFill`, `hudBarPct`, `hudStream`, `hudSideLabel`
- Results: `aiReport`, `overallScoreNum`, `overallDesc`, `categoryScores`, `aiRecs`, `recsList`, `aiError`, `aiErrorText`
- Reset: `resetBtn`

## Key JS functions
- `computeFaceMetrics(lm)` → `{ cheekboneWidth, jawWidth, foreheadWidth, faceHeight, widthHeightRatio, symmetryScore }`
- `classifyFaceShape(metrics)` → `{ shape }` (oval/square/heart/diamond/oblong/round)
- `loadFrontFile(file)` / `loadSideFile(file)` — load image, show thumbnail, reveal analyzeBtn
- `initFaceLandmarker()` — lazy dynamic import + create FaceLandmarker (IMAGE mode)
- `processImage(img, sideImage)` — `faceLandmarker.detect()` (sync), `computeFaceMetrics` + `classifyFaceShape`, animation, then `callAI`
- `clearReport()` — resets the results block (called on analyze/reset) so stale scores don't linger
- `startAIHUD(hasSide)` / `stopAIHUD()` — HUD animation
- `canvasToBase64()` — uses `compositeToBase64()` if side photo exists
- `callAI(metrics, shapeInfo)` — builds prompt with jaw instruction, sends to Worker, renders report
- `renderAIReport(text)` / `parseAIReport(text)` — parse AI plain-text format, render score bars

## AI report format (plain text, no markdown)
```
ОБЩИЙ_БАЛЛ: X/10
[text]

СИММЕТРИЯ: X/10
ГЛАЗА_CANTHAL_TILT: X/10
МИДФЕЙС_MAXILLA: X/10
ДЖОУЛАЙН_MANDIBLE: X/10
НОС_NOSE: X/10
ГУБЫ_СКУЛЫ: X/10
КОЖА: X/10
ГРУМИНГ_STYLE: X/10

РЕКОМЕНДАЦИИ:
1. ...
```

## Jaw instruction logic (in `callAI`)
```js
const jawInstruction = hasSide
  ? "A side profile photo is included on the RIGHT side..."
  : "Only a frontal view... judge what IS visible fairly... do NOT artificially cap or lowball.";
```
Scoring is calibrated in the prompt (baseline 5/10, no inflation, per-category
variety). СИММЕТРИЯ score is anchored to the measured symmetry % via a table.
Prompt forbids generic boilerplate. Recommendations: 8-9 numbered lines.

## MediaPipe landmark indices used
- `10` top forehead, `152` chin, `234` left cheekbone, `454` right cheekbone
- `58` left jaw, `288` right jaw, `21` left temple, `251` right temple
- `9` glabella (between brows), `13` upper lip — used for fWHR height

## CSS layout notes
- `.upload-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px }` (single column on mobile ≤600px)
- `.upload-area { position:relative; min-height:230px }` — thumbnail is `position:absolute; inset:0`
- `.ai-hud-card` has `::before` scanline pseudo-element, `.hud-corners` with 4 `<span>` corner brackets

## Recent fixes (commit history)
- `cc16ea93` — Added missing `computeFaceMetrics` + `classifyFaceShape` (were called but never defined)
- `346debb1` — Fixed `]]]` syntax error in `FACE_OVAL` array (was causing full script parse failure)
- `fb28d256` — Removed stray labeled blocks from app.js
- `56c35543` — Added profile photo upload, jaw caveat, HUD animation (main feature push)
