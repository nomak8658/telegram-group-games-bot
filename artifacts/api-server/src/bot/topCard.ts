import path from "path";
import { fileURLToPath } from "url";
import type { LeaderEntry } from "./state.js";

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

const W = 720;
const H = 560;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
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

// ─── Rank styles ──────────────────────────────────────────────────────────────
const RANKS = [
  { medal: "🥇", color: "#FFD700", glow: [255, 215, 0],   rowBg: "rgba(255,215,0,0.07)"  },
  { medal: "🥈", color: "#C0C0C0", glow: [192, 192, 192], rowBg: "rgba(192,192,192,0.05)" },
  { medal: "🥉", color: "#CD7F32", glow: [205, 127, 50],  rowBg: "rgba(205,127,50,0.05)"  },
  { medal: "4",  color: "#7B8CA0", glow: [123, 140, 160], rowBg: "rgba(123,140,160,0.04)" },
  { medal: "5",  color: "#5A6878", glow: [90, 104, 120],  rowBg: "rgba(90,104,120,0.04)"  },
];

export async function generateTopCard(
  entries: [string, LeaderEntry][],
  groupName = "المجموعة"
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const top = entries.slice(0, 5);

  // ── 1. Background ──────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#07080f");
  bg.addColorStop(1, "#0d0f1c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Subtle top-right glow (gold) ───────────────────────────────────────
  const glow = ctx.createRadialGradient(W * 0.75, 0, 10, W * 0.75, 0, 300);
  glow.addColorStop(0,   "rgba(255,215,0,0.12)");
  glow.addColorStop(0.5, "rgba(255,215,0,0.04)");
  glow.addColorStop(1,   "rgba(255,215,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Outer border ────────────────────────────────────────────────────────
  ctx.save();
  roundRect(ctx, 3, 3, W - 6, H - 6, 18);
  ctx.strokeStyle = "rgba(255,215,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── 4. Gold left stripe ───────────────────────────────────────────────────
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, "#FFD700");
  stripe.addColorStop(0.5, "#B8860B");
  stripe.addColorStop(1, "transparent");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 6, H);

  // ── 5. Header area ────────────────────────────────────────────────────────
  const headerH = 84;

  // Trophy icon area (left side in RTL = right)
  ctx.save();
  ctx.font = "42px Cairo";
  ctx.fillText("🏆", W - 62, 58);
  ctx.restore();

  // Title
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.shadowColor = "#FFD700";
  ctx.shadowBlur  = 18;
  ctx.fillStyle   = "#FFD700";
  ctx.font        = "bold 36px CairoBold";
  ctx.fillText("الأفضل", W - 110, 52);
  ctx.shadowBlur  = 0;
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font      = "19px Cairo";
  ctx.fillText(groupName.length > 28 ? groupName.slice(0, 28) + "…" : groupName, W - 110, 78);
  ctx.restore();

  // Header separator
  const sep = ctx.createLinearGradient(0, 0, W, 0);
  sep.addColorStop(0, "transparent");
  sep.addColorStop(0.3, "rgba(255,215,0,0.4)");
  sep.addColorStop(1, "transparent");
  ctx.strokeStyle = sep;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(40, headerH);
  ctx.lineTo(W - 40, headerH);
  ctx.stroke();

  // ── 6. Rows ────────────────────────────────────────────────────────────────
  const rowH   = 80;
  const startY = headerH + 6;
  const padX   = 24;

  if (top.length === 0) {
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font      = "24px Cairo";
    ctx.fillText("ما في بيانات بعد — العبوا وتراكموا النقاط! 🎮", W / 2, H / 2);
    ctx.restore();
  }

  for (let i = 0; i < top.length; i++) {
    const [, entry] = top[i];
    const rank = RANKS[i];
    const rowY = startY + i * rowH + 4;
    const [gr, gg, gb] = rank.glow;

    // Row background pill
    ctx.save();
    roundRect(ctx, padX, rowY, W - padX * 2, rowH - 8, 12);
    ctx.fillStyle = rank.rowBg;
    ctx.fill();
    ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.18)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Rank number/medal (right side = RTL left)
    const isTop3 = i < 3;
    if (isTop3) {
      ctx.save();
      ctx.font = "30px Cairo";
      ctx.fillText(rank.medal, W - padX - 44, rowY + 48);
      ctx.restore();
    } else {
      // Number badge for 4th and 5th
      ctx.save();
      roundRect(ctx, W - padX - 46, rowY + 18, 36, 36, 8);
      ctx.fillStyle = `rgba(${gr},${gg},${gb},0.15)`;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.direction = "ltr";
      ctx.textAlign = "center";
      ctx.fillStyle = rank.color;
      ctx.font      = "bold 20px CairoBold";
      ctx.fillText(rank.medal, W - padX - 46 + 18, rowY + 42);
      ctx.restore();
    }

    // Name
    const displayName = entry.name.length > 18 ? entry.name.slice(0, 18) + "…" : entry.name;
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = i === 0 ? "#FFD700" : "#ffffff";
    ctx.shadowColor = i === 0 ? "#FFD700" : "transparent";
    ctx.shadowBlur  = i === 0 ? 10 : 0;
    ctx.font = `bold ${i === 0 ? 26 : 24}px CairoBold`;
    ctx.fillText(displayName, W - padX - 58, rowY + 34);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Win rate pill
    const rate = entry.games > 0 ? Math.round((entry.wins / entry.games) * 100) : 0;
    const rateW = 72, rateH = 26;
    const rateX = padX + 100;
    const rateY2 = rowY + rowH - 8 - rateH - 4;
    ctx.save();
    roundRect(ctx, rateX, rateY2, rateW, rateH, rateH / 2);
    ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.direction = "ltr";
    ctx.textAlign = "center";
    ctx.fillStyle = rank.color;
    ctx.font      = "bold 14px CairoBold";
    ctx.fillText(`${rate}% فوز`, rateX + rateW / 2, rateY2 + 18);
    ctx.restore();

    // Points (wins) large
    ctx.save();
    ctx.direction = "rtl";
    ctx.textAlign = "right";
    ctx.fillStyle = rank.color;
    ctx.font      = `bold 22px CairoBold`;
    ctx.fillText(`${entry.wins} نقطة`, W - padX - 58, rowY + 62);
    ctx.restore();

    // Games played small
    ctx.save();
    ctx.direction = "ltr";
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,255,255,0.30)";
    ctx.font      = "16px Cairo";
    ctx.fillText(`${entry.games} لعبة`, padX + 14, rowY + 57);
    ctx.restore();

    // Thin row separator (not after last)
    if (i < top.length - 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX + 20, rowY + rowH - 2);
      ctx.lineTo(W - padX - 20, rowY + rowH - 2);
      ctx.stroke();
    }
  }

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font      = "16px Cairo";
  ctx.fillText("🎮  MaxGame Bot", padX + 8, H - 18);
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font      = "16px Cairo";
  ctx.fillText("النقاط = الانتصارات 🏆", W - padX - 8, H - 18);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
