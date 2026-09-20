// 本地最小 React 类型垫片：项目约定不新增依赖（不安装 @types/react）。
// 仅声明本项目用到的 React API；领域代码仍保留完整类型检查。

type ShimReactNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | ShimReactElement
  | ShimReactNode[];

interface ShimReactElement {
  readonly $$typeof: symbol;
  type: unknown;
  props: Record<string, unknown>;
}

declare module "react" {
  export type ReactNode = ShimReactNode;
  export interface Element extends ShimReactElement {}
  export type ReactElement = ShimReactElement;

  type SetState<T> = T | ((prev: T) => T);

  export function useState<T>(
    initial: T | (() => T),
  ): [T, (value: SetState<T>) => void];
  export function useState<T = undefined>(): [
    T | undefined,
    (value: SetState<T | undefined>) => void,
  ];

  export function useEffect(effect: () => void | (() => void), deps?: unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: unknown[]): T;

  export function createElement(
    type: unknown,
    props?: Record<string, unknown> | null,
    ...children: ShimReactNode[]
  ): ShimReactElement;

  const React: {
    createElement: typeof createElement;
    StrictMode: (props: { children?: ShimReactNode }) => ShimReactElement;
  };
  export default React;
}

declare module "react/jsx-runtime" {
  export function jsx(
    type: unknown,
    props?: Record<string, unknown> | null,
    key?: string | number,
  ): ShimReactElement;
  export const jsxs: typeof jsx;
  export const Fragment: symbol;
}

declare module "react-dom/client" {
  import type { ReactNode } from "react";
  export function createRoot(container: Element): {
    render(node: ReactNode): void;
  };
}

declare namespace JSX {
  interface Element extends ShimReactElement {}
  interface ElementClass {
    render?: unknown;
  }
  interface ElementAttributesProperty {
    props: Record<string, unknown>;
  }
  interface ElementChildrenAttribute {
    children: unknown;
  }
  type LibraryManagedAttributes<C, P> = P;
  interface IntrinsicAttributes {
    key?: string | number;
  }
  interface DOMAttributes {
    children?: ShimReactNode;
    className?: string;
    value?: string | number;
    defaultValue?: string | number;
    type?: string;
    placeholder?: string;
    min?: number | string;
    step?: number | string;
    checked?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    title?: string;
    role?: string;
    htmlFor?: string;
    onClick?: (event: unknown) => void;
    onChange?: (event: { target: { value: string } }) => void;
  }
  interface IntrinsicElements {
    [elemName: string]: DOMAttributes & Record<string, unknown>;
  }
}
