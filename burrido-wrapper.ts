import Monad from 'burrido';
import {input} from '.';

export const Computed = Monad({
    pure: (x: any) => x,
    bind: (x: any, fn: any) => x.read(fn)
});