import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CompanionsService } from './companions.service';
import { CompanionsGateway } from './companions.gateway';
@Module({
  imports: [AuthModule],
  providers: [CompanionsService, CompanionsGateway],
  exports: [CompanionsService],
})
export class CompanionsModule {}
