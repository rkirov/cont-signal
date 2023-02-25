import {input} from '.';
import {fromArray, toArray} from './slist';
import {qsort, filter} from './qsort';

test('basic filter', () => {
    const list = fromArray([1, 2, 3]);
    const filtered = filter(list, x => x % 2 === 0);
    expect(toArray(filtered)).toEqual([2]);
});

test('filter reacts to mutations', () => {
    const list = fromArray([1, 2, 3]);
    const filtered = filter(list, x => x % 2 === 0);
    // mutating value at head
    // new list [4, 2, 3]
    list.value = {value: 4, tail: list.value!.tail};
    expect(toArray(filtered)).toEqual([4, 2]);
});

test('it sorts', () => {
    const list = fromArray([3, 1, 2]);
    const sorted = qsort(list);
    expect(toArray(sorted)).toEqual([1, 2, 3]);
});

test('it reacts to changes in number', () => {
    const list = fromArray([3, 1, 2]);
    const sorted = qsort(list);

    // mutating a value in the front
    // new list [0, 1, 2]
    list.value = {value: 0, tail: list.value!.tail};
    expect(toArray(sorted)).toEqual([0, 1, 2]);

    // mutating a value in the middle
    // new list [0, 3, 2]
    list.value!.tail.value = {value: 3, tail: list.value!.tail.value!.tail};
    expect(toArray(sorted)).toEqual([0, 2, 3]);

});

test('it reacts to appending new values', () => {
    const list = fromArray([3, 1, 2]);
    const sorted = qsort(list);

    // appending a new value;
    // new list [3, 4, 1, 2]
    const mid = list.value!.tail;
    list.value = {value: list.value!.value, tail: input({value: 4, tail: mid})};
    expect(toArray(sorted)).toEqual([1, 2, 3, 4]);   
});

test('it reacts to removing part of the list', () => {
    const list = fromArray([3, 1, 2]);
    const sorted = qsort(list);

    // removing part of the list starting in the middle
    // new list [3, 0]
    list.value!.tail.value = {value: 0, tail: input(null)};
    expect(toArray(sorted)).toEqual([0, 3]);
});