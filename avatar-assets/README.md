# Avatar asset packs

Custom avatar artwork is compiled at build time; players and DMs cannot upload executable SVG.

1. Copy `packs/custom-template`, choose an immutable lowercase pack ID, and set a common `viewBox`.
2. Add categories and parts to `catalog.json`. A part ID must remain stable after release. Declare selection limits, display labels, conflicts/occupied slots, randomization weights, and license/source metadata.
3. Export each part as an SVG with one or more top-level layer groups, for example:

   ```svg
   <svg viewBox="0 0 980 980" xmlns="http://www.w3.org/2000/svg">
     <g data-avatar-layer="face">
       <path data-avatar-color="skin" d="..." />
     </g>
   </svg>
   ```

   Supported layers, in render order, are `hairBack`, `face`, `tattoos`, `details`, `eyes`,
   `eyebrows`, `nose`, `mouth`, `facialHair`, `hairFront`, `piercings`, `accessories`, and
   `foreground`. Every `data-avatar-color` value must be declared in `colorSlots`.

4. Run `npm run avatars:build` from `dnd_vtt_frontend`. The regular watch/development/production
   builds run the compiler automatically.
5. Preview every combination at small token and large editor sizes before setting `enabled: true`.

The template already includes empty `ears`, `horns`, `scars`, and `tattoos` categories. To add
art, place an SVG in that pack and append one stable part entry to the matching category:

```json
{
  "id": "small-curved",
  "label": "Small Curved",
  "file": "horns/small-curved.svg",
  "weight": 1
}
```

Optional categories may stay empty while a pack is in development. Once an enabled pack is
complete, the editor discovers it automatically and exposes the style selector.

The compiler accepts a conservative SVG subset. It rejects scripts, event attributes, styles,
external/data URLs, animation, `foreignObject`, unsafe paths, malformed XML, undeclared color/layer
names, duplicate IDs, and files larger than 200 KB. Internal SVG IDs are namespaced per asset.
