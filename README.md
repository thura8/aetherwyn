# Aetherwyn

A local-multiplayer wizard duel game. The big screen is the arena; each player's phone is their wand.

**Current step:** the animated title screen — 3D world, menu, lobby, join screen and training — running inside Next.js.

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

## Project layout

```text
src/
  app/
    layout.tsx            root HTML layout, self-hosted fonts
    page.tsx              entry point; renders the canvas and every screen, then starts the experience
    loading.tsx           first-paint loading screen (route Suspense fallback)
    globals.css           Tailwind imports, theme tokens, shared component classes
  components/             screen markup, the shared button, the loading screen and its styles
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
```

React renders the markup and its props never change. The code in `src/experience` then updates those elements directly by `id`, so keep the screen components stateless, and keep ids and state class names (such as `.out` or `.bump`) in sync with that code.

The world layout comes from one seeded random sequence, so reordering the builders in `createWorld.ts` changes how the world looks.

## Styling

Layout and typography use Tailwind utilities in the components. Anything with pseudo-elements, keyframes or classes toggled by `src/experience` stays as CSS in `@layer components`. Palette and fonts are defined in `@theme` in `globals.css`. Preflight is left out on purpose, because the UI is tuned against browser default styles.

## Quality settings

Phones and slower laptops get a lighter render automatically. Add `#quality-high` or `#quality-low` to the URL to force one.

## Notes

- The lobby's room code and the "Add test wizard" seats are local placeholders until the game server exists.
- Fonts (Cinzel Decorative, Cinzel, Cormorant Garamond) come from `@fontsource` packages, so nothing loads from a third-party CDN.
