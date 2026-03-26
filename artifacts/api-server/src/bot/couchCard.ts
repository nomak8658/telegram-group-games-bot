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
const H = 520;

// Team palette
const TEAM = [
  { main: "#2277ff", glow: "#4499ff", dark: "#001244", label: "الفريق الأزرق 🔵" },
  { main: "#ff2244", glow: "#ff5566", dark: "#440012", label: "الفريق الأحمر 🔴" },
];

// ── Shared ──────────────────────────────────────────────────────────────────

function drawBg(ctx: CanvasRenderingContext2D, accent: string) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#06070f");
  bg.addColorStop(0.5, "#0a0c18");
  bg.addColorStop(1,   "#060710");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // subtle grid
  ctx.save();
  ctx.strokeStyle = accent + "09";
  ctx.lineWidth = 0.7;
  const step = 40;
  ctx.beginPath();
  for (let x = 0; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = 0; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();

  // center glow
  const cr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 480);
  cr.addColorStop(0, accent + "0D");
  cr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cr;
  ctx.fillRect(0, 0, W, H);
}

function glowLine(ctx: CanvasRenderingContext2D, y: number, color: string) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, color + "99");
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

function limitName(n: string, max = 16) {
  return n.length > max ? n.slice(0, max) + "…" : n;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number, maxW: number, lineH: number,
): number {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, curY);
      line = w;
      curY += lineH;
    } else {
      line = test;
    }
  }
  if (line) { ctx.fillText(line, x, curY); curY += lineH; }
  return curY;
}

// ── Sofa shape ───────────────────────────────────────────────────────────────

function drawSofa(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, sw: number, sh: number,
  glowCol: string,
) {
  ctx.save();

  const armW  = sw * 0.12;
  const legH  = sh * 0.14;
  const legW  = sw * 0.055;
  const backH = sh * 0.48;
  const seatH = sh * 0.36;

  const seatTop  = cy - seatH / 2;
  const backTop  = seatTop - backH;
  const seatLeft = cx - sw / 2;

  // ── glow halo ─────────────────────────────────────────────────────────
  ctx.shadowColor = glowCol;
  ctx.shadowBlur  = 32;

  // ── back cushion ──────────────────────────────────────────────────────
  const backGrad = ctx.createLinearGradient(seatLeft, backTop, seatLeft + sw, backTop + backH);
  backGrad.addColorStop(0, "#5C3317");
  backGrad.addColorStop(1, "#3A200E");
  ctx.fillStyle = backGrad;
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.roundRect(seatLeft, backTop, sw, backH + seatH * 0.08, [14, 14, 0, 0]);
  ctx.fill();

  // back highlight strip
  ctx.fillStyle = "rgba(255,200,140,0.08)";
  ctx.beginPath();
  ctx.roundRect(seatLeft + 8, backTop + 8, sw - 16, backH * 0.38, [10, 10, 0, 0]);
  ctx.fill();

  // ── seat cushion ──────────────────────────────────────────────────────
  const seatGrad = ctx.createLinearGradient(0, seatTop, 0, seatTop + seatH);
  seatGrad.addColorStop(0, "#7D4A28");
  seatGrad.addColorStop(1, "#4E2C12");
  ctx.fillStyle = seatGrad;
  ctx.beginPath();
  ctx.roundRect(seatLeft + armW, seatTop, sw - 2 * armW, seatH, [0, 0, 8, 8]);
  ctx.fill();

  // seat cushion crease
  const seatMidX = seatLeft + sw / 2;
  ctx.strokeStyle = "rgba(40,15,5,0.45)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(seatMidX, seatTop + 4);
  ctx.lineTo(seatMidX, seatTop + seatH - 4);
  ctx.stroke();

  // ── armrests ──────────────────────────────────────────────────────────
  const armGrad = ctx.createLinearGradient(0, 0, armW, 0);
  armGrad.addColorStop(0, "#5C3317");
  armGrad.addColorStop(1, "#3A200E");

  ctx.fillStyle = armGrad;
  // left armrest
  ctx.beginPath();
  ctx.roundRect(seatLeft, seatTop - backH * 0.28, armW, seatH + backH * 0.28, [8, 0, 8, 8]);
  ctx.fill();
  // right armrest
  ctx.beginPath();
  ctx.roundRect(seatLeft + sw - armW, seatTop - backH * 0.28, armW, seatH + backH * 0.28, [0, 8, 8, 8]);
  ctx.fill();

  // armrest tops (lighter)
  ctx.fillStyle = "rgba(180,100,50,0.25)";
  ctx.beginPath();
  ctx.roundRect(seatLeft + 3, seatTop - backH * 0.28, armW - 6, armW * 0.5, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(seatLeft + sw - armW + 3, seatTop - backH * 0.28, armW - 6, armW * 0.5, 4);
  ctx.fill();

  // ── decorative stitching on back ──────────────────────────────────────
  ctx.strokeStyle = "rgba(40,15,5,0.30)";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.roundRect(seatLeft + 12, backTop + 10, sw - 24, backH - 20, 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // ── legs ──────────────────────────────────────────────────────────────
  const legTop = seatTop + seatH;
  ctx.fillStyle = "#2A1006";
  ctx.beginPath();
  ctx.roundRect(seatLeft + armW + 4, legTop, legW, legH, [0, 0, 3, 3]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(seatLeft + sw - armW - legW - 4, legTop, legW, legH, [0, 0, 3, 3]);
  ctx.fill();

  ctx.restore();
}

function drawPersonOnSofa(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, sh: number,
  color: string, name: string,
) {
  ctx.save();

  const seatH   = sh * 0.36;
  const seatTop = cy - seatH / 2;
  const headR   = sh * 0.095;
  const bodyH   = seatH * 0.55;
  const personX = cx;
  const headY   = seatTop - headR * 1.1;
  const bodyY   = headY + headR + 2;

  // glow
  ctx.shadowColor = color;
  ctx.shadowBlur  = 22;

  // body
  ctx.fillStyle = color + "CC";
  ctx.beginPath();
  ctx.roundRect(personX - headR * 0.75, bodyY, headR * 1.5, bodyH, 6);
  ctx.fill();

  // head circle
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(personX, headY, headR, 0, Math.PI * 2);
  ctx.fill();

  // face highlight
  ctx.fillStyle = "rgba(255,255,255,0.20)";
  ctx.beginPath();
  ctx.arc(personX - headR * 0.25, headY - headR * 0.22, headR * 0.38, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;

  // name badge below
  const badgeY = seatTop + seatH + sh * 0.15 + 4;
  ctx.font      = "bold 15px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = color;
  ctx.fillText(limitName(name, 12), personX, badgeY);

  ctx.restore();
}

// ── Score badges ─────────────────────────────────────────────────────────────

function drawScoreBadge(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  label: string, score: number, target: number, color: string,
) {
  ctx.save();

  ctx.fillStyle = color + "22";
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = color + "55";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.font = "bold 13px CairoBold";
  ctx.fillStyle = color;
  ctx.fillText(label, x + w / 2, y + 20);

  ctx.font = `bold 32px CairoBold`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillText(`${score}`, x + w / 2, y + 55);
  ctx.shadowBlur = 0;

  ctx.font = "12px Cairo";
  ctx.fillStyle = color + "99";
  ctx.fillText(`من ${target}`, x + w / 2, y + 72);

  ctx.restore();
}

// ── generateCouchStartCard ────────────────────────────────────────────────────

export async function generateCouchStartCard(
  teamANames: string[],
  teamBNames: string[],
  targetScore: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  drawBg(ctx, "#8844ff");

  // title
  ctx.save();
  ctx.font        = "bold 38px CairoBold";
  ctx.textAlign   = "center";
  ctx.shadowColor = "#aa66ff";
  ctx.shadowBlur  = 25;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText("تحدي الكنبة 🛋️", W / 2, 56);
  ctx.shadowBlur  = 0;
  ctx.restore();

  glowLine(ctx, 70, "#8844ff");

  ctx.font      = "17px Cairo";
  ctx.fillStyle = "rgba(200,180,255,0.60)";
  ctx.textAlign = "center";
  ctx.fillText(`أول فريق يصل لـ ${targetScore} جولات يفوز!`, W / 2, 100);

  glowLine(ctx, 112, "#8844ff");

  // sofa in center
  drawSofa(ctx, W / 2, H / 2 + 28, 190, 120, "#aa66ff");

  // team panels
  const panelW = 220;
  const panelY = 128;
  const panelH = H - panelY - 24;

  // Team A (left)
  const ta = TEAM[0];
  ctx.save();
  ctx.fillStyle   = ta.main + "15";
  ctx.shadowColor = ta.main;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.roundRect(20, panelY, panelW, panelH, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = ta.main + "44";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.font      = "bold 15px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = ta.main;
  ctx.fillText(ta.label, 20 + panelW / 2, panelY + 26);

  ctx.font      = "14px Cairo";
  ctx.fillStyle = "rgba(180,200,255,0.70)";
  teamANames.slice(0, 5).forEach((n, i) => {
    ctx.fillText("• " + limitName(n, 14), 20 + panelW / 2, panelY + 52 + i * 28);
  });

  // Team B (right)
  const tb = TEAM[1];
  const bx = W - panelW - 20;
  ctx.save();
  ctx.fillStyle   = tb.main + "15";
  ctx.shadowColor = tb.main;
  ctx.shadowBlur  = 12;
  ctx.beginPath();
  ctx.roundRect(bx, panelY, panelW, panelH, 12);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = tb.main + "44";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.font      = "bold 15px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = tb.main;
  ctx.fillText(tb.label, bx + panelW / 2, panelY + 26);

  ctx.font      = "14px Cairo";
  ctx.fillStyle = "rgba(255,180,190,0.70)";
  teamBNames.slice(0, 5).forEach((n, i) => {
    ctx.fillText("• " + limitName(n, 14), bx + panelW / 2, panelY + 52 + i * 28);
  });

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ── generateCouchSofaCard ─────────────────────────────────────────────────────

export async function generateCouchSofaCard(
  sofaPlayerName: string,
  sofaTeamIdx: 0 | 1,
  scoreA: number,
  scoreB: number,
  targetScore: number,
  questionText: string,
  questionType: string,
  questionNum: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const team = TEAM[sofaTeamIdx];
  drawBg(ctx, team.main);

  // ── top bar: scores ────────────────────────────────────────────────────
  const badgeW = 130;
  const badgeH = 80;
  const badgeY = 12;

  drawScoreBadge(ctx, 16, badgeY, badgeW, badgeH,
    "🔵 الأزرق", scoreA, targetScore, TEAM[0].main);
  drawScoreBadge(ctx, W - badgeW - 16, badgeY, badgeW, badgeH,
    "🔴 الأحمر", scoreB, targetScore, TEAM[1].main);

  // round badge center
  ctx.save();
  ctx.font        = "bold 17px CairoBold";
  ctx.textAlign   = "center";
  ctx.shadowColor = team.main;
  ctx.shadowBlur  = 15;
  ctx.fillStyle   = team.main;
  ctx.fillText("🛋️ الكنبة", W / 2, 36);
  ctx.shadowBlur  = 0;
  ctx.fillStyle   = "rgba(200,200,220,0.55)";
  ctx.font        = "13px Cairo";
  ctx.fillText(`سؤال رقم ${questionNum}`, W / 2, 60);
  ctx.restore();

  glowLine(ctx, 100, team.main);

  // ── left: sofa + person ───────────────────────────────────────────────
  const LEFT_W = 340;
  const sofaCX = LEFT_W / 2;
  const sofaCY = H / 2 + 20;
  const sofaW  = 200;
  const sofaH  = 130;

  drawSofa(ctx, sofaCX, sofaCY, sofaW, sofaH, team.main);
  drawPersonOnSofa(ctx, sofaCX, sofaCY, sofaH, team.main, sofaPlayerName);

  // sofa label
  ctx.font      = "bold 14px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = team.main;
  ctx.fillText(`${team.label}`, sofaCX, sofaCY + sofaH * 0.80 + 44);

  // divider
  const dg = ctx.createLinearGradient(0, 0, 0, H);
  dg.addColorStop(0,   "rgba(0,0,0,0)");
  dg.addColorStop(0.5, team.main + "BB");
  dg.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = dg;
  ctx.fillRect(LEFT_W, 0, 1.5, H);

  // ── right: question ────────────────────────────────────────────────────
  const rx   = LEFT_W + 24;
  const rw   = W - rx - 20;
  const midX = rx + rw / 2;

  const typeIcon = questionType === "speed" ? "⚡ تحدي السرعة" :
                   questionType === "emoji" ? "🎭 تحدي الإيموجي" : "❓ سؤال";

  ctx.font      = "bold 16px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = team.main;
  ctx.fillText(typeIcon, midX, 130);

  glowLine(ctx, 144, team.main);

  ctx.font      = "bold 22px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = team.main;
  ctx.shadowBlur  = 14;
  wrapText(ctx, questionText, midX, 185, rw - 10, 34);
  ctx.shadowBlur  = 0;

  // "cannot answer" warning for sofa player
  ctx.save();
  const warnY = H - 90;
  ctx.fillStyle = team.main + "18";
  ctx.beginPath();
  ctx.roundRect(rx, warnY, rw, 56, 10);
  ctx.fill();
  ctx.strokeStyle = team.main + "40";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.font      = "bold 14px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = team.main;
  ctx.fillText(`🚫  ${limitName(sofaPlayerName, 12)} ممنوع يجاوب`, midX, warnY + 22);
  ctx.font      = "13px Cairo";
  ctx.fillStyle = "rgba(200,200,210,0.55)";
  ctx.fillText("بقية الفريق — أجاوبوا قبل الخصم!", midX, warnY + 42);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ── generateCouchWinCard ──────────────────────────────────────────────────────

export async function generateCouchWinCard(
  winnerTeamIdx: 0 | 1,
  scoreA: number,
  scoreB: number,
  mvpName: string,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const wt = TEAM[winnerTeamIdx];
  drawBg(ctx, wt.main);

  // big radial glow
  const cr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 400);
  cr.addColorStop(0, wt.main + "22");
  cr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cr;
  ctx.fillRect(0, 0, W, H);

  // trophy star rays
  ctx.save();
  ctx.strokeStyle = wt.main + "22";
  ctx.lineWidth   = 1.5;
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI * 2) / 16;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.lineTo(W / 2 + Math.cos(a) * 400, H / 2 + Math.sin(a) * 400);
    ctx.stroke();
  }
  ctx.restore();

  // ── sofa with winner person ───────────────────────────────────────────
  drawSofa(ctx, W / 2, H / 2 + 30, 220, 140, wt.main);
  drawPersonOnSofa(ctx, W / 2, H / 2 + 30, 140, wt.main, "");

  // ── text overlay ──────────────────────────────────────────────────────
  glowLine(ctx, 90, wt.main);

  ctx.save();
  ctx.font        = "bold 44px CairoBold";
  ctx.textAlign   = "center";
  ctx.shadowColor = wt.main;
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText(`🏆 ${wt.label} يفوز!`, W / 2, 74);
  ctx.shadowBlur  = 0;
  ctx.restore();

  glowLine(ctx, 96, wt.main);

  // score
  ctx.font      = "bold 28px CairoBold";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(220,220,240,0.85)";
  ctx.shadowColor = wt.main;
  ctx.shadowBlur  = 15;
  ctx.fillText(`${scoreA}  —  ${scoreB}`, W / 2, 130);
  ctx.shadowBlur  = 0;

  // MVP
  if (mvpName) {
    ctx.font      = "18px Cairo";
    ctx.fillStyle = "rgba(200,200,220,0.55)";
    ctx.fillText(`⭐ ${limitName(mvpName, 18)} — أكثر اللاعبين تأثيراً`, W / 2, H - 30);
  }

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
