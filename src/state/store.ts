// 状态存储：零依赖。useSyncExternalStore + localStorage，刷新后探方、班组、
// 停挖、交接与更正链整体恢复；所有动作先过校验规则，冲突则状态不变。
import { useSyncExternalStore } from "react";
import { createSeedState, STORAGE_KEY } from "../domain/seed";
import type { AppState } from "../domain/types";
import {
  validateAccept,
  validateCorrection,
  validateDraftRevise,
  validateFeature,
  validateMeasure,
  validateProgress,
  validateResume,
  type Conflict,
} from "../rules/validators";
import { applyAction, type Action, type DispatchResult } from "./reducer";

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && Array.isArray(parsed.units) && Array.isArray(parsed.progress)) {
        return parsed;
      }
    }
  } catch {
    // 存储损坏时回落到示例档案
  }
  return createSeedState();
}

let state: AppState = load();
let listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅保留内存态
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getState(): AppState {
  return state;
}

function validate(a: Action): Conflict[] {
  switch (a.type) {
    case "progress":
      return validateProgress(state, a.input);
    case "feature":
      return validateFeature(state, a.input);
    case "measure":
      return validateMeasure(state, a.input);
    case "resume":
      return validateResume(state, a.input);
    case "accept":
      return validateAccept(state, a.stratumId);
    case "correction":
      return validateCorrection(state, a.input);
    case "draftRevise":
      return validateDraftRevise(state, a.input);
    case "reset":
      return [];
  }
}

export function dispatch(action: Action): DispatchResult {
  const conflicts = validate(action);
  const next = applyAction(state, action, conflicts, createSeedState);
  if (!next) return { ok: false, conflicts };
  state = next;
  persist();
  emit();
  return { ok: true, conflicts: [] };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useArchive(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}
