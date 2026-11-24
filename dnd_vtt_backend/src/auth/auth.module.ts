import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { AdminGuard } from './admin.guard';
import { DatabaseService } from '../common/database.service';
import { SocketAuthService } from './socket-auth.service';
import { resolveJwtSecret } from './jwt-secret';
import { CampaignAccessService } from '../campaigns/campaign-access.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: resolveJwtSecret(),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtGuard,
    AdminGuard,
    SocketAuthService,
    DatabaseService,
    CampaignAccessService,
  ],
  exports: [
    JwtGuard,
    AdminGuard,
    SocketAuthService,
    DatabaseService,
    CampaignAccessService,
    JwtModule,
  ],
})
export class AuthModule {}
