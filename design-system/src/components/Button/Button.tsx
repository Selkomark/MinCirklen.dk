import { Button as RACButton, type ButtonProps as RACButtonProps } from 'react-aria-components'
import './Button.css'

export type ButtonVariant = 'safe' | 'secondary' | 'ghost' | 'urgent'

export interface ButtonProps extends Omit<RACButtonProps, 'className'> {
  variant?: ButtonVariant
  className?: string
}

export function Button({ variant = 'safe', className, ...props }: ButtonProps) {
  return (
    <RACButton
      className={['ds-button', `ds-button--${variant}`, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
}
