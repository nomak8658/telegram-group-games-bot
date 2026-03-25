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

function limitName(name: string, max = 20): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

function drawBackground(
  ctx: CanvasRenderingContext2D,
  c1: string, c2: string, c3: string,
) {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c1);
  bg.addColorStop(0.5, c2);
  bg.addColorStop(1, c3);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
}

function drawGrid(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  const step = 38;
  ctx.beginPath();
  for (let x = 0; x < W; x += step) {
    ctx.moveTo(x, 0); ctx.lineTo(x, H);
  }
  for (let y = 0; y < H; y += step) {
    ctx.moveTo(0, y); ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawGlowLine(
  ctx: CanvasRenderingContext2D, y: number,
  col: string, alpha = 0.7,
) {
  const g = ctx.createLinearGradient(0, 0, W, 0);
  g.addColorStop(0,   "rgba(0,0,0,0)");
  g.addColorStop(0.5, col.replace(")", `,${alpha})`).replace("rgb", "rgba"));
  g.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y, W, 1.5);
}

// ─── Bomb sphere graphic ───────────────────────────────────────────────────────

function drawBomb(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  r: number,
  glowColor: string,
  glowAlpha = 0.85,
) {
  ctx.save();

  // ── outer glow halo ─────────────────────────────────────────────────
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 50;
  ctx.globalAlpha = glowAlpha * 0.35;
  ctx.fillStyle   = glowColor;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1.0;

  // ── bomb body ────────────────────────────────────────────────────────
  // dark sphere with radial gradient
  const body = ctx.createRadialGradient(
    cx - r * 0.28, cy - r * 0.28, r * 0.05,
    cx,            cy,            r,
  );
  body.addColorStop(0,    "#404040");
  body.addColorStop(0.55, "#1e1e1e");
  body.addColorStop(1,    "#080808");
  ctx.fillStyle = body;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 28;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // ── sphere highlight (top-left reflection) ───────────────────────────
  const hi = ctx.createRadialGradient(
    cx - r * 0.32, cy - r * 0.32, 0,
    cx - r * 0.32, cy - r * 0.32, r * 0.52,
  );
  hi.addColorStop(0, "rgba(255,255,255,0.28)");
  hi.addColorStop(1, "rgba(255,255,255,0.00)");
  ctx.fillStyle = hi;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // ── border ring ──────────────────────────────────────────────────────
  ctx.strokeStyle = glowColor + "55";
  ctx.lineWidth   = 1.8;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
  ctx.stroke();

  // ── fuse (exits top-right of bomb) ────────────────────────────────────
  const fuseStartX = cx + r * Math.cos(-Math.PI * 0.22);
  const fuseStartY = cy + r * Math.sin(-Math.PI * 0.22);
  const fuseEndX   = cx + r * 1.65;
  const fuseEndY   = cy - r * 1.35;
  const fuseMidX   = cx + r * 1.20;
  const fuseMidY   = cy - r * 0.55;

  ctx.strokeStyle = "#cc8833";
  ctx.lineWidth   = 2.8;
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(fuseStartX, fuseStartY);
  ctx.quadraticCurveTo(fuseMidX, fuseMidY, fuseEndX, fuseEndY);
  ctx.stroke();

  // ── spark at end of fuse ──────────────────────────────────────────────
  const sparkCol = "#ffdd22";
  ctx.save();
  ctx.shadowColor = sparkCol;
  ctx.shadowBlur  = 18;
  // center dot
  ctx.fillStyle = sparkCol;
  ctx.beginPath();
  ctx.arc(fuseEndX, fuseEndY, r * 0.10, 0, Math.PI * 2);
  ctx.fill();
  // rays
  ctx.strokeStyle = sparkCol;
  ctx.lineWidth   = 1.8;
  const rayLens = [r * 0.28, r * 0.18, r * 0.28, r * 0.18, r * 0.28, r * 0.18, r * 0.28, r * 0.18];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(fuseEndX + Math.cos(a) * r * 0.10, fuseEndY + Math.sin(a) * r * 0.10);
    ctx.lineTo(fuseEndX + Math.cos(a) * rayLens[i], fuseEndY + Math.sin(a) * rayLens[i]);
    ctx.stroke();
  }
  ctx.restore();

  ctx.restore();
}

// ─── Explosion burst graphic ───────────────────────────────────────────────────

function drawExplosion(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, size: number,
) {
  ctx.save();

  // outer diffuse glow
  const outer = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 1.6);
  outer.addColorStop(0,   "rgba(255,120,0,0.22)");
  outer.addColorStop(0.6, "rgba(200,50,0,0.08)");
  outer.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // 8 main rays
  for (let i = 0; i < 8; i++) {
    const a     = (i * Math.PI * 2) / 8 - Math.PI / 8;
    const inner = size * 0.25;
    const outer2 = size * (0.85 + (i % 2) * 0.25);
    ctx.save();
    ctx.shadowColor = "#ff8800";
    ctx.shadowBlur  = 20;
    ctx.strokeStyle = i % 2 === 0 ? "#ff9900" : "#ff5500";
    ctx.lineWidth   = i % 2 === 0 ? 6 : 4;
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
    ctx.lineTo(cx + Math.cos(a) * outer2, cy + Math.sin(a) * outer2);
    ctx.stroke();
    ctx.restore();
  }

  // 8 secondary shorter rays
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8;
    ctx.save();
    ctx.shadowColor = "#ffcc00";
    ctx.shadowBlur  = 12;
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * size * 0.20, cy + Math.sin(a) * size * 0.20);
    ctx.lineTo(cx + Math.cos(a) * size * 0.55, cy + Math.sin(a) * size * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  // center core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.35);
  core.addColorStop(0,   "#ffffff");
  core.addColorStop(0.3, "#ffee66");
  core.addColorStop(0.7, "#ff8800");
  core.addColorStop(1,   "rgba(220,50,0,0)");
  ctx.save();
  ctx.shadowColor = "#ffffff";
  ctx.shadowBlur  = 35;
  ctx.fillStyle   = core;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.restore();
}

// ─── Bomb Hold card (shown each time bomb is assigned) ─────────────────────────

export async function generateBombHoldCard(
  holderName: string,
  allPlayers: string[],
  passCount: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── background ────────────────────────────────────────────────────────
  drawBackground(ctx, "#070003", "#100006", "#050003");
  drawGrid(ctx, "rgba(220,20,60,0.04)");

  // center radial glow
  const cr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
  cr.addColorStop(0, "rgba(200,0,50,0.09)");
  cr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cr;
  ctx.fillRect(0, 0, W, H);

  // ── left panel: bomb graphic ──────────────────────────────────────────
  const LEFT_W = 310;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  // panel tint
  const lp = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  lp.addColorStop(0,   "rgba(200,0,40,0.22)");
  lp.addColorStop(1,   "rgba(100,0,20,0.04)");
  ctx.fillStyle = lp;
  ctx.fillRect(0, 0, LEFT_W, H);

  // top label
  ctx.font      = "bold 16px CairoBold";
  ctx.fillStyle = "rgba(255,80,100,0.70)";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة", LEFT_W / 2, 40);

  // bomb symbol
  drawBomb(ctx, LEFT_W / 2, H / 2 + 10, 72, "#ff2244");

  // pass counter badge
  const BADGE_Y = H - 68;
  ctx.fillStyle = "rgba(160,0,30,0.60)";
  ctx.beginPath();
  ctx.roundRect(20, BADGE_Y, LEFT_W - 40, 40, 10);
  ctx.fill();
  ctx.font      = "bold 15px CairoBold";
  ctx.fillStyle = "#ff9999";
  ctx.textAlign = "center";
  ctx.fillText(`التمريرات: ${passCount}`, LEFT_W / 2, BADGE_Y + 26);

  ctx.restore();

  // ── divider ───────────────────────────────────────────────────────────
  const dg = ctx.createLinearGradient(0, 0, 0, H);
  dg.addColorStop(0,   "rgba(220,0,50,0)");
  dg.addColorStop(0.5, "rgba(255,30,70,0.90)");
  dg.addColorStop(1,   "rgba(220,0,50,0)");
  ctx.fillStyle = dg;
  ctx.fillRect(LEFT_W, 0, 2, H);

  // ── right panel ───────────────────────────────────────────────────────
  const rx   = LEFT_W + 32;
  const rw   = W - rx - 28;
  const midX = rx + rw / 2;

  // section header
  ctx.font      = "bold 17px CairoBold";
  ctx.fillStyle = "rgba(255,80,100,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة عند:", midX, 55);

  // horizontal glow line
  drawGlowLine(ctx, 68, "rgb(255,40,80)", 0.5);

  // holder name (large, glowing)
  const hName    = limitName(holderName, 18);
  const hFontSz  = hName.length > 14 ? 52 : hName.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font        = `bold ${hFontSz}px CairoBold`;
  ctx.textAlign   = "center";
  ctx.shadowColor = "#ff2244";
  ctx.shadowBlur  = 35;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText(hName, midX, H / 2 + 12);
  ctx.shadowBlur  = 0;
  ctx.restore();

  // underline
  drawGlowLine(ctx, H / 2 + 30, "rgb(255,50,90)", 0.60);

  // ── player list ────────────────────────────────────────────────────────
  const listed   = allPlayers.slice(0, 6);
  const lineH    = 28;
  const listY    = H / 2 + 52;

  ctx.font      = "15px Cairo";
  ctx.textAlign = "center";

  for (let i = 0; i < listed.length; i++) {
    const isCurrent = listed[i] === holderName
      || allPlayers.indexOf(listed[i]) === allPlayers.findIndex(n => n === holderName);
    ctx.fillStyle = isCurrent ? "rgba(255,100,120,0.95)" : "rgba(200,180,185,0.55)";
    const dot = isCurrent ? "💣 " : "• ";
    ctx.fillText(dot + limitName(listed[i], 16), midX, listY + i * lineH);
  }
  if (allPlayers.length > 6) {
    ctx.fillStyle = "rgba(180,140,145,0.40)";
    ctx.fillText(`+ ${allPlayers.length - 6} آخرين`, midX, listY + 6 * lineH);
  }

  // bottom tag
  ctx.font      = "14px Cairo";
  ctx.fillStyle = "rgba(255,80,100,0.35)";
  ctx.textAlign = "center";
  ctx.fillText("مرّرها قبل ما تنفجر! 💣", midX, H - 18);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Explosion card ─────────────────────────────────────────────────────────────

export async function generateBombExplosionCard(
  playerName: string,
  remaining: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── background ────────────────────────────────────────────────────────
  drawBackground(ctx, "#060200", "#100400", "#040200");
  drawGrid(ctx, "rgba(220,80,0,0.04)");

  const cr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
  cr.addColorStop(0, "rgba(200,60,0,0.12)");
  cr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cr;
  ctx.fillRect(0, 0, W, H);

  // ── left panel: explosion ─────────────────────────────────────────────
  const LEFT_W = 310;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const lp = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  lp.addColorStop(0, "rgba(220,80,0,0.25)");
  lp.addColorStop(1, "rgba(100,30,0,0.04)");
  ctx.fillStyle = lp;
  ctx.fillRect(0, 0, LEFT_W, H);

  ctx.font      = "bold 16px CairoBold";
  ctx.fillStyle = "rgba(255,140,0,0.70)";
  ctx.textAlign = "center";
  ctx.fillText("انفجار", LEFT_W / 2, 40);

  drawExplosion(ctx, LEFT_W / 2, H / 2 + 10, 82);

  // remaining badge
  const BADGE_Y = H - 68;
  ctx.fillStyle = "rgba(160,60,0,0.65)";
  ctx.beginPath();
  ctx.roundRect(20, BADGE_Y, LEFT_W - 40, 40, 10);
  ctx.fill();
  ctx.font      = "bold 15px CairoBold";
  ctx.fillStyle = "#ffcc66";
  ctx.textAlign = "center";
  ctx.fillText(`المتبقون: ${remaining}`, LEFT_W / 2, BADGE_Y + 26);

  ctx.restore();

  // ── divider ───────────────────────────────────────────────────────────
  const dg = ctx.createLinearGradient(0, 0, 0, H);
  dg.addColorStop(0,   "rgba(220,90,0,0)");
  dg.addColorStop(0.5, "rgba(255,120,0,0.90)");
  dg.addColorStop(1,   "rgba(220,90,0,0)");
  ctx.fillStyle = dg;
  ctx.fillRect(LEFT_W, 0, 2, H);

  // ── right panel ───────────────────────────────────────────────────────
  const rx   = LEFT_W + 32;
  const rw   = W - rx - 28;
  const midX = rx + rw / 2;

  // BOOM header
  ctx.save();
  ctx.font        = `bold 42px CairoBold`;
  ctx.textAlign   = "center";
  ctx.shadowColor = "#ff7700";
  ctx.shadowBlur  = 30;
  ctx.fillStyle   = "#ff8800";
  ctx.fillText("BOOM!", midX, 90);
  ctx.shadowBlur  = 0;
  ctx.restore();

  ctx.font      = "18px Cairo";
  ctx.fillStyle = "rgba(255,130,0,0.60)";
  ctx.textAlign = "center";
  ctx.fillText("انفجرت عليه القنبلة", midX, 128);

  drawGlowLine(ctx, 142, "rgb(255,110,0)", 0.50);

  // player name
  const name    = limitName(playerName, 18);
  const fontSz  = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font        = `bold ${fontSz}px CairoBold`;
  ctx.textAlign   = "center";
  ctx.shadowColor = "#cc5500";
  ctx.shadowBlur  = 32;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 22);
  ctx.shadowBlur  = 0;
  ctx.restore();

  drawGlowLine(ctx, H / 2 + 42, "rgb(255,100,0)", 0.55);

  ctx.font      = "17px Cairo";
  ctx.fillStyle = "rgba(220,110,0,0.65)";
  ctx.textAlign = "center";
  ctx.fillText("طلع من اللعبة", midX, H / 2 + 75);

  ctx.font      = "14px Cairo";
  ctx.fillStyle = "rgba(200,90,0,0.38)";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة", midX, H - 18);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Winner card ───────────────────────────────────────────────────────────────

export async function generateBombWinnerCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv     = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx    = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── background ────────────────────────────────────────────────────────
  drawBackground(ctx, "#010903", "#011508", "#010603");
  drawGrid(ctx, "rgba(0,200,80,0.04)");

  const cr = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
  cr.addColorStop(0, "rgba(0,180,70,0.10)");
  cr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = cr;
  ctx.fillRect(0, 0, W, H);

  // ── left panel ────────────────────────────────────────────────────────
  const LEFT_W = 310;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LEFT_W, H);
  ctx.clip();

  const lp = ctx.createLinearGradient(0, 0, LEFT_W, 0);
  lp.addColorStop(0, "rgba(0,180,70,0.26)");
  lp.addColorStop(1, "rgba(0,80,30,0.04)");
  ctx.fillStyle = lp;
  ctx.fillRect(0, 0, LEFT_W, H);

  ctx.font      = "bold 16px CairoBold";
  ctx.fillStyle = "rgba(0,230,100,0.72)";
  ctx.textAlign = "center";
  ctx.fillText("الناجي", LEFT_W / 2, 40);

  // Draw a bomb that DIDN'T explode (dark / defused look)
  ctx.save();
  ctx.globalAlpha = 0.6;
  drawBomb(ctx, LEFT_W / 2, H / 2 + 10, 72, "#00cc55");

  // Green X overlay = defused
  ctx.globalAlpha = 1.0;
  ctx.strokeStyle = "#00dd66";
  ctx.lineWidth   = 4;
  ctx.lineCap     = "round";
  ctx.shadowColor = "#00dd66";
  ctx.shadowBlur  = 18;
  const bx = LEFT_W / 2, by = H / 2 + 10, br = 72;
  ctx.beginPath();
  ctx.moveTo(bx - br * 0.35, by - br * 0.35);
  ctx.lineTo(bx + br * 0.35, by + br * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx + br * 0.35, by - br * 0.35);
  ctx.lineTo(bx - br * 0.35, by + br * 0.35);
  ctx.stroke();
  ctx.restore();

  // badge
  const BADGE_Y = H - 68;
  ctx.fillStyle = "rgba(0,130,50,0.65)";
  ctx.beginPath();
  ctx.roundRect(20, BADGE_Y, LEFT_W - 40, 40, 10);
  ctx.fill();
  ctx.font      = "bold 15px CairoBold";
  ctx.fillStyle = "#66ffaa";
  ctx.textAlign = "center";
  ctx.fillText("القنبلة المتنقلة", LEFT_W / 2, BADGE_Y + 26);

  ctx.restore();

  // ── divider ───────────────────────────────────────────────────────────
  const dg = ctx.createLinearGradient(0, 0, 0, H);
  dg.addColorStop(0,   "rgba(0,200,80,0)");
  dg.addColorStop(0.5, "rgba(0,230,100,0.90)");
  dg.addColorStop(1,   "rgba(0,200,80,0)");
  ctx.fillStyle = dg;
  ctx.fillRect(LEFT_W, 0, 2, H);

  // ── right panel ───────────────────────────────────────────────────────
  const rx   = LEFT_W + 32;
  const rw   = W - rx - 28;
  const midX = rx + rw / 2;

  ctx.font      = "bold 22px CairoBold";
  ctx.fillStyle = "rgba(0,220,100,0.72)";
  ctx.textAlign = "center";
  ctx.fillText("الناجي الوحيد!", midX, 58);

  drawGlowLine(ctx, 72, "rgb(0,210,90)", 0.52);

  ctx.font      = "18px Cairo";
  ctx.fillStyle = "rgba(0,200,90,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("لم تنفجر عليه القنبلة", midX, 108);

  // winner name
  const name   = limitName(playerName, 18);
  const fontSz = name.length > 14 ? 52 : name.length > 10 ? 62 : 72;
  ctx.save();
  ctx.font        = `bold ${fontSz}px CairoBold`;
  ctx.textAlign   = "center";
  ctx.shadowColor = "#009944";
  ctx.shadowBlur  = 35;
  ctx.fillStyle   = "#ffffff";
  ctx.fillText(name, midX, H / 2 + 22);
  ctx.shadowBlur  = 0;
  ctx.restore();

  drawGlowLine(ctx, H / 2 + 42, "rgb(0,200,80)", 0.55);

  ctx.font      = "14px Cairo";
  ctx.fillStyle = "rgba(0,200,80,0.38)";
  ctx.textAlign = "center";
  ctx.fillText("مبروك!  —  القنبلة المتنقلة", midX, H - 18);

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
