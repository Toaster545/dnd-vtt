import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateSessionDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() campaign_id: string;
  @IsString() @IsOptional() description?: string;
}
