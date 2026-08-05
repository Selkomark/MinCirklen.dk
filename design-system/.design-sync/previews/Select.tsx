import { Select, SelectItem } from 'mincirklen-design-system'

export function Default() {
  return (
    <div style={{ width: 220 }}>
      <Select label="Preferred language" placeholder="Choose one">
        <SelectItem id="da">Dansk</SelectItem>
        <SelectItem id="en">English</SelectItem>
      </Select>
    </div>
  )
}
