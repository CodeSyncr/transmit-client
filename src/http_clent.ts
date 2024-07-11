interface HttpClientOptions {
    baseUrl: string
    uid: string
  }
  
  export class HttpClient {
    #options: HttpClientOptions
  
    constructor(options: HttpClientOptions) {
      this.#options = options
    }
  
    send(request: Request) {
      return fetch(request)
    }
  
    createRequest(path: string, body: Record<string, unknown>) {
      return new Request(`${this.#options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': this.#retrieveXsrfToken() ?? '',
        },
        body: JSON.stringify({ uid: this.#options.uid, ...body }),
        credentials: 'include',
      })
    }
  
    #retrieveXsrfToken() {
      //? This is a browser-only feature
      if (typeof document === 'undefined') return null
  
      const match = document.cookie.match(new RegExp('(^|;\\s*)(XSRF-TOKEN)=([^;]*)'))
  
      return match ? decodeURIComponent(match[3]) : null
    }
  }