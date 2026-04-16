import { expectAssignable } from "tsd";
import { createFormSpecFactory, field } from "../index.js";
import type { ArrayField, FormSpec, ObjectField, TextField } from "@formspec/core";

const defaultFactory = createFormSpecFactory();

expectAssignable<TextField<"name">>(defaultFactory.field.text("name"));
expectAssignable<ArrayField<"addresses", [TextField<"street">]>>(
  defaultFactory.field.array("addresses", defaultFactory.field.text("street"))
);
expectAssignable<ObjectField<"address", [TextField<"street">]>>(
  defaultFactory.field.object("address", defaultFactory.field.text("street"))
);
expectAssignable<FormSpec<readonly [TextField<"name">]>>(
  defaultFactory.formspec(defaultFactory.field.text("name"))
);

const strictFactory = createFormSpecFactory({
  metadata: {
    field: {
      apiName: { mode: "require-explicit" },
      displayName: { mode: "require-explicit" },
    },
  },
} as const);

// @ts-expect-error config is required when metadata policy requires explicit names
strictFactory.field.text("name");
// @ts-expect-error array metadata config is required when metadata policy requires explicit names
strictFactory.field.array("addresses", strictFactory.field.text("street", { apiName: "street", displayName: "Street" }));
// @ts-expect-error object metadata config is required when metadata policy requires explicit names
strictFactory.field.object("address", strictFactory.field.text("street", { apiName: "street", displayName: "Street" }));

expectAssignable<TextField<"name">>(
  strictFactory.field.text("name", {
    apiName: "full_name",
    displayName: "Full Name",
  })
);
expectAssignable<ArrayField<"addresses", [TextField<"street">]>>(
  strictFactory.field.array(
    "addresses",
    {
      apiName: "addresses",
      displayName: "Addresses",
    },
    strictFactory.field.text("street", {
      apiName: "street",
      displayName: "Street",
    })
  )
);
expectAssignable<ObjectField<"address", [TextField<"street">]>>(
  strictFactory.field.object(
    "address",
    {
      apiName: "address",
      displayName: "Address",
    },
    strictFactory.field.text("street", {
      apiName: "street",
      displayName: "Street",
    })
  )
);

// @ts-expect-error strict factories should reject elements created by the global builder namespace
strictFactory.formspec(field.text("name", { apiName: "name", displayName: "Name" }));

// @ts-expect-error strict factories should reject unscoped child elements inside structural helpers
strictFactory.group("Customer", field.text("name", { apiName: "name", displayName: "Name" }));

// @ts-expect-error strict factories should reject unscoped child elements in nested array builders
strictFactory.field.array("addresses", { apiName: "addresses", displayName: "Addresses" }, field.text("street", { apiName: "street", displayName: "Street" }));
