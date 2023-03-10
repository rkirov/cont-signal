import {input, read} from '.';

test('basic signal', () => {
    const a = input(1);
    const double = a.read(a => a * 2);
    expect(double.value).toBe(2);
    a.value = 4;
    expect(double.value).toBe(8);
    a.value = 6;
    expect(double.value).toBe(12);
});

test('basic pass-through', () => {
    const a = input(1);
    const b = a.read(x => x);
    expect(b.value).toBe(1);
});

test('basic return signal', () => {
    const a = input(1);
    const b = a.read(_ => a);
    expect(b.value).toBe(1);
});

test('nested readers', () => {
    const a = input(1);
    const b = input(2);
    const sum = a.read(a => b.read(b => a + b));
    expect(sum.value).toBe(3);
    a.value = 5;
    expect(sum.value).toBe(7);
    b.value = 10;
    expect(sum.value).toBe(15);
});

test('read returning signal', () => {
    const a = input(1);
    const b = input(2);
    const c = input(false);
    const res = c.read(c => c ? a : b);
    expect(res.value).toBe(2);
    c.value = true;
    expect(res.value).toBe(1);
});

test('multi read returning value', () => {
    const a = input(1);
    const b = input(2);
    const c = read(a, b, (a, b) => a + b);
    expect(c.value).toBe(3);
    a.value = 5;
    expect(c.value).toBe(7);
    b.value = 10;
    expect(c.value).toBe(15);
});

test('multi read returning signal', () => {
    const a = input(1);
    const b = input(2);
    const c = input(false);
    const res = read(a, b, c, (a, b, c) => c ? a : b);
    expect(res.value).toBe(2);
    c.value = true;
    expect(res.value).toBe(1);
});