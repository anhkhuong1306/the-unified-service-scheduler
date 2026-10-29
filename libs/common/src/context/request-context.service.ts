import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  ActorContextPatch,
  ActorType,
  DEFAULT_ACTOR_TYPE,
  RequestContextStore,
} from './request-context.interface';

/**
 * Per-request execution context backed by Node.js `AsyncLocalStorage` (§11.1 of SYSTEM_DESIGN.md).
 *
 * Isolates correlation ID, authenticated JWT subject (`sub`), actor type,
 * tenant ID, dealership ID, and roles across concurrent async operations on the event loop.
 */
@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContextStore>();

  /**
   * Create a complete `RequestContextStore` merging partial overrides with safe defaults.
   */
  public static createStore(partial?: Partial<RequestContextStore>): RequestContextStore {
    const rawCorrelationId = partial?.correlationId?.trim() ?? '';
    const correlationId = rawCorrelationId !== '' ? rawCorrelationId : randomUUID();

    const rawActorSub = partial?.actorSub?.trim() ?? null;
    const actorSub = rawActorSub !== null && rawActorSub !== '' ? rawActorSub : null;

    const actorType: ActorType = partial?.actorType ?? DEFAULT_ACTOR_TYPE;
    const tenantId = partial?.tenantId ?? null;
    const dealershipId = partial?.dealershipId ?? null;
    const roles = Array.isArray(partial?.roles) ? [...partial.roles] : [];

    return {
      correlationId,
      actorSub,
      actorType,
      tenantId,
      dealershipId,
      roles,
    };
  }

  /**
   * Execute `callback` within an isolated `AsyncLocalStorage` context.
   */
  public static run<T>(partialStore: Partial<RequestContextStore>, callback: () => T): T {
    const store = RequestContextService.createStore(partialStore);
    return RequestContextService.storage.run(store, callback);
  }

  /**
   * Enter a new `AsyncLocalStorage` store for the current async execution context.
   */
  public static enterWith(partialStore?: Partial<RequestContextStore>): RequestContextStore {
    const store = RequestContextService.createStore(partialStore);
    RequestContextService.storage.enterWith(store);
    return store;
  }

  /**
   * Reset the active store in the current async execution context (useful between unit tests).
   */
  public static reset(): void {
    RequestContextService.storage.enterWith(undefined as unknown as RequestContextStore);
  }

  /**
   * Retrieve the current `RequestContextStore`. If none is active in `AsyncLocalStorage`,
   * lazily initializes and attaches a default store with a fresh UUID v4 correlation ID.
   */
  public static current(): RequestContextStore {
    const existing = RequestContextService.storage.getStore();
    if (existing) {
      if (!existing.correlationId || existing.correlationId.trim() === '') {
        existing.correlationId = randomUUID();
      }
      return existing;
    }

    return RequestContextService.enterWith();
  }

  public static getCorrelationId(): string {
    return RequestContextService.current().correlationId;
  }

  public static setCorrelationId(correlationId: string): void {
    const store = RequestContextService.current();
    const trimmed = correlationId.trim();
    store.correlationId = trimmed !== '' ? trimmed : randomUUID();
  }

  public static getActorSub(): string | null {
    return RequestContextService.current().actorSub;
  }

  public static getActorType(): ActorType {
    return RequestContextService.current().actorType;
  }

  public static getTenantId(): number | null {
    return RequestContextService.current().tenantId;
  }

  public static getDealershipId(): number | null {
    return RequestContextService.current().dealershipId;
  }

  public static getRoles(): string[] {
    return [...RequestContextService.current().roles];
  }

  public static setActor(actor: ActorContextPatch): void {
    const store = RequestContextService.current();

    if (actor.actorSub !== undefined) {
      const trimmedSub = actor.actorSub?.trim() ?? null;
      store.actorSub = trimmedSub !== null && trimmedSub !== '' ? trimmedSub : null;
    }

    if (actor.actorType !== undefined) {
      store.actorType = actor.actorType;
    }

    if (actor.tenantId !== undefined) {
      store.tenantId = actor.tenantId;
    }

    if (actor.dealershipId !== undefined) {
      store.dealershipId = actor.dealershipId;
    }

    if (actor.roles !== undefined) {
      store.roles = [...actor.roles];
    }
  }

  /**
   * Returns `true` when the current execution is performed by a system job or without an authenticated user subject.
   */
  public static isSystemActor(): boolean {
    const store = RequestContextService.current();
    return store.actorType === 'system' || !store.actorSub;
  }

  // Instance methods delegating to static methods for DI consumers
  public run<T>(partialStore: Partial<RequestContextStore>, callback: () => T): T {
    return RequestContextService.run(partialStore, callback);
  }

  public enterWith(partialStore?: Partial<RequestContextStore>): RequestContextStore {
    return RequestContextService.enterWith(partialStore);
  }

  public reset(): void {
    RequestContextService.reset();
  }

  public current(): RequestContextStore {
    return RequestContextService.current();
  }

  public getCorrelationId(): string {
    return RequestContextService.getCorrelationId();
  }

  public setCorrelationId(correlationId: string): void {
    RequestContextService.setCorrelationId(correlationId);
  }

  public getActorSub(): string | null {
    return RequestContextService.getActorSub();
  }

  public getActorType(): ActorType {
    return RequestContextService.getActorType();
  }

  public getTenantId(): number | null {
    return RequestContextService.getTenantId();
  }

  public getDealershipId(): number | null {
    return RequestContextService.getDealershipId();
  }

  public getRoles(): string[] {
    return RequestContextService.getRoles();
  }

  public setActor(actor: ActorContextPatch): void {
    RequestContextService.setActor(actor);
  }

  public isSystemActor(): boolean {
    return RequestContextService.isSystemActor();
  }
}
