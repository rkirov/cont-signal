/**
 * Continuation-based signal implementation.
 */

export interface Signal<T> {
    get value(): T;
    read<S>(f: (t: T) => S|Signal<S>): Signal<S>;
}

export interface Input<T> extends Signal<T> {
    set value(t: T);
}

const REFERENTIAL_EQUALITY = <T>(a: T, b: T) => a === b;

enum State {
    // For optimization each signal keeps track of whether its value is the same as previous value.
    CLEAN_AND_SAME_VALUE,
    CLEAN_AND_DIFFERENT_VALUE,
    DIRTY,
}

/**
 * We need two extra pieces of information to propagete through the
 * continuations:
 * - the set of inputs that were read during the computation.
 * - the state of the previous computation.
 */
type Continuation<T> = (t: T, inputs: Set<InputImpl<any>>, state: State) => void;
type ContValue<T> = (ct: Continuation<T>) => void;

/**
 * Global count of signals created. Used for debugging only.
 */
 let COUNT = 0;

class ReadOnlySignal<T> implements Signal<T> {
    /**
     * True initially, so that the first read will trigger a computation.
     * After that, false when at least one input in the transitive closure has changed.
     */
    __state = State.DIRTY;

    /**
     * Cache value of the computation. Reresents the signal value only if state is CLEAN_.
     */
    private __value: T = null as any;

    /**
     * The set of inputs that were read during the last computation.
     * Since signals are dynamic, this can change from one computation to the next.
     */
    __inputs: Set<InputImpl<any>> = new Set();

    /**
     * Global count of the number of signals created. Used for debugging.
     */
    id = COUNT++;
    private ref = new WeakRef(this);

    // TODO: make this configurable.
    protected eq: (a: T, b: T) => boolean = REFERENTIAL_EQUALITY;

    __sameValueDuringLastComputation = false;

    constructor(public __ct: ContValue<T>, public name?: string) { }
    read<S>(f: (t: T) => S|ReadOnlySignal<S>, name?: string): ReadOnlySignal<S> {
        return new ReadOnlySignal<S>(ct => {
            const val = this.value;
            if (this.__state === State.CLEAN_AND_SAME_VALUE) {
                // the first two values don't matter, because we are not going to use them.
                // TODO: find a better way to do this.
                ct(null as any, null as any, this.__state);
                return;
            }
            const res = f(val);
            // Adding auto-wrapping of pure values, akin to JS promises.
            // This means we can ever create Signal<Signal<T>>.
            // Are we trading off some capabilities for synthatic convenience?
            if (!(res instanceof ReadOnlySignal)) return ct(res, this.__inputs, this.__state);
            
            const resV = res.value;
            ct(resV, new Set([...this.__inputs, ...res.__inputs]), this.__state);
        }, name);
    }

    /**
     * For debugging purposes only.
     */
    toString() {
        return `Signal('${this.name}', ${this.id})`;
    }
    get value(): T {
        if (this.__state !== State.DIRTY) return this.__value;
        // during the readers can change, so we remove them first.
        // TODO: use counters trick to optimize this.
        // https://github.com/angular/angular/tree/a1b4c281f384cfd273d81ce10edc3bb2530f6ecf/packages/core/src/signals#equality-semantics
        for (let i of this.__inputs) i.__readers.delete(this.ref);
        this.__ct((x: T, inputs, downstreamState) => {
            if (downstreamState === State.CLEAN_AND_SAME_VALUE) {
                this.__state = State.CLEAN_AND_SAME_VALUE;
                // inputs can't change if the downstream value was the same.
                return;
            }
            if (this.eq(x, this.__value)) {
                this.__state = State.CLEAN_AND_SAME_VALUE;
            } else {
                this.__state = State.CLEAN_AND_DIFFERENT_VALUE;
                this.__value = x;
            }
            // note that inputs can change even if the value is the same.
            this.__inputs = inputs;
        });
        for (let i of this.__inputs) i.__readers.add(this.ref);
        return this.__value;
    }
}

class InputImpl<T> extends ReadOnlySignal<T> {
    __inputs: Set<InputImpl<any>> = new Set([this]);
    // Using WeakRef here to avoid retaining reference to readers.
    __readers: Set<WeakRef<ReadOnlySignal<any>>> = new Set();

    constructor(protected val: T, name?: string) {
        // State.CLEAN_AND_SAME_VALUE is not possible here, because we handle that in the setter.
        super(ct => ct(this.val, this.__inputs, State.CLEAN_AND_DIFFERENT_VALUE), name);
    }
    get value(): T {
        return this.val;
    }
    set value(t: T) {
        if (this.eq(this.val, t)) return;
        this.val = t;
        for (let r of this.__readers) {
            let reader = r.deref();
            if (reader) reader.__state = State.DIRTY;
        }
    }
}

export function input<T>(t: T, name?: string): Input<T> {
    return new InputImpl(t, name);
}