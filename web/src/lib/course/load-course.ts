import type * as CourseRoute from './course-route';

export type Course = typeof CourseRoute;

let loading: Promise<Course> | null = null;

export function loadCourse(): Promise<Course> {
  loading ??= import('./course-route').catch((e: unknown) => {
    loading = null;
    throw e;
  });
  return loading;
}
