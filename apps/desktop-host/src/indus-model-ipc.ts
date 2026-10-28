/** One private IPC handshake before the Indus Host starts its profile. */
import { parseIndusHostConnection, type IndusHostConnection } from './indus-model.ts'

/**
 * Request the main-process broker without putting credentials in argv, environment or config.
 * @param signal - Plugin disposal cancels the handshake and removes its listeners.
 * @returns The validated private connection, or a bounded startup failure.
 */
export async function requestIndusModelConnection(signal: AbortSignal): Promise<IndusHostConnection> {
  signal.throwIfAborted()
  if (!process.connected || process.send === undefined) throw new Error('I/O Harness requires its desktop main process')
  const send = process.send.bind(process)
  return new Promise((resolve, reject) => {
    const finish = (result: { error: Error } | { connection: IndusHostConnection }): void => {
      clearTimeout(timer)
      process.off('message', receive)
      process.off('disconnect', disconnected)
      signal.removeEventListener('abort', aborted)
      if ('error' in result) reject(result.error)
      else resolve(result.connection)
    }
    const receive = (message: unknown): void => {
      if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'indus-model-connection') return
      try {
        if (!('connection' in message) || Object.keys(message).length !== 2) throw new Error('Invalid private I/O handshake')
        finish({ connection: parseIndusHostConnection(message.connection) })
      } catch (_invalidConnection: unknown) { finish({ error: new Error('Invalid private I/O handshake') }) }
    }
    const disconnected = (): void => { finish({ error: new Error('I/O desktop main process disconnected') }) }
    const aborted = (): void => { finish({ error: new Error('I/O desktop connection cancelled') }) }
    const timer = setTimeout(() => { finish({ error: new Error('I/O desktop connection timed out') }) }, 15_000)
    process.on('message', receive)
    process.once('disconnect', disconnected)
    signal.addEventListener('abort', aborted, { once: true })
    send({ type: 'indus-model-request' }, (error) => {
      if (error !== null) finish({ error: new Error('I/O desktop connection request failed') })
    })
  })
}
