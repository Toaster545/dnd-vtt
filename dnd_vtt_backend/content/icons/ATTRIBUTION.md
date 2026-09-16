# Icon attribution

This directory contains a curated subset (weapons, armor, potions, jewelry, containers, and other
adventuring gear) of the icon set published at [game-icons.net](https://game-icons.net/), used as
optional item images a DM can pick from instead of uploading their own (see `manifest.json`, and
`ItemCardPrintComponent`/the item form's icon picker on the frontend).

Icons are licensed [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) by their original
authors — Lorc, Delapouite, and the other contributors listed in `manifest.json`'s `author` field
per icon (sourced from the [game-icons/icons](https://github.com/game-icons/icons) repository's
`license.txt`). Each SVG has been stripped of its default black background square and recolored
to a neutral dark gray so it can be composited onto item cards; the icon artwork itself is
unmodified.

Regenerate or re-curate the set from a fresh clone of `game-icons/icons` using the selection
keywords and transform in this PR's history — there is no in-repo importer script for this one.
