// 初始领域数据（示例档案）：覆盖发掘中、保护停挖、跨班组交接、验收后更正等情形。
import type { AppState } from "./types";

export const STORAGE_KEY = "hxwl-10-archive-v1";

export function createSeedState(): AppState {
  return {
    meta: { seq: 100 },
    crews: [
      { id: "crew-jia", name: "甲班" },
      { id: "crew-yi", name: "乙班" },
    ],
    units: [
      { id: "u-0203", code: "T0203", status: "halted" },
      { id: "u-0204", code: "T0204", status: "halted" },
      { id: "u-0301", code: "T0301", status: "digging" },
    ],
    strata: [
      { id: "l-s3", unitId: "u-0203", code: "第3层", topDepth: 0, bottomDepth: 42, soil: "灰褐色土", accepted: true, acceptedAt: "2026-09-17" },
      { id: "l-s4", unitId: "u-0203", code: "第4层", topDepth: 42, bottomDepth: 110, soil: "黑褐土", accepted: false },
      { id: "l-4-1", unitId: "u-0204", code: "第4层", topDepth: 0, bottomDepth: 80, soil: "黄土", accepted: false },
      { id: "l-4-2", unitId: "u-0204", code: "第5层", topDepth: 80, bottomDepth: 140, soil: "黑褐土", accepted: false },
      { id: "l-f1", unitId: "u-0301", code: "第1层", topDepth: 0, bottomDepth: 30, soil: "耕土", accepted: true, acceptedAt: "2026-09-18" },
      { id: "l-f2", unitId: "u-0301", code: "第2层", topDepth: 30, bottomDepth: 72, soil: "扰土", accepted: true, acceptedAt: "2026-09-19" },
      { id: "l-f3", unitId: "u-0301", code: "第3层", topDepth: 72, bottomDepth: 130, soil: "夯土", accepted: false },
    ],
    progress: [
      { id: "pr-01", date: "2026-09-16", unitId: "u-0203", layerId: "l-s3", startDepth: 0, advance: 18, crewId: "crew-jia", supervisor: "高志远", createdAt: "2026-09-16T17:30:00" },
      { id: "pr-02", date: "2026-09-17", unitId: "u-0203", layerId: "l-s3", startDepth: 18, advance: 20, crewId: "crew-jia", supervisor: "高志远", createdAt: "2026-09-17T17:40:00" },
      { id: "pr-03", date: "2026-09-17", unitId: "u-0204", layerId: "l-4-1", startDepth: 0, advance: 35, crewId: "crew-yi", supervisor: "林晚秋", createdAt: "2026-09-17T17:50:00" },
      { id: "pr-04", date: "2026-09-18", unitId: "u-0204", layerId: "l-4-1", startDepth: 35, advance: 25, crewId: "crew-yi", supervisor: "林晚秋", createdAt: "2026-09-18T17:20:00" },
      { id: "pr-05", date: "2026-09-18", unitId: "u-0301", layerId: "l-f2", startDepth: 40, advance: 32, crewId: "crew-jia", supervisor: "高志远", createdAt: "2026-09-18T18:00:00" },
      { id: "pr-06", date: "2026-09-19", unitId: "u-0301", layerId: "l-f3", startDepth: 72, advance: 24, crewId: "crew-jia", supervisor: "高志远", createdAt: "2026-09-19T18:10:00" },
    ],
    features: [
      { id: "f1", code: "H12", type: "灰坑", hostUnitId: "u-0203", affectedUnitIds: ["u-0203", "u-0204"], depth: 40, note: "夹炭屑，见动物骨", crewId: "crew-jia", progressId: "pr-02", status: "active", discoveredAt: "2026-09-18" },
      { id: "f2", code: "F2", type: "房址", hostUnitId: "u-0301", affectedUnitIds: ["u-0301"], depth: 88, note: "夯土面，柱洞关系需复核", crewId: "crew-jia", progressId: "pr-06", status: "cleared", discoveredAt: "2026-09-19" },
    ],
    measures: [
      { id: "m-01", featureId: "f2", unitIds: ["u-0301"], content: "覆盖塑料薄膜并回填30cm细砂，房址边缘插保护标识桩", operator: "苏文博", createdAt: "2026-09-20T09:10:00" },
    ],
    halts: [
      { id: "h-01", unitId: "u-0203", featureId: "f1", reason: "发现灰坑 H12，转入遗迹保护", startedAt: "2026-09-18T11:00:00" },
      { id: "h-02", unitId: "u-0204", featureId: "f1", reason: "H12 影响范围波及本探方，联动停挖", startedAt: "2026-09-18T11:05:00" },
      { id: "h-03", unitId: "u-0301", featureId: "f2", reason: "发现房址 F2，转入遗迹保护", startedAt: "2026-09-19T15:20:00", resolvedAt: "2026-09-20T09:40:00", resumeId: "r-01" },
    ],
    handovers: [
      { id: "hd-01", unitId: "u-0301", fromCrewId: "crew-jia", toCrewId: "crew-yi", unfinishedCoordinates: ["E12.4 N08.1 柱洞群东缘", "E10.8 N06.6 夯土面西侧未完"], stagingPoint: "T0301 临时文物暂存柜 A 格", supervisor: "高志远", createdAt: "2026-09-20T09:30:00" },
    ],
    resumes: [
      { id: "r-01", unitId: "u-0301", crewId: "crew-yi", handoverId: "hd-01", createdAt: "2026-09-20T09:40:00" },
    ],
    corrections: [
      { id: "cr-01", targetId: "l-f2", field: "bottomDepth", oldValue: "72", newValue: "74", reason: "现场复核发现第2层底部存在2cm缓坡堆积线，原测量基准偏高", operator: "苏文博", createdAt: "2026-09-20T10:00:00" },
    ],
  };
}
