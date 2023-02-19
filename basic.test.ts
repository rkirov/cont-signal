import {input} from '.';

test('basic signal', () => {
    const a = input(1);
    const double = a.read(a => a * 2);
    expect(double.value).toBe(2);
    a.value = 4;
    expect(double.value).toBe(8);
    a.value = 6;
    expect(double.value).toBe(12);
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
