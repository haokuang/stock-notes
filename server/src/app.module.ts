import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AppService } from './app.service'
import { DatabaseModule } from './storage/database/database.module'
import { StocksModule } from './stocks/stocks.module'
import { NotesModule } from './notes/notes.module'
import { UploadModule } from './upload/upload.module'
import { AiModule } from './ai/ai.module'

@Module({
  imports: [DatabaseModule, StocksModule, NotesModule, UploadModule, AiModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
