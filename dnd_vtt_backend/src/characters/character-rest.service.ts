import { Injectable, BadRequestException, Optional } from '@nestjs/common';
import { withCharacterLock } from '../common/character-lock';
import type { RequestUser } from '../common/current-user.decorator';
import { CompanionsService } from '../companions/companions.service';
import { CharacterRepository } from './character-repository';
import { InventoryService } from './inventory.service';

@Injectable()
export class CharacterRestService {
  constructor(
    private repository: CharacterRepository,
    @Optional() private companions?: CompanionsService,
    @Optional() private inventory?: InventoryService,
  ) {}

  async completeRest(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    await this.inventory!.rest(id, user, body);
    if (!body.correction) await this.companions?.notifyRestCompleted(id);
    return this.repository.findOneReadable(id, user);
  }

  async restoreLife(
    id: string,
    user: RequestUser,
    body: Record<string, unknown>,
  ) {
    const type = body.type;
    if (type !== 'short_rest' && type !== 'long_rest')
      throw new BadRequestException(
        'Rest type must be short_rest or long_rest.',
      );
    return withCharacterLock(id, async () => {
      const character = await this.repository.findOneReadable(id, user);
      const data = this.repository.characterData(character);
      const classes =
        Array.isArray(data.classes) && data.classes.length
          ? (data.classes as { level: number }[])
          : [{ level: Number(character.level ?? 1) }];

      let totalHitDice = 0;

      for (const cls of classes) {
        const level = cls.level;
        totalHitDice += level;
      }

      if (type === 'long_rest') {
        data.current_hp = data.max_hp;
        if (String(character.race).toLowerCase() === 'human') {
          data.heroic_inspiration = true;
        }
        const recoveredDice = Math.trunc(totalHitDice / 2);
        data.hit_dice_used = Math.max(
          0,
          Number(data.hit_dice_used ?? 0) - recoveredDice,
        );
      } else {
        const hitDiceUsed = Number(body.hitDiceUsed ?? 0);
        const healed = Number(body.healed ?? 0);
        if (!Number.isInteger(hitDiceUsed) || hitDiceUsed < 0)
          throw new BadRequestException('Invalid hitDiceUsed');
        if (!Number.isInteger(healed) || healed < 0)
          throw new BadRequestException('Invalid healed amount');

        const existingUsed = Number(data.hit_dice_used ?? 0);
        const available = Math.max(0, totalHitDice - existingUsed);
        if (hitDiceUsed > available)
          throw new BadRequestException('Not enough hit dice available');

        data.hit_dice_used = existingUsed + hitDiceUsed;
        const currentHp = Number(data.current_hp ?? 0);
        const maxHp = Number(data.max_hp ?? 0);
        data.current_hp = Math.min(maxHp, currentHp + healed);
      }
      await this.repository.writeCharacterData(id, data);
      if (body.type === 'long_rest') await this.companions?.longRest(id);
      return this.repository.findOneReadable(id, user);
    });
  }
}
