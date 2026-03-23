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
  const spacing = 20;
  for (let i = -h; i < w + h; i += spacing) {
    ctx.moveTo(x + i, y);
    ctx.lineTo(x + i + h, y + h);
  }
  ctx.stroke();
  ctx.restore();
}

function limitName(name: string, max = 18): string {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

// ─── Outsider card ─────────────────────────────────────────────────────────────
export async function generateOutsiderCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Rich dark background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#08001a");
  bg.addColorStop(0.5, "#0d0020");
  bg.addColorStop(1, "#04000f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Diagonal stripe panel on left (pattern section)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 260, H);
  ctx.clip();
  ctx.fillStyle = "rgba(100, 20, 180, 0.12)";
  ctx.fillRect(0, 0, 260, H);
  drawDiagonalLines(ctx, 0, 0, 260, H, "rgba(160, 80, 255, 0.08)");
  ctx.restore();

  // ── 3. Vertical separator
  const sepGrad = ctx.createLinearGradient(0, 0, 0, H);
  sepGrad.addColorStop(0, "transparent");
  sepGrad.addColorStop(0.3, "rgba(168, 85, 247, 0.8)");
  sepGrad.addColorStop(0.7, "rgba(168, 85, 247, 0.8)");
  sepGrad.addColorStop(1, "transparent");
  ctx.fillStyle = sepGrad;
  ctx.fillRect(258, 0, 3, H);

  // ── 4. Large glowing circle (left panel accent)
  const circle = ctx.createRadialGradient(130, H / 2, 10, 130, H / 2, 150);
  circle.addColorStop(0, "rgba(168, 85, 247, 0.35)");
  circle.addColorStop(0.5, "rgba(120, 40, 200, 0.15)");
  circle.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = circle;
  ctx.fillRect(0, 0, 260, H);

  // ── 5. Big "؟" watermark in left panel
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 280px CairoBold";
  ctx.fillText("؟", 130, H / 2 + 100);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 6. Left panel label: "برا السالفة" (vertical feel)
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(216, 180, 254, 0.90)";
  ctx.font = "bold 26px CairoBold";
  ctx.fillText("برا", 130, H / 2 - 40);
  ctx.fillText("السالفة", 130, H / 2 + 5);
  ctx.restore();

  // ── 7. Right panel: main glow blob
  const glow = ctx.createRadialGradient(W - 180, H * 0.45, 20, W - 180, H * 0.45, 320);
  glow.addColorStop(0, "rgba(140, 50, 230, 0.22)");
  glow.addColorStop(0.5, "rgba(90, 20, 160, 0.08)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(260, 0, W - 260, H);

  // ── 8. Role label pill (top-right)
  const pillW = 200, pillH = 36;
  const pillX = W - 60 - pillW, pillY = 40;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(168, 85, 247, 0.20)";
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 130, 255, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#d8b4fe";
  ctx.font = "bold 17px CairoBold";
  ctx.fillText("دورك في اللعبة", pillX + pillW / 2, pillY + 24);
  ctx.restore();

  // ── 9. Big identity title
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 100px CairoBold";
  ctx.fillText("برا السالفة", W - 60, 220);
  ctx.shadowColor = "#c084fc";
  ctx.shadowBlur = 70;
  ctx.fillText("برا السالفة", W - 60, 220);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── 10. Divider line (right panel)
  const div = ctx.createLinearGradient(W - 520, 0, W - 60, 0);
  div.addColorStop(0, "rgba(168,85,247,0)");
  div.addColorStop(0.3, "rgba(168,85,247,0.6)");
  div.addColorStop(1, "rgba(168,85,247,0.9)");
  ctx.strokeStyle = div;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - 520, 248);
  ctx.lineTo(W - 60, 248);
  ctx.stroke();

  // ── 11. Tagline
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(200, 160, 255, 0.65)";
  ctx.font = "24px Cairo";
  ctx.fillText("ما تعرف الموضوع — اكتشفه قبل أن ينكشف أمرك!", W - 60, 290);
  ctx.restore();

  // ── 12. Player name badge
  const dname = limitName(playerName, 20);
  const nameFontSize = dname.length > 14 ? 22 : 26;
  const nW = Math.max(200, dname.length * nameFontSize * 0.7 + 60);
  const nH = 50, nX = W - 60 - nW, nY = 340;
  ctx.save();
  roundRect(ctx, nX, nY, nW, nH, 10);
  const nbg = ctx.createLinearGradient(nX, 0, nX + nW, 0);
  nbg.addColorStop(0, "rgba(168, 85, 247, 0.25)");
  nbg.addColorStop(1, "rgba(100, 20, 180, 0.35)");
  ctx.fillStyle = nbg;
  ctx.fill();
  ctx.strokeStyle = "rgba(200, 130, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#ede9fe";
  ctx.font = `bold ${nameFontSize}px CairoBold`;
  ctx.fillText(dname, nX + nW / 2, nY + 33);
  ctx.restore();

  // ── 13. Bottom bar
  ctx.save();
  roundRect(ctx, 0, H - 52, W, 52, 0);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(168,85,247,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 52);
  ctx.lineTo(W, H - 52);
  ctx.stroke();

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(216,180,254,0.5)";
  ctx.font = "18px Cairo";
  ctx.fillText("برا السالفة  •  MaxGame Bot", 40, H - 18);
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(216,180,254,0.35)";
  ctx.font = "18px Cairo";
  ctx.fillText("لا تنكشف", W - 40, H - 18);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Insider card ──────────────────────────────────────────────────────────────
export async function generateInsiderCard(
  playerName: string, category: string, topic: string
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#000f09");
  bg.addColorStop(0.5, "#001510");
  bg.addColorStop(1, "#000a06");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── 2. Left panel (category section)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 260, H);
  ctx.clip();
  ctx.fillStyle = "rgba(16, 185, 129, 0.10)";
  ctx.fillRect(0, 0, 260, H);
  drawDiagonalLines(ctx, 0, 0, 260, H, "rgba(52, 211, 153, 0.07)");
  ctx.restore();

  // ── 3. Separator
  const sep = ctx.createLinearGradient(0, 0, 0, H);
  sep.addColorStop(0, "transparent");
  sep.addColorStop(0.3, "rgba(16, 185, 129, 0.75)");
  sep.addColorStop(0.7, "rgba(16, 185, 129, 0.75)");
  sep.addColorStop(1, "transparent");
  ctx.fillStyle = sep;
  ctx.fillRect(258, 0, 3, H);

  // ── 4. Left panel glow
  const lglow = ctx.createRadialGradient(130, H / 2, 10, 130, H / 2, 140);
  lglow.addColorStop(0, "rgba(16, 185, 129, 0.28)");
  lglow.addColorStop(0.5, "rgba(5, 100, 70, 0.12)");
  lglow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lglow;
  ctx.fillRect(0, 0, 260, H);

  // ── 5. Category badge in left panel
  const catLines = category.split(" ");
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(110, 231, 183, 0.85)";
  ctx.font = "bold 22px CairoBold";
  catLines.forEach((line, i) => ctx.fillText(line, 130, H / 2 - 20 + i * 32));
  ctx.restore();

  // "الفئة" label
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(110,231,183,0.40)";
  ctx.font = "16px Cairo";
  ctx.fillText("الفئة", 130, H / 2 - 50);
  ctx.restore();

  // ── 6. Right panel glow
  const rglow = ctx.createRadialGradient(W - 200, H * 0.4, 20, W - 200, H * 0.4, 300);
  rglow.addColorStop(0, "rgba(16, 185, 129, 0.18)");
  rglow.addColorStop(0.5, "rgba(5, 80, 50, 0.07)");
  rglow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rglow;
  ctx.fillRect(260, 0, W - 260, H);

  // ── 7. "الكلمة السرية" pill
  const pillW = 210, pillH = 36, pillX = W - 60 - pillW, pillY = 36;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(16, 185, 129, 0.18)";
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 211, 153, 0.55)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#6ee7b7";
  ctx.font = "bold 17px CairoBold";
  ctx.fillText("الكلمة السرية", pillX + pillW / 2, pillY + 24);
  ctx.restore();

  // ── 8. Word — glowing box
  const wordFontSize = topic.length > 9 ? 80 : topic.length > 5 ? 96 : 112;
  const wordMetricsW = Math.min(580, topic.length * wordFontSize * 0.62 + 80);
  const wordBoxH = wordFontSize + 50, wordBoxX = W - 60 - wordMetricsW, wordBoxY = 98;
  ctx.save();
  roundRect(ctx, wordBoxX, wordBoxY, wordMetricsW, wordBoxH, 16);
  ctx.fillStyle = "rgba(16, 185, 129, 0.10)";
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 211, 153, 0.35)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.shadowColor = "#10b981";
  ctx.shadowBlur = 35;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${wordFontSize}px CairoBold`;
  ctx.fillText(topic, W - 80, wordBoxY + wordBoxH - 22);
  ctx.shadowColor = "#34d399";
  ctx.shadowBlur = 60;
  ctx.fillText(topic, W - 80, wordBoxY + wordBoxH - 22);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── 9. Divider
  const div = ctx.createLinearGradient(W - 520, 0, W - 60, 0);
  div.addColorStop(0, "rgba(16,185,129,0)");
  div.addColorStop(0.3, "rgba(16,185,129,0.5)");
  div.addColorStop(1, "rgba(16,185,129,0.85)");
  ctx.strokeStyle = div;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W - 520, wordBoxY + wordBoxH + 14);
  ctx.lineTo(W - 60, wordBoxY + wordBoxH + 14);
  ctx.stroke();

  // ── 10. Tagline
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(110, 231, 183, 0.60)";
  ctx.font = "22px Cairo";
  ctx.fillText("لمّح بذكاء — لا تقل الكلمة مباشرة!", W - 60, wordBoxY + wordBoxH + 50);
  ctx.restore();

  // ── 11. Player name badge
  const dname = limitName(playerName, 20);
  const nfs = dname.length > 14 ? 22 : 26;
  const nW = Math.max(200, dname.length * nfs * 0.7 + 60);
  const nH = 50, nX = W - 60 - nW, nY = wordBoxY + wordBoxH + 70;
  ctx.save();
  roundRect(ctx, nX, nY, nW, nH, 10);
  const nbg = ctx.createLinearGradient(nX, 0, nX + nW, 0);
  nbg.addColorStop(0, "rgba(16, 185, 129, 0.22)");
  nbg.addColorStop(1, "rgba(5, 100, 60, 0.35)");
  ctx.fillStyle = nbg;
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 211, 153, 0.50)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#a7f3d0";
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.fillText(dname, nX + nW / 2, nY + 33);
  ctx.restore();

  // ── 12. Bottom bar
  ctx.save();
  roundRect(ctx, 0, H - 52, W, 52, 0);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(16,185,129,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, H - 52);
  ctx.lineTo(W, H - 52);
  ctx.stroke();

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(110,231,183,0.50)";
  ctx.font = "18px Cairo";
  ctx.fillText("داخل السالفة  •  MaxGame Bot", 40, H - 18);
  ctx.restore();

  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(110,231,183,0.35)";
  ctx.font = "18px Cairo";
  ctx.fillText("لا تكشف الكلمة", W - 40, H - 18);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Reveal card ───────────────────────────────────────────────────────────────
export async function generateRevealCard(playerName: string): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();

  const RW = 900, RH = 520;
  const canvas = cv.createCanvas(RW, RH);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Pure black base
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, RW, RH);

  // ── 2. Dramatic bottom spotlight
  const spot1 = ctx.createRadialGradient(RW / 2, RH + 80, 10, RW / 2, RH + 80, 600);
  spot1.addColorStop(0, "rgba(200, 80, 255, 0.65)");
  spot1.addColorStop(0.3, "rgba(140, 30, 220, 0.30)");
  spot1.addColorStop(0.6, "rgba(80, 10, 140, 0.12)");
  spot1.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spot1;
  ctx.fillRect(0, 0, RW, RH);

  // ── 3. Top spotlight (softer)
  const spot2 = ctx.createRadialGradient(RW / 2, -50, 10, RW / 2, -50, 400);
  spot2.addColorStop(0, "rgba(180, 60, 255, 0.40)");
  spot2.addColorStop(0.5, "rgba(100, 20, 200, 0.10)");
  spot2.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spot2;
  ctx.fillRect(0, 0, RW, RH);

  // ── 4. Horizontal scanlines (subtle)
  ctx.save();
  ctx.globalAlpha = 0.020;
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < RH; y += 4) ctx.fillRect(0, y, RW, 1);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 5. Radiating lines from center
  ctx.save();
  ctx.globalAlpha = 0.04;
  ctx.strokeStyle = "#c084fc";
  ctx.lineWidth = 1;
  const cx = RW / 2, cy = RH / 2 + 30;
  for (let angle = 0; angle < 360; angle += 12) {
    const rad = (angle * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(rad) * 600, cy + Math.sin(rad) * 600);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // ── 6. Border frame
  ctx.save();
  roundRect(ctx, 3, 3, RW - 6, RH - 6, 20);
  ctx.strokeStyle = "rgba(200, 80, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // ── 7. Top + bottom colour stripes
  for (const [sy, sh] of [[0, 5], [RH - 5, 5]] as [number, number][]) {
    const sg = ctx.createLinearGradient(0, 0, RW, 0);
    sg.addColorStop(0, "transparent");
    sg.addColorStop(0.5, "#a855f7");
    sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg;
    ctx.fillRect(0, sy, RW, sh);
  }

  // ── 8. "انكشف!" top pill
  const pillW = 190, pillH = 40, pillX = (RW - pillW) / 2, pillY = 32;
  ctx.save();
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(168, 85, 247, 0.25)";
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 150, 255, 0.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "#e9d5ff";
  ctx.font = "bold 21px CairoBold";
  ctx.fillText("انكشف!", RW / 2, pillY + 27);
  ctx.restore();

  // ── 9. "برا السالفة" heading
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(216, 180, 254, 0.65)";
  ctx.font = "30px Cairo";
  ctx.fillText("برا السالفة", RW / 2, 126);
  ctx.restore();

  // ── 10. "هو ..." suspense
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(240, 200, 255, 0.80)";
  ctx.font = "bold 52px CairoBold";
  ctx.fillText("هـو  ...", RW / 2, 200);
  ctx.restore();

  // ── 11. Glow divider
  const dv = ctx.createLinearGradient(60, 0, RW - 60, 0);
  dv.addColorStop(0, "transparent");
  dv.addColorStop(0.35, "rgba(168,85,247,0.7)");
  dv.addColorStop(0.65, "rgba(168,85,247,0.7)");
  dv.addColorStop(1, "transparent");
  ctx.strokeStyle = dv;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(60, 228);
  ctx.lineTo(RW - 60, 228);
  ctx.stroke();

  // ── 12. HUGE player name
  const dname = limitName(playerName, 18);
  const nfs = dname.length > 12 ? 78 : dname.length > 8 ? 92 : dname.length > 5 ? 108 : 124;

  // Shadow pass (blur)
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.shadowColor = "#d946ef";
  ctx.shadowBlur = 60;
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.fillText(dname, RW / 2, 370);
  ctx.restore();

  // Main name
  ctx.save();
  ctx.direction = "rtl";
  ctx.textAlign = "center";
  ctx.shadowColor = "#c026d3";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${nfs}px CairoBold`;
  ctx.fillText(dname, RW / 2, 370);
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 55;
  ctx.fillText(dname, RW / 2, 370);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ── 13. Corner diamond accents
  const gems: [number, number][] = [[50, 50], [RW - 50, 50], [50, RH - 50], [RW - 50, RH - 50]];
  for (const [gx, gy] of gems) {
    ctx.save();
    ctx.strokeStyle = "rgba(168,85,247,0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(gx, gy - 8);
    ctx.lineTo(gx + 8, gy);
    ctx.lineTo(gx, gy + 8);
    ctx.lineTo(gx - 8, gy);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ── 14. Bottom bar
  ctx.save();
  roundRect(ctx, 0, RH - 50, RW, 50, 0);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(168,85,247,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RH - 50);
  ctx.lineTo(RW, RH - 50);
  ctx.stroke();

  ctx.save();
  ctx.direction = "ltr";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(216,180,254,0.45)";
  ctx.font = "17px Cairo";
  ctx.fillText("برا السالفة  •  MaxGame Bot  🎮", RW / 2, RH - 16);
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
