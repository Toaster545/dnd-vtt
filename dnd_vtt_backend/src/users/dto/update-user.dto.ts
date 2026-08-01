import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDto {
  @IsString() @MinLength(3) @IsOptional() username?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsIn(['admin', 'player']) @IsOptional() role?: 'admin' | 'player';
  @IsString() @MinLength(6) @IsOptional() password?: string;
}
