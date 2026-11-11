# Aetherwyn

A local-multiplayer wizard duel game. The big screen is the arena; each player's phone is their wand.

**Current step:** the animated title screen — 3D world, menu, lobby and join screen — running inside Next.js, plus the phone controller at `/join` that players reach by scanning the lobby's QR code. Players pick a wizard, then practise Fire and Shield by voice and motion while the big screen shows each wizard casting.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript 6 (strict)
- [Tailwind CSS 4](https://tailwindcss.com), without Preflight
- [three.js](https://threejs.org) for 3D
- pnpm for packages
- ESLint 9

## Getting started

You need Node.js 20.9 or newer and pnpm.

```bash
# install pnpm if you don't have it
npm install -g pnpm

# install dependencies
pnpm install

# start the dev server
pnpm dev
```

Then open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm start` | Run the production build |
| `pnpm lint` | Check the code with ESLint |
| `pnpm typecheck` | Check types with TypeScript |
| `pnpm dev:secure` | Start over HTTPS on your network, for playing on real phones (see below) |
| `pnpm voice-model` | Put the on-device voice model (~40 MB) in `public/models` |

## Playing on real phones

Phones only allow the motion sensor and the microphone on secure (`https://`) pages, so casting needs `pnpm dev:secure` instead of `pnpm dev`:

1. Stop `pnpm dev` if it's running (they use the same port).
2. Run `pnpm dev:secure`. The first run creates a small certificate authority in `.certs/` (git-ignored) with `openssl`, and fetches the voice model once.
3. **Trust the certificate on each phone, once:** open the printed `http://<your-ip>:3080` page on the phone and download the certificate.
   - **iPhone:** tap *Allow*, then *Settings › General › VPN & Device Management* and install the profile. Then *Settings › General › About › Certificate Trust Settings* and turn on "Aetherwyn Local Development CA".
   - **Android:** *Settings › Security › More security › Encryption & credentials › Install a certificate › CA certificate*, and pick the downloaded file.
4. On the computer, open `https://<your-ip>:3000` (trust `.certs/aetherwyn-ca.crt` in Keychain Access, or accept the warning once), open the lobby and scan the QR code.

If the network changes, run `pnpm dev:secure` again: it issues a new certificate, and the phones' trust carries over.

## Casting spells

Hold the circle on the phone, **shout the spell's word and do its move**, then let go. The word picks the spell; doing that spell's own move gives full power. Training practises two spells for now:

| Spell | Shout | Move |
|---|---|---|
| Flame Burst | "Fire!" | **Raise:** lift the phone up, like raising a torch |
| Mystic Shield | "Shield!" | **Shake:** shake the phone two or three times |

- **Motion:** `src/phone/casting/motion/classifyMove.ts`, adapted from the game's classifier, which was tuned on real iPhone recordings.
- **Voice:** each phone first uses its own speech recognition. If that returns no words (some iPhones), the phone switches to an on-device model (Vosk, about 40 MB, downloaded once and cached). If neither works, casts come from the move alone and are weak.
- Without a motion sensor (a laptop, or a page that isn't `https`), the phone shows *Raise* and *Shake* buttons to hold instead.

## Project layout

```text
src/
  app/
    layout.tsx            root HTML layout, self-hosted fonts
    page.tsx              entry point; renders the canvas and every screen, then starts the experience
    loading.tsx           first-paint loading screen (route Suspense fallback)
    globals.css           Tailwind imports, theme tokens, shared component classes
    join/page.tsx         the phone controller that the lobby's QR code opens
    api/rooms/[code]/     the room relay: PUT/DELETE a room, POST actions, GET Server-Sent Events
  components/             screen markup, the shared button, the loading screen, sky and sigil
  experience/
    startExperience.ts    wires everything up and returns a stop function
    experienceContext.ts  shared state and services, plus the element lookup helper
    frameLoop.ts          per-frame loop
    lifecycle.ts          tracks listeners and timers so they can all be released
    device.ts             device capabilities and quality tier
    adaptiveQuality.ts    adjusts render quality to the frame rate
    loadingOverlay.ts     drives the loading screen's progress, tips and reveal
    cameraDirector.ts     camera shots and transitions
    soundEngine.ts        synthesised sound and music
    keyboardAndGamepad.ts keyboard and gamepad input
    menuFeedback.ts       menu hover, press and ripple feedback
    screens/              screen navigation, lobby, join form, training
    world/                the three.js world; createWorld.ts builds it in order
  phone/
    PhoneApp.tsx          picks the scene (arrival, join, lobby…) from the room's state
    components/           phone scenes and their parts
    session/              RoomSession: remoteRoom.ts (the relay) and simulatedRoom.ts (bots, for ?stage= and ?demo)
    casting/              motion and microphone access, cast judging
    content.ts            wizards and spells as the phone shows them
    phone.css             phone styles (ph- prefix), loaded only by /join
  server/roomStore.ts     in-memory rooms behind the relay
  shared/relay.ts         the relay's wire format and shared limits (room code alphabet, name length)
```

React renders the markup and its props never change. The code in `src/experience` then updates those elements directly by `id`, so keep the screen components stateless, and keep ids and state class names (such as `.out` or `.bump`) in sync with that code.

The world layout comes from one seeded random sequence, so reordering the builders in `createWorld.ts` changes how the world looks.

The phone controller (`src/phone`) has no 3D engine, so it is ordinary React with state: screens re-render from the room snapshot that its `RoomSession` provides.

## Styling

Layout and typography use Tailwind utilities in the components. Anything with pseudo-elements, keyframes or classes toggled by `src/experience` stays as CSS in `@layer components`. Palette and fonts are defined in `@theme` in `globals.css`. Preflight is left out on purpose, because the UI is tuned against browser default styles.

## Quality settings

Phones and slower laptops get a lighter render automatically. Add `#quality-high` or `#quality-low` to the URL to force one.

## Notes

- Phones and the big screen share a room through the relay in `src/server/roomStore.ts`. It lives in the dev server's memory: one process, and rooms are gone when the server restarts. In the lobby, a phone that drops off is shown as "Wand lost" and its seat is freed after 15 seconds.
- To play from real phones, open the big screen at your computer's network address (for example `http://192.168.1.20:3000`), not `localhost`, so the QR code points somewhere the phones can reach.
- Fonts (Cinzel Decorative, Cinzel, Cormorant Garamond) come from `@fontsource` packages, so nothing loads from a third-party CDN.
