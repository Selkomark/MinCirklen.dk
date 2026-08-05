import { Accordion, AccordionItem } from 'mincirklen-design-system'

export function Default() {
  return (
    <Accordion defaultExpandedKeys={['safety']}>
      <AccordionItem id="safety" title="How is my safety protected?">
        A trained facilitator moderates every session, and you can leave or report at any time.
      </AccordionItem>
      <AccordionItem id="privacy" title="Is this anonymous?">
        Yes, by default — you choose what to share.
      </AccordionItem>
    </Accordion>
  )
}
