// 地层档案：验收过的地层只读，更正须另立带原因记录；历史数值沿更正链长期可查。
import { useState } from "react";
import { correctionChain, effectiveStratumValue, strataOfUnit } from "../domain/selectors";
import type { Stratum, StratumField } from "../domain/types";
import { dispatch, useArchive } from "../state/store";
import type { Conflict } from "../rules/validators";
import { ConflictView } from "./ConflictView";
import { Badge, Field, Panel, Select, TextInput } from "./common";

const FIELD_OPTIONS: Array<{ value: StratumField; label: string; numeric?: boolean }> = [
  { value: "code", label: "层位编号" },
  { value: "topDepth", label: "层顶深度(cm)", numeric: true },
  { value: "bottomDepth", label: "层底深度(cm)", numeric: true },
  { value: "soil", label: "土色土质" },
];

function StratumRow({ stratum, unitCode }: { stratum: Stratum; unitCode: string }) {
  const s = useArchive();
  const [editing, setEditing] = useState(false);
  const [field, setField] = useState<StratumField>("bottomDepth");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");
  const [operator, setOperator] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  const chains = (["code", "topDepth", "bottomDepth", "soil"] as StratumField[]).map((f) => ({
    field: f,
    chain: correctionChain(s, stratum.id, f),
  }));
  const changedFields = chains.filter((c) => c.chain.length > 0);

  const openEdit = (f: StratumField) => {
    setEditing(true);
    setField(f);
    setNewValue(effectiveStratumValue(s, stratum, f));
    setReason("");
    setConflicts([]);
  };

  const submit = () => {
    const result = stratum.accepted
      ? dispatch({ type: "correction", input: { targetId: stratum.id, field, newValue, reason, operator } })
      : dispatch({ type: "draftRevise", input: { targetId: stratum.id, field, newValue } });
    setConflicts(result.conflicts);
    if (result.ok) {
      setEditing(false); setNewValue(""); setReason(""); setOperator("");
    }
  };

  const accept = () => {
    const result = dispatch({ type: "accept", stratumId: stratum.id });
    setConflicts(result.conflicts);
  };

  return (
    <article className={`stratum-row ${stratum.accepted ? "is-accepted" : ""}`}>
      <div className="stratum-head">
        <strong>{unitCode} · {effectiveStratumValue(s, stratum, "code")}</strong>
        {stratum.accepted
          ? <Badge tone="muted">已验收 · 只读{stratum.acceptedAt ? `（${stratum.acceptedAt.slice(0, 10)}）` : ""}</Badge>
          : <Badge tone="ok">未验收 · 可直接修订</Badge>}
      </div>
      <div className="stratum-values">
        <span>层顶 {effectiveStratumValue(s, stratum, "topDepth")} cm</span>
        <span>层底 {effectiveStratumValue(s, stratum, "bottomDepth")} cm</span>
        <span>{effectiveStratumValue(s, stratum, "soil")}</span>
      </div>

      <div className="stratum-fields">
        {FIELD_OPTIONS.map((opt) => (
          <button key={opt.value} type="button" className="link-btn" onClick={() => openEdit(opt.value)}>
            {stratum.accepted ? `更正${opt.label}` : `修订${opt.label}`}
          </button>
        ))}
        {!stratum.accepted && <button type="button" className="link-btn primary-link" onClick={accept}>验收该层</button>}
      </div>

      {editing && (
        <div className="correction-form">
          <div className="form-grid form-grid-3">
            <Field label="更正字段">
              <Select value={field} onChange={(e) => {
                const f = e.target.value as StratumField;
                setField(f);
                setNewValue(effectiveStratumValue(s, stratum, f));
              }}>
                {FIELD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="原值" hint="只读"><TextInput readOnly value={effectiveStratumValue(s, stratum, field)} /></Field>
            <Field label="新值"><TextInput value={newValue} onChange={(e) => setNewValue(e.target.value)} /></Field>
            {stratum.accepted && <Field label="更正人"><TextInput value={operator} onChange={(e) => setOperator(e.target.value)} /></Field>}
          </div>
          {stratum.accepted && (
            <Field label="更正原因" hint="必填，随更正记录归档"><TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="如 现场复核测量基准偏差" /></Field>
          )}
          <ConflictView conflicts={conflicts} />
          <div className="form-actions">
            <button className="primary-action" onClick={submit}>{stratum.accepted ? "另立更正记录" : "保存修订"}</button>
            <button onClick={() => setEditing(false)}>取消</button>
          </div>
        </div>
      )}

      {changedFields.length > 0 && (
        <details className="correction-chain">
          <summary>更正链 / 历史数值（{changedFields.reduce((n, c) => n + c.chain.length, 0)} 条）</summary>
          {changedFields.map(({ field: f, chain }) => {
            const label = FIELD_OPTIONS.find((o) => o.value === f)?.label;
            return (
              <div key={f} className="chain-group">
                <p className="chain-field">{label}</p>
                <ol>
                  <li className="chain-origin">原始值：{String(stratum[f])}</li>
                  {chain.map((c) => (
                    <li key={c.id}>
                      <span className="chain-values">{c.oldValue} → {c.newValue}</span>
                      <span className="chain-meta">{c.createdAt.slice(0, 10)} · {c.operator} · 原因：{c.reason || "—"}{c.supersedesId ? " · 续接更正" : ""}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </details>
      )}
    </article>
  );
}

export function StrataPanel() {
  const s = useArchive();
  return (
    <Panel title="地层验收与更正链" eyebrow="验收管控">
      <p className="inline-hint">验收过的地层只读；更正时另立带原因记录，历史数值继续可查。未验收地层可直接修订。</p>
      <div className="stratum-list">
        {s.units.map((u) => (
          <div key={u.id} className="stratum-group">
            <h3>{u.code}</h3>
            {strataOfUnit(s, u.id).map((l) => (
              <StratumRow key={l.id} stratum={l} unitCode={u.code} />
            ))}
          </div>
        ))}
      </div>
    </Panel>
  );
}
