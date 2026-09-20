// 领域模型：考古探方发掘闭环
// 深度单位：厘米（cm），自地表向下为正。区间均为半开区间，首尾相接不算重叠。

export type TrenchStatus = "digging" | "halted";

export interface Crew {
  id: string;
  name: string;
  leader: string;
}

export interface Trench {
  id: string;
  status: TrenchStatus;
  currentCrewId: string;
  haltedFromCrewId?: string; // 停挖时的当班班组（原班组）
}

export interface Stratum {
  id: string;
  trenchId: string;
  code: string; // 层位编号，如「第3层」
  topDepth: number; // 层顶深度
  bottomDepth: number; // 层底深度
  soil: string; // 土色/土质描述
  accepted: boolean; // 是否已验收（验收后只读）
}

export interface ProgressReport {
  id: string;
  date: string;
  trenchId: string;
  stratumId: string; // 主施工层位
  startDepth: number; // 起始深度
  advance: number; // 进尺
  endDepth: number; // 终止深度（起始 + 进尺）
  crossedStrata: string; // 跨层补记层位，未跨层留空
  supervisor: string; // 现场负责人
  crewId: string; // 上报班组，写入后永久绑定
  createdAt: number;
}

export type FeatureKind = "灰坑" | "墓葬" | "房址" | "沟状遗迹" | "其他";

export interface Feature {
  id: string;
  code: string; // 遗迹单位编号，如 H12
  kind: FeatureKind;
  trenchId: string;
  depth: number; // 发现深度
  description: string;
  discoveredInReportId: string | null; // 随进尺上报时的绑定记录
  crewId: string; // 发现班组，写入后永久绑定
  date: string;
  protectionRegistered: boolean;
  protectionNote: string; // 保护措施说明
  protectedAt: string | null;
  resumedAt: string | null;
}

export interface Handover {
  id: string;
  trenchId: string;
  date: string;
  fromCrewId: string; // 原班组
  toCrewId: string; // 接班班组
  pendingCoordinates: string; // 未完坐标
  artifactStaging: string; // 出土物暂存点
  note: string;
  createdAt: number;
}

export type CorrectionField = "soil" | "topDepth" | "bottomDepth";

export interface Correction {
  id: string;
  date: string;
  stratumId: string;
  field: CorrectionField;
  oldValue: string; // 历史原值，继续可查
  newValue: string;
  reason: string; // 更正原因（必填）
  createdAt: number;
}

export interface AppState {
  version: number;
  crews: Crew[];
  trenches: Trench[];
  strata: Stratum[];
  reports: ProgressReport[];
  features: Feature[];
  handovers: Handover[];
  corrections: Correction[];
}

// 校验冲突：携带探方、地层、深度、班组与原值，供页面直接展示
export interface Issue {
  message: string;
  trenchId?: string;
  stratumId?: string;
  depth?: string;
  crewId?: string;
  originalValue?: string;
}
