import path from 'node:path'
import { ForgeDatabase } from './persistence/database'
import { createRepositories, type Repositories } from './persistence/repositories'
import { TypedEventBus } from './coordination/event-bus'
import { StructuredLogger } from './observability/logger'

export interface ForgeContext {
  database: ForgeDatabase
  repositories: Repositories
  events: TypedEventBus
  logger: StructuredLogger
}

export function createForgeContext(userDataPath: string): ForgeContext {
  const database = new ForgeDatabase(path.join(userDataPath, 'forge.db'))
  const repositories = createRepositories(database)
  const events = new TypedEventBus(repositories.events)
  const logger = new StructuredLogger(path.join(userDataPath, 'forge.log'))
  logger.info('forge:context:created', { database: database.filePath })
  return { database, repositories, events, logger }
}

export function disposeForgeContext(context: ForgeContext): void {
  context.logger.info('forge:context:disposed')
  context.database.close()
}
