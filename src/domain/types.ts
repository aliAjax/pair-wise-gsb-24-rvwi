// 领域模型：考古探方发掘交接与遗迹保护闭环
// 仅描述领域数据结构，不包含任何校验规则与页面逻辑。

export type ID = string;

/** 探方状态：发掘中 / 保护停挖 */
export type UnitStatus = "digging" | "halted";

/** 遗迹类型 */
export type FeatureType = "灰坑" | "墓葬" | "房址" | "沟状遗迹";

/** 遗迹处理状态：保护中（关联停挖）/ 已处理（停挖已解除） */
export type FeatureStatus = "active" | "cleared";

/** 班组 */
export interface Crew {
  id: ID;
  name: string;
}

/** 探方 */
export interface ExcavationUnit {
  id: ID;
  code: string; // 探方编号，如 T0203
  status: UnitStatus;
}

/** 地层（层位） */
export interface Stratum {
  id: ID;
  unitId: ID;
  code: string; // 第3层
  topDepth: number; // 层顶深度 cm
  bottomDepth: number; // 层底深度 cm
  soil: string; // 土色土质
  accepted: boolean; // 是否已验收（验收后只读）
  acceptedAt?: string;
}

/** 跨层补记层位条目 */
export interface LayerSupplement {
  layerCode: string;
  fromDepth: number;
  toDepth: number;
  note: string;
}

/** 每日进尺记录，永久绑定上报班组 */
export interface ProgressRecord {
  id: ID;
  date: string;
  unitId: ID;
  layerId: ID; // 主层位
  startDepth: number; // 起始深度 cm
  advance: number; // 进尺 cm，结束深度 = 起始 + 进尺
  crewId: ID;
  supervisor: string; // 现场负责人
  crossLayer?: LayerSupplement[]; // 跨层补记
  createdAt: string;
}

/** 遗迹单位（灰坑/墓葬/房址/沟） */
export interface Feature {
  id: ID;
  code: string; // H12
  type: FeatureType;
  hostUnitId: ID; // 所在探方
  affectedUnitIds: ID[]; // 受影响探方（一并停挖）
  depth: number;
  note: string;
  crewId: ID; // 发现班组，与发现记录永久绑定
  progressId?: ID; // 关联的原班组进尺记录
  status: FeatureStatus;
  discoveredAt: string;
}

/** 保护措施登记 */
export interface ProtectionMeasure {
  id: ID;
  featureId: ID;
  unitIds: ID[]; // 措施覆盖的受影响探方
  content: string;
  operator: string;
  createdAt: string;
}

/** 停挖记录 */
export interface HaltRecord {
  id: ID;
  unitId: ID;
  featureId: ID;
  reason: string;
  startedAt: string;
  resolvedAt?: string;
  resumeId?: ID;
}

/** 班组交接记录（复挖更换班组时产生） */
export interface Handover {
  id: ID;
  unitId: ID;
  fromCrewId: ID; // 原班组
  toCrewId: ID; // 接班班组
  unfinishedCoordinates: string[]; // 未完坐标
  stagingPoint: string; // 出土物暂存点
  supervisor: string; // 交接负责人
  createdAt: string;
}

/** 复挖记录 */
export interface ResumeRecord {
  id: ID;
  unitId: ID;
  crewId: ID;
  handoverId?: ID;
  createdAt: string;
}

/** 可更正的地层字段 */
export type StratumField = "code" | "topDepth" | "bottomDepth" | "soil";

/** 地层更正记录（带原因，串成更正链，历史数值长期保留） */
export interface Correction {
  id: ID;
  targetId: ID;
  field: StratumField;
  oldValue: string;
  newValue: string;
  reason: string;
  operator: string;
  createdAt: string;
  supersedesId?: ID; // 上一条同对象同字段更正
}

/** 完整档案状态（刷新后整体恢复） */
export interface AppState {
  meta: { seq: number };
  crews: Crew[];
  units: ExcavationUnit[];
  strata: Stratum[];
  progress: ProgressRecord[];
  features: Feature[];
  measures: ProtectionMeasure[];
  halts: HaltRecord[];
  handovers: Handover[];
  resumes: ResumeRecord[];
  corrections: Correction[];
}

// ---- 页面动作的输入 DTO ----

export interface ProgressInput {
  date: string;
  unitId: ID;
  layerId: ID;
  startDepth: number;
  advance: number;
  crewId: ID;
  supervisor: string;
  supplements: LayerSupplement[];
}

export interface FeatureInput {
  code: string;
  type: FeatureType;
  hostUnitId: ID;
  affectedUnitIds: ID[];
  depth: number;
  note: string;
  crewId: ID;
  progressId?: ID;
  date: string;
}

export interface MeasureInput {
  featureId: ID;
  unitIds: ID[];
  content: string;
  operator: string;
  date: string;
}

export interface HandoverInput {
  unfinishedCoordinates: string[];
  stagingPoint: string;
  supervisor: string;
}

export interface ResumeInput {
  unitId: ID;
  toCrewId: ID;
  handover?: HandoverInput;
}

export interface CorrectionInput {
  targetId: ID;
  field: StratumField;
  newValue: string;
  reason: string;
  operator: string;
}

export interface DraftReviseInput {
  targetId: ID;
  field: StratumField;
  newValue: string;
}
