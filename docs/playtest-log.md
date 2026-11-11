# Playtest log

Running notes on what went wrong while testing the phone controller (`/join`) and what to try next.
Newest entries first. Add one per session: what you did, what happened, what we think caused it, what to try.

## Automatic cast log

In development, every cast and cancelled hold on a phone is appended to `logs/playtest.jsonl`
(one JSON line each: time, phone user agent, move, sensor measurements, what was heard, voice on/off,
verdict). The file is git-ignored; copy the lines you care about into an entry below.
Code: `src/app/api/log/route.ts`, `src/phone/casting/playtestLog.ts`. Production builds log nothing.

## 2026-11-11: voice detection paused

**Tried:** hold the rune circle, shout a spell word, swing, release (practice scene).

**What happened:** the phone kept saying "This phone can't hear, so casts stay weak." Every cast was weak
even with the right swing.

**Cause:**
- Voice detection was switched off (commented out in `useHoldToCast.ts`, `WandSetup.tsx`, `PracticeScene.tsx`)
  because the speech engines were not returning words reliably.
- With no listener, `judgeCast` took the "voice off" path, which by design capped every cast at weak.
  So pausing voice made the game feel broken instead of just swing-only.

**Fix applied:** `VOICE_PAUSED` in `src/phone/casting/judge.ts`. While it is `true`, a clear move
(raise = Fire, shake = Shield) alone is a full-power cast.

**To bring voice back:**
1. Uncomment the blocks marked "VOICE PAUSED" / "Voice detection paused" in the three files above.
2. Set `VOICE_PAUSED = false` in `judge.ts`.

**Open questions / ideas to make it better:**
- Which engine failed, and how? Check on a real phone: browser speech (Web Speech API) returned empty
  transcripts; Vosk (on-device, `npm run voice-model` downloads the model) needs HTTPS (`npm run dev:secure`)
  and ~40 MB first load. Record per phone: model, browser, engine, transcript heard.
- Mic permission can be granted while the recogniser still returns nothing (common on iOS Safari).
  Consider a "say anything" mic test that shows the raw transcript on screen.
- Fallback idea: swing-only casting stays the default, voice becomes a bonus (extra power) rather than a requirement.
- Consider tuning swing thresholds (`motion/classifyMove.ts`) now that the swing is the only input.

## Template

```
## YYYY-MM-DD: short title
**Device / browser:**
**Tried:**
**What happened:**
**Cause (known or guessed):**
**Fix / next step:**
```
