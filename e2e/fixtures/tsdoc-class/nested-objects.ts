export class OrderWithNesting {
  orderId!: string;
  customer!: {
    name: string;
    email: string;
    address?: {
      street: string;
      city: string;
      country: string;
    };
  };
  items!: {
    productId: string;
    quantity: number;
  }[];
  notes?: string;
}
