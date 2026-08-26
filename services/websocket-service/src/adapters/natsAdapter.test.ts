import { describe, expect, test } from 'bun:test'
import type { NatsConnection } from 'nats'
import { subscribeToRoom } from './natsAdapter'

describe('subscribeToRoom', () => {
  test('subscribes to the room subject, yields message strings, and unsubscribes on request', async () => {
    let unsubscribed = false
    const fakeMessages = [{ string: () => 'one' }, { string: () => 'two' }]

    const fakeSub = {
      [Symbol.asyncIterator]: async function* () {
        for (const msg of fakeMessages) yield msg
      },
      unsubscribe: () => {
        unsubscribed = true
      },
    }

    let requestedSubject: string | undefined
    const fakeNc = {
      subscribe: (subject: string) => {
        requestedSubject = subject
        return fakeSub
      },
    } as unknown as NatsConnection

    const { messages, unsubscribe } = subscribeToRoom(fakeNc, 's1')

    expect(requestedSubject).toBe('room.s1.messages')

    const received: string[] = []
    for await (const message of messages) {
      received.push(message)
    }
    expect(received).toEqual(['one', 'two'])

    unsubscribe()
    expect(unsubscribed).toBe(true)
  })
})
