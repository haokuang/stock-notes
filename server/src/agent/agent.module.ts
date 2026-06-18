import { Module } from '@nestjs/common'
import { AgentController } from './agent.controller'
import { AgentRepository } from './agent.repository'
import { AgentService } from './agent.service'
import {
  createProviderHealthService,
  ProviderHealthService,
} from './providers/provider-health.service'

@Module({
  controllers: [AgentController],
  providers: [
    AgentRepository,
    AgentService,
    {
      provide: ProviderHealthService,
      useFactory: () => createProviderHealthService(),
    },
  ],
  exports: [AgentRepository, AgentService, ProviderHealthService],
})
export class AgentModule {}
