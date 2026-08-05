import { Button, Modal, DialogTrigger } from 'mincirklen-design-system'

export function Default() {
  return (
    <DialogTrigger>
      <Button variant="urgent">Leave session</Button>
      <Modal title="Leave this session?">
        {(close) => (
          <>
            <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
              You can rejoin at any time before it ends.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button variant="urgent" onClick={close}>
                Leave
              </Button>
              <Button variant="secondary" onClick={close}>
                Stay
              </Button>
            </div>
          </>
        )}
      </Modal>
    </DialogTrigger>
  )
}
