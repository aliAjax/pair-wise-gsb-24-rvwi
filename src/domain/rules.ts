import type {
  AppState,
  Correction,
  CorrectionField,
  Feature,
  FeatureKind,
  Handover,
  Issue,
  ProgressReport,
  Stratum,
} from "./types";

// 深度区间一律按半开区间 [start, end) 处理：首尾相接不算重叠。

export type Result = { ok: true; state: AppState } | { ok: false; issues: Issue[] };

let seq = 0;
function uid(prefix: string): string {
  seq += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}-${seq}`;
}

function fail(...issues: Issue[]): Result {
  return { ok: false, issues };
}

export function crewName(state: AppState, crewId: string): string {
  return state.crews.find((c) => c.id === crewId)?.name ?? crewId;
}

export function trenchStrata(state: AppState, trenchId: string): Stratum[] {
  return state.strata
    .filter((s) => s.trenchId === trenchId)
    .sort((a, b) => a.topDepth - b.topDepth);
}

export function trenchReports(state: AppState, trenchId: string): ProgressReport[] {
  return state.reports
    .filter((r) => r.trenchId === trenchId)
    .sort((a, b) => a.startDepth - b.startDepth || a.createdAt - b.createdAt);
}

export function trenchFeatures(state: AppState, trenchId: string): Feature[] {
  return state.features.filter((f) => f.trenchId === trenchId);
}

// 与区间 [start, end) 相交的地层
export function strataCovering(state: AppState, trenchId: string, start: number, end: number): Stratum[] {
  return trenchStrata(state, trenchId).filter((s) => start < s.bottomDepth && end > s.topDepth);
}

export function isHalted(state: AppState, trenchId: string): boolean {
  return state.trenches.find((t) => t.id === trenchId)?.status === "halted";
}

// 探方内是否存在尚未登记保护措施的遗迹（决定能否复挖）
export function blockingFeatures(state: AppState, trenchId: string): Feature[] {
  return trenchFeatures(state, trenchId).filter((f) => !f.protectionRegistered);
}

export interface ProgressInput {
  date: string;
  trenchId: string;
  stratumId: string;
  startDepth: number;
  advance: number;
  crossedStrata: string;
  supervisor: string;
  crewId: string;
}

// 班组上报每日进尺：探方 / 地层 / 起始深度 / 进尺 / 现场负责人
export function addProgress(state: AppState, input: ProgressInput): Result {
  const issues: Issue[] = [];
  const trench = state.trenches.find((t) => t.id === input.trenchId);
  if (!trench) {
    issues.push({ message: "探方不存在", trenchId: input.trenchId });
    return fail(...issues);
  }
  if (!input.date) issues.push({ message: "上报日期必填", trenchId: input.trenchId });
  if (!input.crewId) issues.push({ message: "上报班组必填", trenchId: input.trenchId });
  if (!input.supervisor.trim()) issues.push({ message: "现场负责人必填", trenchId: input.trenchId });
  if (!Number.isFinite(input.startDepth) || input.startDepth < 0)
    issues.push({ message: "起始深度须为不小于 0 的数值", trenchId: input.trenchId, depth: String(input.startDepth) });
  if (!Number.isFinite(input.advance) || input.advance <= 0)
    issues.push({ message: "进尺须为大于 0 的数值", trenchId: input.trenchId, depth: String(input.advance) });
  if (issues.length) return fail(...issues);

  // 保护停挖期间不得上报进尺
  if (trench.status === "halted") {
    return fail({
      message: "探方处于遗迹保护停挖，登记保护措施并复挖前不得上报进尺",
      trenchId: trench.id,
      crewId: input.crewId,
    });
  }

  const stratum = state.strata.find(
    (s) => s.id === input.stratumId && s.trenchId === input.trenchId,
  );
  if (!stratum) {
    issues.push({ message: "请选择本探方内地层", trenchId: trench.id, stratumId: input.stratumId });
    return fail(...issues);
  }

  const end = input.startDepth + input.advance;

  // 进尺区间不得重叠（半开区间，首尾相接允许）
  for (const existing of trenchReports(state, trench.id)) {
    if (input.startDepth < existing.endDepth && end > existing.startDepth) {
      issues.push({
        message: `进尺区间与既有记录 ${existing.startDepth}–${existing.endDepth}cm 重叠`,
        trenchId: trench.id,
        stratumId: existing.stratumId,
        depth: `${input.startDepth}–${end}cm`,
        crewId: existing.crewId,
        originalValue: `${existing.date} ${crewName(state, existing.crewId)}：${existing.startDepth}–${existing.endDepth}cm`,
      });
    }
  }

  // 跨层必须补记层位
  const covered = strataCovering(state, trench.id, input.startDepth, end);
  if (!covered.some((s) => s.id === stratum.id)) {
    issues.push({
      message: "所选地层与进尺深度区间不相交，请核对地层",
      trenchId: trench.id,
      stratumId: stratum.id,
      depth: `${input.startDepth}–${end}cm`,
    });
  }
  const otherLayers = covered.filter((s) => s.id !== stratum.id);
  if (otherLayers.length > 0 && !input.crossedStrata.trim()) {
    issues.push({
      message: `进尺跨层（${[stratum, ...otherLayers].map((s) => s.code).join("、")}），必须补记所跨层位`,
      trenchId: trench.id,
      stratumId: stratum.id,
      depth: `${input.startDepth}–${end}cm`,
      crewId: input.crewId,
      originalValue: otherLayers.map((s) => `${s.code} ${s.topDepth}–${s.bottomDepth}cm`).join("；"),
    });
  }
  if (issues.length) return fail(...issues);

  const report: ProgressReport = {
    id: uid("r"),
    date: input.date,
    trenchId: input.trenchId,
    stratumId: input.stratumId,
    startDepth: input.startDepth,
    advance: input.advance,
    endDepth: end,
    crossedStrata: input.crossedStrata.trim(),
    supervisor: input.supervisor.trim(),
    crewId: input.crewId,
    createdAt: Date.now() + seq,
  };
  return { ok: true, state: { ...state, reports: [...state.reports, report] } };
}

export interface FeatureInput {
  code: string;
  kind: FeatureKind;
  trenchId: string;
  depth: number;
  description: string;
  crewId: string;
  date: string;
  reportId: string | null;
}

// 发现遗迹单位：受影响探方立即转入保护停挖；发现班组永久绑定
export function addFeature(state: AppState, input: FeatureInput): Result {
  const issues: Issue[] = [];
  const trench = state.trenches.find((t) => t.id === input.trenchId);
  if (!trench) return fail({ message: "探方不存在", trenchId: input.trenchId });
  if (!input.code.trim()) issues.push({ message: "遗迹单位编号必填（如 H12）", trenchId: input.trenchId });
  if (state.features.some((f) => f.code === input.code.trim()))
    issues.push({ message: "遗迹单位编号已存在", trenchId: input.trenchId, originalValue: input.code });
  if (!input.crewId) issues.push({ message: "发现班组必填", trenchId: input.trenchId });
  if (!input.date) issues.push({ message: "发现日期必填", trenchId: input.trenchId });
  if (!Number.isFinite(input.depth) || input.depth < 0)
    issues.push({ message: "发现深度须为不小于 0 的数值", trenchId: input.trenchId, depth: String(input.depth) });
  if (input.reportId) {
    const linked = state.reports.find((r) => r.id === input.reportId);
    if (!linked || linked.trenchId !== input.trenchId)
      issues.push({ message: "关联进尺记录须属于本探方", trenchId: input.trenchId });
  }
  if (issues.length) return fail(...issues);

  const feature: Feature = {
    id: uid("f"),
    code: input.code.trim(),
    kind: input.kind,
    trenchId: input.trenchId,
    depth: input.depth,
    description: input.description.trim(),
    discoveredInReportId: input.reportId,
    crewId: input.crewId,
    date: input.date,
    protectionRegistered: false,
    protectionNote: "",
    protectedAt: null,
    resumedAt: null,
  };
  const next: AppState = {
    ...state,
    features: [...state.features, feature],
    trenches: state.trenches.map((t) =>
      t.id === input.trenchId
        ? { ...t, status: "halted", haltedFromCrewId: t.haltedFromCrewId ?? t.currentCrewId }
        : t,
    ),
  };
  return { ok: true, state: next };
}

// 登记保护措施（说明必填）
export function registerProtection(state: AppState, featureId: string, note: string, date: string): Result {
  const feature = state.features.find((f) => f.id === featureId);
  if (!feature) return fail({ message: "遗迹单位不存在" });
  if (!note.trim())
    return fail({
      message: "必须填写保护措施说明",
      trenchId: feature.trenchId,
      originalValue: feature.code,
    });
  if (!date) return fail({ message: "登记日期必填", trenchId: feature.trenchId });

  const features = state.features.map((f) =>
    f.id === featureId
      ? { ...f, protectionRegistered: true, protectionNote: note.trim(), protectedAt: date }
      : f,
  );
  return { ok: true, state: { ...state, features } };
}

export interface HandoverInput {
  trenchId: string;
  date: string;
  fromCrewId: string;
  toCrewId: string;
  pendingCoordinates: string;
  artifactStaging: string;
  note: string;
}

// 复挖更换班组时的交接：未完坐标与出土物暂存点必填，交接后探方当班班组变更
export function addHandover(state: AppState, input: HandoverInput): Result {
  const issues: Issue[] = [];
  const trench = state.trenches.find((t) => t.id === input.trenchId);
  if (!trench) return fail({ message: "探方不存在", trenchId: input.trenchId });
  if (trench.status !== "halted")
    issues.push({ message: "仅保护停挖中的探方需要办理班组交接", trenchId: input.trenchId });
  if (!input.date) issues.push({ message: "交接日期必填", trenchId: input.trenchId });
  if (input.fromCrewId !== trench.currentCrewId)
    issues.push({
      message: "移交班组与探方当前当班班组不符",
      trenchId: input.trenchId,
      crewId: input.fromCrewId,
      originalValue: crewName(state, trench.currentCrewId),
    });
  if (!input.toCrewId) issues.push({ message: "接班班组必填", trenchId: input.trenchId });
  if (input.toCrewId && input.toCrewId === input.fromCrewId)
    issues.push({ message: "更换班组交接时接班班组不能与原班组相同", trenchId: input.trenchId });
  if (!input.pendingCoordinates.trim())
    issues.push({ message: "未完坐标必填（无则注明「无」）", trenchId: input.trenchId });
  if (!input.artifactStaging.trim())
    issues.push({ message: "出土物暂存点必填（无则注明「无」）", trenchId: input.trenchId });
  if (issues.length) return fail(...issues);

  const handover: Handover = {
    id: uid("h"),
    trenchId: input.trenchId,
    date: input.date,
    fromCrewId: input.fromCrewId,
    toCrewId: input.toCrewId,
    pendingCoordinates: input.pendingCoordinates.trim(),
    artifactStaging: input.artifactStaging.trim(),
    note: input.note.trim(),
    createdAt: Date.now() + seq,
  };
  const next: AppState = {
    ...state,
    handovers: [...state.handovers, handover],
    trenches: state.trenches.map((t) =>
      t.id === input.trenchId ? { ...t, currentCrewId: input.toCrewId } : t,
    ),
  };
  return { ok: true, state: next };
}

// 复挖更换班组时，必须先完成交接（未完坐标、出土物暂存点）。
// 支持连续更换：只要存在以当前当班班组为接收方、且交接链可追溯到停挖时原班组的记录即可。
export function hasValidHandoverForCurrentCrew(state: AppState, trenchId: string): boolean {
  const trench = state.trenches.find((t) => t.id === trenchId);
  if (!trench || !trench.haltedFromCrewId) return true;
  if (trench.haltedFromCrewId === trench.currentCrewId) return true;
  const handovers = state.handovers
    .filter((h) => h.trenchId === trenchId)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (handovers.length === 0) return false;
  const last = handovers[handovers.length - 1];
  if (last.toCrewId !== trench.currentCrewId) return false;
  if (!last.pendingCoordinates.trim() || !last.artifactStaging.trim()) return false;
  // 沿交接链回溯到停挖时原班组
  let cursor: string | undefined = trench.currentCrewId;
  for (let i = handovers.length - 1; i >= 0; i--) {
    if (handovers[i].toCrewId !== cursor) return false;
    cursor = handovers[i].fromCrewId;
    if (cursor === trench.haltedFromCrewId) return true;
  }
  return false;
}

// 复挖：全部遗迹均已登记保护措施方可解除停挖
export function resumeTrench(state: AppState, trenchId: string, date: string): Result {
  const trench = state.trenches.find((t) => t.id === trenchId);
  if (!trench) return fail({ message: "探方不存在", trenchId });
  if (trench.status !== "halted")
    return fail({ message: "探方未处于停挖状态", trenchId });
  if (!date) return fail({ message: "复挖日期必填", trenchId });
  const blockers = blockingFeatures(state, trenchId);
  if (blockers.length > 0) {
    return fail({
      message: `尚有遗迹未登记保护措施：${blockers.map((f) => f.code).join("、")}，不能复挖`,
      trenchId,
      crewId: trench.currentCrewId,
      originalValue: blockers.map((f) => `${f.code}（${crewName(state, f.crewId)}发现）`).join("；"),
    });
  }
  // 复挖更换班组时，必须先完成交接（未完坐标、出土物暂存点）
  if (trench.haltedFromCrewId && trench.haltedFromCrewId !== trench.currentCrewId) {
    const handed = hasValidHandoverForCurrentCrew(state, trenchId);
    if (!handed) {
      return fail({
        message: `当班班组已由${crewName(state, trench.haltedFromCrewId)}更换为${crewName(state, trench.currentCrewId)}，须先完成交接并登记未完坐标与出土物暂存点`,
        trenchId,
        crewId: trench.currentCrewId,
        originalValue: `原班组：${crewName(state, trench.haltedFromCrewId)}`,
      });
    }
  }
  const next: AppState = {
    ...state,
    trenches: state.trenches.map((t) =>
      t.id === trenchId ? { ...t, status: "digging", haltedFromCrewId: undefined } : t,
    ),
    features: state.features.map((f) =>
      f.trenchId === trenchId && f.resumedAt === null ? { ...f, resumedAt: date } : f,
    ),
  };
  return { ok: true, state: next };
}

// 地层验收：验收后转只读
export function acceptStratum(state: AppState, stratumId: string): Result {
  const stratum = state.strata.find((s) => s.id === stratumId);
  if (!stratum) return fail({ message: "地层不存在", stratumId });
  if (stratum.accepted) return fail({ message: "地层已验收，记录只读", stratumId, originalValue: stratum.code });
  return {
    ok: true,
    state: {
      ...state,
      strata: state.strata.map((s) => (s.id === stratumId ? { ...s, accepted: true } : s)),
    },
  };
}

export const correctionFieldLabels: Record<CorrectionField, string> = {
  soil: "土色土质",
  topDepth: "层顶深度(cm)",
  bottomDepth: "层底深度(cm)",
};

export interface IntegrityCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
}

// 档案链路自检：进尺绑定、停挖与保护、交接双方、更正链等
export function integrityChecks(state: AppState): IntegrityCheck[] {
  const checks: IntegrityCheck[] = [];

  const badReports = state.reports.filter(
    (r) =>
      !state.trenches.some((t) => t.id === r.trenchId) ||
      !state.strata.some((s) => s.id === r.stratumId && s.trenchId === r.trenchId) ||
      !state.crews.some((c) => c.id === r.crewId) ||
      !(r.endDepth > r.startDepth),
  );
  checks.push({
    key: "reports",
    label: "进尺记录绑定",
    ok: badReports.length === 0,
    detail: badReports.length ? `${badReports.length} 条进尺缺少探方/地层/班组绑定` : `${state.reports.length} 条进尺均与探方、地层、班组绑定`,
  });

  const overlapTrenches = state.trenches
    .map((t) => t.id)
    .filter((tid) => {
      const rs = trenchReports(state, tid);
      return rs.some((a, i) => rs.slice(i + 1).some((b) => a.startDepth < b.endDepth && a.endDepth > b.startDepth));
    });
  checks.push({
    key: "overlap",
    label: "进尺区间不重叠",
    ok: overlapTrenches.length === 0,
    detail: overlapTrenches.length ? `重叠：${overlapTrenches.join("、")}` : "全部探方进尺区间互不重叠",
  });

  const diggingWithOpenFeature = state.trenches
    .filter((t) => t.status === "digging")
    .filter((t) => blockingFeatures(state, t.id).length > 0);
  checks.push({
    key: "protection",
    label: "停挖与保护闭环",
    ok: diggingWithOpenFeature.length === 0,
    detail: diggingWithOpenFeature.length
      ? `未闭环：${diggingWithOpenFeature.map((t) => t.id).join("、")} 存在未登记保护遗迹`
      : state.features.length === 0
        ? "暂无遗迹"
        : "在挖探方遗迹均已登记保护",
  });

  const badHandovers = state.handovers.filter(
    (h) =>
      !state.trenches.some((t) => t.id === h.trenchId) ||
      !state.crews.some((c) => c.id === h.fromCrewId) ||
      !state.crews.some((c) => c.id === h.toCrewId) ||
      h.fromCrewId === h.toCrewId ||
      !h.pendingCoordinates ||
      !h.artifactStaging,
  );
  checks.push({
    key: "handovers",
    label: "班组交接链",
    ok: badHandovers.length === 0,
    detail: badHandovers.length
      ? `${badHandovers.length} 份交接信息不完整`
      : state.handovers.length === 0
        ? "暂无交接"
        : `${state.handovers.length} 份交接均含未完坐标与暂存点`,
  });

  const badCorrections = state.corrections.filter(
    (x) =>
      !state.strata.some((s) => s.id === x.stratumId && s.accepted) ||
      !x.reason ||
      x.oldValue === x.newValue ||
      x.oldValue === "" ||
      x.oldValue === undefined,
  );
  checks.push({
    key: "corrections",
    label: "验收只读与更正链",
    ok: badCorrections.length === 0,
    detail: badCorrections.length
      ? `${badCorrections.length} 条更正链异常`
      : state.corrections.length === 0
        ? "暂无更正"
        : `${state.corrections.length} 条更正均保留原值与原因`,
  });

  return checks;
}

export interface CorrectionInput {
  date: string;
  stratumId: string;
  field: CorrectionField;
  newValue: string;
  reason: string;
}

// 已验收地层更正：不得直接改写，另立带原因的更正记录，历史原值保留可查
export function addCorrection(state: AppState, input: CorrectionInput): Result {
  const issues: Issue[] = [];
  const stratum = state.strata.find((s) => s.id === input.stratumId);
  if (!stratum) return fail({ message: "地层不存在", stratumId: input.stratumId });
  if (!stratum.accepted)
    return fail({
      message: "仅已验收（只读）地层需要走更正流程，未验收地层可直接完善记录",
      stratumId: input.stratumId,
      trenchId: stratum.trenchId,
    });
  if (!input.date) issues.push({ message: "更正日期必填", stratumId: input.stratumId });
  if (!input.reason.trim()) issues.push({ message: "更正原因必填", stratumId: input.stratumId });
  const newValue = input.newValue.trim();
  if (!newValue) issues.push({ message: "更正后数值必填", stratumId: input.stratumId });

  const oldRaw =
    input.field === "soil" ? stratum.soil : String(input.field === "topDepth" ? stratum.topDepth : stratum.bottomDepth);

  if (newValue && newValue === oldRaw)
    issues.push({ message: "更正后数值与原值相同", stratumId: input.stratumId, originalValue: oldRaw });

  let newTop = stratum.topDepth;
  let newBottom = stratum.bottomDepth;
  if (input.field !== "soil" && newValue !== "") {
    const n = Number(newValue);
    if (!Number.isFinite(n) || n < 0) {
      issues.push({ message: "深度须为不小于 0 的数值", stratumId: input.stratumId, depth: newValue });
    } else {
      if (input.field === "topDepth") newTop = n;
      else newBottom = n;
      if (newTop >= newBottom)
        issues.push({
          message: "层顶深度须小于层底深度",
          stratumId: input.stratumId,
          trenchId: stratum.trenchId,
          depth: `${newTop}–${newBottom}cm`,
          originalValue: `${stratum.topDepth}–${stratum.bottomDepth}cm`,
        });
    }
  }
  if (issues.length) return fail(...issues);

  const correction: Correction = {
    id: uid("x"),
    date: input.date,
    stratumId: input.stratumId,
    field: input.field,
    oldValue: oldRaw,
    newValue,
    reason: input.reason.trim(),
    createdAt: Date.now() + seq,
  };
  const nextStrata = state.strata.map((s) => {
    if (s.id !== stratum.id) return s;
    if (input.field === "soil") return { ...s, soil: newValue };
    if (input.field === "topDepth") return { ...s, topDepth: Number(newValue) };
    return { ...s, bottomDepth: Number(newValue) };
  });
  return {
    ok: true,
    state: { ...state, strata: nextStrata, corrections: [...state.corrections, correction] },
  };
}
