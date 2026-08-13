# Spell content attribution

This directory contains the 391 spells listed in the 2024 _Player's Handbook_, plus supplemental
spells required by supported classes. Each spell's `source` object identifies its book.

Rules text is included only where the spell is available in the **System Reference Document 5.2.1**. SRD 5.2.1 is copyright Wizards of the Coast LLC and is used under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).

- Official source: [System Reference Document 5.2.1](https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf)
- Structured SRD transcription used by the importer: [srd-5.2-spells.json](https://gist.github.com/dmcb/4b67869f962e3adaa3d0f7e5ca8f4912)
- PHB catalog and access metadata used by the importer: 5eTools `spells-xphb.json` and `gendata-spell-source-lookup.json`

The source material was converted to the repository's JSON schema, indexed, and supplemented with PHB'24-only access metadata. Spells not released in SRD 5.2.1 contain a PHB page reference but do not reproduce proprietary rules text.

Regenerate the catalog from `dnd_vtt_backend` with:

```text
node scripts/import-phb-2024-spells.mjs <spells-xphb.json> <srd-5.2-spells.json> <spell-source-lookup.json>
```
