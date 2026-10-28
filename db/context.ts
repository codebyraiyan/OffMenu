import { AsyncLocalStorage } from "node:async_hooks";

export const activeDatabaseTransaction = new AsyncLocalStorage<any>();
