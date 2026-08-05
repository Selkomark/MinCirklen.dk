import { Figure } from 'mincirklen-design-system'

export function Default() {
  return (
    <Figure caption="Weekly circle, meeting in the community room.">
      <div
        style={{
          width: '100%',
          height: 140,
          background: 'var(--surface-sunken)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-secondary)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        (image placeholder)
      </div>
    </Figure>
  )
}
