import { Avatar } from 'mincirklen-design-system'

export function Sizes() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Avatar label="Jordan Lee" size="sm" />
      <Avatar label="Jordan Lee" size="md" />
      <Avatar label="Jordan Lee" size="lg" />
    </div>
  )
}

export function Anonymous() {
  return <Avatar label="Anonymous" anonymous size="md" />
}
