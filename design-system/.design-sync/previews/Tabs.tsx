import { Tabs, TabList, Tab, TabPanel } from 'mincirklen-design-system'

export function Default() {
  return (
    <Tabs defaultSelectedKey="about">
      <TabList aria-label="Circle info">
        <Tab id="about">About</Tab>
        <Tab id="guidelines">Guidelines</Tab>
      </TabList>
      <TabPanel id="about">A weekly peer-support circle for new parents.</TabPanel>
      <TabPanel id="guidelines">Be kind. Stay anonymous if you want. No advice-giving unless asked.</TabPanel>
    </Tabs>
  )
}
