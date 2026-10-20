/* Data-fetching and mutation helpers with loading / error / empty states. */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

/** Load data whenever `deps` change. Survives backend downtime gracefully. */
export function useApi<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (alive) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (alive) {
          setError(err instanceof ApiError ? err.message : "Something went wrong.");
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const patch = useCallback((updater: T | ((prev: T | null) => T)) => {
    setData((prev) =>
      typeof updater === "function" ? (updater as (p: T | null) => T)(prev) : updater);
  }, []);

  return { data, loading, error, reload, setData: patch };
}

export interface MutationState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult | null>;
  pending: boolean;
  error: string | null;
  clearError: () => void;
}

/** Wrap a mutating API call with pending + error handling. */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  callbacks?: { onSuccess?: (result: TResult) => void; onError?: (message: string) => void },
): MutationState<TArgs, TResult> {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const run = useCallback(async (...args: TArgs) => {
    setPending(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      cbRef.current?.onSuccess?.(result);
      return result;
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
      setError(message);
      cbRef.current?.onError?.(message);
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, clearError: () => setError(null) };
}

/* ------------------------------------------------------------- toasts ---- */
export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

let toastCounter = 0;
export function makeToast(kind: ToastKind, title: string, description?: string): Toast {
  toastCounter += 1;
  return { id: toastCounter, kind, title, description };
}

/** Debounce a rapidly changing value (search boxes). */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
