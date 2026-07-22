# Infrastructure — Performance & Optimizations

## Rôle

Optimisations queries, caching, N+1 prevention, monitoring performance.

---

## N+1 Query Prevention

### Problem

```javascript
// ❌ BAD: N+1 queries
const orders = await repos.orders.getAll();  // 1 query

for (const order of orders) {
  const menu = await repos.menus.getById(order.menuId);  // N queries!
  order.menu = menu;
}
```

### Solution 1: Batch query

```javascript
// ✅ GOOD: Batch
const orders = await repos.orders.getAll();  // 1 query

const menuIds = [...new Set(orders.map(o => o.menuId))];
const menus = await repos.menus.getByIds(menuIds);  // 1 query!

const menusMap = new Map(menus.map(m => [m.id, m]));
orders.forEach(o => o.menu = menusMap.get(o.menuId));
```

### Solution 2: Join query (Supabase preferred)

```javascript
// Supabase SQL join
const { data: orders } = await supabase
  .from('orders')
  .select(`
    id, status, total,
    menus (id, name, prices)
  `)
  .eq('fastfood_id', fastFoodId);
  // 1 query with join!
```

### Solution 3: Denormalization (Firestore)

Store menu snapshot in order on creation:

```javascript
// When creating order
const menu = await repos.menus.getById(menuId);
const order = {
  menuId,
  menuSnapshot: {  // Denormalized copy
    id: menu.id,
    name: menu.name,
    prices: menu.prices
  },
  ...
};
```

---

## Caching Strategy

### Query Caching (Redis)

```javascript
// src/utils/cache.js
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

const cache = {
  async get(key) {
    return await client.get(key);
  },
  
  async set(key, value, ttl = 3600) {
    await client.setEx(key, ttl, JSON.stringify(value));
  },
  
  async delete(key) {
    await client.del(key);
  }
};

module.exports = cache;
```

### Usage in services

```javascript
// Menus don't change often → cache 1 hour
exports.getMenusByFastFood = async (fastFoodId) => {
  const cacheKey = `menus:${fastFoodId}`;
  
  // Try cache
  let menus = await cache.get(cacheKey);
  if (menus) return JSON.parse(menus);
  
  // Fetch from DB
  menus = await repos.menus.getByFastFood(fastFoodId);
  
  // Cache for 1 hour
  await cache.set(cacheKey, menus, 3600);
  
  return menus;
};

// Invalidate cache when menu changes
exports.updateMenu = async (id, data) => {
  const menu = await repos.menus.getById(id);
  await repos.menus.update(id, data);
  
  // Invalidate cache
  await cache.delete(`menus:${menu.fastFoodId}`);
  
  return menu;
};
```

### Cache invalidation

```javascript
// When order is placed, invalidate affected caches
async function createOrder(data) {
  const order = await repos.orders.create(data);
  
  // Invalidate menu stock cache
  await cache.delete(`menu:${order.menuId}:stock`);
  
  // Invalidate fastfood orders cache
  await cache.delete(`fastfood:${order.fastFoodId}:orders`);
  
  return order;
}
```

### TTL guidelines

| Resource | TTL | Reason |
|----------|-----|--------|
| User profile | 5 min | Changes rarely |
| Menu list | 1 hour | Static content |
| Menu stock | 30 sec | Changes on orders |
| Order status | 10 sec | Real-time critical |
| Bonus code | 5 min | Moderate changes |
| Delivery tracking | Real-time | Critical, no cache |

---

## Database Optimization

### Firestore

**Indexes** :
```javascript
// For queries like: fastFoodId + status + createdAt DESC
db.collection('orders').createIndex({
  fields: [
    { fieldPath: 'fastfood_id', order: 'ASCENDING' },
    { fieldPath: 'status', order: 'ASCENDING' },
    { fieldPath: 'created_at', order: 'DESCENDING' }
  ]
});
```

**Pagination** :
```javascript
// Avoid fetching all documents
const pageSize = 20;
let query = db.collection('orders')
  .where('fastfood_id', '==', fastFoodId)
  .orderBy('created_at', 'desc')
  .limit(pageSize);

let snapshot = await query.get();

// Next page
const lastDoc = snapshot.docs[snapshot.docs.length - 1];
query = query.startAfter(lastDoc);
```

**Batch reads** :
```javascript
// Max 100 per batch
const batch = db.batch();
const refs = userIds.map(id => db.collection('users').doc(id));

for (const ref of refs) {
  batch.get(ref);  // Not actually supported, use Promise.all
}

const users = await Promise.all(refs.map(r => r.get()));
```

### Supabase

**Indexes** :
```sql
CREATE INDEX idx_orders_fastfood_status
  ON orders (fastfood_id, status)
  WHERE status = 'pending';
```

**Query optimization** :
```javascript
// Use select to limit columns
const orders = await supabase
  .from('orders')
  .select('id, status, total, created_at')  // Not all columns
  .eq('fastfood_id', fastFoodId)
  .order('created_at', { ascending: false })
  .limit(20);
```

---

## API Response Optimization

### Pagination

```javascript
// GET /order?page=1&limit=20
exports.getOrders = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);  // Max 100
  const offset = (page - 1) * limit;
  
  const orders = await repos.orders
    .query()
    .offset(offset)
    .limit(limit);
  
  const total = await repos.orders.count();
  
  res.json({
    success: true,
    data: orders,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  });
};
```

### Lazy loading (Cursor-based)

```javascript
// GET /order?cursor=last_order_id&limit=20
exports.getOrdersCursor = async (req, res) => {
  let query = repos.orders.query();
  
  if (req.query.cursor) {
    const lastOrder = await repos.orders.getById(req.query.cursor);
    query = query.where('created_at', '<', lastOrder.created_at);
  }
  
  const orders = await query
    .orderBy('created_at', 'desc')
    .limit(21);  // +1 to check if more
  
  const hasMore = orders.length > 20;
  
  res.json({
    success: true,
    data: orders.slice(0, 20),
    nextCursor: hasMore ? orders[19].id : null
  });
};
```

### Field selection

```javascript
// Client can request specific fields
// GET /user/123?fields=id,email,name
exports.getUser = async (req, res) => {
  let user = await repos.users.getById(req.params.id);
  
  if (req.query.fields) {
    const fields = req.query.fields.split(',');
    user = Object.fromEntries(
      fields.map(f => [f, user[f]])
    );
  }
  
  res.json({ success: true, data: user });
};
```

---

## Monitoring

### Response time tracking

```javascript
// Middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    if (duration > 1000) {  // > 1 second
      console.warn(`⚠️ [${req.method} ${req.path}] took ${duration}ms`);
    }
    
    // Optional: send to monitoring service
    // monitoring.trackRequest(req.method, req.path, duration);
  });
  
  next();
});
```

### Query performance

```javascript
// Log slow queries (Firestore)
const startTime = Date.now();
const snapshot = await db.collection('orders').get();
const duration = Date.now() - startTime;

if (duration > 500) {
  console.warn(`⚠️ Slow query: orders collection took ${duration}ms`);
}
```

---

## Benchmarking

### Load testing

```bash
# Using Apache Bench
ab -n 1000 -c 10 https://api.yaammoo.com/health

# Using Artillery
artillery run load-test.yml
```

### Profile before optimizing

```javascript
// Use profiler
const profiler = require('v8-profiler-next');

profiler.startProfiling('myProfile');

// Run code

const profile = profiler.stopProfiling('myProfile');
profile.export((err, result) => {
  fs.writeFileSync('profile.cpuprofile', result);
});
```

---

## Checklist

- [ ] No N+1 queries (batch or join)
- [ ] Caching strategy for static/slow-changing data
- [ ] Pagination on list endpoints
- [ ] Indexes on filter/sort columns
- [ ] Response time < 500ms for most endpoints
- [ ] Database queries logged + monitored
- [ ] Load testing done (1000+ concurrent users)
