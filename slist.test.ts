import {input, Signal} from '.';
import {fromArray, toArray, SList} from './slist';

test('basic slist', () => {
    const list = fromArray([1, 2, 3]);
    expect(toArray(list)).toEqual([1, 2, 3]);
});

test('slist sum', () => {
    const list = fromArray([1, 2, 3]);
    function sum(list: SList<number>): Signal<number> {
        return list.read(list => list ? sum(list.tail).read(rest => rest + list.value) : 0);
    }
    const s = sum(list);
    expect(s.value).toBe(6);
    // mutate value at head
    list.value = {value: 4, tail: list.value!.tail};
    expect(s.value).toBe(9);

    // mutate value in the middle

    list.value.tail.value = {value: 0, tail: list.value.tail.value!.tail};
    expect(s.value).toBe(7);

    // mutate at tail
    list.value = {value: 5, tail: input(null)};
    expect(s.value).toBe(5);
});