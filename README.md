# 🏹 Legends of Sherwood

An isometric, browser-playable MMORPG set in the legendary Robin Hood era (12th–14th century England),
centred on Sherwood Forest — with an integrated reward token, **$Shilling**, earned entirely through play.

Inspired by the one-shared-world, drop-to-ground, no-pay-to-win design of **Curse of Aros**
(see the research write-up in [`GDD.md`](GDD.md)), scaled up to a 25-skill RuneScape-style catalogue,
three combat styles, a huge seeded world, and a live token economy.

![Loxley village](data/shot.png)

## Run it

```bash
npm install      # installs `ws`
npm start        # serves the client + WebSocket world on http://localhost:8123
```

Open **http://localhost:8123**, pick a name, customise your outlaw, and enter Sherwood.
Robin Hood is waiting in Loxley (look for the ❗) to walk you through the tutorial.

## Controls

- **Click** to walk / interact / attack; **right-click** for a context menu.
- **WASD / arrows** to steer; hold **Shift** to walk instead of run.
- **1–9** fire unlocked combat abilities. **Enter** to chat.
- Side panel tabs: inventory, equipment, 25 skills, quests, prayers, spellbook, crafting.

## What's in it

- **One shared channel** with server-side **area-of-interest streaming** (spatial-hash grid + delta
  snapshots), so network cost scales with local density, not world population.
- **25 skills to level 99** — Attack, Strength, Defence, Constitution, Ranged, Magic, Prayer, Summoning,
  Mining, Fishing, Woodcutting, Farming, Hunter, Archaeology, Smithing, Cooking, Crafting, Firemaking,
  Fletching, Runecrafting, Herblore, Construction, Agility, Thieving, Dungeoneering. Each has a tutor,
  a quest, trainable nodes/recipes across the whole range, and gear or unlocks.
- **Three combat styles** — melee (slash/thrust), ranged (arrow projectiles, ammo), magic (spellbook,
  runes) — all fully animated via the free **LPC** animation set (walk / slash / thrust / shoot /
  spellcast / hurt).
- **Visible gear**: every equipment slot recomposites the character sprite (LPC paperdoll), and because
  all layers share the same frame grid, animation flow stays continuous across every action.
- **A huge seeded world** (576×576) of distinct regions: beaches & coastal towns, meadowlands, Sherwood
  Forest, walled Nottingham, swamp fens, jungle wildwood, the Grey Peaks, the cold Northmoor, the alpine
  town of Frosthollow, and the PvP **Wild Lands** to the frozen north.
- **The $Shilling economy** — a scarce reward token earned from very-rare mob drops, boss bounties,
  dungeon clears, world events, and **skill milestones** (levels 5/10/20/25/50/75/**99**), and spent on
  the **Grand Exchange** (player market) and **Colosseum** wager-duels. See [`TOKENOMICS.md`](TOKENOMICS.md)
  and the mirror ERC-20 in [`contracts/Shilling.sol`](contracts/Shilling.sol).
- Quests with dialogue and rewards, a repeatable Task Board, banking, player houses (Construction),
  familiars (Summoning), prayers, abilities, seeded dungeons, and scheduled world events.

## Project layout

```
shared/           # game data + rules imported by BOTH server and client (one source of truth)
  constants.js    #   XP curve, milestone schedule, combat math, tiles, protocol
  mapgen.js       #   deterministic world/dungeon generation (never crosses the network)
  data/           #   items, skills, mobs, npcs, quests, world layout
server/           # authoritative Node.js + ws world
  index.js        #   static host + WebSocket gateway
  game/           #   world tick & AOI, combat, player, economy, message handlers, persistence
client/           # isometric browser client (vanilla JS + canvas)
  js/             #   renderer, LPC sprite compositor, FX, UI, networking, main loop
  assets/lpc/     #   free LPC spritesheets (CC-BY-SA 3.0 / GPL 3.0 — see CREDITS.md)
contracts/        # Shilling.sol — ERC-20 mirror of the off-chain ledger (not deployed)
tools/            # build-assets.mjs — resolves the LPC sheets we use into a flat manifest
data/             # runtime persistence (players.json, ledger.json) — created on first run
```

## Attribution & licence

Character, gear and weapon sprites are from the **Universal LPC Spritesheet** collection, licensed
**CC-BY-SA 3.0 / GPL 3.0** — full artist credits in [`CREDITS.md`](CREDITS.md) and
`client/assets/lpc/CREDITS.csv`. All terrain, monsters, FX, UI and game code are original work,
MIT-licensed.

The $Shilling token is an in-game reward on a custodial off-chain ledger; nothing is deployed on-chain
and the game never sells tokens.
