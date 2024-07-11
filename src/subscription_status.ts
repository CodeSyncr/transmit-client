export const SubscriptionStatus = {
  Pending: 0,
  Created: 1,
  Deleted: 2,
} as const

export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus]
