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
    CLEAN,
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
type Continuation<T> = (t: T|SignalImpl<T>, inputs: Set<InputImpl<any>>, comp: IN_SIGNALS_STATE) => void;
// In Haskell, this would be a value in the continuation monad, but I can't
// find a standard way to name it so it is different from the continuation type.
/**
 * One extra piece of information compared to the continuation type:
 *   - the current state of the signal.
 */
type ContValue<T> = (ct: Continuation<T>, lastReadVersions: Map<SignalImpl<any>, number>) => void;

/**
 * Global count of signals created. Used for debugging only.
 */
let COUNT = 0;

enum IN_SIGNALS_STATE {
    AT_LEAST_ONE_NEW,
    SAME,
}

class SignalImpl<T> implements Signal<T> {
    /**
     * True initially, so that the first read will trigger a computation.
     * After that, false when at least one input in the transitive closure has changed.
     */
    state = State.DIRTY;

    /**
     * Increments if the current value was different from the last value.
     * Note that it doesn't keep any back-history tracking. So 1->2->1 will be 3 version bumps.
     */
    version = 0;

    /**
     * Mapping between signals read as inputs for the current computation and corresponding
     * version they were at.
     */
    lastRead = new Map<SignalImpl<unknown>, number>();

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

    lastSignal: SignalImpl<T>| null = null;

    get value(): T {
        this.checkGlobalState();
        if (this.state === State.CLEAN) return this.#cachedValue;
        // during recomputation the readers can change, so we remove them first.
        // TODO: use counters trick to optimize this.
        // https://github.com/angular/angular/tree/a1b4c281f384cfd273d81ce10edc3bb2530f6ecf/packages/core/src/signals#equality-semantics
        for (let i of this.inputs) i.readers.delete(this.#ref);
        this.ct((x: T| SignalImpl<T>, inputs, inSignalsState) => {

            if (inSignalsState === IN_SIGNALS_STATE.SAME) {
                if (this.lastSignal === null) {
                    this.state = State.CLEAN;
                    return;
                }
                // still need to refresh the cached value
                // rerun the rest of the code, because lastSignal could have changed.
                x = this.lastSignal;
                inputs = this.inputs;
            }

            // Adding auto-wrapping of pure values, akin to JS promises.
            // This means we can never create Signal<Signal<T>>.
            // Are we trading off some capabilities for syntactic convenience?
            if ((x instanceof SignalImpl)) {
                this.lastSignal = x;
                x = x.value;
                inputs = new Set([...inputs, ...this.lastSignal.inputs]);
            }
            
            if (!this.eq(x, this.#cachedValue)) {
                this.#cachedValue = x;
                this.version += 1;
            }
            this.state = State.CLEAN;
            // note that inputs can change even if the value is the same.
            this.inputs = inputs;
        }, this.lastRead);
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
    state = State.CLEAN;

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
        this.version += 1;
        this.val = t;
        for (let r of this.readers) {
            let reader = r.deref();
            if (reader) reader.state = State.DIRTY;
        }
    }
}

function makeCt<T>(signals: SignalImpl<any>[], f: (...args: any[]) => T | SignalImpl<T>): ContValue<T> {
    return (ct, lastReadVersions) => {
        let inputs = new Set<InputImpl<any>>();

        // have to call getters first to refresh all values and internal state.
        let values = signals.map(s => s.value);

        for (let s of signals) {
            inputs = new Set([...inputs, ...s.inputs]);
        }

        let sameV = true;
        for (let s of signals) {
            if (!lastReadVersions.has(s) || lastReadVersions.get(s) != s.version) {
                // just update in place since we won't need the last read state any more.
                lastReadVersions.set(s, s.version);
                sameV = false;
            }
        }
        if (sameV) {
            return ct(null as any, null as any, IN_SIGNALS_STATE.SAME);
        }

        globalState = GLOBAL_STATE.COMPUTING;
        let res = f(...values);
        globalState = GLOBAL_STATE.READY;
        ct(res, inputs, IN_SIGNALS_STATE.AT_LEAST_ONE_NEW);
    }
}

export function read<A, R>(s: Signal<A>, f: (a: A) => R | Signal<R>): Signal<R>;
export function read<A, B, R>(a: Signal<A>, b: Signal<B>, f: (a: A, b: B) => R | Signal<R>): Signal<R>;
export function read<A, B, C, R>(a: Signal<A>, b: Signal<B>, c: Signal<C>, f: (a: A, b: B, c: C) => R | Signal<R>): Signal<R>;
export function read<R>(...args: any[]): Signal<R> {
    let f = args[args.length - 1] as (...args: any[]) => R | SignalImpl<R>;
    let signals = args.slice(0, args.length - 1) as SignalImpl<any>[];
    return new SignalImpl(makeCt(signals, f));
}