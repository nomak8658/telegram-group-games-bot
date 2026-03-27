import type { Telegraf } from "telegraf";
import { spawn, execFile }  from "child_process";
import { existsSync, unlinkSync } from "fs";
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

// Pre-warm at startup (don't await — run in background)
export function preWarmYtDlp(): void {
  resolveYtDlp().catch(() => {});
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongInfo {
  title:    string;
  id:       string;
  duration: number;
  author:   string;
}

// ─── Search (yt-dlp ytsearch) ─────────────────────────────────────────────────

async function findSong(query: string): Promise<SongInfo | null> {
  const bin = await resolveYtDlp();

  return new Promise<SongInfo | null>((resolve) => {
    let stdout = "";
    let stderr = "";
    const proc = spawn(bin, [
      `ytsearch8:${query}`,
      "--print", "%(title)s\t%(id)s\t%(duration)s\t%(uploader)s",
      "--flat-playlist",
      "--no-warnings",
      "--no-playlist",
      "--socket-timeout", "10",
      "--extractor-args", "youtube:player_client=android",
    ]);

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      const lines = stdout.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        const parts = line.split("\t");
        const title = parts[0] ?? "";
        const id    = parts[1] ?? "";
        const dur   = parseFloat(parts[2] ?? "0");
        const auth  = parts[3] ?? "";
        if (id && dur > 0 && dur <= 600) {
          return resolve({ title: title || query, id, duration: Math.round(dur), author: auth });
        }
      }
      if (code !== 0) console.error("[music:search] yt-dlp error:", stderr.slice(-200));
      resolve(null);
    });

    proc.on("error", (e) => { console.error("[music:search] spawn error:", e.message); resolve(null); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 25_000);

    proc.on("close", () => clearTimeout(timer));
  });
}

// ─── Download audio ───────────────────────────────────────────────────────────

async function downloadAudio(videoId: string): Promise<Buffer> {
  const bin     = await resolveYtDlp();
  const tmpBase = path.join(os.tmpdir(), `yt_${Date.now()}_${videoId}`);
  const outTpl  = `${tmpBase}.%(ext)s`;

  // Find ffmpeg in PATH
  let ffmpegDir = "";
  try {
    const { stdout } = await execFileAsync("which", ["ffmpeg"]);
    const p = stdout.trim();
    if (p) ffmpegDir = path.dirname(p);
  } catch { /* no ffmpeg */ }

  const args = [
    `https://www.youtube.com/watch?v=${videoId}`,
    "-x",
    "--audio-format",  "mp3",
    "--audio-quality", "5",
    "-o", outTpl,
    "--no-warnings",
    "--no-playlist",
    "--socket-timeout", "20",
    "--no-part",
    "--extractor-args", "youtube:player_client=android",
    ...(ffmpegDir ? ["--ffmpeg-location", ffmpegDir] : []),
  ];

  const stderr = await new Promise<string>((resolve, reject) => {
    let err = "";
    const proc = spawn(bin, args);
    proc.stderr.on("data", (d: Buffer) => { err += d.toString(); });
    proc.on("close", (code) => code === 0 ? resolve(err) : reject(new Error(`yt-dlp ${code}: ${err.slice(-300)}`)));
    proc.on("error", reject);
    setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("download timeout (90s)"));
    }, 90_000);
  });

  const mp3Path = `${tmpBase}.mp3`;
  if (!existsSync(mp3Path)) {
    console.error("[music:dl] no mp3 file; stderr:", stderr.slice(-200));
    throw new Error("mp3 not produced");
  }
  const buf = await readFile(mp3Path);
  try { unlinkSync(mp3Path); } catch { /* ignore */ }
  return buf;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
    { parse_mode: "HTML", reply_parameters: { message_id: replyTo } },
  ).catch(() => null);

  const edit = (text: string) =>
    bot.telegram.editMessageText(
      chatId, statusMsg?.message_id, undefined,
      text, { parse_mode: "HTML" },
    ).catch(() => {});

  // ── 1. Search ──
  let song: SongInfo | null;
  try {
    song = await findSong(query);
  } catch (e: any) {
    console.error("[music] findSong threw:", e?.message);
    await edit("❌ خطأ في البحث — جرب مرة ثانية.");
    return;
  }
  if (!song) {
    await edit("❌ ما لقيت نتيجة — جرب اسماً ثانياً.");
    return;
  }

  await edit(
    `🎵 <b>${trimTitle(song.title)}</b>\n` +
    `👤 ${song.author || "—"}  ⏱ ${fmtDuration(song.duration)}\n` +
    `⏳ جاري التحميل…`,
  );

  // ── 2. Download ──
  let buf: Buffer;
  try {
    buf = await downloadAudio(song.id);
  } catch (e: any) {
    console.error("[music] downloadAudio failed:", e?.message);
    await edit("❌ فشل التحميل — جرب مرة ثانية.");
    return;
  }

  // ── 3. Send audio ──
  await bot.telegram.deleteMessage(chatId, statusMsg?.message_id ?? 0).catch(() => {});

  await bot.telegram.sendAudio(
    chatId,
    { source: buf, filename: `${trimTitle(song.title, 40)}.mp3` },
    {
      title:      trimTitle(song.title, 60),
      performer:  song.author   || undefined,
      duration:   song.duration || undefined,
      caption:    `🎵 <b>${trimTitle(song.title)}</b>`,
      parse_mode: "HTML",
      reply_parameters: { message_id: replyTo },
    } as any,
  ).catch(async () => {
    await bot.telegram.sendMessage(
      chatId,
      "❌ فشل الإرسال — الملف ربما كبير جداً.",
      { parse_mode: "HTML" },
    ).catch(() => {});
  });
}
