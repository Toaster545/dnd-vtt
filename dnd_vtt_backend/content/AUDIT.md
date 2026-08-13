# SRD content audit status

Tracks whether `content/` actually stays within SRD 5.2 (CC-BY-4.0) scope, ahead of selling
access to this app. Not a substitute for a real legal review before launch — see NOTICE.md.

## Method

WotC's SRD 5.2 PDF (https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
couldn't be parsed directly in this pass (no `poppler-utils`/PDF text tooling available in this
environment, no root to install it). Verification instead used cross-referencing against
independent SRD mirrors/summaries and general knowledge of the 2024 ruleset. That's a reasonable
spot-check, not a verbatim comparison against the primary source — treat "verified" below as
"plausible, not confirmed," and get a real pass once PDF tooling (or the official text) is
available.

## Classes & subclasses (12 classes, 48 subclasses)

Every class's subclass roster (e.g. Barbarian: Berserker/Wild Heart/World Tree/Zealot; Fighter:
Champion/Battle Master/Eldritch Knight/Psi Warrior) matches the full official 2024 Player's
Handbook lineup exactly — 4 per class, no extras, no omissions. Strong signal this content set was
deliberately scoped to the SRD 5.2 release (which was expanded specifically to cover full core
class content), not partially copied from a splatbook. Not independently verified line-by-line.

## Monsters (35 entries)

Cross-referenced against SRD monster/NPC appendix mirrors (dnd5e.info, covering the 2014-lineage
SRD, which has historically been a superset of later SRD monster scope). 33 of 35 names matched
directly (Aboleth, Bandit, Bandit Captain, Brown Bear, Chuul, Cult Fanatic, Dire Wolf, Ghoul,
Giant Rat, Giant Scorpion, Giant Spider, Gnoll, Goblin*, Harpy, Hill Giant, Hobgoblin*, Kobold,
Mimic, Ogre, Orc, Owlbear, Rust Monster, Skeleton, Stirge, Troll, Wolf, Worg, Zombie — `*` some as
2024-specific variants like "Goblin Boss"/"Goblin Warrior" not independently confirmed under those
exact names, but the base creature is SRD).

**Flagged: `Nothic`** — not found in any SRD monster/NPC list checked. Nothic originates from a
non-SRD sourcebook (Volo's Guide to Monsters). **Remove or re-license this entry before selling
access**, unless a direct check of the actual SRD 5.2 monster appendix confirms it was added in
5.2 (unverified either way in this pass).

## Not yet audited

- **391 spells**, **93 items**, **77 feats**, **16 backgrounds**, **10 races** — not checked
  against the primary source in this pass. Spell/item/feat names are lower individual risk (game
  mechanics/rules text is less likely to be someone's exclusive IP than a named creature), but this
  is still an assumption, not a finding. Do a full pass once the actual SRD 5.2 text is available —
  either install `poppler-utils` locally so it can be read directly, or pull an authoritative
  content index another way.
