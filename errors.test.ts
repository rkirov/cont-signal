import {input} from '.';

test('errors on non-reactive reads in read callbacks', () => {
    const a = input(1);
    const d = a.read(_ => a.value * 2);
    expect(() => d.value).toThrow();
});

test('errors on non-reactive writes in read callbacks', () => {
    const a = input(1);
    const d = a.read(_ => { a.value = 2; return a;});
    expect(() => d.value).toThrow();
});
