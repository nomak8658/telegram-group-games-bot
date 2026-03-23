import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = __dirname.endsWith("bot")
  ? path.join(__dirname, "assets")
  : path.join(__dirname, "bot", "assets");

let _cv: typeof import("@napi-rs/canvas") | null = null;
async function cv() {
  if (!_cv) _cv = await import("@napi-rs/canvas");
  return _cv;
}

// ─── Eliminated card ──────────────────────────────────────────────────────────
// 900×500 — Blood red / dark crimson theme

export async function generateCircleEliminatedCard(
  playerName: string,
  round: number
): Promise<Buffer> {
  const c = await cv();
  try {
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),   "CairoBold");
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  } catch {}

  const W = 900, H = 500;
  const canvas = c.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // Dark background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#0a0000");
  bg.addColorStop(0.5, "#1a0000");
  bg.addColorStop(1,   "#0d0000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Red stripe overlay
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0,    "rgba(180,0,0,0)");
  stripe.addColorStop(0.35, "rgba(220,20,20,0.35)");
  stripe.addColorStop(0.65, "rgba(200,0,0,0.15)");
  stripe.addColorStop(1,    "rgba(180,0,0,0)");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, H * 0.4, W, H * 0.2);

  // Vertical red accent line
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0,   "rgba(220,30,30,0)");
  vline.addColorStop(0.5, "rgba(255,40,40,0.9)");
  vline.addColorStop(1,   "rgba(220,30,30,0)");
  ctx.fillStyle = vline;
  ctx.fillRect(W * 0.42, 0, 4, H);

  // Left panel glow
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftGrad.addColorStop(0,   "rgba(180,0,0,0.45)");
  leftGrad.addColorStop(0.7, "rgba(140,0,0,0.15)");
  leftGrad.addColorStop(1,   "rgba(100,0,0,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ff2222";
  ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
  }
  ctx.restore();

  // Left label
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 22px CairoBold";
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ff4444";
  ctx.fillText("خرج من الدائرة!", W * 0.21, 110);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Skull
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.font = "180px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff2222";
  ctx.fillText("💀", W * 0.21, H * 0.65);
  ctx.restore();

  // Round badge
  ctx.save();
  ctx.fillStyle = "rgba(180,0,0,0.7)";
  rRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10);
  ctx.fill();
  ctx.font = "bold 20px CairoBold";
  ctx.fillStyle = "#ffaaaa";
  ctx.textAlign = "center";
  ctx.fillText(`الجولة ${round}`, W * 0.21, H - 42);
  ctx.restore();

  // Right panel labels
  const rx = W * 0.46, rw = W * 0.54;
  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(255,100,100,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴ المقصى ╶", rx + rw / 2, 95);
  ctx.restore();

  // Player name
  ctx.save();
  ctx.shadowColor = "#ff2222";
  ctx.shadowBlur = 40;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 66}px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const ny = H * 0.52;
  ctx.fillText(playerName, rx + rw / 2, ny);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Underline
  const lg = ctx.createLinearGradient(rx + rw * 0.1, 0, rx + rw * 0.9, 0);
  lg.addColorStop(0, "rgba(255,0,0,0)"); lg.addColorStop(0.5, "rgba(255,0,0,0.8)"); lg.addColorStop(1, "rgba(255,0,0,0)");
  ctx.strokeStyle = lg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx + rw * 0.1, ny + 18); ctx.lineTo(rx + rw * 0.9, ny + 18); ctx.stroke();

  ctx.save();
  ctx.font = "18px Cairo"; ctx.fillStyle = "rgba(255,100,100,0.5)"; ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة  🔴", rx + rw / 2, H - 30);
  ctx.restore();

  cornerGlow(ctx, 0, 0, 180, 0, 0, 80, 0.35);
  cornerGlow(ctx, W, H, 180, 0, 0, 80, 0.3);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export async function generateCircleWinnerCard(playerName: string): Promise<Buffer> {
  const c = await cv();
  try {
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),   "CairoBold");
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  } catch {}

  const W = 900, H = 500;
  const canvas = c.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b0800"); bg.addColorStop(0.4, "#1a1100"); bg.addColorStop(1, "#0a0a00");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const sweep = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.55);
  sweep.addColorStop(0, "rgba(255,200,50,0.18)"); sweep.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sweep; ctx.fillRect(0, 0, W, H);

  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0, "rgba(255,200,50,0)"); vline.addColorStop(0.5, "rgba(255,200,50,0.9)"); vline.addColorStop(1, "rgba(255,200,50,0)");
  ctx.fillStyle = vline; ctx.fillRect(W * 0.42, 0, 3, H);

  const leftG = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftG.addColorStop(0, "rgba(200,150,0,0.4)"); leftG.addColorStop(1, "rgba(100,80,0,0)");
  ctx.fillStyle = leftG; ctx.fillRect(0, 0, W * 0.4, H);

  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = "#ffd700"; ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  ctx.restore();

  ctx.save(); ctx.shadowColor = "#ffcc00"; ctx.shadowBlur = 20;
  ctx.font = "bold 22px CairoBold"; ctx.fillStyle = "#ffd700"; ctx.textAlign = "center";
  ctx.fillText("الناجي الوحيد!", W * 0.21, 110); ctx.shadowBlur = 0; ctx.restore();

  ctx.save(); ctx.globalAlpha = 0.18; ctx.font = "180px CairoBold"; ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700"; ctx.fillText("👑", W * 0.21, H * 0.64); ctx.restore();

  ctx.save(); ctx.fillStyle = "rgba(180,140,0,0.6)"; rRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10); ctx.fill();
  ctx.font = "bold 18px CairoBold"; ctx.fillStyle = "#ffe066"; ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة 🔴", W * 0.21, H - 42); ctx.restore();

  const rx = W * 0.46, rw = W * 0.54;
  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(255,215,0,0.6)"; ctx.textAlign = "center";
  ctx.fillText("╴ الفائز ╶", rx + rw / 2, 95); ctx.restore();

  ctx.save(); ctx.shadowColor = "#ffd700"; ctx.shadowBlur = 50;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
  const ny = H * 0.52; ctx.fillText(playerName, rx + rw / 2, ny); ctx.shadowBlur = 0; ctx.restore();

  const lg = ctx.createLinearGradient(rx + rw * 0.1, 0, rx + rw * 0.9, 0);
  lg.addColorStop(0, "rgba(255,215,0,0)"); lg.addColorStop(0.5, "rgba(255,215,0,0.9)"); lg.addColorStop(1, "rgba(255,215,0,0)");
  ctx.strokeStyle = lg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx + rw * 0.1, ny + 18); ctx.lineTo(rx + rw * 0.9, ny + 18); ctx.stroke();

  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(255,215,0,0.6)"; ctx.textAlign = "center";
  ctx.fillText("✦  مبروك  ✦", rx + rw / 2, H - 30); ctx.restore();

  cornerGlow(ctx, 0, 0, 180, 150, 0, 80, 0.3);
  cornerGlow(ctx, W, H, 200, 160, 0, 80, 0.3);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cornerGlow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, g: number, b: number, radius: number, alpha: number) {
  try {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gr.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  } catch {}
}

function rRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
