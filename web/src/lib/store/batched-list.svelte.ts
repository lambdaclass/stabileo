export function batchedList<T>() {
  let published = $state<T[]>([]);
  let working: T[] | undefined;

  return {
    get value(): T[] { return working ?? published; },
    set value(next: T[]) {
      if (working) working = next;
      else published = next;
    },
    begin() { working = [...published]; },
    publish() {
      if (working) published = working;
      working = undefined;
    },
    append(items: readonly T[]) {
      if (working) {
        for (const item of items) working.push(item);
      } else {
        published = [...published, ...items];
      }
    },
  };
}
