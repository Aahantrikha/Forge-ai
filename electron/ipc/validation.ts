import { z } from 'zod'

export const FilePathSchema = z.string().min(1)
export const FileContentSchema = z.string()
export const DirectoryPathSchema = z.string().min(1)
export const FileNameSchema = z.string().min(1).max(255)
export const FileStateSchema = z.object({
  path: z.string().min(1),
  size: z.number().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  hash: z.string().min(1),
})
export const SessionIdSchema = z.string().min(1)
export const PromptSchema = z.string().min(1)

export const ProviderIdArgSchema = z.enum(['opencode', 'codex', 'gemini'])
export const EntryTypeArgSchema = z.enum(['file', 'directory'])

export const CreateSessionOptionsSchema = z.object({
  workspacePath: DirectoryPathSchema,
  modelId: z.string().min(1).optional(),
  title: z.string().optional(),
})

export const SubmitPromptOptionsSchema = z.object({
  sessionId: SessionIdSchema,
  prompt: PromptSchema,
  modelId: z.string().min(1).optional(),
  workspacePath: DirectoryPathSchema,
})

export const IpcArgs = {
  readFile: z.tuple([FilePathSchema]),
  saveFile: z.tuple([FilePathSchema, FileContentSchema, FileStateSchema.optional()]),
  getFileState: z.tuple([FilePathSchema]),
  createEntry: z.tuple([DirectoryPathSchema, FileNameSchema, EntryTypeArgSchema]),
  renameEntry: z.tuple([FilePathSchema, FileNameSchema]),
  deleteEntry: z.tuple([FilePathSchema]),
  setCurrent: z.tuple([DirectoryPathSchema]),
  getTree: z.tuple([DirectoryPathSchema.optional()]),
  checkAuth: z.tuple([ProviderIdArgSchema]),
  listModels: z.tuple([ProviderIdArgSchema]),
  createSession: z.tuple([ProviderIdArgSchema, CreateSessionOptionsSchema]),
  submitPrompt: z.tuple([ProviderIdArgSchema, SubmitPromptOptionsSchema]),
  cancel: z.tuple([ProviderIdArgSchema, SessionIdSchema, DirectoryPathSchema.optional()]),
} as const

export class IpcValidationError extends Error {
  readonly code = 'INVALID_ARGUMENT'
  readonly details: unknown

  constructor(channel: string, details: unknown) {
    super(`Invalid arguments for ${channel}`)
    this.name = 'IpcValidationError'
    this.details = details
  }
}

export function validateArgs<T extends z.ZodType>(schema: T, args: unknown[], channel: string): z.output<T> {
  const result = schema.safeParse(args)
  if (!result.success) throw new IpcValidationError(channel, result.error)
  return result.data
}
