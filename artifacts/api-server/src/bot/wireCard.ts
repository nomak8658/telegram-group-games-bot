import path from "path";
import { fileURLToPath } from "url";
import type { WireEntry, WireColor } from "./state.js";

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

// ─── Constants ────────────────────────────────────────────────────────────────

const W = 960;
const H = 540;

const WIRE_COLORS: Record<WireColor, string> = {
  red:    "#ff2233",
  blue:   "#3399ff",
  green:  "#22ff66",
  yellow: "#ffee00",
};
const WIRE_COLORS_DIM: Record<WireColor, string> = {
  red:    "#551122",
  blue:   "#112244",
  green:  "#113322",
  yellow: "#443300",
};
const WIRE_AR: Record<WireColor, string> = {
  red:    "الأحمر",
  blue:   "الأزرق",
  green:  "الأخضر",
  yellow: "الأصفر",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function drawCircuit(ctx: CanvasRenderingContext2D, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < W; x += step) {
    for (let y = 0; y < H; y += step) {
      if (Math.random() > 0.85) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + step * 0.4, y);
        ctx.lineTo(x + step * 0.4, y + step * 0.4);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function padTime(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

// ─── Bomb Status Card ──────────────────────────────────────────────────────────

export async function generateWireBombCard(
  wires: WireEntry[],
  remainingSec: number,
  currentTeam: "A" | "B",
  teamANames: string[],
  teamBNames: string[],
  round: number,
): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  // ── 1. Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#020010");
  bg.addColorStop(0.5, "#06000e");
  bg.addColorStop(1,   "#030008");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Circuit texture
  drawCircuit(ctx, "rgba(0,200,255,0.025)");

  // ── 2. HEADER SECTION (0 → 90)
  const headerGrad = ctx.createLinearGradient(0, 0, W, 0);
  headerGrad.addColorStop(0,   "rgba(0,200,255,0.06)");
  headerGrad.addColorStop(0.5, "rgba(0,150,220,0.12)");
  headerGrad.addColorStop(1,   "rgba(0,200,255,0.06)");
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, W, 88);

  // Title
  ctx.save();
  ctx.font = "bold 28px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#00ccff";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("قنبلة الثواني الأخيرة", W / 2, 42);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Round badge
  ctx.fillStyle = "rgba(0,180,255,0.15)";
  roundRect(ctx, W - 120, 10, 108, 32, 6);
  ctx.fill();
  ctx.font = "bold 15px Cairo";
  ctx.fillStyle = "#88ddff";
  ctx.textAlign = "center";
  ctx.fillText(`الجولة  ${round}`, W - 66, 32);

  // Whose turn badge
  const turnColor = currentTeam === "A" ? "#00ccff" : "#ff7700";
  ctx.fillStyle = turnColor + "25";
  roundRect(ctx, 12, 10, 148, 32, 6);
  ctx.fill();
  ctx.font = "bold 15px CairoBold";
  ctx.fillStyle = turnColor;
  ctx.textAlign = "center";
  ctx.fillText(`دور فريق ${currentTeam === "A" ? "أ" : "ب"}`, 86, 32);

  // Header divider
  const hDivGrad = ctx.createLinearGradient(0, 0, W, 0);
  hDivGrad.addColorStop(0,   "rgba(0,200,255,0)");
  hDivGrad.addColorStop(0.5, "rgba(0,200,255,0.6)");
  hDivGrad.addColorStop(1,   "rgba(0,200,255,0)");
  ctx.strokeStyle = hDivGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 88); ctx.lineTo(W, 88);
  ctx.stroke();

  // ── 3. TIMER SECTION (90 → 165)
  const mins = Math.floor(remainingSec / 60);
  const secs = remainingSec % 60;
  const timeStr = `${padTime(mins)} : ${padTime(secs)}`;

  // Timer urgency color
  const timerColor = remainingSec <= 10 ? "#ff2222"
    : remainingSec <= 25 ? "#ff8800"
    : "#ff3333";

  // Timer background panel
  const panelW = 220, panelH = 58;
  const panelX = (W - panelW) / 2;
  ctx.fillStyle = timerColor + "18";
  roundRect(ctx, panelX, 98, panelW, panelH, 10);
  ctx.fill();
  ctx.strokeStyle = timerColor + "66";
  ctx.lineWidth = 1.5;
  roundRect(ctx, panelX, 98, panelW, panelH, 10);
  ctx.stroke();

  // Pulsing glow
  ctx.save();
  ctx.shadowColor = timerColor;
  ctx.shadowBlur = remainingSec <= 10 ? 30 : 12;
  ctx.font = "bold 46px CairoBold";
  ctx.fillStyle = timerColor;
  ctx.textAlign = "center";
  ctx.fillText(timeStr, W / 2, 142);
  ctx.shadowBlur = 0;
  ctx.restore();

  // "الوقت المتبقي" label
  ctx.font = "14px Cairo";
  ctx.fillStyle = "rgba(200,100,100,0.55)";
  ctx.textAlign = "center";
  ctx.fillText("الوقت المتبقي", W / 2, 166);

  // Section divider
  const wDivGrad = ctx.createLinearGradient(0, 0, W, 0);
  wDivGrad.addColorStop(0,   "rgba(255,255,255,0)");
  wDivGrad.addColorStop(0.5, "rgba(255,255,255,0.12)");
  wDivGrad.addColorStop(1,   "rgba(255,255,255,0)");
  ctx.strokeStyle = wDivGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(40, 174); ctx.lineTo(W - 40, 174);
  ctx.stroke();

  // ── 4. WIRE SECTION (174 → 434)
  const wireAreaY   = 180;
  const wireRowH    = 62;
  const wireLineX1  = 200;
  const wireLineX2  = W - 150;

  wires.forEach((wire, i) => {
    const rowY  = wireAreaY + i * wireRowH;
    const midY  = rowY + wireRowH / 2;
    const color = WIRE_COLORS[wire.color];
    const dimColor = WIRE_COLORS_DIM[wire.color];
    const isCut = wire.cut;

    // Row background on active/cut
    if (!isCut) {
      ctx.fillStyle = color + "08";
      ctx.fillRect(0, rowY, W, wireRowH - 4);
    }

    // ── Color indicator dot (left)
    ctx.beginPath();
    ctx.arc(54, midY, 14, 0, Math.PI * 2);
    ctx.fillStyle = isCut ? dimColor : color + "33";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(54, midY, 14, 0, Math.PI * 2);
    ctx.strokeStyle = isCut ? "#333" : color;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(54, midY, 7, 0, Math.PI * 2);
    ctx.fillStyle = isCut ? "#333" : color;
    ctx.shadowColor = isCut ? "transparent" : color;
    ctx.shadowBlur = isCut ? 0 : 12;
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Color name (left label)
    ctx.font = `bold 18px CairoBold`;
    ctx.fillStyle = isCut ? "#444" : color;
    ctx.textAlign = "left";
    ctx.fillText(WIRE_AR[wire.color], 82, midY + 7);

    // ── Wire line
    if (!isCut) {
      // Intact wire — glowing line
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(wireLineX1, midY);
      ctx.lineTo(wireLineX2, midY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Highlight on wire
      ctx.strokeStyle = "#ffffff44";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(wireLineX1, midY - 2);
      ctx.lineTo(wireLineX2, midY - 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // Cut wire — two segments + gap + cut marks
      const gapX1 = wireLineX1 + (wireLineX2 - wireLineX1) * 0.42;
      const gapX2 = wireLineX1 + (wireLineX2 - wireLineX1) * 0.58;

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(wireLineX1, midY); ctx.lineTo(gapX1, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gapX2, midY); ctx.lineTo(wireLineX2, midY);
      ctx.stroke();

      // Cut sparks at gap
      const gapCX = (gapX1 + gapX2) / 2;
      ctx.save();
      ctx.strokeStyle = "#ffee6688";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(gapX1 - 4, midY - 10); ctx.lineTo(gapX1 + 4, midY + 10);
      ctx.moveTo(gapX1 + 2, midY - 8);  ctx.lineTo(gapX1 + 10, midY + 6);
      ctx.moveTo(gapCX - 4, midY - 8);  ctx.lineTo(gapCX + 4, midY + 8);
      ctx.stroke();
      ctx.restore();
    }

    // ── Status text (right)
    ctx.font = isCut ? "15px Cairo" : "bold 15px CairoBold";
    ctx.fillStyle = isCut
      ? `rgba(120,120,120,0.7)`
      : (wire.cutByTeam ? color : color + "cc");
    ctx.textAlign = "right";
    ctx.fillText(
      isCut ? `مقطوع  (فريق ${wire.cutByTeam === "A" ? "أ" : "ب"})` : "سليم",
      W - 20, midY + 7
    );

    // Row divider
    if (i < 3) {
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, rowY + wireRowH - 2); ctx.lineTo(W - 20, rowY + wireRowH - 2);
      ctx.stroke();
    }
  });

  // ── 5. TEAM SECTION (434 → 540)
  const teamY = wireAreaY + 4 * wireRowH + 6;

  // Team section background
  const teamGrad = ctx.createLinearGradient(0, teamY, 0, H);
  teamGrad.addColorStop(0, "rgba(0,0,0,0)");
  teamGrad.addColorStop(1, "rgba(0,200,255,0.05)");
  ctx.fillStyle = teamGrad;
  ctx.fillRect(0, teamY, W, H - teamY);

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, teamY); ctx.lineTo(W, teamY);
  ctx.stroke();

  // Team A
  const aActive = currentTeam === "A";
  ctx.fillStyle = aActive ? "rgba(0,200,255,0.12)" : "rgba(255,255,255,0.03)";
  roundRect(ctx, 12, teamY + 8, W / 2 - 20, H - teamY - 16, 8);
  ctx.fill();
  if (aActive) {
    ctx.strokeStyle = "rgba(0,200,255,0.5)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, 12, teamY + 8, W / 2 - 20, H - teamY - 16, 8);
    ctx.stroke();
  }

  ctx.font = `bold 16px CairoBold`;
  ctx.fillStyle = aActive ? "#00ccff" : "#667788";
  ctx.textAlign = "center";
  ctx.fillText(`فريق أ  (${teamANames.length})`, W / 4, teamY + 32);

  ctx.font = "14px Cairo";
  ctx.fillStyle = aActive ? "#aaeeff" : "#445566";
  const aNamesStr = teamANames.slice(0, 3).join("  •  ") + (teamANames.length > 3 ? "  ..." : "");
  ctx.fillText(aNamesStr || "—", W / 4, teamY + 52);

  // Team B
  const bActive = currentTeam === "B";
  ctx.fillStyle = bActive ? "rgba(255,120,0,0.12)" : "rgba(255,255,255,0.03)";
  roundRect(ctx, W / 2 + 8, teamY + 8, W / 2 - 20, H - teamY - 16, 8);
  ctx.fill();
  if (bActive) {
    ctx.strokeStyle = "rgba(255,120,0,0.5)";
    ctx.lineWidth = 1.5;
    roundRect(ctx, W / 2 + 8, teamY + 8, W / 2 - 20, H - teamY - 16, 8);
    ctx.stroke();
  }

  ctx.font = `bold 16px CairoBold`;
  ctx.fillStyle = bActive ? "#ff8800" : "#776644";
  ctx.textAlign = "center";
  ctx.fillText(`فريق ب  (${teamBNames.length})`, W * 3 / 4, teamY + 32);

  ctx.font = "14px Cairo";
  ctx.fillStyle = bActive ? "#ffcc88" : "#554433";
  const bNamesStr = teamBNames.slice(0, 3).join("  •  ") + (teamBNames.length > 3 ? "  ..." : "");
  ctx.fillText(bNamesStr || "—", W * 3 / 4, teamY + 52);

  // Center divider between teams
  const tdGrad = ctx.createLinearGradient(0, teamY, 0, H);
  tdGrad.addColorStop(0, "rgba(255,255,255,0.15)");
  tdGrad.addColorStop(1, "rgba(255,255,255,0.04)");
  ctx.strokeStyle = tdGrad;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2, teamY + 12); ctx.lineTo(W / 2, H - 12);
  ctx.stroke();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Explosion Card ────────────────────────────────────────────────────────────

export async function generateWireExplodeCard(teamName: string, color: WireColor): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const wc = WIRE_COLORS[color];

  // Background
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 500);
  bg.addColorStop(0,   "#1a0500");
  bg.addColorStop(0.5, "#0e0200");
  bg.addColorStop(1,   "#030000");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Explosion radial lines from center
  const cx = W / 2, cy = H / 2 - 30;
  for (let i = 0; i < 24; i++) {
    const angle = (i * Math.PI * 2) / 24;
    const inner = 40, outer = 260 + (i % 3) * 40;
    const grad = ctx.createLinearGradient(
      cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner,
      cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer,
    );
    grad.addColorStop(0,   "rgba(255,120,0,0.7)");
    grad.addColorStop(0.6, "rgba(255,50,0,0.3)");
    grad.addColorStop(1,   "rgba(255,0,0,0)");
    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = i % 2 === 0 ? 3 : 1.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
    ctx.stroke();
    ctx.restore();
  }

  // Center glow
  const cglow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
  cglow.addColorStop(0,   "rgba(255,200,100,0.9)");
  cglow.addColorStop(0.4, "rgba(255,100,0,0.5)");
  cglow.addColorStop(1,   "rgba(255,0,0,0)");
  ctx.fillStyle = cglow;
  ctx.fillRect(cx - 90, cy - 90, 180, 180);

  // "!" large exclamation
  ctx.save();
  ctx.font = "bold 140px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ff6600";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#ff6600";
  ctx.fillText("!", cx, cy + 55);
  ctx.shadowBlur = 0;
  ctx.restore();

  // "BOOM!" header
  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#ff4400";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("انفجرت القنبلة!", W / 2, 90);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Subtitle: which wire
  ctx.font = "22px Cairo";
  ctx.fillStyle = `${wc}cc`;
  ctx.textAlign = "center";
  ctx.fillText(`السلك  ${WIRE_AR[color]}  أشعل القنبلة`, W / 2, 128);

  // Bottom: losing team
  const barY = H - 110;
  ctx.fillStyle = "rgba(200,30,0,0.35)";
  roundRect(ctx, W / 2 - 280, barY, 560, 80, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,80,0,0.6)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, W / 2 - 280, barY, 560, 80, 12);
  ctx.stroke();

  ctx.font = "17px Cairo";
  ctx.fillStyle = "rgba(255,150,100,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("خسر", W / 2, barY + 28);

  ctx.save();
  ctx.font = "bold 30px CairoBold";
  ctx.shadowColor = "#ff4400";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(teamName, W / 2, barY + 62);
  ctx.shadowBlur = 0;
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}

// ─── Defuse Card ───────────────────────────────────────────────────────────────

export async function generateWireDefuseCard(teamName: string, color: WireColor): Promise<Buffer> {
  await ensureFonts();
  const cv = await getCanvas();
  const canvas = cv.createCanvas(W, H);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;

  const wc = WIRE_COLORS[color];

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0,   "#000d06");
  bg.addColorStop(0.5, "#001408");
  bg.addColorStop(1,   "#000802");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Radial glow (green)
  const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 400);
  glow.addColorStop(0,   "rgba(0,200,80,0.12)");
  glow.addColorStop(0.7, "rgba(0,100,40,0.05)");
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Horizontal scan lines (subtle)
  for (let y = 0; y < H; y += 6) {
    ctx.fillStyle = "rgba(0,200,80,0.025)";
    ctx.fillRect(0, y, W, 1);
  }

  // Large checkmark drawn with canvas (no emoji)
  const cxc = W / 2, cyc = H / 2 - 20;
  ctx.save();
  ctx.strokeStyle = "#00ff77";
  ctx.lineWidth = 18;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = "#00ff77";
  ctx.shadowBlur = 35;
  ctx.beginPath();
  ctx.moveTo(cxc - 90, cyc + 10);
  ctx.lineTo(cxc - 20, cyc + 80);
  ctx.lineTo(cxc + 90, cyc - 70);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();

  // Outer ring
  ctx.save();
  ctx.strokeStyle = "rgba(0,255,100,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(W / 2, H / 2 - 20, 130, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Header
  ctx.save();
  ctx.font = "bold 52px CairoBold";
  ctx.textAlign = "center";
  ctx.shadowColor = "#00ee66";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#ffffff";
  ctx.fillText("تم تفكيك القنبلة!", W / 2, 82);
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.font = "22px Cairo";
  ctx.fillStyle = `${wc}cc`;
  ctx.textAlign = "center";
  ctx.fillText(`السلك  ${WIRE_AR[color]}  أنقذ الجميع`, W / 2, 118);

  // Bottom: winning team
  const barY = H - 106;
  ctx.fillStyle = "rgba(0,180,60,0.2)";
  roundRect(ctx, W / 2 - 280, barY, 560, 80, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,220,80,0.5)";
  ctx.lineWidth = 1.5;
  roundRect(ctx, W / 2 - 280, barY, 560, 80, 12);
  ctx.stroke();

  ctx.font = "17px Cairo";
  ctx.fillStyle = "rgba(100,255,150,0.7)";
  ctx.textAlign = "center";
  ctx.fillText("فاز", W / 2, barY + 28);

  ctx.save();
  ctx.font = "bold 30px CairoBold";
  ctx.shadowColor = "#00dd66";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(teamName, W / 2, barY + 62);
  ctx.shadowBlur = 0;
  ctx.restore();

  return canvas.toBuffer("image/png") as unknown as Buffer;
}
