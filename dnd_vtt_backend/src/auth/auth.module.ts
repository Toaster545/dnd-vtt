import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { AdminGuard } from './admin.guard';
import { SupabaseService } from '../common/supabase.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, AdminGuard, SupabaseService],
  exports: [JwtGuard, AdminGuard, SupabaseService],
})
export class AuthModule {}
