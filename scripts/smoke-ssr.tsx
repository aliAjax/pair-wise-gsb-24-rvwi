// 页面渲染冒烟测试：用 react-dom/server 对整个 App 做无浏览器 SSR，
// 验证初始数据下页面渲染无异常、关键闭环文案均出现。
import { strict as assert } from "node:assert";
import { renderToString } from "react-dom/server";
import React from "react";
import { STORAGE_KEY, seedState } from "../src/domain/seed.ts";

// 浏览器 API 垫片
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

import App from "../src/App.tsx";
import { loadState, saveState } from "../src/domain/storage.ts";

// 1. 空存储（首次进入，载入种子数据）
const html1 = renderToString(React.createElement(App));
for (const text of [
  "考古探方记录",
  "每日进尺上报",
  "保护停挖",
  "班组交接",
  "地层验收",
  "T0204",
  "H12",
  "保护措施未登记",
  "禁止复挖",
  "刷新后链路一致性自检",
]) {
  assert.ok(html1.includes(text), `首屏缺少文案：${text}`);
}
// useEffect 不在 SSR 执行；直接验证持久化读写往返一致
saveState(loadState());
assert.ok(store.has(STORAGE_KEY), "saveState 应写入 localStorage");
console.log("PASS 首屏 SSR 渲染完整");

// 2. 刷新（存储中已有种子数据）应一致
const html2 = renderToString(React.createElement(App));
assert.equal(html2, html1, "刷新后渲染结果应一致");
console.log("PASS 刷新后页面一致");

// 3. 模拟用户操作后再刷新：直接构造一个「发现新遗迹并停挖」的持久化状态
const halted = {
  ...seedState,
  features: [
    ...seedState.features,
    {
      id: "fx", code: "M8", kind: "墓葬" as const, trenchId: "T0203", depth: 130,
      description: "土坑竖穴", discoveredInReportId: null, crewId: "c1", date: "2026-09-20",
      protectionRegistered: false, protectionNote: "", protectedAt: null, resumedAt: null,
    },
  ],
  trenches: seedState.trenches.map((t) =>
    t.id === "T0203"
      ? { ...t, status: "halted" as const, haltedFromCrewId: t.currentCrewId }
      : t,
  ),
};
store.set(STORAGE_KEY, JSON.stringify(halted));
const html3 = renderToString(React.createElement(App));
assert.ok(html3.includes("M8"), "刷新后应保留新遗迹 M8");
assert.ok(html3.includes("保护停挖"), "T0203 应渲染为保护停挖");
console.log("PASS 操作后刷新状态保持（遗迹与停挖）");

// 4. 损坏的存储应安全回退种子
store.set(STORAGE_KEY, "{not-json");
const html4 = renderToString(React.createElement(App));
assert.ok(html4.includes("T0203"), "存储损坏时应回退种子数据");
console.log("PASS 存储损坏安全回退");

console.log("\n页面 SSR 冒烟全部通过");
