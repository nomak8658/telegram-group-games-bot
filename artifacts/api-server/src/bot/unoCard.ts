import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = __dirname.endsWith("bot")
  ? path.join(__dirname, "assets")
  : path.join(__dirname, "bot", "assets");

let _canvas: typeof import("@napi-rs/canvas") | null = null;
async function getCanvas() {
  if (!_canvas) _canvas = await import("@napi-rs/canvas");
  return _canvas;
}

let fontsLoaded = false;
async function ensureFonts() {
  if (fontsLoaded) return;
  const cv = await getCanvas();
  cv.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),    "CairoBold");
  cv.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  fontsLoaded = true;
}

const CARD_COLORS: Record<string, string> = {
  red:    "#CC2200",
  blue:   "#1155BB",
  green:  "#229933",
  yellow: "#DDAA00",
  wild:   "#111111",
};
const CARD_COLORS_LIGHT: Record<string, string> = {
  red:    "#FF4422",
  blue:   "#2277EE",
  green:  "#33BB44",
  yellow: "#FFCC11",
  wild:   "#444444",
};
const CARD_COLORS_AR: Record<string, string> = {
  red: "أحمر", blue: "أزرق", green: "أخضر", yellow: "أصفر", wild: "جوكر",
};
export const VALUE_AR: Record<string, string> = {
  skip: "حظر", reverse: "عكس", "+2": "+٢", wild: "جوكر", "+4": "+٤",
};

type SKCtx = import("@napi-rs/canvas").SKRSContext2D;

function roundRect(ctx: SKCtx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawUnoCardShape(
  ctx: SKCtx,
  x: number, y: number, w: number, h: number,
  color: string, lightColor: string,
  valueText: string,
) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, Math.round(w * 0.13));
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = Math.max(2, w * 0.025);
  ctx.stroke();

  const ow = w * 0.64, oh = h * 0.62;
  const ox = x + w / 2, oy = y + h / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(Math.PI * -0.12);
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, ow / 2, oh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const maxFontPx = Math.round(w * 0.38);
  const fontSize  = valueText.length > 2 ? Math.round(maxFontPx * 0.72) : maxFontPx;
  ctx.font        = `bold ${fontSize}px CairoBold`;
  ctx.textAlign   = "center";
  ctx.fillStyle   = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur  = 7;
  ctx.fillText(valueText, x + w / 2, y + h / 2 + fontSize * 0.37);
  ctx.shadowBlur  = 0;

  const cs = Math.round(fontSize * 0.38);
  ctx.font       = `bold ${cs}px CairoBold`;
  ctx.fillStyle  = "rgba(255,255,255,0.9)";
  ctx.textAlign  = "left";
  ctx.fillText(valueText, x + 6, y + cs + 4);
  ctx.textAlign  = "right";
  ctx.fillText(valueText, x + w - 6, y + h - 5);
}

// ─── Hand image ────────────────────────────────────────────────────────────────
// Shows all player cards in a row with playable ones highlighted

export interface HandCard {
  color: string;
  value: string;
  playable: boolean;
}

export async function generateUnoHandImage(cards: HandCard[]): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const n     = cards.length;
  const small = n > 10;
  const CW    = small ? 58 : 74;
  const CH    = Math.round(CW * 1.48);
  const GAP   = 5;
  const PAD   = 16;
  const W     = Math.max(n * (CW + GAP) - GAP + PAD * 2, 240);
  const H     = CH + PAD * 2 + 24; // 24 for "playable" indicator below

  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as SKCtx;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0d0d1e");
  bg.addColorStop(1, "#130a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < n; i++) {
    const c  = cards[i];
    const x  = PAD + i * (CW + GAP);
    const y  = PAD;
    const col  = CARD_COLORS[c.color]  ?? CARD_COLORS["wild"];
    const colL = CARD_COLORS_LIGHT[c.color] ?? CARD_COLORS_LIGHT["wild"];
    const val  = VALUE_AR[c.value] ?? c.value;

    // Glow for playable cards
    if (c.playable) {
      ctx.save();
      ctx.shadowColor = colL;
      ctx.shadowBlur  = 16;
      ctx.fillStyle   = "transparent";
      roundRect(ctx, x, y, CW, CH, Math.round(CW * 0.13));
      ctx.fill();
      ctx.restore();
    }

    drawUnoCardShape(ctx, x, y, CW, CH, col, colL, val);

    // Dim non-playable
    if (!c.playable) {
      ctx.save();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle   = "#000000";
      roundRect(ctx, x, y, CW, CH, Math.round(CW * 0.13));
      ctx.fill();
      ctx.restore();
    }

    // Number label below
    ctx.font      = `bold ${small ? 11 : 13}px CairoBold`;
    ctx.textAlign = "center";
    ctx.fillStyle = c.playable ? "#ffffff" : "rgba(255,255,255,0.35)";
    ctx.fillText(String(i + 1), x + CW / 2, y + CH + 16);
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Group state image ─────────────────────────────────────────────────────────
// Left: big top card   Right: player list + current color

export interface GroupStatePlayer {
  name:          string;
  cards:         number;
  isCurrentTurn: boolean;
  hasUno:        boolean;
}

export async function generateUnoGroupStateImage(
  topCard:      { color: string; value: string },
  currentColor: string,
  players:      GroupStatePlayer[],
  direction:    1 | -1,
  round:        number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W     = 900;
  const rowH  = 58;
  const H     = Math.max(420, 120 + players.length * rowH + 60);
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as SKCtx;

  // Dark background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#080012");
  bg.addColorStop(1, "#120008");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle noise overlay
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  for (let i = 0; i < W; i += 4) {
    for (let j = 0; j < H; j += 4) {
      if (Math.random() > 0.5) ctx.fillRect(i, j, 2, 2);
    }
  }

  // ── LEFT: big top card ─────────────────────────────────────────────────────
  const CW = 220, CH = 310;
  const CX = 30, CY = (H - CH) / 2;
  const col  = CARD_COLORS[currentColor]       ?? CARD_COLORS["wild"];
  const colL = CARD_COLORS_LIGHT[currentColor] ?? CARD_COLORS_LIGHT["wild"];
  const val  = VALUE_AR[topCard.value] ?? topCard.value;

  // Card glow
  ctx.save();
  ctx.shadowColor = colL;
  ctx.shadowBlur  = 55;
  ctx.fillStyle   = "transparent";
  roundRect(ctx, CX, CY, CW, CH, 22);
  ctx.fill();
  ctx.restore();

  drawUnoCardShape(ctx, CX, CY, CW, CH, col, colL, val);

  // Effective color label under card (if wild)
  if (topCard.color === "wild" && currentColor !== "wild") {
    ctx.font      = "bold 17px CairoBold";
    ctx.fillStyle = colL;
    ctx.textAlign = "center";
    ctx.fillText(CARD_COLORS_AR[currentColor] ?? "", CX + CW / 2, CY + CH + 26);
  }

  // ── Divider ────────────────────────────────────────────────────────────────
  const divX = CX + CW + 30;
  const divGrad = ctx.createLinearGradient(divX, 0, divX, H);
  divGrad.addColorStop(0,   "rgba(255,255,255,0)");
  divGrad.addColorStop(0.3, "rgba(255,255,255,0.15)");
  divGrad.addColorStop(0.7, "rgba(255,255,255,0.15)");
  divGrad.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.strokeStyle = divGrad;
  ctx.lineWidth   = 1;
  ctx.beginPath(); ctx.moveTo(divX, 20); ctx.lineTo(divX, H - 20); ctx.stroke();

  // ── RIGHT: header + player list ────────────────────────────────────────────
  const RX = divX + 28;
  const RW = W - RX - 20;

  // UNO title
  ctx.save();
  ctx.font        = "bold 48px CairoBold";
  ctx.textAlign   = "right";
  ctx.shadowColor = colL;
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText("UNO", W - 24, 58);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // Round + direction
  ctx.font      = "18px Cairo";
  ctx.fillStyle = "rgba(200,200,200,0.55)";
  ctx.textAlign = "right";
  ctx.fillText(`دور ${round}   ${direction === 1 ? "←" : "→"}`, W - 24, 84);

  // Color indicator circle
  const circX = RX + 26, circY = 50;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(circX, circY, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth   = 2;
  ctx.stroke();

  ctx.font      = "16px Cairo";
  ctx.fillStyle = "rgba(200,200,200,0.65)";
  ctx.textAlign = "left";
  ctx.fillText(CARD_COLORS_AR[currentColor] ?? "", circX + 28, circY + 6);

  // Player list
  let py = 115;
  for (const p of players) {
    const midY = py + rowH / 2 - 2;

    // Row highlight for current player
    if (p.isCurrentTurn) {
      const rowGrad = ctx.createLinearGradient(RX - 8, py, W, py);
      rowGrad.addColorStop(0, "rgba(255,200,0,0.18)");
      rowGrad.addColorStop(1, "rgba(255,200,0,0.04)");
      ctx.fillStyle = rowGrad;
      roundRect(ctx, RX - 8, py, RW + 8, rowH - 4, 8);
      ctx.fill();
    }

    // Arrow
    ctx.font      = "bold 18px CairoBold";
    ctx.fillStyle = p.isCurrentTurn ? "#ffd700" : "rgba(150,150,150,0.3)";
    ctx.textAlign = "left";
    ctx.fillText(p.isCurrentTurn ? ">" : " ", RX - 4, midY + 9);

    // Name
    const name     = p.name.length > 18 ? p.name.slice(0, 18) + "…" : p.name;
    ctx.font      = p.isCurrentTurn ? "bold 22px CairoBold" : "20px Cairo";
    ctx.fillStyle = p.isCurrentTurn ? "#ffd700" : "#cccccc";
    ctx.textAlign = "left";
    ctx.fillText(name, RX + 18, midY + 9);

    // UNO warning
    if (p.hasUno) {
      ctx.font      = "bold 14px CairoBold";
      ctx.fillStyle = "#ff3333";
      ctx.textAlign = "left";
      ctx.fillText("UNO!", RX + 18, midY + 24);
    }

    // Card count bars (right side)
    const dots  = Math.min(p.cards, 14);
    const bar   = "█".repeat(dots) + (p.cards > 14 ? `+${p.cards - 14}` : "");
    ctx.font      = `${p.isCurrentTurn ? 14 : 12}px Cairo`;
    ctx.fillStyle = p.isCurrentTurn ? "rgba(255,200,0,0.85)" : "rgba(140,140,140,0.6)";
    ctx.textAlign = "right";
    ctx.fillText(bar, W - 60, midY + 9);

    ctx.font      = "bold 16px CairoBold";
    ctx.fillStyle = p.isCurrentTurn ? "#ffd700" : "rgba(180,180,180,0.6)";
    ctx.textAlign = "right";
    ctx.fillText(String(p.cards), W - 24, midY + 9);

    // Row divider
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(RX, py + rowH - 2); ctx.lineTo(W - 10, py + rowH - 2); ctx.stroke();

    py += rowH;
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Top card (solo) ──────────────────────────────────────────────────────────
// kept for compatibility / launch image

export async function generateUnoTopCardImage(
  cardColor: string,
  cardValue: string,
  currentColor: string,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 340, H = 480;
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as SKCtx;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a0a");
  bg.addColorStop(1, "#1a1a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glowColor = CARD_COLORS_LIGHT[currentColor] ?? "#ffffff";
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 60;
  ctx.fillStyle   = "transparent";
  roundRect(ctx, 40, 40, W - 80, H - 80, 24);
  ctx.fill();
  ctx.restore();

  const c     = CARD_COLORS[currentColor]       ?? CARD_COLORS["wild"];
  const cL    = CARD_COLORS_LIGHT[currentColor] ?? "#aaaaaa";
  const vText = VALUE_AR[cardValue] ?? cardValue;
  drawUnoCardShape(ctx, 40, 40, W - 80, H - 80, c, cL, vText);

  if (cardColor === "wild" && currentColor !== "wild") {
    ctx.font      = "bold 18px CairoBold";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.textAlign = "center";
    ctx.fillText(`اللون: ${CARD_COLORS_AR[currentColor]}`, W / 2, H - 14);
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export interface UnoPlayerResult {
  name:      string;
  cards:     number;
  isWinner:  boolean;
}

export async function generateUnoWinnerCard(
  winner: string,
  players: UnoPlayerResult[],
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W     = 900;
  const rowH  = 70;
  const H     = 180 + players.length * rowH + 40;
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as SKCtx;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#080010");
  bg.addColorStop(0.5, "#100020");
  bg.addColorStop(1,   "#080010");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const decorColors = ["#CC2200","#1155BB","#229933","#DDAA00"];
  const decorSize   = 70;
  decorColors.forEach((col, i) => {
    ctx.save();
    ctx.globalAlpha = 0.3;
    const cx = i % 2 === 0 ? -20 : W - decorSize + 20;
    const cy = i < 2      ? -20 : H - decorSize + 20;
    roundRect(ctx, cx, cy, decorSize, decorSize + 100, 12);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  });

  const radial = ctx.createRadialGradient(W/2, 90, 10, W/2, 90, 200);
  radial.addColorStop(0, "rgba(255,220,0,0.25)");
  radial.addColorStop(1, "rgba(255,220,0,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.font        = "bold 52px CairoBold";
  ctx.textAlign   = "center";
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText("UNO", W / 2, 72);
  ctx.shadowBlur  = 0;
  ctx.font        = "bold 26px CairoBold";
  ctx.fillStyle   = "rgba(255,220,0,0.85)";
  ctx.fillText("انتهت اللعبة!", W / 2, 108);
  ctx.restore();

  const div = ctx.createLinearGradient(0, 0, W, 0);
  div.addColorStop(0,   "rgba(255,200,0,0)");
  div.addColorStop(0.5, "rgba(255,200,0,0.6)");
  div.addColorStop(1,   "rgba(255,200,0,0)");
  ctx.strokeStyle = div;
  ctx.lineWidth   = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 130); ctx.lineTo(W, 130); ctx.stroke();

  ctx.save();
  ctx.font        = "bold 30px CairoBold";
  ctx.textAlign   = "center";
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = "#ffd700";
  ctx.fillText(winner, W / 2, 168);
  ctx.shadowBlur  = 0;
  ctx.restore();

  const sorted = [...players].sort((a, b) => a.cards - b.cards);
  sorted.forEach((p, i) => {
    const ry  = 190 + i * rowH;
    ctx.fillStyle = p.isWinner
      ? "rgba(255,200,0,0.12)"
      : i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)";
    ctx.fillRect(0, ry, W, rowH - 2);
    const midY = ry + rowH / 2;

    ctx.font      = "bold 22px CairoBold";
    ctx.fillStyle = p.isWinner ? "#ffd700" : "rgba(180,180,180,0.8)";
    ctx.textAlign = "center";
    ctx.fillText(p.isWinner ? "1" : String(i + 1), 36, midY + 9);

    ctx.font      = p.isWinner ? "bold 24px CairoBold" : "20px Cairo";
    ctx.fillStyle = p.isWinner ? "#ffd700" : "#cccccc";
    ctx.textAlign = "left";
    const name    = p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name;
    ctx.fillText(name, 70, midY + 9);

    ctx.font      = "bold 20px CairoBold";
    ctx.textAlign = "right";
    if (p.isWinner) {
      ctx.fillStyle = "#00ff88";
      ctx.fillText("0 أوراق — فاز!", W - 32, midY + 9);
    } else {
      ctx.fillStyle = "rgba(200,200,200,0.7)";
      ctx.fillText(`${p.cards} ${p.cards === 1 ? "ورقة" : "أوراق"}`, W - 32, midY + 9);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, ry + rowH - 2); ctx.lineTo(W, ry + rowH - 2); ctx.stroke();
  });

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
