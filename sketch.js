/*
  Vale of Eternity — Card Generator (p5.js)
  -------------------------------------------------
  Port of your Processing 4 sketch.

  What is included:
  - Offscreen HD render buffer (EXPORT_SCALE) and PNG export
  - Same drawing pipeline: background -> creature (no distortion) -> fade -> name -> abilities -> edge frame -> cost -> family icons -> ability type icons
  - Same brace-token parsing: {fire} {1gem} {?WP} {IMMEDIATE} ... including Russian aliases
  - Hold keys 0–9 to overlay example cards
  - Drag creature image by clicking/dragging on the card preview
  - Scale creature via vertical slider
  - UI buttons insert tokens into the last-focused ability textarea
*/

// -----------------------------
// Constants / Enums
// -----------------------------

const Family = Object.freeze({ FIRE:'FIRE', WATER:'WATER', AIR:'AIR', EARTH:'EARTH', DRAGON:'DRAGON' });
const AbilityType = Object.freeze({ IMMEDIATE:'IMMEDIATE', CONTINUOUS:'CONTINUOUS', PERIODIC:'PERIODIC' });

const EXPORT_SCALE = 4;
const EXPORT_TRANSPARENT = true;

// Family button colors (matching your Processing UI palette)
const FIRE_COLOR   = [255, 0, 0];
const WATER_COLOR  = [0, 120, 255];
const EARTH_COLOR  = [0, 180, 0];
const AIR_COLOR    = [255, 80, 180];
const DRAGON_COLOR = [160, 0, 255];

// -----------------------------
// StyleConfig (ported)
// -----------------------------

class StyleConfig {
  constructor() {
    // Card
    this.cardAspect = 63.0/88.0;
    this.cardCornerRadius = 18;

    // Text styles
    this.creatureNameSizeFrac = 0.065;
    this.creatureNameColor = color(254, 238, 221);

    this.abilityTextSizeFrac = 0.031;
    this.abilityTextColor = color(0);

    // Name placement
    this.nameXFrac = 0.5;
    this.nameYFrac = 0.65;

    // Creature image placement
    this.creatureImgCenterXFrac = 0.50;
    this.creatureImgCenterYFrac = 0.46;
    this.creatureImgWFrac = 0.90;
    this.creatureImgHFrac = 0.70;

    // Ability windows placement
    this.ability1_XFrac = 0.095;
    this.ability1_YFrac = 0.6672;
    this.ability1_WFrac = 0.90;
    this.ability1_HFrac = 0.225;

    this.ability2_total_XFrac = 0.095;
    this.ability2_total_YFrac = 0.6672;
    this.ability2_total_WFrac = 0.90;
    this.ability2_total_HFrac = 0.225;
    this.ability2_gapYFrac = 0.01;

    // Ability window visuals
    this.abilityWindowFill = color(254, 238, 221, 170);
    this.abilityWindowStroke = color(255, 0);
    this.abilityWindowStrokeWeightFrac = 0.003;
    this.abilityWindowCornerFrac = 0.04;

    this.AbilityTypeIcon_width_fraction = 0.148;

    // Text padding in ability windows
    this.abilityPaddingXFrac = 0.05;
    this.abilityPaddingYFrac = 0.12;
    this.abilityTextStartXcoordinateFrac = 0.06;

    // Line spacing
    this.lineSpacingMult = 1.1;
    this.lineSpacingExtraFrac = 0.00;

    // Icons in text
    this.iconHeightFrac = 0.068;
    this.iconGemMult = 0.9;
    this.iconExtraGapFrac = 0.00;
  }
}

// -----------------------------
// Data classes (ported)
// -----------------------------

class Icon {
  constructor(img, desiredHeightPx) {
    this.img = img;
    this.heightPx = desiredHeightPx;
    if (img && img.width > 0 && img.height > 0) {
      this.aspect = img.width / img.height;
      this.widthPx = desiredHeightPx * this.aspect;
    } else {
      this.aspect = 1.0;
      this.widthPx = desiredHeightPx;
    }
  }

  drawCenteredPx(g, centerX, centerY, desiredWidthPx) {
    const w = max(1, desiredWidthPx);
    const h = max(1, w / max(0.0001, this.aspect));
    const x = centerX - w/2.0;
    const y = centerY - h/2.0;

    if (this.img) {
      g.image(this.img, x, y, w, h);
    } else {
      g.push();
      g.noStroke();
      g.fill(255, 200);
      g.rect(x, y, w, h, 6);
      g.pop();
    }
  }

  drawAt(g, cardW, cardH, centerXFrac, centerYFrac, desiredWidthPx) {
    const cx = centerXFrac * cardW;
    const cy = centerYFrac * cardH;
    this.drawCenteredPx(g, cx, cy, desiredWidthPx);
  }
}

class WPIcon extends Icon {
  constructor(img, desiredHeightPx, value) {
    super(img, desiredHeightPx);
    this.value = value;
  }
}

class Ability {
  constructor(type, text) {
    this.type = type;
    this.abilityText = text;
  }
}

class Card {
  constructor(creatureName, family, summonCost) {
    this.creatureName = creatureName;
    this.family = family;
    this.summonCost = summonCost;

    this.backgroundImg = null;
    this.creatureImg = null;
    this.edgeFrameImage = null;
    this.costImage = null;

    // Fractions
    this.creatureCenterXFrac = 0.5;
    this.creatureCenterYFrac = 0.5;
    this.creatureWFrac = 0.9;
    this.creatureHFrac = 0.7;

    this.abilities = [];
  }
}

// -----------------------------
// Token system (ported)
// -----------------------------

class Token {
  measurePx(g) { return 0; }
  drawToken(g, x, baselineY, fontSizePx, ascentPx) {}
}

class TextToken extends Token {
  constructor(text) {
    super();
    this.text = text;
  }
  measurePx(g) {
    return g.textWidth(this.text);
  }
  drawToken(g, x, baselineY) {
    g.text(this.text, x, baselineY);
  }
}

class IconToken extends Token {
  constructor(icon, extraGapPx) {
    super();
    this.icon = icon;
    this.extraGapPx = extraGapPx;
  }
  measurePx() {
    return this.icon.widthPx + this.extraGapPx;
  }
  drawToken(g, x, baselineY, _fontSizePx, ascentPx) {
    const lineMidY = baselineY - ascentPx/2.0;
    const iconY = lineMidY - this.icon.heightPx/2.0;

    if (this.icon.img) {
      g.image(this.icon.img, x, iconY, this.icon.widthPx, this.icon.heightPx);
    } else {
      g.push();
      g.noStroke();
      g.fill(255, 200);
      g.rect(x, iconY, this.icon.widthPx, this.icon.heightPx, 4);
      g.pop();
    }
  }
}

class WPIconToken extends Token {
  constructor(icon, extraGapPx) {
    super();
    this.icon = icon;
    this.extraGapPx = extraGapPx;
  }
  measurePx() {
    return this.icon.widthPx + this.extraGapPx;
  }
  drawToken(g, x, baselineY, _fontSizePx, ascentPx) {
    const lineMidY = baselineY - ascentPx/2.0;
    const iconY = lineMidY - this.icon.heightPx/2.0;

    if (this.icon.img) {
      g.image(this.icon.img, x, iconY, this.icon.widthPx, this.icon.heightPx);
    } else {
      g.push();
      g.noStroke();
      g.fill(255, 200);
      g.rect(x, iconY, this.icon.widthPx, this.icon.heightPx, 4);
      g.pop();
    }

    // Value centered on top
    g.push();
    g.textAlign(CENTER, CENTER);
    g.textSize(this.icon.heightPx * 0.62);
    const cx = x + this.icon.widthPx/2.0;
    const cy = iconY + this.icon.heightPx/2.0;
    g.stroke(0, 180);
    g.strokeWeight(max(1, this.icon.heightPx * 0.06));
    g.fill(255);
    // Some browsers don't support stroke on text well; draw twice.
    g.text(this.icon.value, cx, cy);
    g.noStroke();
    g.fill(255);
    g.text(this.icon.value, cx, cy);
    g.pop();
  }
}

class TokenLine {
  constructor() {
    this.tokens = [];
    this.widthPx = 0;
  }
}

// -----------------------------
// Globals
// -----------------------------

let style;

// Assets
let familyBG = new Map();
let familyIconImg = new Map();
let familyIconCache = new Map();

let extraIconImg = new Map();
let extraIconCache = new Map();
let wpIconImg = null;

let verticalFade = null;
let edgeFrameImg = null;

let exampleCards = new Array(10).fill(null);
let exampleHeld = new Array(10).fill(false);
let allowOverlays = true;

let fontName = null;
let fontAbility = null;

// Card + render
let demoCard;
let cardHD = null;
let cardW = 1, cardH = 1, cardX = 0, cardY = 0;

// Creature scale
let baseCreatureWFrac = 0.9;
let baseCreatureHFrac = 0.7;
let creatureScaleMin = 0.50;
let creatureScaleMax = 1.80;

// Drag creature
let draggingCreature = false;
let dragStartMouseX = 0;
let dragStartMouseY = 0;
let dragStartCenterXFrac = 0;
let dragStartCenterYFrac = 0;

// UI elements
let ui = {};
let lastAbilityFocused = null;

// Cost image cache key
let lastCostKey = '';

// -----------------------------
// p5 preload
// -----------------------------

function preload() {
  // Fonts
  fontName = loadFont('assets/roboto/Roboto-Black.ttf');
  // For ability font, Processing used "Calibri Bold"; on web we can't rely on it.
  // Use Roboto-Bold as closest portable replacement.
  fontAbility = loadFont('assets/roboto/Roboto-Bold.ttf');

  // Backgrounds
  familyBG.set(Family.FIRE, loadImage('assets/bg_fire.png'));
  familyBG.set(Family.WATER, loadImage('assets/bg_water.png'));
  familyBG.set(Family.AIR, loadImage('assets/bg_air.png'));
  familyBG.set(Family.EARTH, loadImage('assets/bg_earth.png'));
  familyBG.set(Family.DRAGON, loadImage('assets/bg_dragon.png'));

  // Family icons
  familyIconImg.set(Family.FIRE, loadImage('assets/icon_fire.png'));
  familyIconImg.set(Family.WATER, loadImage('assets/icon_water.png'));
  familyIconImg.set(Family.AIR, loadImage('assets/icon_air.png'));
  familyIconImg.set(Family.EARTH, loadImage('assets/icon_earth.png'));
  familyIconImg.set(Family.DRAGON, loadImage('assets/icon_dragon.png'));

  // Extra icons
  extraIconImg.set('IMMEDIATE', loadImage('assets/icon_immediate.png'));
  extraIconImg.set('CONTINUOUS', loadImage('assets/icon_continuous.png'));
  extraIconImg.set('PERIODIC', loadImage('assets/icon_periodic.png'));
  extraIconImg.set('1GEM', loadImage('assets/icon_1gem.png'));
  extraIconImg.set('3GEM', loadImage('assets/icon_3gem.png'));
  extraIconImg.set('6GEM', loadImage('assets/icon_6gem.png'));
  wpIconImg = loadImage('assets/icon_wp.png');

  // Other overlays
  verticalFade = loadImage('assets/vertical_fade.png');
  edgeFrameImg = loadImage('assets/edge_frame.png');

  // Example cards
  for (let i = 0; i < 10; i++) {
    exampleCards[i] = loadImage(`assets/exampleCards/example${i}.png`);
  }
}

// -----------------------------
// setup
// -----------------------------

function setup() {
  style = new StyleConfig();

  const wrap = document.getElementById('canvasWrap');
  const w = Math.max(480, Math.floor(window.innerWidth * 0.48));
  const h = Math.max(640, Math.floor(window.innerHeight * 0.92));
  const cnv = createCanvas(w, h);
  cnv.parent(wrap);
  pixelDensity(1);

  // Create demo card
  demoCard = new Card('Лепрекон', Family.EARTH, 2);
  demoCard.backgroundImg = familyBG.get(demoCard.family);
  demoCard.creatureImg = loadImage('assets/creature_example.png');
  demoCard.edgeFrameImage = edgeFrameImg;
  demoCard.costImage = loadCostImage(demoCard.family, demoCard.summonCost);

  demoCard.creatureCenterXFrac = style.creatureImgCenterXFrac;
  demoCard.creatureCenterYFrac = style.creatureImgCenterYFrac;
  demoCard.creatureWFrac = style.creatureImgWFrac;
  demoCard.creatureHFrac = style.creatureImgHFrac;
  baseCreatureWFrac = demoCard.creatureWFrac;
  baseCreatureHFrac = demoCard.creatureHFrac;

  demoCard.abilities.push(new Ability(AbilityType.CONTINUOUS, '+1 к максимальному запасу магических камней.'));
  demoCard.abilities.push(new Ability(AbilityType.IMMEDIATE, 'Получи {1камень}{1камень}{1камень}{1камень}{1камень}.'));

  bindUI();
  relayout();
  ensureHdBuffer();
}

// -----------------------------
// draw
// -----------------------------

function draw() {
  background(25);

  relayout();

  // Render to HD buffer and show scaled
  renderCardToHdBuffer(demoCard);
  image(cardHD, cardX, cardY, cardW, cardH);

  // Overlay while holding 0-9
  drawExampleOverlayIfHeld();
}

// -----------------------------
// Layout
// -----------------------------

function relayout() {
  // Canvas is just for preview; keep card fitting inside canvas.
  const availW = width;
  const availH = height;

  cardH = availH * 0.98;
  cardW = cardH * style.cardAspect;
  if (cardW > availW * 0.98) {
    cardW = availW * 0.98;
    cardH = cardW / style.cardAspect;
  }
  cardX = (availW - cardW) / 2.0;
  cardY = (availH - cardH) / 2.0;
}

function windowResized() {
  const w = Math.max(480, Math.floor(window.innerWidth * 0.48));
  const h = Math.max(640, Math.floor(window.innerHeight * 0.92));
  resizeCanvas(w, h);
  ensureHdBuffer();
}

// -----------------------------
// HD Buffer + Export
// -----------------------------

function ensureHdBuffer() {
  const w = Math.max(1, Math.round(cardW * EXPORT_SCALE));
  const h = Math.max(1, Math.round(cardH * EXPORT_SCALE));
  if (!cardHD || cardHD.width !== w || cardHD.height !== h) {
    cardHD = createGraphics(w, h);
    cardHD.pixelDensity(1);
  }
}

function renderCardToHdBuffer(card) {
  ensureHdBuffer();
  const g = cardHD;

  g.push();
  if (EXPORT_TRANSPARENT) g.clear();
  else g.background(25);

  drawCard(g, card, 0, 0, g.width, g.height);
  g.pop();
}

function exportHdPng() {
  renderCardToHdBuffer(demoCard);
  const ts = new Date();
  const pad = (n) => String(n).padStart(2,'0');
  const fname = `card_${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
  downloadGraphicsAsPNG(cardHD, fname);
}

function downloadGraphicsAsPNG(g, filename) {
  // Convert the graphics canvas to a blob and trigger a download.
  g.elt.toBlob((blob) => {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

// -----------------------------
// Rendering (ported)
// -----------------------------

function drawCard(g, card, x, y, w, h) {
  g.push();
  g.translate(x, y);

  // Card base
  g.noStroke();
  g.fill(40);
  g.rect(0, 0, w, h, style.cardCornerRadius);

  // Background
  if (card.backgroundImg) {
    g.image(card.backgroundImg, 0, 0, w, h);
  } else {
    g.fill(familyFallbackColor(card.family));
    g.rect(0, 0, w, h, style.cardCornerRadius);
  }

  // Creature image (no distortion)
  drawCreatureImage(g, card, w, h);

  // Fade
  if (verticalFade) g.image(verticalFade, 0, 0.7*h, w, 0.3*h);

  // Name
  drawCreatureName(g, card, w, h);

  // Abilities
  drawAbilities(g, card, w, h);

  // Edge frame
  if (card.edgeFrameImage) g.image(card.edgeFrameImage, 0, 0, w, h);

  // Price
  drawPrice(g, card, w, h);

  // Family icons
  drawFamilyIcons(g, card, w, h);

  // Ability icons
  drawAbilitiesIcons(g, card, w, h);

  g.pop();
}

function drawFamilyIcons(g, card, w, h) {
  const iconH = style.iconHeightFrac * h;
  const icon = ensureFamilyIconHeight(card.family, iconH);
  icon.drawCenteredPx(g, 0.11*w, 0.083*h, 0.14*w);
  icon.drawCenteredPx(g, 0.87*w, 0.925*h, 0.115*w);
}

function drawPrice(g, card, w, h) {
  if (!card.costImage) return;
  const thisWidth = (0.213333338-0.02)*w;
  const thisHeight = (0.252983302-0.112171836)*h;
  g.image(card.costImage, 0.02*w, 0.112171836*h, thisWidth, thisHeight);
  const frac = 0.8;
  g.image(card.costImage, 0.69*w, 0.85*h+thisHeight*(1-frac)/2, thisWidth*frac, thisHeight*frac);
}

function drawCreatureImage(g, card, w, h) {
  const cx = card.creatureCenterXFrac * w;
  const cy = card.creatureCenterYFrac * h;

  const boxW = card.creatureWFrac * w;
  const boxH = card.creatureHFrac * h;

  const leftBox = cx - boxW/2.0;
  const topBox  = cy - boxH/2.0;

  if (card.creatureImg && card.creatureImg.width > 0 && card.creatureImg.height > 0) {
    const imgAR = card.creatureImg.width / card.creatureImg.height;

    let drawW = boxW;
    let drawH = drawW / imgAR;
    if (drawH > boxH) {
      drawH = boxH;
      drawW = drawH * imgAR;
    }

    const left = cx - drawW/2.0;
    const top  = cy - drawH/2.0;

    g.image(card.creatureImg, left, top, drawW, drawH);
  } else {
    g.push();
    g.noStroke();
    g.fill(0, 120);
    g.rect(leftBox, topBox, boxW, boxH, 18);
    g.fill(255, 90);
    g.textAlign(CENTER, CENTER);
    g.textSize(16);
    g.text('Creature Image\n(placeholder)', cx, cy);
    g.pop();
  }
}

function drawCreatureName(g, card, w, h) {
  g.push();
  g.textFont(fontName);
  const fontSizePx = style.creatureNameSizeFrac * h;
  g.textSize(fontSizePx);
  g.textAlign(CENTER, BASELINE);

  const nx = style.nameXFrac * w;
  const ny = style.nameYFrac * h;

  // Shadow
  g.fill(0, 180);
  g.text(card.creatureName, nx+0.009*w, ny+0.007*w);
  g.fill(style.creatureNameColor);
  g.text(card.creatureName, nx, ny);
  g.pop();
}

function drawAbilityTypeIcon(g, type, x, y, widthPx) {
  let img = null;
  if (type === AbilityType.IMMEDIATE) img = extraIconImg.get('IMMEDIATE');
  else if (type === AbilityType.CONTINUOUS) img = extraIconImg.get('CONTINUOUS');
  else img = extraIconImg.get('PERIODIC');

  const icon = new Icon(img, widthPx);
  icon.drawCenteredPx(g, x, y, widthPx);
}

function drawAbilitiesIcons(g, card, w, h) {
  if (!card.abilities || card.abilities.length === 0) return;
  const slightXoffsetFrac = 0.013;

  if (card.abilities.length === 1) {
    const rx = style.ability1_XFrac * w;
    const ry = style.ability1_YFrac * h;
    const rh = style.ability1_HFrac * h;
    drawAbilityTypeIcon(g, card.abilities[0].type, rx+slightXoffsetFrac*w, ry+rh/2, style.AbilityTypeIcon_width_fraction*w);
  } else {
    const tx = style.ability2_total_XFrac * w;
    const ty = style.ability2_total_YFrac * h;
    const th = style.ability2_total_HFrac * h;
    const gap = style.ability2_gapYFrac * h;
    const eachH = (th - gap) / 2.0;

    drawAbilityTypeIcon(g, card.abilities[0].type, tx+slightXoffsetFrac*w, ty+eachH/2, style.AbilityTypeIcon_width_fraction*w);
    drawAbilityTypeIcon(g, card.abilities[1].type, tx+slightXoffsetFrac*w, ty + eachH + gap + eachH/2, style.AbilityTypeIcon_width_fraction*w);
  }
}

function drawAbilities(g, card, w, h) {
  if (!card.abilities || card.abilities.length === 0) return;

  if (card.abilities.length === 1) {
    const rx = style.ability1_XFrac * w;
    const ry = style.ability1_YFrac * h;
    const rw = style.ability1_WFrac * w;
    const rh = style.ability1_HFrac * h;
    drawAbilityWindow(g, card.abilities[0], rx, ry, rw, rh, w, h);
  } else {
    const tx = style.ability2_total_XFrac * w;
    const ty = style.ability2_total_YFrac * h;
    const tw = style.ability2_total_WFrac * w;
    const th = style.ability2_total_HFrac * h;

    const gap = style.ability2_gapYFrac * h;
    const eachH = (th - gap) / 2.0;

    drawAbilityWindow(g, card.abilities[0], tx, ty, tw, eachH, w, h);
    drawAbilityWindow(g, card.abilities[1], tx, ty + eachH + gap, tw, eachH, w, h);
  }
}

function drawAbilityWindow(g, ability, x, y, w, h, cardW_, cardH_) {
  g.push();

  const corner = style.abilityWindowCornerFrac * cardW_;
  const sw = style.abilityWindowStrokeWeightFrac * cardW_;

  g.fill(style.abilityWindowFill);
  g.stroke(style.abilityWindowStroke);
  g.strokeWeight(sw);
  g.rect(x, y, w, h, corner);

  const padX = style.abilityPaddingXFrac * w;
  const padY = style.abilityPaddingYFrac * h;

  const textAreaX = x + padX + (style.abilityTextStartXcoordinateFrac * w);
  const textAreaY = y + padY;
  const textAreaW = w - padX*2 - (style.abilityTextStartXcoordinateFrac * w);
  const textAreaH = h - padY*2;

  g.textFont(fontAbility);
  const fontSizePx = style.abilityTextSizeFrac * cardH_;
  g.textSize(fontSizePx);
  g.fill(style.abilityTextColor);
  g.textAlign(LEFT, BASELINE);

  const lines = layoutAbilityTokens(g, ability.abilityText, textAreaW, fontSizePx, cardW_, cardH_);

  const ascent = g.textAscent();
  const descent = g.textDescent();
  const lineH = (ascent + descent) * style.lineSpacingMult + (style.lineSpacingExtraFrac * cardH_) + style.iconHeightFrac*h;
  const totalTextH = lines.length * lineH;

  const startY = textAreaY + (textAreaH - totalTextH)/2.0 + ascent;

  let yBaseline = startY;
  const numLines = lines.length;
  for (let i = 0; i < numLines; i++) {
    const line = lines[i];
    let cursorX = textAreaX;
    for (const t of line.tokens) {
      t.drawToken(g, cursorX, yBaseline+0.05*h, fontSizePx, ascent);
      cursorX += t.measurePx(g);
    }
    yBaseline += lineH;
  }

  g.pop();
}

// -----------------------------
// Tokenizing + wrapping (ported)
// -----------------------------

function layoutAbilityTokens(g, rawText, maxWidthPx, fontSizePx, cardW_, cardH_) {
  const tokens = tokenizeAbility(g, rawText, cardW_, cardH_);

  const lines = [];
  let current = new TokenLine();

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tokenW = t.measurePx(g);

    const isSpace = (t instanceof TextToken) && (t.text === ' ');
    if (current.tokens.length === 0 && isSpace) continue;

    if (current.widthPx + tokenW <= maxWidthPx || current.tokens.length === 0) {
      current.tokens.push(t);
      current.widthPx += tokenW;
    } else {
      lines.push(trimLineEndSpaces(g, current));
      current = new TokenLine();
      if (!isSpace) {
        current.tokens.push(t);
        current.widthPx += tokenW;
      }
    }
  }
  lines.push(trimLineEndSpaces(g, current));
  if (lines.length === 0) lines.push(new TokenLine());
  return lines;
}

function trimLineEndSpaces(g, line) {
  while (line.tokens.length > 0) {
    const last = line.tokens[line.tokens.length-1];
    if (last instanceof TextToken && last.text === ' ') {
      line.tokens.pop();
    } else break;
  }
  let wsum = 0;
  for (const t of line.tokens) wsum += t.measurePx(g);
  line.widthPx = wsum;
  return line;
}

function tokenizeAbility(_g, rawText, cardW_, cardH_) {
  const out = [];
  const parts = tokenizeWithBraces(rawText);

  const iconH = style.iconHeightFrac * cardH_;
  const iconGap = style.iconExtraGapFrac * cardW_;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p || p.length === 0) continue;

    // 1) Family icons
    const fam = parseFamilyCodeword(p);
    if (fam) {
      const icon = ensureFamilyIconHeight(fam, iconH);
      out.push(new IconToken(icon, iconGap));
    } else {
      // 2) WP icon with value
      const wpValue = parseWpValue(p);
      if (wpValue !== null) {
        const wp = new WPIcon(wpIconImg, iconH, wpValue);
        out.push(new WPIconToken(wp, iconGap));
      } else {
        // 3) Other keyword icons
        const key = parseExtraIconKey(p);
        if (key) {
          let mult = 1;
          if (key === '1GEM' || key === '3GEM' || key === '6GEM') mult = style.iconGemMult;
          const icon = ensureExtraIconHeight(key, iconH*mult);
          out.push(new IconToken(icon, iconGap));
        } else {
          // 4) Plain text
          out.push(new TextToken(p));
        }
      }
    }

    if (i !== parts.length - 1) out.push(new TextToken(' '));
  }

  return out;
}

function ensureExtraIconHeight(key, desiredHeightPx) {
  const cached = extraIconCache.get(key);
  if (cached && Math.abs(cached.heightPx - desiredHeightPx) < 0.5) return cached;
  const img = extraIconImg.get(key) || null;
  const icon = new Icon(img, desiredHeightPx);
  extraIconCache.set(key, icon);
  return icon;
}

function ensureFamilyIconHeight(fam, desiredHeightPx) {
  const cached = familyIconCache.get(fam);
  if (cached && Math.abs(cached.heightPx - desiredHeightPx) < 0.5) return cached;
  const img = familyIconImg.get(fam) || null;
  const icon = new Icon(img, desiredHeightPx);
  familyIconCache.set(fam, icon);
  return icon;
}

function parseExtraIconKey(token) {
  token = stripTrailingPunct(token);
  if (!isBraceToken(token)) return null;
  const t = unwrapBraceToken(token).toLowerCase();

  if (t === 'immediate' || t === 'молния') return 'IMMEDIATE';
  if (t === 'continuous' || t === 'бесконечность') return 'CONTINUOUS';
  if (t === 'periodic' || t === 'часы') return 'PERIODIC';

  if (t === '1gem' || t === '1камень') return '1GEM';
  if (t === '3gem' || t === '3камень') return '3GEM';
  if (t === '6gem' || t === '6камень') return '6GEM';

  return null;
}

function parseWpValue(token) {
  token = stripTrailingPunct(token);
  if (!isBraceToken(token)) return null;

  const inner = unwrapBraceToken(token);
  const lower = inner.toLowerCase();

  if (!(lower.endsWith('wp') || lower.endsWith('по'))) return null;

  const mid = lower.substring(0, lower.length - 2);
  if (mid.length === 0) return null;

  for (let i = 0; i < mid.length; i++) {
    const c = mid.charAt(i);
    if (!(/[0-9?]/.test(c))) return null;
  }
  return mid;
}

function parseFamilyCodeword(token) {
  token = stripTrailingPunct(token);
  if (!isBraceToken(token)) return null;
  const t = unwrapBraceToken(token).toLowerCase();

  if (t === 'fire' || t === 'огонь') return Family.FIRE;
  if (t === 'water' || t === 'вода') return Family.WATER;
  if (t === 'air' || t === 'воздух') return Family.AIR;
  if (t === 'earth' || t === 'земля') return Family.EARTH;
  if (t === 'dragon' || t === 'дракон') return Family.DRAGON;
  return null;
}

function stripTrailingPunct(t) {
  while (t.length > 0) {
    const c = t.charAt(t.length-1);
    if (c==='.' || c===',' || c===';' || c===':' || c==='!' || c==='?') t = t.substring(0, t.length-1);
    else break;
  }
  return t;
}

function isBraceToken(token) {
  return token.length >= 3 && ((token.startsWith('{') && token.endsWith('}')) || (token.startsWith('(') && token.endsWith(')')));
}

function unwrapBraceToken(token) {
  return token.substring(1, token.length-1);
}

function tokenizeWithBraces(s) {
  const out = [];
  let buf = '';

  let i = 0;
  while (i < s.length) {
    const c = s.charAt(i);

    // whitespace flush
    if (/\s/.test(c)) {
      if (buf.length > 0) {
        out.push(buf);
        buf = '';
      }
      i++;
      continue;
    }

    // brace token
    if (c === '{' || c === '(') {
      if (buf.length > 0) {
        out.push(buf);
        buf = '';
      }
      const end = (c === '{') ? s.indexOf('}', i+1) : s.indexOf(')', i+1);
      if (end === -1) {
        buf += c;
        i++;
        continue;
      }
      out.push(s.substring(i, end+1));
      i = end + 1;
      continue;
    }

    buf += c;
    i++;
  }

  if (buf.length > 0) out.push(buf);
  return out;
}

function familyFallbackColor(f) {
  if (f === Family.FIRE) return color(180, 60, 40);
  if (f === Family.WATER) return color(40, 90, 170);
  if (f === Family.AIR) return color(120, 160, 200);
  if (f === Family.EARTH) return color(70, 140, 70);
  if (f === Family.DRAGON) return color(130, 70, 170);
  return color(80);
}

function getCostImageFileName_FromFamilyAndCost(fam, cost) {
  cost = constrain(cost, 0, 12);
  let familyText = 'Earth';
  if (fam === Family.FIRE) familyText = 'Fire';
  if (fam === Family.WATER) familyText = 'Water';
  if (fam === Family.AIR) familyText = 'Air';
  if (fam === Family.EARTH) familyText = 'Earth';
  if (fam === Family.DRAGON) familyText = 'Dragon';
  return `cost_${familyText}_${cost}_top.png`;
}

function loadCostImage(fam, cost) {
  const fn = getCostImageFileName_FromFamilyAndCost(fam, cost);
  return loadImage(`assets/costImages/${fn}`);
}

// -----------------------------
// Example overlay (0-9)
// -----------------------------

function drawExampleOverlayIfHeld() {
  let heldIdx = -1;
  for (let i = 0; i < 10; i++) {
    if (exampleHeld[i]) { heldIdx = i; break; }
  }
  if (heldIdx < 0) return;
  const ex = exampleCards[heldIdx];
  if (!ex) return;

  push();
  tint(255, 160);
  image(ex, cardX, cardY, cardW, cardH);
  noTint();
  pop();
}

// -----------------------------
// Mouse / keys for dragging + overlays
// -----------------------------

function mousePressed() {
  // Only drag if click lands on the visible card preview.
  if (mouseX >= cardX && mouseX <= cardX + cardW && mouseY >= cardY && mouseY <= cardY + cardH) {
    draggingCreature = true;
    dragStartMouseX = mouseX;
    dragStartMouseY = mouseY;
    dragStartCenterXFrac = demoCard.creatureCenterXFrac;
    dragStartCenterYFrac = demoCard.creatureCenterYFrac;
  }
}

function mouseDragged() {
  if (!draggingCreature) return;
  const dx = mouseX - dragStartMouseX;
  const dy = mouseY - dragStartMouseY;
  const dxf = dx / Math.max(1, cardW);
  const dyf = dy / Math.max(1, cardH);
  demoCard.creatureCenterXFrac = dragStartCenterXFrac + dxf;
  demoCard.creatureCenterYFrac = dragStartCenterYFrac + dyf;
}

function mouseReleased() {
  draggingCreature = false;
}

function keyPressed() {
  if (key >= '0' && key <= '9' && allowOverlays) {
    exampleHeld[int(key)] = true;
  }
}

function keyReleased() {
  if (key >= '0' && key <= '9') {
    exampleHeld[int(key)] = false;
  }
}

// -----------------------------
// UI binding
// -----------------------------

function bindUI() {
  ui.scaleSlider = document.getElementById('scaleSlider');
  ui.nameInput = document.getElementById('nameInput');
  ui.ab1Enabled = document.getElementById('ab1Enabled');
  ui.ab2Enabled = document.getElementById('ab2Enabled');
  ui.ab1Text = document.getElementById('ab1Text');
  ui.ab2Text = document.getElementById('ab2Text');
  ui.ab1Type = document.getElementById('ab1Type');
  ui.ab2Type = document.getElementById('ab2Type');
  ui.familyRow = document.getElementById('familyRow');
  ui.costGrid = document.getElementById('costGrid');
  ui.tokenGrid = document.getElementById('tokenGrid');
  ui.creatureFile = document.getElementById('creatureFile');
  ui.exportBtn = document.getElementById('exportBtn');

  // Fill initial textarea values from demoCard
  ui.ab1Text.value = demoCard.abilities[0]?.abilityText ?? '';
  ui.ab2Text.value = demoCard.abilities[1]?.abilityText ?? '';

  // Track last-focused ability field (for token insertion)
  ui.ab1Text.addEventListener('focus', () => { lastAbilityFocused = ui.ab1Text; });
  ui.ab2Text.addEventListener('focus', () => { lastAbilityFocused = ui.ab2Text; });

  // Name live
  ui.nameInput.addEventListener('input', () => {
    demoCard.creatureName = ui.nameInput.value;
  });

  // Ability live
  ui.ab1Text.addEventListener('input', () => syncAbilitiesFromUI());
  ui.ab2Text.addEventListener('input', () => syncAbilitiesFromUI());
  ui.ab1Enabled.addEventListener('change', () => syncAbilitiesFromUI());
  ui.ab2Enabled.addEventListener('change', () => syncAbilitiesFromUI());

  // Scale slider (0..100)
  ui.scaleSlider.addEventListener('input', () => {
    const t = parseInt(ui.scaleSlider.value, 10) / 100.0;
    const scale = lerp(creatureScaleMin, creatureScaleMax, t);
    demoCard.creatureWFrac = baseCreatureWFrac * scale;
    demoCard.creatureHFrac = baseCreatureHFrac * scale;
  });

  // Family buttons
  const families = [
    { fam: Family.FIRE, label: 'Огонь', color: FIRE_COLOR },
    { fam: Family.WATER, label: 'Вода', color: WATER_COLOR },
    { fam: Family.EARTH, label: 'Земля', color: EARTH_COLOR },
    { fam: Family.AIR, label: 'Воздух', color: AIR_COLOR },
    { fam: Family.DRAGON, label: 'Дракон', color: DRAGON_COLOR },
  ];

  ui.familyButtons = families.map((f) => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = f.label;
    b.style.background = `rgb(${f.color[0]},${f.color[1]},${f.color[2]})`;
    b.addEventListener('click', () => {
      demoCard.family = f.fam;
      demoCard.backgroundImg = familyBG.get(demoCard.family);
      updateCostImageIfNeeded(true);
      refreshSelectedStates();
    });
    ui.familyRow.appendChild(b);
    return b;
  });

  // Cost buttons 0..12
  ui.costButtons = [];
  for (let i = 0; i <= 12; i++) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = String(i);
    b.addEventListener('click', () => {
      demoCard.summonCost = i;
      updateCostImageIfNeeded(true);
      refreshSelectedStates();
    });
    ui.costGrid.appendChild(b);
    ui.costButtons.push(b);
  }

  // Ability type selectors (3 icon buttons per ability)
  ui.ab1TypeButtons = makeAbilityTypeColumn(ui.ab1Type, (t) => {
    ui.ab1TypeSelected = t;
    syncAbilitiesFromUI();
  });
  ui.ab2TypeButtons = makeAbilityTypeColumn(ui.ab2Type, (t) => {
    ui.ab2TypeSelected = t;
    syncAbilitiesFromUI();
  });

  // Default selected types from current abilities
  ui.ab1TypeSelected = demoCard.abilities[0]?.type ?? AbilityType.CONTINUOUS;
  ui.ab2TypeSelected = demoCard.abilities[1]?.type ?? AbilityType.IMMEDIATE;

  // Token buttons
  const tokenButtons = [
    { label:'Огонь', ins:'{fire}', color:FIRE_COLOR },
    { label:'Вода', ins:'{water}', color:WATER_COLOR },
    { label:'Земля', ins:'{earth}', color:EARTH_COLOR },
    { label:'Воздух', ins:'{air}', color:AIR_COLOR },
    { label:'Дракон', ins:'{dragon}', color:DRAGON_COLOR },
    { label:'WP', ins:'{?WP}', color:[90,90,90] },
    { label:'1', ins:'{1gem}', color:[70,70,70] },
    { label:'3', ins:'{3gem}', color:[70,70,70] },
    { label:'6', ins:'{6gem}', color:[70,70,70] },
    { label:'I', ins:'{IMMEDIATE}', color:[70,70,70] },
    { label:'C', ins:'{CONTINUOUS}', color:[70,70,70] },
    { label:'P', ins:'{PERIODIC}', color:[70,70,70] },
  ];

  ui.tokenButtons = tokenButtons.map((t) => {
    const b = document.createElement('button');
    b.className = 'btn token';
    b.textContent = t.label;
    b.style.background = `rgb(${t.color[0]},${t.color[1]},${t.color[2]})`;
    b.addEventListener('click', () => insertTokenIntoLastAbility(t.ins));
    ui.tokenGrid.appendChild(b);
    return b;
  });

  // File picker
  ui.creatureFile.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    loadImage(url, (img) => {
      demoCard.creatureImg = img;
      URL.revokeObjectURL(url);
    }, () => {
      console.warn('Failed to load creature image');
      URL.revokeObjectURL(url);
    });
  });

  // Export
  ui.exportBtn.addEventListener('click', () => exportHdPng());

  refreshSelectedStates();
  syncAbilitiesFromUI();
}

function makeAbilityTypeColumn(parentEl, onSelect) {
  const types = [
    { t: AbilityType.IMMEDIATE, iconKey:'IMMEDIATE' },
    { t: AbilityType.CONTINUOUS, iconKey:'CONTINUOUS' },
    { t: AbilityType.PERIODIC, iconKey:'PERIODIC' },
  ];

  const buttons = types.map((it) => {
    const b = document.createElement('button');
    b.className = 'typeBtn';

    // Use icon image if available
    const img = document.createElement('img');
    img.alt = it.t;
    img.src = `assets/icon_${it.iconKey.toLowerCase()}.png`;
    b.appendChild(img);

    b.addEventListener('click', () => {
      onSelect(it.t);
      refreshSelectedStates();
    });

    parentEl.appendChild(b);
    return { type: it.t, btn: b };
  });

  return buttons;
}

function refreshSelectedStates() {
  // Family selection highlight
  const famOrder = [Family.FIRE, Family.WATER, Family.EARTH, Family.AIR, Family.DRAGON];
  for (let i = 0; i < ui.familyButtons.length; i++) {
    ui.familyButtons[i].classList.toggle('selected', demoCard.family === famOrder[i]);
  }

  // Cost selection highlight
  for (let i = 0; i < ui.costButtons.length; i++) {
    ui.costButtons[i].classList.toggle('selected', demoCard.summonCost === i);
  }

  // Ability type highlight
  for (const it of ui.ab1TypeButtons) it.btn.classList.toggle('selected', it.type === ui.ab1TypeSelected);
  for (const it of ui.ab2TypeButtons) it.btn.classList.toggle('selected', it.type === ui.ab2TypeSelected);
}

function syncAbilitiesFromUI() {
  const abilities = [];
  if (ui.ab1Enabled.checked) abilities.push(new Ability(ui.ab1TypeSelected ?? AbilityType.CONTINUOUS, ui.ab1Text.value));
  if (ui.ab2Enabled.checked) abilities.push(new Ability(ui.ab2TypeSelected ?? AbilityType.IMMEDIATE, ui.ab2Text.value));
  demoCard.abilities = abilities;
}

function updateCostImageIfNeeded(force) {
  const key = `${demoCard.family}_${demoCard.summonCost}`;
  if (!force && key === lastCostKey) return;
  lastCostKey = key;

  demoCard.costImage = loadCostImage(demoCard.family, demoCard.summonCost);
}

function insertTokenIntoLastAbility(tokenStr) {
  const ta = lastAbilityFocused || ui.ab1Text;
  ta.focus();

  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  const before = ta.value.substring(0, start);
  const after = ta.value.substring(end);
  ta.value = before + tokenStr + after;

  const caret = start + tokenStr.length;
  ta.selectionStart = ta.selectionEnd = caret;
  lastAbilityFocused = ta;

  syncAbilitiesFromUI();
}
