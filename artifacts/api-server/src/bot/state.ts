import fs from "fs";
import path from "path";

export interface Player {
  id: number;
  name: string;
  username?: string;
}

export interface Debate {
  category: string;
  q: string;
  a: string;
  b: string;
}

export interface MenVsMenState {
  type: "menvsmen";
  phase: "arguing" | "voting" | "done";
  player1: Player;
  player2: Player;
  votes: Map<number, 1 | 2>;
  liveReacts: Map<number, 1 | 2>;
  debate?: Debate;
  reactMsgId?: number;
  voteMsgId?: number;
  startedBy: number;
  chatId: number;
  argTimer?: ReturnType<typeof setTimeout>;
  warnTimer?: ReturnType<typeof setTimeout>;
  warnTimer2?: ReturnType<typeof setTimeout>;
  voteTimer?: ReturnType<typeof setTimeout>;
  voteWarnTimer?: ReturnType<typeof setTimeout>;
}

export interface TrustBreakState {
  type: "trustbreak";
  phase: "joining" | "collecting" | "revealing" | "voting" | "guessing" | "done";
  victim: Player;
  participants: Map<number, Player>;
  opinions: Map<number, string>;
  pending: Set<number>;
  revealOrder?: number[];
  opinionVotes: Map<number, Set<number>>;
  harshestWriterUid?: number;
  voteMsgId?: number;
  joinMsgId?: number;
  statusMsgId?: number;
  startedBy: number;
  chatId: number;
  round: number;
  joinTimer?: ReturnType<typeof setTimeout>;
  joinWarnTimer?: ReturnType<typeof setTimeout>;
  collectTimer?: ReturnType<typeof setTimeout>;
  collectWarnTimer?: ReturnType<typeof setTimeout>;
  voteTimer?: ReturnType<typeof setTimeout>;
}

// ─── Mafia ─────────────────────────────────────────────────────────────────────

export type MafiaRole = "mafia" | "citizen" | "doctor" | "detective";

export interface MafiaPlayer {
  id: number;
  name: string;
  username?: string;
  role: MafiaRole;
  alive: boolean;
}

export interface MafiaState {
  type: "mafia";
  phase: "joining" | "coordinating" | "discussing" | "voting" | "done";
  players: Map<number, MafiaPlayer>;
  round: number;
  startedBy: number;
  chatId: number;
  // Mafia secret kill (coordinating phase)
  mafiaKillVotes: Map<number, number>;   // mafia voter id → chosen victim id
  mafiaKillTarget?: number;              // resolved kill target (majority vote)
  // Per-round special actions
  doctorChoice?: number;
  detectiveChoice?: number;
  actionsCompleted: Set<"mafia" | "doctor" | "detective">;
  doctorLastSelfProtectRound?: number;
  // Discussion ready-to-vote
  discussReady: Set<number>;
  discussMsgId?: number;
  // Voting
  dayVotes: Map<number, number>;
  dayVoteMsgId?: number;
  joinMsgId?: number;
  joinTimer?: ReturnType<typeof setTimeout>;
  joinWarnTimer?: ReturnType<typeof setTimeout>;
  coordTimer?: ReturnType<typeof setTimeout>;
  coordWarnTimer?: ReturnType<typeof setTimeout>;
  discussTimer?: ReturnType<typeof setTimeout>;
  discussWarnTimer?: ReturnType<typeof setTimeout>;
  voteTimer?: ReturnType<typeof setTimeout>;
  voteWarnTimer?: ReturnType<typeof setTimeout>;
}

// ─── Outsider ──────────────────────────────────────────────────────────────────

export interface OutsiderPlayer {
  id: number;
  username?: string;
  firstName: string;
  lastName: string;
}

export interface OutsiderState {
  type: "outsider";
  phase: "selecting" | "joining" | "hinting" | "voting" | "guessing" | "done";
  players: Map<number, OutsiderPlayer>;
  outsiderId: number | null;
  topic: string | null;
  category: string | null;
  votes: Map<number, number>;
  hostId: number;
  selectedCategories: Set<string>;
  wordChoices?: string[];
  outsiderCaught?: boolean;
  voteMsgId?: number;
  joinMsgId?: number;
  joinTimer?: ReturnType<typeof setTimeout>;
  joinWarnTimer?: ReturnType<typeof setTimeout>;
  hintTimer?: ReturnType<typeof setTimeout>;
  hintWarnTimer?: ReturnType<typeof setTimeout>;
  voteTimer?: ReturnType<typeof setTimeout>;
  voteWarnTimer?: ReturnType<typeof setTimeout>;
  guessTimer?: ReturnType<typeof setTimeout>;
}

// ─── Circle (الدائرة القاتلة) ──────────────────────────────────────────────────

export interface CirclePlayer {
  id: number;
  username?: string;
  firstName: string;
  lastName: string;
}

export interface CircleChallenge {
  kind: "math" | "starts" | "no_letter" | "race";
  text: string;
  expectedNum?: number;
  letter?: string;
  timerSec: number;
}

export interface CircleState {
  type: "circle";
  phase: "joining" | "playing" | "done";
  players: Map<number, CirclePlayer>;
  eliminated: CirclePlayer[];
  hostId: number;
  round: number;
  challenge: CircleChallenge | null;
  responses: Map<number, { text: string; timestamp: number }>;
  usedChallenges: Set<string>;
  doubleElim: boolean;
  challengeMsgId?: number;
  joinMsgId?: number;
  joinTimer?: ReturnType<typeof setTimeout>;
  joinWarnTimer?: ReturnType<typeof setTimeout>;
  challengeTimer?: ReturnType<typeof setTimeout>;
}

// ─── Bomb (القنبلة المتنقلة) ────────────────────────────────────────────────

export interface BombPlayer {
  id: number;
  username?: string;
  firstName: string;
  lastName: string;
}

export interface BombState {
  type: "bomb";
  phase: "joining" | "playing" | "done";
  players: Map<number, BombPlayer>;
  eliminated: BombPlayer[];
  hostId: number;
  round: number;
  holderId: number;
  prevHolderId: number | null;
  frozenId: number | null;
  bombMsgId?: number;
  joinMsgId?: number;
  joinTimer?: ReturnType<typeof setTimeout>;
  joinWarnTimer?: ReturnType<typeof setTimeout>;
  bombTimer?: ReturnType<typeof setTimeout>;
}

// ─── Stopwatch (سلك الموت الموقوت) ────────────────────────────────────────────

export interface StopwatchPlayer {
  id:          number;
  username?:   string;
  firstName:   string;
  lastName:    string;
  pressedAt?:  number;  // server timestamp when pressed (ms)
  remaining?:  number;  // ms remaining when pressed; <=0 means exploded
}

export interface StopwatchState {
  type:               "stopwatch";
  phase:              "joining" | "countdown" | "done";
  hostId:             number;
  players:            Map<number, StopwatchPlayer>;
  startTime:          number;
  durationMs:         number;
  mainMsgId?:         number;
  countdownInterval?: ReturnType<typeof setInterval>;
  bombTimer?:         ReturnType<typeof setTimeout>;
  joinMsgId?:         number;
}

// ─── UNO ──────────────────────────────────────────────────────────────────────

export interface UnoCard {
  color: "red" | "blue" | "green" | "yellow" | "wild";
  value: "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"|"skip"|"reverse"|"+2"|"wild"|"+4";
}

export interface UnoPlayer {
  id:        number;
  username?: string;
  firstName: string;
  lastName:  string;
  hand:      UnoCard[];
  dmChatId?: number;   // private chat ID with bot (registered via /start)
  dmMsgId?:  number;   // hand-message ID in DM
}

export interface UnoState {
  type:                "uno";
  phase:               "joining" | "playing" | "done";
  hostId:              number;
  players:             UnoPlayer[];
  deck:                UnoCard[];
  discard:             UnoCard[];
  currentIdx:          number;
  direction:           1 | -1;
  currentColor:        UnoCard["color"];
  drawPending:         number;
  hasDrawn:            boolean;
  colorChoosing:       boolean;
  unoCallerId?:        number;
  unoChallengeTimer?:  ReturnType<typeof setTimeout>;
  groupPhotoMsgId?:    number;  // the ONE persistent photo in group
  joinMsgId?:          number;
  turnTimer?:          ReturnType<typeof setTimeout>;
  botUsername:         string;
  round:               number;
}

export type GameState = MenVsMenState | TrustBreakState | MafiaState | OutsiderState | CircleState | BombState | StopwatchState | UnoState;

export const gameStates = new Map<number, GameState>();
export const privateUserToGame = new Map<number, number>();
export const victimUserToGame = new Map<number, number>();

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export interface LeaderEntry {
  name: string;
  wins: number;
  games: number;
}
export const chatLeaderboard = new Map<number, Map<string, LeaderEntry>>();

// ─── Persistence ───────────────────────────────────────────────────────────────

const LEADERBOARD_FILE = path.join(process.cwd(), "leaderboard.json");

function _save(): void {
  try {
    const data: Record<string, Record<string, LeaderEntry>> = {};
    for (const [chatId, board] of chatLeaderboard)
      data[String(chatId)] = Object.fromEntries(board);
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch { /* silent — non-critical */ }
}

export function loadLeaderboard(): void {
  try {
    if (!fs.existsSync(LEADERBOARD_FILE)) return;
    const raw = fs.readFileSync(LEADERBOARD_FILE, "utf8");
    const data = JSON.parse(raw) as Record<string, Record<string, LeaderEntry>>;
    for (const [chatId, board] of Object.entries(data)) {
      const m = new Map<string, LeaderEntry>();
      for (const [k, v] of Object.entries(board)) m.set(k, v);
      chatLeaderboard.set(Number(chatId), m);
    }
  } catch { /* first run or corrupt file — start fresh */ }
}

export function recordWin(chatId: number, winner: Player | MafiaPlayer): void {
  if (!chatLeaderboard.has(chatId)) chatLeaderboard.set(chatId, new Map());
  const board = chatLeaderboard.get(chatId)!;
  const key = winner.username ?? String(winner.id);
  const entry = board.get(key) ?? { name: dn(winner), wins: 0, games: 0 };
  entry.wins++;
  entry.games++;
  entry.name = dn(winner);
  board.set(key, entry);
  _save();
}

export function recordGame(chatId: number, players: (Player | MafiaPlayer)[]): void {
  if (!chatLeaderboard.has(chatId)) chatLeaderboard.set(chatId, new Map());
  const board = chatLeaderboard.get(chatId)!;
  for (const p of players) {
    const key = p.username ?? String(p.id);
    const entry = board.get(key) ?? { name: dn(p), wins: 0, games: 0 };
    entry.games++;
    entry.name = dn(p);
    board.set(key, entry);
  }
  _save();
}

// ─── Pending Setup ────────────────────────────────────────────────────────────

export interface PendingSetup {
  chatId: number;
  game: "menvsmen" | "trustbreak";
  promptMsgId: number;
}
export const pendingSetup = new Map<number, PendingSetup>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function dn(p: { username?: string; name: string }): string {
  return p.username ? `@${p.username}` : p.name;
}

export function esc(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function bar(v: number, total: number, len = 14): string {
  if (total === 0) return "▱".repeat(len);
  const f = Math.round((v / total) * len);
  return "▰".repeat(f) + "▱".repeat(len - f);
}

export function isVictim(victim: Player, fromId: number, fromUsername?: string): boolean {
  if (victim.id !== 0) return fromId === victim.id;
  if (victim.username && fromUsername)
    return victim.username.toLowerCase() === fromUsername.toLowerCase();
  return false;
}

export function resolveVictimId(victim: Player, fromId: number, fromUsername?: string): boolean {
  if (victim.id === 0 && fromId !== 0 && fromUsername && victim.username) {
    if (victim.username.toLowerCase() === fromUsername.toLowerCase()) {
      victim.id = fromId;
      return true;
    }
  }
  return false;
}

export function clearGame(chatId: number): void {
  const s = gameStates.get(chatId);
  if (!s) return;

  if (s.type === "menvsmen") {
    [s.argTimer, s.warnTimer, s.warnTimer2, s.voteTimer, s.voteWarnTimer].forEach(
      (t) => t && clearTimeout(t)
    );
  } else if (s.type === "trustbreak") {
    [s.joinTimer, s.joinWarnTimer, s.collectTimer, s.collectWarnTimer, s.voteTimer].forEach(
      (t) => t && clearTimeout(t)
    );
    for (const uid of s.participants.keys()) privateUserToGame.delete(uid);
    if (s.victim.id !== 0) victimUserToGame.delete(s.victim.id);
  } else if (s.type === "mafia") {
    [
      s.joinTimer, s.joinWarnTimer,
      s.coordTimer, s.coordWarnTimer,
      s.discussTimer, s.discussWarnTimer,
      s.voteTimer, s.voteWarnTimer,
    ].forEach((t) => t && clearTimeout(t));
    for (const uid of s.players.keys()) privateUserToGame.delete(uid);
  } else if (s.type === "outsider") {
    [
      s.joinTimer, s.joinWarnTimer,
      s.hintTimer, s.hintWarnTimer,
      s.voteTimer, s.voteWarnTimer,
      s.guessTimer,
    ].forEach((t) => t && clearTimeout(t));
    for (const uid of s.players.keys()) privateUserToGame.delete(uid);
  } else if (s.type === "circle") {
    [s.joinTimer, s.joinWarnTimer, s.challengeTimer].forEach((t) => t && clearTimeout(t));
    for (const uid of s.players.keys()) privateUserToGame.delete(uid);
  } else if (s.type === "bomb") {
    [s.joinTimer, s.joinWarnTimer, s.bombTimer].forEach((t) => t && clearTimeout(t));
    for (const uid of s.players.keys()) privateUserToGame.delete(uid);
  } else if (s.type === "stopwatch") {
    if (s.countdownInterval) clearInterval(s.countdownInterval);
    if (s.bombTimer)          clearTimeout(s.bombTimer);
  } else if (s.type === "uno") {
    if (s.turnTimer)          clearTimeout(s.turnTimer);
    if (s.unoChallengeTimer)  clearTimeout(s.unoChallengeTimer);
  }

  gameStates.delete(chatId);
}
