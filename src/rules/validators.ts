// 校验规则层：全部业务约束集中实现，纯函数返回冲突列表，不读写存储、不依赖 React。
import {
  effectiveStratumValue,
  endDepth,
  measureForFeatureUnit,
  strataCrossedByRange,
  strataOfUnit,
} from "../domain/selectors";
import type {
  AppState,
  CorrectionInput,
  DraftReviseInput,
  FeatureInput,
  ID,
  MeasureInput,
  ProgressInput,
  ResumeInput,
  Stratum,
  StratumField,
} from "../domain/types";

/** 冲突上下文：冲突时必须能定位到 探方 / 地层 / 深度 / 班组 / 原值 */
export interface ConflictContext {
  unitId?: ID;
  stratumId?: ID;
  depth?: string;
  crewId?: ID;
  oldValue?: string;
}

export interface Conflict {
  code: string;
  field?: string;
  message: string;
  context?: ConflictContext;
}

const NUMERIC_FIELDS: StratumField[] = ["topDepth", "bottomDepth"];
const DEPTH_CTX = (p: { startDepth: number; advance: number }) =>
  `${p.startDepth}–${endDepth(p)} cm`;

// ---------- 每日进尺上报 ----------

export function validateProgress(s: AppState, input: ProgressInput): Conflict[] {
  const conflicts: Conflict[] = [];
  const unit = s.units.find((u) => u.id === input.unitId);

  if (!input.date) {
    conflicts.push({ code: "PROG_DATE_REQUIRED", field: "date", message: "请选择上报日期" });
  }
  if (!unit) {
    conflicts.push({ code: "PROG_UNIT_REQUIRED", field: "unitId", message: "请选择探方" });
  }
  if (!input.crewId) {
    conflicts.push({ code: "PROG_CREW_REQUIRED", field: "crewId", message: "请选择上报班组" });
  }
  if (!input.supervisor.trim()) {
    conflicts.push({ code: "PROG_SUPERVISOR_REQUIRED", field: "supervisor", message: "请填写现场负责人" });
  }
  if (input.startDepth < 0 || !Number.isFinite(input.startDepth)) {
    conflicts.push({ code: "PROG_START_INVALID", field: "startDepth", message: "起始深度须为不小于 0 的数值" });
  }
  if (input.advance <= 0 || !Number.isFinite(input.advance)) {
    conflicts.push({ code: "PROG_ADVANCE_INVALID", field: "advance", message: "进尺须为大于 0 的数值" });
  }
  if (!unit) return conflicts;

  const layer = s.strata.find((l) => l.id === input.layerId);
  if (!layer || layer.unitId !== unit.id) {
    conflicts.push({
      code: "PROG_LAYER_REQUIRED",
      field: "layerId",
      message: "请选择本探方内的地层",
      context: { unitId: unit.id },
    });
    return conflicts;
  }

  // 规则 1：受影响探方保护停挖期间不得上报进尺（未登记保护措施不能复挖）
  const halt = s.halts.find((h) => h.unitId === unit.id && !h.resolvedAt);
  if (halt) {
    conflicts.push({
      code: "PROG_UNIT_HALTED",
      field: "unitId",
      message: "探方因遗迹保护停挖中，须先登记保护措施并办理复挖，方可上报进尺",
      context: { unitId: unit.id, crewId: input.crewId, depth: DEPTH_CTX(input) },
    });
  }

  if (input.advance > 0 && Number.isFinite(input.startDepth)) {
    const start = input.startDepth;
    const end = endDepth(input);

    // 规则 2：同一探方进尺区间不得重叠
    for (const existing of s.progress.filter((p) => p.unitId === unit.id)) {
      if (start < endDepth(existing) && existing.startDepth < end) {
        const eLayer = s.strata.find((l) => l.id === existing.layerId);
        conflicts.push({
          code: "PROG_OVERLAP",
          field: "startDepth",
          message: `进尺区间与 ${existing.date} 的已报记录重叠，进尺区间不得重叠`,
          context: {
            unitId: unit.id,
            stratumId: eLayer?.id,
            depth: `新报 ${start}–${end} cm ／ 已报 ${DEPTH_CTX(existing)}`,
            crewId: existing.crewId,
            oldValue: `${existing.startDepth} cm 起、进尺 ${existing.advance} cm`,
          },
        });
      }
    }

    // 规则 3：跨层必须补记层位（穿过主层位以外的每个层位都要补记）
    const crossed = strataCrossedByRange(s, unit.id, start, end);

    // 主层位必须是起始深度所在层位（其余穿过的层位走跨层补记）
    const startLayer = crossed.find((l) => start >= l.topDepth && start < l.bottomDepth);
    if (startLayer && startLayer.id !== layer.id) {
      conflicts.push({
        code: "PROG_MAIN_LAYER_MISMATCH",
        field: "layerId",
        message: `起始深度 ${start} cm 位于 ${startLayer.code}，主层位应选择起始段所在层位，其余层位通过跨层补记登记`,
        context: { unitId: unit.id, stratumId: layer.id, depth: `${start}–${end} cm`, crewId: input.crewId },
      });
    }

    const extras = crossed.filter((l) => l.id !== layer.id);
    for (const extra of extras) {
      const sup = input.supplements.find((sp) => sp.layerCode === extra.code);
      if (!sup) {
        conflicts.push({
          code: "PROG_CROSS_LAYER_MISSING",
          field: "supplements",
          message: `进尺区间穿过 ${extra.code}（${extra.topDepth}–${extra.bottomDepth} cm），跨层必须补记层位`,
          context: { unitId: unit.id, stratumId: extra.id, depth: `${start}–${end} cm`, crewId: input.crewId },
        });
      } else {
        if (!sup.note.trim()) {
          conflicts.push({
            code: "PROG_CROSS_LAYER_NOTE",
            field: "supplements",
            message: `${extra.code} 的补记须填写层位说明`,
            context: { unitId: unit.id, stratumId: extra.id, depth: `${start}–${end} cm`, crewId: input.crewId },
          });
        }
        if (sup.fromDepth >= sup.toDepth || sup.toDepth <= start || sup.fromDepth >= end) {
          conflicts.push({
            code: "PROG_CROSS_LAYER_RANGE",
            field: "supplements",
            message: `${extra.code} 的补记深度段无效，须落在本次进尺 ${start}–${end} cm 内`,
            context: { unitId: unit.id, stratumId: extra.id, depth: `${sup.fromDepth}–${sup.toDepth} cm`, crewId: input.crewId },
          });
        }
      }
    }
    // 补记了未穿过的层位同样视为错误
    for (const sup of input.supplements) {
      if (sup.layerCode && !crossed.some((l) => l.code === sup.layerCode)) {
        conflicts.push({
          code: "PROG_CROSS_LAYER_UNEXPECTED",
          field: "supplements",
          message: `${sup.layerCode} 不在本次进尺 ${start}–${end} cm 穿过的层位中`,
          context: { unitId: unit.id, depth: `${start}–${end} cm`, crewId: input.crewId },
        });
      }
    }
  }

  return conflicts;
}

// ---------- 发现遗迹单位 ----------

export function validateFeature(s: AppState, input: FeatureInput): Conflict[] {
  const conflicts: Conflict[] = [];
  const host = s.units.find((u) => u.id === input.hostUnitId);

  if (!input.code.trim()) {
    conflicts.push({ code: "FEATURE_CODE_REQUIRED", field: "code", message: "请填写遗迹单位编号" });
  } else if (s.features.some((f) => f.code === input.code.trim())) {
    conflicts.push({
      code: "FEATURE_CODE_DUPLICATE",
      field: "code",
      message: `遗迹单位 ${input.code} 已登记，编号不得重复`,
      context: { oldValue: input.code },
    });
  }
  if (!host) {
    conflicts.push({ code: "FEATURE_HOST_REQUIRED", field: "hostUnitId", message: "请选择所在探方" });
  }
  if (input.affectedUnitIds.length === 0) {
    conflicts.push({ code: "FEATURE_AFFECTED_REQUIRED", field: "affectedUnitIds", message: "至少选择所在探方为受影响探方" });
  }
  if (input.depth <= 0 || !Number.isFinite(input.depth)) {
    conflicts.push({ code: "FEATURE_DEPTH_INVALID", field: "depth", message: "发现深度须为大于 0 的数值" });
  }
  if (!input.crewId) {
    conflicts.push({ code: "FEATURE_CREW_REQUIRED", field: "crewId", message: "请选择发现班组" });
  }
  if (!input.note.trim()) {
    conflicts.push({ code: "FEATURE_NOTE_REQUIRED", field: "note", message: "请填写遗迹现象描述" });
  }
  if (host && input.progressId) {
    const pr = s.progress.find((p) => p.id === input.progressId);
    if (!pr || pr.unitId !== host.id) {
      conflicts.push({
        code: "FEATURE_PROGRESS_MISMATCH",
        field: "progressId",
        message: "关联进尺记录必须属于所在探方",
        context: { unitId: host.id },
      });
    } else if (input.crewId && pr.crewId !== input.crewId) {
      conflicts.push({
        code: "FEATURE_CREW_BIND",
        field: "crewId",
        message: "发现班组须与所关联进尺记录的上报班组一致，原班组的进尺与发现记录保持绑定",
        context: { unitId: host.id, crewId: pr.crewId, depth: DEPTH_CTX(pr), oldValue: s.crews.find((c) => c.id === pr.crewId)?.name ?? pr.crewId },
      });
    }
  }
  return conflicts;
}

// ---------- 登记保护措施 ----------

export function validateMeasure(s: AppState, input: MeasureInput): Conflict[] {
  const conflicts: Conflict[] = [];
  const feature = s.features.find((f) => f.id === input.featureId);

  if (!feature) {
    conflicts.push({ code: "MEASURE_FEATURE_REQUIRED", field: "featureId", message: "请选择遗迹单位" });
    return conflicts;
  }
  if (feature.status !== "active") {
    conflicts.push({
      code: "MEASURE_FEATURE_CLEARED",
      field: "featureId",
      message: `遗迹 ${feature.code} 已处理完毕，无需重复登记`,
      context: { oldValue: feature.status },
    });
  }
  if (input.unitIds.length === 0) {
    conflicts.push({ code: "MEASURE_UNITS_REQUIRED", field: "unitIds", message: "请勾选措施覆盖的受影响探方" });
  }
  for (const unitId of input.unitIds) {
    if (!feature.affectedUnitIds.includes(unitId)) {
      conflicts.push({
        code: "MEASURE_UNIT_NOT_AFFECTED",
        field: "unitIds",
        message: "措施只能覆盖该遗迹的受影响探方",
        context: { unitId },
      });
    } else if (measureForFeatureUnit(s, feature.id, unitId)) {
      conflicts.push({
        code: "MEASURE_ALREADY_REGISTERED",
        field: "unitIds",
        message: "该探方已登记保护措施",
        context: { unitId },
      });
    }
  }
  if (!input.content.trim()) {
    conflicts.push({ code: "MEASURE_CONTENT_REQUIRED", field: "content", message: "请填写保护措施内容" });
  }
  if (!input.operator.trim()) {
    conflicts.push({ code: "MEASURE_OPERATOR_REQUIRED", field: "operator", message: "请填写保护措施登记人" });
  }
  return conflicts;
}

// ---------- 复挖与班组交接 ----------

export function validateResume(s: AppState, input: ResumeInput): Conflict[] {
  const conflicts: Conflict[] = [];
  const unit = s.units.find((u) => u.id === input.unitId);
  if (!unit) {
    conflicts.push({ code: "RESUME_UNIT_REQUIRED", field: "unitId", message: "请选择复挖探方" });
    return conflicts;
  }

  if (!input.toCrewId) {
    conflicts.push({ code: "RESUME_CREW_REQUIRED", field: "toCrewId", message: "请选择接班班组" });
  }

  // 规则：未登记保护措施不能复挖（该探方名下每个未解除的停挖都要先有措施）
  const activeHalts = s.halts.filter((h) => h.unitId === unit.id && !h.resolvedAt);
  if (activeHalts.length === 0) {
    conflicts.push({
      code: "RESUME_NOT_HALTED",
      field: "unitId",
      message: "该探方当前不在保护停挖状态",
      context: { unitId: unit.id },
    });
  }
  for (const halt of activeHalts) {
    if (!measureForFeatureUnit(s, halt.featureId, unit.id)) {
      const f = s.features.find((x) => x.id === halt.featureId);
      conflicts.push({
        code: "RESUME_MEASURE_MISSING",
        field: "unitId",
        message: `遗迹 ${f?.code ?? ""} 的保护措施未登记，未登记保护措施不能复挖`,
        context: { unitId: unit.id, crewId: input.toCrewId },
      });
    }
  }

  // 规则：复挖更换班组时必须交接未完坐标和出土物暂存点
  const lastCrew = lastProgressCrew(s, unit.id);
  if (input.toCrewId && lastCrew && input.toCrewId !== lastCrew) {
    const hd = input.handover;
    if (!hd || hd.unfinishedCoordinates.length === 0 || hd.unfinishedCoordinates.some((x) => !x.trim())) {
      conflicts.push({
        code: "RESUME_HANDOVER_COORDS",
        field: "unfinishedCoordinates",
        message: `更换班组复挖须交接未完坐标（原班组：${s.crews.find((c) => c.id === lastCrew)?.name ?? ""}）`,
        context: { unitId: unit.id, crewId: lastCrew, oldValue: s.crews.find((c) => c.id === input.toCrewId)?.name ?? "" },
      });
    }
    if (!hd || !hd.stagingPoint.trim()) {
      conflicts.push({
        code: "RESUME_HANDOVER_STAGING",
        field: "stagingPoint",
        message: "更换班组复挖须交接出土物暂存点",
        context: { unitId: unit.id, crewId: lastCrew },
      });
    }
    if (!hd || !hd.supervisor.trim()) {
      conflicts.push({
        code: "RESUME_HANDOVER_SUPERVISOR",
        field: "supervisor",
        message: "更换班组复挖须填写交接负责人",
        context: { unitId: unit.id, crewId: lastCrew },
      });
    }
  }
  return conflicts;
}

/** 该探方最后一条进尺记录的班组（交接以原班组为准） */
function lastProgressCrew(s: AppState, unitId: ID): ID | undefined {
  const list = s.progress
    .filter((p) => p.unitId === unitId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return list.length > 0 ? list[list.length - 1].crewId : undefined;
}

// ---------- 验收与更正 ----------

export function validateAccept(s: AppState, stratumId: ID): Conflict[] {
  const stratum = s.strata.find((l) => l.id === stratumId);
  if (!stratum) {
    return [{ code: "STRATUM_NOT_FOUND", message: "地层不存在" }];
  }
  if (stratum.accepted) {
    return [{
      code: "STRATUM_ALREADY_ACCEPTED",
      message: "地层已验收，验收后只读",
      context: { unitId: stratum.unitId, stratumId: stratum.id, oldValue: `验收于 ${stratum.acceptedAt ?? ""}` },
    }];
  }
  return [];
}

function stratumFieldLabel(field: StratumField): string {
  return field === "code" ? "层位编号" : field === "topDepth" ? "层顶深度" : field === "bottomDepth" ? "层底深度" : "土色土质";
}

function validateStratumChange(
  s: AppState,
  stratum: Stratum,
  field: StratumField,
  rawValue: string,
  requireReason: boolean,
  reason: string,
  operator: string
): Conflict[] {
  const conflicts: Conflict[] = [];
  const unitId = stratum.unitId;
  const oldValue = effectiveStratumValue(s, stratum, field);
  const baseContext = { unitId, stratumId: stratum.id, oldValue };

  if (!rawValue.trim()) {
    conflicts.push({ code: "STRATUM_VALUE_REQUIRED", field, message: `${stratumFieldLabel(field)}不能为空`, context: baseContext });
  }
  if (NUMERIC_FIELDS.includes(field) && rawValue.trim() !== "" && !Number.isFinite(Number(rawValue))) {
    conflicts.push({ code: "STRATUM_VALUE_NUMBER", field, message: `${stratumFieldLabel(field)}须为数值`, context: baseContext });
  }
  if (rawValue.trim() === oldValue) {
    conflicts.push({ code: "STRATUM_VALUE_UNCHANGED", field, message: "新值与原值相同，无需更正", context: baseContext });
  }
  if (requireReason && !reason.trim()) {
    conflicts.push({ code: "CORRECTION_REASON_REQUIRED", field: "reason", message: "更正验收地层须填写更正原因", context: baseContext });
  }
  if (requireReason && !operator.trim()) {
    conflicts.push({ code: "CORRECTION_OPERATOR_REQUIRED", field: "operator", message: "请填写更正操作人", context: baseContext });
  }

  // 深度对的一致性校验（用更正后的新值配对另一字段的当前值）
  if (NUMERIC_FIELDS.includes(field) && rawValue.trim() !== "" && Number.isFinite(Number(rawValue))) {
    const otherField: StratumField = field === "topDepth" ? "bottomDepth" : "topDepth";
    const otherValue = Number(effectiveStratumValue(s, stratum, otherField));
    const top = field === "topDepth" ? Number(rawValue) : otherValue;
    const bottom = field === "bottomDepth" ? Number(rawValue) : otherValue;
    if (top >= bottom) {
      conflicts.push({
        code: "STRATUM_DEPTH_ORDER",
        field,
        message: `层顶深度须小于层底深度（${stratumFieldLabel(otherField)}当前为 ${otherValue} cm）`,
        context: { ...baseContext, depth: `将为 ${top}–${bottom} cm` },
      });
    }
  }
  return conflicts;
}

/** 验收过的地层只读：更正须另立带原因记录 */
export function validateCorrection(s: AppState, input: CorrectionInput): Conflict[] {
  const stratum = s.strata.find((l) => l.id === input.targetId);
  if (!stratum) return [{ code: "STRATUM_NOT_FOUND", message: "地层不存在" }];
  if (!stratum.accepted) {
    return [{
      code: "CORRECTION_NOT_ACCEPTED",
      message: "未验收地层可直接修订，无需走更正链",
      context: { unitId: stratum.unitId, stratumId: stratum.id },
    }];
  }
  return validateStratumChange(s, stratum, input.field, input.newValue, true, input.reason, input.operator);
}

/** 未验收地层可直接修订（不产生更正记录） */
export function validateDraftRevise(s: AppState, input: DraftReviseInput): Conflict[] {
  const stratum = s.strata.find((l) => l.id === input.targetId);
  if (!stratum) return [{ code: "STRATUM_NOT_FOUND", message: "地层不存在" }];
  if (stratum.accepted) {
    return [{
      code: "DRAFT_REVISE_ACCEPTED",
      message: "验收过的地层只读，更正时须另立带原因记录",
      context: { unitId: stratum.unitId, stratumId: stratum.id, oldValue: `验收于 ${stratum.acceptedAt ?? ""}` },
    }];
  }
  return validateStratumChange(s, stratum, input.field, input.newValue, false, "", "");
}

// ---------- 页面辅助：预判进尺穿过的层位 ----------

export interface CrossLayerExpectation {
  layerId: ID;
  code: string;
  topDepth: number;
  bottomDepth: number;
  isMain: boolean;
}

export function crossLayerExpectations(
  s: AppState,
  unitId: ID,
  start: number,
  end: number,
  mainLayerId: ID
): CrossLayerExpectation[] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return strataCrossedByRange(s, unitId, start, end).map((l) => ({
    layerId: l.id,
    code: l.code,
    topDepth: l.topDepth,
    bottomDepth: l.bottomDepth,
    isMain: l.id === mainLayerId,
  }));
}

/** 供页面展示的可选主层位（按深度排序） */
export function unitLayerOptions(s: AppState, unitId: ID): Stratum[] {
  return strataOfUnit(s, unitId);
}
