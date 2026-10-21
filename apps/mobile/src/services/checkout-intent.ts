import type { CheckoutPayload } from "@remarket/shared";
/** Keep a possibly committed attempt unchanged until its response is resolved. */
export class CheckoutIntent {
  private attempt: { payload: CheckoutPayload; key: string } | null = null;
  constructor(private readonly uuid: () => string) {}
  getOrCreate(payload: CheckoutPayload) {
    this.attempt ??= {
      payload: JSON.parse(JSON.stringify(payload)) as CheckoutPayload,
      key: this.uuid(),
    };
    return this.attempt;
  }
  clear() {
    this.attempt = null;
  }
  get pending() {
    return this.attempt !== null;
  }
  get current() {
    return this.attempt;
  }
}
