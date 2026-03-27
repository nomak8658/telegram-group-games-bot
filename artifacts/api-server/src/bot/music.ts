import type { Telegraf } from "telegraf";
import { spawn, execFile }  from "child_process";
import { existsSync, unlinkSync, readdirSync } from "fs";
import { readFile, chmod }  from "fs/promises";
import { promisify }        from "util";
import path                 from "path";
import os                   from "os";

const execFileAsync = promisify(execFile);

// ─── yt-dlp binary resolution ─────────────────────────────────────────────────

const YTDLP_FALLBACK  = path.join(os.tmpdir(), "yt-dlp-bin");
const YTDLP_URL       =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

let resolvedBin: string | null = null;
let downloadPromise: Promise<string> | null = null;

async function resolveYtDlp(): Promise<string> {
  if (resolvedBin) return resolvedBin;

  // 1. Check PATH (/usr/local/bin/yt-dlp installed by Docker build)
  try {
    const { stdout } = await execFileAsync("which", ["yt-dlp"]);
    const p = stdout.trim();
    if (p) { resolvedBin = p; return p; }
  } catch { /* not in PATH */ }

  // 2. Use fallback path if already downloaded
  if (existsSync(YTDLP_FALLBACK)) {
    resolvedBin = YTDLP_FALLBACK;
    return YTDLP_FALLBACK;
  }

  // 3. Download standalone binary (max 45s) — only one concurrent download
  if (!downloadPromise) {
    downloadPromise = (async () => {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("curl", [
          "-sL", "--max-time", "45", "--retry", "2",
          YTDLP_URL, "-o", YTDLP_FALLBACK,
        ]);
        proc.on("close", code => code === 0 ? resolve() : reject(new Error(`curl ${code}`)));
        proc.on("error", reject);
        setTimeout(() => { proc.kill(); reject(new Error("curl timeout")); }, 50_000);
      });
      await chmod(YTDLP_FALLBACK, 0o755);
      resolvedBin = YTDLP_FALLBACK;
      return YTDLP_FALLBACK;
    })().catch((e) => {
      downloadPromise = null;
      throw e;
    });
  }
  return downloadPromise;
}

// Pre-warm at startup (background)
export function preWarmYtDlp(): void {
  resolveYtDlp().then(p => console.log("[music] yt-dlp ready:", p)).catch(e => console.error("[music] yt-dlp warm failed:", e?.message));
}

// ─── ffmpeg resolution ────────────────────────────────────────────────────────

let ffmpegDir: string | null = null;
let ffmpegChecked = false;

async function getFfmpegDir(): Promise<string | null> {
  if (ffmpegChecked) return ffmpegDir;
  ffmpegChecked = true;
  try {
    const { stdout } = await execFileAsync("which", ["ffmpeg"]);
    const p = stdout.trim();
    ffmpegDir = p ? path.dirname(p) : null;
  } catch { ffmpegDir = null; }
  console.log("[music] ffmpeg:", ffmpegDir ?? "NOT FOUND");
  return ffmpegDir;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongInfo {
  title:    string;
  id:       string;
  duration: number;
  author:   string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runYtDlp(bin: string, args: string[], timeoutMs = 30_000): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(bin, args);
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`yt-dlp timeout (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`yt-dlp exit ${code}: ${stderr.slice(-300)}`));
    });
    proc.on("error", (e) => { clearTimeout(timer); reject(e); });
  });
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function findSong(query: string): Promise<SongInfo | null> {
  const bin = await resolveYtDlp();

  const { stdout, stderr } = await runYtDlp(bin, [
    `ytsearch8:${query}`,
    "--print", "%(title)s|%(id)s|%(duration)s|%(uploader)s",
    "--flat-playlist",
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout", "10",
  ], 25_000).catch(e => { console.error("[music:search]", e?.message); return { stdout: "", stderr: "" }; });

  const lines = stdout.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const [title, id, durStr, author] = line.split("|");
    const dur = parseFloat(durStr ?? "0");
    if (id && dur > 0 && dur <= 600) {
      return { title: title || query, id, duration: Math.round(dur), author: author ?? "" };
    }
  }
  if (stderr) console.error("[music:search] stderr:", stderr.slice(-200));
  return null;
}

// ─── Download audio ───────────────────────────────────────────────────────────

interface AudioFile { buf: Buffer; ext: string; }

async function downloadAudio(videoId: string): Promise<AudioFile> {
  const bin      = await resolveYtDlp();
  const ffDir    = await getFfmpegDir();
  const tmpBase  = path.join(os.tmpdir(), `yt_${Date.now()}_${videoId}`);

  const baseArgs = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout", "20",
    "--no-part",
    "-o", `${tmpBase}.%(ext)s`,
  ];

  // ── Strategy A: mp3 via ffmpeg (best quality, needs ffmpeg) ──
  if (ffDir) {
    try {
      await runYtDlp(bin, [
        ...baseArgs,
        "-x", "--audio-format", "mp3", "--audio-quality", "5",
        "--ffmpeg-location", ffDir,
      ], 90_000);

      const mp3 = `${tmpBase}.mp3`;
      if (existsSync(mp3)) {
        const buf = await readFile(mp3);
        try { unlinkSync(mp3); } catch {}
        return { buf, ext: "mp3" };
      }
    } catch (e: any) {
      console.error("[music:dl] mp3 strategy failed:", e?.message);
      // fall through to strategy B
    }
  }

  // ── Strategy B: raw m4a/AAC (no ffmpeg needed, direct download) ──
  // 140 = mp4a 128kbps, 139 = mp4a 48kbps, fallback to best webm
  try {
    await runYtDlp(bin, [
      ...baseArgs,
      "-f", "140/139/bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio",
    ], 90_000);

    // Find the output file by prefix
    const tmpDir = os.tmpdir();
    const prefix = path.basename(tmpBase);
    const files  = readdirSync(tmpDir).filter(f => f.startsWith(prefix));
    const found  = files[0];
    if (found) {
      const fullPath = path.join(tmpDir, found);
      const buf = await readFile(fullPath);
      try { unlinkSync(fullPath); } catch {}
      const ext = path.extname(found).slice(1) || "m4a";
      return { buf, ext };
    }
  } catch (e: any) {
    console.error("[music:dl] m4a strategy failed:", e?.message);
  }

  throw new Error("all download strategies failed");
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function trimTitle(t: string, max = 60): string {
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function fmtDuration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

// ─── Public handler ───────────────────────────────────────────────────────────

export async function handleMusicSearch(
  bot:     Telegraf,
  chatId:  number,
  query:   string,
  replyTo: number,
): Promise<void> {

  const statusMsg = await bot.telegram.sendMessage(
    chatId,
    `🔍 جاري البحث عن: <b>${trimTitle(query, 60)}</b>…`,
    { parse_mode: "HTML" },
  ).catch(() => null);

  if (!statusMsg) {
    // Can't send at all — bot probably doesn't have permission
    console.error("[music] sendMessage failed for chatId", chatId);
    return;
  }

  const edit = (text: string) =>
    bot.telegram.editMessageText(
      chatId, statusMsg?.message_id, undefined,
      text, { parse_mode: "HTML" },
    ).catch(() => {});

  // ── 1. Search ──
  let song: SongInfo | null;
  try { song = await findSong(query); }
  catch (e: any) { console.error("[music] findSong threw:", e?.message); await edit("❌ خطأ في البحث."); return; }

  if (!song) { await edit("❌ ما لقيت نتيجة — جرب اسماً ثانياً."); return; }

  await edit(
    `🎵 <b>${trimTitle(song.title)}</b>\n` +
    `👤 ${song.author || "—"}  ⏱ ${fmtDuration(song.duration)}\n` +
    `⏳ جاري التحميل…`,
  );

  // ── 2. Download ──
  let audio: AudioFile;
  try { audio = await downloadAudio(song.id); }
  catch (e: any) { console.error("[music] downloadAudio failed:", e?.message); await edit("❌ فشل التحميل — جرب مرة ثانية."); return; }

  // ── 3. Send ──
  await bot.telegram.deleteMessage(chatId, statusMsg?.message_id ?? 0).catch(() => {});

  const filename = `${trimTitle(song.title, 40)}.${audio.ext}`;
  await bot.telegram.sendAudio(
    chatId,
    { source: audio.buf, filename },
    {
      title:      trimTitle(song.title, 60),
      performer:  song.author   || undefined,
      duration:   song.duration || undefined,
      caption:    `🎵 <b>${trimTitle(song.title)}</b>`,
      parse_mode: "HTML",
      reply_parameters: { message_id: replyTo },
    } as any,
  ).catch(async () => {
    await bot.telegram.sendMessage(chatId, "❌ فشل الإرسال — الملف كبير جداً.", { parse_mode: "HTML" }).catch(() => {});
  });
}
