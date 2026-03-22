import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// In dev: __dirname = src/bot/ → assets is src/bot/assets/
// In prod (bundled dist/index.mjs): __dirname = dist/ → assets copied to dist/bot/assets/
const ASSETS = __dirname.endsWith("bot")
  ? path.join(__dirname, "assets")
  : path.join(__dirname, "bot", "assets");

// Lazy-load canvas to avoid issues at module init
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

// ─── Card dimensions ──────────────────────────────────────────────────────────
const W = 800;
const H = 460;

// ─── Role configs ──────────────────────────────────────────────────────────────
interface RoleCfg {
  nameAr:   string;
  tagline:  string;
  icon:     string;
  primary:  string;
  dark:     string;
  glow:     [number, number, number];
  bgTop:    string;
  bgBot:    string;
}

const CFG: Record<string, RoleCfg> = {
  mafia: {
    nameAr:  "مافيا",
    tagline: "تخفَّ وتلاعب بالأصوات دون انكشاف",
    icon:    "😈",
    primary: "#e03333",
    dark:    "#9b1c1c",
    glow:    [224, 51, 51],
    bgTop:   "#0c0101",
    bgBot:   "#1e0505",
  },
  doctor: {
    nameAr:  "دكتور",
    tagline: "احمِ من تشاء من الإقصاء كل جولة",
    icon:    "🩺",
    primary: "#10b981",
    dark:    "#047857",
    glow:    [16, 185, 129],
    bgTop:   "#010c08",
    bgBot:   "#031a0e",
  },
  detective: {
    nameAr:  "محقق",
    tagline: "اكشف هوية أي لاعب كل جولة سراً",
    icon:    "🔍",
    primary: "#3b82f6",
    dark:    "#1d4ed8",
    glow:    [59, 130, 246],
    bgTop:   "#010610",
    bgBot:   "#030e1f",
  },
  citizen: {
    nameAr:  "مواطن",
    tagline: "اكشف المافيا بالنقاش والتصويت",
    icon:    "🙂",
    primary: "#94a3b8",
    dark:    "#475569",
    glow:    [148, 163, 184],
    bgTop:   "#080a0c",
    bgBot:   "#111418",
  },
};

// ─── Rounded rect helper ───────────────────────────────────────────────────────
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

// ─── Main generator ────────────────────────────────────────────────────────────
export async function generateRoleCard(
  role: "mafia" | "citizen" | "doctor" | "detective"
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const cfg = CFG[role];
  const [gr, gg, gb] = cfg.glow;

  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background gradient ─────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, cfg.bgTop);
  bg.addColorStop(1, cfg.bgBot);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Right glow blob ─────────────────────────────────────────────────────
  const glow = ctx.createRadialGradient(W * 0.72, H * 0.42, 20, W * 0.72, H * 0.42, 310);
  glow.addColorStop(0,   `rgba(${gr},${gg},${gb},0.22)`);
  glow.addColorStop(0.45,`rgba(${gr},${gg},${gb},0.10)`);
  glow.addColorStop(1,   `rgba(${gr},${gg},${gb},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // ── 3. Top-right subtle arc ────────────────────────────────────────────────
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = cfg.primary;
  ctx.lineWidth = 80;
  ctx.beginPath();
  ctx.arc(W + 60, -60, 260, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 4. Left accent stripe ──────────────────────────────────────────────────
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0, cfg.primary);
  stripe.addColorStop(0.6, cfg.dark);
  stripe.addColorStop(1, "transparent");
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 7, H);

  // ── 5. Card inner frame (subtle border) ───────────────────────────────────
  ctx.save();
  roundRect(ctx, 4, 4, W - 8, H - 8, 14);
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.18)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── 6. Pill label: "دورك في اللعبة" ───────────────────────────────────────
  const pillW = 230, pillH = 38, pillX = W - 60 - pillW, pillY = 46;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = `rgba(${gr},${gg},${gb},0.18)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${gr},${gg},${gb},0.45)`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign  = "center";
  ctx.fillStyle  = cfg.primary;
  ctx.font       = "bold 19px CairoBold";
  ctx.fillText("دورك في اللعبة", pillX + pillW / 2, pillY + 26);
  ctx.restore();

  // ── 7. Role name (huge) ────────────────────────────────────────────────────
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  // Shadow glow
  ctx.shadowColor = cfg.primary;
  ctx.shadowBlur  = 24;
  ctx.fillStyle   = "#ffffff";
  ctx.font        = "bold 118px CairoBold";
  ctx.fillText(cfg.nameAr, W - 58, 226);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // ── 8. Divider line ────────────────────────────────────────────────────────
  const div = ctx.createLinearGradient(W - 420, 0, W - 58, 0);
  div.addColorStop(0, "rgba(255,255,255,0)");
  div.addColorStop(0.5, `rgba(${gr},${gg},${gb},0.55)`);
  div.addColorStop(1, cfg.primary);
  ctx.strokeStyle = div;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(W - 420, 248);
  ctx.lineTo(W - 58,  248);
  ctx.stroke();

  // ── 9. Tagline ────────────────────────────────────────────────────────────
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.60)";
  ctx.font       = "28px Cairo";
  ctx.fillText(cfg.tagline, W - 58, 296);
  ctx.restore();

  // ── 10. Bottom separator ──────────────────────────────────────────────────
  ctx.strokeStyle = `rgba(255,255,255,0.07)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(44, H - 72);
  ctx.lineTo(W - 44, H - 72);
  ctx.stroke();

  // ── 11. Bottom-left: game name ────────────────────────────────────────────
  ctx.save();
  ctx.direction  = "ltr";
  ctx.textAlign  = "left";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("🎭  لعبة المافيا", 52, H - 26);
  ctx.restore();

  // ── 12. Bottom-right: secret note ────────────────────────────────────────
  ctx.save();
  ctx.direction  = "rtl";
  ctx.textAlign  = "right";
  ctx.fillStyle  = "rgba(255,255,255,0.22)";
  ctx.font       = "20px Cairo";
  ctx.fillText("لا تكشف دورك 🤫", W - 52, H - 26);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Cache role cards ─────────────────────────────────────────────────────────
const cardCache = new Map<string, Buffer>();

export async function getRoleCard(
  role: "mafia" | "citizen" | "doctor" | "detective"
): Promise<Buffer | null> {
  try {
    if (cardCache.has(role)) return cardCache.get(role)!;
    const buf = await generateRoleCard(role);
    cardCache.set(role, buf);
    return buf;
  } catch (e) {
    return null;
  }
}
