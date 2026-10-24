/* Scripture Pod — additional lower-third (LT) designs and animations.
 *
 * Single source of truth for the CSS of the extra themes/motions. It is used by:
 *   - src/renderer/display/display.html (injects the CSS at load)
 *   - src/renderer/panel/scripts/output/output-and-streaming.js (inlines the CSS into the standalone/preview output page)
 * The theme/motion ids are also listed in the panel <select>s and in the class
 * regexes of each renderer; test/lower-third-extra.test.js keeps them in sync.
 *
 * Themes use the user's Primary / Secondary(accent) colours where it keeps the
 * design legible: --name-role-primary, --name-role-accent, --name-role-foreground.
 * No backticks or template placeholders may appear in the CSS below.
 */
(function (root) {
  var THEMES = ['aurora', 'sunrise', 'royal', 'minimal', 'pill', 'holo', 'frost', 'cinema', 'sharp', 'emerald', 'pulse', 'parchment', 'sapphire', 'crimson', 'forest', 'graphite', 'rose', 'ocean', 'amber', 'violet', 'outline', 'halo', 'chapel', 'duobar', 'duoblock', 'duorule', 'duoghost', 'duotag', 'duoslant', 'duoflag', 'duopill'];
  var MOTIONS = ['bounce', 'elastic', 'iris', 'slice', 'swing', 'turn', 'cascade', 'typewriter', 'glitch', 'flicker'];

  var P = 'var(--name-role-primary,#90D5FF)';
  var A = 'var(--name-role-accent,#90D5FF)';
  var O = '#name-role-overlay';
  var CARD = ' .name-role-overlay-card';
  var NAME = ' .name-role-overlay-name';
  var ROLE = ' .name-role-overlay-role';

  var DUO = ['duobar', 'duoblock', 'duorule', 'duoghost', 'duotag', 'duoslant', 'duoflag', 'duopill'];
  function t(theme) { return O + '.theme-' + theme; }
  var ANY_DUO = O + ':is(' + DUO.map(function (x) { return '.theme-' + x; }).join(',') + ')';
  var ANY_THEME = O + ':is(' + THEMES.map(function (x) { return '.theme-' + x; }).join(',') + ')';

  var css = [
    /* ── Shared reset for every extra theme ─────────────────────────────── */
    ANY_THEME + CARD + '{position:relative;overflow:hidden;border:0;border-radius:14px;background:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;}',
    O + '.style-band:is(' + THEMES.map(function (x) { return '.theme-' + x; }).join(',') + ')' + CARD + '{border-radius:0;}',
    ANY_THEME + ' .name-role-overlay-accent{display:none;}',
    ANY_THEME + ' .name-role-overlay-copy-panel{padding:0;border:0;border-radius:0;background:none;}',
    ANY_THEME + ':is(.style-classic,.style-right)' + CARD + '{--lt-origin:left center;}',
    ANY_THEME + CARD + '{transform-origin:var(--lt-origin,center center);}',

    /* ── Aurora: violet/cyan gradient glass with a gloss and a one-time shine ── */
    t('aurora') + CARD + '{background:linear-gradient(120deg,color-mix(in srgb,' + P + ' 38%,#0b0720),color-mix(in srgb,' + A + ' 42%,#1b0b4a));border:1px solid rgba(255,255,255,.26);border-radius:18px;color:#fff;box-shadow:0 18px 54px color-mix(in srgb,' + A + ' 40%,transparent),inset 0 1px 0 rgba(255,255,255,.32);backdrop-filter:blur(16px) saturate(150%);}',
    t('aurora') + CARD + '::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(120% 150% at 0% 0%,rgba(255,255,255,.26),transparent 55%);pointer-events:none;}',
    t('aurora') + CARD + '::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.38),transparent);transform:skewX(-20deg);pointer-events:none;}',
    t('aurora') + '.is-visible' + CARD + '::after{animation:lt-shine 1.5s ease .55s 1 both;}',
    t('aurora') + ROLE + '{color:color-mix(in srgb,' + A + ' 55%,#fff);}',

    /* ── Sunrise: warm gradient capsule ─────────────────────────────────── */
    t('sunrise') + CARD + '{background:linear-gradient(110deg,color-mix(in srgb,' + P + ' 25%,#ff8a1f),color-mix(in srgb,' + A + ' 25%,#ff2d75));border-radius:16px;color:#fff;box-shadow:0 16px 44px rgba(255,80,60,.35);text-shadow:0 2px 10px rgba(80,10,20,.35);}',
    t('sunrise') + ROLE + '{color:rgba(255,255,255,.92);}',
    t('sunrise') + CARD + '::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-20deg);pointer-events:none;}',
    t('sunrise') + '.is-visible' + CARD + '::after{animation:lt-shine 1.4s ease .5s 1 both;}',

    /* ── Royal: navy with gold double rule and serif type ───────────────── */
    t('royal') + CARD + '{background:linear-gradient(135deg,#0a1430,#16306a);border:1px solid #d4af37;border-radius:4px;color:#fff;box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 0 0 3px #0a1430,inset 0 0 0 4px rgba(212,175,55,.55);}',
    t('royal') + NAME + '{font-family:Georgia,"Times New Roman",serif;font-weight:700;letter-spacing:.02em;}',
    t('royal') + ROLE + '{color:#e8c96a;font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:500;letter-spacing:.06em;}',

    /* ── Minimal: type only, with a drawn underline ─────────────────────── */
    t('minimal') + CARD + '{min-height:0;padding:6px 4px 16px;background:none;text-shadow:0 2px 14px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.6);color:#fff;}',
    t('minimal') + NAME + '{font-weight:700;letter-spacing:-.01em;}',
    t('minimal') + ROLE + '{color:#fff;opacity:.9;font-weight:500;letter-spacing:.14em;text-transform:uppercase;}',
    t('minimal') + CARD + '::after{content:"";position:absolute;left:4px;right:4px;bottom:4px;height:3px;border-radius:2px;background:' + A + ';transform:scaleX(0);transform-origin:left center;transition:transform 700ms cubic-bezier(.2,.85,.25,1) 260ms;}',
    t('minimal') + '.is-visible' + CARD + '::after{transform:scaleX(1);}',

    /* ── Pill: capsule with a pulsing accent dot ────────────────────────── */
    t('pill') + CARD + '{min-height:0;padding:12px 38px 12px 18px;border-radius:999px;background:color-mix(in srgb,' + P + ' 22%,#0a0d14);border:1px solid rgba(255,255,255,.2);color:#fff;box-shadow:0 14px 40px rgba(0,0,0,.45);backdrop-filter:blur(14px);}',
    t('pill') + CARD + '::before{content:"";flex:0 0 auto;width:16px;height:16px;border-radius:50%;background:' + A + ';box-shadow:0 0 0 6px color-mix(in srgb,' + A + ' 28%,transparent);}',
    t('pill') + '.is-visible' + CARD + '::before{animation:lt-pulse 2s ease-in-out infinite;}',
    t('pill') + ROLE + '{color:color-mix(in srgb,' + A + ' 70%,#fff);}',

    /* ── Holo: dark card with an animated holographic border ────────────── */
    t('holo') + CARD + '{background:linear-gradient(145deg,#0c0e18,#151a2c);border-radius:16px;color:#fff;box-shadow:0 18px 54px rgba(0,0,0,.55);}',
    t('holo') + CARD + '::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:2px;background:conic-gradient(from var(--lt-angle,0deg),#ff6ec7,#7873f5,#4adede,#7cf7a5,#f5e16c,#ff6ec7);-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;}',
    t('holo') + '.is-visible' + CARD + '::before{animation:lt-spin 5s linear infinite;}',
    t('holo') + ROLE + '{color:#bfe9ff;}',

    /* ── Frost: bright frosted glass with dark type ─────────────────────── */
    t('frost') + CARD + '{background:rgba(255,255,255,.74);border:1px solid rgba(255,255,255,.7);border-radius:20px;color:#0f1320;box-shadow:0 18px 50px rgba(0,0,0,.3);backdrop-filter:blur(22px) saturate(170%);-webkit-backdrop-filter:blur(22px) saturate(170%);text-shadow:none;}',
    t('frost') + NAME + '{color:#0f1320;font-weight:700;}',
    t('frost') + ROLE + '{color:color-mix(in srgb,' + A + ' 55%,#10162a);font-weight:600;}',

    /* ── Cinema: letterbox rules, spaced capitals, centred ──────────────── */
    t('cinema') + CARD + '{min-height:0;padding:18px 64px;border-radius:0;background:linear-gradient(90deg,transparent,rgba(0,0,0,.8) 14%,rgba(0,0,0,.8) 86%,transparent);color:#fff;text-align:center;justify-content:center;}',
    t('cinema') + CARD + '::before,' + t('cinema') + CARD + '::after{content:"";position:absolute;left:8%;right:8%;height:1px;background:linear-gradient(90deg,transparent,' + A + ',transparent);}',
    t('cinema') + CARD + '::before{top:0;}',
    t('cinema') + CARD + '::after{bottom:0;}',
    t('cinema') + ' .name-role-overlay-copy,' + t('cinema') + ' .name-role-overlay-stack{align-items:center;}',
    t('cinema') + NAME + '{font-weight:500;letter-spacing:.1em;text-transform:uppercase;}',
    t('cinema') + ROLE + '{color:' + A + ';font-style:italic;font-weight:400;letter-spacing:.24em;text-transform:uppercase;}',

    /* ── Sharp: neo-brutalist block with a hard offset shadow ───────────── */
    t('sharp') + CARD + '{background:#fff;color:#0a0a0a;border:3px solid #0a0a0a;border-radius:0;box-shadow:9px 9px 0 ' + A + ',9px 9px 0 3px #0a0a0a;overflow:visible;}',
    t('sharp') + NAME + '{font-weight:900;letter-spacing:-.01em;text-transform:uppercase;}',
    t('sharp') + ROLE + '{color:#0a0a0a;font-weight:700;letter-spacing:.06em;text-transform:uppercase;}',

    /* ── Emerald: slanted-edge gradient bar ─────────────────────────────── */
    t('emerald') + CARD + '{padding-right:110px;border-radius:0;background:linear-gradient(105deg,color-mix(in srgb,' + P + ' 30%,#032a1b),color-mix(in srgb,' + A + ' 28%,#0b7a4d) 82%,transparent 82.2%);color:#fff;box-shadow:none;filter:drop-shadow(0 14px 22px rgba(0,0,0,.45));overflow:visible;}',
    t('emerald') + ROLE + '{color:#c8ffe4;}',

    /* ── Pulse: dark bar with a travelling light line ───────────────────── */
    t('pulse') + CARD + '{background:linear-gradient(180deg,rgba(20,22,32,.94),rgba(8,10,16,.94));border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#fff;box-shadow:0 16px 44px rgba(0,0,0,.5);}',
    t('pulse') + CARD + '::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,transparent,' + A + ',#fff,' + A + ',transparent);background-size:200% 100%;}',
    t('pulse') + '.is-visible' + CARD + '::after{animation:lt-travel 2.4s linear infinite;}',
    t('pulse') + ROLE + '{color:color-mix(in srgb,' + A + ' 65%,#fff);}',

    /* ── Parchment: aged paper with serif type ──────────────────────────── */
    t('parchment') + CARD + '{background:linear-gradient(160deg,#f6ead0,#e8d3a6);border:1px solid #b8975a;border-radius:3px;color:#3b2a14;box-shadow:inset 0 0 44px rgba(120,80,20,.28),0 16px 38px rgba(0,0,0,.42);}',
    t('parchment') + NAME + '{font-family:Georgia,"Times New Roman",serif;font-weight:700;color:#3b2a14;}',
    t('parchment') + ROLE + '{font-family:Georgia,"Times New Roman",serif;font-style:italic;font-weight:500;color:#7a5a2a;}',

    /* ══ Pastor-name designs ═══════════════════════════════════════════════ */
    /* Sapphire: deep blue glass with a light top edge */
    t('sapphire') + CARD + '{background:linear-gradient(120deg,color-mix(in srgb,' + P + ' 38%,#0a1c52),color-mix(in srgb,' + P + ' 12%,#071233));border:1px solid rgba(160,200,255,.38);color:#fff;box-shadow:0 18px 48px rgba(0,0,12,.5);}',
    t('sapphire') + CARD + '::before{content:"";position:absolute;left:0;right:0;top:0;height:2px;background:linear-gradient(90deg,transparent,' + A + ',transparent);}',
    t('sapphire') + ROLE + '{color:color-mix(in srgb,' + A + ' 60%,#fff);}',

    /* Crimson: dark red with a bright accent edge */
    t('crimson') + CARD + '{background:linear-gradient(115deg,#5c0a18,#2b050c);border-left:7px solid ' + A + ';border-radius:4px;color:#fff;box-shadow:0 18px 48px rgba(0,0,0,.55);}',
    t('crimson') + ROLE + '{color:color-mix(in srgb,' + A + ' 55%,#ffd9d9);letter-spacing:.04em;}',

    /* Forest: calm green gradient */
    t('forest') + CARD + '{background:linear-gradient(120deg,color-mix(in srgb,' + P + ' 22%,#0b3d26),#06241a);border:1px solid rgba(160,240,190,.3);color:#fff;box-shadow:0 18px 46px rgba(0,0,0,.5);}',
    t('forest') + ROLE + '{color:color-mix(in srgb,' + A + ' 45%,#c9f5d8);}',

    /* Graphite: neutral charcoal with a thin accent stripe */
    t('graphite') + CARD + '{background:linear-gradient(180deg,#2a2d35,#17191e);border:1px solid rgba(255,255,255,.1);border-left:5px solid ' + A + ';border-radius:6px;color:#f2f4f7;box-shadow:0 16px 40px rgba(0,0,0,.5);}',
    t('graphite') + ROLE + '{color:#b7c0cc;}',

    /* Rose: soft pink with dark type */
    t('rose') + CARD + '{background:linear-gradient(135deg,#fde6ec,#f6c6d3);border:1px solid rgba(190,60,100,.35);border-radius:18px;color:#3a1220;box-shadow:0 16px 38px rgba(80,10,30,.35);}',
    t('rose') + NAME + '{color:#3a1220;font-weight:700;}',
    t('rose') + ROLE + '{color:color-mix(in srgb,' + A + ' 45%,#6a1a38);font-weight:600;}',

    /* Ocean: teal gradient with a soft highlight */
    t('ocean') + CARD + '{background:linear-gradient(115deg,color-mix(in srgb,' + P + ' 30%,#0c5870),#073646);border:1px solid rgba(140,230,245,.32);color:#fff;box-shadow:0 18px 46px rgba(0,20,30,.5);}',
    t('ocean') + CARD + '::before{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(90% 140% at 0% 0%,rgba(255,255,255,.2),transparent 60%);}',
    t('ocean') + ROLE + '{color:#c9f4fa;}',

    /* Amber: warm gold with dark type */
    t('amber') + CARD + '{background:linear-gradient(110deg,#f7c14d,#e8962a);border-radius:12px;color:#2b1a00;box-shadow:0 16px 38px rgba(90,50,0,.45);}',
    t('amber') + NAME + '{color:#2b1a00;font-weight:800;}',
    t('amber') + ROLE + '{color:#5a3600;font-weight:600;}',

    /* Violet: purple gradient with a soft glow */
    t('violet') + CARD + '{background:linear-gradient(125deg,color-mix(in srgb,' + P + ' 30%,#4b2a8f),#241247);border:1px solid rgba(210,190,255,.35);color:#fff;box-shadow:0 0 34px color-mix(in srgb,' + A + ' 30%,transparent),0 18px 46px rgba(0,0,0,.5);}',
    t('violet') + ROLE + '{color:#e3d4ff;}',

    /* Outline: nothing but a thin white frame over the picture */
    t('outline') + CARD + '{background:rgba(0,0,0,.18);border:2px solid rgba(255,255,255,.85);border-radius:6px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.8);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);box-shadow:none;}',
    t('outline') + NAME + '{font-weight:700;letter-spacing:.02em;}',
    t('outline') + ROLE + '{color:#fff;opacity:.92;letter-spacing:.14em;text-transform:uppercase;font-weight:500;}',

    /* Halo: dark card ringed in a glowing accent */
    t('halo') + CARD + '{background:linear-gradient(145deg,#0c0f1a,#141a2c);border-radius:16px;color:#fff;box-shadow:0 0 0 1px ' + A + ',0 0 30px color-mix(in srgb,' + A + ' 55%,transparent),0 18px 48px rgba(0,0,0,.55);}',
    t('halo') + '.is-visible' + CARD + '{animation:lt-halo 3s ease-in-out infinite;}',
    t('halo') + ROLE + '{color:color-mix(in srgb,' + A + ' 70%,#fff);}',

    /* Chapel: warm cream with serif type and a gold rule, for a gentler look */
    t('chapel') + CARD + '{background:linear-gradient(165deg,#f8f2e6,#eadfc8);border:1px solid #b99a5a;border-radius:8px;color:#2e2314;box-shadow:inset 0 0 0 4px rgba(255,255,255,.35),0 16px 38px rgba(40,25,5,.4);}',
    t('chapel') + NAME + '{font-family:Georgia,"Times New Roman",serif;font-weight:700;color:#2e2314;letter-spacing:.01em;}',
    t('chapel') + ROLE + '{font-family:Georgia,"Times New Roman",serif;font-variant:small-caps;letter-spacing:.12em;font-weight:600;color:#7a5f2a;}',
    t('chapel') + CARD + '::after{content:"";position:absolute;left:10%;right:10%;bottom:6px;height:1px;background:linear-gradient(90deg,transparent,#b99a5a,transparent);}',


    /* ══ Two-layer designs: the name and the role sit on their own layers, the logo beside them ══
       Name layer uses the Primary colour, role layer the Secondary colour. */
    ANY_DUO + CARD + '{border-radius:0;color:#fff;align-items:center;gap:18px;}',
    ANY_DUO + ' .name-role-overlay-copy{gap:0;}',
    ANY_DUO + NAME + '{font-weight:800;line-height:1.04;text-transform:uppercase;letter-spacing:.01em;}',
    ANY_DUO + ROLE + '{font-weight:700;letter-spacing:.1em;text-transform:uppercase;}',
    ANY_DUO + '.style-centered .name-role-overlay-copy,' + ANY_DUO + '.style-band .name-role-overlay-copy{align-items:center;}',
    ANY_DUO + ' .name-role-overlay-logo{margin:0 4px 0 0;}',

    /* Stacked Bar: a vertical rule, a bold name, the role on a coloured strip */
    t('duobar') + CARD + '::before{content:"";align-self:stretch;width:5px;background:' + P + ';flex:0 0 5px;order:-1;}',
    t('duobar') + NAME + '{text-shadow:0 2px 14px rgba(0,0,0,.55);padding:0 .1em;}',
    t('duobar') + ROLE + '{background:' + A + ';color:var(--name-role-accent-fg,#0b0d10);padding:.18em .7em;font-size:calc(var(--name-role-role-size,24px)*.8);align-self:stretch;margin-top:.15em;}',

    /* Name Block: the name on a solid block, the role in plain type under a rule */
    t('duoblock') + NAME + '{background:' + P + ';color:var(--name-role-foreground,#fff);padding:.06em .45em .1em;}',
    t('duoblock') + ROLE + '{color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.6);font-size:calc(var(--name-role-role-size,24px)*.75);margin-top:.35em;padding-left:.7em;border-left:4px solid ' + A + ';}',

    /* Underline: centred type with a drawn rule between the layers */
    t('duorule') + CARD + '{text-align:center;}',
    t('duorule') + ' .name-role-overlay-copy{align-items:center;}',
    t('duorule') + NAME + '{color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.6);padding:0 .3em .1em;border-bottom:3px solid ' + A + ';}',
    t('duorule') + ROLE + '{color:#fff;opacity:.92;font-weight:500;margin-top:.3em;text-shadow:0 2px 10px rgba(0,0,0,.6);}',

    /* Ghost Name: an outlined echo of the name floats above the solid one */
    t('duoghost') + CARD + '{overflow:visible;}',
    t('duoghost') + NAME + '{position:relative;color:#fff;font-style:italic;text-shadow:0 2px 14px rgba(0,0,0,.5);margin-top:.5em;}',
    t('duoghost') + NAME + '::before{content:attr(data-text);position:absolute;left:.7em;bottom:100%;margin-bottom:-.4em;font-size:.62em;color:transparent;-webkit-text-stroke:1px ' + A + ';opacity:.9;white-space:nowrap;pointer-events:none;}',
    t('duoghost') + ROLE + '{color:#fff;font-weight:600;margin-top:.35em;padding-top:.3em;border-top:3px solid ' + A + ';font-size:calc(var(--name-role-role-size,24px)*.75);}',

    /* Role Tag: a big name with the role as a coloured tag on its baseline */
    t('duotag') + ' .name-role-overlay-copy{flex-direction:row;align-items:flex-end;gap:.5em;flex-wrap:wrap;}',
    t('duotag') + NAME + '{color:#fff;text-shadow:0 2px 14px rgba(0,0,0,.55);}',
    t('duotag') + ROLE + '{background:' + A + ';color:var(--name-role-accent-fg,#0b0d10);padding:.14em .6em;font-size:calc(var(--name-role-role-size,24px)*.75);margin-bottom:.35em;}',

    /* Slant: two skewed bars, the role indented under the name */
    t('duoslant') + NAME + '{background:' + P + ';color:var(--name-role-foreground,#fff);padding:.04em .6em .08em;transform:skewX(-12deg);font-style:italic;}',
    t('duoslant') + ROLE + '{background:' + A + ';color:var(--name-role-accent-fg,#0b0d10);padding:.18em .8em;transform:skewX(-12deg);font-style:italic;margin:.14em 0 0 1.6em;font-size:calc(var(--name-role-role-size,24px)*.8);}',

    /* Role Flag: the role flies above the name block, with a coloured underline */
    t('duoflag') + CARD + '::before{content:"";align-self:stretch;width:5px;background:' + A + ';flex:0 0 5px;order:-1;}',
    t('duoflag') + ' .name-role-overlay-copy{flex-direction:column-reverse;}',
    t('duoflag') + NAME + '{background:' + P + ';color:var(--name-role-foreground,#fff);padding:.04em .5em .08em;box-shadow:0 .16em 0 ' + A + ';}',
    t('duoflag') + ROLE + '{color:#fff;font-size:calc(var(--name-role-role-size,24px)*.7);margin-bottom:.3em;text-shadow:0 2px 10px rgba(0,0,0,.6);}',

    /* Pill Layers: a name block with the role pill overlapping its lower edge */
    t('duopill') + NAME + '{background:' + P + ';color:var(--name-role-foreground,#fff);padding:.1em .7em .26em;border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.35);}',
    t('duopill') + ROLE + '{background:' + A + ';color:var(--name-role-accent-fg,#0b0d10);padding:.2em .9em;border-radius:999px;margin:-.5em 0 0 1.1em;font-size:calc(var(--name-role-role-size,24px)*.75);box-shadow:0 6px 16px rgba(0,0,0,.3);position:relative;}',

    /* Overall size of the whole lower third */
    O + CARD + '{zoom:var(--name-role-scale,1);}',

    /* Left and right padding: space between the lower third and the screen edges (swapped for the mirrored Right layout) */
    O + '.has-pad' + CARD + '{margin-left:var(--name-role-pad-l,0px);margin-right:var(--name-role-pad-r,0px);}',
    O + '.has-pad' + CARD + '{max-width:calc(86vw - var(--name-role-pad-l,0px) - var(--name-role-pad-r,0px));}',
    O + '.has-pad.style-right' + CARD + '{margin-left:var(--name-role-pad-r,0px);margin-right:var(--name-role-pad-l,0px);}',

    /* The white church logo needs to turn dark on the light designs */
    ['rose', 'amber', 'chapel'].map(function (x) { return t(x) + ' .name-role-overlay-logo'; }).join(',') + '{filter:brightness(0);opacity:.85;}',

    /* ── Keyframes shared by the themes above ───────────────────────────── */
    '@property --lt-angle{syntax:"<angle>";inherits:false;initial-value:0deg;}',
    '@keyframes lt-spin{to{--lt-angle:360deg;}}',
    '@keyframes lt-shine{from{left:-60%;}to{left:140%;}}',
    '@keyframes lt-pulse{0%,100%{box-shadow:0 0 0 4px color-mix(in srgb,' + A + ' 30%,transparent);}50%{box-shadow:0 0 0 9px color-mix(in srgb,' + A + ' 8%,transparent);}}',
    '@keyframes lt-halo{0%,100%{box-shadow:0 0 0 1px ' + A + ',0 0 22px color-mix(in srgb,' + A + ' 40%,transparent),0 18px 48px rgba(0,0,0,.55);}50%{box-shadow:0 0 0 1px ' + A + ',0 0 40px color-mix(in srgb,' + A + ' 70%,transparent),0 18px 48px rgba(0,0,0,.55);}}',
    '@keyframes lt-travel{from{background-position:200% 0;}to{background-position:-200% 0;}}',

    /* ══ Extra animations ═════════════════════════════════════════════════
       Entrance uses keyframes (they win over the base visible state); the
       exit falls back to the base fade defined by the existing stylesheet.  */
    O + '.motion-bounce.is-visible' + CARD + '{animation:lt-bounce 1000ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-bounce{0%{opacity:0;transform:translateY(130px);}45%{opacity:1;transform:translateY(-22px);}62%{transform:translateY(10px);}78%{transform:translateY(-5px);}90%{transform:translateY(2px);}100%{opacity:1;transform:translateY(0);}}',

    O + '.motion-elastic.is-visible' + CARD + '{animation:lt-elastic 1100ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-elastic{0%{opacity:0;transform:scaleX(.15);}35%{opacity:1;transform:scaleX(1.14);}55%{transform:scaleX(.94);}72%{transform:scaleX(1.04);}88%{transform:scaleX(.99);}100%{opacity:1;transform:scaleX(1);}}',

    O + '.motion-iris:not(.is-visible)' + CARD + '{clip-path:circle(0% at 50% 50%);transform:none;}',
    O + '.motion-iris.is-visible' + CARD + '{clip-path:circle(150% at 50% 50%);transform:none;transition-duration:560ms,820ms,620ms,900ms;}',

    O + '.motion-slice:not(.is-visible)' + CARD + '{clip-path:polygon(0 0,0 0,-30% 100%,0 100%);transform:none;}',
    O + '.motion-slice.is-visible' + CARD + '{clip-path:polygon(0 0,130% 0,100% 100%,0 100%);transform:none;transition-duration:560ms,820ms,620ms,820ms;}',

    O + '.motion-swing' + CARD + '{transform-origin:50% 0;}',
    O + '.motion-swing.is-visible' + CARD + '{animation:lt-swing 1000ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-swing{0%{opacity:0;transform:perspective(900px) rotateX(-88deg);}40%{opacity:1;transform:perspective(900px) rotateX(24deg);}65%{transform:perspective(900px) rotateX(-10deg);}85%{transform:perspective(900px) rotateX(4deg);}100%{opacity:1;transform:perspective(900px) rotateX(0);}}',

    O + '.motion-turn.is-visible' + CARD + '{animation:lt-turn 900ms cubic-bezier(.2,.8,.3,1) both;transform-origin:left center;}',
    '@keyframes lt-turn{0%{opacity:0;transform:perspective(1000px) rotateY(-92deg);}60%{opacity:1;transform:perspective(1000px) rotateY(10deg);}100%{opacity:1;transform:perspective(1000px) rotateY(0);}}',

    /* cascade: card fades quickly, then name and role rise in turn */
    O + '.motion-cascade' + CARD + '{transform:none;transition:opacity 420ms ease;}',
    O + '.motion-cascade' + NAME + '{opacity:0;transform:translateY(26px);transition:opacity 520ms ease 140ms,transform 620ms cubic-bezier(.2,.85,.25,1) 140ms;}',
    O + '.motion-cascade' + ROLE + '{transition:opacity 520ms ease 360ms,transform 620ms cubic-bezier(.2,.85,.25,1) 360ms;}',
    O + '.motion-cascade.is-visible' + NAME + '{opacity:1;transform:translateY(0);}',

    /* typewriter: name is revealed letter by letter, role fades in after */
    O + '.motion-typewriter' + CARD + '{transform:none;transition:opacity 300ms ease;}',
    O + '.motion-typewriter' + NAME + '{clip-path:inset(0 100% 0 0);transition:clip-path 1000ms steps(20,end) 220ms;}',
    O + '.motion-typewriter.is-visible' + NAME + '{clip-path:inset(0 0 0 0);}',
    O + '.motion-typewriter' + ROLE + '{transition:opacity 500ms ease 1.2s,transform 500ms ease 1.2s;}',

    O + '.motion-glitch.is-visible' + CARD + '{animation:lt-glitch 760ms linear both;}',
    '@keyframes lt-glitch{0%{opacity:0;transform:translateX(-10px) skewX(18deg);filter:drop-shadow(5px 0 #ff2bd6) drop-shadow(-5px 0 #00e5ff);}18%{opacity:1;transform:translateX(12px) skewX(-12deg);}34%{transform:translateX(-7px);clip-path:inset(32% 0 38% 0);}48%{transform:translateX(6px);clip-path:inset(0);}62%{opacity:.55;transform:translateX(-3px) skewX(6deg);}76%{opacity:1;filter:drop-shadow(2px 0 #ff2bd6) drop-shadow(-2px 0 #00e5ff);}100%{opacity:1;transform:none;filter:none;clip-path:inset(0);}}',

    O + '.motion-flicker.is-visible' + CARD + '{animation:lt-flicker 1200ms linear both;}',
    '@keyframes lt-flicker{0%{opacity:0;}8%{opacity:.9;}12%{opacity:.1;}22%{opacity:1;}28%{opacity:.25;}38%{opacity:1;}46%{opacity:.6;}56%,100%{opacity:1;}}',

    /* Respect reduced-motion: show instantly */
    '@media (prefers-reduced-motion:reduce){' + O + ' *{animation-duration:.01ms !important;transition-duration:.01ms !important;}}'
  ].join('\n');

  root.SP_LT_EXTRA = { themes: THEMES, motions: MOTIONS, css: css };

  /* Display page helper: inject the CSS once. */
  root.SP_LT_EXTRA.inject = function (doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('sp-lt-extra-css')) return;
    var style = doc.createElement('style');
    style.id = 'sp-lt-extra-css';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.SP_LT_EXTRA;
})(typeof window !== 'undefined' ? window : globalThis);
