import {
  SPELLS,
  WIZARDS,
  spellById,
  type SpellId,
  type WizardId,
} from "@/phone/content";
import { judgeCast } from "@/phone/casting/judge";
import type {
  BattleState,
  CastAttempt,
  CastVerdict,
  Combatant,
  ConnectionState,
  JoinError,
  Phase,
  RoomSession,
  RoomSnapshot,
  Seat,
  TurnReport,
} from "@/phone/session/types";
import { readStoredSession, storeSession } from "@/phone/session/storage";
import { ROOM_CODE_PATTERN } from "@/shared/relay";

/*
 * A stand-in for the game server, so the phone can be played and reviewed on its own.
 * Bots fill the other seats and a pretend host starts training, then a battle, once everyone is ready.
 * Swap it for a socket-backed RoomSession when the server lands; screens only see RoomSession.
 */

export type DemoStage =
  | "lobby"
  | "ready"
  | "training"
  | "summary"
  | "battle"
  | "target"
  | "results"
  | "host-away"
  | "closed"
  | "kicked";

export const DEMO_STAGES: readonly DemoStage[] = [
  "lobby",
  "ready",
  "training",
  "summary",
  "battle",
  "target",
  "results",
  "host-away",
  "closed",
  "kicked",
];

const BOT_NAMES = ["Orin", "Sela", "Bram"];
const TRAINING_SPELLS = 4;
const TIMING = {
  join: 900,
  hostStarts: 3200,
  trainingPrompt: 2200,
  trainingCast: 9000,
  trainingResult: 2600,
  summary: 7000,
  roundIntro: 2600,
  battleCast: 15000,
  resolving: 2200,
  roundOver: 3600,
  matchOver: 14000,
} as const;

const FULL_HP = 100;
const FULL_MANA = 100;
const MANA_PER_TURN = 15;

const pick = <T>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)];

export function createSimulatedRoom({
  demoStage = null,
}: { demoStage?: DemoStage | null } = {}): RoomSession {
  let snapshot: RoomSnapshot | null = null;
  let connection: ConnectionState = "idle";
  const listeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let castOpenedAt = 0;

  const emit = () => listeners.forEach((listener) => listener());
  const after = (ms: number, run: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    timers.add(timer);
  };
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers.clear();
  };

  const update = (change: (room: RoomSnapshot) => RoomSnapshot) => {
    if (!snapshot) return;
    snapshot = change(snapshot);
    emit();
  };
  const setPhase = (phase: Phase) => update((room) => ({ ...room, phase }));
  const updateSeat = (id: string, change: Partial<Seat>) =>
    update((room) => ({
      ...room,
      seats: room.seats.map((seat) =>
        seat.id === id ? { ...seat, ...change } : seat,
      ),
    }));
  const you = () =>
    snapshot!.seats.find((seat) => seat.id === snapshot!.youId)!;
  const freeWizards = () =>
    WIZARDS.filter(
      (wizard) => !snapshot!.seats.some((seat) => seat.wizard === wizard.id),
    );

  /* ---------- lobby ---------- */

  function seatBots() {
    const takenFirst: WizardId = pick(["mage", "guardian", "scholar"] as const);
    update((room) => ({
      ...room,
      seats: [
        ...room.seats,
        {
          id: "bot-0",
          name: BOT_NAMES[0],
          wizard: takenFirst,
          ready: true,
          connected: true,
        },
        {
          id: "bot-1",
          name: BOT_NAMES[1],
          wizard: null,
          ready: false,
          connected: true,
        },
      ],
    }));
    after(4200, () => {
      if (snapshot?.phase.kind !== "lobby") return;
      const choice =
        freeWizards().find((wizard) => wizard.id !== "mystic") ??
        freeWizards()[0];
      if (choice) updateSeat("bot-1", { wizard: choice.id });
      after(1800, () => {
        updateSeat("bot-1", { ready: true });
        maybeStart();
      });
    });
  }

  function maybeStart() {
    if (!snapshot || snapshot.phase.kind !== "lobby") return;
    const everyoneReady = snapshot.seats.every(
      (seat) => seat.ready && seat.wizard,
    );
    if (!everyoneReady) return;
    after(TIMING.hostStarts, () => {
      if (
        snapshot?.phase.kind === "lobby" &&
        snapshot.seats.every((seat) => seat.ready)
      )
        startTraining();
    });
  }

  function backToLobby() {
    clearTimers();
    update((room) => ({
      ...room,
      phase: { kind: "lobby" },
      seats: room.seats.map((seat) => ({
        ...seat,
        ready: seat.id !== room.youId,
      })),
    }));
  }

  /* ---------- training ---------- */

  const trainingOrder = () =>
    SPELLS.slice(0, TRAINING_SPELLS).map((spell) => spell.id);

  function startTraining(index = 0, score = 0) {
    const spells = trainingOrder();
    if (index >= spells.length) {
      const summary: Record<string, number> = {};
      snapshot!.seats.forEach((seat) => {
        summary[seat.id] =
          seat.id === snapshot!.youId
            ? score
            : 120 + Math.round(Math.random() * 260);
      });
      setPhase({
        kind: "training",
        summary,
        round: {
          spell: spells[spells.length - 1],
          index: spells.length - 1,
          count: spells.length,
          stage: "result",
          endsAt: Date.now(),
          result: null,
          score,
        },
      });
      after(TIMING.summary, startBattle);
      return;
    }
    const spell = spells[index];
    setPhase({
      kind: "training",
      summary: null,
      round: {
        spell,
        index,
        count: spells.length,
        stage: "prompt",
        endsAt: Date.now() + TIMING.trainingPrompt,
        result: null,
        score,
      },
    });
    after(TIMING.trainingPrompt, () => {
      castOpenedAt = Date.now();
      updateTraining({
        stage: "casting",
        endsAt: Date.now() + TIMING.trainingCast,
      });
      after(TIMING.trainingCast, () => {
        const phase = snapshot?.phase;
        if (phase?.kind !== "training" || phase.round.stage !== "casting")
          return;
        updateTraining({
          stage: "result",
          endsAt: Date.now() + TIMING.trainingResult,
          result: {
            spell: null,
            power: "none",
            reason: "Time's up",
            correct: false,
            reactionMs: TIMING.trainingCast,
            points: 0,
          },
        });
        after(TIMING.trainingResult, () => startTraining(index + 1, score));
      });
    });
  }

  function updateTraining(
    change: Partial<Extract<Phase, { kind: "training" }>["round"]>,
  ) {
    update((room) =>
      room.phase.kind === "training"
        ? {
            ...room,
            phase: { ...room.phase, round: { ...room.phase.round, ...change } },
          }
        : room,
    );
  }

  function castInTraining(attempt: CastAttempt): CastVerdict {
    const phase = snapshot!.phase;
    if (phase.kind !== "training" || phase.round.stage !== "casting")
      return judgeCast(attempt);
    const verdict = judgeCast(attempt);
    if (verdict.power === "none") return verdict;
    const correct = verdict.spell === phase.round.spell;
    const reactionMs = Date.now() - castOpenedAt;
    const speedBonus = Math.max(
      0,
      Math.round((TIMING.trainingCast - reactionMs) / 60),
    );
    const points = correct
      ? (verdict.power === "full" ? 100 : 50) + speedBonus
      : 0;
    const score = phase.round.score + points;
    clearTimers();
    updateTraining({
      stage: "result",
      endsAt: Date.now() + TIMING.trainingResult,
      result: { ...verdict, correct, reactionMs, points },
      score,
    });
    after(TIMING.trainingResult, () =>
      startTraining(phase.round.index + 1, score),
    );
    return verdict;
  }

  /* ---------- battle ---------- */

  function freshCombatants(): Combatant[] {
    return snapshot!.seats
      .filter((seat) => seat.wizard)
      .map((seat) => ({
        seatId: seat.id,
        hp: FULL_HP,
        mana: FULL_MANA,
        cooldowns: {},
        shielded: false,
        bound: false,
        out: false,
      }));
  }

  function startBattle() {
    const wins: Record<string, number> = {};
    snapshot!.seats.forEach((seat) => (wins[seat.id] = 0));
    startRound({ round: 1, wins });
  }

  function startRound({
    round,
    wins,
  }: {
    round: number;
    wins: Record<string, number>;
  }) {
    const battle: BattleState = {
      stage: "round-intro",
      round,
      turn: 1,
      bestOf: 3,
      endsAt: Date.now() + TIMING.roundIntro,
      combatants: freshCombatants(),
      wins,
      target: null,
      lastTurn: null,
      roundWinner: null,
      matchWinner: null,
    };
    setPhase({ kind: "battle", battle });
    after(TIMING.roundIntro, openCasting);
  }

  const battle = () =>
    (snapshot!.phase as Extract<Phase, { kind: "battle" }>).battle;
  const setBattle = (change: Partial<BattleState>) =>
    update((room) =>
      room.phase.kind === "battle"
        ? {
            ...room,
            phase: {
              kind: "battle",
              battle: { ...room.phase.battle, ...change },
            },
          }
        : room,
    );

  const opponentsOf = (seatId: string, combatants: Combatant[]) =>
    combatants.filter((c) => c.seatId !== seatId && !c.out);

  function openCasting() {
    const state = battle();
    const opponents = opponentsOf(snapshot!.youId, state.combatants);
    castOpenedAt = Date.now();
    setBattle({
      stage: "casting",
      endsAt: Date.now() + TIMING.battleCast,
      target: opponents.length === 1 ? opponents[0].seatId : null,
    });
    const youAreOut = state.combatants.find(
      (c) => c.seatId === snapshot!.youId,
    )?.out;
    after(youAreOut ? 2600 : TIMING.battleCast, () => {
      if (battle().stage === "casting") resolveTurn(null);
    });
  }

  function castInBattle(attempt: CastAttempt): CastVerdict {
    const state = battle();
    const verdict = judgeCast(attempt);
    if (state.stage !== "casting" || verdict.power === "none" || !verdict.spell)
      return verdict;
    const me = state.combatants.find((c) => c.seatId === snapshot!.youId)!;
    const spell = spellById(verdict.spell);
    if ((me.cooldowns[spell.id] ?? 0) > 0)
      return {
        spell: spell.id,
        power: "none",
        reason: `${spell.name} is still recharging`,
      };
    if (me.mana < spell.manaCost)
      return {
        spell: spell.id,
        power: "none",
        reason: `Not enough mana for ${spell.name}`,
      };
    clearTimers();
    setBattle({ stage: "locked" });
    after(1100, () => resolveTurn(verdict));
    return verdict;
  }

  function resolveTurn(yours: CastVerdict | null) {
    const state = battle();
    const youId = snapshot!.youId;
    const nameOf = (id: string) =>
      snapshot!.seats.find((s) => s.id === id)?.name ?? "Someone";
    const combatants = state.combatants.map((c) => ({
      ...c,
      cooldowns: Object.fromEntries(
        Object.entries(c.cooldowns).map(([id, turns]) => [
          id,
          Math.max(0, (turns ?? 0) - 1),
        ]),
      ) as Combatant["cooldowns"],
      shielded: false,
    }));
    const byId = new Map(combatants.map((c) => [c.seatId, c]));
    const report: TurnReport = {
      yourSpell: yours,
      dealt: 0,
      taken: 0,
      events: [],
    };

    const casts: {
      caster: string;
      spell: SpellId;
      full: boolean;
      target: string | null;
    }[] = [];
    if (yours?.spell && yours.power !== "none")
      casts.push({
        caster: youId,
        spell: yours.spell,
        full: yours.power === "full",
        target: state.target,
      });
    combatants
      .filter((c) => c.seatId !== youId && !c.out && !c.bound)
      .forEach((bot) => {
        const usable = SPELLS.filter(
          (s) => (bot.cooldowns[s.id] ?? 0) === 0 && bot.mana >= s.manaCost,
        );
        if (!usable.length || Math.random() < 0.15) return;
        const spell = pick(usable);
        const targets = opponentsOf(bot.seatId, combatants);
        casts.push({
          caster: bot.seatId,
          spell: spell.id,
          full: Math.random() < 0.6,
          target: targets.length ? pick(targets).seatId : null,
        });
      });
    combatants.forEach((c) => (c.bound = false));

    for (const cast of casts) {
      const caster = byId.get(cast.caster)!;
      const spell = spellById(cast.spell);
      caster.mana -= spell.manaCost;
      caster.cooldowns[spell.id] = spell.cooldownTurns;
      if (spell.id === "mystic-shield") caster.shielded = true;
    }
    const countered = new Set(
      casts.filter((c) => c.spell === "disarming-pulse").map((c) => c.caster),
    );
    for (const cast of casts) {
      const spell = spellById(cast.spell);
      if (spell.damage === 0) continue;
      const victims =
        spell.target === "all-opponents"
          ? opponentsOf(cast.caster, combatants).map((c) => c.seatId)
          : cast.target
            ? [cast.target]
            : [];
      for (const victimId of victims) {
        const victim = byId.get(victimId);
        if (!victim || victim.out) continue;
        if (countered.has(victimId) && cast.caster !== victimId) {
          if (cast.caster === youId)
            report.events.push(
              `${nameOf(victimId)} cancelled your ${spell.name}`,
            );
          if (victimId === youId)
            report.events.push(
              `You cancelled ${nameOf(cast.caster)}'s ${spell.name}`,
            );
          continue;
        }
        let damage = spell.damage * (cast.full ? 1 : 0.5);
        if (victim.shielded) damage *= 0.3;
        damage = Math.round(damage);
        victim.hp = Math.max(0, victim.hp - damage);
        if (spell.id === "frost-bind") victim.bound = true;
        if (cast.caster === youId) report.dealt += damage;
        if (victimId === youId) {
          report.taken += damage;
          report.events.push(
            `${nameOf(cast.caster)}'s ${spell.name} hit you for ${damage}`,
          );
        }
      }
    }
    combatants.forEach((c) => {
      c.mana = Math.min(FULL_MANA, c.mana + MANA_PER_TURN);
      if (c.hp <= 0) c.out = true;
    });

    setBattle({
      stage: "resolving",
      combatants,
      lastTurn: report,
      endsAt: Date.now() + TIMING.resolving,
    });
    after(TIMING.resolving, () => {
      const standing = combatants.filter((c) => !c.out);
      if (standing.length > 1) {
        setBattle({ turn: state.turn + 1 });
        openCasting();
        return;
      }
      endRound(standing[0]?.seatId ?? null);
    });
  }

  function endRound(winner: string | null) {
    const state = battle();
    const wins = { ...state.wins };
    if (winner) wins[winner] = (wins[winner] ?? 0) + 1;
    const needed = Math.ceil(state.bestOf / 2);
    const champion =
      Object.entries(wins).find(([, count]) => count >= needed)?.[0] ?? null;
    setBattle({
      stage: "round-over",
      roundWinner: winner,
      wins,
      endsAt: Date.now() + TIMING.roundOver,
    });
    after(TIMING.roundOver, () => {
      if (champion || state.round >= state.bestOf) {
        const best =
          champion ??
          Object.entries(wins).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          null;
        setBattle({
          stage: "match-over",
          matchWinner: best,
          endsAt: Date.now() + TIMING.matchOver,
        });
        after(TIMING.matchOver, backToLobby);
        return;
      }
      startRound({ round: state.round + 1, wins });
    });
  }

  /* ---------- demo jumps, for review ---------- */

  function jumpTo(stage: DemoStage) {
    const me = you();
    if (!me.wizard) {
      const free =
        freeWizards().find((w) => w.id === "mystic") ?? freeWizards()[0];
      updateSeat(me.id, { wizard: free.id });
    }
    const bot1 = snapshot!.seats.find((s) => s.id === "bot-1");
    if (bot1 && !bot1.wizard)
      updateSeat("bot-1", { wizard: freeWizards()[0].id, ready: true });
    switch (stage) {
      case "lobby":
        updateSeat(me.id, { wizard: null });
        break;
      case "ready":
        updateSeat(me.id, { ready: true });
        break;
      case "training":
        startTraining();
        break;
      case "summary":
        startTraining(TRAINING_SPELLS, 340);
        clearTimers();
        break;
      case "battle":
      case "target":
        startRound({ round: 1, wins: {} });
        clearTimers();
        openCasting();
        clearTimers();
        if (stage === "battle") {
          const opponents = opponentsOf(me.id, battle().combatants);
          setBattle({ target: opponents[0].seatId });
        }
        break;
      case "results": {
        startBattle();
        clearTimers();
        const wins: Record<string, number> = {
          [me.id]: 2,
          "bot-0": 1,
          "bot-1": 0,
        };
        setBattle({ stage: "match-over", wins, matchWinner: me.id, round: 3 });
        break;
      }
      case "host-away":
        update((room) => ({ ...room, hostPresent: false }));
        break;
      case "closed":
        setPhase({ kind: "closed", reason: "host-closed" });
        break;
      case "kicked":
        setPhase({ kind: "closed", reason: "kicked" });
        break;
    }
  }

  /* ---------- session API ---------- */

  return {
    getSnapshot: () => snapshot,
    getConnection: () => connection,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    join(code, name) {
      const trimmed = name.trim();
      code = code.trim().toUpperCase();
      if (!ROOM_CODE_PATTERN.test(code))
        return Promise.resolve<JoinError>("bad-code");
      if (!trimmed) return Promise.resolve<JoinError>("no-name");
      connection =
        readStoredSession()?.code === code ? "reconnecting" : "connecting";
      emit();
      return new Promise((resolve) => {
        after(TIMING.join, () => {
          if (
            BOT_NAMES.some((bot) => bot.toLowerCase() === trimmed.toLowerCase())
          ) {
            connection = "idle";
            emit();
            resolve("name-taken");
            return;
          }
          connection = "online";
          snapshot = {
            code,
            youId: "you",
            hostPresent: true,
            phase: { kind: "lobby" },
            seats: [
              {
                id: "you",
                name: trimmed,
                wizard: null,
                ready: false,
                connected: true,
              },
            ],
          };
          storeSession({ code, name: trimmed });
          emit();
          seatBots();
          if (demoStage) jumpTo(demoStage);
          resolve(null);
        });
      });
    },
    selectWizard(wizard) {
      if (!snapshot || snapshot.phase.kind !== "lobby") return;
      if (
        snapshot.seats.some(
          (seat) => seat.wizard === wizard && seat.id !== snapshot!.youId,
        )
      )
        return;
      updateSeat(snapshot.youId, { wizard, ready: false });
    },
    setReady(ready) {
      if (!snapshot || !you().wizard) return;
      updateSeat(snapshot.youId, { ready });
      if (ready) maybeStart();
    },
    chooseTarget(seatId) {
      if (snapshot?.phase.kind === "battle") setBattle({ target: seatId });
    },
    cast(attempt) {
      const phase = snapshot?.phase;
      if (phase?.kind === "training") return castInTraining(attempt);
      if (phase?.kind === "battle") return castInBattle(attempt);
      return judgeCast(attempt);
    },
    async resume() {
      const stored = readStoredSession();
      if (!stored) return false;
      return (await this.join(stored.code, stored.name)) === null;
    },
    getNotice: () => null,
    getRejoinName: () => null,
    leave() {
      clearTimers();
      storeSession(null);
      snapshot = null;
      connection = "idle";
      emit();
    },
    dispose() {
      clearTimers();
      listeners.clear();
    },
  };
}
