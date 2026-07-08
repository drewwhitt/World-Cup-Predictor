import { useSyncExternalStore } from "react";
import type { TeamCode } from "./types";

const STORAGE_KEY = "veridex-favorite-teams";

function loadFavorites(): Set<TeamCode> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* start empty */ }
  return new Set();
}

let favorites: Set<TeamCode> = typeof window !== "undefined" ? loadFavorites() : new Set();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch { /* localStorage unavailable — favorites just won't persist this session */ }
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return favorites;
}

export function toggleFavorite(code: TeamCode) {
  const next = new Set(favorites);
  if (next.has(code)) next.delete(code);
  else next.add(code);
  favorites = next;
  persist();
  notify();
}

export function isFavorite(code: TeamCode): boolean {
  return favorites.has(code);
}

/**
 * Every component that calls this stays in sync automatically — toggling
 * a favorite from Rankings updates the star on Home and Match Center
 * immediately, without any prop drilling. Persisted to localStorage, so
 * it survives closing the app, but it's per-browser/per-device — there's
 * no account system, so it won't follow someone to a different phone.
 */
export function useFavorites(): Set<TeamCode> {
  return useSyncExternalStore(subscribe, getSnapshot);
}