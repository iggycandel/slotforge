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
    // "Render all" — same pipeline as the export menu but skips the
    // zip download. Use case: user wants to fill every tile to scan
    // their kit, without committing to a download yet.
    renderAll:      function(){ runExportAll(null, /*skipZip*/ true) },
  };
  window._sfMarketing = api;

  function initOnce(){
    if(state.initialised) return;
    state.initialised = true;
    // Inject CSS up-front so the very first frame of renderLoading()
    // is fully styled. Previously the CSS was only injected inside
    // render() (after the fetch resolved), which meant the loading
    // hero painted unstyled for ~200–500ms — the "clunky loading"
    // the user reported. Idempotent via the element id.
    ensureMarketingCss();
    refresh();
  }

  // Centralised CSS injection — call from any render-path entry point
  // so even error / loading / empty states get the styles immediately.
  function ensureMarketingCss(){
    if(document.getElementById('_sf_marketing_css')) return;
    var s0 = document.createElement('style');
    s0.id = '_sf_marketing_css';
    s0.textContent = MARKETING_CSS;
    document.head.appendChild(s0);
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
    state.upgradeRequired = false;
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
      // Fire the bg-removal flow lazily after the grid has painted.
      // Idempotent server-side: a no-op when character.transparent is
      // already cached. We don't await it — the marketing tab is
      // usable immediately with the regular character asset (engine
      // falls back), and the cutout streams in for the next render.
      ensureCharacterCutout();
      // Auto-render: when assets are ready AND no kit has any cached
      // render yet, fire renderAll once so first-time users get a
      // populated kit grid without manually clicking Render. Gated on
      // a per-project localStorage flag so we never fire twice (e.g.
      // a user who deletes a render shouldn't trigger a new one).
      maybeAutoRenderAll();
    }).catch(function(err){
      state.loading = false;
      // Surface the upgrade card for plan-gated 403s; treat anything
      // else as a generic error.
      if(err && err.code === 'upgrade_required'){
        state.upgradeRequired = true;
        renderUpgradeRequired(err.plan);
      } else {
        state.error = err && err.message ? err.message : 'Load failed';
        renderError(state.error);
      }
    });
  }

  // ─── Character bg-removal trigger ──────────────────────────────────────────
  //
  // The /api/marketing/character/extract endpoint is idempotent: it
  // returns cached:true when the cutout already exists. We still call
  // it on every workspace activation so a project that's added a
  // character mid-session gets the cutout without a page reload.
  //
  // Toast + readiness-flag flip happens AFTER the call returns so the
  // UI doesn't lie about state. If Replicate is unavailable the
  // workspace continues working with the regular character — engine
  // dispatcher in compose.ts falls back automatically.

  /** Auto-render the whole kit the first time a project becomes
   *  ready (3 base assets present) AND has no cached renders. Gated
   *  on a per-project localStorage flag so it fires exactly once
   *  per project regardless of whether the user later deletes
   *  renders. Runs renderAll() with skipZip=true so the user sees
   *  tiles populating, no surprise download. */
  function maybeAutoRenderAll(){
    var pid = projectId();
    if(!pid) return;
    if(!state.readiness || !isReady(state.readiness)) return;
    // Already auto-fired? Don't re-fire.
    var key = 'sf_mkt_autorendered_' + pid;
    try { if(localStorage.getItem(key) === '1') return; } catch(e){}
    // Anything already rendered? Skip.
    var anyRender = false;
    for(var i = 0; i < (state.kits||[]).length; i++){
      if(((state.kits[i].renders) || []).length > 0){ anyRender = true; break; }
    }
    if(anyRender){
      // Mark flag so a returning user with renders doesn't re-trigger.
      try { localStorage.setItem(key, '1'); } catch(e){}
      return;
    }
    // Mark BEFORE firing so a quick re-init doesn't double-trigger.
    try { localStorage.setItem(key, '1'); } catch(e){}
    if(typeof showToast === 'function'){
      showToast('Auto-rendering your marketing kit — tiles will fill in as they land.');
    }
    // Defer slightly so the page has painted; runExportAll is heavy.
    setTimeout(function(){
      try { runExportAll(null, /*skipZip*/ true); } catch(e){ console.warn('[mkt] auto-render failed', e); }
    }, 600);
  }

  function ensureCharacterCutout(){
    var r = state.readiness || {};
    // Skip when there's no character to extract from, or when the
    // cutout is already in our DB. The kits endpoint's readiness probe
    // populated both flags from generated_assets.
    if(!r.hasCharacter || r.hasCharacterTransparent) return;
    if(ensureCharacterCutout._inflight) return;
    ensureCharacterCutout._inflight = true;

    if(typeof showToast === 'function'){
      showToast('Preparing character art… (one-time, ~5–8s)');
    }

    fetch('/api/marketing/character/extract', {
      method:      'POST',
      credentials: 'same-origin',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ project_id: projectId() }),
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        return { ok: res.ok, status: res.status, body: body };
      });
    }).then(function(r){
      ensureCharacterCutout._inflight = false;
      if(!r.ok){
        // Soft-fail: regular character still renders. 412 = no
        // character asset to extract from (rare race against a delete).
        // 503 = Replicate not configured. Either way the workspace
        // continues; we just don't get the polished cutout.
        var msg = (r.body && r.body.message) || 'Character cutout unavailable';
        if(typeof showToast === 'function') showToast(msg);
        return;
      }
      // Success — flip the readiness flag so the next render uses the
      // cutout. The engine swap is automatic (slot=character.transparent
      // resolves correctly on the very next /api/marketing/render call).
      if(state.readiness) state.readiness.hasCharacterTransparent = true;
      if(typeof showToast === 'function'){
        showToast(r.body && r.body.cached ? 'Character ready' : 'Character cutout ready');
      }
    }).catch(function(err){
      ensureCharacterCutout._inflight = false;
      if(typeof showToast === 'function') showToast('Character cutout failed — using original');
      console.warn('[marketing] character/extract threw:', err);
    });
  }

  // ─── Export-all menu ───────────────────────────────────────────────────────
  //
  // The topbar "Export all kit ▾" button opens a small dropdown anchored
  // to the button. Each option fires a render-all SSE for the chosen
  // category set, then triggers a zip download once everything's
  // rendered (cache hits make the second pass effectively free).

  function openExportMenu(){
    if(!projectId()){
      if(typeof showToast === 'function') showToast('Project not loaded yet');
      return;
    }
    var btn = document.getElementById('mkt-export-btn');
    if(!btn) return;
    // Toggle: clicking the button while the menu is open closes it.
    var existing = document.getElementById('mkt-export-menu');
    if(existing){ existing.remove(); return; }

    // Anchor the menu under the button. Position fixed so it survives
    // any iframe scroll. Built fresh each open so a stale menu can't
    // leak between sessions.
    var rect = btn.getBoundingClientRect();
    var menu = document.createElement('div');
    menu.id = 'mkt-export-menu';
    menu.style.cssText = 'position:fixed;top:'+(rect.bottom+6)+'px;right:'+Math.max(8, window.innerWidth - rect.right)+'px;background:#13131a;border:1px solid #2a2a3a;border-radius:6px;padding:6px;z-index:9999;min-width:240px;box-shadow:0 8px 24px rgba(0,0,0,0.4)';

    // Compute counts so the menu labels are honest about output volume.
    var counts = countRendersByCategory();
    var items = [
      { key: null,                 label: 'All categories',     count: counts.all   },
      { key: ['promo'],            label: 'Promo Screens only', count: counts.promo },
      { key: ['social'],           label: 'Social Assets only', count: counts.social },
      { key: ['store'],            label: 'Store Page only',    count: counts.store },
      { key: ['press'],            label: 'Press Kit only',     count: counts.press },
    ];
    var html = '';
    for(var i = 0; i < items.length; i++){
      var it = items[i];
      if(it.count === 0) continue;
      html += '<button class="mkt-export-item" data-cats="'+(it.key ? it.key.join(',') : '')+'">'
            +   '<span>'+escapeHtml(it.label)+'</span>'
            +   '<span class="mkt-export-count">'+it.count+' files</span>'
            + '</button>';
    }
    menu.innerHTML = html;
    document.body.appendChild(menu);

    // Inject menu CSS once
    if(!document.getElementById('_sf_marketing_menu_css')){
      var s = document.createElement('style');
      s.id = '_sf_marketing_menu_css';
      s.textContent = ''
        + '.mkt-export-item{display:flex;align-items:center;justify-content:space-between;width:100%;padding:9px 12px;font-size:12px;color:#e0deda;background:transparent;border:none;border-radius:4px;cursor:pointer;text-align:left;font-family:inherit}'
        + '.mkt-export-item:hover{background:#1a1a24}'
        + '.mkt-export-count{color:#7a7a94;font-size:10px;font-family:"DM Mono",monospace;margin-left:12px}';
      document.head.appendChild(s);
    }

    menu.addEventListener('click', function(ev){
      var item = ev.target && ev.target.closest && ev.target.closest('.mkt-export-item');
      if(!item) return;
      var cats = item.getAttribute('data-cats');
      var arr  = cats ? cats.split(',') : null;
      menu.remove();
      runExportAll(arr);
    });

    // Outside-click closes
    setTimeout(function(){
      function offClick(e){
        if(!menu.contains(e.target) && e.target !== btn){
          menu.remove();
          document.removeEventListener('click', offClick);
        }
      }
      document.addEventListener('click', offClick);
    }, 0);
  }

  /** Sum of (template × size) pairs for each category, given the
   *  loaded templates catalogue. */
  function countRendersByCategory(){
    var out = { promo: 0, social: 0, store: 0, press: 0, all: 0 };
    var ts = state.templates || [];
    for(var i = 0; i < ts.length; i++){
      var t = ts[i];
      var n = (t.sizes || []).length;
      if(out[t.category] != null) out[t.category] += n;
      out.all += n;
    }
    return out;
  }

  /** Fire the render-all SSE, surface progress as toast updates, then
   *  optionally trigger a zip download once the stream completes. The
   *  render-all stream events update tile thumbnails as they land —
   *  same pipeline as single-template Render.
   *
   *  skipZip=true: just populate the tiles, no download. Used by the
   *  topbar "Render all" button — fastest path to "show me my kit". */
  function runExportAll(categories, skipZip){
    var pid = projectId();
    if(!pid) return;

    if(typeof showToast === 'function') showToast(skipZip ? 'Rendering all tiles…' : 'Rendering kit…');

    fetch('/api/marketing/render-all', {
      method:      'POST',
      credentials: 'same-origin',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ project_id: pid, categories: categories || undefined }),
    }).then(function(res){
      if(!res.ok || !res.body){
        return res.json().catch(function(){ return {}; }).then(function(b){
          var msg = (b && b.message) || (b && b.error) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      }
      var reader  = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf     = '';
      var lastProgressToast = 0;
      var done = 0, total = 0;

      function pump(){
        return reader.read().then(function(chunk){
          if(chunk.done) return;
          buf += decoder.decode(chunk.value, { stream: true });
          var idx;
          while((idx = buf.indexOf('\n\n')) >= 0){
            var raw = buf.slice(0, idx); buf = buf.slice(idx + 2);
            var ev = parseSseBlock(raw);
            if(!ev) continue;
            if(ev.event === 'start'){
              total = ev.data.total;
              if(typeof showToast === 'function') showToast('Rendering 0 / ' + total + '…');
            } else if(ev.event === 'render'){
              // Update tile thumbnail in real time — same path as
              // single-template Render so the grid populates as we go.
              updateTileThumbnail(ev.data.template_id, ev.data.url);
            } else if(ev.event === 'progress'){
              done = ev.data.completed;
              var now = Date.now();
              if(now - lastProgressToast > 1000 && typeof showToast === 'function'){
                lastProgressToast = now;
                showToast('Rendering ' + done + ' / ' + total + '…');
              }
            } else if(ev.event === 'complete'){
              if(typeof showToast === 'function'){
                showToast(skipZip
                  ? ('Rendered ' + done + ' / ' + total + ' — done')
                  : ('Rendered ' + done + ' / ' + total + ' — packaging zip…'));
              }
              // Refresh the kit list so the modal sees fresh renders
              // next time it opens. Best-effort; non-blocking.
              fetchJSON('/api/marketing/kits?project_id=' + encodeURIComponent(pid))
                .then(function(r){
                  state.kits      = (r && r.kits)      || state.kits;
                  state.readiness = (r && r.readiness) || state.readiness;
                }).catch(function(){});
              if(!skipZip){
                // Trigger the zip download via an invisible anchor.
                var a = document.createElement('a');
                var qs = 'project_id=' + encodeURIComponent(pid);
                a.href     = '/api/marketing/zip?' + qs;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }
            } else if(ev.event === 'error'){
              if(typeof showToast === 'function') showToast(ev.data.message || 'Render error');
            }
          }
          return pump();
        });
      }
      return pump();
    }).catch(function(err){
      if(typeof showToast === 'function') showToast(err.message || 'Export failed');
    });
  }

  // ─── Rendering ─────────────────────────────────────────────────────────────

  function grid(){ return document.getElementById('mkt-grid'); }

  function renderLoading(){
    var el = grid();
    if(!el) return;
    // Defensive: if refresh() was kicked before initOnce (e.g. a future
    // caller) the CSS may not be present yet — inject before painting.
    ensureMarketingCss();
    // Premium loading state — centered hero card with gold-accent
    // pulsing rings + pithy copy. Replaces the earlier skeleton-tile
    // grid that read as "the page is half-broken". The loading state
    // only flashes briefly (under 500ms in the warm-cache case);
    // skeleton tiles previously suggested permanent structure that
    // never arrived for the empty-state path.
    el.innerHTML = ''
      + '<div class="mkt-loading-hero">'
      +   '<div class="mkt-loading-rings">'
      +     '<span class="mkt-loading-ring"></span>'
      +     '<span class="mkt-loading-ring mkt-loading-ring-2"></span>'
      +     '<span class="mkt-loading-ring mkt-loading-ring-3"></span>'
      +     '<span class="mkt-loading-glyph">✦</span>'
      +   '</div>'
      +   '<div class="mkt-loading-eyebrow">Marketing Kit</div>'
      +   '<div class="mkt-loading-title">Reading your project</div>'
      +   '<div class="mkt-loading-sub">Loading templates, asset readiness, and your previous renders…</div>'
      + '</div>';
  }

  function renderError(msg){
    var el = grid();
    if(!el) return;
    el.innerHTML = '<div style="padding:24px;color:#c97a7a;font-size:12px">'+escapeHtml(msg)+'</div>';
  }

  /** Plan-gate upsell. Shows the locked feature, the two unlocking
   *  tiers, and a CTA that takes the user to billing. We render this
   *  inside the iframe rather than redirecting the parent because the
   *  user might want to tab back without losing canvas state. */
  function renderUpgradeRequired(currentPlan){
    var el = grid();
    if(!el) return;
    var planLabel = (currentPlan ? String(currentPlan) : 'Free').replace(/^\w/, function(c){ return c.toUpperCase(); });
    el.innerHTML = ''
      + '<div class="mkt-upgrade">'
      +   '<div class="mkt-upgrade-eyebrow">Marketing Workspace</div>'
      +   '<div class="mkt-upgrade-title">Unlock the marketing kit</div>'
      +   '<div class="mkt-upgrade-sub">Generate ~32 ready-to-ship marketing creatives from your existing game art — lobby tiles, social posts, store creatives, press one-pager. No additional credits charged; everything composes from your already-generated assets.</div>'
      +   '<div class="mkt-upgrade-current">You\'re on <b>'+escapeHtml(planLabel)+'</b>. Upgrade to <b>Freelancer</b> or <b>Studio</b> to enable.</div>'
      +   '<div class="mkt-upgrade-actions">'
      +     '<a class="mkt-tile-btn primary" href="javascript:void(0)" onclick="if(window.parent)window.parent.location.href=\'/settings/billing\'">View plans →</a>'
      +     '<button class="mkt-tile-btn" type="button" onclick="if(typeof switchWorkspace===\'function\')switchWorkspace(\'canvas\')">Back to canvas</button>'
      +   '</div>'
      + '</div>';

    // Inject upgrade-card styles once.
    if(!document.getElementById('_sf_marketing_upgrade_css')){
      var s = document.createElement('style');
      s.id = '_sf_marketing_upgrade_css';
      s.textContent = ''
        + '.mkt-upgrade{padding:48px;max-width:560px}'
        + '.mkt-upgrade-eyebrow{font-size:10px;color:#7a7a94;font-family:"DM Mono",monospace;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px}'
        + '.mkt-upgrade-title{font-size:24px;color:#e8e6e2;font-weight:600;margin-bottom:14px;letter-spacing:-0.01em}'
        + '.mkt-upgrade-sub{font-size:13px;color:#a0a0b0;line-height:1.6;margin-bottom:18px}'
        + '.mkt-upgrade-current{font-size:12px;color:#c9a84c;background:#1a1a24;border:1px solid #2a2a3a;border-radius:6px;padding:10px 14px;margin-bottom:20px}'
        + '.mkt-upgrade-actions{display:flex;gap:8px;flex-wrap:wrap}'
        + '.mkt-upgrade-actions .mkt-tile-btn{flex:0 0 auto;padding:9px 18px}';
      document.head.appendChild(s);
    }
  }

  function render(){
    var el = grid();
    if(!el) return;

    // Inject styles BEFORE any branch — the readiness empty state and
    // the legacy GDD card both rely on the .mkt-section / .mkt-tile
    // styles. ensureMarketingCss() is also called from initOnce() and
    // renderLoading() so styles are present from the very first paint;
    // calling here too keeps the call-site explicit and idempotent.
    ensureMarketingCss();

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

    // First-visit welcome hint — when the kit is unlocked + assets are
    // ready but the user has never rendered anything. Disappears as
    // soon as a single kit lands. We check kits.length AND that none
    // of them have renders, so a returning user with stale empty kit
    // rows still sees the hint.
    var hasAnyRender = false;
    for(var ki = 0; ki < (state.kits||[]).length; ki++){
      if(((state.kits[ki].renders) || []).length > 0){ hasAnyRender = true; break; }
    }
    if(!hasAnyRender){
      html += ''
        + '<div class="mkt-welcome">'
        +   '<div class="mkt-welcome-icon">✨</div>'
        +   '<div>'
        +     '<div class="mkt-welcome-title">Your kit is ready to render</div>'
        +     '<div class="mkt-welcome-sub">Click <b>Render</b> on any tile to compose it from your project assets, or <b>Export all kit</b> in the topbar to ship the full set in one zip.</div>'
        +   '</div>'
        + '</div>';
    }

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

    // v124-fix: always start with the empty placeholder. The original
    // code rendered <img src=previewPath onerror=display:none> which
    // left a hidden element in place; subsequent thumbnail swaps then
    // updated the hidden img and the user never saw the render. Day 8
    // polish ships hand-rendered preview PNGs and re-introduces the
    // previewPath path with proper fallback.
    var preview = '<div class="mkt-tile-preview-slot"></div>';

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

  /** Premium empty-state for new projects without the three required
   *  base assets. A hero card with gold accent, three asset cards
   *  showing their status, and a strong CTA into the Art workspace.
   *  All styles live in MARKETING_CSS under .mkt-onboard*. */
  function renderReadinessEmpty(r){
    var assetCards = [
      { key: 'bg',   label: 'Background',  hint: 'The base-game scene',   ok: !!r.hasBackground, icon: '🏞' },
      { key: 'logo', label: 'Logo',         hint: 'Your game wordmark',    ok: !!r.hasLogo,       icon: '✦'  },
      { key: 'char', label: 'Character',    hint: 'Hero figure',           ok: !!r.hasCharacter,  icon: '🦸' },
    ];
    var doneCount = assetCards.filter(function(c){ return c.ok; }).length;

    var cardsHtml = assetCards.map(function(c){
      // Pre-compute the status badge so the chained-string concat
      // below stays a single expression — the leading-`+` pattern
      // breaks JS when wrapped around a multi-line conditional.
      var statusHtml = c.ok
        ? '<span class="mkt-onboard-tick" title="Ready">✓</span>'
        : '<span class="mkt-onboard-pending" title="Not yet">●</span>';
      return ''
        + '<div class="mkt-onboard-card ' + (c.ok ? 'is-done' : 'is-pending') + '">'
        +   '<div class="mkt-onboard-card-icon">' + c.icon + '</div>'
        +   '<div class="mkt-onboard-card-meta">'
        +     '<div class="mkt-onboard-card-title">' + escapeHtml(c.label) + '</div>'
        +     '<div class="mkt-onboard-card-hint">'  + escapeHtml(c.hint)  + '</div>'
        +   '</div>'
        +   '<div class="mkt-onboard-card-status">' + statusHtml + '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<div class="mkt-onboard">'
      +   '<div class="mkt-onboard-hero">'
      +     '<div class="mkt-onboard-eyebrow">Marketing kit · Setup</div>'
      +     '<div class="mkt-onboard-title">Three assets unlock your kit</div>'
      +     '<div class="mkt-onboard-sub">Once your background, logo, and character are generated in the Art workspace, this view fills with renderable templates — lobby tiles, social posts, store pages, and more.</div>'
      +     '<div class="mkt-onboard-progress">'
      +       '<div class="mkt-onboard-progress-fill" style="width:' + Math.round((doneCount/3)*100) + '%"></div>'
      +     '</div>'
      +     '<div class="mkt-onboard-progress-text">' + doneCount + ' of 3 ready</div>'
      +   '</div>'
      +   '<div class="mkt-onboard-cards">' + cardsHtml + '</div>'
      +   '<div class="mkt-onboard-cta">'
      +     '<button class="mkt-onboard-btn" onclick="if(typeof switchWorkspace===\'function\')switchWorkspace(\'assets\')">'
      +       'Generate in Art workspace <span style="margin-left:6px">→</span>'
      +     '</button>'
      +   '</div>'
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

    var t = findTemplate(tid);
    if(!t){
      if(typeof showToast === 'function') showToast('Template not found: ' + tid);
      return;
    }

    if(act === 'customise'){
      openCustomiseModal(t);
      return;
    }
    if(act === 'render'){
      // Quick-render from the grid: every size, current saved vars, no
      // prompts. The Customise modal is for fine-tuning; this button is
      // for "give me the full set right now". Renders sequentially via
      // SSE so the toast can show progress.
      runRender(t, t.sizes.map(function(s){ return s.label; }), null, /*toastOnly*/ true);
      return;
    }
  }

  function findTemplate(id){
    if(!state.templates) return null;
    for(var i = 0; i < state.templates.length; i++){
      if(state.templates[i].id === id) return state.templates[i];
    }
    return null;
  }

  function findKit(templateId){
    if(!state.kits) return null;
    for(var i = 0; i < state.kits.length; i++){
      if(state.kits[i].template_id === templateId) return state.kits[i];
    }
    return null;
  }

  // ─── Customise modal ───────────────────────────────────────────────────────
  //
  // Built on demand: the modal markup is appended to <body> the first
  // time the user clicks Customise, then reused. State (current vars
  // + selected sizes) lives in modalState; the form is the source of
  // truth — Save reads .value off each input and posts it.

  var modalState = { templateId: null };

  function openCustomiseModal(template){
    ensureModal();
    modalState.templateId = template.id;

    // Seed form values from the kit's stored vars (or template defaults).
    var kit  = findKit(template.id);
    var vars = (kit && kit.vars) || {};
    var schema = template.vars || {};

    // Title + sizes summary
    document.getElementById('mkt-modal-title').textContent     = template.name || template.id;
    document.getElementById('mkt-modal-subtitle').textContent  = template.id;

    // Build the form body fresh on every open so a template change
    // doesn't leak inputs between sessions.
    var body = document.getElementById('mkt-modal-form');

    // Character toggle — only meaningful if the project has a character
    // asset. The readiness probe ran on first /kits load; we re-use it
    // here so the control hides for projects that don't have one
    // (avoids a confusing UX where toggling does nothing).
    var hasChar  = !!(state.readiness && state.readiness.hasCharacter);
    var charOn   = (typeof vars.includeCharacter === 'boolean') ? vars.includeCharacter : true;

    var overrides = (vars.layerOverrides && typeof vars.layerOverrides === 'object') ? vars.layerOverrides : {};

    // Determine which slots this template actually uses — show position
    // controls only for those, so e.g. a template with no character
    // layer doesn't show character sliders.
    var usedSlots = collectUsedSlots(template);

    // Form is intentionally lean — language / colorMode / layoutVariant
    // were exposed in earlier iterations but didn't deliver visible
    // value to the user (most templates don't have multi-language CTA
    // strings or A/B/C layouts authored). They're still in the saved
    // vars (with defaults) so server-side resolveVars sees them; we
    // just don't ask the user. Future v1.1 brings back layoutVariant
    // when more templates ship variants.
    body.innerHTML = ''
      + formField('gameName',      'Game name',      'text',
          pickStr(vars.gameName, ''))
      + formField('headline',      'Headline',       'text',
          pickStr(vars.headline, ''),
          'Optional — leave blank for templates that don\'t use a headline.')
      + formField('subhead',       'Subhead',        'text',
          pickStr(vars.subhead, ''),
          'Optional — short tagline below the headline.')
      + formSelect('ctaText',      'Call to action',
          (schema.ctaText && schema.ctaText.options) || ['PLAY NOW'],
          pickStr(vars.ctaText, schema.ctaText ? schema.ctaText.default : 'PLAY NOW'))
      + (hasChar ? formCheckbox('includeCharacter', 'Include character', charOn,
          'Hides the hero figure when a tighter layout reads better.') : '')
      + renderPositionControls(usedSlots, overrides, hasChar);

    // Size checkboxes — default all selected.
    var sizesHtml = '<div class="mkt-form-label">Sizes</div><div class="mkt-form-sizes">';
    for(var i = 0; i < template.sizes.length; i++){
      var s = template.sizes[i];
      var lbl = (s.w === s.h ? (s.w + '²') : (s.w + '×' + s.h)) + ' ' + (s.format||'').toUpperCase();
      sizesHtml += ''
        + '<label class="mkt-form-size">'
        +   '<input type="checkbox" data-size="'+escapeAttr(s.label)+'" checked>'
        +   '<span>'+escapeHtml(lbl)+'</span>'
        + '</label>';
    }
    sizesHtml += '</div>';
    body.insertAdjacentHTML('beforeend', sizesHtml);

    // Restore the user's previously-rendered creatives if any. The
    // /kits endpoint already shipped them on initial load — reuse the
    // cached list rather than firing another request.
    var preview = document.getElementById('mkt-modal-preview');
    var results = document.getElementById('mkt-modal-results');
    // Dedupe defensively in case an older /kits response still has
    // multiple rows per (size, format) — same logic the server now
    // applies, mirrored client-side so a stale cache doesn't show
    // 9 entries for a 3-size template.
    var existing = dedupeRenders((kit && kit.renders) || []);
    // Reset previewMeta — the seed below restores it from persisted
    // bboxes if any cached render carries them.
    previewMeta = null;
    if(existing.length > 0){
      // Show the biggest as the live preview
      var biggest = pickBiggestExisting(existing, template);
      if(biggest){
        // Seed previewMeta from the persisted bboxes BEFORE showPreview
        // so renderPreviewHandles paints the drag overlay on the very
        // first paint. Older renders (pre-layer_boxes column) ship an
        // empty array; modal silently falls back to the "render once"
        // hint in that case.
        if(biggest.layer_boxes && biggest.layer_boxes.length && biggest.width && biggest.height){
          previewMeta = {
            templateId: template.id,
            width:      biggest.width,
            height:     biggest.height,
            boxes:      biggest.layer_boxes,
          };
        }
        if(preview) showPreview(biggest);
      }
      // Populate the results list with download links
      if(results){
        results.innerHTML = '';
        for(var ri = 0; ri < existing.length; ri++){
          results.insertAdjacentHTML('beforeend', renderResultLine({
            size_label: existing[ri].size_label,
            format:     existing[ri].format,
            url:        existing[ri].url,
            cached:     true,
          }));
        }
      }
    } else {
      if(preview) preview.innerHTML = '<div class="mkt-modal-preview-empty">Click <b>Render selected sizes</b> to see your kit</div>';
      if(results) results.innerHTML = '';
    }

    document.getElementById('mkt-modal-overlay').style.display = 'flex';
  }

  function pickBiggestExisting(renders, template){
    var best = null, bestArea = -1;
    for(var i = 0; i < renders.length; i++){
      var s = findSizeByLabel(template, renders[i].size_label);
      if(!s) continue;
      var a = s.w * s.h;
      if(a > bestArea){ bestArea = a; best = renders[i]; }
    }
    return best || renders[0];
  }

  /** Keep only the most recent render per (size_label, format). The
   *  /kits endpoint already dedupes server-side; this is belt-and-
   *  braces against a stale older response or any future caller that
   *  forgets. Assumes input is roughly recent-first; falls back
   *  cleanly otherwise (a duplicate keeps whichever showed up first). */
  function dedupeRenders(renders){
    var seen = {};
    var out  = [];
    for(var i = 0; i < renders.length; i++){
      var r = renders[i];
      var key = r.size_label + '::' + r.format;
      if(seen[key]) continue;
      seen[key] = 1;
      out.push(r);
    }
    return out;
  }

  function closeCustomiseModal(){
    var ov = document.getElementById('mkt-modal-overlay');
    if(ov) ov.style.display = 'none';
    modalState.templateId = null;
  }

  function ensureModal(){
    if(document.getElementById('mkt-modal-overlay')) return;

    // Inject styles
    if(!document.getElementById('_sf_marketing_modal_css')){
      var s = document.createElement('style');
      s.id = '_sf_marketing_modal_css';
      s.textContent = MODAL_CSS;
      document.head.appendChild(s);
    }

    var html = ''
      + '<div id="mkt-modal-overlay" style="display:none">'
      +   '<div id="mkt-modal">'
      +     '<div id="mkt-modal-header">'
      +       '<div>'
      +         '<div id="mkt-modal-title">Customise</div>'
      +         '<div id="mkt-modal-subtitle"></div>'
      +       '</div>'
      +       '<button id="mkt-modal-close" title="Close (Esc)">×</button>'
      +     '</div>'
      +     '<div id="mkt-modal-body">'
      +       '<div id="mkt-modal-left">'
      +         '<form id="mkt-modal-form" autocomplete="off"></form>'
      +         '<div id="mkt-modal-actions">'
      +           '<button class="mkt-tile-btn"         id="mkt-modal-save"   type="button">Save</button>'
      +           '<button class="mkt-tile-btn primary" id="mkt-modal-render" type="button">Render selected sizes</button>'
      +         '</div>'
      +       '</div>'
      +       '<div id="mkt-modal-right">'
      +         '<div id="mkt-modal-preview"></div>'
      +         '<div id="mkt-modal-progress"></div>'
      +         '<div id="mkt-modal-results"></div>'
      +       '</div>'
      +     '</div>'
      +   '</div>'
      + '</div>';
    document.body.insertAdjacentHTML('beforeend', html);

    // Wiring
    document.getElementById('mkt-modal-close').addEventListener('click', closeCustomiseModal);
    document.getElementById('mkt-modal-overlay').addEventListener('click', function(e){
      if(e.target && e.target.id === 'mkt-modal-overlay') closeCustomiseModal();
    });
    document.addEventListener('keydown', function(e){
      if(e.key === 'Escape'){
        var ov = document.getElementById('mkt-modal-overlay');
        if(ov && ov.style.display === 'flex') closeCustomiseModal();
      }
    });
    document.getElementById('mkt-modal-save').addEventListener('click',   onModalSave);
    document.getElementById('mkt-modal-render').addEventListener('click', onModalRender);

    // Live preview: re-render on slider change (debounced) so the user
    // sees the asset move without clicking Render. The smallest size
    // is used to keep the round-trip snappy. Cache hits make repeated
    // tweaks near-instant once a vars combo has been seen.
    var form = document.getElementById('mkt-modal-form');
    if(form){
      form.addEventListener('input', function(e){
        var el = e.target;
        if(!el) return;
        // Update the slider's value label live (no debounce — it's UI).
        if(el.getAttribute && el.getAttribute('data-pos-field')){
          var row    = el.closest('.mkt-pos-row');
          var label  = el.parentNode.querySelector('.mkt-pos-slider-value');
          if(label) label.textContent = formatPosValue(el.getAttribute('data-pos-field'), el.value);
          schedulePreviewRefresh();
          return;
        }
        // Other form inputs (selects, text, checkboxes) also feed live
        // preview — composite changes (colorMode, language, ctaText)
        // matter as much as positioning.
        if(el.tagName === 'SELECT' || el.type === 'checkbox'){
          schedulePreviewRefresh();
        }
      });
      form.addEventListener('click', function(e){
        var btn = e.target && e.target.closest && e.target.closest('[data-act="pos-reset"]');
        if(!btn) return;
        var row = btn.closest('.mkt-pos-row');
        if(!row) return;
        // Zero out this row's three sliders + their labels.
        var sliders = row.querySelectorAll('input[data-pos-field]');
        for(var i = 0; i < sliders.length; i++){
          var f = sliders[i].getAttribute('data-pos-field');
          var def = (f === 'scale') ? 1 : 0;
          sliders[i].value = def;
          var lbl = sliders[i].parentNode.querySelector('.mkt-pos-slider-value');
          if(lbl) lbl.textContent = formatPosValue(f, def);
        }
        schedulePreviewRefresh();
      });
    }
  }

  // ─── Live preview / drag state ────────────────────────────────────────────
  //
  // previewMeta holds the most recent render's pixel-space metadata so
  // the drag handler can map mouse coordinates back to canvas-relative
  // dx/dy overrides.
  //
  // Shape:
  //   {
  //     templateId: 'promo.square_lobby_tile',
  //     width:  256,
  //     height: 256,
  //     boxes:  [{ slot, x, y, w, h }, ...],
  //   }
  //
  // The boxes array reflects the LAST fresh render (cache misses
  // bring fresh boxes; cache hits leave the array untouched so drag
  // still works against the previously-captured set). updatePreviewMeta
  // is called from the SSE 'render' handler.

  var previewMeta  = null;
  var previewTimer = null;

  function schedulePreviewRefresh(){
    if(previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(runPreviewRefresh, 350);
  }

  function runPreviewRefresh(){
    previewTimer = null;
    var tid = modalState.templateId;
    if(!tid) return;
    var template = findTemplate(tid);
    if(!template) return;
    // Pick the smallest size for preview — cheapest to render and good
    // enough at the modal preview pane's display size. The Render
    // button still ships the full size set when clicked.
    var smallest = template.sizes[0];
    for(var i = 1; i < template.sizes.length; i++){
      if(template.sizes[i].w * template.sizes[i].h < smallest.w * smallest.h){
        smallest = template.sizes[i];
      }
    }
    var vars = readModalVars();
    runRender(template, [smallest.label], vars, /*toastOnly*/ false);
  }

  // ─── Form helpers ──────────────────────────────────────────────────────────

  function formField(name, label, type, value, hint){
    return ''
      + '<div class="mkt-form-row">'
      +   '<label class="mkt-form-label" for="mkt-f-'+name+'">'+escapeHtml(label)+'</label>'
      +   '<input class="mkt-form-input" id="mkt-f-'+name+'" name="'+name+'" type="'+type+'" value="'+escapeAttr(value)+'">'
      +   (hint ? '<div class="mkt-form-hint">'+escapeHtml(hint)+'</div>' : '')
      + '</div>';
  }

  function formSelect(name, label, options, value){
    var opts = '';
    for(var i = 0; i < options.length; i++){
      var o = options[i];
      opts += '<option value="'+escapeAttr(o)+'"'+(o === value ? ' selected' : '')+'>'+escapeHtml(o)+'</option>';
    }
    return ''
      + '<div class="mkt-form-row">'
      +   '<label class="mkt-form-label" for="mkt-f-'+name+'">'+escapeHtml(label)+'</label>'
      +   '<select class="mkt-form-input" id="mkt-f-'+name+'" name="'+name+'">'+opts+'</select>'
      + '</div>';
  }

  /** Walk the template's layer stack and return the unique set of
   *  AssetSlot values it uses. Drives which "Position" sliders the
   *  modal renders — no point showing character controls on a template
   *  that doesn't draw the character. */
  function collectUsedSlots(template){
    var seen = {};
    var out  = [];
    if(!template || !template.layers) return out;
    for(var i = 0; i < template.layers.length; i++){
      var L = template.layers[i];
      if(L && L.type === 'asset' && L.slot && !seen[L.slot]){
        seen[L.slot] = 1;
        out.push(L.slot);
      }
    }
    return out;
  }

  /** Per-slot Scale slider only. X/Y position is now drag-on-preview
   *  (see attachPreviewDrag) so we don't surface dx/dy sliders. The
   *  hidden dx/dy values are read out of state by readModalVars. */
  function renderPositionControls(slots, overrides, hasChar){
    if(!slots || slots.length === 0) return '';
    var SLOT_LABELS = {
      background_base:           'Background',
      logo:                       'Logo',
      character:                  'Character',
      'character.transparent':    'Character',
    };
    // Collapse character + character.transparent into one row — they
    // share the same on-screen position from the user's POV.
    var displayed = [];
    var seenChar  = false;
    for(var i = 0; i < slots.length; i++){
      var s = slots[i];
      if(s === 'character' || s === 'character.transparent'){
        if(seenChar) continue;
        seenChar = true;
        displayed.push({ key: 'character', label: 'Character', hidden: !hasChar });
      } else if(s === 'background_base'){
        // Background is fit:cover; resizing or moving it leaves
        // visible canvas. Leave it out of the controls — users who
        // want a different background regenerate the asset itself.
        continue;
      } else {
        displayed.push({ key: s, label: SLOT_LABELS[s] || s, hidden: false });
      }
    }
    if(displayed.length === 0) return '';

    var html = ''
      + '<div class="mkt-form-section-title">Positioning</div>'
      + '<div class="mkt-form-hint" style="margin:-4px 0 10px">Drag any asset on the preview, or use sliders for precise control. Reset reverts to template defaults.</div>';
    for(var j = 0; j < displayed.length; j++){
      var item = displayed[j];
      if(item.hidden) continue;
      var ov = (overrides && overrides[item.key]) || {};
      var dx = (typeof ov.dx === 'number') ? ov.dx : 0;
      var dy = (typeof ov.dy === 'number') ? ov.dy : 0;
      var sc = (typeof ov.scale === 'number') ? ov.scale : 1;
      html += ''
        + '<div class="mkt-pos-row" data-pos-slot="'+escapeAttr(item.key)+'">'
        +   '<div class="mkt-pos-head">'
        +     '<span class="mkt-pos-label">'+escapeHtml(item.label)+'</span>'
        +     '<button type="button" class="mkt-pos-reset" data-act="pos-reset">Reset</button>'
        +   '</div>'
        // Drag-on-preview writes to these same dx/dy inputs — they stay
        // in sync. Sliders are now the primary mechanism since drag
        // depends on bbox metadata that's flaky on cache-hit renders.
        +   posSlider('dx',    'X',     dx, -1, 1, 0.01)
        +   posSlider('dy',    'Y',     dy, -1, 1, 0.01)
        +   posSlider('scale', 'Scale', sc, 0.25, 2.5, 0.05)
        + '</div>';
    }
    return html;
  }

  function posSlider(field, label, value, min, max, step){
    return ''
      + '<div class="mkt-pos-slider">'
      +   '<span class="mkt-pos-slider-label">'+escapeHtml(label)+'</span>'
      +   '<input type="range" data-pos-field="'+field+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'">'
      +   '<span class="mkt-pos-slider-value">'+formatPosValue(field, value)+'</span>'
      + '</div>';
  }

  function formatPosValue(field, value){
    if(field === 'scale') return (Number(value) || 1).toFixed(2) + '×';
    return ((Number(value) || 0) * 100).toFixed(0) + '%';
  }

  /** Inline-style checkbox row. Read back as a boolean by readModalVars
   *  via the data-bool attribute (input.value on a checkbox is always
   *  "on" / "" — useless; need .checked). */
  function formCheckbox(name, label, value, hint){
    return ''
      + '<div class="mkt-form-row">'
      +   '<label class="mkt-form-checkbox">'
      +     '<input type="checkbox" name="'+name+'" data-bool="1"'+(value ? ' checked' : '')+'>'
      +     '<span>'+escapeHtml(label)+'</span>'
      +   '</label>'
      +   (hint ? '<div class="mkt-form-hint">'+escapeHtml(hint)+'</div>' : '')
      + '</div>';
  }

  function readModalVars(){
    var form = document.getElementById('mkt-modal-form');
    if(!form) return {};
    var out = {};
    var inputs = form.querySelectorAll('input[name], select[name]');
    for(var i = 0; i < inputs.length; i++){
      var el = inputs[i];
      // Booleans (checkboxes) need .checked; everything else uses .value.
      // Skipped: the per-size checkboxes inside .mkt-form-sizes — those
      // have data-size, not name, so the name-selector ignores them.
      if(el.getAttribute('data-bool') === '1'){
        out[el.name] = !!el.checked;
      } else {
        out[el.name] = el.value;
      }
    }
    // Assemble layerOverrides from the per-slot slider rows. Empty
    // entries (all three sliders at default) are stripped server-side
    // so the cache stays stable when a user nudges then resets.
    var posRows = form.querySelectorAll('.mkt-pos-row');
    var overrides = {};
    for(var p = 0; p < posRows.length; p++){
      var row  = posRows[p];
      var slot = row.getAttribute('data-pos-slot');
      if(!slot) continue;
      var dx = parseFloat(row.querySelector('input[data-pos-field="dx"]').value)    || 0;
      var dy = parseFloat(row.querySelector('input[data-pos-field="dy"]').value)    || 0;
      var sc = parseFloat(row.querySelector('input[data-pos-field="scale"]').value) || 1;
      var entry = {};
      if(dx !== 0) entry.dx = dx;
      if(dy !== 0) entry.dy = dy;
      if(sc !== 1) entry.scale = sc;
      // Special case: the engine treats character + character.transparent
      // as the same on-screen layer, so we mirror the override to both
      // slot keys. Either layer wins on draw — the override applies
      // identically.
      if(Object.keys(entry).length){
        overrides[slot] = entry;
        if(slot === 'character') overrides['character.transparent'] = entry;
      }
    }
    out.layerOverrides = overrides;
    return out;
  }

  function readModalSizes(){
    var form = document.getElementById('mkt-modal-form');
    if(!form) return [];
    var boxes = form.querySelectorAll('input[type=checkbox][data-size]');
    var out = [];
    for(var i = 0; i < boxes.length; i++){
      if(boxes[i].checked) out.push(boxes[i].getAttribute('data-size'));
    }
    return out;
  }

  // ─── Modal actions ─────────────────────────────────────────────────────────

  function onModalSave(){
    var tid = modalState.templateId;
    if(!tid) return;
    var vars = readModalVars();
    var btn  = document.getElementById('mkt-modal-save');
    btn.disabled = true; btn.textContent = 'Saving…';

    fetch('/api/marketing/kits/' + encodeURIComponent(tid), {
      method:      'PUT',
      credentials: 'same-origin',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ project_id: projectId(), vars: vars }),
    }).then(function(r){
      btn.disabled = false; btn.textContent = 'Save';
      if(!r.ok){ if(typeof showToast === 'function') showToast('Save failed'); return; }
      if(typeof showToast === 'function') showToast('Saved');
      // Refresh the in-memory kit list so future opens reflect the new vars
      // without a full /kits round-trip.
      r.json().then(function(b){
        if(b && b.kit){
          var idx = -1;
          for(var i = 0; i < (state.kits||[]).length; i++){
            if(state.kits[i].template_id === b.kit.template_id){ idx = i; break; }
          }
          if(idx >= 0) state.kits[idx] = b.kit;
          else (state.kits = state.kits || []).push(b.kit);
        }
      }).catch(function(){});
    }).catch(function(){
      btn.disabled = false; btn.textContent = 'Save';
      if(typeof showToast === 'function') showToast('Save failed');
    });
  }

  function onModalRender(){
    var tid = modalState.templateId;
    if(!tid) return;
    var template = findTemplate(tid);
    if(!template) return;
    var sizes = readModalSizes();
    if(sizes.length === 0){
      if(typeof showToast === 'function') showToast('Pick at least one size');
      return;
    }
    var vars = readModalVars();
    runRender(template, sizes, vars, /*toastOnly*/ false);
  }

  // ─── Render trigger ────────────────────────────────────────────────────────
  //
  // POST /api/marketing/render returns SSE. We use fetch+ReadableStream
  // (rather than EventSource) so we can POST a body — EventSource is
  // GET-only. The parser handles event:/data: lines and dispatches to
  // onEvent.

  function runRender(template, sizeLabels, varsOverride, toastOnly){
    var btn = document.getElementById('mkt-modal-render');
    if(btn && !toastOnly){ btn.disabled = true; btn.textContent = 'Rendering…'; }

    var preview = document.getElementById('mkt-modal-preview');
    var prog    = document.getElementById('mkt-modal-progress');
    var results = document.getElementById('mkt-modal-results');

    // Per-tile feedback for grid-Render. Modal Render has its own
    // progress UI inside the modal so the tile state is redundant
    // there; we still flip it so a user who closes the modal
    // mid-render still sees the tile spinning.
    setTileRendering(template.id, true);

    if(!toastOnly){
      if(preview) preview.innerHTML = '';
      if(prog)    prog.textContent  = 'Starting…';
      if(results) results.innerHTML = '';
    } else {
      if(typeof showToast === 'function') showToast('Rendering ' + template.id + '…');
    }

    var body = { project_id: projectId(), template_id: template.id, size_labels: sizeLabels };
    if(varsOverride) body.vars = varsOverride;

    fetch('/api/marketing/render', {
      method:      'POST',
      credentials: 'same-origin',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify(body),
    }).then(function(res){
      if(!res.ok || !res.body){
        return res.json().catch(function(){ return {}; }).then(function(b){
          var msg = (b && b.message) || (b && b.error) || ('HTTP ' + res.status);
          throw new Error(msg);
        });
      }
      var reader  = res.body.getReader();
      var decoder = new TextDecoder('utf-8');
      var buf     = '';
      var rendersBySize = {};
      var doneSizes = 0;
      var totalSizes = sizeLabels.length;

      function pump(){
        return reader.read().then(function(chunk){
          if(chunk.done){
            // Stream closed — finalise UI
            if(btn && !toastOnly){ btn.disabled = false; btn.textContent = 'Render selected sizes'; }
            setTileRendering(template.id, false);
            return;
          }
          buf += decoder.decode(chunk.value, { stream: true });
          // Parse complete SSE events ("event:foo\ndata:{...}\n\n")
          var idx;
          while((idx = buf.indexOf('\n\n')) >= 0){
            var raw = buf.slice(0, idx);
            buf     = buf.slice(idx + 2);
            var ev = parseSseBlock(raw);
            if(ev) onEvent(ev);
          }
          return pump();
        });
      }

      function onEvent(ev){
        if(ev.event === 'start'){
          if(prog && !toastOnly) prog.textContent = '0 / ' + ev.data.total + ' rendered';
          totalSizes = ev.data.total || totalSizes;
        } else if(ev.event === 'render'){
          rendersBySize[ev.data.size_label] = ev.data;
          doneSizes++;
          if(prog && !toastOnly) prog.textContent = doneSizes + ' / ' + totalSizes + ' rendered' + (ev.data.cached ? ' (cached)' : '');
          if(preview && !toastOnly){
            // Preview = the largest finished size (visually most useful)
            var biggest = pickBiggest(rendersBySize, template);
            if(biggest){
              showPreview(biggest);
            }
          }
          // Capture bbox metadata when we got a fresh render — cache
          // hits ship empty layer_boxes (engine wasn't run); preserve
          // the last set so drag stays functional.
          if(ev.data.layer_boxes && ev.data.layer_boxes.length){
            previewMeta = {
              templateId: template.id,
              width:      ev.data.width  || (findSizeByLabel(template, ev.data.size_label) || {}).w,
              height:     ev.data.height || (findSizeByLabel(template, ev.data.size_label) || {}).h,
              boxes:      ev.data.layer_boxes,
            };
          }
          // Update tile thumbnail in the grid in real time so the user
          // sees their kit start to populate even before they close the
          // modal.
          updateTileThumbnail(template.id, ev.data.url);
          // Append a download link to the results list
          if(results && !toastOnly){
            results.insertAdjacentHTML('beforeend', renderResultLine(ev.data));
          }
        } else if(ev.event === 'error'){
          var msg = (ev.data && ev.data.message) || 'Render failed';
          if(prog && !toastOnly) prog.textContent = msg;
          if(typeof showToast === 'function' && toastOnly) showToast(msg);
        } else if(ev.event === 'complete'){
          if(prog && !toastOnly) prog.textContent = (ev.data.renders || []).length + ' rendered · done';
          if(toastOnly && typeof showToast === 'function') showToast('Rendered ' + (ev.data.renders||[]).length + ' size(s)');
        }
      }

      return pump();
    }).catch(function(err){
      if(btn && !toastOnly){ btn.disabled = false; btn.textContent = 'Render selected sizes'; }
      setTileRendering(template.id, false);
      if(prog && !toastOnly) prog.textContent = err.message || 'Render failed';
      if(typeof showToast === 'function') showToast(err.message || 'Render failed');
    });
  }

  function parseSseBlock(raw){
    var lines = raw.split('\n');
    var event = 'message', data = '';
    for(var i = 0; i < lines.length; i++){
      var line = lines[i];
      if(line.indexOf('event:') === 0) event = line.slice(6).trim();
      else if(line.indexOf('data:') === 0) data += line.slice(5).trim();
    }
    if(!data) return null;
    try { return { event: event, data: JSON.parse(data) }; }
    catch(_){ return null; }
  }

  function pickBiggest(rendersBySize, template){
    var best = null, bestArea = -1;
    for(var k in rendersBySize){
      if(!Object.prototype.hasOwnProperty.call(rendersBySize, k)) continue;
      var size = null;
      for(var i = 0; i < template.sizes.length; i++){
        if(template.sizes[i].label === k){ size = template.sizes[i]; break; }
      }
      if(!size) continue;
      var a = size.w * size.h;
      if(a > bestArea){ bestArea = a; best = rendersBySize[k]; }
    }
    return best;
  }

  function renderResultLine(d){
    var tag = (d.format || '').toUpperCase();
    return ''
      + '<div class="mkt-result-row">'
      +   '<span class="mkt-result-size">'+escapeHtml(d.size_label)+'</span>'
      +   '<span class="mkt-result-tag">'+escapeHtml(tag)+'</span>'
      +   (d.cached ? '<span class="mkt-result-cached">cached</span>' : '')
      +   '<a class="mkt-result-link" href="'+escapeAttr(d.url)+'" download target="_blank" rel="noopener">Download</a>'
      + '</div>';
  }

  function findSizeByLabel(template, label){
    if(!template || !template.sizes) return null;
    for(var i = 0; i < template.sizes.length; i++){
      if(template.sizes[i].label === label) return template.sizes[i];
    }
    return null;
  }

  /** Render the preview pane from a single render entry (the largest
   *  finished size). Builds:
   *    <div class=preview-wrap>
   *      <img>
   *      <div class=preview-overlay>           ← receives drag events
   *        <div class=preview-handle data-slot=character> ← per-asset
   *      </div>
   *    </div>
   *  Overlay handles are positioned according to previewMeta.boxes
   *  scaled to the displayed image size. attachPreviewDrag wires the
   *  pointer events. */
  function showPreview(entry){
    var preview = document.getElementById('mkt-modal-preview');
    if(!preview) return;
    preview.innerHTML = ''
      + '<div class="mkt-preview-wrap" id="mkt-preview-wrap">'
      +   '<img class="mkt-preview-img" id="mkt-preview-img" alt="" src="'+escapeAttr(entry.url)+'">'
      +   '<div class="mkt-preview-overlay" id="mkt-preview-overlay"></div>'
      + '</div>';
    var img = document.getElementById('mkt-preview-img');
    img.onload  = renderPreviewHandles;
    img.onerror = function(){ /* keep the empty preview div */ };
    // Image may already be cached by the browser → onload won't fire.
    if(img.complete) renderPreviewHandles();
  }

  /** Position one overlay rectangle per draggable asset on top of the
   *  preview image. Bboxes are pixel coords in the rendered image; we
   *  scale them by (display width / render width). */
  function renderPreviewHandles(){
    var overlay = document.getElementById('mkt-preview-overlay');
    var img     = document.getElementById('mkt-preview-img');
    if(!overlay || !img) return;
    overlay.innerHTML = '';
    if(!previewMeta || !previewMeta.boxes || !previewMeta.width || !previewMeta.height){
      // No bbox metadata yet — drag won't work, but preview still
      // shows the image. Hint the user via overlay caption.
      overlay.innerHTML = '<div class="mkt-preview-hint">Render once to enable drag-to-position</div>';
      return;
    }
    // Affirmative hint: this overlay accepts drag.
    overlay.insertAdjacentHTML('beforeend',
      '<div class="mkt-preview-hint">↔ Drag any asset to reposition</div>');
    var dispW = img.clientWidth;
    var dispH = img.clientHeight;
    if(!dispW || !dispH) return;
    var scaleX = dispW / previewMeta.width;
    var scaleY = dispH / previewMeta.height;

    // Collapse character + character.transparent — only one handle for
    // the user to drag. Last-rendered wins (in our z-order, .transparent
    // overrides the regular .character).
    var seenChar = false;
    for(var i = 0; i < previewMeta.boxes.length; i++){
      var b = previewMeta.boxes[i];
      var key = b.slot;
      var isChar = (key === 'character' || key === 'character.transparent');
      if(isChar){
        if(seenChar) continue;
        seenChar = true;
        key = 'character';
      }
      // background_base is fit:cover and basically fills the canvas;
      // making it draggable just lets the user push it off-screen.
      // Skip.
      if(b.slot === 'background_base') continue;

      var label = isChar ? 'Character' : (key === 'logo' ? 'Logo' : key);
      var h = document.createElement('div');
      h.className = 'mkt-preview-handle';
      h.setAttribute('data-slot', key);
      h.style.left   = (b.x * scaleX) + 'px';
      h.style.top    = (b.y * scaleY) + 'px';
      h.style.width  = (b.w * scaleX) + 'px';
      h.style.height = (b.h * scaleY) + 'px';
      h.innerHTML    = '<span class="mkt-preview-handle-label">'+escapeHtml(label)+'</span>';
      overlay.appendChild(h);
    }
    attachPreviewDrag(overlay);
  }

  /** Pointer-event drag with pointer capture.
   *
   *  Each handle owns its own pointerdown/move/up listeners and uses
   *  setPointerCapture to pin subsequent events to itself — no global
   *  document listeners (which were accumulating across re-renders in
   *  the old implementation, with the closure of each instance going
   *  stale after the next render replaced overlay.onmousedown).
   *
   *  Pointer events also work for touch / pen out of the box.
   */
  function attachPreviewDrag(overlay){
    var img = document.getElementById('mkt-preview-img');
    if(!img) return;

    var handles = overlay.querySelectorAll('.mkt-preview-handle');
    for(var i = 0; i < handles.length; i++){
      bindHandle(handles[i], img);
    }
  }

  function bindHandle(handle, img){
    var slot = handle.getAttribute('data-slot');
    if(!slot) return;

    // Per-handle drag state — closes over the bind() call so each
    // handle's listeners reference the same `state` and don't
    // collide with other handles.
    var state = null;

    handle.addEventListener('pointerdown', function(e){
      // Left-button only.
      if(e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      var form = document.getElementById('mkt-modal-form');
      var row  = form && form.querySelector('.mkt-pos-row[data-pos-slot="'+slot+'"]');
      var dxIn = row && row.querySelector('input[data-pos-field="dx"]');
      var dyIn = row && row.querySelector('input[data-pos-field="dy"]');

      state = {
        startX:    e.clientX,
        startY:    e.clientY,
        baseDx:    dxIn ? (parseFloat(dxIn.value) || 0) : 0,
        baseDy:    dyIn ? (parseFloat(dyIn.value) || 0) : 0,
        startLeft: parseFloat(handle.style.left || 0),
        startTop:  parseFloat(handle.style.top  || 0),
        dispW:     img.clientWidth  || 1,
        dispH:     img.clientHeight || 1,
        dxIn:      dxIn,
        dyIn:      dyIn,
      };
      handle.classList.add('is-dragging');
      // Pin all subsequent pointer events for this gesture to this
      // element, regardless of where the cursor goes. Standard
      // drag-and-drop pattern in modern browsers.
      try { handle.setPointerCapture(e.pointerId); } catch(_) {}
    });

    handle.addEventListener('pointermove', function(e){
      if(!state) return;
      var dx = e.clientX - state.startX;
      var dy = e.clientY - state.startY;
      handle.style.left = (state.startLeft + dx) + 'px';
      handle.style.top  = (state.startTop  + dy) + 'px';

      var dxPct = state.baseDx + (dx / state.dispW);
      var dyPct = state.baseDy + (dy / state.dispH);
      // Clamp to engine-accepted range so a user dragging far-off-screen
      // doesn't push the engine override out of bounds.
      dxPct = Math.max(-1, Math.min(1, dxPct));
      dyPct = Math.max(-1, Math.min(1, dyPct));
      if(state.dxIn) state.dxIn.value = dxPct.toFixed(4);
      if(state.dyIn) state.dyIn.value = dyPct.toFixed(4);
    });

    function end(e){
      if(!state) return;
      handle.classList.remove('is-dragging');
      state = null;
      try { handle.releasePointerCapture(e.pointerId); } catch(_) {}
      // Commit via a debounced re-render. The handle jumps to the new
      // engine-computed position on the next render's bbox set.
      schedulePreviewRefresh();
    }
    handle.addEventListener('pointerup',     end);
    handle.addEventListener('pointercancel', end);
  }

  function findTile(templateId){
    var tiles = document.querySelectorAll('.mkt-tile[data-template-id]');
    for(var i = 0; i < tiles.length; i++){
      if(tiles[i].getAttribute('data-template-id') === templateId) return tiles[i];
    }
    return null;
  }

  function updateTileThumbnail(templateId, url){
    // Drop the freshly rendered URL into the tile's preview slot. The
    // slot starts as an empty placeholder div; on first render we
    // replace it with an <img>, on subsequent renders we just swap the
    // src so the bigger size overwrites the smaller (per-event order
    // is small→large).
    var tile = findTile(templateId);
    if(!tile) return;
    var prev = tile.querySelector('.mkt-tile-preview-slot, .mkt-tile-preview, .mkt-tile-preview-empty, img.mkt-tile-preview');
    if(!prev){
      // Defensive: tile exists but slot is missing — nothing safe to
      // do; caller logs the URL elsewhere so the user can still get it.
      return;
    }
    if(prev.tagName === 'IMG'){
      prev.setAttribute('src', url);
      // Clear any inline display:none left over by a previous onerror —
      // hostile state from earlier marketing.js versions.
      prev.style.display = '';
      return;
    }
    var img = document.createElement('img');
    img.className = 'mkt-tile-preview';
    img.setAttribute('src', url);
    img.setAttribute('alt', '');
    img.setAttribute('loading', 'lazy');
    prev.parentNode.replaceChild(img, prev);
  }

  /** Toggle the per-tile rendering state — disables the Render button,
   *  swaps its label, and shows a "Rendering…" overlay on the preview
   *  slot. The CSS lives under .mkt-tile.is-rendering. */
  function setTileRendering(templateId, isRendering){
    var tile = findTile(templateId);
    if(!tile) return;
    tile.classList.toggle('is-rendering', !!isRendering);
    var btn = tile.querySelector('.mkt-tile-btn[data-act="render"]');
    if(btn){
      btn.disabled    = !!isRendering;
      btn.textContent = isRendering ? 'Rendering…' : 'Render';
    }
  }

  function pickStr(){
    for(var i = 0; i < arguments.length; i++){
      var v = arguments[i];
      if(typeof v === 'string') return v;
    }
    return '';
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function isReady(r){
    return !!(r && r.hasBackground && r.hasLogo && r.hasCharacter);
  }

  function fetchJSON(url){
    return fetch(url, { credentials: 'same-origin' }).then(function(res){
      // Plan-gate (403) and missing project (404) get bubbled with the
      // error body's message so the empty-state can reflect them
      // honestly instead of a generic "load failed". The thrown Error
      // carries the structured error code + plan so renderUpgradeRequired
      // can branch on it without parsing the message.
      if(!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(body){
          var msg = (body && body.message) || (body && body.error) || ('HTTP ' + res.status);
          var err = new Error(msg);
          err.code = body && body.error;
          err.plan = body && body.plan;
          err.status = res.status;
          throw err;
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

  var MODAL_CSS = ''
    + '#mkt-modal-overlay{position:fixed;inset:0;background:rgba(6,6,10,0.78);backdrop-filter:blur(4px);z-index:9999;align-items:center;justify-content:center;padding:32px}'
    + '#mkt-modal{background:#13131a;border:1px solid #2a2a3a;border-radius:10px;width:100%;max-width:1080px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column}'
    + '#mkt-modal-header{display:flex;align-items:flex-start;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #2a2a3a}'
    + '#mkt-modal-title{font-size:14px;color:#e8e6e2;font-weight:600;margin-bottom:2px}'
    + '#mkt-modal-subtitle{font-size:10px;color:#5a5a78;font-family:"DM Mono",monospace;letter-spacing:0.04em}'
    + '#mkt-modal-close{background:transparent;border:none;color:#7a7a94;font-size:24px;line-height:1;cursor:pointer;padding:0 4px}'
    + '#mkt-modal-close:hover{color:#e8e6e2}'
    + '#mkt-modal-body{display:grid;grid-template-columns:340px 1fr;gap:0;flex:1;min-height:0}'
    + '#mkt-modal-left{padding:18px 22px;border-right:1px solid #2a2a3a;overflow-y:auto}'
    + '#mkt-modal-right{padding:18px 22px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}'
    + '.mkt-form-row{margin-bottom:14px}'
    + '.mkt-form-label{font-size:11px;color:#a0a0b0;font-weight:500;margin-bottom:6px;letter-spacing:0.02em;display:block}'
    + '.mkt-form-input{width:100%;background:#0a0a10;border:1px solid #2a2a3a;color:#e0deda;border-radius:5px;padding:8px 10px;font-size:12px;font-family:inherit}'
    + '.mkt-form-input:focus{outline:none;border-color:#c9a84c}'
    + '.mkt-form-hint{font-size:10px;color:#5a5a78;margin-top:4px;line-height:1.4}'
    + '.mkt-form-sizes{display:flex;flex-wrap:wrap;gap:8px}'
    + '.mkt-form-size{display:inline-flex;align-items:center;gap:6px;background:#0a0a10;border:1px solid #2a2a3a;border-radius:5px;padding:6px 10px;font-size:11px;color:#e0deda;cursor:pointer;font-family:"DM Mono",monospace}'
    + '.mkt-form-size:hover{border-color:#3a3a4f}'
    + '.mkt-form-size input{accent-color:#c9a84c}'
    + '.mkt-form-checkbox{display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px 10px;background:#0a0a10;border:1px solid #2a2a3a;border-radius:5px;font-size:12px;color:#e0deda}'
    + '.mkt-form-checkbox:hover{border-color:#3a3a4f}'
    + '.mkt-form-checkbox input{accent-color:#c9a84c;cursor:pointer}'
    + '.mkt-form-section-title{font-size:10px;font-weight:600;color:#7a7a94;text-transform:uppercase;letter-spacing:0.06em;margin:18px 0 10px;padding-top:14px;border-top:1px solid #2a2a3a}'
    + '.mkt-pos-row{background:#0a0a10;border:1px solid #2a2a3a;border-radius:5px;padding:10px 12px;margin-bottom:8px}'
    + '.mkt-pos-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}'
    + '.mkt-pos-label{font-size:11px;color:#e0deda;font-weight:500}'
    + '.mkt-pos-reset{background:transparent;border:none;color:#7a7a94;font-size:10px;cursor:pointer;padding:2px 6px;border-radius:3px}'
    + '.mkt-pos-reset:hover{color:#c9a84c;background:#1a1a24}'
    + '.mkt-pos-slider{display:grid;grid-template-columns:48px 1fr 56px;align-items:center;gap:8px;margin-bottom:4px}'
    + '.mkt-pos-slider:last-child{margin-bottom:0}'
    + '.mkt-pos-slider-label{font-size:10px;color:#7a7a94;font-family:"DM Mono",monospace;letter-spacing:0.04em}'
    + '.mkt-pos-slider input[type=range]{width:100%;accent-color:#c9a84c}'
    + '.mkt-pos-slider-value{font-size:10px;color:#a0a0b0;font-family:"DM Mono",monospace;text-align:right}'
    + '#mkt-modal-actions{display:flex;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid #2a2a3a}'
    + '#mkt-modal-actions .mkt-tile-btn{flex:1;padding:9px 14px;font-size:12px}'
    + '#mkt-modal-preview{background:#0a0a10;border:1px solid #2a2a3a;border-radius:6px;min-height:280px;max-height:62vh;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative}'
    + '.mkt-modal-preview-empty{color:#5a5a78;font-size:11px;padding:24px;text-align:center}'
    // .mkt-preview-wrap respects the rendered image's aspect by sitting
    // inline-block; img inside fits the available width AND height with
    // object-fit:contain so a 9:16 TikTok cover or 3:1 banner both
    // display fully without clipping. The wrap's computed size is what
    // renderPreviewHandles measures for bbox scaling.
    + '.mkt-preview-wrap{position:relative;display:inline-flex;max-width:100%;max-height:62vh}'
    + '.mkt-preview-img{display:block;max-width:100%;max-height:62vh;width:auto;height:auto;object-fit:contain;border-radius:6px;user-select:none;-webkit-user-drag:none}'
    + '.mkt-preview-overlay{position:absolute;inset:0;pointer-events:none}'
    // Handles: always-visible faint outline so users know they can drag.
    // Hover brightens; drag locks the gold accent.
    + '.mkt-preview-handle{position:absolute;border:1px dashed rgba(201,168,76,0.45);border-radius:4px;cursor:move;pointer-events:auto;transition:border-color .15s,background-color .15s,box-shadow .15s}'
    + '.mkt-preview-handle:hover{border-color:rgba(201,168,76,1);background:rgba(201,168,76,0.10);box-shadow:0 0 0 1px rgba(201,168,76,0.25)}'
    + '.mkt-preview-handle.is-dragging{border-color:#c9a84c;border-style:solid;background:rgba(201,168,76,0.18)}'
    // Always-visible badge so the user can SEE which slot is which
    // (small chip in the top-left corner of each handle).
    + '.mkt-preview-handle-label{position:absolute;top:6px;left:6px;background:rgba(10,10,16,0.85);color:#c9a84c;font-size:10px;padding:2px 6px;border-radius:3px;font-family:"DM Mono",monospace;letter-spacing:0.04em;opacity:0.9;transition:opacity .15s;pointer-events:none}'
    + '.mkt-preview-handle:hover .mkt-preview-handle-label,.mkt-preview-handle.is-dragging .mkt-preview-handle-label{opacity:1}'
    + '.mkt-preview-hint{position:absolute;bottom:8px;left:8px;background:rgba(10,10,16,0.85);color:#c9a84c;font-size:10px;padding:5px 10px;border-radius:3px;pointer-events:none;font-family:"DM Mono",monospace;letter-spacing:0.04em}'
    + '#mkt-modal-progress{font-size:11px;color:#a0a0b0;font-family:"DM Mono",monospace;min-height:14px}'
    + '#mkt-modal-results{display:flex;flex-direction:column;gap:6px}'
    + '.mkt-result-row{display:flex;align-items:center;gap:10px;background:#1a1a24;border:1px solid #2a2a3a;border-radius:5px;padding:8px 12px;font-size:11px}'
    + '.mkt-result-size{color:#e0deda;font-family:"DM Mono",monospace;flex:1}'
    + '.mkt-result-tag{color:#7a7a94;font-family:"DM Mono",monospace;font-size:10px}'
    + '.mkt-result-cached{color:#7ac98a;font-size:10px}'
    + '.mkt-result-link{color:#c9a84c;text-decoration:none;font-weight:500}'
    + '.mkt-result-link:hover{color:#d4b65c;text-decoration:underline}';

  var MARKETING_CSS = ''
    + '.mkt-section{padding:18px 22px;border-bottom:1px solid #1a1a24}'
    + '.mkt-section:last-of-type{border-bottom:none}'
    + '.mkt-section-title{font-size:12px;font-weight:600;color:#e8e6e2;margin-bottom:12px;letter-spacing:0.04em;text-transform:uppercase}'
    + '.mkt-section-count{color:#5a5a78;font-weight:400;margin-left:4px}'
    + '.mkt-section-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}'
    + '.mkt-tile{background:#13131a;border:1px solid #2a2a3a;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s;position:relative}'
    + '.mkt-tile:hover{border-color:#3a3a4f}'
    + '.mkt-tile-preview,.mkt-tile-preview-empty,.mkt-tile-preview-slot{width:100%;aspect-ratio:1/1;background:#0a0a10;border-radius:6px;object-fit:cover;display:block;position:relative;overflow:hidden}'
    + '.mkt-tile-preview-empty,.mkt-tile-preview-slot{background:linear-gradient(135deg,#1a1a24 0%,#222230 100%)}'
    + '.mkt-tile-name{font-size:12px;color:#e8e6e2;font-weight:500;margin-top:2px}'
    + '.mkt-tile-sizes{font-size:10px;color:#7a7a94;font-family:"DM Mono",monospace;letter-spacing:0.02em}'
    + '.mkt-tile-actions{display:flex;gap:6px;margin-top:auto}'
    + '.mkt-tile-btn{flex:1;background:#1a1a24;border:1px solid #2a2a3a;color:#e0deda;border-radius:5px;padding:6px 10px;font-size:11px;cursor:pointer;font-weight:500;transition:background .12s,border-color .12s}'
    + '.mkt-tile-btn:hover{background:#222230;border-color:#3a3a4f}'
    + '.mkt-tile-btn:disabled{opacity:0.7;cursor:wait}'
    + '.mkt-tile-btn.primary{background:#c9a84c;border-color:#c9a84c;color:#0a0a10}'
    + '.mkt-tile-btn.primary:hover{background:#d4b65c;border-color:#d4b65c}'
    // Per-tile rendering overlay — keyframed shimmer + label so the user
    // sees motion while the SSE stream is in flight.
    + '.mkt-tile.is-rendering .mkt-tile-preview-slot,'
    + '.mkt-tile.is-rendering .mkt-tile-preview-empty,'
    + '.mkt-tile.is-rendering .mkt-tile-preview{position:relative}'
    + '.mkt-tile.is-rendering .mkt-tile-preview-slot::before,'
    + '.mkt-tile.is-rendering .mkt-tile-preview-empty::before,'
    + '.mkt-tile.is-rendering .mkt-tile-preview::before{'
    +   'content:"";position:absolute;inset:0;border-radius:6px;'
    +   'background:linear-gradient(110deg,transparent 30%,rgba(201,168,76,0.18) 50%,transparent 70%);'
    +   'background-size:200% 100%;animation:mktShimmer 1.4s linear infinite;'
    + '}'
    + '.mkt-tile.is-rendering .mkt-tile-preview-slot::after,'
    + '.mkt-tile.is-rendering .mkt-tile-preview-empty::after,'
    + '.mkt-tile.is-rendering .mkt-tile-preview::after{'
    +   'content:"Rendering…";position:absolute;inset:0;border-radius:6px;'
    +   'display:flex;align-items:center;justify-content:center;'
    +   'background:rgba(10,10,16,0.45);'
    +   'color:#c9a84c;font-size:11px;font-family:"DM Mono",monospace;letter-spacing:0.05em;'
    + '}'
    + '@keyframes mktShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}'
    // Welcome / first-visit hint banner shown above the grid until the
    // first render lands.
    + '.mkt-welcome{display:flex;gap:14px;align-items:flex-start;background:#1a1a24;border:1px solid #2a2a3a;border-left:3px solid #c9a84c;border-radius:6px;padding:14px 18px;margin:18px 22px 0}'
    + '.mkt-welcome-icon{font-size:18px;line-height:1.2;flex:0 0 auto}'
    + '.mkt-welcome-title{font-size:13px;color:#e8e6e2;font-weight:600;margin-bottom:3px}'
    + '.mkt-welcome-sub{font-size:11px;color:#a0a0b0;line-height:1.5}'
    // Bootstrap / skeleton state shown while /templates + /kits are
    // in flight. Visible spinner + 4 placeholder tiles so the user
    // immediately reads "structure is loading" not "page is broken".
    + '.mkt-bootstrap{padding:24px 22px}'
    + '.mkt-bootstrap-row{display:flex;align-items:center;gap:14px;margin-bottom:18px}'
    + '.mkt-bootstrap-title{font-size:13px;color:#e8e6e2;font-weight:600;margin-bottom:3px}'
    + '.mkt-bootstrap-sub{font-size:11px;color:#7a7a94}'
    + '.mkt-spinner{width:22px;height:22px;border-radius:50%;border:2px solid #2a2a3a;border-top-color:#c9a84c;animation:mktSpin 0.9s linear infinite;flex:0 0 auto}'
    + '@keyframes mktSpin{to{transform:rotate(360deg)}}'
    + '.mkt-bootstrap-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}'
    + '.mkt-skeleton-tile{background:#13131a;border:1px solid #2a2a3a;border-radius:8px;padding:12px;display:flex;flex-direction:column;gap:8px}'
    + '.mkt-skeleton-block{width:100%;aspect-ratio:1/1;background:linear-gradient(110deg,#1a1a24 30%,#222230 50%,#1a1a24 70%);background-size:200% 100%;border-radius:6px;animation:mktShimmer 1.4s linear infinite}'
    + '.mkt-skeleton-line{height:10px;background:linear-gradient(110deg,#1a1a24 30%,#222230 50%,#1a1a24 70%);background-size:200% 100%;border-radius:3px;animation:mktShimmer 1.4s linear infinite}'
    + '.mkt-skeleton-line.w70{width:70%}'
    + '.mkt-skeleton-line.w40{width:40%}'
    // ─── Premium loading state ───────────────────────────────────────────
    // Hero card with gold accent + concentric pulsing rings + a
    // single sparkle glyph at the centre. Reads as "loading" without
    // pretending content is forming.
    + '.mkt-loading-hero{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 28px;font-family:Space Grotesk,sans-serif;min-height:60vh}'
    + '.mkt-loading-rings{position:relative;width:80px;height:80px;margin-bottom:24px}'
    + '.mkt-loading-ring{position:absolute;inset:0;border:1.5px solid rgba(201,168,76,0.45);border-radius:50%;animation:mktRingPulse 1.6s ease-out infinite}'
    + '.mkt-loading-ring-2{animation-delay:0.4s;opacity:0}'
    + '.mkt-loading-ring-3{animation-delay:0.8s;opacity:0}'
    + '.mkt-loading-glyph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#c9a84c;font-size:24px;font-weight:300;animation:mktGlyphPulse 1.6s ease-in-out infinite}'
    + '@keyframes mktRingPulse{0%{transform:scale(0.7);opacity:0.7}100%{transform:scale(1.3);opacity:0}}'
    + '@keyframes mktGlyphPulse{0%,100%{transform:scale(1);opacity:0.8}50%{transform:scale(1.15);opacity:1}}'
    + '.mkt-loading-eyebrow{font-size:9px;font-family:DM Mono,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#c9a84c;margin-bottom:10px;font-weight:700}'
    + '.mkt-loading-title{font-size:18px;font-weight:600;color:#e8e6e2;letter-spacing:-0.01em;margin-bottom:8px;line-height:1.2}'
    + '.mkt-loading-sub{font-size:12px;color:#7a7a94;line-height:1.5;max-width:380px}'
    // ─── Premium empty-state for fresh projects ──────────────────────────
    // Hero card with gold accent, three asset status cards, strong CTA.
    + '.mkt-onboard{max-width:780px;margin:30px auto 60px;padding:0 28px;font-family:Space Grotesk,sans-serif}'
    + '.mkt-onboard-hero{background:linear-gradient(135deg,#13131a 0%,#0a0a14 100%);border:1px solid #2a2a3a;border-radius:14px;padding:36px 36px 30px;position:relative;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,0.45)}'
    + '.mkt-onboard-hero::before{content:"";position:absolute;left:0;top:0;width:3px;height:100%;background:linear-gradient(180deg,#c9a84c 0%,#7a4a08 100%)}'
    + '.mkt-onboard-eyebrow{font-size:9px;font-family:DM Mono,monospace;letter-spacing:0.18em;text-transform:uppercase;color:#c9a84c;margin-bottom:14px;font-weight:700}'
    + '.mkt-onboard-title{font-size:24px;font-weight:600;color:#e8e6e2;letter-spacing:-0.01em;margin-bottom:10px;line-height:1.15}'
    + '.mkt-onboard-sub{font-size:13px;color:#a0a0b0;line-height:1.55;max-width:560px;margin-bottom:22px}'
    + '.mkt-onboard-progress{height:4px;background:#1a1a24;border-radius:2px;overflow:hidden;margin-top:6px}'
    + '.mkt-onboard-progress-fill{height:100%;background:linear-gradient(90deg,#c9a84c 0%,#e8c060 100%);border-radius:2px;transition:width 0.4s ease}'
    + '.mkt-onboard-progress-text{font-size:10px;color:#7a7a94;font-family:DM Mono,monospace;letter-spacing:0.06em;margin-top:8px;text-transform:uppercase}'
    + '.mkt-onboard-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}'
    + '@media (max-width:780px){.mkt-onboard-cards{grid-template-columns:1fr}}'
    + '.mkt-onboard-card{display:flex;align-items:center;gap:14px;background:#13131a;border:1px solid #2a2a3a;border-radius:10px;padding:16px 18px;transition:border-color 0.15s,transform 0.15s}'
    + '.mkt-onboard-card.is-done{border-color:rgba(122,201,138,0.35);background:linear-gradient(135deg,rgba(122,201,138,0.06) 0%,#13131a 60%)}'
    + '.mkt-onboard-card.is-pending{border-color:rgba(201,168,76,0.18)}'
    + '.mkt-onboard-card-icon{width:42px;height:42px;flex-shrink:0;display:flex;align-items:center;justify-content:center;background:#0a0a10;border:1px solid #2a2a3a;border-radius:8px;font-size:20px}'
    + '.mkt-onboard-card.is-done .mkt-onboard-card-icon{border-color:rgba(122,201,138,0.4);background:rgba(122,201,138,0.08)}'
    + '.mkt-onboard-card-meta{flex:1;min-width:0}'
    + '.mkt-onboard-card-title{font-size:13px;color:#e8e6e2;font-weight:600;margin-bottom:2px}'
    + '.mkt-onboard-card-hint{font-size:10px;color:#7a7a94;font-family:DM Mono,monospace;letter-spacing:0.04em}'
    + '.mkt-onboard-card-status{flex-shrink:0}'
    + '.mkt-onboard-tick{display:flex;width:24px;height:24px;align-items:center;justify-content:center;background:#7ac98a;color:#0a0a10;border-radius:50%;font-weight:800;font-size:13px}'
    + '.mkt-onboard-pending{display:flex;width:14px;height:14px;align-items:center;justify-content:center;background:transparent;border:1.5px solid rgba(201,168,76,0.5);color:transparent;border-radius:50%}'
    + '.mkt-onboard-cta{display:flex;justify-content:flex-start;margin-top:24px}'
    + '.mkt-onboard-btn{background:#c9a84c;border:none;color:#0a0a10;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:Space Grotesk,sans-serif;letter-spacing:0.02em;transition:background 0.15s,transform 0.12s,box-shadow 0.15s;box-shadow:0 6px 20px rgba(201,168,76,0.22)}'
    + '.mkt-onboard-btn:hover{background:#d4b65c;transform:translateY(-1px);box-shadow:0 8px 24px rgba(201,168,76,0.32)}'
    + '.mkt-onboard-btn:active{transform:translateY(0)}';
})();
