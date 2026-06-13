import { Module } from '@nestjs/common';
import { DatabaseModule } from '../storage/database/database.module';
import { DRIZZLE_DB } from '../storage/database/database.module';
import { StocksController } from './stocks.controller';
import { StocksService } from './stocks.service';

@Module({
  imports: [DatabaseModule],
  controllers: [StocksController],
  providers: [StocksService],
  exports: [StocksService],
})
export class StocksModule {}
