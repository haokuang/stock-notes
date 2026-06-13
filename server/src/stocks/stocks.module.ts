import { Module } from '@nestjs/common'
import { DatabaseModule } from '../storage/database/database.module'
import { DRIZZLE_DB } from '../storage/database/database.module'
import { StocksController } from './stocks.controller'
import { StocksService } from './stocks.service'
import { DailySyncService } from './daily-sync.service'

@Module({
  imports: [DatabaseModule],
  controllers: [StocksController],
  providers: [StocksService, DailySyncService],
  exports: [StocksService, DailySyncService],
})
export class StocksModule {}
