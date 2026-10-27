import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { AdminGuard } from './admin.guard';
import { DatabaseService } from '../common/database.service';
import { SocketAuthService } from './socket-auth.service';
import { resolveJwtSecret } from './jwt-secret';

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
  ],
  exports: [
    JwtGuard,
    AdminGuard,
    SocketAuthService,
    DatabaseService,
    JwtModule,
  ],
})
export class AuthModule {}
