import { extendDecorator } from "@formspec/decorators";
import type { FieldOptions } from "@formspec/decorators";

export const CustomField = extendDecorator("Field").as<FieldOptions>("CustomField");
export const Floor = extendDecorator("Minimum").as<number>("Floor");
export const Ceiling = extendDecorator("Maximum").as<number>("Ceiling");
