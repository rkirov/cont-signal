/**
 * Continuation-based signal implementation.
 * 
 * The external API is just Signal<T> and Input<T> interfaces, 
 * and a single constructor `input`.
 */

export interface Signal<T> {
    get value(): T;
    read<S>(f: (t: T) => S | Signal<S>, debugName?: string): Signal<S>;
}

export interface Input<T> extends Signal<T> {
    set value(t: T);
}

export function input<T>(t: T, debugName?: string): Input<T> {
    return new InputImpl(t, debugName);
}

const REFERENTIAL_EQUALITY = <T>(a: T, b: T) => a === b;

enum State {
    INITIAL,
    // For optimization each signal keeps track of whether its value is the same as previous value.
    CLEAN_AND_SAME_VALUE,
    CLEAN_AND_DIFFERENT_VALUE,
    DIRTY,
}

enum GLOBAL_STATE {
    READY,
    COMPUTING,
}

let globalState = GLOBAL_STATE.READY;

// Allows to skip the non-reactive read check for debugging.
// TODO: expose API for this.
let DEBUG = false;

/**
 * We need two extra pieces of information to propagate through the
 * continuations:
 * - the set of inputs that were read during the computation.
 * - the state of the previous computation.
 */
type Continuation<T> = (t: T, inputs: Set<InputImpl<any>>, upstreamState: State) => void;
// In Haskell, this would be a value in the continuation monad, but I can't
// find a standard way to name it so it is different from the continuation type.
/**
 * One extra piece of information compared to the continuation type:
 *   - the current state of the signal.
 */
type ContValue<T> = (ct: Continuation<T>, curState: State) => void;

/**
 * Global count of signals created. Used for debugging only.
 */
let COUNT = 0;

class SignalImpl<T> implements Signal<T> {
    /**
     * True initially, so that the first read will trigger a computation.
     * After that, false when at least one input in the transitive closure has changed.
     */
    state = State.INITIAL;

    /**
     * Cache value of the computation. Represents the signal value only if state is CLEAN_.
     */
    #cachedValue: T = null as any;

    /**
     * The set of inputs that were read during the last computation.
     * Since signals are dynamic, this can change from one computation to the next.
     */
    inputs: Set<InputImpl<any>> = new Set();

    /**
     * Global count of the number of signals created. Used for debugging.
     */
    id = COUNT++;
    #ref = new WeakRef(this);

    // TODO: make this configurable.
    protected eq: (a: T, b: T) => boolean = REFERENTIAL_EQUALITY;

    /**
     * Name is optional, used for debugging only.
     */
    constructor(private ct: ContValue<T>, private name?: string) { }
    read<S>(f: (t: T) => S | SignalImpl<S>, name?: string): SignalImpl<S> {
        return new SignalImpl<S>(makeCt([this], f), name);
    }

    /**
     * For debugging purposes only.
     */
    toString() {
        return `Signal('${this.name}', ${this.id})`;
    }
    get value(): T {
        this.checkGlobalState();
        if (this.state === State.CLEAN_AND_DIFFERENT_VALUE ||
            this.state === State.CLEAN_AND_SAME_VALUE) return this.#cachedValue;
        // during recomputation the readers can change, so we remove them first.
        // TODO: use counters trick to optimize this.
        // https://github.com/angular/angular/tree/a1b4c281f384cfd273d81ce10edc3bb2530f6ecf/packages/core/src/signals#equality-semantics
        for (let i of this.inputs) i.readers.delete(this.#ref);
        this.ct((x: T, inputs, upstreamState) => {
            if (upstreamState === State.CLEAN_AND_SAME_VALUE && this.state !== State.INITIAL) {
                this.state = State.CLEAN_AND_SAME_VALUE;
                // inputs can't change if the downstream value was the same.
                return;
            }
            if (this.eq(x, this.#cachedValue)) {
                this.state = State.CLEAN_AND_SAME_VALUE;
            } else {
                this.state = State.CLEAN_AND_DIFFERENT_VALUE;
                this.#cachedValue = x;
            }
            // note that inputs can change even if the value is the same.
            this.inputs = inputs;
        }, this.state);
        for (let i of this.inputs) i.readers.add(this.#ref);
        return this.#cachedValue;
    }

    protected checkGlobalState() {
        if (DEBUG) return;
        if (globalState === GLOBAL_STATE.COMPUTING) {
            // reset global state before throwing.
            globalState = GLOBAL_STATE.READY;
            throw new Error(`error: non-reactive read of signal ${this}. Please use .read()`);
        }
    }
}

class InputImpl<T> extends SignalImpl<T> {
    inputs: Set<InputImpl<any>> = new Set([this]);
    // Using WeakRef here to avoid retaining reference to readers.
    readers: Set<WeakRef<SignalImpl<any>>> = new Set();

    constructor(private val: T, name?: string) {
        super(_ => { throw new Error(`error: inputs continuation shouldn't be called`) }, name);
    }
    get value(): T {
        this.checkGlobalState();
        return this.val;
    }
    set value(t: T) {
        this.checkGlobalState();
        if (this.eq(this.val, t)) return;
        this.val = t;
        for (let r of this.readers) {
            let reader = r.deref();
            if (reader) reader.state = State.DIRTY;
        }
    }
}

function makeCt<T>(signals: SignalImpl<any>[], f: (...args: any[]) => T | SignalImpl<T>): ContValue<T> {
    return (ct, curState) => {
        let inputs = new Set<InputImpl<any>>();
        let values = signals.map(s => s.value);
        for (let s of signals) {
            inputs = new Set([...inputs, ...s.inputs]);
        }

        if (signals.map(x => x.state).every(s => s === State.CLEAN_AND_SAME_VALUE) && curState !== State.INITIAL) {
            // the first two values don't matter, because we are not going to use them.
            // TODO: find a better way to do this.
            ct(null as any, null as any, State.CLEAN_AND_SAME_VALUE);
            return;
        }

        globalState = GLOBAL_STATE.COMPUTING;
        let res = f(...values);
        globalState = GLOBAL_STATE.READY;

        // Adding auto-wrapping of pure values, akin to JS promises.
        // This means we can never create Signal<Signal<T>>.
        // Are we trading off some capabilities for syntactic convenience?
        if (!(res instanceof SignalImpl)) return ct(res, inputs, State.CLEAN_AND_DIFFERENT_VALUE);
        let resV = res.value;
        ct(resV, new Set([...inputs, ...res.inputs]), res.state);
    }
}

export function read<A, R>(s: Signal<A>, f: (a: A) => R | Signal<R>): Signal<R>;
export function read<A, B, R>(a: Signal<A>, b: Signal<B>, f: (a: A, b: B) => R | Signal<R>): Signal<R>;
export function read<A, B, C, R>(a: Signal<A>, b: Signal<B>, c: Signal<C>, f: (a: A, b: B, c: C) => R | Signal<R>): Signal<R>;
export function read<R>(...args: any[]): Signal<R> {
    let f = args[args.length - 1] as (...args: any[]) => R | SignalImpl<R>;
    let signals = args.slice(0, args.length - 1) as SignalImpl<any>[];
    if (signals.length === 1) return signals[0].read(f);

    return new SignalImpl(makeCt(signals, f));
}