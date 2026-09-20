// 状态层：在校验通过后应用领域变更。reducer 为纯函数，不包含校验细节。
import type {
  AppState,
  CorrectionInput,
  DraftReviseInput,
  FeatureInput,
  MeasureInput,
  ProgressInput,
  ResumeInput,
} from "../domain/types";
import type { Conflict } from "../rules/validators";

export type Action =
  | { type: "progress"; input: ProgressInput }
  | { type: "feature"; input: FeatureInput }
  | { type: "measure"; input: MeasureInput }
  | { type: "resume"; input: ResumeInput }
  | { type: "accept"; stratumId: string }
  | { type: "correction"; input: CorrectionInput }
  | { type: "draftRevise"; input: DraftReviseInput }
  | { type: "reset" };

export interface DispatchResult {
  ok: boolean;
  conflicts: Conflict[];
}

const now = () => new Date().toISOString();

function clone(s: AppState): AppState {
  return JSON.parse(JSON.stringify(s)) as AppState;
}

/** 仅在校验无冲突时调用；成功返回新状态，失败返回 null */
export function applyAction(
  state: AppState,
  action: Action,
  conflicts: Conflict[],
  seed: () => AppState
): AppState | null {
  if (action.type === "reset") return seed();
  if (conflicts.length > 0) return null;

  const s = clone(state);
  const takeId = (prefix: string) => {
    s.meta.seq += 1;
    return `${prefix}-${s.meta.seq}`;
  };

  switch (action.type) {
    case "progress": {
      const i = action.input;
      s.progress.push({
        id: takeId("pr"),
        date: i.date,
        unitId: i.unitId,
        layerId: i.layerId,
        startDepth: i.startDepth,
        advance: i.advance,
        crewId: i.crewId,
        supervisor: i.supervisor.trim(),
        crossLayer: i.supplements.length
          ? i.supplements.map((sp) => ({ ...sp, note: sp.note.trim() }))
          : undefined,
        createdAt: now(),
      });
      return s;
    }

    case "feature": {
      const i = action.input;
      const fid = takeId("f");
      s.features.push({
        id: fid,
        code: i.code.trim(),
        type: i.type,
        hostUnitId: i.hostUnitId,
        affectedUnitIds: i.affectedUnitIds,
        depth: i.depth,
        note: i.note.trim(),
        crewId: i.crewId,
        progressId: i.progressId,
        status: "active",
        discoveredAt: i.date,
      });
      // 受影响探方全部转入保护停挖
      for (const unitId of i.affectedUnitIds) {
        s.halts.push({
          id: takeId("h"),
          unitId,
          featureId: fid,
          reason: `发现${i.type} ${i.code.trim()}，转入遗迹保护`,
          startedAt: now(),
        });
        const unit = s.units.find((u) => u.id === unitId);
        if (unit) unit.status = "halted";
      }
      return s;
    }

    case "measure": {
      const i = action.input;
      s.measures.push({
        id: takeId("m"),
        featureId: i.featureId,
        unitIds: [...i.unitIds],
        content: i.content.trim(),
        operator: i.operator.trim(),
        createdAt: now(),
      });
      return s;
    }

    case "resume": {
      const i = action.input;
      let handoverId: string | undefined;
      const lastCrew = [...s.progress]
        .filter((p) => p.unitId === i.unitId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .pop()?.crewId;

      if (i.handover && lastCrew && i.toCrewId !== lastCrew) {
        handoverId = takeId("hd");
        s.handovers.push({
          id: handoverId,
          unitId: i.unitId,
          fromCrewId: lastCrew,
          toCrewId: i.toCrewId,
          unfinishedCoordinates: i.handover.unfinishedCoordinates.map((x) => x.trim()).filter(Boolean),
          stagingPoint: i.handover.stagingPoint.trim(),
          supervisor: i.handover.supervisor.trim(),
          createdAt: now(),
        });
      }
      const resumeId = takeId("r");
      const ts = now();
      s.resumes.push({ id: resumeId, unitId: i.unitId, crewId: i.toCrewId, handoverId, createdAt: ts });
      for (const halt of s.halts) {
        if (halt.unitId === i.unitId && !halt.resolvedAt) {
          halt.resolvedAt = ts;
          halt.resumeId = resumeId;
        }
      }
      const unit = s.units.find((u) => u.id === i.unitId);
      if (unit) unit.status = "digging";

      // 遗迹名下受影响探方全部复挖后，遗迹状态转为已处理
      for (const feature of s.features) {
        const stillHalted = feature.affectedUnitIds.some((uid) =>
          s.halts.some((h) => h.featureId === feature.id && h.unitId === uid && !h.resolvedAt)
        );
        if (!stillHalted) feature.status = "cleared";
      }
      return s;
    }

    case "accept": {
      const stratum = s.strata.find((l) => l.id === action.stratumId);
      if (stratum) {
        stratum.accepted = true;
        stratum.acceptedAt = now();
      }
      return s;
    }

    case "correction": {
      const i = action.input;
      const stratum = s.strata.find((l) => l.id === i.targetId)!;
      const chain = s.corrections
        .filter((c) => c.targetId === i.targetId && c.field === i.field)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const previous = chain[chain.length - 1];
      s.corrections.push({
        id: takeId("cr"),
        targetId: i.targetId,
        field: i.field,
        oldValue: previous ? previous.newValue : String(stratum[i.field]),
        newValue: i.newValue.trim(),
        reason: i.reason.trim(),
        operator: i.operator.trim(),
        createdAt: now(),
        supersedesId: previous?.id,
      });
      return s;
    }

    case "draftRevise": {
      const i = action.input;
      const stratum = s.strata.find((l) => l.id === i.targetId)!;
      const value = i.field === "topDepth" || i.field === "bottomDepth"
        ? Number(i.newValue)
        : i.newValue.trim();
      (stratum as unknown as Record<string, string | number>)[i.field] = value;
      return s;
    }
  }
}
