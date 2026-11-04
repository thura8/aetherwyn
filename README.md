# Aetherwyn

A local-multiplayer wizard duel game. The big screen is the arena; each player's phone is their wand.

**Current step:** the animated title screen — 3D world, menu, lobby, join screen and training — running inside Next.js.

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + React 19
- TypeScript 6 (strict)
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
    layout.tsx        root HTML layout, self-hosted fonts
    page.tsx          title screen page
    globals.css       colour palette and title screen styles
  components/
    TitleScene.tsx    mounts the title screen markup and starts/stops the game code
  game/
    menu.js           screens, buttons, sound, keyboard/gamepad, lobby and training logic
    world.js          the three.js world: arena, islands, castles, portal, effects, post-processing
    realism.js        procedural rock, island and stone textures, triplanar material patch
```

The game code in `src/game` is plain JavaScript ported from the prototype. It will get TypeScript types in a later step.

## Quality settings

Phones and slower laptops get a lighter render automatically. Add `#quality-high` or `#quality-low` to the URL to force one.

## Notes

- The lobby's room code and the "Add test wizard" seats are local placeholders until the game server exists.
- Fonts (Cinzel Decorative, Cinzel, Cormorant Garamond) come from `@fontsource` packages, so nothing loads from a third-party CDN.
