var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
const TransmitStatus = {
    Initializing: 'initializing',
    Connecting: 'connecting',
    Connected: 'connected',
    Disconnected: 'disconnected',
    Reconnecting: 'reconnecting',
};
class Transmit extends EventTarget {
    constructor(options) {
        super();
        // Remove private identifiers
        this.uid = crypto.randomUUID();
        this.listeners = new Map();
        this.status = TransmitStatus.Initializing;
        this.reconnectAttempts = 0;
        this.channelSubscriptionLock = new Set();
        if (typeof options.eventSourceConstructor === 'undefined') {
            options.eventSourceConstructor = EventSource;
        }
        if (typeof options.maxReconnectAttempts === 'undefined') {
            options.maxReconnectAttempts = 5;
        }
        if (typeof options.removeSubscriptionOnZeroListener === 'undefined') {
            options.removeSubscriptionOnZeroListener = false;
        }
        this.options = options;
        this.connect();
    }
    changeStatus(status) {
        this.status = status;
        this.dispatchEvent(new CustomEvent(status));
    }
    connect() {
        this.changeStatus(TransmitStatus.Connecting);
        const url = new URL(this.options.baseUrl + '/__transmit/events');
        url.searchParams.append('uid', this.uid);
        this.eventSource = new this.options.eventSourceConstructor(url.toString(), {
            withCredentials: true,
        });
        this.eventSource.addEventListener('message', this.onMessage.bind(this));
        this.eventSource.addEventListener('error', this.onError.bind(this));
        this.eventSource.addEventListener('open', () => {
            this.changeStatus(TransmitStatus.Connected);
            this.reconnectAttempts = 0;
        });
    }
    onMessage(event) {
        const data = JSON.parse(event.data);
        const listeners = this.listeners.get(data.channel);
        if (typeof listeners === 'undefined') {
            return;
        }
        for (const listener of listeners.values()) {
            listener(data.payload);
        }
    }
    onError() {
        if (this.status !== TransmitStatus.Reconnecting) {
            this.changeStatus(TransmitStatus.Disconnected);
        }
        this.changeStatus(TransmitStatus.Reconnecting);
        if (this.options.onReconnectAttempt) {
            this.options.onReconnectAttempt(this.reconnectAttempts + 1);
        }
        if (this.options.maxReconnectAttempts &&
            this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this.eventSource.close();
            if (this.options.onReconnectFailed) {
                this.options.onReconnectFailed();
            }
            return;
        }
        this.reconnectAttempts++;
        // Use Array.from to create an array from the Set
        const channels = Array.from(this.listeners.keys());
        for (const channel of channels) {
            void this.subscribe(channel);
        }
    }
    subscribe(channel, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.status !== TransmitStatus.Connected) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(this.subscribe(channel, callback));
                    }, 100);
                });
            }
            const listeners = this.listeners.get(channel);
            if (typeof listeners !== 'undefined') {
                listeners.add(callback);
                return;
            }
            if (this.channelSubscriptionLock.has(channel)) {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(this.subscribe(channel, callback));
                    }, 100);
                });
            }
            this.channelSubscriptionLock.add(channel);
            const request = new Request(`${this.options.baseUrl}/__transmit/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uid: this.uid, channel }),
            });
            if (this.options.beforeSubscribe) {
                this.options.beforeSubscribe(request);
            }
            const response = yield fetch(request);
            if (!response.ok) {
                throw new Error(response.statusText);
            }
            if (typeof callback !== 'undefined') {
                // eslint-disable-next-line @typescript-eslint/no-shadow
                const listeners = this.listeners.get(channel);
                if (typeof listeners === 'undefined') {
                    this.listeners.set(channel, new Set([callback]));
                }
                else {
                    listeners.add(callback);
                }
                if (this.channelSubscriptionLock.has(channel)) {
                    this.channelSubscriptionLock.delete(channel);
                }
            }
        });
    }
    unsubscribe(channel) {
        return __awaiter(this, void 0, void 0, function* () {
            const request = new Request(`${this.options.baseUrl}/__transmit/unsubscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ uid: this.uid, channel }),
            });
            if (this.options.beforeUnsubscribe) {
                this.options.beforeUnsubscribe(request);
            }
            const response = yield fetch(request);
            if (!response.ok) {
                throw new Error(response.statusText);
            }
        });
    }
    on(event, callback) {
        this.addEventListener(event, callback);
    }
    listenOn(channel, callback) {
        void this.subscribe(channel, callback);
        return (unsubscribeOnTheServer) => {
            const listeners = this.listeners.get(channel);
            if (typeof listeners === 'undefined') {
                return;
            }
            listeners.delete(callback);
            if ((unsubscribeOnTheServer !== null && unsubscribeOnTheServer !== void 0 ? unsubscribeOnTheServer : this.options.removeSubscriptionOnZeroListener) &&
                listeners.size === 0) {
                void this.unsubscribe(channel);
            }
        };
    }
    listenOnce(channel, callback) {
        const unsubscribe = this.listenOn(channel, (message) => {
            callback(message);
            unsubscribe();
        });
    }
    close() {
        this.eventSource.close();
    }
}
