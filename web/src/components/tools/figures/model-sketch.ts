import type { View } from '../../examples/define';

export function modelSketch(id: string, key: string, view: View): View {
  if (id !== 'slab-on-columns' || key !== 'deflection' || view.values.length === 0) return view;
  const top = view.values.reduce((best, value, index) => value > view.values[best] ? index : best, 0);
  return { ...view, peak: { value: view.values[top], at: [view.xy[2 * top], view.xy[2 * top + 1]] } };
}
