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
      + formSelect('language',     'Language',
          (schema.language && schema.language.options) || ['EN'],
          pickStr(vars.language, schema.language ? schema.language.default : 'EN'))
      + formSelect('colorMode',    'Color mode',
          (schema.colorMode && schema.colorMode.options) || ['auto'],
          pickStr(vars.colorMode, schema.colorMode ? schema.colorMode.default : 'auto'))
      + formSelect('layoutVariant','Layout variant',
          (schema.layoutVariant && schema.layoutVariant.options) || ['A'],
          pickStr(vars.layoutVariant, schema.layoutVariant ? schema.layoutVariant.default : 'A'))
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

    // Reset right-pane state — no preview yet, no renders.
    var preview = document.getElementById('mkt-modal-preview');
    if(preview) preview.innerHTML = '<div class="mkt-modal-preview-empty">Click <b>Render selected sizes</b> to see your kit</div>';
    var results = document.getElementById('mkt-modal-results');
    if(results) results.innerHTML = '';

    document.getElementById('mkt-modal-overlay').style.display = 'flex';
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

  // ─── Live preview debouncer ────────────────────────────────────────────────
  //
  // Every meaningful form change schedules a preview refresh 350ms in
  // the future; subsequent changes inside that window reset the timer.
  // Picks the smallest declared size to keep the SSE round-trip cheap;
  // updateTileThumbnail still fires for the grid tile.

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

  /** Per-slot X / Y / Scale sliders. Slot labels are friendly names;
   *  data-slot attributes preserve the canonical asset key for
   *  readModalVars to assemble the layerOverrides blob. The "Reset"
   *  button zeroes a single slot's overrides and triggers a re-render. */
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
      } else {
        displayed.push({ key: s, label: SLOT_LABELS[s] || s, hidden: false });
      }
    }
    if(displayed.length === 0) return '';

    var html = '<div class="mkt-form-section-title">Positioning</div>';
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
        +   posSlider('dx',    'X',     dx, -1, 1, 0.01)
        +   posSlider('dy',    'Y',     dy, -1, 1, 0.01)
        +   posSlider('scale', 'Scale', sc,  0.25, 2.5, 0.05)
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
              preview.innerHTML = '<img src="'+escapeAttr(biggest.url)+'" alt="" style="width:100%;display:block;border-radius:6px">';
            }
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
    + '#mkt-modal-preview{background:#0a0a10;border:1px solid #2a2a3a;border-radius:6px;min-height:280px;display:flex;align-items:center;justify-content:center;overflow:hidden}'
    + '.mkt-modal-preview-empty{color:#5a5a78;font-size:11px;padding:24px;text-align:center}'
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
    + '@keyframes mktShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}';
})();
