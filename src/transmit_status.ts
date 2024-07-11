export const TransmitStatus = {
    Initializing: 'initializing',
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
  } as const
  
  export type TransmitStatus = (typeof TransmitStatus)[keyof typeof TransmitStatus]