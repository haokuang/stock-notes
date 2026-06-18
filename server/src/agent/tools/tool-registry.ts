import { z } from 'zod'
import {
  AgentExecutionContext,
  AgentTool,
  AgentToolDefinition,
  AgentToolNotFoundError,
  AgentToolValidationError,
  FORBIDDEN_TOOL_ARG_KEYS,
} from './tool.types'

interface ZodFieldLike {
  def?: {
    type?: string
    innerType?: ZodFieldLike
    values?: unknown[]
    description?: string
    shape?: Record<string, ZodFieldLike>
  }
  type?: string
}

function fieldDef(value: ZodFieldLike): NonNullable<ZodFieldLike['def']> {
  return (value.def ?? {}) as NonNullable<ZodFieldLike['def']>
}

function fieldType(value: ZodFieldLike): string {
  return fieldDef(value).type ?? value.type ?? 'unknown'
}

function innerField(value: ZodFieldLike): ZodFieldLike {
  return fieldDef(value).innerType ?? value
}

function assertSafeSchema(name: string, schema: z.ZodType<unknown>): void {
  const def = (schema as unknown as { _def?: { shape?: Record<string, ZodFieldLike> } })._def
  const shape = def?.shape
  if (!shape || typeof shape !== 'object') return
  for (const key of FORBIDDEN_TOOL_ARG_KEYS) {
    if (key in shape) {
      throw new Error(
        `Tool "${name}" must not accept identity field "${key}" in its input schema`,
      )
    }
  }
}

function isOptionalField(value: ZodFieldLike): boolean {
  return fieldType(value) === 'optional' || fieldType(value) === 'default'
}

function toJsonField(value: ZodFieldLike): Record<string, unknown> {
  const type = fieldType(value)
  switch (type) {
    case 'string':
      return { type: 'string' }
    case 'number':
      return { type: 'number' }
    case 'boolean':
      return { type: 'boolean' }
    case 'enum':
      return { type: 'string', enum: fieldDef(value).values ?? [] }
    case 'optional':
    case 'default': {
      const inner = innerField(value)
      return toJsonField(inner)
    }
    case 'object': {
      const innerShape = fieldDef(value).shape
      if (!innerShape) return { type: 'object', additionalProperties: false }
      const properties: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(innerShape)) {
        properties[k] = toJsonField(v)
      }
      return { type: 'object', additionalProperties: false, properties }
    }
    default:
      return { type: 'string' }
  }
}

export function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  const def = (schema as unknown as { _def?: { shape?: Record<string, ZodFieldLike>; description?: string } })._def
  const shape = def?.shape
  if (shape && typeof shape === 'object') {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = toJsonField(value)
      if (!isOptionalField(value)) required.push(key)
    }
    const out: Record<string, unknown> = {
      type: 'object',
      additionalProperties: false,
      properties,
    }
    if (required.length > 0) out.required = required
    if (def?.description) out.description = def.description
    return out
  }
  return { ...toJsonField(schema as unknown as ZodFieldLike), additionalProperties: false }
}

export interface AgentToolRegistryOptions {
  tools: AgentTool<unknown>[]
}

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool<unknown>>()

  constructor(options: AgentToolRegistryOptions) {
    for (const tool of options.tools) {
      if (!tool.name) throw new Error('Tool name is required')
      assertSafeSchema(tool.name, tool.input)
      this.tools.set(tool.name, tool)
    }
  }

  names(): string[] {
    return Array.from(this.tools.keys())
  }

  definitions(): AgentToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.input),
    }))
  }

  async execute(
    name: string,
    args: unknown,
    context: AgentExecutionContext,
  ): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool) throw new AgentToolNotFoundError(name)
    const parsed = tool.input.safeParse(args)
    if (!parsed.success) {
      throw new AgentToolValidationError(
        `Tool "${name}" arguments failed validation: ${parsed.error.issues
          .map((i: { path: PropertyKey[]; message: string }) =>
            `${i.path.map(String).join('.')}: ${i.message}`,
          )
          .join('; ')}`,
      )
    }
    return tool.execute(context, parsed.data)
  }
}