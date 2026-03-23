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

const W = 800;
const H = 480;

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

// ─── Outsider card (player who doesn't know the topic) ───────────────────────
export async function generateOutsiderCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const primary = "#a855f7";
  const dark    = "#7c3aed";
  const gr = 168, gg = 85, gb = 247;

  // 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#06000f");
  bg.addColorStop(1, "#120020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Glow blob
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.4, 10, W * 0.7, H * 0.4, 320);
  glow.addColorStop(0,    `rgba(${gr},${gg},${gb},0.28)`);
  glow.addColorStop(0.5,  `rgba(${gr},${gg},${gb},0.10)`);
  glow.addColorStop(1,    `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 3. Subtle arc
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = primary;
  ctx.lineWidth   = 90;
  ctx.beginPath();
  ctx.arc(W + 70, -70, 280, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // 4. Left stripe
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, primary);
  stripe.addColorStop(0.65, dark);
  stripe.addColorStop(1, "transparent");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 7, H);

  // 5. Border frame
  ctx.save();
  roundRect(ctx, 4, 4, W - 8, H - 8, 16);
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.22)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 6. Top pill
  const pillW = 240, pillH = 40, pillX = W - 64 - pillW, pillY = 44;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.45)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "center";
  ctx.fillStyle  = primary;
  ctx.font       = "bold 20px CairoBold";
  ctx.fillText("🫥  دورك في اللعبة", pillX + pillW / 2, pillY + 27);
  ctx.restore();

  // 7. Big role name
  ctx.save();
  ctx.direction   = "rtl";
  ctx.textAlign   = "right";
  ctx.shadowColor = primary;
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = "#ffffff";
  ctx.font        = "bold 108px CairoBold";
  ctx.fillText("برا السالفة", W - 56, 232);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // 8. Divider
  const div = ctx.createLinearGradient(W - 430, 0, W - 56, 0);
  div.addColorStop(0, "rgba(255,255,255,0)");
  div.addColorStop(0.5, `rgba(${gr},${gg},${gb},0.5)`);
  div.addColorStop(1, primary);
  ctx.strokeStyle = div;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 430, 254);
  ctx.lineTo(W - 56,  254);
  ctx.stroke();

  // 9. Tagline
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.55)";
  ctx.font       = "26px Cairo";
  ctx.fillText("ما تعرف الموضوع — اكتشفه قبل أن ينكشف أمرك!", W - 56, 305);
  ctx.restore();

  // 10. Player name pill
  const namePillW = Math.min(360, playerName.length * 22 + 60);
  const namePillH = 46;
  const namePillX = W - 56 - namePillW;
  const namePillY = 340;
  ctx.save();
  roundRect(ctx, namePillX, namePillY, namePillW, namePillH, namePillH / 2);
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.15)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.35)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "center";
  ctx.fillStyle  = "#e9d5ff";
  ctx.font       = "bold 24px CairoBold";
  const displayName = playerName.length > 14 ? playerName.slice(0, 14) + "..." : playerName;
  ctx.fillText(displayName, namePillX + namePillW / 2, namePillY + 32);
  ctx.restore();

  // 11. Bottom separator
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(44, H - 68);
  ctx.lineTo(W - 44, H - 68);
  ctx.stroke();

  // 12. Bottom labels
  ctx.save();
  ctx.direction  = "ltr";
  ctx.textAlign  = "left";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("🫥  برا السالفة", 52, H - 24);
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("لا تنكشف 🤫", W - 52, H - 24);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Insider card (player who knows the topic) ────────────────────────────────
export async function generateInsiderCard(
  playerName: string, category: string, topic: string
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const primary = "#10b981";
  const dark    = "#047857";
  const gr = 16, gg = 185, gb = 129;

  // 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#000f09");
  bg.addColorStop(1, "#001a10");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 2. Glow blob
  const glow = ctx.createRadialGradient(W * 0.68, H * 0.38, 10, W * 0.68, H * 0.38, 310);
  glow.addColorStop(0,    `rgba(${gr},${gg},${gb},0.25)`);
  glow.addColorStop(0.5,  `rgba(${gr},${gg},${gb},0.08)`);
  glow.addColorStop(1,    `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 3. Subtle arc
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = primary;
  ctx.lineWidth   = 90;
  ctx.beginPath();
  ctx.arc(W + 70, -70, 280, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // 4. Left stripe
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, primary);
  stripe.addColorStop(0.65, dark);
  stripe.addColorStop(1, "transparent");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 7, H);

  // 5. Border
  ctx.save();
  roundRect(ctx, 4, 4, W - 8, H - 8, 16);
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.22)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // 6. Top pill: category
  const pillW = 220, pillH = 38, pillX = W - 64 - pillW, pillY = 42;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.45)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "center";
  ctx.fillStyle  = primary;
  ctx.font       = "bold 19px CairoBold";
  ctx.fillText(category, pillX + pillW / 2, pillY + 26);
  ctx.restore();

  // 7. Small label "الكلمة"
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = `rgba(${gr},${gg},${gb},0.70)`;
  ctx.font       = "bold 28px CairoBold";
  ctx.fillText("الكلمة:", W - 56, 138);
  ctx.restore();

  // 8. BIG topic word
  const topicFontSize = topic.length > 8 ? 90 : topic.length > 5 ? 104 : 118;
  ctx.save();
  ctx.direction   = "rtl";
  ctx.textAlign   = "right";
  ctx.shadowColor = primary;
  ctx.shadowBlur  = 28;
  ctx.fillStyle   = "#ffffff";
  ctx.font        = `bold ${topicFontSize}px CairoBold`;
  ctx.fillText(topic, W - 56, 240);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // 9. Divider
  const div = ctx.createLinearGradient(W - 430, 0, W - 56, 0);
  div.addColorStop(0, "rgba(255,255,255,0)");
  div.addColorStop(0.5, `rgba(${gr},${gg},${gb},0.5)`);
  div.addColorStop(1, primary);
  ctx.strokeStyle = div;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 430, 268);
  ctx.lineTo(W - 56,  268);
  ctx.stroke();

  // 10. Warning tagline
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.50)";
  ctx.font       = "24px Cairo";
  ctx.fillText("لمّح بذكاء — لا تقل الكلمة مباشرة! 🎯", W - 56, 314);
  ctx.restore();

  // 11. Player name pill
  const namePillW = Math.min(360, playerName.length * 22 + 60);
  const namePillH = 44;
  const namePillX = W - 56 - namePillW;
  const namePillY = 348;
  ctx.save();
  roundRect(ctx, namePillX, namePillY, namePillW, namePillH, namePillH / 2);
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.14)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.35)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "center";
  ctx.fillStyle  = "#a7f3d0";
  ctx.font       = "bold 23px CairoBold";
  const displayName = playerName.length > 14 ? playerName.slice(0, 14) + "..." : playerName;
  ctx.fillText(displayName, namePillX + namePillW / 2, namePillY + 30);
  ctx.restore();

  // 12. Bottom separator
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(44, H - 68);
  ctx.lineTo(W - 44, H - 68);
  ctx.stroke();

  // 13. Bottom labels
  ctx.save();
  ctx.direction  = "ltr";
  ctx.textAlign  = "left";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("✅  داخل السالفة", 52, H - 24);
  ctx.restore();

  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("لا تكشف الكلمة 🤐", W - 52, H - 24);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Reveal card: shown in group when outsider is unmasked ────────────────────
export async function generateRevealCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const W2 = 800, H2 = 480;
  const canvas = cv.createCanvas(W2, H2);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Deep black bg ───────────────────────────────────────────────────────
  ctx.fillStyle = "#03000a";
  ctx.fillRect(0, 0, W2, H2);

  // ── 2. Bottom-centre dramatic spotlight ────────────────────────────────────
  const spotlight = ctx.createRadialGradient(W2 / 2, H2 + 60, 20, W2 / 2, H2 + 60, 520);
  spotlight.addColorStop(0,    "rgba(180, 80, 255, 0.55)");
  spotlight.addColorStop(0.35, "rgba(120, 30, 200, 0.25)");
  spotlight.addColorStop(0.65, "rgba(60,  10, 120, 0.10)");
  spotlight.addColorStop(1,    "rgba(0,   0,   0,  0)");
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, W2, H2);

  // ── 3. Top-centre subtle purple glow ──────────────────────────────────────
  const topGlow = ctx.createRadialGradient(W2 / 2, -30, 10, W2 / 2, -30, 320);
  topGlow.addColorStop(0,   "rgba(160, 60, 255, 0.30)");
  topGlow.addColorStop(0.5, "rgba(100, 20, 200, 0.08)");
  topGlow.addColorStop(1,   "rgba(0, 0, 0, 0)");
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W2, H2);

  // ── 4. Fine horizontal scanline texture ───────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.025;
  for (let y = 0; y < H2; y += 4) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, y, W2, 1);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 5. Outer border ────────────────────────────────────────────────────────
  ctx.save();
  roundRect(ctx, 3, 3, W2 - 6, H2 - 6, 18);
  ctx.strokeStyle = "rgba(180, 80, 255, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── 6. Left + right thin stripe ───────────────────────────────────────────
  for (const x of [0, W2 - 6]) {
    const s = ctx.createLinearGradient(0, 0, 0, H2);
    s.addColorStop(0, "transparent");
    s.addColorStop(0.5, "#a855f7");
    s.addColorStop(1, "transparent");
    ctx.fillStyle = s;
    ctx.fillRect(x, 0, 6, H2);
  }

  // ── 7. Top pill: "انكشف!" ─────────────────────────────────────────────────
  const pillW = 180, pillH = 38, pillX = (W2 - pillW) / 2, pillY = 36;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(168, 85, 247, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(168, 85, 247, 0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#d8b4fe";
  ctx.font = "bold 19px CairoBold";
  ctx.fillText("🎭 انكشف!", W2 / 2, pillY + 26);
  ctx.restore();

  // ── 8. "برا السالفة" heading ──────────────────────────────────────────────
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "28px Cairo";
  ctx.fillText("برا السالفة", W2 / 2, 136);
  ctx.restore();

  // ── 9. "هو..." suspense text ──────────────────────────────────────────────
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(216, 180, 254, 0.70)";
  ctx.font = "bold 46px CairoBold";
  ctx.fillText("هـو ...", W2 / 2, 210);
  ctx.restore();

  // ── 10. Divider glow line ─────────────────────────────────────────────────
  const dv = ctx.createLinearGradient(80, 0, W2 - 80, 0);
  dv.addColorStop(0,   "transparent");
  dv.addColorStop(0.4, "rgba(168,85,247,0.6)");
  dv.addColorStop(0.6, "rgba(168,85,247,0.6)");
  dv.addColorStop(1,   "transparent");
  ctx.strokeStyle = dv;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(80, 232);
  ctx.lineTo(W2 - 80, 232);
  ctx.stroke();

  // ── 11. HUGE player name ──────────────────────────────────────────────────
  const displayName = playerName.length > 16 ? playerName.slice(0, 16) + "…" : playerName;
  const nameFontSize = displayName.length > 10 ? 72 : displayName.length > 7 ? 86 : 100;
  ctx.save();
  ctx.direction   = "rtl";
  ctx.textAlign   = "center";
  ctx.shadowColor = "#c026d3";
  ctx.shadowBlur  = 40;
  ctx.fillStyle   = "#ffffff";
  ctx.font        = `bold ${nameFontSize}px CairoBold`;
  ctx.fillText(displayName, W2 / 2, 350);
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur  = 60;
  ctx.fillText(displayName, W2 / 2, 350);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // ── 12. Decorative corner dots ────────────────────────────────────────────
  const dots = [
    [70, 70], [W2 - 70, 70], [70, H2 - 70], [W2 - 70, H2 - 70],
    [W2 / 2 - 120, H2 - 70], [W2 / 2 + 120, H2 - 70],
  ] as [number, number][];
  for (const [dx, dy] of dots) {
    ctx.beginPath();
    ctx.arc(dx, dy, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(168, 85, 247, 0.45)";
    ctx.fill();
  }

  // ── 13. Bottom separator ──────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(44, H2 - 66);
  ctx.lineTo(W2 - 44, H2 - 66);
  ctx.stroke();

  // ── 14. Bottom labels ─────────────────────────────────────────────────────
  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font      = "18px Cairo";
  ctx.fillText("🫥  برا السالفة", 52, H2 - 24);
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.font      = "18px Cairo";
  ctx.fillText("MaxGame Bot 🎮", W2 - 52, H2 - 24);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
