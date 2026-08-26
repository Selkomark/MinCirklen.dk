import type { Redis } from 'ioredis'

export async function pingRedis(redis: Redis): Promise<void> {
  const result = await redis.ping()
  if (result !== 'PONG') {
    throw new Error(result)
  }
}
