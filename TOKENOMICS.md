# $Shilling ($SHL) — Token Economy

$Shilling is the scarce reward asset of Legends of Sherwood. Copper coins are the
inflationary trash currency mobs rain on everyone; **$Shillings must be earned**.

## How it works in this build

The live game runs a **custodial off-chain ledger** (`server/game/economy.js` →
`data/ledger.json`) with a double-entry audit log of every mint, burn and
transfer with reasons. `contracts/Shilling.sol` is the ERC-20 mirror (21m hard
cap, treasury mint/burn with event reasons) intended for a future bridge that
replays the ledger on-chain and lets players withdraw to self-custody wallets.
Nothing is deployed by this repo, no real funds are involved, and the game
never sells tokens — every $SHL in existence was earned by play.

## Emission (faucets)

| Source | Mechanic | Tuning knob (`shared/constants.js`) |
|---|---|---|
| Very rare mob drops | Every kill rolls `BASE × (1 + lvl/12) × mobMult × zone`; drops as a golden ground pickup | `SHILLING.MOB_DROP_CHANCE_BASE` (1/900) |
| Boss bounties | Guaranteed payout to every ≥5%-damage contributor; 1-in-50 jackpot | `BOSS_BOUNTY_BASE`, `BOSS_JACKPOT` |
| Dungeon clears | Floor clear pays `2 + floor × 1.5`, deeper = richer | `DUNGEON.tokenReward` |
| World events | Sheriff's Convoy strongbox, Golden Stag blessing, Archery Contest | `EVENT_PAYOUT_BASE` |
| Skill milestones | Levels **5, 10, 20, 25, 50, 75, 99** in *every* skill pay 1/2/4/6/18/45/**250** — 25 skills × 326 = 8,150 $SHL lifetime per dedicated account | `MILESTONE_SHILLINGS` |
| Quests & tasks | One-time quest rewards; repeatable task-board stipends | `quests.js` |
| Rare fishing pull | 1/4000 catches glints | `handlers.js` |

The **Wild Lands** (PvP) multiply mob drop rates ×2 — but earnings there land in
your **pouch**, not your balance, and your killer takes the pouch. Bank it by
leaving the wilderness or visiting a bank.

## Circulation & sinks

- **Colosseum wagers** — matched stakes, winner takes the pot; **5% rake is burned**.
- **Grand Exchange** — the player market is denominated in $SHL; **1% listing fee
  is burned** on sell offers. Buy offers escrow $SHL until filled.
- **PvP loot** — killed in the Wild Lands, your pouch transfers to your killer.

## Design goals

1. **No pay-to-win** (Curse of Aros philosophy): tokens flow from play only.
2. **Sinks scale with velocity**: the more players trade and duel, the more burns.
3. **The 99 grind is the flagship faucet**: 250 $SHL honors the ~13M XP wall.
4. **Auditability**: every ledger row carries a reason string
   (`milestone:fishing:99`, `boss:frost_giant`, `duel:won:Name`, `ge:fee`…).
