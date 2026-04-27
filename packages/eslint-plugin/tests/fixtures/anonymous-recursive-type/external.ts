export class ExternalAnonymousRecursiveForm {
  root!: {
    value: string;
    children?: ExternalAnonymousRecursiveForm["root"][];
  };
}
