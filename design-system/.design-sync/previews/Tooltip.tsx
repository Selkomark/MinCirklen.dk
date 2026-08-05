import { IconButton, Tooltip, TooltipTrigger } from 'mincirklen-design-system'

export function Default() {
  return (
    <TooltipTrigger>
      <IconButton icon="?" label="What is this?" />
      <Tooltip>Only visible to this circle</Tooltip>
    </TooltipTrigger>
  )
}
