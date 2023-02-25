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

test('detached signals do not trigger a recomputation', () => {
    const x = input('x');
    const y = input('y');
    const b = input(true);
    let bCount = 0;
    let xCount = 0;
    let yCount = 0;
    const z = b.read(b => {
        bCount++;
        return b ? x.read(x => {
            xCount++;
            return x;
        }) : y.read(y => {
            yCount++;
            return y;
        });
    });

    expect(z.value).toBe('x');
    expect(bCount).toBe(1);
    expect(xCount).toBe(1);
    expect(yCount).toBe(0);

    y.value = 'y2';
    expect(z.value).toBe('x');
    // no change, all cached.
    expect(bCount).toBe(1);
    expect(xCount).toBe(1);
    expect(yCount).toBe(0);

    x.value = 'x2';
    expect(z.value).toBe('x2');
    expect(bCount).toBe(2);
    expect(xCount).toBe(2);
    expect(yCount).toBe(0);

    // flip the boolean
    b.value = false;
    expect(z.value).toBe('y2');
    expect(bCount).toBe(3);
    expect(xCount).toBe(2);
    expect(yCount).toBe(1);

    x.value = 'x3';
    expect(z.value).toBe('y2');
    expect(bCount).toBe(3);
    expect(xCount).toBe(2);
    expect(yCount).toBe(1);
      
    y.value = 'y3';
    expect(z.value).toBe('y3');
    // no change, all cached.
    expect(bCount).toBe(4);
    expect(xCount).toBe(2);
    expect(yCount).toBe(2);
});

test('uncomputed signals are not skipped', () => {
    const x = input(0, 'x');
    const y = x.read(x => x % 2, 'y');
    const z = y.read(x => x + 2, 'z');
    // compute but not z
    expect(y.value).toBe(0);

    x.value = 2;
    expect(z.value).toBe(2);
});