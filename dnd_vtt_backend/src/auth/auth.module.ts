import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { AdminGuard } from './admin.guard';
import { DatabaseService } from '../common/database.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'change-me',
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtGuard, AdminGuard, DatabaseService],
  exports: [JwtGuard, AdminGuard, DatabaseService, JwtModule],
})
export class AuthModule {}
