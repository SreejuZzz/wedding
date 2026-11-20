# Sreejith & Jestina — wedding website

Single-page wedding site for **Sreejith and Jestina**, **Sunday 10 January 2027, 10:00 am – 3:00 pm IST**,
at **Enchanted Woods, Koovappady P.O., Thottuva, Perumbavoor 683544, Kerala** (resort phone +91 89218 29424,
https://enchantedwoodsresort.in/). Exact map pin: https://maps.app.goo.gl/kFsiCWWuwiRurToF9

## Layout of this repo

- `src/index.template.html` — **the only file to edit.** One self-contained page: HTML, CSS and JS inline.
  Placeholders `{{MAPS_URL}}`, `{{MAPS_URL_ENCODED}}`, `{{QR_SVG}}`, `{{ML_TEXT}}` are filled by the build.
- `scripts/build.mjs` — builds `site/index.html`: injects the map link, generates the QR code as inline SVG (`qrcode`), puts every
  character of the `lang="ml"` text into the Manjari request (`text=`, so phones download a few KB, not the whole Malayalam font),
  makes `site/photos/thumb/*.jpg` (520 px, `sharp`, regenerated when the source photo changes; `sources.json` keeps the hashes)
  for every `photos/thumb/…` the page uses, fails on any missing `photos/` or `vendor/` file, and minifies the inline CSS/JS
  with `esbuild` (no syntax lowering). `MINIFY=0 npm run build` gives readable output for debugging.
- `scripts/check.mjs` — Playwright smoke test in headless Chromium: page/console errors, horizontal overflow (desktop 1366×860 and
  phone 390×844), QR decodes to the map link (jsQR), lens appears (phone: resting drop appears and drags); writes screenshots to `screenshots/`.
- `scripts/serve.mjs` — zero-dependency static preview server for `site/` (default port 8000, `PORT=` to change).
- `scripts/perf.mjs` (`npm run perf`, `PHONE=1` for a 390×844 touch phone at 4× CPU throttle) — scrolls the page and sweeps the mouse while recording every frame; prints frame-time
  percentiles and Chrome's layout / style-recalc / script counters. Headless uses a software GPU: compare runs, not absolutes
  (`HEADED=1 npm run perf` for a real GPU).
- Tooling is Node.js only (≥ 18, ES modules). No Python.
- `site/` — the deployable static site: `index.html` (generated and minified — never edit by hand), `photos/` (+ generated `photos/thumb/`),
  `vendor/matter.min.js` (Matter.js 0.19.0, MIT).
- `node_modules/` and `screenshots/` are git-ignored (CI installs with `npm ci` and keeps the screenshots as an artifact).

Workflow: edit the template → `npm run check` (builds, then tests) → look at the screenshots in `screenshots/` → push.
CI (`.github/workflows/site.yml`) runs `npm run check` on every push and PR, keeps the screenshots as an artifact, and deploys
`site/` to GitHub Pages from `main` (Pages source must be "GitHub Actions"). Commit the regenerated `site/index.html` (and any new `site/photos/thumb/` files) with the template.
Local preview: `npm run dev` then open http://localhost:8000. First-time setup: `npm install && npx playwright install chromium`.
To test with an installed Chrome instead: `CHROME_PATH=/usr/bin/google-chrome npm run check`.

## Design direction (agreed with the couple — keep it)

- **Light-mode liquid glass floating on water.** Frosted glass panels (`.glass`) over a full-screen watercolour fluid simulation.
- **Accents are pure black and white only.** Buttons are solid black, inverting to white with a black ring on hover; countdown tiles black;
  the programme bead and its inked rail are black. Colour comes from the water (greens and oranges), the photos and the petals.
- **Typography:** Instrument Serif (display), Geist (UI/body), Manjari (Malayalam, subset to the page's own text). Loaded from Google Fonts.
- **Readability rules:** dark ink on milky glass; body ≥ 16px; labels ≥ 12.5px; never dim text for effect; never put text on top of photos.
  Glass fill never goes below 64% white: that keeps `--ink-mute` (#404040) at ≥ 4.5:1 even over the darkest paint.
- **Liquid glass is real refraction** wherever the GPU hand-off is cheap (phones included): `initGlass` gives each large panel
  (`.facts-bar, .invite-panel, .programme, .desk, .venue-panel, .finale-panel, .foot, .marquee, .nav-inner, .dock-inner`) a
  `canvas.glass-gl`; every frame the solver's `glass` shader draws the water behind it (rounded-rect slab, circular bevel bending the
  view outward, dispersion, frost ≥ 60% white, bevel lit by the page light) and transfers it in. The canvas is inside the panel, so it
  scrolls with the text exactly. `html.gl-glass` turns off the CSS fill; without it the CSS glass below is the fallback.
  Headless Chromium (software GL) never takes this path: look at it with real Chrome (`headless: false`, `CHROME_PATH`).
- **Mobile first: ~99% of guests are on phones.** Always check 390×844 screenshots first. Phones get:
  translucent thick-glass panels with a moving **rim light** (bright arc toward the light, dark arc opposite; `.rim` built in `initLight`);
  a **liquid-glass dock** at the bottom (`initDock`, ≤ 860px) whose black droplet slides between sections on two edge springs;
  the top bar hides while scrolling down; **tilt** (`Motion`, device orientation relative to a drifting baseline) moves the light,
  rolls the orbs, tilts the QR card and makes the paint sink downhill (Boussinesq buoyancy pass);
  the water follows the finger while scrolling; a **resting magnifying drop** sits on screen by default (radius 34, appears once the page
  mirror is built at idle after the loader), rolls downhill with tilt and wobbles with `Frame.scrollAccel`; touching it lifts it 100px above
  the finger and it follows until released (stays where dropped; a quick tap only jiggles it); **press-and-hold** (380 ms) elsewhere calls it to the finger.
  iOS needs a tap to allow motion: a small button appears under the hero only if no motion events arrive within 1.2 s, and is removed once answered.
- **No helper or instructional text** ("tap here", "drag…", notes under buttons, repeated dates). The couple asked to keep the page clean.
- **"100% real physics":** every motion runs on a physical model, not keyframes:
  - Background water: WebGL2 Navier–Stokes solver (advection, vorticity confinement, Jacobi pressure projection) carrying two pigments,
    sap green (dye `r`), cadmium orange (dye `g`) and titanium white (dye `b`). They are drawn with **Kubelka–Munk** (layer over paper,
    per R/G/B band, linear light), so mixes look like real paint: green + orange → olive and rust, + white → sage and peach.
    Pigment constants live in `PAINT_GLSL` (shared by the water and the glass). The drop paints green → orange → white in turn;
    clicks drop green or orange; ambient drops pick from `shades` in `initFluid`. The colours are strong, so splat them thin (≤ 0.2).
  - Surface ripples: a height field solving the damped wave equation (leapfrog, `ripple` shader, fixed 120 Hz steps, viscous ν∇²h_t term),
    shaded from the same top-left light and refracting the paint. The drop leaves a wake, clicks make rings, the hero orb radiates rings as it bobs.
    Other modules disturb it via `Water.ripple(x, y, amount, radiusPx, ringPx)` (viewport px).
    Falls back to a static grey CSS wash if WebGL2 half-float render targets aren't available; degrades resolution on slow GPUs.
  - Cursor: a **water drop** (mouse; on touch, press-and-hold). Centre follows the pointer on a mass–spring. Outline = Rayleigh surface modes n=2,3,4
    with ω_n ∝ √(n(n−1)(n+2))·R^(−3/2), excited by the drop's acceleration, area conserved. Inside the drop is a **live DOM mirror of the page**
    (`createPageMirror`, kept in sync with a MutationObserver) drawn at 1.8× so magnified text stays vector-sharp, over a magnified crop of the
    fluid canvas copied in the fluid's own frame. Optics are painted from one light at the top left: specular window + glint, dark refracting rim,
    bright transmitted crescent opposite the light, shadow cast away from the light with a caustic.
  - One page-wide light follows the cursor: every visible `.glass` gets `--lx/--ly` (sheen and rim highlight) and `--sx/--sy` (shadow direction).
  - Springs (`class Spring`, Hooke + damping) drive: magnetic buttons, panel tilt, odometer digits, print lift, the QR card tilt, the hero letters
    (underdamped rise), the loader drops, the couple scene (each figure follows scroll progress through its own spring), the lightbox (the print flies to the
    centre), in-page link scrolling (critically damped).
  - `Frame.scrollAccel` (px/s²) is the page's acceleration; things riding on the page feel the pseudo-force −m·a:
    the programme bead (a mass on the rail, on a damped spring to the reading line) lags and swings, the orbs float (buoyancy oscillator + Ornstein–Uhlenbeck forcing), the marquee is a
    belt with mass whose shear is a spring driven by its acceleration.
  - Loader: two water drops (him and her) condense on either side (radius overshoots on a spring) and slide together on springs as loading
    progresses, each wobbling with `DropShape` modes; on contact they coalesce into one drop of summed area (R = √(r₁² + r₂²)) seeded with the
    two-lobed shape (n = 2, n = 4 modes) that rings for ~0.45 s. **Hand-over to the hero:** the drop flies to the hero photo (`#hero-img`,
    from `Geometry`) on a 2-D spring and swells to the photo’s radius, wobbling from its own acceleration; its inside is a window onto the real
    page (the paper `.loader-sheet` gets `clip-path: path(evenodd, …)` with the drop’s outline as the hole), so it lands showing the photo.
    Then the paper opens from the photo as a wave front (starts from rest, runs at constant speed, meniscus edge with shadow), a ring goes
    into the water (`Water.ripple`), the drop’s shading fades on a spring and `is-ready` fires, so the names rise as the front uncovers them.
    If the photo isn’t on screen the paper opens from where the drop is. Keep the hand-over light: `Page.ready` (names rise) fires when the
    paper starts opening, `Page.shown` when the loader is gone; the hero orb holds still until `Page.shown` (so the drop lands on it), the
    water only judges its frame rate after `Page.shown`, and the lens builds its page copy ~1.2 s after that, when idle. The loader canvas
    clears only what it painted last frame. Reduced motion: one still drop, removed as soon as loading finishes.
    No percentage or text beyond the names and date.
  - Photo table: Matter.js rigid bodies seen from above (no gravity, table friction, collisions, throwing).
  - Petal shower: each petal is a falling plate (Andersen–Pesavento–Wang 2005 quasi-steady model: angle-of-attack drag, circulation lift,
    broadside torque, rotational damping), which flutters and tumbles by itself; drawn as a disc projected from its 3-D plane. The button blows
    a decaying air gust that carries them up; the moving drop makes wind (jasmine, kanakambaram, rose).
  - No CSS keyframe animations or eased transitions for motion; CSS transitions remain only for hover colour changes.
- Respect `prefers-reduced-motion` everywhere (static fallbacks already exist for each module).

## Page sections (top to bottom)

Loading screen (two drops slide together and become one, the drop flies into the hero photo and the paper opens from it) → floating glass nav (+ bottom dock on phones) → hero (names, liquid orb photo, facts bar)
→ velocity marquee → invitation + countdown + Add to calendar → "Him / Her / Us" pinned 3D scroll story ("Him" and "Her" ride above
  the groom and bride cards; they glide together, grow and dissolve completely into the "together" card, which carries "Us";
  all three use the same glass card frame)
→ programme (the day as one rail: times on nodes spaced by duration, a black bead rides it with the reading line and inks it;
  on 10 Jan 2027 between 10:00 and 15:00 IST it follows the clock instead) → "A table of prints" (Matter.js) → venue (name, map button, tilting QR card) → finale with "Shower your blessings" → footer.

## Content status / open items

- **Programme** (from the couple, 20 Nov): 10:30 arrival, 11:00 ceremony; 11:30 blessings & photographs, 12:30 lunch and 14:30 farewell
  are kept as they were. The event window stays 10:00–15:00 (countdown, calendar link, facts bar). Each `<li>` carries `--mins` (minutes
  to the next item) for the spacing; update it if a time changes.
- Venue section shows only the name, “Open in Google Maps” and the QR card (the couple removed the description, address, phone,
  travel distances, parking, website and “Copy address” on 20 Nov). Address and phone stay in this file for reference only.
- Malayalam lines: "വിവാഹം" and "നിങ്ങളെ സ്നേഹപൂർവ്വം ക്ഷണിക്കുന്നു" — the couple can confirm wording.
- No RSVP (the couple removed it on purpose).
- Photos: `hero-bamboo.jpg` (hero orb), `sreejith-bw.jpg`, `jestina-bw.jpg`, `together-bw.jpg` (couple section; the bouquet photo since 20 Nov),
  `roll-01..05.jpg`, `closing.jpg` (Nº 06) and `roll-07..11.jpg` (photo table, 11 prints; `closing.jpg` is also the finale). Sources are ~720×960
  (`roll-11.jpg` is only 439×525); don't display them much larger than that. The table fits 11 prints: 6 across on desktop, 3 across on phones.

## Performance rules (the couple asked for "smooth", keep it that way)

- **One frame loop.** Everything animated registers with `Ticker.add({ read, write, active })`. Each frame runs all `read`s,
  then all `write`s. Never start another `requestAnimationFrame` loop, and never read layout (`getBoundingClientRect`,
  `offsetWidth`, …) inside a `write`.
- **No layout reads per frame.** Positions come from `Geometry.track(el)` / `Geometry.get(el)` (document coordinates, re-measured
  only on resize, font load, image load or body resize) plus `Frame.scrollY`. Sizes that matter use `ResizeObserver`.
- **No live backdrop blur on large elements.** Re-blurring the moving water behind big panels every frame was the main cause of
  dropped frames. `.glass` is a milky translucent fill; only small things (nav pill, chips, orb tag) use `backdrop-filter`.
- **Transform/opacity only for anything that moves every frame.** The page light is a `.sheen` element moved with `translate3d`
  inside each `.has-sheen` panel — never animate gradients, box-shadows or CSS variables that feed them.
- **Never read pixels back from WebGL.** The drop's magnified water is rendered by the solver itself into an OffscreenCanvas and
  handed over with `transferToImageBitmap`; that path is chosen only when `bitmapHandOffIsCheap()` passes at startup, otherwise the
  water renders directly and the drop shows clear paper.
- The water simulates at 112×(aspect) / dye 512 and draws at 0.6× of CSS pixels (0.5× on phones); it degrades further by itself if
  frames stay slow after the loader.
- Springs integrate in fixed 1/240 s sub-steps (`SPRING_STEP`), so motion doesn't jitter when frame times vary.
- Only write a style when the value changed (see the `last` caches in the modules).
- Layers only while needed: the sheen and rim-light spots get `will-change: transform` only while their panel is near the screen
  (`initLight` toggles it; their moves are 2-D `translate`, since a 3-D transform alone forces a layer); the hero letters are layers only while
  they rise. On a phone this keeps ~85 layers instead of ~145.
- Idle modules sleep: the photo table skips Matter and its style writes when nothing on it moves (`poke()` wakes it on deal, drag, toss and
  resize); media queries are read on `change`, never per frame.
- Dead-code check: besides ESLint, load the page (desktop, phone, landscape, reduced motion), scroll it, open the lightbox, and test every CSS
  selector with `querySelector`; selectors that never match are dead unless they belong to the loader, the GL glass, the no-WebGL fallback or a
  touch-only state.

## Engineering notes

- Keep the page self-contained (inline CSS/JS) apart from `vendor/` and `photos/`; fonts from Google Fonts.
- Every init runs inside `guard(name, fn)` so one failing module never breaks the page. Zero console errors is a requirement — run `npm run check`.
- The lens mirror strips `id`s from cloned nodes (otherwise `getElementById` would return clones); lens nodes live at the end of `<body>`.
  If you add sticky elements, add their selector to `STICKY` in `createPageMirror`.
- The magnifying drop shows the magnified water wherever the GPU hand-off works (phones included) and only paints the page blocks
  under it (`mirror.cull`): a whole page copy at 1.8× is a huge layer that some phone browsers refuse to draw.
- The magnifying drop follows the mouse on desktop; on touch it rests on screen and blocks scrolling only while a finger carries it.
  The page mirror for it is built on phones in `requestIdleCallback` after the loader, since it clones every image; the lens only writes
  styles / repaints optics when they change, so a resting drop over a still page is nearly free.
- On touch, prints use `touch-action: pan-y`: vertical swipes scroll, sideways swipes throw. Never trap vertical scrolling.
- Fixed bars (nav, dock) respect `env(safe-area-inset-*)` (`viewport-fit=cover`); the footer leaves room for the dock.
- Perf on phones: a 390×844 mobile context with `Emulation.setCPUThrottlingRate` 4 should hold 60 fps while scrolling (headed, real GPU).
- Test both desktop and phone widths; no horizontal scrolling allowed. Layouts that need care beyond 390×844: 360×740, landscape phones
  (≤ 500px tall: no dock, the top bar keeps its links, couple cards sized by height), portrait tablets (bigger couple cards; 4+4+3 prints).
- Table prints use `photos/thumb/` (`data-full` keeps the full photo for the lightbox); the resting layout balances rows (6+5, 4+4+3, 3+3+3+2).
- Nothing per frame may query the DOM (`querySelector`, attribute reads); cache elements at init.
