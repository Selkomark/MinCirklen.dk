import type { ReactNode } from 'react'
import {
  Select as RACSelect,
  Button,
  SelectValue,
  Popover,
  ListBox,
  ListBoxItem,
  Label,
  type SelectProps as RACSelectProps,
  type ListBoxItemProps,
} from 'react-aria-components'
import './Select.css'

export interface SelectProps<T extends object>
  extends Omit<RACSelectProps<T>, 'className' | 'children'> {
  label?: string
  className?: string
  items?: Iterable<T>
  children: ReactNode | ((item: T) => ReactNode)
}

export function Select<T extends object>({
  label,
  className,
  items,
  children,
  ...props
}: SelectProps<T>) {
  return (
    <RACSelect className={['ds-select', className].filter(Boolean).join(' ')} {...props}>
      {label && <Label className="ds-select__label">{label}</Label>}
      <Button className="ds-select__trigger">
        <SelectValue className="ds-select__value" />
        <span className="ds-select__chevron" aria-hidden="true">
          ⌄
        </span>
      </Button>
      <Popover className="ds-select__popover">
        <ListBox className="ds-select__listbox" items={items}>
          {children}
        </ListBox>
      </Popover>
    </RACSelect>
  )
}

export function SelectItem(props: ListBoxItemProps) {
  return <ListBoxItem className="ds-select__item" {...props} />
}
