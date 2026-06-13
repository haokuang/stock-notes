import { Module, Global } from '@nestjs/common'
import { getDb } from 'coze-coding-dev-sdk'
import * as schema from './shared/schema'

export const DRIZZLE_DB = 'DRIZZLE_DB'

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: async () => {
        return getDb(schema)
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
