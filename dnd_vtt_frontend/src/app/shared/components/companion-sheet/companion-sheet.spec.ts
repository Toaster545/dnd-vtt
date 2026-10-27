import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CompanionSheetComponent } from './companion-sheet';
import { CompanionService } from '../../../core/services/companion.service';
import { CharacterService } from '../../../core/services/character.service';
import { Companion, CompanionResponse } from '../../../core/models/companion.model';

describe('CompanionSheetComponent', () => {
  let updates: Subject<CompanionResponse>;
  const response: CompanionResponse = {
    companions: [],
    options: [
      {
        kind: 'primal',
        name: 'Primal Companion',
        source: 'XPHB',
        version: 1,
        forms: ['land', 'sea', 'sky'],
      },
    ],
    context: null,
    slots: [],
    ownerIncapacitated: false,
    arcaneJoltUsed: 0,
  };
  let creates: Record<string, unknown>[];
  beforeEach(() => {
    updates = new Subject();
    creates = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CompanionService,
          useValue: {
            watch: () => updates,
            get: () => Promise.resolve(response),
            create: (_id: string, body: Record<string, unknown>) => {
              creates.push(body);
              return Promise.resolve(response);
            },
          },
        },
        { provide: CharacterService, useValue: {} },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  function render(readonly = false) {
    const fixture = TestBed.createComponent(CompanionSheetComponent);
    fixture.componentRef.setInput('characterId', 'hero');
    fixture.componentRef.setInput('readonly', readonly);
    fixture.detectChanges();
    updates.next(response);
    fixture.detectChanges();
    return fixture;
  }
  function activeCompanion(): Companion {
    return {
      id: 'beast',
      character_id: 'hero',
      kind: 'primal',
      form: 'land',
      name: 'Booboo',
      status: 'active',
      temp_hp: 0,
      damage: 0,
      conditions: [],
      hit_dice_used: 0,
      resource_uses: {},
      revision: 1,
      turn: { started: true, ownerTurn: true },
      stats: {
        name: 'Beast of the Land',
        source: 'XPHB',
        version: 1,
        eligible: true,
        class_level: 3,
        size: 'Medium',
        type: 'Beast',
        alignment: 'Neutral',
        armor_class: 15,
        max_hp: 20,
        current_hp: 20,
        hit_die: 8,
        hit_dice: 3,
        ability_scores: {},
        saving_throws: {},
        check_bonus: 2,
        passive_perception: 14,
        speed: { walk: 40 },
        darkvision: 60,
        languages: '',
        damage_immunities: [],
        condition_immunities: [],
        traits: [],
        actions: [
          {
            key: 'strike',
            name: 'Beast’s Strike',
            activation: 'action',
            description: '',
            attack_bonus: 4,
          },
          { key: 'dodge', name: 'Dodge', activation: 'action', description: '', basic: true },
          {
            key: 'opportunity',
            name: 'Opportunity Attack',
            activation: 'reaction',
            description: '',
          },
        ],
        command: {
          timing: 'owner_turn',
          defaultAction: 'dodge',
          replaceAttack: true,
          exceptionalTraining: false,
        },
      },
    };
  }
  it('permits independent attacks but disables both command costs when the owner is incapacitated', () => {
    const fixture = render();
    updates.next({ ...response, companions: [activeCompanion()], ownerIncapacitated: true });
    fixture.detectChanges();
    const buttons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    expect(buttons.find((b) => b.textContent?.trim() === 'Roll attack')?.disabled).toBe(false);
    const commands = buttons.filter((b) => b.textContent?.includes('Command ·'));
    expect(commands).toHaveLength(2);
    expect(commands.every((b) => b.disabled)).toBe(true);
  });
  it('groups standard actions from older server responses without the basic flag', () => {
    const fixture = render();
    const c = activeCompanion();
    const names = ['Dash', 'Disengage', 'Dodge', 'Help', 'Hide', 'Search', 'Ready'];
    c.stats.actions = [
      c.stats.actions[0],
      { key: 'repair', name: 'Repair', activation: 'action', description: '', uses: 3 },
      ...names.map((name) => ({
        key: name.toLowerCase(),
        name,
        activation: 'action' as const,
        description: '',
      })),
      c.stats.actions[2],
    ];
    updates.next({ ...response, companions: [c] });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(
      [...root.querySelectorAll('.action-card summary strong')].map((el) => el.textContent?.trim()),
    ).toEqual(['Beast’s Strike', 'Repair']);
    expect(
      [...root.querySelectorAll('.basic-actions .basic-action summary strong')].map((el) =>
        el.textContent?.trim(),
      ),
    ).toEqual(names);
    expect(root.querySelector('.basic-actions > h4')?.textContent).toBe('Basic actions');
  });
  it('allows the default Dodge without a command and keeps reactions available outside the owner’s turn', () => {
    const fixture = render();
    const c = activeCompanion();
    updates.next({ ...response, companions: [c] });
    const [strike, dodge, reaction] = c.stats.actions;
    expect(fixture.componentInstance.canUse(c, strike)).toBeFalsy();
    expect(fixture.componentInstance.canUse(c, dodge)).toBe(true);
    c.turn = { started: true, ownerTurn: false, actionUsed: true };
    expect(fixture.componentInstance.canUse(c, dodge)).toBe(false);
    expect(fixture.componentInstance.canUse(c, reaction)).toBe(true);
  });
  it('offers form selection before a companion has been summoned', () => {
    const fixture = render();
    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect([...select.options].map((o) => o.value)).toEqual(['land', 'sea', 'sky']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Summon beast');
  });
  it('does not create companions from a wizard preview, even via a direct handler', async () => {
    const fixture = render(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('button')?.disabled).toBe(true);
    await fixture.componentInstance.create('primal', 'land');
    expect(creates).toEqual([]);
  });
  it('passes the selected form and prevents duplicate clicks while saving', async () => {
    const fixture = render();
    fixture.componentInstance.forms['primal'] = 'sky';
    await Promise.all([
      fixture.componentInstance.create('primal', 'land'),
      fixture.componentInstance.create('primal', 'land'),
    ]);
    expect(creates).toEqual([{ kind: 'primal', form: 'sky' }]);
  });
  it('unsubscribes when the companion panel closes', () => {
    const fixture = render();
    expect(updates.observed).toBe(true);
    fixture.destroy();
    expect(updates.observed).toBe(false);
  });
});
