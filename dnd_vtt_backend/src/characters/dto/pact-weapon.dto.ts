import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PactWeaponDto {
  @IsIn(['conjure', 'bond', 'dismiss']) action: 'conjure' | 'bond' | 'dismiss';
  // Required for conjure/bond; dismiss doesn't name a weapon.
  @IsString() @IsNotEmpty() @IsOptional() itemIndex?: string;
  @IsString() @IsOptional() instanceId?: string;
}
