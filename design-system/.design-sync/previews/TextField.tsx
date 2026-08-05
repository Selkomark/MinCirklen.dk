import { TextField } from 'mincirklen-design-system'

export function Default() {
  return (
    <TextField label="Share something" hint="Only visible to this circle" placeholder="Type here..." />
  )
}

export function Simple() {
  return <TextField label="Display name" placeholder="How should we call you?" />
}
