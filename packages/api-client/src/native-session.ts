import type { SessionUser } from "@remarket/shared";
import { ApiError } from "./errors.js";
import type { HttpTransport } from "./transport.js";

export interface TokenStore {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}
interface Credentials {
  user: SessionUser | null;
  access_token: string | null;
  refresh_token?: string;
}
export interface NativeSessionState {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
}

/** Shared by REST, socket and AppState. Persistent writes are ordered with logout. */
export class NativeSession {
  private access: string | null = null;
  private refreshToken: string | null = null;
  private generation = 0;
  private flight: Promise<boolean> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private state: NativeSessionState = {
    user: null,
    loading: true,
    error: null,
  };
  private listeners = new Set<() => void>();
  constructor(
    private readonly http: HttpTransport,
    private readonly store: TokenStore,
  ) {}
  getToken = () => this.access;
  getGeneration = () => this.generation;
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify(state: NativeSessionState) {
    const previous = this.state.user;
    const next = state.user;
    if (
      previous &&
      next &&
      (previous.id !== next.id ||
        previous.role !== next.role ||
        previous.status !== next.status ||
        previous.email_verified_at !== next.email_verified_at)
    )
      this.generation += 1;
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private changed(generation: number) {
    if (generation !== this.generation)
      throw new ApiError({
        code: "SESSION_CHANGED",
        message: "Phiên đăng nhập đã thay đổi.",
        status: 409,
      });
  }
  private persist(action: () => Promise<void>) {
    const next = this.writeQueue.then(action);
    this.writeQueue = next.catch(() => undefined);
    return next;
  }
  private async apply(data: Credentials, generation: number, rotate: boolean) {
    this.changed(generation);
    if (data.user === null && data.access_token === null) {
      await this.expire();
      return false;
    }
    if (!data.user || !data.access_token)
      throw new ApiError({
        code: "INVALID_AUTH_RESPONSE",
        message: "Phản hồi phiên không hợp lệ.",
        status: 502,
      });
    if (rotate) {
      if (!data.refresh_token)
        throw new ApiError({
          code: "INVALID_AUTH_RESPONSE",
          message: "Thiếu thông tin phiên thiết bị.",
          status: 502,
        });
      await this.persist(async () => {
        this.changed(generation);
        await this.store.write(data.refresh_token!);
      });
      this.changed(generation);
      this.refreshToken = data.refresh_token;
    }
    this.access = data.access_token;
    this.notify({ user: data.user, loading: false, error: null });
    return true;
  }
  restore = (rotate = false): Promise<boolean> => {
    if (this.flight) return this.flight;
    const generation = this.generation;
    const run = async () => {
      try {
        const token = this.refreshToken ?? (await this.store.read());
        this.changed(generation);
        if (!token) {
          this.notify({ user: null, loading: false, error: null });
          return false;
        }
        this.refreshToken = token;
        const data = await this.http.post<Credentials>(
          `/auth/mobile/${rotate ? "refresh" : "bootstrap"}`,
          { refresh_token: token },
        );
        return await this.apply(data, generation, rotate);
      } catch (error) {
        if (generation !== this.generation) return false;
        if (error instanceof ApiError && error.status === 401) {
          await this.expire();
          return false;
        }
        this.notify({
          ...this.state,
          loading: false,
          error:
            error instanceof Error
              ? error.message
              : "Không thể khôi phục phiên.",
        });
        throw error;
      }
    };
    const flight = run().finally(() => {
      if (this.flight === flight) this.flight = null;
    });
    this.flight = flight;
    return flight;
  };
  refresh = () => this.restore(true);
  async login(email: string, password: string) {
    const generation = this.generation + 1;
    await this.logout();
    this.changed(generation);
    const data = await this.http.post<Credentials>("/auth/mobile/login", {
      email,
      password,
    });
    await this.apply(data, generation, true);
  }
  async verify(token: string) {
    const generation = this.generation + 1;
    await this.logout();
    this.changed(generation);
    const data = await this.http.post<Credentials>(
      "/auth/mobile/verify-email",
      { token },
    );
    await this.apply(data, generation, true);
  }
  expire = async () => {
    this.generation += 1;
    this.access = null;
    this.refreshToken = null;
    this.flight = null;
    this.notify({ user: null, loading: false, error: null });
    await this.persist(() => this.store.clear());
  };
  async logout(): Promise<boolean> {
    const token = this.refreshToken;
    await this.expire();
    if (!token) return true;
    try {
      await this.http.post("/auth/mobile/logout", { refresh_token: token });
      return true;
    } catch {
      return false;
    }
  }
  async updateIdentity() {
    const generation = this.generation;
    const user = await this.http.get<SessionUser>("/auth/mobile/me");
    this.changed(generation);
    this.notify({ user, loading: false, error: null });
  }
}
