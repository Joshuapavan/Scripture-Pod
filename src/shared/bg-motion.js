/* Scripture Pod — animated backgrounds for the Bible and Lyrics screens.
 *
 * A gradient background can move. "Drift" is the original (the gradient slowly drifts and breathes, drawn in
 * display.css); every other style here is drawn the same way, with two layers (::before and ::after) of the
 * gradient element moved by transform or opacity only, so it runs on the graphics card and stays light while
 * streaming. No blur filters, no scripts running per frame.
 *
 * The same CSS goes into the display page and the Program / Preview pages: css('bg-layer') or css('bg').
 * Used by src/renderer/display/display.html, src/renderer/panel/scripts/output/output-and-streaming.js,
 * and by test/bg-motion.test.js.
 */
(function (root) {
  var MOTIONS = [
    { id: 'drift', label: 'Drift (slow movement)' },
    { id: 'aurora', label: 'Aurora ribbons' },
    { id: 'waves', label: 'Waves' },
    { id: 'orbs', label: 'Floating lights' },
    { id: 'rays', label: 'Light rays' },
    { id: 'pulse', label: 'Breathing glow' },
    { id: 'shimmer', label: 'Shimmer sweep' },
    { id: 'dust', label: 'Rising dust' },
    { id: 'stars', label: 'Twinkling stars' },
    { id: 'embers', label: 'Embers' },
    { id: 'still', label: 'Still (no movement)' }
  ];
  var IDS = MOTIONS.map(function (m) { return m.id; });
  function normalize(id) { return IDS.indexOf(id) >= 0 ? id : 'drift'; }

  // Tinted from the gradient's own colours (--bg-hi, --bg-lo), so a red gradient glows red
  var HI = 'var(--bg-hi, #ffffff)';
  function mix(pct) { return 'color-mix(in srgb, ' + HI + ' ' + pct + '%, transparent)'; }
  // Specks scattered over a square tile that repeats. The positions come from a fixed pseudo-random sequence,
  // so they look scattered but are the same every time; the tile is big enough that the repeat is not noticed.
  function scatter(count, tile, rgba, seed) {
    var n = seed || 7, out = [];
    function rnd() { n = (n * 9301 + 49297) % 233280; return n / 233280; }
    for (var i = 0; i < count; i++) {
      var x = Math.round(rnd() * 100), y = Math.round(rnd() * 100), r = (1.1 + rnd() * 1.9).toFixed(1);
      out.push('radial-gradient(circle at ' + x + '% ' + y + '%, ' + rgba + ' 0, ' + rgba + ' ' + r + 'px, transparent ' + (Number(r) + 1.1).toFixed(1) + 'px) 0 0 / ' + tile + 'px ' + tile + 'px');
    }
    return out.join(',');
  }
  var TILE_A = 640, TILE_B = 480;

  function css(id) {
    var B = '#' + id + '.bg-animated';
    function M(name) { return B + '.bg-motion-' + name; }
    function both(name, rule) { return M(name) + '::before, ' + M(name) + '::after { ' + rule + ' }'; }
    var reset = 'inset: 0; background: none; transform: none; opacity: 1; animation: none; mix-blend-mode: normal;';
    var out = [];

    // The shared reset: every style except Drift draws its own two layers
    ['aurora', 'waves', 'orbs', 'rays', 'pulse', 'shimmer', 'dust', 'stars', 'embers'].forEach(function (n) { out.push(both(n, reset)); });
    out.push(M('still') + '::before, ' + M('still') + '::after { display: none; }');

    // Aurora: two wide ribbons of light sliding across, slowly turning
    out.push(M('aurora') + '::before { inset: -40% -20%; background: linear-gradient(115deg, transparent 18%, ' + mix(38) + ' 36%, transparent 54%, ' + mix(22) + ' 72%, transparent 88%); animation: bgm-aurora-a 22s ease-in-out infinite alternate; }');
    out.push(M('aurora') + '::after { inset: -40% -20%; background: linear-gradient(70deg, transparent 25%, rgba(255,255,255,.10) 42%, transparent 58%, ' + mix(26) + ' 76%, transparent 92%); animation: bgm-aurora-b 29s ease-in-out infinite alternate; mix-blend-mode: screen; }');
    out.push('@keyframes bgm-aurora-a { from { transform: translate3d(-14%, -6%, 0) rotate(-4deg); } to { transform: translate3d(14%, 6%, 0) rotate(5deg); } }');
    out.push('@keyframes bgm-aurora-b { from { transform: translate3d(12%, 8%, 0) rotate(6deg); } to { transform: translate3d(-12%, -8%, 0) rotate(-5deg); } }');

    // Waves: rows of soft crests along the bottom, sliding sideways without end
    out.push(M('waves') + '::before { inset: auto -0% 0 0; left: 0; width: 200%; height: 62%; background: radial-gradient(ellipse 50% 78% at 50% 100%, ' + mix(52) + ' 0, ' + mix(0) + ' 72%) 0 0 / 25% 100% repeat-x; animation: bgm-slide 26s linear infinite; }');
    out.push(M('waves') + '::after { inset: auto 0 0 0; left: 0; width: 200%; height: 44%; background: radial-gradient(ellipse 50% 80% at 50% 100%, rgba(255,255,255,.24) 0, rgba(255,255,255,0) 72%) 0 0 / 20% 100% repeat-x; animation: bgm-slide 17s linear infinite reverse; }');
    out.push('@keyframes bgm-slide { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-50%, 0, 0); } }');

    // Floating lights: soft circles drifting up and back, two depths
    var orbsA = [
      'radial-gradient(circle at 12% 70%, ' + mix(30) + ' 0, ' + mix(0) + ' 9%)',
      'radial-gradient(circle at 38% 40%, ' + mix(22) + ' 0, ' + mix(0) + ' 12%)',
      'radial-gradient(circle at 68% 78%, ' + mix(28) + ' 0, ' + mix(0) + ' 10%)',
      'radial-gradient(circle at 86% 32%, ' + mix(20) + ' 0, ' + mix(0) + ' 14%)'
    ].join(',');
    var orbsB = [
      'radial-gradient(circle at 24% 28%, rgba(255,255,255,.16) 0, rgba(255,255,255,0) 7%)',
      'radial-gradient(circle at 56% 62%, rgba(255,255,255,.12) 0, rgba(255,255,255,0) 9%)',
      'radial-gradient(circle at 80% 80%, rgba(255,255,255,.14) 0, rgba(255,255,255,0) 6%)'
    ].join(',');
    out.push(M('orbs') + '::before { inset: -10%; background: ' + orbsA + '; animation: bgm-float-a 20s ease-in-out infinite alternate; }');
    out.push(M('orbs') + '::after { inset: -10%; background: ' + orbsB + '; animation: bgm-float-b 27s ease-in-out infinite alternate; }');
    out.push('@keyframes bgm-float-a { from { transform: translate3d(-3%, 6%, 0) scale(1); } to { transform: translate3d(4%, -8%, 0) scale(1.12); } }');
    out.push('@keyframes bgm-float-b { from { transform: translate3d(4%, -5%, 0) scale(1.05); } to { transform: translate3d(-5%, 7%, 0) scale(.95); } }');

    // Light rays: beams fanning down from above, slowly swaying
    out.push(M('rays') + '::before { inset: -60%; transform-origin: 50% 30%; background: repeating-conic-gradient(from 90deg at 50% 30%, rgba(255,255,255,.13) 0deg 3deg, rgba(255,255,255,0) 3deg 12deg); -webkit-mask-image: radial-gradient(circle at 50% 30%, #000 0, transparent 46%); mask-image: radial-gradient(circle at 50% 30%, #000 0, transparent 46%); animation: bgm-sway 30s ease-in-out infinite alternate; }');
    out.push(M('rays') + '::after { background: radial-gradient(ellipse 60% 45% at 50% 0%, ' + mix(30) + ' 0, ' + mix(0) + ' 70%); animation: bgm-breathe 9s ease-in-out infinite alternate; }');
    out.push('@keyframes bgm-sway { from { transform: rotate(-5deg); } to { transform: rotate(5deg); } }');

    // Breathing glow: a soft light swelling and fading from the middle
    out.push(M('pulse') + '::before { background: radial-gradient(circle at 50% 52%, ' + mix(42) + ' 0, ' + mix(0) + ' 62%); animation: bgm-breathe 8s ease-in-out infinite alternate; }');
    out.push(M('pulse') + '::after { background: radial-gradient(circle at 50% 52%, rgba(255,255,255,.12) 0, rgba(255,255,255,0) 40%); animation: bgm-breathe 8s ease-in-out -4s infinite alternate; }');
    out.push('@keyframes bgm-breathe { from { transform: scale(.82); opacity: .55; } to { transform: scale(1.22); opacity: 1; } }');

    // Shimmer: a band of light sweeping across now and then
    out.push(M('shimmer') + '::before { inset: -20% auto -20% 0; width: 55%; background: linear-gradient(105deg, rgba(255,255,255,0) 0, rgba(255,255,255,.14) 50%, rgba(255,255,255,0) 100%); animation: bgm-sweep 11s ease-in-out infinite; }');
    out.push(M('shimmer') + '::after { inset: -20% auto -20% 0; width: 30%; background: linear-gradient(105deg, ' + mix(0) + ' 0, ' + mix(22) + ' 50%, ' + mix(0) + ' 100%); animation: bgm-sweep 11s ease-in-out -2.4s infinite; }');
    out.push('@keyframes bgm-sweep { 0% { transform: translate3d(-120%, 0, 0) skewX(-12deg); } 55%, 100% { transform: translate3d(260%, 0, 0) skewX(-12deg); } }');

    // Rising dust: fine specks drifting upward, two layers at different speeds
    out.push(M('dust') + '::before { inset: 0 0 -' + TILE_A + 'px 0; background: ' + scatter(18, TILE_A, 'rgba(255,255,255,.6)', 11) + '; animation: bgm-rise-a 38s linear infinite; }');
    out.push(M('dust') + '::after { inset: 0 0 -' + TILE_B + 'px 0; background: ' + scatter(11, TILE_B, 'rgba(255,255,255,.34)', 29) + '; animation: bgm-rise-b 26s linear infinite; }');
    out.push('@keyframes bgm-rise-a { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, -' + TILE_A + 'px, 0); } }');
    out.push('@keyframes bgm-rise-b { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(0, -' + TILE_B + 'px, 0); } }');

    // Twinkling stars: fixed points that fade in and out, out of step
    out.push(M('stars') + '::before { background: ' + scatter(20, TILE_A, 'rgba(255,255,255,.95)', 5) + '; animation: bgm-twinkle 5s ease-in-out infinite alternate; }');
    out.push(M('stars') + '::after { background: ' + scatter(16, TILE_B, 'rgba(255,255,255,.75)', 43) + '; animation: bgm-twinkle 7s ease-in-out -3s infinite alternate; }');
    out.push('@keyframes bgm-twinkle { from { opacity: .25; } to { opacity: 1; } }');

    // Embers: warm sparks rising faster, flickering
    out.push(M('embers') + '::before { inset: 0 0 -' + TILE_A + 'px 0; background: ' + scatter(16, TILE_A, 'rgba(255,170,80,.9)', 17) + '; animation: bgm-rise-a 17s linear infinite; mix-blend-mode: screen; }');
    out.push(M('embers') + '::after { inset: 0 0 -' + TILE_B + 'px 0; background: ' + scatter(12, TILE_B, 'rgba(255,110,50,.75)', 61) + '; animation: bgm-rise-b 11s linear infinite, bgm-twinkle 2.2s ease-in-out infinite alternate; mix-blend-mode: screen; }');

    out.push('@media (prefers-reduced-motion: reduce) { ' + B + '::before, ' + B + '::after { animation: none !important; } }');
    return out.join('\n');
  }

  // Sets the motion class and the colours the styles tint from. Call whenever the background is drawn animated.
  function apply(el, motion, shadow, highlight, custom) {
    if (!el || !el.classList) return;
    // A colour chosen for the movement wins over the gradient's own
    if (/^#[0-9a-f]{6}$/i.test(custom || '')) highlight = custom;
    var m = normalize(motion);
    IDS.forEach(function (id) { el.classList.toggle('bg-motion-' + id, id === m); });
    if (el.style) {
      el.style.setProperty('--bg-hi', /^#[0-9a-f]{6}$/i.test(highlight || '') ? highlight : '#ffffff');
      el.style.setProperty('--bg-lo', /^#[0-9a-f]{6}$/i.test(shadow || '') ? shadow : '#000000');
    }
  }

  function inject(doc, id) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('sp-bg-motion-css')) return;
    var style = doc.createElement('style');
    style.id = 'sp-bg-motion-css';
    style.textContent = css(id || 'bg-layer');
    (doc.head || doc.documentElement).appendChild(style);
  }

  var api = { motions: MOTIONS, ids: IDS, normalize: normalize, css: css, apply: apply, inject: inject };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.SP_BG_MOTION = api;
})(typeof window !== 'undefined' ? window : globalThis);
