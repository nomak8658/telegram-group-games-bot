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

const W = 900, H = 540;

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#05060F",
  a:        "#0077FF",   // team A blue
  aDark:    "#001233",
  aPanel:   "#001A44",
  aMid:     "#003B99",
  b:        "#FF1A44",   // team B red
  bDark:    "#330010",
  bPanel:   "#44001A",
  bMid:     "#AA002A",
  white:    "#FFFFFF",
  silver:   "#CCCCDD",
  dim:      "#778899",
  gold:     "#FFD500",
  sofaDark: "#3D2008",
  sofaMid:  "#6B3C15",
  sofaHi:   "#9C5A25",
  sofaArm:  "#4E2910",
};

const TEAM_COLOR  = [C.a,      C.b     ] as const;
const TEAM_PANEL  = [C.aPanel, C.bPanel] as const;
const TEAM_MID    = [C.aMid,   C.bMid  ] as const;
const TEAM_DARK   = [C.aDark,  C.bDark ] as const;
const TEAM_LABEL  = ["الفريق الأزرق", "الفريق الاحمر"] as const;
const TEAM_BULLET = ["[A]", "[B]"] as const;

function lim(s: string, n = 15) { return s.length > n ? s.slice(0, n) + ".." : s; }

// ── Drawing helpers ───────────────────────────────────────────────────────────

function fillBg(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0,   "#08091A");
  g.addColorStop(0.5, "#05060F");
  g.addColorStop(1,   "#070815");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // faint dot grid
  ctx.save();
  ctx.fillStyle = "rgba(120,130,200,0.04)";
  for (let x = 20; x < W; x += 30)
    for (let y = 20; y < H; y += 30) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.restore();
}

function gline(ctx: CanvasRenderingContext2D, y: number, col: string) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, col + "CC");
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

function panel(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  bg: string, border: string, radius = 12,
) {
  ctx.save();
  ctx.fillStyle = bg;
  ctx.shadowColor = border;
  ctx.shadowBlur  = 14;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = border;
  ctx.lineWidth   = 1.5;
  ctx.stroke();
  ctx.restore();
}

function text(
  ctx: CanvasRenderingContext2D,
  s: string, x: number, y: number,
  font: string, fill: string, align: CanvasTextAlign = "left",
  glow = "",
) {
  ctx.save();
  ctx.font        = font;
  ctx.fillStyle   = fill;
  ctx.textAlign   = align;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
  ctx.fillText(s, x, y);
  ctx.restore();
}

function wrapAt(
  ctx: CanvasRenderingContext2D,
  s: string, x: number, y: number,
  maxW: number, lineH: number,
  font: string, fill: string, align: CanvasTextAlign = "center",
): number {
  ctx.font      = font;
  ctx.fillStyle = fill;
  ctx.textAlign = align;
  const words = s.split(" ");
  let line = "", cy = y;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, cy); line = w; cy += lineH;
    } else { line = t; }
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineH; }
  return cy;
}

// ── Sofa ─────────────────────────────────────────────────────────────────────

function drawSofa(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, W2: number, H2: number, glow: string,
) {
  const AW = W2 * 0.11, BH = H2 * 0.52, SH = H2 * 0.35, LH = H2 * 0.13, LW = W2 * 0.07;
  const sx = cx - W2 / 2;
  const seatY = cy - SH / 2;
  const backY = seatY - BH;
  const legY  = seatY + SH;

  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur  = 28;

  // back
  const bg = ctx.createLinearGradient(sx, backY, sx + W2, backY + BH);
  bg.addColorStop(0, C.sofaMid);
  bg.addColorStop(1, C.sofaDark);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(sx, backY, W2, BH + SH * 0.1, [16, 16, 0, 0]); ctx.fill();

  // back top stripe (team color)
  ctx.fillStyle = glow + "55";
  ctx.beginPath(); ctx.roundRect(sx + 6, backY + 5, W2 - 12, 8, 4); ctx.fill();

  // back highlight
  ctx.fillStyle = C.sofaHi + "66";
  ctx.beginPath(); ctx.roundRect(sx + 10, backY + 18, W2 - 20, BH * 0.3, [8, 8, 0, 0]); ctx.fill();

  // stitching
  ctx.strokeStyle = C.sofaDark; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.roundRect(sx + 14, backY + 14, W2 - 28, BH - 20, 8); ctx.stroke();
  ctx.setLineDash([]);

  // seat
  const sg = ctx.createLinearGradient(0, seatY, 0, seatY + SH);
  sg.addColorStop(0, C.sofaHi); sg.addColorStop(1, C.sofaDark);
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.roundRect(sx + AW, seatY, W2 - 2 * AW, SH, [0, 0, 10, 10]); ctx.fill();

  // center crease
  ctx.strokeStyle = C.sofaDark; ctx.lineWidth = 2; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx, seatY + 6); ctx.lineTo(cx, seatY + SH - 6); ctx.stroke();

  // armrests
  ctx.fillStyle = C.sofaArm;
  ctx.beginPath(); ctx.roundRect(sx,            seatY - BH * 0.28, AW, SH + BH * 0.28, [8, 0, 8, 8]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(sx + W2 - AW,  seatY - BH * 0.28, AW, SH + BH * 0.28, [0, 8, 8, 8]); ctx.fill();

  // armrest tops
  ctx.fillStyle = C.sofaMid;
  ctx.beginPath(); ctx.roundRect(sx + 3,           seatY - BH * 0.28, AW - 6, AW * 0.5, 4); ctx.fill();
  ctx.beginPath(); ctx.roundRect(sx + W2 - AW + 3, seatY - BH * 0.28, AW - 6, AW * 0.5, 4); ctx.fill();

  // legs
  ctx.fillStyle = C.sofaDark;
  ctx.beginPath(); ctx.roundRect(sx + AW + 6,         legY, LW, LH, [0, 0, 4, 4]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(sx + W2 - AW - LW - 6, legY, LW, LH, [0, 0, 4, 4]); ctx.fill();

  ctx.restore();
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, H2: number, glow: string,
) {
  const SH    = H2 * 0.35;
  const seatY = cy - SH / 2;
  const HR    = H2 * 0.10;
  const headY = seatY - HR * 1.2;
  const bodyH = SH * 0.5;
  const bodyY = headY + HR + 1;

  ctx.save();
  ctx.shadowColor = glow; ctx.shadowBlur = 24;

  // body
  ctx.fillStyle = glow;
  ctx.beginPath(); ctx.roundRect(cx - HR * 0.7, bodyY, HR * 1.4, bodyH, 6); ctx.fill();

  // head
  ctx.beginPath(); ctx.arc(cx, headY, HR, 0, Math.PI * 2); ctx.fill();

  // face shine
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath(); ctx.arc(cx - HR * 0.28, headY - HR * 0.25, HR * 0.35, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Score badge (compact) ─────────────────────────────────────────────────────

function scoreBadge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, score: number, col: string,
) {
  panel(ctx, x, y, w, h, col + "22", col + "88", 10);
  text(ctx, label, x + w / 2, y + 22, "bold 14px CairoBold", col, "center");
  text(ctx, String(score), x + w / 2, y + 62, "bold 38px CairoBold", C.white, "center", col);
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCouchStartCard
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchStartCard(
  teamA: string[], teamB: string[], _target: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  fillBg(ctx);

  // ── Title bar ──────────────────────────────────────────────────────────────
  const titleH = 100;
  const tg = ctx.createLinearGradient(0, 0, W, titleH);
  tg.addColorStop(0, "#120025"); tg.addColorStop(0.5, "#1A0040"); tg.addColorStop(1, "#0D001E");
  ctx.fillStyle = tg; ctx.fillRect(0, 0, W, titleH);

  // purple left-accent bar
  ctx.fillStyle = "#9900FF";
  ctx.fillRect(0, 0, 6, titleH);

  text(ctx, "تحدي الكنبة", W / 2, 52, "bold 44px CairoBold", C.white, "center", "#AA44FF");
  text(ctx, "اول فريق يكمل التحدي يفوز — يجلس على الكنبة + زميله يجاوب",
    W / 2, 82, "16px Cairo", C.silver, "center");

  gline(ctx, titleH, "#9900FF");

  // ── Team panels ────────────────────────────────────────────────────────────
  const PX = 18, PY = 116, PW = 270, PH = H - PY - 18;

  // Team A (left)
  panel(ctx, PX, PY, PW, PH, C.aPanel, C.a + "AA");

  // Team A header strip
  const ag = ctx.createLinearGradient(PX, PY, PX + PW, PY);
  ag.addColorStop(0, C.aMid); ag.addColorStop(1, C.aDark);
  ctx.fillStyle = ag;
  ctx.save(); ctx.beginPath(); ctx.roundRect(PX, PY, PW, 42, [12, 12, 0, 0]); ctx.fill(); ctx.restore();
  text(ctx, TEAM_LABEL[0], PX + PW / 2, PY + 28, "bold 20px CairoBold", C.white, "center", C.a);

  // Team A names
  teamA.slice(0, 5).forEach((n, i) => {
    const ny = PY + 62 + i * 38;
    // name row bg
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(0,90,200,0.12)";
      ctx.fillRect(PX + 6, ny - 20, PW - 12, 32);
    }
    text(ctx, "  " + lim(n), PX + 18, ny, "bold 19px CairoBold", C.white, "left");
  });

  // Team B (right)
  const BX = W - PX - PW;
  panel(ctx, BX, PY, PW, PH, C.bPanel, C.b + "AA");

  const rg = ctx.createLinearGradient(BX, PY, BX + PW, PY);
  rg.addColorStop(0, C.bMid); rg.addColorStop(1, C.bDark);
  ctx.fillStyle = rg;
  ctx.save(); ctx.beginPath(); ctx.roundRect(BX, PY, PW, 42, [12, 12, 0, 0]); ctx.fill(); ctx.restore();
  text(ctx, TEAM_LABEL[1], BX + PW / 2, PY + 28, "bold 20px CairoBold", C.white, "center", C.b);

  teamB.slice(0, 5).forEach((n, i) => {
    const ny = PY + 62 + i * 38;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(200,0,40,0.12)";
      ctx.fillRect(BX + 6, ny - 20, PW - 12, 32);
    }
    text(ctx, lim(n) + "  ", BX + PW - 18, ny, "bold 19px CairoBold", C.white, "right");
  });

  // ── Center sofa ────────────────────────────────────────────────────────────
  const midX = W / 2, midY = PY + PH / 2 + 20;
  drawSofa(ctx, midX, midY, 200, 128, "#9900FF");

  // VS text above sofa
  text(ctx, "VS", midX, PY + 44, "bold 22px CairoBold", "#9900FF", "center", "#AA44FF");

  return canvas.toBuffer("image/jpeg", { quality: 94 }) as unknown as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCouchSofaCard
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchSofaCard(
  sofaName: string, sofaTeam: 0 | 1,
  scoreA: number, scoreB: number,
  _target: number,
  questionText: string, questionType: string, questionNum: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const col  = TEAM_COLOR[sofaTeam];
  const dark = TEAM_DARK[sofaTeam];

  fillBg(ctx);

  // ── Score strip ────────────────────────────────────────────────────────────
  const SY = 10;
  scoreBadge(ctx, 14,      SY, 120, 80, TEAM_LABEL[0], scoreA, C.a);
  scoreBadge(ctx, W - 134, SY, 120, 80, TEAM_LABEL[1], scoreB, C.b);

  // center info
  text(ctx, "على الكنبة", W / 2, SY + 30, "bold 16px CairoBold", col, "center", col);
  text(ctx, "سؤال " + questionNum, W / 2, SY + 56, "14px Cairo", C.dim, "center");

  gline(ctx, 98, col);

  // ── Left: sofa panel ───────────────────────────────────────────────────────
  const LW2 = 330;

  // team color background for sofa section
  const lbg = ctx.createLinearGradient(0, 100, LW2, H);
  lbg.addColorStop(0, dark + "CC");
  lbg.addColorStop(1, C.bg);
  ctx.fillStyle = lbg;
  ctx.fillRect(0, 100, LW2, H - 100);

  // left accent bar
  ctx.fillStyle = col;
  ctx.fillRect(0, 100, 5, H - 100);

  const sofaCX = LW2 / 2, sofaCY = 108 + (H - 108) / 2 - 10;
  drawSofa(ctx, sofaCX, sofaCY, 210, 140, col);
  drawPerson(ctx, sofaCX, sofaCY, 140, col);

  // sofa player name
  panel(ctx, 20, H - 72, LW2 - 40, 48, col + "30", col + "88", 10);
  text(ctx, lim(sofaName, 14), LW2 / 2, H - 40, "bold 22px CairoBold", C.white, "center", col);
  text(ctx, TEAM_LABEL[sofaTeam], LW2 / 2, H - 22, "13px Cairo", col, "center");

  // ── Divider ────────────────────────────────────────────────────────────────
  const dvg = ctx.createLinearGradient(0, 100, 0, H);
  dvg.addColorStop(0, "rgba(0,0,0,0)");
  dvg.addColorStop(0.4, col + "DD");
  dvg.addColorStop(0.6, col + "DD");
  dvg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = dvg;
  ctx.fillRect(LW2, 100, 2, H - 100);

  // ── Right: question ────────────────────────────────────────────────────────
  const RX   = LW2 + 18;
  const RW   = W - RX - 14;
  const midX = RX + RW / 2;

  // type tag
  const typeLabel = questionType === "speed" ? "تحدي السرعة" :
                    questionType === "emoji"  ? "تحدي الايموجي" :
                    questionType === "tf"     ? "صح ام خطأ" :
                    questionType === "number" ? "تحدي الارقام" : "سؤال";
  const typeIcon  = questionType === "speed" ? "<<" :
                    questionType === "emoji"  ? "(>)" :
                    questionType === "tf"     ? "[?]" :
                    questionType === "number" ? "#" : "?";

  panel(ctx, RX, 110, RW, 38, col + "25", col + "66", 8);
  text(ctx, typeIcon + "  " + typeLabel, midX, 135, "bold 18px CairoBold", col, "center", col);

  // question text — big and clear
  ctx.save();
  ctx.font        = "bold 26px CairoBold";
  ctx.fillStyle   = C.white;
  ctx.textAlign   = "center";
  ctx.shadowColor = col;
  ctx.shadowBlur  = 12;
  wrapAt(ctx, questionText, midX, 188, RW - 10, 38, "bold 26px CairoBold", C.white, "center");
  ctx.restore();

  // ── Ban box ────────────────────────────────────────────────────────────────
  panel(ctx, RX, H - 84, RW, 68, col + "18", col + "55", 10);
  text(ctx, "ممنوع:  " + lim(sofaName, 12), midX, H - 58, "bold 18px CairoBold", col, "center");
  text(ctx, "بقية الفريق اجاوبوا — قبل الخصم!", midX, H - 30, "16px Cairo", C.silver, "center");

  return canvas.toBuffer("image/jpeg", { quality: 94 }) as unknown as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCouchWinCard
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchWinCard(
  winner: 0 | 1, scoreA: number, scoreB: number, mvpName: string,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const col   = TEAM_COLOR[winner];
  const dark  = TEAM_DARK[winner];
  const label = TEAM_LABEL[winner];

  // full-color background for winner side
  fillBg(ctx);

  // flood winner color softly
  const flood = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 520);
  flood.addColorStop(0, col + "28"); flood.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = flood; ctx.fillRect(0, 0, W, H);

  // ray lines
  ctx.save();
  ctx.strokeStyle = col + "18"; ctx.lineWidth = 1.5;
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI * 2) / 20;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(W / 2 + Math.cos(a) * 600, H / 2 + Math.sin(a) * 600);
    ctx.stroke();
  }
  ctx.restore();

  // top winner banner
  const bg2 = ctx.createLinearGradient(0, 0, W, 110);
  bg2.addColorStop(0, dark); bg2.addColorStop(1, col + "55");
  ctx.fillStyle = bg2; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = col; ctx.fillRect(0, 0, 8, 110);
  ctx.fillStyle = col; ctx.fillRect(W - 8, 0, 8, 110);

  text(ctx, label + " يفوز!", W / 2, 62, "bold 46px CairoBold", C.white, "center", col);
  text(ctx, "تحدي الكنبة", W / 2, 94, "18px Cairo", col, "center");

  gline(ctx, 112, col);

  // sofa + person (center)
  drawSofa(ctx, W / 2, H / 2 + 40, 240, 155, col);
  drawPerson(ctx, W / 2, H / 2 + 40, 155, col);

  // score
  text(ctx, scoreA + "  —  " + scoreB, W / 2, 155, "bold 36px CairoBold", C.white, "center", col);

  // MVP
  if (mvpName) {
    panel(ctx, W / 2 - 200, H - 60, 400, 44, col + "22", col + "88", 10);
    text(ctx, "* " + lim(mvpName, 16) + " — اكثر تاثيراً", W / 2, H - 30, "bold 19px CairoBold", col, "center");
  }

  return canvas.toBuffer("image/jpeg", { quality: 94 }) as unknown as Buffer;
}
