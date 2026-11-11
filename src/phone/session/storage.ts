/** The seat this browser tab holds, so a reload can rejoin it. Per tab, like the game's session store. */

const SESSION_KEY = "aetherwyn:phone-session";

export interface StoredSession {
  code: string;
  name: string;
  /** Set by the relay; the simulated room rejoins by name instead. */
  seatId?: string;
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof value.code === "string" && typeof value.name === "string")
      return {
        code: value.code,
        name: value.name,
        seatId: typeof value.seatId === "string" ? value.seatId : undefined,
      };
  } catch {
    /* storage blocked or corrupt */
  }
  return null;
}

export function storeSession(session: StoredSession | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage blocked */
  }
}

/** What to offer after a seat was freed while the phone was away: the name and wizard to take back. */
export interface RejoinHint {
  code: string;
  name: string;
  wizard: string | null;
}

const REJOIN_KEY = "aetherwyn:phone-rejoin";

export function readRejoinHint(): RejoinHint | null {
  try {
    const raw = sessionStorage.getItem(REJOIN_KEY);
    return raw ? (JSON.parse(raw) as RejoinHint) : null;
  } catch {
    return null;
  }
}

export function storeRejoinHint(hint: RejoinHint | null) {
  try {
    if (hint) sessionStorage.setItem(REJOIN_KEY, JSON.stringify(hint));
    else sessionStorage.removeItem(REJOIN_KEY);
  } catch {
    /* storage blocked */
  }
}
