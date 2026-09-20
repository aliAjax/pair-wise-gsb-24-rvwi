// 发现遗迹单位：登记后所在及受影响探方转入保护停挖；
// 发现记录与原班组（及其进尺）永久绑定。
import { useState } from "react";
import { haltOfFeatureUnit, measureForFeatureUnit, progressOfUnit } from "../domain/selectors";
import type { FeatureType } from "../domain/types";
import { dispatch, useArchive } from "../state/store";
import type { Conflict } from "../rules/validators";
import { ConflictView } from "./ConflictView";
import { Badge, Field, Panel, Select, TextInput } from "./common";

const TYPES: FeatureType[] = ["灰坑", "墓葬", "房址", "沟状遗迹"];

export function FeaturePanel() {
  const s = useArchive();
  const [code, setCode] = useState("");
  const [type, setType] = useState<FeatureType>("灰坑");
  const [hostUnitId, setHostUnitId] = useState("");
  const [affected, setAffected] = useState<string[]>([]);
  const [depth, setDepth] = useState("");
  const [note, setNote] = useState("");
  const [crewId, setCrewId] = useState("");
  const [progressId, setProgressId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const host = s.units.find((u) => u.id === hostUnitId);
  const hostProgress = host ? progressOfUnit(s, host.id) : [];

  const changeHost = (id: string) => {
    setHostUnitId(id);
    setAffected(id ? [id] : []);
    setProgressId("");
    setConflicts([]);
  };

  const toggleAffected = (id: string) => {
    if (id === hostUnitId) return; // 所在探方必须受影响
    setAffected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submit = () => {
    const result = dispatch({
      type: "feature",
      input: {
        code, type, hostUnitId,
        affectedUnitIds: affected,
        depth: Number(depth),
        note, crewId,
        progressId: progressId || undefined,
        date,
      },
    });
    setConflicts(result.conflicts);
    if (result.ok) {
      setCode(""); setDepth(""); setNote(""); setProgressId("");
      setAffected(hostUnitId ? [hostUnitId] : []);
    }
  };

  return (
    <Panel title="发现遗迹单位登记" eyebrow="遗迹保护">
      <div className="form-grid form-grid-3">
        <Field label="遗迹编号"><TextInput placeholder="如 H13" value={code} onChange={(e) => setCode(e.target.value)} /></Field>
        <Field label="遗迹类型">
          <Select value={type} onChange={(e) => setType(e.target.value as FeatureType)}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="发现日期"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="所在探方">
          <Select value={hostUnitId} onChange={(e) => changeHost(e.target.value)}>
            <option value="">请选择探方</option>
            {s.units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
          </Select>
        </Field>
        <Field label="发现深度" hint="cm"><TextInput type="number" placeholder="如 46" value={depth} onChange={(e) => setDepth(e.target.value)} /></Field>
        <Field label="发现班组" hint="与进尺记录绑定">
          <Select value={crewId} onChange={(e) => setCrewId(e.target.value)}>
            <option value="">请选择班组</option>
            {s.crews.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="关联本探方进尺" hint="可选，绑定原班组记录">
          <Select value={progressId} onChange={(e) => setProgressId(e.target.value)} disabled={!hostUnitId}>
            <option value="">不关联</option>
            {hostProgress.map((p) => {
              const crew = s.crews.find((c) => c.id === p.crewId);
              const layer = s.strata.find((l) => l.id === p.layerId);
              return <option key={p.id} value={p.id}>{p.date} {layer?.code} {p.startDepth}–{p.startDepth + p.advance}cm（{crew?.name}）</option>;
            })}
          </Select>
        </Field>
        <Field label="遗迹现象描述">
          <TextInput placeholder="如 夹炭屑，见动物骨" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>

      {hostUnitId && (
        <div className="affected-pick">
          <span className="field-label">受影响探方（登记后转入保护停挖，所在探方必选）</span>
          <div className="chips">
            {s.units.map((u) => (
              <button
                key={u.id}
                type="button"
                className={affected.includes(u.id) ? "chip-on" : ""}
                onClick={() => toggleAffected(u.id)}
                disabled={u.id === hostUnitId}
              >
                {u.code}{u.id === hostUnitId ? "（所在）" : ""}
              </button>
            ))}
          </div>
        </div>
      )}

      <ConflictView conflicts={conflicts} />

      <div className="form-actions">
        <button className="primary-action" onClick={submit}>登记并转入保护停挖</button>
      </div>

      <div className="feature-list">
        {s.features.map((f) => {
          const crew = s.crews.find((c) => c.id === f.crewId);
          return (
            <article key={f.id} className="feature-card">
              <div className="feature-head">
                <strong>{f.code}</strong>
                <span className="muted-text">{f.type} · 深度 {f.depth} cm · 发现班组 {crew?.name}</span>
                {f.status === "active"
                  ? <Badge tone="danger">保护中</Badge>
                  : <Badge tone="ok">已处理·已复挖</Badge>}
              </div>
              <p className="feature-note">{f.note}</p>
              <div className="feature-units">
                {f.affectedUnitIds.map((uid) => {
                  const u = s.units.find((x) => x.id === uid);
                  const halted = !!haltOfFeatureUnit(s, f.id, uid);
                  const measured = !!measureForFeatureUnit(s, f.id, uid);
                  return (
                    <span key={uid} className="feature-unit">
                      {u?.code}
                      {halted && <Badge tone="danger">停挖</Badge>}
                      {!halted && measured && <Badge tone="ok">已复挖</Badge>}
                      {halted && measured && <Badge tone="warn">措施已登记·待复挖</Badge>}
                    </span>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
