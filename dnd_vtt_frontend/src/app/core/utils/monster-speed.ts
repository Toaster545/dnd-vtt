import { DndMonster } from '../services/content.service';

const MODES = ['walk', 'burrow', 'climb', 'fly', 'swim'] as const;

// "30 ft., Fly 60 ft. (hover)" — the 2024 stat block format. `speed_desc` wins when present
// because it carries qualifiers ("40 ft. (wolf form only)") the numeric fields can't.
export function monsterSpeedText(monster: Pick<DndMonster, 'speed' | 'speed_desc'>): string {
  if (monster.speed_desc) return monster.speed_desc;
  const { speed } = monster;
  return MODES.filter(mode => speed[mode] != null)
    .map(mode => {
      const label = mode === 'walk' ? '' : `${mode[0].toUpperCase()}${mode.slice(1)} `;
      const hover = mode === 'fly' && speed.hover ? ' (hover)' : '';
      return `${label}${speed[mode]} ft.${hover}`;
    })
    .join(', ');
}
