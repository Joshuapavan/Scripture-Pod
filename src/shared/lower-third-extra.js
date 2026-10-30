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
  var THEMES = ['aurora', 'sunrise', 'royal', 'minimal', 'pill', 'holo', 'frost', 'cinema', 'sharp', 'emerald', 'pulse', 'parchment', 'sapphire', 'crimson', 'forest', 'graphite', 'rose', 'ocean', 'amber', 'violet', 'outline', 'halo', 'chapel', 'duobar', 'duoblock', 'duorule', 'duoghost', 'duotag', 'duoslant', 'duoflag', 'duopill', 'blueprint', 'ticket', 'stamp', 'dogear', 'chalk', 'sunbeam', 'gradline', 'leaf', 'terminal', 'diagonal', 'cobar', 'coblock', 'cobox', 'cocorner', 'cobadge', 'couline', 'cobrackets', 'cotint', 'cosquare', 'cotag', 'cohighlight', 'cowhite', 'sbleft', 'sbtop', 'sbblock', 'sbbar', 'custom'];
  var MOTIONS = ['bounce', 'elastic', 'iris', 'slice', 'swing', 'turn', 'cascade', 'typewriter', 'glitch', 'flicker', 'unfold', 'spinin', 'rubber', 'wobble', 'tada', 'rollin', 'scanline', 'stretch'];

  var P = 'var(--name-role-primary,#90D5FF)';
  var A = 'var(--name-role-accent,#90D5FF)';
  var O = '#name-role-overlay';
  var CARD = ' .name-role-overlay-card';
  // Text that reads on the Primary and on the Secondary colour, worked out when the overlay is drawn
  var PFG = 'var(--name-role-primary-fg,#0b0d10)';
  var AFG = 'var(--name-role-accent-fg,#0b0d10)';
  // The Secondary colour lifted toward white, for text that sits straight on the video
  var AL = 'color-mix(in srgb,' + A + ' 55%,#fff)';
  var NAME = ' .name-role-overlay-name';
  var ROLE = ' .name-role-overlay-role';

  var DUO = ['duobar', 'duoblock', 'duorule', 'duoghost', 'duotag', 'duoslant', 'duoflag', 'duopill'];
  function t(theme) { return O + '.theme-' + theme; }
  var ANY_DUO = O + ':is(' + DUO.map(function (x) { return '.theme-' + x; }).join(',') + ')';
  var CALLOUTS = ['cobar', 'coblock', 'cobox', 'cocorner', 'cobadge', 'couline', 'cobrackets', 'cotint', 'cosquare', 'cotag', 'cohighlight', 'cowhite'];
  var ANY_CALLOUT = O + ':is(' + CALLOUTS.map(function (x) { return '.theme-' + x; }).join(',') + ')';
  var SIMPLE = ['sbleft', 'sbtop', 'sbblock', 'sbbar'];
  var ANY_SIMPLE = O + ':is(' + SIMPLE.map(function (x) { return '.theme-' + x; }).join(',') + ')';
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


    /* ══ My design: a lower third built in the designer. Every look comes from --cd-* variables set from the
       saved design (see customVars). Name and role are two layers. ═══════════════════════════════════════ */
    t('custom') + CARD + '{border-radius:0;color:#fff;align-items:center;gap:18px;}',
    t('custom') + ' .name-role-overlay-copy{gap:var(--cd-gap,6px);align-items:flex-start;}',
    t('custom') + NAME + '{display:inline-block;background:var(--cd-name-bg,#fff);color:var(--cd-name-fg,#0b0d10);padding:.08em var(--cd-pad,.5em) .14em;border-radius:var(--cd-radius,0);transform:skewX(var(--cd-skew,0deg));font-family:var(--cd-font,inherit);font-weight:var(--cd-weight,700);text-transform:var(--cd-case,none);letter-spacing:var(--cd-ls,0);border:var(--cd-border,0);border-left:var(--cd-accent,var(--cd-border,0));box-shadow:var(--cd-shadow,none);}',
    t('custom') + ROLE + '{display:inline-block;background:var(--cd-role-bg,#e8365d);color:var(--cd-role-fg,#fff);padding:.16em calc(var(--cd-pad,.5em)*1.2);border-radius:var(--cd-radius,0);transform:skewX(var(--cd-skew,0deg));font-family:var(--cd-font,inherit);font-weight:var(--cd-weight,700);text-transform:var(--cd-case,none);letter-spacing:var(--cd-ls,0);border:var(--cd-border,0);box-shadow:var(--cd-shadow,none);margin-left:var(--cd-role-indent,0px);}',

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

    /* ── Blueprint: drafting grid, monospace type, corner brackets ─────────── */
    t('blueprint') + CARD + '{background-color:#0b2a4a;background-image:linear-gradient(rgba(120,190,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(120,190,255,.16) 1px,transparent 1px);background-size:14px 14px;border:1px solid rgba(140,200,255,.75);border-radius:2px;color:#e6f3ff;box-shadow:0 14px 40px rgba(0,0,0,.5);}',
    t('blueprint') + NAME + '{font-family:"SF Mono",Menlo,Consolas,monospace;font-weight:700;letter-spacing:.05em;text-transform:uppercase;}',
    t('blueprint') + ROLE + '{font-family:"SF Mono",Menlo,Consolas,monospace;color:#8fd0ff;letter-spacing:.14em;text-transform:uppercase;}',
    t('blueprint') + CARD + '::before{content:"";position:absolute;left:6px;top:6px;width:16px;height:16px;border-left:2px solid #8fd0ff;border-top:2px solid #8fd0ff;pointer-events:none;}',
    t('blueprint') + CARD + '::after{content:"";position:absolute;right:6px;bottom:6px;width:16px;height:16px;border-right:2px solid #8fd0ff;border-bottom:2px solid #8fd0ff;pointer-events:none;}',

    /* ── Ticket: paper stub with half-round notches and a dashed divider ──── */
    t('ticket') + CARD + '{background:linear-gradient(#fffdf7,#f1ead8);color:#231b10;border-radius:10px;box-shadow:0 14px 38px rgba(0,0,0,.45);-webkit-mask:radial-gradient(circle 9px at 0 50%,transparent 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 9px at 100% 50%,transparent 97%,#000) right/51% 100% no-repeat;mask:radial-gradient(circle 9px at 0 50%,transparent 97%,#000) left/51% 100% no-repeat,radial-gradient(circle 9px at 100% 50%,transparent 97%,#000) right/51% 100% no-repeat;}',
    t('ticket') + NAME + '{font-weight:800;letter-spacing:.02em;padding-bottom:4px;border-bottom:2px dashed rgba(35,27,16,.35);}',
    t('ticket') + ROLE + '{color:' + A + ';filter:brightness(.55) saturate(1.4);font-weight:700;letter-spacing:.12em;text-transform:uppercase;}',

    /* ── Stamp: double frame, serif capitals, ink colour ────────────────────── */
    t('stamp') + CARD + '{background:rgba(8,8,10,.55);border:3px double ' + A + ';border-radius:6px;color:' + A + ';box-shadow:inset 0 0 0 2px rgba(0,0,0,.35),0 12px 34px rgba(0,0,0,.45);}',
    t('stamp') + NAME + '{font-family:Georgia,"Times New Roman",serif;font-weight:800;letter-spacing:.14em;text-transform:uppercase;}',
    t('stamp') + ROLE + '{font-family:Georgia,"Times New Roman",serif;color:#fff;opacity:.9;letter-spacing:.2em;text-transform:uppercase;font-weight:600;}',

    /* ── Dog-ear: solid card with a folded corner ───────────────────────────── */
    t('dogear') + CARD + '{background:linear-gradient(120deg,color-mix(in srgb,' + P + ' 55%,#10131c),color-mix(in srgb,' + P + ' 30%,#05070c));border-radius:10px 0 10px 10px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.5);}',
    t('dogear') + CARD + '::after{content:"";position:absolute;top:0;right:0;width:30px;height:30px;background:linear-gradient(225deg,transparent 50%,' + A + ' 50%);filter:brightness(1.1);box-shadow:-3px 3px 8px rgba(0,0,0,.35);pointer-events:none;}',
    t('dogear') + ROLE + '{color:color-mix(in srgb,' + A + ' 70%,#fff);}',

    /* ── Chalkboard: slate with a wooden frame and chalky type ──────────────── */
    t('chalk') + CARD + '{background:radial-gradient(120% 140% at 30% 20%,#2f4a3c,#1f3329);border:6px solid #8a5a2b;border-radius:6px;color:#f4f1e6;box-shadow:inset 0 0 22px rgba(0,0,0,.55),0 14px 36px rgba(0,0,0,.5);}',
    t('chalk') + NAME + '{font-family:"Marker Felt","Chalkboard SE","Comic Sans MS",cursive;font-weight:700;letter-spacing:.03em;text-shadow:0 0 6px rgba(255,255,255,.35);}',
    t('chalk') + ROLE + '{font-family:"Marker Felt","Chalkboard SE","Comic Sans MS",cursive;color:#f7d87a;text-shadow:0 0 5px rgba(247,216,122,.35);}',

    /* ── Sunbeam: warm gradient with rays fanning from the left ─────────────── */
    t('sunbeam') + CARD + '{background:repeating-conic-gradient(from 0deg at 10% 50%,rgba(255,255,255,.2) 0 6deg,transparent 6deg 12deg),linear-gradient(110deg,color-mix(in srgb,' + P + ' 30%,#ff9d1f),color-mix(in srgb,' + A + ' 25%,#ff4d6d));border-radius:14px;color:#fff;box-shadow:0 16px 44px rgba(255,120,40,.35);text-shadow:0 2px 10px rgba(90,20,10,.4);}',
    t('sunbeam') + ROLE + '{color:rgba(255,255,255,.95);}',

    /* ── Gradient line: dark glass with a travelling colour line underneath ─ */
    t('gradline') + CARD + '{background:rgba(8,10,16,.74);border-radius:10px;color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.5);}',
    t('gradline') + CARD + '::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,' + P + ',' + A + ',' + P + ');background-size:200% 100%;animation:lt-travel 3.2s linear infinite;pointer-events:none;}',
    t('gradline') + ROLE + '{color:color-mix(in srgb,' + A + ' 60%,#fff);letter-spacing:.06em;}',

    /* ── Leaf: soft pastel card with opposite rounded corners ───────────────── */
    t('leaf') + CARD + '{background:linear-gradient(135deg,#f8fff4,#d9f0dc);border-radius:30px 6px 30px 6px;color:#14301c;box-shadow:0 14px 36px rgba(0,0,0,.35);}',
    t('leaf') + NAME + '{font-weight:800;}',
    t('leaf') + ROLE + '{color:#2e7d4a;font-weight:600;letter-spacing:.06em;}',

    /* ── Terminal: black screen, green monospace with a blinking cursor ───── */
    t('terminal') + CARD + '{background:#050805;border:1px solid #1d7a2f;border-radius:4px;color:#6dff8c;box-shadow:0 0 0 1px rgba(109,255,140,.15),0 14px 36px rgba(0,0,0,.55);}',
    t('terminal') + NAME + '{font-family:"SF Mono",Menlo,Consolas,monospace;font-weight:700;}',
    t('terminal') + NAME + '::before{content:"> ";color:#2fbf4f;}',
    t('terminal') + NAME + '::after{content:"_";margin-left:2px;animation:lt-blink 1s steps(1) infinite;}',
    t('terminal') + ROLE + '{font-family:"SF Mono",Menlo,Consolas,monospace;color:#3fbf5a;letter-spacing:.04em;}',

    /* ── Diagonal split: two tones meeting on a slant ───────────────────────── */
    t('diagonal') + CARD + '{background:linear-gradient(115deg,color-mix(in srgb,' + P + ' 70%,#0a0f1f) 0 62%,color-mix(in srgb,' + A + ' 80%,#0a0f1f) 62% 100%);border-radius:8px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,.5);}',
    t('diagonal') + ROLE + '{color:#fff;opacity:.92;letter-spacing:.08em;}',

    '@keyframes lt-blink{0%,49%{opacity:1;}50%,100%{opacity:0;}}',

    /* ══ Callouts: condensed capitals with blocks, outlines and corner marks. Primary is the main surface,
       Secondary is for rules, tags and bars, and the text on each is picked to stay readable. ══════════ */
    ANY_CALLOUT + CARD + '{border-radius:0;color:#fff;}',
    ANY_CALLOUT + NAME + '{font-family:"Bebas Neue","Oswald","Barlow Condensed","Avenir Next Condensed","DIN Condensed","Arial Narrow",Impact,sans-serif;text-transform:uppercase;font-weight:700;letter-spacing:.02em;line-height:1;}',
    ANY_CALLOUT + ROLE + '{font-family:"Bebas Neue","Oswald","Barlow Condensed","Avenir Next Condensed","DIN Condensed","Arial Narrow",Impact,sans-serif;text-transform:uppercase;font-weight:400;letter-spacing:.08em;}',

    /* Callout Bar */
    t('cobar') + CARD + '{padding:6px 24px 6px 4px;text-shadow:0 2px 10px rgba(0,0,0,.6);}',
    t('cobar') + ROLE + '{color:' + AL + ';}',
    t('cobar') + CARD + '::after{content:"";position:absolute;right:0;top:6px;bottom:6px;width:14px;background:' + P + ';}',

    /* Callout Block: the name on the Primary colour, the role on a Secondary strip */
    t('coblock') + CARD + '{padding:0;overflow:visible;}',
    t('coblock') + NAME + '{align-self:flex-start;background:' + P + ';color:' + PFG + ';padding:5px 14px;}',
    t('coblock') + ROLE + '{background:' + A + ';color:' + AFG + ';padding:3px 14px;font-weight:700;}',

    /* Callout Box */
    t('cobox') + CARD + '{border:1.5px solid ' + P + ';background:rgba(0,0,0,.28);padding:6px 6px 0;}',
    t('cobox') + NAME + '{padding:2px 10px 4px;}',
    t('cobox') + ROLE + '{background:' + A + ';color:' + AFG + ';padding:3px 10px;margin:4px -6px 0;font-weight:700;}',

    /* Callout Corner: a Primary block with a Secondary square at one corner */
    t('cocorner') + CARD + '{background:' + P + ';color:' + PFG + ';padding:6px 18px;overflow:visible;}',
    t('cocorner') + ROLE + '{color:' + PFG + ';opacity:.8;font-weight:700;}',
    t('cocorner') + CARD + '::after{content:"";position:absolute;right:-12px;top:-12px;width:34px;height:34px;border:2px solid ' + A + ';pointer-events:none;}',

    /* Callout Badge: the first letter on a Primary square */
    t('cobadge') + CARD + '{padding:4px 6px;text-shadow:0 2px 10px rgba(0,0,0,.55);}',
    t('cobadge') + NAME + '::first-letter{background:' + P + ';color:' + PFG + ';padding:0 9px;margin-right:6px;text-shadow:none;}',
    t('cobadge') + ROLE + '{font-size:.62em;color:' + AL + ';}',

    /* Callout Tag Line */
    t('couline') + CARD + '{padding:4px 4px 4px 0;text-shadow:0 2px 10px rgba(0,0,0,.6);}',
    t('couline') + ROLE + '{align-self:flex-start;background:' + A + ';color:' + AFG + ';padding:2px 10px;font-size:.62em;margin-top:4px;font-weight:700;text-shadow:none;}',

    /* Callout Brackets: Secondary corner marks around a Primary tint */
    t('cobrackets') + CARD + '{background:color-mix(in srgb,' + P + ' 30%,rgba(0,0,0,.35));padding:10px 20px;text-shadow:0 2px 10px rgba(0,0,0,.6);overflow:visible;}',
    t('cobrackets') + ROLE + '{color:' + AL + ';}',
    t('cobrackets') + CARD + '::before{content:"";position:absolute;left:0;top:0;width:22px;height:22px;border-left:2px solid ' + A + ';border-top:2px solid ' + A + ';pointer-events:none;}',
    t('cobrackets') + CARD + '::after{content:"";position:absolute;right:0;bottom:0;width:22px;height:22px;border-right:2px solid ' + A + ';border-bottom:2px solid ' + A + ';pointer-events:none;}',

    /* Callout Tint: a Secondary outline around a Primary tint */
    t('cotint') + CARD + '{border:1.5px solid ' + A + ';background:color-mix(in srgb,' + P + ' 28%,rgba(8,8,26,.62));padding:8px 18px;}',
    t('cotint') + NAME + '{color:color-mix(in srgb,' + P + ' 45%,#fff);}',
    t('cotint') + ROLE + '{color:' + AL + ';}',

    /* Callout Square: a Primary square with a Secondary notch */
    t('cosquare') + CARD + '{padding:4px 46px 4px 4px;text-shadow:0 2px 10px rgba(0,0,0,.6);overflow:visible;}',
    t('cosquare') + ROLE + '{color:' + AL + ';}',
    t('cosquare') + CARD + '::after{content:"";position:absolute;right:0;bottom:0;width:36px;height:36px;background:' + P + ';pointer-events:none;}',
    t('cosquare') + CARD + '::before{content:"";position:absolute;right:0;bottom:0;width:12px;height:12px;background:' + A + ';z-index:1;pointer-events:none;}',

    /* Callout Top Tag */
    t('cotag') + CARD + '{padding:2px 4px;text-shadow:0 2px 10px rgba(0,0,0,.6);}',
    t('cotag') + ' .name-role-overlay-copy{flex-direction:column-reverse;align-items:flex-start;}',
    t('cotag') + ROLE + '{background:' + A + ';color:' + AFG + ';padding:1px 8px;font-size:.5em;margin-bottom:3px;font-weight:700;text-shadow:none;}',

    /* Callout Highlight: the name on the Primary colour, the role in the Secondary */
    t('cohighlight') + CARD + '{padding:0;overflow:visible;}',
    t('cohighlight') + NAME + '{align-self:flex-start;background:' + P + ';color:' + PFG + ';padding:4px 14px;}',
    t('cohighlight') + ROLE + '{font-size:.62em;margin-top:4px;letter-spacing:.12em;color:' + AL + ';text-shadow:0 2px 10px rgba(0,0,0,.7);}',

    /* Callout White: a Primary name block and a Secondary role block */
    t('cowhite') + CARD + '{padding:0;overflow:visible;}',
    t('cowhite') + NAME + '{align-self:flex-start;background:' + P + ';color:' + PFG + ';padding:5px 14px;}',
    t('cowhite') + ROLE + '{align-self:flex-start;background:' + A + ';color:' + AFG + ';padding:3px 14px;font-weight:700;}',

    /* ══ Simple: bold capitals with a rule, a block or a bar ═════════════════════════════════ */
    ANY_SIMPLE + CARD + '{border-radius:0;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.6);}',
    ANY_SIMPLE + NAME + '{text-transform:uppercase;font-weight:800;line-height:1.03;letter-spacing:.01em;}',
    ANY_SIMPLE + ROLE + '{letter-spacing:.06em;}',

    /* Simple Rule Left */
    t('sbleft') + CARD + '{padding:2px 0 2px 16px;overflow:visible;}',
    t('sbleft') + ' .name-role-overlay-copy{flex-direction:column-reverse;align-items:flex-start;}',
    t('sbleft') + ROLE + '{font-size:.42em;text-transform:lowercase;color:' + AL + ';margin-bottom:6px;}',
    t('sbleft') + CARD + '::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:' + P + ';pointer-events:none;}',

    /* Simple Rule Top */
    t('sbtop') + CARD + '{padding:0;overflow:visible;}',
    t('sbtop') + ' .name-role-overlay-copy{flex-direction:column-reverse;align-items:stretch;}',
    t('sbtop') + ROLE + '{font-size:.42em;text-transform:lowercase;color:' + AL + ';margin-bottom:4px;}',
    t('sbtop') + NAME + '{border-top:3px solid ' + P + ';padding-top:8px;}',

    /* Simple Block: the name on the Primary colour, the role on a Secondary strip as wide as the block */
    t('sbblock') + CARD + '{padding:0;width:fit-content;overflow:visible;text-shadow:none;}',
    t('sbblock') + ' .name-role-overlay-copy{align-items:stretch;}',
    t('sbblock') + NAME + '{background:' + P + ';color:' + PFG + ';padding:7px 18px;}',
    t('sbblock') + ROLE + '{background:' + A + ';color:' + AFG + ';font-size:.42em;padding:4px 18px;text-transform:uppercase;letter-spacing:.16em;font-weight:700;}',

    /* Simple Bar: a bold name over a Secondary bar that carries the role */
    t('sbbar') + CARD + '{padding:0;width:fit-content;overflow:visible;}',
    t('sbbar') + ' .name-role-overlay-copy{align-items:stretch;}',
    t('sbbar') + ROLE + '{background:' + A + ';color:' + AFG + ';font-size:.42em;padding:4px 14px;margin-top:5px;font-weight:700;text-transform:lowercase;text-shadow:none;}',

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

    O + '.motion-unfold' + CARD + '{transform-origin:50% 0;}',
    O + '.motion-unfold.is-visible' + CARD + '{animation:lt-unfold 800ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-unfold{0%{opacity:0;transform:perspective(900px) scaleY(.02);}60%{opacity:1;transform:perspective(900px) scaleY(1.06);}100%{opacity:1;transform:perspective(900px) scaleY(1);}}',

    O + '.motion-spinin.is-visible' + CARD + '{animation:lt-spinin 900ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-spinin{0%{opacity:0;transform:rotate(-120deg) scale(.3);}70%{opacity:1;transform:rotate(8deg) scale(1.05);}100%{opacity:1;transform:rotate(0) scale(1);}}',

    O + '.motion-rubber.is-visible' + CARD + '{animation:lt-rubber 1000ms ease both;}',
    '@keyframes lt-rubber{0%{opacity:0;transform:scale3d(.4,.4,1);}30%{opacity:1;transform:scale3d(1.25,.75,1);}40%{transform:scale3d(.75,1.25,1);}50%{transform:scale3d(1.15,.85,1);}65%{transform:scale3d(.95,1.05,1);}75%{transform:scale3d(1.05,.95,1);}100%{opacity:1;transform:scale3d(1,1,1);}}',

    O + '.motion-wobble.is-visible' + CARD + '{animation:lt-wobble 1000ms ease both;}',
    '@keyframes lt-wobble{0%{opacity:0;transform:translateX(-80px) rotate(-8deg);}30%{opacity:1;transform:translateX(24px) rotate(4deg);}50%{transform:translateX(-14px) rotate(-3deg);}70%{transform:translateX(8px) rotate(2deg);}100%{opacity:1;transform:translateX(0) rotate(0);}}',

    O + '.motion-tada.is-visible' + CARD + '{animation:lt-tada 1000ms ease both;}',
    '@keyframes lt-tada{0%{opacity:0;transform:scale(.6) rotate(-4deg);}20%{opacity:1;transform:scale(.9) rotate(-3deg);}30%,50%,70%{transform:scale(1.1) rotate(3deg);}40%,60%{transform:scale(1.1) rotate(-3deg);}100%{opacity:1;transform:scale(1) rotate(0);}}',

    O + '.motion-rollin.is-visible' + CARD + '{animation:lt-rollin 900ms cubic-bezier(.2,.8,.3,1) both;}',
    '@keyframes lt-rollin{0%{opacity:0;transform:translateX(-110%) rotate(-540deg);}100%{opacity:1;transform:translateX(0) rotate(0);}}',

    O + '.motion-scanline:not(.is-visible)' + CARD + '{clip-path:inset(0 0 100% 0);transform:none;}',
    O + '.motion-scanline.is-visible' + CARD + '{clip-path:inset(0 0 0 0);transform:none;transition-duration:560ms,820ms,620ms,700ms;}',

    /* stretch: the name draws in from wide letter spacing */
    O + '.motion-stretch' + CARD + '{transform:none;transition:opacity 420ms ease;}',
    O + '.motion-stretch' + NAME + '{opacity:0;letter-spacing:.7em;transition:opacity 700ms ease 120ms,letter-spacing 900ms cubic-bezier(.2,.85,.25,1) 120ms;}',
    O + '.motion-stretch.is-visible' + NAME + '{opacity:1;letter-spacing:normal;}',

    /* ══ Options on any design: text colours, font, weight, case, corners, height and a third line ═══════ */
    O + '.has-x-name-color' + NAME + '{color:var(--x-name-color) !important;}',
    O + '.has-x-role-color' + ROLE + '{color:var(--x-role-color) !important;}',
    O + '.has-x-font' + NAME + ',' + O + '.has-x-font' + ROLE + '{font-family:var(--x-font) !important;}',
    O + '.has-x-weight' + NAME + ',' + O + '.has-x-weight' + ROLE + '{font-weight:var(--x-weight) !important;}',
    O + '.has-x-case' + NAME + ',' + O + '.has-x-case' + ROLE + '{text-transform:var(--x-case) !important;}',
    O + '.has-x-radius' + CARD + ',' + O + '.has-x-radius' + NAME + ',' + O + '.has-x-radius' + ROLE + '{border-radius:var(--x-radius) !important;}',
    O + '.pos-top{align-items:flex-start !important;padding-top:8vh !important;padding-bottom:0 !important;}',
    O + '.pos-middle{align-items:center !important;padding-bottom:0 !important;}',
    O + ' .name-role-overlay-extra{font-size:calc(var(--name-role-role-size,24px) * .8);opacity:.9;margin-top:2px;letter-spacing:.04em;}',
    O + ' .name-role-overlay-extra:empty{display:none;}',

    /* Respect reduced-motion: show instantly */
    '@media (prefers-reduced-motion:reduce){' + O + ' *{animation-duration:.01ms !important;transition-duration:.01ms !important;}}'
  ].join('\n');

  // The designer's settings, and the CSS variables a saved design turns into
  var CUSTOM_DEFAULTS = {
    name: 'My design', nameBg: '#ffffff', nameFg: '#0b0d10', nameBgOpacity: 100,
    roleBg: '#e8365d', roleFg: '#ffffff', roleBgOpacity: 100,
    radius: 0, skew: 0, gap: 6, padding: 50, roleIndent: 0,
    accentColor: '#e8365d', accentWidth: 0, borderColor: '#ffffff', borderWidth: 0,
    font: 'Montserrat', weight: 700, caseStyle: 'upper', letterSpacing: 0, shadow: true
  };
  function clampNum(v, lo, hi, fallback) { var n = Number(v); return isNaN(n) ? fallback : Math.max(lo, Math.min(hi, n)); }
  function hexOr(v, fallback) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback; }
  function normalizeCustom(d) {
    d = d || {};
    var o = {};
    for (var k in CUSTOM_DEFAULTS) o[k] = d[k] === undefined || d[k] === null ? CUSTOM_DEFAULTS[k] : d[k];
    o.nameBg = hexOr(o.nameBg, '#ffffff'); o.nameFg = hexOr(o.nameFg, '#0b0d10'); o.roleBg = hexOr(o.roleBg, '#e8365d'); o.roleFg = hexOr(o.roleFg, '#ffffff');
    o.accentColor = hexOr(o.accentColor, '#e8365d'); o.borderColor = hexOr(o.borderColor, '#ffffff');
    o.nameBgOpacity = clampNum(o.nameBgOpacity, 0, 100, 100); o.roleBgOpacity = clampNum(o.roleBgOpacity, 0, 100, 100);
    o.radius = clampNum(o.radius, 0, 40, 0); o.skew = clampNum(o.skew, -20, 20, 0); o.gap = clampNum(o.gap, 0, 40, 6);
    o.padding = clampNum(o.padding, 0, 150, 50); o.roleIndent = clampNum(o.roleIndent, 0, 200, 0);
    o.accentWidth = clampNum(o.accentWidth, 0, 24, 0); o.borderWidth = clampNum(o.borderWidth, 0, 10, 0);
    o.weight = [400, 500, 600, 700, 800, 900].indexOf(Number(o.weight)) >= 0 ? Number(o.weight) : 700;
    o.letterSpacing = clampNum(o.letterSpacing, -2, 12, 0);
    o.caseStyle = ['upper', 'lower', 'none', 'title'].indexOf(o.caseStyle) >= 0 ? o.caseStyle : 'upper';
    o.font = ['Montserrat', 'Geist', 'Source Serif 4', 'Georgia', 'Arial', 'Impact'].indexOf(o.font) >= 0 ? o.font : 'Montserrat';
    o.shadow = !!o.shadow;
    return o;
  }
  function customVars(design) {
    var d = normalizeCustom(design);
    var fam = { 'Montserrat': "'Montserrat',sans-serif", 'Geist': "'Geist',sans-serif", 'Source Serif 4': "'Source Serif 4',Georgia,serif", 'Georgia': 'Georgia,serif', 'Arial': 'Arial,sans-serif', 'Impact': 'Impact,sans-serif' }[d.font];
    return {
      '--cd-name-bg': 'color-mix(in srgb,' + d.nameBg + ' ' + d.nameBgOpacity + '%,transparent)',
      '--cd-name-fg': d.nameFg,
      '--cd-role-bg': 'color-mix(in srgb,' + d.roleBg + ' ' + d.roleBgOpacity + '%,transparent)',
      '--cd-role-fg': d.roleFg,
      '--cd-radius': d.radius + 'px',
      '--cd-skew': (-d.skew) + 'deg',
      '--cd-gap': d.gap + 'px',
      '--cd-pad': (d.padding / 100) + 'em',
      '--cd-role-indent': d.roleIndent + 'px',
      '--cd-font': fam,
      '--cd-weight': String(d.weight),
      '--cd-case': { upper: 'uppercase', lower: 'lowercase', none: 'none', title: 'capitalize' }[d.caseStyle],
      '--cd-ls': (d.letterSpacing / 100) + 'em',
      '--cd-border': d.borderWidth ? d.borderWidth + 'px solid ' + d.borderColor : '0',
      '--cd-accent': d.accentWidth ? d.accentWidth + 'px solid ' + d.accentColor : (d.borderWidth ? d.borderWidth + 'px solid ' + d.borderColor : '0'),
      '--cd-shadow': d.shadow ? '0 10px 28px rgba(0,0,0,.4)' : 'none'
    };
  }
  // Put a design's variables on an overlay element (and take them off for any other design)
  function applyCustom(overlay, design, active) {
    var names = Object.keys(customVars({}));
    if (!active) { names.forEach(function (n) { overlay.style.removeProperty(n); }); return; }
    var vars = customVars(design);
    Object.keys(vars).forEach(function (n) { overlay.style.setProperty(n, vars[n]); });
  }

  root.SP_LT_EXTRA = { themes: THEMES, motions: MOTIONS, css: css, customDefaults: CUSTOM_DEFAULTS, normalizeCustom: normalizeCustom, customVars: customVars, applyCustom: applyCustom };

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
