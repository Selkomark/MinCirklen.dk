import { roomSubject } from '@mincirklen/shared'
import type { NatsConnection } from 'nats'

export interface RoomSubscription {
  messages: AsyncIterable<string>
  unsubscribe: () => void
}

export function subscribeToRoom(nc: NatsConnection, sessionId: string): RoomSubscription {
  const sub = nc.subscribe(roomSubject(sessionId))

  async function* iterate(): AsyncIterable<string> {
    for await (const msg of sub) {
      yield msg.string()
    }
  }

  return { messages: iterate(), unsubscribe: () => sub.unsubscribe() }
}
