import { roomSubject } from '@mincirklen/shared'
import type { NatsConnection } from 'nats'

export function publishMessage(nc: NatsConnection, sessionId: string, payload: unknown): void {
  nc.publish(roomSubject(sessionId), JSON.stringify(payload))
}
