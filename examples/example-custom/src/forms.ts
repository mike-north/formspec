import { Field, Group, Minimum, EnumOptions } from "@formspec/decorators";
import { Title, Subtitle, Action } from "./decorators.js";

export class TaskForm {
  @Title
  @Group("Header")
  @Field({ displayName: "Task Name", description: "A short name for this task" })
  name!: string;

  @Subtitle
  @Group("Header")
  @Field({ displayName: "Description" })
  description?: string;

  @Group("Details")
  @Field({ displayName: "Priority" })
  @Minimum(1)
  priority!: number;

  @Group("Details")
  @Field({ displayName: "Status" })
  @EnumOptions([
    { id: "todo", label: "To Do" },
    { id: "in-progress", label: "In Progress" },
    { id: "done", label: "Done" },
  ])
  status!: "todo" | "in-progress" | "done";

  @Group("Details")
  @Field({ displayName: "Assignee" })
  assignee?: string;

  @Action({ label: "Submit", style: "primary" })
  @Group("Actions")
  @Field({ displayName: "Submit Action" })
  submitLabel!: string;

  @Action({ label: "Cancel", style: "secondary" })
  @Group("Actions")
  @Field({ displayName: "Cancel Action" })
  cancelLabel?: string;
}
