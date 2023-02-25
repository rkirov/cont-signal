import type {Signal} from '.';

export type IncrTree<T> = Signal<TreeNode<T> | null>;
interface TreeNode<T> {
  readonly value: T;
  readonly left: IncrTree<T>;
  readonly right: IncrTree<T>;
}