import { Module, Global } from '@nestjs/common'
import { TushareService } from './tushare.service'

@Global()
@Module({
  providers: [TushareService],
  exports: [TushareService],
})
export class TushareModule {}
