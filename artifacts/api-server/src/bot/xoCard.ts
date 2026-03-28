import path from "path";
import { fileURLToPath } from "url";
import type { XoBoard } from "./state.js";

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

// ─── Palette (matches reference image) ───────────────────────────────────────
const X_COLOR  = "#FF5060";   // neon pink-red (X pieces)
const O_COLOR  = "#00D4FF";   // neon cyan     (O pieces)
const GRID_CLR = "#2255AA";   // grid line blue
const BG_DARK  = "#0A0D14";   // very dark navy
const GOLD     = "#FFD700";
const CORNER_C = "#FF3355";   // red corner brackets

function limitName(s: string, max = 14): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

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

// ─── Background ───────────────────────────────────────────────────────────────
function drawBg(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = BG_DARK;
  ctx.fillRect(0, 0, W, H);
  // subtle radial glow center
  const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.65);
  rg.addColorStop(0, "rgba(20,40,80,0.55)");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

// ─── Corner brackets ──────────────────────────────────────────────────────────
function drawCornerBrackets(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, gw: number, gh: number,
  col = CORNER_C, arm = 28, lw = 3,
) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth   = lw;
  ctx.lineCap     = "square";
  ctx.shadowColor = col;
  ctx.shadowBlur  = 10;

  const corners = [
    [gx,      gy,       1,  1],
    [gx + gw, gy,      -1,  1],
    [gx,      gy + gh,  1, -1],
    [gx + gw, gy + gh, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(cx + dx * arm, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + dy * arm);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Grid lines (solid, full-length) ─────────────────────────────────────────
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, cellSize: number, gap: number,
) {
  const total = cellSize * 3 + gap * 2;
  ctx.save();
  ctx.strokeStyle = GRID_CLR;
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = "round";
  ctx.shadowColor = GRID_CLR;
  ctx.shadowBlur  = 8;

  for (let i = 1; i < 3; i++) {
    const x = gx + i * (cellSize + gap) - gap / 2;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy + total);
    ctx.stroke();
  }
  for (let i = 1; i < 3; i++) {
    const y = gy + i * (cellSize + gap) - gap / 2;
    ctx.beginPath();
    ctx.moveTo(gx, y);
    ctx.lineTo(gx + total, y);
    ctx.stroke();
  }
  ctx.restore();
}

// ─── Neon X (pink-red, tube effect) ──────────────────────────────────────────
function drawX(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  const half = size * 0.40;

  // outer glow pass
  ctx.shadowColor = col;
  ctx.shadowBlur  = 45;
  ctx.strokeStyle = col;
  ctx.lineWidth   = size * 0.28;
  ctx.globalAlpha = alpha * 0.25;
  ctx.beginPath(); ctx.moveTo(cx - half, cy - half); ctx.lineTo(cx + half, cy + half); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + half, cy - half); ctx.lineTo(cx - half, cy + half); ctx.stroke();

  // mid glow pass
  ctx.shadowBlur  = 22;
  ctx.lineWidth   = size * 0.18;
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath(); ctx.moveTo(cx - half, cy - half); ctx.lineTo(cx + half, cy + half); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + half, cy - half); ctx.lineTo(cx - half, cy + half); ctx.stroke();

  // bright core
  ctx.shadowBlur  = 12;
  ctx.strokeStyle = "#FFAAAA";
  ctx.lineWidth   = size * 0.07;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath(); ctx.moveTo(cx - half, cy - half); ctx.lineTo(cx + half, cy + half); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + half, cy - half); ctx.lineTo(cx - half, cy + half); ctx.stroke();

  ctx.restore();
}

// ─── Neon O (cyan, tube effect) ───────────────────────────────────────────────
function drawO(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  const r = size * 0.40;

  // outer glow
  ctx.shadowColor = col;
  ctx.shadowBlur  = 45;
  ctx.strokeStyle = col;
  ctx.lineWidth   = size * 0.28;
  ctx.globalAlpha = alpha * 0.25;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  // mid glow
  ctx.shadowBlur  = 22;
  ctx.lineWidth   = size * 0.18;
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  // bright core
  ctx.shadowBlur  = 12;
  ctx.strokeStyle = "#AAEEFF";
  ctx.lineWidth   = size * 0.07;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  ctx.restore();
}

// ─── Win strike line ──────────────────────────────────────────────────────────
function drawWinLine(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, cellSize: number, gap: number,
  winLine: [number, number, number], board: XoBoard,
) {
  const getCenter = (idx: number) => ({
    x: gx + (idx % 3) * (cellSize + gap) + cellSize / 2,
    y: gy + Math.floor(idx / 3) * (cellSize + gap) + cellSize / 2,
  });
  const [a, , c] = winLine;
  const pa = getCenter(a);
  const pc = getCenter(c);
  const winColor = board[a] === "X" ? X_COLOR : O_COLOR;
  const ext = cellSize * 0.55;
  const dx = pc.x - pa.x;
  const dy = pc.y - pa.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (dx / len) * ext;
  const ny = (dy / len) * ext;

  ctx.save();
  // glow pass
  ctx.strokeStyle = winColor;
  ctx.lineWidth   = 10;
  ctx.lineCap     = "round";
  ctx.shadowColor = winColor;
  ctx.shadowBlur  = 40;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(pa.x - nx, pa.y - ny);
  ctx.lineTo(pc.x + nx, pc.y + ny);
  ctx.stroke();
  // bright core
  ctx.shadowBlur  = 15;
  ctx.lineWidth   = 5;
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "#FFFFFF";
  ctx.beginPath();
  ctx.moveTo(pa.x - nx, pa.y - ny);
  ctx.lineTo(pc.x + nx, pc.y + ny);
  ctx.stroke();
  ctx.restore();
}

// ─── Full grid renderer ───────────────────────────────────────────────────────
function drawGrid(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, cellSize: number, gap: number,
  board: XoBoard,
  winLine?: [number, number, number] | null,
  showNums = false,
) {
  drawGridLines(ctx, gx, gy, cellSize, gap);

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = gx + col * (cellSize + gap) + cellSize / 2;
    const cy = gy + row * (cellSize + gap) + cellSize / 2;
    const isWinCell = winLine?.includes(i);
    const cellAlpha = !winLine || isWinCell ? 1 : 0.3;

    if (board[i] === "X") {
      drawX(ctx, cx, cy, cellSize * 0.76, X_COLOR, cellAlpha);
    } else if (board[i] === "O") {
      drawO(ctx, cx, cy, cellSize * 0.76, O_COLOR, cellAlpha);
    } else if (showNums) {
      // Show cell number in empty cells
      ctx.save();
      ctx.font = `18px Cairo`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(120,140,180,0.45)";
      ctx.fillText(String(i + 1), cx, cy);
      ctx.restore();
    }
  }

  if (winLine) drawWinLine(ctx, gx, gy, cellSize, gap, winLine, board);
}

// ─── Horizontal divider line ──────────────────────────────────────────────────
function hLine(ctx: CanvasRenderingContext2D, W: number, y: number, col: string, alpha = 0.35) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, col.replace("rgb(", `rgba(`).replace(")", `,${alpha})`));
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Board card (game in progress)
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateXoBoardCard(
  hostName: string,
  guestName: string,
  hostSymbol: "X" | "O",
  board: XoBoard,
  turn: "host" | "guest" | null,
  winLine?: [number, number, number] | null,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 800, H = 800;
  const CELL = 196, GAP = 16;
  const GRID_W = CELL * 3 + GAP * 2;
  const GRID_X = (W - GRID_W) / 2;
  const GRID_Y = 110;

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx, W, H);

  const guestSymbol = hostSymbol === "X" ? "O" : "X";
  const hostCol     = hostSymbol  === "X" ? X_COLOR : O_COLOR;
  const guestCol    = guestSymbol === "X" ? X_COLOR : O_COLOR;

  // Side glows
  const le = ctx.createLinearGradient(0, 0, 200, 0);
  le.addColorStop(0, (hostCol + "30")); le.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = le; ctx.fillRect(0, 0, 200, H);
  const re = ctx.createLinearGradient(W, 0, W - 200, 0);
  re.addColorStop(0, (guestCol + "30")); re.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = re; ctx.fillRect(W - 200, 0, 200, H);

  // Player names
  const hActive = turn === "host";
  const gActive = turn === "guest";

  ctx.save();
  ctx.font = "bold 27px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = hostCol + (hActive ? "FF" : "70");
  ctx.shadowColor = hostCol; ctx.shadowBlur = hActive ? 24 : 0;
  ctx.fillText(`${hostSymbol}  ${limitName(hostName)}`, 130, 72);
  ctx.restore();

  ctx.save();
  ctx.font = "bold 27px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = guestCol + (gActive ? "FF" : "70");
  ctx.shadowColor = guestCol; ctx.shadowBlur = gActive ? 24 : 0;
  ctx.fillText(`${limitName(guestName)}  ${guestSymbol}`, W - 130, 72);
  ctx.restore();

  if (turn !== null) {
    const activeCol  = turn === "host" ? hostCol : guestCol;
    const activeName = turn === "host" ? limitName(hostName) : limitName(guestName);
    ctx.save();
    ctx.font = "21px Cairo";
    ctx.textAlign = "center";
    ctx.fillStyle = activeCol + "CC";
    ctx.fillText(`دور ${activeName}`, W / 2, 78);
    ctx.restore();
  }

  hLine(ctx, W, 96, O_COLOR, 0.3);

  drawCornerBrackets(ctx, GRID_X - 4, GRID_Y - 4, GRID_W + 8, GRID_W + 8);
  drawGrid(ctx, GRID_X, GRID_Y, CELL, GAP, board, winLine, true);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Winner card
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateXoWinnerCard(
  winnerName: string,
  loserName: string,
  winnerSymbol: "X" | "O",
  board: XoBoard,
  winLine: [number, number, number],
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 800, H = 800;
  const CELL = 158, GAP = 16;
  const GRID_W = CELL * 3 + GAP * 2;
  const GRID_X = (W - GRID_W) / 2;
  const GRID_Y = 222;

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx, W, H);

  const wCol       = winnerSymbol === "X" ? X_COLOR : O_COLOR;
  const loserSymbol: "X" | "O" = winnerSymbol === "X" ? "O" : "X";

  // Winner glow background
  const rg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
  rg.addColorStop(0, wCol + "28"); rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.font = "bold 58px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD; ctx.shadowBlur = 40;
  ctx.fillText("🏆 الفائز!", W / 2, 70);
  ctx.restore();

  hLine(ctx, W, 90, wCol, 0.5);

  const nLen = limitName(winnerName, 16).length;
  const nfs  = nLen > 12 ? 46 : nLen > 8 ? 56 : 66;
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = wCol; ctx.shadowBlur = 44;
  ctx.fillText(`${winnerSymbol}  ${limitName(winnerName, 16)}`, W / 2, 162);
  ctx.restore();

  ctx.save();
  ctx.font = "20px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fillText(`ضد  ${limitName(loserName, 16)}  ${loserSymbol}`, W / 2, 202);
  ctx.restore();

  hLine(ctx, W, 214, wCol, 0.28);

  drawCornerBrackets(ctx, GRID_X - 4, GRID_Y - 4, GRID_W + 8, GRID_W + 8, wCol);
  drawGrid(ctx, GRID_X, GRID_Y, CELL, GAP, board, winLine, false);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Draw card
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateXoDrawCard(
  hostName: string,
  guestName: string,
  board: XoBoard,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 800, H = 800;
  const CELL = 168, GAP = 16;
  const GRID_W = CELL * 3 + GAP * 2;
  const GRID_X = (W - GRID_W) / 2;
  const GRID_Y = 182;

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx, W, H);

  ctx.save();
  ctx.font = "bold 54px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = O_COLOR;
  ctx.shadowColor = O_COLOR; ctx.shadowBlur = 32;
  ctx.fillText("🤝 تعادل!", W / 2, 70);
  ctx.restore();

  hLine(ctx, W, 90, O_COLOR, 0.4);

  ctx.save();
  ctx.font = "24px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText(`${limitName(hostName)}  ×  ${limitName(guestName)}`, W / 2, 140);
  ctx.restore();

  hLine(ctx, W, 158, O_COLOR, 0.2);

  drawCornerBrackets(ctx, GRID_X - 4, GRID_Y - 4, GRID_W + 8, GRID_W + 8, O_COLOR);
  drawGrid(ctx, GRID_X, GRID_Y, CELL, GAP, board, null, false);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Challenge card
// ═══════════════════════════════════════════════════════════════════════════════

export async function generateXoChallengeCard(hostName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W = 900, H = 520;
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx, W, H);

  // Side tint
  const le = ctx.createLinearGradient(0, 0, 200, 0);
  le.addColorStop(0, "rgba(0,212,255,0.18)"); le.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = le; ctx.fillRect(0, 0, 200, H);
  const re = ctx.createLinearGradient(W, 0, W - 200, 0);
  re.addColorStop(0, "rgba(255,80,96,0.18)"); re.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = re; ctx.fillRect(W - 200, 0, 200, H);

  // Ghost symbols
  drawX(ctx, 110, H / 2, 88, X_COLOR, 0.14);
  drawO(ctx, W - 110, H / 2, 88, O_COLOR, 0.14);

  // Corner brackets on full card
  drawCornerBrackets(ctx, 16, 16, W - 32, H - 32, CORNER_C, 22, 2.5);

  ctx.save();
  const tg = ctx.createLinearGradient(200, 0, 700, 0);
  tg.addColorStop(0, X_COLOR); tg.addColorStop(1, O_COLOR);
  ctx.font = "bold 60px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = tg;
  ctx.shadowColor = O_COLOR; ctx.shadowBlur = 22;
  ctx.fillText("✕  أكس أو  ○", W / 2, 108);
  ctx.restore();

  hLine(ctx, W, 126, O_COLOR, 0.4);

  ctx.font = "20px Cairo";
  ctx.fillStyle = "rgba(0,212,255,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("تحدي مفتوح من", W / 2, 170);

  const name = limitName(hostName, 18);
  const nfs  = name.length > 14 ? 50 : name.length > 10 ? 62 : 76;
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = X_COLOR; ctx.shadowBlur = 38;
  ctx.fillText(name, W / 2, 278);
  ctx.restore();

  ctx.font = "21px Cairo";
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.textAlign = "center";
  ctx.fillText("يتحدى القروب  —  من يجرؤ؟", W / 2, 328);

  hLine(ctx, W, 358, O_COLOR, 0.22);

  ctx.save();
  ctx.fillStyle = "rgba(0,212,255,0.07)";
  roundRect(ctx, W / 2 - 165, H - 82, 330, 46, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,212,255,0.32)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, W / 2 - 165, H - 82, 330, 46, 12);
  ctx.stroke();
  ctx.font = "bold 19px CairoBold";
  ctx.fillStyle = O_COLOR;
  ctx.textAlign = "center";
  ctx.fillText("الفائز أول يكمل صف أو قطر", W / 2, H - 54);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
