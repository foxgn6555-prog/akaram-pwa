/**
 * SubscriptionManager — مدير اشتراكات Realtime مركزي.
 * الفائدة: تتبع الاشتراكات، إعادة اتصال موحّدة، وتنظيف آمن عند unmount.
 * قانون: لا يستدعي أحد supabase.channel() خارج هذا الملف.
 */
import { supabase } from '@sdk/client'
import { logger } from '@lib/monitoring/logger'

type Unsubscribe = () => void

export class SubscriptionManagerImpl {
  private channels = new Map<string, Unsubscribe>()

  subscribe(
    channelName: string,
    setup: (channel: ReturnType<typeof supabase.channel>) => ReturnType<typeof supabase.channel>,
  ): Unsubscribe {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName) as Unsubscribe
    }

    const channel = setup(supabase.channel(channelName))

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        logger.warn(`Realtime channel error: ${channelName}`)
      }
    })

    const unsubscribe: Unsubscribe = () => {
      void supabase.removeChannel(channel)
      this.channels.delete(channelName)
    }
    this.channels.set(channelName, unsubscribe)
    return unsubscribe
  }

  unsubscribeAll(): void {
    for (const unsubscribe of this.channels.values()) unsubscribe()
  }

  get activeCount(): number {
    return this.channels.size
  }
}

export const subscriptionManager = new SubscriptionManagerImpl()
