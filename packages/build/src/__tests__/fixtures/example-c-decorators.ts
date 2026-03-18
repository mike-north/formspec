import { customDecorator } from "@formspec/decorators";

export const Title = customDecorator("title-field").marker("Title");
export const Priority = customDecorator("priority").as<{ level: string }>("Priority");
