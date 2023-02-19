import { input } from '.';

test('signals are lazy evaluated and cached', () => {
    let count = 0;
    const a = input(1);
    const c = a.read(x => {
        count++;
        return x;
    });
    expect(count).toBe(0);
    expect(c.value).toBe(1);
    expect(count).toBe(1);
    // read again to make sure it's cached
    expect(c.value).toBe(1);
    expect(count).toBe(1);
});

test('intermediate signals are recomputed and cached too', () => {
    const a = input(1);
    let bCount = 0;
    const b = a.read(x => {
        bCount++;
        return x;
    });
    let cCount = 0;
    const c = b.read(x => {
        cCount++;
        return x;
    });
    expect(bCount).toBe(0);
    expect(cCount).toBe(0);

    // get b to compute it.
    expect(b.value).toBe(1);
    expect(bCount).toBe(1);
    expect(cCount).toBe(0);

    // get c to compute it.
    expect(c.value).toBe(1);
    expect(bCount).toBe(1);
    expect(cCount).toBe(1);
});


test('further caching happens when a new value happens to coincide', () => {
    const x = input(0);
    const parity = x.read(x => x % 2 === 0);
    let count = 0;
    const comp = parity.read(p => {
        count++;
        return p ? 'even' : 'odd';
    });
    expect(comp.value).toBe('even');
    expect(count).toBe(1);
    x.value = 2;
    expect(comp.value).toBe('even');
    expect(count).toBe(1);
    x.value = 1;
    expect(comp.value).toBe('odd');
    expect(count).toBe(2);
});