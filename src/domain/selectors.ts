// 领域派生数据：纯函数，从 AppState 读取数据，不做写操作。
import type {
  AppState,
  Correction,
  ID,
  ProgressRecord,
  Stratum,
} from "./types";

export const crewById = (s: AppState, id?: ID) =>
  s.crews.find((c) => c.id === id);

export const unitById = (s: AppState, id?: ID) =>
  s.units.find((u) => u.id === id);

export const featureById = (s: AppState, id?: ID) =>
  s.features.find((f) => f.id === id);

export const strataOfUnit = (s: AppState, unitId: ID): Stratum[] =>
  s.strata
    .filter((l) => l.unitId === unitId)
    .sort((a, b) => a.topDepth - b.topDepth);

/** 探方的进尺记录，按深度排序 */
export const progressOfUnit = (
  s: AppState,
  unitId: ID
): ProgressRecord[] =>
  s.progress
    .filter((p) => p.unitId === unitId)
    .sort((a, b) => a.startDepth - b.startDepth || a.date.localeCompare(b.date));

export const endDepth = (p: { startDepth: number; advance: number }) =>
  p.startDepth + p.advance;

/** 探方当前是否停挖 */
export const activeHaltOfUnit = (s: AppState, unitId: ID) =>
  s.halts.find((h) => h.unitId === unitId && !h.resolvedAt);

/** 遗迹在某探方的停挖是否已解除 */
export const haltOfFeatureUnit = (
  s: AppState,
  featureId: ID,
  unitId: ID
) =>
  s.halts.find(
    (h) => h.featureId === featureId && h.unitId === unitId && !h.resolvedAt
  );

/** 遗迹在某探方已登记的保护措施（措施覆盖该探方即可复挖） */
export const measureForFeatureUnit = (
  s: AppState,
  featureId: ID,
  unitId: ID
) =>
  s.measures.find(
    (m) => m.featureId === featureId && m.unitIds.includes(unitId)
  );

/** 同一地层同一字段的更正链，从旧到新 */
export const correctionChain = (
  s: AppState,
  targetId: ID,
  field: Correction["field"]
): Correction[] =>
  s.corrections
    .filter((c) => c.targetId === targetId && c.field === field)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** 地层某字段的当前展示值（原始值 + 更正链末端值） */
export const effectiveStratumValue = (
  s: AppState,
  stratum: Stratum,
  field: Correction["field"]
): string => {
  const chain = correctionChain(s, stratum.id, field);
  if (chain.length === 0) return String(stratum[field]);
  return chain[chain.length - 1].newValue;
};

/** 进尺区间 [start, end] 穿过的地层（区间与层位深度区间相交） */
export const strataCrossedByRange = (
  s: AppState,
  unitId: ID,
  start: number,
  end: number
): Stratum[] =>
  strataOfUnit(s, unitId).filter(
    (l) => end > l.topDepth && start < l.bottomDepth
  );

/** 最近一次在该探方作业的班组（用于默认选中与复挖比较） */
export const lastCrewOfUnit = (s: AppState, unitId: ID): ID | undefined => {
  const list = progressOfUnit(s, unitId);
  return list.length > 0 ? list[list.length - 1].crewId : undefined;
};
