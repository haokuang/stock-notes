import { Global, Module } from '@nestjs/common'
import { AlertService } from './alert.service'
import { GlobalExceptionFilter } from './global-exception.filter'

/**
 * 错误监控 + 告警 — 全局模块
 * AlertService 可被任意 service 注入
 * GlobalExceptionFilter 在 main.ts 通过 app.useGlobalFilters() 注册
 */
@Global()
@Module({
  providers: [AlertService, GlobalExceptionFilter],
  exports: [AlertService],
})
export class MonitoringModule {}
