import { seedState, STORAGE_KEY } from "./seed";
import type { AppState } from "./types";

// 档案持久化：全部写入 localStorage，刷新后探方、班组、停挖、交接与更正链保持一致。
// 不引入任何额外依赖。

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(seedState);
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || parsed.version !== seedState.version) return structuredClone(seedState);
    // 基本结构校验，缺字段时回退初始档案，避免刷新后链路断裂
    for (const key of ["crews", "trenches", "strata", "reports", "features", "handovers", "corrections"] as const) {
      if (!Array.isArray(parsed[key])) return structuredClone(seedState);
    }
    return parsed;
  } catch {
    return structuredClone(seedState);
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时仅当前会话有效，不影响页面使用
  }
}

export function resetState(): AppState {
  const fresh = structuredClone(seedState);
  saveState(fresh);
  return fresh;
}
