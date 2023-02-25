import {input} from '.';
import type {Input} from '.';

interface Node<T> {
    value: T;
    tail: SList<T>;
}

export type SList<T> = Input<Node<T>|null>;

export function fromArray<T>(arr: T[]): SList<T> {
    if (arr.length === 0) {
        return input(null);
    }
    const [head, ...tail] = arr;
    return input({value: head, tail: fromArray(tail)});
}

export function toArray<T>(list: SList<T>): T[] {
    const arr: T[] = [];
    while (list.value) {
        arr.push(list.value.value);
        list = list.value.tail;
    }
    return arr;
}