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

// Color mapping
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
const VALUE_AR: Record<string, string> = {
  skip: "حظر", reverse: "عكس", "+2": "+٢", wild: "جوكر", "+4": "+٤",
};

type CanvasRenderingContext2D = import("@napi-rs/canvas").SKRSContext2D;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

// Draw a single UNO card shape on the canvas at (x,y) with dimensions (w,h)
function drawUnoCardShape(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  color: string, lightColor: string,
  valueText: string,
) {
  // Card body
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();

  // White border
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Inner oval
  const ow = w * 0.62, oh = h * 0.62;
  const ox = x + w / 2, oy = y + h / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(Math.PI * -0.12);
  ctx.fillStyle = lightColor;
  ctx.beginPath();
  ctx.ellipse(0, 0, ow / 2, oh / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Value text in center
  const fontSize = w < 120 ? 28 : w < 180 ? 44 : 64;
  ctx.font = `bold ${fontSize}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 6;
  ctx.fillText(valueText, x + w / 2, y + h / 2 + fontSize * 0.35);
  ctx.shadowBlur = 0;

  // Corner labels (small)
  const cornerSize = Math.round(fontSize * 0.38);
  ctx.font = `bold ${cornerSize}px CairoBold`;
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.textAlign = "left";
  ctx.fillText(valueText, x + 8, y + 20);
  ctx.textAlign = "right";
  ctx.fillText(valueText, x + w - 8, y + h - 6);
}

// ─── Top card image ────────────────────────────────────────────────────────────

export async function generateUnoTopCardImage(
  cardColor: string,
  cardValue: string,
  currentColor: string, // effective color (for wild)
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 340, H = 480;
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a0a0a");
  bg.addColorStop(1, "#1a1a1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Glow halo behind card
  const glowColor = CARD_COLORS_LIGHT[currentColor] ?? "#ffffff";
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 60;
  ctx.fillStyle = "transparent";
  roundRect(ctx, 40, 40, W - 80, H - 80, 24);
  ctx.fill();
  ctx.restore();

  const c     = CARD_COLORS[currentColor] ?? CARD_COLORS["wild"];
  const cL    = CARD_COLORS_LIGHT[currentColor] ?? "#aaaaaa";
  const vText = VALUE_AR[cardValue] ?? cardValue;

  drawUnoCardShape(ctx, 40, 40, W - 80, H - 80, c, cL, vText);

  // If wild, overlay the effective color indicator
  if (cardColor === "wild" && currentColor !== "wild") {
    ctx.font = "bold 18px CairoBold";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.textAlign = "center";
    ctx.fillText(`اللون: ${CARD_COLORS_AR[currentColor]}`, W / 2, H - 14);
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export interface UnoPlayerResult {
  name:      string;
  cards:     number; // cards left at end
  isWinner:  boolean;
}

export async function generateUnoWinnerCard(
  winner: string,
  players: UnoPlayerResult[],
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 900;
  const rowH = 70;
  const H = 180 + players.length * rowH + 40;
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // Background — dark with UNO color palette
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#080010");
  bg.addColorStop(0.5, "#100020");
  bg.addColorStop(1,   "#080010");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Decorative corner cards
  const decorColors = ["#CC2200","#1155BB","#229933","#DDAA00"];
  const decorSize = 70;
  decorColors.forEach((col, i) => {
    ctx.save();
    ctx.globalAlpha = 0.3;
    const cx = i < 2 ? (i === 0 ? -20 : W - decorSize + 20) : (i === 2 ? -20 : W - decorSize + 20);
    const cy = i < 2 ? -20 : H - decorSize + 20;
    roundRect(ctx, cx, cy, decorSize, decorSize + 100, 12);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  });

  // Radial glow
  const radial = ctx.createRadialGradient(W/2, 90, 10, W/2, 90, 200);
  radial.addColorStop(0, "rgba(255,220,0,0.25)");
  radial.addColorStop(1, "rgba(255,220,0,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // ── Header
  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText("UNO", W / 2, 72);
  ctx.shadowBlur  = 0;
  ctx.font = "bold 26px CairoBold";
  ctx.fillStyle = "rgba(255,220,0,0.85)";
  ctx.fillText("انتهت اللعبة!", W / 2, 108);
  ctx.restore();

  // Header divider
  const div = ctx.createLinearGradient(0, 0, W, 0);
  div.addColorStop(0,   "rgba(255,200,0,0)");
  div.addColorStop(0.5, "rgba(255,200,0,0.6)");
  div.addColorStop(1,   "rgba(255,200,0,0)");
  ctx.strokeStyle = div;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, 130); ctx.lineTo(W, 130); ctx.stroke();

  // Winner spotlight
  ctx.save();
  ctx.font = "bold 30px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur  = 20;
  ctx.fillStyle   = "#ffd700";
  ctx.fillText(`🏆  ${winner}`, W / 2, 168);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // ── Player rows
  const sorted = [...players].sort((a, b) => a.cards - b.cards);

  sorted.forEach((p, i) => {
    const ry = 190 + i * rowH;

    // Row bg
    if (p.isWinner) {
      ctx.fillStyle = "rgba(255,200,0,0.12)";
    } else {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.02)";
    }
    ctx.fillRect(0, ry, W, rowH - 2);

    const midY = ry + rowH / 2;

    // Rank
    const medal = p.isWinner ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`;
    ctx.font = "bold 22px CairoBold";
    ctx.fillStyle = p.isWinner ? "#ffd700" : "rgba(180,180,180,0.8)";
    ctx.textAlign = "center";
    ctx.fillText(medal, 36, midY + 9);

    // Name
    ctx.font = p.isWinner ? "bold 24px CairoBold" : "20px Cairo";
    ctx.fillStyle = p.isWinner ? "#ffd700" : "#cccccc";
    ctx.textAlign = "left";
    const name = p.name.length > 20 ? p.name.slice(0, 20) + "…" : p.name;
    ctx.fillText(name, 70, midY + 9);

    // Cards left
    ctx.font = "bold 20px CairoBold";
    ctx.textAlign = "right";
    if (p.isWinner) {
      ctx.fillStyle = "#00ff88";
      ctx.fillText("0 أوراق — فاز!", W - 32, midY + 9);
    } else {
      ctx.fillStyle = "rgba(200,200,200,0.7)";
      ctx.fillText(`${p.cards} ${p.cards === 1 ? "ورقة" : "أوراق"}`, W - 32, midY + 9);
    }

    // Row divider
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ry + rowH - 2); ctx.lineTo(W, ry + rowH - 2); ctx.stroke();
  });

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
