import {input} from '.';
import {SList, toArray} from './slist';

export function filter<T>(slist: SList<T>, pred: (x: T) => boolean): SList<T> {
    return slist.read(list => {
        if (!list) {
            return input(null);
        }
        const rest = filter(list.tail, pred);
        return pred(list.value) ? input({value: list.value, tail: rest}) : rest;
    });
}

export function qsort<T>(slist: SList<T>, rest?: SList<T>): SList<T> {
    return slist.read(list => {
        if (list === null) {
            return rest ? rest : input(null);
        }
        const pivot = list.value;
        const left = filter(list.tail, x => x < pivot);
        const right = filter(list.tail, x => x >= pivot);
        const half = input({value: pivot, tail: qsort(right, rest)});
        return qsort(left, half);
    });
}