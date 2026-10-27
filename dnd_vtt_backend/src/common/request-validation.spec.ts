import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ValidateOnlyPipe } from './validate-only.pipe';
import { CharacterBodyDto } from '../characters/dto/character-body.dto';
import { CastSpellDto } from '../characters/dto/cast-spell.dto';
import { CompleteRestDto } from '../characters/dto/complete-rest.dto';
import { UpsertTokenDto } from '../maps/dto/upsert-token.dto';
import { SetAmbientLightDto } from '../maps/dto/lighting.dto';
import { PaintFogDto } from '../maps/dto/fog.dto';

// Same options as main.ts.
const globalPipe = new ValidationPipe({ whitelist: true, transform: true });
const body = <T extends object>(metatype: new () => T, value: unknown) =>
  globalPipe.transform(value, { type: 'body', metatype }) as Promise<T>;

describe('ValidateOnlyPipe (character blob)', () => {
  const pipe = new ValidateOnlyPipe(CharacterBodyDto);

  it('passes undeclared blob fields through untouched', async () => {
    const input = { name: 'Aria', level: 3, ability_scores: { str: 10 } };
    const result = (await pipe.transform(input)) as Record<string, unknown>;
    expect(result).toBe(input);
    expect('avatar_recipe' in result).toBe(false);
  });

  it('rejects wrongly typed known fields', async () => {
    await expect(pipe.transform({ level: 'high' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(pipe.transform({ equipment: 'sword' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects non-object bodies', async () => {
    await expect(pipe.transform([1])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('action DTOs', () => {
  it('rejects an unknown cast method', async () => {
    await expect(
      body(CastSpellDto, {
        spellIndex: 'fireball',
        sourceKey: 'a',
        method: 'x',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a free cast with a null recovery', async () => {
    await expect(
      body(CastSpellDto, {
        spellIndex: 'misty-step',
        sourceKey: 'a',
        method: 'free',
        freeCastKey: 'k',
        atWill: true,
        recovery: null,
      }),
    ).resolves.toMatchObject({ method: 'free' });
  });

  it('requires a retry id for a rest and validates nested creations', async () => {
    await expect(body(CompleteRestDto, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      body(CompleteRestDto, { requestId: 'r', creations: [{}] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      body(CompleteRestDto, {
        requestId: 'r',
        creations: [{ planId: 'p', attune: true }],
      }),
    ).resolves.toBeDefined();
  });
});

describe('map DTOs', () => {
  it('normalises raw 0/1 flags a client echoes back from the API', async () => {
    const token = await body(UpsertTokenDto, {
      id: 't',
      visible_to_players: 0,
      name_visible_to_players: 1,
      map_id: 'server-owned',
    });
    expect(token).toMatchObject({
      visible_to_players: false,
      name_visible_to_players: true,
    });
    expect(token).not.toHaveProperty('map_id');
  });

  it('rejects a malformed fog stroke and ambient color', async () => {
    await expect(
      body(PaintFogDto, { cells: [{ col: 'a', row: 1 }], revealed: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      body(SetAmbientLightDto, { level: 50, color: 'red' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
