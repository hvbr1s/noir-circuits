// Shim for pino in browser - provides a no-op logger
// This replaces pino which doesn't work in browsers
const noop = () => {}
const noopLogger: any = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => noopLogger,
  level: 'silent',
  levels: { values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } }
}

const pino = () => noopLogger
pino.levels = { values: { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } }

export { pino }
export const levels = pino.levels
export default pino
