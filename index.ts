/**
 * Continuation-based signal implementation.
 * 
 * The external API is just Signal<T> and Input<T> interfaces, 
 * and a single constructor `input`.
 */

export interface Signal<T> {
    get value(): T;
    read<S>(f: (t: T) => S|Signal<S>): Signal<S>;
}

export interface Input<T> extends Signal<T> {
    set value(t: T);
}

export function input<T>(t: T, name?: string): Input<T> {
    return new InputImpl(t, name);
}

const REFERENTIAL_EQUALITY = <T>(a: T, b: T) => a === b;

enum State {
    // For optimization each signal keeps track of whether its value is the same as previous value.
    CLEAN_AND_SAME_VALUE,
    CLEAN_AND_DIFFERENT_VALUE,
    DIRTY,
}

/**
 * We need two extra pieces of information to propagate through the
 * continuations:
 * - the set of inputs that were read during the computation.
 * - the state of the previous computation.
 */
type Continuation<T> = (t: T, inputs: Set<InputImpl<any>>, upstreamState: State) => void;
// In Haskell, this would be a value in the continuation monad, but I can't
// find a standard way to name it so it is different from the continuation type.
type ContValue<T> = (ct: Continuation<T>) => void;

/**
 * Global count of signals created. Used for debugging only.
 */
 let COUNT = 0;

class SignalImpl<T> implements Signal<T> {
    /**
     * True initially, so that the first read will trigger a computation.
     * After that, false when at least one input in the transitive closure has changed.
     */
    state = State.DIRTY;

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
    constructor(public __ct: ContValue<T>, public name?: string) { }
    read<S>(f: (t: T) => S|SignalImpl<S>, name?: string): SignalImpl<S> {
        return new SignalImpl<S>(ct => {
            const val = this.value;
            if (this.state === State.CLEAN_AND_SAME_VALUE) {
                // the first two values don't matter, because we are not going to use them.
                // TODO: find a better way to do this.
                ct(null as any, null as any, this.state);
                return;
            }
            const res = f(val);

            // Adding auto-wrapping of pure values, akin to JS promises.
            // This means we can never create Signal<Signal<T>>.
            // Are we trading off some capabilities for syntactic convenience?
            if (!(res instanceof SignalImpl)) return ct(res, this.inputs, this.state);
            
            const resV = res.value;
            ct(resV, new Set([...this.inputs, ...res.inputs]), this.state);
        }, name);
    }

    /**
     * For debugging purposes only.
     */
    toString() {
        return `Signal('${this.name}', ${this.id})`;
    }
    get value(): T {
        if (this.state !== State.DIRTY) return this.#cachedValue;
        // during recomputation the readers can change, so we remove them first.
        // TODO: use counters trick to optimize this.
        // https://github.com/angular/angular/tree/a1b4c281f384cfd273d81ce10edc3bb2530f6ecf/packages/core/src/signals#equality-semantics
        for (let i of this.inputs) i.readers.delete(this.#ref);
        this.__ct((x: T, inputs, upstreamState) => {
            if (upstreamState === State.CLEAN_AND_SAME_VALUE) {
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
        });
        for (let i of this.inputs) i.readers.add(this.#ref);
        return this.#cachedValue;
    }
}

class InputImpl<T> extends SignalImpl<T> {
    inputs: Set<InputImpl<any>> = new Set([this]);
    // Using WeakRef here to avoid retaining reference to readers.
    readers: Set<WeakRef<SignalImpl<any>>> = new Set();

    constructor(private val: T, name?: string) {
        // State.CLEAN_AND_SAME_VALUE is not possible here, because we handle that in the setter.
        super(ct => ct(this.val, this.inputs, State.CLEAN_AND_DIFFERENT_VALUE), name);
    }
    get value(): T {
        return this.val;
    }
    set value(t: T) {
        if (this.eq(this.val, t)) return;
        this.val = t;
        for (let r of this.readers) {
            let reader = r.deref();
            if (reader) reader.state = State.DIRTY;
        }
    }
}

