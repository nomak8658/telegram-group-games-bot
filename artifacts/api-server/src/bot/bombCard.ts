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

function drawStarburst(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, outer: number, rays: number, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const angle = (i * Math.PI * 2) / rays;
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
  }
  ctx.stroke();
  ctx.restore();
}

function drawCheck(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.55, cy + size * 0.05);
  ctx.lineTo(cx - size * 0.05, cy + size * 0.5);
  ctx.lineTo(cx + size * 0.55, cy - size * 0.45);
  ctx.stroke();
  ctx.restore();
}

function limitName(name: string, max = 18): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ─── Explosion card ────────────────────────────────────────────────────────────

export async function generateBombExplosionCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#050200");
  bg.addColorStop(0.5, "#0e0600");
  bg.addColorStop(1,   "#030200");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Left panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const leftGrad = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  leftGrad.addColorStop(0, "rgba(220,90,0,0.5)");
  leftGrad.addColorStop(1, "rgba(100,40,0,0.1)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, LEFT_W, H);

  drawDiagonalLines(ctx, 0, 0, LEFT_W, H, "rgba(255,120,0,0.1)");

  // Starburst explosion shape (dim layer)
  drawStarburst(ctx, LEFT_W / 2, H / 2 + 10, 8, 52, 12, "rgba(255,120,0,0.3)", 10);
  // Starburst (bright layer)
  drawStarburst(ctx, LEFT_W / 2, H / 2 + 10, 6, 48, 12, "#ff8800", 3);

  // Center dot
  ctx.beginPath();
  ctx.arc(LEFT_W / 2, H / 2 + 10, 8, 0, Math.PI * 2);
  ctx.fillStyle = "#ffbb44";
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Top label
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(255,140,0,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("الانفجار", LEFT_W / 2, 40);

  // Bottom badge
  ctx.fillStyle = "rgba(180,70,0,0.65)";
  roundRect(ctx, 20, H - 64, LEFT_W - 40, 38, 8);
  ctx.fill();
  ctx.font = "bold 16px Cairo";
  ctx.fillStyle = "#ffcc66";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة", LEFT_W / 2, H - 40);

  ctx.restore();

  // ── 3. Divider
  const divGrad = ctx.createLinearGradient(0, 0, 0, H);
  divGrad.addColorStop(0,   "rgba(220,100,0,0)");
  divGrad.addColorStop(0.5, "rgba(255,120,0,0.9)");
  divGrad.addColorStop(1,   "rgba(220,100,0,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(DIVIDER_X, 0, 2, H);

  // ── 4. Right panel
  const rx = DIVIDER_X + 30;
  const rw = W - rx - 30;
  const midX = rx + rw / 2;

  const rightGlow = ctx.createRadialGradient(midX, H / 2, 0, midX, H / 2, 300);
  rightGlow.addColorStop(0,   "rgba(220,90,0,0.07)");
  rightGlow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(DIVIDER_X, 0, W - DIVIDER_X, H);

  // "BOOM" title
  ctx.save();
  ctx.font = "bold 30px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ff8800";
  ctx.fillText("انفجرت القنبلة!", midX, 88);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle
  ctx.font = "19px Cairo";
  ctx.fillStyle = "rgba(255,140,0,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("╴  انفجرت عليه  ╶", midX, 125);

  // Player name
  const name = limitName(playerName);
  const fontSize = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font = `bold ${fontSize}px CairoBold`;
  ctx.textAlign = "center";
  ctx.shadowColor = "#cc6600";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 30);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Underline
  const ulGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  ulGrad.addColorStop(0,   "rgba(220,100,0,0)");
  ulGrad.addColorStop(0.5, "rgba(255,130,0,0.8)");
  ulGrad.addColorStop(1,   "rgba(220,100,0,0)");
  ctx.strokeStyle = ulGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.05, H / 2 + 52);
  ctx.lineTo(rx + rw * 0.95, H / 2 + 52);
  ctx.stroke();

  ctx.font = "16px Cairo";
  ctx.fillStyle = "rgba(220,120,0,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("طلع من اللعبة", midX, H - 28);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export async function generateBombWinnerCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#000a03");
  bg.addColorStop(0.5, "#001208");
  bg.addColorStop(1,   "#000503");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Left panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const leftGrad = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  leftGrad.addColorStop(0, "rgba(0,180,80,0.5)");
  leftGrad.addColorStop(1, "rgba(0,80,30,0.1)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, LEFT_W, H);

  drawDiagonalLines(ctx, 0, 0, LEFT_W, H, "rgba(0,220,100,0.1)");

  // Checkmark shape (dim layer)
  drawCheck(ctx, LEFT_W / 2, H / 2 + 10, 55, "rgba(0,220,100,0.3)", 20);
  // Checkmark (bright)
  drawCheck(ctx, LEFT_W / 2, H / 2 + 10, 55, "#00dd66", 7);

  // Top label
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(0,220,100,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("الناجي", LEFT_W / 2, 40);

  // Bottom badge
  ctx.fillStyle = "rgba(0,130,55,0.65)";
  roundRect(ctx, 20, H - 64, LEFT_W - 40, 38, 8);
  ctx.fill();
  ctx.font = "bold 16px Cairo";
  ctx.fillStyle = "#66ffaa";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة", LEFT_W / 2, H - 40);

  ctx.restore();

  // ── 3. Divider
  const divGrad = ctx.createLinearGradient(0, 0, 0, H);
  divGrad.addColorStop(0,   "rgba(0,200,80,0)");
  divGrad.addColorStop(0.5, "rgba(0,230,100,0.9)");
  divGrad.addColorStop(1,   "rgba(0,200,80,0)");
  ctx.fillStyle = divGrad;
  ctx.fillRect(DIVIDER_X, 0, 2, H);

  // ── 4. Right panel
  const rx = DIVIDER_X + 30;
  const rw = W - rx - 30;
  const midX = rx + rw / 2;

  const rightGlow = ctx.createRadialGradient(midX, H / 2, 0, midX, H / 2, 300);
  rightGlow.addColorStop(0,   "rgba(0,180,70,0.07)");
  rightGlow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = rightGlow;
  ctx.fillRect(DIVIDER_X, 0, W - DIVIDER_X, H);

  ctx.font = "22px Cairo";
  ctx.fillStyle = "rgba(0,220,100,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴  الناجي الوحيد  ╶", midX, 95);

  const name = limitName(playerName);
  const fontSize = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font = `bold ${fontSize}px CairoBold`;
  ctx.textAlign = "center";
  ctx.shadowColor = "#009944";
  ctx.shadowBlur = 35;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 20);
  ctx.shadowBlur = 0;
  ctx.restore();

  const ulGrad = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  ulGrad.addColorStop(0,   "rgba(0,200,80,0)");
  ulGrad.addColorStop(0.5, "rgba(0,230,100,0.8)");
  ulGrad.addColorStop(1,   "rgba(0,200,80,0)");
  ctx.strokeStyle = ulGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.05, H / 2 + 40);
  ctx.lineTo(rx + rw * 0.95, H / 2 + 40);
  ctx.stroke();

  ctx.font = "16px Cairo";
  ctx.fillStyle = "rgba(0,200,80,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("مبروك  —  القنبلة المتنقلة", midX, H - 28);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
