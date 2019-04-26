export interface ReadonlyHashMap<K, V> extends Iterable<[K, V]> {
  readonly size: number;
  has(key: K): boolean;
  get(key: K): V | undefined;
  forEach(callback: (value: V, key: K, map: ReadonlyHashMap<K, V>) => void): void;
  keys(): Iterable<K>;
  clone(): HashMap<K, V>;
}

export interface ReadonlyHashSet<K> extends Iterable<K> {
  readonly size: number;
  has(key: K): boolean;
  forEach(callback: (value: K, key: K, set: ReadonlyHashSet<K>) => void): void;
  clone(): HashSet<K>;
}

export class HashMap<K, V> implements ReadonlyHashMap<K, V> {
  private readonly map = new Map<number, Array<{ key: K; value: V }>>();
  private _size = 0;

  constructor(
    private hashCode: (key: K) => number,
    private equals: (k1: K, k2: K) => boolean,
  ) {}

  get size() {
    return this._size;
  }

  has(key: K): boolean {
    const items = this.map.get(this.hashCode(key));
    if (!items) { return false; }
    for (const item of items) {
      if (this.equals(item.key, key)) { return true }
    }
    return false;
  }

  get(key: K): V | undefined {
    const items = this.map.get(this.hashCode(key));
    if (!items) { return undefined; }
    for (const item of items) {
      if (this.equals(item.key, key)) { return item.value; }
    }
    return undefined;
  }

  set(key: K, value: V): this {
    const hash = this.hashCode(key);
    let items = this.map.get(hash);
    if (items) {
      let index = -1;
      for (let i = 0; i < items.length; i++) {
        if (this.equals(items[i].key, key)) {
          index = i;
          break;
        }
      }
      if (index >= 0) {
        items.splice(index, 1);
      } else {
        this._size++;
      }
      items.push({key, value});
    } else {
      items = [{key, value}];
      this.map.set(hash, items);
      this._size++;
    }
    return this;
  }

  delete(key: K): boolean {
    const items = this.map.get(this.hashCode(key));
    if (!items) { return false; }
    for (let i = 0; i < items.length; i++) {
      if (this.equals(items[i].key, key)) {
        items.splice(i, 1);
        this._size--;
        return true;
      }
    }
    return false;
  }

  clear(): void {
    this.map.clear();
    this._size = 0;
  }

  forEach(callback: (value: V, key: K, map: HashMap<K, V>) => void) {
    for (const [key, value] of this) {
      callback(value, key, this);
    }
  }

  clone(): HashMap<K, V> {
    const clone = new HashMap<K, V>(this.hashCode, this.equals);
    clone._size = this.size;
    this.map.forEach((value, key) => clone.map.set(key, [...value]));
    return clone;
  }

  *keys(): Iterable<K> {
    for (const [, items] of this.map) {
      for (const {key} of items) {
        yield key;
      }
    }
  }

  *[Symbol.iterator](): Iterator<[K, V]> {
    for (const [, items] of this.map) {
      for (const {key, value} of items) {
        yield [key, value];
      }
    }
  }
}

export class HashSet<K> implements ReadonlyHashSet<K> {
  private map: HashMap<K, K>;

  constructor(
    private hashCode: (key: K) => number,
    private equals: (k1: K, k2: K) => boolean,
  ) {
    this.map = new HashMap(hashCode, equals);
  }

  get size() {
    return this.map.size;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  add(key: K): this {
    this.map.set(key, key);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  forEach(callback: (value: K, key: K, set: HashSet<K>) => void) {
    this.map.forEach((value, key) => callback(value, key, this));
  }

  clone(): HashSet<K> {
      const clone = new HashSet<K>(this.hashCode, this.equals);
      this.forEach(key => clone.add(key));
      return clone;
  }

  *[Symbol.iterator](): Iterator<K> {
    yield* this.map.keys();
  }
}
