import { Controller, Get } from '@nestjs/common';
import { AppService } from '@/app.service';
import { Public } from './storage/auth/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get('hello')
  getHello(): { status: string; data: string } {
    return {
      status: 'success',
      data: this.appService.getHello()
    };
  }

  @Public()
  @Get('health')
  getHealth(): { status: string; data: string } {
    return {
      status: 'success',
      data: new Date().toISOString(),
    };
  }
}
