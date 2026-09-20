import { useMemo, useState, type ReactElement } from "react";
import type { AppState, CorrectionField, FeatureKind } from "../domain/types";
import {
  acceptStratum,
  addCorrection,
  addFeature,
  addHandover,
  addProgress,
  blockingFeatures,
  correctionFieldLabels,
  crewName,
  hasValidHandoverForCurrentCrew,
  registerProtection,
  resumeTrench,
  strataCovering,
  trenchReports,
  trenchStrata,
  type Result,
} from "../domain/rules";
import { Field, IssueList } from "./widgets";

type TabKey = "progress" | "feature" | "handover" | "stratum";

const tabs: { key: TabKey; label: string }[] = [
  { key: "progress", label: "每日进尺上报" },
  { key: "feature", label: "遗迹 · 停挖 · 复挖" },
  { key: "handover", label: "班组交接" },
  { key: "stratum", label: "地层验收 · 更正" },
];

export function Forms({
  state,
  apply,
}: {
  state: AppState;
  apply: (result: Result, successMsg: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("progress");
  return (
    <section className="panel forms-panel">
      <div className="section-heading">
        <div>
          <p>发掘作业</p>
          <h2>班组上报与遗迹保护闭环</h2>
        </div>
      </div>
      <nav className="tabs">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? "tab active" : "tab"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "progress" && <ProgressForm state={state} apply={apply} />}
      {tab === "feature" && <FeatureFlow state={state} apply={apply} />}
      {tab === "handover" && <HandoverForm state={state} apply={apply} />}
      {tab === "stratum" && <StratumForm state={state} apply={apply} />}
    </section>
  );
}

function today(): string {
  return "2026-09-20";
}

function CrewSelect({
  state,
  value,
  onChange,
}: {
  state: AppState;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select className="ctrl" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">请选择班组</option>
      {state.crews.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}（负责人 {c.leader}）
        </option>
      ))}
    </select>
  );
}

function ProgressForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const [date, setDate] = useState(today());
  const [trenchId, setTrenchId] = useState(state.trenches[0]?.id ?? "");
  const [stratumId, setStratumId] = useState("");
  const [startDepth, setStartDepth] = useState("");
  const [advance, setAdvance] = useState("");
  const [crossedStrata, setCrossedStrata] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [crewId, setCrewId] = useState("");
  const [issues, setIssues] = useState<ReactElement | null>(null);

  const strata = useMemo(() => trenchStrata(state, trenchId), [state, trenchId]);
  const trench = state.trenches.find((t) => t.id === trenchId);
  const halted = trench?.status === "halted";

  const start = Number(startDepth);
  const adv = Number(advance);
  const covered =
    startDepth !== "" && advance !== "" && Number.isFinite(start) && Number.isFinite(adv) && adv > 0
      ? strataCovering(state, trenchId, start, start + adv)
      : [];

  function submit() {
    const result = addProgress(state, {
      date,
      trenchId,
      stratumId: stratumId || strata[0]?.id || "",
      startDepth: Number(startDepth),
      advance: Number(advance),
      crossedStrata,
      supervisor,
      crewId,
    });
    if (result.ok) {
      setIssues(null);
      setStartDepth("");
      setAdvance("");
      setCrossedStrata("");
      apply(result, "进尺已上报并绑定探方、地层与班组");
    } else {
      setIssues(<IssueList issues={result.issues} />);
    }
  }

  return (
    <div className="form-body">
      <p className="form-rule">
        规则：进尺区间 <b>[起始, 起始+进尺)</b> 与本探方既有区间不得重叠（首尾相接允许）；进尺跨越多个地层时必须补记所跨层位；
        探方处于保护停挖时禁止上报。
      </p>
      <div className="form-grid">
        <Field label="日期">
          <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="探方">
          <select
            className="ctrl"
            value={trenchId}
            onChange={(e) => {
              setTrenchId(e.target.value);
              setStratumId("");
            }}
          >
            {state.trenches.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id}（{t.status === "halted" ? "保护停挖" : "发掘中"}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="地层（主施工层位）">
          <select className="ctrl" value={stratumId} onChange={(e) => setStratumId(e.target.value)}>
            <option value="">请选择地层</option>
            {strata.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code}（{s.topDepth}–{s.bottomDepth}cm{s.accepted ? "，已验收" : ""}）
              </option>
            ))}
          </select>
        </Field>
        <Field label="上报班组">
          <CrewSelect state={state} value={crewId} onChange={setCrewId} />
        </Field>
        <Field label="起始深度（cm）">
          <input
            className="ctrl"
            type="number"
            min={0}
            value={startDepth}
            placeholder="如 100"
            onChange={(e) => setStartDepth(e.target.value)}
          />
        </Field>
        <Field label="进尺（cm）">
          <input
            className="ctrl"
            type="number"
            min={0}
            step="0.1"
            value={advance}
            placeholder="如 20"
            onChange={(e) => setAdvance(e.target.value)}
          />
        </Field>
        <Field label="现场负责人">
          <input className="ctrl" value={supervisor} placeholder="如 张工" onChange={(e) => setSupervisor(e.target.value)} />
        </Field>
        <Field label="跨层补记层位" hint="仅跨层时填写，未跨层留空">
          <input
            className="ctrl"
            value={crossedStrata}
            placeholder="如：另穿第4层 120–125cm"
            onChange={(e) => setCrossedStrata(e.target.value)}
          />
        </Field>
      </div>
      {covered.length > 1 && (
        <p className="live-hint warn">
          该区间覆盖地层：{covered.map((s) => s.code).join("、")}，请在「跨层补记层位」注明。
        </p>
      )}
      {halted && <p className="live-hint danger">该探方正在保护停挖，不能上报进尺。</p>}
      {issues}
      <button className="primary-action" onClick={submit} disabled={halted}>
        上报进尺
      </button>
    </div>
  );
}

const featureKinds: FeatureKind[] = ["灰坑", "墓葬", "房址", "沟状遗迹", "其他"];

function FeatureFlow({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  return (
    <div className="form-body">
      <FeatureForm state={state} apply={apply} />
      <hr />
      <ProtectionForm state={state} apply={apply} />
      <hr />
      <ResumeForm state={state} apply={apply} />
    </div>
  );
}

function FeatureForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const [date, setDate] = useState(today());
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<FeatureKind>("灰坑");
  const [trenchId, setTrenchId] = useState(state.trenches[0]?.id ?? "");
  const [depth, setDepth] = useState("");
  const [description, setDescription] = useState("");
  const [crewId, setCrewId] = useState("");
  const [reportId, setReportId] = useState("");
  const [issues, setIssues] = useState<ReactElement | null>(null);

  const reports = trenchReports(state, trenchId);

  function submit() {
    const result = addFeature(state, {
      date,
      code,
      kind,
      trenchId,
      depth: Number(depth),
      description,
      crewId,
      reportId: reportId || null,
    });
    if (result.ok) {
      setIssues(null);
      setCode("");
      setDepth("");
      setDescription("");
      setReportId("");
      apply(result, `遗迹单位已登记，${trenchId} 转入保护停挖`);
    } else setIssues(<IssueList issues={result.issues} />);
  }

  return (
    <div className="sub-form">
      <h3>① 发现遗迹单位（探方随即停挖）</h3>
      <div className="form-grid">
        <Field label="发现日期">
          <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="遗迹编号">
          <input className="ctrl" value={code} placeholder="如 H13" onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label="遗迹类型">
          <select className="ctrl" value={kind} onChange={(e) => setKind(e.target.value as FeatureKind)}>
            {featureKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        <Field label="发现班组">
          <CrewSelect state={state} value={crewId} onChange={setCrewId} />
        </Field>
        <Field label="所在探方">
          <select className="ctrl" value={trenchId} onChange={(e) => { setTrenchId(e.target.value); setReportId(""); }}>
            {state.trenches.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        </Field>
        <Field label="发现深度（cm）">
          <input className="ctrl" type="number" min={0} value={depth} onChange={(e) => setDepth(e.target.value)} />
        </Field>
        <Field label="关联进尺记录" hint="可选，绑定后不可改">
          <select className="ctrl" value={reportId} onChange={(e) => setReportId(e.target.value)}>
            <option value="">不关联</option>
            {reports.map((r) => (
              <option key={r.id} value={r.id}>
                {r.date} {r.startDepth}–{r.endDepth}cm · {crewName(state, r.crewId)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="遗迹描述">
          <input className="ctrl" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="土色、包含物、范围" />
        </Field>
      </div>
      {issues}
      <button className="primary-action" onClick={submit}>登记遗迹并停挖</button>
    </div>
  );
}

function ProtectionForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const openFeatures = state.features.filter((f) => !f.protectionRegistered);
  const [featureId, setFeatureId] = useState(openFeatures[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [issues, setIssues] = useState<ReactElement | null>(null);

  if (openFeatures.length === 0) {
    return (
      <div className="sub-form">
        <h3>② 登记保护措施</h3>
        <p className="empty-line">当前没有待登记保护措施的遗迹单位。</p>
      </div>
    );
  }

  const feature = state.features.find((f) => f.id === featureId) ?? openFeatures[0];

  function submit() {
    const result = registerProtection(state, feature.id, note, date);
    if (result.ok) {
      setIssues(null);
      setNote("");
      apply(result, `保护措施已登记（${feature.code}）`);
    } else setIssues(<IssueList issues={result.issues} />);
  }

  return (
    <div className="sub-form">
      <h3>② 登记保护措施（未登记不能复挖）</h3>
      <div className="form-grid">
        <Field label="待保护遗迹">
          <select className="ctrl" value={feature.id} onChange={(e) => setFeatureId(e.target.value)}>
            {openFeatures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.code} · {f.trenchId} · {f.depth}cm · {crewName(state, f.crewId)}发现
              </option>
            ))}
          </select>
        </Field>
        <Field label="登记日期">
          <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="保护措施说明">
          <input
            className="ctrl"
            value={note}
            placeholder="如：套箱遮盖、回填30cm黄土保护层、围挡警示"
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      {issues}
      <button className="primary-action" onClick={submit}>登记保护措施</button>
    </div>
  );
}

function ResumeForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const halted = state.trenches.filter((t) => t.status === "halted");
  const [trenchId, setTrenchId] = useState(halted[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [issues, setIssues] = useState<ReactElement | null>(null);

  if (halted.length === 0) {
    return (
      <div className="sub-form">
        <h3>③ 复挖</h3>
        <p className="empty-line">当前没有停挖中的探方。</p>
      </div>
    );
  }

  const trench = state.trenches.find((t) => t.id === trenchId) ?? halted[0];
  const blockers = blockingFeatures(state, trench.id);
  const crewChanged = !!trench.haltedFromCrewId && trench.haltedFromCrewId !== trench.currentCrewId;
  const hasHandover = hasValidHandoverForCurrentCrew(state, trench.id);

  function submit() {
    const result = resumeTrench(state, trench.id, date);
    if (result.ok) {
      setIssues(null);
      apply(result, `${trench.id} 已复挖`);
    } else setIssues(<IssueList issues={result.issues} />);
  }

  return (
    <div className="sub-form">
      <h3>③ 复挖（全部遗迹保护措施登记后才可解除停挖）</h3>
      <div className="form-grid">
        <Field label="停挖探方">
          <select className="ctrl" value={trench.id} onChange={(e) => setTrenchId(e.target.value)}>
            {halted.map((t) => (
              <option key={t.id} value={t.id}>{t.id}（当班：{crewName(state, t.currentCrewId)}）</option>
            ))}
          </select>
        </Field>
        <Field label="复挖日期">
          <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {blockers.length > 0 ? (
        <p className="live-hint danger">
          禁止复挖：{blockers.map((f) => f.code).join("、")} 的保护措施尚未登记。
        </p>
      ) : crewChanged && !hasHandover ? (
        <p className="live-hint danger">
          班组已由 {crewName(state, trench.haltedFromCrewId!)} 拟换为 {crewName(state, trench.currentCrewId)}，
          请先在「班组交接」页签补录未完坐标与出土物暂存点。
        </p>
      ) : (
        <p className="live-hint ok">保护措施齐备{crewChanged ? "，交接已完成" : ""}，可以复挖。</p>
      )}
      {issues}
      <button className="primary-action" onClick={submit} disabled={blockers.length > 0 || (crewChanged && !hasHandover)}>
        解除停挖并复挖
      </button>
    </div>
  );
}

function HandoverForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const halted = state.trenches.filter((t) => t.status === "halted");
  const [trenchId, setTrenchId] = useState(halted[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [toCrewId, setToCrewId] = useState("");
  const [pendingCoordinates, setPendingCoordinates] = useState("");
  const [artifactStaging, setArtifactStaging] = useState("");
  const [note, setNote] = useState("");
  const [issues, setIssues] = useState<ReactElement | null>(null);

  if (halted.length === 0) {
    return <p className="empty-line form-body">当前没有停挖中的探方；更换班组交接仅在保护停挖期间办理。</p>;
  }

  const trench = state.trenches.find((t) => t.id === trenchId) ?? halted[0];

  function submit() {
    const result = addHandover(state, {
      trenchId: trench.id,
      date,
      fromCrewId: trench.currentCrewId,
      toCrewId,
      pendingCoordinates,
      artifactStaging,
      note,
    });
    if (result.ok) {
      setIssues(null);
      setToCrewId("");
      setPendingCoordinates("");
      setArtifactStaging("");
      setNote("");
      apply(result, `交接完成：${trench.id} 当班班组变更，原班组进尺与发现记录保持绑定`);
    } else setIssues(<IssueList issues={result.issues} />);
  }

  return (
    <div className="form-body">
      <p className="form-rule">
        规则：复挖更换班组时，由原班组向接班班组交接 <b>未完坐标</b> 与 <b>出土物暂存点</b>（必填，无则填「无」）；
        交接后探方当班班组变更，但原班组的进尺与发现记录仍永久绑定原班组。
      </p>
      <div className="form-grid">
        <Field label="交接日期">
          <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="停挖探方">
          <select className="ctrl" value={trench.id} onChange={(e) => setTrenchId(e.target.value)}>
            {halted.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        </Field>
        <Field label="移交班组（原班组）">
          <input className="ctrl static" readOnly value={crewName(state, trench.currentCrewId)} />
        </Field>
        <Field label="接班班组">
          <CrewSelect state={state} value={toCrewId} onChange={setToCrewId} />
        </Field>
        <Field label="未完坐标">
          <input
            className="ctrl"
            value={pendingCoordinates}
            placeholder="如：柱洞 D4、D5 未测；遗迹东南角边界点未取"
            onChange={(e) => setPendingCoordinates(e.target.value)}
          />
        </Field>
        <Field label="出土物暂存点">
          <input
            className="ctrl"
            value={artifactStaging}
            placeholder="如：东隔梁临时木箱 A-03（陶片6、兽骨2袋）"
            onChange={(e) => setArtifactStaging(e.target.value)}
          />
        </Field>
        <Field label="备注">
          <input className="ctrl" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {issues}
      <button
        className="primary-action"
        onClick={submit}
        disabled={!!toCrewId && toCrewId === trench.currentCrewId}
      >
        完成交接并更换当班班组
      </button>
    </div>
  );
}

function StratumForm({ state, apply }: { state: AppState; apply: (r: Result, msg: string) => void }) {
  const [trenchId, setTrenchId] = useState(state.trenches[0]?.id ?? "");
  const strata = trenchStrata(state, trenchId);
  const [acceptId, setAcceptId] = useState("");
  const [fixId, setFixId] = useState("");
  const [field, setField] = useState<CorrectionField>("soil");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [issues, setIssues] = useState<ReactElement | null>(null);

  const target = state.strata.find((s) => s.id === fixId);
  const chain = target ? state.corrections.filter((c) => c.stratumId === target.id) : [];

  function doAccept() {
    const result = acceptStratum(state, acceptId);
    if (result.ok) {
      setIssues(null);
      apply(result, "地层已验收，记录转为只读");
    } else setIssues(<IssueList issues={result.issues} />);
  }

  function doCorrect() {
    const result = addCorrection(state, { date, stratumId: fixId, field, newValue, reason });
    if (result.ok) {
      setIssues(null);
      setNewValue("");
      setReason("");
      apply(result, "更正已另立记录，历史原值保留可查");
    } else setIssues(<IssueList issues={result.issues} />);
  }

  return (
    <div className="form-body">
      <p className="form-rule">
        规则：验收通过的地层只读；确需更正时不得直接覆盖，必须另立带原因的更正记录，历史数值继续可查。
      </p>
      <div className="form-grid">
        <Field label="探方">
          <select className="ctrl" value={trenchId} onChange={(e) => { setTrenchId(e.target.value); setAcceptId(""); setFixId(""); }}>
            {state.trenches.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="two-col">
        <div className="sub-form">
          <h3>① 验收地层（锁定只读）</h3>
          <Field label="待验收地层">
            <select className="ctrl" value={acceptId} onChange={(e) => setAcceptId(e.target.value)}>
              <option value="">请选择</option>
              {strata.filter((s) => !s.accepted).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}（{s.topDepth}–{s.bottomDepth}cm）
                </option>
              ))}
            </select>
          </Field>
          <button className="primary-action" onClick={doAccept} disabled={!acceptId}>验收通过</button>
        </div>

        <div className="sub-form">
          <h3>② 已验收地层更正（另立记录）</h3>
          <div className="form-grid">
            <Field label="已验收地层">
              <select className="ctrl" value={fixId} onChange={(e) => setFixId(e.target.value)}>
                <option value="">请选择</option>
                {strata.filter((s) => s.accepted).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code}（{s.topDepth}–{s.bottomDepth}cm）
                  </option>
                ))}
              </select>
            </Field>
            <Field label="更正字段">
              <select className="ctrl" value={field} onChange={(e) => setField(e.target.value as CorrectionField)}>
                {(Object.keys(correctionFieldLabels) as CorrectionField[]).map((f) => (
                  <option key={f} value={f}>{correctionFieldLabels[f]}</option>
                ))}
              </select>
            </Field>
            <Field label="更正日期">
              <input className="ctrl" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="更正后数值">
              <input
                className="ctrl"
                value={newValue}
                placeholder={target ? `原值：${field === "soil" ? target.soil : field === "topDepth" ? target.topDepth : target.bottomDepth}` : ""}
                onChange={(e) => setNewValue(e.target.value)}
              />
            </Field>
            <Field label="更正原因（必填）">
              <input className="ctrl" value={reason} placeholder="如：复核土色卡判色修正" onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          {target && (
            <p className="live-hint">
              当前值：{field === "soil" ? target.soil : field === "topDepth" ? `${target.topDepth}cm` : `${target.bottomDepth}cm`}
            </p>
          )}
          {chain.length > 0 && (
            <div className="correction-chain">
              <p className="block-title">该地层更正链（历史可查）</p>
              {chain.map((c) => (
                <div key={c.id} className="chain-item">
                  <b>{c.date} · {correctionFieldLabels[c.field]}</b>
                  <span className="old">原值：{c.oldValue}</span>
                  <span className="arrow">→</span>
                  <span className="new">新值：{c.newValue}</span>
                  <span className="reason">原因：{c.reason}</span>
                </div>
              ))}
            </div>
          )}
          {issues}
          <button className="primary-action" onClick={doCorrect} disabled={!fixId}>提交更正</button>
        </div>
      </div>
    </div>
  );
}
