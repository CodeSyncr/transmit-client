interface TransmitOptions {
  baseUrl: string
  eventSourceConstructor?: typeof EventSource
  beforeSubscribe?: (request: RequestInit) => void
  beforeUnsubscribe?: (request: RequestInit) => void
  maxReconnectAttempts?: number
  onReconnectAttempt?: (attempt: number) => void
  onReconnectFailed?: () => void
  removeSubscriptionOnZeroListener?: boolean
}

export const TransmitStatus = {
  Initializing: 'initializing',
  Connecting: 'connecting',
  Connected: 'connected',
  Disconnected: 'disconnected',
  Reconnecting: 'reconnecting',
}

type TTransmitStatus = (typeof TransmitStatus)[keyof typeof TransmitStatus]

export class Transmit extends EventTarget {
  // Remove private identifiers
  uid: string = crypto.randomUUID()
  options: TransmitOptions
  listeners: Map<string, Set<(message: any) => void>> = new Map()
  status: TTransmitStatus = TransmitStatus.Initializing
  eventSource!: EventSource
  reconnectAttempts: number = 0
  channelSubscriptionLock: Set<string> = new Set()

  constructor(options: TransmitOptions) {
    super()

    if (typeof options.eventSourceConstructor === 'undefined') {
      options.eventSourceConstructor = EventSource
    }

    if (typeof options.maxReconnectAttempts === 'undefined') {
      options.maxReconnectAttempts = 5
    }

    if (typeof options.removeSubscriptionOnZeroListener === 'undefined') {
      options.removeSubscriptionOnZeroListener = false
    }

    this.options = options
    this.connect()
  }

  changeStatus(status: TTransmitStatus) {
    this.status = status
    this.dispatchEvent(new CustomEvent(status))
  }

  connect() {
    this.changeStatus(TransmitStatus.Connecting)

    const url = new URL(this.options.baseUrl + '/__transmit/events')
    url.searchParams.append('uid', this.uid)

    this.eventSource = new this.options.eventSourceConstructor(url.toString(), {
      withCredentials: true,
    })

    this.eventSource.addEventListener('message', this.onMessage.bind(this))
    this.eventSource.addEventListener('error', this.onError.bind(this))
    this.eventSource.addEventListener('open', () => {
      this.changeStatus(TransmitStatus.Connected)
      this.reconnectAttempts = 0
    })
  }

  onMessage(event: MessageEvent) {
    const data = JSON.parse(event.data)
    const listeners = this.listeners.get(data.channel)

    if (typeof listeners === 'undefined') {
      return
    }

    for (const listener of listeners.values()) {
      listener(data.payload)
    }
  }

  onError() {
    if (this.status !== TransmitStatus.Reconnecting) {
      this.changeStatus(TransmitStatus.Disconnected)
    }

    this.changeStatus(TransmitStatus.Reconnecting)

    if (this.options.onReconnectAttempt) {
      this.options.onReconnectAttempt(this.reconnectAttempts + 1)
    }

    if (
      this.options.maxReconnectAttempts &&
      this.reconnectAttempts >= this.options.maxReconnectAttempts
    ) {
      this.eventSource.close()

      if (this.options.onReconnectFailed) {
        this.options.onReconnectFailed()
      }

      return
    }

    this.reconnectAttempts++

    // Use Array.from to create an array from the Set
    const channels = Array.from(this.listeners.keys())
    for (const channel of channels) {
      void this.subscribe(channel)
    }
  }

  async subscribe(channel: string, callback?: any) {
    if (this.status !== TransmitStatus.Connected) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(this.subscribe(channel, callback))
        }, 100)
      })
    }

    const listeners = this.listeners.get(channel)

    if (typeof listeners !== 'undefined') {
      listeners.add(callback)
      return
    }

    if (this.channelSubscriptionLock.has(channel)) {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(this.subscribe(channel, callback))
        }, 100)
      })
    }

    this.channelSubscriptionLock.add(channel)

    const request = new Request(`${this.options.baseUrl}/__transmit/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: this.uid, channel }),
    })

    if (this.options.beforeSubscribe) {
      this.options.beforeSubscribe(request)
    }

    const response = await fetch(request)

    if (!response.ok) {
      throw new Error(response.statusText)
    }

    if (typeof callback !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const listeners = this.listeners.get(channel)

      if (typeof listeners === 'undefined') {
        this.listeners.set(channel, new Set([callback]))
      } else {
        listeners.add(callback)
      }

      if (this.channelSubscriptionLock.has(channel)) {
        this.channelSubscriptionLock.delete(channel)
      }
    }
  }

  async unsubscribe(channel: string) {
    const request = new Request(`${this.options.baseUrl}/__transmit/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ uid: this.uid, channel }),
    })

    if (this.options.beforeUnsubscribe) {
      this.options.beforeUnsubscribe(request)
    }

    const response = await fetch(request)

    if (!response.ok) {
      throw new Error(response.statusText)
    }
  }

  on(event: Exclude<TTransmitStatus, 'connecting'>, callback: (event: CustomEvent) => void) {
    this.addEventListener(event, callback)
  }

  listenOn<T = unknown>(channel: string, callback: (message: T) => void) {
    void this.subscribe(channel, callback)

    return (unsubscribeOnTheServer?: boolean) => {
      const listeners = this.listeners.get(channel)

      if (typeof listeners === 'undefined') {
        return
      }

      listeners.delete(callback)

      if (
        (unsubscribeOnTheServer ?? this.options.removeSubscriptionOnZeroListener) &&
        listeners.size === 0
      ) {
        void this.unsubscribe(channel)
      }
    }
  }

  listenOnce<T = unknown>(channel: string, callback: (message: T) => void) {
    const unsubscribe = this.listenOn<T>(channel, (message) => {
      callback(message)
      unsubscribe()
    })
  }

  close() {
    this.eventSource.close()
  }
}
