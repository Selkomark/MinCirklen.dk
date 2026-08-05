import { Menu, MenuItem } from 'mincirklen-design-system'

export function Default() {
  return (
    <Menu label="Actions ⌄" onAction={() => {}}>
      <MenuItem id="mute">Mute notifications</MenuItem>
      <MenuItem id="leave">Leave circle</MenuItem>
      <MenuItem id="report">Report a participant</MenuItem>
    </Menu>
  )
}
