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

// ─── Explosion card ────────────────────────────────────────────────────────────
// 900×500 — Black / orange-yellow explosion theme

export async function generateBombExplosionCard(playerName: string): Promise<Buffer> {
  const c = await cv();
  try {
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),   "CairoBold");
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  } catch {}

  const W = 900, H = 500;
  const canvas = c.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // Near-black background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#080400"); bg.addColorStop(0.5, "#120800"); bg.addColorStop(1, "#060606");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  // Orange explosion burst from left
  const burst = ctx.createRadialGradient(W * 0.21, H * 0.5, 0, W * 0.21, H * 0.5, W * 0.38);
  burst.addColorStop(0, "rgba(255,160,0,0.55)"); burst.addColorStop(0.4, "rgba(220,80,0,0.25)"); burst.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = burst; ctx.fillRect(0, 0, W, H);

  // Orange vertical divider
  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0, "rgba(255,140,0,0)"); vline.addColorStop(0.5, "rgba(255,160,0,1)"); vline.addColorStop(1, "rgba(255,140,0,0)");
  ctx.fillStyle = vline; ctx.fillRect(W * 0.42, 0, 4, H);

  // Left panel warm glow
  const leftG = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftG.addColorStop(0, "rgba(220,100,0,0.45)"); leftG.addColorStop(1, "rgba(100,40,0,0)");
  ctx.fillStyle = leftG; ctx.fillRect(0, 0, W * 0.4, H);

  // Diagonal stripes
  ctx.save(); ctx.globalAlpha = 0.08; ctx.strokeStyle = "#ff8800"; ctx.lineWidth = 20;
  for (let x = -H; x < W * 0.45; x += 52) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  ctx.restore();

  // BOOM label
  ctx.save(); ctx.shadowColor = "#ff8800"; ctx.shadowBlur = 22;
  ctx.font = "bold 30px CairoBold"; ctx.fillStyle = "#ffaa00"; ctx.textAlign = "center";
  ctx.fillText("💥  BOOM!  💥", W * 0.21, 100); ctx.shadowBlur = 0; ctx.restore();

  // Bomb emoji
  ctx.save(); ctx.globalAlpha = 0.2; ctx.font = "170px CairoBold"; ctx.textAlign = "center";
  ctx.fillStyle = "#ff8800"; ctx.fillText("💣", W * 0.21, H * 0.64); ctx.restore();

  // Round badge
  ctx.save(); ctx.fillStyle = "rgba(180,80,0,0.7)"; rRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10); ctx.fill();
  ctx.font = "bold 20px CairoBold"; ctx.fillStyle = "#ffcc66"; ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة 💣", W * 0.21, H - 42); ctx.restore();

  // Right panel
  const rx = W * 0.46, rw = W * 0.54;
  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(255,150,0,0.65)"; ctx.textAlign = "center";
  ctx.fillText("╴ انفجرت عليه ╶", rx + rw / 2, 95); ctx.restore();

  // Player name
  ctx.save(); ctx.shadowColor = "#ff8800"; ctx.shadowBlur = 45;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
  const ny = H * 0.52; ctx.fillText(playerName, rx + rw / 2, ny); ctx.shadowBlur = 0; ctx.restore();

  // Orange underline
  const lg = ctx.createLinearGradient(rx + rw * 0.1, 0, rx + rw * 0.9, 0);
  lg.addColorStop(0, "rgba(255,140,0,0)"); lg.addColorStop(0.5, "rgba(255,140,0,0.9)"); lg.addColorStop(1, "rgba(255,140,0,0)");
  ctx.strokeStyle = lg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx + rw * 0.1, ny + 18); ctx.lineTo(rx + rw * 0.9, ny + 18); ctx.stroke();

  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(255,120,0,0.65)"; ctx.textAlign = "center";
  ctx.fillText("طلع من اللعبة 😈", rx + rw / 2, H - 30); ctx.restore();

  cornerGlow(ctx, 0, 0, 255, 102, 0, 90, 0.4);
  cornerGlow(ctx, W, H, 255, 136, 0, 80, 0.3);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────
// 900×500 — Black / green safe zone theme

export async function generateBombWinnerCard(playerName: string): Promise<Buffer> {
  const c = await cv();
  try {
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Bold.ttf"),   "CairoBold");
    c.GlobalFonts.registerFromPath(path.join(ASSETS, "Cairo-Regular.ttf"), "Cairo");
  } catch {}

  const W = 900, H = 500;
  const canvas = c.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#000a04"); bg.addColorStop(0.5, "#001508"); bg.addColorStop(1, "#000808");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const burst = ctx.createRadialGradient(W * 0.21, H * 0.5, 0, W * 0.21, H * 0.5, W * 0.38);
  burst.addColorStop(0, "rgba(0,220,100,0.45)"); burst.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = burst; ctx.fillRect(0, 0, W, H);

  const vline = ctx.createLinearGradient(0, 0, 0, H);
  vline.addColorStop(0, "rgba(0,220,100,0)"); vline.addColorStop(0.5, "rgba(0,255,120,1)"); vline.addColorStop(1, "rgba(0,220,100,0)");
  ctx.fillStyle = vline; ctx.fillRect(W * 0.42, 0, 4, H);

  const leftG = ctx.createLinearGradient(0, 0, W * 0.4, 0);
  leftG.addColorStop(0, "rgba(0,180,80,0.4)"); leftG.addColorStop(1, "rgba(0,80,30,0)");
  ctx.fillStyle = leftG; ctx.fillRect(0, 0, W * 0.4, H);

  ctx.save(); ctx.globalAlpha = 0.07; ctx.strokeStyle = "#00ff66"; ctx.lineWidth = 18;
  for (let x = -H; x < W * 0.45; x += 48) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke(); }
  ctx.restore();

  ctx.save(); ctx.shadowColor = "#00ff66"; ctx.shadowBlur = 20;
  ctx.font = "bold 22px CairoBold"; ctx.fillStyle = "#00ff88"; ctx.textAlign = "center";
  ctx.fillText("الناجي الوحيد!", W * 0.21, 108); ctx.shadowBlur = 0; ctx.restore();

  ctx.save(); ctx.globalAlpha = 0.2; ctx.font = "170px CairoBold"; ctx.textAlign = "center";
  ctx.fillStyle = "#00ff88"; ctx.fillText("🏆", W * 0.21, H * 0.64); ctx.restore();

  ctx.save(); ctx.fillStyle = "rgba(0,130,60,0.65)"; rRect(ctx, W * 0.05, H - 70, W * 0.32, 44, 10); ctx.fill();
  ctx.font = "bold 19px CairoBold"; ctx.fillStyle = "#66ffaa"; ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة 💣", W * 0.21, H - 42); ctx.restore();

  const rx = W * 0.46, rw = W * 0.54;
  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(0,220,100,0.65)"; ctx.textAlign = "center";
  ctx.fillText("╴ الفائز ╶", rx + rw / 2, 95); ctx.restore();

  ctx.save(); ctx.shadowColor = "#00ff88"; ctx.shadowBlur = 50;
  ctx.font = `bold ${playerName.length > 12 ? 52 : 68}px CairoBold`; ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
  const ny = H * 0.52; ctx.fillText(playerName, rx + rw / 2, ny); ctx.shadowBlur = 0; ctx.restore();

  const lg = ctx.createLinearGradient(rx + rw * 0.1, 0, rx + rw * 0.9, 0);
  lg.addColorStop(0, "rgba(0,255,100,0)"); lg.addColorStop(0.5, "rgba(0,255,100,0.9)"); lg.addColorStop(1, "rgba(0,255,100,0)");
  ctx.strokeStyle = lg; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(rx + rw * 0.1, ny + 18); ctx.lineTo(rx + rw * 0.9, ny + 18); ctx.stroke();

  ctx.save(); ctx.font = "bold 20px Cairo"; ctx.fillStyle = "rgba(0,220,100,0.6)"; ctx.textAlign = "center";
  ctx.fillText("✦  مبروك  ✦", rx + rw / 2, H - 30); ctx.restore();

  cornerGlow(ctx, 0, 0, 0, 255, 102, 90, 0.35);
  cornerGlow(ctx, W, H, 0, 255, 136, 80, 0.3);

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
