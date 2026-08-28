export * from './types'
export { OFFLINE_POLICIES, getPolicy, resolveConflict } from './conflict.resolver'
export type { ConflictOutcome } from './conflict.resolver'
export { mutationQueue, MutationQueueImpl } from './mutation-queue'
