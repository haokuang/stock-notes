import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { Request, Response } from 'express'
import { AlertService } from './alert.service'

/**
 * 全局异常过滤器
 * - 5xx 错误 → 落库 + 邮件告警
 * - 4xx (HttpException) → 只打日志,不发邮件(用户错误不需要骚扰)
 * - 已知 Nest 内部异常 (HttpException with status) → 不发
 * - 兜底:任何 throw 都会进这里
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  constructor(private readonly alert: AlertService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest<Request>()

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    const message =
      exception instanceof HttpException
        ? exception.message
        : (exception as Error)?.message ?? 'Internal server error'

    const stack = exception instanceof Error ? exception.stack : undefined

    // 用户上下文(由 JwtGuard 挂的 req.user)
    const user = (req as any).user as { id?: string; email?: string } | undefined
    const context = {
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: req.ip,
      ua: req.headers['user-agent'],
      status,
    }

    if (status >= 500) {
      this.logger.error(`[5xx] ${req.method} ${req.originalUrl} → ${message}`, stack)
      // 异步发,不阻塞响应
      void this.alert
        .log({
          level: 'error',
          source: 'http',
          message,
          stack,
          context,
          userId: user?.id,
        })
        .catch(() => undefined)
    } else {
      this.logger.warn(`[${status}] ${req.method} ${req.originalUrl} → ${message}`)
    }

    // 标准 Nest 错误响应体
    if (exception instanceof HttpException) {
      const body = exception.getResponse()
      res.status(status).json(typeof body === 'string' ? { statusCode: status, message: body } : body)
    } else {
      res.status(status).json({
        statusCode: status,
        message: 'Internal server error',
      })
    }
  }
}
