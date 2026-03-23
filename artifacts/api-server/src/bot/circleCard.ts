import { createCanvas, registerFont, loadImage } from "canvas";
import path from "path";

const ASSETS = path.resolve(process.cwd(), "dist/bot/assets");

function ensureFonts() {
  try {
    registerFont(path.join(ASSETS, "Cairo-Bold.ttf"),   { family: "CairoBold" });
    registerFont(path.join(ASSETS, "Cairo-Regular.ttf"), { family: "Cairo" });
  } catch {}
}

// ─── Eliminated card ──────────────────────────────────────────────────────────
// 900×500 — Blood red / dark crimson theme

export async function generateCircleEliminatedCard(
  playerName: string,
  round: number
): Promise<Buffer> {
  ensureFonts();
  const W = 900, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Deep dark background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#0a0000");
  bg.addColorStop(0.5, "#1a0000");
  bg.addColorStop(1,   "#0d0000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Red circuit / stripe overlay
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0,   "rgba(180,0,0,0)");
  stripe.addColorStop(0.35,"rgba(220,20,20,0.35)");
  stripe.addColorStop(0.65,"rgba(200,0,0,0.15)");
  stripe.addColorStop(1,   "rgba(180,0,0,0)");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, H * 0.4, W, H * 0.2);

  // Vertical red accent line
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0,   "rgba(220,30,30,0)");
  vline.addColorStop(0.5, "rgba(255,40,40,0.9)");
  vline.addColorStop(1,   "rgba(220,30,30,0)");
  ctx.fillStyle = vline;
  ctx.fillRect(W * 0.42, 0, 4, H);

  // Left panel — red glow zone
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftGrad.addColorStop(0,   "rgba(180,0,0,0.45)");
  leftGrad.addColorStop(0.7, "rgba(140,0,0,0.15)");
  leftGrad.addColorStop(1,   "rgba(100,0,0,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes left panel
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ff2222";
  ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // Left panel skull icon  💀
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.font = "220px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff2222";
  ctx.fillText("💀", W * 0.21, H * 0.65);
  ctx.restore();

  // Left label — "خرج من الدائرة"
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 22px CairoBold";
  // Shadow glow
  ctx.shadowColor = "#ff0000";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ff4444";
  ctx.fillText("خرج من الدائرة!", W * 0.21, 110);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Round badge
  ctx.save();
  ctx.fillStyle = "rgba(180,0,0,0.7)";
  roundRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10);
  ctx.fill();
  ctx.font = "bold 20px CairoBold";
  ctx.fillStyle = "#ffaaaa";
  ctx.textAlign = "center";
  ctx.fillText(`الجولة ${round}`, W * 0.21, H - 42);
  ctx.restore();

  // Right panel — player name
  const rightX = W * 0.46;
  const rightW = W * 0.54;

  // "المطرود" label
  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(255,100,100,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴ المقصى ╶", rightX + rightW / 2, 95);
  ctx.restore();

  // Player name with glow
  ctx.save();
  ctx.shadowColor = "#ff2222";
  ctx.shadowBlur = 40;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 66}px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const nameY = H * 0.52;
  ctx.fillText(playerName, rightX + rightW / 2, nameY);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Decorative red line below name
  const lineX = rightX + rightW * 0.1;
  const lineW2 = rightW * 0.8;
  const lineG = ctx.createLinearGradient(lineX, 0, lineX + lineW2, 0);
  lineG.addColorStop(0,   "rgba(255,0,0,0)");
  lineG.addColorStop(0.5, "rgba(255,0,0,0.8)");
  lineG.addColorStop(1,   "rgba(255,0,0,0)");
  ctx.strokeStyle = lineG;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lineX, nameY + 18);
  ctx.lineTo(lineX + lineW2, nameY + 18);
  ctx.stroke();

  // Bottom tag
  ctx.save();
  ctx.font = "18px Cairo";
  ctx.fillStyle = "rgba(255,100,100,0.5)";
  ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة  🔴", rightX + rightW / 2, H - 30);
  ctx.restore();

  // Corner glow dots
  glow(ctx, 0, 0, "#ff2200", 80, 0.35);
  glow(ctx, W, 0, "#ff2200", 60, 0.2);
  glow(ctx, 0, H, "#ff2200", 60, 0.2);
  glow(ctx, W, H, "#ff2200", 80, 0.3);

  return canvas.toBuffer("image/png");
}

// ─── Winner card ───────────────────────────────────────────────────────────────
// 900×500 — Gold / dark regal theme

export async function generateCircleWinnerCard(playerName: string): Promise<Buffer> {
  ensureFonts();
  const W = 900, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Dark gold background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#0b0800");
  bg.addColorStop(0.4, "#1a1100");
  bg.addColorStop(1,   "#0a0a00");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Gold center sweep
  const sweep = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.55);
  sweep.addColorStop(0,   "rgba(255,200,50,0.18)");
  sweep.addColorStop(0.6, "rgba(180,130,0,0.08)");
  sweep.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, W, H);

  // Vertical gold line
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0,   "rgba(255,200,50,0)");
  vline.addColorStop(0.5, "rgba(255,200,50,0.9)");
  vline.addColorStop(1,   "rgba(255,200,50,0)");
  ctx.fillStyle = vline;
  ctx.fillRect(W * 0.42, 0, 3, H);

  // Left panel glow
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftGrad.addColorStop(0,   "rgba(200,150,0,0.4)");
  leftGrad.addColorStop(1,   "rgba(100,80,0,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes left
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
  }
  ctx.restore();

  // Crown icon left
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.font = "200px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffd700";
  ctx.fillText("👑", W * 0.21, H * 0.63);
  ctx.restore();

  // Left label
  ctx.save();
  ctx.shadowColor = "#ffcc00";
  ctx.shadowBlur = 20;
  ctx.font = "bold 22px CairoBold";
  ctx.fillStyle = "#ffd700";
  ctx.textAlign = "center";
  ctx.fillText("الناجي الوحيد!", W * 0.21, 110);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Rounds survived badge
  ctx.save();
  ctx.fillStyle = "rgba(180,140,0,0.6)";
  roundRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10);
  ctx.fill();
  ctx.font = "bold 18px CairoBold";
  ctx.fillStyle = "#ffe066";
  ctx.textAlign = "center";
  ctx.fillText("الدائرة القاتلة 🔴", W * 0.21, H - 42);
  ctx.restore();

  // Right panel
  const rightX = W * 0.46;
  const rightW = W * 0.54;

  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(255,215,0,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("╴ الفائز ╶", rightX + rightW / 2, 95);
  ctx.restore();

  // Player name
  ctx.save();
  ctx.shadowColor = "#ffd700";
  ctx.shadowBlur = 50;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const nameY = H * 0.52;
  ctx.fillText(playerName, rightX + rightW / 2, nameY);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Gold underline
  const lg = ctx.createLinearGradient(rightX + rightW * 0.1, 0, rightX + rightW * 0.9, 0);
  lg.addColorStop(0,   "rgba(255,215,0,0)");
  lg.addColorStop(0.5, "rgba(255,215,0,0.9)");
  lg.addColorStop(1,   "rgba(255,215,0,0)");
  ctx.strokeStyle = lg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rightX + rightW * 0.1, nameY + 18);
  ctx.lineTo(rightX + rightW * 0.9, nameY + 18);
  ctx.stroke();

  // Stars
  ctx.save();
  ctx.font = "28px Cairo";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,215,0,0.7)";
  ctx.fillText("✦  مبروك  ✦", rightX + rightW / 2, H - 30);
  ctx.restore();

  glow(ctx, 0, 0, "#ffd700", 80, 0.3);
  glow(ctx, W, 0, "#ffd700", 60, 0.2);
  glow(ctx, 0, H, "#ffd700", 60, 0.2);
  glow(ctx, W, H, "#ffd700", 80, 0.35);

  return canvas.toBuffer("image/png");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function glow(
  ctx: ReturnType<typeof createCanvas>["getContext"],
  x: number, y: number, color: string, radius: number, alpha: number
) {
  const g = (ctx as CanvasRenderingContext2D).createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0,   color.replace(")", `,${alpha})`).replace("rgb", "rgba"));
  g.addColorStop(1,   "rgba(0,0,0,0)");
  try {
    (ctx as CanvasRenderingContext2D).fillStyle = g;
    (ctx as CanvasRenderingContext2D).fillRect(x - radius, y - radius, radius * 2, radius * 2);
  } catch {}
}

function roundRect(
  ctx: ReturnType<typeof createCanvas>["getContext"],
  x: number, y: number, w: number, h: number, r: number
) {
  (ctx as CanvasRenderingContext2D).beginPath();
  (ctx as CanvasRenderingContext2D).moveTo(x + r, y);
  (ctx as CanvasRenderingContext2D).lineTo(x + w - r, y);
  (ctx as CanvasRenderingContext2D).arcTo(x + w, y, x + w, y + r, r);
  (ctx as CanvasRenderingContext2D).lineTo(x + w, y + h - r);
  (ctx as CanvasRenderingContext2D).arcTo(x + w, y + h, x + w - r, y + h, r);
  (ctx as CanvasRenderingContext2D).lineTo(x + r, y + h);
  (ctx as CanvasRenderingContext2D).arcTo(x, y + h, x, y + h - r, r);
  (ctx as CanvasRenderingContext2D).lineTo(x, y + r);
  (ctx as CanvasRenderingContext2D).arcTo(x, y, x + r, y, r);
  (ctx as CanvasRenderingContext2D).closePath();
}
