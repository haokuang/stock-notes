import { z } from 'zod'

export interface AgentExecutionContext {
  userId: string
  stockId: string
  threadId: string
  runId: string
  signal: AbortSignal
}

export interface AgentTool<T> {
  name: string
  description: string
  input: z.ZodType<T>
  execute(context: AgentExecutionContext, input: T): Promise<unknown>
}

export interface AgentToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export class AgentToolValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentToolValidationError'
  }
}

export class AgentToolNotFoundError extends Error {
  constructor(name: string) {
    super(`Unknown tool: ${name}`)
    this.name = 'AgentToolNotFoundError'
  }
}

export class AgentToolOwnershipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentToolOwnershipError'
  }
}

export const FORBIDDEN_TOOL_ARG_KEYS = ['userId', 'stockId', 'threadId', 'runId'] as const