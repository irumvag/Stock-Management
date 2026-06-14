// Tables that sync between the PWA's IndexedDB and Neon. Each has a uuid PK,
// an updated_at watermark, and a `deleted` soft-delete flag. `users` is pulled
// (for offline login) but never pushed from the client — owners manage users
// through the dedicated /api/users endpoint.
export const SYNC_TABLES = {
  products: {
    cols: ['uuid', 'name', 'category', 'size_unit', 'selling_price', 'current_stock', 'min_stock_alert', 'updated_at', 'deleted'],
    pushable: true,
  },
  sales: {
    cols: ['uuid', 'sale_date', 'products', 'total_amount', 'waiter_name', 'customer_name', 'payment_method', 'refunded', 'updated_at', 'deleted'],
    json: ['products'],
    pushable: true,
  },
  waiters: {
    cols: ['uuid', 'name', 'active', 'updated_at', 'deleted'],
    pushable: true,
  },
  drafts: {
    cols: ['uuid', 'waiter_name', 'table_number', 'customer_name', 'status', 'items', 'total_amount', 'created_at', 'updated_at', 'completed_at', 'deleted'],
    json: ['items'],
    pushable: true,
  },
  daily_snapshots: {
    cols: ['uuid', 'snapshot_date', 'product_uuid', 'product_name', 'category', 'size_unit', 'opening_stock', 'closing_stock', 'unit_price', 'updated_at', 'deleted'],
    pushable: true,
  },
  expenses: {
    cols: ['uuid', 'expense_date', 'label', 'amount', 'category', 'updated_at', 'deleted'],
    pushable: true,
  },
  activity_log: {
    // Append-only audit trail. Cashier devices push; owner pulls to review.
    cols: ['uuid', 'at', 'username', 'role', 'action', 'details', 'updated_at', 'deleted'],
    pushable: true,
  },
  users: {
    // Pulled so cached credentials allow offline login. Hash only, never plaintext.
    cols: ['uuid', 'username', 'password_hash', 'role', 'updated_at', 'deleted'],
    pushable: false,
  },
};
