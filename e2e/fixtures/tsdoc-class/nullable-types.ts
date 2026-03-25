export class NullableForm {
  name!: string;
  nickname!: string | null;
  age?: number;
  score!: number | null;
  status!: "active" | "inactive";
  tags?: string[];
}
