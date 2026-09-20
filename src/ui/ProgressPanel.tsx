// 每日进尺上报：探方 / 地层 / 起始深度 / 进尺 / 现场负责人；
// 区间重叠、停挖、跨层补记等规则由 rules/validators 校验，页面只负责采集。
import { useEffect, useMemo, useState } from "react";
import { progressOfUnit, endDepth } from "../domain/selectors";
import type { LayerSupplement } from "../domain/types";
import { dispatch, useArchive } from "../state/store";
import { crossLayerExpectations, type Conflict } from "../rules/validators";
import { ConflictView } from "./ConflictView";
import { Field, Panel, Select, TextInput } from "./common";

interface SupDraft {
  fromDepth: string;
  toDepth: string;
  note: string;
}

const today = () => new Date().toISOString().slice(0, 10);

export function ProgressPanel() {
  const [date, setDate] = useState(today());
  const [unitId, setUnitId] = useState("");
  const [layerId, setLayerId] = useState("");
  const [startDepth, setStartDepth] = useState("");
  const [advance, setAdvance] = useState("");
  const [crewId, setCrewId] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [sups, setSups] = useState<Record<string, SupDraft>>({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  // 通过订阅模块函数取最新档案（避免把整份 state 透传）
  const s = useArchive();

  const unit = s.units.find((u) => u.id === unitId);
  const layers = useMemo(() => (unit ? s.strata.filter((l) => l.unitId === unit.id).sort((a, b) => a.topDepth - b.topDepth) : []), [s, unit]);
  const start = Number(startDepth);
  const adv = Number(advance);
  const end = Number.isFinite(start) && Number.isFinite(adv) ? start + adv : NaN;

  const expectations = useMemo(
    () => (unit && layerId && Number.isFinite(start) && Number.isFinite(end)
      ? crossLayerExpectations(s, unit.id, start, end, layerId)
      : []),
    [s, unit, layerId, start, end]
  );
  const extras = expectations.filter((e) => !e.isMain);

  // 跨层补记行与穿过层位保持同步，深度段默认取相交段
  useEffect(() => {
    setSups((prev) => {
      const next: Record<string, SupDraft> = {};
      for (const e of extras) {
        const from = Math.max(start, e.topDepth);
        const to = Math.min(end, e.bottomDepth);
        const old = prev[e.code];
        next[e.code] = {
          fromDepth: old ? old.fromDepth : String(from),
          toDepth: old ? old.toDepth : String(to),
          note: old?.note ?? "",
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras.map((e) => e.code).join("|"), start, end]);

  const changeUnit = (id: string) => {
    setUnitId(id);
    setLayerId("");
    setConflicts([]);
  };

  const submit = () => {
    const supplements: LayerSupplement[] = extras.map((e) => ({
      layerCode: e.code,
      fromDepth: Number(sups[e.code]?.fromDepth),
      toDepth: Number(sups[e.code]?.toDepth),
      note: sups[e.code]?.note ?? "",
    }));
    const result = dispatch({
      type: "progress",
      input: {
        date,
        unitId,
        layerId,
        startDepth: start,
        advance: adv,
        crewId,
        supervisor,
        supplements,
      },
    });
    setConflicts(result.conflicts);
    if (result.ok) {
      setStartDepth("");
      setAdvance("");
      setSupervisor("");
      setSups({});
    }
  };

  const recent = unit ? progressOfUnit(s, unit.id).slice(-3) : [];

  return (
    <Panel title="班组每日进尺上报" eyebrow="发掘记录">
      <div className="form-grid form-grid-3">
        <Field label="日期"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="探方">
          <Select value={unitId} onChange={(e) => changeUnit(e.target.value)}>
            <option value="">请选择探方</option>
            {s.units.map((u) => <option key={u.id} value={u.id}>{u.code}{u.status === "halted" ? "（停挖）" : ""}</option>)}
          </Select>
        </Field>
        <Field label="地层（主层位）">
          <Select value={layerId} onChange={(e) => setLayerId(e.target.value)} disabled={!unitId}>
            <option value="">请选择地层</option>
            {layers.map((l) => <option key={l.id} value={l.id}>{l.code}（{l.topDepth}–{l.bottomDepth} cm）{l.accepted ? "· 已验收" : ""}</option>)}
          </Select>
        </Field>
        <Field label="起始深度" hint="cm"><TextInput type="number" inputMode="decimal" placeholder="如 42" value={startDepth} onChange={(e) => setStartDepth(e.target.value)} /></Field>
        <Field label="进尺" hint="cm"><TextInput type="number" inputMode="decimal" placeholder="如 8" value={advance} onChange={(e) => setAdvance(e.target.value)} /></Field>
        <Field label="预计结束深度" hint="cm"><TextInput readOnly value={Number.isFinite(end) ? end : ""} placeholder="自动计算" /></Field>
        <Field label="上报班组">
          <Select value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            <option value="">请选择班组</option>
            {s.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="现场负责人"><TextInput placeholder="填写现场负责人" value={supervisor} onChange={(e) => setSupervisor(e.target.value)} /></Field>
      </div>

      {extras.length > 0 && (
        <div className="cross-layer">
          <p className="cross-layer-title">⚠ 本次进尺跨层，必须补记以下层位：</p>
          {extras.map((e) => (
            <div key={e.code} className="sup-row">
              <strong>{e.code}</strong>
              <span className="sup-range">层位 {e.topDepth}–{e.bottomDepth} cm</span>
              <TextInput type="number" placeholder="段起 cm" value={sups[e.code]?.fromDepth ?? ""}
                onChange={(ev) => setSups((p) => ({ ...p, [e.code]: { ...p[e.code], fromDepth: ev.target.value } }))} />
              <TextInput type="number" placeholder="段止 cm" value={sups[e.code]?.toDepth ?? ""}
                onChange={(ev) => setSups((p) => ({ ...p, [e.code]: { ...p[e.code], toDepth: ev.target.value } }))} />
              <TextInput className="sup-note" placeholder="补记说明（出土物/土色/界面）" value={sups[e.code]?.note ?? ""}
                onChange={(ev) => setSups((p) => ({ ...p, [e.code]: { ...p[e.code], note: ev.target.value } }))} />
            </div>
          ))}
        </div>
      )}

      <ConflictView conflicts={conflicts} />

      <div className="form-actions">
        <button className="primary-action" onClick={submit}>上报进尺</button>
        {recent.length > 0 && (
          <span className="inline-hint">
            {unit?.code} 已报 {progressOfUnit(s, unit!.id).length} 条，末条至 {endDepth(recent[recent.length - 1])} cm（{s.crews.find((c) => c.id === recent[recent.length - 1].crewId)?.name}）
          </span>
        )}
      </div>
    </Panel>
  );
}
