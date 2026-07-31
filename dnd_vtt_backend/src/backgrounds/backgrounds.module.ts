import { Module } from '@nestjs/common';
import { BackgroundsController } from './backgrounds.controller';

@Module({
  controllers: [BackgroundsController],
})
export class BackgroundsModule {}
