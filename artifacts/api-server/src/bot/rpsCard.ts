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
const H = 500;

// ─── Color Palette ─────────────────────────────────────────────────────────────

const ROCK_C     = "#FF6535";
const PAPER_C    = "#00C8FF";
const SCISSORS_C = "#C84FFF";
const GOLD       = "#FFD700";
const CYAN       = "#00D4FF";
const BG1        = "#040812";
const BG2        = "#060a1a";

type RpsMove = "rock" | "paper" | "scissors";

const MOVE_COLOR: Record<RpsMove, string> = { rock: ROCK_C, paper: PAPER_C, scissors: SCISSORS_C };
const MOVE_LABEL: Record<RpsMove, string> = { rock: "الحجر", paper: "الورقة", scissors: "المقص" };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function limitName(s: string, max = 14): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

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

function drawDiagonalLines(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -h; i < w + h; i += 22) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// horizontal glowing line
function hLine(ctx: CanvasRenderingContext2D, y: number, color: string, alpha = 0.7) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, color.replace(")", `,${alpha})`).replace("rgb", "rgba"));
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

// ─── Symbol drawers (no emoji!) ────────────────────────────────────────────────

function drawRock(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, a = 1.0) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = col;
  ctx.shadowBlur   = 40;

  // outer halo rings
  ctx.strokeStyle = col.replace("#", "rgba(") + "44)";
  ctx.lineWidth = 6;
  hexPath(ctx, cx, cy, size);
  ctx.stroke();

  ctx.lineWidth = 3;
  ctx.strokeStyle = col + "88";
  hexPath(ctx, cx, cy, size * 0.72);
  ctx.stroke();

  // inner solid
  ctx.fillStyle = col + "28";
  hexPath(ctx, cx, cy, size * 0.55);
  ctx.fill();

  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  hexPath(ctx, cx, cy, size * 0.55);
  ctx.stroke();

  // core dot
  ctx.shadowBlur = 20;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPaper(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, a = 1.0) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = col;
  ctx.shadowBlur = 28;

  const pw   = size * 0.82;
  const ph   = size * 1.05;
  const fold = size * 0.18;

  // paper body fill
  ctx.fillStyle = col + "22";
  ctx.beginPath();
  ctx.moveTo(cx - pw / 2,        cy - ph / 2);
  ctx.lineTo(cx + pw / 2 - fold, cy - ph / 2);
  ctx.lineTo(cx + pw / 2,        cy - ph / 2 + fold);
  ctx.lineTo(cx + pw / 2,        cy + ph / 2);
  ctx.lineTo(cx - pw / 2,        cy + ph / 2);
  ctx.closePath();
  ctx.fill();

  // border
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // fold triangle
  ctx.fillStyle = col + "55";
  ctx.beginPath();
  ctx.moveTo(cx + pw / 2 - fold, cy - ph / 2);
  ctx.lineTo(cx + pw / 2,        cy - ph / 2 + fold);
  ctx.lineTo(cx + pw / 2 - fold, cy - ph / 2 + fold);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = col + "AA";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // lines
  ctx.strokeStyle = col + "55";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    const ly = cy - ph / 2 + ph * 0.32 + i * ph * 0.2;
    ctx.beginPath();
    ctx.moveTo(cx - pw / 2 + size * 0.08, ly);
    ctx.lineTo(cx + pw / 2 - size * 0.08 - (i === 0 ? fold * 1.1 : 0), ly);
    ctx.stroke();
  }

  ctx.restore();
}

function drawScissors(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, col: string, a = 1.0) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.shadowColor = col;
  ctx.shadowBlur = 28;
  ctx.lineCap = "round";

  const blades = [{ angle: -38 }, { angle: 38 }];
  for (const b of blades) {
    const r  = b.angle * Math.PI / 180;
    const dx = Math.cos(r) * size * 0.82;
    const dy = Math.sin(r) * size * 0.82;

    ctx.lineWidth = size * 0.30;
    ctx.strokeStyle = col + "22";
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();

    ctx.lineWidth = size * 0.10;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
    ctx.stroke();
  }

  ctx.shadowBlur = 20;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = col + "66";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.26, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawSymbol(ctx: CanvasRenderingContext2D, move: RpsMove, cx: number, cy: number, size: number, alpha = 1.0) {
  if (move === "rock")     drawRock(ctx, cx, cy, size, MOVE_COLOR.rock, alpha);
  if (move === "paper")    drawPaper(ctx, cx, cy, size, MOVE_COLOR.paper, alpha);
  if (move === "scissors") drawScissors(ctx, cx, cy, size, MOVE_COLOR.scissors, alpha);
}

// draw star for winner panel
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number, col: string) {
  ctx.save();
  ctx.shadowColor = col;
  ctx.shadowBlur = 30;
  ctx.fillStyle = col + "44";
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = col;
  ctx.shadowBlur = 20;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer * 0.9 : inner * 0.9;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

// shared dark background
function drawBg(ctx: CanvasRenderingContext2D) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   BG1);
  bg.addColorStop(0.5, BG2);
  bg.addColorStop(1,   BG1);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  drawDiagonalLines(ctx, 0, 0, W, H, "rgba(0,200,255,0.035)");
}

// top + bottom thin accent lines
function drawEdgeLines(ctx: CanvasRenderingContext2D, color = CYAN) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, color);
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0,     W, 2);
  ctx.fillRect(0, H - 2, W, 2);
}

// ─── Card 1: Challenge (lobby) ─────────────────────────────────────────────────

export async function generateRpsChallengeCard(hostName: string, totalRounds: number): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  // Side edge color bleeds
  const le = ctx.createLinearGradient(0, 0, 120, 0);
  le.addColorStop(0, "rgba(0,100,220,0.18)");
  le.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = le; ctx.fillRect(0, 0, 120, H);

  const re = ctx.createLinearGradient(W, 0, W - 120, 0);
  re.addColorStop(0, "rgba(180,0,255,0.14)");
  re.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = re; ctx.fillRect(W - 120, 0, 120, H);

  // Background decorative symbols (faint)
  drawRock(ctx, 110, H / 2 + 10, 72, ROCK_C, 0.13);
  drawPaper(ctx, W / 2, H / 2 - 10, 68, PAPER_C, 0.10);
  drawScissors(ctx, W - 110, H / 2 + 10, 72, SCISSORS_C, 0.13);

  drawEdgeLines(ctx, CYAN);

  // Title gradient
  ctx.save();
  const tg = ctx.createLinearGradient(180, 0, 720, 0);
  tg.addColorStop(0,    ROCK_C);
  tg.addColorStop(0.45, PAPER_C);
  tg.addColorStop(1,    SCISSORS_C);
  ctx.font = "bold 58px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = tg;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 22;
  ctx.fillText("حجر  ورقة  مقص", W / 2, 105);
  ctx.shadowBlur = 0;
  ctx.restore();

  hLine(ctx, 125, CYAN, 0.4);

  // "تحدي من:" label
  ctx.font = "20px Cairo";
  ctx.fillStyle = "rgba(0,212,255,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("تحدي مفتوح من", W / 2, 168);

  // Host name large
  const name = limitName(hostName, 18);
  const nfs  = name.length > 14 ? 50 : name.length > 10 ? 62 : 76;
  ctx.save();
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 35;
  ctx.fillText(name, W / 2, 282);
  ctx.shadowBlur = 0;
  ctx.restore();

  // subtitle
  ctx.font = "21px Cairo";
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.textAlign = "center";
  ctx.fillText("يتحدى القروب  —  من يجرؤ؟", W / 2, 332);

  hLine(ctx, 365, CYAN, 0.25);

  // rounds badge
  const rLabel = totalRounds === 1 ? "جولة واحدة فقط" : `افضل  ${totalRounds}  جولات`;
  ctx.save();
  ctx.fillStyle = "rgba(0,212,255,0.10)";
  roundRect(ctx, W / 2 - 140, H - 82, 280, 42, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,212,255,0.40)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, W / 2 - 140, H - 82, 280, 42, 12);
  ctx.stroke();
  ctx.font = "bold 19px CairoBold";
  ctx.fillStyle = CYAN;
  ctx.textAlign = "center";
  ctx.fillText(rLabel, W / 2, H - 55);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Card 2: Round Start (VS screen before picking) ───────────────────────────

export async function generateRpsRoundCard(
  hostName: string, guestName: string,
  round: number, totalRounds: number,
  hostScore: number, guestScore: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  const LEFT_X  = 0;
  const LEFT_W  = 360;
  const RIGHT_X = W - 360;
  const RIGHT_W = 360;
  const MID_X   = LEFT_W;
  const MID_W   = W - LEFT_W - RIGHT_W;
  const MID_CX  = MID_X + MID_W / 2;

  // Left panel (host — cyan)
  const lg = ctx.createLinearGradient(LEFT_X, 0, LEFT_X + LEFT_W, 0);
  lg.addColorStop(0, "rgba(0,180,255,0.18)");
  lg.addColorStop(1, "rgba(0,180,255,0.00)");
  ctx.fillStyle = lg;
  ctx.fillRect(LEFT_X, 0, LEFT_W, H);
  drawDiagonalLines(ctx, LEFT_X, 0, LEFT_W, H, "rgba(0,200,255,0.06)");

  // Left edge strip
  ctx.fillStyle = "rgba(0,200,255,0.25)";
  ctx.fillRect(0, 0, 4, H);

  // Right panel (guest — purple/orange)
  const rg = ctx.createLinearGradient(RIGHT_X + RIGHT_W, 0, RIGHT_X, 0);
  rg.addColorStop(0, "rgba(200,80,255,0.18)");
  rg.addColorStop(1, "rgba(200,80,255,0.00)");
  ctx.fillStyle = rg;
  ctx.fillRect(RIGHT_X, 0, RIGHT_W, H);
  drawDiagonalLines(ctx, RIGHT_X, 0, RIGHT_W, H, "rgba(200,100,255,0.06)");

  ctx.fillStyle = "rgba(200,80,255,0.25)";
  ctx.fillRect(W - 4, 0, 4, H);

  // Vertical dividers
  const dvL = ctx.createLinearGradient(0, 0, 0, H);
  dvL.addColorStop(0, "rgba(0,180,255,0)");
  dvL.addColorStop(0.5, "rgba(0,200,255,0.8)");
  dvL.addColorStop(1, "rgba(0,180,255,0)");
  ctx.fillStyle = dvL; ctx.fillRect(MID_X, 0, 1.5, H);

  const dvR = ctx.createLinearGradient(0, 0, 0, H);
  dvR.addColorStop(0, "rgba(200,80,255,0)");
  dvR.addColorStop(0.5, "rgba(200,80,255,0.8)");
  dvR.addColorStop(1, "rgba(200,80,255,0)");
  ctx.fillStyle = dvR; ctx.fillRect(RIGHT_X - 1.5, 0, 1.5, H);

  drawEdgeLines(ctx, CYAN);

  // ── Host side ──
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(0,200,255,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("المتحدي", LEFT_W / 2, 42);

  const hn = limitName(hostName);
  const hfs = hn.length > 10 ? 32 : 38;
  ctx.save();
  ctx.font = `bold ${hfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 20;
  ctx.fillText(hn, LEFT_W / 2, 88);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Host decorative symbol (question mark area — three faint symbols overlay)
  drawRock(ctx,     LEFT_W / 2, H / 2 + 10, 62, ROCK_C, 0.18);
  drawPaper(ctx,    LEFT_W / 2, H / 2 + 10, 58, PAPER_C, 0.12);
  drawScissors(ctx, LEFT_W / 2, H / 2 + 10, 55, SCISSORS_C, 0.10);

  // "?" big label
  ctx.save();
  ctx.font = "bold 110px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,200,255,0.18)";
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 30;
  ctx.fillText("?", LEFT_W / 2, H / 2 + 50);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.font = "18px Cairo";
  ctx.fillStyle = "rgba(0,200,255,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("يختار سراً", LEFT_W / 2, H - 36);

  // ── Guest side ──
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = "rgba(200,80,255,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("المنافس", RIGHT_X + RIGHT_W / 2, 42);

  const gn = limitName(guestName);
  const gfs = gn.length > 10 ? 32 : 38;
  ctx.save();
  ctx.font = `bold ${gfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = SCISSORS_C;
  ctx.shadowBlur = 20;
  ctx.fillText(gn, RIGHT_X + RIGHT_W / 2, 88);
  ctx.shadowBlur = 0;
  ctx.restore();

  drawRock(ctx,     RIGHT_X + RIGHT_W / 2, H / 2 + 10, 62, ROCK_C, 0.18);
  drawPaper(ctx,    RIGHT_X + RIGHT_W / 2, H / 2 + 10, 58, PAPER_C, 0.12);
  drawScissors(ctx, RIGHT_X + RIGHT_W / 2, H / 2 + 10, 55, SCISSORS_C, 0.10);

  ctx.save();
  ctx.font = "bold 110px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(200,80,255,0.18)";
  ctx.shadowColor = SCISSORS_C;
  ctx.shadowBlur = 30;
  ctx.fillText("?", RIGHT_X + RIGHT_W / 2, H / 2 + 50);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.font = "18px Cairo";
  ctx.fillStyle = "rgba(200,80,255,0.45)";
  ctx.textAlign = "center";
  ctx.fillText("يختار سراً", RIGHT_X + RIGHT_W / 2, H - 36);

  // ── Center panel ──
  // Round label
  const rdLabel = totalRounds === 1 ? "الجولة الوحيدة" : `الجولة  ${round}  /  ${totalRounds}`;
  ctx.font = "bold 17px CairoBold";
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.textAlign = "center";
  ctx.fillText(rdLabel, MID_CX, 42);

  // VS text
  ctx.save();
  ctx.font = "bold 62px CairoBold";
  ctx.textAlign = "center";
  const vsg = ctx.createLinearGradient(MID_CX - 40, 0, MID_CX + 40, 0);
  vsg.addColorStop(0, CYAN);
  vsg.addColorStop(1, SCISSORS_C);
  ctx.fillStyle = vsg;
  ctx.shadowColor = CYAN;
  ctx.shadowBlur = 30;
  ctx.fillText("VS", MID_CX, H / 2 + 22);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Score badge
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  roundRect(ctx, MID_CX - 52, H / 2 + 35, 104, 36, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  roundRect(ctx, MID_CX - 52, H / 2 + 35, 104, 36, 10);
  ctx.stroke();
  ctx.font = "bold 20px CairoBold";
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.textAlign = "center";
  ctx.fillText(`${hostScore}  —  ${guestScore}`, MID_CX, H / 2 + 59);
  ctx.restore();

  // "اختار الان" label center bottom
  ctx.font = "15px Cairo";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.textAlign = "center";
  ctx.fillText("اختار الان", MID_CX, H - 36);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Card 3: Round Reveal ──────────────────────────────────────────────────────

export async function generateRpsRevealCard(
  hostName: string, guestName: string,
  hostMove: RpsMove, guestMove: RpsMove,
  hostScore: number, guestScore: number,
  round: number, totalRounds: number,
  winnerSide: "host" | "guest" | "tie",
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx);

  const L_W  = 340;
  const R_X  = W - 340;
  const R_W  = 340;
  const MID_CX = L_W + (R_X - L_W) / 2;

  const hCol = MOVE_COLOR[hostMove];
  const gCol = MOVE_COLOR[guestMove];

  // Left host panel tint
  const lg = ctx.createLinearGradient(0, 0, L_W, 0);
  lg.addColorStop(0, hCol + "28");
  lg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lg; ctx.fillRect(0, 0, L_W, H);
  ctx.fillStyle = hCol + "44"; ctx.fillRect(0, 0, 4, H);

  // Right guest panel tint
  const rg = ctx.createLinearGradient(W, 0, R_X, 0);
  rg.addColorStop(0, gCol + "28");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rg; ctx.fillRect(R_X, 0, R_W, H);
  ctx.fillStyle = gCol + "44"; ctx.fillRect(W - 4, 0, 4, H);

  // Glow behind symbols
  const hGlow = ctx.createRadialGradient(L_W / 2, H / 2, 0, L_W / 2, H / 2, 180);
  hGlow.addColorStop(0, hCol + "18"); hGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = hGlow; ctx.fillRect(0, 0, L_W, H);

  const gGlow = ctx.createRadialGradient(R_X + R_W / 2, H / 2, 0, R_X + R_W / 2, H / 2, 180);
  gGlow.addColorStop(0, gCol + "18"); gGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gGlow; ctx.fillRect(R_X, 0, R_W, H);

  // Dividers
  const dv = (col: string, x: number) => {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, col); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(x, 0, 1.5, H);
  };
  dv(hCol + "AA", L_W); dv(gCol + "AA", R_X);

  drawEdgeLines(ctx, winnerSide === "tie" ? CYAN : GOLD);

  // ── Host name + move label ──
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = hCol + "BB";
  ctx.textAlign = "center";
  ctx.fillText("المتحدي", L_W / 2, 40);

  const hn = limitName(hostName);
  ctx.save();
  ctx.font = `bold ${hn.length > 10 ? 30 : 36}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFF";
  ctx.shadowColor = hCol; ctx.shadowBlur = 18;
  ctx.fillText(hn, L_W / 2, 82);
  ctx.shadowBlur = 0; ctx.restore();

  // Move symbol (big)
  drawSymbol(ctx, hostMove, L_W / 2, H / 2, 72);

  // Move label
  ctx.save();
  ctx.font = "bold 22px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = hCol;
  ctx.shadowColor = hCol; ctx.shadowBlur = 16;
  ctx.fillText(MOVE_LABEL[hostMove], L_W / 2, H - 48);
  ctx.shadowBlur = 0; ctx.restore();

  // ── Guest name + move ──
  ctx.font = "bold 14px Cairo";
  ctx.fillStyle = gCol + "BB";
  ctx.textAlign = "center";
  ctx.fillText("المنافس", R_X + R_W / 2, 40);

  const gn = limitName(guestName);
  ctx.save();
  ctx.font = `bold ${gn.length > 10 ? 30 : 36}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFF";
  ctx.shadowColor = gCol; ctx.shadowBlur = 18;
  ctx.fillText(gn, R_X + R_W / 2, 82);
  ctx.shadowBlur = 0; ctx.restore();

  drawSymbol(ctx, guestMove, R_X + R_W / 2, H / 2, 72);

  ctx.save();
  ctx.font = "bold 22px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = gCol;
  ctx.shadowColor = gCol; ctx.shadowBlur = 16;
  ctx.fillText(MOVE_LABEL[guestMove], R_X + R_W / 2, H - 48);
  ctx.shadowBlur = 0; ctx.restore();

  // ── Center panel ──
  const rdLabel = totalRounds === 1 ? "الجولة الوحيدة" : `الجولة  ${round}`;
  ctx.font = "bold 15px CairoBold";
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.textAlign = "center";
  ctx.fillText(rdLabel, MID_CX, 40);

  // Result text
  const resultCol = winnerSide === "tie" ? CYAN : GOLD;
  let resultTxt = "";
  if (winnerSide === "host")  resultTxt = limitName(hostName, 12)  + " يفوز!";
  if (winnerSide === "guest") resultTxt = limitName(guestName, 12) + " يفوز!";
  if (winnerSide === "tie")   resultTxt = "تعادل!";

  ctx.save();
  ctx.font = `bold ${resultTxt.length > 10 ? 22 : 26}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = resultCol;
  ctx.shadowColor = resultCol; ctx.shadowBlur = 30;
  ctx.fillText(resultTxt, MID_CX, H / 2 - 18);
  ctx.shadowBlur = 0; ctx.restore();

  // Score
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.07)";
  roundRect(ctx, MID_CX - 48, H / 2 + 2, 96, 34, 8);
  ctx.fill();
  ctx.font = "bold 20px CairoBold";
  ctx.fillStyle = "rgba(255,255,255,0.70)";
  ctx.textAlign = "center";
  ctx.fillText(`${hostScore}  —  ${guestScore}`, MID_CX, H / 2 + 25);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Card 4: Winner ───────────────────────────────────────────────────────────

export async function generateRpsWinnerCard(
  winnerName: string, loserName: string,
  winnerScore: number, loserScore: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const LEFT_W   = 260;
  const DIVIDER  = LEFT_W;

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#060500");
  bg.addColorStop(0.5, "#0f0d00");
  bg.addColorStop(1,   "#060500");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  drawDiagonalLines(ctx, 0, 0, W, H, "rgba(255,200,0,0.04)");

  // Left panel gold
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, LEFT_W, H); ctx.clip();
  const lpg = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  lpg.addColorStop(0, "rgba(200,160,0,0.45)");
  lpg.addColorStop(1, "rgba(80,60,0,0.05)");
  ctx.fillStyle = lpg; ctx.fillRect(0, 0, LEFT_W, H);
  drawDiagonalLines(ctx, 0, 0, LEFT_W, H, "rgba(255,200,0,0.08)");

  // Star
  drawStar(ctx, LEFT_W / 2, H / 2 + 10, 52, 22, GOLD);

  // Labels in left panel
  ctx.font = "bold 15px Cairo";
  ctx.fillStyle = "rgba(255,210,0,0.6)";
  ctx.textAlign = "center";
  ctx.fillText("الفائز", LEFT_W / 2, 42);

  ctx.fillStyle = "rgba(140,100,0,0.60)";
  roundRect(ctx, 18, H - 62, LEFT_W - 36, 36, 8);
  ctx.fill();
  ctx.font = "bold 16px CairoBold";
  ctx.fillStyle = "#ffe566";
  ctx.textAlign = "center";
  ctx.fillText("حجر  ورقة  مقص", LEFT_W / 2, H - 40);

  ctx.restore();

  // Divider
  const dvg = ctx.createLinearGradient(0, 0, 0, H);
  dvg.addColorStop(0,   "rgba(220,180,0,0)");
  dvg.addColorStop(0.5, "rgba(255,200,0,0.9)");
  dvg.addColorStop(1,   "rgba(220,180,0,0)");
  ctx.fillStyle = dvg; ctx.fillRect(DIVIDER, 0, 2, H);

  // Right panel
  const rx = DIVIDER + 32;
  const rw = W - rx - 32;
  const midX = rx + rw / 2;

  const glow = ctx.createRadialGradient(midX, H / 2, 0, midX, H / 2, 300);
  glow.addColorStop(0, "rgba(200,160,0,0.07)"); glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(DIVIDER, 0, W - DIVIDER, H);

  ctx.font = "22px Cairo";
  ctx.fillStyle = "rgba(255,200,0,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("يفوز باللعبة", midX, 88);

  const wn = limitName(winnerName, 17);
  const wfs = wn.length > 13 ? 46 : wn.length > 9 ? 58 : 72;
  ctx.save();
  ctx.font = `bold ${wfs}px CairoBold`;
  ctx.textAlign = "center";
  ctx.fillStyle = "#FFFFFF";
  ctx.shadowColor = GOLD; ctx.shadowBlur = 35;
  ctx.fillText(wn, midX, H / 2 + 20);
  ctx.shadowBlur = 0; ctx.restore();

  // underline
  const ul = ctx.createLinearGradient(rx, 0, rx + rw, 0);
  ul.addColorStop(0, "rgba(220,180,0,0)");
  ul.addColorStop(0.5, "rgba(255,200,0,0.75)");
  ul.addColorStop(1, "rgba(220,180,0,0)");
  ctx.strokeStyle = ul; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rx + rw * 0.08, H / 2 + 40);
  ctx.lineTo(rx + rw * 0.92, H / 2 + 40);
  ctx.stroke();

  // loser line
  ctx.font = "18px Cairo";
  ctx.fillStyle = "rgba(255,200,0,0.35)";
  ctx.textAlign = "center";
  ctx.fillText(`${limitName(loserName, 12)}  ${loserScore} — ${winnerScore}  ${limitName(winnerName, 12)}`, midX, H / 2 + 74);

  // bottom tag
  ctx.font = "15px Cairo";
  ctx.fillStyle = "rgba(200,160,0,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("مبروك  —  حجر ورقة مقص", midX, H - 28);

  // top/bottom gold edge lines
  const eg = ctx.createLinearGradient(0, 0, W, 0);
  eg.addColorStop(0, "rgba(0,0,0,0)");
  eg.addColorStop(0.5, GOLD);
  eg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = eg;
  ctx.fillRect(0, 0, W, 2);
  ctx.fillRect(0, H - 2, W, 2);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
