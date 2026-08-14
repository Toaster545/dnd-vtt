# SRD content audit status

Tracks whether `content/` actually stays within SRD 5.2.1 (CC-BY-4.0) scope, ahead of selling
access to this app. Not a substitute for a real legal review before launch — see NOTICE.md.

**Bottom line: NOTICE.md's claim that "no ... content outside the SRD 5.2 [is] used" is false.**
This pass verified every category against the primary source text and found real, out-of-license
content in every category — most severely in feats (79% of entries), subclasses, and backgrounds
(75%). The later Artificer addition is itself non-SRD. See "Summary of findings" below.

## Method

Earlier passes couldn't parse WotC's SRD 5.2 PDF directly (no PDF text tooling available, no root
to install `poppler-utils`) and fell back to cross-referencing independent mirrors/summaries — a
spot-check, not a verbatim comparison. **This pass fetched the primary source directly**
(`https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf`, confirmed as "System
Reference Document 5.2.1" in its own legal-information page) and extracted its full text with
`pdf-parse` (installed via `npm install pdf-parse --no-save` in a scratch dir, not added to any
project's `package.json`). Curly quotes/apostrophes and en/em dashes were normalized to ASCII
before matching, since the PDF uses typographic punctuation that broke naive substring search in
an earlier attempt within this same pass. Every finding below is a direct match (or confirmed
non-match) against that extracted text — table-of-contents listings, section headings, and body
text were all cross-checked, not just one or the other. This supersedes and corrects the previous
"plausible, not confirmed" pass, including one previous conclusion that was wrong (subclasses).

## Summary of findings

| Category | Total | In SRD 5.2.1 | Not in SRD 5.2.1 |
|---|---|---|---|
| Classes | 13 | 12 | **1** |
| Subclasses | 53 | 12 | **41** |
| Spells | 392 | 339 | **53** |
| Feats | 77 | 16 | **61** |
| Backgrounds | 16 | 4 | **12** |
| Races/species | 10 | 9 | **1** |
| Items | 94 | 91 | **3** |
| Monsters | 35 | 31 | **4** |

## Classes & subclasses (13 classes, 53 subclasses)

**Post-audit addition:** `classes/artificer.json` implements the 2024-rules Artificer and its five
subclasses from _Eberron: Forge of the Artificer_. Neither the class nor its subclasses are in SRD
5.2.1. The file explicitly records `srd_5_2_1: false`; this adds one non-SRD class and five non-SRD
subclasses to the totals below.

**Previous audit's conclusion here was wrong and is corrected now.** It claimed every class's
4-subclass roster "matches the full official 2024 Player's Handbook lineup exactly" and treated
that as a signal the whole set was properly SRD-scoped. In fact **SRD 5.2.1 only publishes one
subclass per class** — the table of contents lists exactly one subclass under each of the 12
classes (e.g. "Barbarian Subclass: Path of the Berserker", "Wizard Subclass: Evoker"), and a
targeted search of the class body text for the other three subclass names per class (Wild
Heart/World Tree/Zealot, Battle Master/Eldritch Knight/Psi Warrior, etc. — 36 names checked)
returned zero matches for every one of them. The 12 that are actually in the SRD:

| Class | SRD subclass |
|---|---|
| Barbarian | Path of the Berserker |
| Bard | College of Lore |
| Cleric | Life Domain |
| Druid | Circle of the Land |
| Fighter | Champion |
| Monk | Warrior of the Open Hand |
| Paladin | Oath of Devotion |
| Ranger | Hunter |
| Rogue | Thief |
| Sorcerer | Draconic Sorcery |
| Warlock | Fiend Patron |
| Wizard | Evoker |

The other 3 subclasses per class in `content/classes/*.json` (36 total — e.g. Barbarian's Path of
the Wild Heart/World Tree/Zealot, everything under `classes/fighter.json` besides Champion, etc.)
are full 2024 Player's Handbook content **not released under CC-BY-4.0**. This is the largest and
most consequential finding in this audit: it's baked into every class file, so it can't be fixed
by deleting a handful of standalone JSON files — it needs either removing 3 of 4 subclasses per
class, or a real license for the non-SRD ones, before selling access.

The original 12 base classes (Barbarian, Bard, Cleric, Druid, Fighter, Monk, Paladin, Ranger,
Rogue, Sorcerer, Warlock, Wizard) do match the SRD's own "Classes" table of contents exactly.

## Spells (392 entries)

**Post-audit addition:** `spells/homunculus-servant.json` is a reference-only summary from
_Eberron: Forge of the Artificer_, explicitly tagged `srd_5_2_1: false`. The PHB manifest remains
the exact original 391-spell catalog; the Artificer spell is supplemental.

Every spell file already self-tags `source.srd_5_2_1: true/false` and `source.edition: 2024`. This
pass spot-checked that self-tagging against the extracted SRD text and it holds up: e.g. "Toll the
Dead", "Witch Bolt", "Summon Undead", "Thorn Whip", and the Forgotten-Realms-named "Yolande's Regal
Presence"/"Jallarzi's Storm of Radiance" — all tagged `srd_5_2_1: false` — have zero matches in the
SRD text, while "Fireball", "Magic Missile", and "Cure Wounds" — tagged `true` — appear repeatedly.
**Of the 391 PHB spells, 339 are genuinely SRD; the other 52 are 2024 Player's Handbook-exclusive
spells the data already correctly flags as non-SRD** (full list: run `jq -r 'select(.source.srd_5_2_1==false)
| .name' content/spells/*.json`, or see the spell files' own `source` field).

Worth noting for remediation: this flag is currently **inert**. `srd_5_2_1` exists on the DTO/model
(`content.controller.ts`, `content.service.ts`) but nothing filters on it — the 52 flagged spells
are served to the frontend exactly like the other 339. Wiring a filter to this existing field would
be the cheapest fix in the whole audit, since the data already knows which spells are the problem.

## Feats (77 entries)

Checked directly against the SRD's "Feat Descriptions" section (Origin/General/Fighting
Style/Epic Boon), which lists every feat by name. **Only 16 of 77 are actually in the SRD:**

Alert, Archery, Boon of Combat Prowess, Boon of Dimensional Travel, Boon of Fate, Boon of
Irresistible Offense, Boon of Spell Recall, Boon of the Night Spirit, Boon of Truesight, Defense,
Grappler, Great Weapon Fighting, Magic Initiate, Savage Attacker, Skilled, Two-Weapon Fighting.

(The SRD's General category also includes "Ability Score Improvement", which this app models as
the `ability_choice` grant type rather than a standalone feat file, so it doesn't appear as
`content/feats/*.json` — not a gap.)

**The other 61 — the large majority of this category — are 2024 PHB-exclusive and not SRD**,
including well-known feats like Crossbow Expert, Great Weapon Master, Sharpshooter, Lucky, and
Polearm Master. That 61 also includes 6 of the 2024 PHB's 13 Epic Boon feats — the SRD only
publishes 7 of the 13 (Boon of Energy Resistance/Fortitude/Peerless Aim/Recovery/Skill/Speed are
the 6 that aren't in it). Full non-SRD list: Actor, Athlete, Blessed
Warrior, Blind Fighting, Boon of Energy Resistance, Boon of Fortitude, Boon of Peerless Aim, Boon
of Recovery, Boon of Skill, Boon of Speed, Charger, Chef, Crafter, Crossbow Expert, Crusher,
Defensive Duelist, Druidic Warrior, Dual Wielder, Dueling, Durable, Elemental Adept, Fey-Touched,
Great Weapon Master, Healer, Heavily Armored, Heavy Armor Master, Inspiring Leader, Interception,
Keen Mind, Lightly Armored, Lucky, Mage Slayer, Martial Weapon Training, Medium Armor Master,
Moderately Armored, Mounted Combatant, Musician, Observant, Piercer, Poisoner, Polearm Master,
Protection, Resilient, Ritual Caster, Sentinel, Shadow-Touched, Sharpshooter, Shield Master, Skill
Expert, Skulker, Slasher, Speedy, Spell Sniper, Tavern Brawler, Telekinetic, Telepathic, Thrown
Weapon Fighting, Tough, Unarmed Fighting, War Caster, Weapon Master.

## Backgrounds (16 entries)

The SRD's own table of contents lists exactly four backgrounds under "Character Backgrounds":
**Acolyte, Criminal, Sage, Soldier.** The other 12 — Artisan, Charlatan, Entertainer, Farmer,
Guard, Guide, Hermit, Merchant, Noble, Sailor, Scribe, Wayfarer — are 2024 PHB-exclusive and not
in the SRD.

## Races / species (10 entries)

The SRD's "Character Species" section lists exactly nine: Dragonborn, Dwarf, Elf, Gnome, Goliath,
Halfling, Human, Orc, Tiefling — confirmed both in the table of contents and by the absence of
"Aasimar" or any of its named traits (Celestial Resistance, Healing Hands, Light Bearer, Celestial
Revelation) anywhere in the document. **`content/races/aasimar.json` is 2024 PHB-exclusive and not
in the SRD** — notable since Aasimar is otherwise a fairly prominent player-facing race in this
app's content. The other 9 races match the SRD exactly.

## Items (94 entries)

**Post-audit addition:** `items/tinkers-tools.json` makes the Artificer's starting equipment
selectable as a concrete inventory item. Tinker's Tools are present in SRD 5.2.1, so this addition
changes the item total without adding another non-SRD item.

Checked against the SRD's Equipment chapter (weapons, armor, tools, packs, adventuring gear
tables). 90 of 93 matched once curly-apostrophe items (Thieves' Tools, Burglar's Pack, etc., which
an earlier attempt in this same pass missed on a straight-apostrophe search) were re-checked
correctly. **3 are not in the SRD's 2024 equipment list and appear to be 2014-edition holdovers:**

- **`common-clothes.json`** ("Common Clothes") — the SRD's clothing options are only Costume, Fine
  Clothes, and Traveler's Clothes; "Common Clothes" was a 2014 Player's Handbook option, dropped in
  2024.
- **`insignia-of-rank.json`** ("Insignia of Rank") and **`trophy-from-a-fallen-enemy.json`**
  ("Trophy from a Fallen Enemy") — these read like the 2014 Soldier background's starting-equipment
  list ("an insignia of rank," "a trophy taken from a fallen enemy") verbatim; the SRD only uses
  "a rank insignia" as one line of flavor text in the generic trinket table, not as a real,
  separately statted item under either of these names.

One likely false alarm, not a violation: `healing-potion.json` ("Healing Potion") doesn't
text-match because the SRD's own name for this item is "Potion of Healing" — same item, reversed
name. Worth renaming for consistency, not a licensing issue.

## Monsters (35 entries)

Re-checked against the SRD's full "Monsters A-Z" + "Animals" appendix (a much stronger check than
the previous pass's mirror cross-reference — this extracted every creature stat-block header
directly from the primary source, ~280 names). **4 of 35 are not in the SRD:**

- **`nothic.json`** ("Nothic") — as flagged before, confirmed absent; originates from Volo's Guide
  to Monsters, not the SRD.
- **`orc.json`** ("Orc") — the SRD includes Orc only as a playable *species*, not as a monster/NPC
  stat block; no "Orc" creature entry exists in the Monsters A-Z or Animals appendix.
- **`goblin-hexer.json`** ("Goblin Hexer") — the SRD's Goblin variants are only Goblin Minion,
  Goblin Warrior, and Goblin Boss; no "Hexer" variant exists.
- **`hobgoblin-warlord.json`** ("Hobgoblin Warlord") — the SRD's Hobgoblin variants are only
  Hobgoblin Warrior and Hobgoblin Captain; no "Warlord" variant exists.

Two likely false alarms, not violations — same creature, different name: `cult-fanatic.json`
("Cult Fanatic") is the SRD's "Cultist Fanatic"; `gnoll.json` ("Gnoll") is the SRD's "Gnoll
Warrior" (the SRD has no bare "Gnoll" entry, only the Warrior variant). Worth renaming for
consistency, not a licensing issue.

## Recommendation

Given the scale here — 3 of every 4 subclasses, backgrounds, and roughly 4 of every 5 feats are
out of SRD scope — this is not a few stray files to delete before launch; it's most of the
game-content depth players would actually notice missing if trimmed to true SRD scope. Get a real
legal opinion on whether to (a) strip non-SRD content down to the tables above before selling
access, or (b) pursue an actual license for 2024 Player's Handbook content (e.g. a compatibility
license) that covers what's already built. Either way, update NOTICE.md once a direction is
chosen — its current "no content outside the SRD 5.2" claim is not accurate today.
