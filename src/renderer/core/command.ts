import { cloneDeep, orderBy, upperFirst } from 'lodash-es'
import { getLogger } from '@fe/utils'
import { isMacOS, isOtherOS, isWindows } from '@fe/support/env'
import { FLAG_DISABLE_SHORTCUTS } from '@fe/support/args'
import type { Command } from '@fe/types'
import { getActionHandler } from './action'
import { triggerHook } from './hook'
import * as ioc from './ioc'

const logger = getLogger('command')

export const Escape = 'Escape'
export const Ctrl = 'Ctrl'
export const Meta = 'Meta'
export const Cmd = 'Cmd'
export const Win = 'Win'
export const CtrlCmd = 'CtrlCmd'
export const Alt = 'Alt'
export const Space = 'Space'
export const Shift = 'Shift'
export const BracketLeft = 'BracketLeft'
export const BracketRight = 'BracketRight'
export const LeftClick = 0
export const Tab = 'Tab'

type XKey = typeof Ctrl | typeof CtrlCmd | typeof Alt | typeof Shift

const commands: { [key: string]: Command } = {}

let keys: Record<string, boolean> = {}

let flagDisableShortcuts = false

function recordKeys (e: KeyboardEvent) {
  if (e.type === 'keydown') {
    keys[e.key.toUpperCase()] = true
  } else {
    // keyup event not fired some times such as in key combination.
    keys = {}
  }
}

/**
 * Register a command tapper.
 * @param tapper
 */
export function tapCommand (tapper: (command: Command) => void) {
  ioc.register('COMMAND_TAPPERS', tapper)
}

/**
 * Remove a command tapper.
 * @param tapper
 */
export function removeCommandTapper (tapper: (command: Command) => void) {
  ioc.remove('COMMAND_TAPPERS', tapper)
}

/**
 * Disable shortcuts
 */
export function disableShortcuts () {
  flagDisableShortcuts = true
}

/**
 * Enable shortcuts
 */
export function enableShortcuts () {
  flagDisableShortcuts = false
}

/**
 * Get all commands
 * @returns all commands
 */
export function getRawCommands (): Command[] {
  return orderBy(cloneDeep(Object.values(commands)), 'id')
}

/**
 * Get a command
 * @param id
 * @returns
 */
export function getCommand (id: string): Command | undefined {
  const command = cloneDeep(commands[id])
  if (command) {
    const tappers = ioc.get('COMMAND_TAPPERS')
    tappers.forEach(tap => tap(command))
  }

  return command
}

/**
 * Determine whether the user has pressed the key
 * @param key upper case.
 */
export function isKeydown (key: string) {
  return !!keys[key]
}

/**
 * Determine whether the user has pressed the Cmd key (macOS) or Ctrl key.
 * @param e
 * @returns
 */
export function hasCtrlCmd (e: KeyboardEvent | MouseEvent) {
  return isMacOS ? e.metaKey : e.ctrlKey
}

/**
 * Get key label.
 * @param key
 * @returns
 */
export function getKeyLabel (key: XKey | string | number) {
  const str = {
    CMD: '⌘',
    WIN: 'Win',
    CTRLCMD: isMacOS ? '⌘' : 'Ctrl',
    ALT: isMacOS ? '⌥' : 'Alt',
    CTRL: isMacOS ? '⌃' : 'Ctrl',
    SHIFT: isMacOS ? '⇧' : 'Shift',
    META: isMacOS ? '⌘' : isWindows ? 'Win' : 'Meta',
    BRACKETLEFT: '[',
    BRACKETRIGHT: ']',
    PERIOD: '.',
    TAB: 'Tab',
    ESCAPE: 'Esc',
    ARROWUP: '↑',
    ARROWDOWN: '↓',
    ARROWLEFT: '←',
    ARROWRIGHT: '→',
    UP: '↑',
    DOWN: '↓',
    LEFT: '←',
    RIGHT: '→',
  }[key.toString().toUpperCase()]

  return str || upperFirst(key.toString())
}

/**
 * Determine whether the event matches the shortcut key combination.
 * @param e
 * @param keys
 * @returns
 */
export function matchKeys (e: KeyboardEvent | MouseEvent, keys: (string | number)[]) {
  if (keys.length === 0) {
    return false
  }

  const modifiers = { metaKey: false, ctrlKey: false, altKey: false, shiftKey: false }

  for (const key of keys) {
    switch (key.toString().toUpperCase()) {
      case CtrlCmd.toUpperCase():
        if (isMacOS) {
          modifiers.metaKey = true
        } else {
          modifiers.ctrlKey = true
        }
        if (!hasCtrlCmd(e)) return false
        break
      case Alt.toUpperCase():
        modifiers.altKey = true
        if (!e.altKey) return false
        break
      case Ctrl.toUpperCase():
        modifiers.ctrlKey = true
        if (!e.ctrlKey) return false
        break
      case Meta.toUpperCase():
        modifiers.metaKey = isOtherOS
        if (!e.metaKey) return false
        break
      case Cmd.toUpperCase():
        modifiers.metaKey = isMacOS
        if (!e.metaKey) return false
        break
      case Win.toUpperCase():
        modifiers.metaKey = isWindows
        if (!e.metaKey) return false
        break
      case Shift.toUpperCase():
        modifiers.shiftKey = true
        if (!e.shiftKey) return false
        break
      default:
        // if the event from iframe, it not instance of KeyboardEvent.
        if (e instanceof KeyboardEvent || '' + e === '[object KeyboardEvent]') {
          e = e as KeyboardEvent
          const eCode = e.code.toUpperCase()
          const eKey = e.key.toUpperCase()
          const iKey = key.toString().toUpperCase()

          if (
            iKey !== eKey &&
            iKey !== eCode &&
            `KEY${iKey}` !== eCode &&
            `DIGIT${iKey}` !== eCode &&
            `NUMPAD${iKey}` !== eCode &&
            `ARROW${iKey}` !== eCode
          ) return false
        } else {
          if (key !== e.button) return false
        }
    }
  }

  return modifiers.altKey === e.altKey &&
    modifiers.ctrlKey === e.ctrlKey &&
    modifiers.metaKey === e.metaKey &&
    modifiers.shiftKey === e.shiftKey
}

/**
 * Determine whether the event shortcut key combination matches a command.
 * @param e
 * @param idOrCommand
 * @returns
 */
export function isCommand (e: KeyboardEvent | MouseEvent, idOrCommand: string | Command) {
  const command = typeof idOrCommand === 'string' ? getCommand(idOrCommand) : idOrCommand
  return !!(command && command.keys && matchKeys(e, command.keys))
}

/**
 * Run a command
 * @param command
 * @returns
 */
export function runCommand (command: Command) {
  if (typeof command.handler === 'string') {
    return getActionHandler(command.handler)()
  } else {
    return command.handler?.()
  }
}

/**
 * Get shortcuts label.
 * @param idOrKeys command id or keys
 * @returns
 */
export function getKeysLabel (id: string): string
export function getKeysLabel (keys: (string | number)[]): string
export function getKeysLabel (idOrKeys: (string | number)[] | string): string {
  let keys = []

  if (typeof idOrKeys === 'string') {
    const command = getCommand(idOrKeys)
    if (!command || !command.keys) {
      return ''
    }

    keys = command.keys
  } else {
    keys = idOrKeys
  }

  return keys.map(getKeyLabel).join(isMacOS ? ' ' : '+')
}

/**
 * Register a command.
 * @param command
 * @returns
 */
export function registerCommand (command: Command) {
  logger.debug('registerCommand', command)
  commands[command.id] = command
  return command
}

/**
 * Remove a command
 * @param id
 */
export function removeCommand (id: string) {
  logger.debug('removeCommand', id)
  delete commands[id]
}

export function keydownHandler (e: KeyboardEvent) {
  recordKeys(e)

  if (FLAG_DISABLE_SHORTCUTS || flagDisableShortcuts) {
    logger.warn('shortcut disabled')
    return
  }

  triggerHook('GLOBAL_KEYDOWN', e)

  for (const item of getRawCommands()) {
    const command = getCommand(item.id)
    if (command && isCommand(e, command)) {
      if (command.when && !command.when()) {
        continue
      }

      e.stopPropagation()
      e.preventDefault()
      runCommand(command)
      break
    }
  }
}

export function keyupHandler (e: KeyboardEvent) {
  recordKeys(e)
  triggerHook('GLOBAL_KEYUP', e)
}

window.addEventListener('keydown', keydownHandler, true)
window.addEventListener('keyup', keyupHandler, true)
