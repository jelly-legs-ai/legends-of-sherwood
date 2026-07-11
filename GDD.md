# Legends of Sherwood — Game Design Document

An isometric, browser-playable MMORPG set in the legendary Robin Hood era (12th–14th century England),
centred on Sherwood Forest. One persistent world, one channel, designed for large concurrent player
counts through server-side interest management. An integrated reward token — **$Shilling** — is earned
through play and spent on player trade and PvP wagers.

---

## 1. Research: Curse of Aros (what we learned and borrowed)

Curse of Aros (curseofaros.com, wiki: curseofaros.wiki) is a mobile, top-down 2D pixel MMORPG.
Key findings from the game site, wiki and reviews:

| Curse of Aros mechanic | What we do with it |
|---|---|
| One big shared world; all players visible; no lobbies | Same. Single channel; scalability via area-of-interest (AOI) streaming, not sharding |
| Simple hold-to-attack combat, AoE melee, kiting matters | We keep combat readable, but add three styles (melee/ranged/magic) and unlockable abilities |
| Loot drops to the ground; 30 s owner-lock, then 30 s shared, then despawn | Adopted verbatim — it's a great social/economy loop |
| Gold drops automatically from kills | Copper coins auto-loot; **$Shilling is never auto-loot** — it appears as a distinct rare ground drop |
| Skills split: gathering (Mining, Woodcutting, Fishing) + artisan (Smithing, Crafting, Cooking, Alchemy, Spellbinding); exponential XP table; max level 120 | We use the fuller 25-skill RuneScape-style catalogue (below), max level **99**, classic exponential XP curve |
| Equipment tiers gated by level (Mythan → Cobalt → Deadrock → Spectral → Golemite → Umbral → Ancient) | Era-appropriate tier ladder per combat style (see §6) |
| Starter town (Brightleaf) + "kill bats east of town" onboarding + Task Board | Tutorial village of **Loxley** with a guided quest chain from Robin Hood himself + a Task Board |
| High-risk PvP zone (Wasteland) holds the best drops | **The Wild Lands** (far north) — PvP-enabled, best shilling rates, killer loots victim |
| 210+ monsters across 24 areas; bosses (Bryomera, Phantom Fiend…) | Region-themed bestiary with a boss per region + dungeon bosses |
| Seasonal events | Scheduled world events (Sheriff's Convoy, Golden Stag…) that pay $Shilling |
| No pay-to-win; economy is player trade | Same philosophy: $Shilling is earned in-game only, never sold by the game |

## 2. Fantasy & setting

You are an outlaw of Sherwood in the age of legends. Nottingham's Sheriff taxes the poor; Robin Hood's
band resists from the greenwood. Steel, longbows and old druidic magic coexist. The world map is a
stylised England:

| Region | Biome | Level band | Notes |
|---|---|---|---|
| Robin Hood's Bay | Coastline, beaches, harbour town | 1–15 | Fishing hub, docks, smugglers |
| Barnsdale Meadows | Meadowlands | 1–20 | Farms, windmills, boars and bandits |
| Loxley Village | Forest edge hamlet | 1–10 | **Tutorial start**, Robin Hood's camp |
| Sherwood Forest | Broadleaf forest | 10–40 | The heart of the game; outlaw camps, Major Oak |
| Nottingham | Walled city + castle | — | Grand Exchange, Colosseum, bank, guilds; castle is a boss lair |
| The Fenwold | Swamp / fen | 25–50 | Leeches, bog wraiths, herblore swamps |
| Elderglade Wildwood | Overgrown "jungle" tangle | 35–60 | Ancient druid ruins, serpents, panthers |
| The Grey Peaks | Mountains | 40–70 | Mining heartland, trolls, eyries |
| Northmoor | Moor → taiga, colder as you go north | 55–80 | Ice wolves, brigand forts |
| Frosthollow | Alpine town | — | Northern hub, alpine market |
| The Wild Lands | Frozen wilderness | 70+ | **PvP enabled**, best token rates, revenant knights |

The map is a huge seeded, procedurally-detailed tile world (region layout authored, detail generated),
rendered isometrically. Environmental features signal the region: sand/surf, wildflower meadows,
oak canopy, murky water, vines, scree and snow that thickens northward.

## 3. The $Shilling token

$Shilling is the game's scarce reward token, maintained on a server-side double-entry ledger with a
full audit trail. A mirror ERC-20 contract (`contracts/Shilling.sol`) is included for a future
custodial bridge; nothing is deployed on-chain in this build. Copper coins remain the inflationary
"trash" currency from mob kills; $Shilling is the scarce, player-owned reward asset.

**Emission (how players earn it):**
1. **Very rare mob drops** — every mob has a small shilling chance, scaling with mob level; a distinct golden drop on the ground.
2. **Boss drops** — every boss kill pays a guaranteed shilling bounty to all contributors, plus a rare jackpot.
3. **Dungeon rewards** — completing a dungeon floor pays by depth; deeper floors pay more.
4. **World events** — participation payouts (Sheriff's Convoy, Golden Stag hunt, Archery Tournament…).
5. **Skill milestones** — every skill pays at levels **5, 10, 20, 25, 50, 75 and 99**, gradually increasing; level 99 pays a generous lump sum for the dedication (see `shared/constants.js` for the exact schedule).

**Circulation (what it's for):**
- **Colosseum wagers** — stake matched $Shilling on 1v1 duels in Nottingham's Colosseum; winner takes the pot (small arena rake burns tokens).
- **Grand Exchange** — the player-to-player item market is denominated in $Shilling (listing fee burned as a sink).
- Wilderness PvP — victims drop carried (unbanked) shillings.

## 4. Skills — all 25, all to level 99

Classic exponential XP curve (level 99 = 13,034,431 XP). Every skill has: a tutor NPC, a quest,
interactable nodes/recipes/targets across the level range, equipment or unlocks, and milestone
token payouts. Combat: Attack, Strength, Defence, Constitution, Ranged, Magic, Prayer, Summoning.
Gathering: Mining, Fishing, Woodcutting, Farming, Hunter, Archaeology. Artisan: Smithing, Cooking,
Crafting, Firemaking, Fletching, Runecrafting, Herblore, Construction. Support: Agility, Thieving,
Dungeoneering. (Full per-skill content tables live in `shared/data/skills.js`.)

## 5. Combat

Three styles with full animation coverage (LPC animation set: walk, slash, thrust, shoot, spellcast, hurt/death):
- **Melee** (Attack = accuracy, Strength = max hit, slash/thrust animations by weapon type)
- **Ranged** (bows/thrown; shoot animation + arrow projectile FX; ammo consumed)
- **Magic** (spellbook of era-flavoured druidic/holy spells; spellcast animation + projectile & impact FX; runes consumed)

Defence reduces incoming accuracy/damage, Constitution gives life points, Prayer gives toggleable
buffs that drain prayer points, Summoning brings familiars that fight and forage. Abilities unlock
along each combat skill. Mobs aggro by level/region; death drops carried items at a gravestone
(safe zones exempt); the Wild Lands transfers loot to the killer.

## 6. Equipment & paperdolls

Every visible slot (head, torso, legs, feet, hands, weapon, shield/quiver) changes the character
sprite via LPC layer compositing — gear is genuinely visible, and because all layers share the same
frame grid, animation continuity is preserved across walk/attack/cast/gather actions.

Tier ladders (level 1→99 spread):
- Melee metal: **Copper → Bronze → Iron → Steel → Damasked → Silversteel → Greenwood-tempered**
- Ranged: **Shortbow → Ash → Yew → Elm warbow → Sherwood longbow** + leather/studded/ranger armour
- Magic: **Novice robes → Friar's vestments → Druidic regalia → Archdruid** + staves/wands

## 7. Multiplayer architecture (large counts, one channel)

- Authoritative Node.js server, fixed 10 Hz simulation tick.
- **Spatial hash grid + AOI**: each client only receives entities within ~1.5 screens; delta
  snapshots (enter/update/leave) rather than world broadcasts → network cost scales with local
  density, not world population.
- Client-side interpolation (100 ms buffer) for smooth remote movement.
- All actions validated server-side (range, level, materials, cooldowns, rate limits).
- Persistence to disk (JSON snapshot + periodic autosave).
- Path to further scale documented in README (worker threads per region, Redis pub/sub) — but the
  design goal is one visible, shared channel.

## 8. Systems checklist

- [x] Tutorial quest chain (Loxley) covering movement, melee, ranged, magic, gathering, cooking, banking
- [x] Quests with dialogue trees and rewards; Task Board repeatables
- [x] Grand Exchange order matching (buy/sell offers, $Shilling denominated)
- [x] Colosseum wager duels (challenge → stake → arena teleport → winner takes pot)
- [x] Dungeoneering: seeded floors, keys, floor bosses, depth-scaled token rewards
- [x] World events on a schedule with server-wide announcements
- [x] Wilderness PvP with skull/risk rules
- [x] Ground-loot with owner timers (CoA-style 30 s / 30 s / despawn)
- [x] Chat (local/global), examine, emotes
- [x] Day/night tint; region weather flavour (snow particles up north)
