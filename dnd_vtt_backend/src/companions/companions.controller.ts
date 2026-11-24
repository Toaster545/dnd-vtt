import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/current-user.decorator';
import { CharactersService } from '../characters/characters.service';
import { CompanionsService } from './companions.service';
import { CreateCompanionDto, UpdateCompanionDto } from './dto/companion.dto';

@Controller('characters/:characterId/companions')
@UseGuards(JwtGuard)
export class CompanionsController {
  constructor(
    private companions: CompanionsService,
    private characters: CharactersService,
  ) {}
  @Get()
  async list(
    @Param('characterId') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.withSlots(id, user, await this.companions.list(id, user));
  }
  @Post()
  async create(
    @Param('characterId') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: CreateCompanionDto,
  ) {
    return this.withSlots(
      id,
      user,
      await this.companions.create(id, user, { ...body }),
    );
  }
  @Post(':id')
  async update(
    @Param('characterId') characterId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: UpdateCompanionDto,
  ) {
    const result = await this.companions.update(
      characterId,
      id,
      user,
      { ...body },
      (owner) =>
        this.characters
          .resolveSlotPools(owner)
          .filter((p) => p.type !== 'restricted'),
    );
    return this.withSlots(characterId, user, result);
  }
  private async withSlots<T>(id: string, user: RequestUser, result: T) {
    const owner = await this.companions.owner(id, user);
    return {
      ...result,
      slots: this.characters
        .resolveSlotPools(owner)
        .filter((p) => p.type !== 'restricted')
        .flatMap((pool) =>
          Object.entries(pool.slots).map(([level, max]) => ({
            poolKey: pool.key,
            level: Number(level),
            name: pool.name,
            remaining:
              max -
              Number(
                (
                  owner.spell_slot_uses as
                    Record<string, Record<string, number>> | undefined
                )?.[pool.key]?.[level] ??
                  (pool.key === 'spellcasting'
                    ? (
                        owner.spell_slots_used as
                          Record<string, number> | undefined
                      )?.[level]
                    : 0) ??
                  0,
              ),
          })),
        ),
    };
  }
}
