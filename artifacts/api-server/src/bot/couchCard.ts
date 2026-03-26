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

const W = 960, H = 540;

const P = {
  bg:    "#030610",
  a:     "#1A8FFF",  aD: "#001432",  aDark: "#000D22",
  b:     "#FF2244",  bD: "#2C000E",  bDark: "#1A0009",
  gold:  "#FFB800",  goldL: "#FFD966",
  white: "#FFFFFF",  light: "#C8D4E8",  dim: "#4A5870",
  sHi:   "#D4904F",  sMid: "#A86830",  sDk: "#784518",  sLeg: "#3C1E08",
};

const TEAM_COLOR = [P.a, P.b] as const;
const TEAM_DARK  = [P.aDark, P.bDark] as const;
const TEAM_LABEL = ["الفريق الازرق", "الفريق الاحمر"] as const;

function lim(s: string, n = 16) { return s.length > n ? s.slice(0, n) + ".." : s; }

// ─── Drawing helpers ──────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function T(
  ctx: Ctx, s: string, x: number, y: number,
  font: string, fill: string, align: CanvasTextAlign = "left",
  glow = "", blur = 14,
) {
  ctx.save();
  ctx.font = font; ctx.fillStyle = fill; ctx.textAlign = align;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = blur; }
  ctx.fillText(s, x, y);
  ctx.restore();
}

function box(
  ctx: Ctx, x: number, y: number, w: number, h: number, r: number,
  fill = "", stroke = "", sw = 1.5,
) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke(); }
  ctx.restore();
}

function clipR(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fn: () => void) {
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip(); fn(); ctx.restore();
}

function wrapText(ctx: Ctx, text: string, x: number, startY: number, maxW: number, lineH: number): number {
  const words = text.split(" ");
  let line = "", cy = startY;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) {
      ctx.fillText(line, x, cy); line = w; cy += lineH;
    } else { line = t; }
  }
  if (line) { ctx.fillText(line, x, cy); cy += lineH; }
  return cy;
}

// ─── Background ───────────────────────────────────────────────────────────────

function drawBg(ctx: Ctx, glowL = "", glowR = "") {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#02040C"); g.addColorStop(0.5, "#040710"); g.addColorStop(1, "#030510");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(100,130,200,0.035)";
  for (let x = 24; x < W; x += 32)
    for (let y = 24; y < H; y += 32) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
  if (glowL) {
    const r = ctx.createRadialGradient(0, H / 2, 0, 0, H / 2, 360);
    r.addColorStop(0, glowL + "22"); r.addColorStop(1, "transparent");
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }
  if (glowR) {
    const r = ctx.createRadialGradient(W, H / 2, 0, W, H / 2, 360);
    r.addColorStop(0, glowR + "22"); r.addColorStop(1, "transparent");
    ctx.fillStyle = r; ctx.fillRect(0, 0, W, H);
  }
}

// ─── Score bar (shared by sofa + question cards) ──────────────────────────────

function drawScoreBar(ctx: Ctx, scoreA: number, scoreB: number, centerLabel: string, subLabel: string, accentCol: string) {
  const BH = 74;
  ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(0, 0, W, BH);
  const aGl = ctx.createLinearGradient(0, 0, 210, BH);
  aGl.addColorStop(0, P.a + "44"); aGl.addColorStop(1, "transparent");
  ctx.fillStyle = aGl; ctx.fillRect(0, 0, 210, BH);
  const bGl = ctx.createLinearGradient(W - 210, 0, W, BH);
  bGl.addColorStop(0, "transparent"); bGl.addColorStop(1, P.b + "44");
  ctx.fillStyle = bGl; ctx.fillRect(W - 210, 0, 210, BH);
  const sep = ctx.createLinearGradient(0, BH, W, BH);
  sep.addColorStop(0, P.a + "CC"); sep.addColorStop(0.5, "rgba(200,200,255,0.4)"); sep.addColorStop(1, P.b + "CC");
  ctx.fillStyle = sep; ctx.fillRect(0, BH - 2, W, 2);
  T(ctx, TEAM_LABEL[0], 16, 22, "bold 13px CairoBold", P.a, "left");
  T(ctx, String(scoreA), 100, 65, "bold 44px CairoBold", P.white, "center", P.a, 22);
  T(ctx, TEAM_LABEL[1], W - 16, 22, "bold 13px CairoBold", P.b, "right");
  T(ctx, String(scoreB), W - 100, 65, "bold 44px CairoBold", P.white, "center", P.b, 22);
  box(ctx, W / 2 - 72, 7, 144, 60, 12, accentCol + "20", accentCol + "77", 1.5);
  T(ctx, centerLabel, W / 2, 28, "bold 13px CairoBold", accentCol, "center", accentCol, 10);
  T(ctx, subLabel, W / 2, 55, "12px Cairo", P.dim, "center");
}

// ─── Leather sofa (pure brown, NO team color) ─────────────────────────────────

function drawSofa(ctx: Ctx, cx: number, cy: number, s = 1) {
  const TW = 268 * s, AW = 32 * s, SH = 50 * s, BH = 72 * s, LH = 22 * s, LW = 11 * s;
  const sX = cx - TW / 2, sY = cy, backY = sY - SH - BH + 6;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;

  const bG = ctx.createLinearGradient(sX, backY, sX + TW, backY + BH);
  bG.addColorStop(0, P.sDk); bG.addColorStop(0.45, P.sMid); bG.addColorStop(1, P.sDk);
  ctx.fillStyle = bG; ctx.beginPath(); ctx.roundRect(sX + AW * 0.35, backY, TW - AW * 0.7, BH, [14, 14, 0, 0]); ctx.fill();
  ctx.fillStyle = "rgba(220,150,55,0.18)";
  ctx.beginPath(); ctx.roundRect(sX + AW * 0.35 + 7, backY + 6, TW - AW * 0.7 - 14, 13, [8, 8, 0, 0]); ctx.fill();
  ctx.strokeStyle = P.sLeg + "88"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
  ctx.beginPath(); ctx.moveTo(cx, backY + 11); ctx.lineTo(cx, backY + BH - 7); ctx.stroke(); ctx.setLineDash([]);

  const aG = ctx.createLinearGradient(0, sY - BH * 0.52, 0, sY + SH);
  aG.addColorStop(0, P.sMid); aG.addColorStop(0.5, P.sDk); aG.addColorStop(1, P.sLeg);
  ctx.shadowBlur = 10;
  for (const side of [0, 1]) {
    const ax  = side === 0 ? sX : sX + TW - AW;
    const rad = side === 0 ? [10, 4, 8, 8] : [4, 10, 8, 8];
    ctx.fillStyle = aG; ctx.beginPath(); ctx.roundRect(ax, sY - BH * 0.52, AW, SH + BH * 0.52, rad); ctx.fill();
    ctx.fillStyle = "rgba(215,145,50,0.28)"; ctx.beginPath(); ctx.roundRect(ax + 3, sY - BH * 0.52 + 5, AW - 6, 11, 4); ctx.fill();
  }
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  const cW = (TW - 2 * AW - 6) / 2;
  for (let i = 0; i < 2; i++) {
    const cx2 = sX + AW + i * (cW + 6);
    const cG  = ctx.createLinearGradient(cx2, sY, cx2, sY + SH);
    cG.addColorStop(0, P.sHi); cG.addColorStop(0.3, P.sMid); cG.addColorStop(1, P.sDk);
    ctx.fillStyle = cG; ctx.beginPath(); ctx.roundRect(cx2, sY, cW, SH, [4, 4, 9, 9]); ctx.fill();
    ctx.fillStyle = "rgba(235,170,75,0.2)"; ctx.beginPath(); ctx.roundRect(cx2 + 5, sY + 5, cW - 10, SH * 0.28, 3); ctx.fill();
    ctx.strokeStyle = P.sLeg + "50"; ctx.lineWidth = 1; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.roundRect(cx2 + 6, sY + 6, cW - 12, SH - 12, 4); ctx.stroke(); ctx.setLineDash([]);
  }

  ctx.fillStyle = P.sLeg; ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.roundRect(sX + AW + 12, sY + SH, LW, LH, [0, 0, 3, 3]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(sX + TW - AW - LW - 12, sY + SH, LW, LH, [0, 0, 3, 3]); ctx.fill();
  ctx.restore();
}

// ─── Person sitting (team color silhouette + aura, NOT on sofa) ───────────────

function drawPerson(ctx: Ctx, cx: number, cy: number, s = 1, color: string) {
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 44; ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(cx - 20 * s, cy + 15 * s, 13 * s, 30 * s, [4, 4, 7, 7]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(cx + 7 * s,  cy + 15 * s, 13 * s, 30 * s, [4, 4, 7, 7]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(cx - 24 * s, cy, 48 * s, 17 * s, [6, 6, 0, 0]); ctx.fill();
  ctx.beginPath(); ctx.roundRect(cx - 15 * s, cy - 46 * s, 30 * s, 48 * s, [7, 7, 5, 5]); ctx.fill();
  ctx.save(); ctx.translate(cx - 23 * s, cy - 31 * s); ctx.rotate(0.22);
  ctx.beginPath(); ctx.roundRect(-6 * s, -5 * s, 11 * s, 30 * s, 4 * s); ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(cx + 23 * s, cy - 31 * s); ctx.rotate(-0.22);
  ctx.beginPath(); ctx.roundRect(-5 * s, -5 * s, 11 * s, 30 * s, 4 * s); ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy - 59 * s, 13.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.26)"; ctx.beginPath(); ctx.arc(cx - 4.5 * s, cy - 63 * s, 6.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath(); ctx.arc(cx - 5 * s, cy - 59 * s, 2.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5 * s, cy - 59 * s, 2.2 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.beginPath(); ctx.roundRect(cx - 9 * s, cy - 42 * s, 18 * s, 14 * s, 3 * s); ctx.fill();
  ctx.restore();
}

function drawTwoPeople(ctx: Ctx, cx: number, cy: number, s = 1, color: string) {
  drawPerson(ctx, cx - 52 * s, cy, s * 0.88, color);
  drawPerson(ctx, cx + 52 * s, cy, s * 0.88, color);
}

// ─── Question right panel (shared by both question card types) ────────────────

function drawQuestionPanel(
  ctx: Ctx, RX: number, RW: number, BH: number,
  questionText: string, questionType: string, col: string,
) {
  const midX = RX + RW / 2;
  const qLabels: Record<string, string> = {
    speed: "تحدي السرعة", emoji: "تحدي الايموجي",
    tf: "صح ام خطأ",     number: "تحدي الارقام", text: "سؤال",
  };
  const qIcons: Record<string, string> = {
    speed: "<<", emoji: "★", tf: "?", number: "#", text: "؟",
  };
  const qLabel = qLabels[questionType] ?? "سؤال";
  const qIcon  = qIcons[questionType]  ?? "؟";

  box(ctx, RX + 10, BH + 14, RW - 20, 38, 19, col + "28", col + "88", 1.5);
  T(ctx, qIcon + "  " + qLabel, midX, BH + 38, "bold 16px CairoBold", col, "center", col, 10);

  box(ctx, RX + 8, BH + 62, RW - 16, H - BH - 160, 10, "rgba(255,255,255,0.03)", "rgba(255,255,255,0.07)", 1);

  ctx.save();
  ctx.font = "bold 29px CairoBold"; ctx.fillStyle = P.white; ctx.textAlign = "center";
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  wrapText(ctx, questionText, midX, BH + 116, RW - 50, 46);
  ctx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. generateCouchStartCard
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchStartCard(
  teamA: string[], teamB: string[], _target: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as Ctx;

  drawBg(ctx, P.a, P.b);

  // Title banner — dark navy, no purple
  ctx.save();
  const tg = ctx.createLinearGradient(0, 0, W, 116);
  tg.addColorStop(0, "#020B1E"); tg.addColorStop(0.5, "#04122A"); tg.addColorStop(1, "#020918");
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 92); ctx.lineTo(0, 116); ctx.closePath(); ctx.fill();
  const goldG = ctx.createLinearGradient(0, 0, 0, 116);
  goldG.addColorStop(0, P.goldL); goldG.addColorStop(1, P.gold);
  ctx.fillStyle = goldG; ctx.fillRect(0, 0, 5, 116); ctx.fillRect(W - 5, 0, 5, 92);
  ctx.restore();

  T(ctx, "تحدي الكنبة", W / 2, 60, "bold 50px CairoBold", P.white, "center", P.gold, 22);
  T(ctx, "اول فريق يجلس + زميله يجاوب = يفوز", W / 2, 94, "17px Cairo", P.light, "center");

  // Sofa + VS
  const sofaCX = W / 2, sofaCY = H / 2 + 50;
  drawSofa(ctx, sofaCX, sofaCY, 1.08);

  ctx.save(); ctx.shadowColor = P.gold; ctx.shadowBlur = 24;
  ctx.fillStyle = "#030D22"; ctx.beginPath(); ctx.arc(sofaCX, 134, 27, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = P.gold; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  T(ctx, "VS", sofaCX, 142, "bold 17px CairoBold", P.gold, "center", P.gold, 12);
  ctx.strokeStyle = P.gold + "44"; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
  ctx.beginPath(); ctx.moveTo(278, 134); ctx.lineTo(sofaCX - 29, 134); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(sofaCX + 29, 134); ctx.lineTo(682, 134); ctx.stroke();
  ctx.setLineDash([]);

  // Team panels with vertically centered players
  const PY = 118, PH = H - PY - 14, HEADER = 48;
  const usable = PH - HEADER;

  function teamPanel(px: number, pw: number, col: string, colDk: string, label: string, players: string[]) {
    clipR(ctx, px, PY, pw, PH, 14, () => {
      const g = ctx.createLinearGradient(px, PY, px, PY + PH);
      g.addColorStop(0, colDk + "F0"); g.addColorStop(1, "#020510");
      ctx.fillStyle = g; ctx.fillRect(px, PY, pw, PH);
    });
    box(ctx, px, PY, pw, PH, 14, "", col + "99", 2);
    clipR(ctx, px, PY, pw, HEADER, [14, 14, 0, 0], () => {
      const hg = ctx.createLinearGradient(px, PY, px + pw, PY);
      hg.addColorStop(0, col + "EE"); hg.addColorStop(1, col + "66");
      ctx.fillStyle = hg; ctx.fillRect(px, PY, pw, HEADER);
    });
    T(ctx, label, px + pw / 2, PY + 30, "bold 18px CairoBold", P.white, "center");

    const n = players.slice(0, 5).length;
    const rowH = 44, gap = 14;
    const totalH = n * rowH + (n - 1) * gap;
    const topPad = (usable - totalH) / 2;
    const firstY = PY + HEADER + topPad + rowH / 2;

    players.slice(0, 5).forEach((name, i) => {
      const cy2   = firstY + i * (rowH + gap);
      const rowTop = cy2 - rowH / 2;
      ctx.fillStyle = col + (i % 2 === 0 ? "18" : "0E");
      ctx.beginPath(); ctx.roundRect(px + 8, rowTop, pw - 16, rowH, 8); ctx.fill();
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(px + 26, cy2, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = P.white; ctx.font = "bold 10px CairoBold"; ctx.textAlign = "center";
      ctx.fillText(String(i + 1), px + 26, cy2 + 4);
      T(ctx, lim(name), px + pw / 2 + 10, cy2 + 8, "bold 21px CairoBold", P.white, "center");
    });
  }

  teamPanel(14, 260, P.a, P.aDark, TEAM_LABEL[0], teamA);
  teamPanel(W - 14 - 260, 260, P.b, P.bDark, TEAM_LABEL[1], teamB);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. generateCouchQuestionCard  (playing phase — no one on sofa yet)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchQuestionCard(
  scoreA: number, scoreB: number,
  questionText: string, questionType: string, questionNum: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as Ctx;

  drawBg(ctx, P.a, P.b);

  const BH = 74;
  drawScoreBar(ctx, scoreA, scoreB, "السؤال " + questionNum, "اجلس على الكنبة!", P.gold);

  // Center sofa (empty — nobody sitting yet)
  const sofaCX = W / 2, sofaCY = H / 2 + 44;
  drawSofa(ctx, sofaCX, sofaCY, 1.0);

  // Question box — full width below score bar
  const QX = 20, QW = W - 40, midX = W / 2;
  const qLabels: Record<string, string> = {
    speed: "تحدي السرعة", emoji: "تحدي الايموجي",
    tf: "صح ام خطأ",     number: "تحدي الارقام", text: "سؤال",
  };
  const qIcons: Record<string, string> = {
    speed: "<<", emoji: "★", tf: "?", number: "#", text: "؟",
  };
  const col    = P.gold;
  const qLabel = qLabels[questionType] ?? "سؤال";
  const qIcon  = qIcons[questionType]  ?? "؟";

  // Type pill — centered top
  box(ctx, midX - 120, BH + 10, 240, 36, 18, col + "22", col + "88", 1.5);
  T(ctx, qIcon + "  " + qLabel, midX, BH + 34, "bold 15px CairoBold", col, "center", col, 10);

  // Question text — large, centered, above sofa
  const questionY = BH + 62;
  ctx.save();
  ctx.font = "bold 30px CairoBold"; ctx.fillStyle = P.white; ctx.textAlign = "center";
  ctx.shadowColor = col; ctx.shadowBlur = 18;
  wrapText(ctx, questionText, midX, questionY, QW - 60, 46);
  ctx.restore();

  // Bottom hint strip
  box(ctx, QX, H - 54, QW, 38, 10, "rgba(255,184,0,0.10)", col + "55", 1);
  T(ctx, "اول واحد يجاوب صح يقدر يجلس على الكنبة!", midX, H - 28, "15px Cairo", P.light, "center");

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. generateCouchSofaCard  (sofa_active phase)
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
  const ctx    = canvas.getContext("2d") as unknown as Ctx;

  const col  = TEAM_COLOR[sofaTeam];
  const dark = TEAM_DARK[sofaTeam];
  const isBlue = sofaTeam === 0;
  drawBg(ctx, isBlue ? col : "", isBlue ? "" : col);

  const BH = 74;
  drawScoreBar(ctx, scoreA, scoreB, "على الكنبة", "سؤال " + questionNum, col);

  // Left sofa zone (~43% width)
  const LZ = 412;
  const lbg = ctx.createLinearGradient(0, BH, LZ, H);
  lbg.addColorStop(0, dark + "F8"); lbg.addColorStop(0.65, "#050915"); lbg.addColorStop(1, P.bg);
  ctx.fillStyle = lbg; ctx.fillRect(0, BH, LZ, H - BH);
  const lAcc = ctx.createLinearGradient(0, BH, 0, H);
  lAcc.addColorStop(0, col + "CC"); lAcc.addColorStop(0.55, col + "66"); lAcc.addColorStop(1, "transparent");
  ctx.fillStyle = lAcc; ctx.fillRect(0, BH, 3.5, H - BH);

  const sofaCX = LZ / 2 + 6, sofaCY = H / 2 + 34;
  drawSofa(ctx, sofaCX, sofaCY, 1.02);
  drawPerson(ctx, sofaCX, sofaCY, 1.02, col);

  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16;
  box(ctx, sofaCX - 96, H - 66, 192, 50, 12, col + "22", col + "AA", 2);
  ctx.restore();
  T(ctx, lim(sofaName, 14), sofaCX, H - 37, "bold 24px CairoBold", P.white, "center", col, 10);
  T(ctx, TEAM_LABEL[sofaTeam], sofaCX, H - 15, "12px Cairo", col, "center");

  // Divider
  const dG = ctx.createLinearGradient(0, BH + 8, 0, H - 8);
  dG.addColorStop(0, "transparent"); dG.addColorStop(0.2, col + "CC");
  dG.addColorStop(0.8, col + "CC"); dG.addColorStop(1, "transparent");
  ctx.fillStyle = dG; ctx.fillRect(LZ, BH + 8, 2, H - BH - 16);

  // Right question zone
  const RX = LZ + 18, RW = W - RX - 12;
  drawQuestionPanel(ctx, RX, RW, BH, questionText, questionType, col);

  // Ban box
  const midX = RX + RW / 2;
  box(ctx, RX + 8, H - 86, RW - 16, 70, 10, col + "12", col + "55", 1);
  T(ctx, "ممنوع: " + lim(sofaName, 12), midX, H - 56, "bold 18px CairoBold", col, "center", col, 6);
  T(ctx, "بقية الفريق اجاوبوا — قبل الخصم", midX, H - 28, "15px Cairo", P.light, "center");

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. generateCouchWinCard  (two people on sofa)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateCouchWinCard(
  winner: 0 | 1, scoreA: number, scoreB: number, mvpName: string,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as Ctx;

  const col   = TEAM_COLOR[winner];
  const dark  = TEAM_DARK[winner];
  const label = TEAM_LABEL[winner];
  const isBlue = winner === 0;

  drawBg(ctx, isBlue ? col : "", isBlue ? "" : col);

  // Rays
  ctx.save(); ctx.strokeStyle = col + "18"; ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(W / 2, H * 0.5);
    ctx.lineTo(W / 2 + Math.cos(a) * 680, H * 0.5 + Math.sin(a) * 680); ctx.stroke();
  }
  ctx.restore();
  const rG = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, 500);
  rG.addColorStop(0, col + "3A"); rG.addColorStop(0.5, col + "18"); rG.addColorStop(1, "transparent");
  ctx.fillStyle = rG; ctx.fillRect(0, 0, W, H);

  // Winner banner
  ctx.save();
  const banG = ctx.createLinearGradient(0, 0, W, 120);
  banG.addColorStop(0, dark); banG.addColorStop(0.45, col + "AA"); banG.addColorStop(1, dark);
  ctx.fillStyle = banG;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(W, 102); ctx.lineTo(0, 128); ctx.closePath(); ctx.fill();
  ctx.fillStyle = col; ctx.fillRect(0, 0, 6, 128); ctx.fillRect(W - 6, 0, 6, 102);
  ctx.restore();
  T(ctx, label + " يفوز!", W / 2, 68, "bold 54px CairoBold", P.white, "center", col, 30);
  T(ctx, "تحدي الكنبة", W / 2, 102, "16px Cairo", col, "center");

  // Score
  T(ctx, String(scoreA), isBlue ? W / 2 - 60 : W / 2 + 60, 162, "bold 48px CairoBold", isBlue ? col : P.dim, "center", isBlue ? col : "", 20);
  T(ctx, "—", W / 2, 162, "bold 36px CairoBold", P.dim, "center");
  T(ctx, String(scoreB), isBlue ? W / 2 + 60 : W / 2 - 60, 162, "bold 48px CairoBold", isBlue ? P.dim : col, "center", isBlue ? "" : col, 20);

  // Sofa + TWO people
  const sofaCX = W / 2, sofaCY = H / 2 + 56;
  drawSofa(ctx, sofaCX, sofaCY, 1.22);
  drawTwoPeople(ctx, sofaCX, sofaCY, 1.22, col);

  // Confetti
  const CC = [col, P.gold, isBlue ? P.b : P.a, P.white, col + "AA"];
  for (let i = 0; i < 100; i++) {
    const cx = Math.random() * W, cy = Math.random() * H, r = Math.random() * 4 + 1;
    ctx.fillStyle = CC[i % CC.length] + Math.floor(Math.random() * 80 + 25).toString(16).padStart(2, "0");
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }

  // MVP badge
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 18;
  box(ctx, W / 2 - 210, H - 62, 420, 48, 12, col + "20", col + "AA", 2);
  ctx.restore();
  T(ctx, "MVP  •  " + lim(mvpName, 20), W / 2, H - 30, "bold 18px CairoBold", col, "center", col, 8);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
