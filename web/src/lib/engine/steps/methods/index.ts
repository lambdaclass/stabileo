/**
 * Every explained method, registered in catalog order: the groups as the
 * catalog lists them, each group's methods as its file orders them.
 */
import { registerMethods } from '../registry';
import { methods as core } from './core';
import { methods as continuous } from './continuous';
import { methods as frames } from './frames';
import { methods as trusses } from './trusses';
import { methods as deformation } from './deformation';
import { methods as cuts } from './cuts';

registerMethods([...core, ...continuous, ...frames, ...trusses, ...deformation, ...cuts]);

export { allMethods, methodsIn, methodById, GROUP_ORDER } from '../registry';
export type { ExplainedMethod, MethodContext, MethodGroup } from '../registry';
