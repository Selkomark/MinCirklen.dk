import { Table } from 'mincirklen-design-system'

export function Striped() {
  return (
    <Table striped>
      <thead>
        <tr>
          <th>Circle</th>
          <th>Day</th>
          <th>Participants</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>New parents</td>
          <td>Tuesdays</td>
          <td>6</td>
        </tr>
        <tr>
          <td>Grief support</td>
          <td>Thursdays</td>
          <td>8</td>
        </tr>
      </tbody>
    </Table>
  )
}
