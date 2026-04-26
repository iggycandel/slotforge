/* ─────────────────────────────────────────────────────────────────────────────
   Spinative — Marketing Workspace v1 / Day 5
   Iframe-side controller for the Marketing tab.

   What this file does:
     • Fetches GET /api/marketing/templates  (catalogue, plan-gated)
     • Fetches GET /api/marketing/kits        (project kits + readiness)
     • Renders either a "Getting Ready" empty state (assets missing) or
       the four-section template grid (Promo / Social / Store / Press)
     • Exposes window._sfMarketing.{init, refresh, openExportMenu} so
       editor.js can drive it from switchWorkspace + the topbar button

   What this file does NOT do (yet):
     • Customise modal — Day 6
     • Bulk export — Day 9
     • Single-template render trigger — Day 6
   The grid cards render with a "Render" button that's a placeholder
   toast today; Day 6 wires it to the real /api/marketing/render SSE.

   Design constraint: plain ES5-ish JS (no build step). The editor
   iframe loads this script raw from /editor/. Avoid arrow-fn-in-method-
   shorthand and other niceties that won't tree-shake to legacy targets.
   ───────────────────────────────────────────────────────────────────── */

(function(){
  'use strict';

  // ─── State ─────────────────────────────────────────────────────────────────
  var state = {
    initialised: false,
    loading:     false,
    templates:   null,   // TemplateSummary[] from GET /templates
    kits:        null,   // MarketingKitRow[]  from GET /kits
    readiness:   null,   // { hasBackground, hasLogo, hasCharacter, ... }
    error:       null,
  };

  function projectId() { return window._sfProjectId || null; }

  // ─── Public API ────────────────────────────────────────────────────────────
  // editor.js calls these via window._sfMarketing — keep the surface
  // narrow so the script can be replaced without a coordinated editor
  // change.
  var api = {
    init:           initOnce,
    refresh:        refresh,
    openExportMenu: openExportMenu,
  };
  window._sfMarketing = api;

  function initOnce(){
    if(state.initialised) return;
    state.initialised = true;
    refresh();
  }

  function refresh(){
    if(!projectId()){
      // SF_LOAD hasn't landed yet (or shell is missing). Try again in a
      // tick — the iframe ready-handshake is async, so on a fast tab
      // switch we may beat it. Cap retries at 5 to avoid silent loops.
      if((refresh._retries = (refresh._retries||0) + 1) > 5){
        renderError('Project context unavailable. Refresh the page.');
        return;
      }
      setTimeout(refresh, 200);
      return;
    }
    refresh._retries = 0;

    if(state.loading) return;
    state.loading = true;
    state.error   = null;
    renderLoading();

    Promise.all([
      fetchJSON('/api/marketing/templates'),
      fetchJSON('/api/marketing/kits?project_id=' + encodeURIComponent(projectId())),
    ]).then(function(results){
      state.loading   = false;
      state.templates = (results[0] && results[0].templates) || [];
      state.kits      = (results[1] && results[1].kits)      || [];
      state.readiness = (results[1] && results[1].readiness) || null;
      render();
    }).catch(function(err){
      state.loading = false;
      state.error   = err && err.message ? err.message : 'Load failed';
      renderError(state.error);
    });
  }

  function openExportMenu(){
    // Day 9 wires bulk-export with a real menu. Until then surface a
    // toast so a user click on the topbar button is acknowledged
    // instead of looking dead.
    if(typeof showToast === 'function'){
      showToast('Bulk export ships in v1 day 9');
    }
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  function grid(){ return document.getElementById('mkt-grid'); }

  function renderLoading(){
    var el = grid();
    if(!el) return;
    el.innerHTML = '<div class="mkt-loading" style="padding:24px;color:#7a7a94;font-size:12px">Loading marketing kit…</div>';
  }

  function renderError(msg){
    var el = grid();
    if(!el) return;
    el.innerHTML = '<div style="padding:24px;color:#c97a7a;font-size:12px">'+escapeHtml(msg)+'</div>';
  }

  function render(){
    var el = grid();
    if(!el) return;

    // ── Plan / auth errors are surfaced in fetchJSON; here we own the
    //    "logically allowed but missing assets" state.
    if(state.readiness && !isReady(state.readiness)){
      el.innerHTML = renderReadinessEmpty(state.readiness);
      return;
    }

    if(!state.templates || state.templates.length === 0){
      el.innerHTML = '<div style="padding:24px;color:#7a7a94;font-size:12px">No templates registered yet. Day 8 ships the full catalogue.</div>';
      return;
    }

    // Group by category — preserves the registry's category order
    // (promo → social → store → press).
    var groups = {
      promo:  { title: 'Promo Screens', items: [] },
      social: { title: 'Social Assets', items: [] },
      store:  { title: 'Store Page',    items: [] },
      press:  { title: 'Press Kit',     items: [] },
    };
    for(var i = 0; i < state.templates.length; i++){
      var t = state.templates[i];
      if(groups[t.category]) groups[t.category].items.push(t);
    }

    var html = '';
    var order = ['promo','social','store','press'];
    for(var j = 0; j < order.length; j++){
      var k = order[j];
      var g = groups[k];
      if(g.items.length === 0) continue;
      html += '<div class="mkt-section">';
      html +=   '<div class="mkt-section-title">'+escapeHtml(g.title)+' <span class="mkt-section-count">('+g.items.length+')</span></div>';
      html +=   '<div class="mkt-section-grid">';
      for(var m = 0; m < g.items.length; m++){
        html += renderCard(g.items[m]);
      }
      html +=   '</div>';
      html += '</div>';
    }

    // Inject styles once. They're scoped under .mkt-section so they
    // don't leak into other workspaces. Keeping CSS inline avoids
    // touching spinative.html for what's a localised v1 surface — the
    // design doc allows extracting marketing.css later (§13.1).
    if(!document.getElementById('_sf_marketing_css')){
      var s = document.createElement('style');
      s.id = '_sf_marketing_css';
      s.textContent = MARKETING_CSS;
      document.head.appendChild(s);
    }

    el.innerHTML = html;

    // Wire per-card buttons. Events are delegated to the grid so we
    // don't pay an O(n) cost re-binding on every refresh.
    el.onclick = onGridClick;
  }

  function renderCard(t){
    // Sizes summary like "256² · 512² · 1024²  PNG" — squares get the ²
    // shorthand, non-square uses WxH. Format dedupes by uppercase tag.
    var sizes  = t.sizes.map(function(s){
      return s.w === s.h ? s.w + '²' : (s.w + '×' + s.h);
    }).join(' · ');
    var formats = uniq(t.sizes.map(function(s){ return (s.format||'').toUpperCase(); })).join(' / ');

    var preview = t.previewPath
      ? '<img class="mkt-tile-preview" src="'+escapeAttr(t.previewPath)+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : '<div class="mkt-tile-preview-empty"></div>';

    return ''
      + '<div class="mkt-tile" data-template-id="'+escapeAttr(t.id)+'">'
      +   preview
      +   '<div class="mkt-tile-name">'+escapeHtml(t.name)+'</div>'
      +   '<div class="mkt-tile-sizes">'+escapeHtml(sizes)+(formats ? ('  '+escapeHtml(formats)) : '')+'</div>'
      +   '<div class="mkt-tile-actions">'
      +     '<button class="mkt-tile-btn" data-act="customise">Customise</button>'
      +     '<button class="mkt-tile-btn primary" data-act="render">Render</button>'
      +   '</div>'
      + '</div>';
  }

  function renderReadinessEmpty(r){
    function check(ok, label){
      return '<li style="margin:6px 0">'
        + '<span style="display:inline-block;width:18px;color:'+(ok?'#7ac98a':'#c97a7a')+'">'+(ok?'✓':'✗')+'</span>'
        + '<span style="color:'+(ok?'#a0a0b0':'#e8d4a4')+'">'+escapeHtml(label)+'</span>'
        + '</li>';
    }
    return ''
      + '<div style="padding:32px;max-width:520px">'
      +   '<div style="font-size:14px;color:#e8e6e2;margin-bottom:6px">Getting ready</div>'
      +   '<div style="font-size:12px;color:#7a7a94;line-height:1.5;margin-bottom:14px">Marketing renders use your generated assets. Three are required before the kit unlocks.</div>'
      +   '<ul style="list-style:none;padding:0;margin:0 0 16px;font-size:12px">'
      +     check(r.hasBackground, 'Background (base game)')
      +     check(r.hasLogo,        'Logo')
      +     check(r.hasCharacter,   'Character')
      +   '</ul>'
      +   '<button class="mkt-tile-btn primary" onclick="if(typeof switchWorkspace===\'function\')switchWorkspace(\'assets\')">Open Art workspace →</button>'
      + '</div>';
  }

  // ─── Grid event delegation ─────────────────────────────────────────────────

  function onGridClick(ev){
    var btn = ev.target && ev.target.closest && ev.target.closest('.mkt-tile-btn');
    if(!btn) return;
    var tile = btn.closest('.mkt-tile');
    var tid  = tile && tile.getAttribute('data-template-id');
    var act  = btn.getAttribute('data-act');
    if(!tid || !act) return;

    if(act === 'customise'){
      // Day 6 wires the Customise modal. For now surface a toast so the
      // click is acknowledged.
      if(typeof showToast === 'function') showToast('Customise modal ships day 6 — ' + tid);
      return;
    }
    if(act === 'render'){
      if(typeof showToast === 'function') showToast('Render trigger ships day 6 — ' + tid);
      return;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function isReady(r){
    return !!(r && r.hasBackground && r.hasLogo && r.hasCharacter);
  }

  function fetchJSON(url){
    return fetch(url, { credentials: 'same-origin' }).then(function(res){
      // Plan-gate (403) and missing project (404) get bubbled with the
      // error body's message so the empty-state can reflect them
      // honestly instead of a generic "load failed".
      if(!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(body){
          var msg = (body && body.message) || (body && body.error) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      }
      return res.json();
    });
  }

  function uniq(arr){
    var out = []; var seen = {};
    for(var i = 0; i < arr.length; i++){
      if(!seen[arr[i]]){ seen[arr[i]] = 1; out.push(arr[i]); }
    }
    return out;
  }

  function escapeHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function escapeAttr(s){ return escapeHtml(s); }

  // ─── Styles ────────────────────────────────────────────────────────────────
  // Inline so spinative.html doesn't have to grow a marketing.css <link>
  // for what's a localised v1 surface. Day 10 polish may extract.

  var MARKETING_CSS = ''
    + '.mkt-section{padding:18px 22px;border-bottom:1px solid #1a1a24}'
    + '.mkt-section:last-of-type{border-bottom:none}'
    + '.mkt-section-title{font-size:12px;font-weight:600;color:#e8e6e2;margin-bottom:12px;letter-spacing:0.04em;text-transform:uppercase}'
    + '.mkt-section-count{color:#5a5a78;font-weight:400;margin-left:4px}'
    + '.mkt-section-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}'
    + '.mkt-tile{background:#13131a;border:1px solid #2a2a3a;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s}'
    + '.mkt-tile:hover{border-color:#3a3a4f}'
    + '.mkt-tile-preview,.mkt-tile-preview-empty{width:100%;aspect-ratio:1/1;background:#0a0a10;border-radius:6px;object-fit:cover;display:block}'
    + '.mkt-tile-preview-empty{background:linear-gradient(135deg,#1a1a24 0%,#222230 100%)}'
    + '.mkt-tile-name{font-size:12px;color:#e8e6e2;font-weight:500;margin-top:2px}'
    + '.mkt-tile-sizes{font-size:10px;color:#7a7a94;font-family:"DM Mono",monospace;letter-spacing:0.02em}'
    + '.mkt-tile-actions{display:flex;gap:6px;margin-top:auto}'
    + '.mkt-tile-btn{flex:1;background:#1a1a24;border:1px solid #2a2a3a;color:#e0deda;border-radius:5px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:500;transition:background .12s,border-color .12s}'
    + '.mkt-tile-btn:hover{background:#222230;border-color:#3a3a4f}'
    + '.mkt-tile-btn.primary{background:#c9a84c;border-color:#c9a84c;color:#0a0a10}'
    + '.mkt-tile-btn.primary:hover{background:#d4b65c;border-color:#d4b65c}';
})();
