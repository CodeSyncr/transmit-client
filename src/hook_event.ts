export const HookEvent = {
    BeforeSubscribe: 'beforeSubscribe',
    BeforeUnsubscribe: 'beforeUnsubscribe',
    OnReconnectAttempt: 'onReconnectAttempt',
    OnReconnectFailed: 'onReconnectFailed',
    OnSubscribeFailed: 'onSubscribeFailed',
    OnSubscription: 'onSubscription',
    OnUnsubscription: 'onUnsubscription',
  } as const
  
  export type HookEvent = (typeof HookEvent)[keyof typeof HookEvent]