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

const W = 900;
const H = 500;
const LEFT_W = 260;
const DIVIDER_X = LEFT_W;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const spacing = 20;
  for (let i = -h; i < w + h; i += spacing) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function drawX(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(cx - size, cy - size); ctx.lineTo(cx + size, cy + size);
  ctx.moveTo(cx + size, cy - size); ctx.lineTo(cx - size, cy + size);
  ctx.stroke();
  ctx.restore();
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number, color: string) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 25;
  ctx.fill();
  ctx.restore();
}

function limitName(name: string, max = 18): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ─── Eliminated card ──────────────────────────────────────────────────────────

export async function generateCircleEliminatedCard(playerName: string, round: number): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#08000a");
  bg.addColorStop(0.5, "#110005");
  bg.addColorStop(1,   "#050002");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Left panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const leftGrad = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  leftGrad.addColorStop(0, "rgba(160,0,20,0.5)");
  leftGrad.addColorStop(1, "rgba(80,0,10,0.1)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, LEFT_W, H);

  drawDiagonalLines(ctx, 0, 0, LEFT_W, H, "rgba(220,30,30,0.12)");

  // Big X shape
  drawX(ctx, LEFT_W / 2, H / 2 + 10, 55, "rgba(255,50,50,0.35)", 22);
  drawX(ctx, LEFT_W / 2, H / 2 + 10, 55, "#ff3a3a", 7);

  // Top label in left panel
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(255,100,100,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("الإقصاء", LEFT_W / 2, 40);

  // Round badge
  ctx.fillStyle = "rgba(180,0,20,0.65)";
  roundRect(ctx, 20, H - 64, LEFT_W - 40, 38, 8);
  ctx.fill();
  ctx.font = "bold 17px CairoBold";
  ctx.fillStyle = "#ffaaaa";
  ctx.textAlign = "center";
  ctx.fillText(`الجولة  ${round}`, LEFT_W / 2, H - 40);

  ctx.restore();

  // ── 3. Divider
  const divGrad = ctx.createLinearGradient(0, 0, 0, H);
  divGrad.addColorStop(0,   "rgba(200,0,30,0)");
  divGrad.addColorStop(0.5, "rgba(220,0,30,0.9)");
  divGrad.addColorStop(1,   "rgba(200,0,30,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(DIVIDER_X, 0, 2, H);

  // ── 4. Right panel
  const rx = DIVIDER_X + 30;
  const rw = W - rx - 30;
  const midX = rx + rw / 2;

  // Subtle right bg glow
  const rightGlow = ctx.createRadialGradient(midX, H / 2, 0, midX, H / 2, 300);
  rightGlow.addColorStop(0,   "rgba(200,0,30,0.06)");
  rightGlow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(DIVIDER_X, 0, W - DIVIDER_X, H);

  // Subtitle
  ctx.font = "22px Cairo";
  ctx.fillStyle = "rgba(255,80,80,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴  خرج من الدائرة  ╶", midX, 95);

  // Player name
  const name = limitName(playerName);
  const fontSize = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font = `bold ${fontSize}px CairoBold`;
  ctx.textAlign = "center";
  ctx.shadowColor = "#dd0020";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 20);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Underline
  const ulGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  ulGrad.addColorStop(0,   "rgba(200,0,30,0)");
  ulGrad.addColorStop(0.5, "rgba(220,0,30,0.8)");
  ulGrad.addColorStop(1,   "rgba(200,0,30,0)");
  ctx.strokeStyle = ulGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.05, H / 2 + 40);
  ctx.lineTo(rx + rw * 0.95, H / 2 + 40);
  ctx.stroke();

  // Bottom label
  ctx.font = "16px Cairo";
  ctx.fillStyle = "rgba(200,80,80,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة", midX, H - 28);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export async function generateCircleWinnerCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#080600");
  bg.addColorStop(0.5, "#120e00");
  bg.addColorStop(1,   "#060500");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Left panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const leftGrad = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  leftGrad.addColorStop(0, "rgba(200,160,0,0.5)");
  leftGrad.addColorStop(1, "rgba(100,80,0,0.1)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, LEFT_W, H);

  drawDiagonalLines(ctx, 0, 0, LEFT_W, H, "rgba(255,200,0,0.1)");

  // Star shape
  drawStar(ctx, LEFT_W / 2, H / 2 + 10, 60, 26, "rgba(255,200,30,0.25)");
  drawStar(ctx, LEFT_W / 2, H / 2 + 10, 56, 24, "#ffc800");

  // Top label
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(255,210,0,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("الفائز", LEFT_W / 2, 40);

  // Bottom badge
  ctx.fillStyle = "rgba(180,140,0,0.65)";
  roundRect(ctx, 20, H - 64, LEFT_W - 40, 38, 8);
  ctx.fill();
  ctx.font = "bold 16px Cairo";
  ctx.fillStyle = "#ffe566";
  ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة", LEFT_W / 2, H - 40);

  ctx.restore();

  // ── 3. Divider
  const divGrad = ctx.createLinearGradient(0, 0, 0, H);
  divGrad.addColorStop(0,   "rgba(220,180,0,0)");
  divGrad.addColorStop(0.5, "rgba(255,200,0,0.9)");
  divGrad.addColorStop(1,   "rgba(220,180,0,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(DIVIDER_X, 0, 2, H);

  // ── 4. Right panel
  const rx = DIVIDER_X + 30;
  const rw = W - rx - 30;
  const midX = rx + rw / 2;

  const rightGlow = ctx.createRadialGradient(midX, H / 2, 0, midX, H / 2, 300);
  rightGlow.addColorStop(0,   "rgba(200,160,0,0.07)");
  rightGlow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(DIVIDER_X, 0, W - DIVIDER_X, H);

  ctx.font = "22px Cairo";
  ctx.fillStyle = "rgba(255,200,0,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴  الناجي الوحيد  ╶", midX, 95);

  const name = limitName(playerName);
  const fontSize = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font = `bold ${fontSize}px CairoBold`;
  ctx.textAlign = "center";
  ctx.shadowColor = "#cc9900";
  ctx.shadowBlur = 35;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 20);
  ctx.shadowBlur = 0;
  ctx.restore();

  const ulGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  ulGrad.addColorStop(0,   "rgba(220,180,0,0)");
  ulGrad.addColorStop(0.5, "rgba(255,200,0,0.8)");
  ulGrad.addColorStop(1,   "rgba(220,180,0,0)");
  ctx.strokeStyle = ulGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.05, H / 2 + 40);
  ctx.lineTo(rx + rw * 0.95, H / 2 + 40);
  ctx.stroke();

  ctx.font = "16px Cairo";
  ctx.fillStyle = "rgba(220,180,0,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("مبروك  —  الدائرة القاتلة", midX, H - 28);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
