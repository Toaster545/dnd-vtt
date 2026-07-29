import Konva from 'konva';
import { MapFog, MapToken, MeasureShape } from '../../../core/models/campaign.model';

export interface TokenRenderContext {
  cellSize: number;
  fog: MapFog;
  isAdmin: boolean;
  activeMeasureTool: MeasureShape | null;
  currentTurnTokenId: string | null;
  characterHp: Record<string, { hp: number; max_hp: number }>;
  // Loaded portrait image per character_id — only present once decoded (see
  // BattleMapComponent.resolvePortraitImages), so a token with a character_id but no entry here
  // just falls back to its plain color fill for this render pass.
  characterPortraits: Record<string, HTMLImageElement>;
  onTokenClick: (token: MapToken) => void;
  onTokenMoved: (token: MapToken, col: number, row: number) => void;
  onTokenContextMenu: (token: MapToken) => void;
}

function hpFor(token: MapToken, ctx: TokenRenderContext): { hp: number; max_hp: number } | null {
  if (token.character_id) return ctx.characterHp[token.character_id] ?? null;
  // Monster hp/max_hp lives directly on the token, but stays hidden from players — standard
  // hide-the-enemy's-exact-HP table convention, unlike character HP which is party-visible.
  if (ctx.isAdmin && token.hp != null && token.max_hp != null) return { hp: token.hp, max_hp: token.max_hp };
  return null;
}

function hpLabelColor(hp: number, maxHp: number): string {
  if (!maxHp) return '#ede9df';
  const pct = (hp / maxHp) * 100;
  if (pct <= 25) return '#e05252';
  if (pct <= 50) return '#eab308';
  return '#4caf82';
}

export function renderTokens(layer: Konva.Layer, tokens: MapToken[], ctx: TokenRenderContext) {
  layer.destroyChildren();
  const cellSize = ctx.cellSize;
  const hiddenCells = new Set(ctx.fog.hidden_cells);
  // Monster/NPC tokens (never player-controlled ones — the whole party always sees each other)
  // sitting entirely on hidden cells stay invisible to non-admin viewers. Mirrors hpFor()'s
  // existing admin-only branching just below.
  const hiddenByFog = (token: MapToken) => {
    if (ctx.isAdmin || !ctx.fog.enabled || token.is_player) return false;
    for (let dx = 0; dx < token.size; dx++) {
      for (let dy = 0; dy < token.size; dy++) {
        if (!hiddenCells.has(`${token.x + dx},${token.y + dy}`)) return false;
      }
    }
    return true;
  };
  for (const token of tokens) {
    if (hiddenByFog(token)) continue;
    const r = (cellSize * token.size) / 2;
    const cx = token.x * cellSize + r;
    const cy = token.y * cellSize + r;
    const label = token.label.substring(0, 3).toUpperCase();
    const labelFontSize = r * 0.7;
    // Character HP is party-visible (anyone with data for it in `characterHp`, players
    // included); monster HP stays DM-only intel — see hpFor.
    const hp = hpFor(token, ctx);
    const portrait = token.character_id ? ctx.characterPortraits[token.character_id] : undefined;

    // One Konva.Shape drawing the token's circle, label, and HP badge itself, instead of a
    // Group with up to 4 child shapes (Circle/Text/Rect/Text) — same rationale as drawGrid:
    // every extra Konva Shape is another hit-color assignment at construction time, and that
    // gets expensive on canvas-farbling browsers (Firefox/Safari private-browsing windows in
    // particular default to it even when the regular window doesn't).
    const shape = new Konva.Shape({
      x: cx,
      y: cy,
      draggable: ctx.isAdmin && !ctx.activeMeasureTool,
      // Never actually rendered (sceneFunc paints the real look manually) — just needs to be
      // truthy so Konva's hasFill() considers this shape fillable, which fillStrokeShape() in
      // hitFunc below requires before it will paint anything to the hit canvas at all.
      fill: '#000',
      // Konva can only reuse sceneFunc for hit-testing automatically when it draws via its own
      // fillStrokeShape()/context helpers — ours paints with raw context.fillStyle/fill() calls
      // (needed for the label/HP badge), which Konva has no way to intercept, so the hit canvas
      // ends up with the shape's real visual colors instead of its assigned lookup color and
      // hit-testing never resolves to it: clicks and drags silently fall through to the map
      // image underneath. This explicit hitFunc — using fillStrokeShape(), which Konva *does*
      // swap the color on — gives it a real (if simplified, circle-only) clickable region.
      hitFunc: (context, hitShape) => {
        context.beginPath();
        context.arc(0, 0, r - 3, 0, Math.PI * 2);
        context.closePath();
        context.fillStrokeShape(hitShape);
      },
      sceneFunc: context => {
        context.beginPath();
        context.arc(0, 0, r - 3, 0, Math.PI * 2);
        context.closePath();
        if (portrait) {
          // Clip the portrait to the same circle the plain color fill would otherwise use, then
          // stroke a ring in the token's own color (in place of the plain-fill fallback's white
          // ring) so it stays identifiable at a glance even with a face now filling the token.
          context.save();
          context.clip();
          const d = (r - 3) * 2;
          context.drawImage(portrait, -(r - 3), -(r - 3), d, d);
          context.restore();
        } else {
          context.fillStyle = token.color;
          context.fill();
        }
        context.lineWidth = portrait ? 3 : 2;
        context.strokeStyle = portrait ? token.color : '#fff';
        context.stroke();

        if (token.id === ctx.currentTurnTokenId) {
          context.beginPath();
          context.arc(0, 0, r + 2, 0, Math.PI * 2);
          context.lineWidth = 3;
          context.strokeStyle = '#f5d67a';
          context.stroke();
        }

        // The label is redundant once a portrait is shown (and would just clutter the face) —
        // skipped there, but still drawn for monsters/players whose portrait hasn't loaded yet.
        if (!portrait) {
          context.font = `${labelFontSize}px Arial`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillStyle = '#fff';
          context.fillText(label, 0, 0);
        }

        if (hp) {
          const text = `${hp.hp}/${hp.max_hp}`;
          const fontSize = Math.max(10, Math.min(13, r * 0.4));
          context.font = `bold ${fontSize}px Arial`;
          const padX = 4, padY = 2;
          const labelW = context.measureText(text).width;
          const labelH = fontSize;
          const bgY = -(r + labelH + padY * 2 + 4);
          const rectX = -labelW / 2 - padX;
          const rectW = labelW + padX * 2;
          const rectH = labelH + padY * 2;
          const radius = 3;

          context.beginPath();
          context.moveTo(rectX + radius, bgY);
          context.arcTo(rectX + rectW, bgY, rectX + rectW, bgY + rectH, radius);
          context.arcTo(rectX + rectW, bgY + rectH, rectX, bgY + rectH, radius);
          context.arcTo(rectX, bgY + rectH, rectX, bgY, radius);
          context.arcTo(rectX, bgY, rectX + rectW, bgY, radius);
          context.closePath();
          context.fillStyle = 'rgba(20, 18, 14, 0.75)';
          context.fill();

          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillStyle = hpLabelColor(hp.hp, hp.max_hp);
          context.fillText(text, 0, bgY + rectH / 2);
        }
      },
    });
    // Konva can't infer a bounding box from an arbitrary sceneFunc, so a plain custom Shape
    // reports a zero-size getSelfRect() by default. Left unset, that zero-size box can make
    // hit-testing skip the shape entirely (falling through to the map image beneath it) —
    // clicks silently fail to select the token, and drags never start. This just tells Konva
    // where the shape actually is; it doesn't touch how sceneFunc draws it.
    shape.getSelfRect = () => ({ x: -r, y: -r, width: r * 2, height: r * 2 });

    shape.on('click tap', () => ctx.onTokenClick(token));
    if (ctx.isAdmin) {
      shape.on('dragend', () => {
        const pos = shape.position();
        ctx.onTokenMoved(token, Math.floor(pos.x / cellSize), Math.floor(pos.y / cellSize));
      });
      shape.on('contextmenu', (e) => { e.evt.preventDefault(); ctx.onTokenContextMenu(token); });
    }
    layer.add(shape);
  }
  layer.draw();
}
