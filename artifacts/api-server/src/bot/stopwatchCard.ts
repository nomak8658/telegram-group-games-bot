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
const ROW_H = 80;
const HEADER_H = 120;
const FOOTER_H = 40;

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

function limitName(name: string, max = 16): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

function fmtRemaining(ms: number): string {
  const s = Math.max(0, ms / 1000);
  return s.toFixed(2) + " ث";
}

export interface StopwatchResultPlayer {
  name:      string;
  remaining: number | null; // null = didn't press (exploded), negative = pressed after 0
  exploded:  boolean;
}

export async function generateStopwatchResultCard(
  players: StopwatchResultPlayer[],
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  // Sort: safe players by remaining (ascending), then exploded
  const safe     = players.filter(p => !p.exploded && p.remaining != null && p.remaining > 0)
                          .sort((a, b) => a.remaining! - b.remaining!);
  const exploded = players.filter(p => p.exploded || p.remaining == null || p.remaining <= 0);
  const ranked   = [...safe, ...exploded];

  const displayCount = Math.min(ranked.length, 6);
  const H = HEADER_H + displayCount * ROW_H + FOOTER_H;

  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#040000");
  bg.addColorStop(0.5, "#0a0000");
  bg.addColorStop(1,   "#020000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle scan lines
  for (let y = 0; y < H; y += 5) {
    ctx.fillStyle = "rgba(255,0,0,0.018)";
    ctx.fillRect(0, y, W, 1);
  }

  // ── Header
  const hGrad = ctx.createLinearGradient(0, 0, W, 0);
  hGrad.addColorStop(0,   "rgba(180,0,0,0.2)");
  hGrad.addColorStop(0.5, "rgba(220,0,0,0.12)");
  hGrad.addColorStop(1,   "rgba(180,0,0,0.2)");
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, W, HEADER_H);

  ctx.save();
  ctx.font = "bold 32px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ff2200";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("سلك الموت الموقوت", W / 2, 50);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.font = "18px Cairo";
  ctx.fillStyle = "rgba(255,100,100,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("╴  النتيجة النهائية  ╶", W / 2, 88);

  // Header divider
  const hDiv = ctx.createLinearGradient(0, 0, W, 0);
  hDiv.addColorStop(0,   "rgba(255,0,0,0)");
  hDiv.addColorStop(0.5, "rgba(255,30,0,0.7)");
  hDiv.addColorStop(1,   "rgba(255,0,0,0)");
  ctx.strokeStyle = hDiv;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H); ctx.lineTo(W, HEADER_H);
  ctx.stroke();

  // ── Player rows
  ranked.slice(0, 6).forEach((p, i) => {
    const ry    = HEADER_H + i * ROW_H;
    const isSafe = !p.exploded && p.remaining != null && p.remaining > 0;
    const isWinner = i === 0 && isSafe;
    const rank   = isSafe ? i + 1 : null;

    // Row background
    if (isWinner) {
      ctx.fillStyle = "rgba(200,160,0,0.18)";
    } else if (!isSafe) {
      ctx.fillStyle = "rgba(180,0,0,0.12)";
    } else {
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.01)";
    }
    ctx.fillRect(0, ry, W, ROW_H);

    // Row border
    const borderColor = isWinner ? "rgba(220,180,0,0.6)"
      : !isSafe        ? "rgba(220,0,0,0.35)"
      : "rgba(255,255,255,0.06)";
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isWinner ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(0, ry + ROW_H - 1); ctx.lineTo(W, ry + ROW_H - 1);
    ctx.stroke();

    const midY = ry + ROW_H / 2;

    // ── Rank indicator (left, x=30)
    if (isWinner) {
      ctx.save();
      ctx.font = "bold 30px CairoBold";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "center";
      ctx.shadowColor = "#cc9900";
      ctx.shadowBlur = 12;
      ctx.fillText("1", 36, midY + 11);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else if (rank) {
      ctx.font = "bold 22px CairoBold";
      ctx.fillStyle = "rgba(180,180,180,0.7)";
      ctx.textAlign = "center";
      ctx.fillText(String(rank), 36, midY + 9);
    } else {
      // Exploded - draw X with lines
      ctx.save();
      ctx.strokeStyle = "#cc2200";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(20, midY - 10); ctx.lineTo(50, midY + 10);
      ctx.moveTo(50, midY - 10); ctx.lineTo(20, midY + 10);
      ctx.stroke();
      ctx.restore();
    }

    // ── Player name (left area, x=80)
    const nameX = 80;
    ctx.font = isWinner ? "bold 24px CairoBold" : "20px Cairo";
    ctx.fillStyle = isWinner ? "#ffd700"
      : !isSafe    ? "rgba(255,100,100,0.8)"
      : "#cccccc";
    ctx.textAlign = "left";
    ctx.fillText(limitName(p.name), nameX, midY + 8);

    // ── Winner badge
    if (isWinner) {
      ctx.fillStyle = "rgba(200,160,0,0.3)";
      roundRect(ctx, W - 190, midY - 20, 168, 40, 8);
      ctx.fill();
      ctx.font = "bold 17px CairoBold";
      ctx.fillStyle = "#ffd700";
      ctx.textAlign = "center";
      ctx.fillText("الفائز", W - 106, midY + 7);
    }

    // ── Time display (right, x=W-220)
    if (isSafe && p.remaining != null) {
      ctx.save();
      ctx.font = "bold 26px CairoBold";
      ctx.textAlign = "right";
      ctx.fillStyle = isWinner ? "#ffffff" : "rgba(220,220,220,0.85)";
      if (isWinner) {
        ctx.shadowColor = "#cc9900";
        ctx.shadowBlur = 10;
      }
      ctx.fillText(fmtRemaining(p.remaining), isWinner ? W - 205 : W - 32, midY + 9);
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      ctx.font = "bold 20px CairoBold";
      ctx.fillStyle = "rgba(255,80,80,0.9)";
      ctx.textAlign = "right";
      ctx.fillText("انفجرت!", W - 32, midY + 8);
    }
  });

  // ── Footer
  ctx.font = "14px Cairo";
  ctx.fillStyle = "rgba(180,0,0,0.4)";
  ctx.textAlign = "center";
  ctx.fillText("سلك الموت الموقوت", W / 2, H - 12);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
