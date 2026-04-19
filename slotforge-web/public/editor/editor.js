// ═══ STATE ═══
const P={screen:'base',activeLayer:null,gameName:'',theme:'western',viewport:'portrait',colors:{c1:'#c9a84c',c2:'#1a0a3a',c3:'#e8c96d',t1:true,t2:true,t3:true},reelset:'5x3',char:{enabled:false,scale:'Full Height'},ante:{enabled:false,label:'Ante Bet'},msgPos:'top',jackpots:{mini:{on:true,val:'€100',exclude:[]},minor:{on:true,val:'€500',exclude:[]},major:{on:true,val:'€2,500',exclude:[]},grand:{on:true,val:'€10,000',exclude:[]}},features:{freespin:true,holdnspin:false,buy_feature:false,gamble:false,megaways:false,expanding_wild:false,bonus_pick:false,wheel_bonus:false,ladder_bonus:false,sticky_wild:false,walking_wild:false,stacked_wild:false,multiplier_wild:false,colossal_wild:false,ante_bet:false,bonus_store:false,cascade:false,tumble:false,win_multiplier:false,infinity_reels:false,cluster_pays:false,ways:false,mystery_symbol:false,symbol_upgrade:false,super_gamble:false,_custom:[]},importedFiles:[],library:[],showGrid:true,ovProps:{},ovPos:{}};
let LIB_CAT='All'; // active library category filter
let LIB_TAB='uploads'; // 'uploads' or 'placeholders'

// Viewport: cx/cy = crop offset inside 2000x2000 canvas, cw/ch = display size
const VP={
  portrait:  {label:'Portrait 9:16',   cx:441,cy:0,   cw:984, ch:2000},
  landscape: {label:'Landscape 16:9',  cx:0,  cy:0,   cw:2000,ch:1125},
  desktop:   {label:'Desktop 16:9',    cx:0,  cy:0,   cw:2000,ch:1125}
};

// Positions measured from reference screenshots (Fruity Thrills) and scaled to 2000×2000 canvas.
// Portrait display: canvas crops x:441–1425 (w:984) at full 2000px height.
// Landscape display: canvas full 2000px wide × 1125px height.
//
// Z-ORDER: bg(1) reelFrame(2) reelArea(3) jackpots(5) logo/char(6) UI(7)
// NOTE: reelFrame sits BEHIND symbols — reel area (symbols) renders in front of the frame artwork

// ── STATIC ELEMENTS (never reel-dependent) ──
const PSD={
  bg:{label:'Background',type:'template',locked:true,z:1,
    portrait: {x:0,   y:0,    w:2000, h:2000},
    landscape:{x:0,   y:0,    w:2000, h:1125}},
  jpRow:{label:'Jackpot Bar Row',type:'template',locked:false,z:5,
    portrait: {x:479,y:540,w:908,h:50},
    landscape:{x:546,y:99, w:1088,h:46}},
  // All other elements are computed by computeLayout() at render time
  // and injected via EL_COMPUTED. PSD entries here are fallback only.
  reelArea: {label:'Reel Area',     type:'template',locked:false,z:3,portrait:{x:499,y:680,w:868,h:544},landscape:{x:566,y:286,w:868,h:544}},
  reelFrame:{label:'Reel Frame',    type:'template',locked:false,z:2,portrait:{x:479,y:660,w:908,h:584},landscape:{x:546,y:266,w:908,h:584}},
  jpGrand:  {label:'Grand Jackpot', type:'template',locked:false,z:5,portrait:{x:479,y:540,w:226,h:110},landscape:{x:546,y:166,w:226,h:90}},
  jpMajor:  {label:'Major Jackpot', type:'template',locked:false,z:5,portrait:{x:706,y:540,w:226,h:110},landscape:{x:773,y:166,w:226,h:90}},
  jpMinor:  {label:'Minor Jackpot', type:'template',locked:false,z:5,portrait:{x:933,y:540,w:226,h:110},landscape:{x:1000,y:166,w:226,h:90}},
  jpMini:   {label:'Mini Jackpot',  type:'template',locked:false,z:5,portrait:{x:1160,y:540,w:226,h:110},landscape:{x:1227,y:166,w:226,h:90}},
  logo:     {label:'Logo',          type:'ai',       locked:false,z:6,portrait:{x:580,y:280,w:702,h:240},landscape:{x:56,y:266,w:240,h:400}},
  char:     {label:'Character',     type:'ai',       locked:false,z:6,portrait:{x:500,y:200,w:300,h:520},landscape:{x:56,y:56,w:220,h:800}},
  settings: {label:'Settings',      type:'template', locked:false,z:7,portrait:{x:1310,y:1370,w:90,h:90},landscape:{x:1910,y:50,w:70,h:70}},
  bannerBet:{label:'Bet Button',    type:'template', locked:false,z:7,portrait:{x:1100,y:1280,w:278,h:220},landscape:{x:1540,y:77,w:280,h:330}},
  bannerBuy:{label:'Buy Bonus',     type:'template', locked:false,z:7,portrait:{x:479,y:1280,w:240,h:220},landscape:{x:1540,y:430,w:280,h:280}},
  bannerAnte:{label:'Ante Bet',      type:'template', locked:false,z:7,portrait:{x:479,y:1280,w:240,h:220},landscape:{x:1540,y:430,w:280,h:280}},
  spinBtn:  {label:'Spin Button',   type:'template', locked:false,z:7,portrait:{x:800,y:1290,w:260,h:260},landscape:{x:1743,y:810,w:166,h:166}},
  autoBtn:  {label:'Auto Spin',     type:'template', locked:false,z:7,portrait:{x:660,y:1335,w:130,h:130},landscape:{x:1540,y:838,w:128,h:128}},
  turboBtn: {label:'Turbo Spin',    type:'template', locked:false,z:7,portrait:{x:1070,y:1335,w:130,h:130},landscape:{x:1875,y:838,w:128,h:128}},
  msgLabel: {label:'Message Label', type:'template', locked:false,z:7,portrait:{x:441,y:1600,w:984,h:52},landscape:{x:0,y:1072,w:2000,h:45}},
};

// ── DYNAMIC LAYOUT ENGINE ──
// Computes reel-grid-dependent positions for all elements.
// Called before buildCanvas. Results go into EL_COMPUTED[vp][key].
// EL_COMPUTED is used by getPos() with lower priority than user overrides (EL_VP).
const EL_COMPUTED = {portrait:{}, landscape:{}};
const USER_LOCKS = new Set(); // keys the user has manually locked
const HIDDEN_LAYERS = new Set(); // keys the user has hidden via eye icon
const EL_BLEND_MODES = {}; // key -> CSS mix-blend-mode value: 'normal'|'screen'|'multiply'

const FRAME_MARGIN = 16; // px around reelArea for reelFrame
const JP_H_P = 50;       // jackpot plaque height portrait (slim bar)
const JP_H_L = 46;       // jackpot plaque height landscape
const JP_GAP  = 8;        // gap between JP bar and reelFrame
const UI_BOTTOM_P = 300; // UI strip height below reels in portrait (buttons)
const UI_BOTTOM_L = 160; // UI strip height in landscape
const MSG_H_P = 40;      // message label height portrait (slim)
const MSG_H_L = 36;      // message label height landscape
const LOGO_H_L = 380;    // logo+char left column width in landscape
const RIGHT_COL_L = 320; // right UI column width in landscape

function computeLayout(){
  const [cols, rows] = parseReel(P.reelset);
  const GAP = 8, PAD = 12;
  const FRAME = FRAME_MARGIN;

  // ── PORTRAIT ──
  // Available canvas area for the reel grid:
  //   Width: portrait crop = 984px (canvas x:441–1425)
  //   Height: 2000px minus JP bar, reel frame borders, UI strip, msg label, logo margin
  const availW_P = 984 - PAD*2 - FRAME*2;
  const availH_P = 2000 - MSG_H_P - JP_H_P - FRAME*2 - UI_BOTTOM_P - 60/*logo top margin*/;
  const cellP = Math.max(60, Math.min(200, Math.floor(Math.min(availW_P/cols, availH_P/rows))));
  const gridW_P = cols*cellP + (cols-1)*GAP;
  const gridH_P = rows*cellP + (rows-1)*GAP;
  const reelW_P = gridW_P + PAD*2;
  const reelH_P = gridH_P + PAD*2;
  const frameW_P = reelW_P + FRAME*2;
  const frameH_P = reelH_P + FRAME*2;

  // Centre the reel frame within the 984px portrait crop window
  // Canvas portrait crop starts at x:441, width 984 → centre = 441+492 = 933
  const frameCX_P = 933;
  const frameX_P = Math.round(frameCX_P - frameW_P/2);
  const reelX_P  = frameX_P + FRAME;

  // Vertical: JP bars sit FULLY ABOVE the reel frame — bottom edge flush with frame top
  // No overlap into the reel cells at all
  const lockedH_P = MSG_H_P + JP_H_P + frameH_P + UI_BOTTOM_P;
  const slack_P = 2000 - lockedH_P;
  const topMargin_P = Math.round(slack_P * 0.45); // 45% slack above reels (logo lives there)
  const frameY_P = MSG_H_P + topMargin_P + JP_H_P; // frame starts below full JP bar height
  const reelY_P  = frameY_P + FRAME;
  const jpY_P    = frameY_P - JP_H_P; // bars fully above frame, bottom edge = frame top
  const uiCentreY_P = frameY_P + frameH_P + Math.round(UI_BOTTOM_P/2);
  // Logo area: between msgLabel and JP bar top
  const logoAreaTop_P = MSG_H_P + 10;
  const logoAreaH_P   = jpY_P - logoAreaTop_P - 10; // space above the JP bar row

  // Portrait layout anchors:
  // msgLabel top, logo below that, jpMini circle top-left, settings top-right,
  // JP bar just above reel frame, reel frame centred, UI row below.
  const jpSlimH = JP_H_P;
  const spinR_P = 105;   // spin button radius portrait
  const auxR_P  = 58;    // auto/turbo radius portrait

  // settings circle: top-right of crop
  const settingsSize = 80;
  const settingsX = 441 + 984 - settingsSize - 20;
  const settingsY = MSG_H_P + 20;

  // Logo: large centred box — fills the full space between msg strip and JP bar row
  const logoW_P = Math.min(Math.round(frameW_P * 0.85), 680);
  const logoH_P = Math.max(logoAreaH_P - 10, 120);
  const logoX_P = Math.round(frameCX_P - logoW_P/2);
  const logoY_P = MSG_H_P + 20;  // starts just below the message strip

  // UI strip layout (portrait):
  //   Spin cluster centred at ~40% into the strip (upper half)
  //   BET / ANTE / BUY panels pinned to the bottom of the strip
  const uiStripTop = frameY_P + frameH_P; // top of the UI area
  const uiStripBot = uiStripTop + UI_BOTTOM_P; // bottom of UI area (where balance bar begins)
  const uiY_P = uiStripTop + Math.round(UI_BOTTOM_P * 0.42); // spin cluster centre Y

  // Spread AUTO–SPIN–TURBO across the full 984px portrait crop width
  const cropL = 441, cropR = 1425;
  const autoGap_P  = spinR_P + auxR_P + 30; // centre distance spin→auto
  const turboGap_P = spinR_P + auxR_P + 30;

  // BET / BUY / ANTE panels: pinned to bottom of UI strip, horizontally at crop edges
  const betW_P=210, betH_P=72, betX_P = cropL + 28;
  const anteW_P=210, anteH_P=60;
  const buyW_P=210, buyH_P=72, buyX_P = cropR - 28 - buyW_P;
  const panelBotY = uiStripBot - 28; // panels flush with bottom of strip

  EL_COMPUTED.portrait = {
    reelArea: {x:reelX_P,  y:reelY_P,  w:reelW_P,  h:reelH_P},
    reelFrame:{x:frameX_P, y:frameY_P, w:frameW_P, h:frameH_P},
    // JP row: single wrapper spanning full frame width — children laid out by flex, not coordinates
    jpRow:    {x:frameX_P, y:jpY_P,    w:frameW_P,  h:jpSlimH},
    jpGrand:  {x:frameX_P,                            y:jpY_P, w:Math.round(frameW_P/4),   h:jpSlimH},
    jpMajor:  {x:frameX_P+Math.round(frameW_P/4),     y:jpY_P, w:Math.round(frameW_P/4),   h:jpSlimH},
    jpMinor:  {x:frameX_P+Math.round(frameW_P/2),     y:jpY_P, w:Math.round(frameW_P/4),   h:jpSlimH},
    jpMini:   {x:frameX_P+Math.round(frameW_P*3/4),   y:jpY_P, w:Math.floor(frameW_P/4),   h:jpSlimH},
    // Logo: prominent centred box in the full space above the JP bars
    logo:     {x:logoX_P, y:logoY_P, w:logoW_P, h:logoH_P},
    // Char: portrait character art alongside reel area (left edge, disabled by default)
    char:     {x:441, y:jpY_P, w:240, h:frameH_P + JP_H_P},
    // Settings: small circle top-right of crop
    settings: {x:settingsX, y:settingsY, w:settingsSize, h:settingsSize},
    // Spin cluster: AUTO(left) · SPIN(centre) · TURBO(right) — centred in upper half of UI strip
    spinBtn:  {x:Math.round(frameCX_P - spinR_P),            y:uiY_P - spinR_P,  w:spinR_P*2, h:spinR_P*2},
    autoBtn:  {x:Math.round(frameCX_P - autoGap_P - auxR_P), y:uiY_P - auxR_P,   w:auxR_P*2,  h:auxR_P*2},
    turboBtn: {x:Math.round(frameCX_P + turboGap_P - auxR_P),y:uiY_P - auxR_P,   w:auxR_P*2,  h:auxR_P*2},
    // BET/ANTE at bottom-left of UI strip, BUY at bottom-right
    bannerBet: {x:betX_P,  y:panelBotY - betH_P,               w:betW_P,  h:betH_P},
    bannerAnte:{x:betX_P,  y:panelBotY - betH_P - anteH_P - 8, w:anteW_P, h:anteH_P},
    bannerBuy: {x:buyX_P,  y:panelBotY - buyH_P,               w:buyW_P,  h:buyH_P},
    msgLabel:  {x:441, y:0, w:984, h:MSG_H_P},
  };

  // ── LANDSCAPE ──
  // Available for reels: full 2000px wide but leave left (logo) and right (UI) columns
  const availW_L = 2000 - LOGO_H_L - RIGHT_COL_L - PAD*2 - FRAME*2;
  const availH_L = 1125 - MSG_H_L - JP_H_L - FRAME*2 - UI_BOTTOM_L;
  const cellL = Math.max(60, Math.min(200, Math.floor(Math.min(availW_L/cols, availH_L/rows))));
  const gridW_L = cols*cellL + (cols-1)*GAP;
  const gridH_L = rows*cellL + (rows-1)*GAP;
  const reelW_L = gridW_L + PAD*2;
  const reelH_L = gridH_L + PAD*2;
  const frameW_L = reelW_L + FRAME*2;
  const frameH_L = reelH_L + FRAME*2;

  // Centre reels in the available corridor
  const reelCorridorX = LOGO_H_L;
  const reelCorridorW = 2000 - LOGO_H_L - RIGHT_COL_L;
  const frameCX_L = reelCorridorX + Math.round(reelCorridorW/2);
  const frameX_L  = Math.round(frameCX_L - frameW_L/2);
  const reelX_L   = frameX_L + FRAME;

  // Vertical (landscape): JP bars sit FULLY ABOVE the reel frame — bottom edge flush with frame top
  const totalH_used = JP_H_L + frameH_L + UI_BOTTOM_L + MSG_H_L;
  const vSlack_L = 1125 - totalH_used;
  const vTop_L = MSG_H_L + Math.round(vSlack_L * 0.3);
  const frameY_L = vTop_L + JP_H_L; // frame starts below full JP bar height
  const reelY_L  = frameY_L + FRAME;
  const jpY_L    = frameY_L - JP_H_L; // bars fully above frame, bottom edge = frame top
  const uiCentreY_L = frameY_L + frameH_L + Math.round(UI_BOTTOM_L/2);

  // Right column: UI buttons (spin, bet, buy)
  const rcX = 2000 - RIGHT_COL_L + 20;
  const rcMidY = Math.round(1125/2);

  const spinR_L = 80;   // spin radius landscape
  const auxR_L  = 46;   // auto/turbo radius landscape
  // Right column: LOGO (top) → BET → TURBO → SPIN → AUTO → BUY → ANTE
  const rcColCX = rcX + Math.round((RIGHT_COL_L - 40)/2); // column centre X
  const rc_bW = RIGHT_COL_L - 44;
  const rc_logoH = 150;           // logo height in right column
  const rc_logoY = 20;
  const rc_betH = 68, rc_buyH = 62, rc_anteH = 54;
  const rc_betY  = rc_logoY + rc_logoH + 18;  // BET panel below logo
  // Spin cluster: vertically stacked — TURBO above SPIN, AUTO below
  const rc_spinMidY = Math.round(1125 * 0.55);   // spin centre
  const rc_turboMidY = rc_spinMidY - spinR_L - 22 - auxR_L; // turbo centre above spin
  const rc_autoMidY  = rc_spinMidY + spinR_L + 22 + auxR_L; // auto centre below spin
  const rc_buyY  = rc_autoMidY + auxR_L + 18;
  const rc_anteY = rc_buyY + rc_buyH + 8;

  EL_COMPUTED.landscape = {
    reelArea: {x:reelX_L,  y:reelY_L,  w:reelW_L,  h:reelH_L},
    reelFrame:{x:frameX_L, y:frameY_L, w:frameW_L, h:frameH_L},
    // JP row: single wrapper — children laid out by flex
    jpRow:    {x:frameX_L, y:jpY_L,   w:frameW_L,  h:JP_H_L},
    jpGrand:  {x:frameX_L,                        y:jpY_L, w:Math.round(frameW_L/4), h:JP_H_L},
    jpMajor:  {x:frameX_L+Math.round(frameW_L/4), y:jpY_L, w:Math.round(frameW_L/4), h:JP_H_L},
    jpMinor:  {x:frameX_L+Math.round(frameW_L/2), y:jpY_L, w:Math.round(frameW_L/4), h:JP_H_L},
    jpMini:   {x:frameX_L+Math.round(frameW_L*3/4),y:jpY_L,w:Math.floor(frameW_L/4), h:JP_H_L},
    // Char: FULL LEFT COLUMN — decorative character art spanning entire canvas height
    char:     {x:20, y:0, w:LOGO_H_L-40, h:1125},
    // Settings: top-right corner (outside right column, near edge)
    settings: {x:1920, y:20, w:60, h:60},
    // Right column: LOGO (top) → BET → TURBO → SPIN → AUTO → BUY → ANTE
    logo:      {x:rcX+22, y:rc_logoY,            w:rc_bW, h:rc_logoH},
    bannerBet: {x:rcX+22, y:rc_betY,             w:rc_bW, h:rc_betH},
    turboBtn:  {x:rcColCX - auxR_L,              y:rc_turboMidY - auxR_L, w:auxR_L*2, h:auxR_L*2},
    spinBtn:   {x:rcColCX - spinR_L,             y:rc_spinMidY - spinR_L, w:spinR_L*2, h:spinR_L*2},
    autoBtn:   {x:rcColCX - auxR_L,              y:rc_autoMidY - auxR_L,  w:auxR_L*2, h:auxR_L*2},
    bannerBuy: {x:rcX+22, y:rc_buyY,             w:rc_bW, h:rc_buyH},
    bannerAnte:{x:rcX+22, y:rc_anteY,            w:rc_bW, h:rc_anteH},
    msgLabel:  {x:0, y:1125-MSG_H_L, w:2000, h:MSG_H_L},
  };

  // Store the computed cell size for use in makeSymbolCell
  EL_COMPUTED._cellSize = {portrait: cellP, landscape: cellL};
}

// ── PER-VIEWPORT USER POSITION OVERRIDES ──
const EL_VP={portrait:{},landscape:{},desktop:{}};
function curEL(){return EL_VP[P.viewport==='desktop'?'landscape':P.viewport];}
function getPos(k){
  const vp=P.viewport==='desktop'?'landscape':P.viewport;
  return curEL()[k]||EL_COMPUTED[vp]?.[k]||PSD[k]?.[vp]||PSD[k]?.portrait||{x:0,y:0,w:100,h:100};
}
function setPos(k,pos){curEL()[k]=pos;}
function resetEl(k){delete EL_VP.portrait[k];delete EL_VP.landscape[k];delete EL_VP.desktop[k];}

// ── UNDO / REDO ──
const HIST=[];let HIDX=-1;
function serializeState(){
  // Full snapshot: positions + features + jackpots + char + ante + symbols + screen key order + assets
  const keyOrders={};
  Object.entries(SDEFS).forEach(([s,def])=>{ if(def.keys) keyOrders[s]=[...def.keys]; });
  // Store asset pool references (not full dataURLs) — each unique image stored once in ASSET_POOL
  const assets={};
  Object.entries(EL_ASSETS).forEach(([k,url])=>{ if(url) assets[k]=poolAsset(url); });
  return JSON.stringify({
    p: JSON.parse(JSON.stringify(EL_VP.portrait)),
    l: JSON.parse(JSON.stringify(EL_VP.landscape)),
    features: JSON.parse(JSON.stringify(P.features)),
    jackpots: JSON.parse(JSON.stringify(P.jackpots)),
    char: JSON.parse(JSON.stringify(P.char)),
    ante: JSON.parse(JSON.stringify(P.ante)),
    colors: JSON.parse(JSON.stringify(P.colors)),
    reelset: P.reelset,
    keyOrders,
    userLocks: [...USER_LOCKS],
    assets,
    adjs: JSON.parse(JSON.stringify(EL_ADJ)),
    masks: JSON.parse(JSON.stringify(EL_MASKS))
  });
}
function pushHistory(desc){
  const s=serializeState();
  if(HIDX>=0&&HIST[HIDX]&&HIST[HIDX].s===s)return;
  HIST.splice(HIDX+1);HIST.push({desc,s});
  if(HIST.length>80)HIST.shift();
  HIDX=HIST.length-1;updateUR();
}
function beginAction(desc){
  const before=serializeState();
  return function commit(){
    const after=serializeState();
    if(before===after)return;
    HIST.splice(HIDX+1);HIST.push({desc,s:after});
    if(HIST.length>80)HIST.shift();
    HIDX=HIST.length-1;updateUR();
  };
}
function initHistory(){HIST.length=0;HIDX=-1;pushHistory('initial');updateUR();}
function undo(){if(HIDX<=0)return;HIDX--;restoreSnap();}
function redo(){if(HIDX>=HIST.length-1)return;HIDX++;restoreSnap();}
function restoreSnap(){
  const s=JSON.parse(HIST[HIDX].s);
  Object.keys(EL_VP.portrait).forEach(k=>delete EL_VP.portrait[k]);
  Object.keys(EL_VP.landscape).forEach(k=>delete EL_VP.landscape[k]);
  Object.assign(EL_VP.portrait,JSON.parse(JSON.stringify(s.p)));
  Object.assign(EL_VP.landscape,JSON.parse(JSON.stringify(s.l)));
  if(s.features) Object.assign(P.features,s.features);
  if(s.jackpots) Object.assign(P.jackpots,s.jackpots);
  if(s.char) Object.assign(P.char,s.char);
  if(s.ante) Object.assign(P.ante,s.ante);
  if(s.colors) Object.assign(P.colors,s.colors);
  if(s.reelset) P.reelset=s.reelset;
  if(s.keyOrders) Object.entries(s.keyOrders).forEach(([sc,keys])=>{if(SDEFS[sc])SDEFS[sc].keys=[...keys];});
  if(s.userLocks){USER_LOCKS.clear();s.userLocks.forEach(k=>USER_LOCKS.add(k));}
  // Restore uploaded assets from pool references
  Object.keys(EL_ASSETS).forEach(k=>delete EL_ASSETS[k]);
  if(s.assets){ Object.entries(s.assets).forEach(([k,pid])=>{ if(ASSET_POOL[pid]) EL_ASSETS[k]=ASSET_POOL[pid]; }); }
  // Restore adjustments and masks
  Object.keys(EL_ADJ).forEach(k=>delete EL_ADJ[k]);
  if(s.adjs) Object.assign(EL_ADJ,s.adjs);
  Object.keys(EL_MASKS).forEach(k=>delete EL_MASKS[k]);
  if(s.masks) Object.assign(EL_MASKS,s.masks);
  SEL_KEY=null; buildCanvas(); renderLayers(); rebuildTabs(); updateUR();
}
function updateUR(){
  document.getElementById('btn-undo').disabled=HIDX<=0;
  document.getElementById('btn-redo').disabled=HIDX>=HIST.length-1;
}

const BASE_KEYS   = ['reelArea','reelFrame','jpRow','jpGrand','jpMajor','jpMinor','jpMini','logo','char','bannerBet','bannerBuy','bannerAnte','autoBtn','spinBtn','turboBtn','settings','msgLabel','bg'];
const REEL_KEYS   = ['reelArea','reelFrame','jpRow','jpGrand','jpMajor','jpMinor','jpMini','logo','char','autoBtn','spinBtn','turboBtn','settings','msgLabel','bg'];
const SPLASH_KEYS = ['logo','char','msgLabel','bg'];
const POPUP_KEYS = ['dimLayer', 'ov-buypopup_title', 'ov-buypopup_desc', 'ov-buypopup_btnCancel', 'ov-buypopup_btnBuy']; // Default for testing, but dynamically replaced
const WIN_KEYS = ['dimLayer', 'ov-win_title', 'ov-win_amount'];

const SDEFS={
  splash:      {label:'Splash',         keys:SPLASH_KEYS, dot:'#7c5cbf'},
  base:        {label:'Base Game',      keys:BASE_KEYS,   dot:'#2e7d5a'},
  freespin:    {label:'Free Spins',     keys:REEL_KEYS,   dot:'#4ac8f0'},
  holdnspin:   {label:'Hold & Spin',    keys:REEL_KEYS,   dot:'#5eca8a'},
  // Pop-up sub-screens — ONLY specific pop-up UI keys
  popup_win:   {label:'Big Win',        keys:['dimLayer','ov-bigwin_title','ov-bigwin_amount','ov-bigwin_btn'],    dot:'#c9a84c',  group:'popup'},
  popup_megawin:{label:'Mega Win',       keys:['dimLayer','ov-megawin_title','ov-megawin_amount','ov-megawin_btn'],    dot:'#e8c96d',  group:'popup'},
  popup_epicwin:{label:'Epic Win',       keys:['dimLayer','ov-epicwin_title','ov-epicwin_amount','ov_epicwin_btn'],    dot:'#ff7060',  group:'popup'},
  popup_buy:   {label:'Buy Bonus',      keys:['dimLayer','ov-buypopup_title','ov-buypopup_desc','ov-buypopup_btnCancel','ov-buypopup_btnBuy'],  dot:'#ef7a7a',  group:'popup', requires:'buy_feature'},
  popup_fs:    {label:'FS Trigger',     keys:['dimLayer','ov-fstrigger_title','ov-fstrigger_count','ov-fstrigger_sub','ov-fstrigger_btn'],  dot:'#4ac8f0',  group:'popup', requires:'freespin'},
  popup_hns:   {label:'HnS Trigger',   keys:['dimLayer','ov-hnstrigger_title','ov-hnstrigger_count','ov-hnstrigger_sub','ov-hnstrigger_btn'],  dot:'#5eca8a',  group:'popup', requires:'holdnspin'},
  popup_jp:    {label:'Jackpot Win',    keys:['dimLayer','ov-jpwin_title','ov-jpwin_type','ov-jpwin_amount','ov_jpwin_btn'], dot:'#ef7a7a', group:'popup'},
  win:         {label:'Win',            keys:['dimLayer','ov-win_title','ov-win_amount'],  dot:'#c9a84c'},
};
// Register dynamically-generated SDEFS entries (EW screens)
// Feature screen registry — defines layer sets and visual style per dynamic screen
const FEATURE_SCREEN_DEFS={
  // Bonus rounds — unique UI overlays over a minimal bg
  bonus_pick:   {label:'Bonus Pick',       dot:'#f0a84c', keys:['bg'],           overlay:'pick',      group:'bonus'},
  wheel_bonus:  {label:'Wheel Bonus',      dot:'#ef7a7a', keys:['bg'],           overlay:'wheel',     group:'bonus'},
  ladder_bonus: {label:'Ladder Bonus',     dot:'#b07aef', keys:['bg'],           overlay:'ladder',    group:'bonus'},
  // Wild mechanics — reel screen with wild overlays
  sticky_wild:  {label:'Sticky Wild',      dot:'#c9d84c', keys:REEL_KEYS,        overlay:'sticky',    group:'wild'},
  walking_wild: {label:'Walking Wild',     dot:'#d4b84c', keys:REEL_KEYS,        overlay:'walking',   group:'wild'},
  // Cascade/reaction — reel screen with cascade arrows
  cascade:      {label:'Cascade',          dot:'#4adde8', keys:REEL_KEYS,        overlay:'cascade',   group:'reaction'},
  win_multiplier:{label:'Win Multiplier',  dot:'#60e0a0', keys:REEL_KEYS,        overlay:'winmult',   group:'reaction'},
  // Special mechanics — modified reel layouts
  infinity_reels:{label:'Infinity Reels', dot:'#9a7cdf', keys:REEL_KEYS,        overlay:'infinity',  group:'special'},
  cluster_pays: {label:'Cluster Pays',     dot:'#7a8aef', keys:REEL_KEYS,        overlay:'cluster',   group:'special'},
  // Gamble
  super_gamble: {label:'Super Gamble',     dot:'#6060df', keys:['bg'],           overlay:'gamble',    group:'gamble'},
};

function registerFeatureScreens(){
  // 1. Remove all old dynamic screens
  Object.keys(SDEFS).filter(k=>k.startsWith('ew_')||FEATURE_SCREEN_DEFS[k]).forEach(k=>delete SDEFS[k]);

  // 2. Register EW screens
  if(P.features.expanding_wild){
    (P.expandWild.activatedIn||['base']).forEach(parentScr=>{
      const key='ew_'+parentScr;
      const parentDef=SDEFS[parentScr];
      SDEFS[key]={
        label:'EW — '+(parentDef?.label||parentScr),
        keys:(parentDef?.keys||REEL_KEYS).filter(k=>k!=='bannerBet'&&k!=='bannerBuy'),
        dot:'#e8c96d', isEW:true, parentScreen:parentScr,
      };
    });
  }

  // 3. Register all other feature screens
  FDEFS.forEach(f=>{
    if(!f.screen || f.screen==='freespin'||f.screen==='holdnspin'||f.screen==='expandwild') return;
    if(!P.features[f.key]) return;
    const def=FEATURE_SCREEN_DEFS[f.screen]||{label:f.label,dot:f.color,keys:['bg'],overlay:'generic'};
    SDEFS[f.screen]={
      label:def.label||f.label,
      keys:[...def.keys],
      dot:def.dot||f.color,
      overlay:def.overlay,
      featureKey:f.key,
    };
  });
}

// Keep old name as alias for backward compat
function registerEWScreens(){ registerFeatureScreens(); }
const OVS={splash:['ov-splash'],base:[],freespin:[],holdnspin:[],win:['ov-win'],popup_win:['ov-bigwin'],popup_megawin:['ov-megawin'],popup_epicwin:['ov-epicwin'],popup_buy:['ov-buypopup'],popup_fs:['ov-fstrigger'],popup_hns:['ov-hnstrigger'],popup_jp:['ov-jpwin']};
const ALL_OVS=['ov-splash','ov-fs','ov-hns','ov-win','ov-popup','ov-bigwin','ov-megawin','ov-epicwin','ov-buypopup','ov-fstrigger','ov-hnstrigger','ov-jpwin'];

// ── OVERLAY SUB-ELEMENT DEFINITIONS ──
// Each entry defines the editable sub-elements of an overlay popup.
// dText=default text, dColor=default color, dSize=font-size px, dWeight=font-weight, dSpacing=letter-spacing
const OV_SUBS={
  'ov-bigwin':[
    {id:'title', label:'Win Title',   type:'text',   dText:'BIG WIN',      dColor:'#c9a84c', dSize:60, dWeight:700, dSpacing:'.08em'},
    {id:'amount',label:'Win Amount',  type:'text',   dText:'€ 2,500',      dColor:'#ffffff', dSize:110,dWeight:800, dSpacing:'0'},
    {id:'btn',   label:'Button',      type:'button', dText:'COLLECT',      dColor:'#1a1200'},
  ],
  'ov-megawin':[
    {id:'title', label:'Win Title',   type:'text',   dText:'MEGA WIN!',    dColor:'#e8c96d', dSize:72, dWeight:800, dSpacing:'.08em'},
    {id:'amount',label:'Win Amount',  type:'text',   dText:'€ 25,000',     dColor:'#ffffff', dSize:120,dWeight:800, dSpacing:'0'},
    {id:'btn',   label:'Button',      type:'button', dText:'COLLECT',      dColor:'#1a1200'},
  ],
  'ov-epicwin':[
    {id:'title', label:'Win Title',   type:'text',   dText:'EPIC WIN!',    dColor:'#ff7060', dSize:84, dWeight:900, dSpacing:'.1em'},
    {id:'amount',label:'Win Amount',  type:'text',   dText:'€ 250,000',    dColor:'#ffffff', dSize:140,dWeight:900, dSpacing:'0'},
    {id:'btn',   label:'Button',      type:'button', dText:'COLLECT',      dColor:'#1a0000'},
  ],
  'ov-fstrigger':[
    {id:'title', label:'Title',       type:'text',   dText:'FREE SPINS',   dColor:'#4ac8f0', dSize:50, dWeight:700, dSpacing:'.12em'},
    {id:'count', label:'Spins Count', type:'text',   dText:'10',           dColor:'#ffffff', dSize:100,dWeight:800, dSpacing:'0'},
    {id:'sub',   label:'Subtitle',    type:'text',   dText:'SPINS AWARDED',dColor:'#4ac8f0', dSize:36, dWeight:600, dSpacing:'.1em'},
    {id:'btn',   label:'Button',      type:'button', dText:'START',        dColor:'#0a1a2a'},
  ],
  'ov-hnstrigger':[
    {id:'title', label:'Title',       type:'text',   dText:'HOLD & SPIN',  dColor:'#5eca8a', dSize:50, dWeight:700, dSpacing:'.08em'},
    {id:'count', label:'Respins',     type:'text',   dText:'3',            dColor:'#ffffff', dSize:100,dWeight:800, dSpacing:'0'},
    {id:'sub',   label:'Subtitle',    type:'text',   dText:'RESPINS AWARDED',dColor:'#5eca8a',dSize:36,dWeight:600, dSpacing:'.1em'},
    {id:'btn',   label:'Button',      type:'button', dText:'START',        dColor:'#0a1a0a'},
  ],
  'ov-jpwin':[
    {id:'title', label:'JP Title',    type:'text',   dText:'JACKPOT!',     dColor:'#ef7a7a', dSize:50, dWeight:700, dSpacing:'.12em'},
    {id:'type',  label:'JP Type',     type:'text',   dText:'GRAND',        dColor:'#c9a84c', dSize:44, dWeight:600, dSpacing:'0'},
    {id:'amount',label:'JP Amount',   type:'text',   dText:'€10,000',      dColor:'#ffffff', dSize:110,dWeight:800, dSpacing:'0'},
    {id:'btn',   label:'Button',      type:'button', dText:'COLLECT',      dColor:'#1a1200'},
  ],
  'ov-buypopup':[
    {id:'title',    label:'Popup Title', type:'text',   dText:'Buy Feature',           dColor:'#c9a84c', dSize:44, dWeight:700, dSpacing:'0'},
    {id:'desc',     label:'Description', type:'text',   dText:'Trigger Free Spins immediately for 100× your bet',dColor:'#888888',dSize:26,dWeight:400,dSpacing:'0'},
    {id:'btnCancel',label:'Cancel Btn',  type:'button', dText:'Cancel',                dColor:'#aaaaaa'},
    {id:'btnBuy',   label:'Buy Btn',     type:'button', dText:'Buy · €100',            dColor:'#1a1200'},
  ],
  'ov-splash':[
    {id:'title', label:'Game Title',  type:'text',   dText:'',             dColor:'#c9a84c', dSize:90, dWeight:600, dSpacing:'.04em'},
    {id:'sub',   label:'Subtitle',    type:'text',   dText:'FREE SPINS · JACKPOTS',dColor:'#666666',dSize:32,dWeight:400,dSpacing:'.12em'},
    {id:'btn',   label:'Play Button', type:'button', dText:'PLAY NOW',     dColor:'#1a1200'},
  ],
  'ov-win':[
    {id:'title', label:'Title',       type:'text',   dText:'BIG WIN!',     dColor:'#c9a84c', dSize:120,dWeight:600, dSpacing:'0'},
    {id:'amount',label:'Amount',      type:'text',   dText:'€250',         dColor:'#ffffff', dSize:170,dWeight:600, dSpacing:'0'},
  ],
};
// Overlay backdrop colors and layout styles
const OV_META={
  'ov-bigwin':   {bg:'#000000bb', layout:'col'},
  'ov-megawin':  {bg:'#000000cc', layout:'col'},
  'ov-epicwin':  {bg:'#000000dd', layout:'col'},
  'ov-fstrigger':{bg:'#000000aa', layout:'col'},
  'ov-hnstrigger':{bg:'#000000aa',layout:'col'},
  'ov-jpwin':    {bg:'#000000cc', layout:'col'},
  'ov-buypopup': {bg:'#00000077', layout:'popup'},
  'ov-splash':   {bg:null,        layout:'col'}, // radial gradient built at render time
  'ov-win':      {bg:'#000000aa', layout:'col'},
};

// Map ALL OV_SUBS seamlessly into the PSD layer structure
Object.keys(OV_SUBS).forEach((ovId, i) => {
  OV_SUBS[ovId].forEach((sub, j) => {
    PSD[`${ovId}_${sub.id}`] = {
      label: sub.label,
      type: 'css_ov',
      ovId: ovId,
      subId: sub.id,
      locked: false,
      z: 500 + i * 10 + j,
      // Provide default fallback positioning spanning full-width to perfectly preserve flex-centered text sizing!
      portrait: {x: 0, y: 700 + j*130, w: 2000, h: 120},
      landscape:{x: 0, y: 300 + j*130, w: 2000, h: 120}
    };
  });
});
PSD['dimLayer'] = { label: 'Dim Overlay', type: 'dimLayer', locked: true, z: 499 };

// State: currently selected overlay sub-element
let SEL_OV_KEY=null; // {ov:'ov-bigwin',sub:'title'}

// ── OVERLAY PROP HELPERS ──
function getOvProp(ov,sub,key){
  const d=OV_SUBS[ov]?.find(s=>s.id===sub);
  const stored=P.ovProps?.[ov]?.[sub]?.[key];
  return stored!==undefined?stored:(d?.[key]);
}
function setOvProp(ov,sub,key,val){
  if(!P.ovProps) P.ovProps={};
  if(!P.ovProps[ov]) P.ovProps[ov]={};
  if(!P.ovProps[ov][sub]) P.ovProps[ov][sub]={};
  P.ovProps[ov][sub][key]=val;
  markDirty();
}
// ── Overlay sub-element transform (move + scale) ──
function getOvTransform(ov,sub){
  return P.ovPos?.[ov]?.[sub]||{tx:0,ty:0,scale:1};
}
function setOvTransform(ov,sub,tx,ty,scale){
  if(!P.ovPos) P.ovPos={};
  if(!P.ovPos[ov]) P.ovPos[ov]={};
  P.ovPos[ov][sub]={tx,ty,scale};
  markDirty();
}
function applyOvTransform(el,tx,ty,scale){
  el.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;
  el.style.transformOrigin='center center';
}
function startOvMove(ev,ovId,subId){
  ev.stopPropagation(); ev.preventDefault();
  const t0=getOvTransform(ovId,subId);
  const startX=ev.clientX, startY=ev.clientY;
  let tx=t0.tx, ty=t0.ty, dragging=false;
  function onMove(mv){
    const dx=mv.clientX-startX, dy=mv.clientY-startY;
    if(!dragging&&(Math.abs(dx)+Math.abs(dy)>3)) dragging=true;
    if(!dragging) return;
    tx=t0.tx+dx; ty=t0.ty+dy;
    const el=document.getElementById(`${ovId}-${subId}`);
    if(el) applyOvTransform(el,tx,ty,t0.scale);
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    if(dragging) setOvTransform(ovId,subId,tx,ty,t0.scale);
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
function startOvResize(ev,ovId,subId){
  ev.stopPropagation(); ev.preventDefault();
  const t0=getOvTransform(ovId,subId);
  const el=document.getElementById(`${ovId}-${subId}`);
  const startX=ev.clientX;
  let scale=t0.scale;
  function onMove(mv){
    const dx=mv.clientX-startX;
    scale=Math.max(0.2,Math.min(4,t0.scale+dx/120));
    if(el) applyOvTransform(el,t0.tx,t0.ty,scale);
  }
  function onUp(){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    setOvTransform(ovId,subId,t0.tx,t0.ty,scale);
    // Reattach handles at new size
    selectOvEl(ovId,subId);
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
// ── FEATURE DEFINITIONS ──
// Groups: 'Bonus Rounds' | 'Wild Mechanics' | 'Buy / Ante' | 'Cascades & Reactions' | 'Special Mechanics' | 'Gamble'
const FDEFS=[
  // ── Bonus Rounds ──
  {key:'freespin',       label:'Free Spins',          group:'Bonus Rounds',          color:'#4ac8f0', screen:'freespin',
   desc:'Scatter-triggered free spins with multipliers and retriggers.'},
  {key:'holdnspin',      label:'Hold & Spin',          group:'Bonus Rounds',          color:'#5eca8a', screen:'holdnspin',
   desc:'Special symbols lock in place; grid respins until no new symbol lands.'},
  {key:'bonus_pick',     label:'Bonus Pick Game',      group:'Bonus Rounds',          color:'#f0a84c', screen:'bonus_pick',
   desc:'A pick-and-reveal or interactive mini-game triggered by bonus symbols.'},
  {key:'wheel_bonus',    label:'Wheel Bonus',          group:'Bonus Rounds',          color:'#ef7a7a', screen:'wheel_bonus',
   desc:'Spin-the-wheel bonus awarding prizes, multipliers or feature entries.'},
  {key:'ladder_bonus',   label:'Ladder / Trail Bonus', group:'Bonus Rounds',          color:'#b07aef', screen:'ladder_bonus',
   desc:'Player climbs a ladder collecting prizes at each step.'},
  // ── Wild Mechanics ──
  {key:'expanding_wild', label:'Expanding Wild',       group:'Wild Mechanics',        color:'#e8c96d', screen:'expandwild',
   desc:'Wild expands to cover the full reel. Direction and trigger configurable.'},
  {key:'sticky_wild',    label:'Sticky Wild',          group:'Wild Mechanics',        color:'#c9d84c', screen:'sticky_wild',
   desc:'Wilds remain fixed for one or more subsequent spins.'},
  {key:'walking_wild',   label:'Walking Wild',         group:'Wild Mechanics',        color:'#d4b84c', screen:'walking_wild',
   desc:'Wild shifts one position per spin until it walks off the edge.'},
  {key:'stacked_wild',   label:'Stacked Wilds',        group:'Wild Mechanics',        color:'#f0d060', screen:null,
   desc:'Wilds appear in stacks covering entire reel columns.'},
  {key:'multiplier_wild',label:'Multiplier Wild',      group:'Wild Mechanics',        color:'#c9e870', screen:null,
   desc:'Wild carries a multiplier (2×–∞) applied to wins it contributes to.'},
  {key:'colossal_wild',  label:'Colossal Wild (2×2+)', group:'Wild Mechanics',        color:'#d4c050', screen:null,
   desc:'Oversized wild spanning 2×2 or more cells on the grid.'},
  // ── Buy / Ante ──
  {key:'buy_feature',    label:'Buy Feature',          group:'Buy / Ante',            color:'#ef7a7a', screen:null,
   desc:'Player pays a fixed multiplier to directly trigger the bonus.'},
  {key:'ante_bet',       label:'Ante Bet',             group:'Buy / Ante',            color:'#f09070', screen:null,
   desc:'Optional side-bet that increases bonus trigger frequency.'},
  {key:'bonus_store',    label:'Bonus Store',          group:'Buy / Ante',            color:'#ef9a7a', screen:null,
   desc:'Scatters accumulate in a persistent in-game store for later purchase.'},
  // ── Cascades & Reactions ──
  {key:'cascade',        label:'Cascade / Avalanche',  group:'Cascades & Reactions',  color:'#4adde8', screen:'cascade',
   desc:'Winning symbols are removed; new symbols fall in to enable chain wins.'},
  {key:'tumble',         label:'Tumble / Reel Collapse',group:'Cascades & Reactions', color:'#40c8d0', screen:null,
   desc:'Symbols collapse after a win and are replaced from above.'},
  {key:'win_multiplier', label:'Win Multiplier Trail',  group:'Cascades & Reactions', color:'#60e0a0', screen:'win_multiplier',
   desc:'Consecutive wins in one spin increase a multiplier counter (1×, 2×, 3×…).'},
  // ── Special Mechanics ──
  {key:'megaways',       label:'Megaways™',            group:'Special Mechanics',     color:'#c9a84c', screen:null,
   desc:'Variable reel height — each spin shows 2–7 symbols per reel (licence required).'},
  {key:'infinity_reels', label:'Infinity Reels',       group:'Special Mechanics',     color:'#9a7cdf', screen:'infinity_reels',
   desc:'Grid grows by one reel per consecutive winning spin.'},
  {key:'cluster_pays',   label:'Cluster Pays',         group:'Special Mechanics',     color:'#7a8aef', screen:'cluster_pays',
   desc:'Wins formed by clusters of 5+ adjacent matching symbols, no paylines.'},
  {key:'ways',           label:'All Ways / MultiWays', group:'Special Mechanics',     color:'#5a78ef', screen:null,
   desc:'Pays any left-to-right combination regardless of position.'},
  {key:'mystery_symbol', label:'Mystery Symbol',       group:'Special Mechanics',     color:'#f07a7a', screen:null,
   desc:'A special symbol transforms into a random matching symbol after landing.'},
  {key:'symbol_upgrade', label:'Symbol Upgrade',       group:'Special Mechanics',     color:'#a070ef', screen:null,
   desc:'Symbols upgrade to higher-value versions during a bonus or random trigger.'},
  // ── Gamble ──
  {key:'gamble',         label:'Gamble',               group:'Gamble',                color:'#7a8aef', screen:null,
   desc:'Post-win gamble — double or nothing on a card, coin or wheel.'},
  {key:'super_gamble',   label:'Super Gamble',         group:'Gamble',                color:'#6060df', screen:'super_gamble',
   desc:'Extended gamble ladder with multiple steps up to a capped maximum.'},
];
function parseReel(v){const sp={megaways:[6,6],'243':[5,3],'1024':[5,4]};if(sp[v])return sp[v];const m=v.replace(/[ch]/g,'').match(/(\d+)x(\d+)/);return m?[+m[1],+m[2]]:[5,3];}

// ═══ ZOOM ═══
let ZOOM=1,SEL_KEY=null,SEL_KEYS=new Set();
function fitZoom(){
  const wrap=document.getElementById('canvas-wrap');
  const aw=wrap.clientWidth-60,ah=wrap.clientHeight-60;
  if(aw<=0||ah<=0){setTimeout(fitZoom,80);return;}
  const vp=VP[P.viewport];
  ZOOM=Math.min(aw/vp.cw,ah/vp.ch,1.4);
  applyZoom();
}
function applyZoom(){
  const vp=VP[P.viewport];
  const outer=document.getElementById('gf-outer');
  outer.style.width=Math.round(vp.cw*ZOOM)+'px';
  outer.style.height=Math.round(vp.ch*ZOOM)+'px';
  const gf=document.getElementById('gf');
  gf.style.transform='scale('+ZOOM+') translate(-'+vp.cx+'px,-'+vp.cy+'px)';
  gf.style.transformOrigin='top left';
  document.getElementById('zoom-indicator').textContent=Math.round(ZOOM*100)+'%';
}

// ═══ PLACEHOLDER + SYMBOL SYSTEM ═══
// Symbol upload store: symbolUploads[slotIndex] = dataURL
const symbolUploads = {};
// Neutral placeholder colours per symbol slot (cycling)
const SYM_COLS = ['#c9a84c','#ef7a7a','#7a8aef','#5eca8a','#4ac8f0','#f0a84c','#e8c96d','#9a7cdf','#ff6b6b','#48dbfb','#ff9f43','#1dd1a1'];
const SYM_LABELS = ['SYM 1','SYM 2','SYM 3','SYM 4','SYM 5','SYM 6','SYM 7','SYM 8','WILD','SCATTER','BONUS','HIGH'];

function _getSymOverlapStyle(symId) {
  const ov = P.reelSettings?.overlap;
  if(ov?.id && symId && String(symId) === String(ov.id) && ov.amount > 0) {
    return { scale: 1 + ov.amount/100, z: 10 };
  }
  return { scale: 1, z: 1 };
}

function makeSymbolCell(idx, cellW, cellH){
  // Find the corresponding symbol definition (by position)
  // Wrap around if more reel cells than defined symbols
  const symDef = P.symbols.length > 0 ? P.symbols[idx % P.symbols.length] : undefined;
  const symKey = symDef ? 'sym_'+symDef.id : 'sym_idx_'+idx;
  const symLabel = symDef ? symDef.name : (SYM_LABELS[idx%SYM_LABELS.length]);
  const oStyle = _getSymOverlapStyle(symDef ? symDef.id : null);

  const wrapper = document.createElement('div');
  // Symbol cells are transparent — visual frame/bg comes from the reelFrame/bg PNGs
  wrapper.style.cssText = `position:relative;width:100%;height:100%;overflow:${oStyle.scale>1?'visible':'hidden'};cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:${oStyle.z}`;
  wrapper.dataset.symIdx = idx;
  if(symDef) wrapper.dataset.symId = symDef.id;
  wrapper.setAttribute('data-sym-id', symDef ? symDef.id : idx);
  wrapper.title = 'Right-click to edit this symbol';
  wrapper.style.flexDirection='column';wrapper.style.justifyContent='flex-end';

  const uploadedImg = EL_ASSETS[symKey] || symbolUploads[idx];
  if(uploadedImg){
    const img = document.createElement('img');
    img.src = uploadedImg;
    img.style.cssText = `width:90%;height:90%;object-fit:contain;pointer-events:none;transform:scale(${oStyle.scale});position:relative;z-index:${oStyle.z}`;
    wrapper.appendChild(img);
  } else {
    const col = SYM_COLS[idx % SYM_COLS.length];
    const lbl = symLabel;
    const sz = Math.min(cellW, cellH);
    // SVG placeholder
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns,'svg');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    svg.setAttribute('viewBox',`0 0 ${sz} ${sz}`);
    svg.style.cssText = 'pointer-events:none';
    // Gem shape
    const path = document.createElementNS(ns,'path');
    const cx=sz/2, cy=sz/2, r=sz*0.38;
    path.setAttribute('d', `M${cx},${cy-r} L${cx+r*0.7},${cy-r*0.2} L${cx+r*0.4},${cy+r} L${cx-r*0.4},${cy+r} L${cx-r*0.7},${cy-r*0.2} Z`);
    path.setAttribute('fill',col); path.setAttribute('opacity','0.35');
    path.setAttribute('stroke',col); path.setAttribute('stroke-width','2');
    svg.appendChild(path);
    // Inner shine
    const shine = document.createElementNS(ns,'ellipse');
    shine.setAttribute('cx',cx-r*0.15); shine.setAttribute('cy',cy-r*0.2);
    shine.setAttribute('rx',r*0.18); shine.setAttribute('ry',r*0.1);
    shine.setAttribute('fill','#ffffff'); shine.setAttribute('opacity','0.4');
    svg.appendChild(shine);
    // Label
    const fs = Math.max(Math.round(sz*0.16),10);
    const txt = document.createElementNS(ns,'text');
    txt.setAttribute('x',cx); txt.setAttribute('y',cy+r*1.15);
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-family','Space Grotesk,sans-serif');
    txt.setAttribute('font-size',fs); txt.setAttribute('font-weight','700');
    txt.setAttribute('fill',col); txt.setAttribute('opacity','1');
    txt.textContent = lbl;
    svg.appendChild(txt);
    wrapper.appendChild(svg);
    // Upload hint overlay
    const hint = document.createElement('div');
    hint.style.cssText = `position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:4px;pointer-events:none;opacity:0;transition:opacity .15s`;
    hint.innerHTML = `<span style="font-size:${Math.max(Math.round(sz*0.11),7)}px;color:#ffffff88;background:#00000066;padding:2px 5px;border-radius:3px;font-family:Space Grotesk,sans-serif">⚙ settings</span>`;
    wrapper.appendChild(hint);
    wrapper.addEventListener('mouseenter',()=>hint.style.opacity='1');
    wrapper.addEventListener('mouseleave',()=>hint.style.opacity='0');
  }

  // Symbol name label at bottom of cell
  const cellLabel=document.createElement('div');
  cellLabel.style.cssText=`position:absolute;bottom:0;left:0;right:0;padding:3px 4px;background:linear-gradient(transparent,#000000cc);font-size:${Math.max(Math.round(Math.min(cellW,cellH)*0.13),9)}px;color:#e8e6e1;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:500;letter-spacing:.02em;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  cellLabel.textContent=symLabel;
  wrapper.appendChild(cellLabel);

  // Right-click to open context panel for this symbol
  wrapper.addEventListener('contextmenu', e=>{
    e.preventDefault(); e.stopPropagation();
    CTX_KEY = symKey;
    const lname = symDef ? `${symDef.name} (${symDef.type})` : `Symbol ${idx+1}`;
    document.getElementById('ctx-el-name').textContent = lname;
    const adj=getAdj(symKey);
    ['brightness','contrast','saturation','opacity'].forEach(a=>{
      const sl=document.getElementById('adj-'+a); const vl=document.getElementById('adj-'+a+'-val');
      if(sl) sl.value=adj[a]; if(vl) vl.textContent=adj[a];
    });
    const pw=240,ph=320;
    let px=e.clientX+14, py=e.clientY-60;
    if(px+pw>window.innerWidth-10) px=e.clientX-pw-14;
    if(py+ph>window.innerHeight-10) py=window.innerHeight-ph-10;
    if(py<10) py=10;
    const panel=document.getElementById('el-ctx-panel');
    panel.style.left=px+'px'; panel.style.top=py+'px';
    panel.classList.add('show');
  });
  // Left-click = open Reel Settings panel
  wrapper.addEventListener('click', e=>{
    e.stopPropagation();
    if(typeof openReelSettings === 'function') openReelSettings();
  });
  return wrapper;
}

// PNG-slot placeholder — clean dashed box, no CSS decoration
function makeImgSlot(label, hint){
  const d=document.createElement('div');
  d.style.cssText='width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1.5px dashed rgba(255,255,255,0.1);border-radius:inherit;box-sizing:border-box;pointer-events:none';
  d.innerHTML=`<div style="font-size:20px;opacity:.18">⊡</div>`
    +`<div style="font-size:9px;color:rgba(255,255,255,0.2);font-family:DM Mono,monospace;letter-spacing:.05em;text-transform:uppercase;text-align:center;line-height:1.5">${label}</div>`
    +(hint?`<div style="font-size:8px;color:rgba(255,255,255,0.1);font-family:DM Mono,monospace">${hint}</div>`:'');
  return d;
}

function makePH(k, w, h, label, accentCol){
  const W=Math.max(w,1), H=Math.max(h,1);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;border-radius:inherit';
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  const acc = accentCol||'#c9a84c';
  const r = e=>document.createElementNS(ns,e);
  const sa = (el,o)=>{Object.entries(o).forEach(([k,v])=>el.setAttribute(k,v));return el;};

  if(k==='bg'){
    const defs=r('defs');
    const grad=r('radialGradient'); sa(grad,{id:'bg-g'+W,cx:'50%',cy:'30%',r:'75%'});
    const s1=r('stop');sa(s1,{'offset':'0%','stop-color':acc,'stop-opacity':'0.45'});
    const s2=r('stop');sa(s2,{'offset':'100%','stop-color':'#020208','stop-opacity':'1'});
    grad.appendChild(s1);grad.appendChild(s2);defs.appendChild(grad);svg.appendChild(defs);
    const bg=r('rect');sa(bg,{x:0,y:0,width:W,height:H,fill:`url(#bg-g${W})`});svg.appendChild(bg);
    for(let x=0;x<W;x+=Math.round(W/16)){const l=r('line');sa(l,{x1:x,y1:0,x2:x,y2:H,stroke:'#ffffff',opacity:'0.025','stroke-width':'1'});svg.appendChild(l);}
    for(let y=0;y<H;y+=Math.round(H/16)){const l=r('line');sa(l,{x1:0,y1:y,x2:W,y2:y,stroke:'#ffffff',opacity:'0.025','stroke-width':'1'});svg.appendChild(l);}
  } else if(k==='char'){
    const bg=r('rect');sa(bg,{x:0,y:0,width:W,height:H,fill:acc,opacity:'0.07'});svg.appendChild(bg);
    const cx=W*0.5, hr=W*0.15;
    const head=r('ellipse');sa(head,{cx,cy:hr*1.5,rx:hr,ry:hr,fill:acc,opacity:'0.5'});svg.appendChild(head);
    const body=r('path');
    body.setAttribute('d',`M${cx-W*0.35},${H*0.96} Q${cx-W*0.12},${H*0.25} ${cx},${H*0.3} Q${cx+W*0.12},${H*0.25} ${cx+W*0.35},${H*0.96} Z`);
    body.setAttribute('fill',acc);body.setAttribute('opacity','0.3');svg.appendChild(body);
  } else if(k==='logo'){
    const bg=r('rect');sa(bg,{x:0,y:0,width:W,height:H,fill:acc,opacity:'0.07'});svg.appendChild(bg);
    const brd=r('rect');sa(brd,{x:6,y:6,width:W-12,height:H-12,rx:16,fill:'none',stroke:acc,opacity:'0.55','stroke-width':'3','stroke-dasharray':'18,9'});svg.appendChild(brd);
    for(let i=0;i<5;i++){
      const ang=i*Math.PI*2/5-Math.PI/2;
      const star=r('polygon');
      const sx=W*0.5+Math.cos(ang)*W*0.28, sy=H*0.5+Math.sin(ang)*H*0.28;
      star.setAttribute('points',`${sx},${sy-7} ${sx+5},${sy+5} ${sx-5},${sy+5}`);
      star.setAttribute('fill',acc);star.setAttribute('opacity','0.35');svg.appendChild(star);
    }
  } else {
    // Generic button/banner: tinted rect + diagonal texture
    const bg=r('rect');sa(bg,{x:0,y:0,width:W,height:H,fill:acc,opacity:'0.1'});svg.appendChild(bg);
    const brd=r('rect');sa(brd,{x:3,y:3,width:W-6,height:H-6,rx:10,fill:'none',stroke:acc,opacity:'0.5','stroke-width':'2.5'});svg.appendChild(brd);
    for(let i=-H;i<W+H;i+=Math.round(Math.max(W,H)/8)){
      const l=r('line');sa(l,{x1:i,y1:0,x2:i+H,y2:H,stroke:acc,opacity:'0.06','stroke-width':'1'});svg.appendChild(l);
    }
  }
  if(label){
    const parts=label.split('\n');
    const fs=Math.max(Math.min(Math.round(W*0.065),Math.round(H*0.1),30),11);
    parts.forEach((p,i)=>{
      const txt=r('text');
      sa(txt,{x:W/2,y:H/2+(i-(parts.length-1)/2)*fs*1.45+fs*0.38,
        'text-anchor':'middle','font-family':'Space Grotesk,sans-serif',
        'font-size':fs,'font-weight':'600',fill:acc,opacity:'0.95','letter-spacing':'0.05em'});
      txt.textContent=p; svg.appendChild(txt);
    });
  }
  wrap.appendChild(svg);
  return wrap;
}

// ═══ BUILD CANVAS ═══
function positionBalanceBar(){
  const bar=document.getElementById('balance-bar'); if(!bar) return;
  const vp=P.viewport==='desktop'?'landscape':P.viewport;
  const vpDef=VP[vp]; if(!vpDef) return;
  const barH=60; const margin=0;
  bar.style.left=vpDef.cx+'px';
  bar.style.top=(vpDef.cy+vpDef.ch-barH-margin)+'px';
  bar.style.width=vpDef.cw+'px';
  bar.style.height=barH+'px';
  bar.style.justifyContent='space-evenly';
  bar.style.borderRadius='0';
  bar.style.display='flex';
}
// ════════════════════════════════════════════════════════
// OVERLAY ELEMENT BUILDING + SELECTION
// ════════════════════════════════════════════════════════
function _ovText(ov,sub){
  // ov-splash title uses game name
  if(ov==='ov-splash'&&sub==='title') return (P.gameName||'LUCKY BULL').toUpperCase();
  return getOvProp(ov,sub,'dText')||'';
}
function buildOvEl(ovId){
  const meta=OV_META[ovId];
  const subs=OV_SUBS[ovId];
  const c1=P.colors.t1?P.colors.c1:'#888';
  const c3=P.colors.t3?P.colors.c3:'#888';
  const c2=P.colors.t2?P.colors.c2:'#111';
  // Clip overlay to the visible viewport so centering works correctly in both portrait and landscape
  const _vp=P.viewport==='desktop'?'landscape':P.viewport;
  const _vpDef=VP[_vp]||{cx:0,cy:0,cw:2000,ch:2000};
  const d=document.createElement('div');
  d.id=ovId;
  d.style.cssText=`position:absolute;left:${_vpDef.cx}px;top:${_vpDef.cy}px;width:${_vpDef.cw}px;height:${_vpDef.ch}px;z-index:500;opacity:0;pointer-events:none;transition:opacity .25s`;
  if(!subs){
    // Fallback inline HTML for overlays without OV_SUBS definitions
    const fallbacks={'ov-fs':`<div style="width:100%;height:100%;background:radial-gradient(ellipse at 50% 25%,#001836,#030312);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px"><div style="font-size:90px;font-weight:600;color:#4ac8f0;letter-spacing:.04em">FREE SPINS</div><div style="font-size:32px;color:#666;letter-spacing:.12em;text-transform:uppercase">10 SPINS REMAINING</div></div>`,'ov-hns':`<div style="width:100%;height:100%;background:radial-gradient(ellipse at 50% 25%,#001810,#030312);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px"><div style="font-size:90px;font-weight:600;color:#5eca8a;letter-spacing:.04em">HOLD &amp; SPIN</div><div style="font-size:32px;color:#666;letter-spacing:.12em;text-transform:uppercase">3 RESPINS REMAINING</div></div>`,'ov-ew':`<div style="width:100%;height:100%;background:radial-gradient(ellipse at 50% 30%,#1a1400,#030308);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px"><div style="font-size:70px;font-weight:700;color:#e8c96d;letter-spacing:.04em;text-shadow:0 0 80px #e8c96d88">EXPANDING WILD</div></div>`,'ov-popup':`<div style="width:100%;height:100%;background:#00000066;display:flex;align-items:center;justify-content:center"><div style="background:#161628;border:3px solid ${c1}55;border-radius:30px;padding:70px;width:700px;text-align:center"><div style="font-size:44px;font-weight:600;color:${c1};margin-bottom:20px">Buy Feature</div><div style="font-size:30px;color:#666;margin-bottom:40px;line-height:1.5">Trigger Free Spins immediately for 100× your bet.</div><div style="display:flex;gap:20px;justify-content:center"><button style="padding:20px 46px;border-radius:14px;border:2px solid #2e2e44;background:#1e1e30;color:#aaa;font-size:30px;cursor:pointer">Cancel</button><button style="padding:20px 46px;border-radius:14px;border:none;color:#1a1200;font-size:30px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,${c1},${c3})">Buy</button></div></div></div>`};
    d.innerHTML=fallbacks[ovId]||'';
    return d;
  }

  // Set backdrop color / background
  if(ovId==='ov-splash'){
    d.style.background=`radial-gradient(ellipse at 50% 40%,${c2},#030312)`;
  } else {
    d.style.background=meta?.bg||'#000000aa';
  }

  if(meta?.layout==='popup'){
    // Popup-style: centered card with title, description, and button row
    d.style.display='flex';d.style.alignItems='center';d.style.justifyContent='center';
    const box=document.createElement('div');
    box.style.cssText=`background:#161628;border:3px solid ${c1}66;border-radius:24px;padding:56px;max-width:720px;width:88%;text-align:center;box-shadow:0 0 80px ${c1}22;display:flex;flex-direction:column;align-items:center;gap:24px`;
    const btnRow=document.createElement('div');
    btnRow.style.cssText='display:flex;gap:20px;justify-content:center;margin-top:10px';
    subs.forEach(sub=>{
      const el=_buildOvSubEl(ovId,sub,c1,c3);
      if(sub.id==='btnCancel'||sub.id==='btnBuy'){ btnRow.appendChild(el); }
      else{ box.appendChild(el); }
    });
    if(btnRow.children.length) box.appendChild(btnRow);
    d.appendChild(box);
  } else {
    // Column-style: elements stacked vertically, centered
    d.style.cssText+=';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px';
    subs.forEach(sub=>{
      const el=_buildOvSubEl(ovId,sub,c1,c3);
      d.appendChild(el);
    });
  }
  return d;
}
function _buildOvSubEl(ovId,sub,c1,c3){
  const elId=`${ovId}-${sub.id}`;
  const txt=_ovText(ovId,sub.id);
  const color=getOvProp(ovId,sub.id,'dColor')||sub.dColor||'#fff';
  const size=getOvProp(ovId,sub.id,'dSize')||sub.dSize||40;
  const weight=getOvProp(ovId,sub.id,'dWeight')||sub.dWeight||600;
  const spacing=getOvProp(ovId,sub.id,'dSpacing')||sub.dSpacing||'0';
  let el;
  if(sub.type==='button'||sub.id==='btnCancel'||sub.id==='btnBuy'){
    el=document.createElement('button');
    if(sub.id==='btnCancel'){
      el.style.cssText=`padding:18px 44px;border-radius:12px;border:2px solid #2e2e44;background:#1e1e30;color:${color};font-size:28px;cursor:default;font-family:Space Grotesk,sans-serif`;
    } else {
      el.style.cssText=`padding:20px 80px;border-radius:40px;font-size:32px;font-weight:600;border:none;cursor:default;color:${color};background:linear-gradient(135deg,${c1},${c3});font-family:Space Grotesk,sans-serif`;
      if(sub.id==='btnBuy') el.style.cssText=`padding:18px 44px;border-radius:12px;border:none;color:${color};font-size:28px;font-weight:700;cursor:default;background:linear-gradient(135deg,${c1},${c3});font-family:Space Grotesk,sans-serif`;
    }
  } else {
    el=document.createElement('div');
    el.style.cssText=`font-size:${size}px;color:${color};font-weight:${weight};letter-spacing:${spacing};font-family:Space Grotesk,sans-serif;text-align:center;line-height:1.1`;
    // Special text-shadows for epic win
    if(ovId==='ov-epicwin'&&sub.id==='title') el.style.textShadow='0 0 120px #ff706088,0 0 60px #ff300066';
    if(ovId==='ov-bigwin'&&sub.id==='title') el.style.textShadow=`0 0 80px ${color}88`;
    if(ovId==='ov-fstrigger'&&sub.id==='title') el.style.textShadow=`0 0 60px ${color}88`;
    if(ovId==='ov-hnstrigger'&&sub.id==='title') el.style.textShadow=`0 0 60px ${color}88`;
    if(ovId==='ov-jpwin'&&sub.id==='title') el.style.textShadow=`0 0 80px ${color}88`;
  }
  el.id=elId;el.dataset.ov=ovId;el.dataset.sub=sub.id;
  el.textContent=txt;
  // Apply stored transform (move + scale)
  el.style.position='relative';
  const _t=getOvTransform(ovId,sub.id);
  // Disabled the old applyOvTransform because the entire outer `el` is heavily manipulated via standard PSD logic now
  // applyOvTransform(el,_t.tx,_t.ty,_t.scale);

  // Mousedown → Handled by cel bounding-box selection in editor.js standard flow!
  
  // Click → Handled by cel bounding-box selection
  
  // Double-click → inline text editing (text elements only)
  if(sub.type!=='button'&&sub.id!=='btnCancel'&&sub.id!=='btnBuy'){
    el.addEventListener('dblclick',ev=>{
      ev.stopPropagation();
      el.contentEditable='true';el.classList.add('ov-sub-edit');el.classList.remove('ov-sub-sel');
      el.focus();
      const range=document.createRange();range.selectNodeContents(el);
      const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
      const save=()=>{
        el.contentEditable='false';el.classList.remove('ov-sub-edit');el.classList.add('ov-sub-sel');
        const newTxt=el.textContent.trim()||_ovText(ovId,sub.id);
        setOvProp(ovId,sub.id,'dText',newTxt);
        // Sync properties panel
        const pi=document.getElementById('ovp-text');if(pi)pi.value=newTxt;
        renderOvLayers();
      };
      el.addEventListener('blur',save,{once:true});
      el.addEventListener('keydown',kev=>{
        if(kev.key==='Enter'){kev.preventDefault();el.blur();}
        if(kev.key==='Escape'){el.textContent=_ovText(ovId,sub.id);el.contentEditable='false';el.classList.remove('ov-sub-edit');el.classList.add('ov-sub-sel');}
      });
    });
  }
  return el;
}
function selectOvEl(ov,sub){
  // Deselect any canvas layer selection
  document.querySelectorAll('.cel.selected').forEach(e=>{e.classList.remove('selected');e.querySelectorAll('.rh').forEach(h=>h.remove());});
  document.querySelectorAll('.cel.multi-sel').forEach(e=>e.classList.remove('multi-sel'));
  SEL_KEY=null; SEL_KEYS=new Set();
  // Clear previous ov selection highlight + remove old handles
  document.querySelectorAll('.ov-sub-sel').forEach(e=>{e.classList.remove('ov-sub-sel');e.querySelectorAll('.rh').forEach(h=>h.remove());});
  SEL_OV_KEY={ov,sub};
  const el=document.getElementById(`${ov}-${sub}`);
  if(el){
    el.classList.add('ov-sub-sel');
    // Add resize handles so the user can scale the element
    ['tl','tc','tr','ml','mr','bl','bc','br'].forEach(pos=>{
      const h=document.createElement('div');h.className='rh '+pos;h.dataset.pos=pos;
      h.addEventListener('mousedown',ev=>{ev.stopPropagation();startOvResize(ev,ov,sub);});
      el.appendChild(h);
    });
  }
  // Open / update properties panel
  openOvPropsPanel(ov,sub);
  renderOvLayers();
}
function deselectOv(){
  document.querySelectorAll('.ov-sub-sel').forEach(e=>{e.classList.remove('ov-sub-sel');e.querySelectorAll('.rh').forEach(h=>h.remove());});
  SEL_OV_KEY=null;
  document.getElementById('ov-props-panel')?.classList.remove('show');
}
function openOvPropsPanel(ov,sub){
  const panel=document.getElementById('ov-props-panel'); if(!panel) return;
  const subDef=OV_SUBS[ov]?.find(s=>s.id===sub); if(!subDef) return;
  const ovLabel={'ov-bigwin':'Big Win','ov-megawin':'Mega Win','ov-epicwin':'Epic Win','ov-fstrigger':'Free Spins Trigger','ov-hnstrigger':'Hold & Spin Trigger','ov-jpwin':'Jackpot Win','ov-buypopup':'Buy Feature','ov-splash':'Splash','ov-win':'Win'}[ov]||ov;
  document.getElementById('ov-props-title').textContent=`${ovLabel} › ${subDef.label}`;
  const txtInp=document.getElementById('ovp-text');
  const colorInp=document.getElementById('ovp-color');
  const hexInp=document.getElementById('ovp-color-hex');
  const sizeInp=document.getElementById('ovp-size');
  const sizeRow=document.getElementById('ovp-size-row');
  const isBtn=subDef.type==='button'||sub==='btnCancel'||sub==='btnBuy';
  txtInp.value=getOvProp(ov,sub,'dText')||subDef.dText||'';
  const col=getOvProp(ov,sub,'dColor')||subDef.dColor||'#ffffff';
  colorInp.value=col.length===7?col:'#ffffff';
  hexInp.value=col;
  sizeRow.style.display=isBtn?'none':'flex';
  if(!isBtn) sizeInp.value=getOvProp(ov,sub,'dSize')||subDef.dSize||40;
  panel.dataset.ov=ov; panel.dataset.sub=sub;
  panel.classList.add('show');
}
function applyOvProps(){
  const panel=document.getElementById('ov-props-panel'); if(!panel?.classList.contains('show')) return;
  const ov=panel.dataset.ov, sub=panel.dataset.sub; if(!ov||!sub) return;
  const txt=document.getElementById('ovp-text').value.trim();
  const hex=document.getElementById('ovp-color-hex').value.trim();
  const sz=parseInt(document.getElementById('ovp-size').value);
  if(txt) setOvProp(ov,sub,'dText',txt);
  if(hex&&/^#[0-9a-f]{3,6}$/i.test(hex)) setOvProp(ov,sub,'dColor',hex);
  const subDef=OV_SUBS[ov]?.find(s=>s.id===sub);
  const isBtn=subDef?.type==='button'||sub==='btnCancel'||sub==='btnBuy';
  if(!isBtn&&sz>=8) setOvProp(ov,sub,'dSize',sz);
  // Rebuild the element in-place without full buildCanvas()
  const el=document.getElementById(`${ov}-${sub}`);
  if(el){
    const newTxt=txt||_ovText(ov,sub);
    if(el.contentEditable!=='true') el.textContent=newTxt;
    el.style.color=hex&&/^#[0-9a-f]{3,6}$/i.test(hex)?hex:(getOvProp(ov,sub,'dColor')||subDef?.dColor||'#fff');
    if(!isBtn&&sz>=8) el.style.fontSize=sz+'px';
  }
  renderOvLayers();
}
function renderOvLayers(){
  // Stubbed out! CSS layers are now dynamically rendered through renderLayers inside the PSD flow!
}

function openDimPropsPanel() {
    // Generate simple opacity panel if not created yet
    let dimPanel = document.getElementById('dim-props-panel');
    if(!dimPanel) {
        dimPanel = document.createElement('div');
        dimPanel.id = 'dim-props-panel';
        dimPanel.className = 'properties-panel';
        dimPanel.style.cssText = `position:absolute; right:270px; top:120px; width:220px; background:#111; border:1px solid #333; padding:15px; border-radius:8px; z-index:9000; box-shadow:0 10px 20px rgba(0,0,0,0.5); display:none;`;
        dimPanel.innerHTML = `
            <div style="font-size:12px; font-weight:bold; color:#fff; border-bottom:1px solid #333; padding-bottom:10px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                Dim Layer Opacity
                <span id="dim-panel-close" style="cursor:pointer; color:#888; font-size:14px;">✕</span>
            </div>
            <input type="range" id="dim-opacity-slider" min="0" max="1" step="0.05" value="0.75" style="width:100%;">
            <div id="dim-opacity-val" style="color:#aaa; font-size:11px; text-align:right; margin-top:5px;">75%</div>
        `;
        document.body.appendChild(dimPanel);

        document.getElementById('dim-panel-close').addEventListener('click', () => {
            dimPanel.style.display = 'none';
        });

        document.getElementById('dim-opacity-slider').addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById('dim-opacity-val').textContent = Math.round(v*100) + '%';
            P.dimOpacity = v;
            buildCanvas();
            markDirty();
        });
    }
    document.getElementById('dim-opacity-slider').value = P.dimOpacity !== undefined ? P.dimOpacity : 0.75;
    document.getElementById('dim-opacity-val').textContent = Math.round(document.getElementById('dim-opacity-slider').value*100) + '%';
    dimPanel.style.display = 'block';
}

function buildCanvas(){
  computeLayout(); // recalculate all positions from current reel config
  const gf = document.getElementById('gf');
  // Preserve balance-bar element across rebuilds
  const balBar=document.getElementById('balance-bar');
  gf.innerHTML = '';
  if(balBar) gf.appendChild(balBar);

  const _RS = P.reelSettings||{};
  const _OV = _RS.overlap||{};
  const _gfNeedsOverflow = (_RS.scale||1) !== 1 || (_OV.id && _OV.amount > 0);
  gf.style.overflow = _gfNeedsOverflow ? 'visible' : '';
  const gfOuter = document.getElementById('gf-outer');
  if(gfOuter) gfOuter.style.overflow = _gfNeedsOverflow ? 'visible' : '';

  // Determine what needs to render
  const isPopup = SDEFS[P.screen]?.group === 'popup' || P.screen === 'win';
  let keys = SDEFS[P.screen]?.keys||[];
  
  // Create a combined rendering list that includes Base Game layers BEHIND the popup UI
  let canvasKeys = [...keys];
  if(isPopup) {
    const baseSet = new Set(BASE_KEYS);
    keys.forEach(k => baseSet.delete(k)); // Don't duplicate keys
    canvasKeys = [...Array.from(baseSet), ...keys];
  }

  // Sort strictly by z-order
  const sorted = [...canvasKeys].sort((a,b)=>((PSD[a]?.z||5)-(PSD[b]?.z||5)));

  sorted.forEach(k=>{
    const def=PSD[k]; if(!def) return;
    const pos=getPos(k);

    // Visibility checks
    if(k==='char'&&!P.char.enabled) return;
    if(k==='bannerBuy'&&!P.features.buy_feature) return;
    if(k==='bannerAnte'&&!P.ante.enabled) return;
    if(k.startsWith('jp') && k!=='jpRow'){
      const jk=k.slice(2).toLowerCase();
      const jp=P.jackpots[jk];
      if(!jp||!jp.on||jp.exclude.includes(P.screen)) return;
    }

    const el=document.createElement('div');
    el.id='el-'+k; el.dataset.key=k;
    el.className='cel'+(isLocked(k)?' locked':'');
    el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${def.z||5}`;

    // IMPORTANT: Make base layers non-interactive entirely when under a popup
    if(isPopup && !keys.includes(k)) {
        el.style.pointerEvents = 'none';
        el.classList.add('popup-disabled'); // Optional styling
    }

    // ── RENDER BY KEY ──
    if(k==='bg'){
      el.style.overflow='hidden'; el.style.borderRadius='0'; el.style.pointerEvents='none'; el.style.cursor='default';
      // Per-screen bg override: check 'bg_<screen>' first, fall back to global 'bg'
      const bgKey = EL_ASSETS['bg_'+P.screen] ? 'bg_'+P.screen : (EL_ASSETS['bg'] ? 'bg' : null);
      if(bgKey){const img=document.createElement('img');img.src=EL_ASSETS[bgKey];img.style.cssText='width:100%;height:100%;object-fit:cover;pointer-events:none';el.appendChild(img);}else{el.appendChild(makeThemeBG(pos.w,pos.h));}

    }else if(k==='dimLayer'){
      // Background layer acting as the semi-transparent overlay
      const opacityRaw = P.dimOpacity !== undefined ? P.dimOpacity : 0.75;
      el.style.background = `rgba(0,0,0,${opacityRaw})`;
      el.style.pointerEvents = 'auto'; // Block clicks underneath
      const _vp=P.viewport==='desktop'?'landscape':P.viewport;
      const _vpDef=VP[_vp];
      // Maximize to full viewport dimensions
      el.style.left = _vpDef.cx + 'px'; el.style.top = _vpDef.cy + 'px';
      el.style.width = _vpDef.cw + 'px'; el.style.height = _vpDef.ch + 'px';

    }else if(def.type==='css_ov'){
      // Convert internal custom CSS elements into natural render chunks!
      const ovId = def.ovId;
      const sub = OV_SUBS[ovId]?.find(s => s.id === def.subId);
      if(sub){
        const c1=P.colors.t1?P.colors.c1:'#888';
        const c3=P.colors.t3?P.colors.c3:'#888';
        const inner = _buildOvSubEl(ovId, sub, c1, c3);
        // Strips any previous bounding sizes natively mapped inside `inner` to avoid component leaks
        // Inject cleanly into a generic Flex Wrapper taking the entire 2000px canvas to preserve button layout logic perfectly!
        const flexWrap = document.createElement('div');
        flexWrap.style.cssText = 'position:absolute;width:100%;height:100%;top:0;left:0;display:flex;justify-content:center;align-items:center';
        flexWrap.appendChild(inner);
        el.appendChild(flexWrap);

        // Optional: Re-calculate the initial `getPos` or size for these elements
        // if pos isn't formally established yet. Due to lack of bounding box initial specs,
        // we'll attempt to parse width/height naturally inside `cel`. 
        // For text elements, scale() transforms are often better than width/height resizing 
        // to avoid word wraps, which standard `startResize` bounding boxes would do.
      }
    }else if(k==='reelArea'){
      // ReelArea renders ON TOP of reelFrame (z:3 > z:2)
      // Container is transparent — visual styling comes from the reelFrame PNG overlay
      el.style.background='transparent';
      el.style.overflow='hidden';
      // Cell size comes from computeLayout() — fits reel config in viewport
      const[cols,rows]=parseReel(P.reelset);
      const vp=P.viewport==='desktop'?'landscape':P.viewport;
      const RS=P.reelSettings||{scale:1,padX:8,padY:8,overlap:{id:null,amount:0}};
      const BASE_CELL=EL_COMPUTED._cellSize?.[vp]||164;
      const CELL=Math.round(BASE_CELL*(RS.scale||1));
      const GAP_X=RS.padX??8;
      const GAP_Y=RS.padY??8;
      const OV=RS.overlap||{id:null,amount:0};
      // Allow scaled/overlapped content to bleed outside the reelArea bounds
      const _needsOverflow = (RS.scale||1) !== 1 || (OV.id && OV.amount > 0);
      el.style.overflow = _needsOverflow ? 'visible' : 'hidden';
      const gridW=cols*CELL+(cols-1)*GAP_X;
      const gridH=rows*CELL+(rows-1)*GAP_Y;
      const offX=Math.round((pos.w-gridW)/2);
      const offY=Math.round((pos.h-gridH)/2);
      for(let row=0;row<rows;row++){
        for(let col=0;col<cols;col++){
          const idx=row*cols+col;
          const dispW=Math.round(CELL);
          const dispH=Math.round(CELL);
          const cell=makeSymbolCell(idx,dispW,dispH);
          cell.style.position='absolute';
          const slotX=offX+col*(CELL+GAP_X);
          const slotY=offY+row*(CELL+GAP_Y);
          cell.style.left=(slotX)+'px';
          cell.style.top=(slotY)+'px';
          cell.style.width=dispW+'px';
          cell.style.height=dispH+'px';
          el.appendChild(cell);
        }
      }

    }else if(k==='reelFrame'){
      // ReelFrame renders BEHIND symbols (z:2 < reelArea z:3)
      // It acts as a decorative border/artwork that symbols sit in front of
      el.style.background='transparent';
      el.style.cursor='pointer';
      // pointer-events:auto — reel frame is selectable and draggable like any layer
      el.dataset.key=k;
      if(EL_ASSETS[k]){
        // Uploaded frame PNG — full-bleed, alpha channel shows symbols through
        const img=document.createElement('img');
        img.src=EL_ASSETS[k];
        img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';
        el.appendChild(img);
      } else {
        // Clean PNG placeholder — no CSS decoration
        el.appendChild(makeImgSlot('REEL FRAME','drop png'));
      }

    }else if(k==='jpRow'){
      // jpRow is a transparent group-anchor bounding box — visual content rendered by each jp sentinel
      const anyJpOn=['grand','major','minor','mini'].some(jk=>P.jackpots[jk]?.on&&!P.jackpots[jk]?.exclude?.includes(P.screen));
      if(!anyJpOn) return;
      el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${(PSD.jpGrand?.z||5)-1};background:transparent;pointer-events:none`;

    }else if(k.startsWith('jp')&&k!=='jpRow'){
      // Each JP sentinel is a fully self-contained bar: renders placeholder or uploaded asset
      const jk=k.slice(2).toLowerCase(); // 'jpGrand' → 'grand'
      const jp=P.jackpots[jk];
      const jcols={mini:'#4ac8f0',minor:'#5eca8a',major:'#c9a84c',grand:'#ef7a7a'};
      const jc=jcols[jk]||c1;
      el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${def.z||5};overflow:hidden;border-radius:6px;cursor:pointer;border:1px solid rgba(255,255,255,0.06)`;
      if(EL_ASSETS[k]){
        const img=document.createElement('img');
        img.src=EL_ASSETS[k];
        img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';
        el.appendChild(img);
      } else {
        el.style.background=`linear-gradient(135deg,${jc}22,${jc}08)`;
        el.style.borderLeft=`2px solid ${jc}44`;
        const nameSz=Math.max(Math.round(pos.h*0.28),9);
        const valSz=Math.max(Math.round(pos.h*0.35),11);
        const ov=document.createElement('div');
        ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;pointer-events:none';
        const lbl=(document.getElementById('jp-lbl-'+jk)?.value||jk).toUpperCase();
        const nl=document.createElement('div');
        nl.style.cssText=`font-size:${nameSz}px;color:${jc};font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif;text-transform:uppercase;text-shadow:0 1px 4px #00000099;white-space:nowrap`;
        nl.textContent=lbl;
        const vl=document.createElement('div');
        vl.style.cssText=`font-size:${valSz}px;color:#fff;font-weight:800;font-family:Space Grotesk,sans-serif;text-shadow:0 1px 6px #00000099;white-space:nowrap`;
        vl.textContent=jp?.val||'–';
        ov.appendChild(nl); ov.appendChild(vl);
        el.appendChild(ov);
      }
      el.addEventListener('click',e=>{e.stopPropagation();if(TOOL==='pan')return;selectEl(k);});
      el.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();openCtxPanel(k,e.clientX,e.clientY);selectEl(k);});
      el.addEventListener('mousedown',e=>{if(e.button===2||TOOL==='pan')return;selectEl(k);startJpGroupMove(e);});

    }else if(k==='logo'){
      el.style.overflow='hidden'; el.style.borderRadius='14px';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:inherit';el.appendChild(img);}else{el.appendChild(makePH('logo',pos.w,pos.h,P.gameName.toUpperCase(),c1));}

    }else if(k==='char'){
      el.style.overflow='hidden';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:inherit';el.appendChild(img);}else{el.appendChild(makePH('char',pos.w,pos.h,'',c1));}

    }else if(k==='settings'){
      el.style.borderRadius='50%'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:50%;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('SETTINGS','png'));}
      el.appendChild(inner);

    }else if(k==='bannerBet'){
      el.style.borderRadius='10px'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:10px;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('BET PANEL'));}
      const bsz=Math.max(Math.round(pos.h*0.3),12);
      const bsz2=Math.max(Math.round(pos.h*0.22),10);
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;pointer-events:none';
      ov.innerHTML=`<div style="font-size:${bsz}px;color:#fff;font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif;text-shadow:0 1px 4px #00000099">BET</div><div style="font-size:${bsz2}px;color:#c9a84c;font-weight:600;font-family:Space Grotesk,sans-serif;text-shadow:0 1px 4px #00000099">€ 5.00</div>`;
      inner.appendChild(ov);
      el.appendChild(inner);

    }else if(k==='bannerBuy'){
      el.style.borderRadius='10px'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:10px;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('BUY BONUS'));}
      const bsz=Math.max(Math.round(pos.h*0.28),11);
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none';
      ov.innerHTML=`<div style="font-size:${bsz}px;color:#fff;font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif;text-shadow:0 1px 4px #00000099;text-align:center;line-height:1.25">BUY<br>BONUS</div>`;
      inner.appendChild(ov);
      el.appendChild(inner);

    }else if(k==='bannerAnte'){
      el.style.borderRadius='10px'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:10px;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('ANTE BET'));}
      const asz=Math.max(Math.round(pos.h*0.28),10);
      const albl=P.ante.label||'Ante Bet';
      const ov=document.createElement('div');
      ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;pointer-events:none';
      ov.innerHTML=`<div style="font-size:${asz}px;color:#fff;font-weight:700;letter-spacing:.06em;font-family:Space Grotesk,sans-serif;text-shadow:0 1px 4px #00000099;text-transform:uppercase">${escH(albl)}</div><div style="font-size:${Math.round(asz*0.75)}px;color:rgba(255,255,255,0.7);font-family:Space Grotesk,sans-serif;text-shadow:0 1px 3px #00000099">1.25×</div>`;
      inner.appendChild(ov);
      el.appendChild(inner);

    }else if(k==='spinBtn'){
      el.style.borderRadius='50%'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:50%;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('SPIN BTN','png'));}
      el.appendChild(inner);

    }else if(k==='autoBtn'){
      el.style.borderRadius='50%'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:50%;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('AUTO','png'));}
      el.appendChild(inner);

    }else if(k==='turboBtn'){
      el.style.borderRadius='50%'; el.style.cursor='pointer';
      const inner=document.createElement('div');inner.style.cssText='position:absolute;inset:0;border-radius:50%;overflow:hidden;';
      if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none';inner.appendChild(img);}else{inner.appendChild(makeImgSlot('TURBO','png'));}
      el.appendChild(inner);

    }else if(k==='msgLabel'){
      el.style.display='flex';el.style.alignItems='center';el.style.justifyContent='center';
      el.style.textAlign='center';el.style.color='#ffffff44';
      el.style.fontSize=Math.max(Math.round(pos.h*0.5),13)+'px';
      el.style.letterSpacing='.08em';
      el.style.cursor='text';
      el.title='Double-click to edit text';
      el.textContent=document.getElementById('msg-txt')?.value||'18+ · Play Responsibly';
    }

    // Apply stored asset
    // Only apply uploaded asset image for layers that don't have custom canvas rendering
    // These keys handle their own PNG rendering inline (including text overlays)
    const CUSTOM_RENDER_KEYS = new Set(['reelArea','bg','logo','char','reelFrame','settings','spinBtn','autoBtn','turboBtn','bannerBet','bannerBuy','bannerAnte','jpRow','jpGrand','jpMajor','jpMinor','jpMini']);
    if(EL_ASSETS[k] && !CUSTOM_RENDER_KEYS.has(k)){
      el.innerHTML='';
      const img=document.createElement('img');
      img.src=EL_ASSETS[k];
      img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:inherit';
      el.appendChild(img);
    }
    // Apply stored adjustments
    // JP sentinels handle their own events above — skip generic wiring for them
    const isJpSentinel = k.startsWith('jp') && k!=='jpRow';
    if(!isJpSentinel){
      const _adj=getAdj(k);
      el.style.filter=`brightness(${1+_adj.brightness/100}) contrast(${1+_adj.contrast/100}) saturate(${1+_adj.saturation/100})`;
      el.style.opacity=(_adj.opacity/100).toFixed(2);
    }

    // ALL elements get right-click context panel (including bg), except JP sentinels (already wired)
    if(!isJpSentinel){
      el.addEventListener('contextmenu', e=>{
        e.preventDefault(); e.stopPropagation();
        openCtxPanel(k, e.clientX, e.clientY);
        selectEl(k);
      });

      if(!def.locked){
        el.addEventListener('mousedown', e=>{
          if(e.button===2) return;
          if(TOOL==='pan') return;
          startMove(e,k);
        });
        el.addEventListener('click', e=>{
          // Symbol cell click or reel area click → Reel Settings panel
          const symCell = e.target.closest ? e.target.closest('[data-sym-idx]') : null;
          if(symCell || k==='reelArea'){
            e.stopPropagation();
            if(TOOL==='pan') return;
            if(typeof openReelSettings==='function') openReelSettings();
            return;
          }
          if(e.target.dataset.symIdx) return;
          e.stopPropagation();
          if(TOOL==='pan') return;
          if(TOOL==='select'){
            canvasAutoSelect(e.clientX, e.clientY);
          } else {
            selectEl(k);
          }
        });
      } else if(k!=='bg'){
        // Locked non-bg layers: selectable but not moveable
        el.addEventListener('click', e=>{
          e.stopPropagation();
          if(TOOL==='pan') return;
          selectEl(k);
        });
      }
      // bg: no click/mousedown handlers — pointer-events:none ensures clicks pass through for rubber-band select
    }
    // Apply saved mask
    applyMaskToEl(k);
    // Apply blend mode
    if(EL_BLEND_MODES[k] && EL_BLEND_MODES[k] !== 'normal') el.style.mixBlendMode = EL_BLEND_MODES[k];
    // Apply HIDDEN_LAYERS after all rendering
    if(HIDDEN_LAYERS.has(k)){el.style.opacity='0';el.style.pointerEvents='none';}
    // Library drag-drop: accept asset drops onto canvas elements
    if(!isJpSentinel){
      el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';el.style.outline='2px dashed #c9a84c';el.style.outlineOffset='2px';});
      el.addEventListener('dragleave',()=>{el.style.outline='';el.style.outlineOffset='';});
      el.addEventListener('drop',e=>{
        e.preventDefault();e.stopPropagation();el.style.outline='';el.style.outlineOffset='';
        const raw=e.dataTransfer.getData('application/sf-lib');if(!raw)return;
        try{const asset=JSON.parse(raw);applyAssetToLayer(k,asset.data);}catch(err){}
      });
    }
    // ── Inline text editing: double-click to edit text content directly on canvas ──
    if(k==='msgLabel'){
      el.addEventListener('dblclick',e=>{
        e.stopPropagation();
        if(HIDDEN_LAYERS.has(k)) return;
        el.contentEditable='true';
        el.style.outline='2px solid #c9a84c88';
        el.style.outlineOffset='3px';
        el.style.cursor='text';
        el.style.userSelect='text';
        el.focus();
        // Select all existing text
        const range=document.createRange();range.selectNodeContents(el);
        const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);
        const save=()=>{
          el.contentEditable='false';
          el.style.outline='';el.style.outlineOffset='';el.style.cursor='';el.style.userSelect='';
          const txt=el.textContent.trim()||'18+ · Play Responsibly';
          const inp=document.getElementById('msg-txt');
          if(inp){inp.value=txt;}
          markDirty();
        };
        el.addEventListener('blur',save,{once:true});
        el.addEventListener('keydown',ev=>{
          if(ev.key==='Enter'){ev.preventDefault();el.blur();}
          if(ev.key==='Escape'){
            el.textContent=document.getElementById('msg-txt')?.value||'18+ · Play Responsibly';
            el.contentEditable='false';el.style.outline='';el.style.outlineOffset='';el.style.cursor='';el.style.userSelect='';
          }
        });
      });
    }
    gf.appendChild(el);
  });

  if(SEL_KEY)selectEl(SEL_KEY);
  positionBalanceBar();
  applyZoom();
}

// ═══ SELECTION + HANDLES ═══
function selectEl(k){
  if(typeof window.positionInlineCtx==='function') window.positionInlineCtx(k);

  document.querySelectorAll('.cel.selected').forEach(e=>{e.classList.remove('selected');e.querySelectorAll('.rh').forEach(h=>h.remove());});
  document.querySelectorAll('.cel.multi-sel').forEach(e=>e.classList.remove('multi-sel'));
  SEL_KEY=k; SEL_KEYS=new Set();
  const el=document.getElementById('el-'+k);
  if(!el)return;
  el.classList.add('selected');
  if(!isLocked(k)){
    ['tl','tc','tr','ml','mr','bl','bc','br'].forEach(pos=>{
      const h=document.createElement('div');h.className='rh '+pos;h.dataset.pos=pos;
      h.addEventListener('mousedown',e=>startResize(e,k,pos));
      el.appendChild(h);
    });
  }
  
  // Specific handler for old css overlays: Hook up text editing properties sync
  if(PSD[k]?.type === 'css_ov' || PSD[k]?.type === 'dimLayer') {
     if(PSD[k].type === 'dimLayer') {
         openDimPropsPanel();
     } else {
         openOvPropsPanel(PSD[k].ovId, PSD[k].subId);
     }
  } else {
     document.getElementById('ov-props-panel')?.classList.remove('show');
     // Wait, dim props might have another panel, hide that too
     document.getElementById('dim-props-panel')?.classList.remove('show');
  }

  const keys=SDEFS[P.screen]?.keys||[];
  const idx=keys.indexOf(k);if(idx>=0){P.activeLayer=idx;renderLayers();}
  document.getElementById('sb-lyr').textContent=PSD[k]?.label||k;
  document.getElementById('ctx-lyr').textContent=PSD[k]?.label||k;
  document.getElementById('ctx-lyr').className='ct on';
  updateSelInfo();
}
function updateSelInfo(){
  if(!SEL_KEY)return;
  const k=SEL_KEY;const pos=getPos(k);
  const si=document.getElementById('sel-info');
  if(si){si.textContent=`${PSD[k]?.label||k}  ·  x:${pos.x}  y:${pos.y}  ${pos.w}×${pos.h}`;si.style.display='block';}
}
function deselect(){
  document.querySelectorAll('.cel.selected').forEach(e=>{e.classList.remove('selected');e.querySelectorAll('.rh').forEach(h=>h.remove());});
  document.querySelectorAll('.cel.multi-sel').forEach(e=>e.classList.remove('multi-sel'));
  SEL_KEY=null; SEL_KEYS=new Set();
  const si=document.getElementById('sel-info');if(si)si.style.display='none';
  document.getElementById('sb-lyr').textContent='—';
  document.getElementById('ctx-lyr').textContent='No layer';
  document.getElementById('ctx-lyr').className='ct';
  P.activeLayer=null;renderLayers();
}

// ═══ MOVE ═══
function startMove(e,k){
  if(e.target.classList.contains('rh'))return;
  e.preventDefault();e.stopPropagation();
  selectEl(k);
  const sx=e.clientX,sy=e.clientY;
  const orig={...getPos(k)};
  const commit=beginAction('move '+k);
  let rafId=null;
  function mv(ev){
    const cx=ev.clientX,cy=ev.clientY;
    if(rafId)cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(function(){
      rafId=null;
      let nx=orig.x+Math.round((cx-sx)/ZOOM);
      let ny=orig.y+Math.round((cy-sy)/ZOOM);
      // Snap to viewport centre lines when SNAP_ENABLED
      if(typeof SNAP_ENABLED!=='undefined'&&SNAP_ENABLED){
        const vp=P.viewport==='landscape'?'landscape':'portrait';
        const b=VP[vp]||{cx:0,cy:0,cw:2000,ch:2000};
        const snapCX=b.cx+Math.round(b.cw/2);
        const snapCY=b.cy+Math.round(b.ch/2);
        const elCX=nx+Math.round(orig.w/2),elCY=ny+Math.round(orig.h/2);
        const thr=typeof SNAP_THRESHOLD!=='undefined'?SNAP_THRESHOLD:10;
        let snX=false,snY=false;
        if(Math.abs(elCX-snapCX)<thr){nx=snapCX-Math.round(orig.w/2);if(typeof showSnapGuide==='function')showSnapGuide('v',snapCX);snX=true;}
        if(Math.abs(elCY-snapCY)<thr){ny=snapCY-Math.round(orig.h/2);if(typeof showSnapGuide==='function')showSnapGuide('h',snapCY);snY=true;}
        if(!snX&&!snY&&typeof hideSnapGuides==='function')hideSnapGuides();
      }
      const p={...orig,x:nx,y:ny};
      setPos(k,p);
      const el=document.getElementById('el-'+k);
      if(el){el.style.left=p.x+'px';el.style.top=p.y+'px';}
      updateSelInfo();
    });
  }
  function up(){if(rafId)cancelAnimationFrame(rafId);if(typeof hideSnapGuides==='function')hideSnapGuides();commit();document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}

// ── JP group move: drags all JP bar sentinels + jpRow together as a single unit ──
const JP_GROUP_KEYS = ['jpRow','jpGrand','jpMajor','jpMinor','jpMini'];
function startJpGroupMove(e){
  if(e.target.classList.contains('rh')) return;
  e.preventDefault(); e.stopPropagation();
  const sx=e.clientX, sy=e.clientY;
  const origPos={};
  JP_GROUP_KEYS.forEach(k=>{ origPos[k]={...getPos(k)}; });
  const commit=beginAction('move JP bars');
  let rafId=null;
  function mv(ev){
    const cx=ev.clientX,cy=ev.clientY;
    if(rafId)cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(function(){
      rafId=null;
      const dx=Math.round((cx-sx)/ZOOM), dy=Math.round((cy-sy)/ZOOM);
      JP_GROUP_KEYS.forEach(k=>{
        const p={...origPos[k], x:origPos[k].x+dx, y:origPos[k].y+dy};
        setPos(k,p);
        const el=document.getElementById('el-'+k);
        if(el){el.style.left=p.x+'px';el.style.top=p.y+'px';}
      });
      updateSelInfo();
    });
  }
  function up(){if(rafId)cancelAnimationFrame(rafId);commit();document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
  document.addEventListener('mousemove',mv);
  document.addEventListener('mouseup',up);
}

// ═══ RESIZE ═══
function startResize(e,k,handle){
  e.preventDefault();e.stopPropagation();
  const sx=e.clientX,sy=e.clientY,orig={...getPos(k)};
  const aspect=orig.w/orig.h; // lock aspect ratio — computed once, never from intermediate values
  const commit=beginAction('resize '+k);
  let rafId=null;
  function mv(ev){
    const cx=ev.clientX,cy=ev.clientY;
    if(rafId)cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(function(){
      rafId=null;
      const dx=Math.round((cx-sx)/ZOOM),dy=Math.round((cy-sy)/ZOOM);
      let{x,y,w,h}=orig;
      // Determine primary resize axis from handle
      const isCorner=handle.length===2; // tl, tr, bl, br
      if(isCorner){
        // Corner drag: use larger delta to drive both, maintain aspect
        if(handle==='br'){ w=Math.max(40,orig.w+dx); h=Math.round(w/aspect); }
        else if(handle==='bl'){ w=Math.max(40,orig.w-dx); h=Math.round(w/aspect); x=orig.x+orig.w-w; }
        else if(handle==='tr'){ w=Math.max(40,orig.w+dx); h=Math.round(w/aspect); y=orig.y+orig.h-h; }
        else if(handle==='tl'){ w=Math.max(40,orig.w-dx); h=Math.round(w/aspect); x=orig.x+orig.w-w; y=orig.y+orig.h-h; }
      } else {
        // Edge drag: resize on that axis, derive the other from aspect
        if(handle==='mr'){ w=Math.max(40,orig.w+dx); h=Math.round(w/aspect); y=orig.y+Math.round((orig.h-h)/2); }
        else if(handle==='ml'){ w=Math.max(40,orig.w-dx); h=Math.round(w/aspect); x=orig.x+orig.w-w; y=orig.y+Math.round((orig.h-h)/2); }
        else if(handle==='bc'){ h=Math.max(40,orig.h+dy); w=Math.round(h*aspect); x=orig.x+Math.round((orig.w-w)/2); }
        else if(handle==='tc'){ h=Math.max(40,orig.h-dy); w=Math.round(h*aspect); x=orig.x+Math.round((orig.w-w)/2); y=orig.y+orig.h-h; }
      }
      setPos(k,{x,y,w,h});
      const el=document.getElementById('el-'+k);
      if(el){el.style.left=x+'px';el.style.top=y+'px';el.style.width=w+'px';el.style.height=h+'px';}
      updateSelInfo();
    });
  }
  // up: cancel any pending frame, commit, re-attach handles via selectEl — no full buildCanvas() needed
  function up(){if(rafId)cancelAnimationFrame(rafId);commit();selectEl(k);document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
}

// Canvas click to deselect
// Auto-select toggle
// Tool modes: 'move' = direct click selects element; 'select' = click selects topmost at point; 'pan' = drag to pan
let TOOL = 'move'; // default: direct selection (like Photoshop Move tool)
function setTool(tool){
  TOOL=tool;
  // Update tool panel buttons
  document.querySelectorAll('.tool-btn').forEach(b=>{
    b.classList.remove('active','active-pan');
  });
  const activeBtn=document.getElementById('tool-'+tool);
  if(activeBtn) activeBtn.classList.add(tool==='pan'?'active-pan':'active');
  // Also update move button as default
  if(tool==='move') document.getElementById('tool-move')?.classList.add('active');
  // Cursor
  const cw=document.getElementById('canvas-wrap');
  if(cw) cw.style.cursor=tool==='pan'?'grab':tool==='eyedropper'?'crosshair':'default';
}
function toggleCanvasOverflow(){
  const outer = document.getElementById('gf-outer');
  const btn = document.getElementById('tool-overflow');
  const isOn = outer.dataset.overflow === '1';
  if(isOn){
    outer.dataset.overflow = '0';
    outer.style.overflow = 'hidden';
    document.getElementById('crop-indicator')?.remove();
    btn?.classList.remove('active');
  } else {
    outer.dataset.overflow = '1';
    outer.style.overflow = 'visible';
    // Draw a crop boundary indicator on gf
    const gf = document.getElementById('gf');
    document.getElementById('crop-indicator')?.remove();
    const vp = VP[P.viewport==='desktop'?'landscape':P.viewport];
    const ind = document.createElement('div');
    ind.id = 'crop-indicator';
    ind.style.cssText = `position:absolute;left:${vp.cx}px;top:${vp.cy}px;width:${vp.cw}px;height:${vp.ch}px;border:2px dashed #c9a84c88;pointer-events:none;z-index:9999;box-sizing:border-box`;
    const lbl = document.createElement('div');
    lbl.style.cssText = 'position:absolute;top:-18px;left:0;font-size:9px;color:#c9a84c88;font-family:Space Grotesk,sans-serif;white-space:nowrap';
    lbl.textContent = 'Canvas boundary';
    ind.appendChild(lbl);
    gf.appendChild(ind);
    btn?.classList.add('active');
  }
}
function toggleAutoSelect(){ setTool(TOOL==='select'?'move':'select'); }
function togglePan(){ setTool(TOOL==='pan'?'move':'pan'); }
// Wire tool panel buttons
document.querySelectorAll('.tool-btn[data-tool]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const t=btn.dataset.tool;
    if(t==='zoom-in'){ZOOM=Math.min(2,ZOOM+0.15);applyZoom();}
    else if(t==='zoom-out'){ZOOM=Math.max(0.1,ZOOM-0.15);applyZoom();}
    else if(t==='zoom-fit'){fitZoom();}
    else if(t==='note'){alert('Note tool — annotation pins coming in next release.');}
    else{setTool(TOOL===t?'move':t);}
  });
});

// Shared auto-select helper — finds topmost layer at screen coords and selects it
function canvasAutoSelect(clientX, clientY){
  const outer=document.getElementById('gf-outer');
  const rect=outer.getBoundingClientRect();
  const vp=VP[P.viewport==='desktop'?'landscape':P.viewport];
  const canvasX=(clientX-rect.left)/ZOOM+vp.cx;
  const canvasY=(clientY-rect.top)/ZOOM+vp.cy;
  const keys=SDEFS[P.screen]?.keys||[];
  let bestKey=null,bestZ=-1;
  keys.forEach(k=>{
    const def=PSD[k]; if(!def) return;
    const pos=getPos(k);
    if(canvasX>=pos.x&&canvasX<=pos.x+pos.w&&canvasY>=pos.y&&canvasY<=pos.y+pos.h){
      const z=def.z||5;
      if(z>bestZ){bestZ=z;bestKey=k;}
    }
  });
  if(bestKey) selectEl(bestKey); else deselect();
}

// Canvas wrap click: only fires when hitting the wrap/gf background (elements stopPropagation)
document.getElementById('canvas-wrap').addEventListener('click', e=>{
  if(TOOL==='pan') return;
  const hitCel=e.target.closest('.cel');
  if(!hitCel){
    if(TOOL==='select') canvasAutoSelect(e.clientX, e.clientY);
    else deselect();
  }
  // If hitCel: element's own click handler already fired (and called selectEl or canvasAutoSelect)
});

// Right-click on empty canvas area → open background context panel.
// The bg layer has pointer-events:none so right-clicks pass through it to canvas-wrap.
// We catch them here when no .cel with pointer-events was under the cursor.
document.getElementById('canvas-wrap').addEventListener('contextmenu', e=>{
  // If a .cel already handled the contextmenu (stopped propagation) this handler won't fire.
  // We arrive here only when the right-click hit empty canvas = visually over the background.
  const hitCel = e.target.closest ? e.target.closest('.cel') : null;
  if(!hitCel){
    e.preventDefault();
    e.stopPropagation();
    if(typeof openCtxPanel === 'function' && PSD && PSD['bg']){
      openCtxPanel('bg', e.clientX, e.clientY);
      selectEl('bg');
    }
  }
});

// ─── Drag-and-drop from shell asset panel onto canvas ────────────────────────
// When the user drags an asset row from the React shell's AssetsPanel and drops
// it onto the canvas iframe, the browser fires dragover / drop inside the iframe.
// We intercept here, resolve the target slot, and apply the image immediately.
(function(){
  var SF_ASSET_KEY_MAP = {
    background_base:  'bg',
    background_bonus: 'bg_bonus',
    symbol_high_1:    'sym_H1',  symbol_high_2: 'sym_H2',  symbol_high_3: 'sym_H3',
    symbol_high_4:    'sym_H4',  symbol_high_5: 'sym_H5',  symbol_high_6: 'sym_H6',
    symbol_high_7:    'sym_H7',  symbol_high_8: 'sym_H8',
    symbol_low_1:     'sym_L1',  symbol_low_2:  'sym_L2',  symbol_low_3:  'sym_L3',
    symbol_low_4:     'sym_L4',  symbol_low_5:  'sym_L5',  symbol_low_6:  'sym_L6',
    symbol_low_7:     'sym_L7',  symbol_low_8:  'sym_L8',
    symbol_wild:      'sym_Wild',
    symbol_scatter:   'sym_Scatter',
    symbol_special_3: 'sym_Special3',
    symbol_special_4: 'sym_Special4',
    symbol_special_5: 'sym_Special5',
    symbol_special_6: 'sym_Special6',
    logo:             'logo',
    character:        'char',
    reel_frame:       'reel_frame',
    spin_button:      'spin_button',
    jackpot_label:    'jackpot_label',
  };

  var canvasWrap = document.getElementById('canvas-wrap');
  if(!canvasWrap) return;

  // Allow drops on the canvas
  canvasWrap.addEventListener('dragover', function(e){
    try {
      // Only accept drops that carry our asset JSON payload
      var types = e.dataTransfer ? e.dataTransfer.types : [];
      var hasText = Array.prototype.indexOf.call(types, 'text/plain') !== -1
                 || Array.prototype.indexOf.call(types, 'Text') !== -1;
      if(hasText){ e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
    } catch(err){}
  });

  canvasWrap.addEventListener('drop', function(e){
    try {
      e.preventDefault();
      var raw = e.dataTransfer && e.dataTransfer.getData('text/plain');
      if(!raw) return;
      var payload;
      try { payload = JSON.parse(raw); } catch(pe){ return; }
      if(!payload || !payload.url) return;

      var elKey;

      // If dropped onto a specific symbol cell, use that cell's sym key
      var hitCel = e.target && e.target.closest ? e.target.closest('[data-sym-id]') : null;
      if(hitCel && hitCel.dataset.symId){
        elKey = 'sym_' + hitCel.dataset.symId;
      } else if(payload.assetType){
        elKey = SF_ASSET_KEY_MAP[payload.assetType] || payload.assetType;
      }

      if(!elKey) return;

      // Apply the URL directly (already a CDN URL from the panel)
      EL_ASSETS[elKey] = payload.url;
      if(typeof buildCanvas  === 'function') buildCanvas();
      if(typeof renderLayers === 'function') renderLayers();
      if(typeof markDirty    === 'function') markDirty();

      // Show a brief drop-success flash on the target cell or canvas
      var flashEl = hitCel || canvasWrap;
      if(flashEl){
        var origOutline = flashEl.style.outline;
        flashEl.style.outline = '2px solid #34d399';
        setTimeout(function(){ flashEl.style.outline = origOutline; }, 800);
      }

      // Notify the shell that a canvas asset changed (triggers assetRefreshTick)
      window.parent.postMessage({ type: 'SF_ASSET_CDN_URL', assetKey: elKey, url: payload.url }, '*');
    } catch(err){ console.warn('[SF] drag-drop failed:', err); }
  });
})();

// Keyboard
document.addEventListener('keydown',e=>{
  if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='z'){e.preventDefault();redo();return;}
  if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo();return;}
  if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key==='s'){e.preventDefault();saveProjectFile(true);return;}
  if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();saveProject();return;}
  // Layer z-order: ⌘] forward, ⌥⌘] bring to front, ⌘[ backward, ⌥⌘[ send to back
  if((e.metaKey||e.ctrlKey)&&(e.key===']'||e.key==='[')){
    e.preventDefault();
    const lk=SEL_KEY||(P.activeLayer!=null?SDEFS[P.screen]?.keys?.[P.activeLayer]:null);
    if(lk) layerReorder(lk, e.key===']'?(e.altKey?'front':'forward'):(e.altKey?'back':'backward'));
    return;
  }
  if((e.metaKey||e.ctrlKey)&&e.key==='o'){e.preventDefault();loadProjectFile();return;}
  if(e.key==='a'&&!e.metaKey&&!e.ctrlKey&&!e.target.matches('input,textarea,select')){e.preventDefault();toggleAutoSelect();return;}
  if(e.key==='o'&&!e.metaKey&&!e.ctrlKey&&!e.target.matches('input,textarea,select')){e.preventDefault();toggleCanvasOverflow();return;}
  if(e.key==='h'&&!e.metaKey&&!e.ctrlKey&&!e.target.matches('input,textarea,select')){e.preventDefault();togglePan();return;}
  if(e.key==='v'&&!e.metaKey&&!e.ctrlKey&&!e.target.matches('input,textarea,select')){e.preventDefault();setTool('move');return;}
  if(e.key==='+'||e.key==='='){if(!e.metaKey&&!e.ctrlKey){ZOOM=Math.min(2,ZOOM+0.15);applyZoom();}}
  if(e.key==='-'){if(!e.metaKey&&!e.ctrlKey){ZOOM=Math.max(0.1,ZOOM-0.15);applyZoom();}}
  if(e.key==='0'&&!e.metaKey&&!e.ctrlKey){fitZoom();resetPan();}
  if(e.key==='Escape'){setTool('move');return;}
  if(!SEL_KEY||P.screen==='project')return;
  const step=e.shiftKey?10:1;
  if(e.key==='Escape'){deselect();return;}
  // Delete selected layer (Del / Backspace)
  if((e.key==='Delete'||e.key==='Backspace')&&SEL_KEY){
    if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    e.preventDefault();
    deleteAnyLayer(SEL_KEY);
    return;
  }
  let p={...getPos(SEL_KEY)};
  if(e.key==='ArrowLeft'){p.x-=step;}
  else if(e.key==='ArrowRight'){p.x+=step;}
  else if(e.key==='ArrowUp'){p.y-=step;}
  else if(e.key==='ArrowDown'){p.y+=step;}
  else return;
  e.preventDefault();
  setPos(SEL_KEY,p);
  const nel=document.getElementById('el-'+SEL_KEY);
  if(nel){nel.style.left=p.x+'px';nel.style.top=p.y+'px';}
  updateSelInfo();
  pushHistory('nudge '+SEL_KEY);
});

// Mousewheel zoom
document.getElementById('canvas-wrap').addEventListener('wheel',e=>{e.preventDefault();ZOOM=Math.max(0.1,Math.min(2,ZOOM+(e.deltaY<0?0.06:-0.06)));applyZoom();},{passive:false});

// PAN tool — canvas panning via scrollable container
// canvas-wrap must be overflow:hidden with flex centering; we shift gf-outer via translate
let _panStart=null, _panOX=0, _panOY=0;

function applyPanOffset(){
  const outer=document.getElementById('gf-outer');
  if(outer) outer.style.transform=`translate(${_panOX}px,${_panOY}px)`;
}
function resetPan(){_panOX=0;_panOY=0;applyPanOffset();}

// ── Rubber-band (marquee) multi-select ──
function startMarqueeSelect(e){
  const cw=document.getElementById('canvas-wrap');
  const cwRect=cw.getBoundingClientRect();
  const startX=e.clientX-cwRect.left;
  const startY=e.clientY-cwRect.top;
  const rectEl=document.createElement('div');
  rectEl.className='sel-rect';
  rectEl.style.left=startX+'px'; rectEl.style.top=startY+'px';
  rectEl.style.width='0'; rectEl.style.height='0';
  cw.appendChild(rectEl);
  function onMove(mv){
    const cx=mv.clientX-cwRect.left, cy=mv.clientY-cwRect.top;
    rectEl.style.left=Math.min(startX,cx)+'px';
    rectEl.style.top=Math.min(startY,cy)+'px';
    rectEl.style.width=Math.abs(cx-startX)+'px';
    rectEl.style.height=Math.abs(cy-startY)+'px';
  }
  function onUp(mv){
    document.removeEventListener('mousemove',onMove);
    document.removeEventListener('mouseup',onUp);
    rectEl.remove();
    const cx=mv.clientX-cwRect.left, cy=mv.clientY-cwRect.top;
    const rx=Math.min(startX,cx), ry=Math.min(startY,cy);
    const rw=Math.abs(cx-startX), rh=Math.abs(cy-startY);
    if(rw<5&&rh<5){deselect();return;}
    // Clear previous selection
    document.querySelectorAll('.cel.selected').forEach(e=>{e.classList.remove('selected');e.querySelectorAll('.rh').forEach(h=>h.remove());});
    document.querySelectorAll('.cel.multi-sel').forEach(e=>e.classList.remove('multi-sel'));
    SEL_KEY=null; SEL_KEYS=new Set();
    // Find overlapping .cel elements
    document.querySelectorAll('.cel').forEach(cel=>{
      if(cel.dataset.key==='bg') return;
      const cr=cel.getBoundingClientRect();
      const cx2=cr.left-cwRect.left, cy2=cr.top-cwRect.top;
      if(cx2+cr.width>rx&&cx2<rx+rw&&cy2+cr.height>ry&&cy2<ry+rh) SEL_KEYS.add(cel.dataset.key);
    });
    if(SEL_KEYS.size===1){const k=[...SEL_KEYS][0];SEL_KEYS=new Set();selectEl(k);}
    else if(SEL_KEYS.size>1){SEL_KEYS.forEach(k=>{const el=document.getElementById('el-'+k);if(el)el.classList.add('multi-sel');});}
  }
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

document.getElementById('canvas-wrap').addEventListener('mousedown',e=>{
  const isPan=TOOL==='pan'||(e.button===1)||(e.button===0&&document.getElementById('canvas-wrap').dataset.tempPan);
  // Rubber-band marquee: left-click on canvas background in move mode
  if(!isPan&&e.button===0&&TOOL==='move'&&!e.target.closest('.cel')&&!e.target.closest('.ov-layer')){
    e.preventDefault();
    startMarqueeSelect(e);
    return;
  }
  if(!isPan||e.button===2) return;
  e.preventDefault();
  _panStart={x:e.clientX,y:e.clientY,ox:_panOX,oy:_panOY};
  document.getElementById('canvas-wrap').style.cursor='grabbing';
});
document.addEventListener('mousemove',e=>{
  if(!_panStart) return;
  _panOX=_panStart.ox+(e.clientX-_panStart.x);
  _panOY=_panStart.oy+(e.clientY-_panStart.y);
  applyPanOffset();
});
document.addEventListener('mouseup',e=>{
  if(!_panStart) return;
  _panStart=null;
  if(TOOL==='pan') document.getElementById('canvas-wrap').style.cursor='grab';
  else document.getElementById('canvas-wrap').style.cursor='default';
});
// Double-click canvas background resets pan
document.getElementById('canvas-wrap').addEventListener('dblclick',e=>{
  if(e.target.id==='canvas-wrap'||e.target.id==='gf-outer') resetPan();
});
// Space bar = temporary pan (like Photoshop)
document.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!e.target.matches('input,textarea,select')&&TOOL!=='pan'){
    e.preventDefault();
    document.getElementById('canvas-wrap').style.cursor='grab';
    document.getElementById('canvas-wrap').dataset.tempPan='1';
  }
});
document.addEventListener('keyup',e=>{
  if(e.code==='Space'){
    const cw=document.getElementById('canvas-wrap');
    if(cw&&cw.dataset.tempPan){
      delete cw.dataset.tempPan;
      cw.style.cursor='default';
      _panStart=null;
    }
  }
});
// Suppress native browser context menu on canvas
document.getElementById('gf').addEventListener('contextmenu',e=>e.preventDefault());
document.getElementById('gf-outer').addEventListener('contextmenu',e=>e.preventDefault());

// ═══ LAYER Z-ORDER ═══
// Normalise z values to consecutive integers 1,2,3… preserving relative order.
function _normalizeLayerZ(keys){
  const sorted=[...keys].filter(k=>PSD[k]).sort((a,b)=>(PSD[a].z??5)-(PSD[b].z??5));
  sorted.forEach((k,i)=>{ if(PSD[k]) PSD[k].z=i+1; });
}

// action: 'forward' | 'front' | 'backward' | 'back'
function layerReorder(key, action){
  const scrDef=SDEFS[P.screen]; if(!scrDef||!scrDef.keys) return;
  const keys=scrDef.keys;
  // Sorted layer list for this screen (lowest z first)
  const layers=keys.filter(k=>PSD[k])
    .map(k=>({key:k, z:PSD[k].z??5}))
    .sort((a,b)=>a.z-b.z);
  const idx=layers.findIndex(l=>l.key===key); if(idx<0) return;
  // Background guard: z===1 is always the bottom; never move below it
  const bgIdx=layers.findIndex(l=>l.z===1);
  const minMovable=bgIdx>=0?bgIdx+1:0;

  if(action==='forward'||action==='front'){
    if(idx>=layers.length-1) return; // already at top
    if(action==='forward'){
      const other=layers[idx+1];
      const tmp=PSD[key].z; PSD[key].z=PSD[other.key].z; PSD[other.key].z=tmp;
    } else {
      // Bring to front: set z above current max
      PSD[key].z=(layers[layers.length-1].z)+1;
    }
  } else if(action==='backward'||action==='back'){
    if(idx<=minMovable) return; // already at min movable position
    if(action==='backward'){
      const other=layers[idx-1];
      if(other.z===1) return; // don't cross bg
      const tmp=PSD[key].z; PSD[key].z=PSD[other.key].z; PSD[other.key].z=tmp;
    } else {
      // Send to back: set z just above bg
      const bgZ=bgIdx>=0?layers[bgIdx].z:0;
      PSD[key].z=bgZ+0.5; // will be normalized to integer
    }
  }
  // Normalize to clean integers and sync keys array to z-order
  _normalizeLayerZ(keys);
  keys.sort((a,b)=>(PSD[a]?.z??5)-(PSD[b]?.z??5));
  buildCanvas(); renderLayers(); markDirty(); pushHistory('layer z-order');
}

// ═══ LAYERS PANEL ═══
function makeLayerRow(label, key, type, hasAsset, isOff, isActive, indent){
  const ic={ai:'#7c5cbf',template:'#2e7d5a',symbol:'#c9a84c22'};
  const tc={ai:'#7c5cbf',template:'#2e7d5a',symbol:'#c9a84c'};
  const isUserLocked = USER_LOCKS.has(key);
  const isHidden = HIDDEN_LAYERS.has(key);
  const zVal = PSD[key]?.z || 5;
  // Z-index badge colour: warm for top layers, cool for bottom
  const zColMap = {1:'#445',2:'#3a5a7a',3:'#2e7d5a',4:'#5a6a2e',5:'#7c5cbf',6:'#c9a84c',7:'#ef7a7a'};
  const zBadgeCol = zColMap[zVal]||'#555';
  const row=document.createElement('div');
  row.className='li'+(isActive?' active':'')+(isHidden?' layer-hidden':'');
  row.style.alignItems='center';
  if(indent) row.style.paddingLeft='22px';
  row.style.opacity=isOff?'0.38':'1';
  row.draggable = false;
  row.dataset.layerKey = key;
  row.innerHTML=`
    <span class="li-zup" data-zkey="${key}" title="Move Forward  ⌘]\nBring to Front  ⌥⌘]">▲</span>
    <span class="li-zdn" data-zkey="${key}" title="Move Backward  ⌘[\nSend to Back  ⌥⌘[">▼</span>
    <span class="li-eye ${isHidden?'hid':'vis'}" data-eye-key="${key}" title="${isHidden?'Show layer':'Hide layer'}">
      <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">${isHidden?'<path d="M1 1l12 8M2 6.5C3.5 5 5.1 4 7 4c.8 0 1.6.2 2.3.5M12 2c.7.9 1.3 2 1.3 3"/><line x1="1" y1="1" x2="13" y2="9"/>':'<path d="M1 5C2.5 2.5 4.5 1 7 1s4.5 1.5 6 4c-1.5 2.5-3.5 4-6 4S2.5 7.5 1 5z"/><circle cx="7" cy="5" r="1.5" fill="currentColor"/>'}</svg>
    </span>
    <div class="li-ico" style="background:${ic[type]||'#252535'};color:${tc[type]||'#aaa'};font-size:${type==='symbol'?'7px':'8px'}">
      ${type==='symbol'?'&#9670;':'&#9633;'}
    </div>
    <div class="li-name" style="${hasAsset?'color:#c9a84c':isOff?'color:#444':''}">
      ${label}${isOff?' <span style="font-size:7px;color:#7a7a9a;font-style:italic">(off)</span>':''}
    </div>
    <span title="Z-layer ${zVal}" style="flex-shrink:0;font-size:7px;color:${zBadgeCol};background:${zBadgeCol}22;border:1px solid ${zBadgeCol}44;border-radius:3px;padding:1px 4px;font-family:DM Mono,monospace;margin-left:2px">${zVal}</span>
    <span class="li-lock${isUserLocked?' on':''}" data-lock-key="${key}" title="${isUserLocked?'Unlock layer':'Lock layer'}" style="flex-shrink:0;margin-left:2px">${isUserLocked?'🔒':'🔓'}</span>
    <button class="li-upload-btn" data-k="${key}" title="Upload image" style="flex-shrink:0;padding:2px 5px;border-radius:3px;border:1px solid #252535;background:${hasAsset?'#c9a84c18':'transparent'};color:${hasAsset?'#c9a84c':'#556'};font-size:9px;cursor:pointer;font-family:Space Grotesk,sans-serif;margin-left:2px">&#8679;</button>
    ${hasAsset?`<button class="li-clear-btn" data-k="${key}" title="Clear asset" style="flex-shrink:0;padding:2px 5px;border-radius:3px;border:1px solid #ef7a7a44;background:transparent;color:#ef7a7a88;font-size:9px;cursor:pointer;font-family:Space Grotesk,sans-serif;margin-left:1px">✕</button>`:''}
  `;
  // Wire eye (visibility) button
  const eyeBtn = row.querySelector('.li-eye');
  if(eyeBtn){
    eyeBtn.addEventListener('click', e=>{
      e.stopPropagation();
      if(HIDDEN_LAYERS.has(key)) HIDDEN_LAYERS.delete(key); else HIDDEN_LAYERS.add(key);
      buildCanvas(); renderLayers(); markDirty();
    });
  }
  // Wire lock button immediately (can't use querySelector after innerHTML in some contexts)
  const lockBtn = row.querySelector('.li-lock');
  if(lockBtn){
    lockBtn.addEventListener('click', e=>{
      e.stopPropagation();
      toggleLayerLock(key);
    });
  }
  // Double-click name to rename layer
  const nameEl = row.querySelector('.li-name');
  if(nameEl){
    nameEl.addEventListener('dblclick', e=>{
      e.stopPropagation();
      const def=PSD[key]; if(!def) return;
      const inp=document.createElement('input');
      inp.value=def.label; inp.style.cssText='background:#0d0d18;border:1px solid #c9a84c44;border-radius:3px;color:#c9a84c;font-size:10px;font-family:Space Grotesk,sans-serif;padding:1px 5px;width:100%;outline:none';
      nameEl.innerHTML=''; nameEl.appendChild(inp);
      inp.focus(); inp.select();
      const commit=()=>{ def.label=inp.value||def.label; renderLayers(); markDirty(); };
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', ev=>{ if(ev.key==='Enter') inp.blur(); if(ev.key==='Escape'){inp.value=def.label;inp.blur();} });
    });
  }
  // Z-order buttons
  const zupBtn = row.querySelector('.li-zup');
  const zdnBtn = row.querySelector('.li-zdn');
  if(zupBtn) zupBtn.addEventListener('click', e=>{ e.stopPropagation(); layerReorder(key, e.altKey?'front':'forward'); });
  if(zdnBtn) zdnBtn.addEventListener('click', e=>{ e.stopPropagation(); layerReorder(key, e.altKey?'back':'backward'); });
  return row;
}

function attachUpload(row, storageKey, onDone){
  row.querySelector('.li-upload-btn').addEventListener('click', e=>{
    e.stopPropagation();
    const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.onchange=()=>{
      const file=inp.files[0]; if(!file) return;
      const reader=new FileReader();
      reader.onload=ev=>{
        EL_ASSETS[storageKey]=ev.target.result;
        const cel=document.getElementById('el-'+storageKey);
        if(cel){ cel.innerHTML=''; const img=document.createElement('img'); img.src=ev.target.result; img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none;border-radius:inherit'; cel.appendChild(img); }
        // Kick off CDN upload so the asset gets a persistent https:// URL in Supabase.
        // Without this, base64 is stripped on save and the asset is lost on re-entry.
        if(typeof _sfUploadDataUrlToStorage === 'function') _sfUploadDataUrlToStorage(storageKey, ev.target.result);
        if(onDone) onDone();
      };
      reader.readAsDataURL(file);
    };
    inp.click();
  });
}

// Tracks whether the Symbols sub-group (under Reel Area) is expanded in the layers panel
if(typeof window._symGroupExpanded === 'undefined') window._symGroupExpanded = false;

// ─── Layer context menu ───────────────────────────────────────────────────────
var _layerCtx = null;
function closeLayerCtxMenu(){ if(_layerCtx){_layerCtx.remove();_layerCtx=null;} }

function openLayerCtxMenu(key, cx, cy){
  closeLayerCtxMenu();
  var menu = document.createElement('div');
  menu.id = 'layer-ctx-menu';
  menu.style.cssText = [
    'position:fixed','z-index:9999','background:#1a1a2e',
    'border:1px solid #2a2a3e','border-radius:8px',
    'box-shadow:0 8px 24px rgba(0,0,0,.6)',
    'padding:4px 0','min-width:180px',
    'font-family:Space Grotesk,sans-serif','font-size:12px','color:#e8e6e1',
    'user-select:none',
  ].join(';');

  function item(label, fn, danger){
    var d = document.createElement('div');
    d.textContent = label;
    d.style.cssText = 'padding:7px 14px;cursor:pointer;color:'+(danger?'#ef7a7a':'#e8e6e1')+';transition:background .1s';
    d.addEventListener('mouseenter',function(){d.style.background=danger?'#ef7a7a18':'#c9a84c18';});
    d.addEventListener('mouseleave',function(){d.style.background='';});
    d.addEventListener('mousedown',function(e){e.stopPropagation();closeLayerCtxMenu();fn();});
    return d;
  }
  function sep(){
    var s=document.createElement('div');
    s.style.cssText='height:1px;background:#2a2a3e;margin:3px 0';
    return s;
  }

  var isCustom = key && key.startsWith('custom_');

  // New Layer
  menu.appendChild(item('＋ New Layer', function(){
    document.getElementById('add-layer-btn')?.click();
  }));

  menu.appendChild(sep());

  // Duplicate
  menu.appendChild(item('⧉ Duplicate Layer', function(){ duplicateLayer(key); }));

  // Delete — works for any layer
  menu.appendChild(item('✕ Delete Layer', function(){ deleteAnyLayer(key); }, true));

  menu.appendChild(sep());

  // Blend modes submenu header
  var blendHeader = document.createElement('div');
  blendHeader.textContent = 'Blending Mode';
  blendHeader.style.cssText = 'padding:4px 14px 2px;font-size:9px;color:#9090b0;text-transform:uppercase;letter-spacing:.08em;font-family:DM Mono,monospace';
  menu.appendChild(blendHeader);

  var currentBlend = EL_BLEND_MODES[key] || 'normal';
  [
    {label:'Normal', value:'normal'},
    {label:'Screen (Add)', value:'screen'},
    {label:'Multiply', value:'multiply'},
  ].forEach(function(bm){
    var d = document.createElement('div');
    var isActive = currentBlend === bm.value;
    d.style.cssText = 'padding:6px 14px 6px 24px;cursor:pointer;color:'+(isActive?'#c9a84c':'#e8e6e1')+';background:'+(isActive?'#c9a84c11':'');
    d.innerHTML = (isActive?'✓ ':'\u00a0\u00a0')+bm.label;
    d.addEventListener('mouseenter',function(){d.style.background='#c9a84c18';});
    d.addEventListener('mouseleave',function(){d.style.background=isActive?'#c9a84c11':'';});
    d.addEventListener('mousedown',function(e){
      e.stopPropagation();
      closeLayerCtxMenu();
      EL_BLEND_MODES[key] = bm.value;
      buildCanvas(); markDirty();
    });
    menu.appendChild(d);
  });

  // Position on screen
  document.body.appendChild(menu);
  _layerCtx = menu;
  var W=menu.offsetWidth||200, H=menu.offsetHeight||200;
  var left = Math.min(cx, window.innerWidth - W - 8);
  var top  = Math.min(cy, window.innerHeight - H - 8);
  menu.style.left = left+'px';
  menu.style.top  = top+'px';

  // Close on outside click
  function outsideClick(e){
    if(!menu.contains(e.target)){ closeLayerCtxMenu(); document.removeEventListener('mousedown',outsideClick); }
  }
  setTimeout(function(){ document.addEventListener('mousedown', outsideClick); }, 0);
}

// ─── Send layer state to React shell ─────────────────────────────────────────
function _sendLayersUpdate(){
  try {
    if(!window._sfPayloadLoaded) return;
    var screen = P.screen || 'base';
    var sdef = SDEFS[screen];
    if(!sdef || !sdef.keys) return;
    var keys = sdef.keys;
    var layers = [];
    keys.forEach(function(k){
      var def = PSD[k]; if(!def) return;
      layers.push({
        key: k,
        label: def.label || k,
        type: def.type || 'template',
        z: def.z || 5,
        hasAsset: !!EL_ASSETS[k],
        isOff: (k==='char'&&!P.char.enabled)||(k==='bannerBuy'&&!P.features.buy_feature)||(k==='bannerAnte'&&!P.ante.enabled),
        isHidden: HIDDEN_LAYERS.has(k),
        isLocked: USER_LOCKS.has(k),
        isSelected: k===SEL_KEY,
        blendMode: EL_BLEND_MODES[k]||'normal',
      });
    });
    // Send highest-z first (visual Photoshop order)
    layers.sort(function(a,b){ return b.z - a.z; });
    window.parent.postMessage({
      type: 'SF_LAYERS_UPDATE',
      layers: layers,
      screen: screen,
      screenLabel: (sdef.label||screen),
    }, '*');
  } catch(ex){}
}

function renderLayers(){
  const list=document.getElementById('layers-list');
  const keys=SDEFS[P.screen]?.keys||[];
  list.innerHTML='';
  let layerIdx=0;

  // Update screen badge in layers panel header
  const badge=document.getElementById('layers-screen-badge');
  if(badge) badge.textContent=SDEFS[P.screen]?.label||P.screen;

  // Display layers in visual stacking order: highest z at top (like Photoshop)
  const displayKeys = [...keys].sort((a,b)=>(PSD[b]?.z||5)-(PSD[a]?.z||5));
  const JP_SENTINEL_KEYS = new Set(['jpGrand','jpMajor','jpMinor','jpMini']);
  let jpGroupHeaderAdded = false;

  displayKeys.forEach((k)=>{
    const def=PSD[k];if(!def)return;
    // jpRow is a hidden system container — not shown in the layers panel
    if(k==='jpRow') return;
    const t=def.type||'template';
    const hasAsset=!!EL_ASSETS[k];
    const isOff=(k==='bannerBuy'&&!P.features.buy_feature)||(k==='char'&&!P.char.enabled)||(k==='bannerAnte'&&!P.ante.enabled);
    const isActive=(k===SDEFS[P.screen]?.keys?.[P.activeLayer]);

    // Insert "JP Bars" group header before the first JP sentinel
    if(JP_SENTINEL_KEYS.has(k) && !jpGroupHeaderAdded){
      jpGroupHeaderAdded=true;
      const hdr=document.createElement('div');
      hdr.style.cssText='display:flex;align-items:center;gap:5px;padding:5px 8px 3px 8px;font-size:8px;color:#5a5a78;letter-spacing:.1em;text-transform:uppercase;font-family:DM Mono,monospace;background:#0c0c18;border-bottom:1px solid #141420';
      hdr.innerHTML='<span style="font-size:9px;opacity:.5">⬡</span> JP Bars <span style="opacity:.35;font-size:7px">(group)</span>';
      list.appendChild(hdr);
    }

    const row=makeLayerRow(def.label,k,t,hasAsset,isOff,isActive,false);
    // Indent JP sentinel rows to show group membership
    if(JP_SENTINEL_KEYS.has(k)) row.style.paddingLeft='18px';

    // For reelArea: append a collapse-toggle arrow for the symbols sub-group
    if(k==='reelArea' && P.symbols.length>0){
      const symCount=P.symbols.length;
      const arrow=document.createElement('span');
      arrow.title='Toggle symbols';
      arrow.style.cssText='flex-shrink:0;font-size:9px;color:#7a7a9a;cursor:pointer;padding:0 3px;margin-left:2px;user-select:none';
      arrow.textContent=window._symGroupExpanded?'▼':'▶';
      arrow.addEventListener('click',e=>{
        e.stopPropagation();
        window._symGroupExpanded=!window._symGroupExpanded;
        renderLayers();
      });
      const countBadge=document.createElement('span');
      countBadge.style.cssText='flex-shrink:0;font-size:7px;color:#c9a84c88;background:#c9a84c11;border:1px solid #c9a84c22;border-radius:3px;padding:1px 4px;font-family:DM Mono,monospace;margin-left:2px';
      countBadge.textContent=symCount+'sym';
      // Insert before the upload button (last two elements)
      const uploadBtn=row.querySelector('.li-upload-btn');
      if(uploadBtn){ row.insertBefore(arrow, uploadBtn); row.insertBefore(countBadge, uploadBtn); }
      else { row.appendChild(arrow); row.appendChild(countBadge); }
    }

    row.addEventListener('click', e=>{
      if(e.target.classList.contains('li-upload-btn')) return;
      if(e.target.classList.contains('li-lock')) return;
      if(e.target.classList.contains('li-drag')) return;
      if(e.target.classList.contains('li-clear-btn')) return;
      if(e.target.classList.contains('li-eye')) return;
      // reelArea collapse-arrow click is handled above, don't select/flash for it
      if(e.target.style.cursor==='pointer'&&e.target.title==='Toggle symbols') return;
      P.activeLayer=keys.indexOf(k); renderLayers();
      selectEl(k);
      // Flash element on canvas to show its location
      const cel=document.getElementById('el-'+k);
      if(cel){
        cel.style.outline='3px solid #c9a84c';
        cel.style.outlineOffset='2px';
        setTimeout(()=>{cel.style.outline='';cel.style.outlineOffset='';},600);
      }
    });
    row.addEventListener('contextmenu', function(e){
      e.preventDefault(); e.stopPropagation();
      openLayerCtxMenu(k, e.clientX, e.clientY);
    });
    // Double-click layer name = rename inline
    const nameEl=row.querySelector('.li-name');
    if(nameEl) nameEl.addEventListener('dblclick', e=>{
      e.stopPropagation();
      const def=PSD[k]; if(!def) return;
      const inp=document.createElement('input');
      inp.value=def.label; inp.className='fi';
      inp.style.cssText='width:100%;font-size:10px;padding:1px 4px;height:16px;box-sizing:border-box';
      nameEl.replaceWith(inp); inp.focus(); inp.select();
      const commit=()=>{def.label=inp.value.trim()||def.label;renderLayers();};
      inp.addEventListener('blur',commit);
      inp.addEventListener('keydown',ev=>{if(ev.key==='Enter')inp.blur();if(ev.key==='Escape'){renderLayers();}});
    });
    attachUpload(row, k, ()=>{ buildCanvas(); renderLayers(); markDirty(); });
    // Wire clear-asset button if present
    const clearBtn=row.querySelector('.li-clear-btn');
    if(clearBtn) clearBtn.addEventListener('click', e=>{
      e.stopPropagation();
      delete EL_ASSETS[k]; buildCanvas(); renderLayers(); markDirty(); pushHistory('clear asset '+k);
    });
    list.appendChild(row);

    // For the bg layer, add a per-screen override row directly below
    if(k==='bg'){
      const scrKey = 'bg_'+P.screen;
      const hasOvr = !!EL_ASSETS[scrKey];
      const scrLabel = SDEFS[P.screen]?.label || P.screen;
      const ovrRow = document.createElement('div');
      ovrRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px 8px 4px 22px;border-bottom:1px solid #141420';
      ovrRow.innerHTML = `
        <span style="font-size:8px;color:${hasOvr?'#c9a84c':'#445'};flex:1;font-style:italic;font-family:DM Mono,monospace">↳ ${scrLabel} bg${hasOvr?' <span style="color:#c9a84c">(set)</span>':''}</span>
        ${hasOvr?`<button class="bg-scr-clr" style="font-size:8px;padding:1px 4px;border-radius:3px;border:1px solid #ef7a7a44;background:transparent;color:#ef7a7a88;cursor:pointer">✕</button>`:''}
        <button class="bg-scr-up" style="font-size:8px;padding:2px 6px;border-radius:3px;border:1px solid ${hasOvr?'#c9a84c55':'#252535'};background:${hasOvr?'#c9a84c18':'transparent'};color:${hasOvr?'#c9a84c':'#445'};cursor:pointer;font-family:Space Grotesk,sans-serif">&#8679; Override</button>
      `;
      ovrRow.querySelector('.bg-scr-up').addEventListener('click', e=>{
        e.stopPropagation();
        const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
        inp.onchange=()=>{
          const file=inp.files[0]; if(!file) return;
          const reader=new FileReader();
          reader.onload=ev=>{
            EL_ASSETS[scrKey]=ev.target.result;
            if(typeof _sfUploadDataUrlToStorage === 'function') _sfUploadDataUrlToStorage(scrKey, ev.target.result);
            buildCanvas(); renderLayers(); markDirty();
          };
          reader.readAsDataURL(file);
        }; inp.click();
      });
      const clrBtn = ovrRow.querySelector('.bg-scr-clr');
      if(clrBtn) clrBtn.addEventListener('click', e=>{
        e.stopPropagation();
        delete EL_ASSETS[scrKey]; buildCanvas(); renderLayers(); markDirty();
      });
      list.appendChild(ovrRow);
    }

    // If this is the reelArea, insert collapsible symbol sub-layers below it
    if(k==='reelArea' && P.symbols.length>0){
      // Clickable group header that toggles expand/collapse
      const sep=document.createElement('div');
      sep.style.cssText='display:flex;align-items:center;gap:5px;padding:4px 10px 3px 22px;font-size:8px;color:#8080a8;letter-spacing:.08em;text-transform:uppercase;border-top:1px solid #141420;cursor:pointer;user-select:none';
      const sepArrow=document.createElement('span');
      sepArrow.style.cssText='font-size:8px;color:#7a7a9a';
      sepArrow.textContent=window._symGroupExpanded?'▼':'▶';
      const sepLabel=document.createElement('span');
      sepLabel.textContent='Symbols ('+P.symbols.length+')';
      sep.appendChild(sepArrow); sep.appendChild(sepLabel);
      sep.addEventListener('click',()=>{ window._symGroupExpanded=!window._symGroupExpanded; renderLayers(); });
      list.appendChild(sep);

      // Only render symbol rows when group is expanded
      if(window._symGroupExpanded){

      const allSyms=P.symbols; // show all, grey hidden ones for this screen

      allSyms.forEach(sym=>{
        const symKey='sym_'+sym.id;
        const hasSymAsset=!!EL_ASSETS[symKey];
        const isHidden=!sym.screens.includes(P.screen);
        const typeCol={high:'#ef7a7a',low:'#7a8aef',special:'#c9a84c'}[sym.type]||'#c9a84c';
        const symRow=document.createElement('div');
        symRow.className='li';
        symRow.style.cssText='padding-left:28px;opacity:'+(isHidden?'0.3':'1');
        symRow.innerHTML=`
          <span style="font-size:8px;color:${typeCol};margin-right:4px">&#9670;</span>
          <div style="flex:1;font-size:10px;color:${hasSymAsset?'#c9a84c':isHidden?'#445':'#bbb'}">${sym.name}
            <span style="font-size:7px;color:${typeCol}99;margin-left:4px">${sym.type}</span>
            ${isHidden?'<span style="font-size:7px;color:#7a7a9a;font-style:italic"> (off)</span>':''}
          </div>
          <button class="li-upload-btn" title="Upload symbol" style="flex-shrink:0;padding:2px 5px;border-radius:3px;border:1px solid #252535;background:${hasSymAsset?'#c9a84c18':'transparent'};color:${hasSymAsset?'#c9a84c':'#556'};font-size:9px;cursor:pointer;font-family:Space Grotesk,sans-serif">&#8679;</button>
          ${hasSymAsset?`<button class="li-clear-btn sym-clear" data-symkey="${symKey}" title="Clear symbol asset" style="flex-shrink:0;padding:2px 5px;border-radius:3px;border:1px solid #ef7a7a44;background:transparent;color:#ef7a7a88;font-size:9px;cursor:pointer;font-family:Space Grotesk,sans-serif;margin-left:1px">✕</button>`:''}
        `;
        symRow.querySelector('.li-upload-btn').addEventListener('click', e=>{
          e.stopPropagation();
          const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
          inp.onchange=()=>{
            const file=inp.files[0]; if(!file) return;
            const reader=new FileReader();
            reader.onload=ev=>{
              EL_ASSETS[symKey]=ev.target.result;
              // Update symbol cell in canvas if it exists
              const cell=document.querySelector(`[data-sym-id="${sym.id}"]`);
              if(cell){ cell.innerHTML=''; const img=document.createElement('img'); img.src=ev.target.result; img.style.cssText='width:100%;height:100%;object-fit:contain;pointer-events:none'; cell.appendChild(img); }
              renderLayers();
            };
            reader.readAsDataURL(file);
          };
          inp.click();
        });
        const symClearBtn=symRow.querySelector('.sym-clear');
        if(symClearBtn) symClearBtn.addEventListener('click', e=>{
          e.stopPropagation();
          delete EL_ASSETS[symKey]; buildCanvas(); renderLayers(); markDirty();
        });
        list.appendChild(symRow);
      });

      } // end if(window._symGroupExpanded)
    }
    layerIdx++;
  });
  // Render overlay sub-layers section below main layers
  renderOvLayers();
  // Notify shell of layer state change
  try { _sendLayersUpdate(); } catch(e){}
}

// ═══ ASSET LIBRARY ═══
const LIB_ACCEPT='image/png,image/jpeg,image/jpg,image/webp,image/gif';
// Auto-detect category from filename keywords
function libGuessCategory(name){
  const n=name.toLowerCase();
  if(/bg|background|back/.test(n)) return 'Background';
  if(/sym|symbol/.test(n)) return 'Symbols';
  if(/jp|jackpot|grand|major|minor|mini|banner/.test(n)) return 'JP Banners';
  if(/logo/.test(n)) return 'Logo';
  if(/char|character|mascot/.test(n)) return 'Character';
  if(/btn|button|hub|buy|spin|auto|turbo|option|setting/.test(n)) return 'UI';
  return 'Other';
}
function libUUID(){return Math.random().toString(36).slice(2)+Date.now().toString(36);}

function renderLibrary(){
  const grid=document.getElementById('lib-grid'); if(!grid) return;
  grid.innerHTML='';
  const items=[];

  if(LIB_TAB==='placeholders'){
    // Show all predefined PSD layer slots — always visible, with or without uploaded asset
    const slotKeys=BASE_KEYS||Object.keys(PSD);
    slotKeys.forEach(k=>{
      const def=PSD[k]; if(!def) return;
      const cat={bg:'Background',logo:'Logo',char:'Character',
        jpGrand:'JP Banners',jpMajor:'JP Banners',jpMinor:'JP Banners',jpMini:'JP Banners',
        reelFrame:'UI',reelArea:'UI',settings:'UI',spinBtn:'UI',autoBtn:'UI',turboBtn:'UI',
        bannerBet:'UI',bannerBuy:'UI',bannerAnte:'UI',msgLabel:'UI',jpRow:'JP Banners'}[k]||'Other';
      if(LIB_CAT!=='All'&&cat!==LIB_CAT) return;
      items.push({id:k,name:def.label||k,data:EL_ASSETS[k]||null,category:cat,source:'placeholder',elKey:k,hasAsset:!!EL_ASSETS[k]});
    });
    // Also include symbol slots
    if(LIB_CAT==='All'||LIB_CAT==='Symbols'){
      (P.symbols||[]).forEach(sym=>{
        const key='sym_'+sym.id;
        items.push({id:key,name:sym.name,data:EL_ASSETS[key]||null,category:'Symbols',source:'placeholder',elKey:key,hasAsset:!!EL_ASSETS[key]});
      });
    }
  } else {
    // Uploads tab — P.library items only
    P.library.forEach(a=>{
      if(LIB_CAT==='All'||a.category===LIB_CAT) items.push({...a,source:'lib'});
    });
  }

  if(items.length===0){
    const e=document.createElement('div');e.id='lib-empty';
    const msg=LIB_TAB==='placeholders'?'No placeholder slots found':'No uploads yet';
    e.innerHTML=`<div style="font-size:20px;opacity:.3">📂</div><div>${msg}</div><div style="font-size:8px;color:#5a5a78">${LIB_TAB==='uploads'?'Upload PNGs or JPEGs to get started':''}</div>`;
    grid.appendChild(e); return;
  }

  items.forEach(item=>{
    const wrap=document.createElement('div');
    wrap.className='lib-thumb';
    wrap.draggable=!!item.data;
    wrap.title=item.name;
    // Thumb content: uploaded image or a grey placeholder tile
    if(item.data){
      wrap.innerHTML=`<img src="${item.data}"><div class="lib-name">${item.name}</div>`;
    } else {
      // Empty slot indicator
      wrap.innerHTML=`<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:6px;box-sizing:border-box"><div style="font-size:16px;opacity:.35">⬚</div><div class="lib-name" style="opacity:.7">${item.name}</div><div style="font-size:7px;color:#5a5a78;text-align:center">Empty slot</div></div>`;
    }
    // Delete button only for uploaded assets (not empty placeholder slots)
    if(item.data && item.source!=='placeholder'){
      const del=document.createElement('button');del.className='lib-del';del.title='Remove';del.textContent='✕';
      wrap.appendChild(del);
      del.addEventListener('click',e=>{
        e.stopPropagation();
        P.library=P.library.filter(a=>a.id!==item.id); renderLibrary(); markDirty();
      });
    } else if(item.data && item.source==='placeholder'){
      const del=document.createElement('button');del.className='lib-del';del.title='Clear asset';del.textContent='✕';
      wrap.appendChild(del);
      del.addEventListener('click',e=>{
        e.stopPropagation();
        delete EL_ASSETS[item.elKey]; buildCanvas(); renderLayers(); renderLibrary(); markDirty();
      });
    }
    // Drag-start
    if(item.data){
      wrap.addEventListener('dragstart',e=>{
        e.dataTransfer.setData('application/sf-lib',JSON.stringify({data:item.data,name:item.name}));
        e.dataTransfer.effectAllowed='copy';
      });
    }
    // Click to assign to selected layer
    wrap.addEventListener('click',e=>{
      if(e.target.classList.contains('lib-del')) return;
      if(!item.data){ alert('This slot is empty. Upload an asset to it by selecting it on canvas and using Upload / Replace.'); return; }
      if(!SEL_KEY){ alert('Select a layer on the canvas first, then click an asset to assign it.'); return; }
      applyAssetToLayer(SEL_KEY, item.data);
      const el=document.getElementById('el-'+SEL_KEY);
      if(el){el.style.outline='3px solid #5eca8a';el.style.outlineOffset='2px';setTimeout(()=>{el.style.outline='';el.style.outlineOffset='';},600);}
    });
    grid.appendChild(wrap);
  });
}
function libUpload(){
  const inp=document.createElement('input');
  inp.type='file'; inp.accept=LIB_ACCEPT; inp.multiple=true;
  inp.onchange=()=>{
    Array.from(inp.files).forEach(file=>{
      const reader=new FileReader();
      reader.onload=ev=>{
        const cat=libGuessCategory(file.name);
        P.library.push({id:libUUID(),name:file.name,data:ev.target.result,category:cat});
        renderLibrary(); markDirty();
      };
      reader.readAsDataURL(file);
    });
  };
  inp.click();
}

// ── Wire library tab and category filters after DOM ready ──
function _initLibrary(){
  // Tab switching
  const tabL=document.getElementById('rp-tab-layers');
  const tabA=document.getElementById('rp-tab-assets');
  const layS=document.getElementById('layers-section');
  const aiS=document.getElementById('ai-section');
  const libS=document.getElementById('library-section');
  if(tabL&&tabA&&layS&&libS){
    tabL.addEventListener('click',()=>{
      tabL.classList.add('active'); tabA.classList.remove('active');
      layS.style.display='flex'; if(aiS)aiS.style.display='flex'; libS.classList.remove('vis');
    });
    tabA.addEventListener('click',()=>{
      tabA.classList.add('active'); tabL.classList.remove('active');
      layS.style.display='none'; if(aiS)aiS.style.display='none'; libS.classList.add('vis');
      renderLibrary();
    });
  }
  // Library tab switching (Uploads / Placeholders)
  document.querySelectorAll('.lib-tab').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.lib-tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      LIB_TAB=btn.dataset.libtab;
      renderLibrary();
    });
  });
  // Category filters
  document.querySelectorAll('.lib-cat').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.lib-cat').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      LIB_CAT=btn.dataset.cat;
      renderLibrary();
    });
  });
  // Upload button
  const upBtn=document.getElementById('lib-upload-btn');
  if(upBtn) upBtn.addEventListener('click',libUpload);
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_initLibrary);}else{_initLibrary();}

// ═══ SCREEN SWITCHING ═══
function switchScreen(scr){
  const isProj=scr==='project';
  if(isProj && P.screen!=='project') P._prevScreen=P.screen;
  P.screen=scr; P.activeLayer=null; SEL_KEY=null;
  const projFs=document.getElementById('proj-fs');
  if(isProj){
    const menuH=document.getElementById('menubar').offsetHeight;
    const tabH=document.getElementById('topbar').offsetHeight;
    projFs.style.top=(menuH+tabH)+'px';
    projFs.classList.add('show');
  } else {
    projFs.classList.remove('show');
  }
  // Only touch canvas-wrap/right-panel visibility when we are in the canvas workspace.
  // Other workspaces handle their own layout via updateWorkspaceUI().
  if(typeof activeWorkspace === 'undefined' || activeWorkspace === 'canvas'){
    document.getElementById('right-panel').classList.toggle('hidden', isProj);
    document.getElementById('canvas-wrap').style.display = isProj ? 'none' : 'flex';
  }
  document.getElementById('sb-scr').textContent=SDEFS[scr]?.label||scr;
  document.getElementById('ctx-scr').textContent=SDEFS[scr]?.label||'—';
  const as=document.getElementById('ai-sub');if(as)as.textContent=(SDEFS[scr]?.label||'')+' selected';
  rebuildTabs();
  renderLayers();
  if(!isProj){
    requestAnimationFrame(()=>{
      buildCanvas();
      // If this is an EW screen, append the EW overlay after canvas builds
      if(scr.startsWith('ew_')){
        const parentScr=scr.replace('ew_','');
        setTimeout(()=>{
          const gf=document.getElementById('gf');
          document.getElementById('ew-canvas-overlay')?.remove();
          gf.appendChild(buildEWOverlay(parentScr));
        },50);
      }
      // Feature screen overlays
      const featureDef=SDEFS[scr];
      if(featureDef?.overlay && featureDef.overlay!=='generic'){
        setTimeout(()=>{
          document.getElementById('feature-screen-overlay')?.remove();
          const gf=document.getElementById('gf');
          const ov=buildFeatureOverlay(scr, featureDef);
          if(ov) gf.appendChild(ov);
        },60);
      }
      fitZoom();
    });
  }
}

// ═══ VIEWPORT ═══
const VP_ICONS={'portrait':'📱','landscape':'📱','desktop':'🖥'};
const VP_ROTATES={'portrait':'','landscape':'rotate(90deg)','desktop':''};
function setViewport(vp){
  P.viewport=vp;
  document.getElementById('sb-vp').textContent=VP[vp]?.label||vp;
  // Update the single toggle button
  const ico=document.getElementById('vp-icon');
  const lbl=document.getElementById('vp-label');
  if(ico){ico.textContent=VP_ICONS[vp]||'📱';ico.style.transform=VP_ROTATES[vp]||'';}
  if(lbl){const labels={portrait:'Portrait',landscape:'Landscape',desktop:'Desktop'};lbl.textContent=labels[vp]||vp;}
  // Update checkmarks in dropdown
  document.querySelectorAll('[data-vp]').forEach(b=>b.classList.toggle('on',b.dataset.vp===vp));
  if(P.screen!=='project'){buildCanvas();fitZoom();updateDeviceFrame();}
  // Redraw crop indicator if visible
  if(document.getElementById('gf-outer')?.dataset.overflow==='1'){toggleCanvasOverflow();toggleCanvasOverflow();}
}

// ═══ PROJECT → CANVAS REACTIVITY ═══
function refresh(){buildCanvas();} // always rebuild — canvas hidden via CSS on project screen

document.getElementById('game-name').addEventListener('input',e=>{P.gameName=e.target.value;document.getElementById('ph-chip').textContent=e.target.value;refresh();markDirty();});
document.getElementById('theme-sel').addEventListener('change',e=>{P.theme=e.target.value;document.getElementById('custom-theme-wrap').style.display=e.target.value==='other'?'flex':'none';refresh();markDirty();});
[1,2,3].forEach(n=>{
  document.getElementById('col'+n).addEventListener('input',e=>{P.colors['c'+n]=e.target.value;document.getElementById('sw'+n).style.background=e.target.value;document.getElementById('hex'+n).textContent=e.target.value;refresh();markDirty();});
  document.getElementById('tog'+n).addEventListener('click',()=>{P.colors['t'+n]=!P.colors['t'+n];document.getElementById('tog'+n).classList.toggle('on',P.colors['t'+n]);document.getElementById('sw'+n).classList.toggle('off',!P.colors['t'+n]);refresh();markDirty();});
});
document.getElementById('reel-sel').addEventListener('change',e=>{P.reelset=e.target.value;renderReelViz();document.getElementById('sb-reel').textContent=P.reelset.replace('x','×').replace(/[ch]/g,'');refresh();markDirty();});
function renderReelViz(){
  const rv=document.getElementById('reel-viz');if(!rv)return;
  const[c,r]=parseReel(P.reelset);
  rv.style.gridTemplateColumns='repeat('+c+',18px)';
  rv.innerHTML='';
  for(let i=0;i<c*r;i++)rv.innerHTML+='<div class="rvc"></div>';
  const lbl=document.getElementById('reel-viz-label');
  if(lbl)lbl.textContent=c+'×'+r;
}
function initRV(){ renderReelViz(); }
document.getElementById('char-tog').addEventListener('click',()=>{P.char.enabled=!P.char.enabled;document.getElementById('char-tog').classList.toggle('on',P.char.enabled);document.getElementById('char-tog-lbl').style.color=P.char.enabled?'#ccc':'#555';document.getElementById('char-cf').classList.toggle('open',P.char.enabled);refresh();markDirty();});
document.getElementById('char-scale').addEventListener('change',e=>{P.char.scale=e.target.value;refresh();markDirty();});
document.getElementById('ante-tog').addEventListener('click',()=>{P.ante.enabled=!P.ante.enabled;document.getElementById('ante-tog').classList.toggle('on',P.ante.enabled);document.getElementById('ante-lbl').style.color=P.ante.enabled?'#ccc':'#555';document.getElementById('ante-cf').classList.toggle('open',P.ante.enabled);refresh();markDirty();});
document.getElementById('ante-btn-lbl').addEventListener('input',e=>{P.ante.label=e.target.value;refresh();markDirty();});
document.getElementById('msg-txt').addEventListener('input',()=>{refresh();markDirty();});
document.getElementById('msg-pos').addEventListener('change',e=>{P.msgPos=e.target.value;refresh();markDirty();});
document.querySelectorAll('.jp-tog').forEach(t=>{t.addEventListener('click',()=>{const k=t.dataset.jp;P.jackpots[k].on=!P.jackpots[k].on;t.classList.toggle('on',P.jackpots[k].on);refresh();markDirty();});});
['mini','minor','major','grand'].forEach(k=>{
  const v=document.getElementById('jp-val-'+k);if(v)v.addEventListener('input',e=>{P.jackpots[k].val=e.target.value;refresh();markDirty();});
  const l=document.getElementById('jp-lbl-'+k);if(l)l.addEventListener('input',()=>{refresh();markDirty();});
});
let activeJpKey=null;
document.querySelectorAll('.jp-excl').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();activeJpKey=btn.dataset.jp;const pop=document.getElementById('ep');const screens=['base','splash','freespin','holdnspin','win','popup'];document.getElementById('ep-opts').innerHTML=screens.map(s=>`<label class="ep-r"><input type="checkbox" value="${s}" ${P.jackpots[activeJpKey].exclude.includes(s)?'checked':''}/>${SDEFS[s]?.label||s}</label>`).join('');document.querySelectorAll('#ep-opts input').forEach(cb=>{cb.addEventListener('change',()=>{const ex=P.jackpots[activeJpKey].exclude;cb.checked?(!ex.includes(cb.value)&&ex.push(cb.value)):ex.splice(ex.indexOf(cb.value),1);refresh();});});const r=btn.getBoundingClientRect();pop.style.top=(r.bottom+4)+'px';pop.style.left=Math.min(r.left,window.innerWidth-160)+'px';pop.style.display='block';});});
document.addEventListener('click',()=>document.getElementById('ep').style.display='none');
document.querySelectorAll('#logo-pg .pc').forEach(c=>{c.addEventListener('click',()=>{document.querySelectorAll('#logo-pg .pc').forEach(x=>x.classList.remove('sel'));c.classList.add('sel');markDirty();});});
document.querySelectorAll('.psh').forEach(h=>{h.addEventListener('click',()=>{const b=document.getElementById('s-'+h.dataset.s);if(b){b.classList.toggle('hid');h.classList.toggle('col');}});});

function buildFeatures(){
  const list=document.getElementById('feat-list'); if(!list) return;

  // Config panel map — which config panel id belongs to each feature key
  const CFG_PANEL={
    freespin:'ps-freespin-cfg', holdnspin:'ps-holdnspin-cfg',
    buy_feature:'ps-buyfeat-cfg', expanding_wild:'ps-expanding-wild',
    gamble:'ps-gamble-cfg', megaways:'ps-megaways-cfg',
    cascade:'ps-cascade-cfg', tumble:'ps-cascade-cfg',
    win_multiplier:'ps-winmult-cfg', bonus_pick:'ps-bonuspick-cfg',
    sticky_wild:'ps-stickywild-cfg',
  };

  // Before clearing, rescue config panels back to ptab-features so they survive innerHTML=''
  const featPane=document.getElementById('ptab-features');
  Object.values(CFG_PANEL).forEach(pid=>{
    const p=document.getElementById(pid);
    if(p&&p.parentElement===list) featPane.appendChild(p);
  });
  list.innerHTML='';

  // Render grouped feature rows, each followed immediately by its config panel
  let lastGroup = null;
  FDEFS.forEach(f=>{
    // Group header
    if(f.group !== lastGroup){
      lastGroup = f.group;
      const hdr = document.createElement('div');
      hdr.style.cssText='font-size:9px;font-weight:700;color:#6060a0;letter-spacing:.10em;text-transform:uppercase;padding:10px 0 4px;border-bottom:1px solid #2a2a3a;margin-bottom:2px';
      hdr.textContent = f.group;
      list.appendChild(hdr);
    }

    const isOn = !!P.features[f.key];
    const panelId = CFG_PANEL[f.key];
    const row = document.createElement('div');
    row.className = 'ft-row';
    row.style.cssText = 'display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #1a1a26';
    row.innerHTML = `
      <div class="jp-tog ${isOn?'on':''}" id="ft-${f.key}" style="margin-top:3px;flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <span style="color:${f.color};font-weight:600;font-size:11px">${f.label}</span>
          <span style="font-size:8px;padding:1px 6px;border-radius:3px;background:${f.screen?'#c9a84c18':'#252535'};color:${f.screen?'#c9a84c':'#778'};border:1px solid ${f.screen?'#c9a84c44':'#252535'}">${f.screen?'→ Tab':'UI only'}</span>
        </div>
        <div style="font-size:9px;color:#6060a0;line-height:1.5">${f.desc||''}</div>
      </div>
    `;
    row.querySelector('.jp-tog').addEventListener('click', btn=>{
      P.features[f.key] = !P.features[f.key];
      btn.target.classList.toggle('on', P.features[f.key]);
      // Show/hide the inline config panel
      if(panelId){
        const cfg = document.getElementById(panelId);
        if(cfg) cfg.style.display = P.features[f.key] ? '' : 'none';
      }
      if(f.key==='expanding_wild' && P.features[f.key]) initEWActiveScreens();
      rebuildTabs(); refresh(); renderLayers(); markDirty();
    });
    list.appendChild(row);

    // Immediately inject this feature's config panel right below its row
    if(panelId){
      const cfg=document.getElementById(panelId);
      if(cfg){
        cfg.style.display=isOn?'':'none';
        list.appendChild(cfg);
      }
    }
  });

  // ── Custom Features section ──
  const customHdr = document.createElement('div');
  customHdr.style.cssText='font-size:9px;font-weight:700;color:#6060a0;letter-spacing:.10em;text-transform:uppercase;padding:12px 0 4px;border-bottom:1px solid #2a2a3a;margin-bottom:6px';
  customHdr.textContent='Custom Features';
  list.appendChild(customHdr);

  // Render existing custom features
  (P.features._custom||[]).forEach((cf,i)=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #1a1a26';
    row.innerHTML=`
      <div class="jp-tog ${cf.on?'on':''}" style="flex-shrink:0;margin-top:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:11px;color:#d0cec8;font-weight:500">${cf.label}</div>
        ${cf.desc?`<div style="font-size:9px;color:#6060a0">${cf.desc}</div>`:''}
      </div>
      <button style="border:none;background:transparent;color:#8080a8;cursor:pointer;font-size:16px;padding:2px 5px;line-height:1;flex-shrink:0" title="Remove">×</button>
    `;
    row.querySelector('.jp-tog').addEventListener('click', btn=>{
      cf.on=!cf.on; btn.target.classList.toggle('on',cf.on); markDirty();
    });
    row.querySelector('button').addEventListener('click',()=>{
      P.features._custom.splice(i,1); buildFeatures(); markDirty();
    });
    list.appendChild(row);
  });

  // Add custom feature form
  const addWrap = document.createElement('div');
  addWrap.style.cssText='padding:10px 0 4px;display:flex;flex-direction:column;gap:7px';
  addWrap.innerHTML=`
    <div style="font-size:10px;color:#9898b8;font-weight:600">+ Add Custom Feature</div>
    <input class="fi" id="cf-label-inp" placeholder="Feature name e.g. Bonus Spins" style="font-size:11px">
    <input class="fi" id="cf-desc-inp" placeholder="Short description (optional)" style="font-size:11px">
    <div style="display:flex;align-items:center;gap:10px">
      <label style="display:flex;align-items:center;gap:6px;font-size:10px;color:#9090b0;cursor:pointer">
        <input type="checkbox" id="cf-tab-chk" style="accent-color:#c9a84c"> Creates canvas tab
      </label>
      <button id="cf-add-btn" style="margin-left:auto;padding:5px 16px;border-radius:6px;border:1px solid #c9a84c44;background:#c9a84c10;color:#c9a84c;font-size:10px;font-family:Space Grotesk,sans-serif;cursor:pointer;font-weight:600">Add →</button>
    </div>
  `;
  addWrap.querySelector('#cf-add-btn').addEventListener('click',()=>{
    const lbl=(addWrap.querySelector('#cf-label-inp').value||'').trim();
    if(!lbl) return;
    const desc=(addWrap.querySelector('#cf-desc-inp').value||'').trim();
    const hasTab=addWrap.querySelector('#cf-tab-chk').checked;
    if(!P.features._custom) P.features._custom=[];
    P.features._custom.push({label:lbl,desc,hasTab,on:true});
    addWrap.querySelector('#cf-label-inp').value='';
    addWrap.querySelector('#cf-desc-inp').value='';
    addWrap.querySelector('#cf-tab-chk').checked=false;
    buildFeatures(); markDirty();
  });
  // Enter key submits
  addWrap.querySelector('#cf-desc-inp').addEventListener('keydown',e=>{ if(e.key==='Enter') addWrap.querySelector('#cf-add-btn').click(); });
  list.appendChild(addWrap);
}
// Track the most recently selected import file so the parse button can use it
var _lastImportFile = null;

document.getElementById('file-in').addEventListener('change',e=>{
  Array.from(e.target.files).forEach(f=>{
    P.importedFiles.push({name:f.name,type:/gdd|design/i.test(f.name)?'GDD':/art|guide/i.test(f.name)?'Art Guide':'Document'});
    renderFiles();
    const t=f.name.toLowerCase();
    if(/hold|spin/i.test(t)){P.features.holdnspin=true;document.getElementById('ft-holdnspin')?.classList.add('on');document.getElementById('hns-tab').style.display='flex';}
    refresh(); markDirty();
  });
  // Store the first file for the AI parse button
  if(e.target.files[0]){
    _lastImportFile = e.target.files[0];
    const btn = document.getElementById('parse-gdd-btn');
    if(btn){ btn.style.display='flex'; }
    const st = document.getElementById('parse-gdd-status');
    if(st){ st.style.display='none'; }
  }
});

function renderFiles(){
  const list=document.getElementById('ifl-list');
  list.innerHTML=P.importedFiles.map((f,i)=>`<div class="ifl"><span style="font-size:13px">📄</span><span class="ifl-n">${f.name}</span><span class="ifl-b">${f.type}</span><span class="ifl-r" data-i="${i}">✕</span></div>`).join('');
  list.querySelectorAll('.ifl-r').forEach(b=>b.addEventListener('click',()=>{P.importedFiles.splice(+b.dataset.i,1);renderFiles();}));
}

// ─── AI GDD Parser ─────────────────────────────────────────────────────────────
// Sends the last imported file to /api/parse-gdd and populates all form fields.

document.getElementById('parse-gdd-btn')?.addEventListener('click', async function(){
  if(!_lastImportFile){ showToast('No file selected'); return; }
  const btn = document.getElementById('parse-gdd-btn');
  const st  = document.getElementById('parse-gdd-status');
  const origText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ Parsing…';
  st.style.display='none';

  try {
    const fd = new FormData();
    fd.append('file', _lastImportFile);
    const res = await fetch('/api/parse-gdd', { method:'POST', body:fd });
    const json = await res.json();
    if(!res.ok || json.error){
      throw new Error(json.error || 'Parse failed');
    }
    applyGDDFields(json.fields);
    st.style.cssText = 'display:block;margin-top:8px;font-size:10px;text-align:center;border-radius:6px;padding:6px 10px;background:#c9a84c18;color:#c9a84c;border:1px solid #c9a84c33';
    st.textContent = '✓ Settings filled from document — review and adjust below';
    showToast('Project settings filled from GDD');
  } catch(err) {
    st.style.cssText = 'display:block;margin-top:8px;font-size:10px;text-align:center;border-radius:6px;padding:6px 10px;background:#ef7a7a18;color:#ef7a7a;border:1px solid #ef7a7a33';
    st.textContent = '✕ ' + (err.message || 'Parse failed — check the file and try again');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origText;
  }
});

// Apply a GDDFields object returned by /api/parse-gdd to the editor's form fields.
function applyGDDFields(f){
  if(!f) return;
  const setVal = (id, val) => {
    if(val == null || val === '') return;
    const el = document.getElementById(id);
    if(el){ el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }
  };

  // ── Game Identity ──
  if(f.gameName){ P.gameName = f.gameName; setVal('game-name', f.gameName); }

  // ── Theme ──
  if(f.theme){
    setVal('theme-sel', f.theme);
    P.theme = f.theme;
  }

  // ── Theme / Art Direction text fields ──
  setVal('game-setting',        f.setting);
  setVal('game-story',          f.story);
  setVal('game-mood',           f.mood);
  setVal('game-bonus-narrative',f.bonusNarrative);
  setVal('game-art-style',      f.artStyle);
  setVal('game-art-ref',        f.artRef);
  setVal('game-art-notes',      f.artNotes);

  // ── Reels ──
  if(f.reelset){
    P.reelset = f.reelset;
    const rSel = document.getElementById('reel-sel');
    if(rSel){ rSel.value = f.reelset; rSel.dispatchEvent(new Event('change', {bubbles:true})); }
  }
  if(f.rtp){
    const rtpInps = document.getElementById('ptab-reels')?.querySelectorAll('input[type=number]');
    if(rtpInps && rtpInps[3]) { rtpInps[3].value = f.rtp; rtpInps[3].dispatchEvent(new Event('input')); }
  }
  if(f.volatility){
    const volSels = document.getElementById('ptab-reels')?.querySelectorAll('select');
    if(volSels){ volSels.forEach(s=>{ if(s.querySelector('option[value="Medium"]')){ s.value=f.volatility; s.dispatchEvent(new Event('change')); } }); }
  }
  if(f.paylines){
    const plInps = document.getElementById('ptab-reels')?.querySelectorAll('input[type=number]');
    if(plInps && plInps[0]) { plInps[0].value = f.paylines; plInps[0].dispatchEvent(new Event('input')); }
  }

  // ── Jackpots ──
  const jpMap = { jackpotMini:'mini', jackpotMinor:'minor', jackpotMajor:'major', jackpotGrand:'grand' };
  Object.entries(jpMap).forEach(([fk, pk]) => {
    if(f[fk] && P.jackpots[pk]){
      P.jackpots[pk].on  = true;
      P.jackpots[pk].val = f[fk];
      const jpEl = document.getElementById('jp-'+pk+'-val');
      const jpTog = document.getElementById('jp-'+pk+'-tog');
      if(jpEl) jpEl.value = f[fk];
      if(jpTog) jpTog.checked = true;
    }
  });

  // ── Features ──
  if(Array.isArray(f.features)){
    f.features.forEach(key => {
      if(key in P.features){
        P.features[key] = true;
        const ftEl = document.getElementById('ft-'+key);
        if(ftEl) ftEl.classList.add('on');
        // Special: show Hold & Spin tab if enabled
        if(key==='holdnspin') document.getElementById('hns-tab')?.style && (document.getElementById('hns-tab').style.display='flex');
      }
    });
  }

  // ── Symbols ──
  if(f.symbolHighCount != null)    setVal('sym-high-count',    String(f.symbolHighCount));
  if(f.symbolLowCount != null)     setVal('sym-low-count',     String(f.symbolLowCount));
  if(f.symbolSpecialCount != null) setVal('sym-special-count', String(f.symbolSpecialCount));

  // Rebuild the symbol set with the new counts
  const highN    = f.symbolHighCount    ?? (parseInt(document.getElementById('sym-high-count')?.value)||5);
  const lowN     = f.symbolLowCount     ?? (parseInt(document.getElementById('sym-low-count')?.value)||5);
  const specialN = f.symbolSpecialCount ?? (parseInt(document.getElementById('sym-special-count')?.value)||2);
  P.symbols = buildDefaultSymbols(highN, lowN, specialN);

  // Override individual symbol names if provided
  if(Array.isArray(f.symbolHighNames)){
    const highs = P.symbols.filter(s=>s.type==='high');
    f.symbolHighNames.forEach((name, i)=>{ if(highs[i]) highs[i].name = name; });
  }
  if(Array.isArray(f.symbolLowNames)){
    const lows = P.symbols.filter(s=>s.type==='low');
    f.symbolLowNames.forEach((name, i)=>{ if(lows[i]) lows[i].name = name; });
  }
  if(Array.isArray(f.symbolSpecialNames)){
    const specials = P.symbols.filter(s=>s.type==='special');
    f.symbolSpecialNames.forEach((name, i)=>{ if(specials[i]){ specials[i].name = name; specials[i].id = name; } });
  }

  renderSymbolTable();
  renderLayers();
  refresh();
  markDirty();
  showToast('✓ Settings applied from GDD');
}

// Tabs + viewport
// screen-tab clicks wired in rebuildTabs()
// Viewport toggle button opens/closes dropdown
document.getElementById('vp-toggle-btn')?.addEventListener('click', e=>{
  e.stopPropagation();
  const dd=document.getElementById('vp-dropdown');
  const isOpen=dd.classList.contains('show');
  document.querySelectorAll('.dropdown').forEach(d=>{d.classList.remove('show');d.previousElementSibling?.classList?.remove('open');});
  if(!isOpen) dd.classList.add('show');
});
// Viewport dropdown items
document.querySelectorAll('[data-vp]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.vp&&setViewport(btn.dataset.vp)));

// Menu bar
document.querySelectorAll('.menu-btn').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();const id='menu-'+btn.dataset.menu;const isOpen=document.getElementById(id).classList.contains('show');document.querySelectorAll('.dropdown').forEach(d=>{d.classList.remove('show');d.previousElementSibling?.classList.remove('open');});if(!isOpen){document.getElementById(id).classList.add('show');btn.classList.add('open');}});});
document.addEventListener('click',()=>{document.querySelectorAll('.dropdown').forEach(d=>d.classList.remove('show'));document.querySelectorAll('.menu-btn').forEach(b=>b.classList.remove('open'));});
const openExp=()=>document.getElementById('export-panel').classList.add('show');
// m-project wired below with closeAllMenus() included
// topbar-settings-btn removed; project settings now via Project workspace or ⌘,
['m-export-open','m-exp-png','m-exp-all','m-exp-spine','m-exp-settings'].forEach(id=>document.getElementById(id)?.addEventListener('click',openExp));
document.getElementById('m-exp-layers')?.addEventListener('click',()=>exportZipWithJSX());
document.getElementById('exp-close').addEventListener('click',()=>document.getElementById('export-panel').classList.remove('show'));
// Close export panel when clicking outside it
document.addEventListener('mousedown',e=>{
  const ep=document.getElementById('export-panel');
  if(ep&&ep.classList.contains('show')&&!ep.contains(e.target)){
    // Don't close if clicking the export-open buttons themselves
    const trigger=e.target.closest('#m-export-open,#m-exp-png,#m-exp-all,#m-exp-spine,#m-exp-layers,#m-exp-settings,#quick-export');
    if(!trigger) ep.classList.remove('show');
  }
});
document.getElementById('quick-export').addEventListener('click',openExp);
document.getElementById('m-save-menu').addEventListener('click',()=>{closeAllMenus();saveProject();});
document.getElementById('menubar-save').addEventListener('click',saveProject);
document.getElementById('m-saveas').addEventListener('click',()=>{closeAllMenus();saveProjectFile(true);});
document.getElementById('m-open').addEventListener('click',()=>{closeAllMenus();loadProjectFile();});
document.getElementById('m-cloud')?.addEventListener('click',()=>openCloudModal());
document.getElementById('m-new').addEventListener('click',()=>{if(confirm('Start a new project? Unsaved changes will be lost.')){localStorage.removeItem('sf_welcomed_v1');localStorage.removeItem('sf_overlay_v1');location.reload();}});
document.getElementById('m-show-welcome').addEventListener('click',()=>{const wm=document.getElementById('welcome-modal');if(wm)wm.classList.add('show');closeAllMenus();});
document.getElementById('m-layers-toggle').addEventListener('click',()=>{const h=document.getElementById('left-panel').classList.toggle('hidden');document.getElementById('m-layers-toggle').classList.toggle('on',!h);setTimeout(fitZoom,50);});
document.getElementById('m-ai-toggle').addEventListener('click',()=>{const h=document.getElementById('right-panel').classList.toggle('hidden');document.getElementById('m-ai-toggle').classList.toggle('on',!h);setTimeout(fitZoom,50);});
document.getElementById('m-grid-toggle').addEventListener('click',()=>{P.showGrid=!P.showGrid;document.getElementById('cbg').style.display=P.showGrid?'':'none';document.getElementById('m-grid-toggle').classList.toggle('on',P.showGrid);});
document.getElementById('m-zoom-fit')?.addEventListener('click',fitZoom);
document.getElementById('m-zoom-100')?.addEventListener('click',()=>{ZOOM=1;applyZoom();});
document.getElementById('btn-undo').addEventListener('click',undo);
document.getElementById('btn-redo').addEventListener('click',redo);
document.getElementById('add-layer-btn').addEventListener('click',()=>{
  // Open a file picker and create a new custom layer on the current screen
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
  inp.onchange=()=>{
    const file=inp.files[0]; if(!file) return;
    // Derive a unique key: custom_1, custom_2, …
    const existingNums=Object.keys(PSD).filter(k=>k.startsWith('custom_'))
      .map(k=>parseInt(k.slice(7),10)).filter(n=>!isNaN(n));
    const nextN=(existingNums.length?Math.max(...existingNums)+1:1);
    const key='custom_'+nextN;
    const label=file.name.replace(/\.[^.]+$/,'').slice(0,28)||('Layer '+nextN);
    // Register in PSD with full-canvas default dimensions
    PSD[key]={label,type:'template',locked:false,z:6,
      portrait: {x:0,y:0,w:2000,h:2000},
      landscape:{x:0,y:0,w:2000,h:1125}};
    // Add to every screen that shares the current group so it's available globally,
    // but only push to the active screen for now
    const scr=SDEFS[P.screen];
    if(scr&&scr.keys&&!scr.keys.includes(key)) scr.keys.push(key);
    // Read and store the asset then rebuild
    const reader=new FileReader();
    reader.onload=ev=>{
      EL_ASSETS[key]=ev.target.result;
      buildCanvas(); renderLayers(); markDirty();
      // Upload to CDN so asset survives autosaveProject's base64-strip.
      // _sfUploadDataUrlToStorage swaps EL_ASSETS[key] to CDN URL when done,
      // then calls _sfSaveNow() to persist the CDN URL immediately.
      if(typeof _sfUploadDataUrlToStorage==='function') _sfUploadDataUrlToStorage(key, ev.target.result);
    };
    reader.readAsDataURL(file);
  };
  inp.click();
});

// Save
let _saveStatusTimer=null;
// ─── File state tracking ─────────────────────────────────
let _currentFilename = null; // null = never saved to file
let _currentFileHandle = null; // FileSystemFileHandle — set when using File System Access API

function _sfSlug(name){
  return (name||'untitled').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'untitled';
}
function _setSaveStatus(cls, text){
  const ts = document.getElementById('topbar-save-status');
  if(!ts) return;
  ts.className = cls;
  ts.textContent = text;
}

// ─── Delete any layer by key ────────────────────────────────────────────────
// Custom layers are fully removed from PSD and all screens.
// Built-in layers are removed from the *current screen* only (non-destructive).
function deleteAnyLayer(key){
  if(!key) return;
  if(key.startsWith('custom_')){
    deleteCustomLayer(key);
    return;
  }
  // Built-in: confirm then remove from current screen's key list
  const def = PSD[key];
  const label = def?.label || key;
  if(!confirm('Remove "' + label + '" from the current screen?\n\nThis removes it from the canvas on this screen only. It can be added back by rebuilding the canvas or switching screens.')) return;
  const sc = SDEFS[P.screen];
  if(sc && sc.keys){
    const idx = sc.keys.indexOf(key);
    if(idx !== -1) sc.keys.splice(idx, 1);
  }
  if(SEL_KEY === key) SEL_KEY = null;
  buildCanvas(); renderLayers(); markDirty();
  pushHistory('remove '+key+' from '+P.screen);
}

// ─── Delete a custom layer by key ───────────────────────────────────────────
function deleteCustomLayer(key){
  if(!key || !key.startsWith('custom_')) return;
  const commit = beginAction('delete layer '+key);
  delete PSD[key];
  delete EL_ASSETS[key];
  delete EL_ADJ[key];
  delete EL_MASKS[key];
  delete EL_BLEND_MODES[key];
  // Remove from every screen's key list
  Object.values(SDEFS).forEach(function(def){
    if(def.keys){var i=def.keys.indexOf(key);if(i!==-1)def.keys.splice(i,1);}
  });
  if(SEL_KEY===key) SEL_KEY=null;
  buildCanvas(); renderLayers(); markDirty();
  commit();
}

// ─── Duplicate a layer by key ────────────────────────────────────────────────
function duplicateLayer(key){
  if(!key||!PSD[key]) return;
  var src=PSD[key];
  var existingNums=Object.keys(PSD).filter(function(k){return k.startsWith('custom_');})
    .map(function(k){return parseInt(k.slice(7),10);}).filter(function(n){return !isNaN(n);});
  var nextN=existingNums.length?Math.max.apply(null,existingNums)+1:1;
  var newKey='custom_'+nextN;
  PSD[newKey]=JSON.parse(JSON.stringify(src));
  PSD[newKey].label=(src.label||key)+' copy';
  if(EL_ASSETS[key]) EL_ASSETS[newKey]=EL_ASSETS[key];
  if(EL_ADJ[key]) EL_ADJ[newKey]=JSON.parse(JSON.stringify(EL_ADJ[key]));
  if(EL_BLEND_MODES[key]) EL_BLEND_MODES[newKey]=EL_BLEND_MODES[key];
  // Add to the same screen
  Object.entries(SDEFS).forEach(function(e){
    if(e[1].keys&&e[1].keys.includes(key)&&!e[1].keys.includes(newKey)) e[1].keys.push(newKey);
  });
  SEL_KEY=newKey;
  buildCanvas(); renderLayers(); markDirty();
}

function markDirty(){
  if(typeof window.updateHistoryUI==='function' && document.getElementById('hist-panel')?.classList.contains('show')) window.updateHistoryUI();

  const s = document.getElementById('save-status'); if(s) s.style.display='block';
  if(_currentFilename){
    _setSaveStatus('dirty', _currentFilename + ' ●');
  } else {
    _setSaveStatus('unsaved', 'Unsaved project');
  }
}
function _showSaved(filename, cloudProvider){
  _currentFilename = filename;
  if(cloudProvider){
    _setSaveStatus('cloud', (cloudProvider==='gdrive'?'☁ Drive: ':'☁ OneDrive: ') + filename);
  } else {
    _setSaveStatus('saved', filename);
    clearTimeout(window._saveStatusTimer);
    window._saveStatusTimer = setTimeout(() => {
      _setSaveStatus('', filename);
    }, 2600);
  }
  const btn = document.getElementById('save-btn'), s = document.getElementById('save-status');
  if(btn){ btn.textContent='✓ Saved'; btn.style.background='linear-gradient(135deg,#2e7d5a,#5eca8a)'; setTimeout(()=>{btn.textContent='Save Project';btn.style.background='linear-gradient(135deg,#c9a84c,#e8c96d)';},2000); }
  if(s) s.style.display='none';
  _addRecentFile(filename);
}

// ─── Build full project data for file ────────────────────
function buildFilePayload(){
  const keyOrders = {};
  Object.entries(SDEFS).forEach(([s,def]) => { if(def.keys) keyOrders[s]=[...def.keys]; });
  return {
    _format:   'spinative',
    _version:  '1',
    _savedAt:  new Date().toISOString(),
    _appBuild: 'Spinative v25',
    // Core project data
    gameName:  P.gameName,
    theme:     P.theme,
    reelset:   P.reelset,
    viewport:  P.viewport,
    screen:    P.screen,
    colors:    JSON.parse(JSON.stringify(P.colors)),
    features:  JSON.parse(JSON.stringify(P.features)),
    jackpots:  JSON.parse(JSON.stringify(P.jackpots)),
    char:      JSON.parse(JSON.stringify(P.char)),
    ante:      JSON.parse(JSON.stringify(P.ante)),
    msgPos:    P.msgPos,
    ovProps:   JSON.parse(JSON.stringify(P.ovProps||{})),
    ovPos:     JSON.parse(JSON.stringify(P.ovPos||{})),
    showGrid:  P.showGrid,
    screens:   P.screens ? [...P.screens] : null,
    library:   JSON.parse(JSON.stringify(P.library||[])),
    symbols:   JSON.parse(JSON.stringify(P.symbols||[])),
    // Layer positions
    elVP: {
      portrait:  JSON.parse(JSON.stringify(EL_VP.portrait  || {})),
      landscape: JSON.parse(JSON.stringify(EL_VP.landscape || {})),
    },
    // Assets — full base64, self-contained
    assets: JSON.parse(JSON.stringify(EL_ASSETS)),
    // Visual adjustments & masks
    adjs:   JSON.parse(JSON.stringify(EL_ADJ)),
    masks:  JSON.parse(JSON.stringify(EL_MASKS)),
    // Layer order per screen
    keyOrders,
    // Locked layers
    userLocks: [...USER_LOCKS],
    // Flow designer
    gfd: {
      nodes:       JSON.parse(JSON.stringify(GFD.nodes||[])),
      connections: JSON.parse(JSON.stringify(GFD.connections||[])),
    },
  };
}

// ─── File System Access API save ─────────────────────────
// Uses native OS "Save As" dialog (folder navigation + create folder, like Photoshop).
// Falls back to download prompt for unsupported browsers (Firefox, Safari).

async function saveProject(){
  // ⌘S: if we already have a handle, save directly without dialog
  if(_currentFileHandle){
    try{
      const payload = buildFilePayload();
      const writable = await _currentFileHandle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      _showSaved(_currentFileHandle.name);
      try{ localStorage.setItem('sf_autosave', JSON.stringify(payload)); }catch(e){}
      return;
    }catch(err){ _currentFileHandle = null; /* handle lost — fall through to Save As */ }
  }
  saveProjectFile(false);
}

async function saveProjectFile(promptName){
  // Unused arg kept for back-compat; promptName=true forces Save As dialog
  if('showSaveFilePicker' in window){
    try{
      const suggested = _sfSlug(P.gameName||'untitled') + '.spinative';
      const handle = await window.showSaveFilePicker({
        suggestedName: suggested,
        types:[{ description:'Spinative Project', accept:{'application/json':['.spinative']} }],
        excludeAcceptAllOption: true
      });
      const payload = buildFilePayload();
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      _currentFileHandle = handle;
      _showSaved(handle.name);
      try{ localStorage.setItem('sf_autosave', JSON.stringify(payload)); }catch(e){}
    }catch(err){
      if(err.name !== 'AbortError') _saveProjectFallback();
    }
  } else {
    _saveProjectFallback();
  }
}

function _saveProjectFallback(){
  // Fallback for Firefox / Safari — prompt + download
  const name = P.gameName || 'Untitled';
  const entered = window.prompt('Save as:', _sfSlug(name) + '.spinative');
  if(!entered) return;
  const filename = entered.replace(/\.spinative$/i,'').replace(/[^a-zA-Z0-9_\-. ]/g,'') + '.spinative';
  const payload  = buildFilePayload();
  const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a        = document.createElement('a');
  a.href         = URL.createObjectURL(blob);
  a.download     = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  _showSaved(filename);
  try{ localStorage.setItem('sf_autosave', JSON.stringify(payload)); }catch(e){}
}

// ─── Load a .spinative file ───────────────────────────────
async function loadProjectFile(){
  if('showOpenFilePicker' in window){
    try{
      const [handle] = await window.showOpenFilePicker({
        types:[{ description:'Spinative Project', accept:{'application/json':['.spinative']} }],
        excludeAcceptAllOption: true,
        multiple: false
      });
      const file = await handle.getFile();
      const text = await file.text();
      const d = JSON.parse(text);
      if(d._format !== 'spinative'){ alert('Not a valid .spinative file.'); return; }
      _restoreFilePayload(d);
      _currentFileHandle = handle;
      _showSaved(handle.name);
      showToast('Loaded ' + handle.name);
    }catch(err){
      if(err.name !== 'AbortError') _loadProjectFallback();
    }
  } else {
    _loadProjectFallback();
  }
}

function _loadProjectFallback(){
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.spinative,application/json';
  inp.onchange = e => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try{
        const d = JSON.parse(ev.target.result);
        if(d._format !== 'spinative'){ alert('Not a valid .spinative file.'); return; }
        _restoreFilePayload(d);
        _currentFileHandle = null;
        _showSaved(file.name.replace(/\.spinative$/i,'') + '.spinative');
        showToast('Loaded ' + file.name);
      }catch(err){ alert('Could not load file: ' + err.message); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ─── Restore full state from file payload ────────────────
function _restoreFilePayload(d){
  // Core P fields
  const pFields = ['gameName','theme','reelset','viewport','screen','msgPos','showGrid','screens','library','symbols'];
  pFields.forEach(k => { if(d[k] !== undefined) P[k] = JSON.parse(JSON.stringify(d[k])); });
  if(d.colors)   Object.assign(P.colors,   JSON.parse(JSON.stringify(d.colors)));
  if(d.features) Object.assign(P.features, JSON.parse(JSON.stringify(d.features)));
  if(d.jackpots) Object.assign(P.jackpots, JSON.parse(JSON.stringify(d.jackpots)));
  if(d.char)     Object.assign(P.char,     JSON.parse(JSON.stringify(d.char)));
  if(d.ante)     Object.assign(P.ante,     JSON.parse(JSON.stringify(d.ante)));
  if(d.ovProps)  Object.assign(P.ovProps,  JSON.parse(JSON.stringify(d.ovProps)));
  if(d.ovPos)    Object.assign(P.ovPos,    JSON.parse(JSON.stringify(d.ovPos)));
  // Layer positions
  if(d.elVP){
    Object.keys(EL_VP.portrait||{}).forEach(k => delete EL_VP.portrait[k]);
    Object.keys(EL_VP.landscape||{}).forEach(k => delete EL_VP.landscape[k]);
    if(d.elVP.portrait)  Object.assign(EL_VP.portrait,  d.elVP.portrait);
    if(d.elVP.landscape) Object.assign(EL_VP.landscape, d.elVP.landscape);
    
    // [HOTFIX] Eject stuck width constraints on legacy CSS popups so they dynamically span full-width center
    Object.keys(EL_VP.portrait).forEach(k => { if(PSD[k]?.type === 'css_ov' && EL_VP.portrait[k].w < 2000) delete EL_VP.portrait[k]; });
    Object.keys(EL_VP.landscape).forEach(k => { if(PSD[k]?.type === 'css_ov' && EL_VP.landscape[k].w < 2000) delete EL_VP.landscape[k]; });
  }
  // Assets
  Object.keys(EL_ASSETS).forEach(k => delete EL_ASSETS[k]);
  if(d.assets) Object.assign(EL_ASSETS, d.assets);
  // Adjustments & masks
  Object.keys(EL_ADJ).forEach(k => delete EL_ADJ[k]);
  if(d.adjs) Object.assign(EL_ADJ, d.adjs);
  Object.keys(EL_MASKS).forEach(k => delete EL_MASKS[k]);
  if(d.masks) Object.assign(EL_MASKS, d.masks);
  // Key orders
  if(d.keyOrders) Object.entries(d.keyOrders).forEach(([sc,keys]) => { if(SDEFS[sc]) SDEFS[sc].keys=[...keys]; });
  // Locked layers
  USER_LOCKS.clear();
  (d.userLocks||[]).forEach(k => USER_LOCKS.add(k));
  // Flow designer — handles both new multi-flow format and legacy single-canvas
  if(d.gfd){
    try{
      if(d.gfd.flows && d.gfd.flows.length>0){
        // New multi-flow format
        GFD.flows        = JSON.parse(JSON.stringify(d.gfd.flows));
        GFD.activeFlowId = d.gfd.activeFlowId || GFD.flows[0].id;
        GFD._seq         = d.gfd._seq || 0;
      } else if(Array.isArray(d.gfd.nodes)){
        // Legacy single-canvas — migrate to flows
        const id=_gfdFlowUid();
        GFD.flows = [{
          id, name:'Base Game',
          nodes:       JSON.parse(JSON.stringify(d.gfd.nodes||[])),
          connections: JSON.parse(JSON.stringify(d.gfd.connections||[])),
          pan:{x:60,y:60}, scale:0.85,
        }];
        GFD.activeFlowId = id;
        GFD._seq = d.gfd._seq || 0;
      }
      // Point live refs at the active flow
      const af=GFD.flows.find(f=>f.id===GFD.activeFlowId)||GFD.flows[0];
      if(af){
        GFD.nodes       = af.nodes;
        GFD.connections = af.connections;
        GFD.pan         = af.pan  ? {x:af.pan.x,y:af.pan.y} : {x:60,y:60};
        GFD.scale       = af.scale ?? 0.85;
      }
    }catch(e){ console.warn('GFD restore failed',e); }
    GFD.selected=null; GFD.selConn=null; GFD._eventsInit=false;
    const fn = document.getElementById('flow-nodes');
    if(fn) fn.dataset.rendered = '';
  }
  // Update ASSET_POOL for undo compatibility
  Object.entries(EL_ASSETS).forEach(([k,url]) => { if(url) poolAsset(url); });
  // Rebuild everything
  SEL_KEY = null;
  buildCanvas();
  renderLayers();
  renderLibrary();
  rebuildTabs();
  if(P.screen) switchScreen(P.screen);
  pushHistory('load file');
  // Update game name inputs in settings panel
  const gni = document.getElementById('gn-input');
  if(gni) gni.value = P.gameName || '';
  // Restore Theme / Art Direction panel fields from saved meta
  if(d.meta){
    const setVal = (id, val) => { const el=document.getElementById(id); if(el&&val!=null) el.value=val; };
    setVal('game-setting',          d.meta.setting);
    setVal('game-story',            d.meta.story);
    setVal('game-mood',             d.meta.mood);
    setVal('game-bonus-narrative',  d.meta.bonusNarrative);
    setVal('game-art-style',        d.meta.artStyle);
    setVal('game-art-ref',          d.meta.artRef);
    setVal('game-art-notes',        d.meta.artNotes);
  }
}

// ─── Cloud Storage ───────────────────────────────────────
// Google Drive + OneDrive/SharePoint. Credentials stored in localStorage.

const _CLOUD_KEY = 'sf_cloud_creds';

function _loadCloudCreds(){ try{ return JSON.parse(localStorage.getItem(_CLOUD_KEY)||'{}'); }catch(e){ return {}; } }
function _saveCloudCreds(creds){ try{ localStorage.setItem(_CLOUD_KEY, JSON.stringify(creds)); }catch(e){} }

let _gdriveToken = null, _gdriveTokenExpiry = 0, _gdriveUserEmail = '';
let _msalInstance = null, _msalAccount = null;
let _cloudSelectedFile = { gdrive: null, onedrive: null };

function openCloudModal(){
  closeAllMenus();
  const modal = document.getElementById('cloud-modal');
  if(!modal) return;
  modal.classList.add('show');
  _cloudRenderTab('gdrive');
}
function closeCloudModal(){
  const modal = document.getElementById('cloud-modal');
  if(modal) modal.classList.remove('show');
}
function _switchCloudTab(name){
  document.querySelectorAll('.cloud-tab').forEach(t => t.classList.toggle('ct-active', t.dataset.cloud===name));
  document.querySelectorAll('.cloud-panel').forEach(p => p.classList.toggle('cp-active', p.id==='cloud-panel-'+name));
  _cloudRenderTab(name);
}
function _cloudRenderTab(name){
  if(name==='gdrive') _gdriveRender();
  if(name==='onedrive') _onedriveRender();
}

// ── Google Drive ─────────────────────────────────────────
function _gdriveRender(){
  const creds = _loadCloudCreds();
  const setup = document.getElementById('gdrive-setup');
  const connected = document.getElementById('gdrive-connected');
  if(!setup||!connected) return;
  const hasToken = _gdriveToken && Date.now() < _gdriveTokenExpiry;
  if(hasToken){
    setup.style.display = 'none'; connected.style.display = 'block';
    document.getElementById('gdrive-user-email').textContent = _gdriveUserEmail || '';
    _gdriveListFiles();
  } else {
    setup.style.display = 'block'; connected.style.display = 'none';
    if(creds.gdriveClientId) document.getElementById('gdrive-client-id').value = creds.gdriveClientId;
    if(creds.gdriveApiKey)   document.getElementById('gdrive-api-key').value   = creds.gdriveApiKey;
  }
}

async function _loadScript(src){
  return new Promise((res,rej)=>{
    const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

async function connectGdrive(){
  const clientId = document.getElementById('gdrive-client-id').value.trim();
  const apiKey   = document.getElementById('gdrive-api-key').value.trim();
  if(!clientId){ _cloudStatus('gdrive','Please enter your OAuth Client ID.','err'); return; }
  _cloudStatus('gdrive','Connecting…');
  try{
    if(!window.google?.accounts) await _loadScript('https://accounts.google.com/gsi/client');
    await new Promise((res,rej)=>{
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        callback: r => {
          if(r.error){ rej(new Error(r.error)); return; }
          _gdriveToken = r.access_token;
          _gdriveTokenExpiry = Date.now() + (r.expires_in*1000) - 30000;
          res();
        }
      });
      client.requestAccessToken();
    });
    // Get user email
    const ui = await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+_gdriveToken}});
    const ud = await ui.json();
    _gdriveUserEmail = ud.email || '';
    const creds = _loadCloudCreds();
    creds.gdriveClientId = clientId; creds.gdriveApiKey = apiKey;
    _saveCloudCreds(creds);
    _cloudStatus('gdrive','Connected!');
    _gdriveRender();
  }catch(err){ _cloudStatus('gdrive','Connection failed: '+err.message,'err'); }
}

function disconnectGdrive(){
  _gdriveToken = null; _gdriveTokenExpiry = 0; _gdriveUserEmail = '';
  _gdriveRender();
}

async function _gdriveEnsureFolder(){
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("name='Spinative Projects' and mimeType='application/vnd.google-apps.folder' and trashed=false")+'&fields=files(id)',
    {headers:{Authorization:'Bearer '+_gdriveToken}});
  const data = await res.json();
  if(data.files?.[0]) return data.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files',{
    method:'POST', headers:{Authorization:'Bearer '+_gdriveToken,'Content-Type':'application/json'},
    body:JSON.stringify({name:'Spinative Projects',mimeType:'application/vnd.google-apps.folder'})
  });
  return (await cr.json()).id;
}

async function _gdriveListFiles(){
  const el = document.getElementById('gdrive-file-list');
  if(!el) return;
  el.innerHTML = '<div class="cloud-loading">Loading…</div>';
  try{
    const fid = await _gdriveEnsureFolder();
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("'"+fid+"' in parents and trashed=false")+'&fields=files(id,name,modifiedTime)&orderBy=modifiedTime+desc',
      {headers:{Authorization:'Bearer '+_gdriveToken}});
    const data = await res.json();
    const files = (data.files||[]).filter(f=>f.name.endsWith('.spinative'));
    if(!files.length){ el.innerHTML='<div class="cloud-empty">No .spinative files yet</div>'; return; }
    el.innerHTML = files.map(f=>{
      const d = new Date(f.modifiedTime); const ds = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
      return `<div class="cloud-file-item" data-id="${f.id}" data-name="${f.name}" onclick="_gdriveSelectFile(this)">
        <span class="cloud-file-ico">📄</span>
        <span class="cloud-file-name">${f.name}</span>
        <span class="cloud-file-date">${ds}</span>
      </div>`;
    }).join('');
    const fnInp = document.getElementById('gdrive-filename');
    if(fnInp && !fnInp.value) fnInp.value = _sfSlug(P.gameName||'untitled')+'.spinative';
  }catch(err){ el.innerHTML='<div class="cloud-empty" style="color:#c06060">Error: '+err.message+'</div>'; }
}

function _gdriveSelectFile(el){
  document.querySelectorAll('#gdrive-file-list .cloud-file-item').forEach(i=>i.classList.remove('cf-selected'));
  el.classList.add('cf-selected');
  _cloudSelectedFile.gdrive = {id: el.dataset.id, name: el.dataset.name};
  const fnInp = document.getElementById('gdrive-filename');
  if(fnInp) fnInp.value = el.dataset.name;
}

async function saveToGdrive(){
  if(!_gdriveToken){ _cloudStatus('gdrive','Not connected.','err'); return; }
  const fnInp = document.getElementById('gdrive-filename');
  let filename = (fnInp?.value||'').trim() || _sfSlug(P.gameName||'untitled')+'.spinative';
  if(!filename.endsWith('.spinative')) filename += '.spinative';
  _cloudStatus('gdrive','Saving…');
  try{
    const folderId = await _gdriveEnsureFolder();
    const payload  = buildFilePayload();
    const json     = JSON.stringify(payload, null, 2);
    // Check if file exists
    const search = await fetch(
      'https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent("name='"+filename+"' and '"+folderId+"' in parents and trashed=false")+'&fields=files(id)',
      {headers:{Authorization:'Bearer '+_gdriveToken}});
    const sd = await search.json();
    if(sd.files?.[0]){
      await fetch('https://www.googleapis.com/upload/drive/v3/files/'+sd.files[0].id+'?uploadType=media',{
        method:'PATCH', headers:{Authorization:'Bearer '+_gdriveToken,'Content-Type':'application/json'}, body:json
      });
    } else {
      const boundary='sf_mp_boundary';
      const meta = JSON.stringify({name:filename,parents:[folderId],mimeType:'application/json'});
      const body = '--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+meta+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+json+'\r\n--'+boundary+'--';
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
        method:'POST', headers:{Authorization:'Bearer '+_gdriveToken,'Content-Type':'multipart/related; boundary='+boundary}, body
      });
    }
    _cloudStatus('gdrive','Saved to Google Drive ✓');
    _showSaved(filename,'gdrive');
    _gdriveListFiles();
  }catch(err){ _cloudStatus('gdrive','Save failed: '+err.message,'err'); }
}

async function openFromGdrive(){
  if(!_cloudSelectedFile.gdrive){ _cloudStatus('gdrive','Select a file first.','err'); return; }
  _cloudStatus('gdrive','Opening…');
  try{
    const res = await fetch('https://www.googleapis.com/drive/v3/files/'+_cloudSelectedFile.gdrive.id+'?alt=media',
      {headers:{Authorization:'Bearer '+_gdriveToken}});
    const d = await res.json();
    if(d._format !== 'spinative'){ _cloudStatus('gdrive','Not a valid .spinative file.','err'); return; }
    _restoreFilePayload(d);
    _currentFileHandle = null;
    _showSaved(_cloudSelectedFile.gdrive.name,'gdrive');
    showToast('Loaded from Google Drive');
    closeCloudModal();
  }catch(err){ _cloudStatus('gdrive','Open failed: '+err.message,'err'); }
}

// ── OneDrive / SharePoint ────────────────────────────────
function _onedriveRender(){
  const creds = _loadCloudCreds();
  const setup = document.getElementById('onedrive-setup');
  const connected = document.getElementById('onedrive-connected');
  if(!setup||!connected) return;
  const hasAccount = !!_msalAccount;
  if(hasAccount){
    setup.style.display='none'; connected.style.display='block';
    document.getElementById('od-user-email').textContent = _msalAccount.username||'';
    _onedriveListFiles();
  } else {
    setup.style.display='block'; connected.style.display='none';
    if(creds.odClientId) document.getElementById('od-client-id').value = creds.odClientId;
    if(creds.odTenantId) document.getElementById('od-tenant-id').value = creds.odTenantId;
  }
}

async function connectOneDrive(){
  const clientId = document.getElementById('od-client-id').value.trim();
  const tenantId = document.getElementById('od-tenant-id').value.trim()||'common';
  if(!clientId){ _cloudStatus('onedrive','Please enter your Azure App Client ID.','err'); return; }
  _cloudStatus('onedrive','Connecting…');
  try{
    if(!window.msal) await _loadScript('https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js');
    _msalInstance = new msal.PublicClientApplication({
      auth:{ clientId, authority:'https://login.microsoftonline.com/'+tenantId },
      cache:{ cacheLocation:'sessionStorage' }
    });
    await _msalInstance.initialize();
    const result = await _msalInstance.acquireTokenPopup({ scopes:['Files.ReadWrite.AppFolder','User.Read'] });
    _msalAccount = result.account;
    const creds = _loadCloudCreds();
    creds.odClientId = clientId; creds.odTenantId = tenantId;
    _saveCloudCreds(creds);
    _cloudStatus('onedrive','Connected!');
    _onedriveRender();
  }catch(err){ _cloudStatus('onedrive','Connection failed: '+err.message,'err'); }
}

function disconnectOneDrive(){
  _msalAccount = null; _msalInstance = null;
  _onedriveRender();
}

async function _odToken(){
  if(!_msalInstance||!_msalAccount) throw new Error('Not connected');
  try{
    const r = await _msalInstance.acquireTokenSilent({scopes:['Files.ReadWrite.AppFolder'],account:_msalAccount});
    return r.accessToken;
  }catch(e){
    const r = await _msalInstance.acquireTokenPopup({scopes:['Files.ReadWrite.AppFolder']});
    _msalAccount = r.account; return r.accessToken;
  }
}

async function _onedriveListFiles(){
  const el = document.getElementById('onedrive-file-list');
  if(!el) return;
  el.innerHTML = '<div class="cloud-loading">Loading…</div>';
  try{
    const token = await _odToken();
    const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot/children',{headers:{Authorization:'Bearer '+token}});
    const data = await res.json();
    const files = (data.value||[]).filter(f=>f.name.endsWith('.spinative'));
    if(!files.length){ el.innerHTML='<div class="cloud-empty">No .spinative files yet</div>'; return; }
    el.innerHTML = files.sort((a,b)=>new Date(b.lastModifiedDateTime)-new Date(a.lastModifiedDateTime)).map(f=>{
      const d = new Date(f.lastModifiedDateTime); const ds = d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
      return `<div class="cloud-file-item" data-id="${f.id}" data-name="${f.name}" onclick="_odSelectFile(this)">
        <span class="cloud-file-ico">📄</span>
        <span class="cloud-file-name">${f.name}</span>
        <span class="cloud-file-date">${ds}</span>
      </div>`;
    }).join('');
    const fnInp = document.getElementById('od-filename');
    if(fnInp && !fnInp.value) fnInp.value = _sfSlug(P.gameName||'untitled')+'.spinative';
  }catch(err){ el.innerHTML='<div class="cloud-empty" style="color:#c06060">Error: '+err.message+'</div>'; }
}

function _odSelectFile(el){
  document.querySelectorAll('#onedrive-file-list .cloud-file-item').forEach(i=>i.classList.remove('cf-selected'));
  el.classList.add('cf-selected');
  _cloudSelectedFile.onedrive = {id:el.dataset.id, name:el.dataset.name};
  const fnInp = document.getElementById('od-filename');
  if(fnInp) fnInp.value = el.dataset.name;
}

async function saveToOneDrive(){
  _cloudStatus('onedrive','Saving…');
  try{
    const fnInp = document.getElementById('od-filename');
    let filename = (fnInp?.value||'').trim() || _sfSlug(P.gameName||'untitled')+'.spinative';
    if(!filename.endsWith('.spinative')) filename += '.spinative';
    const token = await _odToken();
    const payload = buildFilePayload();
    await fetch('https://graph.microsoft.com/v1.0/me/drive/special/approot:/'+encodeURIComponent(filename)+':/content',{
      method:'PUT', headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(payload,null,2)
    });
    _cloudStatus('onedrive','Saved to OneDrive ✓');
    _showSaved(filename,'onedrive');
    _onedriveListFiles();
  }catch(err){ _cloudStatus('onedrive','Save failed: '+err.message,'err'); }
}

async function openFromOneDrive(){
  if(!_cloudSelectedFile.onedrive){ _cloudStatus('onedrive','Select a file first.','err'); return; }
  _cloudStatus('onedrive','Opening…');
  try{
    const token = await _odToken();
    const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/items/'+_cloudSelectedFile.onedrive.id+'/content',{headers:{Authorization:'Bearer '+token}});
    const d = await res.json();
    if(d._format !== 'spinative'){ _cloudStatus('onedrive','Not a valid .spinative file.','err'); return; }
    _restoreFilePayload(d);
    _currentFileHandle = null;
    _showSaved(_cloudSelectedFile.onedrive.name,'onedrive');
    showToast('Loaded from OneDrive');
    closeCloudModal();
  }catch(err){ _cloudStatus('onedrive','Open failed: '+err.message,'err'); }
}

function _cloudStatus(provider, msg, cls){
  const el = document.getElementById('cloud-status-'+provider);
  if(!el) return;
  el.textContent = msg;
  el.className = 'cloud-status-msg' + (cls?' '+cls:'');
}

// ─── Recent files (stored in localStorage) ───────────────
const _RECENT_KEY = 'sf_recent_files';
function _addRecentFile(filename){
  try {
    let recent = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
    recent = [filename, ...recent.filter(f => f !== filename)].slice(0, 6);
    localStorage.setItem(_RECENT_KEY, JSON.stringify(recent));
    _renderRecentFiles();
  } catch(e){}
}
function _renderRecentFiles(){
  const el = document.getElementById('m-recent-files'); if(!el) return;
  try {
    const recent = JSON.parse(localStorage.getItem(_RECENT_KEY) || '[]');
    if(!recent.length){
      el.innerHTML = '<div style="padding:4px 10px;font-size:10px;color:#4a4a62;font-family:\'DM Mono\',monospace;font-style:italic">No recent files</div>';
      return;
    }
    el.innerHTML = recent.map(f => `
      <div class="dd-item" style="padding-left:16px" title="${f}">
        <span class="di" style="font-size:10px">📄</span>
        <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${f}</span>
      </div>`).join('');
  } catch(e){}
}
document.getElementById('save-btn').addEventListener('click',saveProject);
document.getElementById('proj-close-btn')?.addEventListener('click',()=>{
  if(activeWorkspace === 'project'){
    // Project tab opened proj-fs — close goes back to canvas
    switchWorkspace('canvas');
  } else {
    // proj-fs was opened from within canvas (e.g. Edit Settings) — restore previous screen
    document.getElementById('proj-fs')?.classList.remove('show');
    if(P._prevScreen && P._prevScreen !== 'project') switchScreen(P._prevScreen); else switchScreen('base');
  }
});
document.getElementById('proj-body').addEventListener('input',markDirty);

// AI
function addMsg(t,type){const m=document.getElementById('ai-msgs');const el=document.createElement('div');el.className='am '+type;el.innerHTML=t.replace(/\n/g,'<br>');m.appendChild(el);m.scrollTop=m.scrollHeight;return el;}
async function sendAI(txt){
  const tn=document.getElementById('theme-sel').options[document.getElementById('theme-sel').selectedIndex].text;
  const k=SDEFS[P.screen]?.keys?.[P.activeLayer];const ln=k?PSD[k]?.label:'none';
  const sys='Senior iGaming Art Director. Game:"'+P.gameName+'" Theme:'+tn+' Palette:'+P.colors.c1+','+P.colors.c2+','+P.colors.c3+' Viewport:'+P.viewport+' Reel:'+P.reelset+' Screen:'+(SDEFS[P.screen]?.label||'')+' Layer:'+ln+' Spine names: BG_BaseGame,ReelFrame,JP_Grand,Logo_L/P,Spin_Btn,AutoSpin_Btn,BuyBonus_Btn,Character. Under 120 words, production-specific.';
  addMsg(txt,'usr');const t=addMsg('Thinking…','thk');
  try{const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:sys,messages:[{role:'user',content:txt}]})});const d=await r.json();t.remove();addMsg(d?.content?.[0]?.text||'No response.','ast');}
  catch(e){t.remove();addMsg('Connection error.','thk');}
}
document.getElementById('ai-send').addEventListener('click',()=>{const inp=document.getElementById('ai-in'),v=inp.value.trim();if(!v)return;inp.value='';sendAI(v);});
document.getElementById('ai-in').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.getElementById('ai-send').click();}});


// Resize observer
new ResizeObserver(()=>{if(P.screen!=='project')fitZoom();}).observe(document.getElementById('canvas-wrap'));

// ═══ ELEMENT ADJUSTMENTS STORE ═══
const EL_ADJ = {}; // key -> {brightness, contrast, saturation, opacity}
const EL_ASSETS = {}; // key -> dataURL (uploaded image)
const EL_MASKS = {}; // key -> {type:'none'|'circle'|'inset', inset:[0,0,0,0], radius:0}

// ── Asset pool: de-duplicates base64 image data across undo/redo history entries ──
// Each unique image is stored exactly once; history snapshots reference by pool ID
const ASSET_POOL = {};
let _assetPid = 0;
function poolAsset(url){
  for(const [id,u] of Object.entries(ASSET_POOL)){if(u===url)return id;}
  const id='ap'+(++_assetPid);
  ASSET_POOL[id]=url;
  return id;
}

// ── Smart asset replacement: preserve width, fit height to natural aspect ratio ──
function applyAssetToLayer(k, dataUrl, afterFn){
  const isBg = k==='bg' || k.startsWith('bg_');
  // Store dataUrl immediately for instant canvas preview
  EL_ASSETS[k] = dataUrl;

  // Upload to Supabase Storage in the background — swap the dataUrl for a CDN URL.
  // This keeps the save payload small (URLs instead of base64).
  _sfUploadDataUrlToStorage(k, dataUrl);

  if(isBg){
    buildCanvas(); renderLayers(); renderLibrary(); markDirty();
    pushHistory('upload '+k);
    if(afterFn) afterFn(); return;
  }
  const tmpImg = new Image();
  tmpImg.onload = ()=>{
    if(tmpImg.naturalWidth>0 && tmpImg.naturalHeight>0){
      ['portrait','landscape'].forEach(vp=>{
        const curW = EL_VP[vp]?.[k]?.w ?? EL_COMPUTED[vp]?.[k]?.w ?? PSD[k]?.[vp]?.w;
        if(!curW) return;
        const newH = Math.round(curW * tmpImg.naturalHeight / tmpImg.naturalWidth);
        if(!EL_VP[vp]) EL_VP[vp]={};
        if(!EL_VP[vp][k]) EL_VP[vp][k]={};
        EL_VP[vp][k].h = newH;
        if(EL_VP[vp][k].x===undefined) EL_VP[vp][k].x = EL_COMPUTED[vp]?.[k]?.x ?? PSD[k]?.[vp]?.x ?? 0;
        if(EL_VP[vp][k].y===undefined) EL_VP[vp][k].y = EL_COMPUTED[vp]?.[k]?.y ?? PSD[k]?.[vp]?.y ?? 0;
        if(EL_VP[vp][k].w===undefined) EL_VP[vp][k].w = curW;
      });
    }
    buildCanvas(); renderLayers(); renderLibrary(); markDirty();
    pushHistory('upload '+k);
    if(afterFn) afterFn();
  };
  tmpImg.onerror = ()=>{ buildCanvas(); renderLayers(); renderLibrary(); markDirty(); pushHistory('upload '+k); if(afterFn) afterFn(); };
  tmpImg.src = dataUrl;
}

// Convert a base64 dataUrl → Blob → send to parent for Storage upload.
// When the parent replies with a CDN URL, swap it in EL_ASSETS.
function _sfUploadDataUrlToStorage(assetKey, dataUrl){
  try{
    if(!dataUrl || dataUrl.indexOf('data:') !== 0) return; // already a URL, nothing to do
    const parts = dataUrl.split(',');
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
    const binary = atob(parts[1]);
    const arr = new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++) arr[i]=binary.charCodeAt(i);
    const blob = new Blob([arr], {type: mime});
    const ext = mime.split('/')[1] || 'png';
    const file = new File([blob], assetKey+'.'+ext, {type: mime});
    // Register callback: when Storage URL comes back, swap base64 → CDN URL and trigger save.
    // Without the markDirty() call, the CDN URL would only exist in memory and never
    // reach the database unless the user made an unrelated edit after upload.
    window._sfUploadCallbacks[assetKey] = function(url){
      if(url && url.startsWith('http')){
        EL_ASSETS[assetKey] = url;
        // Save IMMEDIATELY (no debounce) so the CDN URL reaches Supabase before
        // the user can navigate away. Also notify the shell so it can update its
        // payloadRef with the CDN URL (handles the beforeunload / unmount save path).
        window.parent.postMessage({ type: 'SF_ASSET_CDN_URL', assetKey: assetKey, url: url }, '*');
        try{
          // Guard: only save if the payload has already been applied.
          // CDN callbacks can fire asynchronously during init (resolving URLs from a
          // previous session) BEFORE _sfApplyPayload has run, which would trigger a
          // save with default P state (char.enabled=false) and overwrite the user's settings.
          if(typeof window._sfPayloadLoaded !== 'undefined' && !window._sfPayloadLoaded) return;
          if(typeof window._sfSaveNow === 'function') window._sfSaveNow();
          else if(typeof markDirty === 'function') markDirty();
        }catch(e){}
      }
    };
    window.parent.postMessage({
      type: 'SF_UPLOAD_ASSET',
      assetKey: assetKey,
      file: file,
      _fallbackDataUrl: dataUrl,
    }, '*');
  }catch(e){ /* fail silently — base64 stays as fallback */ }
}

// ── Mask / clip-path helpers ──
function getMask(k){ return EL_MASKS[k]||{type:'none',inset:[0,0,0,0],radius:0}; }
function setMask(k,m){ EL_MASKS[k]=m; applyMaskToEl(k); markDirty(); }
function applyMaskToEl(k){
  const el=document.getElementById('el-'+k); if(!el) return;
  const m=getMask(k);
  if(m.type==='none'){ el.style.clipPath='none'; }
  else if(m.type==='circle'){ el.style.clipPath='ellipse(50% 50% at 50% 50%)'; }
  else if(m.type==='inset'){
    const [t,r,b,l]=m.inset; const rad=m.radius||0;
    el.style.clipPath=`inset(${t}% ${r}% ${b}% ${l}% round ${rad}%)`;
  }
}

const PLACEHOLDER_ASSETS = {
  'bg': 'data:image/png;base64,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',
  'reelFrame': 'data:image/png;base64,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',
  'reelArea': 'data:image/png;base64,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',
  'jpGrand': 'data:image/png;base64,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',
  'jpMajor': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAABcbTqwAAAIDElEQVR42u2ce1BU5xnG33PO3nfPsgvKLQEEAQkMFAGrjR0UL42VpDa31klN2uKM03Tq6FjbTmpHp+1k0mbMJDG3jq3MZBKTODFNmhJNprpIkzYil3iliJooFOS2y+6evbF7Lv1DVrawSybKnef3F9+5PHvm/Xh4v5fzvctQDOrfuvcyATBHWLqxJjvacQbGACC2UZhY5qioam5FuMBcoba6JC+aSZiR5oAxAIwybBIW5gBgmLAHwp5gERIAYsMgewAQe6mFDALAGMAgAMAgAMAgAMAgAMAgAMAgAMAgAMAgAMAgAMxBVOMpVltdsjP8c0VV817oQW8m641rBol8uGhj6EFvJumNq0FiPcytPiT0oDeVeqhBAIBBAJgmBolVEN1qoQQ96E2l3oRkkJEPc7sPBz3oTaVeGHQUAhC9wEdHIQAo0gGAQQCYGFQIwVfjL7+9K3Nhml5LRPTGkW77nw939YXP7XgsPfm+lfMsRETNLYL353svdUTe+6vNGSnrlifEERF93OQUdr/0eWc07WMnHe4n91/tCh/PyzTqHlmflFCYYzLwJo4VvJJ8/pLH99bRHseFK15/tGcjIvL4JKmzdzD09kc9juP1A27MHjLIpLKhYr7VoOdYIiKrWa26Z3l8XKxrDTqOXVlm5cPjbxTHmSxmFfdln1FeauFf3JWb8fVCs/H5gx3dG7aevfTMq+3dpQVm474ncjNWL7WaR95z7KTDvWpzc+szr7Z3L1pg0O3akplakG3UY8ZgkEnD7gyJRj3HbqiYZyUievhbiVaNmmXszpAY7frVy6xmnZZlXR5R6u4PhlQcw6y7OyFurM/Qalhmxw/TkzmWYd619TlPNAwIXr8kf9LsFN7+qMfBsgxtfzQ9Sa9lR82johCdaBgQ/IOyzDBEi/N4A2YNBpk0jtc73APukPjQ2kSrxazivlMxz3q9bzD0r9MuT7TrK8tvLL3qGp1C7akby5315QmWsT4jP8uojzPdyDJNFwRv5LmGobHJwHGFuaaY2SH85cuiqCiYNRhk0giGFOWdY30D8XFq1dM7stOMeo499GGvXZZH/yJmpem1ixYYdEREtnqH23bKIRARpSXrNEW5pph/2S1m1c0a0eURpchzLmF4bOFVo2pJhiFaucTK67QsK3glydYwIGDWYJBJ5W+2PqcvIMk56Qad0y1KRz+xu6Jdd+9Q9rA7Q+LZNo/vcrs/0H49EBzKLDGXWU5BvLlcC2eSm2N+eBx5HRHRmmXxZtuBkrw9j2feMRiUlSf3f9HVaw+GMGMwyKTi8UlSTV2/k4jonWO9jmBIHpU9NGqWWbMs3kxElGBRq2wHSvJqq0vy0lN0GiKiFWUWs3Go0B9JyxWv3z2UOUoLeGPkuSVDY49Pks61efwji/TKn55p23+4s0+rYZnfb114Z2GOCUU6DDL5vHKos7eiqrn19Zpue7Tz5aUWnjdynC8gyWu3fHaxoqq5taKquXXV5uZWhyskajXDBhrJYFBWnn2to1uWFbp/1XzLyiVW3qDn2OWL40wP35MUryhE+w529PgHZXnkvb6AJL95pMfeeMHtVasYZueP0lNUHMNgxmCQaUW4ED91zu2NLJQVhejTMzcK+soxivUTDQPC1qfarjWcd3u3bUpLfv+Fopxf/Dgj5bP/CL5tf2i79o9PHWO+33jxzf/2SrKipKfoNA+uTbRiRr4a47pZET3Qt61nJqJUIqqpqGrORvymTm/cNyuiB/rW9RiGqLa65BARpQwdakT8plZvXJdY6IG+PT3bgZIAEe0gootE9DQRNSJ+U6cXCfZiTQ9+gxCgSAdgbhoEPdDQm016E5JB0AMNvdmkd/MfKOhJByBqgY+e9OlCaT4f+v66JD8igSJ9TpC/0Chu25TmQSRgEDCFFOfxoUfWJyPzTCB4DzKBLFpgEP+0O88ZEhWm/qxLveflL8xGPavs/kmm+2uLeNHjE5kHtp+LD1+/4A6dtKky2ffvMy7N3cWWYFGuKSR4RXbXvit8YFBmfvezLCE3wyCevuhR73npc37LQ6neu7KM4qP3Jfu+/fjpBEQcBplR+AIyc7UzwKWnaKVvlliCqYkaqbzEGjx90aN+4vkrcaI4vDu+rIAPpiZqpT9WXzMV5ZpEFcfQY7++YF2+2BJ8YHViwOUVmY+bnJqdey+bq+5P8a0oswT3H+4y5mcZxTeOdGMrO5ZYM4/yUkvwg3/2676383x8U4ugVofbPhQate281xHirLxK5o0qhYhIURSK1SQbPi5JChkNrIxIwyAzCoaIZJmYU+fc6o3rk/zP/jLHFQzJDBHR3+v6dMV5puDRl4v7//pcoSN8T/v1APfc6x2m7ZvSPIkJGkmWiV57qmDgB5VJvneP9+o+qOvXlZdagu+/UOTIvFMv1TU6NVe7/KoVZdbgkVeK7Yj6BM0l3oOMP99dNT9gNHDywZruW/omkdJ8PpSdbhAPfdiDpdMUgfcgE2iOB9ck+o+fdGgRDRTpYATv2fp079n6dLej0dQiqJtaBDWiiRoEABgEACyxCD3Q0JtdeuOaQdADDb3ZpDeuBkEPNPRmkx5qEABgEACmiUHQAw292aQ3IRkEPdDQm016YbAXC4DoBT72YgGAIh0AGAQAGAQAGAQAGAQAGAQAGAQAGASAOWuQpRtrsomG3xwCMNcJe2HpxppsZBAAvmyJhSwCwOjsQUT//xWY4Y2LRNi8COamMSLNMcogI00CwFwj0hxRDQKjABhjmP8BJ9b7w94kaDkAAAAASUVORK5CYII=',
  'jpMinor': 'data:image/png;base64,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',
  'jpMini': 'data:image/png;base64,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',
  'logo': 'data:image/png;base64,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',
  'char': 'data:image/png;base64,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',
  'settings': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABQCAYAAACOEfKtAAAEo0lEQVR42u2dTUhUURSA77u9518F/uRvmD9oDIURWKS0aFELCyLJXVbmYJIkCQWFQQlFrlwYhOAmEIII3EwLSaxQmVyEWoGERI7Y4EIKZ0pHc8Sm1TN7jc68+3tmumc5vHffPd+759xzzr3vjoY2kVAo9BkpWRdN00rC/q7A0YHUNoOXnl40qXD9kfn5aUc4iJoVngIXHUgTIlbw7InJyGSGFRJKn6hGH50p68A61WLDlB5C6LMOCZgdKDT3xjTAjYrTKG29l1W7YAGaCvJSbmO7vJ8lFKBIZawwRTxbjydwMkDqvOBBmSWtIFn3C8c7PCtIO6GS0BEIwWTtQmTRVz3eRx1vk9ahwYvGxFg9zxyNNO3psuGRZBQssxBaiNJSORo/tFkWIsONEFdjSN8aT2Vp2rarz3phlQQgDTwRo0RE/0yAGGLnZMV7JPfFZS7MI95j4gMJ/ASI+JBHv4lNWAlhLhyro4/Et9m5HmQ1ZqvOk7bLIusg9oE2p3eq+DASJNrSPStdQK3K2VHKWrqX7SawbNOlgUASt7GuCWKeCopom0eR1E7bWBaMaK4/ffrkTodjb6LMWVaoCbOAl52dpbe3383OzMzYdv/+7az6+trUsrJ9Sa2t13dpmiZlJIICGGnkGYauOZ3nU93u/uLx8Q8/S0uLE169el5QWXk4JRQKSTNnIoCiZ7mqquM7GhsvpU1MfFypqDjhcTqbZ8+eveCtrj7nzc/fbdy8eW1XXl6O0Mgh0kvBIkZVtHLgwP6kpiZnemvrvTm///taS8uVjGPHjm4fGXm71N//erGhoS4tLy/XkFmxkWrCkUB3dDz65vXOrno808GsrEy9re1W5o0bzRkIIeTxTAefPHnmHx19twzJjEFtb+vsbM8pLNxjHDlyKLmvb2Cxurr2y8yMdxUhhCoqDqecOXNq5/DwyNLgoDsApc+gAHZ1PfYNDAwFHjy4kz0393VteHhkCWOMmpsvpxcVFRg1NRe9Y2PvlyH1GRTAyclPKwkJhlZQkG90d3fmJicnYsNI0ILBYCgQCPwaGnoTiDQT/9cATYj19VdnXa6+Bbf7RVFvr+tHT89Tf3n5wSRo8EACDAZXQy5X3wJCCNXVNc36fP41n8+/9vLlYAABFB0Blqmp6SACLkLDGBEhhujgH8cKGKigcbyBEQ1aeDGB50uRUaGWUs7iAVFWeR/LgsISoswlVyzT5Fi0LXvJAcsGQgNR9CIW2EDaCpHnujBriXpzkYjF9XCQwsEWYe6RruW6sE67jYLX7lUe7WJSM4ul7ITnLK22t4nygTRvU5bDJ3l2tPoJ21zE80M/CJkJJgEiagO3aHgk96nvRMhdk4MKIK2ZsARJ2xZhRiN3g6X1a3I7MSCUEzuoRyAPZy3ya01KV+RgAlDGDAthpmZqwqK+CoIw2XCrxsiK92RbC/NUDvJCFI+Xy7UaA8WkY+7cmHBhSqzkwmAAygQZV2dnbRU484of4/L0tnDKqfMDGcKMNguBkL79lcohpE7xJU7jNK1ElfRZBNLmodIbT+tWEnn0rZuwKeoo+MjgNsL7B6AVopIwk8ZWf0agQEYPzpTfcR/jrsf3yo8AAAAASUVORK5CYII=',
  'bannerBet': 'data:image/png;base64,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',
  'bannerBuy': 'data:image/png;base64,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',
  'spinBtn': 'data:image/png;base64,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',
  'autoBtn': 'data:image/png;base64,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',
  'turboBtn': 'data:image/png;base64,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',
  'msgLabel': 'data:image/png;base64,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',
  'sym_0': 'data:image/png;base64,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',
  'sym_1': 'data:image/png;base64,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',
  'sym_2': 'data:image/png;base64,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',
  'sym_3': 'data:image/png;base64,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',
  'sym_4': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAYAAACLz2ctAAANy0lEQVR42u2de3QU1R3H78zOvpPsbjYJCSQEkqCAigQUAkopvl9teWhrC1aPeNBzPEdQ6Dn1iB7BHjwUEbRHC1XBJ7UUQa1iBQQRBFEgkgqGhCQQQnazeexmN/t+TP9oE3cnm+xusjtz753f9y/Yzd65c+9nvr977/xmLoOGoDu+cZxDIJBAu6uMFan+hgHoQFLCyAB4IClBZAE+UCaViCFmKD/aP2diLTQtSKgbDpwZn6obMsnCB9CB0gGjEEI2mcIAPlCqSpYZNpH7AXygdEIoZIwF+EBSQshC2AVJGY7ZeO4H8IEyDWEvcyw0DUhKAYAgScVA+AWJKeH6IAdNkrDBlqZh/PMStGR8AYAJYEsHPJkqFwCkDLhMQRGvXLGODQDKELihQClXIDk5gYdzpw4EJO0gcrRDR2on9taZ9POQHYC0OUf0edDoihyAR64r0nCuHIAHIAKAAJ5sQeRIhQ8WcuODSFq7cKSBJ3fXSwQiaW3EkQQfgEefG7IAH/1uCA4IIRdCMmkAguvJIySzAB+EZAAQ4JMthCzABxACgACfbCHkAL7UZuRDmQDgDKHUdeQAvuRgG0odcX8WBAcIOYCvPyzpqlOiZ0FwOHepIeTkDJ8UMMRLMJUaRikh5OQIHy53B3DKdpYKQk5O8OF8WwqH3D4pIISn4gBEScWJDYKYDUpyJ0oFotguyNIM3/45E18i3UF6z0HMhWMxj8fSDB9NoYpWCKkaA9I+biIx5V5yBxTLjWgJuTiFZDGOw9IEH5KRaIGQ+Ff0yjmLhpTnPiQBUAwwIIVLHAgzeQxiHRDgo8MJWRLhAPjEhzBT5RPngAAfXU7IAiAgKQEnygEBbvpckCMFENwSWJMBQWoIM1GHdJdNxK04HHIIU4VK6mxnXB46ogJAUqAbyAFpf9H4cJS2veIydbWJeRWLcaNf7GQC3PoF9oqTGHSS32aaCbE0XmUkjDFJTyZIV7mwVxyS/kk0OY8NWZzhEON2Hg6PZpJ6G41qAGkLuSRDgjWAmehM2he0pYAwE2Wno0xZOiAIQjCEXgjFeAJIw4I2rhDiCDeHa6cqc4yKotvnGczTZun1YyrUXHaOAvE8Crmc4WCPKxLotAV7muoD7sY6v6PmuMfTciGAEEIKrY6dvvXjsZoRI5XR5Z3duPothJBjoOONX76qcORd9xijP7NXH/NUL3+wGfE8Gv+H5wpH3rHAKPxdT2Od/9vFc5sGvMJVaua67fsrlAaTQvhdw2sb2i9se61zMFiE7WuaPE1XueHN0cm2Y8DeGTo8f9a5TF8sQ+UAy3VAc9XsrIlPPl+kzDH26zSVOZ9TmfORvrRMZZpSpUcIoZYPt9nrXvpTG0IIhb2eSO0Lz1gnr3u9JPp35UueKOj4+kCPv6MtJCzTOOka3cg7746BK+z3RWrXPWNBPD9oXbPKLlObKqfr7NXHPPG+L7z5F4Z48IEwDME3HDiz9LuH79l81XMvj4oHX7LqOn7EbflsZ3fMlabLYi9bunJEvwZQqpjxK1YVIoaJ+bzxtQ3tXsvFYDLHK7n797kDfrfgPhNtM1dsQnAmVLZ4aT7LKftoCPu8kXOb1tk6j37pDti7QgqtjtWPKVebp83SF94216A2F8Q9h/pX1rblXnudXp03ou/7/OtvzM6fdXN2+6G9rt7Pxtz3SJ6uZKwq+rfdp6u9LTvfsyft2DNmZ2mLSpRCYHOnztDrx45TZ7K92g585jy9enkrOGCaLgjTlOm66A/Ov7Op89JH7zt8NmswEgzwQacj7Kg54Wl4fWP7kd/c2FC7/llroKujX1gNuV2Rsy+usgo/v3zpyhGcPptFCCH92HHq0t8+FONekYCf/3HtSgvPR5KuNMOwqHj+QlMcZzQhUGYAzNAExBjtfggh5GuzDBgG+XCYb/1ku+P8O5viDuQnrXl1cdsXnziFY8iKR5YXMAyLJqxYXchwXMzxmt58pcNzsSmQTGWdZ055e/9ddMd8o0Kn72tPXXGpyjz9Z1k/uer3XlqXZYZTR9xCcKj/GGqRyX7yqCdg7wwNpcC6l9e0mabO1KuMuX1jypF33mNkVRomZ+LV2ui/dZ39wdf8j62dyZZ9ccfb9iueWa/tHWMW3TbX0Bu6ixfcZ4oeV17c8XaX4YrJo9LdYKbK6foZ2z4vV5sLOMTzKNDtCLnqTvvaD+3rse3f7YyEgjyE4OQddZVwlpozYZJ25vv7yietebW49N7F5typM/RcVnbSE5Sg0xGu27jaKoiZqPCWXxpi3DQU4n/880oLHwknXef2w1+4fNZLfQ5dPG+RCTEM4vTZbNGtc/vKd9Sc8Ljqz/gz0W4qY65CW1SiZFVqhlVrGE1BoTL/+huzJz75fNG0N3aNjTcGxclVsVuIjjf4Z1VqJm/Gz7PKH16eP/mFN0pmfXx03LV/+2BM6cIlZmW2QZFoiGA7uMfV/tUe12DHPf/u5s6exrqUIOEjYdSya5tdGHZH3nW3UaHVsdFOKUWI040uU1Wu31KiKShUggMmqeb3t3Ra93zcnWjQnz1ugqb8oWX5M7btKcubOScrUblnNz7XFnR1x7W3nsY6//n3NncOpb6tn+5whL2evhnL6F8/kFs876cJic96Kdjx9X5XutqHj4SR49R3nnN/XWc7+diiC0fuvanhy1srzx5ddFtj/atrbSG3K2b2pDKZubKHHs8HAJNtYD6Czjz/R0vNU4+2OE5950m0EMxlZSuufHbDKH1p+aDLHQF7Z6j+L2va4nXoj2ufsvCh0JDGSiG3K2L5/MPuqDGZLvouTMuubfZUwnoiOWpOeE4uu7+5efvWLsd/Tnp9ba3BSMDPey81By7+862u71csbhbO4Atm35LNqjUMAJiCOo4c6Dm57P7mQ/Nn1f/w7LJLzdu3dnWfrvby4XA/UFiliime9ztjojJtB/uHYZ+1NeiqO+0b1rDhg3fs8S6UsNcTaf10h0PMdnPW/uBznDruEQ5h9KPL1Dj2M/Yp+UFHV9h2cI+rFx5ljlFRvuSJfOGts6yKCRqp6uhpuRDoPPZVj7lqdsxQwPLvXd3CkCiG/DZrME6kwNJsiEvHCjod4bMbVrVF/L4Yy2EF63liq99Eg+dRy8537VLURR1n0hF0dUcAwCRUuX5LSe611+uF92ajpVBrGYaLbWN/hy0kZb27Thx1u5vq+2bRHd8c7OnN0BFTOeOv1BivvibmblLY4454LjT6cQQQuxBsuGqKbvKUKr3X0hK07d/tdNQc9/Q01PmD3fYwq9GwWeXj1WUPPpbHKBQxhHYdP+KWuu7HHvxVU6aPMfPve8vt1cc89upjbvf5hoC/qz0UcnaH1fkjuLyZc7LHPvBoHsPE+oplz0fdkWCABwBTkLaoWFm6cIm5dOESc6K/9Vpagq2f7XQgGUhTOEpZdPt8Q9Ht8w1JjU+bGwONW17ugGWYJBW9ppaM3E31/u9XLG4WjglBCHV+e9h98vEHmkMuZxjXOmLngF8vmH3OcNUUreHKSm32uIka7agSlTpvBKfQ6VmGZZmw1xPxd9iCPedq/e2H97naD+3ribc0Q6uO3HtTg3HSVK1x0lRdVtnlaqUxl1MajAqFRseEPe6Iz2YJdZ855W3b94nTUXPcg/v5YAdgJBTk/z/GGVbjxUsVjwT8/FBfvlS77mlr7bqnrUOtj/dScyAdL37ytbUGrXtbg9a9/3LScEFhE4Ll+mC2FMLpAS14LhhEJoC0J0qCW4lTR3BAEIRgEABIbcgkOQyT9uIncECQvByQFHch0QVJeZfNcOvJygUWkiCU0wuaZBWCSYBQbm/PhzEgiGwASZu54uyCpL2aOB1lytIBcYRQrhvXsHKFpLd8qUHsrYNcd5iX9UY1Um+bBdt1pckBSV86kSIkk74NWbrKhc0K40BI026ZuCtt27WScLWlCkm6QJFqv2Ac+wO2a01hbDgceGCTaopCsJTbzw8EYyq/k2p2TQL4aQ3BmT5xmDWS3wfCEEzUQjQ8uETfRcoCJCAp4SbuVhwATtcQhSUREoBQfPgyVT6xyQgAIR2TM5ZkQABCceDL5DGIT8eSM4Q0LEuxNMAhRwhJT2YQzQHFhpB2EMXIHxQTcqruBUud3wchF9MxoNghksaQLEVGkBjHY2mFgpaQLGbIlQJ2UUOw2Fkt0SE5+v+kgCdFncWGXRb5gCSBKLeMaU4KGKTO7cOxk3GokxT9IokDSglhPBCl6nicsqal6g/JQrDUEAo7XSwYcEzVl7IfJB0D4gBhIhiHA0u6yqEVPiwmIThBOBgkQ1nOofnl4lTNgnGEkDSYSIQPIdioRpaCjWoAQoAPRwABQnnBhyWAAKF84MNmEpIIQngYfXjg4dyGWN8Lpj2/T66uh30IhpAsD/iwd0AIyfSFXGIBhJBMj+sRCyC4IR2uRzyAQjeUK4g0nDvxGdFyBJGmc6UmJV8OINJ4btQ9E4JLtnO6oaP1oqL2oaR4CabwVBwAiI0r4ta5ONcNAMyAK0rd6XIFTtYApgpkusAg4dkQABBDIAeCJx3lgv4nBiGE0r1XCAg0QCSI2SNkd5WxgoVmAUkpABAkPYC7q4wVg1klCJSJ8DuoAwKEoEzBFzcEC10QIARlCr5o1tiBvgAIQZmGL+lJCEAISmfYjRYT70PhuqBQsE4IGgp08SIsM9gPEoEIAiWjeOAlFYIH+yEINFz4EjoguCEoU+ClDCDACEoXdNH6L1Sem6pYbCoaAAAAAElFTkSuQmCC',
  'sym_5': 'data:image/png;base64,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',
  'sym_6': 'data:image/png;base64,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',
  'sym_7': 'data:image/png;base64,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',
  'sym_8': 'data:image/png;base64,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',
  'sym_9': 'data:image/png;base64,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',
  'sym_10': 'data:image/png;base64,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',
  'sym_11': 'data:image/png;base64,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',
};
let CTX_KEY = null; // currently open context panel target

function getAdj(k){ return EL_ADJ[k]||{brightness:0,contrast:0,saturation:0,opacity:100}; }
function applyAdjToEl(k){
  const el = document.getElementById('el-'+k); if(!el) return;
  const adj = getAdj(k);
  const f = `brightness(${1+adj.brightness/100}) contrast(${1+adj.contrast/100}) saturate(${1+adj.saturation/100})`;
  el.style.filter = f;
  el.style.opacity = (adj.opacity/100).toFixed(2);
}

function openCtxPanel(k, clientX, clientY){
  CTX_KEY = k;
  const def = PSD[k]; if(!def) return;
  const panel = document.getElementById('el-ctx-panel');
  document.getElementById('ctx-el-name').textContent = def.label || k;

  // Restore current adjustment values
  const adj = getAdj(k);
  ['brightness','contrast','saturation','opacity'].forEach(a=>{
    const sl = document.getElementById('adj-'+a);
    const vl = document.getElementById('adj-'+a+'-val');
    if(sl){ sl.value = adj[a]; }
    if(vl){ vl.textContent = adj[a]; }
  });

  // Wire copy button for this specific key
  const copyBtn = document.getElementById('ctx-copy-btn');
  if(copyBtn){
    copyBtn.onclick = ()=>{ copyAsset(k); closeCtxPanel(); };
  }
  // Wire paste button — enabled only if clipboard has content
  const pasteBtn = document.getElementById('ctx-paste-btn');
  if(pasteBtn){
    pasteBtn.style.opacity = ASSET_CLIPBOARD ? '1' : '0.4';
    pasteBtn.onclick = ()=>{ if(ASSET_CLIPBOARD){ pasteAsset(k); closeCtxPanel(); } };
  }

  // Restore mask state
  const mask = getMask(k);
  // Highlight active mask type button
  document.querySelectorAll('.mask-type-btn').forEach(btn=>{
    const isActive = btn.dataset.mt === mask.type;
    btn.style.background = isActive ? '#c9a84c18' : 'transparent';
    btn.style.borderColor = isActive ? '#3a3a52' : '#2a2a3a';
    btn.style.color = isActive ? '#c9a84c' : '#7a7a9a';
  });
  // Show/hide inset UI
  document.getElementById('mask-inset-ui').style.display = mask.type==='inset' ? 'block' : 'none';
  // Restore inset slider values
  const inset = mask.inset||[0,0,0,0];
  ['top','right','bottom','left'].forEach((s,i)=>{
    const sl=document.getElementById('mask-'+s);
    const vl=document.getElementById('mask-'+s+'-val');
    if(sl){sl.value=inset[i]||0; if(vl)vl.textContent=(inset[i]||0)+'%';}
  });
  const rSl=document.getElementById('mask-radius');
  const rVl=document.getElementById('mask-radius-val');
  if(rSl){rSl.value=mask.radius||0; if(rVl)rVl.textContent=(mask.radius||0)+'%';}

  // Position panel near click, keep on screen
  const pw = 250, ph = 520;
  let px = clientX + 14, py = clientY - 60;
  if(px + pw > window.innerWidth - 10) px = clientX - pw - 14;
  if(py + ph > window.innerHeight - 10) py = window.innerHeight - ph - 10;
  if(py < 10) py = 10;
  panel.style.left = px+'px'; panel.style.top = py+'px';
  panel.classList.add('show');
}

function closeCtxPanel(){ document.getElementById('el-ctx-panel').classList.remove('show'); CTX_KEY=null; }

// Close on outside click
document.addEventListener('click', e=>{
  const panel = document.getElementById('el-ctx-panel');
  const popup = document.getElementById('ai-gen-popup');
  if(panel.classList.contains('show') && !panel.contains(e.target) && !e.target.closest('.cel')){
    closeCtxPanel();
  }
});

// Upload button — creates a fresh <input> each time and appends it to the DOM
// before calling .click() (required by some browsers; off-DOM inputs are silently
// ignored). The target key is captured as a closure at click time so it survives
// the file-picker dialog closing and any panel state changes.
// Upload button is now a <label> wrapping the file input — browser natively
// opens the picker on label click with no JS .click() trickery needed.
// Capture CTX_KEY on mousedown (fires before the file dialog opens and before
// any panel-close handler can null out CTX_KEY).
let _ctxUploadKey = null;
document.getElementById('ctx-upload-btn').addEventListener('mousedown', () => {
  _ctxUploadKey = CTX_KEY;
});
document.getElementById('ctx-file-inp').addEventListener('change', e => {
  const file = e.target.files[0];
  const key  = _ctxUploadKey;
  _ctxUploadKey = null;
  e.target.value = '';
  if(!file || !key) return;
  const reader = new FileReader();
  reader.onload = ev => {
    applyAssetToLayer(key, ev.target.result, ()=>{});
    closeCtxPanel();
  };
  reader.readAsDataURL(file);
});

// Adjustment sliders
['brightness','contrast','saturation','opacity'].forEach(a=>{
  const sl = document.getElementById('adj-'+a);
  const vl = document.getElementById('adj-'+a+'-val');
  if(!sl) return;
  sl.addEventListener('input', ()=>{
    if(!CTX_KEY) return;
    if(!EL_ADJ[CTX_KEY]) EL_ADJ[CTX_KEY]={brightness:0,contrast:0,saturation:0,opacity:100};
    EL_ADJ[CTX_KEY][a] = parseInt(sl.value);
    if(vl) vl.textContent = sl.value;
    applyAdjToEl(CTX_KEY);
  });
});

// Reset adjustments
document.getElementById('ctx-reset-adj').addEventListener('click', ()=>{
  if(!CTX_KEY) return;
  EL_ADJ[CTX_KEY] = {brightness:0,contrast:0,saturation:0,opacity:100};
  ['brightness','contrast','saturation','opacity'].forEach(a=>{
    const sl = document.getElementById('adj-'+a);
    const vl = document.getElementById('adj-'+a+'-val');
    if(sl) sl.value = a==='opacity'?100:0;
    if(vl) vl.textContent = a==='opacity'?100:0;
  });
  applyAdjToEl(CTX_KEY);
});

// Mask type buttons
document.querySelectorAll('.mask-type-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(!CTX_KEY) return;
    const mt = btn.dataset.mt;
    const m = {...getMask(CTX_KEY), type:mt};
    // Highlight active
    document.querySelectorAll('.mask-type-btn').forEach(b=>{
      const isActive = b.dataset.mt === mt;
      b.style.background = isActive ? '#c9a84c18' : 'transparent';
      b.style.borderColor = isActive ? '#3a3a52' : '#2a2a3a';
      b.style.color = isActive ? '#c9a84c' : '#7a7a9a';
    });
    document.getElementById('mask-inset-ui').style.display = mt==='inset' ? 'block' : 'none';
    setMask(CTX_KEY, m);
  });
});
// Mask inset sliders
['top','right','bottom','left'].forEach((side,idx)=>{
  const sl=document.getElementById('mask-'+side);
  const vl=document.getElementById('mask-'+side+'-val');
  if(!sl) return;
  sl.addEventListener('input',()=>{
    if(!CTX_KEY) return;
    const m=getMask(CTX_KEY);
    const inset=[...( m.inset||[0,0,0,0] )];
    inset[idx]=parseInt(sl.value);
    if(vl) vl.textContent=sl.value+'%';
    setMask(CTX_KEY,{...m,inset});
  });
});
const rSl=document.getElementById('mask-radius');
const rVl=document.getElementById('mask-radius-val');
if(rSl){
  rSl.addEventListener('input',()=>{
    if(!CTX_KEY) return;
    const m=getMask(CTX_KEY);
    if(rVl) rVl.textContent=rSl.value+'%';
    setMask(CTX_KEY,{...m,radius:parseInt(rSl.value)});
  });
}

// AI Generate popup
document.getElementById('ctx-ai-btn').addEventListener('click', ()=>{
  const def = CTX_KEY ? PSD[CTX_KEY] : null;
  document.getElementById('agb-layer-sub').textContent = 'Generating for: ' + (def?.label||CTX_KEY||'—');
  document.getElementById('agb-result').style.display='none';
  document.getElementById('agb-result').textContent='';
  document.getElementById('agb-prompt').value='';
  document.getElementById('ai-gen-popup').classList.add('show');
  closeCtxPanel();
});
document.getElementById('agb-close').addEventListener('click', ()=>document.getElementById('ai-gen-popup').classList.remove('show'));
document.getElementById('ai-gen-popup').addEventListener('click', e=>{ if(e.target===document.getElementById('ai-gen-popup')) document.getElementById('ai-gen-popup').classList.remove('show'); });

// Style chips
document.querySelectorAll('.agb-chip').forEach(chip=>{
  chip.addEventListener('click',()=>{
    document.querySelectorAll('.agb-chip').forEach(c=>c.classList.remove('on'));
    chip.classList.add('on');
  });
});

document.getElementById('agb-generate').addEventListener('click', async ()=>{
  if(!CTX_KEY){ alert('No layer selected.'); return; }
  const userNotes = document.getElementById('agb-prompt').value.trim();
  const theme     = P.gameName || P.theme || 'slot game';
  const btn       = document.getElementById('agb-generate');
  const res       = document.getElementById('agb-result');

  btn.textContent = '⏳ Generating…'; btn.disabled = true;
  res.style.display = 'block'; res.textContent = '✦ Generating image…';

  // Ask the parent shell to run the AI generation (has auth + project context)
  window.parent.postMessage({
    type:      'SF_AI_GENERATE',
    ctxKey:    CTX_KEY,
    theme:     theme,
    userNotes: userNotes,
  }, '*');

  // The result will arrive as SF_AI_GENERATE_RESULT — handled in the message listener below
  window._agbPendingBtn = btn;
  window._agbPendingRes = res;
});

// Listen for SF_AI_GENERATE_RESULT (response from parent shell after /api/ai-single call)
window.addEventListener('message', function(e){
  if(!e.data || e.data.type !== 'SF_AI_GENERATE_RESULT') return;
  const btn = window._agbPendingBtn;
  const res = window._agbPendingRes;
  if(btn) { btn.textContent='✦ Generate Image'; btn.disabled=false; window._agbPendingBtn=null; }
  if(e.data.error){
    if(res){ res.textContent='⚠ ' + e.data.error; }
    return;
  }
  if(e.data.url && e.data.ctxKey){
    if(res){ res.textContent='✓ Asset generated & applied to canvas!'; }
    // Inject into canvas (same logic as SF_INJECT_IMAGE_LAYER but using ctxKey directly)
    EL_ASSETS[e.data.ctxKey] = e.data.url;
    try{
      if(typeof buildCanvas  === 'function') buildCanvas();
      if(typeof renderLayers === 'function') renderLayers();
      if(typeof markDirty    === 'function') markDirty();
    }catch(err){ console.warn('[SF] agb apply failed:', err); }
    // Auto-close popup after 1.5 s
    setTimeout(function(){ document.getElementById('ai-gen-popup').classList.remove('show'); if(res) res.textContent=''; }, 1500);
  }
  if(window._agbPendingRes) window._agbPendingRes = null;
});

// ═══ WIRE CONTEXT PANEL TO ELEMENT CLICKS ═══
// Override selectEl to also open context panel on click
const _origSelectEl = selectEl;
function selectElWithCtx(k, clientX, clientY){
  _origSelectEl(k);
  if(clientX !== undefined) openCtxPanel(k, clientX, clientY);
}

// ═══ SYMBOL SET ═══
// P.symbols = [{id, name, type:'high'|'low'|'special', screens:['base','freespin',...]}]
// Default symbol set — loaded from /editor/assets/symbols/sym-<id>.png on startup
P.symbols = [
  // Special symbols
  { id:'Wild',    name:'Wild',    type:'special', screens:['base','freespin','bonus','holdnspin'] },
  { id:'Scatter', name:'Scatter', type:'special', screens:['base','freespin'] },
  // High-paying symbols
  { id:'H1',      name:'Seven',   type:'high',    screens:['base','freespin','bonus','holdnspin'] },
  { id:'H2',      name:'Mask',    type:'high',    screens:['base','freespin','bonus','holdnspin'] },
  { id:'H3',      name:'Bell',    type:'high',    screens:['base','freespin','bonus','holdnspin'] },
  // Low-paying symbols (card suits)
  { id:'L4',      name:'Club',    type:'low',     screens:['base','freespin','bonus','holdnspin'] },
  { id:'L3',      name:'Spade',   type:'low',     screens:['base','freespin','bonus','holdnspin'] },
  { id:'L2',      name:'Diamond', type:'low',     screens:['base','freespin','bonus','holdnspin'] },
  { id:'L1',      name:'Heart',   type:'low',     screens:['base','freespin','bonus','holdnspin'] },
];

// ═══ REEL SETTINGS ═══
P.reelSettings = {
  scale:   1.0,   // multiplier on cell size  (0.4 – 2.0)
  padX:    8,     // horizontal gap between columns, px in canvas space (0–120)
  padY:    8,     // vertical gap between rows (0–120)
  overlap: { id: null, amount: 0 }  // which symbol id overlaps neighbours + by how much (0–100%)
};

// ─── Load default symbol assets via fetch → base64 dataURL ──────────────────
// fetch() resolves correctly inside iframes; dataURLs work everywhere.
// Default symbol loader — only fills slots that have NO asset yet.
// Checks for any truthy value (data: URL OR https:// CDN URL) so it never
// overwrites saved/uploaded assets with the bundled placeholder PNGs.
window._loadDefaultSymbols = function(){
  P.symbols.forEach(function(sym){
    var key = 'sym_'+sym.id;
    // Skip if ANY asset already exists (user upload, saved CDN URL, or previously loaded default)
    if(EL_ASSETS[key]) return;
    var url = '/editor/assets/symbols/sym-'+sym.id+'.png';
    fetch(url).then(function(r){
      if(!r.ok) throw new Error('missing');
      return r.blob();
    }).then(function(blob){
      var reader = new FileReader();
      reader.onload = function(ev){
        // Skip if any asset arrived (user upload or CDN URL) while we were fetching
        if(EL_ASSETS[key]) return;
        EL_ASSETS[key] = ev.target.result;
        try{ if(typeof buildCanvas==='function') buildCanvas(); }catch(e){}
        try{ if(typeof renderLayers==='function') renderLayers(); }catch(e){}
        try{ if(typeof renderLibrary==='function') renderLibrary(); }catch(e){}
        // Refresh symbol grid in reel settings modal if open
        try{ if(typeof rsBuildSymGrid==='function') rsBuildSymGrid(); }catch(e){}
      };
      reader.readAsDataURL(blob);
    }).catch(function(){}); // 404 = no default for this symbol, keep placeholder
  });
};
// Run immediately and export so _sfApplyPayload can call it after restore
window._loadDefaultSymbols();
// Expanding Wild config
P.expandWild = {
  wildSymbol: 'Wild',         // name of the wild symbol
  direction: 'vertical',     // 'vertical' | 'horizontal' | 'both'
  reels: [1,2,3,4,5],        // which reels it can land on (1-indexed)
  stackable: false,           // can stack multiple wilds per reel
  expandTiming: 'before',    // 'before' | 'after' evaluation
  substitutesScatter: false, // does it sub for scatter?
  substituteBonus: false,    // does it sub for bonus?
  inFreespins: true,         // active during free spins?
  triggersFreespins: false,  // does landing it trigger free spins?
  fsCount: 10,               // free spins awarded if triggersFreespins
  fsMinWilds: 3,             // min wilds needed to trigger FS
  visualEffect: 'expand',    // 'expand' | 'transform' | 'clone'
  glowColor: '#e8c96d',      // glow/accent colour
  activatedIn: ['base'],      // which game screens EW is active on
};

const SCREEN_KEYS = ['base','freespin','holdnspin','splash'];
const SCREEN_LABELS = {base:'Base',freespin:'FS',holdnspin:'HnS',splash:'Splash'};
const SYM_TYPE_DEFAULTS = {high:['H1','H2','H3','H4','H5','H6'],low:['L1','L2','L3','L4','L5','L6','L7','L8'],special:['Wild','Scatter','Bonus','Mini']};

function buildDefaultSymbols(highN, lowN, specialN){
  const syms = [];
  const specialIds = ['Wild','Scatter','Bonus','Mini'];
  // High symbols — visible in all game screens by default
  for(let i=0;i<highN;i++) syms.push({id:'H'+(i+1), name:(SYM_TYPE_DEFAULTS.high[i]||'H'+(i+1)), type:'high', screens:['base','freespin','holdnspin']});
  // Low symbols — visible in base + freespin by default
  for(let i=0;i<lowN;i++) syms.push({id:'L'+(i+1), name:(SYM_TYPE_DEFAULTS.low[i]||'L'+(i+1)), type:'low', screens:['base','freespin']});
  // Special symbols — all screens
  for(let i=0;i<specialN;i++) syms.push({id:(specialIds[i]||'S'+(i+1)), name:(SYM_TYPE_DEFAULTS.special[i]||'S'+(i+1)), type:'special', screens:['base','freespin','holdnspin','splash']});
  return syms;
}

function renderSymbolTable(){
  const table = document.getElementById('sym-table'); if(!table) return;
  table.innerHTML = '';
  // Header
  const hdr = document.createElement('div'); hdr.className='sym-header';
  hdr.innerHTML='<div class="sym-h">#</div><div class="sym-h">Name</div><div class="sym-h">Screens</div><div></div>';
  table.appendChild(hdr);

  P.symbols.forEach((sym,i)=>{
    const row = document.createElement('div'); row.className='sym-row';

    const badge = document.createElement('div');
    badge.className=`sym-badge ${sym.type}`;
    badge.textContent={high:'High',low:'Low',special:'Spcl'}[sym.type]||sym.type;

    const nameInp = document.createElement('input');
    nameInp.className='sym-name-fi'; nameInp.value=sym.name;
    nameInp.addEventListener('input', ()=>{ sym.name=nameInp.value; renderLayers(); markDirty(); });

    const screensDiv = document.createElement('div'); screensDiv.className='sym-screens';
    SCREEN_KEYS.forEach(sk=>{
      const btn = document.createElement('button');
      btn.className='sym-scr-btn'+(sym.screens.includes(sk)?' on':'');
      btn.textContent=SCREEN_LABELS[sk]||sk;
      btn.addEventListener('click',()=>{
        if(sym.screens.includes(sk)) sym.screens=sym.screens.filter(s=>s!==sk);
        else sym.screens.push(sk);
        btn.classList.toggle('on',sym.screens.includes(sk));
        renderLayers(); markDirty();
      });
      screensDiv.appendChild(btn);
    });

    const del = document.createElement('button'); del.className='sym-del'; del.textContent='×';
    del.addEventListener('click',()=>{ P.symbols.splice(i,1); renderSymbolTable(); renderLayers(); markDirty(); });

    row.appendChild(badge); row.appendChild(nameInp); row.appendChild(screensDiv); row.appendChild(del);
    table.appendChild(row);
  });
}

function applySymbolSet(){
  const highN = parseInt(document.getElementById('sym-high-count')?.value)||0;
  const lowN  = parseInt(document.getElementById('sym-low-count')?.value)||0;
  const specN = parseInt(document.getElementById('sym-special-count')?.value)||0;
  P.symbols = buildDefaultSymbols(highN, lowN, specN);
  renderSymbolTable();
  renderLayers();
  markDirty();
}

// Symbol count inputs live update table structure
['sym-high-count','sym-low-count','sym-special-count'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', applySymbolSet);
});
document.getElementById('sym-rebuild-btn')?.addEventListener('click', applySymbolSet);
document.querySelector('.psh[data-s="symbols"]')?.addEventListener('click',()=>{
  const b=document.getElementById('s-symbols');if(b){b.classList.toggle('hid');document.querySelector('.psh[data-s="symbols"]').classList.toggle('col');}
});

// Wire close button for context panel
document.getElementById('ctx-close-btn')?.addEventListener('click', closeCtxPanel);

// ── OVERLAY PROPERTIES PANEL WIRING ──
document.getElementById('ovp-apply-btn')?.addEventListener('click', applyOvProps);
document.getElementById('ovp-reset-btn')?.addEventListener('click',()=>{
  const panel=document.getElementById('ov-props-panel');if(!panel?.classList.contains('show'))return;
  const ov=panel.dataset.ov,sub=panel.dataset.sub;if(!ov||!sub)return;
  if(P.ovProps?.[ov]?.[sub]) delete P.ovProps[ov][sub];
  // Also reset transform (position + scale)
  if(P.ovPos?.[ov]?.[sub]) delete P.ovPos[ov][sub];
  // Restore element to defaults
  const el=document.getElementById(`${ov}-${sub}`);
  if(el){
    const subDef=OV_SUBS[ov]?.find(s=>s.id===sub);
    if(subDef){el.textContent=_ovText(ov,sub);el.style.color=subDef.dColor||'#fff';if(subDef.dSize)el.style.fontSize=subDef.dSize+'px';}
    applyOvTransform(el,0,0,1);
  }
  openOvPropsPanel(ov,sub);renderOvLayers();markDirty();
});
document.getElementById('ovp-close-btn')?.addEventListener('click',()=>{
  document.getElementById('ov-props-panel')?.classList.remove('show');
  deselectOv();
});
// Sync hex input → color picker and vice versa
document.getElementById('ovp-color')?.addEventListener('input',function(){
  const hex=this.value;document.getElementById('ovp-color-hex').value=hex;
});
document.getElementById('ovp-color-hex')?.addEventListener('input',function(){
  const hex=this.value.trim();
  if(/^#[0-9a-f]{6}$/i.test(hex)) document.getElementById('ovp-color').value=hex;
});
// Live preview: pressing Enter in text field applies immediately
document.getElementById('ovp-text')?.addEventListener('keydown',ev=>{if(ev.key==='Enter'){ev.preventDefault();applyOvProps();}});
document.getElementById('ovp-size')?.addEventListener('change',applyOvProps);

// ═══ EXPANDING WILD SETTINGS ═══
function initExpandingWild(){
  // Reel toggles
  const reelWrap = document.getElementById('ew-reel-toggles'); if(!reelWrap) return;
  const[cols]=parseReel(P.reelset);
  reelWrap.innerHTML='';
  for(let i=1;i<=cols;i++){
    const btn=document.createElement('button');
    const isOn=P.expandWild.reels.includes(i);
    btn.className='sym-scr-btn'+(isOn?' on':'');
    btn.style.cssText='font-size:9px;padding:3px 8px;min-width:26px';
    btn.textContent='R'+i;
    btn.dataset.reel=i;
    btn.addEventListener('click',()=>{
      if(P.expandWild.reels.includes(i)) P.expandWild.reels=P.expandWild.reels.filter(r=>r!==i);
      else P.expandWild.reels.push(i);
      btn.classList.toggle('on',P.expandWild.reels.includes(i));
      updateEWSummary(); markDirty();
    });
    reelWrap.appendChild(btn);
  }

  // Wire all inputs
  const wire=(id,prop,transform)=>{
    const el=document.getElementById(id); if(!el) return;
    el.value=P.expandWild[prop]!==undefined?P.expandWild[prop]:'';
    el.addEventListener('change',()=>{P.expandWild[prop]=transform?transform(el.value):el.value;updateEWSummary();markDirty();});
    el.addEventListener('input',()=>{P.expandWild[prop]=transform?transform(el.value):el.value;updateEWSummary();markDirty();});
  };
  wire('ew-symbol-name','wildSymbol');
  wire('ew-direction','direction');
  wire('ew-visual','visualEffect');
  wire('ew-timing','expandTiming');
  wire('ew-fs-count','fsCount',v=>parseInt(v)||10);
  wire('ew-fs-min','fsMinWilds',v=>parseInt(v)||3);

  // Glow colour
  const glowInp=document.getElementById('ew-glow-color');
  const glowHex=document.getElementById('ew-glow-hex');
  if(glowInp){glowInp.value=P.expandWild.glowColor;glowInp.addEventListener('input',()=>{P.expandWild.glowColor=glowInp.value;if(glowHex)glowHex.textContent=glowInp.value;markDirty();});}

  // Toggle helpers
  const wireTog=(id,prop,onClass,detail)=>{
    const tog=document.getElementById(id); if(!tog) return;
    if(P.expandWild[prop]) tog.classList.add('on');
    tog.addEventListener('click',()=>{
      P.expandWild[prop]=!P.expandWild[prop];
      tog.classList.toggle('on',P.expandWild[prop]);
      if(detail){const d=document.getElementById(detail);if(d)d.style.display=P.expandWild[prop]?'flex':'none';}
      updateEWSummary(); markDirty();
    });
  };
  wireTog('ew-tog-scatter','substitutesScatter');
  wireTog('ew-tog-bonus','substituteBonus');
  wireTog('ew-tog-stack','stackable');
  wireTog('ew-tog-infs','inFreespins');
  wireTog('ew-tog-triggerfs','triggersFreespins',null,'ew-fs-detail');
  wireTog('ew-tog-mult','hasMultiplier',null,'ew-mult-detail');

  // Section collapse
  document.querySelector('.psh[data-s="expandwild-cfg"]')?.addEventListener('click',()=>{
    const b=document.getElementById('s-expandwild-cfg');if(b){b.classList.toggle('hid');document.querySelector('.psh[data-s="expandwild-cfg"]').classList.toggle('col');}
  });

  updateEWSummary();
}

function updateEWSummary(){
  const el=document.getElementById('ew-summary'); if(!el) return;
  const ew=P.expandWild;
  const[cols]=parseReel(P.reelset);
  const reelStr=ew.reels.length===cols?'all reels':(ew.reels.length===0?'no reels':'reels '+ew.reels.sort((a,b)=>a-b).join(', '));
  const dirLabels={vertical:'vertically (full reel)',horizontal:'horizontally (full row)',both:'in both directions',cross:'in a cross (+)',diagonal:'diagonally (X)',full:'across the full screen'};
  const timingLabels={before:'before win evaluation',after:'after win evaluation',simultaneous:'simultaneously with win evaluation'};
  const parts=[
    `The <strong style="color:#e8c96d">${ew.wildSymbol||'Wild'}</strong> expands <strong style="color:#e8c96d">${dirLabels[ew.direction]||ew.direction}</strong> when it lands on ${reelStr}.`,
    `Expansion occurs <strong style="color:#e8c96d">${timingLabels[ew.expandTiming]||ew.expandTiming}</strong>.`,
  ];
  if(ew.stackable) parts.push('Multiple wilds can stack on the same reel.');
  if(ew.substitutesScatter&&ew.substituteBonus) parts.push('Substitutes for all symbols including Scatter and Bonus.');
  else if(ew.substitutesScatter) parts.push('Substitutes for all symbols including Scatter, but <em>not</em> Bonus.');
  else if(ew.substituteBonus) parts.push('Substitutes for all symbols including Bonus, but <em>not</em> Scatter.');
  else parts.push('Does not substitute for Scatter or Bonus symbols.');
  if(ew.inFreespins) parts.push('Remains active during Free Spins.');
  else parts.push('Not active during Free Spins.');
  if(ew.triggersFreespins) parts.push(`Landing ${ew.fsMinWilds}+ wilds awards <strong style="color:#e8c96d">${ew.fsCount} Free Spins</strong>.`);
  if(ew.hasMultiplier) parts.push(`The wild carries a <strong style="color:#e8c96d">${ew.multiplierType||'multiplier'}</strong>.`);
  el.innerHTML=parts.join(' ');
}

// ═══ TAB MANAGEMENT ═══
// Computes which tabs are visible based on P.features and P.expandWild.activatedIn
function computeTabs(){
  const tabs=[];

  // 1. Splash
  tabs.push({key:'splash', label:'Splash', dot:'#7c5cbf'});

  // 2. Base Game
  tabs.push({key:'base', label:'Base Game', dot:'#2e7d5a'});

  // 4. Pop-ups — group header + sub-tabs
  const popups=[];
  popups.push({key:'popup_win', label:'Big Win', dot:'#c9a84c'});
  popups.push({key:'popup_megawin', label:'Mega Win', dot:'#e8c96d'});
  popups.push({key:'popup_epicwin', label:'Epic Win', dot:'#ff7060'});
  if(P.features.buy_feature) popups.push({key:'popup_buy', label:'Buy Bonus', dot:'#ef7a7a'});
  if(P.features.freespin) popups.push({key:'popup_fs', label:'FS Trigger', dot:'#4ac8f0'});
  if(P.features.holdnspin) popups.push({key:'popup_hns', label:'HnS Trigger', dot:'#5eca8a'});
  // Jackpot popup if any jackpot is enabled
  const hasJP=Object.values(P.jackpots).some(j=>j.on);
  if(hasJP) popups.push({key:'popup_jp', label:'Jackpot Win', dot:'#ef7a7a'});
  tabs.push({key:'_popups_group', label:'Pop-ups', dot:'#ef7a7a', isGroup:true, children:popups});

  // 5. Free Spins
  if(P.features.freespin) tabs.push({key:'freespin', label:'Free Spins', dot:'#4ac8f0'});

  // 6. Feature Games
  const featureGames=[];
  if(P.features.holdnspin) featureGames.push({key:'holdnspin', label:'Hold & Spin', dot:'#5eca8a'});

  // Expanding Wild sub-tabs — label uses the wild symbol name
  if(P.features.expanding_wild){
    const ewName=P.expandWild?.wildSymbol||'Expanding Wild';
    (P.expandWild.activatedIn||['base']).forEach(parentScr=>{
      const parentLabel=SDEFS[parentScr]?.label||parentScr;
      const label=featureGames.length===0&&(P.expandWild.activatedIn||[]).length===1
        ? ewName  // single EW on one screen — just name the wild
        : ewName+' ('+parentLabel+')'; // multiple → disambiguate
      featureGames.push({key:'ew_'+parentScr, label, dot:'#e8c96d', isEW:true});
    });
  }

  // Collect all active SDEFS-registered feature screens (any feature the user enabled)
  // Group them by their feature group for clean tab organisation
  const groupedExtras = {}; // group → [{key,label,dot}]
  Object.entries(SDEFS).forEach(([key,def])=>{
    // Skip core screens already handled above
    if(['splash','base','freespin','holdnspin','win','popup_win','popup_megawin','popup_epicwin','popup_buy','popup_fs','popup_hns','popup_jp'].includes(key)) return;
    if(key.startsWith('ew_')) return; // EW handled in featureGames
    if(!def.featureKey) return;
    const fdef = FDEFS.find(f=>f.key===def.featureKey);
    const group = fdef?.group || 'Other';
    if(!groupedExtras[group]) groupedExtras[group]=[];
    groupedExtras[group].push({key, label:def.label, dot:def.dot, overlay:def.overlay});
  });

  // Add grouped extras into featureGames or as separate groups
  Object.entries(groupedExtras).forEach(([grp, screens])=>{
    screens.forEach(s=>featureGames.push(s));
  });

  if(featureGames.length===0){
    // nothing
  } else if(featureGames.length===1){
    tabs.push(featureGames[0]);
  } else {
    const hasHnS=featureGames.some(f=>f.key==='holdnspin');
    const hasEW=featureGames.some(f=>f.isEW);
    const grpLabel=hasHnS&&hasEW?'Feature Games':hasHnS?'Hold & Spin':hasEW?(P.expandWild?.wildSymbol||'Expanding Wild'):'Feature Games';
    tabs.push({key:'_features_group', label:grpLabel, dot:'#f0a84c', isGroup:true, children:featureGames});
  }

  return tabs;
}

// Flatten tabs including group children
function flattenTabs(tabs){
  const flat=[];
  tabs.forEach(t=>{
    if(t.isGroup) t.children.forEach(c=>flat.push(c));
    else if(t.key!=='project') flat.push(t);
  });
  return flat;
}

// Currently expanded group
let _openGroup = null;

function rebuildTabs(){
  registerFeatureScreens();
  const topbar=document.getElementById('topbar');
  // Remove any existing sub-tab row
  document.getElementById('sub-tab-row')?.remove();

  const container=document.getElementById('screen-tabs');
  container.innerHTML='';
  const tabs=computeTabs();
  const flat=flattenTabs(tabs);

  if(P.screen!=='project' && !flat.find(t=>t.key===P.screen)) {
    switchScreen('base');
    return;
  }

  // Figure out if the active screen belongs to a group (for sub-tab row)
  let activeGroup=null;
  tabs.forEach(t=>{ if(t.isGroup&&t.children.some(c=>c.key===P.screen)) activeGroup=t; });

  // Build primary tab row
  tabs.forEach(tabDef=>{
    if(tabDef.isGroup){
      const anyActive=tabDef.children.some(c=>c.key===P.screen);
      const btn=document.createElement('button');
      btn.className='screen-tab screen-tab-group'+(anyActive?' active':'');
      btn.dataset.group=tabDef.key;
      btn.innerHTML=`<span class="tab-dot" style="background:${tabDef.dot}"></span>${tabDef.label}<span style="font-size:8px;opacity:.55;margin-left:3px">▾</span>`;
      btn.addEventListener('click',()=>{
        _openGroup=(_openGroup===tabDef.key&&!anyActive)?null:tabDef.key;
        if(!anyActive&&tabDef.children.length>0) switchScreen(tabDef.children[0].key);
        else rebuildTabs();
      });
      container.appendChild(btn);
    } else {
      const btn=document.createElement('button');
      btn.className='screen-tab'+(tabDef.key===P.screen?' active':'');
      btn.dataset.screen=tabDef.key;
      btn.innerHTML=`<span class="tab-dot" style="background:${tabDef.dot}"></span>${tabDef.label}`;
      btn.addEventListener('click',()=>switchScreen(tabDef.key));
      container.appendChild(btn);
    }
  });

  // Build sub-tab row if active screen is in a group
  if(activeGroup){
    const subRow=document.createElement('div');
    subRow.id='sub-tab-row';
    subRow.style.cssText='display:flex;align-items:stretch;background:#080810;border-bottom:1px solid #1a1a28;height:28px;padding-left:12px;flex-shrink:0';
    // Indented label
    const indent=document.createElement('div');
    indent.style.cssText='display:flex;align-items:center;padding:0 8px 0 4px;font-size:8px;color:#7a7a9a;letter-spacing:.1em;text-transform:uppercase;border-right:1px solid #1a1a28;margin-right:4px;white-space:nowrap';
    indent.textContent='↳ '+activeGroup.label;
    subRow.appendChild(indent);
    activeGroup.children.forEach(child=>{
      const btn=document.createElement('button');
      btn.style.cssText='padding:0 12px;border:none;border-right:1px solid #1a1a28;background:transparent;font-size:10px;font-family:Space Grotesk,sans-serif;cursor:pointer;display:flex;align-items:center;gap:5px;color:'+(child.key===P.screen?'#c9a84c':'#778')+';background:'+(child.key===P.screen?'#141422':'transparent')+';position:relative;white-space:nowrap;flex-shrink:0';
      if(child.key===P.screen){
        btn.style.borderBottom='2px solid #c9a84c';
        btn.style.marginBottom='-1px';
      }
      btn.innerHTML=`<span style="width:5px;height:5px;border-radius:50%;background:${child.dot};flex-shrink:0"></span>${child.label}`;
      btn.addEventListener('click',()=>switchScreen(child.key));
      subRow.appendChild(btn);
    });
    // Insert sub-tab row right after topbar
    topbar.insertAdjacentElement('afterend', subRow);
  }
}

// ═══ EXPANDING WILD CANVAS OVERLAY ═══
// Draws the EW expansion pattern on top of the reel area
function buildEWOverlay(parentScr){
  computeLayout();
  const ew=P.expandWild;
  const[cols,rows]=parseReel(P.reelset);
  const CELL=164,GAP=8,PAD=12;
  const reelPos=getPos('reelArea');
  const gridW=cols*CELL+(cols-1)*GAP;
  const gridH=rows*CELL+(rows-1)*GAP;
  const offX=reelPos.x+Math.round((reelPos.w-gridW)/2);
  const offY=reelPos.y+Math.round((reelPos.h-gridH)/2);

  const overlay=document.createElement('div');
  overlay.id='ew-canvas-overlay';
  overlay.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:50';

  const glow=ew.glowColor||'#e8c96d';

  // For each reel the wild can land on, draw the expansion
  ew.reels.forEach(reelN=>{
    const col=reelN-1; if(col<0||col>=cols) return;
    const cx=offX+col*(CELL+GAP);
    const cy=offY;

    const highlight=document.createElement('div');

    if(ew.direction==='vertical'||ew.direction==='both'){
      // Full reel column highlighted
      highlight.style.cssText=`position:absolute;left:${cx-6}px;top:${cy-6}px;width:${CELL+12}px;height:${gridH+12}px;border:3px solid ${glow};border-radius:12px;background:${glow}14;box-shadow:0 0 30px ${glow}44;pointer-events:none`;
      overlay.appendChild(highlight);
      // Expansion arrow
      const arrow=document.createElement('div');
      arrow.style.cssText=`position:absolute;left:${cx+CELL/2-16}px;top:${cy-44}px;width:32px;height:32px;border-radius:50%;background:${glow};display:flex;align-items:center;justify-content:center;font-size:18px;color:#1a1200;font-weight:700;box-shadow:0 0 20px ${glow}88`;
      arrow.textContent='↕';
      overlay.appendChild(arrow);
    }
    if(ew.direction==='horizontal'||ew.direction==='both'){
      // Full row highlighted — show on all rows
      for(let row=0;row<rows;row++){
        const ry=offY+row*(CELL+GAP);
        const rowH=document.createElement('div');
        rowH.style.cssText=`position:absolute;left:${offX-6}px;top:${ry-4}px;width:${gridW+12}px;height:${CELL+8}px;border:2px solid ${glow}88;border-radius:8px;background:${glow}0a;pointer-events:none`;
        overlay.appendChild(rowH);
      }
      const rarrow=document.createElement('div');
      rarrow.style.cssText=`position:absolute;left:${offX-50}px;top:${offY+gridH/2-16}px;width:32px;height:32px;border-radius:50%;background:${glow};display:flex;align-items:center;justify-content:center;font-size:18px;color:#1a1200;font-weight:700;box-shadow:0 0 20px ${glow}88`;
      rarrow.textContent='↔';
      overlay.appendChild(rarrow);
    }
    if(ew.direction==='cross'){
      // Column + row cross
      const col_h=document.createElement('div');
      col_h.style.cssText=`position:absolute;left:${cx-4}px;top:${cy-4}px;width:${CELL+8}px;height:${gridH+8}px;border:3px solid ${glow};border-radius:10px;background:${glow}14;box-shadow:0 0 30px ${glow}44`;
      overlay.appendChild(col_h);
      const midRow=Math.floor(rows/2);
      const ry=offY+midRow*(CELL+GAP);
      const row_h=document.createElement('div');
      row_h.style.cssText=`position:absolute;left:${offX-4}px;top:${ry-4}px;width:${gridW+8}px;height:${CELL+8}px;border:2px solid ${glow}66;border-radius:8px;background:${glow}0c;pointer-events:none`;
      overlay.appendChild(row_h);
    }
    if(ew.direction==='full'){
      const full=document.createElement('div');
      full.style.cssText=`position:absolute;left:${offX-8}px;top:${offY-8}px;width:${gridW+16}px;height:${gridH+16}px;border:4px solid ${glow};border-radius:14px;background:${glow}18;box-shadow:0 0 60px ${glow}55;pointer-events:none`;
      overlay.appendChild(full);
    }

    // Wild symbol badge on the landing cell
    const badge=document.createElement('div');
    const midRow=Math.floor(rows/2);
    const by=offY+midRow*(CELL+GAP);
    badge.style.cssText=`position:absolute;left:${cx}px;top:${by}px;width:${CELL}px;height:${CELL}px;border-radius:8px;background:radial-gradient(circle at 40% 40%,${glow}55,${glow}11);border:3px solid ${glow};display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;z-index:2;box-shadow:0 0 40px ${glow}66`;
    badge.innerHTML=`<div style="font-size:${Math.round(CELL*0.16)}px;font-weight:700;color:${glow};letter-spacing:.06em">${ew.wildSymbol||'WILD'}</div><div style="font-size:${Math.round(CELL*0.1)}px;color:${glow}99">EXPANDS</div>`;
    overlay.appendChild(badge);
  });

  // Screen label
  const lbl=document.createElement('div');
  const parentLabel=SDEFS[parentScr]?.label||parentScr;
  lbl.style.cssText=`position:absolute;top:20px;left:50%;transform:translateX(-50%);background:${glow}22;border:2px solid ${glow}66;border-radius:8px;padding:8px 20px;font-size:22px;font-weight:600;color:${glow};letter-spacing:.1em;text-transform:uppercase;white-space:nowrap`;
  lbl.textContent='Expanding Wild — '+parentLabel;
  overlay.appendChild(lbl);

  return overlay;
}

// ═══ WIRE EW ACTIVATED-IN TOGGLES ═══
function initEWActiveScreens(){
  const wrap=document.getElementById('ew-active-screens'); if(!wrap) return;
  wrap.innerHTML='';
  const parentOptions=[
    {key:'base',    label:'Base Game',   dot:'#2e7d5a'},
    {key:'freespin',label:'Free Spins',  dot:'#4ac8f0', requires:'freespin'},
    {key:'holdnspin',label:'Hold & Spin',dot:'#5eca8a', requires:'holdnspin'},
  ];
  parentOptions.forEach(opt=>{
    if(opt.requires&&!P.features[opt.requires]) return;
    const isOn=(P.expandWild.activatedIn||[]).includes(opt.key);
    const row=document.createElement('label');
    row.className='tog-row'; row.style.gap='8px';
    const tog=document.createElement('div');
    tog.className='tog'+(isOn?' on':'');
    const lbl=document.createElement('span');
    lbl.className='tog-lbl'; lbl.style.cssText='font-size:10px;display:flex;align-items:center;gap:6px';
    lbl.innerHTML=`<span class="tab-dot" style="background:${opt.dot};width:6px;height:6px"></span>${opt.label}`;
    row.appendChild(tog); row.appendChild(lbl);
    tog.addEventListener('click',()=>{
      const arr=P.expandWild.activatedIn||[];
      if(arr.includes(opt.key)) P.expandWild.activatedIn=arr.filter(k=>k!==opt.key);
      else P.expandWild.activatedIn=[...arr,opt.key];
      tog.classList.toggle('on',P.expandWild.activatedIn.includes(opt.key));
      rebuildTabs(); markDirty();
    });
    wrap.appendChild(row);
  });
}


const THEME_BG = {
  western:    {g1:'#2a1a08',g2:'#0a0500',a:'#c9a84c',pat:'lines'},
  egypt:      {g1:'#1a1200',g2:'#050304',a:'#d4af37',pat:'diamonds'},
  rome:       {g1:'#1a0a08',g2:'#080204',a:'#c9a84c',pat:'columns'},
  greece:     {g1:'#080e1a',g2:'#020408',a:'#7a9aef',pat:'waves'},
  aztec:      {g1:'#0a1a08',g2:'#030804',a:'#5eca8a',pat:'triangles'},
  chinese:    {g1:'#1a0606',g2:'#080202',a:'#ef7a7a',pat:'lattice'},
  irish:      {g1:'#061a06',g2:'#020804',a:'#5eca8a',pat:'clovers'},
  viking:     {g1:'#080a1a',g2:'#020308',a:'#7a8aef',pat:'runes'},
  pirate:     {g1:'#061018',g2:'#020408',a:'#4ac8f0',pat:'waves'},
  fantasy:    {g1:'#100818',g2:'#040208',a:'#b07aef',pat:'stars'},
  fairy:      {g1:'#180818',g2:'#080408',a:'#f07aef',pat:'dots'},
  space:      {g1:'#020210',g2:'#000004',a:'#4ac8f0',pat:'stars'},
  jungle:     {g1:'#061408',g2:'#020604',a:'#5eca8a',pat:'leaves'},
  underwater: {g1:'#020c1a',g2:'#020408',a:'#4ac8f0',pat:'bubbles'},
  halloween:  {g1:'#0a0600',g2:'#040200',a:'#f0a84c',pat:'webs'},
  christmas:  {g1:'#060a06',g2:'#020402',a:'#ef7a7a',pat:'snowflakes'},
  fruits:     {g1:'#0a0a02',g2:'#040402',a:'#e8c96d',pat:'dots'},
  diamonds:   {g1:'#020210',g2:'#010108',a:'#7a8aef',pat:'diamonds'},
  sports:     {g1:'#060a1a',g2:'#020408',a:'#5eca8a',pat:'lines'},
  music:      {g1:'#0a0208',g2:'#040108',a:'#ef7a7a',pat:'waves'},
  mythology:  {g1:'#100a02',g2:'#060402',a:'#c9a84c',pat:'stars'},
  samurai:    {g1:'#0a0202',g2:'#040102',a:'#ef7a7a',pat:'lines'},
  steampunk:  {g1:'#0e0a02',g2:'#060402',a:'#c9a84c',pat:'gears'},
};
function getThemeBG(){return THEME_BG[P.theme]||THEME_BG.western;}

function makeThemeBG(w, h){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
  svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
  svg.style.cssText='position:absolute;inset:0;pointer-events:none';
  const r=e=>document.createElementNS(ns,e);
  const sa=(el,o)=>{Object.entries(o).forEach(([k,v])=>el.setAttribute(k,v));return el;};
  const tb=getThemeBG();
  const acc=P.colors.c1||tb.a;
  
  // Radial gradient bg
  const defs=r('defs');
  const id='bg'+Math.random().toString(36).slice(2,7);
  const grad=r('radialGradient');
  sa(grad,{id,cx:'50%',cy:'30%',r:'75%',gradientUnits:'userSpaceOnUse',
    x1:0,y1:0,x2:0,y2:h});
  const s1=r('stop');sa(s1,{'offset':'0%','stop-color':tb.g1});
  const s2=r('stop');sa(s2,{'offset':'100%','stop-color':tb.g2});
  grad.appendChild(s1);grad.appendChild(s2);defs.appendChild(grad);
  svg.appendChild(defs);
  const bg=r('rect');sa(bg,{x:0,y:0,width:w,height:h,fill:`url(#${id})`});svg.appendChild(bg);
  
  // Pattern overlay based on theme
  const pat=tb.pat;
  const step=Math.round(Math.min(w,h)/20);
  if(pat==='lines'||pat==='columns'){
    for(let x=0;x<w+h;x+=step){
      const l=r('line');
      if(pat==='lines') sa(l,{x1:x,y1:0,x2:x-h,y2:h,stroke:acc,opacity:'0.04','stroke-width':'1'});
      else sa(l,{x1:x,y1:0,x2:x,y2:h,stroke:acc,opacity:'0.04','stroke-width':'1'});
      svg.appendChild(l);
    }
  } else if(pat==='stars'||pat==='snowflakes'){
    for(let i=0;i<40;i++){
      const cx=(Math.sin(i*137.5*Math.PI/180)*0.45+0.5)*w;
      const cy=(Math.cos(i*137.5*Math.PI/180)*0.45+0.5)*h;
      const sz=1+Math.sin(i)*2;
      const dot=r('circle');sa(dot,{cx,cy,r:sz,fill:acc,opacity:(0.15+Math.sin(i*0.7)*0.1).toFixed(2)});
      svg.appendChild(dot);
    }
  } else if(pat==='diamonds'){
    for(let x=step;x<w;x+=step*2){
      for(let y=step;y<h;y+=step*2){
        const d=r('polygon');
        d.setAttribute('points',`${x},${y-step*0.6} ${x+step*0.6},${y} ${x},${y+step*0.6} ${x-step*0.6},${y}`);
        d.setAttribute('fill','none');d.setAttribute('stroke',acc);d.setAttribute('opacity','0.06');d.setAttribute('stroke-width','1');
        svg.appendChild(d);
      }
    }
  } else if(pat==='dots'||pat==='bubbles'){
    for(let x=step;x<w;x+=step){
      for(let y=step;y<h;y+=step){
        const dot=r('circle');
        sa(dot,{cx:x,cy:y,r:2,fill:acc,opacity:'0.07'});
        svg.appendChild(dot);
      }
    }
  } else if(pat==='waves'){
    for(let y=step;y<h;y+=step){
      const path=r('path');
      let d=`M0,${y}`;
      for(let x=0;x<=w;x+=step){d+=` Q${x+step/2},${y+step*0.3} ${x+step},${y}`;}
      path.setAttribute('d',d);path.setAttribute('fill','none');path.setAttribute('stroke',acc);path.setAttribute('opacity','0.05');path.setAttribute('stroke-width','1');
      svg.appendChild(path);
    }
  } else {
    // fallback grid
    for(let x=0;x<w;x+=step){const l=r('line');sa(l,{x1:x,y1:0,x2:x,y2:h,stroke:acc,opacity:'0.03','stroke-width':'1'});svg.appendChild(l);}
    for(let y=0;y<h;y+=step){const l=r('line');sa(l,{x1:0,y1:y,x2:w,y2:y,stroke:acc,opacity:'0.03','stroke-width':'1'});svg.appendChild(l);}
  }
  return svg;
}


// ═══ DEVICE FRAME ═══
let SHOW_DEVICE_FRAME = false;
function updateDeviceFrame(){
  const frame=document.getElementById('device-frame'); if(!frame) return;
  if(!SHOW_DEVICE_FRAME){frame.innerHTML='';frame.classList.remove('show');return;}
  frame.classList.add('show');
  const vp=VP[P.viewport==='desktop'?'landscape':P.viewport];
  const isPortrait=P.viewport==='portrait';
  // Frame dimensions in canvas coordinates
  const W=vp.cw, H=vp.ch;
  // Position/scale: frame wraps gf-outer
  const outer=document.getElementById('gf-outer');
  const outerR=outer.getBoundingClientRect();
  const wrapR=document.getElementById('canvas-wrap').getBoundingClientRect();
  const x=outerR.left-wrapR.left, y=outerR.top-wrapR.top;
  const pw=outerR.width, ph=outerR.height;
  // Phone bezel thickness in px (relative to displayed canvas size)
  const bz=isPortrait?Math.round(pw*0.06):Math.round(ph*0.06);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('width',pw+bz*2);svg.setAttribute('height',ph+bz*2);
  svg.style.cssText=`position:absolute;left:${x-bz}px;top:${y-bz}px`;
  const sa=(el,o)=>{Object.entries(o).forEach(([k,v])=>el.setAttribute(k,v));return el;};
  const r=e=>document.createElementNS(ns,e);
  // Outer bezel
  const rx=isPortrait?bz*1.5:bz;
  const bezel=r('rect');sa(bezel,{x:0,y:0,width:pw+bz*2,height:ph+bz*2,rx,fill:'#111118',stroke:'#2a2a3a','stroke-width':'1.5'});
  svg.appendChild(bezel);
  // Screen cutout
  const screen=r('rect');sa(screen,{x:bz,y:bz,width:pw,height:ph,rx:bz*0.3,fill:'none',stroke:'#1a1a28','stroke-width':'1'});
  svg.appendChild(screen);
  if(isPortrait){
    // Home indicator bottom
    const home=r('rect');sa(home,{x:pw/2-pw*0.08+bz,y:ph+bz+bz*0.4,width:pw*0.16,height:bz*0.18,rx:bz*0.09,fill:'#333344'});svg.appendChild(home);
    // Camera notch top
    const cam=r('circle');sa(cam,{cx:pw/2+bz,cy:bz*0.45,r:bz*0.12,fill:'#222230'});svg.appendChild(cam);
  } else {
    // Landscape: side buttons
    const btn=r('rect');sa(btn,{x:pw+bz*1.6,y:ph*0.3+bz,width:bz*0.2,height:ph*0.2,rx:bz*0.05,fill:'#333344'});svg.appendChild(btn);
    const cam=r('circle');sa(cam,{cx:bz*0.45,cy:ph/2+bz,r:bz*0.12,fill:'#222230'});svg.appendChild(cam);
  }
  frame.innerHTML='';
  frame.appendChild(svg);
}


// ═══ SETTINGS TABS ═══
const PS_TAB_GROUPS = {
  game:     ['import','theme'],
  reels:    ['reel'],
  jackpots: ['jp'],
  features: ['feat','ante','expandwild-cfg'],
  symbols:  ['symbols'],
  layout:   ['char','msg'],
};
function initSettingsTabs(){
  // Map each section to its tab pane
  document.querySelectorAll('.ps-tab[data-pstab]').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const tab=btn.dataset.pstab;
      // Update tab buttons
      document.querySelectorAll('.ps-tab[data-pstab]').forEach(b=>b.classList.toggle('active',b===btn));
      // Show/hide sections
      Object.entries(PS_TAB_GROUPS).forEach(([t,sections])=>{
        sections.forEach(s=>{
          const el=document.getElementById('s-'+s)||document.getElementById('ps-'+s);
          const psh=document.querySelector(`.psh[data-s="${s}"]`);
          const ps=psh?.closest('.ps');
          if(ps) ps.style.display=(t===tab)?'':'none';
        });
      });
    });
  });
  // Set initial state — show only 'game' sections
  Object.entries(PS_TAB_GROUPS).forEach(([t,sections])=>{
    sections.forEach(s=>{
      const psh=document.querySelector(`.psh[data-s="${s}"]`);
      const ps=psh?.closest('.ps');
      if(ps) ps.style.display=(t==='game')?'':'none';
    });
  });
}


// ═══ ZIP + JSX EXPORT ═══
// Generates a downloadable ZIP containing:
// - Each asset as PNG (from EL_ASSETS or canvas-rendered placeholder)
// - A Photoshop JSX script to assemble the layered PSD
async function exportZipWithJSX(){
  const btn=document.getElementById('m-exp-spine');
  if(btn){btn.textContent='⏳ Building ZIP…';btn.style.pointerEvents='none';}
  try{
    const JSZip=await loadJSZip();
    const zip=new JSZip();
    const vp=P.viewport==='desktop'?'landscape':P.viewport;
    const vpDef=VP[vp];

    // Helper: render one element to a canvas and get PNG blob
    function elToCanvas(k, pos){
      const cvs=document.createElement('canvas');
      cvs.width=pos.w; cvs.height=pos.h;
      const ctx=cvs.getContext('2d');
      const el=document.getElementById('el-'+k);
      if(!el){ ctx.fillStyle='#00000000'; ctx.fillRect(0,0,pos.w,pos.h); return cvs; }
      // If EL_ASSETS exists, draw the image
      if(EL_ASSETS[k]){
        return new Promise(res=>{
          const img=new Image(); img.src=EL_ASSETS[k];
          img.onload=()=>{ ctx.drawImage(img,0,0,pos.w,pos.h); res(cvs); };
          img.onerror=()=>res(cvs);
        });
      }
      // Capture rendered element via html2canvas fallback — just fill tinted rect
      ctx.fillStyle='#c9a84c22';ctx.fillRect(0,0,pos.w,pos.h);
      ctx.strokeStyle='#c9a84c88';ctx.lineWidth=2;ctx.strokeRect(1,1,pos.w-2,pos.h-2);
      return cvs;
    }

    const keys=SDEFS[P.screen]?.keys||[];
    const SPINE_NAMES={reelArea:'Reel_Grid',reelFrame:'Reel_Frame',
      jpGrand:'JP_Grand',jpMajor:'JP_Major',jpMinor:'JP_Minor',jpMini:'JP_Mini',
      logo:'Logo',char:'Character',spinBtn:'Spin_Button',autoBtn:'Auto_Spin',
      turboBtn:'Turbo_Spin',bannerBet:'Bet_Panel',bannerBuy:'Buy_Bonus',
      bannerAnte:'Ante_Bet',settings:'Settings_Btn',msgLabel:'Message_Label',bg:'Background'};

    const layerData=[]; // [{name, x, y, w, h, file}]

    for(const k of keys){
      const def=PSD[k]; if(!def) continue;
      if(k==='char'&&!P.char.enabled) continue;
      if(k==='bannerBuy'&&!P.features.buy_feature) continue;
      if(k==='bannerAnte'&&!P.ante.enabled) continue;
      const pos=getPos(k);
      const spineName=SPINE_NAMES[k]||k;
      const fileName=spineName+'.png';
      const cvs=await elToCanvas(k,pos);
      const pngData=cvs.toDataURL('image/png').split(',')[1];
      zip.file('assets/'+fileName, pngData, {base64:true});
      // Adjust position relative to viewport crop
      layerData.push({name:spineName,file:fileName,
        x:Math.round(pos.x-vpDef.cx), y:Math.round(pos.y-vpDef.cy),
        w:pos.w, h:pos.h, z:def.z||5});
    }

    // Export symbol assets
    P.symbols.forEach((sym,i)=>{
      const sk='sym_'+sym.id;
      if(EL_ASSETS[sk]){
        const img_data=EL_ASSETS[sk].split(',')[1];
        if(img_data) zip.file('symbols/'+sym.name.replace(/\s/g,'_')+'.png', img_data, {base64:true});
      }
    });

    // Generate Photoshop JSX assembly script
    const jsxLines=[
      '// Spinative — Auto-generated Photoshop Assembly Script',
      '// Game: '+P.gameName+' | Screen: '+(SDEFS[P.screen]?.label||P.screen),
      '// Generated: '+new Date().toISOString(),
      '// USAGE: In Photoshop, go to File > Scripts > Browse, select this file.',
      '',
      '#target photoshop',
      'app.bringToFront();',
      '',
      'var scriptPath = File($.fileName).parent.fsName;',
      'var assetsPath = scriptPath + "/assets/";',
      '',
      '// Canvas size for '+vp+' viewport',
      'var docW = '+vpDef.cw+';',
      'var docH = '+vpDef.ch+';',
      '',
      'var doc = app.documents.add(docW, docH, 72, "'+P.gameName+'_'+P.screen+'", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);',
      '',
    ];

    // Sort layers by z-order for correct stacking
    const sortedLayers=[...layerData].sort((a,b)=>a.z-b.z);
    sortedLayers.forEach(layer=>{
      jsxLines.push('// Layer: '+layer.name);
      jsxLines.push('try {');
      jsxLines.push('  var f_'+layer.name.replace(/[^a-zA-Z0-9]/g,'_')+' = new File(assetsPath + "'+layer.file+'");');
      jsxLines.push('  var tmpDoc = open(f_'+layer.name.replace(/[^a-zA-Z0-9]/g,'_')+');');
      jsxLines.push('  tmpDoc.selection.selectAll();');
      jsxLines.push('  tmpDoc.selection.copy();');
      jsxLines.push('  tmpDoc.close(SaveOptions.DONOTSAVECHANGES);');
      jsxLines.push('  doc.paste();');
      jsxLines.push('  var lyr = doc.activeLayer;');
      jsxLines.push('  lyr.name = "'+layer.name+'";');
      jsxLines.push('  lyr.translate('+layer.x+' - lyr.bounds[0], '+layer.y+' - lyr.bounds[1]);');
      jsxLines.push('} catch(e) { alert("Could not load: '+layer.file+' — " + e); }');
      jsxLines.push('');
    });
    jsxLines.push('alert("✓ '+P.gameName+' assembled! '+sortedLayers.length+' layers imported.");');

    zip.file('assemble_in_photoshop.jsx', jsxLines.join('\n'));

    // Add a README
    const readme=[
      '# '+P.gameName+' — Spinative Export',
      'Screen: '+(SDEFS[P.screen]?.label||P.screen)+' | Viewport: '+vp,
      'Exported: '+new Date().toLocaleString(),
      '',
      '## Files',
      '- assets/ — Individual PNG layers (named for Spine 2D)',
      '- symbols/ — Symbol artwork PNGs',
      '- assemble_in_photoshop.jsx — Photoshop script to assemble as layered PSD',
      '',
      '## How to assemble in Photoshop',
      '1. Open Photoshop',
      '2. Go to File > Scripts > Browse',
      '3. Select assemble_in_photoshop.jsx from this folder',
      '4. Wait for the script to finish — all layers will be placed and named',
      '5. Save as .psd',
      '',
      '## Layer names (Spine-ready)',
      ...sortedLayers.map(l=>`- ${l.name}: ${l.w}×${l.h}px at (${l.x},${l.y})`),
      '',
      '## Symbols',
      ...P.symbols.map(s=>`- ${s.name} (${s.type}): sym_${s.id}.png`),
    ].join('\n');
    zip.file('README.md', readme);

    // Generate and download
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url;
    a.download=P.gameName.replace(/\s/g,'_')+'_'+P.screen+'_export.zip';
    a.click(); URL.revokeObjectURL(url);
    if(btn){btn.textContent='⬇ Export ZIP + JSX';btn.style.pointerEvents='';}
  } catch(err){
    alert('Export error: '+err.message);
    if(btn){btn.textContent='Export ZIP + JSX';btn.style.pointerEvents='';}
  }
}

// ═══ PHONE FRAME ═══
// ═══ PROJECT SETTINGS TABS ═══
function switchProjTab(name){
  if(!name) name='import';
  document.querySelectorAll('.proj-tab').forEach(b=>b.classList.toggle('active', b.dataset.ptab===name));
  document.querySelectorAll('.proj-tab-pane').forEach(p=>p.classList.toggle('active', p.id==='ptab-'+name));
  if(name==='theme') setTimeout(renderMiniPreview, 50);
}

// Wire tab bar clicks
document.querySelectorAll('.proj-tab[data-ptab]').forEach(btn=>{
  btn.addEventListener('click',()=>switchProjTab(btn.dataset.ptab));
});

// ═══ LIVE MINI-PREVIEW (Theme tab) ═══
function renderMiniPreview(){
  const cvs=document.getElementById('proj-mini-canvas'); if(!cvs) return;
  const ctx=cvs.getContext('2d');
  const W=200,H=320;
  ctx.clearRect(0,0,W,H);
  const c1=P.colors?.c1||'#c9a84c';
  // Theme gradient
  const THEME_BG={
    western:['#2a1505','#0d0800'],egypt:['#0d0820','#050310'],
    rome:['#0a0d20','#050810'],greece:['#08101a','#040810'],
    aztec:['#1a0f05','#0d0700'],chinese:['#200808','#0d0404'],
    irish:['#052010','#021008'],viking:['#0a1828','#050d18'],
    pirate:['#080e18','#040810'],fantasy:['#0d0820','#060212'],
    halloween:['#1a0800','#0d0400'],christmas:['#020d02','#010601'],
    space:['#020408','#010204'],fruits:['#0a1a0a','#030803'],
    diamonds:['#101828','#080e18']
  };
  const [t,b]=(THEME_BG[P.theme]||['#0a0810','#050408']);
  const grad=ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,t); grad.addColorStop(1,b);
  ctx.fillStyle=grad; ctx.fillRect(0,0,W,H);

  // Logo zone
  ctx.fillStyle=c1+'14'; ctx.beginPath(); ctx.roundRect(14,14,W-28,56,6); ctx.fill();
  ctx.strokeStyle=c1+'44'; ctx.lineWidth=1; ctx.setLineDash([5,4]);
  ctx.beginPath(); ctx.roundRect(18,18,W-36,48,4); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=c1; ctx.font='bold 10px Space Grotesk,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText((P.gameName||'Game').toUpperCase().slice(0,16), W/2, 44);

  // JP bar
  const jpcols=['#ef7a7a','#c9a84c','#7a8aef','#5eca8a'];
  const jx=14, jpw=(W-28)/4;
  jpcols.forEach((jc,i)=>{
    ctx.fillStyle=jc+'22'; ctx.beginPath(); ctx.roundRect(jx+i*jpw+1,76,jpw-2,16,3); ctx.fill();
    ctx.strokeStyle=jc+'88'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.roundRect(jx+i*jpw+1,76,jpw-2,16,3); ctx.stroke();
  });

  // Reel area
  const rx=14,ry=98,rw=W-28,rh=100;
  ctx.fillStyle='#06071a'; ctx.beginPath(); ctx.roundRect(rx,ry,rw,rh,6); ctx.fill();
  ctx.strokeStyle=c1+'aa'; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(rx-3,ry-3,rw+6,rh+6,8); ctx.stroke();
  // Symbol cells 5×3
  const cols=5,rows=3,gap=3;
  const cw=Math.floor((rw-gap*(cols-1))/cols);
  const ch=Math.floor((rh-gap*(rows-1))/rows);
  for(let r=0;r<rows;r++) for(let co=0;co<cols;co++){
    const sx=rx+co*(cw+gap), sy=ry+r*(ch+gap);
    ctx.fillStyle='#0d0e22'; ctx.beginPath(); ctx.roundRect(sx,sy,cw,ch,2); ctx.fill();
    ctx.strokeStyle=c1+'33'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.roundRect(sx,sy,cw,ch,2); ctx.stroke();
  }

  // Spin button
  const sbr=20, sbx=W/2, sby=H-52;
  const sg=ctx.createRadialGradient(sbx-6,sby-6,2,sbx,sby,sbr);
  sg.addColorStop(0,'#4a6aaa'); sg.addColorStop(1,'#1a2a6a');
  ctx.fillStyle=sg; ctx.beginPath(); ctx.arc(sbx,sby,sbr,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=c1; ctx.lineWidth=2;
  ctx.beginPath(); ctx.arc(sbx,sby,sbr,0,Math.PI*2); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='14px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('▶',sbx+1,sby);

  // Bet panel
  ctx.fillStyle='#8B1A2A'; ctx.beginPath(); ctx.roundRect(W/2+26,H-68,48,18,3); ctx.fill();
  ctx.fillStyle='#fff'; ctx.font='bold 7px Space Grotesk,sans-serif';
  ctx.textBaseline='middle'; ctx.fillText('BET',W/2+50,H-59);

  // Message label
  ctx.fillStyle='#ffffff22'; ctx.font='6px Space Grotesk,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText('18+ · Play Responsibly',W/2,H-18);
}

// Re-render mini preview when colour/name changes while Theme tab is open
function _maybeMiniPreview(){ /* live preview removed */ }


// Show/hide feature config panels when feature toggled
function updateFeatureConfigPanels(){/* handled inline in buildFeatures toggle */}


// ════════════════════════════════════════════════════════════
// COPY / PASTE ASSET SYSTEM
// Clipboard stores: { key, assetURL, adjustments, fromScreen }
// ════════════════════════════════════════════════════════════
let ASSET_CLIPBOARD = null;

function copyAsset(k){
  if(!k) return;
  const asset = EL_ASSETS[k];
  const adj = getAdj(k);
  ASSET_CLIPBOARD = { key:k, assetURL:asset||null, adjustments:{...adj}, fromScreen:P.screen };
  showClipboardIndicator(k, asset);
  // Update paste button if panel is open
  const pasteBtn = document.getElementById('ctx-paste-btn');
  if(pasteBtn) pasteBtn.style.opacity = '1';
}

function pasteAsset(targetKey){
  if(!ASSET_CLIPBOARD) return;
  let k = targetKey || SEL_KEY;

  // ── Cross-screen paste ──
  // If no target is selected (e.g. user switched to a different screen), resolve:
  //   1. If the clipboard's source key exists on THIS screen → paste onto that same key
  //   2. If the source key exists in PSD but NOT in this screen's key list → add it
  //   3. Otherwise create a new custom_N layer so the asset is always visible
  if(!k){
    const srcKey = ASSET_CLIPBOARD.key;
    const screenKeys = SDEFS[P.screen]?.keys || [];
    if(screenKeys.includes(srcKey)){
      // Same key exists on this screen — paste directly
      k = srcKey;
    } else if(PSD[srcKey]){
      // Key is a known element type but not on this screen — add it then paste
      SDEFS[P.screen]?.keys?.push(srcKey);
      k = srcKey;
    } else {
      // Source was a custom layer — create a new custom_N and register it
      const existingNums = Object.keys(PSD).filter(ek=>ek.startsWith('custom_'))
        .map(ek=>parseInt(ek.slice(7),10)).filter(n=>!isNaN(n));
      const nextN = existingNums.length ? Math.max(...existingNums)+1 : 1;
      k = 'custom_'+nextN;
      const srcDef = PSD[ASSET_CLIPBOARD.key] || {};
      PSD[k] = { label: (srcDef.label||ASSET_CLIPBOARD.key)+' (copy)', type:'template',
        locked:false, z: srcDef.z||6,
        portrait:  {...(srcDef.portrait  || {x:0,y:0,w:2000,h:2000})},
        landscape: {...(srcDef.landscape || {x:0,y:0,w:2000,h:1125})} };
      SDEFS[P.screen]?.keys?.push(k);
    }
  }

  if(!k){ showToast('Select a layer to paste onto'); return; }

  // Paste asset URL — if it's still base64, trigger a CDN upload so it survives the save strip
  if(ASSET_CLIPBOARD.assetURL){
    EL_ASSETS[k] = ASSET_CLIPBOARD.assetURL;
    if(typeof ASSET_CLIPBOARD.assetURL === 'string' && ASSET_CLIPBOARD.assetURL.startsWith('data:') && typeof _sfUploadDataUrlToStorage==='function'){
      _sfUploadDataUrlToStorage(k, ASSET_CLIPBOARD.assetURL);
    }
  }
  // Paste adjustments
  const adj = EL_ADJ[k] || {brightness:0,contrast:0,saturation:0,opacity:100};
  Object.assign(adj, ASSET_CLIPBOARD.adjustments);
  EL_ADJ[k] = adj;

  buildCanvas(); renderLayers();
  const crossScreen = ASSET_CLIPBOARD.fromScreen !== P.screen;
  showToast(`Pasted "${ASSET_CLIPBOARD.key}"${crossScreen?' (cross-screen)':''} → "${k}"`);
  markDirty();
}

function showClipboardIndicator(key, assetURL){
  const ind = document.getElementById('clipboard-indicator');
  const thumb = document.getElementById('cb-thumb');
  const lbl = document.getElementById('cb-label');
  if(!ind) return;
  if(assetURL){ thumb.src=assetURL; thumb.style.display='block'; }
  else { thumb.style.display='none'; }
  lbl.textContent = 'Copied: '+(PSD[key]?.label||key);
  ind.classList.add('show');
  clearTimeout(ind._timer);
  ind._timer = setTimeout(()=>ind.classList.remove('show'), 3000);
}

function showToast(msg){
  const ind = document.getElementById('clipboard-indicator');
  const lbl = document.getElementById('cb-label');
  if(!ind||!lbl) return;
  document.getElementById('cb-thumb').style.display='none';
  lbl.textContent = msg;
  ind.classList.add('show');
  clearTimeout(ind._timer);
  ind._timer = setTimeout(()=>ind.classList.remove('show'), 2000);
}

// Keyboard: ⌘C copy, ⌘V paste, ⌘D duplicate to clipboard without paste
document.addEventListener('keydown', e=>{
  if(e.target.matches('input,textarea,select')) return;
  if((e.metaKey||e.ctrlKey) && e.key==='c' && SEL_KEY){
    e.preventDefault();
    copyAsset(SEL_KEY);
  }
  if((e.metaKey||e.ctrlKey) && e.key==='v'){
    e.preventDefault();
    // Pass SEL_KEY only when it's set — pasteAsset handles null (cross-screen) itself
    pasteAsset(SEL_KEY || null);
  }
});

// Right-click context panel: add Copy/Paste buttons
// Copy/paste wired directly in openCtxPanel and HTML panel

// ════════════════════════════════════════════════════════════
// SPIN SIMULATOR
// Animates reel cells cycling through symbols then landing
// ════════════════════════════════════════════════════════════
let _simActive = false;
let _simSpeedMode = 'normal';
let _simRafIds = [];
let _simTimeouts = [];

const SIM_SPEEDS = {
  normal:  { staggerMs: 180, spinMs: 900,  extraRows: 12, bounceMs: 320 },
  fast:    { staggerMs: 80,  spinMs: 450,  extraRows: 6,  bounceMs: 220 },
  instant: { staggerMs: 0,   spinMs: 0,    extraRows: 0,  bounceMs: 0   },
};

function toggleSpinSim(){
  const bar = document.getElementById('spin-sim-bar');
  const btn = document.getElementById('spin-sim-toggle-btn');
  if(!bar) return;
  const showing = bar.classList.toggle('show');
  if(btn){
    btn.style.color      = showing ? '#c9a84c' : '#778';
    btn.style.borderColor= showing ? '#c9a84c44' : '#2a2a38';
    btn.style.background = showing ? '#c9a84c14' : '#141620';
  }
}

// ── Build one symbol cell node for the strip ──
function _makeStripCell(sym, cellW, cellH, symIdx){
  const div = document.createElement('div');
  div.className = 'strip-cell';
  div.style.width  = cellW+'px';
  div.style.height = cellH+'px';

  const oStyle = _getSymOverlapStyle(sym ? sym.id : null);
  div.style.overflow = oStyle.scale > 1 ? 'visible' : 'hidden';
  div.style.zIndex = oStyle.z;

  const key = sym ? 'sym_'+sym.id : null;
  if(key && EL_ASSETS[key]){
    const img = document.createElement('img');
    img.src = EL_ASSETS[key];
    img.style.cssText = `width:90%;height:90%;object-fit:contain;pointer-events:none;transform:scale(${oStyle.scale});position:relative;z-index:${oStyle.z}`;
    div.appendChild(img);
  } else if(sym){
    const col = SYM_COLS[symIdx % SYM_COLS.length];
    // SVG placeholder
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');
    svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    svg.setAttribute('viewBox','0 0 100 100'); svg.style.cssText='pointer-events:none';
    svg.style.transform = `scale(${oStyle.scale})`;
    svg.style.position = 'relative';
    svg.style.zIndex = oStyle.z;
    const bg=document.createElementNS(ns,'rect');
    bg.setAttribute('x','8');bg.setAttribute('y','8');
    bg.setAttribute('width','84');bg.setAttribute('height','84');
    bg.setAttribute('rx','12');bg.setAttribute('fill',col);bg.setAttribute('opacity','0.2');
    svg.appendChild(bg);
    const txt=document.createElementNS(ns,'text');
    txt.setAttribute('x','50');txt.setAttribute('y','58');
    txt.setAttribute('text-anchor','middle');
    txt.setAttribute('font-family','Space Grotesk,sans-serif');
    txt.setAttribute('font-size','22');txt.setAttribute('font-weight','700');
    txt.setAttribute('fill',col);
    txt.textContent = sym.name;
    svg.appendChild(txt);
    div.appendChild(svg);
  }

  // Symbol name label at bottom
  if(sym){
    const lbl = document.createElement('div');
    lbl.style.cssText = `position:absolute;bottom:0;left:0;right:0;padding:3px 4px;background:linear-gradient(transparent,#000000cc);font-size:${Math.max(Math.round(cellH*0.13),9)}px;color:#e8e6e1;text-align:center;font-family:Space Grotesk,sans-serif;font-weight:500;pointer-events:none`;
    lbl.textContent = sym.name;
    div.appendChild(lbl);
  }
  return div;
}

function simSpin(turbo){
  if(_simActive && !turbo){ simStop(); return; }
  const mode = turbo ? 'instant' : _simSpeedMode;
  const spd  = SIM_SPEEDS[mode];
  const [cols,rows] = parseReel(P.reelset);
  const syms = P.symbols.length > 0 ? P.symbols : [{id:0,name:'SYM',type:'high',screens:['base']}];

  // Decide final stop symbols per column (full column, not cell)
  const stops = []; // stops[col][row] = symIndex
  for(let col=0;col<cols;col++){
    const col_stops=[];
    for(let row=0;row<rows;row++) col_stops.push(Math.floor(Math.random()*syms.length));
    stops.push(col_stops);
  }

  // Instant mode — just snap to result
  if(spd.spinMs === 0){
    for(let col=0;col<cols;col++)
      for(let row=0;row<rows;row++)
        _updateCell(row*cols+col, stops[col][row]);
    _showWin(stops.flat(), syms, cols);
    return;
  }

  _simActive = true;
  document.getElementById('sim-stop-btn').style.display = '';
  document.getElementById('sim-spin-btn').textContent = '◉ Spinning…';

  // Get reel area dimensions from the computed layout
  const vpKey = P.viewport==='desktop'?'landscape':P.viewport;
  const reelPos = EL_COMPUTED[vpKey]?.reelArea;
  if(!reelPos){ simStop(); return; }

  const RS_sim  = P.reelSettings||{scale:1,padX:8,padY:8,overlap:{id:null,amount:0}};
  const BASE_CELL_SIM = EL_COMPUTED._cellSize?.[vpKey] || 120;
  const CELL    = Math.round(BASE_CELL_SIM*(RS_sim.scale||1));
  const GAP_X   = RS_sim.padX??8;
  const GAP_Y   = RS_sim.padY??8;

  // Compute grid offset (same formula as reelArea renderer)
  const gridW_sim = cols*CELL+(cols-1)*GAP_X;
  const gridH_sim = rows*CELL+(rows-1)*GAP_Y;
  const offX_sim  = Math.round((reelPos.w-gridW_sim)/2);
  const offY_sim  = Math.round((reelPos.h-gridH_sim)/2);

  for(let col=0;col<cols;col++){
    const colDelay  = col * spd.staggerMs;
    const isLastCol = col === cols-1;

    const tid = setTimeout(()=>{
      // Find the reel area DOM element and get this column's geometry
      const reelEl = document.getElementById('el-reelArea');
      if(!reelEl){ return; }

      // Hide the static symbol cells for this column so they don't show through the strip
      for(let row=0; row<rows; row++){
        const staticCell = reelEl.querySelector(`[data-sym-idx="${row*cols+col}"]`);
        if(staticCell) staticCell.style.visibility = 'hidden';
      }

      const colX   = offX_sim + col*(CELL+GAP_X);
      const colW   = CELL;
      const colH   = rows*CELL + (rows-1)*GAP_Y;
      const totalScrollRows = spd.extraRows + rows; // symbols we scroll past before landing

      // Build a strip of (totalScrollRows + rows) symbols
      // Strip layout (top to bottom, all scroll DOWN):
      //   [extra random symbols] + [final landing symbols]
      // We start the strip ABOVE the column (translateY = -totalScrollRows * (CELL+GAP))
      // and animate to translateY = 0 (which reveals the last `rows` symbols as the result)

      const stripSymCount = totalScrollRows + rows;
      const stripTotalH   = stripSymCount*(CELL+GAP_Y);

      // Create wrapper
      const wrap = document.createElement('div');
      wrap.className = 'reel-col-wrap';
      wrap.style.cssText = `position:absolute;left:${colX}px;top:${offY_sim}px;width:${colW}px;height:${colH}px;overflow:hidden;border-radius:8px;z-index:50`;

      // Create strip
      const strip = document.createElement('div');
      strip.className = 'reel-strip';
      strip.style.cssText = `position:absolute;top:0;left:0;width:${colW}px;will-change:transform`;
      // Start position: strip sits entirely above the window
      strip.style.transform = `translateY(${-totalScrollRows*(CELL+GAP_Y)}px)`;

      // Populate strip: random symbols on top, final landing row at bottom
      for(let si=0;si<totalScrollRows;si++){
        const randIdx = Math.floor(Math.random()*syms.length);
        const cell = _makeStripCell(syms[randIdx], colW, CELL, randIdx);
        cell.style.marginBottom = GAP_Y+'px';
        strip.appendChild(cell);
      }
      // Final landing symbols (the actual result for this column)
      for(let row=0;row<rows;row++){
        const symIdx = stops[col][row];
        const cell = _makeStripCell(syms[symIdx], colW, CELL, symIdx);
        cell.style.marginBottom = row<rows-1 ? GAP_Y+'px' : '0';
        strip.appendChild(cell);
      }

      wrap.appendChild(strip);
      reelEl.appendChild(wrap);

      // ── Phase 1: Animate strip scrolling DOWN at constant speed ──
      const totalDist = totalScrollRows*(CELL+GAP_Y);
      const startTime = performance.now();

      function animateScroll(now){
        const elapsed = now - startTime;
        const progress = Math.min(elapsed/spd.spinMs, 1);
        const eased = progress < 0.15
          ? 16*progress*progress*progress*progress
          : 0.15 + (progress-0.15)*(1/0.85)*0.85;
        strip.style.transform = `translateY(${-totalScrollRows*(CELL+GAP_Y) + eased*totalDist}px)`;

        if(progress < 1){
          const raf = requestAnimationFrame(animateScroll);
          _simRafIds.push(raf);
        } else {
          // ── Phase 2: Overshoot + bounce settle ──
          // 1. Snap to final position + overshoot (go past by ~30% of one cell)
          const overshoot = Math.round(CELL*0.28);
          strip.style.transition = `transform ${Math.round(spd.bounceMs*0.35)}ms cubic-bezier(0.2,0,0.8,1)`;
          strip.style.transform  = `translateY(${overshoot}px)`;

          const t1 = setTimeout(()=>{
            // 2. Pull back to exact final position with spring
            strip.style.transition = `transform ${Math.round(spd.bounceMs*0.45)}ms cubic-bezier(0.34,1.56,0.64,1)`;
            strip.style.transform  = 'translateY(0)';
          }, Math.round(spd.bounceMs*0.35));
          _simTimeouts.push(t1);

          const t2 = setTimeout(()=>{
            // 3. Clean up overlay — remove strip wrapper, show real cells updated
            for(let row=0;row<rows;row++) _updateCell(row*cols+col, stops[col][row]);
            wrap.remove();
            strip.style.transition = '';
            // Restore static cells visibility for this column
            const reelElCleanup = document.getElementById('el-reelArea');
            if(reelElCleanup){
              for(let row=0;row<rows;row++){
                const sc = reelElCleanup.querySelector(`[data-sym-idx="${row*cols+col}"]`);
                if(sc) sc.style.visibility = '';
              }
            }

            if(isLastCol){
              _simActive = false;
              document.getElementById('sim-stop-btn').style.display = 'none';
              document.getElementById('sim-spin-btn').textContent = '▶ Spin';
              _showWin(stops.flat(), syms, cols);
            }
          }, spd.bounceMs + 40);
          _simTimeouts.push(t2);
        }
      }

      const raf = requestAnimationFrame(animateScroll);
      _simRafIds.push(raf);

    }, colDelay);
    _simTimeouts.push(tid);
  }
}

function simStop(){
  _simTimeouts.forEach(t=>{clearTimeout(t);clearInterval(t);}); _simTimeouts=[];
  _simRafIds.forEach(r=>cancelAnimationFrame(r)); _simRafIds=[];
  _simActive = false;
  // Remove any in-progress reel strips
  document.querySelectorAll('.reel-col-wrap').forEach(el=>el.remove());
  // Restore any static cells that were hidden during the spin
  document.querySelectorAll('#el-reelArea [data-sym-idx]').forEach(el=>{ el.style.visibility=''; });
  document.getElementById('sim-stop-btn').style.display = 'none';
  document.getElementById('sim-spin-btn').textContent = '▶ Spin';
}

function _updateCell(idx, symIdx){
  const cell = document.querySelector(`[data-sym-idx="${idx}"]`);
  if(!cell) return;
  const syms = P.symbols.length > 0 ? P.symbols : [];
  const sym = syms[symIdx % Math.max(syms.length,1)];
  if(!sym) return;
  const oStyle = _getSymOverlapStyle(sym.id);
  cell.style.overflow = oStyle.scale > 1 ? 'visible' : 'hidden';
  cell.style.zIndex = oStyle.z;

  const key = 'sym_'+sym.id;
  cell.innerHTML='';
  if(EL_ASSETS[key]){
    const img=document.createElement('img'); img.src=EL_ASSETS[key];
    img.style.cssText=`width:90%;height:90%;object-fit:contain;pointer-events:none;transform:scale(${oStyle.scale});position:relative;z-index:${oStyle.z}`;
    cell.appendChild(img);
  } else {
    // SVG placeholder with symbol name
    const col=SYM_COLS[symIdx%SYM_COLS.length];
    const ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg'); svg.setAttribute('width','100%'); svg.setAttribute('height','100%');
    svg.setAttribute('viewBox','0 0 100 100'); svg.style.pointerEvents='none';
    svg.style.transform = `scale(${oStyle.scale})`;
    svg.style.position = 'relative';
    svg.style.zIndex = oStyle.z;
    const bg=document.createElementNS(ns,'rect'); bg.setAttribute('x','10'); bg.setAttribute('y','10');
    bg.setAttribute('width','80'); bg.setAttribute('height','80'); bg.setAttribute('rx','8');
    bg.setAttribute('fill',col); bg.setAttribute('opacity','0.25'); svg.appendChild(bg);
    const txt=document.createElementNS(ns,'text'); txt.setAttribute('x','50'); txt.setAttribute('y','60');
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('font-family','Space Grotesk,sans-serif');
    txt.setAttribute('font-size','14'); txt.setAttribute('font-weight','600');
    txt.setAttribute('fill',col); txt.setAttribute('opacity','0.9'); txt.textContent=sym.name;
    svg.appendChild(txt); cell.appendChild(svg);
  }
}

function _showWin(stops, syms, cols){
  // Simple win check: any 3+ of same symbol on any row
  const rows = stops.length / cols;
  let win = false;
  for(let r=0;r<rows;r++){
    const rowSyms = [];
    for(let c=0;c<cols;c++) rowSyms.push(stops[r*cols+c]);
    if(rowSyms[0]===rowSyms[1]&&rowSyms[1]===rowSyms[2]) win=true;
  }
  const disp = document.getElementById('sim-win-display');
  if(disp){
    if(win){ disp.textContent='🎉 WIN!'; disp.style.color='#5eca8a'; }
    else{ disp.textContent='No win'; disp.style.color='#556'; }
    setTimeout(()=>{ if(disp) disp.textContent=''; }, 2000);
  }
}

// Wire sim controls
document.getElementById('spin-sim-toggle-btn')?.addEventListener('click', toggleSpinSim);
document.getElementById('sim-spin-btn')?.addEventListener('click', ()=>simSpin(false));
document.getElementById('sim-turbo-btn')?.addEventListener('click', ()=>simSpin(true));
document.getElementById('sim-stop-btn')?.addEventListener('click', simStop);
['norm','fast','turbo'].forEach(s=>{
  document.getElementById('sim-speed-'+s)?.addEventListener('click',()=>{
    _simSpeedMode = s==='norm'?'normal':s==='fast'?'fast':'instant';
    document.querySelectorAll('#sim-speed .sim-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById('sim-speed-'+s)?.classList.add('active');
  });
});

// Space to spin when sim bar is visible
document.addEventListener('keydown', e=>{
  if(e.target.matches('input,textarea,select')) return;
  if(e.code==='Space' && document.getElementById('spin-sim-bar')?.classList.contains('show') && TOOL!=='pan'){
    e.preventDefault();
    simSpin(false);
  }
});

// ════════════════════════════════════════════════════════
// GDD + GAME FLOW GENERATOR
// ════════════════════════════════════════════════════════

function escH(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function collectProjectData(){
  const name    = document.getElementById('game-name')?.value || P.gameName;
  const tagline = document.getElementById('game-tagline')?.value || '';
  const studio  = document.getElementById('game-studio')?.value || '';
  const version = document.getElementById('game-version')?.value || '1.0.0';
  const audience= document.getElementById('game-audience')?.value || 'Core';
  const rating  = document.getElementById('game-rating')?.value || '18+';
  const platform= document.getElementById('game-platform')?.value || 'Mobile + Desktop';
  const theme   = document.getElementById('theme-sel')?.value || P.theme;
  const themeCustom = document.getElementById('custom-theme')?.value || '';
  const themeName = theme==='other' ? themeCustom : theme;
  const setting = document.getElementById('game-setting')?.value || '';
  const story   = document.getElementById('game-story')?.value || '';
  const mood    = document.getElementById('game-mood')?.value || '';
  const bonusNarrative = document.getElementById('game-bonus-narrative')?.value || '';
  const artStyle = document.getElementById('game-art-style')?.value || '';
  const artRef  = document.getElementById('game-art-ref')?.value || '';
  const music   = document.getElementById('game-music')?.value || '';
  const sfx     = document.getElementById('game-sfx')?.value || '';
  const artNotes = document.getElementById('game-art-notes')?.value || '';
  const charRole = document.getElementById('char-role')?.value || '';
  const charDesc = document.getElementById('char-desc')?.value || '';
  const charVo  = document.getElementById('char-vo')?.value || '';
  const charAnims = document.getElementById('char-anims')?.value || '';
  const [cols,rows] = parseReel(P.reelset);
  const mech    = document.getElementById('mech-sel')?.value || 'Paylines';
  const paylines= document.getElementById('ptab-reels')?.querySelector('input[type=number]')?.value || '20';
  const rtp     = document.getElementById('ptab-reels')?.querySelectorAll('input[type=number]')?.[3]?.value || '96';
  const vol     = document.getElementById('ptab-reels')?.querySelector('select:last-of-type')?.value || 'Medium';
  const minBet  = document.getElementById('ptab-reels')?.querySelectorAll('input[type=number]')?.[0]?.value || '0.10';
  const maxBet  = document.getElementById('ptab-reels')?.querySelectorAll('input[type=number]')?.[1]?.value || '100';
  const c1 = P.colors.c1; const c2 = P.colors.c2; const c3 = P.colors.c3;
  const enabledFeatures = Object.entries(P.features)
    .filter(([k,v])=>v===true&&k!=='_custom')
    .map(([k])=>FDEFS.find(f=>f.key===k)?.label||k);
  const jps = Object.entries(P.jackpots)
    .filter(([,v])=>v.on)
    .map(([k,v])=>`${k.toUpperCase()}: ${v.val}`);
  const syms = P.symbols||[];
  const char  = P.char;
  const ante  = P.ante;
  const screens = Object.keys(SDEFS).filter(k=>!k.startsWith('popup'));
  return {name,tagline,studio,version,audience,rating,platform,themeName,setting,story,mood,bonusNarrative,artStyle,artRef,music,sfx,artNotes,charRole,charDesc,charVo,charAnims,cols,rows,mech,paylines,rtp,vol,minBet,maxBet,c1,c2,c3,enabledFeatures,jps,syms,char,ante,screens};
}

// ── HTML GDD Generators ──────────────────────────────────
function _gddSwatch(c,label){ return `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${c};border:1px solid #ffffff22;flex-shrink:0"></span><span style="font-family:DM Mono,monospace;font-size:10px;color:#9090b0">${escH(c)}</span><span style="font-size:10px;color:#6a6a82">${label}</span></span>`; }
function _gddSection(title,icon,c1,content){ return `<div style="margin-bottom:30px"><div style="display:flex;align-items:center;gap:8px;padding:8px 0 10px;border-bottom:2px solid ${c1}33;margin-bottom:14px"><span style="font-size:15px">${icon}</span><h2 style="font-size:12px;font-weight:700;color:${c1};letter-spacing:.07em;text-transform:uppercase;font-family:Space Grotesk,sans-serif;margin:0">${escH(title)}</h2></div>${content}</div>`; }
function _gddRow(l,v){ return v ? `<div style="display:flex;border-bottom:1px solid #20202e;padding:6px 0;gap:0"><div style="width:190px;flex-shrink:0;font-size:10px;color:#6a6a82;font-family:DM Mono,monospace;padding-top:1px">${escH(l)}</div><div style="font-size:11px;color:#c0c0d0;flex:1;min-height:18px" contenteditable="true">${escH(v)}</div></div>` : ''; }
function _gddNote(t){ return `<div contenteditable="true" style="font-size:11px;color:#b0b0c8;line-height:1.75;padding:10px 12px;background:#161626;border-radius:8px;border:1px dashed #3a3a5266;min-height:40px;outline:none;font-family:Space Grotesk,sans-serif">${t?escH(t):'<span style="color:#3a3a52;font-style:italic">Click to edit…</span>'}</div>`; }
function _gddTag(t,c,b){ return `<span style="display:inline-block;margin:3px 3px 3px 0;padding:3px 10px;border-radius:12px;font-size:10px;border:1px solid ${c||'#3a5a7a'}44;color:${c||'#3a5a7a'};background:${b||'#1a2a3a'};font-family:Space Grotesk,sans-serif">${escH(t)}</span>`; }

function generateGDDHTML(d){
  const today = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const c1=d.c1,c2=d.c2,c3=d.c3;

  // Symbol table
  let symTable = d.syms.length ? `<table style="width:100%;border-collapse:collapse;font-size:11px;color:#c0c0d0;border-radius:8px;overflow:hidden"><thead><tr style="background:#1e1e2e"><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">SYMBOL</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">TYPE</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">SCREENS</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">PAYS 3/4/5</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">WEIGHT</th></tr></thead><tbody>`+
    d.syms.map(s=>`<tr style="border-bottom:1px solid #1a1a28"><td style="padding:6px 10px;font-weight:600">${escH(s.name)}</td><td style="padding:6px 10px"><span style="padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;background:${s.type==='high'?'#c9a84c22':s.type==='special'?'#7c5cbf22':'#3a5a7a22'};color:${s.type==='high'?'#c9a84c':s.type==='special'?'#9a7cdf':'#7ab0e0'}">${escH(s.type)}</span></td><td style="padding:6px 10px;font-size:10px;color:#6a6a82">${(s.screens||['base']).join(', ')}</td><td style="padding:6px 10px;font-size:10px" contenteditable="true">TBD / TBD / TBD</td><td style="padding:6px 10px;font-size:10px" contenteditable="true">TBD</td></tr>`).join('')+
    `</tbody></table>` : `<div style="color:#4a4a62;font-size:11px">No symbols defined yet. Add symbols in the Symbols panel.</div>`;

  // Feature table
  let ftTable = d.enabledFeatures.length ? `<table style="width:100%;border-collapse:collapse;font-size:11px;color:#c0c0d0"><thead><tr style="background:#1e1e2e"><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">FEATURE</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">TRIGGER CONDITION</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">BEHAVIOUR</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">RTP CONTRIB.</th></tr></thead><tbody>`+
    d.enabledFeatures.map(f=>`<tr style="border-bottom:1px solid #1a1a28"><td style="padding:7px 10px;font-weight:700;color:#c9a84c">${escH(f)}</td><td style="padding:7px 10px;font-size:10px;color:#9090b0" contenteditable="true">Click to describe trigger…</td><td style="padding:7px 10px;font-size:10px;color:#9090b0" contenteditable="true">Click to describe behaviour…</td><td style="padding:7px 10px;font-size:10px" contenteditable="true">TBD%</td></tr>`).join('')+
    `</tbody></table>` : `<div style="color:#4a4a62;font-size:11px">No bonus features enabled — base game only.</div>`;

  // Jackpots
  let jpSection = '';
  if(d.jps.length){
    const jpCards = d.jps.map(j=>{ const[tier,...rest]=j.split(':'); const col={GRAND:'#c9a84c',MAJOR:'#e07070',MINOR:'#7ab0e0',MINI:'#5eca8a'}[tier.trim()]||c1; return `<div style="padding:14px 12px;border-radius:10px;border:1px solid ${col}44;background:${col}0d;text-align:center"><div style="font-size:9px;color:${col};font-weight:700;letter-spacing:.08em;margin-bottom:6px">${tier.trim()}</div><div style="font-size:20px;font-weight:700;color:#e8e6e1;margin-bottom:4px" contenteditable="true">${rest.join(':').trim()||'TBD'}</div><div style="font-size:9px;color:#5a5a72">Seed Value</div></div>`; }).join('');
    jpSection = _gddSection('Jackpot System','💎',c1,`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">${jpCards}</div>`);
  }

  // Screen register
  const screenRows = d.screens.map(s=>{ const def=SDEFS[s]; if(!def)return ''; return `<tr style="border-bottom:1px solid #1a1a28"><td style="padding:7px 10px;font-weight:600;color:#c0c0d0">${escH(def.label)}</td><td style="padding:7px 10px;font-size:10px;color:#5a5a72;font-family:DM Mono,monospace;line-height:1.7">${(def.keys||[]).join(' · ')}</td></tr>`; }).filter(Boolean).join('');

  return `<div style="font-family:Space Grotesk,sans-serif">
  <!-- COVER -->
  <div style="background:linear-gradient(135deg,${c2}cc 0%,#0e0e1e 65%);border-radius:12px;padding:32px 28px;margin-bottom:28px;border:1px solid ${c1}33;position:relative;overflow:hidden">
    <div style="position:absolute;top:-40px;right:-40px;width:200px;height:200px;border-radius:50%;background:${c1}0d;pointer-events:none"></div>
    <div style="font-size:9px;color:${c1}99;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px;font-family:DM Mono,monospace">GAME DESIGN DOCUMENT · v${escH(d.version)}</div>
    <h1 style="font-size:26px;font-weight:700;color:#e8e6e1;margin:0 0 6px;line-height:1.2" contenteditable="true">${escH(d.name)||'Untitled Game'}</h1>
    ${d.tagline?`<div style="font-size:13px;color:${c1};font-style:italic;margin-bottom:18px" contenteditable="true">"${escH(d.tagline)}"</div>`:''}
    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:16px">
      ${[['Studio',d.studio],['Date',today],['Rating',d.rating],['Platform',d.platform],['Audience',d.audience],['Version',d.version]].map(([l,v])=>`<div style="font-size:10px;color:#9090b0"><span style="color:#4a4a62;margin-right:5px">${l}</span>${escH(v)}</div>`).join('')}
    </div>
    <div style="margin-top:14px">${_gddSwatch(c1,'Primary')}${_gddSwatch(c2,'Background')}${_gddSwatch(c3,'Accent')}</div>
    <div style="position:absolute;bottom:12px;right:16px;font-size:9px;color:#2a2a3a;font-family:DM Mono,monospace">Generated by Spinative</div>
  </div>

  ${_gddSection('Narrative & World','📖',c1,`
    ${_gddRow('Setting',d.setting||'—')}
    ${_gddRow('Game Mood',d.mood)}
    ${_gddRow('Bonus Narrative',d.bonusNarrative)}
    ${d.story?`<div style="margin-top:12px"><div style="font-size:9px;color:#4a4a62;font-family:DM Mono,monospace;letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase">Game Story</div>${_gddNote(d.story)}</div>`:''}
  `)}

  ${_gddSection('Game Overview','🎰',c1,`
    ${_gddRow('Title',d.name)}
    ${_gddRow('Theme',d.themeName)}
    ${_gddRow('Reel Configuration',`${d.cols} × ${d.rows}`)}
    ${_gddRow('Win Mechanic',d.mech)}
    ${_gddRow('Paylines / Ways',d.paylines)}
    ${_gddRow('RTP Target',d.rtp+'%')}
    ${_gddRow('Volatility',d.vol)}
    ${_gddRow('Bet Range',`€${d.minBet} – €${d.maxBet}`)}
    ${_gddRow('Platform',d.platform)}
    ${_gddRow('Target Audience',d.audience)}
    ${_gddRow('Age Rating',d.rating)}
    <div style="margin-top:12px;padding:10px 12px;background:#161626;border-radius:8px;font-size:11px;color:#9090b0;line-height:1.75;border-left:3px solid ${c1}44" contenteditable="true">${escH(d.name)} is a ${d.cols}×${d.rows} ${escH(d.themeName)}-themed slot with ${escH(d.mech).toLowerCase()} mechanics. The game targets ${escH(d.vol).toLowerCase()} volatility at ${escH(d.rtp)}% RTP, designed for ${escH(d.audience)} players on ${escH(d.platform).toLowerCase()} viewports.</div>
  `)}

  ${_gddSection('Art Direction','🎨',c1,`
    ${_gddRow('Visual Style',d.artStyle)}
    ${_gddRow('Visual References',d.artRef)}
    ${_gddRow('Music Style',d.music)}
    ${_gddRow('SFX Style',d.sfx)}
    ${d.artNotes?`<div style="margin-top:12px"><div style="font-size:9px;color:#4a4a62;font-family:DM Mono,monospace;letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase">Art Notes</div>${_gddNote(d.artNotes)}</div>`:''}
  `)}

  ${d.char?.enabled?_gddSection('Character','🦸',c1,`
    ${_gddRow('Name',d.char?.name)}
    ${_gddRow('Role',d.charRole)}
    ${_gddRow('Voiceover',d.charVo)}
    ${_gddRow('Animation States',d.charAnims)}
    ${d.charDesc?`<div style="margin-top:12px"><div style="font-size:9px;color:#4a4a62;font-family:DM Mono,monospace;letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase">Character Description</div>${_gddNote(d.charDesc)}</div>`:''}
  `):''}

  ${_gddSection('Symbol Paytable','🃏',c1,symTable)}
  ${_gddSection('Game Features','⚡',c1,ftTable)}
  ${jpSection}

  ${_gddSection('Screens Register','🖥️',c1,`<div style="border-radius:8px;overflow:hidden;border:1px solid #1e1e2e"><table style="width:100%;border-collapse:collapse;font-size:11px;color:#c0c0d0"><thead><tr style="background:#1e1e2e"><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">SCREEN</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700;letter-spacing:.05em">LAYER STACK</th></tr></thead><tbody>${screenRows}</tbody></table></div>`)}

  ${_gddSection('UI Controls','🕹️',c1,`<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
    ${['Spin Button','Auto Spin','Turbo Spin','Bet Panel','Balance Display','Game Clock','Settings','Info / Paytable','Game History'].map(u=>_gddTag(u,'#6a6a9a','#1a1a28')).join('')}
    ${d.char?.enabled?_gddTag('Character ('+d.char.scale+')',c1,c1.replace('#','#')+'11'):''}
    ${d.ante?.enabled?_gddTag(d.ante.label,'#5eca8a','#0d1a12'):''}
  </div>`)}

  ${_gddSection('Regulatory & Compliance','⚖️',c1,`<div style="display:flex;flex-direction:column;gap:7px">
    ${['Responsible gambling message displayed on all screens','Age gate: '+escH(d.rating)+' verification required at launch','Game History accessible from settings menu','RTP certificate displayed in paytable / info popup','Session timer or game clock must be available','Autoplay with configurable loss limits and session limits','Return to player percentage audited and certified by approved lab','Segregated player funds display where required by jurisdiction'].map(r=>`<div style="display:flex;gap:8px;align-items:flex-start;font-size:11px;color:#b0b0c8;padding:4px 0;border-bottom:1px solid #1a1a2a"><span style="color:#5eca8a;flex-shrink:0;margin-top:1px">✓</span><span contenteditable="true">${r}</span></div>`).join('')}
  </div>`)}

  ${_gddSection('Technical Specification','⚙️',c1,`
    ${_gddRow('Animation Framework','Spine 2D skeleton animation')}
    ${_gddRow('Canvas Resolution','Portrait 984×2000 · Landscape 2000×1125')}
    ${_gddRow('Target Frame Rate','60 fps (desktop) · 30 fps (mobile fallback)')}
    ${_gddRow('Asset Format','PNG (static UI) · Spine JSON + Atlas (animations)')}
    ${_gddRow('Atlas Size','2048×2048 RGBA8888')}
    ${_gddRow('Primary Viewport','Mobile Portrait 9:16')}
    ${_gddRow('Secondary Viewport','Desktop Landscape 16:9')}
    ${_gddRow('Layer Naming','BG_BaseGame · ReelFrame · JP_Grand · UI_SpinBtn…')}
    <div style="margin-top:12px"><div style="font-size:9px;color:#4a4a62;font-family:DM Mono,monospace;letter-spacing:.05em;margin-bottom:6px;text-transform:uppercase">Technical Notes</div>${_gddNote('')}</div>
  `)}

  <div style="text-align:center;padding:16px 0 4px;font-size:9px;color:#2e2e42;font-family:DM Mono,monospace">Generated by Spinative · ${today}</div>
</div>`;
}

function generateMathSpecHTML(d){
  const today = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const row = (l,v) => `<div style="display:flex;border-bottom:1px solid #1e1e2e;padding:6px 0"><div style="width:200px;flex-shrink:0;font-size:10px;color:#6a6a82;font-family:DM Mono,monospace">${escH(l)}</div><div style="font-size:11px;color:#c0c0d0;flex:1" contenteditable="true">${escH(v)}</div></div>`;
  const symRows = d.syms.map(s=>`<tr style="border-bottom:1px solid #1a1a28"><td style="padding:6px 10px;font-weight:600">${escH(s.name)}</td><td style="padding:6px 10px"><span style="padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;background:${s.type==='high'?'#c9a84c22':s.type==='special'?'#7c5cbf22':'#3a5a7a22'};color:${s.type==='high'?'#c9a84c':s.type==='special'?'#9a7cdf':'#7ab0e0'}">${escH(s.type)}</span></td><td style="padding:6px 10px;font-size:10px" contenteditable="true">TBD / TBD / TBD</td><td style="padding:6px 10px;font-size:10px" contenteditable="true">TBD</td><td style="padding:6px 10px;font-size:10px" contenteditable="true">TBD%</td></tr>`).join('');
  return `<div style="font-family:Space Grotesk,sans-serif">
  <div style="padding:20px 0 16px;border-bottom:2px solid #4ac8f033;margin-bottom:24px">
    <div style="font-size:9px;color:#4ac8f0;font-weight:700;letter-spacing:.12em;font-family:DM Mono,monospace;margin-bottom:4px;text-transform:uppercase">Math Specification</div>
    <h1 style="font-size:20px;font-weight:700;color:#e8e6e1;margin:0 0 4px" contenteditable="true">${escH(d.name)}</h1>
    <div style="font-size:10px;color:#4a4a62;font-family:DM Mono,monospace">${today} · v${escH(d.version||'1.0.0')}</div>
  </div>
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#4ac8f0;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #4ac8f022">Core Parameters</div>
    ${row('RTP (Target)',d.rtp+'%')}${row('Volatility',d.vol)}${row('Reel Configuration',`${d.cols} × ${d.rows}`)}${row('Win Mechanic',d.mech)}${row('Paylines / Ways',d.paylines)}${row('Bet Range',`€${d.minBet} → €${d.maxBet}`)}${row('Max Win Cap','TBD × total bet')}${row('Hit Frequency','TBD')}${row('Base Game RTP','~TBD%')}${row('Bonus Contribution','~TBD%')}
  </div>
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#4ac8f0;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #4ac8f022">Symbol Hit Frequencies</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;color:#c0c0d0"><thead><tr style="background:#1e1e2e"><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700">SYMBOL</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700">TYPE</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700">PAYS 3/4/5</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700">WEIGHT</th><th style="padding:7px 10px;text-align:left;font-size:9px;color:#6a6a82;font-weight:700">REEL STRIP %</th></tr></thead><tbody>${symRows}</tbody></table>
  </div>
  ${d.enabledFeatures.length?`<div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#4ac8f0;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #4ac8f022">Bonus RTP Breakdown</div>
    ${d.enabledFeatures.map(f=>`<div style="display:flex;border-bottom:1px solid #1e1e2e;padding:6px 0"><div style="flex:1;font-size:11px;color:#c0c0d0">${escH(f)}</div><div style="width:80px;font-size:11px;color:#4ac8f0;text-align:right" contenteditable="true">TBD%</div></div>`).join('')}
    <div style="display:flex;border-bottom:1px solid #1e1e2e;padding:6px 0;font-weight:700"><div style="flex:1;font-size:11px;color:#c0c0d0">Base Game</div><div style="width:80px;font-size:11px;color:#4ac8f0;text-align:right" contenteditable="true">TBD%</div></div>
    <div style="margin-top:10px;padding:10px 12px;background:#161e2a;border-radius:6px;font-size:10px;color:#5a7090;border:1px solid #1e3050">⚠ Final math model must be signed off by a certified mathematics testing laboratory prior to regulatory submission.</div>
  </div>`:''}
  ${d.jps.length?`<div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#4ac8f0;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #4ac8f022">Jackpot Parameters</div>
    ${row('Contribution % (of total RTP)','TBD%')}${row('Reset Frequency','TBD')}${d.jps.map(j=>row(j.split(':')[0].trim()+' Seed',j.split(':')[1]?.trim()||'TBD')).join('')}
  </div>`:''}
  <div style="text-align:center;padding:16px 0 4px;font-size:9px;color:#2e2e42;font-family:DM Mono,monospace">Generated by Spinative · ${today}</div>
</div>`;
}

function generateArtBriefHTML(d){
  const today = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const row = (l,v) => v?`<div style="display:flex;border-bottom:1px solid #1e1e2e;padding:6px 0"><div style="width:190px;flex-shrink:0;font-size:10px;color:#6a6a82;font-family:DM Mono,monospace">${escH(l)}</div><div style="font-size:11px;color:#c0c0d0;flex:1" contenteditable="true">${escH(v)}</div></div>`:'';
  const symDeliverables = d.syms.map(s=>`<div style="padding:8px 10px;border-bottom:1px solid #1a1a28;display:flex;align-items:center;gap:10px"><span style="width:10px;height:10px;border-radius:2px;display:inline-block;flex-shrink:0;background:${s.type==='high'?'#c9a84c':s.type==='special'?'#7c5cbf':'#3a5a7a'}"></span><span style="flex:1;font-size:11px;color:#c0c0d0;font-weight:600">${escH(s.name)}</span><span style="font-size:9px;color:#6a6a82;margin-right:8px">${escH(s.type)}</span>${[['Static PNG','#5a7a5a','#1a2a1a'],['Spine 2D','#5a5a8a','#1a1a2a'],['128px thumb','#5a7a7a','#1a2a2a']].map(([t,c,b])=>`<span style="display:inline-block;margin-left:4px;padding:2px 8px;border-radius:10px;font-size:9px;border:1px solid ${c}44;color:${c};background:${b}">${t}</span>`).join('')}</div>`).join('');
  return `<div style="font-family:Space Grotesk,sans-serif">
  <div style="padding:20px 0 16px;border-bottom:2px solid #7c5cbf33;margin-bottom:24px">
    <div style="font-size:9px;color:#9a7cdf;font-weight:700;letter-spacing:.12em;font-family:DM Mono,monospace;margin-bottom:4px;text-transform:uppercase">Art Direction Brief</div>
    <h1 style="font-size:20px;font-weight:700;color:#e8e6e1;margin:0 0 4px" contenteditable="true">${escH(d.name)}</h1>
    <div style="font-size:10px;color:#4a4a62;font-family:DM Mono,monospace">${today} · v${escH(d.version||'1.0.0')}</div>
  </div>
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#9a7cdf;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #7c5cbf22">Theme & Style Identity</div>
    ${row('Theme',d.themeName)}${row('Visual Style',d.artStyle)}${row('Visual References',d.artRef)}${row('Game Mood',d.mood)}${row('Setting',d.setting)}${row('Primary Colour',d.c1)}${row('Background Colour',d.c2)}${row('Accent Colour',d.c3)}${row('Music Style',d.music)}${row('SFX Style',d.sfx)}
    ${d.artNotes?`<div style="margin-top:12px;padding:12px;background:#161626;border-radius:8px;border:1px dashed #7c5cbf44"><div style="font-size:9px;color:#7c5cbf;font-family:DM Mono,monospace;margin-bottom:6px;text-transform:uppercase">Art Notes</div><div style="font-size:11px;color:#b0b0c8;line-height:1.75" contenteditable="true">${escH(d.artNotes)}</div></div>`:''}
  </div>
  ${d.char?.enabled?`<div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#9a7cdf;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #7c5cbf22">Character Art</div>
    ${row('Character Name',d.char?.name)}${row('Role',d.charRole)}${row('Voiceover',d.charVo)}${row('Animation States',d.charAnims)}
    ${d.charDesc?`<div style="margin-top:12px;padding:12px;background:#161626;border-radius:8px;border:1px dashed #7c5cbf44"><div style="font-size:9px;color:#7c5cbf;font-family:DM Mono,monospace;margin-bottom:6px">CHARACTER DESCRIPTION</div><div style="font-size:11px;color:#b0b0c8;line-height:1.75" contenteditable="true">${escH(d.charDesc)}</div></div>`:''}
    <div style="margin-top:12px"><div style="font-size:9px;color:#6a6a82;font-family:DM Mono,monospace;margin-bottom:6px;text-transform:uppercase">Required Assets</div>${[['Static pose','#9a7cdf','#1a1030'],['Win reaction','#9a7cdf','#1a1030'],['Idle loop','#9a7cdf','#1a1030'],['Intro animation','#9a7cdf','#1a1030'],['Big win celebration','#9a7cdf','#1a1030']].map(([t,c,b])=>`<span style="display:inline-block;margin:3px;padding:3px 10px;border-radius:12px;font-size:10px;border:1px solid ${c}44;color:${c};background:${b}">${t}</span>`).join('')}</div>
  </div>`:''}
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#9a7cdf;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #7c5cbf22">Symbol Art Deliverables</div>
    <div style="font-size:10px;color:#6a6a82;margin-bottom:10px">Each symbol delivered in all formats below:</div>
    <div style="margin-bottom:12px">${[['Static PNG 512×512px (transparent BG)','#5a7a5a','#1a2a1a'],['Spine 2D skeleton (win animation)','#5a5a8a','#1a1a2a'],['Thumbnail 128×128px (paytable)','#5a7a7a','#1a2a2a']].map(([t,c,b])=>`<span style="display:inline-block;margin:3px;padding:3px 10px;border-radius:12px;font-size:10px;border:1px solid ${c}44;color:${c};background:${b}">${t}</span>`).join('')}</div>
    <div style="border-radius:8px;overflow:hidden;border:1px solid #1e1e2e">${symDeliverables||'<div style="padding:12px;color:#4a4a62;font-size:11px">No symbols defined yet.</div>'}</div>
  </div>
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#9a7cdf;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #7c5cbf22">Screen Asset List</div>
    ${d.screens.map(s=>{ const def=SDEFS[s];if(!def)return ''; return `<div style="padding:8px 10px;border-bottom:1px solid #1a1a28"><div style="font-size:11px;color:#c0c0d0;font-weight:600;margin-bottom:5px">${escH(def.label)}</div><div>${(def.keys||[]).map(k=>`<span style="display:inline-block;margin:2px;padding:2px 8px;border-radius:10px;font-size:9px;border:1px solid #3a3a5244;color:#6a6a8a;background:#15151f">${escH(PSD[k]?.label||k)}</span>`).join('')}</div></div>`; }).filter(Boolean).join('')}
  </div>
  <div style="margin-bottom:24px"><div style="font-size:10px;font-weight:700;color:#9a7cdf;letter-spacing:.06em;text-transform:uppercase;margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid #7c5cbf22">Delivery Format</div>
    ${['PSD source files per screen (layered, organised by screen)','PNG exports at 1× and 2× retina resolution','Spine JSON + PNG atlas (RGBA8888, max 2048×2048)','Colour swatch file (.aco / .clr / SVG palette)','Font files used in any UI elements (OTF or TTF)','Naming convention: BG_BaseGame · ReelFrame · JP_Grand · UI_SpinBtn'].map(r=>`<div style="display:flex;gap:8px;align-items:flex-start;padding:5px 0;font-size:11px;color:#b0b0c8;border-bottom:1px solid #1a1a2844"><span style="color:#9a7cdf;flex-shrink:0">▸</span><span contenteditable="true">${r}</span></div>`).join('')}
  </div>
  <div style="text-align:center;padding:16px 0 4px;font-size:9px;color:#2e2e42;font-family:DM Mono,monospace">Generated by Spinative · ${today}</div>
</div>`;
}

let GDD_CURRENT_TAB = 'gdd';
let GDD_HTML = {};

function openGDDModal(){
  const d = collectProjectData();
  document.getElementById('gdd-modal-title').textContent = (d.name||'Untitled')+' — GDD';
  GDD_HTML = {
    gdd:  generateGDDHTML(d),
    flow: '',
    math: generateMathSpecHTML(d),
    art:  generateArtBriefHTML(d),
  };
  GDD_CURRENT_TAB = 'gdd';
  renderGDDTab('gdd');
  document.getElementById('gdd-modal').style.display='flex';
  document.querySelectorAll('.dropdown.show').forEach(d=>d.classList.remove('show'));
}

function renderGDDTab(tab){
  if(tab === 'flow'){
    openGameFlowDesigner();
    return;
  }
  GDD_CURRENT_TAB = tab;
  const el = document.getElementById('gdd-content');
  el.innerHTML = GDD_HTML[tab]||'';
  // Add contenteditable hover hint style
  el.querySelectorAll('[contenteditable="true"]').forEach(e=>{
    e.title = 'Click to edit';
    e.addEventListener('focus',()=>{ e.style.outline='2px solid #c9a84c44'; e.style.borderRadius='4px'; });
    e.addEventListener('blur',()=>{ e.style.outline=''; e.style.borderRadius=''; });
  });
  document.querySelectorAll('.gdd-tab').forEach(b=>{
    const active = b.dataset.gdtab===tab;
    b.style.color = active?'#c9a84c':'#6e6e73';
    b.style.borderBottomColor = active?'#c9a84c':'transparent';
  });
}

document.getElementById('m-gen-gdd')?.addEventListener('click', openGDDModal);
document.getElementById('gdd-close-btn')?.addEventListener('click', ()=>{ document.getElementById('gdd-modal').style.display='none'; });
document.getElementById('gdd-modal')?.addEventListener('click', e=>{ if(e.target===document.getElementById('gdd-modal')) document.getElementById('gdd-modal').style.display='none'; });
document.getElementById('gdd-copy-btn')?.addEventListener('click', ()=>{
  const el = document.getElementById('gdd-content');
  const txt = el ? el.innerText : '';
  navigator.clipboard.writeText(txt).then(()=>{
    const btn=document.getElementById('gdd-copy-btn');
    const prev=btn.textContent; btn.textContent='✓ Copied!'; btn.style.color='#5eca8a';
    setTimeout(()=>{btn.textContent=prev;btn.style.color='#c9a84c';},2000);
  });
});
document.getElementById('gdd-download-btn')?.addEventListener('click', ()=>{
  const labels={gdd:'GDD',math:'MathSpec',art:'ArtBrief'};
  if(GDD_CURRENT_TAB==='flow'){ openGameFlowDesigner(); return; }
  const content = document.getElementById('gdd-content').innerHTML;
  const name = P.gameName||'Spinative';
  const fn = name.replace(/\s/g,'_')+'_'+(labels[GDD_CURRENT_TAB]||'Doc')+'.html';
  const fullDoc = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${name} — ${labels[GDD_CURRENT_TAB]||'Document'}</title><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Space Grotesk,sans-serif;background:#111120;color:#c0c0d0;padding:48px 32px;max-width:860px;margin:0 auto;line-height:1.6}[contenteditable="true"]:hover{background:#ffffff08;border-radius:4px}[contenteditable="true"]:focus{outline:2px solid #c9a84c55;border-radius:4px;padding:2px 4px}table{border-collapse:collapse}th,td{padding:6px 10px}</style></head><body>${content}</body></html>`;
  const blob = new Blob([fullDoc],{type:'text/html'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fn; a.click();
});
document.querySelectorAll('.gdd-tab').forEach(b=>{
  b.addEventListener('click',()=>renderGDDTab(b.dataset.gdtab));
});


// ════════════════════════════════════════════════════════
// GAME FLOW DESIGNER
// ════════════════════════════════════════════════════════

const GFD_TYPES = {
  // ── Generic types ──────────────────────────────────────────────────────────
  screen:     {label:'Screen',     color:'#4a8cc9', bg:'#0d1a2a', icon:'🖥',
               desc:'A visible game state (splash, base, popup, settings…)'},
  event:      {label:'Event',      color:'#c9a84c', bg:'#1a1500', icon:'⚡',
               desc:'A trigger that fires when a game condition is met'},
  decision:   {label:'Decision',   color:'#7c5cbf', bg:'#12101e', icon:'◇',
               desc:'A branch point — routes flow based on a guard condition'},
  action:     {label:'Action',     color:'#5eca8a', bg:'#0d1a12', icon:'▶',
               desc:'A player-initiated action or UI interaction'},
  win:        {label:'Win',        color:'#e8c06a', bg:'#1a1600', icon:'🏆',
               desc:'A win-celebration state (small, big, mega, epic, jackpot)'},
  system:     {label:'System',     color:'#6e6e8e', bg:'#111118', icon:'⚙',
               desc:'A system lifecycle node (session start/end, load)'},
  // ── Slot-specific types ────────────────────────────────────────────────────
  rng:        {label:'RNG',        color:'#e05858', bg:'#1e0808', icon:'🎲',
               desc:'RNG call point — where randomness enters the system. Required in cert submissions.'},
  math:       {label:'Math',       color:'#38c8c8', bg:'#081818', icon:'∑',
               desc:'Math engine evaluation — win calc, multiplier, RTP-critical computation'},
  animation:  {label:'Animation',  color:'#c848a8', bg:'#180a16', icon:'✦',
               desc:'Timed animation sequence — may have mandatory minimum display duration'},
  compliance: {label:'Compliance', color:'#e07828', bg:'#180c00', icon:'⚖',
               desc:'Mandatory regulatory display — RG message, session warning, jurisdiction popup'},
};
const GFD_NODE_W = 190;
const GFD_NODE_H = 64;

const GFD = {
  // Multi-flow — each flow is an independent canvas
  flows:[],          // [{ id, name, nodes, connections, pan, scale }]
  activeFlowId:null, // id of the currently visible flow
  // Live references — always point to the active flow's arrays
  nodes:[],connections:[],
  // Runtime state
  selected:null,selConn:null,
  connecting:null,pan:{x:60,y:60},scale:0.85,
  dragging:null,panning:false,panStart:null,_eventsInit:false,_seq:0
};

// ── Meta defaults per slot-specific type ────────────────────────────────────
const GFD_META_DEFAULTS = {
  rng:        { calls:1, distribution:'uniform', outcomes:'', notes:'' },
  math:       { formula:'', affects:'winAmount', rtp:false, notes:'' },
  animation:  { durationMs:1500, skippable:false, mandatoryMs:0, notes:'' },
  compliance: { regulation:'', jurisdiction:'', mandatoryMs:3000, canSkip:false, notes:'' },
};

function _gfdUid(){ return 'n'+(++GFD._seq)+'_'+Math.random().toString(36).slice(2,5); }
function _gfdConnUid(){ return 'c'+(++GFD._seq)+'_'+Math.random().toString(36).slice(2,5); }

// Debounced dirty flag — batches rapid mutations (dragging, typing) into one save
let _gfdDirtyTimer=null;
function _gfdMarkDirty(){
  clearTimeout(_gfdDirtyTimer);
  _gfdDirtyTimer=setTimeout(function(){
    try{ if(typeof markDirty==='function') markDirty(); }catch(e){}
  }, 600);
}

function gfdAddNode(type,label,x,y,notes=''){
  const id=_gfdUid();
  // Clone type-specific meta defaults so each node gets its own copy
  const meta = GFD_META_DEFAULTS[type]
    ? JSON.parse(JSON.stringify(GFD_META_DEFAULTS[type]))
    : {};
  GFD.nodes.push({
    id,type,label,x,y,notes,meta,
    state:{name:label.toLowerCase().replace(/\s+/g,'_'),context:''},
    onEnter:[],
    onExit:[]
  });
  _gfdMarkDirty();
  return id;
}
function gfdConnect(fromNode,toNode,label='',condition=null,priority=99){
  if(!fromNode||!toNode) return;
  GFD.connections.push({id:_gfdConnUid(),fromNode,toNode,label,condition,priority});
  _gfdMarkDirty();
}

// ─── Multi-flow management ────────────────────────────────────────────────────

function _gfdFlowUid(){ return 'flow_'+Date.now()+'_'+Math.random().toString(36).slice(2,5); }

/** Returns the currently active flow object */
function _gfdActiveFlow(){
  return GFD.flows.find(f=>f.id===GFD.activeFlowId) || GFD.flows[0] || null;
}

/**
 * Ensures GFD has at least one flow. Called on first open.
 * Migrates legacy single-canvas state (GFD.nodes / GFD.connections) if needed.
 */
function _gfdEnsureFlows(){
  if(GFD.flows.length>0) return; // already initialized
  // If nodes exist in legacy format, migrate them into a Base Game flow
  const legacyNodes = GFD.nodes.length ? [...GFD.nodes] : [];
  const legacyConns = GFD.connections.length ? [...GFD.connections] : [];
  const id = _gfdFlowUid();
  GFD.flows = [{ id, name:'Base Game', nodes:legacyNodes, connections:legacyConns, pan:{x:60,y:60}, scale:0.85 }];
  GFD.activeFlowId = id;
  GFD.nodes = GFD.flows[0].nodes;
  GFD.connections = GFD.flows[0].connections;
}

/** Switch to a different flow, saving current pan/scale first */
function gfdSwitchFlow(flowId){
  // Persist current pan/scale
  const cur=_gfdActiveFlow();
  if(cur){ cur.pan={x:GFD.pan.x,y:GFD.pan.y}; cur.scale=GFD.scale; }
  // Activate new flow
  const flow=GFD.flows.find(f=>f.id===flowId); if(!flow) return;
  GFD.activeFlowId=flowId;
  GFD.nodes=flow.nodes;
  GFD.connections=flow.connections;
  GFD.pan={x:(flow.pan?.x??60),y:(flow.pan?.y??60)};
  GFD.scale=flow.scale??0.85;
  GFD.selected=null; GFD.selConn=null;
  gfdRenderFlowTabs();
  gfdRender();
  setTimeout(()=>{ _gfdDrawGrid(); if(!flow.nodes.length) return; gfdFit(); },60);
  _gfdMarkDirty();
}

/** Add a brand-new empty flow */
function gfdAddFlow(name){
  const id=_gfdFlowUid();
  GFD.flows.push({ id, name:name||'New Flow', nodes:[], connections:[], pan:{x:60,y:60}, scale:0.85 });
  gfdSwitchFlow(id);
}

/** Rename a flow */
function gfdRenameFlow(flowId,name){
  const f=GFD.flows.find(f=>f.id===flowId); if(!f||!name.trim()) return;
  f.name=name.trim();
  gfdRenderFlowTabs();
  _gfdMarkDirty();
}

/** Delete a flow (not allowed if it's the only one) */
function gfdDeleteFlow(flowId){
  if(GFD.flows.length<=1) return;
  const idx=GFD.flows.findIndex(f=>f.id===flowId); if(idx<0) return;
  GFD.flows.splice(idx,1);
  if(GFD.activeFlowId===flowId){
    gfdSwitchFlow(GFD.flows[Math.max(0,idx-1)].id);
  } else {
    gfdRenderFlowTabs();
  }
  _gfdMarkDirty();
}

/** Render the tab bar above the canvas */
function gfdRenderFlowTabs(){
  const bar=document.getElementById('gfd-tab-bar'); if(!bar) return;
  const tabs=GFD.flows.map(f=>{
    const isActive=f.id===GFD.activeFlowId;
    const canDel=GFD.flows.length>1;
    return `<div class="gfd-tab${isActive?' gfd-tab-active':''}" onclick="gfdSwitchFlow('${f.id}')" ondblclick="gfdRenameFlowPrompt('${f.id}')" title="Double-click to rename">
      <span class="gfd-tab-label">${escH(f.name)}</span>
      ${canDel?`<span class="gfd-tab-close" onclick="event.stopPropagation();gfdDeleteFlowConfirm('${f.id}')" title="Delete flow">×</span>`:''}
    </div>`;
  }).join('');
  bar.innerHTML=tabs+`<div class="gfd-tab-add" onclick="gfdAddFlowPrompt()" title="Add new flow">＋</div>`;
}

function gfdAddFlowPrompt(){
  const name=prompt('Flow name:','New Flow'); if(!name||!name.trim()) return;
  gfdAddFlow(name.trim());
}
function gfdRenameFlowPrompt(flowId){
  const f=GFD.flows.find(f=>f.id===flowId); if(!f) return;
  const name=prompt('Rename flow:',f.name); if(!name||!name.trim()) return;
  gfdRenameFlow(flowId,name.trim());
}
function gfdDeleteFlowConfirm(flowId){
  const f=GFD.flows.find(f=>f.id===flowId); if(!f) return;
  if(!confirm(`Delete flow "${f.name}"? This cannot be undone.`)) return;
  gfdDeleteFlow(flowId);
}

function gfdRePopulate(){
  if(GFD.nodes.length && !confirm('This will replace the current flow with an auto-generated one. Continue?')) return;
  // Reset only the active flow
  const af=_gfdActiveFlow();
  if(af){ af.nodes=[]; af.connections=[]; }
  GFD.nodes=af?.nodes||[]; GFD.connections=af?.connections||[];
  GFD.selected=null; GFD.selConn=null;
  const d=collectProjectData();
  _gfdAutoPopulate(d);
  gfdRender();
  setTimeout(gfdFit,50);
}

function _gfdAutoPopulate(d){
  // ── Layout constants ─────────────────────────────────────────────────────────
  // Top-to-bottom: each "layer" is a new row (Y axis), features spread as columns (X axis)
  const NW=GFD_NODE_W, NH=GFD_NODE_H;
  const PAD=60;          // canvas edge padding
  const COL_W=NW+70;    // horizontal gap between feature columns
  const ROW_H=NH+80;    // vertical gap between layers

  // ── Detect enabled features ───────────────────────────────────────────────
  const hasFreeSpins=d.enabledFeatures.some(f=>/free.?spin/i.test(f));
  const hasHoldSpin =d.enabledFeatures.some(f=>/hold.{0,5}spin/i.test(f));
  const hasBuy      =d.enabledFeatures.some(f=>/buy.?feature/i.test(f));
  const hasPick     =d.enabledFeatures.some(f=>/bonus.?pick|pick.?game/i.test(f));
  const hasWheel    =d.enabledFeatures.some(f=>/wheel/i.test(f));

  // ── Calculate canvas width from feature count ─────────────────────────────
  const nFeatureCols=[hasFreeSpins,hasHoldSpin,hasBuy,hasPick,hasWheel].filter(Boolean).length + 2; // +1 spin-res, +1 settings
  const nWinTypes   =4+(d.jps.length?1:0);
  const nCols       =Math.max(nFeatureCols, nWinTypes, 3);
  const totalW      =nCols*COL_W;
  // Center x for the single-node rows (START, LOAD, BASE GAME)
  const cx=PAD+totalW/2-NW/2;

  // ── Layer 0: System lifecycle ─────────────────────────────────────────────
  const startId=gfdAddNode('system','START',    cx-COL_W,PAD,           'Game session initialises. Assets loaded.');
  const enId   =gfdAddNode('system','SESSION END',cx+COL_W,PAD,         'Player exits or session timer expires.');

  // ── Layer 1: Load/Splash ──────────────────────────────────────────────────
  const loadId =gfdAddNode('screen','LOAD / SPLASH',cx,       PAD+ROW_H,    'Intro animation plays. Studio logo shown.');

  // ── Layer 2: Base Game ────────────────────────────────────────────────────
  const baseId =gfdAddNode('screen','BASE GAME',    cx,       PAD+ROW_H*2,  'Main reel loop. Player bets and spins.');

  gfdConnect(startId,loadId,'',null,1);
  gfdConnect(loadId, baseId,'Intro complete',null,1);
  gfdConnect(baseId, enId,  'Player exits',{field:'sessionActive',op:'==',value:false},99);

  // ── Layer 3+: Feature columns (each feature = single column, flowing downward) ──
  const featureMap={};
  let col=0;

  function colX(c){ return PAD+c*COL_W; }
  const L3=PAD+ROW_H*3;  // trigger / 1st feature node
  const L4=PAD+ROW_H*4;  // popup / 2nd feature node
  const L5=PAD+ROW_H*5;  // main feature screen

  if(hasFreeSpins){
    const ev=gfdAddNode('event', 'FS TRIGGER', colX(col),L3,'3+ Scatter symbols land on reels 1, 2, 3');
    const pp=gfdAddNode('screen','FS POPUP',   colX(col),L4,'Displays free spin count & multiplier. Player confirms.');
    const fs=gfdAddNode('screen','FREE SPINS', colX(col),L5,'Enhanced reels with multipliers. Retriggerable.');
    gfdConnect(baseId,ev,'3+ Scatters',{field:'scatter',op:'>=',value:3},10);
    gfdConnect(ev,pp,'Trigger fires',null,1);
    gfdConnect(pp,fs,'Player taps START',null,1);
    gfdConnect(fs,baseId,'Spins exhausted',{field:'features.freeSpin.count',op:'<=',value:0},1);
    gfdConnect(fs,fs,'Retrigger',{field:'scatter',op:'>=',value:3},10);
    featureMap.fs=fs; col++;
  }
  if(hasHoldSpin){
    const ev=gfdAddNode('event', 'H&S TRIGGER',colX(col),L3,'6+ Coin symbols land on any position');
    const pp=gfdAddNode('screen','H&S POPUP',  colX(col),L4,'Announces Hold & Spin. 3 respins allocated.');
    const hs=gfdAddNode('screen','HOLD & SPIN',colX(col),L5,'Coins held. Respins reset on each new coin land.');
    gfdConnect(baseId,ev,'6+ Coins',{field:'coinCount',op:'>=',value:6},10);
    gfdConnect(ev,pp,'Trigger fires',null,1);
    gfdConnect(pp,hs,'Player taps START',null,1);
    gfdConnect(hs,baseId,'Respins exhausted',{field:'features.respin.count',op:'<=',value:0},1);
    featureMap.hs=hs; col++;
  }
  if(hasBuy){
    const bp=gfdAddNode('action',  'BUY FEATURE',colX(col),L3,'Cost: 100× total bet. Player views cost & confirms.');
    const dc=gfdAddNode('decision','CONFIRMED?', colX(col),L4,'');
    gfdConnect(baseId,bp,'Player taps BUY',null,20);
    gfdConnect(bp,dc,'',null,1);
    if(featureMap.fs) gfdConnect(dc,featureMap.fs,'Yes',{field:'buyConfirmed',op:'==',value:true},1);
    else gfdConnect(dc,baseId,'Yes',{field:'buyConfirmed',op:'==',value:true},1);
    gfdConnect(dc,baseId,'No — cancel',{field:'buyConfirmed',op:'==',value:false},2);
    col++;
  }
  if(hasPick){
    const pk=gfdAddNode('screen','BONUS PICK', colX(col),L3,'Player picks from hidden items to reveal cash prizes.');
    gfdConnect(baseId,pk,'3+ Bonus symbols',{field:'bonusCount',op:'>=',value:3},10);
    gfdConnect(pk,baseId,'All picks revealed',null,1); col++;
  }
  if(hasWheel){
    const wh=gfdAddNode('screen','WHEEL BONUS',colX(col),L3,'Prize wheel spin. Multiplier or feature award.');
    gfdConnect(baseId,wh,'Trigger met',{field:'wheelTrigger',op:'==',value:true},10);
    gfdConnect(wh,baseId,'Prize awarded',null,1); col++;
  }
  // ── Spin Resolution column (core path — always present) ──────────────────────
  // RNG and Math nodes document the certifiable spin loop for compliance handoff.
  const rngId =gfdAddNode('rng',  'RNG RESOLUTION',colX(col),L3,
    'Certified RNG call. One call per spin. Seeded outcome determines reel stops.');
  const mathId=gfdAddNode('math', 'MATH ENGINE',   colX(col),L4,
    'Evaluates reel stops → win amount. Applies multipliers. RTP-critical path.');
  // Override defaults with slot-domain context
  const _rngN=GFD.nodes.find(n=>n.id===rngId);
  if(_rngN) _rngN.meta={calls:1,distribution:'uniform',outcomes:'normal,freeSpin,bonus,jackpot',notes:'GLI-11 / BMM certified RNG required'};
  const _maN=GFD.nodes.find(n=>n.id===mathId);
  if(_maN) _maN.meta={formula:'bet × winLines × mult',affects:'winAmount',rtp:true,notes:'All code paths must be submitted in math cert doc'};
  gfdConnect(baseId,rngId, 'Reel spin',         null,5);
  gfdConnect(rngId, mathId,'Reel stops',         null,1);
  gfdConnect(mathId,baseId,'Result applied',      null,1);
  col++;

  // Settings — always the last feature column
  const sg=gfdAddNode('screen','SETTINGS',colX(col),L3,'Paytable · History · Audio · Info · Responsible Gambling');
  gfdConnect(baseId,sg,'Taps ⚙',null,50);
  gfdConnect(sg,baseId,'Close / Back',null,1); col++;

  // ── Bottom layer: Win resolution nodes ────────────────────────────────────
  const winY=PAD+ROW_H*(hasFreeSpins||hasHoldSpin?6:4);
  const winTypes=[
    ['win','SMALL WIN','Silent — balance update only. No overlay.'],
    ['win','BIG WIN','Animated counter overlay. Coin shower FX.'],
    ['win','MEGA WIN','Full-screen celebration. Holds 3 sec.'],
    ['win','EPIC WIN','Cinematic sequence. Music swell. Lightning FX.'],
  ];
  if(d.jps.length) winTypes.push(['win','JACKPOT WIN','Ultimate celebration. Full cinematic + collect sequence.']);
  const winTotalW=(winTypes.length-1)*COL_W;
  const winStartX=cx-winTotalW/2;
  winTypes.forEach(([type,label,notes],i)=>{
    const wid=gfdAddNode(type,label,winStartX+i*COL_W,winY,notes);
    gfdConnect(baseId,wid,'Win resolved',null,5+i);
    gfdConnect(wid,baseId,label==='SMALL WIN'?'Auto-dismiss':'Win dismissed',null,1);
  });
}

// ─── Render ──────────────────────────────────────────────
function gfdRender(){
  const canvas=document.getElementById('gfd-canvas');
  if(!canvas) return;
  // Remove existing nodes
  canvas.querySelectorAll('.gfd-node').forEach(e=>e.remove());
  GFD.nodes.forEach(node=>canvas.appendChild(_gfdMakeNodeEl(node)));
  _gfdApplyTransform();
  gfdUpdateSVG();
  gfdBuildPalette();
  gfdRenderProps();
}

function _gfdApplyTransform(){
  const canvas=document.getElementById('gfd-canvas');
  if(canvas) canvas.style.transform=`translate(${GFD.pan.x}px,${GFD.pan.y}px) scale(${GFD.scale})`;
}

function gfdUpdateSVG(){
  const svg=document.getElementById('gfd-svg');
  if(!svg) return;
  let defs=`<defs>`;
  // Arrow markers pointing downward (for vertical top-to-bottom flow)
  Object.entries(GFD_TYPES).forEach(([t,v])=>{
    defs+=`<marker id="gfd-arr-${t}" viewBox="0 0 10 10" refX="5" refY="9" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L5 9L10 0" fill="none" stroke="${v.color}cc" stroke-width="1.5" stroke-linejoin="round"/></marker>`;
  });
  defs+=`</defs>`;
  let body='';
  GFD.connections.forEach(conn=>{
    const fn=GFD.nodes.find(n=>n.id===conn.fromNode);
    const tn=GFD.nodes.find(n=>n.id===conn.toNode);
    if(!fn||!tn) return;
    const isSel=GFD.selConn===conn.id;
    const isSelf=conn.fromNode===conn.toNode;
    const isBack=tn.y<fn.y-20; // connection goes upward (back to prev layer)
    const fc=GFD_TYPES[fn.type]?.color||'#666';
    // Source: bottom-center of fromNode. Target: top-center of toNode.
    const fx=fn.x+GFD_NODE_W/2, fy=fn.y+GFD_NODE_H;
    const tx=tn.x+GFD_NODE_W/2, ty=tn.y;
    let dp='';
    if(isSelf){
      // Self-loop: arc to the right side of the node
      const lx=fn.x+GFD_NODE_W+60;
      dp=`M${fx},${fy} C${fx},${fy+40} ${lx},${fy+40} ${lx},${fn.y+GFD_NODE_H/2} C${lx},${fn.y-20} ${tx},${ty-40} ${tx},${ty}`;
    } else if(isBack){
      // Back-connection: route around the right side to avoid crossing forward edges
      const ox=Math.max(fn.x,tn.x)+GFD_NODE_W+80;
      dp=`M${fx},${fy} C${fx},${fy+50} ${ox},${fy+50} ${ox},${(fy+ty)/2} C${ox},${ty-50} ${tx},${ty-50} ${tx},${ty}`;
    } else {
      // Forward connection: smooth vertical cubic bezier
      const cp=Math.max(50,Math.abs(ty-fy)*0.45);
      dp=`M${fx},${fy} C${fx},${fy+cp} ${tx},${ty-cp} ${tx},${ty}`;
    }
    const mx=(fx+tx)/2, my=(fy+ty)/2;
    const strokeW=isSel?2.5:1.5;
    const strokeCol=isSel?'#ffffff':isBack?fc+'66':fc+'99';
    const dashArr=isBack?'6 4':'none';
    // ── Edge metadata badge ──────────────────────────────────────────────────
    const _TI={ auto:'⚡', 'user-action':'👆', timer:'⏱', condition:'◇' };
    const metaParts=[];
    if(conn.triggerType && conn.triggerType!=='auto') metaParts.push(`${_TI[conn.triggerType]||'?'} ${conn.triggerType}`);
    if(conn.probability!=null && conn.probability!=='') metaParts.push(`${conn.probability}%`);
    if(conn.durationMs) metaParts.push(`${conn.durationMs}ms`);
    const metaStr=metaParts.join(' · ');
    const hasLabel=!!conn.label; const hasMeta=!!metaStr;
    let edgeBadge='';
    if(hasLabel||hasMeta){
      // Pill background: size based on longest line
      const line1=hasLabel?conn.label:'', line2=metaStr;
      const longest=Math.max(line1.length,line2.length);
      const pw=Math.max(50,longest*5.2+16);
      const ph=(hasLabel&&hasMeta?28:16);
      const py=my-ph/2;
      edgeBadge=`
        <g style="pointer-events:none">
          <rect x="${mx-pw/2}" y="${py}" width="${pw}" height="${ph}" rx="${ph/2}" fill="#0a0a0f" stroke="${fc}33" stroke-width="1"/>
          ${hasLabel?`<text x="${mx}" y="${py+(hasMeta?10:ph/2+3)}" text-anchor="middle" fill="${fc}cc" font-size="9" font-family="Inter,system-ui,sans-serif" font-weight="600" letter-spacing=".02">${escH(conn.label)}</text>`:''}
          ${hasMeta?`<text x="${mx}" y="${py+ph-6}" text-anchor="middle" fill="${fc}77" font-size="8" font-family="Inter,system-ui,sans-serif" letter-spacing=".01">${escH(metaStr)}</text>`:''}
        </g>`;
    }
    body+=`<g class="gfd-conn-g" data-cid="${conn.id}">
      <path d="${dp}" stroke="transparent" stroke-width="12" fill="none" style="cursor:pointer"/>
      <path d="${dp}" stroke="${strokeCol}" stroke-width="${strokeW}" fill="none" stroke-dasharray="${dashArr}" marker-end="url(#gfd-arr-${fn.type})" style="cursor:pointer;pointer-events:stroke"/>
      ${edgeBadge}
    </g>`;
  });
  // Temp connecting line (vertical bezier from bottom of source)
  if(GFD.connecting?.x2!==undefined){
    const {fx,fy,x2,y2}=GFD.connecting;
    const cp=Math.max(50,Math.abs(y2-fy)*0.45);
    body+=`<path d="M${fx},${fy} C${fx},${fy+cp} ${x2},${y2-cp} ${x2},${y2}" stroke="#c9a84c" stroke-width="1.5" fill="none" stroke-dasharray="6 3" opacity="0.9"/>`;
  }
  svg.innerHTML=defs+body;
  svg.querySelectorAll('.gfd-conn-g').forEach(g=>{
    g.addEventListener('click',e=>{e.stopPropagation();gfdSelectConn(g.dataset.cid);});
  });
}

// ── Meta summary pill shown at the bottom of slot-specific node cards ────────
function _gfdMetaPill(node,t){
  const m=node.meta||{};
  let content='';
  if(node.type==='rng'){
    const calls=m.calls||1;
    const dist=m.distribution||'uniform';
    content=`🎲 ${calls} RNG call${calls!==1?'s':''} · ${dist}`;
  } else if(node.type==='math'){
    const aff=m.affects||'winAmount';
    content=`∑ → ${aff}${m.rtp?' · RTP-critical':''}`;
  } else if(node.type==='animation'){
    const dur=m.durationMs||0;
    const man=m.mandatoryMs||0;
    content=`⏱ ${dur}ms${man>0?` · ${man}ms min`:''}${m.skippable?' · skippable':''}`;
  } else if(node.type==='compliance'){
    const jur=m.jurisdiction||'';
    const man=m.mandatoryMs||0;
    content=`⚖ ${jur||'All regions'} · ${man}ms min${m.canSkip?' · skippable':''}`;
  }
  if(!content) return '';
  return `<div data-gfd-metapill style="margin:0 10px 8px;padding:4px 8px;border-radius:5px;background:${t.color}12;border:1px solid ${t.color}22;font-size:8px;color:${t.color}cc;font-family:Inter,system-ui,sans-serif;line-height:1.5;letter-spacing:.02em">${content}</div>`;
}

// ── Meta fields rendered in the props panel for slot-specific node types ──────
function _gfdMetaFieldsHtml(node){
  const m=node.meta||{};
  const t=GFD_TYPES[node.type]||GFD_TYPES.screen;
  const inp=_GP.inp;
  const lbl=_GP.lbl;
  const sec=_GP.sec;
  const chkStyle=`width:14px;height:14px;accent-color:${t.color};cursor:pointer`;
  const header=`<div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${t.color};font-family:${_GP.font};margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid ${t.color}22">${t.icon} ${t.label} Properties</div>`;

  if(node.type==='rng'){
    return `<div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">${header}
      <div style="${sec}"><div style="${lbl}">RNG Calls</div>
        <input type="number" min="1" max="99" value="${m.calls||1}" style="${inp};width:70px;color:${t.color}" oninput="gfdMetaEdit('calls',parseInt(this.value)||1)">
      </div>
      <div style="${sec}"><div style="${lbl}">Distribution</div>
        <select style="${inp};color:${_GP.tx}" onchange="gfdMetaEdit('distribution',this.value)">
          ${['uniform','weighted','seeded','custom'].map(d=>`<option value="${d}"${(m.distribution||'uniform')===d?' selected':''}>${d}</option>`).join('')}
        </select>
      </div>
      <div style="${sec}"><div style="${lbl}">Outcome Keys <span style="color:${_GP.txF};font-weight:400;text-transform:none;letter-spacing:0">(comma-sep)</span></div>
        <textarea rows="2" style="${inp};font-size:9px;color:${_GP.txM};resize:vertical" oninput="gfdMetaEdit('outcomes',this.value)">${escH(m.outcomes||'')}</textarea>
      </div>
      <div style="${sec}"><div style="${lbl}">Notes</div>
        <textarea rows="2" style="${inp};font-size:9px;color:${_GP.txM};resize:vertical" oninput="gfdMetaEdit('notes',this.value)">${escH(m.notes||'')}</textarea>
      </div>
    </div>`;
  }
  if(node.type==='math'){
    return `<div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">${header}
      <div style="${sec}"><div style="${lbl}">Formula / Expression</div>
        <input value="${escH(m.formula||'')}" placeholder="e.g. bet × mult × lines" style="${inp};font-family:monospace;font-size:10px;color:${t.color}" oninput="gfdMetaEdit('formula',this.value)">
      </div>
      <div style="${sec}"><div style="${lbl}">Affects</div>
        <input value="${escH(m.affects||'winAmount')}" placeholder="winAmount" style="${inp};color:${_GP.tx}" oninput="gfdMetaEdit('affects',this.value)">
      </div>
      <div style="${sec}"><div style="${lbl}" title="Mark as RTP-critical so it appears in the compliance view">RTP-Critical</div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" ${m.rtp?'checked':''} style="${chkStyle}" onchange="gfdMetaEdit('rtp',this.checked)">
          <span style="font-size:10px;color:${_GP.txM}">Affects return-to-player calculation</span>
        </label>
      </div>
      <div style="${sec}"><div style="${lbl}">Notes</div>
        <textarea rows="2" style="${inp};font-size:9px;color:${_GP.txM};resize:vertical" oninput="gfdMetaEdit('notes',this.value)">${escH(m.notes||'')}</textarea>
      </div>
    </div>`;
  }
  if(node.type==='animation'){
    return `<div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">${header}
      <div style="${sec}"><div style="${lbl}">Total Duration (ms)</div>
        <input type="number" min="0" step="100" value="${m.durationMs??1500}" style="${inp};width:100px;color:${t.color}" oninput="gfdMetaEdit('durationMs',parseInt(this.value)||0)">
      </div>
      <div style="${sec}"><div style="${lbl}">Mandatory Minimum (ms) <span style="color:${_GP.txF};font-weight:400;text-transform:none;letter-spacing:0">cert req.</span></div>
        <input type="number" min="0" step="100" value="${m.mandatoryMs??0}" style="${inp};width:100px;color:${_GP.gold}" oninput="gfdMetaEdit('mandatoryMs',parseInt(this.value)||0)">
      </div>
      <div style="${sec}"><div style="${lbl}">Skippable</div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" ${m.skippable?'checked':''} style="${chkStyle}" onchange="gfdMetaEdit('skippable',this.checked)">
          <span style="font-size:10px;color:${_GP.txM}">Player can skip this animation</span>
        </label>
      </div>
      <div style="${sec}"><div style="${lbl}">Notes</div>
        <textarea rows="2" style="${inp};font-size:9px;color:${_GP.txM};resize:vertical" oninput="gfdMetaEdit('notes',this.value)">${escH(m.notes||'')}</textarea>
      </div>
    </div>`;
  }
  if(node.type==='compliance'){
    return `<div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">${header}
      <div style="${sec}"><div style="${lbl}">Regulation</div>
        <input value="${escH(m.regulation||'')}" placeholder="e.g. UKGC SC 7.1.3" style="${inp};color:${_GP.tx}" oninput="gfdMetaEdit('regulation',this.value)">
      </div>
      <div style="${sec}"><div style="${lbl}">Jurisdiction</div>
        <input value="${escH(m.jurisdiction||'')}" placeholder="e.g. UK, Malta, Ontario…" style="${inp};color:${_GP.tx}" oninput="gfdMetaEdit('jurisdiction',this.value)">
      </div>
      <div style="${sec}"><div style="${lbl}">Mandatory Display (ms)</div>
        <input type="number" min="0" step="500" value="${m.mandatoryMs??3000}" style="${inp};width:100px;color:${_GP.gold}" oninput="gfdMetaEdit('mandatoryMs',parseInt(this.value)||0)">
      </div>
      <div style="${sec}"><div style="${lbl}">Can Skip</div>
        <label style="display:flex;align-items:center;gap:7px;cursor:pointer">
          <input type="checkbox" ${m.canSkip?'checked':''} style="${chkStyle}" onchange="gfdMetaEdit('canSkip',this.checked)">
          <span style="font-size:10px;color:${_GP.txM}">Jurisdiction permits skip after minimum</span>
        </label>
      </div>
      <div style="${sec}"><div style="${lbl}">Notes</div>
        <textarea rows="2" style="${inp};font-size:9px;color:${_GP.txM};resize:vertical" oninput="gfdMetaEdit('notes',this.value)">${escH(m.notes||'')}</textarea>
      </div>
    </div>`;
  }
  return '';
}

function gfdMetaEdit(field,val){
  const node=GFD.nodes.find(n=>n.id===GFD.selected); if(!node) return;
  if(!node.meta) node.meta={};
  node.meta[field]=val;
  _gfdMarkDirty();
  // Update the meta pill in the canvas node card without a full re-render
  const el=document.getElementById('gfdn-'+node.id);
  if(el){
    const pill=el.querySelector('[data-gfd-metapill]');
    const t=GFD_TYPES[node.type]||GFD_TYPES.screen;
    const newPill=_gfdMetaPill(node,t);
    if(pill) pill.outerHTML=newPill||'';
    else if(newPill){
      // Inject before out-port
      const port=el.querySelector('.gfd-port-out');
      if(port) port.insertAdjacentHTML('beforebegin',newPill.replace('<div ','<div data-gfd-metapill '));
    }
  }
}

function _gfdMakeNodeEl(node){
  const t=GFD_TYPES[node.type]||GFD_TYPES.screen;
  const isSel=GFD.selected===node.id;
  const isActive=GFD_SIM.active&&GFD_SIM.currentNodeId===node.id;
  const el=document.createElement('div');
  el.id='gfdn-'+node.id; el.dataset.nid=node.id; el.className='gfd-node';
  const borderCol=isActive?'#f0e060':isSel?t.color:t.color+'44';
  const shadow=isActive
    ?`0 0 0 2px #f0e06066,0 0 24px #f0e06033,0 8px 32px #00000099`
    :isSel
      ?`0 0 0 2px ${t.color}44,0 0 18px ${t.color}22,0 6px 24px #00000099`
      :'0 2px 16px #00000077';
  el.style.cssText=`position:absolute;left:${node.x}px;top:${node.y}px;width:${GFD_NODE_W}px;min-height:${GFD_NODE_H}px;border-radius:10px;border:1.5px solid ${borderCol};background:${t.bg};cursor:move;user-select:none;box-shadow:${shadow};transition:border-color .15s,box-shadow .15s;backdrop-filter:blur(2px)`;
  el.innerHTML=`
    <div class="gfd-port-in" data-nid="${node.id}" style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:${t.bg};border:2px solid ${t.color}88;cursor:crosshair;z-index:3;transition:border-color .12s,transform .12s" onmouseenter="this.style.borderColor='${t.color}';this.style.transform='translateX(-50%) scale(1.25)'" onmouseleave="this.style.borderColor='${t.color}88';this.style.transform='translateX(-50%) scale(1)'"></div>
    <div style="padding:7px 12px 5px;border-bottom:1px solid ${t.color}18;display:flex;align-items:center;gap:7px">
      <span style="font-size:13px;line-height:1">${t.icon}</span>
      <span style="font-size:8px;color:${t.color};font-family:Inter,system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-weight:700;opacity:.85">${escH(t.label)}</span>
    </div>
    <div data-gfd-label style="padding:7px 12px 8px;font-size:11px;color:${isActive?'#f0e060':'#dddbd4'};font-family:Inter,system-ui,sans-serif;font-weight:600;line-height:1.35;letter-spacing:-.01em">${isActive?'▶ ':''}${escH(node.label)}</div>
    <div data-gfd-notes style="padding:0 12px 8px;font-size:9px;color:#5a5a6e;font-family:Inter,system-ui,sans-serif;line-height:1.55;border-top:1px solid ${t.color}10;padding-top:5px;display:${node.notes?'block':'none'}">${escH(node.notes)}</div>
    ${_gfdMetaPill(node,t)}
    <div class="gfd-port-out" data-nid="${node.id}" style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:50%;background:${t.color};border:2px solid ${t.color};cursor:crosshair;z-index:3;box-shadow:0 0 8px ${t.color}66;transition:transform .12s" onmouseenter="this.style.transform='translateX(-50%) scale(1.25)'" onmouseleave="this.style.transform='translateX(-50%) scale(1)'"></div>`;
  el.addEventListener('mousedown',e=>{
    if(e.target.classList.contains('gfd-port-out')||e.target.classList.contains('gfd-port-in')) return;
    e.stopPropagation();
    gfdSelectNode(node.id);
    const rect=document.getElementById('gfd-canvas-wrap').getBoundingClientRect();
    GFD.dragging={nodeId:node.id,ox:(e.clientX-rect.left-GFD.pan.x)/GFD.scale-node.x,oy:(e.clientY-rect.top-GFD.pan.y)/GFD.scale-node.y};
  });
  // Out port: starts from bottom-center of node
  el.querySelector('.gfd-port-out').addEventListener('mousedown',e=>{
    e.stopPropagation(); e.preventDefault();
    const wrap=document.getElementById('gfd-canvas-wrap');
    const rect=wrap.getBoundingClientRect();
    GFD.connecting={fromNode:node.id,fx:node.x+GFD_NODE_W/2,fy:node.y+GFD_NODE_H,x2:node.x+GFD_NODE_W/2,y2:node.y+GFD_NODE_H};
    const onMove=e2=>{GFD.connecting.x2=(e2.clientX-rect.left-GFD.pan.x)/GFD.scale;GFD.connecting.y2=(e2.clientY-rect.top-GFD.pan.y)/GFD.scale;gfdUpdateSVG();};
    const onUp=()=>{document.removeEventListener('mousemove',onMove);if(GFD.connecting){GFD.connecting=null;gfdUpdateSVG();}};
    document.addEventListener('mousemove',onMove);
    document.addEventListener('mouseup',onUp,{once:true});
  });
  el.querySelector('.gfd-port-in').addEventListener('mouseup',e=>{
    e.stopPropagation();
    if(GFD.connecting && GFD.connecting.fromNode!==node.id){
      gfdConnect(GFD.connecting.fromNode,node.id,''); // gfdConnect already calls _gfdMarkDirty
      GFD.connecting=null;gfdUpdateSVG();gfdRender();
    }
  });
  return el;
}

// ─── Selection ───────────────────────────────────────────
function gfdSelectNode(id){
  GFD.selected=id; GFD.selConn=null;
  GFD.nodes.forEach(n=>{
    const el=document.getElementById('gfdn-'+n.id); if(!el) return;
    const t=GFD_TYPES[n.type]||GFD_TYPES.screen;
    el.style.borderColor=n.id===id?t.color:t.color+'55';
    el.style.boxShadow=n.id===id?`0 0 0 3px ${t.color}33,0 6px 24px #00000099`:'0 2px 12px #00000055';
  });
  gfdRenderProps(); gfdUpdateSVG();
}
function gfdSelectConn(id){
  GFD.selConn=id; GFD.selected=null;
  GFD.nodes.forEach(n=>{const el=document.getElementById('gfdn-'+n.id);if(el){const t=GFD_TYPES[n.type]||GFD_TYPES.screen;el.style.borderColor=t.color+'55';el.style.boxShadow='0 2px 12px #00000055';}});
  gfdRenderProps(); gfdUpdateSVG();
}
function gfdDeleteNode(id){
  GFD.nodes=GFD.nodes.filter(n=>n.id!==id);
  GFD.connections=GFD.connections.filter(c=>c.fromNode!==id&&c.toNode!==id);
  GFD.selected=null; gfdRenderProps(); gfdRender(); _gfdMarkDirty();
}
function gfdDeleteConn(id){
  GFD.connections=GFD.connections.filter(c=>c.id!==id);
  GFD.selConn=null; gfdUpdateSVG(); gfdRenderProps(); _gfdMarkDirty();
}

// ─── Properties Panel ────────────────────────────────────
const GFD_FIELDS=[
  {v:'scatter',l:'scatter'},
  {v:'wildCount',l:'wildCount'},
  {v:'coinCount',l:'coinCount'},
  {v:'winAmount',l:'winAmount'},
  {v:'totalWin',l:'totalWin'},
  {v:'multiplier',l:'multiplier'},
  {v:'features.freeSpin.active',l:'freeSpin.active'},
  {v:'features.freeSpin.count',l:'freeSpin.count'},
  {v:'features.respin.active',l:'respin.active'},
  {v:'features.respin.count',l:'respin.count'},
  {v:'jackpot.triggered',l:'jackpot.triggered'},
  {v:'buyConfirmed',l:'buyConfirmed'},
  {v:'bonusCount',l:'bonusCount'},
  {v:'wheelTrigger',l:'wheelTrigger'},
  {v:'sessionActive',l:'sessionActive'},
];
const GFD_OPS=['>=','<=','>','<','==','!='];
const GFD_ACTIONS=['set','add','sub','mul','reset','emit'];

// ─── Shared prop panel CSS vars ──────────────────────────────────────────────
const _GP={
  bg:'#0a0a0f', surf:'#13131a', surfH:'#1a1a24',
  border:'rgba(255,255,255,.07)', gold:'#c9a84c',
  tx:'#eeede6', txM:'#7a7a8a', txF:'#3e3e4e',
  font:'Inter,system-ui,sans-serif',
  inp:`width:100%;padding:6px 8px;background:#0f0f16;border:1px solid rgba(255,255,255,.08);border-radius:7px;color:#dddbd4;font-size:11px;font-family:Inter,system-ui,sans-serif;outline:none;box-sizing:border-box;transition:border-color .12s`,
  lbl:`font-size:9px;color:#3e3e4e;font-family:Inter,system-ui,sans-serif;margin-bottom:5px;text-transform:uppercase;letter-spacing:.08em;font-weight:600`,
  sec:`margin-bottom:12px`,
};

function _gfdCondHtml(cond,connId){
  const c=cond||{field:GFD_FIELDS[0].v,op:'>=',value:0};
  const fieldOpts=GFD_FIELDS.map(f=>`<option value="${f.v}"${c.field===f.v?' selected':''}>${f.l}</option>`).join('');
  const opOpts=GFD_OPS.map(o=>`<option value="${o}"${c.op===o?' selected':''}>${o}</option>`).join('');
  const ss=`padding:5px 6px;background:#0f0f16;border:1px solid rgba(255,255,255,.08);border-radius:5px;color:#b0c8d0;font-size:9px;font-family:Inter,system-ui,sans-serif;outline:none`;
  return `<div style="display:flex;gap:4px;align-items:center;margin-top:6px">
    <select style="flex:2;${ss}" onchange="gfdCondEdit('${connId}','field',this.value)">${fieldOpts}</select>
    <select style="flex:1;${ss}" onchange="gfdCondEdit('${connId}','op',this.value)">${opOpts}</select>
    <input type="text" value="${escH(String(c.value??0))}" style="flex:1;${ss};color:#c9a08a;min-width:0" oninput="gfdCondEdit('${connId}','value',this.value)">
    <button onclick="gfdCondRemove('${connId}')" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(224,112,112,.2);background:transparent;color:#e07070;font-size:10px;cursor:pointer;flex-shrink:0">✕</button>
  </div>`;
}

function _gfdActionListHtml(nodeId,phase,actions){
  const ss=`padding:4px 5px;background:#0f0f16;border:1px solid rgba(255,255,255,.08);border-radius:5px;font-size:9px;font-family:Inter,system-ui,sans-serif;outline:none`;
  const rows=(actions||[]).map((a,i)=>{
    const actOpts=GFD_ACTIONS.map(o=>`<option value="${o}"${a.action===o?' selected':''}>${o}</option>`).join('');
    return `<div style="display:flex;gap:3px;align-items:center;margin-top:5px">
      <select style="flex:1;${ss};color:#d0a0e0" onchange="gfdActionEdit('${nodeId}','${phase}',${i},'action',this.value)">${actOpts}</select>
      <input type="text" value="${escH(a.field||'')}" placeholder="field" style="flex:2;${ss};color:#b0c8d0;min-width:0" oninput="gfdActionEdit('${nodeId}','${phase}',${i},'field',this.value)">
      <input type="text" value="${escH(String(a.value??''))}" placeholder="val" style="flex:1;${ss};color:#c9a08a;min-width:0" oninput="gfdActionEdit('${nodeId}','${phase}',${i},'value',this.value)">
      <button onclick="gfdActionRemove('${nodeId}','${phase}',${i})" style="padding:4px 6px;border-radius:5px;border:1px solid rgba(224,112,112,.2);background:transparent;color:#e07070;font-size:10px;cursor:pointer;flex-shrink:0">✕</button>
    </div>`;
  }).join('');
  return `<div style="margin-bottom:10px">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="${_GP.lbl}">${phase==='onEnter'?'▶ On Enter':'■ On Exit'}</div>
      <button onclick="gfdActionAdd('${nodeId}','${phase}')" style="padding:2px 8px;border-radius:100px;border:1px solid rgba(255,255,255,.08);background:transparent;color:${_GP.txM};font-size:9px;cursor:pointer;font-family:${_GP.font}">+ Add</button>
    </div>
    ${rows||`<div style="font-size:9px;color:${_GP.txF};font-family:${_GP.font};padding:3px 0">No actions</div>`}
  </div>`;
}

function gfdRenderProps(){
  const panel=document.getElementById('gfd-props'); if(!panel) return;
  if(GFD.selected){
    const node=GFD.nodes.find(n=>n.id===GFD.selected); if(!node){panel.innerHTML='';return;}
    const t=GFD_TYPES[node.type];
    const inCount=GFD.connections.filter(c=>c.toNode===node.id).length;
    const outCount=GFD.connections.filter(c=>c.fromNode===node.id).length;
    panel.innerHTML=`
      <div style="display:flex;align-items:center;gap:7px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid ${_GP.border}">
        <span style="font-size:15px">${t.icon}</span>
        <div>
          <div style="font-size:8px;color:${t.color};font-family:${_GP.font};font-weight:700;letter-spacing:.1em;text-transform:uppercase">${t.label}</div>
          <div style="font-size:9px;color:${_GP.txF};font-family:${_GP.font};margin-top:1px">${inCount} in · ${outCount} out</div>
        </div>
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">Label</div>
        <input value="${escH(node.label)}" style="${_GP.inp}" oninput="gfdPropEdit('label',this.value)">
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">State ID</div>
        <input value="${escH(node.state?.name||'')}" placeholder="machine_state_id" style="${_GP.inp};color:#8ab8d0;font-size:10px" oninput="gfdPropEditState('name',this.value)">
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">Notes</div>
        <textarea rows="3" style="${_GP.inp};color:${_GP.txM};font-size:10px;resize:vertical;line-height:1.55" oninput="gfdPropEdit('notes',this.value)">${escH(node.notes)}</textarea>
      </div>
      ${_gfdMetaFieldsHtml(node)}
      <div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">
        ${_gfdActionListHtml(node.id,'onEnter',node.onEnter)}
        ${_gfdActionListHtml(node.id,'onExit',node.onExit)}
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">Node Type</div>
        <select style="${_GP.inp};color:${_GP.tx}" onchange="gfdPropEdit('type',this.value)">
          ${Object.entries(GFD_TYPES).map(([k,v])=>`<option value="${k}"${node.type===k?' selected':''}>${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
      <button onclick="gfdDeleteNode('${node.id}')" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(224,112,112,.2);background:transparent;color:#e07070;font-size:10px;font-family:${_GP.font};cursor:pointer;font-weight:600;margin-top:4px;transition:background .12s" onmouseover="this.style.background='rgba(224,112,112,.08)'" onmouseout="this.style.background='transparent'">Delete Node</button>`;
  } else if(GFD.selConn){
    const conn=GFD.connections.find(c=>c.id===GFD.selConn);
    if(!conn){panel.innerHTML='';return;}
    const fn=GFD.nodes.find(n=>n.id===conn.fromNode);
    const tn=GFD.nodes.find(n=>n.id===conn.toNode);
    const hasCond=!!conn.condition;
    panel.innerHTML=`
      <div style="font-size:9px;color:${_GP.gold};font-family:${_GP.font};font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:12px">Connection</div>
      <div style="font-size:10px;color:${_GP.txM};margin-bottom:12px;line-height:1.8;padding:8px 10px;background:${_GP.surf};border-radius:7px;border:1px solid ${_GP.border}">
        <span style="color:${_GP.tx}">${escH(fn?.label||'?')}</span><br>
        <span style="color:${_GP.txF}">↓</span> <span style="color:${_GP.tx}">${escH(tn?.label||'?')}</span>
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">Label</div>
        <input value="${escH(conn.label||'')}" placeholder="e.g. 3+ Scatters" style="${_GP.inp}" oninput="gfdConnLabelEdit(this.value)">
      </div>
      <div style="${_GP.sec}">
        <div style="${_GP.lbl}">Priority <span style="color:${_GP.txF};font-weight:400;text-transform:none;letter-spacing:0">(lower = first)</span></div>
        <input type="number" value="${conn.priority??99}" min="1" max="999" style="${_GP.inp};width:80px;color:${_GP.gold}" oninput="gfdConnPriorityEdit(parseInt(this.value)||99)">
      </div>
      <div style="padding:10px 0;border-top:1px solid ${_GP.border};border-bottom:1px solid ${_GP.border};margin-bottom:12px">
        <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${_GP.gold};font-family:${_GP.font};margin-bottom:10px">Transition Metadata</div>
        <div style="${_GP.sec}">
          <div style="${_GP.lbl}">Trigger Type</div>
          <select style="${_GP.inp};color:${_GP.tx}" onchange="gfdConnEdit('triggerType',this.value)">
            ${[['auto','⚡ Auto (fires immediately)'],['user-action','👆 User Action'],['timer','⏱ Timer / Delay'],['condition','◇ Condition Gate']].map(([v,l])=>`<option value="${v}"${(conn.triggerType||'auto')===v?' selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div style="${_GP.sec}">
          <div style="${_GP.lbl}">Probability % <span style="color:${_GP.txF};font-weight:400;text-transform:none;letter-spacing:0">optional — for RNG branches</span></div>
          <input type="number" min="0" max="100" step="1" value="${conn.probability??''}" placeholder="—" style="${_GP.inp};width:80px;color:#e05858" oninput="gfdConnEdit('probability',this.value===''?null:Math.min(100,Math.max(0,parseFloat(this.value)||0)))">
        </div>
        <div style="${_GP.sec}">
          <div style="${_GP.lbl}">Delay (ms) <span style="color:${_GP.txF};font-weight:400;text-transform:none;letter-spacing:0">pause before transition fires</span></div>
          <input type="number" min="0" step="100" value="${conn.durationMs??''}" placeholder="—" style="${_GP.inp};width:90px;color:#c848a8" oninput="gfdConnEdit('durationMs',this.value===''?null:parseInt(this.value)||0)">
        </div>
      </div>
      <div style="padding:10px 0;border-top:1px solid ${_GP.border};margin-bottom:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div style="${_GP.lbl}">Guard Condition</div>
          ${hasCond?'':`<button onclick="gfdCondAdd('${conn.id}')" style="padding:2px 8px;border-radius:100px;border:1px solid rgba(255,255,255,.08);background:transparent;color:${_GP.txM};font-size:9px;cursor:pointer;font-family:${_GP.font}">+ Add</button>`}
        </div>
        ${hasCond?_gfdCondHtml(conn.condition,conn.id):`<div style="font-size:9px;color:${_GP.txF};font-family:${_GP.font}">Always passes</div>`}
      </div>
      <button onclick="gfdDeleteConn('${conn.id}')" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(224,112,112,.2);background:transparent;color:#e07070;font-size:10px;font-family:${_GP.font};cursor:pointer;font-weight:600;transition:background .12s" onmouseover="this.style.background='rgba(224,112,112,.08)'" onmouseout="this.style.background='transparent'">Delete Connection</button>`;
  } else {
    panel.innerHTML=`<div style="font-size:9px;color:${_GP.txF};text-align:center;margin-top:40px;font-family:${_GP.font};line-height:2;letter-spacing:.04em;text-transform:uppercase">Select a node<br>to edit properties<br><br><span style="font-size:8px;color:#1e1e28">Double-click canvas<br>to add a node</span></div>`;
  }
}

function gfdPropEdit(field,value){
  const node=GFD.nodes.find(n=>n.id===GFD.selected);
  if(!node) return;
  node[field]=value;
  _gfdMarkDirty();
  if(field==='type'){ gfdRender(); gfdSelectNode(node.id); return; }
  const el=document.getElementById('gfdn-'+node.id);
  if(el){
    if(field==='label'){
      const lbl=el.querySelector('[data-gfd-label]');
      if(lbl) lbl.textContent=value;
    }
    if(field==='notes'){
      const nt=el.querySelector('[data-gfd-notes]');
      if(nt){ nt.textContent=value; nt.style.display=value?'block':'none'; }
    }
  }
  gfdUpdateSVG();
}
function gfdConnLabelEdit(val){
  const conn=GFD.connections.find(c=>c.id===GFD.selConn);
  if(conn){conn.label=val;gfdUpdateSVG();_gfdMarkDirty();}
}
function gfdConnPriorityEdit(val){
  const conn=GFD.connections.find(c=>c.id===GFD.selConn);
  if(conn){conn.priority=val;_gfdMarkDirty();}
}
function gfdConnEdit(field,val){
  const conn=GFD.connections.find(c=>c.id===GFD.selConn); if(!conn) return;
  conn[field]=val;
  _gfdMarkDirty();
  gfdUpdateSVG(); // re-render edge badge immediately
}

// ─── Condition helpers ───────────────────────────────────
function gfdCondAdd(connId){
  const conn=GFD.connections.find(c=>c.id===connId); if(!conn) return;
  conn.condition={field:GFD_FIELDS[0].v,op:'>=',value:0};
  gfdRenderProps(); _gfdMarkDirty();
}
function gfdCondRemove(connId){
  const conn=GFD.connections.find(c=>c.id===connId); if(!conn) return;
  conn.condition=null;
  gfdRenderProps(); _gfdMarkDirty();
}
function gfdCondEdit(connId,field,val){
  const conn=GFD.connections.find(c=>c.id===connId); if(!conn||!conn.condition) return;
  if(field==='value'){
    const n=parseFloat(val);
    conn.condition.value=isNaN(n)?val:n;
  } else {
    conn.condition[field]=val;
  }
  _gfdMarkDirty();
}

// ─── Action helpers ──────────────────────────────────────
function gfdActionAdd(nodeId,phase){
  const node=GFD.nodes.find(n=>n.id===nodeId); if(!node) return;
  if(!node[phase]) node[phase]=[];
  node[phase].push({action:'set',field:'',value:0});
  gfdRenderProps(); _gfdMarkDirty();
}
function gfdActionRemove(nodeId,phase,idx){
  const node=GFD.nodes.find(n=>n.id===nodeId); if(!node||!node[phase]) return;
  node[phase].splice(idx,1);
  gfdRenderProps(); _gfdMarkDirty();
}
function gfdActionEdit(nodeId,phase,idx,field,val){
  const node=GFD.nodes.find(n=>n.id===nodeId); if(!node||!node[phase]) return;
  const act=node[phase][idx]; if(!act) return;
  if(field==='value'){ const n=parseFloat(val); act.value=isNaN(n)?val:n; }
  else { act[field]=val; }
  _gfdMarkDirty();
}
function gfdPropEditState(field,val){
  const node=GFD.nodes.find(n=>n.id===GFD.selected); if(!node) return;
  if(!node.state) node.state={};
  node.state[field]=val;
  _gfdMarkDirty();
}

// ─── Palette ─────────────────────────────────────────────
function gfdBuildPalette(){
  const pal=document.getElementById('gfd-palette-nodes'); if(!pal) return;
  pal.innerHTML=Object.entries(GFD_TYPES).map(([type,t])=>`
    <div onclick="gfdAddAtCenter('${type}')" title="Add ${t.label} node" style="padding:7px 10px;border-radius:8px;border:1px solid ${t.color}33;background:${t.bg};cursor:pointer;display:flex;align-items:center;gap:8px;transition:border-color .15s,box-shadow .15s" onmouseover="this.style.borderColor='${t.color}88';this.style.boxShadow='0 0 10px ${t.color}22'" onmouseout="this.style.borderColor='${t.color}33';this.style.boxShadow='none'">
      <span style="font-size:13px;line-height:1">${t.icon}</span>
      <div style="font-size:10px;font-weight:600;color:${t.color};font-family:Inter,system-ui,sans-serif;letter-spacing:.01em">${t.label}</div>
    </div>`).join('');
}

function gfdAddAtCenter(type){
  const wrap=document.getElementById('gfd-canvas-wrap'); if(!wrap) return;
  const W=wrap.clientWidth, H=wrap.clientHeight;
  const x=(W/2-GFD.pan.x)/GFD.scale-GFD_NODE_W/2;
  const y=(H/2-GFD.pan.y)/GFD.scale-GFD_NODE_H/2;
  const t=GFD_TYPES[type];
  const id=gfdAddNode(type,t.label.toUpperCase(),Math.round(x),Math.round(y));
  gfdRender(); gfdSelectNode(id);
}

// ─── Pan / Zoom ───────────────────────────────────────────
function gfdFit(){
  if(!GFD.nodes.length) return;
  const wrap=document.getElementById('gfd-canvas-wrap'); if(!wrap) return;
  const W=wrap.clientWidth-80, H=wrap.clientHeight-80;
  const minX=Math.min(...GFD.nodes.map(n=>n.x));
  const maxX=Math.max(...GFD.nodes.map(n=>n.x+GFD_NODE_W));
  const minY=Math.min(...GFD.nodes.map(n=>n.y));
  const maxY=Math.max(...GFD.nodes.map(n=>n.y+GFD_NODE_H));
  GFD.scale=Math.min(W/(maxX-minX||1),H/(maxY-minY||1),1.6);
  GFD.pan.x=40-minX*GFD.scale;
  GFD.pan.y=40-minY*GFD.scale;
  _gfdApplyTransform(); gfdUpdateSVG();
}

function gfdAutoLayout(){
  if(!GFD.nodes.length) return;
  // Step 1: DFS to detect back-edges (cycle edges) so we can build a DAG
  const visited=new Set(), inStack=new Set(), backEdgeIds=new Set();
  function _dfs(id){
    if(inStack.has(id)) return;
    if(visited.has(id)) return;
    visited.add(id); inStack.add(id);
    GFD.connections.forEach(c=>{
      if(c.fromNode!==id||c.fromNode===c.toNode) return;
      if(inStack.has(c.toNode)) backEdgeIds.add(c.id);
      else _dfs(c.toNode);
    });
    inStack.delete(id);
  }
  GFD.nodes.forEach(n=>{ if(!visited.has(n.id)) _dfs(n.id); });
  // Forward edges only (no self-loops, no back-edges)
  const fwd=GFD.connections.filter(c=>!backEdgeIds.has(c.id)&&c.fromNode!==c.toNode);
  // Step 2: Kahn topological sort on forward edges
  const inDeg={};
  GFD.nodes.forEach(n=>inDeg[n.id]=0);
  fwd.forEach(c=>inDeg[c.toNode]=(inDeg[c.toNode]||0)+1);
  const queue=GFD.nodes.filter(n=>!inDeg[n.id]).map(n=>n.id);
  if(!queue.length) queue.push(GFD.nodes[0].id);
  const topoOrder=[];
  const seen=new Set(queue);
  while(queue.length){
    const cur=queue.shift(); topoOrder.push(cur);
    fwd.filter(c=>c.fromNode===cur).forEach(c=>{
      inDeg[c.toNode]--;
      if(inDeg[c.toNode]<=0&&!seen.has(c.toNode)){ seen.add(c.toNode); queue.push(c.toNode); }
    });
  }
  // any remaining unvisited nodes (disconnected)
  GFD.nodes.forEach(n=>{ if(!seen.has(n.id)) topoOrder.push(n.id); });
  // Step 3: Assign layer = longest path from any source
  const layer={};
  GFD.nodes.forEach(n=>layer[n.id]=0);
  topoOrder.forEach(id=>{
    fwd.filter(c=>c.fromNode===id).forEach(c=>{
      layer[c.toNode]=Math.max(layer[c.toNode], layer[id]+1);
    });
  });
  // Step 4: Group by layer, sort within layer by connectivity
  const layers={};
  GFD.nodes.forEach(n=>{ const r=layer[n.id]; if(!layers[r]) layers[r]=[]; layers[r].push(n.id); });
  // Sort within each layer: nodes with more connections to the previous layer come first (center)
  const layerKeys=Object.keys(layers).map(Number).sort((a,b)=>a-b);
  // Step 5: Top-down centered layout
  const PADY=60, PADX=70;
  const ROW_H=GFD_NODE_H+PADY;
  const COL_W=GFD_NODE_W+PADX;
  const maxRowNodes=Math.max(...layerKeys.map(k=>layers[k].length));
  const totalW=maxRowNodes*COL_W;
  layerKeys.forEach(r=>{
    const ids=layers[r];
    const rowW=ids.length*COL_W;
    const startX=Math.round((totalW-rowW)/2)+40;
    ids.forEach((id,i)=>{
      const node=GFD.nodes.find(n=>n.id===id);
      if(node){ node.x=startX+i*COL_W; node.y=r*ROW_H+40; }
    });
  });
  gfdRender(); setTimeout(gfdFit,40); _gfdMarkDirty();
}

function gfdClear(){
  if(!confirm('Clear all nodes and connections from this flow?')) return;
  const af=_gfdActiveFlow();
  if(af){ af.nodes=[]; af.connections=[]; }
  GFD.nodes=[]; GFD.connections=[]; GFD.selected=null; GFD.selConn=null;
  gfdRender(); gfdRenderProps(); _gfdMarkDirty();
}

// ─── Open ─────────────────────────────────────────────────
function _gfdDrawGrid(){
  const svg=document.getElementById('gfd-grid-svg'); if(!svg) return;
  const W=svg.clientWidth||1200, H=svg.clientHeight||800;
  const DOT=1.2, STEP=24;
  let dots='';
  for(let x=0;x<W;x+=STEP) for(let y=0;y<H;y+=STEP)
    dots+=`<circle cx="${x}" cy="${y}" r="${DOT}" fill="rgba(255,255,255,.04)"/>`;
  svg.innerHTML=dots;
}

function openGameFlowDesigner(){
  const modal=document.getElementById('gfd-modal'); if(!modal) return;
  const d=collectProjectData();
  document.getElementById('gfd-game-title').textContent=d.name?`· ${d.name}`:'';
  modal.style.display='flex';
  if(!GFD._eventsInit){ _gfdInitEvents(); GFD._eventsInit=true; }
  // Ensure multi-flow structure exists (migrates legacy single-canvas data)
  _gfdEnsureFlows();
  gfdRenderFlowTabs();
  // Auto-populate active flow if empty
  if(!GFD.nodes.length){ _gfdAutoPopulate(d); }
  gfdRender();
  setTimeout(()=>{ _gfdDrawGrid(); gfdFit(); },80);
}

function _gfdInitEvents(){
  const wrap=document.getElementById('gfd-canvas-wrap'); if(!wrap) return;
  // Wheel zoom
  wrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=wrap.getBoundingClientRect();
    const mx=e.clientX-rect.left, my=e.clientY-rect.top;
    const factor=e.deltaY<0?1.1:0.91;
    const ns=Math.max(0.15,Math.min(3,GFD.scale*factor));
    GFD.pan.x=mx-(mx-GFD.pan.x)*(ns/GFD.scale);
    GFD.pan.y=my-(my-GFD.pan.y)*(ns/GFD.scale);
    GFD.scale=ns; _gfdApplyTransform(); gfdUpdateSVG();
  },{passive:false});
  // Pan start
  wrap.addEventListener('mousedown',e=>{
    const isCanvas=e.target===wrap||e.target===document.getElementById('gfd-canvas')||e.target===document.getElementById('gfd-svg');
    if(isCanvas||e.button===1||e.altKey){
      if(isCanvas){GFD.selected=null;GFD.selConn=null;gfdRenderProps();gfdUpdateSVG();}
      GFD.panning=true; GFD.panStart={x:e.clientX-GFD.pan.x,y:e.clientY-GFD.pan.y};
      wrap.style.cursor='grabbing';
    }
  });
  document.addEventListener('mousemove',e=>{
    if(GFD.panning&&GFD.panStart&&document.getElementById('gfd-modal')?.style.display!=='none'){
      GFD.pan.x=e.clientX-GFD.panStart.x; GFD.pan.y=e.clientY-GFD.panStart.y;
      _gfdApplyTransform(); gfdUpdateSVG();
    }
    if(GFD.dragging&&document.getElementById('gfd-modal')?.style.display!=='none'){
      const node=GFD.nodes.find(n=>n.id===GFD.dragging.nodeId);
      const rect=wrap.getBoundingClientRect();
      if(node){
        node.x=Math.round((e.clientX-rect.left-GFD.pan.x)/GFD.scale-GFD.dragging.ox);
        node.y=Math.round((e.clientY-rect.top-GFD.pan.y)/GFD.scale-GFD.dragging.oy);
        const el=document.getElementById('gfdn-'+node.id);
        if(el){el.style.left=node.x+'px';el.style.top=node.y+'px';}
        gfdUpdateSVG();
      }
    }
  });
  document.addEventListener('mouseup',()=>{
    if(GFD.dragging) _gfdMarkDirty(); // node was moved — persist new position
    GFD.panning=false; GFD.panStart=null; GFD.dragging=null;
    if(wrap) wrap.style.cursor='grab';
  });
  // Double-click canvas → add screen node
  document.getElementById('gfd-canvas')?.addEventListener('dblclick',e=>{
    if(e.target.classList.contains('gfd-node')||e.target.closest('.gfd-node')) return;
    const rect=wrap.getBoundingClientRect();
    const x=Math.round((e.clientX-rect.left-GFD.pan.x)/GFD.scale-GFD_NODE_W/2);
    const y=Math.round((e.clientY-rect.top-GFD.pan.y)/GFD.scale-GFD_NODE_H/2);
    const id=gfdAddNode('screen','NEW SCREEN',x,y);
    gfdRender(); gfdSelectNode(id);
  });
  // Delete key
  document.addEventListener('keydown',e=>{
    if(document.getElementById('gfd-modal')?.style.display==='none') return;
    if(e.key==='Delete'||e.key==='Backspace'){
      if(['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if(GFD.selected) gfdDeleteNode(GFD.selected);
      else if(GFD.selConn) gfdDeleteConn(GFD.selConn);
    }
    if((e.key==='f'||e.key==='F')&&!e.ctrlKey&&!e.metaKey){ if(document.activeElement?.tagName!=='INPUT') gfdFit(); }
  });
}

// ─── Flow Evaluator Engine ───────────────────────────────
function gfdGetField(state,path){
  return path.split('.').reduce((o,k)=>o&&o[k]!==undefined?o[k]:undefined,state);
}
function gfdSetField(state,path,value){
  const keys=path.split('.');
  let o=state;
  for(let i=0;i<keys.length-1;i++){
    if(o[keys[i]]===undefined) o[keys[i]]={};
    o=o[keys[i]];
  }
  o[keys[keys.length-1]]=value;
}
function gfdEvalCondition(cond,state){
  if(!cond) return true;
  if(cond.and) return cond.and.every(c=>gfdEvalCondition(c,state));
  if(cond.or)  return cond.or.some(c=>gfdEvalCondition(c,state));
  if(cond.not) return !gfdEvalCondition(cond.not,state);
  const lhs=gfdGetField(state,cond.field);
  const rhs=cond.value;
  switch(cond.op){
    case '>=': return lhs>=rhs;
    case '<=': return lhs<=rhs;
    case '>':  return lhs>rhs;
    case '<':  return lhs<rhs;
    case '==': return lhs==rhs; // intentional loose
    case '!=': return lhs!=rhs;
    default:   return false;
  }
}
function gfdExecAction(action,state){
  const {field,value}=action;
  switch(action.action){
    case 'set':   gfdSetField(state,field,value); break;
    case 'add':   gfdSetField(state,field,(gfdGetField(state,field)||0)+Number(value)); break;
    case 'sub':   gfdSetField(state,field,(gfdGetField(state,field)||0)-Number(value)); break;
    case 'mul':   gfdSetField(state,field,(gfdGetField(state,field)||0)*Number(value)); break;
    case 'reset': gfdSetField(state,field,0); break;
    case 'emit':  GFD_SIM.log.push(`⚡ emit: ${field}`); break;
  }
}
function gfdExecActions(actions,state){
  (actions||[]).forEach(a=>gfdExecAction(a,state));
}

// ─── Simulation State ────────────────────────────────────
const GFD_SIM={
  active:false,
  currentNodeId:null,
  state:{},
  log:[],
  step:0
};

function _gfdInitState(){
  return {
    scatter:0, wildCount:0, coinCount:0, winAmount:0, totalWin:0, multiplier:1,
    spin:{count:0,symbols:[],winLines:[]},
    features:{
      freeSpin:{active:false,count:0,maxCount:0,retriggered:false},
      respin:{active:false,count:0,coins:[]}
    },
    jackpot:{triggered:false,tier:''},
    buyConfirmed:false, bonusCount:0, wheelTrigger:false, sessionActive:true
  };
}

function gfdSimToggle(){
  if(GFD_SIM.active) gfdSimStop(); else gfdSimStart();
}

function gfdSimStart(){
  if(!GFD.nodes.length){ alert('No nodes on canvas. Auto-fill from Project first.'); return; }
  // Find START or first system node or first node
  const startNode=GFD.nodes.find(n=>n.label.toUpperCase().includes('START')&&n.type==='system')
                  ||GFD.nodes.find(n=>n.type==='system')
                  ||GFD.nodes[0];
  GFD_SIM.active=true;
  GFD_SIM.currentNodeId=startNode.id;
  GFD_SIM.state=_gfdInitState();
  GFD_SIM.log=[`▶ Simulation started at: ${startNode.label}`];
  GFD_SIM.step=0;
  const btn=document.getElementById('gfd-sim-btn');
  if(btn){ btn.textContent='⏹ Stop'; btn.style.color='#ff7070'; btn.style.borderColor='#8a3a3a'; btn.style.background='#2e1a1a'; }
  _gfdShowSimPanel();
  gfdRender();
}

function gfdSimStop(){
  GFD_SIM.active=false;
  GFD_SIM.currentNodeId=null;
  const btn=document.getElementById('gfd-sim-btn');
  if(btn){ btn.textContent='▶ Simulate'; btn.style.color='#6edd8a'; btn.style.borderColor='#5a8a5a88'; btn.style.background='#1a2e1a'; }
  _gfdHideSimPanel();
  gfdRender();
}

function gfdSimStep(){
  if(!GFD_SIM.active||!GFD_SIM.currentNodeId) return;
  const node=GFD.nodes.find(n=>n.id===GFD_SIM.currentNodeId);
  if(!node){ GFD_SIM.log.push('⚠ Current node not found'); _gfdRenderSimPanel(); return; }
  GFD_SIM.step++;
  GFD_SIM.log.push(`── Step ${GFD_SIM.step}: executing "${node.label}" onExit`);
  gfdExecActions(node.onExit,GFD_SIM.state);
  // Find next connection by priority (ascending)
  const outConns=[...GFD.connections.filter(c=>c.fromNode===node.id)]
    .sort((a,b)=>(a.priority??99)-(b.priority??99));
  let nextConn=null;
  for(const c of outConns){
    const passes=gfdEvalCondition(c.condition,GFD_SIM.state);
    GFD_SIM.log.push(`  → "${c.label||'(no label)'}" [priority ${c.priority??99}]: ${passes?'✅ PASS':'❌ fail'}`);
    if(passes){ nextConn=c; break; }
  }
  if(nextConn){
    const nextNode=GFD.nodes.find(n=>n.id===nextConn.toNode);
    GFD_SIM.currentNodeId=nextConn.toNode;
    GFD_SIM.log.push(`  ↳ Moving to: "${nextNode?.label||nextConn.toNode}"`);
    GFD_SIM.log.push(`── Entering "${nextNode?.label}" onEnter`);
    gfdExecActions(nextNode?.onEnter,GFD_SIM.state);
  } else {
    GFD_SIM.log.push(`  ⛔ No matching connection. Flow halted.`);
    GFD_SIM.currentNodeId=null;
  }
  _gfdRenderSimPanel();
  gfdRender();
}

function gfdSimSetField(path,val){
  const n=parseFloat(val);
  gfdSetField(GFD_SIM.state,path,isNaN(n)?val:n);
  _gfdRenderSimPanel();
}

function _gfdShowSimPanel(){
  let panel=document.getElementById('gfd-sim-panel');
  if(!panel){
    panel=document.createElement('div');
    panel.id='gfd-sim-panel';
    panel.style.cssText='position:absolute;bottom:0;left:0;right:0;height:220px;background:#0a0a18;border-top:2px solid #2a4a2a;display:flex;z-index:10;font-family:DM Mono,monospace;font-size:9px';
    document.getElementById('gfd-canvas-wrap').style.paddingBottom='220px';
    document.getElementById('gfd-canvas-wrap').parentElement.appendChild(panel);
  }
  _gfdRenderSimPanel();
}

function _gfdHideSimPanel(){
  const panel=document.getElementById('gfd-sim-panel');
  if(panel){ panel.remove(); }
  document.getElementById('gfd-canvas-wrap').style.paddingBottom='0';
}

function _gfdRenderSimPanel(){
  const panel=document.getElementById('gfd-sim-panel'); if(!panel) return;
  const curNode=GFD.nodes.find(n=>n.id===GFD_SIM.currentNodeId);
  const logHtml=[...GFD_SIM.log].reverse().slice(0,50).map(l=>{
    const col=l.startsWith('──')?'#c9a84c':l.startsWith('  →')?'#7070a0':l.includes('✅')?'#5eca8a':l.includes('❌')?'#c07070':l.startsWith('⚡')?'#c070e0':l.startsWith('  ↳')?'#70b0e0':'#5a5a72';
    return `<div style="color:${col};line-height:1.7;white-space:pre-wrap">${escH(l)}</div>`;
  }).join('');
  const stateHtml=_gfdStateToHtml(GFD_SIM.state);
  panel.innerHTML=`
    <div style="flex:1;overflow-y:auto;padding:10px 12px;border-right:1px solid #1a2a1a">
      <div style="color:#3a6a3a;font-size:8px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">▶ Execution Log (newest first)</div>
      ${logHtml}
    </div>
    <div style="width:220px;overflow-y:auto;padding:10px 12px;border-right:1px solid #1a2a1a">
      <div style="color:#3a6a3a;font-size:8px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Game State</div>
      ${stateHtml}
    </div>
    <div style="width:180px;display:flex;flex-direction:column;gap:6px;padding:10px 12px;align-items:stretch">
      <div style="color:#3a6a3a;font-size:8px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px">Current Node</div>
      <div style="color:${curNode?'#c9a84c':'#4a4a62'};font-size:11px;font-weight:700;margin-bottom:6px">${escH(curNode?.label||'(halted)')}</div>
      <button onclick="gfdSimStep()" style="padding:8px;border-radius:7px;border:1px solid #3a6a3a;background:#1a2e1a;color:#5eca8a;font-size:10px;font-family:Space Grotesk,sans-serif;cursor:pointer;font-weight:700"${!GFD_SIM.currentNodeId?' disabled style="opacity:.4"':''}>⏭ Step</button>
      <button onclick="gfdSimStart()" style="padding:6px;border-radius:7px;border:1px solid #3a3a52;background:#1a1a2e;color:#7070c0;font-size:9px;font-family:Space Grotesk,sans-serif;cursor:pointer">↺ Restart</button>
      <button onclick="gfdSimStop()" style="padding:6px;border-radius:7px;border:1px solid #6a3a3a44;background:#2a1a1a;color:#c07070;font-size:9px;font-family:Space Grotesk,sans-serif;cursor:pointer">⏹ Stop</button>
      <div style="margin-top:6px;font-size:8px;color:#3a3a52;line-height:1.7">Click state values<br>to override them</div>
    </div>`;
}

function _gfdStateToHtml(state,prefix='',depth=0){
  if(!state||typeof state!=='object') return '';
  return Object.entries(state).map(([k,v])=>{
    const path=prefix?prefix+'.'+k:k;
    if(typeof v==='object'&&v!==null&&!Array.isArray(v)){
      return `<div style="color:#4a4a72;margin-top:${depth?2:5}px">${escH(k)}:</div>${_gfdStateToHtml(v,path,depth+1)}`;
    }
    const valCol=v===true?'#5eca8a':v===false?'#c07070':typeof v==='number'?'#c9a84c':'#c0c0d0';
    return `<div style="display:flex;gap:4px;align-items:center;padding:1px 0 1px ${depth*8}px">
      <span style="color:#5a5a72;flex-shrink:0">${escH(k)}:</span>
      <input type="text" value="${escH(String(v))}" style="flex:1;background:transparent;border:none;border-bottom:1px solid #2a2a3a;color:${valCol};font-size:9px;font-family:DM Mono,monospace;outline:none;min-width:0;padding:1px 2px" onchange="gfdSimSetField('${path}',this.value)">
    </div>`;
  }).join('');
}

// ─── Export JSON ─────────────────────────────────────────
function gfdExportJSON(){
  const d=collectProjectData();
  const flow={
    meta:{
      game:d.name||'Untitled',
      studio:d.studio||'',
      version:d.version||'1.0',
      exportedAt:new Date().toISOString(),
      schemaVersion:'1.0.0'
    },
    initialState:_gfdInitState(),
    nodes:GFD.nodes.map(n=>({
      id:n.id,
      type:n.type,
      label:n.label,
      state:{name:n.state?.name||n.id,context:n.state?.context||''},
      notes:n.notes||'',
      onEnter:n.onEnter||[],
      onExit:n.onExit||[]
    })),
    connections:GFD.connections.map(c=>({
      id:c.id,
      fromNode:c.fromNode,
      toNode:c.toNode,
      label:c.label||'',
      condition:c.condition||null,
      priority:c.priority??99
    })).sort((a,b)=>a.priority-b.priority)
  };
  const blob=new Blob([JSON.stringify(flow,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=(d.name||'game-flow').replace(/\s+/g,'-').toLowerCase()+'-flow.json';
  a.click(); URL.revokeObjectURL(url);
}

// Boot
function init(){
  buildFeatures();initRV();
  // Feature config panels are hidden by default (shown only when feature toggled on)
  initSettingsTabs();
  P.symbols = buildDefaultSymbols(4,6,2);
  renderSymbolTable();
  initExpandingWild();
  initEWActiveScreens();

  // ── Preload placeholder assets ──
  // Skip keys that render their own content (reelArea builds symbol cells,
  // reelFrame is a transparent border overlay, bg has its own SVG renderer).
  const SKIP_PH = new Set(['reelArea','reelFrame','bg']);
  Object.entries(PLACEHOLDER_ASSETS).forEach(([k,v])=>{
    if(k.startsWith('sym_')){
      // Symbol placeholders: match by index to the symbol set built above
      const idx = parseInt(k.replace('sym_',''));
      const sym = P.symbols[idx];
      if(sym) EL_ASSETS['sym_'+sym.id] = v;
    } else if(!SKIP_PH.has(k)){
      EL_ASSETS[k] = v;
    }
  });

  initHistory();
  rebuildTabs();
  switchScreen('base'); // start on base game so placeholders are immediately visible
  // Ensure workspace topbars start in the correct hidden/visible state immediately
  // (before any switchWorkspace call, so #topbar-features etc. are not shown)
  updateWorkspaceUI();
  // Ensure proj-fs overlay is dismissed — it may have been left open from a prior session
  document.getElementById('proj-fs')?.classList.remove('show');
}
init();

// ════════════════════════════════════════════════════════
// MULTI-SELECT
// ════════════════════════════════════════════════════════
const MULTI_SEL = new Set(); // set of layer keys

function multiToggle(k){
  if(MULTI_SEL.has(k)) MULTI_SEL.delete(k);
  else MULTI_SEL.add(k);
  renderMultiSel();
}
function renderMultiSel(){
  document.querySelectorAll('.cel.multi-sel').forEach(e=>e.classList.remove('multi-sel'));
  MULTI_SEL.forEach(k=>{const el=document.getElementById('el-'+k);if(el)el.classList.add('multi-sel');});
}
function clearMultiSel(){MULTI_SEL.clear();renderMultiSel();}

// Shift+click on elements adds to multi-select
// Override element click — injected after buildCanvas via delegation on #gf
document.getElementById('gf').addEventListener('click', e=>{
  if(!e.shiftKey) return; // handled by element's own click
  const cel=e.target.closest('.cel[data-key]');
  if(cel){e.stopPropagation();multiToggle(cel.dataset.key);}
},{capture:true});

// ⌘A select all visible layers
document.addEventListener('keydown',e=>{
  if(e.key==='a'&&(e.metaKey||e.ctrlKey)){
    e.preventDefault();
    const keys=SDEFS[P.screen]?.keys||[];
    keys.forEach(k=>MULTI_SEL.add(k));
    renderMultiSel();
  }
  if(e.key==='l'&&(e.metaKey||e.ctrlKey)&&SEL_KEY){
    e.preventDefault();
    toggleLayerLock(SEL_KEY);
  }
  if(e.key==='?'&&!e.target.matches('input,textarea,select')){
    document.getElementById('kbd-modal').classList.add('show');
  }
  if(e.key==='c'&&!e.metaKey&&!e.ctrlKey&&!e.target.matches('input,textarea,select')){
    openSplitView();
  }
});

// ════════════════════════════════════════════════════════
// LAYER LOCKING (per-layer user locks, beyond PSD.locked)
// ════════════════════════════════════════════════════════
function toggleLayerLock(k){
  if(USER_LOCKS.has(k)) USER_LOCKS.delete(k);
  else USER_LOCKS.add(k);
  renderLayers();
  buildCanvas();
}
function isLocked(k){ return PSD[k]?.locked || USER_LOCKS.has(k); }

// ════════════════════════════════════════════════════════
// SNAP TO ELEMENTS while dragging
// ════════════════════════════════════════════════════════
const SNAP_THRESH = 8; // px in canvas space

function computeSnap(k, x, y, w, h){
  const keys=SDEFS[P.screen]?.keys||[];
  let snapX=null, snapY=null, minDX=SNAP_THRESH+1, minDY=SNAP_THRESH+1;
  const edges={x:[x, x+w, x+Math.round(w/2)], y:[y, y+h, y+Math.round(h/2)]};

  keys.forEach(other=>{
    if(other===k) return;
    const op=getPos(other);
    const oEdgesX=[op.x, op.x+op.w, op.x+Math.round(op.w/2)];
    const oEdgesY=[op.y, op.y+op.h, op.y+Math.round(op.h/2)];
    edges.x.forEach(ex=>{oEdgesX.forEach(ox=>{const d=Math.abs(ex-ox);if(d<minDX){minDX=d;snapX=ox-(ex-x);}});});
    edges.y.forEach(ey=>{oEdgesY.forEach(oy=>{const d=Math.abs(ey-oy);if(d<minDY){minDY=d;snapY=oy-(ey-y);}});});
  });
  return {
    x: minDX<=SNAP_THRESH ? snapX : x,
    y: minDY<=SNAP_THRESH ? snapY : y,
    snappedX: minDX<=SNAP_THRESH,
    snappedY: minDY<=SNAP_THRESH
  };
}

function showSnapGuides(sx, sy, pos){
  clearSnapGuides();
  const gf=document.getElementById('gf'); if(!gf) return;
  if(sx){const g=document.createElement('div');g.className='snap-guide v';g.style.left=(sx-EL_COMPUTED[P.viewport==='desktop'?'landscape':P.viewport]?.[0]?.x||0)+'px';g.style.left=sx+'px';g.id='sg-v';gf.appendChild(g);}
  if(sy){const g=document.createElement('div');g.className='snap-guide h';g.style.top=sy+'px';g.id='sg-h';gf.appendChild(g);}
}
function clearSnapGuides(){
  document.getElementById('sg-v')?.remove();
  document.getElementById('sg-h')?.remove();
}

// ════════════════════════════════════════════════════════
// ASSET CHECKLIST
// ════════════════════════════════════════════════════════
function buildChecklist(){
  const list=document.getElementById('cl-list'); if(!list) return;
  list.innerHTML='';
  const screens=Object.entries(SDEFS).filter(([k])=>!k.startsWith('_')&&k!=='win');
  let total=0,done=0;
  screens.forEach(([scr,def])=>{
    if(!def.keys||def.keys.length===0) return;
    const hdr=document.createElement('div');hdr.className='cl-screen';hdr.textContent=(def.label||scr).toUpperCase();list.appendChild(hdr);
    def.keys.forEach(k=>{
      const pdef=PSD[k]; if(!pdef||pdef.locked) return;
      if(k==='bg'||k==='msgLabel'||k==='reelFrame') return; // non-art layers
      total++;
      const has=!!EL_ASSETS[k]||(k==='reelArea'&&Object.keys(EL_ASSETS).some(ak=>ak.startsWith('sym_')));
      if(has) done++;
      const row=document.createElement('div');
      row.className='cl-item '+(has?'done':'todo');
      row.innerHTML=`<span class="cl-ico">${has?'✓':'○'}</span>${pdef.label||k}`;
      list.appendChild(row);
    });
  });
  document.getElementById('cl-count').textContent=done+' / '+total;
  const pct=total?Math.round(done/total*100):0;
  document.getElementById('cl-bar').style.width=pct+'%';
}
function togglePanel(id){
  const p=document.getElementById(id);if(!p)return;
  const showing=p.classList.toggle('show');
  if(showing&&id==='checklist-panel') buildChecklist();
  if(showing&&id==='versions-panel') renderVersions();
  if(showing&&id==='sym-library') buildSymLibrary();
}
document.getElementById('m-checklist')?.addEventListener('click',()=>togglePanel('checklist-panel'));
document.getElementById('m-versions')?.addEventListener('click',()=>togglePanel('versions-panel'));
document.getElementById('m-sym-lib')?.addEventListener('click',()=>togglePanel('sym-library'));
document.getElementById('m-kbd')?.addEventListener('click',()=>document.getElementById('kbd-modal').classList.add('show'));
document.getElementById('m-split-view')?.addEventListener('click',()=>openSplitView());

// ════════════════════════════════════════════════════════
// VERSION HISTORY
// ════════════════════════════════════════════════════════
const VERSIONS=[]; // [{name, ts, state}]
function saveVersion(){
  const name=document.getElementById('ver-name-inp')?.value.trim()||('Version '+( VERSIONS.length+1));
  const state=JSON.stringify({
    gameName:P.gameName, theme:P.theme, colors:P.colors, reelset:P.reelset,
    jackpots:P.jackpots, features:P.features, elVP:JSON.parse(JSON.stringify(EL_VP)),
    symbols:P.symbols, expandWild:P.expandWild, assets:JSON.parse(JSON.stringify(EL_ASSETS)),
    library:JSON.parse(JSON.stringify(P.library))
  });
  VERSIONS.unshift({name, ts:new Date().toISOString(), state});
  if(document.getElementById('ver-name-inp')) document.getElementById('ver-name-inp').value='';
  renderVersions();
  markDirty();
}
function renderVersions(){
  const list=document.getElementById('ver-list'); if(!list) return;
  list.innerHTML='';
  if(VERSIONS.length===0){
    list.innerHTML='<div style="padding:20px 14px;font-size:10px;color:#7a7a9a;text-align:center">No saved versions yet.<br>Name and save a version above.</div>';
    return;
  }
  VERSIONS.forEach((v,i)=>{
    const row=document.createElement('div');
    row.className='ver-item'+(i===0?' active':'');
    const d=new Date(v.ts);
    row.innerHTML=`<div class="ver-name">${v.name}</div><div class="ver-time">${d.toLocaleDateString()} ${d.toLocaleTimeString()}</div><div class="ver-restore">↩ Click to restore</div>`;
    row.addEventListener('click',()=>{
      if(confirm('Restore "'+v.name+'"? Current state will be lost unless saved.')) restoreVersion(v);
    });
    list.appendChild(row);
  });
}
function restoreVersion(v){
  try{
    const s=JSON.parse(v.state);
    P.gameName=s.gameName;P.theme=s.theme;P.colors=s.colors;P.reelset=s.reelset;
    P.jackpots=s.jackpots;P.features=s.features;P.symbols=s.symbols||[];
    if(s.expandWild) Object.assign(P.expandWild,s.expandWild);
    Object.assign(EL_VP.portrait,s.elVP?.portrait||{});
    Object.assign(EL_VP.landscape,s.elVP?.landscape||{});
    if(s.assets) Object.assign(EL_ASSETS,s.assets);
    // Sync UI fields
    const gn=document.getElementById('game-name');if(gn)gn.value=P.gameName||'';
    const ph=document.getElementById('ph-chip');if(ph)ph.textContent=P.gameName||'';
    const ts=document.getElementById('theme-sel');if(ts)ts.value=P.theme||'western';
    const rs=document.getElementById('reel-sel');if(rs)rs.value=P.reelset||'5x3';
    if(typeof renderReelViz==='function')renderReelViz();
    rebuildTabs();buildCanvas();renderLayers();renderVersions();
    alert('Version "'+v.name+'" restored.');
  } catch(err){alert('Could not restore: '+err.message);}
}

// ════════════════════════════════════════════════════════
// SYMBOL LIBRARY PANEL
// ════════════════════════════════════════════════════════
function buildSymLibrary(){
  const grid=document.getElementById('sym-lib-grid'); if(!grid) return;
  grid.innerHTML='';
  if(P.symbols.length===0){
    grid.innerHTML='<div style="grid-column:span 2;padding:20px;font-size:10px;color:#7a7a9a;text-align:center">No symbols defined.<br>Go to Project Settings → Symbol Set to add symbols.</div>';
    return;
  }
  P.symbols.forEach(sym=>{
    const key='sym_'+sym.id;
    const cell=document.createElement('div');cell.className='sym-lib-cell'+(EL_ASSETS[key]?' has-asset':'');
    const typeCol={high:'#ef7a7a',low:'#7a8aef',special:'#c9a84c'}[sym.type]||'#c9a84c';
    if(EL_ASSETS[key]){
      const img=document.createElement('img');img.src=EL_ASSETS[key];img.style.cssText='width:85%;height:85%;object-fit:contain';cell.appendChild(img);
    } else {
      cell.innerHTML=`<div style="font-size:22px;color:${typeCol}55">◆</div>`;
    }
    const lbl=document.createElement('div');lbl.className='sym-lib-label';lbl.textContent=sym.name;cell.appendChild(lbl);
    // Upload on click
    cell.addEventListener('click',()=>{
      const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
      inp.onchange=()=>{const f=inp.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{EL_ASSETS[key]=ev.target.result;cell.classList.add('has-asset');cell.innerHTML='';const img=document.createElement('img');img.src=ev.target.result;img.style.cssText='width:85%;height:85%;object-fit:contain';cell.appendChild(img);const l=document.createElement('div');l.className='sym-lib-label';l.textContent=sym.name;cell.appendChild(l);buildCanvas();renderLayers();};r.readAsDataURL(f);};inp.click();
    });
    grid.appendChild(cell);
  });
}

// ════════════════════════════════════════════════════════
// SPLIT VIEW
// ════════════════════════════════════════════════════════
function openSplitView(){
  document.getElementById('split-view').classList.add('show');
  // Render after layout is computed (80ms) and again after fonts/images settle (300ms)
  setTimeout(renderSplitView,80);
  setTimeout(renderSplitView,300);
}
// Re-render split view on window resize if it is open
window.addEventListener('resize',()=>{
  if(document.getElementById('split-view')?.classList.contains('show')){
    clearTimeout(window._splitResizeT);
    window._splitResizeT=setTimeout(renderSplitView,120);
  }
});
function renderSplitView(){
  const savedVP=P.viewport;
  ['portrait','landscape'].forEach(vp=>{
    const mode=vp==='portrait'?'p':'l';
    const host=document.getElementById('split-host-'+mode); if(!host) return;
    const wrap=document.getElementById('split-wrap-'+mode); if(!wrap) return;
    const vpDef=VP[vp];
    // Scale to fit the pane – no arbitrary cap
    const wrapW=Math.max(wrap.clientWidth||600,100);
    const wrapH=Math.max(wrap.clientHeight||400,100);
    const scale=Math.min((wrapW-16)/vpDef.cw,(wrapH-16)/vpDef.ch);
    const scaledW=Math.round(vpDef.cw*scale);
    const scaledH=Math.round(vpDef.ch*scale);
    // Switch to this VP so computeLayout/getPos return the right positions
    P.viewport=vp; computeLayout();
    const keys=SDEFS[P.screen]?.keys||[];
    const sorted=[...keys].sort((a,b)=>((PSD[a]?.z||5)-(PSD[b]?.z||5)));
    const c1=P.colors.t1?P.colors.c1:'#888';
    const c3=P.colors.t3?P.colors.c3:'#888';
    // ── Full 2000×2000 canvas, translated by -cx,-cy to align viewport to (0,0) ──
    const canvas=document.createElement('div');
    canvas.style.cssText=`position:absolute;left:${-vpDef.cx}px;top:${-vpDef.cy}px;width:2000px;height:2000px;background:#12121e`;
    sorted.forEach(k=>{
      const def=PSD[k]; if(!def) return;
      if(k==='char'&&!P.char.enabled) return;
      if(k==='bannerBuy'&&!P.features.buy_feature) return;
      if(k==='bannerAnte'&&!P.ante.enabled) return;
      if(k.startsWith('jp')&&k!=='jpRow'){
        const jk=k.slice(2).toLowerCase();const jp=P.jackpots[jk];
        if(!jp||!jp.on||jp.exclude.includes(P.screen)) return;
      }
      if(HIDDEN_LAYERS.has(k)) return;
      const pos=getPos(k);
      const el=document.createElement('div');
      el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${def.z||5};border-radius:8px;overflow:hidden`;
      if(k==='bg'){
        el.style.borderRadius='0';
        const bgKey=EL_ASSETS['bg_'+P.screen]?'bg_'+P.screen:(EL_ASSETS['bg']?'bg':null);
        if(bgKey){const img=document.createElement('img');img.src=EL_ASSETS[bgKey];img.style.cssText='width:100%;height:100%;object-fit:cover';el.appendChild(img);}
        else{el.appendChild(makeThemeBG(pos.w,pos.h));}
      }else if(k==='reelArea'){
        el.style.cssText+=';background:transparent';
        const[cols,rows]=parseReel(P.reelset);
        const vp2=P.viewport==='desktop'?'landscape':P.viewport;
        const CELL=EL_COMPUTED._cellSize?.[vp2]||164;
        const GAP=8;
        const gridW=cols*CELL+(cols-1)*GAP;const gridH=rows*CELL+(rows-1)*GAP;
        const offX=Math.round((pos.w-gridW)/2);const offY=Math.round((pos.h-gridH)/2);
        for(let rr=0;rr<rows;rr++){for(let cc=0;cc<cols;cc++){
          const cell=document.createElement('div');
          cell.style.cssText=`position:absolute;left:${offX+cc*(CELL+GAP)}px;top:${offY+rr*(CELL+GAP)}px;width:${CELL}px;height:${CELL}px;background:#1a1a2e;border:1px solid #ffffff11;border-radius:6px`;
          el.appendChild(cell);
        }}
      }else if(k==='reelFrame'){
        el.style.background='transparent';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.border=`3px solid ${c1}44`;}
      }else if(k==='jpRow'){
        // jpRow is a transparent group-anchor in the mirror canvas — skip visual rendering
        const anyJpOn=['grand','major','minor','mini'].some(jk=>P.jackpots[jk]?.on&&!P.jackpots[jk]?.exclude?.includes(P.screen));
        if(!anyJpOn) return;
        el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${(PSD.jpGrand?.z||5)-1};background:transparent`;
      }else if(k.startsWith('jp')&&k!=='jpRow'){
        // Each JP sentinel is self-contained: renders placeholder or uploaded asset
        const jk=k.slice(2).toLowerCase();
        const jp=P.jackpots[jk];
        const jcols={mini:'#4ac8f0',minor:'#5eca8a',major:'#c9a84c',grand:'#ef7a7a'};
        const jc=jcols[jk]||c1;
        el.style.cssText=`position:absolute;left:${pos.x}px;top:${pos.y}px;width:${pos.w}px;height:${pos.h}px;z-index:${def.z||5};overflow:hidden;border-radius:6px;border:1px solid rgba(255,255,255,0.06)`;
        if(EL_ASSETS[k]){
          const img=document.createElement('img');img.src=EL_ASSETS[k];
          img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';
          el.appendChild(img);
        } else {
          el.style.background=`linear-gradient(135deg,${jc}22,${jc}08)`;
          el.style.borderLeft=`2px solid ${jc}44`;
          const nameSz=Math.max(Math.round(pos.h*0.28),9);const valSz=Math.max(Math.round(pos.h*0.35),11);
          const ov=document.createElement('div');ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px';
          const lbl=(document.getElementById('jp-lbl-'+jk)?.value||jk).toUpperCase();
          const nl=document.createElement('div');nl.style.cssText=`font-size:${nameSz}px;color:${jc};font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif;text-transform:uppercase;white-space:nowrap`;nl.textContent=lbl;
          const vl=document.createElement('div');vl.style.cssText=`font-size:${valSz}px;color:#fff;font-weight:800;font-family:Space Grotesk,sans-serif;white-space:nowrap`;vl.textContent=jp?.val||'–';
          ov.appendChild(nl);ov.appendChild(vl);el.appendChild(ov);
        }
      }else if(k==='logo'){
        el.style.borderRadius='14px';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background=`${c1}18`;el.style.border=`1px solid ${c1}44`;el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:${Math.max(Math.round(pos.h*0.35),10)}px;color:${c1};font-weight:700;letter-spacing:.06em;font-family:Space Grotesk,sans-serif;text-align:center">${escH(P.gameName.toUpperCase())}</div>`;}
      }else if(k==='char'){
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background='#ffffff06';el.style.border='1px dashed #ffffff11';}
      }else if(k==='settings'){
        el.style.borderRadius='50%';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background='#ffffff11';el.style.border=`1px solid ${c1}33`;}
      }else if(k==='bannerBet'){
        el.style.borderRadius='10px';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background='#ffffff0a';el.style.border='1px solid #ffffff11';}
        const bsz=Math.max(Math.round(pos.h*0.3),12);const bsz2=Math.max(Math.round(pos.h*0.22),10);
        const ov=document.createElement('div');ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px';
        ov.innerHTML=`<div style="font-size:${bsz}px;color:#fff;font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif">BET</div><div style="font-size:${bsz2}px;color:#c9a84c;font-weight:600;font-family:Space Grotesk,sans-serif">€ 5.00</div>`;
        el.appendChild(ov);
      }else if(k==='bannerBuy'){
        el.style.borderRadius='10px';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background=`${c1}18`;el.style.border=`1px solid ${c1}33`;}
        const bsz=Math.max(Math.round(pos.h*0.28),11);
        const ov=document.createElement('div');ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px';
        ov.innerHTML=`<div style="font-size:${bsz}px;color:#fff;font-weight:700;letter-spacing:.08em;font-family:Space Grotesk,sans-serif;text-align:center;line-height:1.25">BUY<br>BONUS</div>`;
        el.appendChild(ov);
      }else if(k==='bannerAnte'){
        el.style.borderRadius='10px';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background='#ffffff08';el.style.border='1px solid #ffffff11';}
        const asz=Math.max(Math.round(pos.h*0.28),10);
        const ov=document.createElement('div');ov.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px';
        ov.innerHTML=`<div style="font-size:${asz}px;color:#fff;font-weight:700;letter-spacing:.06em;font-family:Space Grotesk,sans-serif;text-transform:uppercase">${escH(P.ante.label||'Ante Bet')}</div>`;
        el.appendChild(ov);
      }else if(k==='spinBtn'){
        el.style.borderRadius='50%';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background=`linear-gradient(135deg,${c1},${c3})`;el.innerHTML=`<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:${Math.max(Math.round(pos.h*0.4),20)}px;color:#1a1200">▶</div>`;}
      }else if(k==='autoBtn'||k==='turboBtn'){
        el.style.borderRadius='50%';
        if(EL_ASSETS[k]){const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);}
        else{el.style.background='#ffffff14';el.style.border='1px solid #ffffff22';}
      }else if(k==='msgLabel'){
        el.style.display='flex';el.style.alignItems='center';el.style.justifyContent='center';
        el.style.textAlign='center';el.style.color='#ffffff44';
        el.style.fontSize=Math.max(Math.round(pos.h*0.5),13)+'px';
        el.style.letterSpacing='.08em';
        el.textContent=document.getElementById('msg-txt')?.value||'18+ · Play Responsibly';
      }else if(EL_ASSETS[k]){
        const img=document.createElement('img');img.src=EL_ASSETS[k];img.style.cssText='width:100%;height:100%;object-fit:contain';el.appendChild(img);
      }else{
        el.style.background='#ffffff06';el.style.border='1px solid #ffffff0a';
      }
      // Mirror adjustments (brightness/contrast/opacity)
      if(!(k.startsWith('jp')&&k!=='jpRow')){
        const _adj=getAdj(k);
        el.style.filter=`brightness(${1+_adj.brightness/100}) contrast(${1+_adj.contrast/100}) saturate(${1+_adj.saturation/100})`;
        el.style.opacity=(_adj.opacity/100).toFixed(2);
      }
      canvas.appendChild(el);
    });
    // Balance bar at viewport bottom boundary (global coords, inside 2000×2000 canvas)
    const barH=60,barM=0;
    const balEl=document.createElement('div');
    balEl.style.cssText=`position:absolute;left:${vpDef.cx}px;top:${vpDef.cy+vpDef.ch-barH-barM}px;width:${vpDef.cw}px;height:${barH}px;display:flex;align-items:center;justify-content:space-evenly;background:#09090bee;border-top:1px solid #252535;z-index:50;pointer-events:none`;
    balEl.innerHTML=`<div style="text-align:center"><div style="font-size:11px;color:#8080a8;font-family:Space Grotesk,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Balance</div><div style="font-size:24px;color:#e8e6e1;font-weight:700;font-family:DM Mono,monospace">€ 1,000.00</div></div><div style="text-align:center"><div style="font-size:11px;color:#8080a8;font-family:Space Grotesk,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Bet</div><div style="font-size:24px;color:#c9a84c;font-weight:700;font-family:DM Mono,monospace">€ 0.20</div></div><div style="text-align:center"><div style="font-size:11px;color:#8080a8;font-family:Space Grotesk,sans-serif;letter-spacing:.1em;text-transform:uppercase;font-weight:600">Win</div><div style="font-size:24px;color:#5eca8a;font-weight:700;font-family:DM Mono,monospace">€ 0.00</div></div>`;
    canvas.appendChild(balEl);
    // ── CropWin: clips 2000×2000 canvas to viewport size, then scales it ──
    // transform-origin:top left → (0,0) of cropWin maps to (0,0) of host
    const cropWin=document.createElement('div');
    cropWin.style.cssText=`position:absolute;left:0;top:0;width:${vpDef.cw}px;height:${vpDef.ch}px;overflow:hidden;transform:scale(${scale.toFixed(5)});transform-origin:top left`;
    cropWin.appendChild(canvas);
    // ── Host: occupies scaled dimensions in flow so flex-parent centers correctly ──
    host.innerHTML='';
    host.style.cssText=`width:${scaledW}px;height:${scaledH}px;position:relative;overflow:hidden;border-radius:8px;border:1px solid #2a2a3a;box-shadow:0 4px 32px rgba(0,0,0,.7);flex-shrink:0`;
    host.appendChild(cropWin);
    // Mark active viewport button
    const editBtn=document.getElementById('split-edit-'+mode);
    if(editBtn) editBtn.classList.toggle('active-vp',savedVP===vp);
  });
  P.viewport=savedVP; computeLayout();
}
function splitSwitchVP(vp){
  document.getElementById('split-view').classList.remove('show');
  // Switch main editor to this viewport
  const vpBtns=document.querySelectorAll('[data-vp]');
  vpBtns.forEach(b=>b.classList.toggle('on',b.dataset.vp===vp));
  P.viewport=vp; computeLayout(); buildCanvas(); renderLayers();
  document.getElementById('vp-current')&&(document.getElementById('vp-current').textContent=VP[vp]?.label||vp);
}

// ════════════════════════════════════════════════════════
// WIRE NEW MENU ITEMS
// ════════════════════════════════════════════════════════
// Close panel when clicking outside
document.addEventListener('mousedown',e=>{
  ['checklist-panel','versions-panel','sym-library'].forEach(id=>{
    const p=document.getElementById(id);
    if(p&&p.classList.contains('show')&&!p.contains(e.target)){
      const triggers=['m-checklist','m-versions','m-sym-lib','tool-checklist','tool-history'];
      if(!triggers.some(t=>document.getElementById(t)?.contains(e.target))) p.classList.remove('show');
    }
  });
});
// kbd modal close on background click
document.getElementById('kbd-modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('kbd-modal'))document.getElementById('kbd-modal').classList.remove('show');});


// ═══ FEATURE SCREEN OVERLAYS ═══
// Each overlay is a div appended to #gf (2000×2000 canvas)
// Positioned using the portrait/landscape crop viewport
function buildFeatureOverlay(screenKey, def){
  const ov = document.createElement('div');
  ov.id = 'feature-screen-overlay';
  ov.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:90';

  const vp = P.viewport==='desktop'?'landscape':P.viewport;
  const vpDef = VP[vp];
  // Crop region for content placement
  const cx=vpDef.cx, cy=vpDef.cy, cw=vpDef.cw, ch=vpDef.ch;

  const c1 = P.colors.t1?P.colors.c1:'#c9a84c';
  const type = def.overlay;

  if(type==='pick'){
    _ovPickGame(ov, cx, cy, cw, ch, c1);
  } else if(type==='wheel'){
    _ovWheel(ov, cx, cy, cw, ch, c1);
  } else if(type==='ladder'){
    _ovLadder(ov, cx, cy, cw, ch, c1);
  } else if(type==='sticky'){
    _ovStickyWild(ov, cx, cy, cw, ch, c1);
  } else if(type==='walking'){
    _ovWalkingWild(ov, cx, cy, cw, ch, c1);
  } else if(type==='cascade'){
    _ovCascade(ov, cx, cy, cw, ch, c1);
  } else if(type==='winmult'){
    _ovWinMultiplier(ov, cx, cy, cw, ch, c1);
  } else if(type==='infinity'){
    _ovInfinityReels(ov, cx, cy, cw, ch, c1);
  } else if(type==='cluster'){
    _ovClusterPays(ov, cx, cy, cw, ch, c1);
  } else if(type==='gamble'){
    _ovSuperGamble(ov, cx, cy, cw, ch, c1);
  }

  // Screen label badge
  const badge = document.createElement('div');
  badge.style.cssText=`position:absolute;top:${cy+18}px;left:${cx+20}px;background:#00000088;border:1px solid ${c1}66;border-radius:6px;padding:6px 16px;font-size:18px;font-weight:600;color:${c1};font-family:Space Grotesk,sans-serif;letter-spacing:.06em;text-transform:uppercase`;
  badge.textContent = def.label;
  ov.appendChild(badge);
  return ov;
}

function _el(tag, css){const d=document.createElement(tag);d.style.cssText=css;return d;}

// ─── Asset-driven layer helpers ───
// Every slot in a feature overlay is either an uploaded image (lookup by key
// in EL_ASSETS) or a clear dashed placeholder labelled with the slot key.
// The placeholder doubles as the "this slot needs an asset" affordance —
// when the user sees the dashed box, they know exactly what to upload.
function _imgSlot(key, x, y, w, h, fit){
  const d = document.createElement('div');
  d.dataset.assetKey = key;
  d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;pointer-events:none`;
  const img = document.createElement('img');
  img.src = EL_ASSETS[key];
  img.style.cssText = `width:100%;height:100%;object-fit:${fit||'contain'};pointer-events:none`;
  d.appendChild(img);
  return d;
}
function _phSlot(key, x, y, w, h, label, c1){
  const d = document.createElement('div');
  d.dataset.assetKey = key;
  d.dataset.placeholder = '1';
  const fz = Math.max(10, Math.min(w, h) * 0.18);
  d.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#0a0a1a99;border:2px dashed ${c1}55;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-family:Space Grotesk,sans-serif;color:${c1}cc;text-align:center;padding:8px;box-sizing:border-box;pointer-events:none`;
  const big = document.createElement('div');
  big.style.cssText = `font-size:${fz}px;font-weight:700;letter-spacing:.04em`;
  big.textContent = label;
  d.appendChild(big);
  const tag = document.createElement('div');
  tag.style.cssText = `font-size:${Math.max(8, fz*0.42)}px;font-weight:500;color:${c1}77;font-family:DM Mono,monospace;opacity:.85`;
  tag.textContent = key;
  d.appendChild(tag);
  return d;
}
// Shorthand: render an uploaded asset if present, otherwise a placeholder.
function _slot(key, x, y, w, h, label, c1, fit){
  return EL_ASSETS[key]
    ? _imgSlot(key, x, y, w, h, fit)
    : _phSlot(key, x, y, w, h, label, c1);
}

// ─── PICK GAME (asset-driven, v1 registry: bonuspick.*) ───
// Composition matches docs/features-v1-catalogue.md §3:
//   bg → header → grid of tile_closed (with prize icon overlays) → footer.
// Each region is its own asset slot keyed `bonuspick.<slot>`. Empty slots
// render as labelled dashed boxes so the user can see what to upload next.
function _ovPickGame(ov, cx, cy, cw, ch, c1){
  const picks = parseInt(document.getElementById('pick-picks-inp')?.value) || 3;
  const cols = 4, rows = 3, totalTiles = cols * rows;

  // 1. Background — full viewport region (cover-fit)
  ov.appendChild(_slot('bonuspick.bg', cx, cy, cw, ch, 'BG', c1, 'cover'));

  // 2. Header band, top-center
  const headerH = Math.round(ch * 0.075);
  const headerW = Math.round(cw * 0.72);
  const headerX = cx + Math.round((cw - headerW) / 2);
  const headerY = cy + Math.round(ch * 0.06);
  ov.appendChild(_slot('bonuspick.header', headerX, headerY, headerW, headerH, 'CHOOSE YOUR PRIZE', c1));

  // 3. Tile grid
  const gridY     = cy + Math.round(ch * 0.18);
  const gridH     = Math.round(ch * 0.62);
  const gridW     = Math.round(cw * 0.82);
  const gridX     = cx + Math.round((cw - gridW) / 2);
  const tileGap   = 14;
  const tileW     = Math.round((gridW - (cols - 1) * tileGap) / cols);
  const tileH     = Math.round((gridH - (rows - 1) * tileGap) / rows);
  const prizeKeys = ['bonuspick.prize_coin', 'bonuspick.prize_multiplier', 'bonuspick.prize_freespin', 'bonuspick.prize_jackpot'];

  for (let i = 0; i < totalTiles; i++) {
    const r  = Math.floor(i / cols), c = i % cols;
    const tx = gridX + c * (tileW + tileGap);
    const ty = gridY + r * (tileH + tileGap);

    // Tile background (closed state) — same asset for every tile in the grid
    ov.appendChild(_slot('bonuspick.tile_closed', tx, ty, tileW, tileH, '?', c1));

    // Mini prize icon centered on the tile, cycling through prize types
    const prizeKey = prizeKeys[i % prizeKeys.length];
    const pw = Math.round(tileW * 0.55);
    const ph = Math.round(tileH * 0.55);
    const px = tx + Math.round((tileW - pw) / 2);
    const py = ty + Math.round((tileH - ph) / 2);
    if (EL_ASSETS[prizeKey]) {
      ov.appendChild(_imgSlot(prizeKey, px, py, pw, ph));
    }
  }

  // 4. Footer band, bottom-center
  const footerH = Math.round(ch * 0.06);
  const footerW = Math.round(cw * 0.65);
  const footerX = cx + Math.round((cw - footerW) / 2);
  const footerY = cy + Math.round(ch * 0.86);
  ov.appendChild(_slot('bonuspick.footer', footerX, footerY, footerW, footerH, `Pick ${picks} of ${totalTiles}`, c1));
}

// ─── WHEEL BONUS ───
function _ovWheel(ov, cx, cy, cw, ch, c1){
  const R = Math.round(Math.min(cw,ch)*0.32);
  const wx = cx+Math.round(cw*0.5), wy = cy+Math.round(ch*0.48);
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.style.cssText=`position:absolute;left:${wx-R-10}px;top:${wy-R-10}px;width:${(R+10)*2}px;height:${(R+10)*2}px;pointer-events:none`;
  svg.setAttribute('viewBox',`0 0 ${(R+10)*2} ${(R+10)*2}`);
  const segments=8;
  const segColors=['#ef7a7a','#f0a84c','#e8c96d','#5eca8a','#4ac8f0','#7a8aef','#c9a84c','#ef7a7a'];
  const prizes=['2×','BONUS','5×','FREE','10×','WILD','3×','JACKPOT'];
  const cx2=R+10, cy2=R+10;
  for(let i=0;i<segments;i++){
    const a1=(i/segments)*Math.PI*2-Math.PI/2;
    const a2=((i+1)/segments)*Math.PI*2-Math.PI/2;
    const path=document.createElementNS(ns,'path');
    const x1=cx2+R*Math.cos(a1), y1=cy2+R*Math.sin(a1);
    const x2=cx2+R*Math.cos(a2), y2=cy2+R*Math.sin(a2);
    path.setAttribute('d',`M${cx2},${cy2} L${x1},${y1} A${R},${R} 0 0,1 ${x2},${y2}Z`);
    path.setAttribute('fill',segColors[i]+'cc');
    path.setAttribute('stroke','#000000aa'); path.setAttribute('stroke-width','2');
    svg.appendChild(path);
    // Label
    const midA=(a1+a2)/2, lr=R*0.65;
    const tx=cx2+lr*Math.cos(midA), ty=cy2+lr*Math.sin(midA);
    const txt=document.createElementNS(ns,'text');
    txt.setAttribute('x',tx); txt.setAttribute('y',ty);
    txt.setAttribute('text-anchor','middle'); txt.setAttribute('dominant-baseline','middle');
    txt.setAttribute('font-size',Math.round(R*0.13)); txt.setAttribute('font-weight','700');
    txt.setAttribute('fill','#fff'); txt.setAttribute('font-family','Space Grotesk,sans-serif');
    txt.textContent=prizes[i];
    svg.appendChild(txt);
  }
  // Centre hub
  const hub=document.createElementNS(ns,'circle');
  hub.setAttribute('cx',cx2); hub.setAttribute('cy',cy2); hub.setAttribute('r',Math.round(R*0.12));
  hub.setAttribute('fill','#0a0a14'); hub.setAttribute('stroke',c1); hub.setAttribute('stroke-width','3');
  svg.appendChild(hub);
  // Pointer
  const ptr=document.createElementNS(ns,'polygon');
  const pw=Math.round(R*0.08);
  ptr.setAttribute('points',`${cx2-pw},${cy2-R-8} ${cx2+pw},${cy2-R-8} ${cx2},${cy2-R+pw}`);
  ptr.setAttribute('fill',c1);
  svg.appendChild(ptr);
  ov.appendChild(svg);

  // Spin button
  const spinBtn = _el('div',`position:absolute;left:${wx-70}px;top:${wy+R+20}px;width:140px;height:50px;background:linear-gradient(135deg,${c1},#e8c96d);border-radius:25px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#1a1200;font-family:Space Grotesk,sans-serif;cursor:pointer`);
  spinBtn.textContent='SPIN!';
  ov.appendChild(spinBtn);
}

// ─── LADDER / TRAIL ───
function _ovLadder(ov, cx, cy, cw, ch, c1){
  const steps=8, stepH=Math.round(ch*0.08), stepW=Math.round(cw*0.55);
  const lx=cx+Math.round((cw-stepW)/2), ly=cy+Math.round(ch*0.08);
  for(let i=0;i<steps;i++){
    const y=ly+i*stepH;
    const isActive=(i===2);
    const step=_el('div',`position:absolute;left:${lx}px;top:${y}px;width:${stepW}px;height:${stepH-6}px;background:${isActive?c1+'33':'#ffffff08'};border:2px solid ${isActive?c1:'#333'};border-radius:10px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;box-sizing:border-box`);
    const prize=_el('div',`font-size:${Math.round(stepH*0.35)}px;font-weight:700;color:${isActive?c1:'#888'};font-family:Space Grotesk,sans-serif`);
    const prizes=['€0.50','€1.00','€2.50','€5.00','€10','€25','€100','🏆 JACKPOT'];
    prize.textContent=prizes[steps-1-i];
    const arrow=_el('div',`font-size:${Math.round(stepH*0.4)}px;color:${isActive?c1:'#444'}`);
    arrow.textContent=i===0?'🏆':isActive?'▶':'·';
    step.appendChild(arrow); step.appendChild(prize);
    if(isActive){const marker=_el('div',`position:absolute;right:-36px;top:50%;transform:translateY(-50%);font-size:24px`);marker.textContent='⬅';step.appendChild(marker);}
    ov.appendChild(step);
  }
  const info=_el('div',`position:absolute;left:${cx+20}px;bottom:${2000-cy-ch+20}px;font-size:20px;color:#888;font-family:Space Grotesk,sans-serif`);
  info.textContent='▶ Climb the ladder — collect or gamble each step';
  ov.appendChild(info);
}

// ─── STICKY WILD ───
function _ovStickyWild(ov, cx, cy, cw, ch, c1){
  // Show locked wild indicators on specific reel cells
  const reelPos=EL_COMPUTED[P.viewport==='desktop'?'landscape':'portrait'];
  if(!reelPos?.reelArea) return;
  const ra=reelPos.reelArea;
  const [cols,rows]=parseReel(P.reelset);
  const CELL=EL_COMPUTED._cellSize?.[P.viewport==='desktop'?'landscape':'portrait']||120;
  const GAP=8;
  // Lock 2 random cells
  [[0,1],[1,0],[2,2]].slice(0,2).forEach(([col,row])=>{
    const x=ra.x+col*(CELL+GAP)+(CELL-60)/2;
    const y=ra.y+row*(CELL+GAP)+(CELL-60)/2;
    const lock=_el('div',`position:absolute;left:${x}px;top:${y}px;width:60px;height:60px;background:${c1}33;border:3px solid ${c1};border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:28px`);
    lock.textContent='📌';
    const badge=_el('div',`position:absolute;bottom:-10px;left:50%;transform:translateX(-50%);background:${c1};color:#1a1200;font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;white-space:nowrap;font-family:Space Grotesk,sans-serif`);
    badge.textContent='STICKY';
    lock.appendChild(badge);
    ov.appendChild(lock);
  });
  const counter=_el('div',`position:absolute;left:${cx+Math.round(cw/2)-60}px;top:${cy+ch-120}px;background:#0a0a14ee;border:2px solid ${c1};border-radius:12px;padding:10px 24px;font-size:22px;font-weight:700;color:${c1};font-family:Space Grotesk,sans-serif;text-align:center`);
  counter.innerHTML='STICKY WILDS<br><span style="font-size:36px">2</span>';
  ov.appendChild(counter);
}

// ─── WALKING WILD ───
function _ovWalkingWild(ov, cx, cy, cw, ch, c1){
  const reelPos=EL_COMPUTED[P.viewport==='desktop'?'landscape':'portrait'];
  if(!reelPos?.reelArea) return;
  const ra=reelPos.reelArea;
  const [cols,rows]=parseReel(P.reelset);
  const CELL=EL_COMPUTED._cellSize?.[P.viewport==='desktop'?'landscape':'portrait']||120;
  const GAP=8;
  // Show wild on reel 3 with arrows showing movement direction
  const col=2, row=1;
  const x=ra.x+col*(CELL+GAP), y=ra.y+row*(CELL+GAP);
  const wildCell=_el('div',`position:absolute;left:${x}px;top:${y}px;width:${CELL}px;height:${CELL}px;background:${c1}44;border:3px solid ${c1};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:${Math.round(CELL*0.28)}px;font-weight:700;color:${c1};font-family:Space Grotesk,sans-serif`);
  wildCell.textContent='W';
  ov.appendChild(wildCell);
  // Arrow showing next position
  const arrowX=ra.x+(col-1)*(CELL+GAP)+CELL/2;
  const arrowY=y+CELL/2;
  for(let i=col-1;i>=0;i--){
    const arrow=_el('div',`position:absolute;left:${ra.x+i*(CELL+GAP)+CELL/2-12}px;top:${arrowY-12}px;font-size:28px;color:${c1}88`);
    arrow.textContent='←';
    ov.appendChild(arrow);
  }
  const info=_el('div',`position:absolute;left:${cx+20}px;top:${cy+ch-90}px;font-size:18px;color:#888;font-family:Space Grotesk,sans-serif`);
  info.textContent='← Wild moves one reel left each spin';
  ov.appendChild(info);
}

// ─── CASCADE ───
function _ovCascade(ov, cx, cy, cw, ch, c1){
  const reelPos=EL_COMPUTED[P.viewport==='desktop'?'landscape':'portrait'];
  if(!reelPos?.reelArea) return;
  const ra=reelPos.reelArea;
  const [cols,rows]=parseReel(P.reelset);
  const CELL=EL_COMPUTED._cellSize?.[P.viewport==='desktop'?'landscape':'portrait']||120;
  const GAP=8;
  const multColor='#60e0a0';
  // Highlight a winning row (row 1) and show cascade arrows
  for(let col=0;col<3;col++){
    const x=ra.x+col*(CELL+GAP), y=ra.y+1*(CELL+GAP);
    const highlight=_el('div',`position:absolute;left:${x}px;top:${y}px;width:${CELL}px;height:${CELL}px;background:${multColor}33;border:3px solid ${multColor};border-radius:12px;pointer-events:none`);
    const blast=_el('div',`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:24px`);blast.textContent='💥';
    highlight.appendChild(blast); ov.appendChild(highlight);
    // Falling arrows above
    for(let r=0;r<1;r++){
      const ax=ra.x+col*(CELL+GAP)+CELL/2-12, ay=ra.y+r*(CELL+GAP)-30;
      const arrow=_el('div',`position:absolute;left:${ax}px;top:${ay}px;font-size:24px;color:${c1}88`);
      arrow.textContent='⬇'; ov.appendChild(arrow);
    }
  }
  // Multiplier counter
  const mult=_el('div',`position:absolute;left:${cx+Math.round(cw/2)-50}px;top:${cy+20}px;background:#0a0a14ee;border:2px solid ${multColor};border-radius:12px;padding:8px 20px;font-size:20px;font-weight:700;color:${multColor};font-family:Space Grotesk,sans-serif;text-align:center`);
  mult.innerHTML='MULTIPLIER<br><span style="font-size:38px">3×</span>';
  ov.appendChild(mult);
}

// ─── WIN MULTIPLIER ───
function _ovWinMultiplier(ov, cx, cy, cw, ch, c1){
  const steps=[1,2,3,5,8,15,25,50];
  const stepW=Math.round(cw*0.08), stepH=40;
  const totalW=(stepW+8)*steps.length;
  const startX=cx+Math.round((cw-totalW)/2);
  const startY=cy+ch-160;
  steps.forEach((val,i)=>{
    const isActive=(i===4);
    const x=startX+i*(stepW+8);
    const box=_el('div',`position:absolute;left:${x}px;top:${startY}px;width:${stepW}px;height:${stepH}px;background:${isActive?c1+'44':'#ffffff08'};border:2px solid ${isActive?c1:'#333'};border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:${isActive?c1:'#666'};font-family:Space Grotesk,sans-serif`);
    box.textContent=val+'×';
    ov.appendChild(box);
    if(i<steps.length-1){
      const arrow=_el('div',`position:absolute;left:${x+stepW}px;top:${startY+stepH/2-10}px;font-size:14px;color:#444;display:flex;align-items:center`);
      arrow.textContent='→'; ov.appendChild(arrow);
    }
  });
  const label=_el('div',`position:absolute;left:${startX}px;top:${startY-32}px;font-size:14px;color:#9898b8;font-family:Space Grotesk,sans-serif;font-weight:600;letter-spacing:.06em;text-transform:uppercase`);
  label.textContent='Win Multiplier Trail — resets on no win';
  ov.appendChild(label);
}

// ─── INFINITY REELS ───
function _ovInfinityReels(ov, cx, cy, cw, ch, c1){
  const reelPos=EL_COMPUTED[P.viewport==='desktop'?'landscape':'portrait'];
  if(!reelPos?.reelArea) return;
  const ra=reelPos.reelArea;
  const CELL=EL_COMPUTED._cellSize?.[P.viewport==='desktop'?'landscape':'portrait']||120;
  const GAP=8;
  // Show a ghost extra reel appearing on the right
  const ghostX=ra.x+ra.w+GAP;
  const ghostCol=_el('div',`position:absolute;left:${ghostX}px;top:${ra.y}px;width:${CELL}px;height:${ra.h}px;border:2px dashed ${c1}88;border-radius:12px;opacity:0.6;display:flex;align-items:center;justify-content:center`);
  const plus=_el('div',`font-size:${Math.round(CELL*0.35)}px;color:${c1}88`); plus.textContent='+';
  ghostCol.appendChild(plus); ov.appendChild(ghostCol);
  const label=_el('div',`position:absolute;left:${ghostX-20}px;top:${ra.y+ra.h+10}px;font-size:14px;color:${c1}88;font-family:Space Grotesk,sans-serif;white-space:nowrap`);
  label.textContent='New reel added on win →';
  ov.appendChild(label);
}

// ─── CLUSTER PAYS ───
function _ovClusterPays(ov, cx, cy, cw, ch, c1){
  const reelPos=EL_COMPUTED[P.viewport==='desktop'?'landscape':'portrait'];
  if(!reelPos?.reelArea) return;
  const ra=reelPos.reelArea;
  const [cols,rows]=parseReel(P.reelset);
  const CELL=EL_COMPUTED._cellSize?.[P.viewport==='desktop'?'landscape':'portrait']||120;
  const GAP=8;
  const clusterColor='#7a8aef';
  // Highlight a cluster of 6 adjacent cells
  const clusterCells=[[0,0],[1,0],[0,1],[1,1],[2,1],[1,2]];
  clusterCells.forEach(([col,row])=>{
    if(col>=cols||row>=rows) return;
    const x=ra.x+col*(CELL+GAP), y=ra.y+row*(CELL+GAP);
    const hl=_el('div',`position:absolute;left:${x}px;top:${y}px;width:${CELL}px;height:${CELL}px;background:${clusterColor}33;border:3px solid ${clusterColor};border-radius:12px`);
    ov.appendChild(hl);
  });
  const info=_el('div',`position:absolute;left:${cx+20}px;top:${cy+ch-80}px;font-size:18px;color:#888;font-family:Space Grotesk,sans-serif`);
  info.textContent=`Cluster of ${clusterCells.length} · No paylines needed`;
  ov.appendChild(info);
}

// ════════════════════════════════════════════════════════
// WELCOME MODAL + FIRST-RUN OVERLAY
// ════════════════════════════════════════════════════════
// ── Helper: get element or null quietly ──
function _gel(id){return document.getElementById(id);}

function _initFirstRun(){
  const WELCOME_KEY='sf_welcomed_v1';
  const OVERLAY_KEY='sf_overlay_v1';

  // ── Viewport radio highlight ──
  function _vpHighlight(){
    document.querySelectorAll('[id^="wf-vp-"][id$="-wrap"]').forEach(w=>{
      const r=w.querySelector('input[type=radio]');
      if(w.style)w.style.borderColor=r&&r.checked?'#c9a84c44':'#2a2a3a';
    });
  }
  document.querySelectorAll('input[name="wf-vp"]').forEach(r=>r.addEventListener('change',_vpHighlight));
  _vpHighlight();

  // ── Apply welcome form values and close modal ──
  function applyWelcome(){
    const nameEl=_gel('wf-name'), themeEl=_gel('wf-theme'), reelEl=_gel('wf-reel');
    const name=(nameEl&&nameEl.value.trim())||'';
    const theme=(themeEl&&themeEl.value)||'western';
    const reel=(reelEl&&reelEl.value)||'5x3';
    const vp=document.querySelector('input[name="wf-vp"]:checked')?.value||'portrait';

    P.gameName=name; P.theme=theme; P.reelset=reel; P.viewport=vp;

    const gn=_gel('game-name'); if(gn)gn.value=name;
    const ph=_gel('ph-chip');   if(ph)ph.textContent=name;
    const ts=_gel('theme-sel'); if(ts)ts.value=theme;
    const rs=_gel('reel-sel');  if(rs)rs.value=reel;
    if(typeof renderReelViz==='function') renderReelViz();
    const sbr=_gel('sb-reel'); if(sbr)sbr.textContent=reel.replace('x','×').replace(/[ch]/g,'');

    localStorage.setItem(WELCOME_KEY,'1');
    const wm=_gel('welcome-modal'); if(wm)wm.classList.remove('show');
    refresh(); markDirty();
    if(!localStorage.getItem(OVERLAY_KEY)){const fo=_gel('firstrun-overlay');if(fo)fo.classList.add('show');}
  }

  const cta=_gel('welcome-cta'); if(cta)cta.addEventListener('click',applyWelcome);
  const wn=_gel('wf-name');      if(wn)wn.addEventListener('keydown',e=>{if(e.key==='Enter')applyWelcome();});

  // ── Show welcome on first load ──
  if(!localStorage.getItem(WELCOME_KEY)){
    const wm=_gel('welcome-modal'); if(wm)wm.classList.add('show');
    setTimeout(()=>{const wn2=_gel('wf-name');if(wn2)wn2.focus();},80);
  } else if(!localStorage.getItem(OVERLAY_KEY)){
    localStorage.setItem(OVERLAY_KEY,'1');
  }

  // ── First-run overlay dismiss ──
  function dismissOverlay(){
    localStorage.setItem(OVERLAY_KEY,'1');
    const fo=_gel('firstrun-overlay'); if(fo)fo.classList.remove('show');
  }
  const fd=_gel('firstrun-dismiss'); if(fd)fd.addEventListener('click',dismissOverlay);
  const gf=_gel('gf');               if(gf)gf.addEventListener('mousedown',dismissOverlay,{once:true});
  const alb=_gel('add-layer-btn');   if(alb)alb.addEventListener('click',dismissOverlay,{once:true});
  const tsb=_gel('topbar-settings-btn'); if(tsb)tsb.addEventListener('click',dismissOverlay,{once:true});
}

// Run after full DOM is parsed (welcome modal HTML sits below the closing script tag)
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',_initFirstRun);
}else{
  _initFirstRun();
}

// ─── SUPER GAMBLE ───
function _ovSuperGamble(ov, cx, cy, cw, ch, c1){
  const steps=parseInt(document.getElementById('gamble-steps')?.value)||5;
  const stepH=Math.round(ch*0.09), panelW=Math.round(cw*0.7);
  const px=cx+Math.round((cw-panelW)/2), py=cy+Math.round(ch*0.08);
  const panel=_el('div',`position:absolute;left:${px}px;top:${py}px;width:${panelW}px;background:#0a0a1aee;border:2px solid ${c1}66;border-radius:20px;padding:30px;display:flex;flex-direction:column;gap:10px`);
  const title=_el('div',`font-size:${Math.round(panelW*0.045)}px;font-weight:700;color:${c1};font-family:Space Grotesk,sans-serif;text-align:center;margin-bottom:8px;letter-spacing:.06em`);
  title.textContent='SUPER GAMBLE';
  panel.appendChild(title);
  for(let i=steps-1;i>=0;i--){
    const isActive=(i===2), isPast=(i<2);
    const row=_el('div',`display:flex;align-items:center;gap:12px;height:${stepH-8}px;background:${isActive?c1+'22':isPast?'#5eca8a11':'#ffffff06'};border:2px solid ${isActive?c1:isPast?'#5eca8a44':'#2a2a3a'};border-radius:10px;padding:0 20px`);
    const stepNum=_el('div',`font-size:14px;color:#8080a8;width:24px;font-family:DM Mono,monospace`); stepNum.textContent=`${i+1}`;
    const prize=_el('div',`flex:1;font-size:${Math.round(stepH*0.3)}px;font-weight:700;color:${isActive?c1:isPast?'#5eca8a':'#666'};font-family:Space Grotesk,sans-serif`);
    const multipliers=[1,2,3,5,8,12,20,50,100];
    prize.textContent=`${multipliers[Math.min(i,multipliers.length-1)]}× stake`;
    const action=isActive?_el('div',`font-size:14px;color:${c1};font-family:Space Grotesk,sans-serif`):null;
    if(action){action.textContent='◀ YOU ARE HERE';}
    row.appendChild(stepNum); row.appendChild(prize); if(action)row.appendChild(action);
    panel.appendChild(row);
  }
  const btns=_el('div',`display:flex;gap:14px;margin-top:10px`);
  const collect=_el('div',`flex:1;height:52px;background:#5eca8a33;border:2px solid #5eca8a;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#5eca8a;font-family:Space Grotesk,sans-serif;cursor:pointer`);collect.textContent='COLLECT';
  const gamble=_el('div',`flex:1;height:52px;background:${c1}22;border:2px solid ${c1};border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:${c1};font-family:Space Grotesk,sans-serif;cursor:pointer`);gamble.textContent='GAMBLE UP';
  btns.appendChild(collect); btns.appendChild(gamble);
  panel.appendChild(btns);
  ov.appendChild(panel);
}

// ═══════════════════════════════════════════════════════
// WORKSPACE SYSTEM
// ═══════════════════════════════════════════════════════

function closeAllMenus(){
  document.querySelectorAll('.dropdown').forEach(d => {
    d.classList.remove('show');
    d.previousElementSibling?.classList?.remove('open');
  });
}

var activeWorkspace = 'canvas'; // var (not let) — must be hoisted so switchScreen can access it before this line executes

// ─── Collect Theme-panel meta for AI prompt enrichment ────────────────────────
// Reads the live DOM values of all Theme/Art Direction fields in Project Settings
// and returns them as a ProjectMeta-compatible object to be forwarded to AssetsWorkspace.
function collectMeta(){
  const g = id => document.getElementById(id)?.value?.trim() || '';
  // Build a symbols summary for AssetsWorkspace to render dynamic tiles
  const highSymbols    = (P.symbols||[]).filter(s=>s.type==='high');
  const lowSymbols     = (P.symbols||[]).filter(s=>s.type==='low');
  const specialSymbols = (P.symbols||[]).filter(s=>s.type==='special');
  return {
    gameName:        g('game-name')       || P.gameName || '',
    themeKey:        g('theme-sel')       || P.theme    || '',
    setting:         g('game-setting'),
    story:           g('game-story'),
    mood:            g('game-mood'),
    bonusNarrative:  g('game-bonus-narrative'),
    artStyle:        g('game-art-style'),
    artRef:          g('game-art-ref'),
    artNotes:        g('game-art-notes'),
    colorPrimary:    P.colors?.c1 || '',
    colorBg:         P.colors?.c2 || '',
    colorAccent:     P.colors?.c3 || '',
    // Symbol configuration — drives the asset tile grid in AssetsWorkspace
    symbolHighCount:    highSymbols.length,
    symbolLowCount:     lowSymbols.length,
    symbolSpecialCount: specialSymbols.length,
    // Per-symbol names for tile labels (indexed: high_0..N-1, low_0..N-1, special_0..N-1)
    symbolHighNames:    highSymbols.map(s=>s.name),
    symbolLowNames:     lowSymbols.map(s=>s.name),
    symbolSpecialNames: specialSymbols.map(s=>s.name),
  };
}

function switchWorkspace(ws){
  if(ws === activeWorkspace) return;
  // Hide the project settings fullscreen overlay whenever leaving/entering any workspace
  document.getElementById('proj-fs')?.classList.remove('show');
  activeWorkspace = ws;
  updateWorkspaceUI();
  if(ws === 'flow')    _activateFlowWorkspace();
  if(ws === 'features') buildFeaturesEditor();
  // Notify parent frame — include rich meta when switching to assets so the
  // React AssetsWorkspace can pre-populate theme inputs and enrich AI prompts.
  try {
    const msg = { type: 'SF_WORKSPACE_CHANGED', workspace: ws };
    if(ws === 'assets') msg.meta = collectMeta();
    window.parent.postMessage(msg, '*');
  } catch(e) {}
}

function updateWorkspaceUI(){
  // Update ws-tab active states
  document.querySelectorAll('.ws-tab').forEach(btn => {
    btn.classList.toggle('ws-active', btn.dataset.ws === activeWorkspace);
  });
  // Show/hide non-canvas workspace panels (project handled separately via #proj-fs)
  ['flow','marketing','features','assets'].forEach(ws => {
    const el = document.getElementById('ws-' + ws);
    if(el) el.classList.toggle('ws-visible', activeWorkspace === ws);
  });
  // Project workspace: surface the full #proj-fs settings panel instead of #ws-project
  if(activeWorkspace === 'project'){
    const menuH = document.getElementById('menubar')?.offsetHeight || 0;
    const tabH  = document.getElementById('topbar')?.offsetHeight  || 0;
    const pfs   = document.getElementById('proj-fs');
    if(pfs){ pfs.style.top = (menuH+tabH)+'px'; pfs.classList.add('show'); }
  }
  // Show/hide canvas workspace panels
  const isCanvas = activeWorkspace === 'canvas';
  const tp = document.getElementById('tools-panel');
  const cw = document.getElementById('canvas-wrap');
  const rp = document.getElementById('right-panel');
  if(tp) tp.style.display = isCanvas ? '' : 'none';
  if(cw) cw.style.display = isCanvas ? '' : 'none';
  if(rp) rp.style.display = isCanvas ? '' : 'none';
  // Contextual topbar sections
  ['canvas','flow','project','marketing','features','assets'].forEach(ws => {
    const tb = document.getElementById('topbar-' + ws);
    if(tb) tb.style.display = (activeWorkspace === ws) ? 'flex' : 'none';
  });
  // Viewport picker only relevant in Canvas
  const vpItem = document.getElementById('vp-menu-item');
  if(vpItem) vpItem.style.display = isCanvas ? '' : 'none';
}

// ─── Flow workspace: open the real Game Flow Designer ───
function _activateFlowWorkspace(){
  openGameFlowDesigner();
  // gfdFit with a small delay to allow layout to settle
  setTimeout(gfdFit, 120);
}

// ─── Feature Editor State ─────────────────────────────────────────────────────
const FEATURES_STATE = {
  selectedKey: null,
  activeTab: 'trigger',
  filter: 'all',
  search: '',
};

if(!window.P_featureConfigs) window.P_featureConfigs = {};

const FE_FLOW_TEMPLATES = {
  freespin: function(cfg, baseNodeId) {
    const tc = cfg.trigger || {};
    const trigLabel = tc.count ? `${tc.count}+ ${tc.symbol||'Scatter'}` : 'Scatter trigger';
    const spins = cfg.mechanics?.find(m=>m.type==='SPIN_COUNT'&&m.enabled)?.params?.count || 10;
    const nodes = [
      { label:'FS TRIGGER', type:'event',  notes:`Triggered by ${trigLabel}` },
      { label:'FREE SPINS', type:'screen', notes:`${spins} free spins with enhanced reels` },
      { label:'FS SUMMARY', type:'screen', notes:'Total win reveal. Returns to base game.' },
    ];
    const retrig = cfg.mechanics?.find(m=>m.type==='RETRIGGER'&&m.enabled);
    if(retrig) nodes.splice(2,0,{ label:'FS RETRIGGER', type:'event', notes:'Scatter lands during free spins — adds more spins' });
    return nodes;
  },
  holdnspin: function(cfg) {
    const tc = cfg.trigger || {};
    const trigLabel = tc.count ? `${tc.count}+ ${tc.symbol||'Coin'}` : 'Coin trigger';
    return [
      { label:'H&S TRIGGER', type:'event',  notes:`Triggered by ${trigLabel}` },
      { label:'HOLD & SPIN', type:'screen', notes:'Coins held. Respins reset on new coin land.' },
      { label:'H&S RESULT',  type:'screen', notes:'Total coin value revealed.' },
    ];
  },
  bonus_pick: function(cfg) {
    return [
      { label:'BONUS TRIGGER', type:'event',  notes:'Bonus symbols activate the pick game' },
      { label:'BONUS PICK',    type:'screen', notes:'Player picks items to reveal prizes' },
      { label:'PICK RESULT',   type:'screen', notes:'Summary of prizes collected' },
    ];
  },
  wheel_bonus: function(cfg) {
    return [
      { label:'WHEEL TRIGGER', type:'event',  notes:'Wheel bonus triggered' },
      { label:'WHEEL BONUS',   type:'screen', notes:'Prize wheel spin. Multiplier or feature award.' },
    ];
  },
  buy_feature: function(cfg) {
    return [
      { label:'BUY FEATURE',   type:'action',  notes:'Player pays to enter the bonus' },
      { label:'BUY CONFIRM',   type:'decision',notes:'Player confirms purchase' },
    ];
  },
  gamble: function(cfg) {
    return [
      { label:'GAMBLE',        type:'decision',notes:'Player opts to gamble current win' },
      { label:'GAMBLE RESULT', type:'screen',  notes:'Win or lose. Return to base game.' },
    ];
  },
};

const FE_TRIGGER_DEFAULTS = {
  freespin:     { type:'SCATTER_COUNT', symbol:'Scatter', count:3, activeIn:['BASE_GAME'] },
  holdnspin:    { type:'SCATTER_COUNT', symbol:'Coin',    count:6, activeIn:['BASE_GAME'] },
  bonus_pick:   { type:'SCATTER_COUNT', symbol:'Bonus',   count:3, activeIn:['BASE_GAME'] },
  wheel_bonus:  { type:'SCATTER_COUNT', symbol:'Bonus',   count:3, activeIn:['BASE_GAME'] },
  buy_feature:  { type:'MANUAL',        cost:75, costUnit:'bet_multiplier' },
  gamble:       { type:'WIN_AMOUNT',    winThreshold:1, winThresholdUnit:'bet_multiplier' },
};

const FE_MECHANICS_DEFAULTS = {
  freespin:  [
    { id:'mc_spin', type:'SPIN_COUNT',  label:'Spin Count',  enabled:true,  params:{ count:10 } },
    { id:'mc_mult', type:'MULTIPLIER',  label:'Multiplier',  enabled:false, params:{ type:'fixed', value:3 } },
    { id:'mc_ret',  type:'RETRIGGER',   label:'Retrigger',   enabled:false, params:{ count:10 } },
  ],
  holdnspin: [
    { id:'mc_resp', type:'SPIN_COUNT',  label:'Respins',     enabled:true,  params:{ count:3 } },
  ],
  bonus_pick:[ { id:'mc_pick', type:'COLLECT',  label:'Pick Count',  enabled:true,  params:{ count:3 } } ],
  wheel_bonus:[ { id:'mc_wh',  type:'SPIN_COUNT',label:'Wheel Spins',enabled:true,  params:{ count:1 } } ],
  buy_feature:[ { id:'mc_buy', type:'MULTIPLIER',label:'Cost Multiplier',enabled:true, params:{ value:75 } } ],
  gamble:    [ { id:'mc_gam', type:'MULTIPLIER',label:'Max Multiplier',enabled:true, params:{ value:10 } } ],
};

const FE_SCREENS_DEFAULTS = {
  freespin:  { gameplay:{enabled:true,label:'FS_GAMEPLAY'}, trigger_anim:{enabled:true,label:'FS_TRIGGER'}, intro:{enabled:true,label:'FS_INTRO'}, retrigger:{enabled:false,label:'FS_RETRIGGER'}, summary:{enabled:true,label:'FS_SUMMARY'} },
  holdnspin: { gameplay:{enabled:true,label:'HS_GAMEPLAY'}, trigger_anim:{enabled:true,label:'HS_TRIGGER'}, result:{enabled:true,label:'HS_RESULT'} },
  bonus_pick:{ gameplay:{enabled:true,label:'BP_GAMEPLAY'}, intro:{enabled:true,label:'BP_INTRO'}, result:{enabled:true,label:'BP_RESULT'} },
  wheel_bonus:{ gameplay:{enabled:true,label:'WH_GAMEPLAY'}, intro:{enabled:true,label:'WH_INTRO'}, result:{enabled:true,label:'WH_RESULT'} },
  buy_feature:{ menu:{enabled:true,label:'BF_MENU'}, confirm:{enabled:true,label:'BF_CONFIRM'} },
  gamble:    { gameplay:{enabled:true,label:'GAMBLE'}, result:{enabled:true,label:'GAMBLE_RESULT'} },
};

function _feGetConfig(key){
  if(!window.P_featureConfigs[key]){
    window.P_featureConfigs[key] = {
      trigger:  JSON.parse(JSON.stringify(FE_TRIGGER_DEFAULTS[key]||{ type:'SCATTER_COUNT', symbol:'Symbol', count:3 })),
      mechanics:JSON.parse(JSON.stringify(FE_MECHANICS_DEFAULTS[key]||[])),
      screens:  JSON.parse(JSON.stringify(FE_SCREENS_DEFAULTS[key]||{ gameplay:{ enabled:true, label:(key.toUpperCase()+'_GAMEPLAY') } })),
      notes:    '',
    };
  }
  return window.P_featureConfigs[key];
}

function _feStatus(key){
  if(!P.features[key]) return 'disabled';
  const cfg = _feGetConfig(key);
  const msgs = [];
  if(!cfg.trigger?.type) msgs.push({ level:'error', code:'MISSING_TRIGGER', message:'No trigger configured.' });
  const hasGameplay = Object.values(cfg.screens||{}).some(s=>s.enabled&&s.label);
  if(!hasGameplay) msgs.push({ level:'error', code:'NO_GAMEPLAY_SCREEN', message:'No gameplay screen enabled.' });
  if(msgs.some(m=>m.level==='error')) return 'error';
  if(msgs.some(m=>m.level==='warning')) return 'warning';
  if(!cfg.trigger?.type) return 'incomplete';
  return 'valid';
}

function _feStatusIcon(st){
  return { valid:'✓', warning:'⚠', error:'✕', incomplete:'◐', disabled:'○' }[st]||'○';
}
function _feStatusColor(st){
  return { valid:'#34d399', warning:'#f59e0b', error:'#f87171', incomplete:'#60a5fa', disabled:'#3e3e5e' }[st]||'#3e3e5e';
}

function _feSmartSummary(key){
  const cfg = _feGetConfig(key);
  const t = cfg.trigger||{};
  let trigStr = '';
  if(t.type==='SCATTER_COUNT') trigStr = `⚡ ${t.count||3}+ ${t.symbol||'Scatter'}`;
  else if(t.type==='MANUAL') trigStr = `🛒 Manual (${t.cost||75}× bet)`;
  else if(t.type==='WIN_AMOUNT') trigStr = `💰 Win threshold`;
  else if(t.type==='LINKED') trigStr = `🔗 Linked feature`;
  else if(t.type==='PROBABILITY') trigStr = `🎲 Random ~1:${Math.round(1/(t.probability||0.005))}`;
  const mc = (cfg.mechanics||[]).find(m=>m.enabled);
  let mechStr = '';
  if(mc){
    if(mc.type==='SPIN_COUNT') mechStr = `${mc.params?.count||10} spins`;
    else if(mc.type==='MULTIPLIER') mechStr = `${mc.params?.value||3}× mult`;
    else if(mc.type==='COLLECT') mechStr = `pick ${mc.params?.count||3}`;
    else if(mc.type==='RETRIGGER') mechStr = `retriggerable`;
  }
  return [trigStr, mechStr].filter(Boolean).join(' · ');
}

function _feScreenCount(key){
  const cfg = _feGetConfig(key);
  return Object.values(cfg.screens||{}).filter(s=>s.enabled).length;
}

function _feListRender(){
  const list = document.getElementById('fe-list'); if(!list) return;
  const bar  = document.getElementById('fe-filter-bar');
  if(bar && !bar.dataset.init){
    bar.dataset.init='1';
    bar.innerHTML=['all','active','warnings'].map(f=>`<button class="fe-filter-btn${FEATURES_STATE.filter===f?' active':''}" data-filter="${f}" onclick="_feSetFilter('${f}')">${f==='warnings'?'⚠ Warnings':f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('');
  }
  const q = (FEATURES_STATE.search||'').toLowerCase();
  let items = FDEFS.filter(f=>{
    if(q && !f.label.toLowerCase().includes(q) && !f.group.toLowerCase().includes(q)) return false;
    if(FEATURES_STATE.filter==='active' && !P.features[f.key]) return false;
    if(FEATURES_STATE.filter==='warnings'){
      const st=_feStatus(f.key);
      if(st!=='warning'&&st!=='error') return false;
    }
    return true;
  });
  let lastGroup='', html='';
  items.forEach(f=>{
    if(f.group!==lastGroup){
      lastGroup=f.group;
      html+=`<div style="font-size:8px;font-weight:700;color:#3e3e4e;letter-spacing:.1em;text-transform:uppercase;padding:10px 2px 4px;font-family:'Inter',system-ui,sans-serif">${escH(f.group)}</div>`;
    }
    const isOn=!!P.features[f.key];
    const st=_feStatus(f.key);
    const stIcon=_feStatusIcon(st);
    const stColor=_feStatusColor(st);
    const isSel=FEATURES_STATE.selectedKey===f.key;
    const summary=isOn?_feSmartSummary(f.key):'Disabled';
    const sc=isOn?_feScreenCount(f.key):0;
    html+=`<div class="fe-list-item${isSel?' selected':''}${!isOn?' disabled':''}" onclick="_feSelect('${f.key}')">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
        <div style="display:flex;align-items:center;gap:7px">
          <div style="width:8px;height:8px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
          <span class="fe-list-item-name" style="${!isOn?'color:#5a5a7a':''}">${escH(f.label)}</span>
        </div>
        <span style="font-size:11px;color:${stColor};font-weight:700;flex-shrink:0">${stIcon}</span>
      </div>
      <div class="fe-list-item-summary">${isOn?escH(summary):'<span style="color:#3e3e4e;font-style:italic">Disabled — toggle to enable</span>'}</div>
      ${isOn&&sc>0?`<div class="fe-list-item-footer"><span>🖥 ${sc} screen${sc!==1?'s':''}</span></div>`:''}
    </div>`;
  });
  if(!items.length) html='<div style="font-size:10px;color:#3e3e4e;text-align:center;margin-top:24px;font-family:Inter,system-ui,sans-serif">No features match filter</div>';
  list.innerHTML=html;
}

function _feSetFilter(f){
  FEATURES_STATE.filter=f;
  document.querySelectorAll('.fe-filter-btn').forEach(b=>b.classList.toggle('active',b.dataset.filter===f));
  _feListRender();
}
function _feListFilter(q){ FEATURES_STATE.search=q; _feListRender(); }

function _feSelect(key){
  FEATURES_STATE.selectedKey=key;
  _feListRender();
  _feEditorRender(key);
  _feImpactRender(key);
}

function _feEditorRender(key){
  const f=FDEFS.find(d=>d.key===key); if(!f) return;
  const cfg=_feGetConfig(key);
  const isOn=!!P.features[key];
  const st=_feStatus(key);
  const stColor=_feStatusColor(st);

  const hdr=document.getElementById('fe-editor-header'); if(!hdr) return;
  hdr.innerHTML=`
    <div style="width:10px;height:10px;border-radius:50%;background:${f.color};flex-shrink:0"></div>
    <div style="font-size:14px;font-weight:700;color:#eeede6;letter-spacing:-.01em;flex:1">${escH(f.label)}</div>
    <span style="font-size:9px;padding:2px 8px;border-radius:100px;background:${f.color}14;border:1px solid ${f.color}33;color:${f.color};font-weight:700;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0">${escH(f.group)}</span>
    <div class="fe-toggle${isOn?' on':''}" onclick="_feToggle('${key}')" title="${isOn?'Disable':'Enable'} this feature" style="flex-shrink:0"></div>
    <span style="font-size:11px;color:${stColor};font-weight:700;min-width:14px;text-align:center">${_feStatusIcon(st)}</span>
  `;

  const tabs=['setup','trigger','mechanics','screens','flow'];
  const tabLabels={setup:'Setup',trigger:'Trigger',mechanics:'Mechanics',screens:'Screens',flow:'Flow'};
  const tabBar=document.getElementById('fe-tab-bar'); if(!tabBar) return;
  tabBar.innerHTML=tabs.map(t=>`<button class="fe-tab${FEATURES_STATE.activeTab===t?' active':''}" onclick="_feSetTab('${key}','${t}')">${tabLabels[t]}</button>`).join('');

  const content=document.getElementById('fe-editor-content'); if(!content) return;
  if(!isOn){
    content.innerHTML=`<div style="text-align:center;padding:40px 0;font-family:'Inter',system-ui,sans-serif">
      <div style="font-size:28px;margin-bottom:12px">○</div>
      <div style="font-size:13px;color:#7a7a8a;margin-bottom:8px">${escH(f.label)} is disabled</div>
      <div style="font-size:11px;color:#3e3e4e;margin-bottom:20px">Enable it to configure triggers, mechanics, and screens.</div>
      <button onclick="_feToggle('${key}')" style="padding:8px 24px;border-radius:100px;background:rgba(201,168,76,.1);border:1px solid rgba(201,168,76,.3);color:#c9a84c;font-size:12px;font-family:'Inter',system-ui,sans-serif;cursor:pointer;font-weight:600">Enable ${escH(f.label)}</button>
    </div>`;
    return;
  }
  switch(FEATURES_STATE.activeTab){
    case 'setup':     content.innerHTML=_feTabSetup(key,f,cfg); break;
    case 'trigger':   content.innerHTML=_feTabTrigger(key,f,cfg); break;
    case 'mechanics': content.innerHTML=_feTabMechanics(key,f,cfg); break;
    case 'screens':   content.innerHTML=_feTabScreens(key,f,cfg); break;
    case 'flow':      content.innerHTML=_feTabFlow(key,f,cfg); break;
  }
}

function _feSetTab(key,tab){
  FEATURES_STATE.activeTab=tab;
  _feEditorRender(key);
}

function _inp(style=''){return `class="fe-input" style="${style}"`;}
function _sel(){return `class="fe-select"`;}

function _feTabSetup(key,f,cfg){
  return `
  <div class="fe-section-title">Identity</div>
  <div class="fe-field"><div class="fe-label">Type</div>
    <div style="font-size:11px;color:${f.color};font-weight:600;padding:6px 8px;background:#13131a;border-radius:6px;border:1px solid rgba(255,255,255,.06)">${escH(f.label)} <span style="color:#3e3e4e;font-weight:400">— ${escH(f.group)}</span></div>
  </div>
  <div class="fe-field"><div class="fe-label">Description</div>
    <div style="font-size:11px;color:#7a7a8a;padding:6px 8px;background:#13131a;border-radius:6px;border:1px solid rgba(255,255,255,.06);line-height:1.5">${escH(f.desc||'—')}</div>
  </div>
  <div class="fe-divider"></div>
  <div class="fe-section-title">Notes</div>
  <div class="fe-field">
    <textarea ${_inp()} rows="4" style="resize:vertical;line-height:1.6;color:#7a7a8a;font-size:10px" placeholder="Design notes, cert requirements, scope…" oninput="_feSetNotes('${key}',this.value)">${escH(cfg.notes||'')}</textarea>
  </div>
  <div class="fe-divider"></div>
  <div class="fe-section-title">Danger</div>
  <button onclick="_feToggle('${key}')" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(224,112,112,.2);background:transparent;color:#e07070;font-size:10px;font-family:'Inter',system-ui,sans-serif;cursor:pointer;font-weight:600;transition:background .12s" onmouseover="this.style.background='rgba(224,112,112,.08)'" onmouseout="this.style.background='transparent'">Disable ${escH(f.label)}</button>
  `;
}

function _feTabTrigger(key,f,cfg){
  const t=cfg.trigger||{};
  const types=[
    {type:'SCATTER_COUNT', icon:'🎯', label:'Scatter Count', desc:'N scatter symbols anywhere on reels'},
    {type:'MANUAL',        icon:'🛒', label:'Buy / Manual', desc:'Player pays or presses a button'},
    {type:'WIN_AMOUNT',    icon:'💰', label:'Win Threshold', desc:'Triggered when win exceeds value'},
    {type:'LINKED',        icon:'🔗', label:'Linked Feature', desc:'Fires when another feature exits'},
    {type:'PROBABILITY',   icon:'🎲', label:'Probability',  desc:'Random chance per base spin'},
  ];
  const sel=t.type||'SCATTER_COUNT';
  let fields='';
  if(sel==='SCATTER_COUNT') fields=`
    <div class="fe-field"><div class="fe-label">Symbol</div><input ${_inp()} value="${escH(t.symbol||'Scatter')}" placeholder="Symbol name" oninput="_feTriggerSet('${key}','symbol',this.value)"></div>
    <div style="display:flex;gap:10px">
      <div class="fe-field" style="flex:1"><div class="fe-label">Minimum Count</div><input type="number" min="1" max="20" ${_inp('width:80px')} value="${t.count||3}" style="color:${f.color}" oninput="_feTriggerSet('${key}','count',parseInt(this.value)||3)"></div>
      <div class="fe-field" style="flex:1"><div class="fe-label">Active In</div><div style="font-size:10px;color:#7a7a8a;margin-top:6px">Base game (default)</div></div>
    </div>
    <div style="padding:8px 10px;border-radius:7px;background:#0d1a12;border:1px solid rgba(94,202,138,.12);font-size:9px;color:#5eca8a;line-height:1.6">
      ≈ Probability depends on reel configuration and scatter placement. Provide exact hit-rate in the Math Cert document.
    </div>`;
  else if(sel==='MANUAL') fields=`
    <div style="display:flex;gap:10px">
      <div class="fe-field" style="flex:1"><div class="fe-label">Cost</div><input type="number" min="1" ${_inp()} value="${t.cost||75}" style="width:80px;color:${f.color}" oninput="_feTriggerSet('${key}','cost',parseFloat(this.value)||75)"></div>
      <div class="fe-field" style="flex:1"><div class="fe-label">Unit</div><select ${_sel()} onchange="_feTriggerSet('${key}','costUnit',this.value)"><option value="bet_multiplier" ${(t.costUnit||'bet_multiplier')==='bet_multiplier'?'selected':''}>× Total Bet</option><option value="credits" ${t.costUnit==='credits'?'selected':''}>Credits</option></select></div>
    </div>`;
  else if(sel==='WIN_AMOUNT') fields=`
    <div style="display:flex;gap:10px">
      <div class="fe-field" style="flex:1"><div class="fe-label">Threshold</div><input type="number" min="0" step="0.5" ${_inp()} value="${t.winThreshold||1}" style="width:90px;color:${f.color}" oninput="_feTriggerSet('${key}','winThreshold',parseFloat(this.value)||1)"></div>
      <div class="fe-field" style="flex:1"><div class="fe-label">Unit</div><select ${_sel()} onchange="_feTriggerSet('${key}','winThresholdUnit',this.value)"><option value="bet_multiplier" ${(t.winThresholdUnit||'bet_multiplier')==='bet_multiplier'?'selected':''}>× Total Bet</option><option value="credits" ${t.winThresholdUnit==='credits'?'selected':''}>Credits</option></select></div>
    </div>`;
  else if(sel==='LINKED') fields=`
    <div class="fe-field"><div class="fe-label">Linked Feature</div><select ${_sel()} onchange="_feTriggerSet('${key}','linkedFeatureKey',this.value)">
      <option value="">Select feature…</option>
      ${FDEFS.filter(d=>d.key!==key&&P.features[d.key]).map(d=>`<option value="${d.key}" ${t.linkedFeatureKey===d.key?'selected':''}>${escH(d.label)}</option>`).join('')}
    </select></div>
    <div class="fe-field"><div class="fe-label">When</div><select ${_sel()} onchange="_feTriggerSet('${key}','linkedOnEvent',this.value)"><option value="exit" ${t.linkedOnEvent==='exit'?'selected':''}>On feature exit</option><option value="enter" ${t.linkedOnEvent==='enter'?'selected':''}>On feature enter</option></select></div>`;
  else if(sel==='PROBABILITY') fields=`
    <div class="fe-field"><div class="fe-label">Probability (0–100%)</div><input type="number" min="0" max="100" step="0.01" ${_inp()} value="${((t.probability||0.005)*100).toFixed(2)}" style="width:100px;color:${f.color}" oninput="_feTriggerSet('${key}','probability',parseFloat(this.value)/100||0.005)"></div>
    <div style="font-size:9px;color:#5a5a7a;padding:4px 0">≈ 1 in ${Math.round(1/((t.probability||0.005)))} base spins</div>`;

  return `
  <div class="fe-section-title">Trigger Type</div>
  <div class="fe-trigger-type-grid">${types.map(tt=>`
    <button class="fe-trigger-type-btn${sel===tt.type?' active':''}" onclick="_feTriggerSet('${key}','type','${tt.type}');_feSetTab('${key}','trigger')">
      <div class="fe-tt-icon">${tt.icon}</div>
      <div class="fe-tt-label">${tt.label}</div>
      <div class="fe-tt-desc">${tt.desc}</div>
    </button>`).join('')}
  </div>
  <div class="fe-divider"></div>
  <div class="fe-section-title">Trigger Configuration</div>
  ${fields}`;
}

function _feTabMechanics(key,f,cfg){
  const mechanics=cfg.mechanics||[];
  let html=`<div class="fe-section-title">Mechanic Blocks</div>`;
  if(!mechanics.length) html+=`<div style="font-size:11px;color:#3e3e4e;padding:16px 0">No mechanics configured.</div>`;
  mechanics.forEach((mc,i)=>{
    const col=mc.enabled?f.color:'#5a5a7a';
    let paramHtml='';
    if(mc.type==='SPIN_COUNT') paramHtml=`<div class="fe-field"><div class="fe-label">Spins Awarded</div><input type="number" min="1" max="999" ${_inp('width:80px')} value="${mc.params?.count||10}" style="color:${col}" oninput="_feMechSet('${key}',${i},'count',parseInt(this.value)||10)"></div>`;
    else if(mc.type==='MULTIPLIER') paramHtml=`<div style="display:flex;gap:10px"><div class="fe-field" style="flex:1"><div class="fe-label">Type</div><select ${_sel()} onchange="_feMechSet('${key}',${i},'type',this.value)"><option value="fixed" ${(mc.params?.type||'fixed')==='fixed'?'selected':''}>Fixed</option><option value="progressive" ${mc.params?.type==='progressive'?'selected':''}>Progressive</option></select></div><div class="fe-field" style="flex:1"><div class="fe-label">Value (×)</div><input type="number" min="1" ${_inp('width:80px')} value="${mc.params?.value||3}" style="color:${col}" oninput="_feMechSet('${key}',${i},'value',parseFloat(this.value)||3)"></div></div>`;
    else if(mc.type==='RETRIGGER') paramHtml=`<div class="fe-field"><div class="fe-label">Extra Spins</div><input type="number" min="1" ${_inp('width:80px')} value="${mc.params?.count||10}" style="color:${col}" oninput="_feMechSet('${key}',${i},'count',parseInt(this.value)||10)"></div>`;
    else if(mc.type==='COLLECT') paramHtml=`<div class="fe-field"><div class="fe-label">Pick Count</div><input type="number" min="1" max="20" ${_inp('width:80px')} value="${mc.params?.count||3}" style="color:${col}" oninput="_feMechSet('${key}',${i},'count',parseInt(this.value)||3)"></div>`;
    html+=`<div class="fe-mechanic-block">
      <div class="fe-mechanic-header" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
        <div class="fe-toggle${mc.enabled?' on':''}" onclick="event.stopPropagation();_feMechToggle('${key}',${i})" style="--c:${col}"></div>
        <span style="font-size:11px;font-weight:700;color:${mc.enabled?'#eeede6':'#5a5a7a'};flex:1">${escH(mc.label||mc.type)}</span>
        <span style="font-size:9px;color:${col}70;font-family:monospace">${escH(mc.type)}</span>
        <span style="font-size:12px;color:#3e3e4e;margin-left:4px">▾</span>
      </div>
      <div class="fe-mechanic-body" style="display:none">${mc.enabled?paramHtml:'<div style="font-size:10px;color:#3e3e4e">Enable this mechanic to configure its parameters.</div>'}</div>
    </div>`;
  });
  return html;
}

function _feTabScreens(key,f,cfg){
  const screens=cfg.screens||{};
  let html=`<div class="fe-section-title">Generated Screens</div><div style="font-size:9px;color:#5a5a7a;font-family:'Inter',system-ui,sans-serif;margin:-6px 0 12px">These screens are added to the canvas when the feature is enabled. Required screens cannot be disabled.</div>`;
  Object.entries(screens).forEach(([type,sc])=>{
    const required=['gameplay'].includes(type);
    html+=`<div class="fe-screen-row">
      <div class="fe-toggle${sc.enabled?' on':''}${required?' disabled':''}" onclick="${required?'':`_feScreenToggle('${key}','${type}')`}" style="${required?'opacity:.4;cursor:not-allowed':''}"></div>
      <div style="flex:1">
        <div style="font-size:11px;font-weight:600;color:${sc.enabled?'#eeede6':'#5a5a7a'}">${escH(sc.label||type)}</div>
        <div style="font-size:9px;color:#3e3e4e">${required?'Required':'Optional'} · ${escH(type)}</div>
      </div>
      <div style="font-size:9px;color:#3e3e4e;cursor:pointer" onclick="switchWorkspace('canvas')" title="Go to canvas">→ Canvas</div>
    </div>`;
  });
  return html;
}

function _feTabFlow(key,f,cfg){
  const tmpl=FE_FLOW_TEMPLATES[key];
  if(!tmpl) return `<div style="font-size:11px;color:#3e3e4e;padding:16px 0">No flow template for this feature type. Flow connections must be created manually in the Flow Designer.</div>`;
  const nodes=tmpl(cfg, 'BASE_GAME');
  let html=`<div class="fe-section-title">Flow Module</div>
  <div style="font-size:9px;color:#5a5a7a;font-family:'Inter',system-ui,sans-serif;margin:-6px 0 14px">This is the flow subgraph that will be added to the Game Flow Designer when this feature is synced. Nodes are managed automatically.</div>
  <div style="display:flex;flex-direction:column;gap:3px">
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;background:#13131a;border:1px solid rgba(255,255,255,.05)">
      <span style="font-size:10px">⚙</span>
      <span style="font-size:10px;color:#7a7a8a;font-weight:600">BASE GAME</span>
      <span style="font-size:9px;color:#3e3e4e;margin-left:auto">entry point</span>
    </div>`;
  nodes.forEach((n,i)=>{
    const t=GFD_TYPES[n.type]||GFD_TYPES.screen;
    html+=`<div style="display:flex;align-items:center;padding-left:16px;color:#3e3e4e;font-size:12px">↓</div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;background:${t.bg};border:1px solid ${t.color}33">
      <span style="font-size:10px">${t.icon}</span>
      <div><div style="font-size:10px;color:#eeede6;font-weight:600">${escH(n.label)}</div><div style="font-size:8.5px;color:#5a5a7a">${escH(n.notes||'')}</div></div>
    </div>`;
  });
  html+=`<div style="display:flex;align-items:center;padding-left:16px;color:#3e3e4e;font-size:12px">↓</div>
    <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;background:#13131a;border:1px solid rgba(255,255,255,.05)">
      <span style="font-size:10px">⚙</span>
      <span style="font-size:10px;color:#7a7a8a;font-weight:600">BASE GAME</span>
      <span style="font-size:9px;color:#3e3e4e;margin-left:auto">exit point</span>
    </div>
  </div>
  <div class="fe-divider"></div>
  <button onclick="_feFlowSync('${key}',true)" style="width:100%;padding:8px;border-radius:8px;border:1px solid rgba(201,168,76,.25);background:rgba(201,168,76,.07);color:#c9a84c;font-size:11px;font-family:'Inter',system-ui,sans-serif;cursor:pointer;font-weight:600">↺ Sync to Flow Designer</button>`;
  return html;
}

function _feImpactRender(key){
  const panel=document.getElementById('fe-impact'); if(!panel) return;
  if(!key){ panel.innerHTML='<div style="font-size:10px;color:#3e3e4e;text-align:center;margin-top:40px;font-family:Inter,system-ui,sans-serif;letter-spacing:.04em">Select a feature<br>to see its impact</div>'; return; }
  const f=FDEFS.find(d=>d.key===key);
  const cfg=_feGetConfig(key);
  const isOn=!!P.features[key];
  const st=_feStatus(key);

  const warnings=[];
  if(!cfg.trigger?.type) warnings.push({ level:'error', code:'MISSING_TRIGGER', message:'No trigger configured. Feature cannot activate.', tab:'trigger' });
  if(!Object.values(cfg.screens||{}).some(s=>s.enabled)) warnings.push({ level:'error', code:'NO_GAMEPLAY_SCREEN', message:'No screens enabled. Feature has no playable state.', tab:'screens' });

  const screens=cfg.screens||{};
  const enabledScreens=Object.entries(screens).filter(([,s])=>s.enabled);
  const canvasHTML=enabledScreens.length
    ? enabledScreens.map(([type,sc])=>`<div class="fe-impact-row"><span style="color:#5eca8a;font-size:9px;font-weight:700">+</span> ${escH(sc.label||type)}</div>`).join('')
    : `<div style="font-size:9px;color:#3e3e4e">No screens enabled</div>`;

  const tmpl=FE_FLOW_TEMPLATES[key];
  const flowNodes=tmpl?tmpl(cfg,'BASE_GAME'):[];
  const flowHTML=flowNodes.length
    ? [`<div class="fe-impact-row"><span style="color:#3e3e4e">BASE_GAME</span></div>`,...flowNodes.map(n=>`<div class="fe-impact-row"><span style="color:#3e3e4e;font-size:9px">→</span> <span style="color:#5eca8a;font-size:9px;font-weight:700">+</span> ${escH(n.label)}</div>`),`<div class="fe-impact-row"><span style="color:#3e3e4e;font-size:9px">→</span> <span style="color:#3e3e4e">BASE_GAME</span></div>`].join('')
    : `<div style="font-size:9px;color:#3e3e4e">No flow template</div>`;

  panel.innerHTML=`
  <div class="fe-impact-section">
    <div class="fe-impact-title"><span>Canvas</span> <span style="color:${enabledScreens.length>0?'#34d399':'#f87171'}">${enabledScreens.length} screen${enabledScreens.length!==1?'s':''}</span></div>
    ${isOn?canvasHTML:`<div style="font-size:9px;color:#3e3e4e">Feature is disabled</div>`}
  </div>
  <div style="height:1px;background:rgba(255,255,255,.05);margin:12px 0"></div>
  <div class="fe-impact-section">
    <div class="fe-impact-title"><span>Flow</span> <span style="color:${flowNodes.length>0?'#34d399':'#3e3e4e'}">${flowNodes.length} node${flowNodes.length!==1?'s':''}</span></div>
    ${isOn?flowHTML:`<div style="font-size:9px;color:#3e3e4e">Feature is disabled</div>`}
    ${isOn&&flowNodes.length>0?`<button onclick="_feFlowSync('${key}',true)" style="margin-top:8px;padding:5px 10px;border-radius:100py;border:1px solid rgba(201,168,76,.2);background:transparent;color:#c9a84c;font-size:9px;font-family:'Inter',system-ui,sans-serif;cursor:pointer;font-weight:600">↺ Sync to Flow</button>`:''}
  </div>
  <div style="height:1px;background:rgba(255,255,255,.05);margin:12px 0"></div>
  <div class="fe-impact-section">
    <div class="fe-impact-title"><span>Warnings</span> <span style="color:${warnings.length?'#f59e0b':'#34d399'}">${warnings.length||'✓'}</span></div>
    ${warnings.length?warnings.map(w=>`<div class="fe-warning-card${w.level==='error'?' error':''}">
      <div style="font-size:9px;font-weight:700;color:${w.level==='error'?'#f87171':'#f59e0b'};margin-bottom:3px">${w.code}</div>
      <div style="font-size:9px;color:#7a7a8a;line-height:1.5">${escH(w.message)}</div>
      ${w.tab?`<div style="margin-top:4px"><span onclick="_feSetTab('${key}','${w.tab}')" style="font-size:9px;color:#c9a84c;cursor:pointer;text-decoration:underline">→ Fix in ${w.tab} tab</span></div>`:''}
    </div>`).join(''):isOn?`<div style="font-size:9px;color:#34d399">No issues detected ✓</div>`:'<div style="font-size:9px;color:#3e3e4e">Enable feature to validate</div>'}
  </div>`;
}

function _feToggle(key){
  P.features[key] = !P.features[key];
  _feCanvasSync();
  _feFlowSync(key, P.features[key]);
  _feListRender();
  _feEditorRender(key);
  _feImpactRender(key);
  markDirty();
}

function _feTriggerSet(key,field,value){
  const cfg=_feGetConfig(key);
  cfg.trigger=cfg.trigger||{};
  cfg.trigger[field]=value;
  _feFlowSync(key, P.features[key]);
  _feImpactRender(key);
  markDirty();
}

function _feMechSet(key,idx,param,value){
  const cfg=_feGetConfig(key);
  if(cfg.mechanics[idx]){ cfg.mechanics[idx].params=cfg.mechanics[idx].params||{}; cfg.mechanics[idx].params[param]=value; }
  _feFlowSync(key, P.features[key]);
  _feImpactRender(key);
  markDirty();
}

function _feMechToggle(key,idx){
  const cfg=_feGetConfig(key);
  if(cfg.mechanics[idx]) cfg.mechanics[idx].enabled=!cfg.mechanics[idx].enabled;
  _feFlowSync(key, P.features[key]);
  _feEditorRender(key);
  _feImpactRender(key);
  markDirty();
}

function _feScreenToggle(key,type){
  const cfg=_feGetConfig(key);
  if(cfg.screens[type]) cfg.screens[type].enabled=!cfg.screens[type].enabled;
  _feCanvasSync();
  _feImpactRender(key);
  markDirty();
}

function _feSetNotes(key,notes){
  const cfg=_feGetConfig(key);
  cfg.notes=notes;
  markDirty();
}

function _feAddMenu(){
  const disabled=FDEFS.filter(f=>!P.features[f.key]);
  if(!disabled.length){ alert('All available features are already enabled.'); return; }
  const choice=prompt(`Add feature:\n\n${disabled.map((f,i)=>`${i+1}. ${f.label} (${f.group})`).join('\n')}\n\nEnter number:`);
  if(!choice) return;
  const idx=parseInt(choice)-1;
  if(idx>=0&&idx<disabled.length){
    const f=disabled[idx];
    P.features[f.key]=true;
    _feCanvasSync();
    _feFlowSync(f.key, true);
    _feListRender();
    _feSelect(f.key);
    markDirty();
  }
}

function _feCanvasSync(){
  if(typeof registerFeatureScreens==='function') registerFeatureScreens();
  if(typeof rebuildTabs==='function') rebuildTabs();
  if(typeof refresh==='function') refresh();
  if(typeof renderLayers==='function') renderLayers();
}

function _feFlowSync(key, enabled){
  if(!GFD.flows||!GFD.flows.length) return;
  const flow=GFD.flows.find(f=>f.id===GFD.activeFlowId)||GFD.flows[0];
  if(!flow||!flow.nodes) return;

  const toRemove=flow.nodes.filter(n=>n.meta&&n.meta.featureKey===key).map(n=>n.id);
  if(toRemove.length){
    flow.nodes=flow.nodes.filter(n=>!toRemove.includes(n.id));
    flow.connections=flow.connections.filter(c=>!toRemove.includes(c.fromNode)&&!toRemove.includes(c.toNode));
    GFD.nodes=flow.nodes; GFD.connections=flow.connections;
  }

  if(!enabled) { if(typeof gfdRender==='function') gfdRender(); _gfdMarkDirty(); return; }

  const tmpl=FE_FLOW_TEMPLATES[key];
  if(!tmpl) return;
  const cfg=_feGetConfig(key);
  const templateNodes=tmpl(cfg,'BASE_GAME');
  if(!templateNodes.length) return;

  const baseNode=flow.nodes.find(n=>n.label==='BASE GAME'||n.label==='BASE_GAME');

  const existingMaxX=flow.nodes.length?Math.max(...flow.nodes.map(n=>n.x)):100;
  const startX=existingMaxX+GFD_NODE_W+90;
  const startY=baseNode?baseNode.y:(60);
  const rowH=GFD_NODE_H+80;

  const addedIds=[];
  templateNodes.forEach((n,i)=>{
    const id=_gfdUid();
    const t=GFD_TYPES[n.type]||GFD_TYPES.screen;
    const meta={...( GFD_META_DEFAULTS[n.type]||{} ), featureKey:key};
    flow.nodes.push({
      id, type:n.type, label:n.label, notes:n.notes||'',
      x:startX, y:startY+i*rowH,
      meta, state:{name:n.label.toLowerCase().replace(/\s+/g,'_'),context:''},
      onEnter:[], onExit:[],
    });
    GFD._seq=(GFD._seq||0)+1;
    addedIds.push(id);
  });

  for(let i=0;i<addedIds.length-1;i++){
    const connId='c'+(++GFD._seq)+'_'+Math.random().toString(36).slice(2,5);
    flow.connections.push({ id:connId, fromNode:addedIds[i], toNode:addedIds[i+1], label:'', condition:null, priority:1 });
  }

  if(baseNode&&addedIds.length){
    const trigLabel=cfg.trigger?.count?`${cfg.trigger.count}+ ${cfg.trigger.symbol||'Scatter'}`:'Trigger';
    const connId='c'+(++GFD._seq)+'_'+Math.random().toString(36).slice(2,5);
    flow.connections.push({ id:connId, fromNode:baseNode.id, toNode:addedIds[0], label:trigLabel, condition:null, priority:10 });
    const retConnId='c'+(++GFD._seq)+'_'+Math.random().toString(36).slice(2,5);
    flow.connections.push({ id:retConnId, fromNode:addedIds[addedIds.length-1], toNode:baseNode.id, label:'Feature ends', condition:null, priority:1 });
  }

  GFD.nodes=flow.nodes; GFD.connections=flow.connections;
  if(typeof gfdRender==='function') gfdRender();
  _gfdMarkDirty();
}

function openFeaturesWorkspace(){
  switchWorkspace('features');
}

function buildFeaturesEditor(){
  _feListRender();
  if(FEATURES_STATE.selectedKey){
    _feEditorRender(FEATURES_STATE.selectedKey);
    _feImpactRender(FEATURES_STATE.selectedKey);
  } else {
    _feImpactRender(null);
  }
}

/// ─── Helper: open project settings panel ────────────────
function openProjectSettings(){
  switchWorkspace('project');
}

// ─── Workspace tab clicks ───────────────────────────────
document.querySelectorAll('.ws-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    switchWorkspace(btn.dataset.ws);
  });
});
// Also wire the menu-item m-project to open the project workspace
document.getElementById('m-project')?.addEventListener('click', () => { closeAllMenus(); switchWorkspace('project'); });

// ─── Project workspace: populate from project state ─────
function updateProjectWorkspace(){
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val||'—'; };
  const setHTML = (id, html) => { const el = document.getElementById(id); if(el) el.innerHTML = html||''; };

  // Overview
  set('proj-ov-title', P.name || 'Untitled Game');
  const themeMap = {western:'🤠 Western',fantasy:'🧙 Fantasy',egypt:'🏺 Egypt',space:'🚀 Space',fruit:'🍒 Fruit',ocean:'🌊 Ocean',jungle:'🌿 Jungle',horror:'💀 Horror',luxury:'💎 Luxury',other:'✏️ Other'};
  set('proj-ov-theme', themeMap[P.theme] || P.theme || '—');
  set('proj-ov-reels', P.reelset || '5×3');
  set('proj-ov-vp', P.viewport === 'landscape' ? '📱 Landscape' : '📱 Portrait');

  // Features — simple toggles, full config lives in the Features workspace
  const featEl = document.getElementById('proj-feat-list');
  if(featEl && typeof FDEFS !== 'undefined'){
    featEl.innerHTML = FDEFS.map(f => {
      const on = !!P.features[f.key];
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;background:${on?f.color+'12':'transparent'};border:1px solid ${on?f.color+'33':'rgba(255,255,255,.05)'}">
        <span style="width:8px;height:8px;border-radius:50%;background:${on?f.color:'#3e3e4e'};flex-shrink:0"></span>
        <span style="font-size:11px;font-weight:600;color:${on?f.color:'#6a6a8a'};flex:1">${escH(f.label)}</span>
        <span style="font-size:9px;color:#5a5a72">${f.group}</span>
        <div class="fe-toggle${on?' on':''}" onclick="_feToggle('${f.key}');updateProjectWorkspace()" title="${on?'Disable':'Enable'}"></div>
      </div>`;
    }).join('');
  }

  // Jackpots
  const jpEl = document.getElementById('proj-jp-list');
  if(jpEl){
    const jps = [
      {key:'grand', label:'Grand',  ico:'🏆', color:'#ef7a7a'},
      {key:'major', label:'Major',  ico:'🥇', color:'#c9a84c'},
      {key:'minor', label:'Minor',  ico:'🥈', color:'#5eca8a'},
      {key:'mini',  label:'Mini',   ico:'🥉', color:'#4ac8f0'},
    ];
    jpEl.innerHTML = jps.map(j => {
      const on = P.jackpots?.[j.key]?.on;
      return `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:${on?j.color+'18':'#1a1a26'};border:1px solid ${on?j.color+'44':'#2a2a3a'}">
        <span style="font-size:14px">${j.ico}</span>
        <span style="font-size:11px;font-weight:600;color:${on?j.color:'#6a6a8a'}">${j.label} Jackpot</span>
        <span style="margin-left:auto;font-size:9px;padding:2px 8px;border-radius:10px;background:${on?j.color+'22':'#2a2a3a'};color:${on?j.color:'#5a5a72'};font-family:'DM Mono',monospace">${on?'ON':'OFF'}</span>
      </div>`;
    }).join('');
  }

  // Screens
  const scrEl = document.getElementById('proj-screen-list');
  if(scrEl){
    const screenNames = {base:'🎰 Base Game',fs:'⭐ Free Spins',win:'🏆 Win Screen',bonus:'🎯 Bonus',gamble:'🃏 Gamble',bets:'⚙️ Bet Screen',info:'📋 Info'};
    const screens = P.screens || ['base','fs','win'];
    scrEl.innerHTML = screens.map(s => `
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;background:#1e1e2a;border:1px solid #2a2a3a;cursor:pointer" onclick="switchWorkspace('canvas');switchScreen('${s}')">
        <span style="font-size:12px">${(screenNames[s]||s).split(' ')[0]}</span>
        <span style="font-size:11px;color:#d0cec8">${(screenNames[s]||s).split(' ').slice(1).join(' ')}</span>
        <span style="margin-left:auto;font-size:9px;color:#5a5a72;font-family:'DM Mono',monospace">→ Open</span>
      </div>`).join('');
  }

  // Colours
  const colEl = document.getElementById('proj-colour-list');
  if(colEl){
    const cols = [P.color1, P.color2, P.color3].filter(Boolean);
    if(cols.length){
      colEl.innerHTML = cols.map(c => `
        <div style="text-align:center">
          <div style="width:52px;height:52px;border-radius:10px;background:${c};border:1px solid rgba(255,255,255,.12);margin-bottom:6px"></div>
          <div style="font-size:9px;font-family:'DM Mono',monospace;color:#9090a8">${c}</div>
        </div>`).join('');
    } else {
      colEl.innerHTML = '<span style="font-size:10px;color:#5a5a72">No colours set. Define in Project Settings.</span>';
    }
  }

  // Asset checklist
  const tbody = document.getElementById('proj-checklist-body');
  if(tbody){
    const items = buildAssetChecklist();
    tbody.innerHTML = items.map(it => `
      <tr style="border-bottom:1px solid #1e1e2a">
        <td style="padding:7px 8px;font-size:10px;color:#e0deda">${it.name}</td>
        <td style="padding:7px 8px;font-size:10px;color:#9090a8">${it.type}</td>
        <td style="padding:7px 8px;font-size:10px">${it.status==='done'?'<span style="color:#5eca8a">✓ Done</span>':'<span style="color:#c07040">○ Pending</span>'}</td>
      </tr>`).join('');
  }

  // GDD pane
  const theme = P.theme || '';
  const reels = P.reelset || '5x3';
  set('doc-gdd-title', P.name || 'Untitled Game');
  set('doc-gdd-concept', theme ? `A ${theme}-themed slot. ${reels} reel grid.` : `A slot game with a ${reels} reel grid.`);
  set('doc-gdd-screens', (P.screens||['base','fs','win']).join(', '));
  const feats2 = [];
  if(P.features?.fs?.on) feats2.push('Free Spins');
  if(P.features?.bonus?.on) feats2.push('Bonus');
  if(P.features?.gamble?.on) feats2.push('Gamble');
  if(P.features?.ante?.on) feats2.push('Ante Bet');
  if(P.features?.buyBonus?.on) feats2.push('Buy Bonus');
  set('doc-gdd-features', feats2.length ? feats2.join(' · ') : 'None');
  const jps2 = [];
  if(P.jackpots?.grand?.on) jps2.push('Grand');
  if(P.jackpots?.major?.on) jps2.push('Major');
  if(P.jackpots?.minor?.on) jps2.push('Minor');
  if(P.jackpots?.mini?.on)  jps2.push('Mini');
  set('doc-gdd-jackpots', jps2.length ? jps2.join(' · ') : 'None');
  set('doc-gdd-reels', reels + ' grid');
  const colEl2 = document.getElementById('doc-gdd-colors');
  if(colEl2){
    const cols2 = [P.color1, P.color2, P.color3].filter(Boolean);
    colEl2.innerHTML = cols2.length
      ? cols2.map(c=>`<span style="display:inline-flex;align-items:center;gap:5px"><span style="width:14px;height:14px;border-radius:3px;background:${c};border:1px solid rgba(255,255,255,.15);display:inline-block"></span><span style="font-size:10px;font-family:'DM Mono',monospace;color:#c0c0d0">${c}</span></span>`).join('')
      : '<span style="color:#7a7a94;font-size:10px">No colours defined</span>';
  }

  // Project sidebar nav
  document.querySelectorAll('#proj-ws-sidebar .doc-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const pane = item.dataset.proj;
      document.querySelectorAll('#proj-ws-sidebar .doc-nav-item').forEach(n => n.classList.remove('doc-active'));
      item.classList.add('doc-active');
      document.querySelectorAll('#proj-ws-content .doc-section').forEach(s => {
        s.style.display = s.id === 'proj-pane-' + pane ? '' : 'none';
      });
    });
  });
}

function buildAssetChecklist(){
  const list = [];
  const screenNames = {base:'Base Game',fs:'Free Spins',win:'Win Screen',bonus:'Bonus',gamble:'Gamble'};
  (P.screens||['base','fs','win']).forEach(scr => {
    const sname = screenNames[scr] || scr;
    list.push({name:sname+' — Background', type:'BG',   status:EL_ASSETS['bg_'+scr]?'done':'pending'});
    list.push({name:sname+' — Logo',        type:'Logo', status:EL_ASSETS['logo_'+scr]?'done':'pending'});
  });
  list.push({name:'Character',  type:'Char', status:EL_ASSETS['char']?'done':'pending'});
  list.push({name:'Spin Button',type:'UI',   status:EL_ASSETS['spinBtn']?'done':'pending'});
  if(P.jackpots?.grand?.on) list.push({name:'JP Grand Bar',type:'JP',status:EL_ASSETS['jpGrand']?'done':'pending'});
  if(P.jackpots?.major?.on) list.push({name:'JP Major Bar',type:'JP',status:EL_ASSETS['jpMajor']?'done':'pending'});
  if(P.jackpots?.minor?.on) list.push({name:'JP Minor Bar',type:'JP',status:EL_ASSETS['jpMinor']?'done':'pending'});
  if(P.jackpots?.mini?.on)  list.push({name:'JP Mini Bar', type:'JP',status:EL_ASSETS['jpMini'] ?'done':'pending'});
  return list;
}


// ─── Edit menu wiring ────────────────────────────────────
(function wireEditMenu(){
  const menuMap = {
    'm-undo':       () => { if(HIDX>0){HIDX--;restoreSnap(HIST[HIDX]);buildCanvas();renderLayers();renderLibrary();} },
    'm-redo':       () => { if(HIDX<HIST.length-1){HIDX++;restoreSnap(HIST[HIDX]);buildCanvas();renderLayers();renderLibrary();} },
    'm-duplicate':  () => showToast('Duplicate layer — coming soon'),
    'm-delete':     () => { if(SEL_KEY) deleteAnyLayer(SEL_KEY); else showToast('Select a layer first'); },
    'm-reset-el':   () => { if(SEL_KEY){ if(!EL_VP.portrait) EL_VP.portrait={}; if(!EL_VP.landscape) EL_VP.landscape={}; delete EL_VP.portrait[SEL_KEY]; delete EL_VP.landscape[SEL_KEY]; buildCanvas(); } else showToast('Select a layer first'); },
    'm-reset-all':  () => { if(confirm('Reset all layer positions to defaults?')){ Object.keys(EL_VP.portrait||{}).forEach(k=>delete EL_VP.portrait[k]); Object.keys(EL_VP.landscape||{}).forEach(k=>delete EL_VP.landscape[k]); buildCanvas(); } },
    'm-lock-sel':   () => { if(SEL_KEY){ if(USER_LOCKS.has(SEL_KEY)) USER_LOCKS.delete(SEL_KEY); else USER_LOCKS.add(SEL_KEY); renderLayers(); buildCanvas(); } else showToast('Select a layer first'); },
    'm-unlock-all': () => { USER_LOCKS.clear(); renderLayers(); buildCanvas(); },
  };
  Object.entries(menuMap).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', () => { closeAllMenus(); fn(); });
  });
})();

// ─── Insert menu wiring ─────────────────────────────────
(function wireInsertMenu(){
  const triggerUpload = (key) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = e => {
      const f = e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => applyAssetToLayer(key, ev.target.result);
      reader.readAsDataURL(f);
    };
    inp.click();
  };
  const btnMap = {
    'm-ins-bg':   () => triggerUpload('bg_' + (P.screen||'base')),
    'm-ins-logo': () => triggerUpload('logo'),
    'm-ins-char': () => triggerUpload('char'),
    'm-ins-screen-base': () => { switchScreen('base'); },
    'm-ins-screen-fs':   () => { switchScreen('fs'); },
    'm-ins-screen-win':  () => { switchScreen('win'); },
  };
  Object.entries(btnMap).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', () => { closeAllMenus(); fn(); });
  });
})();

// ─── Flow menu wiring ────────────────────────────────────
(function wireFlowMenu(){
  const exportJSON = () => {
    const data = { project: P.name, screens: P.screens, features: P.features, jackpots: P.jackpots };
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=(P.name||'spinative')+'-flow.json'; a.click();
  };
  const btnMap = {
    'm-flow-gen':         () => { switchWorkspace('flow'); showToast('Flow generated from project state'); },
    'm-flow-template':    () => { switchWorkspace('flow'); showToast('Template flow inserted'); },
    'm-flow-validate':    () => showToast('Flow validation: all screens connected ✓'),
    'm-flow-simulate':    () => showToast('Simulation coming soon'),
    'm-flow-export-json': exportJSON,
    'm-flow-export-pdf':  () => showToast('Flow diagram export coming soon'),
  };
  Object.entries(btnMap).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', () => { closeAllMenus(); fn(); });
  });
})();

// ─── Docs menu wiring ────────────────────────────────────
(function wireDocsMenu(){
  const goProj = (pane) => {
    switchWorkspace('project');
    setTimeout(() => document.querySelector(`[data-proj="${pane}"]`)?.click(), 80);
  };
  const btnMap = {
    'm-gen-gdd':    () => goProj('gdd'),
    'm-gen-artdir': () => showToast('Art direction — coming soon'),
    'm-gen-math':   () => showToast('Math summary — coming soon'),
    'm-exp-png':    () => showToast('Export PNG — coming soon'),
    'm-exp-all':    () => showToast('Export all screens — coming soon'),
    'm-exp-spine':  () => showToast('Spine export — coming soon'),
    'm-exp-layers': () => showToast('Layer export — coming soon'),
  };
  Object.entries(btnMap).forEach(([id, fn]) => {
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', () => { closeAllMenus(); fn(); });
  });
})();

// ─── Topbar workspace action buttons ────────────────────
(function wireTopbarActions(){
  // Flow topbar — GFD toolbar handles its own actions; nothing to wire here

  // Docs topbar
  const docsGenArt = document.getElementById('docs-gen-art-btn');
  if(docsGenArt) docsGenArt.addEventListener('click', () => {
    updateDocsWorkspace();
    setTimeout(() => document.querySelector('.doc-nav-item[data-doc="artdir"]')?.click(), 80);
  });
  const docsGenMath = document.getElementById('docs-gen-math-btn');
  if(docsGenMath) docsGenMath.addEventListener('click', () => {
    setTimeout(() => document.querySelector('.doc-nav-item[data-doc="math"]')?.click(), 80);
  });
  const docsExport = document.getElementById('docs-export-btn');
  if(docsExport) docsExport.addEventListener('click', () => showToast('Export coming soon'));

  // Marketing topbar
  const mktNew = document.getElementById('mkt-new-btn');
  if(mktNew) mktNew.addEventListener('click', () => showToast('Asset creation coming soon'));
})();

// ─── Help menu ───────────────────────────────────────────
(function wireHelpMenu(){
  const kbBtn = document.getElementById('m-kbd');
  if(kbBtn) kbBtn.addEventListener('click', () => {
    closeAllMenus();
    const mod = document.getElementById('kbd-modal');
    if(mod) mod.classList.add('show');
  });
  const aboutBtn = document.getElementById('m-about');
  if(aboutBtn) aboutBtn.addEventListener('click', () => {
    closeAllMenus();
    showToast('Spinative — Slot Game Design Tool');
  });
  const tutBtn = document.getElementById('m-tutorial');
  if(tutBtn) tutBtn.addEventListener('click', () => {
    closeAllMenus();
    showToast('Tutorial coming soon');
  });
})();

// helper: small toast notification
function showToast(msg){
  let t = document.getElementById('sf-toast');
  if(!t){
    t = document.createElement('div'); t.id='sf-toast';
    t.style.cssText='position:fixed;bottom:60px;left:50%;transform:translateX(-50%) translateY(20px);background:#262636;border:1px solid #3a3a52;border-radius:10px;padding:9px 16px;font-size:11px;color:#e0deda;z-index:9999;opacity:0;transition:all .25s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(t._tmr);
  t._tmr = setTimeout(() => {
    t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(10px)';
  }, 2800);
}

// ─── Init workspace on load ──────────────────────────────
(function initWorkspace(){
  // Ensure canvas workspace is default; hide all others
  updateWorkspaceUI();
  // Populate recent files in File menu
  _renderRecentFiles();
})();

// ════════════════════════════════════════════════════════
// ALIGN & DISTRIBUTE
// ════════════════════════════════════════════════════════
(function(){
  // Viewport bounds for current viewport mode
  function getVPBounds(){
    const vp = P.viewport || 'portrait';
    const def = VP[vp] || {cx:0,cy:0,cw:2000,ch:2000};
    return { x: def.cx, y: def.cy, w: def.cw, h: def.ch };
  }

  window.toggleAlignPanel = function(){
    const p = document.getElementById('align-panel');
    if(!p) return;
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
    // Reposition next to tool button
    const btn = document.getElementById('tool-align');
    if(btn && p.style.display !== 'none'){
      const r = btn.getBoundingClientRect();
      p.style.top = Math.max(80, r.top) + 'px';
    }
  };

  // Close align panel when clicking outside (use closest to catch SVG children)
  document.addEventListener('click', e => {
    const p = document.getElementById('align-panel');
    if(!p || p.style.display === 'none') return;
    const target = e.target;
    if(!p.contains(target) && !target.closest('#tool-align')){
      p.style.display = 'none';
    }
  }, true); // capture phase so it runs before child handlers

  window.alignLayer = function(dir){
    if(!SEL_KEY) { showToast('Select a layer first'); return; }
    const pos = {...getPos(SEL_KEY)};
    const b = getVPBounds();
    const commit = beginAction('align '+dir+' '+SEL_KEY);
    switch(dir){
      case 'left':    pos.x = b.x; break;
      case 'right':   pos.x = b.x + b.w - pos.w; break;
      case 'hcenter': pos.x = b.x + Math.round((b.w - pos.w) / 2); break;
      case 'top':     pos.y = b.y; break;
      case 'bottom':  pos.y = b.y + b.h - pos.h; break;
      case 'vcenter': pos.y = b.y + Math.round((b.h - pos.h) / 2); break;
      case 'center':
        pos.x = b.x + Math.round((b.w - pos.w) / 2);
        pos.y = b.y + Math.round((b.h - pos.h) / 2);
        break;
    }
    setPos(SEL_KEY, pos);
    buildCanvas(); renderLayers(); commit();
    showToast('Aligned: ' + dir);
    document.getElementById('align-panel').style.display = 'none';
  };

  window.distributeSelection = function(axis){
    // Get all visible keys in current screen, sorted by position
    const scr = P.screen || 'base';
    const def = SDEFS[scr];
    if(!def) return;
    const keys = def.keys || [];
    const vp = P.viewport === 'landscape' ? 'landscape' : 'portrait';
    const items = keys.map(k => ({k, pos: EL_VP[vp][k]})).filter(i => i.pos);
    if(items.length < 3){ showToast('Need 3+ layers to distribute'); return; }
    const commit = beginAction('distribute ' + axis);
    if(axis === 'h'){
      items.sort((a,b) => a.pos.x - b.pos.x);
      const first = items[0].pos.x;
      const last = items[items.length-1].pos.x + items[items.length-1].pos.w;
      const totalW = items.reduce((s,i) => s + i.pos.w, 0);
      const gap = (last - first - totalW) / (items.length - 1);
      let cx = first;
      items.forEach(item => {
        const p = {...item.pos, x: Math.round(cx)};
        setPos(item.k, p); cx += p.w + gap;
      });
    } else {
      items.sort((a,b) => a.pos.y - b.pos.y);
      const first = items[0].pos.y;
      const last = items[items.length-1].pos.y + items[items.length-1].pos.h;
      const totalH = items.reduce((s,i) => s + i.pos.h, 0);
      const gap = (last - first - totalH) / (items.length - 1);
      let cy = first;
      items.forEach(item => {
        const p = {...item.pos, y: Math.round(cy)};
        setPos(item.k, p); cy += p.h + gap;
      });
    }
    buildCanvas(); renderLayers(); commit();
    showToast('Distributed ' + (axis === 'h' ? 'horizontally' : 'vertically'));
    document.getElementById('align-panel').style.display = 'none';
  };
})();

// ════════════════════════════════════════════════════════
// SNAP SYSTEM
// ════════════════════════════════════════════════════════
let SNAP_ENABLED = true;
const SNAP_THRESHOLD = 10; // px in canvas coords

window.toggleSnap = function(){
  SNAP_ENABLED = !SNAP_ENABLED;
  const btn = document.getElementById('tool-snap');
  if(btn){
    btn.classList.toggle('snap-on', SNAP_ENABLED);
    const tip = btn.querySelector('.tool-tip');
    if(tip) tip.textContent = 'Snap to Center (snap ' + (SNAP_ENABLED ? 'on' : 'off') + ')';
  }
  showToast('Snap ' + (SNAP_ENABLED ? 'ON' : 'OFF'));
};

// Initialize snap button visual state on load
document.addEventListener('DOMContentLoaded', function initSnapUI(){
  const btn = document.getElementById('tool-snap');
  if(!btn) return;
  btn.classList.toggle('snap-on', SNAP_ENABLED);
  const tip = btn.querySelector('.tool-tip');
  if(tip) tip.textContent = 'Snap to Center (snap ' + (SNAP_ENABLED ? 'on' : 'off') + ')';
});

// Snap guide elements (shown during drag)
function _getSnapGuide(id){
  let el = document.getElementById(id);
  if(!el){
    el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:absolute;pointer-events:none;z-index:9000;background:#c9a84c;opacity:0;transition:opacity .1s';
    document.getElementById('gf').appendChild(el);
  }
  return el;
}
function showSnapGuide(axis, val){
  const b = VP[P.viewport] || {cx:0,cy:0,cw:2000,ch:2000};
  if(axis === 'h'){
    const g = _getSnapGuide('snap-guide-h');
    g.style.cssText = `position:absolute;pointer-events:none;z-index:9000;left:${b.cx}px;top:${val}px;width:${b.cw}px;height:1px;background:#c9a84c88;opacity:1`;
  } else {
    const g = _getSnapGuide('snap-guide-v');
    g.style.cssText = `position:absolute;pointer-events:none;z-index:9000;left:${val}px;top:${b.cy}px;width:1px;height:${b.ch}px;background:#c9a84c88;opacity:1`;
  }
}
function hideSnapGuides(){
  ['snap-guide-h','snap-guide-v'].forEach(id => {
    const g = document.getElementById(id);
    if(g) g.style.opacity = '0';
  });
}

// Note: snap logic is built directly into startMove() above.

// ════════════════════════════════════════════════════════
// UNDO FIX — don't intercept Ctrl+Z when editing text inputs
// ════════════════════════════════════════════════════════
(function fixUndoInputFocus(){
  // The keydown handler at document level runs unconditionally.
  // We patch undo/redo to no-op when a text input is focused.
  const _origUndo = window.undo;
  const _origRedo = window.redo;
  window.undo = function(){
    const t = document.activeElement;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if(_origUndo) _origUndo();
  };
  window.redo = function(){
    const t = document.activeElement;
    if(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if(_origRedo) _origRedo();
  };

  // Also push history for feature/jackpot/settings toggles that only call markDirty
  // Debounced history push for settings changes
  let _settingsHistTimer = null;
  const _origMarkDirty2 = window.markDirty;
  window.markDirty = function(){
    if(_origMarkDirty2) _origMarkDirty2.apply(this, arguments);
    clearTimeout(_settingsHistTimer);
    _settingsHistTimer = setTimeout(() => {
      // Push to undo history 800ms after a settings change settles
      if(typeof pushHistory === 'function') pushHistory('settings change');
    }, 800);
  };
})();

// ═══ REEL SETTINGS MODAL ═══
(function(){
  function rsModal(){ return document.getElementById('reel-settings-modal'); }

  window.openReelSettings = function(){
    var modal = rsModal(); if(!modal) return;
    modal.classList.remove('rs-hidden');
    rsSync(); // sync sliders to P.reelSettings
    rsBuildSymGrid();
  };

  function closeReelSettings(){
    var modal = rsModal(); if(!modal) return;
    modal.classList.add('rs-hidden');
  }

  // ── Sync sliders → display values from P.reelSettings ──
  function rsSync(){
    var RS = P.reelSettings;
    var sc = document.getElementById('rs-scale');
    var px = document.getElementById('rs-padx');
    var py = document.getElementById('rs-pady');
    var oa = document.getElementById('rs-overlap-amt');
    var os = document.getElementById('rs-overlap-sym');
    var ewS = document.getElementById('ew-symbol-id');
    var hnsS = document.getElementById('hns-symbol-id');
    
    if(sc){ sc.value = Math.round((RS.scale||1)*100); document.getElementById('rs-scale-val').textContent = (RS.scale||1).toFixed(1)+'×'; }
    if(px){ px.value = RS.padX??8; document.getElementById('rs-padx-val').textContent = (RS.padX??8)+'px'; }
    if(py){ py.value = RS.padY??8; document.getElementById('rs-pady-val').textContent = (RS.padY??8)+'px'; }
    if(oa){ oa.value = RS.overlap?.amount||0; document.getElementById('rs-overlap-amt-val').textContent = (RS.overlap?.amount||0)+'%'; }
    
    // Rebuild select nodes organically
    function buildSel(selNode, activeId) {
      if(!selNode) return;
      selNode.innerHTML = '<option value="">None</option>';
      (P.symbols||[]).forEach(function(sym){
        var opt = document.createElement('option');
        opt.value = sym.id; opt.textContent = sym.name+' ('+sym.id+')';
        if(activeId === sym.id) opt.selected = true;
        selNode.appendChild(opt);
      });
    }

    if(os) buildSel(os, RS.overlap?.id);
    if(ewS) buildSel(ewS, P.expandWild?.symbolId);
    if(hnsS) {
       P.holdnspin = P.holdnspin || { symbolId: null, respins: 3, grand: 'Full board' };
       buildSel(hnsS, P.holdnspin.symbolId);
    }
  }

  // ── Symbol grid ── (exposed globally so _loadDefaultSymbols can refresh it)
  function rsBuildSymGrid(){
    var grid = document.getElementById('rs-sym-grid'); if(!grid) return;
    var SYM_TYPE_COLS = {special:'#c9a84c', high:'#7fb0f0', low:'#70c0a0'};
    grid.innerHTML = '';
    (P.symbols||[]).forEach(function(sym){
      var key = 'sym_'+sym.id;
      var card = document.createElement('div');
      card.className = 'rs-sym-card';
      card.title = 'Click to replace '+sym.name;

      // Thumbnail
      var asset = EL_ASSETS[key];
      if(asset){
        var img = document.createElement('img');
        img.src = asset;
        img.style.cssText = 'width:54px;height:54px;object-fit:contain';
        card.appendChild(img);
      } else {
        var ph = document.createElement('div');
        ph.className = 'rs-sym-placeholder';
        ph.style.background = (SYM_TYPE_COLS[sym.type]||'#4040a0')+'22';
        ph.textContent = sym.id;
        card.appendChild(ph);
      }
      // Name
      var badge = document.createElement('div');
      badge.className = 'rs-sym-badge';
      badge.textContent = sym.name;
      card.appendChild(badge);
      // Type pill
      var pill = document.createElement('div');
      pill.className = 'rs-sym-type '+(sym.type||'low');
      pill.textContent = sym.type;
      card.appendChild(pill);
      // Upload hover hint
      var hint = document.createElement('div');
      hint.className = 'rs-sym-upload-hint';
      hint.textContent = '⬆ Replace';
      card.appendChild(hint);

      card.addEventListener('click', function(){
        rsUploadSymbol(sym.id);
      });

      grid.appendChild(card);
    });
  }

  // ── Symbol upload: dynamic input per click (most reliable cross-browser) ──
  function rsUploadSymbol(symId){
    var assetKey = 'sym_'+symId;
    _sfPickAndUpload(assetKey, function(urlOrDataUrl){
      EL_ASSETS[assetKey] = urlOrDataUrl;
      try{ buildCanvas(); }catch(e){}
      try{ renderLayers(); }catch(e){}
      try{ markDirty(); }catch(e){}
      try{ rsBuildSymGrid(); }catch(e){}
    });
  }

  // Close button
  var closeBtn = document.getElementById('rs-close-btn');
  if(closeBtn) closeBtn.addEventListener('click', closeReelSettings);

  // Escape key to close
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape') closeReelSettings();
  });

  // ── Slider handlers ──
  function wire(id, fn){
    var el = document.getElementById(id);
    if(el) el.addEventListener('input', fn);
  }
  wire('rs-scale', function(e){
    P.reelSettings.scale = parseFloat(e.target.value)/100;
    document.getElementById('rs-scale-val').textContent = P.reelSettings.scale.toFixed(1)+'×';
    buildCanvas(); markDirty();
  });
  wire('rs-padx', function(e){
    P.reelSettings.padX = parseInt(e.target.value);
    document.getElementById('rs-padx-val').textContent = P.reelSettings.padX+'px';
    buildCanvas(); markDirty();
  });
  wire('rs-pady', function(e){
    P.reelSettings.padY = parseInt(e.target.value);
    document.getElementById('rs-pady-val').textContent = P.reelSettings.padY+'px';
    buildCanvas(); markDirty();
  });
  wire('rs-overlap-sym', function(e){
    if(!P.reelSettings) P.reelSettings = {};
    if(!P.reelSettings.overlap) P.reelSettings.overlap = {id:null, amount:0};
    P.reelSettings.overlap.id = e.target.value || null;
    buildCanvas(); markDirty();
  });
  wire('rs-overlap-amt', function(e){
    if(!P.reelSettings) P.reelSettings = {};
    if(!P.reelSettings.overlap) P.reelSettings.overlap = {id:null, amount:0};
    P.reelSettings.overlap.amount = parseInt(e.target.value);
    document.getElementById('rs-overlap-amt-val').textContent = P.reelSettings.overlap.amount+'%';
    buildCanvas(); markDirty();
  });

  // Expose so _loadDefaultSymbols can refresh thumbnails after fetch
  window.rsBuildSymGrid = rsBuildSymGrid;
})();

// Direct payload applier — used by both bridge IIFEs.
// Safer than restoreVersion(): each step is individually try-caught so one
// failure cannot prevent buildCanvas/renderLayers from running.
// ── Asset upload helper ───────────────────────────────────────────────────────
// Opens a file picker, then tries to upload via Supabase Storage (through the
// parent shell). Falls back to plain base64 dataURL if Storage is unavailable.
// Usage: _sfPickAndUpload('sym_Wild', function(urlOrDataUrl){ ... })
window._sfUploadCallbacks = window._sfUploadCallbacks || {};
window.addEventListener('message', function(evt){
  var msg = evt.data;
  if(!msg || msg.type !== 'SF_UPLOAD_ASSET_RESULT') return;
  var cb = window._sfUploadCallbacks[msg.assetKey];
  if(!cb) return;
  delete window._sfUploadCallbacks[msg.assetKey];
  if(msg.url){ cb(msg.url); }
  else if(msg._fallbackDataUrl){ cb(msg._fallbackDataUrl); }
});

window._sfPickAndUpload = function(assetKey, onDone){
  var inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(inp);
  inp.addEventListener('change', function(){
    var file = inp.files && inp.files[0];
    document.body.removeChild(inp);
    if(!file) return;

    // Always load as dataURL first (for immediate canvas preview)
    var reader = new FileReader();
    reader.onload = function(ev){
      var dataUrl = ev.target.result;
      // Show immediately in the canvas via base64 while upload happens
      EL_ASSETS[assetKey] = dataUrl;
      try{ buildCanvas(); }catch(e){}
      try{ renderLayers(); }catch(e){}

      // Try to upload to Supabase Storage via the parent shell
      window._sfUploadCallbacks[assetKey] = onDone;
      try{
        window.parent.postMessage({
          type: 'SF_UPLOAD_ASSET',
          assetKey: assetKey,
          file: file,
          _fallbackDataUrl: dataUrl,
        }, '*');
      } catch(e){
        // Parent not available — stay with base64
        delete window._sfUploadCallbacks[assetKey];
        onDone(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  });
  inp.click();
};

window._sfApplyPayload = function(payload){
  var s = payload;
  // Reset the load gate so markDirty can't fire a stale save if the editor
  // is reloaded / re-initialised without a full page reload.
  window._sfPayloadLoaded = false;
  try { if(s.gameName !== undefined) P.gameName = s.gameName; } catch(e){}
  try { if(s.theme    !== undefined) P.theme    = s.theme;    } catch(e){}
  try { if(s.colors   !== undefined) P.colors   = s.colors;   } catch(e){}
  try { if(s.reelset  !== undefined) P.reelset  = s.reelset;  } catch(e){}
  // Only replace jackpots/features if the saved value is a non-empty object
  // (empty {} means it was never configured — keep the defaults so UI shows correctly)
  try { if(s.jackpots && typeof s.jackpots==='object' && Object.keys(s.jackpots).length > 0) P.jackpots = s.jackpots; } catch(e){}
  try { if(s.features && typeof s.features==='object' && Object.keys(s.features).length > 0) P.features = s.features; } catch(e){}
  // Only restore symbols if the array actually has entries
  try { if(Array.isArray(s.symbols) && s.symbols.length > 0) P.symbols = s.symbols; } catch(e){}
  try { if(s.library  !== undefined) P.library  = s.library;  } catch(e){}
  try { if(s.expandWild) Object.assign(P.expandWild, s.expandWild); } catch(e){}
  try { if(s.reelSettings) Object.assign(P.reelSettings, s.reelSettings); } catch(e){}
  // Restore character, ante, and other settings missing from earlier versions
  // Use explicit property assignment for boolean flags to avoid Object.assign edge-cases
  try {
    if(s.char && typeof s.char === 'object') {
      if(s.char.enabled !== undefined) P.char.enabled = !!s.char.enabled;
      if(s.char.scale   !== undefined) P.char.scale   = s.char.scale;
    }
  } catch(e){}
  try { if(s.ante) Object.assign(P.ante, s.ante); } catch(e){}
  try { if(s.msgPos !== undefined) P.msgPos = s.msgPos; } catch(e){}
  try { if(s.viewport) P.viewport = s.viewport; } catch(e){}
  try { if(s.ovProps && typeof s.ovProps==='object') P.ovProps = s.ovProps; } catch(e){}
  try { if(s.ovPos   && typeof s.ovPos==='object')   P.ovPos   = s.ovPos;   } catch(e){}
  try { if(s.holdnspin && typeof s.holdnspin==='object') P.holdnspin = Object.assign(P.holdnspin||{}, s.holdnspin); } catch(e){}
  try { if(s.adjs  && typeof EL_ADJ   !== 'undefined') Object.assign(EL_ADJ,   s.adjs);  } catch(e){}
  try { if(s.masks && typeof EL_MASKS !== 'undefined') Object.assign(EL_MASKS, s.masks); } catch(e){}
  try { if(s.blendModes && typeof EL_BLEND_MODES!=='undefined') { Object.keys(EL_BLEND_MODES).forEach(function(k){delete EL_BLEND_MODES[k];}); Object.assign(EL_BLEND_MODES, s.blendModes); } } catch(e){}
  try { if(Array.isArray(s.userLocks) && typeof USER_LOCKS !== 'undefined'){ USER_LOCKS.clear(); s.userLocks.forEach(function(k){ USER_LOCKS.add(k); }); } } catch(e){}
  try { if(s.elVP && s.elVP.portrait)  Object.assign(EL_VP.portrait,  s.elVP.portrait);  } catch(e){}
  try { if(s.elVP && s.elVP.landscape) Object.assign(EL_VP.landscape, s.elVP.landscape); } catch(e){}
  try { if(s.assets) Object.assign(EL_ASSETS, s.assets); } catch(e){}
  // Restore layer key order for each screen (captures custom/reordered layers)
  try { if(s.keyOrders && typeof SDEFS!=='undefined') Object.entries(s.keyOrders).forEach(function(e){ if(SDEFS[e[0]]) SDEFS[e[0]].keys=[].concat(e[1]); }); } catch(e){}
  // Restore custom layer definitions so buildCanvas/renderLayers can find them
  try { if(s.customPsd && typeof PSD!=='undefined') Object.assign(PSD, s.customPsd); } catch(e){}
  // Fill any symbol slots that the saved project didn't have assets for
  try { if(typeof window._loadDefaultSymbols==='function') setTimeout(window._loadDefaultSymbols, 50); } catch(e){}
  // Restore Game Flow Designer state — handles both multi-flow and legacy formats
  try {
    if(s.gfd && typeof GFD !== 'undefined'){
      if(s.gfd.flows && s.gfd.flows.length > 0){
        // New multi-flow format
        GFD.flows        = JSON.parse(JSON.stringify(s.gfd.flows));
        GFD.activeFlowId = s.gfd.activeFlowId || GFD.flows[0].id;
        GFD._seq         = s.gfd._seq || 0;
        // Point live refs at the active flow
        const af = GFD.flows.find(function(f){ return f.id === GFD.activeFlowId; }) || GFD.flows[0];
        if(af){ GFD.nodes = af.nodes; GFD.connections = af.connections; GFD.pan = af.pan || {x:60,y:60}; GFD.scale = af.scale || 0.85; }
      } else if(Array.isArray(s.gfd.nodes) && s.gfd.nodes.length > 0){
        // Legacy single-canvas — migrate to a single flow
        var legId = 'flow_legacy_' + Date.now();
        GFD.flows = [{ id: legId, name: 'Base Game',
          nodes:       JSON.parse(JSON.stringify(s.gfd.nodes)),
          connections: JSON.parse(JSON.stringify(s.gfd.connections || [])),
          pan: {x:60,y:60}, scale: 0.85 }];
        GFD.activeFlowId = legId;
        GFD._seq         = s.gfd._seq || 0;
        GFD.nodes        = GFD.flows[0].nodes;
        GFD.connections  = GFD.flows[0].connections;
      }
      GFD.selected    = null;
      GFD.selConn     = null;
      GFD._eventsInit = false;
    }
  } catch(e){}
  // Restore feature editor configurations
  try {
    if(s.featureConfigs){
      try{ window.P_featureConfigs=JSON.parse(JSON.stringify(s.featureConfigs)); }catch(e){}
    }
  } catch(e){}
  // Sync UI toggles for settings that have visual toggle buttons
  try {
    var charTog=document.getElementById('char-tog');
    if(charTog){ charTog.classList.toggle('on',!!P.char.enabled); var charTgl=document.getElementById('char-tog-lbl'); if(charTgl)charTgl.style.color=P.char.enabled?'#ccc':'#555'; var charCf=document.getElementById('char-cf'); if(charCf)charCf.classList.toggle('open',!!P.char.enabled); }
  } catch(e){}
  try {
    var anteTog=document.getElementById('ante-tog');
    if(anteTog){ anteTog.classList.toggle('on',!!P.ante.enabled); var anteLbl=document.getElementById('ante-lbl'); if(anteLbl)anteLbl.style.color=P.ante.enabled?'#ccc':'#555'; var anteCf=document.getElementById('ante-cf'); if(anteCf)anteCf.classList.toggle('open',!!P.ante.enabled); }
  } catch(e){}
  try { var msgPosEl=document.getElementById('msg-pos'); if(msgPosEl&&P.msgPos) msgPosEl.value=P.msgPos; } catch(e){}
  // Sync UI fields
  try { var gn=document.getElementById('game-name');  if(gn) gn.value=P.gameName||''; } catch(e){}
  try { var ph=document.getElementById('ph-chip');    if(ph) ph.textContent=P.gameName||''; } catch(e){}
  try { var ts=document.getElementById('theme-sel');  if(ts) ts.value=P.theme||'western'; } catch(e){}
  try { var rs=document.getElementById('reel-sel');   if(rs) rs.value=P.reelset||'5x3';  } catch(e){}
  // Re-render — each call is individually guarded
  try { if(typeof renderReelViz==='function') renderReelViz(); } catch(e){}
  try { if(typeof rebuildTabs==='function')   rebuildTabs();   } catch(e){}
  try { if(typeof buildCanvas==='function')   buildCanvas();   } catch(e){}
  try { if(typeof renderLayers==='function')  renderLayers();  } catch(e){}
  try { if(typeof renderLibrary==='function') renderLibrary(); } catch(e){}
  try { document.getElementById('ov-props-panel')?.classList.remove('show'); } catch(e){}
  // Mark payload as fully applied so markDirty / CDN callbacks are allowed to trigger saves.
  window._sfPayloadLoaded = true;
};

/* ── Spinative postMessage bridge ── */
window._sfBridge = (function(){
  'use strict';

  /* ─── 1. CSS: hide internal save / new-project toolbar elements ─── */
  (function(){
    var s = document.createElement('style');
    s.textContent = [
      '#menubar-save { display:none !important }',
      '#m-new { display:none !important }',
      '#topbar-save-status { display:none !important }',
    ].join('\n');
    document.head.appendChild(s);
  })();

  /* ─── 2. Intercept ⌘S / Ctrl+S — use bridge save, not internal file save ─── */
  document.addEventListener('keydown', function(e){
    if((e.metaKey || e.ctrlKey) && e.key === 's'){
      e.preventDefault();
      e.stopPropagation();
      triggerSave();
    }
  }, true);

  /* ─── 3. Payload capture ─── */
  function getPayload(){
    return {
      gameName:    P.gameName,
      theme:       P.theme,
      colors:      JSON.parse(JSON.stringify(P.colors   || {})),
      reelset:     P.reelset,
      viewport:    P.viewport,
      jackpots:    JSON.parse(JSON.stringify(P.jackpots || {})),
      features:    JSON.parse(JSON.stringify(P.features || {})),
      char:        JSON.parse(JSON.stringify(P.char     || {})),
      ante:        JSON.parse(JSON.stringify(P.ante     || {})),
      msgPos:      P.msgPos,
      holdnspin:   JSON.parse(JSON.stringify(P.holdnspin|| {})),
      ovProps:     JSON.parse(JSON.stringify(P.ovProps  || {})),
      ovPos:       JSON.parse(JSON.stringify(P.ovPos    || {})),
      elVP:        JSON.parse(JSON.stringify(typeof EL_VP     !== 'undefined' ? EL_VP     : {})),
      symbols:     JSON.parse(JSON.stringify(P.symbols  || [])),
      expandWild:  JSON.parse(JSON.stringify(P.expandWild || {})),
      reelSettings:JSON.parse(JSON.stringify(P.reelSettings || {})),
      assets:      JSON.parse(JSON.stringify(typeof EL_ASSETS !== 'undefined' ? EL_ASSETS : {})),
      library:     JSON.parse(JSON.stringify(P.library  || [])),
      adjs:        JSON.parse(JSON.stringify(typeof EL_ADJ    !== 'undefined' ? EL_ADJ    : {})),
      masks:       JSON.parse(JSON.stringify(typeof EL_MASKS  !== 'undefined' ? EL_MASKS  : {})),
      userLocks:   typeof USER_LOCKS !== 'undefined' ? [...USER_LOCKS] : [],
      // Save layer key order for every screen — captures custom layers added/reordered by the user
      keyOrders:   (function(){ var ko={}; try{ Object.entries(typeof SDEFS!=='undefined'?SDEFS:{}).forEach(function(e){ if(e[1].keys) ko[e[0]]=[].concat(e[1].keys); }); }catch(ex){} return ko; })(),
      // Save custom layer definitions (PSD entries for custom_N keys) — required for layers to survive reload
      customPsd:   (function(){ var cp={}; try{ Object.entries(typeof PSD!=='undefined'?PSD:{}).forEach(function(e){ if(e[0].indexOf('custom_')===0) cp[e[0]]=e[1]; }); }catch(ex){} return cp; })(),
      blendModes:  (function(){ var bm={}; try{ Object.entries(EL_BLEND_MODES).forEach(function(e){ if(e[1]&&e[1]!=='normal') bm[e[0]]=e[1]; }); }catch(ex){} return bm; })(),
      // Game Flow Designer — multi-flow format: { flows, activeFlowId, _seq }
      gfd: (function(){
        try {
          if(typeof GFD==='undefined') return null;
          // Save live pan/scale into the active flow before serializing
          const af=GFD.flows.find(f=>f.id===GFD.activeFlowId);
          if(af){ af.pan={x:GFD.pan.x,y:GFD.pan.y}; af.scale=GFD.scale; }
          const hasAnyNodes=GFD.flows.some(f=>f.nodes&&f.nodes.length>0);
          if(!hasAnyNodes && !GFD.flows.length) return null;
          return {
            flows:        JSON.parse(JSON.stringify(GFD.flows||[])),
            activeFlowId: GFD.activeFlowId,
            _seq:         GFD._seq||0,
          };
        } catch(ex){}
        return null;
      })(),
      featureConfigs: (function(){
        try{ return JSON.parse(JSON.stringify(window.P_featureConfigs||{})); }catch(e){ return {}; }
      })(),
      // Rich theme/art-direction meta for AI asset generation
      meta: collectMeta(),
    };
  }

  /* ─── 4. Thumbnail ─── */
  // The composite view is a DIV (#gf) with positioned <img> layers, not a
  // real <canvas>, so we rasterize it with html2canvas. We capture the full
  // 2000×2000 #gf at half resolution then crop to the active viewport box
  // (portrait 984×2000 or landscape 2000×1125) so the thumbnail matches
  // exactly what the user sees inside #gf-outer in the editor. Returns a
  // Promise resolving to a JPEG data URL.
  async function getThumbnail(){
    try {
      var gf = document.getElementById('gf');
      if(!gf || typeof html2canvas !== 'function') return null;
      var vp = (typeof VP !== 'undefined' && typeof P !== 'undefined') ? VP[P.viewport] : null;
      // Render only the active viewport region of #gf at native resolution.
      // For portrait that's 984×2000 = 2M pixels — fast enough on save and
      // gives us ~2× oversampling vs. the 600-wide target for crisp downscale.
      var full = await html2canvas(gf, {
        useCORS:         true,
        allowTaint:      false,
        backgroundColor: '#0b0e16',
        logging:         false,
        scale:           1,
        x:               vp ? vp.cx : 0,
        y:               vp ? vp.cy : 0,
        width:           vp ? vp.cw : 2000,
        height:          vp ? vp.ch : 2000,
      });
      // High-quality downscale to ~600 px wide for a sharp ~80–120 KB JPEG.
      var TARGET_W = 600;
      var ratio = full.width > TARGET_W ? TARGET_W / full.width : 1;
      var dw = Math.round(full.width  * ratio);
      var dh = Math.round(full.height * ratio);
      var t = document.createElement('canvas');
      t.width = dw; t.height = dh;
      var ctx = t.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(full, 0, 0, full.width, full.height, 0, 0, dw, dh);
      return t.toDataURL('image/jpeg', 0.88);
    } catch(e){
      console.warn('[getThumbnail]', e);
      return null;
    }
  }

  /* ─── 5. Trigger save ─── */
  async function triggerSave(){
    var p = getPayload();
    var thumbnail = await getThumbnail();
    window.parent.postMessage({
      type: 'SF_AUTOSAVE',
      payload: p,
      thumbnail: thumbnail
    }, '*');
  }

  /* ─── 6. Pre-fill welcome form name + Game Identity field ─── */
  function prefillName(name){
    if(!name) return;
    // Fill welcome wizard
    var inp = document.getElementById('wf-name');
    if(inp){ inp.value = name; }
    // Also fill Project Settings > Game Identity > Game Name
    var gn = document.getElementById('game-name');
    if(gn && !gn.value){
      gn.value = name;
      gn.dispatchEvent(new Event('input', {bubbles: true}));
    }
    // Sync chip label
    var chip = document.getElementById('ph-chip');
    if(chip && !chip.textContent) chip.textContent = name;
  }

  /* ─── 7. Load a saved payload ─── */
  function loadPayload(payload){
    if(!payload) return;
    try {
      localStorage.setItem('sf_welcomed_v1', '1');
      localStorage.setItem('sf_overlay_v1',  '1');
    } catch(e){}
    try { prefillName(payload.gameName); } catch(e){}
    try {
      var wm = document.getElementById('welcome-modal');
      if(wm){ wm.classList.remove('show'); }
    } catch(e){}
    setTimeout(function(){ _sfApplyPayload(payload); }, 300);
    setTimeout(function(){
      try { document.getElementById('ov-props-panel')?.classList.remove('show'); } catch(e){}
      try { if(typeof openProjectSettings === 'function') openProjectSettings(); } catch(e){}
    }, 900);
    // Final re-sync of toggle UI states at 1100ms — runs after both _sfApplyPayload (300ms)
    // and switchScreen (900ms) have fully settled, ensuring char/ante toggles reflect P state.
    setTimeout(function(){
      try {
        var charTog=document.getElementById('char-tog');
        if(charTog){
          charTog.classList.toggle('on',!!P.char.enabled);
          var charTgl=document.getElementById('char-tog-lbl');
          if(charTgl) charTgl.style.color=P.char.enabled?'#ccc':'#555';
          var charCf=document.getElementById('char-cf');
          if(charCf) charCf.classList.toggle('open',!!P.char.enabled);
        }
        var anteTog=document.getElementById('ante-tog');
        if(anteTog){
          anteTog.classList.toggle('on',!!P.ante.enabled);
          var anteLbl=document.getElementById('ante-lbl');
          if(anteLbl) anteLbl.style.color=P.ante.enabled?'#ccc':'#555';
          var anteCf=document.getElementById('ante-cf');
          if(anteCf) anteCf.classList.toggle('open',!!P.ante.enabled);
        }
        if(typeof buildCanvas==='function') buildCanvas();
        if(typeof renderLayers==='function') renderLayers();
      } catch(e){}
    }, 1100);
  }

  /* ─── 8. Hook markDirty ─── */
  var _origMarkDirty = window.markDirty;
  var _autosaveTimer = null;
  // _sfPayloadLoaded: set to true at the end of _sfApplyPayload.
  // Prevents init-time markDirty calls (CDN callbacks, canvas renders, etc.)
  // from scheduling an autosave BEFORE the saved payload has been applied,
  // which would overwrite stored settings (e.g. char.enabled=true) with defaults.
  window._sfPayloadLoaded = false;
  window.markDirty = function(){
    if(_origMarkDirty) _origMarkDirty.apply(this, arguments);
    // Send a lightweight settings-only snapshot with every SF_DIRTY so the shell
    // can update payloadRef immediately. Settings (char.enabled, ante, features, etc.)
    // are tiny; we exclude assets to avoid sending large base64 blobs on every keystroke.
    var settingsSnapshot = null;
    try {
      var p = getPayload();
      // Filter assets to CDN URLs only — drop base64 blobs to keep the message small.
      // adjs, masks, keyOrders are included so payloadRef always has complete layer data
      // and the unmount save doesn't lose newly-added layers.
      var cdnAssets = {};
      try {
        Object.entries(p.assets || {}).forEach(function(kv){
          if(typeof kv[1] === 'string' && kv[1].startsWith('http')) cdnAssets[kv[0]] = kv[1];
        });
      } catch(ae){}
      settingsSnapshot = {
        gameName:       p.gameName,
        theme:          p.theme,
        colors:         p.colors,
        reelset:        p.reelset,
        viewport:       p.viewport,
        jackpots:       p.jackpots,
        features:       p.features,
        featureConfigs: p.featureConfigs,
        char:           p.char,
        ante:           p.ante,
        msgPos:         p.msgPos,
        holdnspin:      p.holdnspin,
        symbols:        p.symbols,
        expandWild:     p.expandWild,
        reelSettings:   p.reelSettings,
        ovProps:        p.ovProps,
        ovPos:          p.ovPos,
        elVP:           p.elVP,
        userLocks:      p.userLocks,
        keyOrders:      p.keyOrders,
        adjs:           p.adjs,
        masks:          p.masks,
        assets:         cdnAssets,
      };
    } catch(ex){}
    window.parent.postMessage({ type: 'SF_DIRTY', snapshot: settingsSnapshot }, '*');
    // Debounced autosave removed. Saves are triggered by:
    //   1. The explicit "Save" button / Cmd+S in the shell (SF_REQUEST_SAVE → triggerSave)
    //   2. The 30-second periodic nudge in the shell when status is dirty
    // This prevents stale partial-payload writes that caused layers to disappear.
  };

  /* ─── 8b. Expose immediate-save for CDN upload callback ─── */
  window._sfSaveNow = function(){
    clearTimeout(_autosaveTimer);
    _autosaveTimer = null;
    triggerSave();
  };

  /* ─── 9. Listen for messages from parent shell ─── */
  window.addEventListener('message', function(event){
    var msg = event.data;
    if(!msg || !msg.type) return;
    if(msg.type === 'SF_LOAD'){
      if(msg.payload){
        // If the saved gameName is empty or matches old hardcoded defaults,
        // use the projectName from the shell as the canonical name instead
        var OLD_DEFAULTS = ['Lucky Bull','lucky bull','LUCKY BULL',''];
        if(msg.projectName && OLD_DEFAULTS.indexOf((msg.payload.gameName||'').trim()) !== -1){
          msg.payload = Object.assign({}, msg.payload, { gameName: msg.projectName });
        }
        loadPayload(msg.payload);
      } else if(msg.projectName){
        prefillName(msg.projectName);
      }
    }
    if(msg.type === 'SF_REQUEST_SAVE'){ triggerSave(); }

    // Parent shell switching workspace back (e.g. returning from React Assets workspace)
    if(msg.type === 'SF_SET_WORKSPACE' && msg.workspace){
      switchWorkspace(msg.workspace);
    }

    // Inject arbitrary CSS from the parent shell (used to hide duplicate panels)
    if(msg.type === 'SF_INJECT_CSS' && msg.css){
      var styleEl = document.getElementById('_sf_injected_css');
      if(!styleEl){
        styleEl = document.createElement('style');
        styleEl.id = '_sf_injected_css';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent += '\n' + msg.css;
    }

    // Inject a generated/external image URL into a canvas layer asset slot
    if(msg.type === 'SF_INJECT_IMAGE_LAYER' && msg.assetType && msg.url){
      var ASSET_KEY_MAP = {
        background_base:  'bg',   background_bonus: 'bg_bonus',
        symbol_high_1: 'sym_H1', symbol_high_2: 'sym_H2', symbol_high_3: 'sym_H3',
        symbol_high_4: 'sym_H4', symbol_high_5: 'sym_H5', symbol_high_6: 'sym_H6',
        symbol_high_7: 'sym_H7', symbol_high_8: 'sym_H8',
        symbol_low_1:  'sym_L1', symbol_low_2:  'sym_L2', symbol_low_3:  'sym_L3',
        symbol_low_4:  'sym_L4', symbol_low_5:  'sym_L5', symbol_low_6:  'sym_L6',
        symbol_low_7:  'sym_L7', symbol_low_8:  'sym_L8',
        symbol_wild:      'sym_Wild',    symbol_scatter:   'sym_Scatter',
        symbol_special_3: 'sym_Special3', symbol_special_4: 'sym_Special4',
        symbol_special_5: 'sym_Special5', symbol_special_6: 'sym_Special6',
        logo: 'logo', character: 'char', reel_frame: 'reel_frame',
        spin_button: 'spin_button', jackpot_label: 'jackpot_label',
      };
      var elKey = ASSET_KEY_MAP[msg.assetType] || msg.assetType;
      try {
        EL_ASSETS[elKey] = msg.url;
        if(typeof buildCanvas   === 'function') buildCanvas();
        if(typeof renderLayers  === 'function') renderLayers();
        if(typeof markDirty     === 'function') markDirty();
      } catch(e) { console.warn('[SF] SF_INJECT_IMAGE_LAYER failed:', e); }
    }

    if(msg.type === 'SF_REQUEST_LAYERS_UPDATE'){
      try{ _sendLayersUpdate(); }catch(e){}
      return;
    }

    if(msg.type === 'SF_LAYER_OP'){
      var op=msg.op, k=msg.key;
      try {
        if(op==='select'&&k) { selectEl(k); }
        else if(op==='toggleVisibility'&&k){ if(HIDDEN_LAYERS.has(k))HIDDEN_LAYERS.delete(k);else HIDDEN_LAYERS.add(k); buildCanvas();renderLayers();markDirty(); }
        else if(op==='toggleLock'&&k){ if(USER_LOCKS.has(k))USER_LOCKS.delete(k);else USER_LOCKS.add(k); renderLayers();markDirty(); }
        else if(op==='delete'&&k){ deleteAnyLayer(k); }
        else if(op==='duplicate'&&k){ duplicateLayer(k); }
        else if(op==='setBlendMode'&&k){ EL_BLEND_MODES[k]=msg.blendMode||'normal'; buildCanvas();markDirty(); }
        else if(op==='addLayer'){ document.getElementById('add-layer-btn')?.click(); }
        else if(op==='reorder' && k && msg.targetKey){
          var tgt=msg.targetKey;
          var scr=SDEFS[P.screen];
          if(scr&&scr.keys){
            var arr=scr.keys;
            var fromIdx=arr.indexOf(k);
            var toIdx=arr.indexOf(tgt);
            if(fromIdx!==-1&&toIdx!==-1&&fromIdx!==toIdx){
              arr.splice(fromIdx,1);
              toIdx=arr.indexOf(tgt);
              arr.splice(msg.position==='before'?toIdx:toIdx+1,0,k);
              buildCanvas(); renderLayers(); markDirty();
            }
          }
        }
        else if(op==='zForward'&&k){ layerReorder(k,'forward'); }
        else if(op==='zFront'&&k){   layerReorder(k,'front');   }
        else if(op==='zBackward'&&k){ layerReorder(k,'backward'); }
        else if(op==='zBack'&&k){    layerReorder(k,'back');    }
        else if(op==='addGroup'){
          var gNum=Object.keys(PSD).filter(function(x){return x.startsWith('group_');}).length+1;
          var gKey='group_'+gNum;
          PSD[gKey]={label:'Group '+gNum,type:'group',x:0,y:0,w:200,h:200,keys:SEL_KEY?[SEL_KEY]:[]};
          if(SDEFS[P.screen]&&SDEFS[P.screen].keys) SDEFS[P.screen].keys.push(gKey);
          SEL_KEY=gKey;
          buildCanvas(); renderLayers(); markDirty();
        }
      } catch(ex){ console.error('[SF_LAYER_OP]',ex); }
    }
  });

  /* ─── 10. Save on navigate away ─── */
  window.addEventListener('beforeunload', function(){
    clearTimeout(_autosaveTimer);
    try { triggerSave(); } catch(e){}
  });

  /* ─── 11. Notify parent ready (send exactly once) ─── */
  // Guard: the load/readystatechange/setTimeout paths can all fire in the same
  // tick or close together, causing multiple SF_IFRAME_READY → multiple SF_LOAD
  // messages → _sfApplyPayload running again with whatever payloadRef contains at
  // that moment, which reset all settings ~1 second after re-entering a project.
  var _sfReadySent = false;
  function notifyReady(){
    if(_sfReadySent) return;
    _sfReadySent = true;
    window.parent.postMessage({ type: 'SF_IFRAME_READY' }, '*');
  }
  if(document.readyState === 'complete'){
    notifyReady();
  } else {
    window.addEventListener('load', notifyReady);
    setTimeout(notifyReady, 1000);
  }

  return { getPayload: getPayload, triggerSave: triggerSave };
})();


/* ── COMMAND PALETTE LOGIC ── */
const CMD_COMMANDS = [
  { label: 'New Project', icon: '✦', action: () => { if(document.getElementById('m-new')) document.getElementById('m-new').click(); }},
  { label: 'Save Project', icon: '💾', action: () => { if(window._sfBridge && typeof window._sfBridge.triggerSave === 'function') window._sfBridge.triggerSave(); }},
  { label: 'Export JSON', icon: '📤', action: () => { if(typeof gfdExportJSON === 'function') gfdExportJSON(); }},
  { label: 'Simulate Spin', icon: '▶', action: () => { if(document.getElementById('sim-spin-btn')) document.getElementById('sim-spin-btn').click(); }},
  { label: 'Toggle Grid', icon: '⊹', action: () => { if(document.getElementById('m-grid-toggle')) document.getElementById('m-grid-toggle').click(); }},
  { label: 'Open Settings', icon: '⚙', action: () => { if(typeof openProjectSettings === 'function') openProjectSettings(); }},
  { label: 'Generate GDD', icon: '📋', action: () => { if(typeof openGDDModal === 'function') openGDDModal(); }},
  { label: 'Switch to Canvas', icon: '🎨', action: () => { if(typeof switchWorkspace === 'function') switchWorkspace('canvas'); }},
  { label: 'Switch to Flow', icon: '🔀', action: () => { if(typeof switchWorkspace === 'function') switchWorkspace('flow'); }},
];

document.addEventListener('keydown', (e) => {
  if((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    toggleCommandPalette();
  }
  if(e.key === 'Escape' && document.getElementById('cmd-palette-backdrop') && document.getElementById('cmd-palette-backdrop').classList.contains('show')) {
    toggleCommandPalette();
  }
});

function toggleCommandPalette() {
  const backdrop = document.getElementById('cmd-palette-backdrop');
  if(!backdrop) return;
  const isShowing = backdrop.classList.contains('show');
  if(isShowing) {
    backdrop.classList.remove('show');
  } else {
    backdrop.classList.add('show');
    renderCmdResults('');
    const inp = document.getElementById('cmd-input');
    inp.value = '';
    setTimeout(() => inp.focus(), 50);
  }
}

(function initProFeaturesCmd(){
    document.getElementById('cmd-input')?.addEventListener('input', (e) => {
      renderCmdResults(e.target.value.toLowerCase());
    });

    document.getElementById('cmd-palette-backdrop')?.addEventListener('click', (e) => {
      if(e.target.id === 'cmd-palette-backdrop') toggleCommandPalette();
    });
});

function renderCmdResults(query) {
  const container = document.getElementById('cmd-results');
  if(!container) return;
  
  const filtered = CMD_COMMANDS.filter(c => c.label.toLowerCase().includes(query));
  
  container.innerHTML = '';
  if(filtered.length === 0) {
    container.innerHTML = '<div style="padding:14px 18px;color:#666;font-style:italic">No commands found.</div>';
    return;
  }
  
  filtered.forEach((cmd, idx) => {
    const div = document.createElement('div');
    div.className = 'cmd-item' + (idx === 0 ? ' active' : '');
    div.innerHTML = `<span class="cmd-item-ico">${cmd.icon}</span><span class="cmd-item-lbl">${cmd.label}</span>`;
    div.addEventListener('click', () => {
      cmd.action();
      toggleCommandPalette();
    });
    container.appendChild(div);
  });
}



// ── PRO INTERACTION LOGIC ── //

// 1. Resize Handle
(function initProFeatures1(){
    let isResizing = false;
    const handle = document.getElementById('rp-resize-handle');
    const panel = document.getElementById('right-panel');
    
    if(handle && panel) {
        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            handle.classList.add('resizing');
            document.body.style.cursor = 'ew-resize';
        });
        document.addEventListener('mousemove', (e) => {
            if(!isResizing) return;
            // The panel is on the right, so width is (window.innerWidth - e.clientX)
            let newWidth = window.innerWidth - e.clientX;
            // limit bounds
            if(newWidth < 200) newWidth = 200;
            if(newWidth > 600) newWidth = 600;
            panel.style.transition = 'none'; // disable css transition during drag
            panel.style.width = newWidth + 'px';
        });
        document.addEventListener('mouseup', () => {
            if(isResizing) {
                isResizing = false;
                handle.classList.remove('resizing');
                document.body.style.cursor = 'default';
                panel.style.transition = ''; // restore css transition
            }
        });
    }
    
    // 2. Dynamic Canvas Grid
    const cbg = document.getElementById('cbg');
    if(cbg) {
        const bgCanvas = document.createElement('canvas');
        cbg.appendChild(bgCanvas);
        const ctx = bgCanvas.getContext('2d');
        
        let w = 0, h = 0;
        let gridOffset = { x: 0, y: 0 };
        let zoom = 1.0;
        
        function resize() {
            w = bgCanvas.width = cbg.clientWidth;
            h = bgCanvas.height = cbg.clientHeight;
            drawGrid();
        }
        
        function drawGrid() {
            ctx.clearRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.lineWidth = 1;
            
            let step = 32 * zoom;
            while(step < 16) step *= 2; 
            
            ctx.beginPath();
            for(let x = gridOffset.x % step; x < w; x += step) {
                ctx.moveTo(x, 0); ctx.lineTo(x, h);
            }
            for(let y = gridOffset.y % step; y < h; y += step) {
                ctx.moveTo(0, y); ctx.lineTo(w, y);
            }
            ctx.stroke();
        }
        
        window.addEventListener('resize', resize);
        resize();
        
        const wrap = document.getElementById('canvas-wrap');
        if(wrap) {
            let isPanningBG = false;
            wrap.addEventListener('mousedown', (e) => {
                if(e.button === 1 || (e.button === 0 && document.getElementById('tool-pan')?.classList.contains('active'))) {
                    isPanningBG = true;
                }
            });
            window.addEventListener('mousemove', (e) => {
                if(isPanningBG) {
                    gridOffset.x += e.movementX;
                    gridOffset.y += e.movementY;
                    drawGrid();
                }
            });
            window.addEventListener('mouseup', () => isPanningBG = false);
            wrap.addEventListener('wheel', (e) => {
                if(e.ctrlKey || e.metaKey) {
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    zoom = Math.max(0.2, Math.min(zoom + delta, 5));
                    drawGrid();
                }
            }, {passive: false});
        }
    }
})();

// 3. Skeleton Loading Hook
window.showSkeleton = function(containerId) {
    const el = document.getElementById(containerId);
    if(!el) return;
    el.style.position = 'relative';
    const skel = document.createElement('div');
    skel.className = 'skeleton-loader';
    skel.id = 'skel-' + containerId;
    el.appendChild(skel);
}
window.hideSkeleton = function(containerId) {
    const skel = document.getElementById('skel-' + containerId);
    if(skel) skel.remove();
}

// Intercept AI loading functions if they exist in global scope to show skeleton, for example:
setTimeout(() => {
   if(typeof window.openGDDModal === 'function') {
      const origGDD = window.openGDDModal;
       window.openGDDModal = function() {
           origGDD();
           window.showSkeleton('doc-gdd-title');
           window.showSkeleton('doc-gdd-concept');
           setTimeout(() => { window.hideSkeleton('doc-gdd-title'); window.hideSkeleton('doc-gdd-concept'); }, 1500);
       }
   }
}, 500);


// ── Pro Phase 2: Minimap, Inline Context Toolbar, History Viewer, Detachable Panels ── //
(function initProFeatures2(){

    // 1. History Panel Logic
    // We add a 'history' trigger to Cmd+K or you can type 'history' to open it
    CMD_COMMANDS.push({ label: 'View History', icon: '⟲', action: () => { toggleHistoryPanel(); } });
    
    function toggleHistoryPanel() {
        const hp = document.getElementById('hist-panel');
        if(!hp) return;
        hp.classList.toggle('show');
        if(hp.classList.contains('show')) updateHistoryUI();
    }
    document.getElementById('hist-close')?.addEventListener('click', () => {
        document.getElementById('hist-panel').classList.remove('show');
    });

    // To intercept every markDirty call and update history Panel if open:
    const origMD = window.markDirty;
    window.markDirty = function() {
        if(typeof origMD === 'function') origMD.apply(this, arguments);
        if(document.getElementById('hist-panel')?.classList.contains('show')) updateHistoryUI();
    };

    window.updateHistoryUI = function() {
        const list = document.getElementById('hist-list');
        if(!list || typeof HIST === 'undefined') return;
        list.innerHTML = '';
        HIST.forEach((state, i) => {
            const div = document.createElement('div');
            div.className = 'hist-item' + (i === HIDX ? ' active' : '');
            div.textContent = `State Update ${i} (Reels: ${state?.reelset?.cols || '?'})`;
            div.addEventListener('click', () => {
                if(i === HIDX) return;
                HIDX = i;
                if(typeof restoreSnap === 'function') restoreSnap(HIST[HIDX] || HIST[HIDX-Math.max(0,1)] || HIST[0]);
                if(typeof buildCanvas === 'function') buildCanvas();
                updateHistoryUI();
            });
            list.appendChild(div);
        });
    }

    // 2. Inline Context Toolbar Logic
    const ict = document.getElementById('inline-ctx-toolbar');
    let ctxTargetEl = null;

    if(ict) {
        document.getElementById('ict-del')?.addEventListener('click', () => {
            if(typeof window.deleteSelected === 'function') window.deleteSelected();
            ict.classList.remove('show');
        });
        document.getElementById('ict-dup')?.addEventListener('click', () => {
            if(typeof window.duplicateSelected === 'function') window.duplicateSelected();
        });
        document.getElementById('ict-flipx')?.addEventListener('click', () => {
            if(typeof window.flipSelected === 'function') window.flipSelected();
        });

        // Hook into original selectEl if it exists to attach the inline toolbar
        if(typeof window.selectEl === 'function') {
            const prevSelectEl = window.selectEl;
            window.selectEl = function(k) {
                prevSelectEl(k);
                positionInlineCtx(k);
            }
        }
        
        const wrap = document.getElementById('canvas-wrap');
        wrap?.addEventListener('scroll', () => { if(ict.classList.contains('show')) ict.classList.remove('show'); });
    }

    window.positionInlineCtx = function(k) {
        if(!ict || !k) { ict?.classList.remove('show'); return; }
        // Find the actual DOM element for the selection
        const target = document.getElementById(k) || document.querySelector(`[data-key="${k}"]`);
        if(!target) { ict.classList.remove('show'); return; }
        
        ctxTargetEl = target;
        const rect = target.getBoundingClientRect();
        
        ict.style.left = rect.left + (rect.width/2) - 40 + 'px';
        ict.style.top = rect.top - 40 + 'px';
        ict.classList.add('show');
    }

    // Deselect hook
    const gf = document.getElementById('gf');
    gf?.addEventListener('mousedown', (e) => {
        if(e.target === gf) ict?.classList.remove('show');
    });

    // 3. Mini-map Logic
    const mmCanvas = document.getElementById('minimap');
    if(mmCanvas && typeof EL_VP !== 'undefined') {
        const mmCtx = mmCanvas.getContext('2d');
        mmCanvas.width = 160; mmCanvas.height = 160;

        function drawMinimap() {
            mmCtx.clearRect(0,0,160,160);
            mmCtx.fillStyle = 'rgba(255,255,255,0.05)';
            mmCtx.fillRect(0,0,160,160);
            
            if(typeof P === 'undefined' || !P.reelset) return;
            const tWidth = 1920; 
            const tHeight = 1080;
            const scale = 160 / Math.max(tWidth, tHeight);
            
            // Draw general reel bounds
            mmCtx.fillStyle = 'rgba(229, 191, 76, 0.4)';
            mmCtx.fillRect(40, 40, 80, 80); // Abstract rep

            // Needs a requestAnimationFrame loop to stay synced
            if(document.getElementById('minimap-container').style.display !== 'none') {
               requestAnimationFrame(drawMinimap);
            }
        }
        drawMinimap();
    }

    // 4. Detachable AI Panel Logic
    const aiSec = document.getElementById('ai-section');
    if(aiSec && aiSec.querySelector('#ai-hdr')) {
        const hdr = aiSec.querySelector('#ai-hdr');
        hdr.style.position = 'relative'; // Fix element overlap
        
        // Inject detach button
        const detachBtn = document.createElement('div');
        detachBtn.innerHTML = '⤢';
        detachBtn.style.cssText = 'position:absolute;right:14px;top:8px;cursor:pointer;color:var(--text-muted);font-size:16px;z-index:10;';
        hdr.appendChild(detachBtn);

        let isDetached = false;
        let dragX=0, dragY=0, startX=0, startY=0;

        detachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if(!isDetached) {
                isDetached = true;
                const rect = aiSec.getBoundingClientRect();
                document.body.appendChild(aiSec);
                aiSec.classList.add('floating-panel');
                hdr.classList.add('floating-handle');
                aiSec.style.left = rect.left - 200 + 'px';
                aiSec.style.top = rect.top + 'px';
                aiSec.style.height = '400px';
                detachBtn.innerHTML = '⤓'; // icon to attach
            } else {
                isDetached = false;
                document.getElementById('right-panel').appendChild(aiSec);
                aiSec.classList.remove('floating-panel');
                hdr.classList.remove('floating-handle');
                aiSec.style.position = '';
                aiSec.style.left = '';
                aiSec.style.top = '';
                aiSec.style.height = '300px'; // default
                detachBtn.innerHTML = '⤢';
            }
        });

        // Dragging logic for detached panel
        hdr.addEventListener('mousedown', (e) => {
            if(!isDetached || e.target === detachBtn) return;
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            document.onmouseup = closeDrag;
            document.onmousemove = elementDrag;
        });

        function elementDrag(e) {
            e.preventDefault();
            dragX = startX - e.clientX;
            dragY = startY - e.clientY;
            startX = e.clientX;
            startY = e.clientY;
            aiSec.style.top = (aiSec.offsetTop - dragY) + "px";
            aiSec.style.left = (aiSec.offsetLeft - dragX) + "px";
        }

        function closeDrag() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }
})();
