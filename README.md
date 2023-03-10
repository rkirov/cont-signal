# Cont-Signal - Continuations based Signals JS framework

[![Node.js CI](https://github.com/rkirov/cont-signal/actions/workflows/node.js.yml/badge.svg)](https://github.com/rkirov/cont-signal/actions/workflows/node.js.yml)

## How to use it

This library provides an quite unorthodox implementation of what is currently
referred as `fine-grained reactivity` or `signals` in the JS web
frameworks community.

High-level it allows for a computation like `a % 2 + b` to be written as:

```ts
const a = input(0);
const b = input(1);
const c = a.read(a => a % 2);
const d = c.read(c => b.read(b => c + b));
console.log(d.value);  // 1
```

What we get back for this extremely odd way to write a computation is that it becomes reactive to changes in the inputs.

```ts
a.value = 1;
console.log(d.value); // 2
```

The recomputation is lazy:

- no computation done until `d.value` call
- though some internal preparation is done in the `a.value` setter.

and as efficient as possible:

- only the subcomputations transitively needed by `d` are computed.
- the subcomputations that are not affected by the changes in `a` are cached.

The internal implementation is inspired by what is known as the Continuation
Monad in the functional programming community. That said, you don't need
 to know about monads or functional programming to use it. Knowing about
 that lineage explains the odd API compared to other JS signal frameworks.
 What is lost in syntactic convenience is hopefully gained in simplicity
 of implementation.

The whole external interface can be summarized in two interfaces and
two exported functions:

```ts
export interface Signal<T> {
    get value(): T;
    read<S>(f: (t: T) => S|Signal<S>): Signal<S>;
}

export interface Input<T> extends Signal<T> {
    set value(t: T);
}

export function input<T>(t: T): Input<T>;

export function read<A, B, R>(a: Signal<A>, b: Signal<B>, f: (a: A, b: B): R|Signal<R>): Signal<R>;
export function read<A, B, R>(a: Signal<A>, b: Signal<B>, c: Signal<C>, f: (a: A, b: B, c: C): R|Signal<R>): Signal<R>;
// etc ...
```

The only non-trivial method is `.read` which one can think of like `Promise.then`, but with different meaning (can run multiple times for example).

## Why is reading multiple signals needed?

At first it might seem that reading multiple signals is not necessary. Instead of `read(a, b, f)` one
can write `a.read(a => b.read(b => f(a, b))`. But their semantics are different. In the nested signal (later) case, when `a` changes a whole new signal is recreated on each recomputation. In the multi-read (former) case, no new signals are created so it is likely cheaper performance-wise.

However, reading multiple signals at once means that necessarily `f` is recomputed on changes in `a` or `b`,
even if the computation doesn't need one of them.

So

```ts
read(a, b, (a, b) => {
    if (a === 0) return 0;
    return a + b;
});
```

would recompute on `b` changes even if `a` is zero. While

```ts
a.read(a => {
    if (a === 0) return 0;
    return b.read(b => {
        return a + b;
    });
});
```

Will be more efficient in recomputations, at the expense of recreating an inner signal for `b.read` on
each `a` recomputation.

## Background

I have been interested in the following three areas:

- [self-adjusting or incremental or adaptive computation](https://www.cs.cmu.edu/~rwh/students/acar.pdf)
- build systems - make, ninja, bazel, etc.
- efficient updating of the view in UI programming - change detection, VDOM, etc.

On an abstract level, they are all tackling the same problem - efficient recomputation after an initial computation, but domains feels so different
that there is little cross-pollination of ideas. I tried to write a more
in depth analysis of the connections here in a [blog](https://rkirov.github.io/posts/incremental_computation/), but I feel I confused myself more than reaching
any deep connection :shrug:.

As part of that research I translated an incremental computation library from
Haskell to JS [adapt-comp](https://github.com/rkirov/adapt-comp).

Recently, I noticed an explosion of `signal` JS libraries. It appears the linage of these ideas are from [S.js](https://github.com/adamhaile/S) through [solid JS](https://www.solidjs.com/) an onto most modern JS frameworks. The word `signal` doesn't carry much of concrete semantics in general, but to the JS developer it
already means a very particular thing, so I use it in that context.

Some examples of signal libraries, that I have looked at:

- [Preact Signals](https://preactjs.com/guide/v10/signals/)
- [Reactively](https://github.com/modderme123/reactively)
- [Angular Signals](https://github.com/angular/angular/tree/a1b4c281f384cfd273d81ce10edc3bb2530f6ecf/packages/core/src/signals)

The recomputation semantics of `adapt-comp` are different from JS signal libraries.
For example, it has a global `a.propagate()` method instead of lazy pull-based
recomputation on a read.

This project was born by trying to marry:

- recomputation semantics like the JS signal libraries.
- continuation based implementation similar to `adapt-comp`.

Finally, for the API surface, I tried to make it as close as possible to the
JS aesthetics. While not fully hiding the monadic linage, but adding "niceties"
like implicit `return`, so that it is basically the same as `Promise` which
a regular JS developer is familiar with.

One neat byproduct of this approach is that there is no explicit dependency
graph structure or traversal anywhere in the implementation. It is all
implicitly captured by how the continuations are built. The internal continuations
wrap the user-provided callbacks and internal state passing mechanisms.

I don't know if this approach is beneficial in any performance related way.
Code-wise it is quite short, so it is suitable for size-sensitive frameworks.
But most of all, using continuations is quite mind-bending, so I had lots of fun writing it.

## Implementation notes, or how was this built

I started with the simple continuation monad:

```ts
type Ct<T> = (ct: (t: T) => void) => void;  
const ret: <T>(t:T) => Ct<T> = t => ct => ct(t);
const bind: <S, T>(sCt: Ct<S>, f: (s: S) => Ct<T>) => Ct<T> =
    (sCt, f) => tCt => sCt(s => f(s)(t => tCt(t)));
```

Note just these two simple functions provide 'fine-grained' recomputation:

```ts
let x = 0;
const a: Ct<number> = ct => ct(x);
const b = ret(1);
const c = bind(a, a => ret(a % 2));
const d = bind(c, c => bind(b, b => ret(c + b)));
d(console.log);  // 1
x = 1;
d(console.log); // 2
```

Then I dressed it in a stateful `Signal` class that stored the last value for
caching. This, of course, broke recomputation, because I needed a way to
invalidate the cache. I extended the continuation combinator with some
custom state - aggregating all inputs used during each computation and passing the
state of the previous computation.

Once an input knows about the current set of signals that used it, it can
make them all dirty directly on each write. A subsequent read of a dirty signal,
reuses the continuation to perform all recomputation.

## Next Steps

I consider this library still a work-in-progress. My next tasks would be:

- [ ] add more tests, I still have doubts about the correctness of the algorithms used.
- [ ] more efficient aggregation of inputs and invalidation like Angular Signals.
- [ ] add support for propagating thrown errors during recomputation.
- [ ] benchmark performance and memory usage. It was not an explicit goal of the current implementation, but there could be benefits of the minimal continuation approach.
- [ ] Make sure there are no mem leaks. I used WeakRef, but didn't test that.
- [ ] add effects, i.e. computations that are recomputed without an explicit .value read.
- [ ] Smarter keeping track of values. `x = 1; x = 2; x = 1` will trigger recomputation of all x dependencies.
- [ ] fix burrido wrapper types if possible.
