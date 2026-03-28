import path from "path";
import { fileURLToPath } from "url";
import type { XoBoard, XoCell } from "./state.js";

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

const W = 900;
const H = 520;

const X_COLOR  = "#00C8FF";
const O_COLOR  = "#FF6535";
const GOLD     = "#FFD700";
const BG1      = "#040812";
const BG2      = "#060a1a";
const CYAN     = "#00D4FF";

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

function drawDiagonalLines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w + h; i += 22) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function hLine(ctx: CanvasRenderingContext2D, y: number, color: string, alpha = 0.7) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, color.replace(")", `,${alpha})`).replace("rgb", "rgba"));
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

function drawBg(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   BG1);
  bg.addColorStop(0.5, BG2);
  bg.addColorStop(1,   BG1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawDiagonalLines(ctx, 0, 0, W, H, "rgba(0,200,255,0.03)");
}

function drawEdgeLines(ctx: CanvasRenderingContext2D, color = CYAN) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, color);
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0,     W, 2);
  ctx.fillRect(0, H - 2, W, 2);
}

function drawX(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = col;
  ctx.shadowBlur = 28;
  ctx.strokeStyle = col;
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = "round";

  const half = size * 0.42;
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + half, cy - half);
  ctx.lineTo(cx - half, cy + half);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.15;
  ctx.lineWidth = size * 0.55;
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.moveTo(cx - half, cy - half);
  ctx.lineTo(cx + half, cy + half);
  ctx.stroke();

  ctx.restore();
}

function drawO(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = col;
  ctx.shadowBlur = 30;
  ctx.strokeStyle = col;
  ctx.lineWidth = size * 0.20;
  ctx.lineCap = "round";

  const r = size * 0.42;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = alpha * 0.12;
  ctx.lineWidth = size * 0.55;
  ctx.shadowBlur = 50;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, cellSize: number, gap: number,
  board: XoBoard,
  winLine?: [number, number, number] | null,
) {
  const total = cellSize * 3 + gap * 2;

  ctx.save();
  ctx.strokeStyle = "rgba(0, 210, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  for (let i = 1; i < 3; i++) {
    const x = gx + i * (cellSize + gap) - gap / 2;
    const y1 = gy + 14;
    const y2 = gy + total - 14;
    const lg = ctx.createLinearGradient(0, y1, 0, y2);
    lg.addColorStop(0,   "rgba(0,210,255,0)");
    lg.addColorStop(0.5, "rgba(0,210,255,0.5)");
    lg.addColorStop(1,   "rgba(0,210,255,0)");
    ctx.strokeStyle = lg as unknown as string;
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.stroke();
  }

  for (let i = 1; i < 3; i++) {
    const y = gy + i * (cellSize + gap) - gap / 2;
    const x1 = gx + 14;
    const x2 = gx + total - 14;
    const lg = ctx.createLinearGradient(x1, 0, x2, 0);
    lg.addColorStop(0,   "rgba(0,210,255,0)");
    lg.addColorStop(0.5, "rgba(0,210,255,0.5)");
    lg.addColorStop(1,   "rgba(0,210,255,0)");
    ctx.strokeStyle = lg as unknown as string;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }

  for (let i = 0; i < 9; i++) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = gx + col * (cellSize + gap) + cellSize / 2;
    const cy = gy + row * (cellSize + gap) + cellSize / 2;

    const isWinCell = winLine?.includes(i);
    const cellAlpha = !winLine || isWinCell ? 1 : 0.35;

    if (board[i] === "X") drawX(ctx, cx, cy, cellSize * 0.75, X_COLOR, cellAlpha);
    if (board[i] === "O") drawO(ctx, cx, cy, cellSize * 0.75, O_COLOR, cellAlpha);
  }

  if (winLine) {
    const [a, b, c] = winLine;
    const getCenter = (idx: number) => {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      return {
        x: gx + col * (cellSize + gap) + cellSize / 2,
        y: gy + row * (cellSize + gap) + cellSize / 2,
      };
    };
    const pa = getCenter(a);
    const pc = getCenter(c);
    const winColor = board[a] === "X" ? X_COLOR : O_COLOR;

    ctx.save();
    ctx.strokeStyle = winColor;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.shadowColor = winColor;
    ctx.shadowBlur = 22;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pc.x, pc.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

const CELL = 108;
const GAP  = 14;
const GRID_W = CELL * 3 + GAP * 2;
const GRID_X = (W - GRID_W) / 2;
const GRID_Y = 120;

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
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  const guestSymbol = hostSymbol === "X" ? "O" : "X";

  const le = ctx.createLinearGradient(0, 0, 180, 0);
  le.addColorStop(0, hostSymbol === "X" ? "rgba(0,200,255,0.20)" : "rgba(255,100,53,0.20)");
  le.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = le;
  ctx.fillRect(0, 0, 180, H);

  const re = ctx.createLinearGradient(W, 0, W - 180, 0);
  re.addColorStop(0, guestSymbol === "X" ? "rgba(0,200,255,0.20)" : "rgba(255,100,53,0.20)");
  re.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = re;
  ctx.fillRect(W - 180, 0, 180, H);

  drawEdgeLines(ctx, CYAN);

  const hostCol  = hostSymbol  === "X" ? X_COLOR : O_COLOR;
  const guestCol = guestSymbol === "X" ? X_COLOR : O_COLOR;

  const hActive  = turn === "host";
  const gActive  = turn === "guest";

  ctx.save();
  ctx.font = "bold 22px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = hostCol + (hActive ? "" : "88");
  ctx.shadowColor = hostCol;
  ctx.shadowBlur = hActive ? 18 : 0;
  ctx.fillText(`${hostSymbol}  ${limitName(hostName)}`, 120, 72);
  ctx.restore();

  ctx.save();
  ctx.font = "bold 22px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = guestCol + (gActive ? "" : "88");
  ctx.shadowColor = guestCol;
  ctx.shadowBlur = gActive ? 18 : 0;
  ctx.fillText(`${limitName(guestName)}  ${guestSymbol}`, W - 120, 72);
  ctx.restore();

  if (turn !== null) {
    const activeName  = turn === "host" ? limitName(hostName) : limitName(guestName);
    const activeCol   = turn === "host" ? hostCol : guestCol;
    ctx.save();
    ctx.font = "18px Cairo";
    ctx.textAlign = "center";
    ctx.fillStyle = activeCol + "AA";
    ctx.fillText(`دور ${activeName}`, W / 2, 76);
    ctx.restore();
  }

  hLine(ctx, 94, CYAN, 0.3);

  drawGrid(ctx, GRID_X, GRID_Y, CELL, GAP, board, winLine);

  const footerY = GRID_Y + CELL * 3 + GAP * 2 + 38;
  ctx.save();
  ctx.font = "bold 20px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,212,255,0.45)";
  ctx.fillText("أكس أو  ✕  ○", W / 2, footerY);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateXoWinnerCard(
  winnerName: string,
  loserName: string,
  winnerSymbol: "X" | "O",
  board: XoBoard,
  winLine: [number, number, number],
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  const wCol = winnerSymbol === "X" ? X_COLOR : O_COLOR;
  const loserSymbol: "X" | "O" = winnerSymbol === "X" ? "O" : "X";

  const winGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 360);
  winGlow.addColorStop(0, wCol + "22");
  winGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = winGlow;
  ctx.fillRect(0, 0, W, H);

  drawEdgeLines(ctx, wCol);
  drawDiagonalLines(ctx, 0, 0, W, H, wCol + "08");

  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = GOLD;
  ctx.shadowColor = GOLD;
  ctx.shadowBlur = 35;
  ctx.fillText("🏆 الفائز!", W / 2, 68);
  ctx.shadowBlur = 0;
  ctx.restore();

  hLine(ctx, 82, wCol, 0.5);

  ctx.save();
  const nLen = limitName(winnerName, 16).length;
  const nfs  = nLen > 12 ? 44 : nLen > 8 ? 52 : 60;
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = wCol;
  ctx.shadowBlur = 40;
  ctx.fillText(`${winnerSymbol}  ${limitName(winnerName, 16)}`, W / 2, 148);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.font = "18px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.fillText(`ضد  ${limitName(loserName, 16)}  ${loserSymbol}`, W / 2, 182);
  ctx.restore();

  hLine(ctx, 198, wCol, 0.3);

  drawGrid(ctx, GRID_X, GRID_Y + 88, CELL, GAP, board, winLine);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateXoDrawCard(
  hostName: string,
  guestName: string,
  board: XoBoard,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);
  drawEdgeLines(ctx, CYAN);

  ctx.save();
  ctx.font = "bold 50px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = CYAN;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 28;
  ctx.fillText("🤝 تعادل!", W / 2, 66);
  ctx.shadowBlur = 0;
  ctx.restore();

  hLine(ctx, 82, CYAN, 0.4);

  ctx.save();
  ctx.font = "22px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText(`${limitName(hostName)}  ×  ${limitName(guestName)}`, W / 2, 116);
  ctx.restore();

  drawGrid(ctx, GRID_X, GRID_Y + 24, CELL, GAP, board, null);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

export async function generateXoChallengeCard(hostName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  const le = ctx.createLinearGradient(0, 0, 200, 0);
  le.addColorStop(0, "rgba(0,200,255,0.18)");
  le.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = le; ctx.fillRect(0, 0, 200, H);

  const re = ctx.createLinearGradient(W, 0, W - 200, 0);
  re.addColorStop(0, "rgba(255,100,53,0.18)");
  re.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = re; ctx.fillRect(W - 200, 0, 200, H);

  drawX(ctx, 120, H / 2, 90, X_COLOR, 0.18);
  drawO(ctx, W - 120, H / 2, 90, O_COLOR, 0.18);

  drawEdgeLines(ctx, CYAN);

  ctx.save();
  const tg = ctx.createLinearGradient(200, 0, 700, 0);
  tg.addColorStop(0, X_COLOR);
  tg.addColorStop(1, O_COLOR);
  ctx.font = "bold 60px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = tg;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 22;
  ctx.fillText("✕  أكس أو  ○", W / 2, 108);
  ctx.shadowBlur = 0;
  ctx.restore();

  hLine(ctx, 128, CYAN, 0.4);

  ctx.font = "20px Cairo";
  ctx.fillStyle = "rgba(0,212,255,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("تحدي مفتوح من", W / 2, 172);

  const name = limitName(hostName, 18);
  const nfs  = name.length > 14 ? 50 : name.length > 10 ? 62 : 76;
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = X_COLOR;
  ctx.shadowBlur = 35;
  ctx.fillText(name, W / 2, 282);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.font = "21px Cairo";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "center";
  ctx.fillText("يتحدى القروب  —  من يجرؤ؟", W / 2, 330);

  hLine(ctx, 360, CYAN, 0.25);

  ctx.save();
  ctx.fillStyle = "rgba(0,212,255,0.08)";
  roundRect(ctx, W / 2 - 160, H - 80, 320, 44, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,212,255,0.35)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, W / 2 - 160, H - 80, 320, 44, 12);
  ctx.stroke();
  ctx.font = "bold 19px CairoBold";
  ctx.fillStyle = CYAN;
  ctx.textAlign = "center";
  ctx.fillText("الفائز أول يكمل صف أو قطر", W / 2, H - 52);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
