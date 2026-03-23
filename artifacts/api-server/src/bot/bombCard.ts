import { createCanvas, registerFont } from "canvas";
import path from "path";

const ASSETS = path.resolve(process.cwd(), "dist/bot/assets");

function ensureFonts() {
  try {
    registerFont(path.join(ASSETS, "Cairo-Bold.ttf"),   { family: "CairoBold" });
    registerFont(path.join(ASSETS, "Cairo-Regular.ttf"), { family: "Cairo" });
  } catch {}
}

// ─── Explosion card ────────────────────────────────────────────────────────────
// 900×500 — Black / orange-yellow explosion theme

export async function generateBombExplosionCard(playerName: string): Promise<Buffer> {
  ensureFonts();
  const W = 900, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Near-black background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#080400");
  bg.addColorStop(0.5, "#120800");
  bg.addColorStop(1,   "#060606");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Orange explosion radial from center-left
  const burst = ctx.createRadialGradient(W * 0.21, H * 0.5, 0, W * 0.21, H * 0.5, W * 0.38);
  burst.addColorStop(0,   "rgba(255,160,0,0.55)");
  burst.addColorStop(0.4, "rgba(220,80,0,0.25)");
  burst.addColorStop(0.7, "rgba(180,40,0,0.1)");
  burst.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = burst;
  ctx.fillRect(0, 0, W, H);

  // Orange vertical divider
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0,   "rgba(255,140,0,0)");
  vline.addColorStop(0.5, "rgba(255,160,0,1)");
  vline.addColorStop(1,   "rgba(255,140,0,0)");
  ctx.fillStyle = vline;
  ctx.fillRect(W * 0.42, 0, 4, H);

  // Left panel warm glow
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftGrad.addColorStop(0,   "rgba(220,100,0,0.45)");
  leftGrad.addColorStop(1,   "rgba(100,40,0,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes left
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#ff8800";
  ctx.lineWidth = 20;
  for (let x = -H; x < W * 0.45; x += 52) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
  }
  ctx.restore();

  // Bomb emoji — large left
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.font = "220px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff8800";
  ctx.fillText("💣", W * 0.21, H * 0.64);
  ctx.restore();

  // Left label
  ctx.save();
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 22;
  ctx.font = "bold 30px CairoBold";
  ctx.fillStyle = "#ffaa00";
  ctx.textAlign = "center";
  ctx.fillText("💥  BOOM!  💥", W * 0.21, 100);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Round badge
  ctx.save();
  ctx.fillStyle = "rgba(180,80,0,0.7)";
  roundRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10);
  ctx.fill();
  ctx.font = "bold 20px CairoBold";
  ctx.fillStyle = "#ffcc66";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة 💣", W * 0.21, H - 42);
  ctx.restore();

  // Right panel
  const rightX = W * 0.46;
  const rightW = W * 0.54;

  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(255,150,0,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("╴ انفجرت عليه ╶", rightX + rightW / 2, 95);
  ctx.restore();

  // Player name
  ctx.save();
  ctx.shadowColor = "#ff8800";
  ctx.shadowBlur = 45;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const nameY = H * 0.52;
  ctx.fillText(playerName, rightX + rightW / 2, nameY);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Orange underline
  const lg = ctx.createLinearGradient(rightX + rightW * 0.1, 0, rightX + rightW * 0.9, 0);
  lg.addColorStop(0,   "rgba(255,140,0,0)");
  lg.addColorStop(0.5, "rgba(255,140,0,0.9)");
  lg.addColorStop(1,   "rgba(255,140,0,0)");
  ctx.strokeStyle = lg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rightX + rightW * 0.1, nameY + 18);
  ctx.lineTo(rightX + rightW * 0.9, nameY + 18);
  ctx.stroke();

  // "طلع من اللعبة"
  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(255,120,0,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("طلع من اللعبة 😈", rightX + rightW / 2, H - 30);
  ctx.restore();

  glowCorner(ctx, 0, 0, "#ff6600", 90, 0.4);
  glowCorner(ctx, W, H, "#ff8800", 80, 0.3);

  return canvas.toBuffer("image/png");
}

// ─── Winner card ───────────────────────────────────────────────────────────────
// 900×500 — Black / green safe zone theme

export async function generateBombWinnerCard(playerName: string): Promise<Buffer> {
  ensureFonts();
  const W = 900, H = 500;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Near-black background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#000a04");
  bg.addColorStop(0.5, "#001508");
  bg.addColorStop(1,   "#000808");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Green radial glow left
  const burst = ctx.createRadialGradient(W * 0.21, H * 0.5, 0, W * 0.21, H * 0.5, W * 0.38);
  burst.addColorStop(0,   "rgba(0,220,100,0.45)");
  burst.addColorStop(0.5, "rgba(0,150,60,0.18)");
  burst.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = burst;
  ctx.fillRect(0, 0, W, H);

  // Green divider
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0,   "rgba(0,220,100,0)");
  vline.addColorStop(0.5, "rgba(0,255,120,1)");
  vline.addColorStop(1,   "rgba(0,220,100,0)");
  ctx.fillStyle = vline;
  ctx.fillRect(W * 0.42, 0, 4, H);

  // Left panel glow
  const leftGrad = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftGrad.addColorStop(0,   "rgba(0,180,80,0.4)");
  leftGrad.addColorStop(1,   "rgba(0,80,30,0)");
  ctx.fillStyle = leftGrad;
  ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = "#00ff66";
  ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
  }
  ctx.restore();

  // Trophy left
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.font = "200px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#00ff88";
  ctx.fillText("🏆", W * 0.21, H * 0.64);
  ctx.restore();

  // Left label
  ctx.save();
  ctx.shadowColor = "#00ff66";
  ctx.shadowBlur = 20;
  ctx.font = "bold 22px CairoBold";
  ctx.fillStyle = "#00ff88";
  ctx.textAlign = "center";
  ctx.fillText("الناجي الوحيد!", W * 0.21, 108);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Badge
  ctx.save();
  ctx.fillStyle = "rgba(0,130,60,0.65)";
  roundRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10);
  ctx.fill();
  ctx.font = "bold 19px CairoBold";
  ctx.fillStyle = "#66ffaa";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة 💣", W * 0.21, H - 42);
  ctx.restore();

  // Right panel
  const rightX = W * 0.46;
  const rightW = W * 0.54;

  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(0,220,100,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("╴ الفائز ╶", rightX + rightW / 2, 95);
  ctx.restore();

  // Player name
  ctx.save();
  ctx.shadowColor = "#00ff88";
  ctx.shadowBlur = 50;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  const nameY = H * 0.52;
  ctx.fillText(playerName, rightX + rightW / 2, nameY);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Green underline
  const lg = ctx.createLinearGradient(rightX + rightW * 0.1, 0, rightX + rightW * 0.9, 0);
  lg.addColorStop(0,   "rgba(0,255,100,0)");
  lg.addColorStop(0.5, "rgba(0,255,100,0.9)");
  lg.addColorStop(1,   "rgba(0,255,100,0)");
  ctx.strokeStyle = lg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rightX + rightW * 0.1, nameY + 18);
  ctx.lineTo(rightX + rightW * 0.9, nameY + 18);
  ctx.stroke();

  ctx.save();
  ctx.font = "bold 20px Cairo";
  ctx.fillStyle = "rgba(0,220,100,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("✦  مبروك  ✦", rightX + rightW / 2, H - 30);
  ctx.restore();

  glowCorner(ctx, 0, 0, "#00ff66", 90, 0.35);
  glowCorner(ctx, W, H, "#00ff88", 80, 0.3);

  return canvas.toBuffer("image/png");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function glowCorner(
  ctx: ReturnType<typeof createCanvas>["getContext"],
  x: number, y: number, color: string, radius: number, alpha: number
) {
  try {
    const hex = color.replace("#", "");
    const r = parseInt(hex.slice(0,2), 16);
    const g2 = parseInt(hex.slice(2,4), 16);
    const b = parseInt(hex.slice(4,6), 16);
    const gr = (ctx as CanvasRenderingContext2D).createRadialGradient(x, y, 0, x, y, radius);
    gr.addColorStop(0, `rgba(${r},${g2},${b},${alpha})`);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    (ctx as CanvasRenderingContext2D).fillStyle = gr;
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
