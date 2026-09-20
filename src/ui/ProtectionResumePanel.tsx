// 保护措施登记 + 复挖（含班组交接）：
// 未登记保护措施不能复挖；更换班组复挖必须交接未完坐标与出土物暂存点。
import { useMemo, useState } from "react";
import { lastCrewOfUnit, measureForFeatureUnit } from "../domain/selectors";
import { dispatch, useArchive } from "../state/store";
import type { Conflict } from "../rules/validators";
import { ConflictView } from "./ConflictView";
import { Badge, Field, Panel, Select, TextInput } from "./common";

export function ProtectionResumePanel() {
  const s = useArchive();

  // ---- 保护措施表单 ----
  const activeFeatures = s.features.filter((f) => f.status === "active");
  const [mFeatureId, setMFeatureId] = useState("");
  const [mUnits, setMUnits] = useState<string[]>([]);
  const [content, setContent] = useState("");
  const [operator, setOperator] = useState("");
  const [mConflicts, setMConflicts] = useState<Conflict[]>([]);

  const mFeature = s.features.find((f) => f.id === mFeatureId);

  const pickFeature = (id: string) => {
    setMFeatureId(id);
    const f = s.features.find((x) => x.id === id);
    setMUnits(f ? f.affectedUnitIds.filter((uid) => !measureForFeatureUnit(s, id, uid)) : []);
    setMConflicts([]);
  };

  const submitMeasure = () => {
    const result = dispatch({
      type: "measure",
      input: { featureId: mFeatureId, unitIds: mUnits, content, operator, date: new Date().toISOString().slice(0, 10) },
    });
    setMConflicts(result.conflicts);
    if (result.ok) {
      setContent(""); setOperator("");
      setMUnits([]);
    }
  };

  // ---- 复挖交接表单 ----
  const haltedUnits = s.units.filter((u) => u.status === "halted");
  const [rUnitId, setRUnitId] = useState("");
  const [toCrewId, setToCrewId] = useState("");
  const [coords, setCoords] = useState<string[]>([""]);
  const [stagingPoint, setStagingPoint] = useState("");
  const [handoverSupervisor, setHandoverSupervisor] = useState("");
  const [rConflicts, setRConflicts] = useState<Conflict[]>([]);

  const rUnit = s.units.find((u) => u.id === rUnitId);
  const originalCrewId = rUnit ? lastCrewOfUnit(s, rUnit.id) : undefined;
  const needsHandover = !!toCrewId && !!originalCrewId && toCrewId !== originalCrewId;

  const blocking = useMemo(() => {
    if (!rUnit) return [] as Array<{ featureCode: string; measured: boolean }>;
    return s.halts
      .filter((h) => h.unitId === rUnit.id && !h.resolvedAt)
      .map((h) => {
        const f = s.features.find((x) => x.id === h.featureId);
        return { featureCode: f?.code ?? "", measured: !!measureForFeatureUnit(s, h.featureId, rUnit.id) };
      });
  }, [s, rUnit]);

  const submitResume = () => {
    const result = dispatch({
      type: "resume",
      input: {
        unitId: rUnitId,
        toCrewId,
        handover: needsHandover
          ? { unfinishedCoordinates: coords, stagingPoint, supervisor: handoverSupervisor }
          : undefined,
      },
    });
    setRConflicts(result.conflicts);
    if (result.ok) {
      setRUnitId(""); setToCrewId(""); setCoords([""]); setStagingPoint(""); setHandoverSupervisor("");
    }
  };

  return (
    <Panel title="保护措施登记与复挖交接" eyebrow="闭环管控">
      <div className="subpanel">
        <h3>① 登记保护措施</h3>
        <div className="form-grid form-grid-3">
          <Field label="遗迹单位">
            <Select value={mFeatureId} onChange={(e) => pickFeature(e.target.value)}>
              <option value="">请选择保护中的遗迹</option>
              {activeFeatures.map((f) => <option key={f.id} value={f.id}>{f.code}（{f.type}）</option>)}
            </Select>
          </Field>
          <Field label="登记人"><TextInput placeholder="保护措施登记人" value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>
        </div>
        {mFeature && (
          <div className="affected-pick">
            <span className="field-label">措施覆盖的受影响探方（已登记的自动跳过）</span>
            <div className="chips">
              {mFeature.affectedUnitIds.map((uid) => {
                const u = s.units.find((x) => x.id === uid);
                const done = !!measureForFeatureUnit(s, mFeature.id, uid);
                return (
                  <button
                    key={uid}
                    type="button"
                    disabled={done}
                    className={mUnits.includes(uid) ? "chip-on" : ""}
                    onClick={() => setMUnits((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]))}
                  >
                    {u?.code}{done ? "（已登记）" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field label="保护措施内容"><TextInput placeholder="如 覆盖薄膜、回填细砂、插保护标识桩" value={content} onChange={(e) => setContent(e.target.value)} /></Field>
        <ConflictView conflicts={mConflicts} />
        <div className="form-actions">
          <button className="primary-action" onClick={submitMeasure} disabled={activeFeatures.length === 0}>登记保护措施</button>
        </div>
      </div>

      <div className="subpanel">
        <h3>② 复挖与班组交接</h3>
        <div className="form-grid form-grid-3">
          <Field label="复挖探方">
            <Select value={rUnitId} onChange={(e) => { setRUnitId(e.target.value); setRConflicts([]); }}>
              <option value="">请选择停挖探方</option>
              {haltedUnits.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
            </Select>
          </Field>
          <Field label="接班班组">
            <Select value={toCrewId} onChange={(e) => setToCrewId(e.target.value)} disabled={!rUnitId}>
              <option value="">请选择班组</option>
              {s.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>

        {rUnit && blocking.length > 0 && (
          <div className="blocking-list">
            {blocking.map((b) => (
              <span key={b.featureCode} className="feature-unit">
                遗迹 {b.featureCode}
                {b.measured ? <Badge tone="warn">措施已登记·可复挖</Badge> : <Badge tone="danger">措施未登记·禁止复挖</Badge>}
              </span>
            ))}
          </div>
        )}

        {needsHandover && (
          <div className="handover-box">
            <p className="cross-layer-title">
              📋 更换班组复挖：原班组「{s.crews.find((c) => c.id === originalCrewId)?.name}」须向接班班组交接以下内容
            </p>
            <div className="coord-list">
              <span className="field-label">未完坐标（每项一条）</span>
              {coords.map((v, i) => (
                <div key={i} className="coord-row">
                  <TextInput
                    placeholder={`如 E12.4 N08.1 柱洞群东缘`}
                    value={v}
                    onChange={(e) => setCoords((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  {coords.length > 1 && (
                    <button type="button" onClick={() => setCoords((p) => p.filter((_, j) => j !== i))}>删除</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setCoords((p) => [...p, ""])}>增加未完坐标</button>
            </div>
            <div className="form-grid form-grid-2">
              <Field label="出土物暂存点"><TextInput placeholder="如 T0203 临时文物暂存柜 B 格" value={stagingPoint} onChange={(e) => setStagingPoint(e.target.value)} /></Field>
              <Field label="交接负责人"><TextInput placeholder="交接现场负责人" value={handoverSupervisor} onChange={(e) => setHandoverSupervisor(e.target.value)} /></Field>
            </div>
          </div>
        )}
        {rUnit && toCrewId && !needsHandover && (
          <p className="inline-hint">原班组继续复挖，无需班组交接；进尺与发现记录仍绑定原班组。</p>
        )}

        <ConflictView conflicts={rConflicts} />
        <div className="form-actions">
          <button className="primary-action" onClick={submitResume} disabled={haltedUnits.length === 0}>
            {needsHandover ? "交接并复挖" : "确认复挖"}
          </button>
        </div>
      </div>
    </Panel>
  );
}
