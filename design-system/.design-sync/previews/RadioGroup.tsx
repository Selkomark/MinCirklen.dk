import { RadioGroup, Radio } from 'mincirklen-design-system'

export function Default() {
  return (
    <RadioGroup label="Who can see your name?" defaultValue="anonymous">
      <Radio value="anonymous">Nobody — stay anonymous</Radio>
      <Radio value="facilitator">Just the facilitator</Radio>
      <Radio value="circle">Everyone in this circle</Radio>
    </RadioGroup>
  )
}
