import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { TokensGateway } from './tokens.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [MapsController],
  providers: [MapsService, TokensGateway],
})
export class MapsModule {}
