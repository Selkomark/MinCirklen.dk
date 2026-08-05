import { IconButton } from 'mincirklen-design-system'

export function Default() {
  return <IconButton icon="☾" label="Toggle theme" />
}

export function Urgent() {
  return <IconButton icon="✕" label="Leave session" variant="urgent" />
}
