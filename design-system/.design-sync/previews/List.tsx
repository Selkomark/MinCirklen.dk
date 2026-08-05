import { List } from 'mincirklen-design-system'

export function Unordered() {
  return (
    <List>
      <li>Be kind</li>
      <li>Stay anonymous if you want</li>
      <li>No advice-giving unless asked</li>
    </List>
  )
}

export function Ordered() {
  return (
    <List ordered>
      <li>Join the session</li>
      <li>Introduce yourself (or not)</li>
      <li>Listen and share</li>
    </List>
  )
}
