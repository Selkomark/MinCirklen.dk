import { describe, expect, test } from 'bun:test'
import type { NatsConnection } from 'nats'
import { publishMessage } from './natsAdapter'

describe('publishMessage', () => {
  test('publishes the JSON-encoded payload to the room subject', () => {
    const calls: Array<{ subject: string; payload: unknown }> = []
    const fakeNc = {
      publish: (subject: string, payload: unknown) => {
        calls.push({ subject, payload })
      },
    } as unknown as NatsConnection

    publishMessage(fakeNc, '11111111-1111-1111-1111-111111111111', { body: 'hi' })

    expect(calls).toEqual([
      {
        subject: 'room.11111111-1111-1111-1111-111111111111.messages',
        payload: JSON.stringify({ body: 'hi' }),
      },
    ])
  })
})
