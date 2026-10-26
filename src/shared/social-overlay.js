/* Scripture Pod: the "Social engagement" lower third.
 *
 * One implementation for every page that draws it:
 *   - src/renderer/display/display.html (loads this file)
 *   - src/renderer/panel/scripts/output/output-and-streaming.js (inlines SP_SOCIAL_SOURCE and the CSS
 *     into the Preview / Program / standalone output page)
 * so the Preview, the Program monitor and the live output always match.
 *
 * Written as one function so its source can be inlined; no backticks or template
 * placeholders anywhere in this file.
 */
function spSocialModule(root) {
  var PLATFORMS = [
    { key: 'instagram', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg>' },
    { key: 'facebook', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M15 3h-2.6A4.4 4.4 0 0 0 8 7.4V10H5v3.5h3V21h3.6v-7.5h3l.5-3.5h-3.5V7.8c0-1 .3-1.5 1.6-1.5H15V3z"/></svg>' },
    { key: 'youtube', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.3v5.4l4.6-2.7z" fill="currentColor" stroke="none"/></svg>' },
    { key: 'x', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/></svg>' },
    { key: 'tiktok', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v11.2a3.3 3.3 0 1 1-3.3-3.3M14 3c.3 2.5 2 4.1 4.5 4.3"/></svg>' },
    { key: 'whatsapp', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.3z"/><path d="M9.2 8.6c.3 2.7 2.6 5 5.3 5.3l1.2-1.4-2-1-.8.8c-.9-.4-1.7-1.2-2.1-2.1l.8-.8-1-2z" fill="currentColor" stroke="none"/></svg>' },
    { key: 'website', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>' }
  ];
  var ACTIONS = [
    { key: 'like', label: 'LIKE', icon: '<svg viewBox="0 0 24 24"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 10l5-8c1.5 0 2.5 1.4 2 2.8L13 9h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18 20H7"/></svg>' },
    { key: 'comment', label: 'COMMENT', icon: '<svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/></svg>' },
    { key: 'share', label: 'SHARE', icon: '<svg viewBox="0 0 24 24"><path d="M12 16V3M7 8l5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/></svg>' },
    { key: 'subscribe', label: 'SUBSCRIBE', icon: '<svg viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>' },
    { key: 'follow', label: 'FOLLOW', icon: '<svg viewBox="0 0 24 24"><path d="M15 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M16 11h6"/></svg>' }
  ];
  var LAYOUTS = ['bar', 'stack', 'pills'];
  var THEMES = ['solid', 'dark', 'light', 'glass'];
  var POSITIONS = ['bottom-center', 'bottom-left', 'bottom-right', 'top-center', 'top-left', 'top-right'];
  var MOTIONS = ['pulse', 'bounce', 'wiggle', 'none'];

  var O = '#social-engagement-overlay';
  var css = [
    O + '{position:fixed;z-index:21;display:flex;width:min(1100px,86vw);pointer-events:none;opacity:0;visibility:hidden;transition:opacity 560ms ease,visibility 0s linear 560ms;}',
    O + '.is-visible{opacity:1;visibility:visible;transition-delay:0s;}',
    O + '[data-position="bottom-center"]{left:50%;bottom:12vh;justify-content:center;transform:translate(calc(-50% + var(--social-engagement-offset-x,0vw)),var(--social-engagement-offset-y,0vh));}',
    O + '[data-position="bottom-left"]{left:5vw;bottom:12vh;justify-content:flex-start;transform:translate(var(--social-engagement-offset-x,0vw),var(--social-engagement-offset-y,0vh));}',
    O + '[data-position="bottom-right"]{right:5vw;bottom:12vh;justify-content:flex-end;transform:translate(var(--social-engagement-offset-x,0vw),var(--social-engagement-offset-y,0vh));}',
    O + '[data-position="top-center"]{left:50%;top:9vh;justify-content:center;transform:translate(calc(-50% + var(--social-engagement-offset-x,0vw)),var(--social-engagement-offset-y,0vh));}',
    O + '[data-position="top-left"]{left:5vw;top:9vh;justify-content:flex-start;transform:translate(var(--social-engagement-offset-x,0vw),var(--social-engagement-offset-y,0vh));}',
    O + '[data-position="top-right"]{right:5vw;top:9vh;justify-content:flex-end;transform:translate(var(--social-engagement-offset-x,0vw),var(--social-engagement-offset-y,0vh));}',

    O + ' .sp-soc-card{display:flex;flex-direction:column;align-items:center;gap:10px;max-width:100%;opacity:0;transform:translateY(24px) scale(.96);transition:opacity 560ms ease,transform 700ms cubic-bezier(.2,.85,.25,1);}',
    O + '[data-position$="left"] .sp-soc-card{align-items:flex-start;}',
    O + '[data-position$="right"] .sp-soc-card{align-items:flex-end;}',
    O + '.is-visible .sp-soc-card{opacity:1;transform:translateY(0) scale(1);}',

    /* themes: background, text, border and icon colours */
    O + '[data-theme="solid"]{--so-bg:color-mix(in srgb,var(--social-engagement-primary,#90D5FF) 68%,transparent);--so-fg:var(--social-engagement-foreground,#fff);--so-border:color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 42%,transparent);--so-icon:var(--social-engagement-accent,#90D5FF);--so-blur:none;}',
    O + '[data-theme="dark"]{--so-bg:rgba(8,10,16,.84);--so-fg:#fff;--so-border:color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 50%,transparent);--so-icon:var(--social-engagement-accent,#90D5FF);--so-blur:none;}',
    O + '[data-theme="light"]{--so-bg:rgba(255,255,255,.93);--so-fg:#101216;--so-border:rgba(0,0,0,.12);--so-icon:color-mix(in srgb,var(--social-engagement-accent,#90D5FF) 60%,#000);--so-blur:none;}',
    O + '[data-theme="glass"]{--so-bg:rgba(255,255,255,.14);--so-fg:#fff;--so-border:rgba(255,255,255,.34);--so-icon:var(--social-engagement-accent,#90D5FF);--so-blur:blur(14px) saturate(160%);}',

    O + ' .sp-soc-headline{color:#fff;font-size:calc(var(--social-engagement-size,32px)*.95);font-weight:800;letter-spacing:.02em;text-shadow:0 3px 18px rgba(0,0,0,.7);max-width:100%;overflow-wrap:anywhere;}',
    O + ' .sp-soc-group{display:flex;align-items:center;flex-wrap:wrap;gap:10px;width:max-content;max-width:100%;color:var(--so-fg);}',
    O + ' .sp-soc-item{display:inline-flex;align-items:center;gap:.4em;flex:0 0 auto;}',

    /* bar: each group is a capsule */
    O + ' .sp-soc-card.layout-bar .sp-soc-group{justify-content:center;padding:7px 14px;border:1px solid var(--so-border);border-radius:999px;background:var(--so-bg);backdrop-filter:var(--so-blur);-webkit-backdrop-filter:var(--so-blur);}',
    /* stack: one box, actions on top, handles listed underneath */
    O + ' .sp-soc-card.layout-stack{align-items:stretch;padding:18px 26px;border:1px solid var(--so-border);border-radius:24px;background:var(--so-bg);backdrop-filter:var(--so-blur);-webkit-backdrop-filter:var(--so-blur);}',
    O + ' .sp-soc-card.layout-stack .sp-soc-headline{color:var(--so-fg);text-shadow:none;}',
    O + ' .sp-soc-card.layout-stack .sp-soc-socials{flex-direction:column;align-items:flex-start;gap:8px;}',
    /* pills: every item is its own capsule */
    O + ' .sp-soc-card.layout-pills .sp-soc-group{justify-content:center;}',
    O + ' .sp-soc-card.layout-pills .sp-soc-item{padding:6px 16px 6px 10px;border:1px solid var(--so-border);border-radius:999px;background:var(--so-bg);backdrop-filter:var(--so-blur);-webkit-backdrop-filter:var(--so-blur);}',

    O + ' .sp-soc-social{font-size:var(--social-engagement-size,32px);}',
    O + ' .sp-soc-social b{display:inline-flex;align-items:center;justify-content:center;width:var(--social-engagement-icon-size,45px);height:var(--social-engagement-icon-size,45px);flex:0 0 var(--social-engagement-icon-size,45px);color:var(--so-icon);}',
    O + ' .sp-soc-social b svg{width:100%;height:100%;}',
    O + ' .sp-soc-social span{max-width:40vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;}',
    O + ' .sp-soc-action{font-size:var(--social-engagement-action-size,24px);font-weight:800;letter-spacing:.06em;padding:5px 12px 5px 9px;border:1px solid color-mix(in srgb,var(--so-icon) 65%,transparent);border-radius:999px;}',
    O + ' .sp-soc-card.layout-pills .sp-soc-action{border-color:var(--so-border);}',
    O + ' .sp-soc-action svg{width:1.05em;height:1.05em;flex:0 0 1.05em;fill:none;stroke:var(--so-icon);stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;}',

    /* items arrive one after another */
    O + ' .sp-soc-item{opacity:0;transform:translateY(10px) scale(.96);transition:opacity 380ms ease,transform 480ms cubic-bezier(.2,.85,.25,1);}',
    O + '.is-visible .sp-soc-item{opacity:1;transform:translateY(0) scale(1);transition-delay:calc(120ms + var(--i,0) * 90ms);}',

    /* looping icon motion */
    O + '.is-visible[data-motion="pulse"] .sp-soc-action svg{animation:sp-soc-pulse 1.9s ease-in-out 1s infinite;}',
    O + '.is-visible[data-motion="bounce"] .sp-soc-action svg{animation:sp-soc-bounce 1.6s ease-in-out 1s infinite;}',
    O + '.is-visible[data-motion="wiggle"] .sp-soc-action svg{animation:sp-soc-wiggle 2s ease-in-out 1s infinite;}',
    '@keyframes sp-soc-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.22);}}',
    '@keyframes sp-soc-bounce{0%,100%{transform:translateY(0);}35%{transform:translateY(-.22em);}60%{transform:translateY(0);}78%{transform:translateY(-.08em);}}',
    '@keyframes sp-soc-wiggle{0%,60%,100%{transform:rotate(0);}68%{transform:rotate(-14deg);}76%{transform:rotate(12deg);}84%{transform:rotate(-8deg);}92%{transform:rotate(5deg);}}',
    '@media (prefers-reduced-motion:reduce){' + O + ' *{animation:none !important;transition-duration:.01ms !important;}}'
  ].join('\n');

  function clean(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 100); }
  function hex(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#90D5FF'; }
  function pick(value, list, fallback) { return list.indexOf(value) !== -1 ? value : fallback; }
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function withIcon(doc, host, svg) { var holder = doc.createElement('span'); holder.innerHTML = svg; host.appendChild(holder.firstChild); }

  // Draws or hides the overlay for the given settings
  function update(overlay, data) {
    if (!overlay) return;
    data = data || {};
    var doc = overlay.ownerDocument;
    var socials = data.socials || {};
    var actions = data.actions || {};
    var socialItems = PLATFORMS.filter(function (p) { return clean(socials[p.key]); });
    var actionItems = ACTIONS.filter(function (a) { return !!actions[a.key]; });
    var headline = clean(data.headline, 60);
    var enabled = !!data.enabled && (socialItems.length > 0 || actionItems.length > 0 || !!headline);
    var primary = hex(data.primaryColor);
    var accent = hex(data.accentColor);
    var channels = primary.slice(1).match(/.{2}/g).map(function (part) { var c = parseInt(part, 16) / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    var luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
    var size = Math.max(10, Math.min(40, Number(data.size) || 32));
    // Bar opacity: only when set, otherwise the theme keeps its own look
    var bgOpacity = (data.bgOpacity === null || data.bgOpacity === undefined || data.bgOpacity === '') ? null : Math.max(0, Math.min(100, Number(data.bgOpacity)));
    var offsetX = Math.max(-40, Math.min(40, Number(data.offsetX) || 0));
    var offsetY = Math.max(-40, Math.min(40, Number(data.offsetY) || 0));
    var layout = pick(data.layout, LAYOUTS, 'bar');
    var theme = pick(data.theme, THEMES, 'solid');
    var position = pick(data.position, POSITIONS, 'bottom-center');
    var motion = pick(data.motion, MOTIONS, 'pulse');
    var values = {};
    socialItems.forEach(function (p) { values[p.key] = clean(socials[p.key]); });
    var signature = JSON.stringify([values, actionItems.map(function (a) { return a.key; }), headline, layout, theme, position, motion, primary, accent, size]);
    var changed = overlay.dataset.signature !== signature;

    if (changed) {
      var card = el(doc, 'div', 'sp-soc-card layout-' + layout);
      if (headline) card.appendChild(el(doc, 'div', 'sp-soc-headline', headline));
      var index = 0;
      if (actionItems.length) {
        var group = el(doc, 'div', 'sp-soc-group sp-soc-actions');
        actionItems.forEach(function (a) {
          var item = el(doc, 'span', 'sp-soc-item sp-soc-action sp-soc-action-' + a.key);
          item.style.setProperty('--i', String(index++));
          withIcon(doc, item, a.icon);
          item.appendChild(el(doc, 'span', '', a.label));
          group.appendChild(item);
        });
        card.appendChild(group);
      }
      if (socialItems.length) {
        var list = el(doc, 'div', 'sp-soc-group sp-soc-socials');
        socialItems.forEach(function (p) {
          var item = el(doc, 'span', 'sp-soc-item sp-soc-social sp-soc-social-' + p.key);
          item.style.setProperty('--i', String(index++));
          var icon = el(doc, 'b');
          icon.setAttribute('aria-hidden', 'true');
          withIcon(doc, icon, p.icon);
          item.appendChild(icon);
          item.appendChild(el(doc, 'span', '', values[p.key]));
          list.appendChild(item);
        });
        card.appendChild(list);
      }
      if (enabled && overlay.classList.contains('is-visible')) {
        overlay.classList.remove('is-visible');
        void overlay.offsetWidth;
      }
      overlay.replaceChildren(card);
      overlay.dataset.signature = signature;
    }

    overlay.dataset.theme = theme;
    overlay.dataset.position = position;
    overlay.dataset.motion = motion;
    overlay.style.setProperty('--social-engagement-primary', primary);
    overlay.style.setProperty('--social-engagement-foreground', luminance >= 0.72 ? '#101216' : '#ffffff');
    overlay.style.setProperty('--social-engagement-accent', accent);
    overlay.style.setProperty('--social-engagement-size', size + 'px');
    if (bgOpacity === null || isNaN(bgOpacity)) {
      overlay.style.removeProperty('--so-bg');
    } else {
      var base = { solid: primary, dark: '#080a10', light: '#ffffff', glass: '#ffffff' }[theme] || primary;
      overlay.style.setProperty('--so-bg', 'color-mix(in srgb,' + base + ' ' + bgOpacity + '%,transparent)');
    }
    overlay.style.setProperty('--social-engagement-action-size', Math.max(10, Math.round(size * 0.75)) + 'px');
    overlay.style.setProperty('--social-engagement-icon-size', Math.round(size * 1.4) + 'px');
    overlay.style.setProperty('--social-engagement-offset-x', offsetX + 'vw');
    overlay.style.setProperty('--social-engagement-offset-y', offsetY + 'vh');
    overlay.setAttribute('aria-hidden', enabled ? 'false' : 'true');
    if (enabled && !overlay.classList.contains('is-visible')) { void overlay.offsetWidth; }
    overlay.classList.toggle('is-visible', enabled);
  }

  function inject(doc) {
    doc = doc || (typeof document !== 'undefined' ? document : null);
    if (!doc || doc.getElementById('sp-social-css')) return;
    var style = doc.createElement('style');
    style.id = 'sp-social-css';
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
  }

  root.SP_SOCIAL = { platforms: PLATFORMS.map(function (p) { return p.key; }), actions: ACTIONS.map(function (a) { return a.key; }), layouts: LAYOUTS, themes: THEMES, positions: POSITIONS, motions: MOTIONS, css: css, update: update, inject: inject };
}

spSocialModule(typeof window !== 'undefined' ? window : globalThis);
if (typeof window !== 'undefined' || typeof globalThis !== 'undefined') {
  (typeof window !== 'undefined' ? window : globalThis).SP_SOCIAL_SOURCE = '(' + spSocialModule.toString() + ')(window);';
}
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).SP_SOCIAL;
