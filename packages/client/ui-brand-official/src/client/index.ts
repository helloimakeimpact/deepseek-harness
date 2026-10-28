/** Build-selected occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { OfficialBrandMark, OfficialBrandName } from './Brand.tsx'
import { IndusBrandMark, IndusBrandName } from './IndusBrand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the selected build's brand slots as one declaration-aware registration set.
 * The upstream official build retains its own sidebar and hero presentation.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  if (process.env.DSH_CLIENT_BUILD_PROFILE === 'indus-orbit') {
    ctx.slots.inject('sidebar.brand.mark', () =>
      ctx.slots.inject('sidebar.brand.name', () =>
        ctx.slots.inject('conversation.hero.brand.mark', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, IndusBrandMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, IndusBrandName)
          yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, IndusBrandMark)
        })))
    return
  }
  if (process.env.DSH_CLIENT_BUILD_PROFILE !== 'official') return
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName)
    }))
}
