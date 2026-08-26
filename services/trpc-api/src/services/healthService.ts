export interface HealthDeps {
  pingDatabase: () => Promise<void>
  pingRedis: () => Promise<void>
  checkModerationService: () => Promise<void>
}

export interface HealthResult {
  service: 'trpc-api'
  postgres: string
  redis: string
  moderationService: string
}

async function describeCheck(check: () => Promise<void>): Promise<string> {
  try {
    await check()
    return 'ok'
  } catch (err) {
    return `unreachable: ${(err as Error).message}`
  }
}

export async function getHealth(deps: HealthDeps): Promise<HealthResult> {
  const [postgres, redis, moderationService] = await Promise.all([
    describeCheck(deps.pingDatabase),
    describeCheck(deps.pingRedis),
    describeCheck(deps.checkModerationService),
  ])

  return { service: 'trpc-api', postgres, redis, moderationService }
}
