import {Computed} from './burrido-wrapper';
import {input} from '.';

test('burrido-wrapper basic sum', () => {
    let a = input(1);
    let b = input(2);
    let c = Computed.Do(function*(): any {
        return (yield a) + (yield b);
    });
    expect(c.value).toBe(3);
    a.value = 2;
    expect(c.value).toBe(4);
});

test('burrido-wrapper basic boolean', () => {
    let a = input(1);
    let b = input(2);
    let c = input(true);
    let f = Computed.Do(function*(): any {
        return (yield c) ? a : b;
    });
    expect(f.value).toBe(1);

    c.value = false;
    expect(f.value).toBe(2);
});