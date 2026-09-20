import type { ReactNode } from "react";
import type { Issue } from "../domain/types";

// 冲突提示：展示探方、地层、深度、班组与原值
export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="issue-box" role="alert">
      {issues.map((issue, index) => (
        <div className="issue-item" key={index}>
          <strong>⛔ {issue.message}</strong>
          {(issue.trenchId || issue.stratumId || issue.depth || issue.crewId || issue.originalValue) && (
            <dl>
              {issue.trenchId && (
                <div>
                  <dt>探方</dt>
                  <dd>{issue.trenchId}</dd>
                </div>
              )}
              {issue.stratumId && (
                <div>
                  <dt>地层</dt>
                  <dd>{issue.stratumId}</dd>
                </div>
              )}
              {issue.depth && (
                <div>
                  <dt>深度</dt>
                  <dd>{issue.depth}</dd>
                </div>
              )}
              {issue.crewId && (
                <div>
                  <dt>班组</dt>
                  <dd>{issue.crewId}</dd>
                </div>
              )}
              {issue.originalValue && (
                <div className="full">
                  <dt>原值 / 冲突记录</dt>
                  <dd>{issue.originalValue}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      ))}
    </div>
  );
}

export function Toast({ kind, children }: { kind: "ok" | "err"; children: ReactNode }) {
  return <div className={`toast toast-${kind}`}>{children}</div>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span>
        {label}
        {hint && <em>{hint}</em>}
      </span>
      {children}
    </label>
  );
}

export const inputClass = "ctrl";
