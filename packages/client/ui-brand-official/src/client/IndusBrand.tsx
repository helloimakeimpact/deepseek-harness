import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import mark from './indus-orbit-mark.png'
import { indusOrbitBrand } from './locales.ts'
import css from './IndusBrand.module.css'

type IndusBrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

/**
 * Render the unchanged approved pixel master without the shell's fish animation.
 * @param props - Host-supplied dimensions and placement class.
 * @returns decorative artwork paired with visible product text.
 */
export function IndusBrandMark({ size, className }: IndusBrandMarkProps) {
  return (
    <span className={css.mark}>
      <img src={mark} width={size} height={size} className={className} alt="" aria-hidden="true" />
    </span>
  )
}

/**
 * Render the I/O H wordmark with its Workstation expansion and Foundation identity.
 * @returns visible product and organization names with the Foundation descriptor as a title.
 */
export function IndusBrandName() {
  return (
    <span className={css.name} title={indusOrbitBrand.definition}>
      <span className={css.wordmark} aria-label={indusOrbitBrand.name}>
        <span className={css.prefix}>{indusOrbitBrand.prefix}</span>
        <strong>{indusOrbitBrand.wordmark}</strong>
      </span>
      <span className={css.details}>
        <span className={css.expansion}>{indusOrbitBrand.expansion}</span>
        <span className={css.company}>{indusOrbitBrand.company}</span>
      </span>
    </span>
  )
}
